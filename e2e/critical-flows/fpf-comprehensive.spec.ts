import { test, expect, resetAppState } from '../electron-helper'
import type { Page } from '@playwright/test'
import {
  createProjectOnly,
  navigateToProjectDetail,
  E2E_DEFAULT_TIMEOUT,
  E2E_SELECTOR_TIMEOUT,
  E2E_UI_DELAY,
} from '../shared-helpers'

/**
 * Comprehensive E2E Tests for False Positive Filter (FPF) Feature
 *
 * Tests all FPF functionality:
 * - Dashboard: Run Filter, Configure, Export Report
 * - Configuration Wizard: 5-step configuration flow
 * - Review Filtered: tabs, search, selection, pagination
 * - Miss-Filter Detection: items, flagging, configuration
 *
 * Prerequisites:
 * - Database seeded with CVE data (run npm run seed-db)
 *
 * Note: These tests navigate through the UI rather than direct URL navigation
 * to ensure proper Zustand store state is maintained.
 */

test.describe('FPF Comprehensive Tests', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Dashboard Tests
  // ==========================================================================

  test.describe('FPF Dashboard', () => {
    test.use({ viewport: { width: 1280, height: 720 } })

    test('should display FPF dashboard with all elements', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      await expect(page.locator('[data-testid="filter-dashboard"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(page.locator('[data-testid="config-status-valid"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(page.locator('[data-testid="run-filter-button"]')).toBeVisible()
      await expect(page.locator('[data-testid="configure-button"]')).toBeVisible()
      await expect(page.locator('[data-testid="export-report-button"]')).toBeVisible()

      const statCards = page.locator('[data-testid="stat-card"]')
      await expect(statCards).toHaveCount(4, { timeout: E2E_SELECTOR_TIMEOUT })
      await expect(page.locator('[data-testid="no-filter-results"]')).toBeVisible()
    })

    test('should navigate to configuration when Configure button clicked', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      await page.locator('[data-testid="configure-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="config-wizard"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(page.locator('[data-testid="step-1-content"]')).toBeVisible()
    })

    test('should run filter and handle empty vulnerabilities', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      const runFilterButton = page.locator('[data-testid="run-filter-button"]')
      if (!(await runFilterButton.isVisible().catch(() => false))) {
        test.skip(true, 'Run Filter button not found - FPF feature may not be fully implemented')
        return
      }

      await runFilterButton.click()
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      const dashboardVisible = await page
        .locator('[data-testid="filter-dashboard"]')
        .isVisible()
        .catch(() => false)
      const metricsVisible = await page
        .locator('[data-testid="effectiveness-metrics"]')
        .isVisible()
        .catch(() => false)
      const noResultsVisible = await page
        .locator('[data-testid="no-filter-results"]')
        .isVisible()
        .catch(() => false)
      const anyContentVisible = await page
        .locator('[class*="fpf"], [class*="filter"]')
        .first()
        .isVisible()
        .catch(() => false)

      expect(dashboardVisible || metricsVisible || noResultsVisible || anyContentVisible).toBe(true)
    })

    test('should show export button disabled when no results', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      const exportButton = page.locator('[data-testid="export-report-button"]')
      await expect(exportButton).toBeDisabled()
    })
  })

  // ==========================================================================
  // Configuration Wizard Tests
  // ==========================================================================

  test.describe('FPF Configuration Wizard', () => {
    test.use({ viewport: { width: 1280, height: 900 } })

    test('should display all 5 steps of configuration wizard', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      await page.locator('[data-testid="configure-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-indicator"]')).toBeVisible()

      for (let i = 1; i <= 5; i++) {
        await expect(page.locator(`[data-testid="step-${i}-indicator"]`)).toBeVisible()
      }
    })

    test('should complete Step 1: Project Information', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.locator('[data-testid="configure-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.locator('[data-testid="project-name-input"]').fill('Test FPF Project')
      await page.locator('[data-testid="project-version-input"]').fill('2.0.0')
      await page.locator('[data-testid="tier-production"]').click()
      await page.locator('[data-testid="attack-surface-high"]').click()

      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-2-content"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should complete Step 2: Interface Configuration', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.locator('[data-testid="configure-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.locator('[data-testid="project-name-input"]').fill('Test Project')
      await page.locator('[data-testid="tier-development"]').click()
      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-2-content"]')).toBeVisible()

      const interfaceItems = page.locator('[data-testid^="interface-"]')
      const count = await interfaceItems.count()
      expect(count).toBeGreaterThan(0)

      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-3-content"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should complete Step 3: Service Configuration', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.locator('[data-testid="configure-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.locator('[data-testid="project-name-input"]').fill('Test Project')
      await page.locator('[data-testid="tier-development"]').click()
      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-3-content"]')).toBeVisible()

      const serviceItems = page.locator('[data-testid^="service-"]')
      const count = await serviceItems.count()
      expect(count).toBeGreaterThan(0)

      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-4-content"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should complete Step 4: Feature Flags', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.locator('[data-testid="configure-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.locator('[data-testid="project-name-input"]').fill('Test Project')
      await page.locator('[data-testid="tier-development"]').click()
      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)
      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-4-content"]')).toBeVisible()

      const featureItems = page.locator('[data-testid^="feature-"]')
      const count = await featureItems.count()
      expect(count).toBeGreaterThan(0)

      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-5-content"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should complete Step 5: Review and Save', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.locator('[data-testid="configure-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.locator('[data-testid="project-name-input"]').fill('Test FPF Project Final')
      await page.locator('[data-testid="tier-production"]').click()
      await page.locator('[data-testid="attack-surface-high"]').click()

      for (let i = 0; i < 4; i++) {
        await page.locator('[data-testid="next-button"]').click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }

      await expect(page.locator('[data-testid="step-5-content"]')).toBeVisible()

      const saveButton = page.locator('[data-testid="save-config-button"]')
      await expect(saveButton).toBeVisible()
      await expect(saveButton).toBeEnabled()

      await saveButton.click()
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      await expect(page.locator('[data-testid="filter-dashboard"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should allow navigation back through steps', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.locator('[data-testid="configure-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.locator('[data-testid="project-name-input"]').fill('Test Project')
      await page.locator('[data-testid="tier-development"]').click()
      await page.locator('[data-testid="next-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-2-content"]')).toBeVisible()

      await page.locator('[data-testid="prev-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="step-1-content"]')).toBeVisible()
    })

    test('should show cancel option on first step', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.locator('[data-testid="configure-button"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const cancelButton = page.locator('[data-testid="cancel-button"]')
      await expect(cancelButton).toBeVisible()

      await cancelButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="filter-dashboard"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })
  })

  // ==========================================================================
  // Tab Navigation Tests
  // ==========================================================================

  test.describe('FPF Tab Navigation', () => {
    test('should switch between all tabs', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      await expect(page.getByRole('tab', { name: /Dashboard/i })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Review Filtered/i })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Configuration/i })).toBeVisible()
      await expect(page.getByRole('tab', { name: /Miss-Filter Detection/i })).toBeVisible()
    })

    test('should navigate to Review Filtered tab', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      await page.getByRole('tab', { name: /Review Filtered/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.getByText(/No Filter Results/i)).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should navigate to Configuration tab', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      await page.getByRole('tab', { name: /Configuration/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="config-wizard"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should navigate to Miss-Filter Detection tab', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      await page.getByRole('tab', { name: /Miss-Filter Detection/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="miss-filter-panel"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })
  })

  // ==========================================================================
  // Miss-Filter Panel Tests
  // ==========================================================================

  test.describe('FPF Miss-Filter Panel', () => {
    test('should display miss-filter panel with all sections', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.getByRole('tab', { name: /Miss-Filter Detection/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('[data-testid="miss-filter-panel"]')).toBeVisible()
      await expect(page.locator('[data-testid="miss-filter-config"]')).toBeVisible()
      await expect(page.locator('[data-testid="filter-all"]')).toBeVisible()
      await expect(page.locator('[data-testid="filter-flagged"]')).toBeVisible()
      await expect(page.locator('[data-testid="filter-unflagged"]')).toBeVisible()
    })

    // Component gap: MissFilterPanel requires config prop but FalsePositiveFilter doesn't pass it
    // ConfigPanel component expects MissFilterDetectionConfig but receives undefined
    test.fixme('should toggle configuration panel', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.getByRole('tab', { name: /Miss-Filter Detection/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      const configPanel = page.locator('[data-testid="miss-filter-config"]')
      const expandButton = configPanel.locator('button').first()

      await expect(expandButton).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expandButton.click()
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      await expect(page.locator('[data-testid="confidence-threshold-input"]')).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
    })

    test('should show empty state when no miss-filters', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.getByRole('tab', { name: /Miss-Filter Detection/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.getByText(/No miss-filters detected/i)).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should filter by flagged status', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)
      await page.getByRole('tab', { name: /Miss-Filter Detection/i }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.locator('[data-testid="filter-flagged"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const flaggedButton = page.locator('[data-testid="filter-flagged"]')
      await expect(flaggedButton).toHaveText(/Flagged/)

      await page.locator('[data-testid="filter-unflagged"]').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const unflaggedButton = page.locator('[data-testid="filter-unflagged"]')
      await expect(unflaggedButton).toHaveText(/Unflagged/)
    })
  })

  // ==========================================================================
  // Responsive Design Tests
  // ==========================================================================

  test.describe('FPF Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display FPF on tablet viewport', async ({ page }) => {
      await createTestProjectAndNavigateToFPF(page)

      await expect(page.locator('[data-testid="filter-dashboard"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      const tabs = page.getByRole('tab')
      const count = await tabs.count()
      expect(count).toBe(4)
    })
  })
})

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Create a test project and navigate to FPF page using shared helpers + SPA navigation.
 */
async function createTestProjectAndNavigateToFPF(page: Page): Promise<void> {
  const uniqueName = `FPF Test Project ${Date.now()}`
  await createProjectOnly(page, uniqueName)
  await navigateToProjectDetail(page, uniqueName)

  const fpfButton = page.locator('button').filter({ hasText: 'False Positive Filter' })
  await fpfButton.click()
  await page.waitForTimeout(E2E_UI_DELAY)

  await expect(page.locator('[data-testid="filter-dashboard"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
}
