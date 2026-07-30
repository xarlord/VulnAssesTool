/**
 * Executive Dashboard ("Reports") — content contracts
 *
 * The page is fully client-side: metrics are computed by lib/analytics from the Zustand
 * project store, so its output is deterministic offline. Every assertion below is grounded
 * in the shipped source rather than gated behind `if (count > 0)` / regex-OR locators /
 * `.waitFor(...).catch(() => {})` (the previous version asserted "may or may not" on almost
 * every behaviour, so nothing could fail):
 *
 *   - executive/ExecutiveDashboard.tsx     — "Reports" title + exact description; always-on
 *                                            "Executive Summary" banner; empty state
 *                                            ("No Data Available" + guidance + Go to Dashboard);
 *                                            six-widget grid when >=1 project is in range;
 *                                            header "Export Report" disabled when 0 projects.
 *   - executive/widgets/DashboardConfig.tsx — "Dashboard Settings" trigger opens a dialog with
 *                                            the four exact date presets, project-scope buttons
 *                                            and the "Showing data from all N project(s)" footer.
 *   - executive/widgets/RiskGauge.tsx       — "Overall Risk Level" + Critical/High stat cells.
 *   - executive/widgets/ComplianceStatus.tsx — "Compliance Status" + "Overall SLA Compliance".
 *   - lib/analytics/reportBuilder.ts        — PDF filename `executive-report-YYYY-MM-DD.pdf`.
 *
 * PageHeader renders NO navigation (its comment: navigation lives in the shell), so the
 * "Dashboard" link is the AppShell sidebar nav — asserted once as real navigation, not as a
 * per-page back button. A freshly created project has 0 vulnerabilities, so criticalCount /
 * highCount are 0 by construction; computed metrics that depend on the analytics thresholds
 * (SLA %, health score) are NOT asserted as exact values.
 */
import { test, expect, resetAppState } from '../test-helper'
import { createProjectOnly, navigateToExecutiveDashboard, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

const WIDGET_HEADINGS = [
  'Overall Risk Level',
  'Compliance Status',
  'Team Productivity',
  'Project Health Comparison',
  'Vulnerability Trends',
  'Action Items',
]

test.describe('Executive Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Page load', () => {
    test('shows the "Reports" title and exact description', async ({ page }) => {
      await navigateToExecutiveDashboard(page)
      const main = page.locator('#main-content')
      await expect(main.getByRole('heading', { name: 'Reports' })).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(main.getByText('High-level security overview and compliance metrics', { exact: true })).toBeVisible()
    })

    test('always renders the Executive Summary banner', async ({ page }) => {
      await navigateToExecutiveDashboard(page)
      // Rendered above the data grid, so it shows even with no projects.
      await expect(page.locator('#main-content').getByRole('heading', { name: 'Executive Summary' })).toBeVisible()
    })
  })

  test.describe('Empty state (no projects)', () => {
    test('shows "No Data Available" with the create-projects guidance', async ({ page }) => {
      await navigateToExecutiveDashboard(page)
      const main = page.locator('#main-content')
      await expect(main.getByRole('heading', { name: 'No Data Available' })).toBeVisible()
      await expect(
        main.getByText('Create projects and upload SBOMs to see executive dashboard data.', { exact: true }),
      ).toBeVisible()
      // The empty state offers a route back to the dashboard only when there are no projects at all.
      await expect(main.getByRole('button', { name: 'Go to Dashboard' })).toBeVisible()
    })

    test('disables the header Export Report button when there is no data', async ({ page }) => {
      await navigateToExecutiveDashboard(page)
      // disabled={isExporting || filteredProjects.length === 0}
      await expect(page.locator('#main-content').getByRole('button', { name: 'Export Report' })).toBeDisabled()
    })
  })

  test.describe('Dashboard Settings dialog', () => {
    test('opens a configuration dialog with the four exact date presets', async ({ page }) => {
      await navigateToExecutiveDashboard(page)
      await page.getByRole('button', { name: 'Dashboard Settings' }).click()

      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Dashboard Configuration')).toBeVisible()
      await expect(dialog.getByText('Date Range', { exact: true })).toBeVisible()
      for (const label of ['Last 7 days', 'Last 30 days', 'Last 90 days', 'Last 12 months']) {
        await expect(dialog.getByRole('button', { name: label })).toBeVisible()
      }
    })

    test('marks a date preset selected after it is clicked', async ({ page }) => {
      await navigateToExecutiveDashboard(page)
      await page.getByRole('button', { name: 'Dashboard Settings' }).click()

      const dialog = page.getByRole('dialog')
      const sevenDays = dialog.getByRole('button', { name: 'Last 7 days' })
      await sevenDays.click()
      // isSelected ⇒ 'border-primary …' on the chosen preset (source: DashboardConfig L119-121).
      await expect(sevenDays).toHaveClass(/border-primary/)
    })

    test('reports the exact in-scope project count', async ({ page }) => {
      await createProjectOnly(page, 'Scope Project One')
      await createProjectOnly(page, 'Scope Project Two')
      await createProjectOnly(page, 'Scope Project Three')
      await navigateToExecutiveDashboard(page)
      await page.getByRole('button', { name: 'Dashboard Settings' }).click()

      // Footer for the 'all' scope: `Showing data from all ${projects.length} project(s)`.
      await expect(page.getByRole('dialog').getByText('Showing data from all 3 project(s)')).toBeVisible()
    })

    test('switching to "Selected Projects" lists the project and shows 0 selected', async ({ page }) => {
      const projectName = 'Selectable Project'
      await createProjectOnly(page, projectName)
      await navigateToExecutiveDashboard(page)
      await page.getByRole('button', { name: 'Dashboard Settings' }).click()

      const dialog = page.getByRole('dialog')
      await dialog.getByRole('button', { name: 'Selected Projects' }).click()
      // The scoped checkbox list renders the project, and nothing is selected yet.
      await expect(dialog.getByText(projectName)).toBeVisible()
      await expect(dialog.getByText('Showing data from 0 selected project(s)')).toBeVisible()
    })
  })

  test.describe('Widgets (one project in scope)', () => {
    test('renders all six executive widgets', async ({ page }) => {
      await createProjectOnly(page, 'Widget Grid Project')
      await navigateToExecutiveDashboard(page)
      const main = page.locator('#main-content')
      for (const heading of WIDGET_HEADINGS) {
        await expect(main.getByRole('heading', { name: heading })).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      }
    })

    test('the risk gauge reports 0 critical and 0 high for an unscanned project', async ({ page }) => {
      await createProjectOnly(page, 'Risk Gauge Project')
      await navigateToExecutiveDashboard(page)
      const main = page.locator('#main-content')

      const riskCard = main.locator('div.bg-card.rounded-lg.border').filter({ hasText: 'Overall Risk Level' })
      await expect(riskCard).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      // No SBOM imported ⇒ no vulnerabilities ⇒ both severity tallies are exactly 0.
      await expect(riskCard.locator('div.bg-muted').filter({ hasText: 'Critical' })).toContainText('0')
      await expect(riskCard.locator('div.bg-muted').filter({ hasText: 'High' })).toContainText('0')
    })

    test('the compliance widget shows the Overall SLA section with its target', async ({ page }) => {
      await createProjectOnly(page, 'Compliance Project')
      await navigateToExecutiveDashboard(page)
      const main = page.locator('#main-content')

      const complianceCard = main.locator('div.bg-card.rounded-lg.border').filter({ hasText: 'Compliance Status' })
      await expect(complianceCard).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(complianceCard.getByText('Overall SLA Compliance')).toBeVisible()
      await expect(complianceCard.getByText('Target: 80%')).toBeVisible()
    })
  })

  test.describe('Export', () => {
    test('exports a dated PDF report when data is present', async ({ page }) => {
      await createProjectOnly(page, 'Export Project')
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('#main-content').getByRole('button', { name: 'Export Report' })
      await expect(exportButton).toBeEnabled()

      const downloadPromise = page.waitForEvent('download', { timeout: E2E_SELECTOR_TIMEOUT })
      await exportButton.click()
      const download = await downloadPromise
      // reportBuilder.ts: `executive-report-${YYYY-MM-DD}.pdf`.
      expect(download.suggestedFilename()).toMatch(/^executive-report-\d{4}-\d{2}-\d{2}\.pdf$/)
    })
  })

  test.describe('Navigation', () => {
    test('the shell "Dashboard" link returns to the project dashboard', async ({ page }) => {
      await navigateToExecutiveDashboard(page)
      await page.getByRole('link', { name: 'Dashboard' }).click()
      await expect(page).toHaveURL(/\/dashboard$/, { timeout: E2E_SELECTOR_TIMEOUT })
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
    })

    test.skip('navigate to a project from the Action Items widget', async () => {
      // Offline-infeasible as a content contract: ActionItems renders clickable project links only
      // from summary.topRisks, which is empty for an unscanned (0-vulnerability) project. Populating
      // it deterministically needs a scan that produces risks — covered by the scan workflows, not here.
    })
  })

  test.describe('Responsive design', () => {
    test.describe('desktop', () => {
      test.use({ viewport: { width: 1280, height: 720 } })
      test('renders the full widget grid at desktop width', async ({ page }) => {
        await createProjectOnly(page, 'Desktop Project')
        await navigateToExecutiveDashboard(page)
        const main = page.locator('#main-content')
        for (const heading of WIDGET_HEADINGS) {
          await expect(main.getByRole('heading', { name: heading })).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
        }
      })
    })

    test.describe('tablet', () => {
      test.use({ viewport: { width: 768, height: 1024 } })
      test('renders the Reports header at tablet width', async ({ page }) => {
        await navigateToExecutiveDashboard(page)
        await expect(page.locator('#main-content').getByRole('heading', { name: 'Reports' })).toBeVisible()
      })
    })
  })
})
