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

/**
 * Export Dialog — content contracts
 *
 * Hardens the vacuous `if (count > 0) { assert }` / `expect(typeof x).toBe('boolean')` /
 * unscoped-selector guards against the shipped ExportDialog. Grounding:
 *   - components/ExportDialog.tsx — DialogTitle "Export Data"; three format buttons (CSV/JSON/PDF,
 *     no "Excel") with `aria-pressed={selectedFormat === format.value}`; for a single project, three
 *     mutually-exclusive data-type buttons ("Full Project Report" / "Vulnerabilities Only" /
 *     "Components Only") under a "Data Type" label — not checkboxes — defaulting to "Vulnerabilities
 *     Only" selected; no spinner or toast anywhere in the file. The only "exporting" indicator is the
 *     Export button's text flipping to "Exporting..." while `disabled={isExporting}`, and the dialog
 *     closes itself (`onClose()`) the instant the export call returns, so that state has no stable
 *     window to observe end-to-end without mocking the export module.
 *   - components/ui/dialog.tsx — DialogOverlay is `fixed inset-0 z-50` with no onPointerDownOutside
 *     override, so Radix's default "click outside closes" behavior applies.
 *   - pages/Dashboard.tsx — the Dashboard's ExportDialog is ALWAYS opened with `projects` and never
 *     `project` (both the "Export All" button and the bulk-selection "Export" button), so
 *     `isAllProjects` is always true there and the dialog's only data-type option is "All Projects
 *     Summary". The single-project data-type buttons only exist behind Project Detail's "Export"
 *     button (which passes `project`), so tests targeting those buttons must open the dialog from
 *     Project Detail, not via the Dashboard/openExportDialog helper.
 *
 * Tests that would require breaking/mocking the export module to observe a transient state (the
 * disabled/"Exporting..." window, a forced export error, a non-existent toast) are skipped with a
 * reason instead of asserting something fake.
 */

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

      // The project detail header always has an "Export" button - no guard needed.
      await page.getByRole('button', { name: 'Export', exact: true }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
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

      // DialogOverlay is `fixed inset-0 z-50` (components/ui/dialog.tsx) with no
      // onPointerDownOutside override, so Radix's default outside-click-closes behavior applies.
      await page.mouse.click(10, 10)
      await expect(page.getByRole('dialog')).not.toBeVisible()
    })

    test('should show dialog title', async ({ page }) => {
      await createProjectOnly(page, 'Export Title Test')
      await openExportDialog(page)

      // Scoped to the dialog - createProjectOnly leaves an unrelated <h3> project card on the
      // dashboard, which an unscoped heading selector would match regardless of this title.
      await expect(page.getByRole('dialog').getByText('Export Data')).toBeVisible()
    })
  })

  // ==========================================================================
  // Format Selection Tests
  // ==========================================================================

  test.describe('Format Selection', () => {
    test('should show export format options', async ({ page }) => {
      await createProjectOnly(page, 'Format Options Test')
      await openExportDialog(page)

      // The exact three formats ExportDialog.tsx renders - no "Excel" exists.
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('button', { name: 'CSV' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'JSON' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'PDF' })).toBeVisible()
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

      // The PDF format button always exists - no guard needed.
      const pdfButton = page.getByRole('dialog').getByRole('button', { name: 'PDF' })
      await pdfButton.click()

      await expect(pdfButton).toHaveAttribute('aria-pressed', 'true')
    })

    test('should allow only one format selection', async ({ page }) => {
      await createProjectOnly(page, 'Single Format Test')
      await openExportDialog(page)

      // aria-pressed mirrors the single-value selectedFormat state (ExportDialog.tsx), so
      // selecting one format must deselect whichever one was previously selected.
      const dialog = page.getByRole('dialog')
      const pdfButton = dialog.getByRole('button', { name: 'PDF' })
      const csvButton = dialog.getByRole('button', { name: 'CSV' })

      await pdfButton.click()
      await expect(pdfButton).toHaveAttribute('aria-pressed', 'true')
      await expect(csvButton).toHaveAttribute('aria-pressed', 'false')

      await csvButton.click()
      await expect(csvButton).toHaveAttribute('aria-pressed', 'true')
      await expect(pdfButton).toHaveAttribute('aria-pressed', 'false')
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

    test('should show data type options', async ({ page }) => {
      await createTestProject(page, 'Data Type Options Test')
      // The single-project data-type buttons only render when ExportDialog gets a `project` prop.
      // The Dashboard's dialog (openExportDialog) always passes `projects` instead (isAllProjects
      // = true — see pages/Dashboard.tsx's ExportDialog usage), so this must be opened via Project
      // Detail's "Export" button, same as the "should open export dialog from project detail" test.
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.getByRole('button', { name: 'Export', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      // ExportDialog has no "Include" toggles - a single-project export offers three
      // mutually-exclusive data-type buttons under the "Data Type" label.
      await expect(dialog.getByRole('button', { name: 'Full Project Report' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Vulnerabilities Only' })).toBeVisible()
      await expect(dialog.getByRole('button', { name: 'Components Only' })).toBeVisible()
    })

    test('should switch data type selection on click', async ({ page }) => {
      await createTestProject(page, 'Toggle Data Type Test')
      // Same as above: the single-value/aria-pressed data-type buttons require the project-detail
      // "Export" button (project prop) - the Dashboard's dialog only ever offers "All Projects
      // Summary" (isAllProjects = true, see pages/Dashboard.tsx).
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.getByRole('button', { name: 'Export', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      // No checkbox exists in ExportDialog.tsx - data-type selection is single-value with
      // aria-pressed mirroring state, defaulting to "Vulnerabilities Only".
      const vulnButton = dialog.getByRole('button', { name: 'Vulnerabilities Only' })
      const componentsButton = dialog.getByRole('button', { name: 'Components Only' })

      await expect(vulnButton).toHaveAttribute('aria-pressed', 'true')

      await componentsButton.click()
      await expect(componentsButton).toHaveAttribute('aria-pressed', 'true')
      await expect(vulnButton).toHaveAttribute('aria-pressed', 'false')
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

    test.skip('should disable Export button while exporting', async () => {
      // isExporting flips synchronously on click, but ExportDialog calls onClose() the instant
      // the export call resolves (ExportDialog.tsx), so there is no stable window to observe
      // `disabled` end-to-end without mocking the export module (see ExportDialog.test.tsx's
      // controlled-promise mock, which the E2E layer has no equivalent for).
    })

    test.skip('should show loading indicator during export', async () => {
      // ExportDialog has no spinner/loading element - the only "exporting" indicator is the
      // Export button's text flipping to "Exporting...", which has the same unobservable
      // transient window as the disabled-button skip above.
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

    test.skip('should show success toast after export', async () => {
      // No toast is wired to export: ExportDialog.tsx's handleExport only calls onClose() on
      // success - there is no toast.success/Toaster call anywhere in the file.
    })

    test.skip('should handle export errors gracefully', async () => {
      // Forcing handleExport's catch branch requires breaking the dynamic import of the export
      // module or corrupting project data - not reachable through UI interaction in this
      // offline, unmocked suite.
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
