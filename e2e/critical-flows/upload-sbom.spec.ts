import { test, expect, resetAppState } from '../electron-helper'

/**
 * E2E Tests for SBOM Upload Flow
 *
 * Tests the complete user flow for uploading SBOM files
 */
test.describe('SBOM Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
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
    await expect(page.locator('[role="dialog"], .fixed.z-50').first()).toBeVisible({ timeout: 5000 })
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
    await expect(page.locator('[role="dialog"], .fixed.z-50').first()).toBeVisible({ timeout: 5000 })

    // Close with Escape - may need multiple attempts
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Try again if still visible
    if (
      await page
        .locator('[role="dialog"], .fixed.z-50')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }

    // Third attempt
    if (
      await page
        .locator('[role="dialog"], .fixed.z-50')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(1000)
    }

    // Dialog should be closed
    await expect(page.locator('[role="dialog"], .fixed.z-50').first()).not.toBeVisible({ timeout: 5000 })
  })
})
