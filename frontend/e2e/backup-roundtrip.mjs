// Proves a backup carries EVERYTHING the user owns and restores it faithfully
// (docs/adr/0016), including the tables every older text export silently
// dropped: owned precons, deck tags, descriptions, authors, per-deck inventory
// modes and per-card overrides.
//
// Shape of the test: build a known `user.sqlite` in Node by applying the real
// `migrations/*.sql`, wrap it in an envelope, restore it through the actual
// Settings UI in a clean browser profile (the "cleared cookies and site data"
// case that motivated the feature), then export a fresh backup from the browser
// and compare every table row-for-row.
//
// Seeding in Node rather than by clicking through the app is deliberate: it
// makes the fixture exact and covers tables the UI cannot easily produce, and it
// exercises import and export symmetrically. The comparison enumerates tables
// from sqlite_master, so a table added by a future migration is compared
// automatically — if the backup ever stops carrying one, this fails without
// anyone remembering to update the test.

import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const port = Number(process.env.SCHRECKNET_BACKUP_E2E_PORT ?? 18184)
// Attach to an already-running server (the production container in CI) instead
// of spawning a local debug binary. The fixture this test restores lives in the
// browser's OPFS, not on the server, so nothing here depends on which binary is
// serving — only that it serves the app.
const attachedBaseUrl = process.env.SCHRECKNET_E2E_BASE_URL?.replace(/\/+$/, '') ?? null
const baseUrl = attachedBaseUrl ?? `http://127.0.0.1:${port}`
const appDb = path.join(tmpdir(), `schrecknet-backup-e2e-${process.pid}.sqlite`)

const server = attachedBaseUrl
  ? null
  : spawn(
      path.join(repoRoot, process.env.SCHRECKNET_SERVER_BIN ?? 'target/debug/schrecknet-server'),
      [],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          SCHRECKNET_BIND: `127.0.0.1:${port}`,
          SCHRECKNET_STATIC_DIR: path.join(repoRoot, 'frontend/dist'),
          SCHRECKNET_DATA_DIR: path.join(repoRoot, 'dist'),
          SCHRECKNET_APP_DB: appDb,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return
    } catch {
      // still starting
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('timed out waiting for backup e2e server')
}

const LOCAL_STORAGE = {
  // The only irrecoverable item: lose the code and you lose access to the
  // server-side game group entirely.
  'schrecknet.game-group-codes': JSON.stringify(['ZZZZ']),
  'schrecknet.game-group-write-passphrase.ZZZZ': 'round-trip-secret',
  'schrecknet.limited-format': 'v5',
}

/** Every table the seed fills; each must survive the round-trip non-empty. */
const SEEDED_TABLES = [
  'decks',
  'deck_cards',
  'deck_tags',
  'deck_card_inventory_overrides',
  'inventory',
  'inventory_precons',
]

function dumpTables(file) {
  const db = new DatabaseSync(file)
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name)
    const out = {}
    for (const t of tables) out[t] = db.prepare(`SELECT * FROM "${t}"`).all()
    out.__user_version = db.prepare('PRAGMA user_version').get().user_version
    return out
  } finally {
    db.close()
  }
}

async function buildSeedDb(file) {
  const dir = path.join(repoRoot, 'migrations')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const db = new DatabaseSync(file)
  try {
    for (const f of files) db.exec(await readFile(path.join(dir, f), 'utf8'))
    // The app decides what to migrate from user_version, so the fixture must
    // declare the schema level it was written at.
    db.exec(`PRAGMA user_version = ${files.length}`)

    db.exec(`
      INSERT INTO decks (id, name, description, author, inventory_mode, created_at, updated_at)
      VALUES (1, 'Backup round-trip deck', 'a description', 'An Author', 'fixed', '2026-01-01 00:00:00', '2026-01-02 00:00:00');
      INSERT INTO deck_cards (deck_id, card_id, qty) VALUES (1, 201700, 4), (1, 100018, 2);
      INSERT INTO deck_tags (deck_id, tag) VALUES (1, 'tagA'), (1, 'tagB');
      INSERT INTO deck_card_inventory_overrides (deck_id, card_id, mode) VALUES (1, 201700, 'flexible');
      INSERT INTO inventory (card_id, qty) VALUES (201700, 7), (100018, 3);
      INSERT INTO inventory_precons (set_name, precon, qty) VALUES ('New Blood', 'Malkavian', 2);
    `)
    return files.length
  } finally {
    db.close()
  }
}

let browser
let workdir
try {
  await waitForServer()
  workdir = await mkdtemp(path.join(tmpdir(), 'schrecknet-backup-'))

  const seedDbPath = path.join(workdir, 'seed-user.sqlite')
  const migrationCount = await buildSeedDb(seedDbPath)
  const seeded = dumpTables(seedDbPath)
  for (const t of SEEDED_TABLES) {
    assert.ok(seeded[t]?.length > 0, `fixture should seed ${t}`)
  }

  const envelopePath = path.join(workdir, 'restore-me.json')
  await writeFile(
    envelopePath,
    JSON.stringify({
      format: 'schrecknet-backup',
      version: 1,
      created_at: '2026-01-02T03:04:05.000Z',
      app_data_version: '9.13',
      user_db_base64: (await readFile(seedDbPath)).toString('base64'),
      local_storage: LOCAL_STORAGE,
    }),
  )

  browser = await chromium.launch({
    ...(process.env.SCHRECKNET_CHROME_CHANNEL ? { channel: process.env.SCHRECKNET_CHROME_CHANNEL } : {}),
    headless: true,
  })

  // A brand-new context is a browser that has never seen the site — the state a
  // user is left in after clearing site data.
  const ctx = await browser.newContext({ acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('dialog', (d) => d.accept())

  const countsRe = /(\d+) deck.*?(\d+) inventory card.*?(\d+) owned precon/s
  const readCounts = () =>
    page.evaluate(
      (src) => document.body.innerText.match(new RegExp(src, 's'))?.[0] ?? null,
      countsRe.source,
    )

  await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main')
  await page.waitForFunction(
    (src) => new RegExp(src, 's').test(document.body.innerText),
    countsRe.source,
    { timeout: 30_000 },
  )
  assert.match(await readCounts(), /^0 deck/, 'a fresh profile should start empty')

  // --- restore through the real UI ---
  await page.setInputFiles('input[type=file]', envelopePath)
  await page.waitForFunction(() => /restored/i.test(document.body.innerText), undefined, {
    timeout: 60_000,
  })

  const restoredCounts = await readCounts()
  assert.match(restoredCounts, /1 deck/, 'deck should be restored')
  assert.match(restoredCounts, /2 inventory card/, 'inventory rows should be restored')
  assert.match(
    restoredCounts,
    /1 owned precon/,
    'owned precons should be restored — the table older exports dropped',
  )

  assert.equal(
    await page.evaluate(() => localStorage.getItem('schrecknet.game-group-write-passphrase.ZZZZ')),
    'round-trip-secret',
    'game-group passphrase should be restored (it lives outside the database)',
  )

  await page.goto(`${baseUrl}/decks`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main')
  await page.waitForFunction(() => /Backup round-trip deck/.test(document.body.innerText), undefined, {
    timeout: 30_000,
  })

  // --- export again and compare every table ---
  await page.goto(`${baseUrl}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main')
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download backup/i }).click(),
  ]).then(([d]) => d)
  const exportedPath = path.join(workdir, 'exported.json')
  await download.saveAs(exportedPath)

  const exported = JSON.parse(await readFile(exportedPath, 'utf8'))
  assert.equal(exported.format, 'schrecknet-backup')
  assert.equal(exported.version, 1)
  for (const [k, v] of Object.entries(LOCAL_STORAGE)) {
    assert.equal(exported.local_storage[k], v, `envelope should carry localStorage key ${k}`)
  }

  const exportedDbPath = path.join(workdir, 'exported-user.sqlite')
  await writeFile(exportedDbPath, Buffer.from(exported.user_db_base64, 'base64'))
  const roundTripped = dumpTables(exportedDbPath)

  assert.equal(
    roundTripped.__user_version,
    migrationCount,
    'restored database should be at the current schema version',
  )
  assert.deepEqual(
    Object.keys(roundTripped).sort(),
    Object.keys(seeded).sort(),
    'round-tripped database should have exactly the same tables',
  )
  for (const table of Object.keys(seeded)) {
    if (table.startsWith('__')) continue
    assert.deepEqual(
      roundTripped[table],
      seeded[table],
      `table ${table} did not survive the backup round-trip`,
    )
  }

  // --- rejection cases: refuse, never half-import ---
  const rejections = await page.evaluate(async () => {
    const results = {}
    const tryFile = async (name, text) => {
      const input = document.querySelector('input[type=file]')
      const dt = new DataTransfer()
      dt.items.add(new File([text], name, { type: 'application/json' }))
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 400))
      results[name] = document.body.innerText.match(/Could not restore:[^\n]*/)?.[0] ?? null
    }
    await tryFile('wrong-format.json', JSON.stringify({ format: 'nope' }))
    await tryFile('too-new.json', JSON.stringify({ format: 'schrecknet-backup', version: 99, user_db_base64: '' }))
    await tryFile('garbage.json', 'not json at all')
    return results
  })
  assert.match(rejections['wrong-format.json'] ?? '', /not a SchreckNet backup/i)
  assert.match(rejections['too-new.json'] ?? '', /newer version/i)
  assert.match(rejections['garbage.json'] ?? '', /invalid JSON/i)

  // A refused import must not have damaged the restored data.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    (src) => new RegExp(src, 's').test(document.body.innerText),
    countsRe.source,
    { timeout: 30_000 },
  )
  assert.equal(await readCounts(), restoredCounts, 'refused imports must leave data untouched')

  assert.deepEqual(errors, [], 'no page errors')
  console.log(
    JSON.stringify(
      {
        tables_compared: Object.keys(seeded).filter((k) => !k.startsWith('__')).length,
        user_version: roundTripped.__user_version,
        local_storage_keys: Object.keys(LOCAL_STORAGE).length,
        counts: restoredCounts,
      },
      null,
      2,
    ),
  )
  console.log('backup round-trip passed')
} finally {
  if (browser) await browser.close()
  server?.kill('SIGTERM')
  await rm(appDb, { force: true })
  if (workdir) await rm(workdir, { recursive: true, force: true })
}
