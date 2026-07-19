import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import { chromium } from 'playwright'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const fixturePath = fileURLToPath(new URL('./fixtures/semantic-golden.json', import.meta.url))
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
const searchFixturePath = fileURLToPath(
  new URL('./fixtures/search-composition-golden.json', import.meta.url),
)
const searchFixture = JSON.parse(await readFile(searchFixturePath, 'utf8'))
const port = Number(process.env.SCHRECKNET_E2E_PORT ?? 18180)
const baseUrl = `http://127.0.0.1:${port}`
const serverBinary = path.resolve(
  repoRoot,
  process.env.SCHRECKNET_SERVER_BIN ?? 'target/debug/schrecknet-server',
)
const appDb = path.join(tmpdir(), `schrecknet-semantic-e2e-${process.pid}.sqlite`)

const server = spawn(serverBinary, [], {
  cwd: repoRoot,
  env: {
    ...process.env,
    SCHRECKNET_BIND: `127.0.0.1:${port}`,
    SCHRECKNET_STATIC_DIR: path.join(repoRoot, 'frontend/dist'),
    SCHRECKNET_DATA_DIR: path.join(repoRoot, 'dist'),
    SCHRECKNET_MODEL_DIR: path.join(repoRoot, 'dist/models/semantic'),
    SCHRECKNET_APP_DB: appDb,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverStopped = false
const serverOutput = []
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    const line = chunk.toString()
    serverOutput.push(line)
    process.stdout.write(line)
  })
}

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`server exited before readiness:\n${serverOutput.join('')}`)
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`)
      if (response.ok) return
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('timed out waiting for semantic smoke server')
}

async function stopServer() {
  if (serverStopped) return
  serverStopped = true
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  }
}

async function restSearch(golden) {
  const response = await fetch(`${baseUrl}/api/v1/cards/semantic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: golden.query, kind: golden.kind, limit: 20 }),
  })
  if (response.status !== 200) {
    throw new Error(`semantic REST returned ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

async function exactRestSearch(kind, query) {
  const response = await fetch(`${baseUrl}/api/v1/${kind}/search?${query}`)
  if (response.status !== 200) {
    throw new Error(`${kind} exact REST returned ${response.status}: ${await response.text()}`)
  }
  return response.json()
}

let browser
try {
  await waitForServer()
  const chromeChannel = process.env.SCHRECKNET_CHROME_CHANNEL
  browser = await chromium.launch({
    ...(chromeChannel ? { channel: chromeChannel } : {}),
    headless: true,
  })
  const context = await browser.newContext({ serviceWorkers: 'allow' })
  const page = await context.newPage()
  const pageErrors = []
  const consoleErrors = []
  const assetBytes = new Map()
  const assetAccounting = []

  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('response', (response) => {
    const url = response.url()
    const semanticAsset =
      url.includes('/models/semantic/') ||
      url.includes('semanticWorker-') ||
      url.includes('ort-wasm-simd-threaded.jsep-')
    if (!semanticAsset || assetBytes.has(url)) return
    const accounting = response.allHeaders().then((headers) => {
      const bytes = Number(headers['content-length'] ?? 0)
      if (Number.isFinite(bytes) && bytes > 0) assetBytes.set(url, bytes)
    })
    assetAccounting.push(accounting)
  })

  await page.goto(`${baseUrl}/#/crypt`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  // The service worker registers after the first page load. One controlled
  // online reload fills the hashed shell cache before the true-offline check.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main')

  async function waitForExactIds(expectedIds) {
    await page.waitForFunction(
      (expected) => {
        const actual = [...document.querySelectorAll('main button[data-card-id]')].map((row) =>
          Number(row.getAttribute('data-card-id')),
        )
        return JSON.stringify(actual) === JSON.stringify(expected)
      },
      expectedIds,
    )
  }

  // Golden exact-search parity for the VDB composition grammar. This checks
  // the REST adapter against the real V5 database, then recreates the same
  // filter through the offline browser controls and requires identical order.
  const cryptRest = await exactRestSearch('crypt', searchFixture.crypt.rest_query)
  assert.deepEqual(
    cryptRest.map((card) => card.id),
    searchFixture.crypt.expected_ids,
    'crypt composition REST fixture drifted',
  )
  const cryptGroupControls = page.locator('[aria-label="Crypt groups"]')
  for (const group of searchFixture.crypt.groups) {
    await cryptGroupControls.getByRole('button', { name: String(group), exact: true }).click()
  }
  for (const requirement of searchFixture.crypt.requirements) {
    const control = page.getByRole('button', { name: requirement.code, exact: true })
    for (let click = 0; click < requirement.clicks; click += 1) await control.click()
  }
  await page.getByRole('button', { name: '+ OR discipline', exact: true }).click()
  for (let index = 0; index < searchFixture.crypt.or.length; index += 1) {
    const alternative = searchFixture.crypt.or[index]
    await page
      .getByLabel(`OR discipline 1 alternative ${index + 1}`, { exact: true })
      .selectOption(alternative.code)
    if (alternative.superior) {
      await page
        .getByLabel(`OR discipline 1 alternative ${index + 1} level`, { exact: true })
        .click()
    }
  }
  await waitForExactIds(searchFixture.crypt.expected_ids)

  await page.getByRole('button', { name: 'library search', exact: true }).click()
  await page.waitForFunction(() => location.hash === '#/library')
  await page.getByPlaceholder('Name / text').waitFor()
  const libraryRest = await exactRestSearch('library', searchFixture.library.rest_query)
  assert.deepEqual(
    libraryRest.map((card) => card.id),
    searchFixture.library.expected_ids,
    'library composition REST fixture drifted',
  )
  for (const discipline of searchFixture.library.disciplines) {
    await page.getByRole('button', { name: discipline, exact: true }).click()
  }
  await page
    .getByText('Discipline logic', { exact: true })
    .locator('..')
    .getByRole('button', { name: searchFixture.library.logic, exact: true })
    .click()
  await waitForExactIds(searchFixture.library.expected_ids)

  // VDB's capacity-requirement filter recognizes only same-line
  // "Requires ... (of|with) capacity ..." clauses. The real V5 fixture
  // guards both that derived parser and browser/server query parity.
  const capacityFixture = searchFixture.library_capacity_requirement
  const capacityRest = await exactRestSearch('library', capacityFixture.rest_query)
  assert.deepEqual(
    capacityRest.map((card) => card.id),
    capacityFixture.expected_ids,
    'library capacity-requirement REST fixture drifted',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Name / text').waitFor()
  await page
    .getByLabel('Capacity requirement comparison', { exact: true })
    .selectOption(capacityFixture.mode)
  await page
    .getByLabel('Capacity requirement', { exact: true })
    .fill(String(capacityFixture.value))
  await waitForExactIds(capacityFixture.expected_ids)

  // Anarch is implied by the official Baron requirement during ingestion,
  // exactly as in VDB. This protects the VEKN join, shared normalization, and
  // both query builders with one real-pool composition.
  const requirementFixture = searchFixture.library_requirements
  const requirementRest = await exactRestSearch('library', requirementFixture.rest_query)
  assert.deepEqual(
    requirementRest.map((card) => card.id),
    requirementFixture.expected_ids,
    'library sect/title requirement REST fixture drifted',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Name / text').waitFor()
  await page
    .getByLabel(`Sect requirement ${requirementFixture.sect}`, { exact: true })
    .click()
  await page
    .getByLabel(`Title requirement ${requirementFixture.title}`, { exact: true })
    .click()
  await waitForExactIds(requirementFixture.expected_ids)

  // The semantic golden queries intentionally start with no structured
  // filters. Reload to discard the exact-search component state above while
  // keeping the service worker/model caches warm.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main')

  let activeKind = null
  async function showKind(kind) {
    if (activeKind !== kind) {
      await page.getByRole('button', { name: `${kind} search`, exact: true }).click()
      await page.waitForFunction((expected) => location.hash === `#/${expected}`, kind)
      await page.getByPlaceholder('Name / text').waitFor()
      activeKind = kind
    }
    const semantic = page.getByRole('button', { name: '◇ Semantic', exact: true })
    if ((await semantic.getAttribute('aria-pressed')) !== 'true') await semantic.click()
    const conceptInput = page.getByPlaceholder('Describe a card concept (English)')
    await conceptInput.waitFor()
    return conceptInput
  }

  async function browserSearch(golden, expectedFirstId) {
    const input = await showKind(golden.kind)
    const started = performance.now()
    await input.fill(golden.query)
    await page.waitForFunction(
      (cardId) =>
        document.querySelector('main button[data-card-id]')?.getAttribute('data-card-id') ===
        String(cardId),
      expectedFirstId,
      { timeout: 120_000 },
    )
    const elapsedMs = performance.now() - started
    const rows = page.locator('main button[data-card-id]')
    const count = Math.min(fixture.parity_top_n, await rows.count())
    const hits = []
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index)
      hits.push({
        id: Number(await row.getAttribute('data-card-id')),
        score: Number(await row.getAttribute('data-semantic-score')),
      })
    }
    return { elapsedMs, hits }
  }

  let coldQueryMs = 0
  const warmQueryTimes = []
  for (let index = 0; index < fixture.queries.length; index += 1) {
    const golden = fixture.queries[index]
    console.log(`semantic quality: ${golden.kind} · ${golden.query}`)
    const nativeHits = await restSearch(golden)
    assert.ok(nativeHits.length >= fixture.parity_top_n, `${golden.query}: too few native hits`)
    assert.ok(
      nativeHits.every((hit) => hit.model_id === fixture.model_id),
      `${golden.query}: unexpected native model id`,
    )

    const relevanceWindow = nativeHits
      .slice(0, golden.required_within)
      .map((hit) => hit.id)
    for (const cardId of golden.required_top_ids) {
      assert.ok(
        relevanceWindow.includes(cardId),
        `${golden.query}: reviewed card ${cardId} missing from top ${golden.required_within}`,
      )
    }

    const browserResult = await browserSearch(golden, nativeHits[0].id)
    const nativeParityHits = nativeHits.slice(0, fixture.parity_top_n)
    const browserIds = browserResult.hits.map((hit) => hit.id)
    const nativeIds = nativeParityHits.map((hit) => hit.id)
    assert.deepEqual(
      [...browserIds].sort((left, right) => left - right),
      [...nativeIds].sort((left, right) => left - right),
      `${golden.query}: browser/native top-${fixture.parity_top_n} membership diverged`,
    )
    const nativeById = new Map(nativeParityHits.map((hit) => [hit.id, hit]))
    browserResult.hits.forEach((hit) => {
      const nativeHit = nativeById.get(hit.id)
      assert.ok(nativeHit, `${golden.query}: browser returned unexpected card ${hit.id}`)
      assert.ok(
        Math.abs(hit.score - nativeHit.score) <= fixture.score_tolerance,
        `${golden.query}: card ${hit.id} score exceeded tolerance`,
      )
    })
    // Each platform may move a score by up to the declared tolerance. Preserve
    // order whenever the native gap is larger than both cards' combined error;
    // genuinely near-tied cards may swap without changing retrieval quality.
    const browserPosition = new Map(browserIds.map((cardId, position) => [cardId, position]))
    for (let higher = 0; higher < nativeParityHits.length; higher += 1) {
      for (let lower = higher + 1; lower < nativeParityHits.length; lower += 1) {
        const scoreGap = nativeParityHits[higher].score - nativeParityHits[lower].score
        if (scoreGap <= fixture.score_tolerance * 2) continue
        assert.ok(
          browserPosition.get(nativeParityHits[higher].id) <
            browserPosition.get(nativeParityHits[lower].id),
          `${golden.query}: materially separated cards changed order`,
        )
      }
    }

    if (index === 0) coldQueryMs = browserResult.elapsedMs
    else warmQueryTimes.push(browserResult.elapsedMs)
  }

  assert.ok(pageErrors.length === 0, `browser page errors: ${pageErrors.join('; ')}`)
  assert.ok(consoleErrors.length === 0, `browser console errors: ${consoleErrors.join('; ')}`)
  assert.ok(
    warmQueryTimes.every((elapsed) => elapsed <= fixture.warm_query_max_ms),
    `warm query exceeded ${fixture.warm_query_max_ms} ms: ${warmQueryTimes.join(', ')}`,
  )

  await Promise.all(assetAccounting)
  const firstUseBytes = [...assetBytes.values()].reduce((total, bytes) => total + bytes, 0)
  assert.ok(firstUseBytes > 20_000_000, `first-use accounting too small: ${firstUseBytes}`)
  assert.ok(
    firstUseBytes <= fixture.first_use_max_bytes,
    `first-use assets ${firstUseBytes} exceed ${fixture.first_use_max_bytes}`,
  )

  await stopServer()
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForSelector('main')
  activeKind = null
  const offlineGolden = fixture.queries[0]
  const offlineInput = await showKind(offlineGolden.kind)
  await offlineInput.fill(offlineGolden.query)
  await page.waitForFunction(
    (cardId) =>
      document.querySelector('main button[data-card-id]')?.getAttribute('data-card-id') ===
      String(cardId),
    offlineGolden.required_top_ids[0],
    { timeout: 120_000 },
  )
  assert.ok(pageErrors.length === 0, `offline page errors: ${pageErrors.join('; ')}`)

  console.log(
    JSON.stringify(
      {
        model_id: fixture.model_id,
        golden_queries: fixture.queries.length,
        parity_top_n: fixture.parity_top_n,
        first_use_bytes: firstUseBytes,
        cold_query_ms: Math.round(coldQueryMs),
        warm_query_ms: warmQueryTimes.map(Math.round),
        offline_reload: 'passed',
      },
      null,
      2,
    ),
  )
} finally {
  await browser?.close()
  await stopServer()
  await rm(appDb, { force: true })
}
