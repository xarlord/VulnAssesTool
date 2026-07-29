import { test, expect, resetAppState } from '../test-helper'
import { createProjectOnly, navigateToSearch, E2E_UI_DELAY, E2E_SELECTOR_TIMEOUT } from '../shared-helpers'

test.describe('Search Page', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test.describe('Page Load', () => {
    test('should display search page header', async ({ page }) => {
      await navigateToSearch(page)

      await expect(page.locator('h1:has-text("Search")')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should display search description', async ({ page }) => {
      await navigateToSearch(page)

      await expect(page.locator('text=/Search across all projects/i')).toBeVisible()
    })

    test('should display search input', async ({ page }) => {
      await navigateToSearch(page)

      const searchInput = page.locator('input[data-testid="nvd-search-input"]')
      await expect(searchInput).toBeVisible()
      await expect(searchInput).toHaveAttribute('placeholder', /search/i)
    })

    test('should display search mode toggle', async ({ page }) => {
      await navigateToSearch(page)

      await expect(page.locator('button:has-text("Project Search")')).toBeVisible()
      await expect(page.locator('button:has-text("NVD Database")')).toBeVisible()
    })

    test('should show empty state on initial load', async ({ page }) => {
      await navigateToSearch(page)

      await expect(page.locator('text=/Start searching/i')).toBeVisible()
    })

    test('should display search tips', async ({ page }) => {
      await navigateToSearch(page)

      await expect(page.locator('text=/Search Tips/i')).toBeVisible()
    })
  })

  test.describe('Search Mode Toggle', () => {
    test('should start in Project Search mode', async ({ page }) => {
      await navigateToSearch(page)

      const projectButton = page.locator('button:has-text("Project Search")')
      await expect(projectButton).toHaveClass(/bg-background|shadow/)
    })

    test('should switch to NVD Database mode', async ({ page }) => {
      await navigateToSearch(page)

      await page.locator('button:has-text("NVD Database")').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const nvdButton = page.locator('button:has-text("NVD Database")')
      await expect(nvdButton).toHaveClass(/bg-background|shadow/)
    })

    test('shows the FTS Enabled badge', async ({ page }) => {
      // The e2e DB is built through the real NvdDatabase class, which runs the FTS5 migration,
      // so the mode toggle advertises full-text search is available.
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()
      await expect(page.getByText('FTS Enabled')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should update placeholder based on mode', async ({ page }) => {
      await navigateToSearch(page)

      const projectPlaceholder = await page.locator('input[data-testid="nvd-search-input"]').getAttribute('placeholder')
      expect(projectPlaceholder).toContain('projects')

      await page.locator('button:has-text("NVD Database")').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const nvdPlaceholder = await page.locator('input[data-testid="nvd-search-input"]').getAttribute('placeholder')
      expect(nvdPlaceholder).toContain('NVD')
    })

    test('should update search tips based on mode', async ({ page }) => {
      await navigateToSearch(page)

      await expect(page.locator('text=Project Search Tips')).toBeVisible()

      await page.locator('button:has-text("NVD Database")').click()
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.locator('text=NVD Database Search Tips')).toBeVisible()
    })
  })

  test.describe('Project Search', () => {
    test('should search projects by name', async ({ page }) => {
      const projectName = 'Searchable Project Alpha'
      await createProjectOnly(page, projectName)

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Searchable')
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      await expect(page.locator(`text="${projectName}"`)).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should search with case insensitivity', async ({ page }) => {
      await createProjectOnly(page, 'CaseTest Project')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('casetest')
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      await expect(page.locator('text=CaseTest Project')).toBeVisible()
    })

    test('should show result counts', async ({ page }) => {
      await createProjectOnly(page, 'Count Test One')
      await createProjectOnly(page, 'Count Test Two')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Count Test')

      // Both projects substring-match "Count Test", so the count is exactly 2.
      await expect(page.getByText(/Found 2 results/)).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should group results by type', async ({ page }) => {
      await createProjectOnly(page, 'Group Test Project')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Group Test')
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      await expect(page.locator('h2:has-text("Projects")')).toBeVisible()
    })

    test('should show no results state', async ({ page }) => {
      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('zzzzzzzznonexistent12345')
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      await expect(page.locator('text=/No results found|No matches found/i').first()).toBeVisible()
    })

    test('a partial word matches the project directly', async ({ page }) => {
      // "Suggest" is a substring of "Suggestion Test Project", so the project search matches it
      // outright (there is no separate suggestions path for a substring hit).
      await createProjectOnly(page, 'Suggestion Test Project')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Suggest')
      await expect(page.getByText('Suggestion Test Project', { exact: true })).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
    })

    test('should clear search with X button', async ({ page }) => {
      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('test query')

      const clearButton = page.locator('button[aria-label="Clear search"]')
      await clearButton.click()

      await expect(input).toHaveValue('')
    })

    test('should navigate to project on result click', async ({ page }) => {
      const projectName = 'Clickable Project'
      await createProjectOnly(page, projectName)

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Clickable')
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      await page.locator('text=Clickable Project').click()

      await expect(page).toHaveURL(/\/project\//)
    })
  })

  test.describe('NVD Database Search', () => {
    // Every assertion below is grounded in the 16 deterministic CVEs in scripts/seed-test-db.js,
    // queried through the real local NVD database (no network). The 300ms debounce + local fetch
    // is absorbed by web-first assertions with an explicit timeout rather than fixed sleeps.
    async function openNvdSearch(page: import('@playwright/test').Page, query: string) {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()
      await page.locator('input[data-testid="nvd-search-input"]').fill(query)
    }

    test('a valid CVE-ID with no seeded match shows the empty state', async ({ page }) => {
      // CVE-2024-1234 is a well-formed id that is NOT one of the 16 seeded CVEs.
      await openNvdSearch(page, 'CVE-2024-1234')
      await expect(page.getByText('Search NVD Database', { exact: true })).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })
      await expect(page.locator('[data-testid="nvd-result"]')).toHaveCount(0)
    })

    test('a component keyword resolves to the one matching seeded CVE', async ({ page }) => {
      // Exactly one seeded CVE mentions OpenSSL: CVE-2023-0286 (HIGH).
      await openNvdSearch(page, 'openssl')
      const result = page.locator('[data-testid="nvd-result"]')
      await expect(result).toHaveCount(1, { timeout: E2E_SELECTOR_TIMEOUT })
      await expect(result.first()).toContainText('CVE-2023-0286')
      await expect(result.first()).toContainText('HIGH')
      await expect(result.first()).toContainText(/OpenSSL/i)
    })

    test('a keyword search returns the matching CVE with its severity', async ({ page }) => {
      // "apache" matches the seeded Log4Shell CVE (CVE-2021-44228, CRITICAL).
      await openNvdSearch(page, 'apache')
      const result = page.locator('[data-testid="nvd-result"]').filter({ hasText: 'CVE-2021-44228' })
      await expect(result).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(result).toContainText('CRITICAL')
    })

    test('a CVE-year text search returns every seeded CVE from that year', async ({ page }) => {
      // "CVE-2024" is not a full CVE-ID, so it runs as a text search and matches the five
      // seeded 2024 CVEs (0001, 0002, 2178, 3094, 4577).
      await openNvdSearch(page, 'CVE-2024')
      await expect(page.locator('[data-testid="nvd-result"]')).toHaveCount(5, { timeout: E2E_SELECTOR_TIMEOUT })
      await expect(page.getByText('Found 5 results in NVD database')).toBeVisible()
    })

    test('clicking a result opens the CVE detail modal for that CVE', async ({ page }) => {
      await openNvdSearch(page, 'apache')
      const result = page.locator('[data-testid="nvd-result"]').filter({ hasText: 'CVE-2021-44228' })
      await expect(result).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await result.click()
      const modal = page.getByRole('dialog')
      await expect(modal).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
      await expect(modal).toContainText('CVE-2021-44228')
    })

    test('shows the NVD sync button in NVD mode', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()
      await expect(page.locator('[data-testid="nvd-sync-button"]')).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('displays the seeded database size', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()
      // The seeded e2e database contains exactly 16 CVEs.
      await expect(page.getByText(/16 CVEs in\s+database/).first()).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('ArrowDown highlights the first project result', async ({ page }) => {
      await createProjectOnly(page, 'Nav Test One')
      await createProjectOnly(page, 'Nav Test Two')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Nav Test')
      await expect(page.getByText('Nav Test One', { exact: true })).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      await input.press('ArrowDown')
      // The selected row gets the `ring-2 ring-ring` highlight; exactly one row is selected.
      await expect(page.locator('.ring-2.ring-ring')).toHaveCount(1)
    })

    test('ArrowUp moves the highlight back to the first result', async ({ page }) => {
      // Created first → appended first → stable-sorted first among equally-relevant matches.
      await createProjectOnly(page, 'Up Nav Test One')
      await createProjectOnly(page, 'Up Nav Test Two')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Up Nav')
      await expect(page.getByText('Up Nav Test One', { exact: true })).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

      await input.press('ArrowDown') // index 0
      await input.press('ArrowDown') // index 1
      await input.press('ArrowUp') // back to index 0
      await expect(page.locator('.ring-2.ring-ring')).toContainText('Up Nav Test One')
    })

    test('Enter opens the highlighted project result', async ({ page }) => {
      await createProjectOnly(page, 'Enter Select Project')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Enter Select')
      await expect(page.getByText('Enter Select Project', { exact: true })).toBeVisible({
        timeout: E2E_SELECTOR_TIMEOUT,
      })

      await input.press('ArrowDown') // Enter only navigates when a row is selected.
      await input.press('Enter')
      await expect(page).toHaveURL(/\/project\//, { timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should clear search with Escape key', async ({ page }) => {
      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('test query')
      await input.press('Escape')

      await expect(input).toHaveValue('')
    })
  })

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display search on tablet viewport', async ({ page }) => {
      await navigateToSearch(page)

      await expect(page.locator('h1:has-text("Search")')).toBeVisible()
      await expect(page.locator('input[data-testid="nvd-search-input"]')).toBeVisible()
    })

    test('should allow mode toggle on tablet', async ({ page }) => {
      await navigateToSearch(page)

      await page.locator('button:has-text("NVD Database")').click()
      await expect(page.locator('button:has-text("NVD Database")')).toHaveClass(/bg-background|shadow/)
    })
  })

  test.describe('Mobile Design', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('should display search on mobile viewport', async ({ page }) => {
      await navigateToSearch(page)

      await expect(page.locator('h1:has-text("Search")')).toBeVisible()
    })
  })
})
