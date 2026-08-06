import { test, expect, resetAppState } from '../test-helper'
import type { Page } from '@playwright/test'
import { E2E_UI_DELAY, E2E_SELECTOR_TIMEOUT, uploadSbomFile } from '../shared-helpers'
import path from 'node:path'

/**
 * Dependency Graph — content contracts
 *
 * DependencyGraphPage.tsx renders entirely from project.components / project.vulnerabilities
 * already in the store — no scan or network call is needed — so every test below is fully
 * offline-deterministic. Grounding:
 *   - pages/DependencyGraphPage.tsx — h1 "Dependency Graph", description={project.name},
 *     severity <select> options ('All Severities'/'Critical'/'High'/'Medium'/'Low'),
 *     "Vulnerable Only" toggle (bg-primary class when active), footer
 *     "Showing {filtered} of {total} components" + "Critical: N"/"High: N"/"Medium: N"/
 *     "Low: N", "Project not found" fallback
 *   - components/graph/DependencyGraph.tsx — 0-component empty state "No components to
 *     display" / "Upload an SBOM to view the dependency graph", rendered in the same
 *     bordered container + height style as the populated graph
 *   - components/shell/Sidebar.tsx — contextual project-route link "Overview"
 *
 * Two tests previously asserted only on AppShell chrome that renders identically on every
 * route (the shell's single <main> landmark; the TopBar's <header>) regardless of this
 * page's own logic — replaced with assertions on the graph's own container/content, which
 * would actually fail if this page stopped rendering the graph correctly. "should show
 * filter icon" and "should update footer counts when filter changes" asserted nothing
 * specific to this page (any on-page <svg>; an unused footer-text snapshot) — replaced with
 * a DOM-structure-grounded icon check and, for the footer-count test, a real SBOM import
 * (5-component fixture, no scan) so the severity filter has a real effect to observe.
 */

const SAMPLE_SBOM = path.join(import.meta.dirname, '..', 'fixtures', 'sbom', 'sample-cyclonedx.json')

test.describe('Dependency Graph', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Page Load Tests
  // ==========================================================================

  test.describe('Page Load', () => {
    test('should display graph page header', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should display project name in header', async ({ page }) => {
      const projectName = 'Graph Test Project'
      await createProjectAndNavigateToGraph(page, projectName)

      // Scoped to the page content: the project name also renders in the
      // AppShell sidebar's project group label and the TopBar breadcrumb, so an
      // unscoped locator is a strict-mode violation (3 matches).
      await expect(page.locator('#main-content').getByText(projectName)).toBeVisible()
    })

    test('should display back to project button', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible()
    })

    test('should show severity filter dropdown', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select').first()
      await expect(severitySelect).toBeVisible()
    })

    test('should have all severity options in dropdown', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Find the severity filter select. PageHeader isn't a <header> element, so
      // scope the same way the sibling "show severity filter dropdown" test does.
      const severitySelect = page.locator('select').first().first()
      await expect(severitySelect).toBeVisible()

      // <option> elements inside a <select> are not "visible" when dropdown is closed.
      // Verify they exist by checking the select's option values via evaluate.
      const optionTexts = await severitySelect.evaluate((el: HTMLSelectElement) =>
        Array.from(el.options).map((o) => o.text),
      )
      expect(optionTexts).toContain('All Severities')
      expect(optionTexts).toContain('Critical')
      expect(optionTexts).toContain('High')
      expect(optionTexts).toContain('Medium')
      expect(optionTexts).toContain('Low')
    })

    test('should show "Vulnerable Only" toggle button', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('button:has-text("Vulnerable Only")')).toBeVisible()
    })

    test('should display footer with statistics', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('footer')).toBeVisible()
    })

    test('should show component count in footer', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('text=/Showing.*\\d+.*components/i')).toBeVisible()
    })

    test('should show severity counts in footer', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('text=Critical:')).toBeVisible()
      await expect(page.locator('text=High:')).toBeVisible()
      await expect(page.locator('text=Medium:')).toBeVisible()
      await expect(page.locator('text=Low:')).toBeVisible()
    })

    test('should show filter icon', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // The Filter icon renders as a sibling of the severity <select> inside a shared
      // "flex items-center gap-2" row (DependencyGraphPage.tsx: <Filter /> + <select>).
      // PageHeader's own actions wrapper (PageHeader.tsx) coincidentally carries the exact
      // same three Tailwind classes (flex, items-center, gap-2) alongside extras, and is an
      // ancestor of this row — so a class selector scoped to "div.flex.items-center.gap-2"
      // would strict-mode-match both that wrapper AND this row (both satisfy :has(select)).
      // The page now has three <select>s (severity filter + the two FR-11.2-b path-highlight
      // pickers), but only the severity filter's row carries the Filter <svg>, so scoping to
      // the <select> whose parent contains an svg stays unambiguous. .first() is the severity
      // select (DOM order: it renders before the path pickers).
      const filterRow = page.locator('#main-content select').first().locator('xpath=..')
      await expect(filterRow.locator('svg')).toBeVisible()
    })
  })

  // ==========================================================================
  // Filter Tests
  // ==========================================================================

  test.describe('Filters', () => {
    test('should filter by critical severity', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select').first()
      await severitySelect.selectOption('critical')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Verify filter applied - check select value
      await expect(severitySelect).toHaveValue('critical')
    })

    test('should filter by high severity', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select').first()
      await severitySelect.selectOption('high')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(severitySelect).toHaveValue('high')
    })

    test('should filter by medium severity', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select').first()
      await severitySelect.selectOption('medium')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(severitySelect).toHaveValue('medium')
    })

    test('should filter by low severity', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select').first()
      await severitySelect.selectOption('low')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(severitySelect).toHaveValue('low')
    })

    test('should reset to all severities', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select').first()
      await severitySelect.selectOption('critical')
      await page.waitForTimeout(E2E_UI_DELAY)
      await severitySelect.selectOption('all')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(severitySelect).toHaveValue('all')
    })

    test('should toggle vulnerable only filter on', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const toggleButton = page.locator('button:has-text("Vulnerable Only")')
      await toggleButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Button should have active styling
      await expect(toggleButton).toHaveClass(/bg-primary/)
    })

    test('should toggle vulnerable only filter off', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const toggleButton = page.locator('button:has-text("Vulnerable Only")')

      // Toggle on
      await toggleButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Toggle off
      await toggleButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Button should not have active styling
      await expect(toggleButton).not.toHaveClass(/bg-primary/)
    })

    test('should combine severity and vulnerable filters', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Apply severity filter
      const severitySelect = page.locator('select').first()
      await severitySelect.selectOption('high')

      // Apply vulnerable only
      const toggleButton = page.locator('button:has-text("Vulnerable Only")')
      await toggleButton.click()

      await page.waitForTimeout(E2E_UI_DELAY)

      // Both filters should be active
      await expect(severitySelect).toHaveValue('high')
      await expect(toggleButton).toHaveClass(/bg-primary/)
    })

    test('should update footer counts when filter changes', async ({ page }) => {
      const projectName = 'Graph Filter Test Project'
      await createProjectAndOpenDetail(page, projectName)

      // Local CycloneDX parse only (no scan) — the project ends up with 5 components and 0
      // vulnerabilities, so every severity bucket in filteredComponents is empty
      // (DependencyGraphPage.tsx filteredComponents, L43-59).
      await uploadSbomFile(page, SAMPLE_SBOM)
      await navigateFromDetailToGraph(page)

      const footer = page.locator('footer')
      await expect(footer.getByText('Showing 5 of 5 components')).toBeVisible()

      // Selecting a severity that matches zero vulnerabilities filters every component out —
      // proving the footer count is actually driven by the select, not a static snapshot.
      await page.locator('select').first().selectOption('critical')
      await page.waitForTimeout(E2E_UI_DELAY)
      await expect(footer.getByText('Showing 0 of 5 components')).toBeVisible()
    })
  })

  // ==========================================================================
  // Navigation Tests
  // ==========================================================================

  test.describe('Navigation', () => {
    test('should navigate back to project detail', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await page.getByRole('link', { name: 'Overview' }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should no longer be on graph page
      await expect(page).not.toHaveURL(/\/graph$/)
    })

    test('should preserve project context when navigating back', async ({ page }) => {
      const projectName = 'Navigation Test Project'
      await createProjectAndNavigateToGraph(page, projectName)

      await page.getByRole('link', { name: 'Overview' }).click()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show project name on detail page. Scoped to the page content:
      // the project name also renders in the AppShell sidebar and breadcrumb,
      // so an unscoped locator is a strict-mode violation (3 matches).
      await expect(page.locator('#main-content').getByText(projectName)).toBeVisible()
    })

    test('should show arrow left icon on back button', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible()
    })

    test('should handle browser back navigation', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await page.goBack()
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should navigate away from graph
      await expect(page).not.toHaveURL(/\/graph$/)
    })
  })

  // ==========================================================================
  // Empty State Tests
  // ==========================================================================

  test.describe('Empty States', () => {
    test('should handle project with no components', async ({ page }) => {
      await createProjectAndNavigateToGraph(page) // Empty project

      // Page should still render
      await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
    })

    test('should show zero counts for empty project', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Footer should show 0 components
      await expect(page.locator('text=/Showing 0.*components/i')).toBeVisible()
    })

    test('should show zero vulnerability counts', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // All severity counts should be 0
      await expect(page.locator('text=Critical: 0')).toBeVisible()
      await expect(page.locator('text=High: 0')).toBeVisible()
    })

    test('should handle project not found', async ({ page }) => {
      // Navigate to non-existent project graph using SPA navigation
      await page.evaluate((path) => {
        const nav = (window as unknown as Record<string, unknown>).__navigate
        if (typeof nav === 'function') {
          nav(path)
        }
      }, '/project/non-existent-id/graph')
      await page.waitForTimeout(E2E_UI_DELAY)

      // Should show "Project not found" message
      await expect(page.locator('text=/Project not found/i')).toBeVisible({ timeout: 5000 })
    })
  })

  // ==========================================================================
  // Graph Container Tests
  // ==========================================================================

  test.describe('Graph Container', () => {
    test('should have graph container element', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // createProjectAndNavigateToGraph makes a project with 0 components, so
      // DependencyGraph.tsx renders its dedicated empty state instead of the cytoscape
      // canvas. Asserting on <main> (present unconditionally on every route via AppShell)
      // would pass even if this page rendered nothing at all, so assert the graph's own
      // content instead.
      await expect(page.locator('#main-content').getByText('No components to display')).toBeVisible()
      await expect(page.locator('#main-content').getByText('Upload an SBOM to view the dependency graph')).toBeVisible()
    })

    test('should apply border styling to graph', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // Graph container should have border class. The AppShell now owns the single
      // <main> landmark, so target the graph's bordered container within the content
      // region directly rather than assuming it is main's first child.
      const graphContainer = page.locator('#main-content .rounded-lg.border').first()
      await expect(graphContainer).toHaveClass(/border/)
    })

    test('should have proper height for graph area', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // AppShell's <main> always fills the viewport regardless of this page's own layout,
      // so measure the graph's own bordered container instead — it carries
      // height="calc(100vh - 180px)" from DependencyGraphPage.tsx.
      const graphContainer = page.locator('#main-content .rounded-lg.border').first()
      const boundingBox = await graphContainer.boundingBox()

      expect(boundingBox?.height).toBeGreaterThan(200)
    })
  })

  // ==========================================================================
  // Responsive Design Tests
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display on tablet viewport', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
      await expect(page.locator('select').first()).toBeVisible()
      await expect(page.locator('button:has-text("Vulnerable Only")')).toBeVisible()
    })

    test('should show footer on tablet', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('footer')).toBeVisible()
    })

    test('should allow filter interaction on tablet', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      const severitySelect = page.locator('select').first()
      await severitySelect.selectOption('high')

      await expect(severitySelect).toHaveValue('high')
    })
  })

  test.describe('Mobile Design', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('should display on mobile viewport', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
    })

    test('should stack header elements on mobile', async ({ page }) => {
      await createProjectAndNavigateToGraph(page)

      // page.locator('header') would match the TopBar's global <header>, present
      // unconditionally on every route regardless of this page's own layout. The actual
      // "stacking" concern is PageHeader's flex-wrap row (title + actions) — assert its
      // filter controls are still visible at mobile width rather than an unrelated element.
      await expect(page.locator('select').first()).toBeVisible()
      await expect(page.locator('button:has-text("Vulnerable Only")')).toBeVisible()
    })
  })
})

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Create a project and land on its detail page (without navigating to the graph).
 */
async function createProjectAndOpenDetail(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  await page.locator('#project-name').fill(name)
  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })

  await page.waitForTimeout(E2E_UI_DELAY)

  // Navigate to project detail
  const projectCard = page.locator('.group').filter({ hasText: name }).first()
  await projectCard.click()

  await expect(page.getByRole('heading', { name: new RegExp(name, 'i') })).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * From the project detail page, navigate to its dependency graph via SPA routing
 * (a full page reload would drop client-side project/component state).
 */
async function navigateFromDetailToGraph(page: Page): Promise<void> {
  const url = page.url()
  const projectId = url.match(/\/project\/([^/]+)/)?.[1]
  if (!projectId) throw new Error('Project id not found in current URL')

  await page.evaluate((path) => {
    const nav = (window as unknown as Record<string, unknown>).__navigate
    if (typeof nav === 'function') {
      nav(path)
    }
  }, `/project/${projectId}/graph`)

  await page.waitForTimeout(E2E_UI_DELAY)
  await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
}

/**
 * Create a project and navigate to its dependency graph
 */
async function createProjectAndNavigateToGraph(page: Page, name = 'Graph Test Project'): Promise<void> {
  await createProjectAndOpenDetail(page, name)
  await navigateFromDetailToGraph(page)
}
