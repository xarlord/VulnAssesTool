import { test, expect, resetAppState } from '../test-helper'
import type { Page } from '@playwright/test'
import { navigateToProjectDetail, deleteProject } from '../shared-helpers'

/**
 * E2E Tests for Navigation Flow — content contracts
 *
 * Tests the complete user flow for navigating through the application: dashboard →
 * project detail → back to dashboard, multi-project navigation, tab switching, browser
 * back/forward, and URL correctness.
 *
 * This pass replaces the false-green guards that made several tests pass regardless of
 * app behavior:
 *   - "back button" test gated its assertions behind `if (backButton.count() > 0)`, but
 *     AppShell has no per-page back button anymore (see shared-helpers.ts
 *     createMultipleProjects comment, and PageHeader.tsx's own comment that navigation
 *     now lives in the shell, not per-page) — the branch was always the goBack()
 *     fallback. Assert that path directly.
 *   - "tabs" test gated each tab click behind `if (tab.count() > 0)` with no assertion after
 *     clicking — now clicks the (always-present) tabs and asserts the tab-specific content
 *     each one renders.
 *   - "statistics" test branched on a selector that never returns 0 in this suite (dead
 *     `else` never taken) and asserted only that *some* "components"/"vulnerabilities" text
 *     exists anywhere on the page — now asserts the exact per-card template.
 *   - "empty state" test wrapped its only assertions in `if (projectCount === 0)`, which is
 *     always false here (beforeEach creates 2 projects) — now actually deletes both projects
 *     so the empty state is reachable and its content is asserted for real.
 *   - "scroll position" test asserted `scrollY >= 0`, a tautology (scrollY can't be negative)
 *     that can never fail regardless of whether scroll position is preserved — skipped, since
 *     the app has no scroll-restoration feature to verify (plain react-router routes, see
 *     App.tsx; no ScrollRestoration or manual save/restore).
 *   - "URL correctness" test asserted `currentUrl` is truthy (always true) — dropped that
 *     line and kept only the grounded route assertions.
 *
 * Grounding:
 *   - App.tsx — route table: "/" → "/dashboard" (replace), "/project/:projectId", etc.
 *   - pages/Dashboard.tsx — "New Project" button; empty state heading "No projects yet" +
 *     button "Create Your First Project" (rendered only when projects.length === 0)
 *   - components/ProjectCard.tsx — card root `.group.rounded-lg.border`; per-card text
 *     "<N> components" / "<N> vulnerabilities" (exact template, no other wording)
 *   - components/PageHeader.tsx — project name renders as an <h1>
 *   - pages/ProjectDetail.tsx — TABS = ['Overview', 'Components', 'Vulnerabilities', 'Health']
 *   - pages/project-detail/{OverviewTab,ComponentsTab,VulnerabilitiesTab}.tsx — "Overview" h2,
 *     "No components found", "Vulnerabilities (0)" heading
 */
test.describe('Navigation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any persisted state from previous test runs
    await resetAppState(page)

    // Wait for the dashboard to be visible (React app has rendered)
    // The "New Project" button is always visible when the dashboard is loaded
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })

    // Create a couple of test projects for navigation with unique names
    await createTestProject(page, 'Project Alpha', 'First test project')
    await createTestProject(page, 'Project Beta', 'Second test project')

    // Verify both projects are created before running tests
    await expect(page.getByText('Project Alpha', { exact: false })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Project Beta', { exact: false })).toBeVisible({ timeout: 5000 })
  })

  test('should display dashboard with projects', async ({ page }) => {
    // Verify dashboard is loaded by checking for the New Project button
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()

    // Verify both projects are displayed (using partial match for names with timestamp)
    await expect(page.getByText('Project Alpha', { exact: false })).toBeVisible()
    await expect(page.getByText('Project Beta', { exact: false })).toBeVisible()

    // Verify project descriptions
    await expect(page.getByText('First test project')).toBeVisible()
    await expect(page.getByText('Second test project')).toBeVisible()
  })

  test('should navigate to project details', async ({ page }) => {
    // Click on first project (using the unique name)
    await page.getByText('Project Alpha', { exact: false }).first().click()

    // Wait for navigation and verify the page changed
    await page.waitForLoadState('domcontentloaded')

    // Verify navigation to project detail page
    await expect(page.getByRole('heading', { name: /Project Alpha/i })).toBeVisible({ timeout: 5000 })

    // Verify project detail elements are visible
    await expect(page.getByRole('tab', { name: /overview/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /components/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /vulnerabilities/i })).toBeVisible()
  })

  test('should navigate back to dashboard from project details', async ({ page }) => {
    // Navigate to project details
    await navigateToProjectDetail(page, 'Project Alpha')

    // AppShell has no per-page back button — see shared-helpers.ts createMultipleProjects
    // comment and PageHeader.tsx (navigation now lives in the shell, not per-page); browser
    // back is the only path here.
    await page.goBack()
    await page.waitForLoadState('domcontentloaded')

    // Verify back on dashboard
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Project Alpha', { exact: false })).toBeVisible()
  })

  test('should navigate between multiple projects', async ({ page }) => {
    // Navigate to first project
    await page.getByText('Project Alpha', { exact: false }).first().click()
    await expect(page.getByRole('heading', { name: /Project Alpha/i })).toBeVisible({ timeout: 5000 })

    // Go back to dashboard using browser back
    await page.goBack()
    await page.waitForLoadState('domcontentloaded')

    // Navigate to second project
    await page.getByText('Project Beta', { exact: false }).first().click()
    await expect(page.getByRole('heading', { name: /Project Beta/i })).toBeVisible({ timeout: 5000 })

    // Go back to dashboard using browser back
    await page.goBack()
    await page.waitForLoadState('domcontentloaded')

    // Verify back on dashboard
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 5000 })
  })

  test('should work with browser back and forward buttons', async ({ page }) => {
    // Navigate to first project
    await page.getByText('Project Alpha', { exact: false }).first().click()
    await expect(page.getByRole('heading', { name: /Project Alpha/i })).toBeVisible({ timeout: 5000 })

    // Use browser back button
    await page.goBack()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 5000 })

    // Use browser forward button
    await page.goForward()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: /Project Alpha/i })).toBeVisible({ timeout: 5000 })
  })

  test('should navigate between tabs in project details', async ({ page }) => {
    await navigateToProjectDetail(page, 'Project Alpha')
    const main = page.locator('#main-content')

    // Each tab click is asserted against the content that tab actually renders
    // (ProjectDetail.tsx TABS + the tab components), not just a conditional click.
    await main.getByRole('tab', { name: 'Components' }).click()
    await expect(main.getByText('No components found')).toBeVisible()

    await main.getByRole('tab', { name: 'Vulnerabilities' }).click()
    await expect(main.getByRole('heading', { name: 'Vulnerabilities (0)' })).toBeVisible()

    await main.getByRole('tab', { name: 'Overview' }).click()
    await expect(main.getByRole('heading', { name: 'Overview' })).toBeVisible()
  })

  test('should show project statistics on dashboard cards', async ({ page }) => {
    // ProjectCard.tsx renders one ".group.rounded-lg.border" card per project, each with an
    // exact "<N> components" / "<N> vulnerabilities" line (ProjectCard.tsx:76,82).
    const projectCards = page.locator('.group.rounded-lg.border')
    await expect(projectCards).toHaveCount(2)

    const alphaCard = projectCards.filter({ hasText: 'Project Alpha' })
    await expect(alphaCard.getByText(/^\d+ components$/)).toBeVisible()
    await expect(alphaCard.getByText(/^\d+ vulnerabilities$/)).toBeVisible()
  })

  test('should display empty state when no projects exist', async ({ page }) => {
    // Delete both beforeEach-created projects so the empty state is actually reachable,
    // instead of gating its assertions behind an `if (projectCount === 0)` that is always
    // false in this describe block.
    await deleteProject(page, 'Project Alpha')
    await deleteProject(page, 'Project Beta')

    // Dashboard.tsx renders this literal block only when projects.length === 0.
    await expect(page.getByRole('heading', { name: 'No projects yet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Your First Project' })).toBeVisible()
  })

  test.skip('should maintain scroll position when navigating back', async () => {
    // Not implemented: App.tsx's routes use plain react-router navigation with no
    // ScrollRestoration or manual scroll save/restore, so asserting `scrollY >= 0` is a
    // tautology that can never fail regardless of whether scroll position is preserved.
  })

  test('should update URL correctly during navigation', async ({ page }) => {
    // Navigate to first project
    await navigateToProjectDetail(page, 'Project Alpha')
    await expect(page).toHaveURL(/\/project\/[^/]+$/)

    // Navigate back — App.tsx redirects "/" to "/dashboard" (replace), so browser back from
    // the detail page lands on "/dashboard", not "/".
    await page.goBack()
    await page.waitForLoadState('domcontentloaded')
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})

/**
 * Helper function to create a test project with unique name and description.
 */
async function createTestProject(page: Page, name: string, description: string): Promise<string> {
  const uniqueName = `${name} ${Date.now()}`
  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  await page.locator('#project-name').fill(uniqueName)
  if (description) {
    await page.locator('#project-description').fill(description)
  }
  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5000 })
  return uniqueName
}
