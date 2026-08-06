import { test, expect, resetAppState } from '../test-helper'
import {
  createProjectOnly,
  navigateToProjectDetail,
  navigateToExecutiveDashboard,
  E2E_SELECTOR_TIMEOUT,
} from '../shared-helpers'

/**
 * Security Assessment Workflow — content contracts
 *
 * The offline seeded environment can drive the full assessment UI, but only the
 * paths that don't need network threat-intel are deterministic. Every kept test
 * below asserts designed content (grounded in source) instead of the previous
 * `if (count > 0)` / regex-OR / `waitFor().catch(() => {})` guards that could never
 * fail. Grounding:
 *   - project-detail/VulnerabilitiesTab.tsx — "Vulnerabilities (0)" + empty state
 *     "No vulnerabilities found" / "Run a vulnerability scan to check for security issues"
 *   - project-detail/HealthTab.tsx + RemediationQueue.tsx — "Component Health Dashboard",
 *     "Total Components", "All components are healthy!", "No components require immediate attention"
 *   - components/ExportDialog.tsx — dialog title "Export Data" + CSV/JSON/PDF format buttons
 *   - lib/analytics/reportBuilder.ts — executive-report-YYYY-MM-DD.pdf
 *   - shell/Sidebar.tsx — Search + contextual Dependency Graph links; Search.tsx h1 "Search"
 *
 * KEV / EPSS / risk-score / vulnerability-detail / filter / sort / trend tests are skipped
 * with reasons: they need a scan that produces enriched vulnerabilities, and KEV/EPSS
 * enrichment requires network catalogs unavailable offline (see the dedicated
 * kev-epss-intelligence spec). createProjectOnly makes a 0-vulnerability project, so there
 * is nothing for those views to render.
 */

test.describe('Security Assessment Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Assessment Setup', () => {
    test('should create assessment project', async ({ page }) => {
      const projectName = 'Security Assessment Project'
      await createProjectOnly(page, projectName)
      await expect(page.getByText(projectName)).toBeVisible()
    })

    test('should configure project for assessment', async ({ page }) => {
      await createProjectOnly(page, 'Configured Assessment')
      await navigateToProjectDetail(page, 'Configured Assessment')
      const main = page.locator('#main-content')

      // The assessment surface is the four project tabs, defaulting to Overview.
      const tabNames = await main.getByRole('tab').allTextContents()
      expect(tabNames.map((t) => t.trim())).toEqual(['Overview', 'Components', 'Vulnerabilities', 'Health'])
      await expect(main.getByRole('heading', { name: 'Overview' })).toBeVisible()
    })

    test('should access executive dashboard', async ({ page }) => {
      await navigateToExecutiveDashboard(page)
      await expect(page.locator('#main-content').getByRole('heading', { name: 'Reports' })).toBeVisible()
    })
  })

  test.describe('Vulnerability Scanning', () => {
    test('should show the vulnerability empty state before scanning', async ({ page }) => {
      await createProjectOnly(page, 'Scan Test Project')
      await navigateToProjectDetail(page, 'Scan Test Project')
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Vulnerabilities' }).click()
      await expect(main.getByText('No vulnerabilities found')).toBeVisible()
      await expect(main.getByText('Run a vulnerability scan to check for security issues')).toBeVisible()
    })

    test('should show a zero vulnerability count', async ({ page }) => {
      await createProjectOnly(page, 'Vuln List Test')
      await navigateToProjectDetail(page, 'Vuln List Test')
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Vulnerabilities' }).click()
      await expect(main.getByRole('heading', { name: 'Vulnerabilities (0)' })).toBeVisible()
    })

    test.skip('should filter vulnerabilities', async () => {
      // Infeasible offline: filtering only exercises anything against a populated vulnerability
      // table, which requires a scan that matches seeded CVEs to imported components.
    })

    test.skip('should sort vulnerabilities', async () => {
      // Infeasible offline: sorting needs a populated vulnerability table (see filter note).
    })
  })

  test.describe('Intelligence Analysis', () => {
    test.skip('should view KEV intelligence', async () => {
      // Infeasible offline: KEV badges need a scanned vuln enriched against the CISA KEV catalog
      // (network). checkKev returns isKev:false from the never-synced local catalog offline.
    })

    test.skip('should view EPSS scores', async () => {
      // Infeasible offline: EPSS scores are fetched from the FIRST.org EPSS API (network).
    })

    test.skip('should view risk scores', async () => {
      // Needs a scanned project: riskScore is computed during enrichVulnerabilities, and
      // createProjectOnly imports no SBOM, so there are no vulnerabilities to score.
    })

    test.skip('should access vulnerability details', async () => {
      // Needs a scanned project: the detail modal opens from a vulnerability row, absent here.
    })
  })

  test.describe('Health Assessment', () => {
    test('should show the component health dashboard', async ({ page }) => {
      await createProjectOnly(page, 'Health Assessment Test')
      await navigateToProjectDetail(page, 'Health Assessment Test')
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Health' }).click()
      await expect(main.getByRole('heading', { name: 'Component Health Dashboard' })).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
      await expect(main.getByText('Total Components')).toBeVisible()
    })

    test('should show the healthy remediation empty state', async ({ page }) => {
      await createProjectOnly(page, 'Component Health Test')
      await navigateToProjectDetail(page, 'Component Health Test')
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Health' }).click()
      // No components ⇒ RemediationQueue renders its all-healthy empty state.
      await expect(main.getByText('All components are healthy!')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(main.getByText('No components require immediate attention')).toBeVisible()
    })

    test.skip('should view health trends', async () => {
      // Infeasible offline: trend direction needs 2+ days of seeded health history; the dedicated
      // health-dashboard spec covers the no-history fallback content.
    })
  })

  test.describe('Remediation Planning', () => {
    test('should show remediation suggestions as all-healthy for a fresh project', async ({ page }) => {
      await createProjectOnly(page, 'Remediation Planning Test')
      await navigateToProjectDetail(page, 'Remediation Planning Test')
      const main = page.locator('#main-content')

      await main.getByRole('tab', { name: 'Health' }).click()
      await expect(main.getByText('All components are healthy!')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(main.getByText('No components require immediate attention')).toBeVisible()
    })

    test('should open the dependency graph for impact analysis', async ({ page }) => {
      await createProjectOnly(page, 'Impact Analysis Test')
      await navigateToProjectDetail(page, 'Impact Analysis Test')

      // Contextual project link in the shell sidebar.
      await page.getByRole('link', { name: 'Dependency Graph' }).click()
      await expect(page).toHaveURL(/\/project\/[^/]+\/graph$/)
      await expect(page.getByRole('heading', { level: 1, name: 'Dependency Graph' })).toBeVisible()
    })

    test('should open the false-positive filter', async ({ page }) => {
      await createProjectOnly(page, 'FPF Planning Test')
      await navigateToProjectDetail(page, 'FPF Planning Test')

      await page.getByRole('button', { name: 'False Positive Filter' }).click()
      await expect(page).toHaveURL(/\/project\/[^/]+\/fpf$/)
      await expect(page.getByRole('heading', { level: 1, name: 'False Positive Filter' })).toBeVisible()
      await expect(page.getByText('Project: FPF Planning Test')).toBeVisible()
    })
  })

  test.describe('Report Generation', () => {
    test('should open the export dialog', async ({ page }) => {
      await createProjectOnly(page, 'Export Test')
      await navigateToProjectDetail(page, 'Export Test')

      await page.getByRole('button', { name: 'Export', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Export Data')).toBeVisible()
    })

    test('should offer CSV, JSON and PDF report formats', async ({ page }) => {
      await createProjectOnly(page, 'Format Test')
      await navigateToProjectDetail(page, 'Format Test')

      await page.getByRole('button', { name: 'Export', exact: true }).first().click()
      const dialog = page.getByRole('dialog')
      for (const format of ['CSV', 'JSON', 'PDF']) {
        await expect(dialog.getByRole('button', { name: format })).toBeVisible()
      }
    })

    test('should generate an executive PDF report', async ({ page }) => {
      await createProjectOnly(page, 'Report Project')
      await navigateToExecutiveDashboard(page)

      const exportButton = page.locator('#main-content').getByRole('button', { name: 'Export Report' })
      await expect(exportButton).toBeEnabled()

      const downloadPromise = page.waitForEvent('download', { timeout: E2E_SELECTOR_TIMEOUT })
      await exportButton.click()
      const download = await downloadPromise
      expect(download.suggestedFilename()).toMatch(/^executive-report-\d{4}-\d{2}-\d{2}\.pdf$/)
    })
  })

  test.describe('Complete Assessment', () => {
    test('should complete the basic assessment workflow', async ({ page }) => {
      const projectName = 'Complete Assessment Test'
      await createProjectOnly(page, projectName)
      await navigateToProjectDetail(page, projectName)
      const main = page.locator('#main-content')

      // Vulnerabilities: designed empty state.
      await main.getByRole('tab', { name: 'Vulnerabilities' }).click()
      await expect(main.getByText('No vulnerabilities found')).toBeVisible()

      // Health: dashboard renders.
      await main.getByRole('tab', { name: 'Health' }).click()
      await expect(main.getByRole('heading', { name: 'Component Health Dashboard' })).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })

      // Reports: executive overview.
      await navigateToExecutiveDashboard(page)
      await expect(main.getByRole('heading', { name: 'Reports' })).toBeVisible()
    })

    test('should navigate the assessment via the sidebar search link', async ({ page }) => {
      await createProjectOnly(page, 'Search Assessment Test')

      await page.getByRole('link', { name: 'Search' }).click()
      await expect(page).toHaveURL(/\/search$/)
      await expect(page.locator('#main-content').getByRole('heading', { name: 'Search' })).toBeVisible()
    })

    test('should use the command palette for quick navigation', async ({ page }) => {
      await createProjectOnly(page, 'Command Assessment Test')

      await page.keyboard.press('Control+Shift+P')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      // Filtering to 'settings' leaves exactly the "Go to Settings" command.
      await dialog.getByRole('combobox').fill('settings')
      await expect(dialog.locator('[data-index]')).toHaveCount(1)
      await expect(dialog.locator('[data-index="0"]')).toHaveText(/Go to Settings/)
    })

    test('should aggregate multiple projects in the executive scope', async ({ page }) => {
      for (let i = 1; i <= 3; i++) {
        await createProjectOnly(page, `Assessment Project ${i}`)
      }
      await navigateToExecutiveDashboard(page)
      await expect(page.locator('#main-content').getByRole('heading', { name: 'Reports' })).toBeVisible()

      // All three created projects are counted in the dashboard scope.
      await page.getByRole('button', { name: 'Dashboard Settings' }).click()
      await expect(page.getByRole('dialog').getByText('Showing data from all 3 project(s)')).toBeVisible()
    })
  })
})
