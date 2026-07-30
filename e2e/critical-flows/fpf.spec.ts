import { test, expect, resetAppState } from '../test-helper'
import { createProjectOnly, navigateToProjectDetail, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

/**
 * False Positive Filter (FPF) — content contracts
 *
 * The FPF page is reachable and fully renderable offline: FalsePositiveFilter.tsx builds a
 * default SystemConfig locally the moment a project loads (no network), so every tab's
 * "nothing has been filtered yet" state is real, deterministic, designed content — not a
 * placeholder. Grounding:
 *   - pages/ProjectDetail.tsx:271-277 — header button "False Positive Filter" navigates to
 *     `/project/${projectId}/fpf`
 *   - components/ProjectCard.tsx:133-144 — hover-revealed dashboard shortcut button "FPF"
 *     (title="False Positive Filter"), wired via Dashboard.tsx's onFpf -> handleOpenFpf ->
 *     navigate(`/project/${projectId}/fpf`)
 *   - pages/FalsePositiveFilter.tsx:301-345 — PageHeader h1 "False Positive Filter" +
 *     description "Project: <name>"; tabs array (role=tab) in order: "Dashboard",
 *     "Review Filtered", "Configuration", "Miss-Filter Detection"
 *   - components/FPF/FilterDashboard.tsx:269-322 — default tab: h2 "False Positive Filter",
 *     "ISO 21434 compliant vulnerability filtering", "Configuration Active" (auto-populated by
 *     FalsePositiveFilter.tsx's mount effect), "No filter results yet. Run the filter to see
 *     effectiveness metrics.", enabled "Run Filter" button
 *   - pages/FalsePositiveFilter.tsx:392-404 — "Review Filtered" tab with no filterResult yet:
 *     heading "No Filter Results" + "Run the filter to see results here."
 *   - components/FPF/ConfigWizard.tsx:730-780 — "Configuration" tab: h2 "FPF Configuration
 *     Wizard", "Configure the False Positive Filter for your project", step 1 label
 *     "Project Name", footer "Step 1 of 5: Project Information"
 *   - components/FPF/MissFilterPanel.tsx:371-502 — "Miss-Filter Detection" tab with no items:
 *     h3 "Miss-Filter Detection" + empty state "No miss-filters detected"
 *
 * Running the filter against real, scanned vulnerabilities (to populate "Review Filtered" /
 * "Miss-Filter Detection" with actual rows) is out of scope here — that depends on the FPF
 * tiering algorithm's classification of specific CVEs, which is exercised by
 * lib/services/fpf/falsePositiveFilter.test.ts, not this navigation/content-contract spec.
 */

test.describe('False Positive Filter', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Navigation', () => {
    test('should open the false-positive filter from the project detail header button', async ({ page }) => {
      const projectName = `FPF Header Nav ${Date.now()}`
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)

      await page.getByRole('button', { name: 'False Positive Filter' }).click()
      await expect(page).toHaveURL(/\/project\/[^/]+\/fpf$/)
      await expect(page.getByRole('heading', { level: 1, name: 'False Positive Filter' })).toBeVisible()
      await expect(page.getByText(`Project: ${projectName}`)).toBeVisible()
    })

    test('should reveal and open the FPF shortcut on a dashboard project card', async ({ page }) => {
      const projectName = `FPF Card Nav ${Date.now()}`
      await createProjectOnly(page, projectName)

      // The FPF shortcut only renders when ProjectCard receives onFpf (Dashboard.tsx wires it).
      const card = page.locator('.group.rounded-lg.border').filter({ hasText: projectName }).first()
      await card.hover()
      await card.getByRole('button', { name: 'FPF' }).click()

      await expect(page).toHaveURL(/\/project\/[^/]+\/fpf$/)
      await expect(page.getByRole('heading', { level: 1, name: 'False Positive Filter' })).toBeVisible()
    })
  })

  test.describe('Tabs', () => {
    test('should show the four FPF tabs in designed order', async ({ page }) => {
      const projectName = `FPF Tabs Test ${Date.now()}`
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)
      await page.getByRole('button', { name: 'False Positive Filter' }).click()
      await expect(page).toHaveURL(/\/fpf$/)

      const main = page.locator('#main-content')
      // Wait for the lazy FPF page to mount — toHaveURL resolves before the route swaps, so reading
      // tabs immediately would capture the stale project-detail tablist (Overview/Components/…).
      await expect(main.getByRole('heading', { level: 1, name: 'False Positive Filter' })).toBeVisible()
      const tabNames = await main.getByRole('tab').allTextContents()
      expect(tabNames.map((t) => t.trim())).toEqual([
        'Dashboard',
        'Review Filtered',
        'Configuration',
        'Miss-Filter Detection',
      ])
    })
  })

  test.describe('Dashboard Tab', () => {
    test('should render the dashboard with auto-populated configuration and zero stats', async ({ page }) => {
      const projectName = `FPF Dashboard Test ${Date.now()}`
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)
      await page.getByRole('button', { name: 'False Positive Filter' }).click()
      const main = page.locator('#main-content')

      // Dashboard is the default tab; FilterDashboard renders immediately.
      await expect(main.getByText('ISO 21434 compliant vulnerability filtering')).toBeVisible()
      // FalsePositiveFilter.tsx's mount effect builds a default SystemConfig as soon as the
      // project loads, so ConfigurationStatus flips from "Configuration Required" to Active.
      await expect(main.getByText('Configuration Active')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(main.getByText('No filter results yet. Run the filter to see effectiveness metrics.')).toBeVisible()
      await expect(main.getByRole('button', { name: 'Run Filter' })).toBeEnabled()
    })
  })

  test.describe('Review Filtered Tab', () => {
    test('should show the no-results empty state before running the filter', async ({ page }) => {
      const projectName = `FPF Review Test ${Date.now()}`
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)
      await page.getByRole('button', { name: 'False Positive Filter' }).click()
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Review Filtered' }).click()
      await expect(main.getByRole('heading', { name: 'No Filter Results' })).toBeVisible()
      await expect(main.getByText('Run the filter to see results here.')).toBeVisible()
    })

    test.skip('should review real filtered vulnerabilities', async () => {
      // Infeasible as a navigation/content-contract test: populating this tab needs the FPF
      // tiering algorithm's classification of specific scanned CVEs, covered by
      // lib/services/fpf/falsePositiveFilter.test.ts, not asserted here.
    })
  })

  test.describe('Configuration Tab', () => {
    test('should display the configuration wizard first step', async ({ page }) => {
      const projectName = `FPF Config Test ${Date.now()}`
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)
      await page.getByRole('button', { name: 'False Positive Filter' }).click()
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Configuration' }).click()
      await expect(main.getByRole('heading', { name: 'FPF Configuration Wizard' })).toBeVisible()
      await expect(main.getByText('Configure the False Positive Filter for your project')).toBeVisible()
      await expect(main.getByText('Project Name')).toBeVisible()
      await expect(main.getByText('Step 1 of 5: Project Information')).toBeVisible()
    })
  })

  test.describe('Miss-Filter Detection Tab', () => {
    test('should show the no-miss-filters empty state before running the filter', async ({ page }) => {
      const projectName = `FPF Miss Filter Test ${Date.now()}`
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)
      await page.getByRole('button', { name: 'False Positive Filter' }).click()
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Miss-Filter Detection' }).click()
      await expect(main.getByRole('heading', { name: 'Miss-Filter Detection' })).toBeVisible()
      await expect(main.getByText('No miss-filters detected')).toBeVisible()
    })
  })
})
