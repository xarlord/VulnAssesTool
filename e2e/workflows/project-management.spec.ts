import { test, expect, resetAppState } from '../test-helper'
import type { Page } from '@playwright/test'
import {
  createProjectOnly,
  navigateToProjectDetail,
  navigateToDashboard,
  navigateToSettingsPage,
  E2E_UI_DELAY,
} from '../shared-helpers'

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

      // Submit with an empty name — the dialog surfaces its exact validation error.
      await page.locator('#project-name').clear()
      await page.getByRole('button', { name: 'Create Project' }).click()

      await expect(page.getByText('Project name is required')).toBeVisible()
      // Submission was rejected, so the dialog stays open.
      await expect(page.getByRole('dialog')).toBeVisible()
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
        await createProjectOnly(page, `Multi Project ${i}`)
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
      await createProjectOnly(page, projectName)

      await navigateToProjectDetail(page, projectName)

      await expect(page.getByRole('heading', { name: new RegExp(projectName, 'i') })).toBeVisible()
    })

    test('should navigate back to dashboard', async ({ page }) => {
      const projectName = 'Back Nav Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // Go back to dashboard
      await navigateToDashboard(page)

      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
    })

    test('should navigate between projects', async ({ page }) => {
      await createProjectOnly(page, 'Project Alpha')
      await createProjectOnly(page, 'Project Beta')

      // Navigate to first project
      await navigateToProjectDetail(page, 'Project Alpha')
      await expect(page.getByRole('heading', { name: /Project Alpha/i })).toBeVisible()

      // Go back and navigate to second
      await navigateToDashboard(page)
      await navigateToProjectDetail(page, 'Project Beta')
      await expect(page.getByRole('heading', { name: /Project Beta/i })).toBeVisible()
    })

    test('should use browser navigation', async ({ page }) => {
      const projectName = 'Browser Nav Test'
      await createProjectOnly(page, projectName)
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
    test('should open the edit dialog prefilled with the project name', async ({ page }) => {
      const projectName = 'Settings Test Project'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // The header "Edit" button opens EditProjectDialog, seeded with the current name.
      await page.getByRole('button', { name: 'Edit', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Edit Project' })).toBeVisible()
      await expect(page.locator('#edit-name')).toHaveValue(projectName)
    })

    test('should show zeroed overview statistics for a fresh project', async ({ page }) => {
      const projectName = 'Stats Test Project'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // No SBOM/scan yet ⇒ every OverviewTab stat is exactly 0.
      const grid = page.locator('#main-content div[class*="grid-cols-4"]').first()
      for (const label of ['Components', 'Critical', 'High', 'Total Vulns']) {
        const card = grid.locator('div.bg-card').filter({ hasText: label })
        await expect(card.locator('div.text-3xl')).toHaveText('0')
      }
    })

    test('should open the dependency graph via the project sidebar nav', async ({ page }) => {
      const projectName = 'Graph Access Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      // Dependency Graph is a contextual project link in the shell sidebar.
      await page.getByRole('link', { name: 'Dependency Graph' }).click()
      await expect(page).toHaveURL(/\/project\/[^/]+\/graph$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Dependency Graph' })).toBeVisible()
    })

    test('should open the false-positive filter from the project header', async ({ page }) => {
      const projectName = 'FPF Access Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('button', { name: 'False Positive Filter' }).click()
      await expect(page).toHaveURL(/\/project\/[^/]+\/fpf$/)
      await expect(page.getByRole('heading', { level: 1, name: 'False Positive Filter' })).toBeVisible()
    })
  })

  // ==========================================================================
  // Project Deletion Workflow
  // ==========================================================================

  test.describe('Project Deletion', () => {
    test('should show the delete confirmation with the project name', async ({ page }) => {
      const projectName = 'Delete Confirm Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Delete project')).toBeVisible()
      await expect(
        dialog.getByText(`Are you sure you want to delete "${projectName}"? This cannot be undone.`),
      ).toBeVisible()
    })

    test('should keep the project when deletion is cancelled', async ({ page }) => {
      const projectName = 'Cancel Delete Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Delete project')).toBeVisible()
      await dialog.getByRole('button', { name: 'Cancel' }).click()
      await expect(dialog).not.toBeVisible()

      // The project survives on the dashboard.
      await navigateToDashboard(page)
      await expect(page.getByText(projectName)).toBeVisible()
    })

    test('should delete the project after confirmation', async ({ page }) => {
      const projectName = 'Delete Me Project'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      // The confirm button inside the dialog is also labelled "Delete".
      await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click()

      // handleConfirmDelete removes the project and navigates to /dashboard.
      await expect(page).toHaveURL(/\/dashboard$/)
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
      await expect(page.getByText(projectName)).not.toBeVisible()
    })
  })

  // ==========================================================================
  // Dashboard Workflow Tests
  // ==========================================================================

  test.describe('Dashboard Workflow', () => {
    test('should display project list', async ({ page }) => {
      await createProjectOnly(page, 'List Test 1')
      await createProjectOnly(page, 'List Test 2')

      // Both should be in list
      await expect(page.getByText('List Test 1')).toBeVisible()
      await expect(page.getByText('List Test 2')).toBeVisible()
    })

    test('should show aggregate statistics', async ({ page }) => {
      await createProjectOnly(page, 'Stats Project')

      // One project, no scans ⇒ Projects=1, all severity tallies 0.
      const grid = page.locator('div[class*="grid-cols-4"]').first()
      const statValue = (label: string) => grid.locator('div.p-6').filter({ hasText: label }).locator('p.text-3xl')
      await expect(statValue('Projects')).toHaveText('1')
      await expect(statValue('Critical')).toHaveText('0')
      await expect(statValue('High')).toHaveText('0')
      await expect(statValue('Total Vulnerabilities')).toHaveText('0')
    })

    test('should show quick actions', async ({ page }) => {
      // Look for quick action buttons
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()

      const uploadButton = page.locator('button:has-text("Upload")')
      // Upload button is optional - may not appear on all dashboards
      await uploadButton
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should refresh dashboard', async ({ page }) => {
      await createProjectOnly(page, 'Refresh Test')

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
      await navigateToSettingsPage(page)
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
    })

    test('should switch the theme via the shell theme menu', async ({ page }) => {
      await navigateToSettingsPage(page)
      const openMenu = () => page.getByRole('button', { name: 'Change theme' }).click()

      // Theme lives in the shell TopBar (aria-label "Change theme"); it is a Radix radio group.
      // Exercise both directions so the assertion cannot pass on the default theme alone.
      await openMenu()
      await page.getByRole('menuitemradio', { name: 'Light' }).click()
      await openMenu()
      await expect(page.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'false')

      await page.getByRole('menuitemradio', { name: 'Dark' }).click()
      await openMenu()
      await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false')
    })
  })
})
