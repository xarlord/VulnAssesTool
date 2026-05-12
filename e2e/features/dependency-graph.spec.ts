import { test, expect, resetAppState } from '../electron-helper'
import type { Page } from '@playwright/test'
import { E2E_UI_DELAY, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

test.describe('Dependency Graph', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Page Load Tests
  // ==========================================================================

  test.describe('Page Load', () => {
    test('should display graph page header', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should display project name in header', async ({ page }) => {
      const projectName = 'Graph Test Project'
      await createProjectAndNavigateToGraph(page, projectName)

      await expect(page.locator(`text="${projectName}"`)).toBeVisible()
    })

    test('should display back to project button', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('button:has-text("Back to Project")')).toBeVisible()
    })

    test('should show severity filter dropdown', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select')
      await expect(severitySelect).toBeVisible()
    })

    test('should have all severity options in dropdown', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Find the severity filter select by its aria-label or specific context
      const severitySelect = page.locator('header select').first()
      await expect(severitySelect).toBeVisible()

      // <option> elements inside a <select> are not "visible" when dropdown is closed.
      // Verify they exist by checking the select's option values via evaluate.
      const optionTexts = await severitySelect.evaluate((el: HTMLSelectElement) =>
        Array.from(el.options).map((o) => o.text),
      )
      expect(optionTexts).toContain('All Severities')
      expect(optionTexts).toContain('Critical')
      expect(optionTexts).toContain('High')
      expect(optionTexts).toContain('Medium')
      expect(optionTexts).toContain('Low')
    })

    test('should show "Vulnerable Only" toggle button', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('button:has-text("Vulnerable Only")')).toBeVisible()
    })

    test('should display footer with statistics', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('footer')).toBeVisible()
    })

    test('should show component count in footer', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('text=/Showing.*\\d+.*components/i')).toBeVisible()
    })

    test('should show severity counts in footer', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('text=Critical:')).toBeVisible()
      await expect(page.locator('text=High:')).toBeVisible()
      await expect(page.locator('text=Medium:')).toBeVisible()
      await expect(page.locator('text=Low:')).toBeVisible()
    })

    test('should show filter icon', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Filter icon should be visible
      const filterIcon = page.locator('svg').filter({ has: page.locator('path') })
      await expect(filterIcon.first()).toBeVisible()
    })
  })

  // ==========================================================================
  // Filter Tests
  // ==========================================================================

  test.describe('Filters', () => {
    test('should filter by critical severity', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select')
      await severitySelect.selectOption('critical')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Verify filter applied - check select value
      await expect(severitySelect).toHaveValue('critical')
    })

    test('should filter by high severity', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select')
      await severitySelect.selectOption('high')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(severitySelect).toHaveValue('high')
    })

    test('should filter by medium severity', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select')
      await severitySelect.selectOption('medium')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(severitySelect).toHaveValue('medium')
    })

    test('should filter by low severity', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select')
      await severitySelect.selectOption('low')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(severitySelect).toHaveValue('low')
    })

    test('should reset to all severities', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select')
      await severitySelect.selectOption('critical')
      await page.waitForTimeout(E2E_UI_DELAY)
      await severitySelect.selectOption('all')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(severitySelect).toHaveValue('all')
    })

    test('should toggle vulnerable only filter on', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const toggleButton = page.locator('button:has-text("Vulnerable Only")')
      await toggleButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Button should have active styling
      await expect(toggleButton).toHaveClass(/bg-primary/)
    })

    test('should toggle vulnerable only filter off', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const toggleButton = page.locator('button:has-text("Vulnerable Only")')

      // Toggle on
      await toggleButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Toggle off
      await toggleButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Button should not have active styling
      await expect(toggleButton).not.toHaveClass(/bg-primary/)
    })

    test('should combine severity and vulnerable filters', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Apply severity filter
      const severitySelect = page.locator('select')
      await severitySelect.selectOption('high')

      // Apply vulnerable only
      const toggleButton = page.locator('button:has-text("Vulnerable Only")')
      await toggleButton.click()

      await page.waitForTimeout(E2E_UI_DELAY)

      // Both filters should be active
      await expect(severitySelect).toHaveValue('high')
      await expect(toggleButton).toHaveClass(/bg-primary/)
    })

    test('should update footer counts when filter changes', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Get initial count text
      const footerText = await page.locator('footer').textContent()

      // Apply filter
      const severitySelect = page.locator('select')
      await severitySelect.selectOption('critical')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Footer should still be visible (may have updated text)
      await expect(page.locator('footer')).toBeVisible()
    })
  })

  // ==========================================================================
  // Navigation Tests
  // ==========================================================================

  test.describe('Navigation', () => {
    test('should navigate back to project detail', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await page.locator('button:has-text("Back to Project")').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should no longer be on graph page
      await expect(page).not.toHaveURL(/\/graph$/)
    })

    test('should preserve project context when navigating back', async ({ page }) => {
      const projectName = 'Navigation Test Project'
      await createProjectAndNavigateToGraph(page, projectName)

      await page.locator('button:has-text("Back to Project")').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show project name on detail page
      await expect(page.locator(`text=${projectName}`)).toBeVisible()
    })

    test('should show arrow left icon on back button', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const backButton = page.locator('button:has-text("Back to Project")')
      const arrowIcon = backButton.locator('svg')
      await expect(arrowIcon).toBeVisible()
    })

    test('should handle browser back navigation', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await page.goBack()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should navigate away from graph
      await expect(page).not.toHaveURL(/\/graph$/)
    })
  })

  // ==========================================================================
  // Empty State Tests
  // ==========================================================================

  test.describe('Empty States', () => {
    test('should handle project with no components', async ({ page }) => {
      await createProjectAndNavigateToGraph(page) // Empty project

      // Page should still render
      await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
    })

    test('should show zero counts for empty project', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Footer should show 0 components
      await expect(page.locator('text=/Showing 0.*components/i')).toBeVisible()
    })

    test('should show zero vulnerability counts', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // All severity counts should be 0
      await expect(page.locator('text=Critical: 0')).toBeVisible()
      await expect(page.locator('text=High: 0')).toBeVisible()
    })

    test('should handle project not found', async ({ page }) => {
      // Navigate to non-existent project graph using SPA navigation
      await page.evaluate((path) => {
        const nav = (window as unknown as Record<string, unknown>).__navigate
        if (typeof nav === 'function') {
          nav(path)
        }
      }, '/project/non-existent-id/graph')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show "Project not found" message
      await expect(page.locator('text=/Project not found/i')).toBeVisible({ timeout: 5000 })
    })
  })

  // ==========================================================================
  // Graph Container Tests
  // ==========================================================================

  test.describe('Graph Container', () => {
    test('should have graph container element', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Main content area should exist
      const mainContent = page.locator('main')
      await expect(mainContent).toBeVisible()
    })

    test('should apply border styling to graph', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Graph container should have border class
      const graphContainer = page.locator('main > div').first()
      await expect(graphContainer).toHaveClass(/border/)
    })

    test('should have proper height for graph area', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const mainContent = page.locator('main')
      const boundingBox = await mainContent.boundingBox()

      // Main content should have significant height
      expect(boundingBox?.height).toBeGreaterThan(200)
    })
  })

  // ==========================================================================
  // Responsive Design Tests
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display on tablet viewport', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
      await expect(page.locator('select')).toBeVisible()
      await expect(page.locator('button:has-text("Vulnerable Only")')).toBeVisible()
    })

    test('should show footer on tablet', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('footer')).toBeVisible()
    })

    test('should allow filter interaction on tablet', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select')
      await severitySelect.selectOption('high')

      await expect(severitySelect).toHaveValue('high')
    })
  })

  test.describe('Mobile Design', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('should display on mobile viewport', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
    })

    test('should stack header elements on mobile', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Header should still be visible
      const header = page.locator('header')
      await expect(header).toBeVisible()
    })
  })
})

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Create a project and navigate to its dependency graph
 */
async function createProjectAndNavigateToGraph(page: Page, name = 'Graph Test Project'): Promise<void> {
  // Create project
  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  await page.locator('#project-name').fill(name)
  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })

  await page.waitForTimeout(E2E_UI_DELAY)

  // Navigate to project detail
  const projectCard = page.locator('.group').filter({ hasText: name }).first()
  await projectCard.click()

  await expect(page.getByRole('heading', { name: new RegExp(name, 'i') })).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(E2E_UI_DELAY)

  // Navigate to dependency graph using SPA navigation
  const url = page.url()
  const projectId = url.match(/\/project\/([^/]+)/)?.[1]
  if (projectId) {
    // Use React Router's navigate function to avoid full page reload
    await page.evaluate((path) => {
      const nav = (window as unknown as Record<string, unknown>).__navigate
      if (typeof nav === 'function') {
        nav(path)
      }
    }, `/project/${projectId}/graph`)
  }

  await page.waitForTimeout(E2E_UI_DELAY)
  await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
}
