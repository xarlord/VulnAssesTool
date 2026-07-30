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
 * Theme does NOT persist across page.reload() (known gap) — not asserted here.
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

  test('should navigate back to dashboard from settings', async ({ page }) => {
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings$/)

    await page.goBack()
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 5000 })
  })
})
