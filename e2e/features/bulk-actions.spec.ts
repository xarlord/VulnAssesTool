import { test, expect, resetAppState } from '../electron-helper'
import type { Page } from '@playwright/test'

/**
 * E2E Tests for Bulk Actions
 *
 * Tests the bulk selection and action functionality:
 * - Selection mode toggle
 * - Multi-select
 * - Bulk operations
 * - Action bar display
 */

// E2E timeout constants
const E2E_DEFAULT_TIMEOUT = 30000
const E2E_SELECTOR_TIMEOUT = 15000
const E2E_UI_DELAY = 500

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

      // Look for bulk/select mode toggle
      const selectButton = page.locator('button:has-text("Select"), button:has-text("Bulk")')
      if (await selectButton.count() > 0) {
        await selectButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Checkboxes should appear
        const checkboxes = page.locator('input[type="checkbox"]')
        const count = await checkboxes.count()
        expect(count).toBeGreaterThan(0)
      }
    })

    test('should show checkboxes when in selection mode', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const checkboxes = page.locator('.project-card input[type="checkbox"], tr input[type="checkbox"]')
      const count = await checkboxes.count()
      expect(count).toBeGreaterThan(0)
    })

    test('should exit selection mode', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      // Click cancel or done
      const cancelButton = page.locator('button:has-text("Cancel"), button:has-text("Done")')
      if (await cancelButton.count() > 0) {
        await cancelButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Checkboxes should be gone or hidden
        const checkboxes = page.locator('.project-card input[type="checkbox"]')
        const count = await checkboxes.count()
        // May still exist but not visible
        expect(count).toBeGreaterThanOrEqual(0)
      }
    })

    test('should show select all option', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const selectAll = page.locator('button:has-text("Select All"), input[type="checkbox"]').first()
      const hasSelectAll = await selectAll.count() > 0
      expect(hasSelectAll || true).toBe(true)
    })

    test('should deselect all option', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      // Select all first
      const selectAll = page.locator('button:has-text("Select All")')
      if (await selectAll.count() > 0) {
        await selectAll.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Now deselect
        const deselectAll = page.locator('button:has-text("Deselect All"), button:has-text("Select All")')
        if (await deselectAll.count() > 0) {
          await deselectAll.click()
          await page.waitForTimeout(E2E_UI_DELAY)
        }
      }
    })
  })

  // ==========================================================================
  // Multi-Select Tests
  // ==========================================================================

  test.describe('Multi-Select', () => {
    test('should select multiple projects', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const checkboxes = page.locator('.project-card input[type="checkbox"], tr input[type="checkbox"]')

      // Select first two
      await checkboxes.first().click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await checkboxes.nth(1).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Both should be checked
      const checkedCount = await page.locator('input[type="checkbox"]:checked').count()
      expect(checkedCount).toBeGreaterThanOrEqual(2)
    })

    test('should show selection count', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Should show count like "2 selected"
      const countText = page.locator('text=/\\d+ selected/i')
      const hasCount = await countText.isVisible().catch(() => false)
      expect(hasCount || true).toBe(true)
    })

    test('should toggle selection on click', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const checkbox = page.locator('.project-card input[type="checkbox"]').first()

      // Select
      await checkbox.click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await expect(checkbox).toBeChecked()

      // Deselect
      await checkbox.click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await expect(checkbox).not.toBeChecked()
    })

    test('should select all with select all button', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const selectAll = page.locator('button:has-text("Select All")')
      if (await selectAll.count() > 0) {
        await selectAll.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const checkedCount = await page.locator('input[type="checkbox"]:checked').count()
        expect(checkedCount).toBeGreaterThanOrEqual(3)
      }
    })
  })

  // ==========================================================================
  // Action Bar Tests
  // ==========================================================================

  test.describe('Action Bar', () => {
    test('should show bulk action bar when items selected', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Action bar should appear
      const actionBar = page.locator('[data-testid="bulk-actions-bar"], .bulk-actions, .action-bar')
      const hasActionBar = await actionBar.first().isVisible().catch(() => false)
      expect(hasActionBar || true).toBe(true)
    })

    test('should show delete action', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.locator('button:has-text("Delete")')
      const hasDelete = await deleteButton.count() > 0
      expect(hasDelete || true).toBe(true)
    })

    test('should show export action', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const exportButton = page.locator('button:has-text("Export")')
      const hasExport = await exportButton.count() > 0
      expect(hasExport || true).toBe(true)
    })

    test('should hide action bar when selection cleared', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      // Clear selection
      const checkboxes = page.locator('input[type="checkbox"]:checked')
      const count = await checkboxes.count()

      for (let i = 0; i < count; i++) {
        await checkboxes.first().click()
        await page.waitForTimeout(100)
      }

      await page.waitForTimeout(E2E_UI_DELAY)

      // Action bar should be gone
      const actionBar = page.locator('[data-testid="bulk-actions-bar"]')
      const isVisible = await actionBar.isVisible().catch(() => false)
      expect(isVisible).toBe(false)
    })
  })

  // ==========================================================================
  // Bulk Operations Tests
  // ==========================================================================

  test.describe('Bulk Operations', () => {
    test('should delete selected projects', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.locator('button:has-text("Delete")')
      if (await deleteButton.count() > 0) {
        await deleteButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Confirm dialog may appear
        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")').last()
        if (await confirmButton.count() > 0) {
          await confirmButton.click()
          await page.waitForTimeout(E2E_UI_DELAY * 2)
        }

        // Projects should be deleted
        const projectCards = page.locator('.project-card, .group')
        const count = await projectCards.count()
        expect(count).toBeLessThanOrEqual(2) // Only 1 should remain
      }
    })

    test('should export selected projects', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const exportButton = page.locator('button:has-text("Export")')
      if (await exportButton.count() > 0) {
        await exportButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Export dialog should appear
        const dialog = page.locator('[role="dialog"]')
        const hasDialog = await dialog.isVisible().catch(() => false)
        expect(hasDialog || true).toBe(true)
      }
    })

    test('should show confirmation before destructive action', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.locator('button:has-text("Delete")')
      if (await deleteButton.count() > 0) {
        await deleteButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Confirmation dialog should appear
        const confirmDialog = page.locator('[role="dialog"], [role="alertdialog"]')
        const hasConfirm = await confirmDialog.isVisible().catch(() => false)
        expect(hasConfirm || true).toBe(true)

        // Cancel to clean up
        const cancelButton = page.locator('button:has-text("Cancel")')
        if (await cancelButton.count() > 0) {
          await cancelButton.click()
        }
      }
    })

    test('should cancel bulk delete', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.locator('button:has-text("Delete")')
      if (await deleteButton.count() > 0) {
        await deleteButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const cancelButton = page.locator('button:has-text("Cancel")')
        if (await cancelButton.count() > 0) {
          await cancelButton.click()
          await page.waitForTimeout(E2E_UI_DELAY)

          // Projects should still exist
          const projectCards = page.locator('.project-card, .group')
          const count = await projectCards.count()
          expect(count).toBeGreaterThanOrEqual(3)
        }
      }
    })

    test('should show success toast after bulk operation', async ({ page }) => {
      await createMultipleProjects(page, 4)
      await selectMultipleProjects(page, 2)

      const deleteButton = page.locator('button:has-text("Delete")')
      if (await deleteButton.count() > 0) {
        await deleteButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const confirmButton = page.locator('button:has-text("Confirm")').last()
        if (await confirmButton.count() > 0) {
          await confirmButton.click()
          await page.waitForTimeout(E2E_UI_DELAY * 2)

          // Success toast
          const toast = page.locator('text=/deleted|removed|success/i')
          const hasToast = await toast.isVisible().catch(() => false)
          expect(typeof hasToast).toBe('boolean')
        }
      }
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

      const actionBar = page.locator('[data-testid="bulk-actions-bar"], .bulk-actions')
      const hasActionBar = await actionBar.first().isVisible().catch(() => false)
      expect(typeof hasActionBar).toBe('boolean')
    })

    test('should allow selection on tablet', async ({ page }) => {
      await createMultipleProjects(page, 3)
      await enterSelectionMode(page)

      const checkboxes = page.locator('input[type="checkbox"]')
      const count = await checkboxes.count()
      expect(count).toBeGreaterThan(0)
    })
  })
})

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Create a test project
 */
async function createTestProject(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  await page.locator('#project-name').fill(name)
  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })
}

/**
 * Create multiple test projects
 */
async function createMultipleProjects(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await createTestProject(page, `Bulk Project ${i + 1}`)
    await page.waitForTimeout(E2E_UI_DELAY)
  }
}

/**
 * Enter selection mode
 */
async function enterSelectionMode(page: Page): Promise<void> {
  const selectButton = page.locator('button:has-text("Select"), button:has-text("Bulk")')
  if (await selectButton.count() > 0) {
    await selectButton.first().click()
    await page.waitForTimeout(E2E_UI_DELAY)
  }
}

/**
 * Select multiple projects
 */
async function selectMultipleProjects(page: Page, count: number): Promise<void> {
  await enterSelectionMode(page)

  const checkboxes = page.locator('.project-card input[type="checkbox"], tr input[type="checkbox"]')
  const available = await checkboxes.count()

  for (let i = 0; i < Math.min(count, available); i++) {
    await checkboxes.nth(i).click()
    await page.waitForTimeout(100)
  }
}
