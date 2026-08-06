/**
 * Full User Journey Integration Tests — content contracts
 *
 * End-to-end workflows combining multiple features, restricted to what the offline seeded
 * environment can drive deterministically:
 *   1. Create → upload SBOM (local parse) → inspect Components/Vulnerabilities tabs → export.
 *   2. Create → upload SBOM → open the False Positive Filter page, its default config, and the
 *      Configuration wizard.
 *   3. Create two projects with different SBOM formats → verify component data is isolated per
 *      project → delete one → verify the other survives. (Already a real content contract —
 *      kept unchanged.)
 *
 * Grounding:
 *   - pages/ProjectDetail.tsx — header "Export" (exact) button
 *   - components/ExportDialog.tsx — DialogTitle "Export Data" + CSV/JSON/PDF format buttons
 *   - pages/FalsePositiveFilter.tsx — PageHeader h1 "False Positive Filter" + "Project: <name>";
 *     tabs ['Dashboard','Review Filtered','Configuration','Miss-Filter Detection'] (role=tab,
 *     aria-selected); Configuration tab's wizard Cancel returns activeTab to 'dashboard'
 *   - components/FPF/FilterDashboard.tsx — "Configuration Active" (default config is auto-set
 *     once the project loads) + "No filter results yet. Run the filter to see effectiveness
 *     metrics." (shown until a filter batch is run)
 *   - components/FPF/ConfigWizard.tsx — h2 "FPF Configuration Wizard"; step-1 "Cancel" button
 *
 * Running the FPF filter to a meaningful (non-degenerate) result needs a scanned project with
 * real vulnerabilities — infeasible offline, see the skipped test below.
 */

import { test, expect, resetAppState } from '../test-helper'
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
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

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

    // Step 5: Export dialog offers the designed CSV/JSON/PDF formats.
    await page.getByRole('button', { name: 'Export', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Export Data')).toBeVisible()
    for (const format of ['CSV', 'JSON', 'PDF']) {
      await expect(dialog.getByRole('button', { name: format })).toBeVisible()
    }
    await closeDialog(page)
  })

  test('complete FPF journey', async ({ page }) => {
    // Step 1: Create project and upload SBOM
    const projectName = `FPF Journey ${Date.now()}`
    await createTestProject(page, projectName)

    const sbomPath = path.join(FIXTURES_DIR, 'sample-cyclonedx.json')
    await uploadSbomFile(page, sbomPath)

    // Step 2: Navigate to the project's False Positive Filter page via the header button.
    await page.getByRole('button', { name: 'False Positive Filter' }).click()
    await expect(page).toHaveURL(/\/project\/[^/]+\/fpf$/)
    await expect(page.getByRole('heading', { level: 1, name: 'False Positive Filter' })).toBeVisible({
      timeout: E2E_SELECTOR_TIMEOUT,
    })
    await expect(page.getByText(`Project: ${projectName}`)).toBeVisible()

    // Step 3: Dashboard tab (default) — a default config is auto-populated once the project
    // loads, and there are no filter results yet since the filter hasn't been run.
    await expect(page.getByText('Configuration Active')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    await expect(page.getByText('No filter results yet. Run the filter to see effectiveness metrics.')).toBeVisible()

    // Step 4: Configuration tab opens the wizard; Cancel returns to the dashboard tab.
    await page.getByRole('tab', { name: 'Configuration' }).click()
    await expect(page.getByRole('heading', { name: 'FPF Configuration Wizard' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
  })

  test.skip('should run the false-positive filter against scanned vulnerabilities', async () => {
    // Infeasible offline: a meaningful filter run needs a scanned project with real
    // vulnerabilities. createTestProject + a local SBOM parse produces zero vulnerabilities, so
    // filterBatch degenerates to a total:0 result (NaN% effectiveness) — not a designed content
    // contract.
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

    await project2Card.getByLabel(/delete/i).click()

    // Delete now uses an in-app ConfirmDialog (P7), not window.confirm(); confirm the deletion.
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
    await page.waitForTimeout(E2E_UI_DELAY * 2)

    // Verify project 2 is gone but project 1 still exists
    await expect(page.getByText(project2)).not.toBeVisible({ timeout: 10000 })
    await expect(page.getByText(project1)).toBeVisible({ timeout: 5000 })
  })
})
