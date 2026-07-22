import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const port = Number(process.env.SCHRECKNET_MOBILE_E2E_PORT ?? 18181)
const viewportWidth = Number(process.env.SCHRECKNET_MOBILE_WIDTH ?? 360)
const baseUrl = `http://127.0.0.1:${port}`
const appDb = path.join(tmpdir(), `schrecknet-mobile-e2e-${process.pid}.sqlite`)
const server = spawn(path.join(repoRoot, process.env.SCHRECKNET_SERVER_BIN ?? 'target/debug/schrecknet-server'), [], {
  cwd: repoRoot,
  env: {
    ...process.env,
    SCHRECKNET_BIND: `127.0.0.1:${port}`,
    SCHRECKNET_STATIC_DIR: path.join(repoRoot, 'frontend/dist'),
    SCHRECKNET_DATA_DIR: path.join(repoRoot, 'dist'),
    SCHRECKNET_APP_DB: appDb,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let browser
async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return
    } catch {
      // Still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('timed out waiting for mobile smoke server')
}

try {
  await waitForServer()
  browser = await chromium.launch({
    ...(process.env.SCHRECKNET_CHROME_CHANNEL ? { channel: process.env.SCHRECKNET_CHROME_CHANNEL } : {}),
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: viewportWidth, height: 800 }, isMobile: true, hasTouch: true })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  const routes = ['crypt', 'library', 'decks', 'inventory', 'precons', 'rules', 'help', 'about', 'cards/100401']

  async function checkRoute(route) {
    await page.goto(`${baseUrl}/#/${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('main')
    await page.waitForTimeout(250)
    const metrics = await page.evaluate(() => {
      const root = document.documentElement
      const viewportWidth = root.clientWidth
      const escaped = [...document.querySelectorAll('body *')]
        .filter((element) => {
          if (!(element instanceof HTMLElement) || element.offsetParent === null) return false
          const rect = element.getBoundingClientRect()
          if (rect.left >= -1 && rect.right <= viewportWidth + 1) return false
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const overflow = getComputedStyle(parent).overflowX
            if (overflow === 'auto' || overflow === 'scroll') return false
          }
          return true
        })
        .slice(-12)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? '').trim().slice(0, 60),
          className: element.className,
          left: Math.round(element.getBoundingClientRect().left),
          right: Math.round(element.getBoundingClientRect().right),
          scrollWidth: element.scrollWidth,
        }))
      const navTargets = [...document.querySelectorAll('nav button')].map((element) => {
        const rect = element.getBoundingClientRect()
        return { route: element.getAttribute('data-route'), width: rect.width, height: rect.height }
      })
      const touchTargets = [...document.querySelectorAll('button[aria-label], select, input:not([type="hidden"]):not([type="file"])')]
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            tag: element.tagName.toLowerCase(),
            label: element.getAttribute('aria-label') || element.getAttribute('placeholder') || '',
            width: rect.width,
            height: rect.height,
            iconOnly: element.matches('button[aria-label]'),
          }
        })
      const internalOverflow = [...document.querySelectorAll('main *')]
        .filter((element) => element instanceof HTMLElement && element.offsetParent !== null && element.scrollWidth > element.clientWidth + 1)
        .slice(-12)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? '').trim().slice(0, 60),
          className: element.className,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }))
      return {
        viewportWidth,
        innerWidth: window.innerWidth,
        desktopBreakpoint: matchMedia('(min-width: 640px)').matches,
        scrollWidth: root.scrollWidth,
        escaped,
        navTargets,
        touchTargets,
        internalOverflow,
      }
    })
    assert.ok(
      metrics.scrollWidth <= metrics.viewportWidth + 1,
      `${route}: page overflows ${metrics.viewportWidth}px viewport (${metrics.scrollWidth}px; inner=${metrics.innerWidth}; sm=${metrics.desktopBreakpoint}): escaped=${JSON.stringify(metrics.escaped)} internal=${JSON.stringify(metrics.internalOverflow)}`,
    )
    assert.ok(metrics.escaped.length === 0, `${route}: visible content escaped viewport: ${JSON.stringify(metrics.escaped)}`)
    for (const target of metrics.navTargets) {
      assert.ok(target.height >= 40, `${route}: ${target.route} nav target is only ${target.height}px tall`)
    }
    for (const target of metrics.touchTargets) {
      assert.ok(target.height >= 40, `${route}: ${target.tag} “${target.label}” is only ${target.height}px tall`)
      if (target.iconOnly) {
        assert.ok(target.width >= 40, `${route}: icon button “${target.label}” is only ${target.width}px wide`)
      }
    }
  }

  for (const route of routes) await checkRoute(route)

  // The card-text selector also controls the UI locale. Exercise both search
  // surfaces in every shipped UI language so typed translations cannot drift
  // into dead, unrendered entries.
  await page.goto(`${baseUrl}/#/crypt`, { waitUntil: 'domcontentloaded' })
  const language = page.getByLabel('Card text language')
  await language.selectOption('es')
  await page.getByPlaceholder('Nombre / texto').waitFor()
  await page.getByRole('option', { name: 'Cualquier clan', exact: true }).waitFor({ state: 'attached' })
  await page.getByText('Rasgos', { exact: true }).waitFor()
  await page.locator('button[data-route="library"]').click()
  await page.getByPlaceholder('Nombre / texto').waitFor()
  await page.getByRole('option', { name: 'Cualquier tipo', exact: true }).waitFor({ state: 'attached' })
  await page.getByText('Lógica de disciplinas', { exact: true }).waitFor()

  await language.selectOption('fr')
  await page.getByPlaceholder('Nom / texte').waitFor()
  await page.getByRole('option', { name: 'Tout type', exact: true }).waitFor({ state: 'attached' })
  await page.getByText('Logique des disciplines', { exact: true }).waitFor()
  await page.locator('button[data-route="crypt"]').click()
  await page.getByPlaceholder('Nom / texte').waitFor()
  await page.getByRole('option', { name: 'Tout clan', exact: true }).waitFor({ state: 'attached' })
  await page.getByText('Traits', { exact: true }).waitFor()
  await language.selectOption('en')

  await page.goto(`${baseUrl}/#/decks`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('New deck name').fill('Mobile smoke')
  await page.getByRole('button', { name: 'Create deck', exact: true }).click()
  await page.waitForFunction(() => location.hash.startsWith('#/decks/'))
  await page.getByPlaceholder('Add crypt card by name…').fill('Aaradhya')
  await page.getByRole('button', { name: /Aaradhya/ }).click()
  try {
    await page.getByLabel('Decrease quantity').waitFor({ timeout: 10_000 })
  } catch (error) {
    const pageText = (await page.locator('main').innerText()).slice(0, 1_000)
    throw new Error(
      `deck card did not appear at ${page.url()}; page errors: ${JSON.stringify(pageErrors)}; main: ${pageText}`,
      { cause: error },
    )
  }
  const deckRoute = new URL(page.url()).hash.slice(2)
  await checkRoute(deckRoute)

  console.log(`mobile layout contract passed across ${routes.length + 1} routes at ${viewportWidth}px`)
} finally {
  await browser?.close()
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM')
    await Promise.race([once(server, 'exit'), new Promise((resolve) => setTimeout(resolve, 5_000))])
  }
  await rm(appDb, { force: true })
}
