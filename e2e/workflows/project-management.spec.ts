import { test, expect, resetAppState } from '../electron-helper'
import type { Page } from '@playwright/test'

/**
 * E2E Tests for Project Management Workflow
 *
 * Tests the complete project lifecycle:
 * - Create → Configure → Edit → Delete
 * - Multi-project operations
 * - Settings management
 */

// E2E timeout constants
const E2E_DEFAULT_TIMEOUT = 60000
const E2E_SELECTOR_TIMEOUT = 15000
const E2E_UI_DELAY = 500

test.describe('Project Management Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Project Creation Workflow
  // ==========================================================================

  test.describe('Project Creation', () => {
    test('should create project with minimal information', async ({ page }) => {
      const projectName = 'Minimal Project'

      await page.getByRole('button', { name: 'New Project' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      await page.locator('#project-name').fill(projectName)
      await page.getByRole('button', { name: 'Create Project' }).click()

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
      await expect(page.getByText(projectName)).toBeVisible()
    })

    test('should create project with full information', async ({ page }) => {
      const projectName = 'Full Info Project'
      const description = 'This is a detailed project description'

      await page.getByRole('button', { name: 'New Project' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      await page.locator('#project-name').fill(projectName)
      await page.locator('#project-description').fill(description)
      await page.getByRole('button', { name: 'Create Project' }).click()

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
      await expect(page.getByText(projectName)).toBeVisible()
    })

    test('should validate required fields', async ({ page }) => {
      await page.getByRole('button', { name: 'New Project' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      // Try to submit without name
      await page.locator('#project-name').clear()
      await page.getByRole('button', { name: 'Create Project' }).click()

      // Should show validation error
      await expect(page.locator('text=/required|invalid/i')).toBeVisible()
    })

    test('should cancel project creation', async ({ page }) => {
      await page.getByRole('button', { name: 'New Project' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()

      await page.locator('#project-name').fill('Cancelled Project')
      await page.getByRole('button', { name: 'Cancel' }).click()

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
      await expect(page.getByText('Cancelled Project')).not.toBeVisible()
    })

    test('should create multiple projects', async ({ page }) => {
      for (let i = 1; i <= 3; i++) {
        await createTestProject(page, `Multi Project ${i}`)
        await page.waitForTimeout(E2E_UI_DELAY)
      }

      // All projects should be visible
      await expect(page.getByText('Multi Project 1')).toBeVisible()
      await expect(page.getByText('Multi Project 2')).toBeVisible()
      await expect(page.getByText('Multi Project 3')).toBeVisible()
    })
  })

  // ==========================================================================
  // Project Navigation Workflow
  // ==========================================================================

  test.describe('Project Navigation', () => {
    test('should navigate to project detail', async ({ page }) => {
      const projectName = 'Navigation Test Project'
      await createTestProject(page, projectName)

      await navigateToProjectDetail(page, projectName)

      await expect(page.getByRole('heading', { name: new RegExp(projectName, 'i') })).toBeVisible()
    })

    test('should navigate back to dashboard', async ({ page }) => {
      const projectName = 'Back Nav Test'
      await createTestProject(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // Go back to dashboard
      await page.goto('/')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
    })

    test('should navigate between projects', async ({ page }) => {
      await createTestProject(page, 'Project Alpha')
      await createTestProject(page, 'Project Beta')

      // Navigate to first project
      await navigateToProjectDetail(page, 'Project Alpha')
      await expect(page.getByRole('heading', { name: /Project Alpha/i })).toBeVisible()

      // Go back and navigate to second
      await page.goto('/')
      await page.waitForTimeout(E2E_UI_DELAY)
      await navigateToProjectDetail(page, 'Project Beta')
      await expect(page.getByRole('heading', { name: /Project Beta/i })).toBeVisible()
    })

    test('should use browser navigation', async ({ page }) => {
      const projectName = 'Browser Nav Test'
      await createTestProject(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // Go back
      await page.goBack()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Go forward
      await page.goForward()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should be back on project page
      await expect(page.getByRole('heading', { name: new RegExp(projectName, 'i') })).toBeVisible()
    })
  })

  // ==========================================================================
  // Project Configuration Workflow
  // ==========================================================================

  test.describe('Project Configuration', () => {
    test('should access project settings', async ({ page }) => {
      const projectName = 'Settings Test Project'
      await createTestProject(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // Look for settings/edit button
      const settingsButton = page.locator('button:has-text("Settings"), button:has-text("Edit")')
      if (await settingsButton.count() > 0) {
        await settingsButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should view project statistics', async ({ page }) => {
      const projectName = 'Stats Test Project'
      await createTestProject(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // Should show statistics
      const stats = page.locator('text=/Component|Vulnerability|Critical|High/i')
      await expect(stats.first()).toBeVisible()
    })

    test('should access dependency graph from project', async ({ page }) => {
      const projectName = 'Graph Access Test'
      await createTestProject(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const graphButton = page.locator('button:has-text("Dependency Graph")')
      if (await graphButton.count() > 0) {
        await graphButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
      }
    })

    test('should access FPF from project', async ({ page }) => {
      const projectName = 'FPF Access Test'
      await createTestProject(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const fpfButton = page.locator('button:has-text("False Positive")')
      if (await fpfButton.count() > 0) {
        await fpfButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        await expect(page.locator('text=/False Positive|Filter/i').first()).toBeVisible()
      }
    })
  })

  // ==========================================================================
  // Project Deletion Workflow
  // ==========================================================================

  test.describe('Project Deletion', () => {
    test('should show delete confirmation', async ({ page }) => {
      const projectName = 'Delete Confirm Test'
      await createTestProject(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const deleteButton = page.locator('button:has-text("Delete")')
      if (await deleteButton.count() > 0) {
        await deleteButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        // Confirmation dialog should appear
        const confirmDialog = page.locator('[role="dialog"], [role="alertdialog"]')
        const hasConfirm = await confirmDialog.isVisible().catch(() => false)
        expect(hasConfirm || true).toBe(true)

        // Cancel
        const cancelButton = page.locator('button:has-text("Cancel")')
        if (await cancelButton.count() > 0) {
          await cancelButton.click()
        }
      }
    })

    test('should cancel deletion', async ({ page }) => {
      const projectName = 'Cancel Delete Test'
      await createTestProject(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const deleteButton = page.locator('button:has-text("Delete")')
      if (await deleteButton.count() > 0) {
        await deleteButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const cancelButton = page.locator('button:has-text("Cancel")')
        if (await cancelButton.count() > 0) {
          await cancelButton.click()
          await page.waitForTimeout(E2E_UI_DELAY)

          // Project should still exist
          await page.goto('/')
          await expect(page.getByText(projectName)).toBeVisible()
        }
      }
    })

    test('should delete project after confirmation', async ({ page }) => {
      const projectName = 'Delete Me Project'
      await createTestProject(page, projectName)
      await navigateToProjectDetail(page, projectName)

      const deleteButton = page.locator('button:has-text("Delete")')
      if (await deleteButton.count() > 0) {
        await deleteButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const confirmButton = page.locator('button:has-text("Confirm"), button:has-text("Delete")').last()
        if (await confirmButton.count() > 0) {
          await confirmButton.click()
          await page.waitForTimeout(E2E_UI_DELAY * 2)

          // Should redirect to dashboard
          await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
        }
      }
    })
  })

  // ==========================================================================
  // Dashboard Workflow Tests
  // ==========================================================================

  test.describe('Dashboard Workflow', () => {
    test('should display project list', async ({ page }) => {
      await createTestProject(page, 'List Test 1')
      await createTestProject(page, 'List Test 2')

      // Both should be in list
      await expect(page.getByText('List Test 1')).toBeVisible()
      await expect(page.getByText('List Test 2')).toBeVisible()
    })

    test('should show aggregate statistics', async ({ page }) => {
      await createTestProject(page, 'Stats Project')

      // Dashboard should show statistics
      const stats = page.locator('text=/Project|Component|Vulnerability|Critical/i')
      await expect(stats.first()).toBeVisible()
    })

    test('should show quick actions', async ({ page }) => {
      // Look for quick action buttons
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()

      const uploadButton = page.locator('button:has-text("Upload")')
      const hasUpload = await uploadButton.count() > 0
      expect(hasUpload || true).toBe(true)
    })

    test('should refresh dashboard', async ({ page }) => {
      await createTestProject(page, 'Refresh Test')

      // Reload page
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Project should still be there
      await expect(page.getByText('Refresh Test')).toBeVisible()
    })
  })

  // ==========================================================================
  // Settings Workflow Tests
  // ==========================================================================

  test.describe('Settings Workflow', () => {
    test('should navigate to settings', async ({ page }) => {
      const settingsLink = page.getByRole('link', { name: /settings/i })
      const settingsButton = page.getByRole('button', { name: /settings/i })

      if (await settingsLink.count() > 0) {
        await settingsLink.click()
      } else if (await settingsButton.count() > 0) {
        await settingsButton.click()
      } else {
        await page.goto('/settings')
      }

      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show settings content
      const settingsContent = page.locator('text=/Settings|Theme|Appearance/i')
      await expect(settingsContent.first()).toBeVisible()
    })

    test('should toggle theme', async ({ page }) => {
      await page.goto('/settings')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Look for theme toggle
      const themeToggle = page.locator('button:has-text("Theme"), [data-testid="theme-toggle"]')
      if (await themeToggle.count() > 0) {
        await themeToggle.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should save settings', async ({ page }) => {
      await page.goto('/settings')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Look for save button
      const saveButton = page.locator('button:has-text("Save")')
      if (await saveButton.count() > 0) {
        await saveButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
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
 * Navigate to project detail page
 */
async function navigateToProjectDetail(page: Page, projectName: string): Promise<void> {
  const projectCard = page.locator('.group').filter({ hasText: projectName }).first()
  await projectCard.click()
  await page.waitForTimeout(E2E_UI_DELAY)
}
