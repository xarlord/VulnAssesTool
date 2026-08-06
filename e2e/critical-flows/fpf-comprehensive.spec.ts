import { test, expect, resetAppState } from '../test-helper'
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
 *
 * Grounding for the two tests below that previously relied on false-green guards
 * (`isVisible().catch(() => false)` OR-chains, and an always-matching `/Flagged/`
 * regex that is satisfied by the button's own static label regardless of state):
 *   - components/FPF/FilterDashboard.tsx — `EffectivenessMetrics` renders
 *     `data-testid="no-filter-results"` only while `lastFilterResult` is null, and
 *     `data-testid="effectiveness-metrics"` once it is set; `export-report-button`
 *     is `disabled={!lastFilterResult}`. Running the filter on a project with zero
 *     vulnerabilities still produces a non-null `FilterBatchResult` (all-zero counts)
 *     via `falsePositiveFilter.ts` `filterBatch`, so this is fully deterministic offline.
 *   - components/FPF/MissFilterPanel.tsx — the All/Flagged/Unflagged toggle buttons
 *     apply the `bg-primary` class only to whichever button matches the current
 *     `filterFlagged` state (`null`/`true`/`false`), so a toggle click is verifiable
 *     via its class list rather than its always-present label text.
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

    test('should run the filter and update dashboard metrics for a project with no vulnerabilities', async ({
      page,
    }) => {
      await createTestProjectAndNavigateToFPF(page)

      // createProjectOnly imports no SBOM, so project.vulnerabilities is empty. filterBatch still
      // resolves to a non-null FilterBatchResult (all-zero counts) for an empty items array
      // (falsePositiveFilter.ts filterBatch), which flips FilterDashboard from the
      // "no-filter-results" placeholder to "effectiveness-metrics" and enables Export Report
      // (FilterDashboard.tsx: EffectivenessMetrics + export-report-button disabled={!lastFilterResult}).
      await page.locator('[data-testid="run-filter-button"]').click()

      await expect(page.locator('[data-testid="effectiveness-metrics"]')).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
      await expect(page.locator('[data-testid="no-filter-results"]')).not.toBeVisible()
      await expect(page.locator('[data-testid="export-report-button"]')).toBeEnabled()
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

    test('should toggle configuration panel', async ({ page }) => {
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

      // filterFlagged starts as `null`, so "All" carries the active `bg-primary` class by default
      // (MissFilterPanel.tsx toggle buttons). Clicking "Flagged" sets filterFlagged to `true` and
      // moves the active class to that button instead; clicking "Unflagged" moves it again. The
      // label text itself ("Flagged (0)") never changes here since there is no filter result to
      // derive counts from, so the class is the only state-dependent, assertable signal.
      const allButton = page.locator('[data-testid="filter-all"]')
      const flaggedButton = page.locator('[data-testid="filter-flagged"]')
      const unflaggedButton = page.locator('[data-testid="filter-unflagged"]')
      await expect(allButton).toHaveClass(/bg-primary/)

      await flaggedButton.click()
      await expect(flaggedButton).toHaveClass(/bg-primary/)
      await expect(allButton).not.toHaveClass(/bg-primary/)

      await unflaggedButton.click()
      await expect(unflaggedButton).toHaveClass(/bg-primary/)
      await expect(flaggedButton).not.toHaveClass(/bg-primary/)
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
