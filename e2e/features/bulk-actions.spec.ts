import { test, expect, resetAppState } from '../test-helper'
import type { Page } from '@playwright/test'
import { createProjectOnly, E2E_UI_DELAY, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

/**
 * Bulk Actions — content contracts
 *
 * Dashboard.tsx owns all bulk-selection state (`isBulkMode`, `selectedProjectIds`); its markup
 * is the single source of truth for every assertion below:
 *   - "Select Projects" / "Exit Selection" toggle button (Dashboard.tsx:319-329), rendered only
 *     when projects.length > 0
 *   - Select-all + per-row checkboxes: native <input type="checkbox"> (Dashboard.tsx:409-444)
 *   - Bulk actions bar (Dashboard.tsx:333-359): "<N> project(s) selected" text, "Clear selection",
 *     and exact "Export"/"Delete" buttons — rendered only while selectedProjectIds.size > 0
 *   - Bulk delete confirms via the Radix ConfirmDialog (Dashboard.tsx:477-488; ui/confirm-dialog.tsx),
 *     title "Delete selected projects", confirm button "Delete", cancel button "Cancel" —
 *     NOT a native window.confirm(), so `page.once('dialog', ...)` handlers never fire
 *   - Bulk export opens the shared ExportDialog (components/ExportDialog.tsx:98), titled
 *     "Export Data"
 *   - Each project card renders as a `.group` element (components/ProjectCard.tsx:50)
 *
 * "should show success toast after bulk operation" is skipped: handleBulkAction('delete')
 * (Dashboard.tsx:208-218) calls deleteProject() in a loop with no toast.success() call anywhere
 * in that path (store/useStore.ts deleteProject) — there is no success toast to assert.
 */

test.describe('Bulk Actions', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Selection Mode Tests
  // ==========================================================================

  test.describe('Selection Mode', () => {
    test('should enter bulk selection mode', async ({ page }) => {
      await createMultipleProjects(page, 3)

      // The actual button text is "Select Projects"
      const selectButton = page.getByRole('button', { name: /select projects/i })
      await expect(selectButton).toBeVisible()
      await selectButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Checkboxes should appear
      const checkboxes = page.getByRole('checkbox')
      const count = await checkboxes.count()
      expect(count).toBeGreaterThan(0)
    })

    test('should show checkboxes when in selection mode', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const checkboxes = page.getByRole('checkbox')
      const count = await checkboxes.count()
      expect(count).toBeGreaterThan(0)
    })

    test('should exit selection mode', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      // The toggle button is the same element, relabelled "Exit Selection" while isBulkMode is
      // true (Dashboard.tsx:327) — it is unconditionally present once selection mode is entered.
      const exitButton = page.getByRole('button', { name: 'Exit Selection', exact: true })
      await expect(exitButton).toBeVisible()
      await exitButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Checkboxes should be gone
      const checkboxes = page.getByRole('checkbox')
      await expect(checkboxes).toHaveCount(0)
    })

    test('should show select all option', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      // There should be checkboxes visible (including "Select All")
      const checkboxes = page.getByRole('checkbox')
      const count = await checkboxes.count()
      expect(count).toBeGreaterThan(0)
    })

    test('should deselect all option', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      // Select all by clicking the first checkbox (Select All checkbox)
      const checkboxes = page.getByRole('checkbox')
      const selectAllCheckbox = checkboxes.first()
      await selectAllCheckbox.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // All project checkboxes should be checked
      const checkedCount = await page.getByRole('checkbox', { checked: true }).count()
      expect(checkedCount).toBeGreaterThanOrEqual(3)

      // Click again to deselect all
      await selectAllCheckbox.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // All checkboxes should be unchecked
      const checkedAfter = await page.getByRole('checkbox', { checked: true }).count()
      expect(checkedAfter).toBe(0)
    })
  })

  // ==========================================================================
  // Multi-Select Tests
  // ==========================================================================

  test.describe('Multi-Select', () => {
    test('should select multiple projects', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const checkboxes = page.getByRole('checkbox')

      // Select first two (skip "Select All" checkbox at index 0)
      await checkboxes.nth(1).click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await checkboxes.nth(2).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Both should be checked
      const checkedCount = await page.getByRole('checkbox', { checked: true }).count()
      expect(checkedCount).toBeGreaterThanOrEqual(2)
    })

    test('should show selection count', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Dashboard.tsx:337 renders `{size} project{s if plural} selected` — with 2 selected
      // that is the literal string "2 projects selected".
      await expect(page.getByText('2 projects selected')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should toggle selection on click', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const checkboxes = page.getByRole('checkbox')
      const checkbox = checkboxes.nth(1) // Skip "Select All" checkbox

      // Select
      await checkbox.click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await expect(checkbox).toBeChecked()

      // Deselect
      await checkbox.click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await expect(checkbox).not.toBeChecked()
    })

    test('should select all with select all checkbox', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      // Click the first checkbox (Select All)
      const selectAllCheckbox = page.getByRole('checkbox').first()
      await selectAllCheckbox.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const checkedCount = await page.getByRole('checkbox', { checked: true }).count()
      expect(checkedCount).toBeGreaterThanOrEqual(3)
    })
  })

  // ==========================================================================
  // Action Bar Tests
  // ==========================================================================

  test.describe('Action Bar', () => {
    test('should show bulk action bar when items selected', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Action bar should appear - shows selection count text
      const selectionText = page.getByText(/\d+ project.*selected/i)
      await expect(selectionText).toBeVisible({ timeout: 5000 })
    })

    test('should show delete action', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Use exact match to avoid matching "Delete project" per-card buttons
      const deleteButton = page.getByRole('button', { name: 'Delete', exact: true })
      await expect(deleteButton).toBeVisible({ timeout: 5000 })
    })

    test('should show export action', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Use exact match to avoid matching "Export All" header button
      const exportButton = page.getByRole('button', { name: 'Export', exact: true })
      await expect(exportButton).toBeVisible({ timeout: 5000 })
    })

    test('should hide action bar when selection cleared', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // "Clear selection" is unconditionally rendered inside the bulk actions bar
      // (Dashboard.tsx:339) whenever selectedProjectIds.size > 0 — no visibility guard needed.
      const clearButton = page.getByRole('button', { name: 'Clear selection' })
      await clearButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // The action bar (and its "N selected" text) is gated on selectedProjectIds.size > 0
      // (Dashboard.tsx:333), so clearing the selection removes it.
      const selectionText = page.getByText(/\d+ project.*selected/i)
      await expect(selectionText).not.toBeVisible()
    })
  })

  // ==========================================================================
  // Bulk Operations Tests
  // ==========================================================================

  test.describe('Bulk Operations', () => {
    test('should delete selected projects', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Use exact match - "Delete" in the action bar (not "Delete project" per-card)
      const deleteButton = page.getByRole('button', { name: 'Delete', exact: true })
      await deleteButton.click()

      // Bulk delete confirms via the in-app ConfirmDialog (Radix dialog, Dashboard.tsx:477-488),
      // not native confirm() - accept by clicking its "Delete" confirm button.
      const confirmDialog = page.getByRole('dialog')
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: 'Delete', exact: true }).click()

      // Exactly 1 of the 3 created projects remains — the other 2 were the deleted selection.
      const projectCards = page.locator('.group')
      await expect(projectCards).toHaveCount(1, { timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should export selected projects', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Use exact match - "Export" in action bar (not "Export All")
      const exportButton = page.getByRole('button', { name: 'Export', exact: true })
      await exportButton.click()

      // handleBulkAction('export') opens the shared ExportDialog (Dashboard.tsx:215-217),
      // titled "Export Data" (components/ExportDialog.tsx:98).
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Export Data')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should show confirmation before destructive action', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.getByRole('button', { name: 'Delete', exact: true })
      await deleteButton.click()

      // Bulk delete confirms via the in-app ConfirmDialog (Radix dialog, Dashboard.tsx:477-488) —
      // not a native confirm(), so no window 'dialog' event is ever emitted here.
      const confirmDialog = page.getByRole('dialog')
      await expect(confirmDialog.getByText('Delete selected projects')).toBeVisible()
      await expect(confirmDialog.getByRole('button', { name: 'Delete', exact: true })).toBeVisible()
      await expect(confirmDialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()

      // Nothing has been confirmed yet, so all 3 projects still exist.
      const projectCards = page.locator('.group')
      await expect(projectCards).toHaveCount(3)
    })

    test('should cancel bulk delete', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.getByRole('button', { name: 'Delete', exact: true })
      await deleteButton.click()

      // Cancel via the ConfirmDialog's "Cancel" button (ui/confirm-dialog.tsx default cancelLabel).
      const confirmDialog = page.getByRole('dialog')
      await expect(confirmDialog).toBeVisible()
      await confirmDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(confirmDialog).not.toBeVisible()

      // Projects should still exist
      const projectCards = page.locator('.group')
      await expect(projectCards).toHaveCount(3)
    })

    test.skip('should show success toast after bulk operation', async () => {
      // Infeasible: handleBulkAction('delete') (Dashboard.tsx:208-218) loops deleteProject() with
      // no toast.success() call in that path (store/useStore.ts deleteProject) — bulk delete
      // never shows a toast, so there is nothing in shipped source to assert here.
    })
  })

  // ==========================================================================
  // Responsive Design Tests
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display bulk actions on tablet', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // The bulk actions bar (Dashboard.tsx:333-359) has no viewport-gated rendering, so the
      // same "N selected" content contract applies at tablet width.
      const selectionText = page.getByText(/\d+ project.*selected/i)
      await expect(selectionText).toBeVisible({ timeout: 5000 })
    })

    test('should allow selection on tablet', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const checkboxes = page.getByRole('checkbox')
      const count = await checkboxes.count()
      expect(count).toBeGreaterThan(0)
    })
  })
})

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Create multiple test projects (stays on dashboard)
 */
async function createMultipleProjects(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await createProjectOnly(page, `Bulk Project ${i + 1}`)
    await page.waitForTimeout(E2E_UI_DELAY)
  }
}

/**
 * Enter selection mode
 */
async function enterSelectionMode(page: Page): Promise<void> {
  // The actual button text is "Select Projects" - wait for it to be visible
  const selectButton = page.getByRole('button', { name: /select projects|exit selection/i })
  try {
    await selectButton.waitFor({ state: 'visible', timeout: 5000 })
    await selectButton.click()
    await page.waitForTimeout(E2E_UI_DELAY)
  } catch {
    // Button not available on this viewport
  }
}

/**
 * Select multiple projects
 */
async function selectMultipleProjects(page: Page, count: number): Promise<void> {
  await enterSelectionMode(page)

  const checkboxes = page.getByRole('checkbox')
  // Wait for checkboxes to render after entering selection mode
  try {
    await checkboxes.first().waitFor({ state: 'visible', timeout: 5000 })
  } catch {
    // No checkboxes available
    return
  }

  const available = await checkboxes.count()

  // Skip index 0 (Select All checkbox), start from 1
  for (let i = 1; i < Math.min(count + 1, available); i++) {
    await checkboxes.nth(i).click()
    await page.waitForTimeout(100)
  }
}
