/**
 * False Positive Filter Workflow — content contracts
 *
 * The FPF page auto-populates a default SystemConfig on mount (FalsePositiveFilter.tsx's
 * `useEffect`), so its dashboard, config wizard, and miss-filter panel all render fully
 * designed content for a fresh project with zero SBOM/vulnerability data — no scan needed.
 * Every kept test below asserts that designed content instead of the previous
 * `isVisible().catch(() => false)` / `if (count > 0)` guards that could never fail. Grounding:
 *   - pages/FalsePositiveFilter.tsx — h1 "False Positive Filter" + "Project: <name>"; tabs
 *     'Dashboard'/'Review Filtered'/'Configuration'/'Miss-Filter Detection'; the Review tab's
 *     no-result state "No Filter Results" / "Run the filter to see results here."
 *   - components/FPF/FilterDashboard.tsx — ConfigurationStatus "Configuration Active" +
 *     "<name> v<version> - Tier: <tier>"; zero-value StatCards; EffectivenessMetrics'
 *     "No filter results yet. Run the filter to see effectiveness metrics."
 *   - components/FPF/ConfigWizard.tsx — h2 "FPF Configuration Wizard" + step footer
 *     "Step 1 of 5: Project Information"
 *   - components/FPF/MissFilterPanel.tsx — h3 "Miss-Filter Detection" + "No miss-filters detected"
 *   - pages/ProjectDetail.tsx — "False Positive Filter" header button → /project/:id/fpf
 *   - shell/Sidebar.tsx — contextual "Overview" link back to the project detail page
 *
 * Filtering real findings (Run Filter producing non-zero results, Review Filtered rows,
 * flagged miss-filter items) needs a scanned project with populated vulnerabilities. As in
 * the sibling vulnerability-lifecycle/security-assessment specs, this suite treats scan-derived
 * vulnerability data as non-deterministic offline, so those paths are skipped with reasons
 * rather than asserted against fabricated data.
 */

import { test, expect, resetAppState } from '../test-helper'
import type { Page } from '@playwright/test'
import { createProjectOnly, navigateToProjectDetail, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

/**
 * Create a project, open its detail page, and click through to the False Positive
 * Filter page via the real header button (grounded in ProjectDetail.tsx).
 */
async function openFalsePositiveFilter(page: Page, projectName: string): Promise<void> {
  await createProjectOnly(page, projectName)
  await navigateToProjectDetail(page, projectName)

  await page.getByRole('button', { name: 'False Positive Filter' }).click()
  await expect(page).toHaveURL(/\/project\/[^/]+\/fpf$/)
  await expect(
    page.locator('#main-content').getByRole('heading', { level: 1, name: 'False Positive Filter' }),
  ).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
}

test.describe('False Positive Filter Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Opening the filter', () => {
    test('should open the false-positive filter from the project detail header', async ({ page }) => {
      const projectName = `FPF Open ${Date.now()}`
      await openFalsePositiveFilter(page, projectName)

      const main = page.locator('#main-content')
      await expect(main.getByText(`Project: ${projectName}`)).toBeVisible()
    })
  })

  test.describe('Dashboard', () => {
    test('should show the designed FPF tabs in order', async ({ page }) => {
      await openFalsePositiveFilter(page, `FPF Tabs ${Date.now()}`)
      const main = page.locator('#main-content')

      const tabNames = await main.getByRole('tab').allTextContents()
      expect(tabNames.map((t) => t.trim())).toEqual([
        'Dashboard',
        'Review Filtered',
        'Configuration',
        'Miss-Filter Detection',
      ])
    })

    test('should show the default dashboard content for a fresh project', async ({ page }) => {
      const projectName = `FPF Dashboard ${Date.now()}`
      await openFalsePositiveFilter(page, projectName)
      const main = page.locator('#main-content')

      // Config auto-populates on mount (project name, version 1.0.0, tier development).
      await expect(main.locator('[data-testid="config-status-valid"]')).toContainText(
        `${projectName} v1.0.0 - Tier: development`,
      )

      // No filter has run yet, so every summary stat defaults to zero.
      for (const label of ['Total Vulnerabilities', 'Filtered (FP)', 'Kept (Real)', 'Escalated']) {
        await expect(main.locator('[data-testid="stat-card"]').filter({ hasText: label })).toContainText('0')
      }

      await expect(main.locator('[data-testid="no-filter-results"]')).toContainText(
        'No filter results yet. Run the filter to see effectiveness metrics.',
      )
    })

    test('should keep zero totals and stay on the dashboard after filtering an empty project', async ({ page }) => {
      await openFalsePositiveFilter(page, `FPF Run ${Date.now()}`)
      const main = page.locator('#main-content')

      const runFilterButton = main.getByRole('button', { name: 'Run Filter' })
      await expect(runFilterButton).toBeEnabled({ timeout: E2E_SELECTOR_TIMEOUT })
      await runFilterButton.click()

      // A batch result with 0 results does not trigger the "results.length > 0" tab switch,
      // so the Dashboard tab stays selected instead of jumping to Review Filtered.
      await expect(main.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')

      // The placeholder is replaced by the real (all-zero) effectiveness metrics section.
      await expect(main.locator('[data-testid="effectiveness-metrics"]')).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
      await expect(main.locator('[data-testid="no-filter-results"]')).not.toBeVisible()
      await expect(
        main.locator('[data-testid="stat-card"]').filter({ hasText: 'Total Vulnerabilities' }),
      ).toContainText('0')
    })
  })

  test.describe('Review Filtered tab', () => {
    test('should show the no-results empty state before running a filter', async ({ page }) => {
      await openFalsePositiveFilter(page, `FPF Review ${Date.now()}`)
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Review Filtered' }).click()
      await expect(main.getByRole('heading', { level: 3, name: 'No Filter Results' })).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
      await expect(main.getByText('Run the filter to see results here.')).toBeVisible()
    })

    test.skip('should list real filtered vulnerabilities after a scan', async () => {
      // Infeasible offline: Review Filtered only renders rows once Run Filter has processed a
      // scanned project's vulnerabilities, which requires network/OSV or seeded-CVE matching
      // that this suite treats as non-deterministic (see vulnerability-lifecycle.spec.ts).
    })
  })

  test.describe('Configuration tab', () => {
    test('should open the configuration wizard on step 1', async ({ page }) => {
      await openFalsePositiveFilter(page, `FPF Config ${Date.now()}`)
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Configuration' }).click()
      await expect(main.getByRole('heading', { level: 2, name: 'FPF Configuration Wizard' })).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
      await expect(main.getByText('Step 1 of 5: Project Information')).toBeVisible()
    })
  })

  test.describe('Miss-Filter Detection tab', () => {
    test('should show the no-miss-filters empty state', async ({ page }) => {
      await openFalsePositiveFilter(page, `FPF Miss ${Date.now()}`)
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Miss-Filter Detection' }).click()
      await expect(main.getByRole('heading', { level: 3, name: 'Miss-Filter Detection' })).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
      await expect(main.getByText('No miss-filters detected')).toBeVisible()
    })

    test.skip('should flag a real miss-filter detection', async () => {
      // Infeasible offline: MissFilterPanel only has items once a filter batch has run against
      // scanned vulnerabilities with confidence/recency/KEV data to evaluate.
    })
  })

  test.describe('Navigation', () => {
    test('should navigate back to the project via the sidebar Overview link', async ({ page }) => {
      const projectName = `FPF Nav ${Date.now()}`
      await openFalsePositiveFilter(page, projectName)

      // Contextual project link in the shell sidebar (outside #main-content).
      await page.getByRole('link', { name: 'Overview' }).click()
      await expect(page).toHaveURL(/\/project\/[^/]+$/)
      await expect(
        page.locator('#main-content').getByRole('heading', { level: 1, name: new RegExp(projectName, 'i') }),
      ).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })
  })
})
