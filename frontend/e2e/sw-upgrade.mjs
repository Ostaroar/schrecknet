// Service-worker upgrade path: does the app still work when a NEW build is
// served to a browser that already has an OLD build's service worker installed
// and controlling the page?
//
// Why this exists: on 2026-07-29 a frontend change took production down — both
// SQLite workers hung, so card search and decks were dead — and every local gate
// passed (tsc, all six e2e suites, a local built-dist server run). The leading
// hypothesis is that the already-active `schrecknet-shell-v4` service worker
// mediated a request class the previous build never made (a module worker's
// runtime subresource imports) and never settled its `respondWith`, which
// presents as a silent hang with nothing on `Worker.onerror`. No suite could
// have caught it: every Playwright run starts from a fresh `newContext()`, so
// the "old SW already controls the page" path was never exercised. This is that
// test.
//
// Shape: serve build A, let its SW install and take control, then swap the
// server's static dir to build B **on the same port** and reload. Same origin
// means the existing registration and Cache Storage still apply, so only the
// server restarts — no persistent browser profile needed.
//
// Build B is the candidate under test — the real `frontend/dist` by default.
// Build A is synthesized from the real dist by rewriting every content-hashed
// asset name, so the baseline is always known-good and the swap reproduces the
// property that matters: after it, every asset URL is one the active SW has
// never seen and must fetch through its own fetch handler.
//
// What this deliberately does NOT simulate is a *semantic* change in the module
// graph — it cannot invent the specific new request class a future bad commit
// might introduce. It catches the failure mode (SW-mediated fetch of unseen
// URLs wedging the boot), not every possible cause of it.
//
// The load assertions are all bounded by an explicit timeout, because the
// failure being guarded against is a HANG. A test that hangs when the app hangs
// would just time the suite out with no diagnosis; these fail with a message.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
// Build A (the "already deployed" build) is always synthesized from the real
// dist, so the baseline is known-good. Build B is the candidate under test, and
// defaults to that same real dist. Overriding only B models the actual scenario
// — users are on the last good build and a new candidate ships — and lets the
// test be pointed at a deliberately broken build to prove it still fails. A
// guard that cannot fail is worth nothing, which is the lesson of the outage.
const previousSource = path.join(repoRoot, 'frontend/dist')
const candidateDist = process.env.SCHRECKNET_SW_E2E_DIST
  ? path.resolve(process.env.SCHRECKNET_SW_E2E_DIST)
  : previousSource
const port = Number(process.env.SCHRECKNET_SW_E2E_PORT ?? 18186)
const baseUrl = `http://127.0.0.1:${port}`
const serverBinary = path.resolve(
  repoRoot,
  process.env.SCHRECKNET_SERVER_BIN ?? 'target/debug/schrecknet-server',
)
// How long the app gets to render real card rows. Generous enough for a cold
// cards.sqlite download on a loaded CI runner, short enough that a wedged
// worker fails instead of hanging the job.
const READY_TIMEOUT_MS = Number(process.env.SCHRECKNET_SW_E2E_TIMEOUT_MS ?? 45_000)

const workdir = await mkdtemp(path.join(tmpdir(), 'schrecknet-sw-upgrade-'))
const appDb = path.join(workdir, 'app.sqlite')
const distA = path.join(workdir, 'distA')

/** Text assets are rewritten in place; everything else is only renamed. */
const TEXT_EXTENSIONS = new Set(['.js', '.css', '.html', '.json', '.webmanifest', '.txt'])

/** Oldest mtime anywhere under `dir`, so build A can be anchored below it. */
async function oldestMtimeMs(dir) {
  let oldest = Infinity
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    oldest = Math.min(oldest, entry.isDirectory() ? await oldestMtimeMs(full) : (await stat(full)).mtimeMs)
  }
  return Number.isFinite(oldest) ? oldest : Date.now()
}

/**
 * Builds a plausible "previous build" from the real dist: every content-hashed
 * file under assets/ gets a new hash, and every textual reference to the old
 * names is rewritten to match. Vite hashes are unique tokens, so plain string
 * substitution is safe and total — anything it misses would leave build A
 * broken, which the first assertion below catches loudly rather than silently.
 */
async function synthesizePreviousBuild() {
  await cp(previousSource, distA, { recursive: true })
  const assetsDir = path.join(distA, 'assets')
  const renames = new Map()

  for (const name of await readdir(assetsDir)) {
    // Vite emits `<name>-<hash><ext>`; mutate only the hash segment so the
    // extension and the human-readable prefix stay recognisable in failures.
    const match = name.match(/^(.*)-([A-Za-z0-9_-]{8,})(\.[^.]+)$/)
    if (!match) continue
    const [, stem, hash, ext] = match
    // Reverse the hash: same length and alphabet, guaranteed different, and
    // stable across runs so a failure is reproducible.
    const nextHash = [...hash].reverse().join('')
    if (nextHash === hash) continue
    renames.set(name, `${stem}-${nextHash}${ext}`)
  }
  assert.ok(renames.size > 0, 'expected content-hashed assets in frontend/dist')

  for (const [from, to] of renames) {
    await rename(path.join(assetsDir, from), path.join(assetsDir, to))
  }

  // Rewrite references everywhere they can appear: index.html, and any chunk
  // that imports another chunk (route splits, the workers, the locale packs).
  const rewriteTargets = [
    path.join(distA, 'index.html'),
    ...(await readdir(assetsDir)).map((name) => path.join(assetsDir, name)),
  ]
  for (const file of rewriteTargets) {
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue
    const original = await readFile(file, 'utf8')
    let rewritten = original
    for (const [from, to] of renames) rewritten = rewritten.split(from).join(to)
    if (rewritten !== original) await writeFile(file, rewritten)
  }

  // Backdate build A. `cp` preserves mtimes, which would leave A and B looking
  // identical to a conditional GET — the server answers 304 and the browser
  // replays A's index.html even though B is on disk, so the swap silently does
  // nothing. A real previous build was genuinely built earlier, so backdating
  // is both the fix and the faithful thing. (Found by this assertion failing.)
  //
  // Anchored to the CANDIDATE's own mtime rather than to wall-clock: a fixed
  // "an hour ago" silently inverts as soon as frontend/dist is itself older
  // than that, making A newer than B and resurrecting the exact 304 bug. (Also
  // found by this assertion failing, on a dist built ~an hour earlier.)
  const stale = new Date((await oldestMtimeMs(candidateDist)) - 60 * 60 * 1000)
  const backdate = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) await backdate(full)
      else await utimes(full, stale, stale)
    }
  }
  await backdate(distA)

  return renames
}

let server = null
let serverStopped = true
const serverOutput = []

async function startServer(staticDir) {
  serverOutput.length = 0
  server = spawn(serverBinary, [], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SCHRECKNET_BIND: `127.0.0.1:${port}`,
      SCHRECKNET_STATIC_DIR: staticDir,
      SCHRECKNET_DATA_DIR: path.join(repoRoot, 'dist'),
      SCHRECKNET_MODEL_DIR: path.join(repoRoot, 'dist/models/semantic'),
      SCHRECKNET_APP_DB: appDb,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverStopped = false
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => serverOutput.push(chunk.toString()))
  }

  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`server exited before readiness:\n${serverOutput.join('')}`)
    }
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`timed out waiting for sw-upgrade server on ${staticDir}`)
}

async function stopServer() {
  if (serverStopped || !server) return
  serverStopped = true
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM')
    await Promise.race([once(server, 'exit'), new Promise((r) => setTimeout(r, 5_000))])
  }
}

/**
 * The core assertion. Rendering `main` only proves the shell booted — the
 * outage had a perfectly rendered shell above dead workers. Requiring real
 * card rows proves the whole chain works: main chunk -> wasm core -> dbWorker
 * -> OPFS -> cards.sqlite -> a query that returned data.
 */
async function assertCardsRender(page, phase) {
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('main button[data-card-id]').length > 0,
      undefined,
      { timeout: READY_TIMEOUT_MS },
    )
  } catch (cause) {
    const visible = await page
      .locator('main')
      .innerText()
      .catch(() => '<no main element>')
    throw new Error(
      `[${phase}] no card rows rendered within ${READY_TIMEOUT_MS}ms — the SQLite worker ` +
        `never delivered data (this is the outage signature). Visible text was:\n${visible.slice(0, 400)}`,
      { cause },
    )
  }
}

let browser
try {
  const renames = await synthesizePreviousBuild()

  browser = await chromium.launch({
    ...(process.env.SCHRECKNET_CHROME_CHANNEL ? { channel: process.env.SCHRECKNET_CHROME_CHANNEL } : {}),
    headless: true,
  })
  // One context for the whole test: the service worker registration and Cache
  // Storage must survive the build swap, exactly as a returning user's would.
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  // --- build A: install the service worker and let it take control ---
  await startServer(distA)
  await page.goto(`${baseUrl}/crypt`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  // A controlled reload populates the shell cache with A's hashed assets —
  // without this the SW is registered but has cached nothing.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await assertCardsRender(page, 'build A')

  const cachedUnderA = await page.evaluate(async () => {
    const names = await caches.keys()
    const shell = names.find((name) => name.startsWith('schrecknet-shell-'))
    if (!shell) return { shell: null, entries: 0 }
    const keys = await (await caches.open(shell)).keys()
    return { shell, entries: keys.length }
  })
  assert.ok(cachedUnderA.shell, 'build A should have created a schrecknet-shell-* cache')
  assert.ok(cachedUnderA.entries > 0, 'build A should have cached at least one asset')

  // --- swap to build B (the real dist) on the same origin ---
  await stopServer()
  await startServer(candidateDist)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main')

  // The whole point: an SW installed by A is in control, and every asset URL B
  // asks for is one it has never seen. If mediating those wedges the boot, this
  // is where it shows up.
  await assertCardsRender(page, 'build B after SW upgrade')

  // A stale SW serving A's now-deleted asset URLs would surface here.
  assert.deepEqual(pageErrors, [], `page errors after the upgrade: ${pageErrors.join('; ')}`)

  // Prove the swap was real rather than the browser replaying A from cache.
  const servedB = await page.evaluate(() =>
    [...document.querySelectorAll('script[src]')].map((s) => new URL(s.src).pathname),
  )
  const staleNames = [...renames.values()]
  assert.ok(
    servedB.length > 0 && !servedB.some((src) => staleNames.some((name) => src.endsWith(name))),
    `expected build B's assets after the swap, still saw build A's: ${servedB.join(', ')}`,
  )

  // One more reload: the first post-swap load races SW activation, a steady
  // state does not. A failure only here would mean the new SW settled badly.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await assertCardsRender(page, 'build B steady state')

  console.log(
    JSON.stringify(
      {
        renamed_assets: renames.size,
        shell_cache: cachedUnderA.shell,
        cached_entries_after_build_a: cachedUnderA.entries,
        card_rows_render_after_upgrade: true,
        page_errors: pageErrors.length,
      },
      null,
      2,
    ),
  )
  console.log('service-worker upgrade path passed')
} finally {
  await browser?.close()
  await stopServer()
  await rm(workdir, { recursive: true, force: true })
}
