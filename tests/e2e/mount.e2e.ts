/**
 * Aggregate-bundle mount lane: prove the packed `@linxin666/dsh-web-ui-all`
 * tarball mounts into a real `dsh web` instance and that the right-panel
 * transition is in effect:
 *
 *  1. the external `dsh-better-sidebar` plugin mounts
 *     (`[data-dsh-better-sidebar]` host div appears);
 *  2. the aionui-panel columns are NOT mounted by default (the bundle's
 *     config patch sets `enabled: false` — it stays installed and can be
 *     re-enabled from Settings → Web UI Plugins → Right panel);
 *  3. no crash markers: no `dsh-better-sidebar:` error strips, no
 *     `pageerror`, no plugin-prefixed console errors.
 *
 * The server is booted by `scripts/e2e-mount.sh`; the base URL arrives via
 * `DSH_E2E_URL`. Deterministic: every wait is on a DOM marker, and any crash
 * trips the very next assertion.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.DSH_E2E_URL
if (!BASE_URL) {
  throw new Error('DSH_E2E_URL is not set — boot a DSH web instance with the aggregate bundle mounted and point this lane at it (see scripts/e2e-mount.sh)')
}

/** Plugin crash-marker prefixes (the client renders a strip instead of crashing). */
const CRASH_STRIP_PATTERNS = [/^dsh-better-sidebar:/, /^\[dsh-better-sidebar\]/]

/** The aionui right-panel column roots (absent while the master switch is off). */
const AIONUI_COLUMNS = '[data-aionui-preview-col], [data-aionui-explorer-col]'

test('family bundle mounts better-sidebar and keeps aionui off by default', async ({ page }) => {
  const pageErrors: string[] = []
  const pluginConsoleErrors: string[] = []
  page.on('pageerror', (error) => { pageErrors.push(error.message) })
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/dsh-better-sidebar/.test(text)) pluginConsoleErrors.push(text)
  })

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

  // The shell rendered and better-sidebar mounted its host div. The panel
  // itself is COLLAPSED by default (openByDefault is off), so the host div
  // is attached but not visible — 'attached' is the mount contract.
  await page.waitForSelector('[data-dsh-better-sidebar]', { state: 'attached', timeout: 30_000 })
  await expect(page.locator('[data-dsh-better-sidebar]')).toHaveCount(1)

  // The aionui right-panel columns stay unmounted by default (bundle patch
  // config `enabled: false`), while the package itself remains installed.
  await expect(page.locator(AIONUI_COLUMNS)).toHaveCount(0)

  // No better-sidebar crash strips anywhere on the page.
  for (const pattern of CRASH_STRIP_PATTERNS) {
    await expect(page.getByText(pattern)).toHaveCount(0)
  }
  expect(pageErrors, 'page errors').toEqual([])
  expect(pluginConsoleErrors, 'plugin console errors').toEqual([])
})
