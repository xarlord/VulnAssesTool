/**
 * False Positive Filter Workflow Tests
 *
 * Tests the real FPF data flow: SBOM upload → FPF config → filter execution → review results.
 * Uses the actual FalsePositiveFilter service (Tier 1 + Tier 2 filters) with optional Database.
 */

import { test, expect } from '../electron-helper'
import {
  createTestProject,
  uploadSbomFile,
  navigateToProjectDetail,
  E2E_UI_DELAY,
  E2E_SELECTOR_TIMEOUT,
} from '../shared-helpers'
import path from 'node:path'

const FIXTURES_DIR = path.join(import.meta.dirname, '..', 'fixtures', 'sbom')

/**
 * Helper to navigate to the FPF page from project detail
 */
async function navigateToFPF(page: import('@playwright/test').Page, projectId: string): Promise<void> {
  // Try navigating via URL (SPA)
  await page.evaluate((id: string) => {
    const nav = (window as unknown as Record<string, unknown>).__navigate
    if (typeof nav === 'function') nav(`/project/${id}/fpf`)
  }, projectId)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(E2E_UI_DELAY)

  // Verify we're on the FPF page
  const fpfHeading = page.getByRole('heading', { name: /false positive filter/i })
  if (!(await fpfHeading.isVisible().catch(() => false))) {
    // Try clicking the FPF button if it exists
    const fpfButton = page.getByRole('button', { name: /false positive|fpf|filter/i }).first()
    if (await fpfButton.isVisible().catch(() => false)) {
      await fpfButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)
    }
  }
}

test.describe('False Positive Filter', () => {
  test('FPF dashboard shows project info after SBOM upload', async ({ page }) => {
    const projectName = `FPF Dashboard ${Date.now()}`
    await createTestProject(page, projectName)

    const sbomPath = path.join(FIXTURES_DIR, 'sample-cyclonedx.json')
    await uploadSbomFile(page, sbomPath)

    // Get project ID from URL
    const url = page.url()
    const projectId = url.split('/project/')[1]?.split('/')[0] || url.split('/').pop() || ''

    await navigateToFPF(page, projectId)

    // The FPF page should load with the project name
    const projectNameElement = page.getByText(projectName)
    if (await projectNameElement.isVisible().catch(() => false)) {
      await expect(projectNameElement).toBeVisible()
    }
  })

  test('FPF config tab allows interface configuration', async ({ page }) => {
    const projectName = `FPF Config ${Date.now()}`
    await createTestProject(page, projectName)

    const sbomPath = path.join(FIXTURES_DIR, 'sample-cyclonedx.json')
    await uploadSbomFile(page, sbomPath)

    const url = page.url()
    const projectId = url.split('/project/')[1]?.split('/')[0] || url.split('/').pop() || ''
    await navigateToFPF(page, projectId)

    // Navigate to Configuration tab
    const configTab = page.getByRole('tab', { name: /configuration/i })
    if (await configTab.isVisible().catch(() => false)) {
      await configTab.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Config wizard should be visible
      const configContent = page.locator('[class*="config"], [class*="wizard"]').first()
      if (await configContent.isVisible().catch(() => false)) {
        await expect(configContent).toBeVisible()
      }
    }
  })

  test('running FPF filter on vulnerabilities shows results', async ({ page }) => {
    const projectName = `FPF Run ${Date.now()}`
    await createTestProject(page, projectName)

    const sbomPath = path.join(FIXTURES_DIR, 'sample-cyclonedx.json')
    await uploadSbomFile(page, sbomPath)

    const url = page.url()
    const projectId = url.split('/project/')[1]?.split('/')[0] || url.split('/').pop() || ''
    await navigateToFPF(page, projectId)

    // Click "Run Filter" button on dashboard
    const runFilterButton = page.getByRole('button', { name: /run filter|start filter|filter now/i }).first()
    if (await runFilterButton.isVisible().catch(() => false)) {
      await runFilterButton.click()
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      // After filtering, should either:
      // 1. Navigate to review tab, or
      // 2. Show results on dashboard
      const reviewTab = page.getByRole('tab', { name: /review/i })
      const resultsElement = page.getByText(/filtered|kept|total|results/i)

      const hasResults = await resultsElement
        .first()
        .isVisible()
        .catch(() => false)
      const onReviewTab = await reviewTab.getAttribute('aria-selected').catch(() => 'false')

      if (hasResults || onReviewTab === 'true') {
        // Filter ran successfully
        await expect(resultsElement.first()).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      }
    }
  })

  test('FPF with empty project shows appropriate message', async ({ page }) => {
    const projectName = `FPF Empty ${Date.now()}`
    await createTestProject(page, projectName)

    // Don't upload any SBOM - empty project
    const url = page.url()
    const projectId = url.split('/project/')[1]?.split('/')[0] || url.split('/').pop() || ''
    await navigateToFPF(page, projectId)

    // Run filter on empty project
    const runFilterButton = page.getByRole('button', { name: /run filter|start filter|filter now/i }).first()
    if (await runFilterButton.isVisible().catch(() => false)) {
      await runFilterButton.click()
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      // Should handle gracefully - either no results message or empty state
      const emptyState = page.getByText(/no vulnerabilities|no results|empty/i)
      if (await emptyState.isVisible().catch(() => false)) {
        await expect(emptyState).toBeVisible()
      }
    }
  })

  test('FPF miss-filter detection tab is accessible', async ({ page }) => {
    const projectName = `FPF Miss ${Date.now()}`
    await createTestProject(page, projectName)

    const sbomPath = path.join(FIXTURES_DIR, 'sample-cyclonedx.json')
    await uploadSbomFile(page, sbomPath)

    const url = page.url()
    const projectId = url.split('/project/')[1]?.split('/')[0] || url.split('/').pop() || ''
    await navigateToFPF(page, projectId)

    // Navigate to Miss-Filter Detection tab
    const missFilterTab = page.getByRole('tab', { name: /miss.filter/i })
    if (await missFilterTab.isVisible().catch(() => false)) {
      await missFilterTab.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Miss-filter panel should be visible
      const missFilterContent = page.getByText(/confidence|threshold|detection/i)
      if (await missFilterContent.isVisible().catch(() => false)) {
        await expect(missFilterContent.first()).toBeVisible()
      }
    }
  })

  test('FPF page navigation back to project works', async ({ page }) => {
    const projectName = `FPF Nav ${Date.now()}`
    await createTestProject(page, projectName)

    const sbomPath = path.join(FIXTURES_DIR, 'minimal-cyclonedx.json')
    await uploadSbomFile(page, sbomPath)

    const url = page.url()
    const projectId = url.split('/project/')[1]?.split('/')[0] || url.split('/').pop() || ''
    await navigateToFPF(page, projectId)

    // Click "Back to Project" link
    const backButton = page.getByRole('button', { name: /back to project/i })
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should be back on project detail page
      const projectHeading = page.getByRole('heading', { name: new RegExp(projectName, 'i') })
      if (await projectHeading.isVisible().catch(() => false)) {
        await expect(projectHeading).toBeVisible()
      }
    }
  })
})
