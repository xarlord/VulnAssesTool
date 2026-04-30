import { test, expect, resetAppState } from '../electron-helper'

/**
 * E2E Tests for Create New Project Flow
 *
 * Tests the complete user flow for creating a new project:
 * 1. Wait for Electron app to launch and React to render
 * 2. Click "New Project" button
 * 3. Fill in project details (name, description)
 * 4. Submit the form
 * 5. Verify project appears on dashboard
 */
test.describe('Create New Project Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Reset app state to ensure clean slate for each test
    await resetAppState(page)

    // Wait for the Electron app to load and React to render
    // In Electron, the app loads automatically - we just need to wait for it to be ready
    await page.waitForLoadState('domcontentloaded', { timeout: 10000 })
    // Wait for the dashboard to be visible (React app has rendered)
    // The "New Project" button is always visible when the dashboard is loaded
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  /**
   * Helper function to open the create project dialog and wait for it to be ready
   */
  async function openCreateProjectDialog(page: import('@playwright/test').Page) {
    // Click the "New Project" button
    await page.getByRole('button', { name: 'New Project' }).click()

    // Wait for dialog to appear with proper timeout
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('heading', { name: 'Create New Project' })).toBeVisible({ timeout: 5000 })

    // Wait for the form to be interactive (input focused due to autoFocus)
    await expect(page.locator('#project-name')).toBeVisible({ timeout: 3000 })
  }

  test('should create a new project with valid data', async ({ page }) => {
    await openCreateProjectDialog(page)

    // Fill in project name using the specific ID selector
    await page.locator('#project-name').fill('E2E Test Project')

    // Fill in project description using the specific ID selector
    await page.locator('#project-description').fill('Project created during E2E testing')

    // Submit the form
    await page.getByRole('button', { name: 'Create Project' }).click()

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('heading', { name: 'Create New Project' })).not.toBeVisible({ timeout: 5000 })

    // Verify project appears on dashboard
    await expect(page.getByText('E2E Test Project')).toBeVisible({ timeout: 5000 })
  })

  test('should show validation errors for empty project name', async ({ page }) => {
    await openCreateProjectDialog(page)

    // Clear any default value and submit without filling in the name
    await page.locator('#project-name').clear()
    await page.getByRole('button', { name: 'Create Project' }).click()

    // Verify validation error - component shows "Project name is required" for empty field
    await expect(page.getByText(/project name is required/i)).toBeVisible({ timeout: 3000 })
  })

  test('should show validation error for short project name', async ({ page }) => {
    await openCreateProjectDialog(page)

    // Fill in a name that is too short (less than 3 characters)
    await page.locator('#project-name').fill('AB')
    await page.getByRole('button', { name: 'Create Project' }).click()

    // Verify validation error for short name
    await expect(page.getByText(/project name must be at least 3 characters/i)).toBeVisible({ timeout: 3000 })
  })

  test('should cancel project creation with Escape', async ({ page }) => {
    await openCreateProjectDialog(page)

    // Verify dialog is open before pressing Escape
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })

    // Press Escape to close - retry once if it doesn't work
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    if (
      await page
        .getByRole('dialog')
        .isVisible()
        .catch(() => false)
    ) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }

    // Verify dialog is closed
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  })

  test('should cancel project creation via Cancel button', async ({ page }) => {
    await openCreateProjectDialog(page)

    // Click the Cancel button
    await page.getByRole('button', { name: 'Cancel' }).click()

    // Verify dialog is closed
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  })

  test('should handle project name with special characters', async ({ page }) => {
    await openCreateProjectDialog(page)

    // Fill in project name with special characters
    const specialName = 'Test Project (2024) - [E2E]'
    await page.locator('#project-name').fill(specialName)

    // Submit the form
    await page.getByRole('button', { name: 'Create Project' }).click()

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })

    // Verify project appears with special characters
    await expect(page.getByText(specialName)).toBeVisible({ timeout: 5000 })
  })

  test('should create project with only name (description optional)', async ({ page }) => {
    await openCreateProjectDialog(page)

    // Fill in only the project name
    await page.locator('#project-name').fill('Minimal Project')

    // Submit the form
    await page.getByRole('button', { name: 'Create Project' }).click()

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })

    // Verify project is created
    await expect(page.getByText('Minimal Project')).toBeVisible({ timeout: 5000 })
  })
})
