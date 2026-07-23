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

  await page.goto(`${baseUrl}/crypt`, { waitUntil: 'domcontentloaded' })
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
    try {
      await page.waitForFunction(
        (expected) => {
          const actual = [...document.querySelectorAll('main button[data-card-id]')].map((row) =>
            Number(row.getAttribute('data-card-id')),
          )
          return JSON.stringify(actual) === JSON.stringify(expected)
        },
        expectedIds,
      )
    } catch (error) {
      const actual = await page.locator('main button[data-card-id]').evaluateAll((rows) =>
        rows.map((row) => Number(row.getAttribute('data-card-id'))),
      )
      throw new Error(
        `exact browser ids diverged: expected ${expectedIds.join(',')}; got ${actual.join(',')}`,
        { cause: error },
      )
    }
  }

  async function selectPreconFixture(preconFixture) {
    for (const selection of preconFixture.selections) {
      await page.locator('[data-filter="precon-add"]').selectOption(selection.value)
    }
    await page.locator('[data-filter="precon-printing"]').selectOption(preconFixture.printing)
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

  // VDB derives sect from the official crypt text prefix and vote strength
  // from title rank. This real-pool composition protects the VEKN join and
  // browser/server parity without relying on client-side text heuristics.
  const cryptMetadataFixture = searchFixture.crypt_metadata
  const cryptMetadataRest = await exactRestSearch('crypt', cryptMetadataFixture.rest_query)
  assert.deepEqual(
    cryptMetadataRest.map((card) => card.id),
    cryptMetadataFixture.expected_ids,
    'crypt sect/votes REST fixture drifted',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Name / text').waitFor()
  await page
    .getByLabel(`Crypt sect ${cryptMetadataFixture.sect}`, { exact: true })
    .click()
  await page.getByLabel('Votes', { exact: true }).selectOption(String(cryptMetadataFixture.votes))
  await waitForExactIds(cryptMetadataFixture.expected_ids)

  // Trait tokens are classified at build time by shared Rust using VDB's
  // original regex/special-field rules. Multiple selected traits are ANDed.
  const cryptTraitsFixture = searchFixture.crypt_traits
  const cryptTraitsRest = await exactRestSearch('crypt', cryptTraitsFixture.rest_query)
  assert.deepEqual(
    cryptTraitsRest.map((card) => card.id),
    cryptTraitsFixture.expected_ids,
    'crypt trait composition REST fixture drifted',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Name / text').waitFor()
  for (const trait of cryptTraitsFixture.controls) {
    await page.getByLabel(`Trait ${trait}`, { exact: true }).click()
  }
  await waitForExactIds(cryptTraitsFixture.expected_ids)

  // VDB identifies a precon by exact set + deck name, ORs repeated selector
  // rows, and then applies Any/Only/First/Reprint to each selected printing.
  const preconFixture = searchFixture.precon_filter
  const cryptPreconRest = await exactRestSearch('crypt', preconFixture.crypt.rest_query)
  assert.deepEqual(
    cryptPreconRest.map((card) => card.id),
    preconFixture.crypt.expected_ids,
    'crypt exact/multi-precon REST fixture drifted',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Name / text').waitFor()
  await selectPreconFixture(preconFixture)
  await waitForExactIds(preconFixture.crypt.expected_ids)

  await page.getByRole('button', { name: 'library search', exact: true }).click()
  await page.waitForFunction(() => location.pathname === '/library')
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

  const libraryTraitsFixture = searchFixture.library_traits
  const libraryTraitsRest = await exactRestSearch('library', libraryTraitsFixture.rest_query)
  assert.deepEqual(
    libraryTraitsRest.map((card) => card.id),
    libraryTraitsFixture.expected_ids,
    'library trait composition REST fixture drifted',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Name / text').waitFor()
  for (const trait of libraryTraitsFixture.controls) {
    await page.getByLabel(`Trait ${trait}`, { exact: true }).click()
  }
  await waitForExactIds(libraryTraitsFixture.expected_ids)

  const libraryPreconRest = await exactRestSearch('library', preconFixture.library.rest_query)
  assert.deepEqual(
    libraryPreconRest.map((card) => card.id),
    preconFixture.library.expected_ids,
    'library exact/multi-precon REST fixture drifted',
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('Name / text').waitFor()
  await page
    .getByLabel(`Trait ${preconFixture.library.trait_control}`, { exact: true })
    .click()
  await selectPreconFixture(preconFixture)
  await waitForExactIds(preconFixture.library.expected_ids)

  const semanticPreconResponse = await fetch(`${baseUrl}/api/v1/cards/semantic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'wake and block',
      kind: 'library',
      library: {
        precons: preconFixture.selections.map(({ set, precon }) => ({ set, precon })),
        precon_print: preconFixture.printing,
        traits: ['unlock'],
      },
      limit: 50,
    }),
  })
  assert.equal(semanticPreconResponse.status, 200, 'semantic precon filter request failed')
  const semanticPreconHits = await semanticPreconResponse.json()
  assert.deepEqual(
    semanticPreconHits.map((card) => card.id).sort((left, right) => left - right),
    [...preconFixture.library.expected_ids].sort((left, right) => left - right),
    'semantic exact/multi-precon candidate filtering drifted',
  )

  // Independent VDB-source oracle snapshot: every currently emitted trait
  // keeps its exact V5 cardinality, catching classifier or source drift even
  // when a representative multi-trait composition remains unchanged.
  for (const [kind, counts] of Object.entries(searchFixture.trait_counts)) {
    for (const [trait, expectedCount] of Object.entries(counts)) {
      const rows = await exactRestSearch(kind, `traits=${encodeURIComponent(trait)}`)
      assert.equal(rows.length, expectedCount, `${kind} trait count drifted: ${trait}`)
    }
  }

  // VDB-compatible result sorting is a machine API parameter and the same
  // browser control. Lock every mode to real-V5 ids and require search rows to
  // carry the image URL used by hover/tap previews.
  for (const [kind, sortFixture] of Object.entries(searchFixture.result_sort)) {
    for (const [sort, expectedIds] of Object.entries(sortFixture.orders)) {
      const rows = await exactRestSearch(kind, `${sortFixture.base_query}&sort=${sort}`)
      assert.deepEqual(
        rows.map((card) => card.id),
        expectedIds,
        `${kind} ${sort} result order drifted`,
      )
      assert.ok(
        rows.every((card) => card.image_url?.startsWith('https://')),
        `${kind} ${sort} omitted a card image URL`,
      )
    }
  }

  const searchDeckName = 'Search bridge e2e'
  await page.goto(`${baseUrl}/decks`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('New deck name').fill(searchDeckName)
  await page.getByRole('button', { name: 'Create deck', exact: true }).click()
  await page.waitForFunction(() => /^\/decks\/\d+$/.test(location.pathname))

  for (const kind of ['crypt', 'library']) {
    const sortFixture = searchFixture.result_sort[kind]
    await page.goto(`${baseUrl}/${kind}`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Name / text').waitFor()
    await page.getByLabel(`Trait ${sortFixture.trait_control}`, { exact: true }).click()
    await page.getByLabel(`Sort ${kind} results`, { exact: true }).selectOption(sortFixture.control)
    await waitForExactIds(sortFixture.orders[sortFixture.control])

    const previewButton = page.getByRole('button', { name: /^Preview image for / }).first()
    await previewButton.click()
    await page.locator('[role="tooltip"]:visible img').waitFor()
    await previewButton.click()

    const firstResult = page.locator('main button[data-card-id]').first()
    const addButton = firstResult.locator('..').locator('button[aria-label^="Add "]')
    await addButton.click()
    await page.waitForFunction(
      ({ cardId, deckName }) => {
        const row = document.querySelector(`main button[data-card-id="${cardId}"]`)?.parentElement
        return [...(row?.querySelectorAll('button') ?? [])].some(
          (button) => button.getAttribute('aria-label')?.includes(`${deckName}; currently 1`),
        )
      },
      { cardId: sortFixture.orders[sortFixture.control][0], deckName: searchDeckName },
    )

    const deckPanel = page.getByLabel('Search deck', { exact: true })
    await deckPanel.getByRole('button', { name: 'Show Deck', exact: true }).click()
    const expectedTotals =
      kind === 'crypt' ? '1 crypt · 0 library · 1 total' : '1 crypt · 1 library · 2 total'
    await deckPanel.getByText(expectedTotals, { exact: true }).waitFor()
  }

  // VDB card-text bracket tokens render as accessible visual symbols on both
  // card-detail surfaces. Lock inferior/superior discipline levels, card-type
  // tokens, translated text, and the removal of the raw bracket notation.
  await page.goto(`${baseUrl}/cards/100401`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Conditioning', level: 1 }).waitFor()
  const inferiorDominate = page.locator('[data-card-text-symbol="dom"]')
  const superiorDominate = page.locator('[data-card-text-symbol="DOM"]')
  await inferiorDominate.waitFor()
  await superiorDominate.waitFor()
  assert.equal(await inferiorDominate.getAttribute('aria-label'), 'Dominate symbol')
  assert.equal(await superiorDominate.getAttribute('aria-label'), 'Superior Dominate symbol')
  const inferiorBox = await inferiorDominate.boundingBox()
  const superiorBox = await superiorDominate.boundingBox()
  assert.ok(inferiorBox && superiorBox && inferiorBox.y < superiorBox.y, 'card-text line breaks collapsed')
  assert.equal(
    await page.locator('article').evaluate((article) => /\[(?:dom|DOM)\]/.test(article.textContent ?? '')),
    false,
    'raw discipline tokens remained visible',
  )

  await page.getByRole('button', { name: 'Español', exact: true }).click()
  await page.getByRole('heading', { name: 'Condicionamiento', level: 1 }).waitFor()
  assert.equal(await page.locator('[data-card-text-symbol="dom"]').count(), 1)
  assert.equal(await page.locator('[data-card-text-symbol="DOM"]').count(), 1)

  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.goto(`${baseUrl}/cards/201598`, { waitUntil: 'domcontentloaded' })
  const politicalAction = page.locator('[data-card-text-symbol="POLITICAL ACTION"]')
  await politicalAction.waitFor()
  assert.equal(await politicalAction.getAttribute('aria-label'), 'Political Action symbol')

  await page.goto(`${baseUrl}/library`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Español', exact: true }).click()
  await page.getByPlaceholder('Nombre / texto').fill('Conditioning')
  await waitForExactIds([100401])
  await page.locator('main button[data-card-id="100401"]').click()
  await page.locator('[data-card-text-symbol="dom"]').waitFor()
  await page.getByText('Card text: Español', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'English', exact: true }).click()

  // The semantic golden queries intentionally start with no structured
  // filters. Reload to discard the exact-search component state above while
  // keeping the service worker/model caches warm.
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('main')

  let activeKind = null
  async function showKind(kind) {
    if (activeKind !== kind) {
      // Navigation labels are localized by the persisted card-text language.
      // Route hooks are deliberately language-independent.
      await page.locator(`nav button[data-route="${kind}"]`).click()
      await page.waitForFunction((expected) => location.pathname === `/${expected}`, kind)
      await page.getByPlaceholder('Name / text').waitFor()
      activeKind = kind
    }
    const semantic = page.getByRole('button', { name: '◇ Semantic', exact: true })
    if ((await semantic.getAttribute('aria-pressed')) !== 'true') await semantic.click()
    const conceptInput = page.getByPlaceholder('Describe a card concept (English)')
    await conceptInput.waitFor()
    return conceptInput
  }

  async function browserSearch(golden) {
    const input = await showKind(golden.kind)
    await input.fill('')
    await page.waitForFunction(
      () => document.querySelectorAll('main button[data-card-id]').length === 0,
    )
    const started = performance.now()
    await input.fill(golden.query)
    await page.waitForFunction(
      (minimum) => document.querySelectorAll('main button[data-semantic-score]').length >= minimum,
      fixture.parity_top_n,
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

    const browserResult = await browserSearch(golden)
    const nativeParityHits = nativeHits.slice(0, fixture.parity_top_n)
    const browserIds = browserResult.hits.map((hit) => hit.id)
    const nativeIds = nativeParityHits.map((hit) => hit.id)
    const sharedIds = browserIds.filter((id) => nativeIds.includes(id))
    assert.ok(
      sharedIds.length >= fixture.parity_top_n - 1,
      `${golden.query}: browser/native top-${fixture.parity_top_n} overlap fell below ${fixture.parity_top_n - 1}`,
    )
    const nativeById = new Map(nativeHits.map((hit) => [hit.id, hit]))
    const nativeCutoff = nativeParityHits.at(-1)?.score ?? -1
    browserResult.hits.forEach((hit) => {
      const nativeHit = nativeById.get(hit.id)
      assert.ok(nativeHit, `${golden.query}: browser returned a card absent from native candidates: ${hit.id}`)
      assert.ok(
        Math.abs(hit.score - nativeHit.score) <= fixture.score_tolerance,
        `${golden.query}: card ${hit.id} score exceeded tolerance (${hit.score} browser vs ${nativeHit.score} native; tolerance ${fixture.score_tolerance})`,
      )
      if (!nativeIds.includes(hit.id)) {
        assert.ok(
          nativeCutoff - nativeHit.score <= fixture.score_tolerance,
          `${golden.query}: browser boundary card ${hit.id} was materially below the native cutoff`,
        )
      }
    })
    // Each platform may move a score by up to the declared tolerance. Preserve
    // order whenever the native gap is larger than both cards' combined error;
    // genuinely near-tied cards may swap without changing retrieval quality.
    const browserPosition = new Map(browserIds.map((cardId, position) => [cardId, position]))
    for (let higher = 0; higher < nativeParityHits.length; higher += 1) {
      for (let lower = higher + 1; lower < nativeParityHits.length; lower += 1) {
        const scoreGap = nativeParityHits[higher].score - nativeParityHits[lower].score
        if (scoreGap <= fixture.score_tolerance * 2) continue
        const higherPosition = browserPosition.get(nativeParityHits[higher].id)
        const lowerPosition = browserPosition.get(nativeParityHits[lower].id)
        if (higherPosition === undefined || lowerPosition === undefined) continue
        assert.ok(
          higherPosition < lowerPosition,
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
