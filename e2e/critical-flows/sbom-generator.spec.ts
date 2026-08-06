import { test, expect, resetAppState } from '../test-helper'

/**
 * SBOM Generator (Excel -> CycloneDX) Dialog — content contracts
 *
 * The previous version of this spec assumed the generator lived on the Settings page and
 * groped for it via an `openSbomGenerator()` helper that tried four guessed selectors
 * ('Generate SBOM', 'SBOM Generator', '[data-testid="sbom-generator-button"]', 'Excel')
 * wrapped in `if (opened) {...} else {...}` no-op branches. None of those selectors ever
 * matched real markup, so every assertion behind them was dead code — the suite was
 * permanently green regardless of the feature's actual state. That helper and the
 * settings-navigation premise have been removed entirely.
 *
 * Grounding for the rewrite (all verified against source):
 *   - pages/Dashboard.tsx:250-254 — the real trigger is a Dashboard action button named
 *     "Generate SBOM from Excel" (not anything in Settings). Unlike the neighboring
 *     "Import SBOM" / "Export All" buttons, it has no `disabled` prop, so it is clickable
 *     with zero projects.
 *   - components/SbomGeneratorDialog.tsx:489 `<Dialog open={open} onOpenChange={(next) =>
 *     !next && handleClose()}>` — a Radix dialog (role=dialog); Escape triggers the real
 *     `handleClose` (:93), not a synthetic no-op.
 *   - SbomGeneratorDialog.tsx:497-498 — DialogTitle "Generate SBOM from Excel",
 *     DialogDescription "Upload an Excel file to generate a CycloneDX SBOM".
 *   - SbomGeneratorDialog.tsx:505-553 — the idle-state step indicator renders exactly six
 *     labels, unconditionally, in this order: Upload, Map Columns, Preview, CPEs, Generate,
 *     Download.
 *   - SbomGeneratorDialog.tsx:556-609 — idle drop-zone copy "Click to upload or drag and
 *     drop" / "Excel files (.xlsx, .xls)", a hidden `<input type="file" accept=".xlsx,.xls">`,
 *     a "Required Excel Columns:" block naming `name` and `version`, and an
 *     "Optional Columns:" block.
 *
 * The upload -> column-mapping -> preview -> CPE-selection -> generate -> "SBOM Generated
 * Successfully!" flow is real and fully client-side (parseExcel/generateCycloneDX — no Syft,
 * no network) but requires driving a real binary .xlsx file through Playwright's file
 * chooser, which is out of scope here. It is honestly skipped below rather than faked.
 */
test.describe('SBOM Generator Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('should open the SBOM generator dialog from the Dashboard button', async ({ page }) => {
    await page.getByRole('button', { name: 'Generate SBOM from Excel' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByRole('heading', { name: 'Generate SBOM from Excel' })).toBeVisible()
    await expect(dialog.getByText('Upload an Excel file to generate a CycloneDX SBOM')).toBeVisible()
  })

  test('should display the six-step indicator in order', async ({ page }) => {
    await page.getByRole('button', { name: 'Generate SBOM from Excel' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // SbomGeneratorDialog.tsx:505-553: the step-indicator container (`div.mb-6`) renders one
    // <span> label per step, unconditionally, regardless of which step is active.
    const stepLabels = dialog.locator('div.mb-6 span')
    await expect(stepLabels).toHaveText(['Upload', 'Map Columns', 'Preview', 'CPEs', 'Generate', 'Download'])
  })

  test('should show the idle upload zone with Excel-only guidance', async ({ page }) => {
    await page.getByRole('button', { name: 'Generate SBOM from Excel' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await expect(dialog.getByText('Click to upload or drag and drop')).toBeVisible()
    await expect(dialog.getByText('Excel files (.xlsx, .xls)')).toBeVisible()
    await expect(dialog.getByText('Required Excel Columns:')).toBeVisible()
    await expect(dialog.getByText('name', { exact: true })).toBeVisible()
    await expect(dialog.getByText('version', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Optional Columns:')).toBeVisible()

    const fileInput = dialog.locator('input[type="file"]')
    await expect(fileInput).toHaveAttribute('accept', '.xlsx,.xls')
  })

  test('should close the dialog with Escape', async ({ page }) => {
    await page.getByRole('button', { name: 'Generate SBOM from Excel' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Escape is Radix's built-in Dialog behavior (SbomGeneratorDialog.tsx:489
    // `onOpenChange={(next) => !next && handleClose()}`), asserted directly with no fallback.
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  })

  test.skip('should complete the upload -> mapping -> preview -> generate -> download flow', async () => {
    // requires a binary .xlsx fixture + real upload; not asserted here
  })
})
