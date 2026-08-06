import { test, expect, resetAppState } from '../test-helper'

/**
 * Settings Configuration Flow — content contracts
 *
 * Every guard here used to be an `if (!navigated) test.skip()` around a helper that can
 * never actually fail (the Settings nav link is always in the shell sidebar), or a
 * try-both-selectors dance with no real assertion behind it. Grounding for the rewrite:
 *   - shell/Sidebar.tsx (SidebarContent) — the rail's bottom nav item
 *     `{ to: '/settings', label: 'Settings' }` renders an `<a>` (role=link) named "Settings".
 *   - pages/Settings.tsx — `<PageHeader title="Settings" />` renders `<h1>Settings</h1>`.
 *   - pages/settings/AppearanceSection.tsx — `<h2>Appearance</h2>`, and three theme buttons
 *     whose accessible name is the raw theme value ('light' | 'dark' | 'system' — the
 *     `capitalize` class is CSS-only styling, not the text content); each button's onClick
 *     calls `updateSettings({ theme })`.
 *   - App.tsx's theme effect (~L108-120) — `root.classList.remove('light', 'dark'); ` then
 *     `root.classList.add(theme)`, so a theme button click is verifiable via the actual DOM
 *     class the rest of the app styles against, not just component state.
 *
 * Theme DOES persist across page.reload(): the persist middleware ('vuln-assess-storage',
 * useStore.ts:432-445) rehydrates settings from localStorage before App.tsx's theme effect
 * runs, and nothing on mount re-fetches or overwrites settings. Asserted below in
 * 'should persist the selected theme across a full page reload'. (An earlier suspicion that it
 * reverted did not reproduce — see store/useStore.test.ts rehydration test.)
 */
test.describe('Settings Configuration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to settings page', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.locator('#main-content').getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  })

  test('should display theme options in settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click()
    const main = page.locator('#main-content')

    await expect(main.getByRole('heading', { name: 'Appearance' })).toBeVisible()
    // AppearanceSection.tsx maps exactly these three theme buttons.
    for (const theme of ['light', 'dark', 'system']) {
      await expect(main.getByRole('button', { name: theme, exact: true })).toBeVisible()
    }
  })

  test('should change theme to dark mode', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click()
    const main = page.locator('#main-content')
    const html = page.locator('html')

    // Force a real transition through "light" first, so the subsequent "dark" click is a
    // provable change rather than a no-op against whatever theme the app happened to start in.
    await main.getByRole('button', { name: 'light', exact: true }).click()
    await expect(html).toHaveClass(/light/)
    await expect(html).not.toHaveClass(/dark/)

    await main.getByRole('button', { name: 'dark', exact: true }).click()
    await expect(html).toHaveClass(/dark/)
    await expect(html).not.toHaveClass(/light/)
  })

  test('should persist the selected theme across a full page reload', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click()
    const main = page.locator('#main-content')
    const html = page.locator('html')

    // Default theme is 'dark' (DEFAULT_SETTINGS); switch to a non-default 'light' so the
    // post-reload assertion proves the *persisted user choice* survived, not the compiled
    // default happening to match.
    await main.getByRole('button', { name: 'light', exact: true }).click()
    await expect(html).toHaveClass(/light/)
    await expect(html).not.toHaveClass(/dark/)

    await page.reload({ waitUntil: 'domcontentloaded' })

    // On reload the persist middleware rehydrates settings from localStorage before App's
    // theme effect runs, so the html element must still carry the chosen 'light' class.
    await expect(html).toHaveClass(/light/)
    await expect(html).not.toHaveClass(/dark/)
  })

  test('auto-refresh interval selector enables on toggle and records the chosen interval (FR-03.6)', async ({
    page,
  }) => {
    await page.getByRole('link', { name: 'Settings' }).click()
    const main = page.locator('#main-content')
    const intervalSelect = main.locator('#auto-refresh-interval')

    // The interval selector is inert until auto-refresh is enabled (so a user can't pick an
    // interval that would never fire).
    await expect(intervalSelect).toBeDisabled()

    // Enabling auto-refresh activates the selector (proves the disabled binding is live).
    await main.getByRole('switch', { name: 'Toggle auto-refresh vulnerability data' }).click()
    await expect(intervalSelect).toBeEnabled()

    // It offers the AUTO_REFRESH_INTERVAL_OPTIONS values, and choosing one takes effect — this is
    // what feeds the scheduler's needsRefresh(project, autoRefreshInterval) check. (Cross-reload
    // persistence of settings is exercised separately by the theme-persist spec above.)
    const optionValues = await intervalSelect
      .locator('option')
      .evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))
    expect(optionValues).toEqual(['1', '6', '12', '24', '168'])

    await intervalSelect.selectOption('168')
    await expect(intervalSelect).toHaveValue('168')
  })

  test('should navigate back to dashboard from settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)

    await page.goBack()
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 5000 })
  })
})
