import { test, expect, resetAppState } from '../test-helper'
import type { Page } from '@playwright/test'
import { createProjectOnly, navigateToSettings, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

/**
 * E2E Tests for Error Recovery and Error Boundary — content contracts
 *
 * Deterministic, offline-safe checks only. Grounding:
 *   - components/ErrorBoundary.tsx — fallback heading "Something went wrong" (L257), "Try Again"
 *     (L295) / "Go Home" (L310) buttons. Neither App.tsx nor the e2e harness exposes any
 *     fault-injection hook (no window.__crash, debug route, query flag, etc.) to actually trigger
 *     a React render error from Playwright, so the tests that would need one to be non-vacuous
 *     are test.skip()-ed with reasons — ErrorBoundary.test.tsx already unit-tests the
 *     catch/retry/reset behavior directly by throwing inside a child component.
 *   - store/useStore.ts:433 — persist middleware key 'vuln-assess-storage'; partialize (L434-442)
 *     keeps `projects` (name included, only vulnerabilities/components/dependencyGraph stripped).
 *     addProject (L227-232) writes via a plain synchronous `set()`, and no throttle/debounce is
 *     configured on the persist middleware, so localStorage is populated by the time the project
 *     name appears in the DOM.
 *   - components/CreateProjectDialog.tsx:70,74 — `<Dialog open={open} onOpenChange={(next) =>
 *     !next && handleCancel()}>` with `<DialogTitle>Create New Project</DialogTitle>`; Radix's
 *     Escape key fires onOpenChange(false), making dialog-open/Escape-to-close a deterministic
 *     client-side probe for "does the UI still respond" under emulated slow network.
 *   - server/app.ts (SPA fallback) — `app.get('/{*path}', ...)` serves index.html for every
 *     non-API GET request, so a full reload on /settings deterministically re-resolves the
 *     client-side route to Settings without needing a dashboard-and-retry fallback.
 *   - pages/Settings.tsx:732 — `<PageHeader title="Settings" />`, rendered as an `<h1>`.
 *
 * Fixed here: an assertion-free network test (no `expect()` at all — always green), an if/else
 * that silently swapped a real localStorage-persistence check for an unrelated UI check when the
 * "real" branch failed, and an `.isVisible().catch(() => false)` fallback that always ended in
 * the same passing state regardless of what reload actually did.
 */
test.describe('Error Recovery', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Application Stability', () => {
    test('should load dashboard without errors', async ({ page }) => {
      // Verify the main components load correctly
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
      await expect(page.getByRole('button', { name: /import sbom/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /export/i })).toBeVisible()

      // Check for any error messages on the page
      const errorElements = page.locator('text=/error/i')
      const errorCount = await errorElements.count()

      // Should not have any visible error messages
      expect(errorCount).toBe(0)
    })

    test('should handle page refresh without losing data', async ({ page }) => {
      // Create a project
      const projectName = await createTestProject(page, 'Refresh Test', 'Testing persistence')

      // Refresh the page
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      // Verify project is still there
      await expect(page.getByText(projectName, { exact: false })).toBeVisible({ timeout: 5000 })
    })

    test('should handle navigation between pages', async ({ page }) => {
      // Create a project
      await createTestProject(page, 'Nav Test', 'Testing navigation')

      // Navigate to project details
      await page.getByText('Nav Test', { exact: false }).first().click()
      await page.waitForLoadState('domcontentloaded')

      // Verify we're on project page
      await expect(page.getByRole('heading', { name: /Nav Test/i })).toBeVisible({ timeout: 5000 })

      // Navigate back
      await page.goBack()
      await page.waitForLoadState('domcontentloaded')

      // Verify back on dashboard
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 5000 })
    })
  })

  test.describe('Error Boundary', () => {
    test.skip('should catch and display component errors', async () => {
      // Infeasible: there is no fault-injection hook (window.__crash, debug route, etc.) anywhere
      // in the app or e2e harness to make a child component throw and exercise
      // ErrorBoundary.tsx's getDerivedStateFromError/fallback path from Playwright. The previous
      // body was a tautology (`querySelector(...) !== null || !bodyText.includes('Something went
      // wrong')`) that evaluated true on every normal, error-free render regardless of whether an
      // error boundary existed at all. ErrorBoundary.test.tsx unit-tests the real catch behavior.
    })

    test.skip('should provide retry option on error', async () => {
      // Infeasible: the "Try Again" button (ErrorBoundary.tsx:295) only renders while
      // state.hasError is true, which requires an actual caught error — unavailable offline/e2e
      // (see above). The previous body never triggered an error and never checked for the retry
      // button; it just re-verified project creation, which is already covered elsewhere.
    })

    test.skip('should preserve navigation after error recovery', async () => {
      // Infeasible: "recovery" implies an error was caught and retried first (ErrorBoundary.tsx
      // handleRetry), which needs the same unavailable fault-injection hook. Without triggering an
      // error, this duplicates the plain navigation checks already covered by 'should handle
      // navigation between pages' above.
    })
  })

  test.describe('Data Persistence', () => {
    test('should persist projects in localStorage', async ({ page }) => {
      // Create a project
      const projectName = await createTestProject(page, 'Persistence Test', 'Testing storage')

      // Zustand persist middleware (store/useStore.ts:433) writes synchronously on every `set()`
      // call — no throttle/debounce is configured — and partialize keeps `projects` (with name),
      // so by the time the project name is visible in the DOM the write has already happened.
      const storedData = await page.evaluate(() => localStorage.getItem('vuln-assess-storage'))
      expect(storedData).not.toBeNull()
      expect(storedData).toContain(projectName)
    })

    test('should persist settings across reloads', async ({ page }) => {
      // Navigate to settings
      await navigateToSettings(page)

      // Verify settings page loads (lazy-loaded, may take time)
      await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible({ timeout: 15000 })

      // The server's SPA fallback (server/app.ts) serves index.html for every non-API GET, so a
      // full reload at /settings deterministically re-resolves the client route — no
      // dashboard-and-retry fallback needed.
      await page.reload()
      await page.waitForLoadState('domcontentloaded')

      await expect(page.getByRole('heading', { name: /^Settings$/ })).toBeVisible({ timeout: 15000 })
    })
  })

  test.describe('Network Error Handling', () => {
    test('should handle slow network gracefully', async ({ page }) => {
      // Simulate slow network
      const cdpSession = await page.context().newCDPSession(page)
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 500, // 500ms latency
        downloadThroughput: 50000, // 50KB/s
        uploadThroughput: 50000,
      })

      // CreateProjectDialog is pure client-side state (CreateProjectDialog.tsx) — it must still
      // open with its designed title, and close on Escape, even while the network is throttled.
      await page.getByRole('button', { name: 'New Project' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('Create New Project')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      // Clean up
      await cdpSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
    })

    test('should recover from temporary network failure', async ({ page }) => {
      // Create a project while online
      await createTestProject(page, 'Network Recovery Test', 'Testing recovery')

      // Simulate network failure
      await page.context().setOffline(true)
      await page.waitForTimeout(300)

      // Restore network
      await page.context().setOffline(false)
      await page.waitForTimeout(500)

      // App should still work
      await expect(page.getByText('Network Recovery Test', { exact: false })).toBeVisible()
    })
  })

  test.describe('Memory and Performance', () => {
    test('should handle multiple projects without performance issues', async ({ page }) => {
      // Create multiple projects
      for (let i = 0; i < 5; i++) {
        await createTestProject(page, `Performance Test ${i}`, `Project ${i} for performance testing`)
      }

      // Verify all projects are visible
      for (let i = 0; i < 5; i++) {
        await expect(page.getByText(`Performance Test ${i}`, { exact: false })).toBeVisible({ timeout: 5000 })
      }

      // Verify app is still responsive
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
    })

    test('should clean up resources on navigation', async ({ page }) => {
      // Create a project and navigate to it
      await createTestProject(page, 'Cleanup Test', 'Testing resource cleanup')

      await page.getByText('Cleanup Test', { exact: false }).first().click()
      await expect(page.getByRole('heading', { name: /Cleanup Test/i })).toBeVisible({ timeout: 5000 })

      // Navigate back
      await page.goBack()
      await page.waitForLoadState('domcontentloaded')

      // Navigate to settings
      await navigateToSettings(page)
      await page.waitForLoadState('domcontentloaded')

      // Navigate back
      await page.goBack()
      await page.waitForLoadState('domcontentloaded')

      // App should still be functional
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()
    })
  })
})

/**
 * Helper function to create a test project with unique name and description.
 * Wraps shared createProjectOnly to add timestamp + description support.
 */
async function createTestProject(page: Page, name: string, description: string): Promise<string> {
  const uniqueName = `${name} ${Date.now()}`
  await createProjectOnly(page, uniqueName)
  return uniqueName
}
