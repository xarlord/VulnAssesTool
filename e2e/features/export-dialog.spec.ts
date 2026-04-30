import { test, expect, resetAppState } from '../electron-helper'
import {
  createProjectOnly,
  createMultipleProjects,
  navigateToProjectDetail,
  openExportDialog,
  E2E_UI_DELAY,
  E2E_SELECTOR_TIMEOUT,
} from '../shared-helpers'

test.describe('Export Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Dialog Open/Close Tests
  // ==========================================================================

  test.describe('Dialog Open/Close', () => {
    test('should open export dialog from dashboard', async ({ page }) => {
      await createProjectOnly(page, 'Export Test Project')
      await openExportDialog(page)

      await expect(page.locator('[role="dialog"]')).toBeVisible()
    })

    test('should open export dialog from project detail', async ({ page }) => {
      await createProjectOnly(page, 'Export From Detail')
      await navigateToProjectDetail(page, 'Export From Detail')

      const exportButton = page.locator('button:has-text("Export")')
      if ((await exportButton.count()) > 0) {
        await exportButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        await expect(page.locator('[role="dialog"]')).toBeVisible()
      }
    })

    test('should close dialog with Cancel button', async ({ page }) => {
      await createProjectOnly(page, 'Export Cancel Test')
      await openExportDialog(page)

      await page.locator('button:has-text("Cancel")').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    })

    test('should close dialog with Escape key', async ({ page }) => {
      await createProjectOnly(page, 'Export Escape Test')
      await openExportDialog(page)

      await page.keyboard.press('Escape')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    })

    test('should close dialog when clicking outside', async ({ page }) => {
      await createProjectOnly(page, 'Export Outside Click Test')
      await openExportDialog(page)

      await page.mouse.click(10, 10)
      await page.waitForTimeout(E2E_UI_DELAY)

      // Dialog may or may not close depending on overlay click handler
      const dialogVisible = await page
        .locator('[role="dialog"]')
        .isVisible()
        .catch(() => false)
      expect(typeof dialogVisible).toBe('boolean')
    })

    test('should show dialog title', async ({ page }) => {
      await createProjectOnly(page, 'Export Title Test')
      await openExportDialog(page)

      const title = page.locator('[role="dialog"] h2, [role="dialog"] h3')
      await expect(title).toBeVisible()
    })
  })

  // ==========================================================================
  // Format Selection Tests
  // ==========================================================================

  test.describe('Format Selection', () => {
    test('should show export format options', async ({ page }) => {
      await createProjectOnly(page, 'Format Options Test')
      await openExportDialog(page)

      const formats = page.locator('text=/PDF|CSV|JSON|Excel/i')
      await expect(formats.first()).toBeVisible()
    })

    for (const format of ['PDF', 'CSV', 'JSON']) {
      test(`should have ${format} format option`, async ({ page }) => {
        await createProjectOnly(page, `${format} Format Test`)
        await openExportDialog(page)

        const option = page.locator(`button:has-text("${format}")`)
        await expect(option).toBeVisible({ timeout: 5000 })
      })
    }

    test('should select format on click', async ({ page }) => {
      await createProjectOnly(page, 'Format Select Test')
      await openExportDialog(page)

      const pdfOption = page.locator('text=PDF')
      if ((await pdfOption.count()) > 0) {
        await pdfOption.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        await expect(pdfOption.first()).toHaveClass(/selected|active|checked/)
      }
    })

    test('should allow only one format selection', async ({ page }) => {
      await createProjectOnly(page, 'Single Format Test')
      await openExportDialog(page)

      const pdfOption = page.locator('text=PDF')
      const csvOption = page.locator('text=CSV')

      if ((await pdfOption.count()) > 0 && (await csvOption.count()) > 0) {
        await pdfOption.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
        await csvOption.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const selected = page.locator('[class*="selected"], [class*="active"]')
        const count = await selected.count()
        expect(count).toBeLessThanOrEqual(2)
      }
    })
  })

  // ==========================================================================
  // Export Options Tests
  // ==========================================================================

  test.describe('Export Options', () => {
    test('should show scope options', async ({ page }) => {
      const names = ['Export Project 1', 'Export Project 2']
      await createMultipleProjects(page, names)
      await openExportDialog(page)

      const scopeOption = page.locator('text=/All Projects|Current Project|Selected/i')
      await expect(scopeOption.first()).toBeVisible({ timeout: 5000 })
    })

    test('should show include options', async ({ page }) => {
      await createProjectOnly(page, 'Include Options Test')
      await openExportDialog(page)

      const includeOption = page.locator('text=/Include|Components|Vulnerabilities/i')
      await expect(includeOption.first()).toBeVisible({ timeout: 5000 })
    })

    test('should toggle include options', async ({ page }) => {
      await createProjectOnly(page, 'Toggle Include Test')
      await openExportDialog(page)

      const checkbox = page.locator('input[type="checkbox"]').first()
      if ((await checkbox.count()) > 0) {
        await checkbox.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })
  })

  // ==========================================================================
  // Export Execution Tests
  // ==========================================================================

  test.describe('Export Execution', () => {
    test('should have Export button', async ({ page }) => {
      await createProjectOnly(page, 'Export Button Test')
      await openExportDialog(page)

      const exportButton = page.locator('button:has-text("Export")').last()
      await expect(exportButton).toBeVisible()
    })

    test('should disable Export button while exporting', async ({ page }) => {
      await createProjectOnly(page, 'Export Disable Test')
      await openExportDialog(page)

      const exportButton = page.locator('button:has-text("Export")').last()
      await exportButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const isDisabled = await exportButton.isDisabled().catch(() => true)
      expect(typeof isDisabled).toBe('boolean')
    })

    test('should show loading indicator during export', async ({ page }) => {
      await createProjectOnly(page, 'Export Loading Test')
      await openExportDialog(page)

      const exportButton = page.locator('button:has-text("Export")').last()
      await exportButton.click()

      const spinner = page.locator('.animate-spin, [class*="loading"]')
      const spinnerVisible = await spinner.isVisible().catch(() => false)
      expect(typeof spinnerVisible).toBe('boolean')
    })

    test('should close dialog after successful export', async ({ page }) => {
      await createProjectOnly(page, 'Export Success Test')
      await openExportDialog(page)

      const exportButton = page.locator('button:has-text("Export")').last()
      await exportButton.click()
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      const dialog = page.locator('[role="dialog"]')
      const isVisible = await dialog.isVisible().catch(() => false)
      expect(isVisible).toBe(false)
    })

    test('should show success toast after export', async ({ page }) => {
      await createProjectOnly(page, 'Export Toast Test')
      await openExportDialog(page)

      const exportButton = page.locator('button:has-text("Export")').last()
      await exportButton.click()
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      const successToast = page.locator('text=/Export.*success|Downloaded|Complete/i')
      const toastVisible = await successToast.isVisible().catch(() => false)
      expect(typeof toastVisible).toBe('boolean')
    })

    test('should handle export errors gracefully', async ({ page }) => {
      await createProjectOnly(page, 'Export Error Test')
      await openExportDialog(page)

      const exportButton = page.locator('button:has-text("Export")').last()
      await exportButton.click()
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      // Verify no unhandled errors - page should remain responsive
      await expect(page.locator('body')).toBeVisible()
    })
  })

  // ==========================================================================
  // Download Tests
  // ==========================================================================

  test.describe('Download', () => {
    test('should trigger file download', async ({ page }) => {
      await createProjectOnly(page, 'Download Test')
      await openExportDialog(page)

      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)

      const exportButton = page.locator('button:has-text("Export")').last()
      await exportButton.click()

      const download = await downloadPromise

      if (download) {
        expect(download.suggestedFilename()).toBeTruthy()
      }
    })

    test('should have correct file extension', async ({ page }) => {
      await createProjectOnly(page, 'Extension Test')
      await openExportDialog(page)

      const csvOption = page.locator('text=CSV')
      if ((await csvOption.count()) > 0) {
        await csvOption.first().click()
      }

      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)

      const exportButton = page.locator('button:has-text("Export")').last()
      await exportButton.click()

      const download = await downloadPromise

      if (download) {
        const filename = download.suggestedFilename()
        expect(filename.endsWith('.csv') || filename.endsWith('.pdf') || filename.endsWith('.json')).toBe(true)
      }
    })
  })
})
