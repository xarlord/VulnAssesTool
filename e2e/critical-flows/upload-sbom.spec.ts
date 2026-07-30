import { test, expect, resetAppState } from '../test-helper'

/**
 * E2E Tests for SBOM Upload Flow — content contracts
 *
 * Tests 1 and 2 already drive real UI deterministically (real project creation, real
 * navigation, a specific "Upload SBOM" button assertion) and are left unchanged. Test 3
 * previously contained a false-green fallback: after pressing Escape it did
 * `if (await dialog.isVisible().catch(() => false)) { click Close button }` and only then
 * asserted the dialog was closed — so the test passed whether or not Escape actually closed
 * the dialog (the Close-button fallback silently did the job instead). Escape-to-close is
 * Radix's built-in Dialog behavior, wired to the real close handler, so it is asserted
 * directly with no fallback. Grounding:
 *   - components/SbomUploadDialog.tsx:327 `<Dialog open={open} onOpenChange={(next) =>
 *     !next && handleClose()}>` — Escape triggers `onOpenChange(false)`, which calls the
 *     real `handleClose` (:86).
 *   - pages/project-detail/OverviewTab.tsx:107 "Upload SBOM" button (Overview is the
 *     project detail default tab).
 */
test.describe('SBOM Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('should create project and show Upload SBOM button', async ({ page }) => {
    // Create a project
    await page.getByRole('button', { name: 'New Project' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })

    // Fill in project name
    await page.locator('#project-name').fill('SBOM Test Project')
    await page.getByRole('button', { name: 'Create Project' }).click()

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })

    // Navigate to project details
    await page.locator('.group.rounded-lg.border').filter({ hasText: 'SBOM Test Project' }).first().click()

    // Wait for project detail page
    await expect(page.getByRole('heading', { name: /SBOM Test Project/i })).toBeVisible({ timeout: 10000 })

    // Verify Upload SBOM button exists
    await expect(page.getByRole('button', { name: /upload sbom/i })).toBeVisible()
  })

  test('should open upload dialog when clicking Upload SBOM', async ({ page }) => {
    // Create a project
    await page.getByRole('button', { name: 'New Project' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    await page.locator('#project-name').fill('Upload Dialog Test')
    await page.getByRole('button', { name: 'Create Project' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })

    // Navigate to project
    await page.locator('.group.rounded-lg.border').filter({ hasText: 'Upload Dialog Test' }).first().click()
    await expect(page.getByRole('heading', { name: /Upload Dialog Test/i })).toBeVisible({ timeout: 10000 })

    // Click Upload SBOM button
    await page.getByRole('button', { name: /upload sbom/i }).click()

    // Verify dialog opens (look for dialog or upload heading)
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  })

  test('should close upload dialog with Escape', async ({ page }) => {
    // Create project and navigate
    await page.getByRole('button', { name: 'New Project' }).click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    await page.locator('#project-name').fill('Cancel Upload Test')
    await page.getByRole('button', { name: 'Create Project' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })

    await page.locator('.group.rounded-lg.border').filter({ hasText: 'Cancel Upload Test' }).first().click()
    await expect(page.getByRole('heading', { name: /Cancel Upload Test/i })).toBeVisible({ timeout: 10000 })

    // Open upload dialog
    await page.getByRole('button', { name: /upload sbom/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Escape is Radix's built-in Dialog behavior (SbomUploadDialog.tsx:327
    // `onOpenChange={(next) => !next && handleClose()}`), so it is asserted directly —
    // no Close-button fallback that would mask a broken Escape handler.
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  })
})
