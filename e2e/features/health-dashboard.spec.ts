/**
 * Health Dashboard — content contracts
 *
 * The Health tab is the 4th project tab and renders unconditionally once a project
 * detail page is open. Its content is fully deterministic in the offline seeded
 * environment: importing the 5-component CycloneDX fixture with NO scan leaves every
 * component vulnerability-free, so each scores 100 ("excellent"). We therefore assert
 * the exact health assessment the app computes, not mere element presence.
 *
 * Grounded in the shipped source (not speculation about future UI):
 *   - pages/project-detail/HealthTab.tsx        — section layout + Remediation Queue
 *   - components/HealthDashboard.tsx            — score cards, banners, category breakdown
 *   - components/RemediationQueue.tsx           — "all healthy" empty state
 *   - lib/health/healthScore.ts                 — 0 vulns ⇒ score 100 ⇒ category "excellent"
 *
 * The previous version of this file gated every assertion behind `if (count > 0)` /
 * `isHealthTabAvailable()` and created projects with `createProjectOnly` (which stays on
 * the dashboard, so the Health tab was never opened). 19 of 24 tests therefore executed
 * zero assertions, and several asserted UI that was never built (gauges, sort/filter
 * headers, "Fix"/"Update" buttons). Those are replaced here with real content contracts.
 */
import { test, expect, resetAppState } from '../test-helper'
import type { Page } from '@playwright/test'
import { createTestProject, navigateToHealthTab, uploadSbomFile } from '../shared-helpers'
import path from 'node:path'

const CYCLONEDX_FIXTURE = path.join(import.meta.dirname, '..', 'fixtures', 'sbom', 'sample-cyclonedx.json')

/**
 * Create a project, import the 5-component CycloneDX fixture (no scan → all excellent),
 * and open the Health tab. Returns with the Health dashboard rendered.
 */
async function openHealthDashboardForImportedProject(page: Page, name: string): Promise<void> {
  await createTestProject(page, name)
  await uploadSbomFile(page, CYCLONEDX_FIXTURE)
  await navigateToHealthTab(page)
}

test.describe('Health Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Tab', () => {
    test('is the fourth project tab, labelled "Health"', async ({ page }) => {
      await createTestProject(page, 'Health Tab Order')
      // The exact set and order is the contract: adding/removing/reordering a tab must fail here.
      const tabNames = await page.locator('#main-content').getByRole('tab').allTextContents()
      expect(tabNames.map((t) => t.trim())).toEqual(['Overview', 'Components', 'Vulnerabilities', 'Health'])
    })

    test('opening it renders the Component Health Dashboard', async ({ page }) => {
      await createTestProject(page, 'Health Tab Open')
      await navigateToHealthTab(page)
      await expect(
        page.locator('#main-content').getByRole('heading', { name: 'Component Health Dashboard' }),
      ).toBeVisible()
    })
  })

  test.describe('Content contract — 5 imported components, all excellent', () => {
    test('reports an average score of 100/100 over 5 components', async ({ page }) => {
      await openHealthDashboardForImportedProject(page, 'Health Scores')
      const main = page.locator('#main-content')

      // Every unscanned component is vulnerability-free ⇒ score 100 ⇒ average 100.
      const avgCard = main.locator('div.rounded-lg.border').filter({ hasText: 'Average Health Score' }).first()
      await expect(avgCard).toContainText('100/100')

      // The five fixture components are all counted.
      const totalCard = main.locator('div.rounded-lg.border').filter({ hasText: 'Total Components' }).first()
      await expect(totalCard).toContainText('5')
    })

    test('shows the "all excellent" banner and 0 components needing attention', async ({ page }) => {
      await openHealthDashboardForImportedProject(page, 'Health Excellent')
      const main = page.locator('#main-content')

      // Banner only renders when averageScore === 100 AND every component is excellent — a
      // precise signal that health was actually computed from the imported components.
      await expect(main.getByText('All Components Show Excellent Health')).toBeVisible()

      const attentionCard = main.locator('div.rounded-lg.border').filter({ hasText: 'Needs Attention' }).first()
      await expect(attentionCard).toContainText('0')
    })

    test('breaks components down by category with all 5 in Excellent', async ({ page }) => {
      await openHealthDashboardForImportedProject(page, 'Health Categories')
      const main = page.locator('#main-content')
      const categoryCard = main.locator('div.rounded-lg.border').filter({ hasText: 'Components by Category' }).first()

      for (const label of ['Critical', 'Poor', 'Fair', 'Good', 'Excellent']) {
        await expect(categoryCard.getByText(label, { exact: true })).toBeVisible()
      }

      // The Excellent row carries the count of 5; the other rows are 0.
      const excellentRow = categoryCard
        .locator('div.flex.items-center.justify-between')
        .filter({ hasText: 'Excellent' })
      await expect(excellentRow).toContainText('5')
    })

    test('renders the distribution, metrics and trend sections', async ({ page }) => {
      await openHealthDashboardForImportedProject(page, 'Health Sections')
      const main = page.locator('#main-content')
      for (const heading of ['Health Distribution', 'Components by Category', 'Health Metrics', 'Health Score Trend']) {
        await expect(main.getByRole('heading', { name: heading })).toBeVisible()
      }
    })

    test('remediation queue is empty when every component is healthy', async ({ page }) => {
      await openHealthDashboardForImportedProject(page, 'Health Remediation')
      const main = page.locator('#main-content')
      await expect(main.getByRole('heading', { name: 'Remediation Queue' })).toBeVisible()
      // No component needs remediation ⇒ RemediationQueue renders its healthy empty state.
      await expect(main.getByText('All components are healthy')).toBeVisible()
    })
  })
})
