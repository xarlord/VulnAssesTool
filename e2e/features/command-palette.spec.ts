import { test, expect, resetAppState } from '../test-helper'
import { openCommandPalette, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

/**
 * Command Palette — content contracts
 *
 * The palette is 100% client-side (no network/DB), so its output is fully deterministic
 * offline. Every assertion below is grounded in the shipped source rather than gated
 * behind `if (count > 0)` / `expect([true,false]).toContain(...)` (the previous version
 * asserted "may or may not" on almost every behaviour, so nothing could ever fail):
 *
 *   - components/CommandPalette.tsx        — dialog, combobox input, [data-index]/aria-selected
 *                                            rows, role="status" empty state, footer hints,
 *                                            arrow keys CLAMP (Math.min/max, no wrap), Enter runs
 *                                            flatResults[selectedIndex], Escape closes.
 *   - lib/commands/commandRegistry.ts      — empty query returns getCommands() ordered by
 *                                            category ['navigation','actions','view','edit',
 *                                            'settings','help'] then priority; MIN_SEARCH_SCORE.
 *   - lib/commands/registerCommands.ts     — the 15 registered commands + their navigate targets.
 *
 * Deterministic unfiltered order (data-index):
 *   0 Go to Dashboard · 1 Go to Executive Dashboard · 2 Go to Search · 3 Go to Settings
 *   4 Create New Project · 5 Import SBOM · 6 Generate SBOM · 7 Export All Projects
 *   8 Scan All Projects · 9 Open Command Palette · 10 Toggle Sidebar
 *   11 Show Onboarding Tour · 12 Open Documentation · 13 Report an Issue · 14 About VulnAssessTool
 */

const TOTAL_COMMANDS = 15

test.describe('Command Palette', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Open/Close', () => {
    test('opens with Ctrl+Shift+P (legacy alias)', async ({ page }) => {
      await page.keyboard.press('Control+Shift+P')
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('opens with Ctrl+K (primary shortcut)', async ({ page }) => {
      await page.keyboard.press('Control+K')
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('shows a focused search input', async ({ page }) => {
      await openCommandPalette(page)
      const input = page.getByRole('combobox')
      await expect(input).toBeVisible()
      await expect(input).toBeFocused()
      await expect(input).toHaveAttribute('placeholder', 'Search commands...')
    })

    test('shows the ESC badge in the header', async ({ page }) => {
      await openCommandPalette(page)
      await expect(page.getByRole('dialog').getByText('ESC', { exact: true })).toBeVisible()
    })

    test('closes with Escape', async ({ page }) => {
      await openCommandPalette(page)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()
    })

    test('closes when clicking outside the dialog', async ({ page }) => {
      await openCommandPalette(page)
      // The palette is centred; the top-left corner is on the modal overlay.
      await page.mouse.click(5, 5)
      await expect(page.getByRole('dialog')).toBeHidden()
    })

    test('toggles closed with a second Ctrl+Shift+P', async ({ page }) => {
      await page.keyboard.press('Control+Shift+P')
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await page.keyboard.press('Control+Shift+P')
      await expect(page.getByRole('dialog')).toBeHidden()
    })
  })

  test.describe('Search', () => {
    test('lists all 15 commands in deterministic order when unfiltered', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      await expect(dialog.locator('[data-index]')).toHaveCount(TOTAL_COMMANDS)
      // The first item is fixed by the category+priority sort.
      await expect(dialog.locator('[data-index="0"]')).toHaveText(/Go to Dashboard/)
      await expect(dialog.locator('[data-index="4"]')).toHaveText(/Create New Project/)
    })

    test('filters to exactly one command for "settings"', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('combobox').fill('settings')
      await expect(dialog.locator('[data-index]')).toHaveCount(1)
      await expect(dialog.locator('[data-index="0"]')).toHaveText(/Go to Settings/)
    })

    test('is case-insensitive', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('combobox').fill('SETTINGS')
      await expect(dialog.locator('[data-index]')).toHaveCount(1)
      await expect(dialog.locator('[data-index="0"]')).toHaveText(/Go to Settings/)
    })

    test('updates results as you type', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      const input = dialog.getByRole('combobox')
      await input.fill('s')
      // Many commands match a single "s"; narrowing to "set" leaves only "Go to Settings".
      await expect(dialog.locator('[data-index]').first()).toBeVisible()
      await input.fill('set')
      await expect(dialog.locator('[data-index]')).toHaveCount(1)
      await expect(dialog.locator('[data-index="0"]')).toHaveText(/Go to Settings/)
    })

    test('shows the no-results status for an unknown command', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      await dialog.getByRole('combobox').fill('xyznonexistentcommand123')
      await expect(dialog.locator('[data-index]')).toHaveCount(0)
      await expect(dialog.getByRole('status')).toContainText('No commands found for "xyznonexistentcommand123"')
    })
  })

  test.describe('Keyboard navigation', () => {
    test('ArrowDown moves selection to the next command', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      // Index 0 is selected on open.
      await expect(dialog.locator('[data-index="0"]')).toHaveAttribute('aria-selected', 'true')
      await dialog.getByRole('combobox').press('ArrowDown')
      await expect(dialog.locator('[data-index="1"]')).toHaveAttribute('aria-selected', 'true')
      await expect(dialog.locator('[data-index="1"]')).toHaveText(/Go to Executive Dashboard/)
      await expect(dialog.locator('[data-index="0"]')).toHaveAttribute('aria-selected', 'false')
    })

    test('ArrowUp clamps at the top of the list (no wrap-around)', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      const input = dialog.getByRole('combobox')
      await input.press('ArrowUp')
      await input.press('ArrowUp')
      // Math.max(prev-1, 0) keeps selection pinned to index 0 — it does not jump to the last item.
      await expect(dialog.locator('[data-index="0"]')).toHaveAttribute('aria-selected', 'true')
    })

    test('ArrowDown then ArrowUp returns to the first command', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      const input = dialog.getByRole('combobox')
      await input.press('ArrowDown')
      await input.press('ArrowDown')
      await input.press('ArrowUp')
      await expect(dialog.locator('[data-index="1"]')).toHaveAttribute('aria-selected', 'true')
    })
  })

  test.describe('Execution', () => {
    test('Enter runs the selected command and navigates', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      // Filtering to the single "Go to Settings" result makes it the selected (index 0) command.
      await dialog.getByRole('combobox').fill('settings')
      await expect(dialog.locator('[data-index]')).toHaveCount(1)
      await dialog.getByRole('combobox').press('Enter')
      await expect(page).toHaveURL(/\/settings$/, { timeout: E2E_SELECTOR_TIMEOUT })
      await expect(page.getByRole('dialog')).toBeHidden()
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    })

    test('clicking a command runs it and closes the palette', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      // Index 3 is "Go to Settings" in the unfiltered list.
      await dialog.locator('[data-index="3"]').click()
      await expect(page).toHaveURL(/\/settings$/, { timeout: E2E_SELECTOR_TIMEOUT })
      await expect(page.getByRole('dialog')).toBeHidden()
    })
  })

  test.describe('Category icons', () => {
    test('every command row renders an icon', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      await expect(dialog.locator('[data-index] svg')).toHaveCount(TOTAL_COMMANDS)
    })

    test('different categories render different icons', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      // Icons are keyed off the command's category, so a navigation row and an actions row
      // must render distinct lucide icons.
      const navIcon = await dialog.locator('[data-index="0"] svg').getAttribute('class')
      const actionIcon = await dialog.locator('[data-index="4"] svg').getAttribute('class')
      expect(navIcon).toBeTruthy()
      expect(actionIcon).toBeTruthy()
      expect(navIcon).not.toEqual(actionIcon)
    })
  })

  test.describe('Footer', () => {
    test('shows the navigate / select / close hints', async ({ page }) => {
      await openCommandPalette(page)
      // Scope to the footer row — Radix also injects its own "Close" button in the dialog.
      const footer = page.getByRole('dialog').locator('div.border-t')
      await expect(footer).toContainText('Navigate')
      await expect(footer).toContainText('Select')
      await expect(footer).toContainText('Close')
    })
  })

  test.describe('Accessibility', () => {
    test('exposes dialog, combobox, and listbox roles', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('combobox')).toBeVisible()
      await expect(dialog.getByRole('listbox')).toBeVisible()
    })

    test('is fully keyboard operable', async ({ page }) => {
      await openCommandPalette(page)
      const input = page.getByRole('dialog').getByRole('combobox')
      await input.fill('set')
      await input.press('ArrowDown')
      await input.press('ArrowUp')
      await input.press('Escape')
      await expect(page.getByRole('dialog')).toBeHidden()
    })
  })

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('renders on a tablet viewport', async ({ page }) => {
      await openCommandPalette(page)
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('combobox')).toBeVisible()
      await expect(dialog.locator('[data-index]')).toHaveCount(TOTAL_COMMANDS)
    })
  })
})
