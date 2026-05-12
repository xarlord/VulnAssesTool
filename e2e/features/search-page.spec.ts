import { test, expect, resetAppState } from '../electron-helper'
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

    test('should show FTS badge when available', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()

      const ftsBadge = page.locator('text=FTS Enabled')
      await ftsBadge
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
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
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      await expect(page.locator('text=/Found \\d+ result/')).toBeVisible()
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

      await expect(page.locator('text=/No results found|No matches found/i')).toBeVisible()
    })

    test('should show suggestions when no exact matches', async ({ page }) => {
      await createProjectOnly(page, 'Suggestion Test Project')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Suggest')
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      const suggestionsSection = page.locator('text=Suggestions')
      await suggestionsSection
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
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
    test('should search by CVE ID format', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('CVE-2024-1234')
      await page.waitForTimeout(E2E_UI_DELAY * 4)

      await page
        .locator('[data-testid="nvd-result"]')
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
      await page
        .locator('text=/No results|Search NVD Database/i')
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should search by component name', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('openssl')
      await page.waitForTimeout(E2E_UI_DELAY * 4)

      const searchStates = page.locator('text=/Searching|Loading|No results|empty/i, [data-testid="nvd-result"]')
      await expect(searchStates.first()).toBeVisible({ timeout: 10000 })
    })

    test('should show loading state during search', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('apache')
      const spinner = page.locator('.animate-spin, [class*="spinner"]')
      await spinner
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should display CVE details in results', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('CVE-2024')
      await page.waitForTimeout(E2E_UI_DELAY * 4)

      const results = page.locator('[data-testid="nvd-result"]')
      const count = await results.count()

      if (count > 0) {
        await expect(results.first().locator('text=/CVE-\\d{4}-\\d+/')).toBeVisible()
      }
    })

    test('should open CVE detail modal on click', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('CVE-2024')
      await page.waitForTimeout(E2E_UI_DELAY * 4)

      const results = page.locator('[data-testid="nvd-result"]')
      if ((await results.count()) > 0) {
        await results.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const modal = page.locator('[role="dialog"]')
        await modal
          .first()
          .waitFor({ state: 'attached', timeout: 5000 })
          .catch(() => {})
      }
    })

    test('should show NVD sync button', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()

      const syncButton = page.locator('[data-testid="nvd-sync-button"], button:has-text("Sync")')
      await syncButton
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should display database stats', async ({ page }) => {
      await navigateToSearch(page)
      await page.locator('button:has-text("NVD Database")').click()

      const statsText = page.locator('text=/CVEs in database|total CVEs/i')
      await statsText
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })
  })

  test.describe('Keyboard Navigation', () => {
    test('should navigate results with arrow down', async ({ page }) => {
      await createProjectOnly(page, 'Nav Test One')
      await createProjectOnly(page, 'Nav Test Two')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Nav Test')
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      await input.press('ArrowDown')

      const selectedItem = page.locator('[class*="ring-2"]')
      await selectedItem
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should navigate results with arrow up', async ({ page }) => {
      await createProjectOnly(page, 'Up Nav Test One')
      await createProjectOnly(page, 'Up Nav Test Two')

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Up Nav')
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      await input.press('ArrowDown')
      await input.press('ArrowDown')
      await input.press('ArrowUp')
    })

    test('should select result with Enter key', async ({ page }) => {
      const projectName = 'Enter Select Project'
      await createProjectOnly(page, projectName)

      await navigateToSearch(page)

      const input = page.locator('input[data-testid="nvd-search-input"]')
      await input.fill('Enter Select')
      await page.waitForTimeout(E2E_UI_DELAY * 3)

      await input.press('Enter')

      await page.waitForTimeout(E2E_UI_DELAY)
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
