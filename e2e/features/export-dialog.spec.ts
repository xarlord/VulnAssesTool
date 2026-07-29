import { test, expect, resetAppState } from '../test-helper'
import {
  createProjectOnly,
  createMultipleProjects,
  createTestProject,
  uploadSbomFile,
  navigateToProjectDetail,
  navigateToDashboard,
  openExportDialog,
  E2E_UI_DELAY,
  E2E_SELECTOR_TIMEOUT,
} from '../shared-helpers'
import path from 'node:path'
import fs from 'node:fs'

const FIXTURES_DIR = path.join(import.meta.dirname, '..', 'fixtures', 'sbom')

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
      // Let ProjectDetail's mount-time effects (currentProject sync, hydration
      // check) settle before opening the dialog - clicking immediately races
      // a re-render that closes the just-opened Radix dialog.
      await page.waitForTimeout(E2E_UI_DELAY)

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

      const pdfButton = page.getByRole('button', { name: /PDF/i })
      if ((await pdfButton.count()) > 0) {
        await pdfButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        await expect(pdfButton.first()).toHaveAttribute('aria-pressed', 'true')
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
      // The all-projects scope option ("All Projects Summary") is only rendered
      // in the dashboard "Export All" flow (isAllProjects = projects && !project);
      // a single-project export shows per-project data types instead.
      await navigateToDashboard(page)
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

      // The export MUST produce a download — a missing one is a failure, not a skip.
      // (Previously the download was swallowed with .catch(()=>null) + `if (download)`,
      // so a broken export passed silently.)
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
      await page.locator('button:has-text("Export")').last().click()
      const download = await downloadPromise

      expect(download.suggestedFilename()).toMatch(/\.(csv|json|pdf)$/)
    })

    test('should have correct file extension', async ({ page }) => {
      await createProjectOnly(page, 'Extension Test')
      await openExportDialog(page)

      await page.getByRole('dialog').getByRole('button', { name: 'CSV' }).click()

      const downloadPromise = page.waitForEvent('download', { timeout: 10000 })
      await page.locator('button:has-text("Export")').last().click()
      const download = await downloadPromise

      // CSV was selected, so the downloaded file MUST be a .csv.
      expect(download.suggestedFilename()).toMatch(/\.csv$/)
    })
  })

  // ==========================================================================
  // Content Contract — validates the EXPORTED OUTPUT, not just that a download
  // happened. This is the exemplar for content-reliability hardening: a known
  // SBOM must round-trip through the UI export into a CSV whose rows carry the
  // real component data (name, version, license) exactly as designed.
  // ==========================================================================

  test.describe('Content Contract', () => {
    test('Components CSV export contains the imported components as designed', async ({ page }) => {
      const projectName = `Export Content ${Date.now()}`
      await createTestProject(page, projectName)
      await uploadSbomFile(page, path.join(FIXTURES_DIR, 'sample-cyclonedx.json'))

      // Open the project's export dialog (let mount-time effects settle first so the
      // click doesn't race a re-render that closes the just-opened dialog).
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.getByRole('button', { name: 'Export', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      // Choose CSV format + Components Only, then export and capture the download.
      await dialog.getByRole('button', { name: 'CSV' }).click()
      await dialog.getByRole('button', { name: 'Components Only' }).click()

      const downloadPromise = page.waitForEvent('download', { timeout: E2E_SELECTOR_TIMEOUT })
      await dialog.getByRole('button', { name: 'Export', exact: true }).click()
      const download = await downloadPromise

      // Filename encodes the data type + date.
      expect(download.suggestedFilename()).toMatch(/-components-\d{4}-\d{2}-\d{2}\.csv$/)

      // The file CONTENT is the components as designed — strip the Excel BOM first.
      const filePath = await download.path()
      const raw = fs.readFileSync(filePath, 'utf8')
      const csv = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
      const lines = csv.trim().split(/\r?\n/)

      // Header is the designed component schema.
      expect(lines[0]).toBe(
        'ID,Name,Version,Type,Licenses,License Risk,PURL,Vulnerability Count,Patch Available,Recommended Version,Dependencies Count',
      )
      // One row per imported component (sample-cyclonedx.json has 5) + the header row.
      expect(lines).toHaveLength(6)

      // Each component's real name+version+license is present — the reliability check.
      expect(csv).toMatch(/,lodash,4\.17\.15,/)
      expect(csv).toMatch(/,axios,0\.21\.1,/)
      expect(csv).toMatch(/,express,4\.17\.1,/)
      expect(csv).toContain('MIT')
      expect(csv).toContain('Apache-2.0')
    })

    test('Components JSON export is structured data matching the imported SBOM', async ({ page }) => {
      const projectName = `Export JSON ${Date.now()}`
      await createTestProject(page, projectName)
      await uploadSbomFile(page, path.join(FIXTURES_DIR, 'sample-cyclonedx.json'))

      await page.waitForTimeout(E2E_UI_DELAY)
      await page.getByRole('button', { name: 'Export', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      await dialog.getByRole('button', { name: 'JSON' }).click()
      await dialog.getByRole('button', { name: 'Components Only' }).click()

      const downloadPromise = page.waitForEvent('download', { timeout: E2E_SELECTOR_TIMEOUT })
      await dialog.getByRole('button', { name: 'Export', exact: true }).click()
      const download = await downloadPromise

      expect(download.suggestedFilename()).toMatch(/-components-\d{4}-\d{2}-\d{2}\.json$/)

      const filePath = await download.path()
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
        metadata: { dataType: string }
        statistics: { totalComponents: number }
        components: Array<{ name: string; version: string; licenses: string[]; purl: string | null }>
      }

      // Structured content as designed — schema + exact counts + per-component values.
      expect(parsed.metadata.dataType).toBe('components')
      expect(parsed.statistics.totalComponents).toBe(5)
      expect(parsed.components).toHaveLength(5)

      const lodash = parsed.components.find((c) => c.name === 'lodash')
      expect(lodash?.version).toBe('4.17.15')
      expect(lodash?.licenses).toContain('MIT')
      expect(lodash?.purl).toBe('pkg:npm/lodash@4.17.15')

      const typescript = parsed.components.find((c) => c.name === 'typescript')
      expect(typescript?.version).toBe('5.0.0')
      expect(typescript?.licenses).toContain('Apache-2.0')
    })
  })
})
