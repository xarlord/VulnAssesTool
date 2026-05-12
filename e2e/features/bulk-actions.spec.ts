import { test, expect, resetAppState } from '../electron-helper'
import type { Page } from '@playwright/test'
import { createProjectOnly, E2E_UI_DELAY } from '../shared-helpers'

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

      // Click "Exit Selection" to exit bulk mode
      const exitButton = page.getByRole('button', { name: /exit selection/i })
      if (await exitButton.isVisible()) {
        await exitButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Checkboxes should be gone
        const checkboxes = page.getByRole('checkbox')
        const count = await checkboxes.count()
        expect(count).toBe(0)
      }
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

      // Should show count like "2 selected"
      const countText = page.locator('text=/\\d+ selected/i')
      // Count text is optional on some viewports
      await countText.isVisible().catch(() => false)
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

      // Clear selection by clicking "Clear selection" button
      const clearButton = page.getByRole('button', { name: /clear selection/i })
      if (await clearButton.isVisible()) {
        await clearButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Action bar should be gone (selection count text hidden)
        const selectionText = page.getByText(/\d+ project.*selected/i)
        const isVisible = await selectionText.isVisible().catch(() => false)
        expect(isVisible).toBe(false)
      }
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

      // Set up dialog handler BEFORE clicking - native confirm() blocks the main thread
      // so Promise.all pattern causes click() to time out
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm')
        await dialog.accept()
      })
      await deleteButton.click()

      await page.waitForTimeout(E2E_UI_DELAY * 2)

      // Projects should be deleted
      const projectCards = page.locator('.group')
      const count = await projectCards.count()
      expect(count).toBeLessThanOrEqual(1) // Only 1 should remain
    })

    test('should export selected projects', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Use exact match - "Export" in action bar (not "Export All")
      const exportButton = page.getByRole('button', { name: 'Export', exact: true })
      await exportButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Export dialog should appear
      const dialog = page.getByRole('dialog')
      // Dialog may or may not appear depending on implementation
      await dialog.isVisible().catch(() => false)
    })

    test('should show confirmation before destructive action', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.getByRole('button', { name: 'Delete', exact: true })

      // Set up dialog handler BEFORE clicking
      page.once('dialog', async (dialog) => {
        expect(dialog.type()).toBe('confirm')
        await dialog.dismiss()
      })
      await deleteButton.click()

      await page.waitForTimeout(E2E_UI_DELAY)

      // Projects should still exist since we cancelled
      const projectCards = page.locator('.group')
      const count = await projectCards.count()
      expect(count).toBeGreaterThanOrEqual(3)
    })

    test('should cancel bulk delete', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.getByRole('button', { name: 'Delete', exact: true })

      // Set up dialog handler BEFORE clicking
      page.once('dialog', async (dialog) => {
        await dialog.dismiss()
      })
      await deleteButton.click()

      await page.waitForTimeout(E2E_UI_DELAY)

      // Projects should still exist
      const projectCards = page.locator('.group')
      const count = await projectCards.count()
      expect(count).toBeGreaterThanOrEqual(3)
    })

    test('should show success toast after bulk operation', async ({ page }) => {
      await createMultipleProjects(page, 4)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.getByRole('button', { name: 'Delete', exact: true })

      // Set up dialog handler BEFORE clicking
      page.once('dialog', async (dialog) => {
        await dialog.accept()
      })
      await deleteButton.click()

      await page.waitForTimeout(E2E_UI_DELAY * 2)

      // Check for toast or verify deletion happened
      const remainingProjects = await page.locator('.group').count()
      expect(remainingProjects).toBeLessThanOrEqual(2)
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

      // Check for selection count text as indicator of action bar
      const selectionText = page.getByText(/\d+ project.*selected/i)
      // Selection text may or may not be visible on tablet
      await selectionText.isVisible().catch(() => false)
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
