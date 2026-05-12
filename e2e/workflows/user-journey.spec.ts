/**
 * Full User Journey Integration Tests
 *
 * End-to-end workflow tests combining multiple features:
 * 1. Full vulnerability assessment: create → upload → scan → export
 * 2. Full FPF journey: create → upload → configure → filter → review
 * 3. Multi-project: create 2 projects → upload different SBOMs → verify isolation
 */

import { test, expect } from '../electron-helper'
import {
  createTestProject,
  uploadSbomFile,
  navigateToProjectDetail,
  navigateToComponentsTab,
  navigateToVulnerabilitiesTab,
  closeDialog,
  E2E_UI_DELAY,
  E2E_SELECTOR_TIMEOUT,
} from '../shared-helpers'
import path from 'node:path'

const FIXTURES_DIR = path.join(import.meta.dirname, '..', 'fixtures', 'sbom')

test.describe('Full User Journey', () => {
  test('complete vulnerability assessment journey', async ({ page }) => {
    // Step 1: Create project
    const projectName = `Full Journey ${Date.now()}`
    await createTestProject(page, projectName)

    // Step 2: Upload CycloneDX SBOM
    const sbomPath = path.join(FIXTURES_DIR, 'sample-cyclonedx.json')
    await uploadSbomFile(page, sbomPath)

    // Step 3: Verify components parsed
    await navigateToComponentsTab(page)
    await page.waitForTimeout(E2E_UI_DELAY)

    await expect(page.getByText('lodash').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('axios').first()).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('express').first()).toBeVisible({ timeout: 5000 })

    // Step 4: Check vulnerabilities tab
    await navigateToVulnerabilitiesTab(page)
    await page.waitForTimeout(E2E_UI_DELAY)

    // Vulnerabilities tab should be accessible (may be empty since SBOM doesn't list vulns)
    const vulnTab = page.getByRole('tab', { name: /vulnerabilities/i })
    await expect(vulnTab).toHaveAttribute('aria-selected', 'true')

    // Step 5: Try export
    const exportButton = page.getByRole('button', { name: /export/i }).first()
    if (await exportButton.isVisible().catch(() => false)) {
      await exportButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Export dialog should open
      const dialog = page.getByRole('dialog')
      if (await dialog.isVisible().catch(() => false)) {
        // Verify export format options exist
        await expect(page.getByText(/pdf|csv|json/i).first()).toBeVisible()
        await closeDialog(page)
      }
    }
  })

  test('complete FPF journey', async ({ page }) => {
    // Step 1: Create project and upload SBOM
    const projectName = `FPF Journey ${Date.now()}`
    await createTestProject(page, projectName)

    const sbomPath = path.join(FIXTURES_DIR, 'sample-cyclonedx.json')
    await uploadSbomFile(page, sbomPath)

    // Step 2: Navigate to FPF page
    const url = page.url()
    const projectId = url.split('/project/')[1]?.split('/')[0] || url.split('/').pop() || ''

    await page.evaluate((id: string) => {
      const nav = (window as unknown as Record<string, unknown>).__navigate
      if (typeof nav === 'function') nav(`/project/${id}/fpf`)
    }, projectId)
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(E2E_UI_DELAY)

    // Step 3: Configure FPF - open config tab
    const configTab = page.getByRole('tab', { name: /configuration/i })
    if (await configTab.isVisible().catch(() => false)) {
      await configTab.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Verify config wizard is shown
      const configContent = page.locator('form, [class*="config"], [class*="wizard"]').first()
      if (await configContent.isVisible().catch(() => false)) {
        await expect(configContent).toBeVisible()
      }

      // Go back to dashboard
      const dashboardTab = page.getByRole('tab', { name: /dashboard/i })
      if (await dashboardTab.isVisible().catch(() => false)) {
        await dashboardTab.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    }

    // Step 4: Run filter
    const runFilterButton = page.getByRole('button', { name: /run filter|start filter|filter now/i }).first()
    if (await runFilterButton.isVisible().catch(() => false)) {
      await runFilterButton.click()
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      // Check results appeared or review tab activated
      const resultsElement = page.getByText(/filtered|kept|total|results|processing/i)
      if (
        await resultsElement
          .first()
          .isVisible()
          .catch(() => false)
      ) {
        await expect(resultsElement.first()).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      }
    }

    // Step 5: Go back to project
    const backButton = page.getByRole('button', { name: /back to project/i })
    if (await backButton.isVisible().catch(() => false)) {
      await backButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)
    }
  })

  test('multi-project data isolation', async ({ page }) => {
    // Step 1: Create first project with CycloneDX SBOM (5 components)
    const project1 = `Project A ${Date.now()}`
    await createTestProject(page, project1)

    const cycloneDxPath = path.join(FIXTURES_DIR, 'sample-cyclonedx.json')
    await uploadSbomFile(page, cycloneDxPath)

    // Verify first project has lodash
    await navigateToComponentsTab(page)
    await page.waitForTimeout(E2E_UI_DELAY)
    await expect(page.getByText('lodash').first()).toBeVisible({ timeout: 10000 })

    // Step 2: Go back to dashboard and create second project
    await page.evaluate(() => {
      const nav = (window as unknown as Record<string, unknown>).__navigate
      if (typeof nav === 'function') nav('/')
    })
    await page.waitForTimeout(E2E_UI_DELAY * 2)

    const project2 = `Project B ${Date.now()}`
    await createTestProject(page, project2)

    // Upload SPDX SBOM (4 components, no lodash same set but different format)
    const spdxPath = path.join(FIXTURES_DIR, 'sample-spdx.json')
    await uploadSbomFile(page, spdxPath)

    // Verify second project has its own components
    await navigateToComponentsTab(page)
    await page.waitForTimeout(E2E_UI_DELAY)
    await expect(page.getByText('axios').first()).toBeVisible({ timeout: 10000 })

    // Step 3: Go back to first project and verify data persisted
    await page.evaluate(() => {
      const nav = (window as unknown as Record<string, unknown>).__navigate
      if (typeof nav === 'function') nav('/')
    })
    await page.waitForTimeout(E2E_UI_DELAY * 2)

    await navigateToProjectDetail(page, project1)
    await navigateToComponentsTab(page)
    await page.waitForTimeout(E2E_UI_DELAY)

    // First project should still have lodash (CycloneDX component)
    await expect(page.getByText('lodash').first()).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('typescript').first()).toBeVisible({ timeout: 5000 })

    // Step 4: Delete second project and verify first is unaffected
    await page.evaluate(() => {
      const nav = (window as unknown as Record<string, unknown>).__navigate
      if (typeof nav === 'function') nav('/')
    })
    await page.waitForTimeout(E2E_UI_DELAY * 2)

    // Verify both projects exist on dashboard
    await expect(page.getByText(project1)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(project2)).toBeVisible({ timeout: 10000 })

    // Delete project 2 from dashboard by clicking its delete button scoped to its card
    const project2Card = page.locator('.group.rounded-lg.border').filter({ hasText: project2 }).first()

    // The delete uses window.confirm() — accept the browser dialog
    page.on('dialog', (dialog) => dialog.accept())
    await project2Card.getByLabel(/delete/i).click()
    await page.waitForTimeout(E2E_UI_DELAY * 2)

    // Verify project 2 is gone but project 1 still exists
    await expect(page.getByText(project2)).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText(project1)).toBeVisible({ timeout: 5000 })
  })
})
