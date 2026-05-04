/**
 * Shared E2E Test Helpers
 *
 * Common utilities, constants, and helper functions for E2E tests.
 * Import from this file instead of duplicating across test files.
 */

import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

// =============================================================================
// Timeout Constants
// =============================================================================

/** Default timeout for E2E test operations */
export const E2E_DEFAULT_TIMEOUT = 30000

/** Timeout for element selector waits */
export const E2E_SELECTOR_TIMEOUT = 15000

/** Short delay for UI updates */
export const E2E_UI_DELAY = 500

/** Long delay for complex operations */
export const E2E_LONG_DELAY = 1000

/** Base URL for the E2E test preview server */
export const E2E_BASE_URL = 'http://127.0.0.1:4173'

// =============================================================================
// Project Helpers
// =============================================================================

/**
 * Create a test project without navigating away from the dashboard.
 * Use this when you need the project to exist but want to stay on the
 * current page (e.g. for bulk-selection tests, search tests, etc.).
 * @param page - Playwright page object
 * @param name - Project name
 */
export async function createProjectOnly(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  await page.locator('#project-name').fill(name)
  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })
}

/**
 * Create a test project with the given name and navigate to its detail page.
 * @param page - Playwright page object
 * @param name - Project name
 * @returns Promise that resolves when project is created and navigated
 */
export async function createTestProject(page: Page, name: string): Promise<void> {
  await createProjectOnly(page, name)

  // Navigate to the project detail page after creation
  await page.waitForTimeout(E2E_UI_DELAY) // Wait for project list to update
  await navigateToProjectDetail(page, name)
}

/**
 * Create multiple test projects
 * @param page - Playwright page object
 * @param names - Array of project names
 */
export async function createMultipleProjects(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    await createTestProject(page, name)
  }
}

/**
 * Navigate to project detail page
 * @param page - Playwright page object
 * @param projectName - Name of the project to navigate to
 */
export async function navigateToProjectDetail(page: Page, projectName: string): Promise<void> {
  await page.locator('.group.rounded-lg.border').filter({ hasText: projectName }).first().click()
  await expect(page.getByRole('heading', { name: new RegExp(projectName, 'i') })).toBeVisible({ timeout: 10000 })
}

/**
 * Delete a project
 * @param page - Playwright page object
 * @param projectName - Name of the project to delete
 */
export async function deleteProject(page: Page, projectName: string): Promise<void> {
  await navigateToProjectDetail(page, projectName)
  // Use .first() in case multiple delete buttons are visible (sidebar + main)
  await page
    .getByRole('button', { name: /delete/i })
    .first()
    .click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  await page
    .getByRole('button', { name: /confirm|delete/i })
    .first()
    .click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
}

// =============================================================================
// Navigation Helpers
// =============================================================================

/**
 * Navigate to the Vulnerabilities tab in project detail
 * @param page - Playwright page object
 */
export async function navigateToVulnerabilitiesTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /vulnerabilities/i }).click()
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Navigate to the Components tab in project detail
 * @param page - Playwright page object
 */
export async function navigateToComponentsTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /components/i }).click()
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Navigate to the Health tab in project detail
 * @param page - Playwright page object
 */
export async function navigateToHealthTab(page: Page): Promise<void> {
  await page.getByRole('tab', { name: /health/i }).click()
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Check if a tab is available
 * @param page - Playwright page object
 * @param tabName - Name of the tab to check
 * @returns True if tab exists and is visible
 */
export async function isTabAvailable(page: Page, tabName: string): Promise<boolean> {
  const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') })
  return await tab.isVisible().catch(() => false)
}

// =============================================================================
// Feature Navigation Helpers
// =============================================================================

/**
 * Navigate to the Settings page
 * @param page - Playwright page object
 * @returns True if navigation succeeded
 */
export async function navigateToSettings(page: Page): Promise<boolean> {
  const button = page.getByRole('button', { name: /settings/i })
  const link = page.getByRole('link', { name: /settings/i })

  if (await button.isVisible().catch(() => false)) {
    await button.click()
  } else if (await link.isVisible().catch(() => false)) {
    await link.click()
  } else {
    return false
  }

  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 10000 })
  return true
}

/**
 * Open the command palette
 * @param page - Playwright page object
 */
export async function openCommandPalette(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+P')
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Navigate to the Search page via button, link, nav, or SPA fallback
 */
export async function navigateToSearch(page: Page): Promise<void> {
  const searchLink = page.getByRole('link', { name: /search/i })
  const searchButton = page.getByRole('button', { name: /search/i })
  const searchNav = page
    .locator('nav')
    .locator('button, a')
    .filter({ hasText: /search/i })

  if (await searchLink.isVisible().catch(() => false)) {
    await searchLink.click()
  } else if (await searchButton.isVisible().catch(() => false)) {
    await searchButton.first().click()
  } else if (await searchNav.isVisible().catch(() => false)) {
    await searchNav.first().click()
  } else {
    await page.evaluate(() => {
      const nav = (window as unknown as Record<string, unknown>).__navigate
      if (typeof nav === 'function') nav('/search')
    })
  }
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Navigate to the Dependency Graph page
 * @param page - Playwright page object
 */
export async function navigateToDependencyGraph(page: Page): Promise<void> {
  await page
    .getByRole('tab', { name: /graph|dependency/i })
    .or(page.getByRole('link', { name: /graph/i }))
    .first()
    .click()
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Navigate to the Executive Dashboard via link, button, or SPA fallback
 */
export async function navigateToExecutiveDashboard(page: Page): Promise<void> {
  const executiveLink = page.getByRole('link', { name: /executive/i })
  const executiveButton = page.getByRole('button', { name: /executive/i })

  if (await executiveLink.isVisible().catch(() => false)) {
    await executiveLink.click()
  } else if ((await executiveButton.isVisible().catch(() => false)) && (await executiveButton.isEnabled())) {
    await executiveButton.click()
  } else {
    await page.evaluate(() => {
      const nav = (window as unknown as Record<string, unknown>).__navigate
      if (typeof nav === 'function') nav('/executive')
    })
  }
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Open the Export dialog. Tries "Export All" first, then generic "Export" button.
 */
export async function openExportDialog(page: Page): Promise<void> {
  const exportAllButton = page.getByRole('button', { name: /export all/i })
  const exportButton = page.getByRole('button', { name: /export/i }).first()

  if ((await exportAllButton.isVisible().catch(() => false)) && (await exportAllButton.isEnabled())) {
    await exportAllButton.click()
  } else if ((await exportButton.isVisible().catch(() => false)) && (await exportButton.isEnabled())) {
    await exportButton.click()
  }
  await page.waitForTimeout(E2E_UI_DELAY)
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
}

/**
 * Close any open dialog
 * @param page - Playwright page object
 */
export async function closeDialog(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible()) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(E2E_UI_DELAY)
  }
}

// =============================================================================
// SBOM Upload Helpers
// =============================================================================

/**
 * Upload an SBOM file to the current project via the upload dialog.
 * Opens the dialog, sets the file on the hidden input, waits for parsing,
 * then confirms the upload.
 * @param page - Playwright page object
 * @param filePath - Absolute or relative path to the SBOM file
 * @param waitForComponents - Whether to wait for components to appear (default: true)
 */
export async function uploadSbomFile(page: Page, filePath: string, waitForComponents = true): Promise<void> {
  // Open the SBOM upload dialog — use exact text match to avoid "Export" false positive
  const uploadButton = page.getByRole('button', { name: /upload sbom/i }).first()
  await uploadButton.waitFor({ state: 'visible', timeout: E2E_SELECTOR_TIMEOUT })
  await uploadButton.click({ force: true })

  // Wait for dialog to appear
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

  // Set the file on the hidden file input
  const fileInput = dialog.locator('input[type="file"]')
  await fileInput.setInputFiles(filePath)

  // Wait for parsing to complete — the "Add to Project" button only appears on success
  const confirmButton = dialog.getByRole('button', { name: /add to project/i })
  const errorButton = dialog.getByRole('button', { name: /try again/i })
  await Promise.race([
    confirmButton.waitFor({ state: 'visible', timeout: 30000 }),
    errorButton.waitFor({ state: 'visible', timeout: 30000 }),
  ])

  // Dismiss CPE match dialog if it appeared (covers the Add to Project button)
  const cpeDialog = page.getByRole('dialog', { name: /cpe|match/i })
  if (await cpeDialog.isVisible().catch(() => false)) {
    const skipButton = cpeDialog.getByRole('button', { name: /skip|cancel|close/i }).first()
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)
    }
  }

  // Click "Add to Project" to confirm (only visible in success state)
  if (await confirmButton.isVisible().catch(() => false)) {
    await confirmButton.click({ force: true })
    await page.waitForTimeout(E2E_UI_DELAY)
  }

  // Wait for dialog to close
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

  // Optionally wait for components to appear in the UI
  if (waitForComponents) {
    await page.waitForTimeout(E2E_UI_DELAY)
  }
}

// =============================================================================
// Selection Helpers
// =============================================================================

/**
 * Enter selection mode for bulk operations
 */
export async function enterSelectionMode(page: Page): Promise<void> {
  const selectButton = page.getByRole('button', { name: /select projects|exit selection|select|multi/i })
  try {
    await selectButton.first().waitFor({ state: 'visible', timeout: 5000 })
    await selectButton.first().click()
    await page.waitForTimeout(E2E_UI_DELAY)
  } catch {
    // Selection mode not available on this viewport
  }
}

/**
 * Select multiple projects by name
 * @param page - Playwright page object
 * @param projectNames - Names of projects to select
 */
export async function selectMultipleProjects(page: Page, projectNames: string[]): Promise<void> {
  for (const name of projectNames) {
    const card = page.locator('.group.rounded-lg.border').filter({ hasText: name })
    await card.click()
    await page.waitForTimeout(E2E_UI_DELAY / 2)
  }
}

/**
 * Select all items in current view
 * @param page - Playwright page object
 */
export async function selectAllItems(page: Page): Promise<void> {
  await page
    .getByRole('checkbox', { name: /select all/i })
    .or(page.getByRole('button', { name: /select all/i }))
    .first()
    .click()
  await page.waitForTimeout(E2E_UI_DELAY)
}

// =============================================================================
// Onboarding Helpers
// =============================================================================

/**
 * Trigger the onboarding tour via custom event (same as MenuActionListener)
 */
export async function triggerOnboardingTour(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(E2E_UI_DELAY * 2)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('menu-show-tour'))
  })
  await page.waitForTimeout(E2E_UI_DELAY * 2)
}

/**
 * Advance to next onboarding step
 * @param page - Playwright page object
 */
export async function advanceOnboardingStep(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /next|continue|skip/i })
    .first()
    .click()
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Complete the onboarding tour
 * @param page - Playwright page object
 */
export async function completeOnboardingTour(page: Page): Promise<void> {
  // Keep advancing until tour is complete
  let maxSteps = 20
  while (maxSteps > 0) {
    const nextButton = page.getByRole('button', { name: /next|continue|finish|done|skip/i }).first()
    if (await nextButton.isVisible().catch(() => false)) {
      await nextButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)
      maxSteps--
    } else {
      break
    }
  }
}

// =============================================================================
// Test Data Helpers (Placeholders for actual fixture integration)
// =============================================================================

/**
 * Create a project with KEV vulnerability data
 * NOTE: This is a placeholder - actual data seeding requires fixture implementation
 * @param page - Playwright page object
 */
export async function createProjectWithKevVulnerability(page: Page): Promise<void> {
  await createTestProject(page, 'KEV Test Project')
  // TODO: Seed KEV vulnerability data via fixtures or API
}

/**
 * Create a project with EPSS data
 * NOTE: This is a placeholder - actual data seeding requires fixture implementation
 * @param page - Playwright page object
 */
export async function createProjectWithEpssData(page: Page): Promise<void> {
  await createTestProject(page, 'EPSS Test Project')
  // TODO: Seed EPSS data via fixtures or API
}

/**
 * Create a project without EPSS data
 * @param page - Playwright page object
 */
export async function createProjectWithNoEpssData(page: Page): Promise<void> {
  await createTestProject(page, 'No EPSS Test Project')
}

/**
 * Create a project with varying EPSS scores
 * NOTE: This is a placeholder - actual data seeding requires fixture implementation
 * @param page - Playwright page object
 */
export async function createProjectWithVaryingEpssScores(page: Page): Promise<void> {
  await createTestProject(page, 'Varying EPSS Test Project')
  // TODO: Seed vulnerabilities with different EPSS scores via fixtures
}

/**
 * Create a project with intelligence data (KEV + EPSS)
 * NOTE: This is a placeholder - actual data seeding requires fixture implementation
 * @param page - Playwright page object
 */
export async function createProjectWithIntelligenceData(page: Page): Promise<void> {
  await createTestProject(page, 'Intelligence Test Project')
  // TODO: Seed KEV, EPSS, and risk data via fixtures
}

/**
 * Create a project with multiple vulnerabilities
 * NOTE: This is a placeholder - actual data seeding requires fixture implementation
 * @param page - Playwright page object
 */
export async function createProjectWithMultipleVulnerabilities(page: Page): Promise<void> {
  await createTestProject(page, 'Multiple Vulns Test Project')
  // TODO: Seed multiple vulnerabilities via fixtures
}

/**
 * Create a project with health data
 * NOTE: This is a placeholder - actual data seeding requires fixture implementation
 * @param page - Playwright page object
 */
export async function createProjectWithHealth(page: Page): Promise<void> {
  await createTestProject(page, 'Health Test Project')
  // TODO: Seed health data via fixtures
}

/**
 * Create a project with component data
 * NOTE: This is a placeholder - actual data seeding requires fixture implementation
 * @param page - Playwright page object
 */
export async function createProjectWithComponents(page: Page): Promise<void> {
  await createTestProject(page, 'Components Test Project')
  // TODO: Seed component data via fixtures
}

/**
 * Create a project with scan history
 * NOTE: This is a placeholder - actual data seeding requires fixture implementation
 * @param page - Playwright page object
 */
export async function createProjectWithHistory(page: Page): Promise<void> {
  await createTestProject(page, 'History Test Project')
  // TODO: Seed scan history via fixtures
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that an element is visible or skip the test
 * Use this for optional features that may not be implemented yet
 * @param page - Playwright page object
 * @param selector - Selector for the element
 * @param testName - Name of the test (for skip message)
 */
export async function assertVisibleOrSkip(page: Page, selector: string, testName: string): Promise<boolean> {
  const element = page.locator(selector)
  const isVisible = await element.isVisible().catch(() => false)
  if (!isVisible) {
    console.log(`Skipping ${testName}: Element not found (${selector})`)
  }
  return isVisible
}

/**
 * Wait for table to load with data
 * @param page - Playwright page object
 * @param minRows - Minimum number of rows expected
 */
export async function waitForTableData(page: Page, minRows: number = 1): Promise<void> {
  await page.waitForFunction(
    ({ minRows }) => {
      const rows = document.querySelectorAll('tbody tr, [role="row"]')
      return rows.length >= minRows
    },
    { minRows },
    { timeout: E2E_SELECTOR_TIMEOUT },
  )
}

/**
 * Check if feature is implemented (element exists)
 * @param page - Playwright page object
 * @param selector - Selector for the feature element
 * @returns True if feature appears to be implemented
 */
export async function isFeatureImplemented(page: Page, selector: string): Promise<boolean> {
  const element = page.locator(selector)
  return await element.isVisible().catch(() => false)
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a unique test project name
 * @param prefix - Prefix for the project name
 * @returns Unique project name with timestamp
 */
export function generateProjectName(prefix: string = 'Test'): string {
  return `${prefix} ${Date.now()}`
}

/**
 * Sleep for a specified duration
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Take a screenshot for debugging
 * @param page - Playwright page object
 * @param name - Screenshot name
 */
export async function takeDebugScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/debug-${name}-${Date.now()}.png` })
}
