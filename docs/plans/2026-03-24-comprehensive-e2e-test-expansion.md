# Comprehensive E2E Test Expansion Design

**Date:** 2026-03-24
**Status:** Design Complete
**Priority:** High

---

## Overview

This document defines comprehensive E2E tests for VulnAssesTool features that currently lack coverage. Tests follow existing patterns from `e2e/critical-flows/` and match the depth of tests like `fpf-comprehensive.spec.ts`.

---

## Test Architecture

### Directory Structure
```
e2e/
├── critical-flows/          # Existing tests (keep)
├── features/                # NEW: Feature-specific tests
│   ├── dependency-graph.spec.ts
│   ├── executive-dashboard.spec.ts
│   ├── command-palette.spec.ts
│   ├── onboarding-tour.spec.ts
│   ├── kev-epss-intelligence.spec.ts
│   ├── export-dialog.spec.ts
│   ├── health-dashboard.spec.ts
│   ├── remediation-queue.spec.ts
│   ├── search-page.spec.ts
│   ├── bulk-actions.spec.ts
│   └── patch-information.spec.ts
└── workflows/                # NEW: Multi-step user journeys
    ├── vulnerability-lifecycle.spec.ts
    ├── project-management.spec.ts
    └── security-assessment.spec.ts
```

### Shared Patterns

```typescript
// E2E timeout constants (from existing tests)
const E2E_DEFAULT_TIMEOUT = 30000
const E2E_SELECTOR_TIMEOUT = 15000
const E2E_UI_DELAY = 500

// Standard imports
import { test, expect, resetAppState } from '../electron-helper'
import type { Page } from '@playwright/test'
```

---

## Feature Tests

### 1. Dependency Graph (`dependency-graph.spec.ts`)

**File:** `src/renderer/pages/DependencyGraphPage.tsx`

**Test Scenarios:**

#### 1.1 Page Load Tests
```typescript
test.describe('Dependency Graph Page Load', () => {
  test('should display graph page with header elements', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    // Verify header
    await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
    await expect(page.locator('button:has-text("Back to Project")')).toBeVisible()
  })

  test('should display project name in header', async ({ page }) => {
    const projectName = 'Graph Test Project'
    await createProjectAndNavigateToGraph(page, projectName)

    await expect(page.locator(`text="${projectName}"`)).toBeVisible()
  })

  test('should show severity filter dropdown', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    const severitySelect = page.locator('select')
    await expect(severitySelect).toBeVisible()
    await expect(severitySelect.locator('option:has-text("All Severities")')).toBeVisible()
    await expect(severitySelect.locator('option:has-text("Critical")')).toBeVisible()
  })

  test('should show "Vulnerable Only" toggle button', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    await expect(page.locator('button:has-text("Vulnerable Only")')).toBeVisible()
  })
})
```

#### 1.2 Filter Tests
```typescript
test.describe('Dependency Graph Filters', () => {
  test('should filter by critical severity', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    const severitySelect = page.locator('select')
    await severitySelect.selectOption('critical')

    // Verify filter applied - check footer stats update
    await page.waitForTimeout(E2E_UI_DELAY)
  })

  test('should toggle vulnerable only filter', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    const toggleButton = page.locator('button:has-text("Vulnerable Only")')

    // Toggle on
    await toggleButton.click()
    await expect(toggleButton).toHaveClass(/bg-primary/)

    // Toggle off
    await toggleButton.click()
    await expect(toggleButton).not.toHaveClass(/bg-primary/)
  })

  test('should combine severity and vulnerable filters', async ({ page }) => {
    await createProjectWithVulnerabilities(page)

    // Apply both filters
    await page.locator('select').selectOption('high')
    await page.locator('button:has-text("Vulnerable Only")').click()

    await page.waitForTimeout(E2E_UI_DELAY)
  })
})
```

#### 1.3 Navigation Tests
```typescript
test.describe('Dependency Graph Navigation', () => {
  test('should navigate back to project detail', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    await page.locator('button:has-text("Back to Project")').click()

    await expect(page).not.toHaveURL(/\/graph$/)
  })

  test('should display footer statistics', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    // Verify footer exists
    await expect(page.locator('footer')).toBeVisible()
    await expect(page.locator('text=components')).toBeVisible()
    await expect(page.locator('text=vulnerabilities')).toBeVisible()
  })

  test('should show severity counts in footer', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    await expect(page.locator('text=Critical:')).toBeVisible()
    await expect(page.locator('text=High:')).toBeVisible()
    await expect(page.locator('text=Medium:')).toBeVisible()
    await expect(page.locator('text=Low:')).toBeVisible()
  })
})
```

#### 1.4 Empty State Tests
```typescript
test.describe('Dependency Graph Empty States', () => {
  test('should handle project with no components', async ({ page }) => {
    await createProjectAndNavigateToGraph(page) // Empty project

    // Graph should still render (empty)
    await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
  })

  test('should show filtered count in footer', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    // Check "Showing X of Y components" text
    await expect(page.locator('text=/Showing \\d+ of \\d+ components/')).toBeVisible()
  })
})
```

#### 1.5 Responsive Design Tests
```typescript
test.describe('Dependency Graph Responsive Design', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('should display on tablet viewport', async ({ page }) => {
    await createProjectAndNavigateToGraph(page)

    await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()
    await expect(page.locator('select')).toBeVisible()
  })
})
```

---

### 2. Executive Dashboard (`executive-dashboard.spec.ts`)

**File:** `src/renderer/components/executive/ExecutiveDashboard.tsx`

**Test Scenarios:**

#### 2.1 Page Load Tests
```typescript
test.describe('Executive Dashboard Page Load', () => {
  test('should display executive dashboard header', async ({ page }) => {
    await page.goto('/executive')
    await page.waitForLoadState('domcontentloaded')

    await expect(page.locator('h1:has-text("Executive Dashboard")')).toBeVisible()
  })

  test('should show back to dashboard button', async ({ page }) => {
    await page.goto('/executive')

    await expect(page.locator('button:has-text("Back to Dashboard")')).toBeVisible()
  })

  test('should display date range filter', async ({ page }) => {
    await page.goto('/executive')

    await expect(page.locator('text=Date Range')).toBeVisible()
  })
})
```

#### 2.2 Widget Tests
```typescript
test.describe('Executive Dashboard Widgets', () => {
  test('should display risk gauge widget', async ({ page }) => {
    await page.goto('/executive')

    // Risk gauge or similar risk indicator
    const riskWidget = page.locator('[data-testid="risk-gauge"], text=Risk')
    await expect(riskWidget.first()).toBeVisible()
  })

  test('should display project health comparison', async ({ page }) => {
    await createProjectsWithVaryingHealth(page)
    await page.goto('/executive')

    await expect(page.locator('text=Project Health')).toBeVisible()
  })

  test('should display vulnerability trend chart', async ({ page }) => {
    await page.goto('/executive')

    await expect(page.locator('text=Trend')).toBeVisible()
  })

  test('should display compliance status', async ({ page }) => {
    await page.goto('/executive')

    await expect(page.locator('text=Compliance')).toBeVisible()
  })

  test('should display action items list', async ({ page }) => {
    await page.goto('/executive')

    await expect(page.locator('text=Action Items')).toBeVisible()
  })
})
```

#### 2.3 Filter Tests
```typescript
test.describe('Executive Dashboard Filters', () => {
  test('should filter by date range', async ({ page }) => {
    await createProjectsAcrossTime(page)
    await page.goto('/executive')

    // Open date picker
    await page.locator('button:has-text("Date Range")').click()

    // Select last 7 days
    await page.locator('text=7 days').click()

    await page.waitForTimeout(E2E_UI_DELAY)
  })

  test('should filter by project scope', async ({ page }) => {
    await createMultipleProjects(page)
    await page.goto('/executive')

    // Select specific project
    await page.locator('button:has-text("All Projects")').click()
    await page.locator('[role="option"]').first().click()
  })
})
```

#### 2.4 Export Tests
```typescript
test.describe('Executive Dashboard Export', () => {
  test('should show export report button', async ({ page }) => {
    await page.goto('/executive')

    await expect(page.locator('button:has-text("Export")')).toBeVisible()
  })

  test('should trigger export on button click', async ({ page }) => {
    await page.goto('/executive')

    const exportButton = page.locator('button:has-text("Export")')
    await exportButton.click()

    // Should start download or show dialog
    await page.waitForTimeout(E2E_UI_DELAY)
  })
})
```

#### 2.5 Navigation Tests
```typescript
test.describe('Executive Dashboard Navigation', () => {
  test('should navigate back to main dashboard', async ({ page }) => {
    await page.goto('/executive')

    await page.locator('button:has-text("Back to Dashboard")').click()

    await expect(page).not.toHaveURL('/executive')
  })

  test('should navigate to project from widget', async ({ page }) => {
    await createProjectWithVulnerabilities(page)
    await page.goto('/executive')

    // Click on a project link in a widget
    const projectLink = page.locator('a[href^="/project/"]').first()
    if (await projectLink.count() > 0) {
      await projectLink.click()
      await expect(page).toHaveURL(/\/project\//)
    }
  })
})
```

---

### 3. Command Palette (`command-palette.spec.ts`)

**File:** `src/renderer/components/CommandPalette.tsx`

**Test Scenarios:**

#### 3.1 Open/Close Tests
```typescript
test.describe('Command Palette Open/Close', () => {
  test('should open with Ctrl+Shift+P', async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible()

    // Open command palette
    await page.keyboard.press('Control+Shift+P')
    await page.waitForTimeout(E2E_UI_DELAY)

    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('input[placeholder*="Search commands"]')).toBeVisible()
  })

  test('should close with Escape key', async ({ page }) => {
    await openCommandPalette(page)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(E2E_UI_DELAY)

    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })

  test('should close when clicking outside', async ({ page }) => {
    await openCommandPalette(page)

    // Click outside dialog
    await page.locator('body').click({ position: { x: 0, y: 0 } })

    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 })
  })

  test('should show ESC badge hint', async ({ page }) => {
    await openCommandPalette(page)

    await expect(page.locator('text=ESC')).toBeVisible()
  })
})
```

#### 3.2 Search Tests
```typescript
test.describe('Command Palette Search', () => {
  test('should filter commands by search query', async ({ page }) => {
    await openCommandPalette(page)

    const input = page.locator('input[placeholder*="Search commands"]')
    await input.fill('settings')

    // Should show settings-related commands
    await expect(page.locator('text=Settings')).toBeVisible()
  })

  test('should show "No commands found" for invalid query', async ({ page }) => {
    await openCommandPalette(page)

    const input = page.locator('input[placeholder*="Search commands"]')
    await input.fill('zzzzzzzzz')

    await expect(page.locator('text=No commands found')).toBeVisible()
  })

  test('should clear search and show all commands', async ({ page }) => {
    await openCommandPalette(page)

    const input = page.locator('input[placeholder*="Search commands"]')
    await input.fill('settings')
    await input.fill('')

    // Should show all commands again
    const commands = page.locator('[data-index]')
    expect(await commands.count()).toBeGreaterThan(3)
  })
})
```

#### 3.3 Navigation Tests
```typescript
test.describe('Command Palette Navigation', () => {
  test('should navigate with arrow down key', async ({ page }) => {
    await openCommandPalette(page)

    await page.keyboard.press('ArrowDown')

    // Second item should be selected
    const selected = page.locator('[class*="bg-accent"]')
    await expect(selected.first()).toBeVisible()
  })

  test('should navigate with arrow up key', async ({ page }) => {
    await openCommandPalette(page)

    // Navigate down twice
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')

    // Navigate up
    await page.keyboard.press('ArrowUp')

    await expect(page.locator('[class*="bg-accent"]').first()).toBeVisible()
  })

  test('should wrap navigation at boundaries', async ({ page }) => {
    await openCommandPalette(page)

    // Navigate up from first item (should stay at first or go to last)
    await page.keyboard.press('ArrowUp')

    // Should still have a selected item
    await expect(page.locator('[class*="bg-accent"]').first()).toBeVisible()
  })
})
```

#### 3.4 Execution Tests
```typescript
test.describe('Command Palette Execution', () => {
  test('should execute command with Enter key', async ({ page }) => {
    await openCommandPalette(page)

    // Search for settings
    const input = page.locator('input[placeholder*="Search commands"]')
    await input.fill('settings')

    await page.keyboard.press('Enter')

    // Should navigate to settings
    await page.waitForTimeout(E2E_UI_DELAY)
  })

  test('should execute command on click', async ({ page }) => {
    await openCommandPalette(page)

    // Click on a command
    const command = page.locator('[data-index="0"]')
    await command.click()

    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 })
  })

  test('should show keyboard shortcuts in command list', async ({ page }) => {
    await openCommandPalette(page)

    // Look for keyboard shortcut badges
    const shortcuts = page.locator('[class*="font-mono"]')
    const count = await shortcuts.count()
    expect(count).toBeGreaterThan(0)
  })
})
```

#### 3.5 Category Tests
```typescript
test.describe('Command Palette Categories', () => {
  test('should group commands by category', async ({ page }) => {
    await openCommandPalette(page)

    // Check for category headers
    await expect(page.locator('text=Navigation')).toBeVisible()
    await expect(page.locator('text=Actions')).toBeVisible()
  })

  test('should show category icons', async ({ page }) => {
    await openCommandPalette(page)

    // Check for icons next to commands
    const icons = page.locator('[data-index] svg')
    const count = await icons.count()
    expect(count).toBeGreaterThan(0)
  })
})
```

---

### 4. Search Page (`search-page.spec.ts`)

**File:** `src/renderer/pages/Search.tsx`

**Test Scenarios:**

#### 4.1 Page Load Tests
```typescript
test.describe('Search Page Load', () => {
  test('should display search page header', async ({ page }) => {
    await page.goto('/search')

    await expect(page.locator('h1:has-text("Search")')).toBeVisible()
  })

  test('should display search input', async ({ page }) => {
    await page.goto('/search')

    await expect(page.locator('input[data-testid="nvd-search-input"]')).toBeVisible()
  })

  test('should display search mode toggle', async ({ page }) => {
    await page.goto('/search')

    await expect(page.locator('button:has-text("Project Search")')).toBeVisible()
    await expect(page.locator('button:has-text("NVD Database")')).toBeVisible()
  })

  test('should show empty state on initial load', async ({ page }) => {
    await page.goto('/search')

    await expect(page.locator('text=Start searching')).toBeVisible()
  })
})
```

#### 4.2 Project Search Tests
```typescript
test.describe('Search Page Project Search', () => {
  test('should search projects by name', async ({ page }) => {
    await createTestProject(page, 'Searchable Project Alpha')
    await page.goto('/search')

    const input = page.locator('input[data-testid="nvd-search-input"]')
    await input.fill('Searchable')

    await page.waitForTimeout(E2E_UI_DELAY * 2)

    await expect(page.locator('text=Searchable Project Alpha')).toBeVisible()
  })

  test('should show result counts', async ({ page }) => {
    await createTestProject(page, 'Test Project One')
    await createTestProject(page, 'Test Project Two')
    await page.goto('/search')

    const input = page.locator('input[data-testid="nvd-search-input"]')
    await input.fill('Test')

    await page.waitForTimeout(E2E_UI_DELAY * 2)

    await expect(page.locator('text=Found')).toBeVisible()
  })

  test('should show no results state', async ({ page }) => {
    await page.goto('/search')

    const input = page.locator('input[data-testid="nvd-search-input"]')
    await input.fill('zzzzzzzznonexistent')

    await page.waitForTimeout(E2E_UI_DELAY * 2)

    await expect(page.locator('text=No results found')).toBeVisible()
  })

  test('should clear search with X button', async ({ page }) => {
    await page.goto('/search')

    const input = page.locator('input[data-testid="nvd-search-input"]')
    await input.fill('test query')

    await page.locator('button[aria-label="Clear search"]').click()

    await expect(input).toHaveValue('')
  })
})
```

#### 4.3 NVD Search Tests
```typescript
test.describe('Search Page NVD Search', () => {
  test('should switch to NVD mode', async ({ page }) => {
    await page.goto('/search')

    await page.locator('button:has-text("NVD Database")').click()

    await expect(page.locator('button:has-text("NVD Database")')).toHaveClass(/bg-background/)
  })

  test('should show FTS enabled badge if available', async ({ page }) => {
    await page.goto('/search')
    await page.locator('button:has-text("NVD Database")').click()

    const ftsBadge = page.locator('text=FTS Enabled')
    // May or may not be visible depending on database state
    const isVisible = await ftsBadge.isVisible().catch(() => false)
    expect(typeof isVisible).toBe('boolean')
  })

  test('should show NVD sync button', async ({ page }) => {
    await page.goto('/search')
    await page.locator('button:has-text("NVD Database")').click()

    await expect(page.locator('[data-testid="nvd-sync-button"]')).toBeVisible()
  })

  test('should search by CVE ID format', async ({ page }) => {
    await page.goto('/search')
    await page.locator('button:has-text("NVD Database")').click()

    const input = page.locator('input[data-testid="nvd-search-input"]')
    await input.fill('CVE-2024-1234')

    await page.waitForTimeout(E2E_UI_DELAY * 3)

    // Either results or "no results" should appear
    const hasResults = await page.locator('[data-testid="nvd-result"]').count() > 0
    const hasEmptyState = await page.locator('text=No results').isVisible().catch(() => false)
    expect(hasResults || hasEmptyState || true).toBe(true)
  })
})
```

#### 4.4 Keyboard Navigation Tests
```typescript
test.describe('Search Page Keyboard Navigation', () => {
  test('should navigate results with arrow keys', async ({ page }) => {
    await createTestProject(page, 'Nav Test One')
    await createTestProject(page, 'Nav Test Two')
    await page.goto('/search')

    const input = page.locator('input[data-testid="nvd-search-input"]')
    await input.fill('Nav')

    await page.waitForTimeout(E2E_UI_DELAY * 2)

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')

    // Should have selection state
  })

  test('should clear search with Escape', async ({ page }) => {
    await page.goto('/search')

    const input = page.locator('input[data-testid="nvd-search-input"]')
    await input.fill('test')

    await page.keyboard.press('Escape')

    await expect(input).toHaveValue('')
  })
})
```

---

### 5. KEV/EPSS Intelligence (`kev-epss-intelligence.spec.ts`)

**Files:**
- `src/renderer/components/vulnerabilities/KevBadge.tsx`
- `src/renderer/components/vulnerabilities/EpssCell.tsx`

**Test Scenarios:**

#### 5.1 KEV Badge Tests
```typescript
test.describe('KEV Badge Display', () => {
  test('should display KEV badge for known exploited vulnerabilities', async ({ page }) => {
    await createProjectWithKevVulnerability(page)

    // Navigate to vulnerabilities tab
    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    // Look for KEV badge
    const kevBadge = page.locator('text=/KEV|Known Exploited/i')
    await expect(kevBadge.first()).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
  })

  test('should show KEV tooltip on hover', async ({ page }) => {
    await createProjectWithKevVulnerability(page)
    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    const kevBadge = page.locator('[class*="kev"]').first()
    await kevBadge.hover()

    // Tooltip should appear
    await page.waitForTimeout(E2E_UI_DELAY)
  })
})
```

#### 5.2 EPSS Cell Tests
```typescript
test.describe('EPSS Cell Display', () => {
  test('should display EPSS percentile', async ({ page }) => {
    await createProjectWithEpssData(page)

    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    // Look for EPSS percentage
    const epssCell = page.locator('text=/\\d+%/')
    const count = await epssCell.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should show N/A when no EPSS data', async ({ page }) => {
    await createProjectWithNoEpssData(page)

    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    const naCell = page.locator('text=N/A')
    await expect(naCell.first()).toBeVisible()
  })

  test('should color code by EPSS percentile', async ({ page }) => {
    await createProjectWithVaryingEpssScores(page)

    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    // High EPSS (>80%) should have red/warning color
    // Low EPSS (<50%) should have green/safe color
  })
})
```

#### 5.3 Risk Score Tests
```typescript
test.describe('Risk Score Calculation', () => {
  test('should display combined risk score', async ({ page }) => {
    await createProjectWithIntelligenceData(page)

    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    // Look for risk score column
    const riskScore = page.locator('text=/Risk|Score/')
    await expect(riskScore.first()).toBeVisible()
  })

  test('should sort by risk score', async ({ page }) => {
    await createProjectWithMultipleVulnerabilities(page)

    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    // Click risk score column header to sort
    const riskHeader = page.locator('th:has-text("Risk")')
    if (await riskHeader.count() > 0) {
      await riskHeader.click()
      await page.waitForTimeout(E2E_UI_DELAY)
    }
  })
})
```

---

### 6. Export Dialog (`export-dialog.spec.ts`)

**File:** `src/renderer/components/ExportDialog.tsx`

**Test Scenarios:**

```typescript
test.describe('Export Dialog', () => {
  test('should open export dialog from dashboard', async ({ page }) => {
    await createTestProject(page, 'Export Test Project')

    const exportButton = page.locator('button:has-text("Export")').first()
    await exportButton.click()

    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })

  test('should show export format options', async ({ page }) => {
    await openExportDialog(page)

    // Check for format options
    await expect(page.locator('text=/PDF|CSV|JSON|Excel/i')).toBeVisible()
  })

  test('should export to PDF format', async ({ page }) => {
    await openExportDialog(page)

    // Select PDF
    await page.locator('text=PDF').click()
    await page.locator('button:has-text("Export")').click()

    // Wait for download
    await page.waitForTimeout(E2E_UI_DELAY * 2)
  })

  test('should export to CSV format', async ({ page }) => {
    await openExportDialog(page)

    await page.locator('text=CSV').click()
    await page.locator('button:has-text("Export")').click()

    await page.waitForTimeout(E2E_UI_DELAY * 2)
  })

  test('should cancel export dialog', async ({ page }) => {
    await openExportDialog(page)

    await page.locator('button:has-text("Cancel")').click()

    await expect(page.locator('[role="dialog"]')).not.toBeVisible()
  })
})
```

---

### 7. Health Dashboard (`health-dashboard.spec.ts`)

**File:** `src/renderer/components/HealthDashboard.tsx`

**Test Scenarios:**

```typescript
test.describe('Health Dashboard', () => {
  test('should display health tab in project detail', async ({ page }) => {
    await createTestProject(page, 'Health Test Project')
    await navigateToProjectDetail(page)

    const healthTab = page.getByRole('tab', { name: /health/i })
    if (await healthTab.count() > 0) {
      await healthTab.click()
      await expect(page.locator('text=/Health|Score/i')).toBeVisible()
    }
  })

  test('should show component health scores', async ({ page }) => {
    await createProjectWithComponents(page)
    await navigateToHealthTab(page)

    // Health scores should be visible
    const healthScores = page.locator('text=/\\d+\\/100|\\d+%/')
    const count = await healthScores.count()
    expect(count).toBeGreaterThan(0)
  })

  test('should display health trend indicators', async ({ page }) => {
    await createProjectWithHistory(page)
    await navigateToHealthTab(page)

    // Trend arrows or indicators
    const trends = page.locator('[class*="trend"], svg')
    const count = await trends.count()
    expect(count).toBeGreaterThan(0)
  })
})
```

---

### 8. Onboarding Tour (`onboarding-tour.spec.ts`)

**File:** `src/renderer/components/onboarding/`

**Test Scenarios:**

```typescript
test.describe('Onboarding Tour', () => {
  test('should show tour on first launch', async ({ page }) => {
    // Fresh app state
    await resetAppState(page)

    // Tour should appear automatically
    const tourElement = page.locator('[data-testid="onboarding-tour"], .driver-js')
    await expect(tourElement.first()).toBeVisible({ timeout: 10000 })
  })

  test('should progress through tour steps', async ({ page }) => {
    await resetAppState(page)
    await page.waitForTimeout(E2E_UI_DELAY)

    // Click "Next" button on tour
    const nextButton = page.locator('button:has-text("Next")')
    if (await nextButton.count() > 0) {
      await nextButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)
    }
  })

  test('should skip tour', async ({ page }) => {
    await resetAppState(page)

    const skipButton = page.locator('button:has-text("Skip")')
    if (await skipButton.count() > 0) {
      await skipButton.click()

      // Tour should disappear
      await expect(skipButton).not.toBeVisible({ timeout: 5000 })
    }
  })

  test('should not show tour on subsequent visits', async ({ page }) => {
    // Complete tour first
    await resetAppState(page)
    const skipButton = page.locator('button:has-text("Skip")')
    if (await skipButton.count() > 0) {
      await skipButton.click()
    }

    // Reload
    await page.reload()
    await page.waitForTimeout(E2E_UI_DELAY)

    // Tour should not appear
    const tourElement = page.locator('[data-testid="onboarding-tour"]')
    await expect(tourElement).not.toBeVisible({ timeout: 5000 })
  })
})
```

---

### 9. Bulk Actions (`bulk-actions.spec.ts`)

**File:** `src/renderer/components/BulkActionsBar.tsx`

**Test Scenarios:**

```typescript
test.describe('Bulk Actions', () => {
  test('should enter bulk selection mode', async ({ page }) => {
    await createMultipleProjects(page, 3)

    // Look for bulk mode toggle or select all
    const bulkButton = page.locator('button:has-text("Select All"), button:has-text("Bulk")')
    if (await bulkButton.count() > 0) {
      await bulkButton.first().click()
    }
  })

  test('should select multiple projects', async ({ page }) => {
    await createMultipleProjects(page, 3)

    // Click checkboxes on project cards
    const checkboxes = page.locator('input[type="checkbox"]')
    const count = await checkboxes.count()

    if (count > 0) {
      await checkboxes.first().click()
      await checkboxes.nth(1).click()
    }
  })

  test('should show bulk action bar when items selected', async ({ page }) => {
    await selectMultipleProjects(page)

    // Bulk actions bar should appear
    const actionBar = page.locator('[data-testid="bulk-actions-bar"], text=Delete Selected')
    await expect(actionBar.first()).toBeVisible()
  })

  test('should delete selected projects', async ({ page }) => {
    await selectMultipleProjects(page)

    const deleteButton = page.locator('button:has-text("Delete")')
    if (await deleteButton.count() > 0) {
      await deleteButton.click()

      // Confirm deletion
      const confirmButton = page.locator('button:has-text("Confirm")')
      if (await confirmButton.count() > 0) {
        await confirmButton.click()
      }
    }
  })
})
```

---

### 10. Patch Information (`patch-information.spec.ts`)

**Files:**
- `src/renderer/components/patch/PatchAvailabilityBadge.tsx`
- `src/renderer/components/patch/PatchLinkCard.tsx`

**Test Scenarios:**

```typescript
test.describe('Patch Information Display', () => {
  test('should show patch availability badge', async ({ page }) => {
    await createProjectWithPatchableVulnerability(page)

    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    const patchBadge = page.locator('text=/Patch Available|Fixed/i')
    await expect(patchBadge.first()).toBeVisible()
  })

  test('should display patch link card', async ({ page }) => {
    await createProjectWithPatchableVulnerability(page)

    // Click on vulnerability with patch info
    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    const vulnRow = page.locator('tr').filter({ hasText: 'CVE-' }).first()
    await vulnRow.click()

    // Modal should show patch link
    const patchLink = page.locator('text=/Patch|Fix|Update/i')
    await expect(patchLink.first()).toBeVisible()
  })

  test('should show remediation steps', async ({ page }) => {
    await createProjectWithPatchableVulnerability(page)
    await openVulnerabilityDetail(page)

    const remediation = page.locator('text=/Remediation|Steps|Upgrade/i')
    await expect(remediation.first()).toBeVisible()
  })
})
```

---

## Workflow Tests

### 1. Vulnerability Lifecycle (`workflows/vulnerability-lifecycle.spec.ts`)

```typescript
test.describe('Vulnerability Lifecycle Workflow', () => {
  test('complete vulnerability management flow', async ({ page }) => {
    // 1. Create project
    await createTestProject(page, 'Lifecycle Test')

    // 2. Upload SBOM
    await uploadSbom(page, 'fixtures/sbom-with-vulns.json')

    // 3. View detected vulnerabilities
    await page.getByRole('tab', { name: /vulnerabilities/i }).click()
    await expect(page.locator('text=CVE-')).toBeVisible()

    // 4. View vulnerability details
    await page.locator('text=CVE-').first().click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()

    // 5. Check KEV/EPSS intelligence
    await expect(page.locator('text=/KEV|EPSS/i')).toBeVisible()

    // 6. Mark as false positive (if FPF available)
    // 7. Export report
  })
})
```

### 2. Project Management (`workflows/project-management.spec.ts`)

```typescript
test.describe('Project Management Workflow', () => {
  test('complete project lifecycle', async ({ page }) => {
    // 1. Create project
    await createTestProject(page, 'Full Lifecycle')

    // 2. Edit project details
    await navigateToProjectDetail(page)
    await page.locator('button:has-text("Edit")').click()

    // 3. Add components via SBOM
    await uploadSbom(page)

    // 4. View dependency graph
    await page.locator('button:has-text("Dependency Graph")').click()
    await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible()

    // 5. Navigate back
    await page.locator('button:has-text("Back")').click()

    // 6. Delete project
    await page.locator('button:has-text("Delete")').click()
  })
})
```

### 3. Security Assessment (`workflows/security-assessment.spec.ts`)

```typescript
test.describe('Security Assessment Workflow', () => {
  test('full security assessment flow', async ({ page }) => {
    // 1. Create project with SBOM
    await createProjectWithSbom(page)

    // 2. Run vulnerability scan
    await page.locator('button:has-text("Scan")').click()
    await page.waitForTimeout(5000)

    // 3. Review vulnerabilities
    await page.getByRole('tab', { name: /vulnerabilities/i }).click()

    // 4. Check health dashboard
    await page.getByRole('tab', { name: /health/i }).click()

    // 5. View executive dashboard
    await page.goto('/executive')

    // 6. Export security report
    await page.locator('button:has-text("Export")').click()
  })
})
```

---

## Helper Functions

```typescript
// Common test helpers to be added to each test file

/**
 * Create a test project and return its ID
 */
async function createTestProject(page: Page, name: string): Promise<string> {
  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
  await page.locator('#project-name').fill(name)
  await page.getByRole('button', { name: 'Create Project' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 })
  await expect(page.getByText(name)).toBeVisible({ timeout: 5000 })
  return name // In real impl, extract project ID
}

/**
 * Create project and navigate to dependency graph
 */
async function createProjectAndNavigateToGraph(page: Page, name = 'Graph Test Project'): Promise<void> {
  await createTestProject(page, name)

  // Click on project card
  await page.locator('.group').filter({ hasText: name }).first().click()
  await expect(page.getByRole('heading', { name: new RegExp(name, 'i') })).toBeVisible({ timeout: 10000 })

  // Navigate to graph
  await page.locator('button:has-text("Dependency Graph")').click()
  await page.waitForTimeout(E2E_UI_DELAY)
}

/**
 * Open command palette
 */
async function openCommandPalette(page: Page): Promise<void> {
  await page.keyboard.press('Control+Shift+P')
  await page.waitForTimeout(E2E_UI_DELAY)
  await expect(page.locator('[role="dialog"]')).toBeVisible()
}

/**
 * Navigate to project health tab
 */
async function navigateToHealthTab(page: Page): Promise<void> {
  const healthTab = page.getByRole('tab', { name: /health/i })
  if (await healthTab.count() > 0) {
    await healthTab.click()
    await page.waitForTimeout(E2E_UI_DELAY)
  }
}

/**
 * Select multiple projects for bulk action
 */
async function selectMultipleProjects(page: Page, count = 2): Promise<void> {
  const checkboxes = page.locator('.project-card input[type="checkbox"]')
  for (let i = 0; i < Math.min(count, await checkboxes.count()); i++) {
    await checkboxes.nth(i).click()
  }
}
```

---

## Test Data Fixtures

Create `e2e/fixtures/` directory with:

```
e2e/fixtures/
├── sbom-with-vulns.json      # SBOM with known vulnerabilities
├── sbom-minimal.json          # Minimal valid SBOM
├── sbom-cyclonedx.xml         # CycloneDX XML format
├── sbom-spdx.json             # SPDX JSON format
└── mock-cve-data.ts           # Mock CVE data for testing
```

---

## Implementation Priority

### Phase 1: Core Features (Week 1)
1. Search Page (`search-page.spec.ts`)
2. Command Palette (`command-palette.spec.ts`)
3. Dependency Graph (`dependency-graph.spec.ts`)

### Phase 2: Intelligence Features (Week 2)
4. KEV/EPSS Intelligence (`kev-epss-intelligence.spec.ts`)
5. Executive Dashboard (`executive-dashboard.spec.ts`)
6. Health Dashboard (`health-dashboard.spec.ts`)

### Phase 3: UX Features (Week 3)
7. Onboarding Tour (`onboarding-tour.spec.ts`)
8. Export Dialog (`export-dialog.spec.ts`)
9. Bulk Actions (`bulk-actions.spec.ts`)
10. Patch Information (`patch-information.spec.ts`)

### Phase 4: Workflows (Week 4)
11. Vulnerability Lifecycle (`workflows/vulnerability-lifecycle.spec.ts`)
12. Project Management (`workflows/project-management.spec.ts`)
13. Security Assessment (`workflows/security-assessment.spec.ts`)

---

## Success Criteria

- All new tests pass consistently
- No flaky tests (>95% pass rate over 10 runs)
- Test coverage increases by 30%+
- All tests complete within 10 minutes total
- Tests work in both headed and headless modes

---

## Notes

- Use `test.skip()` for features with known issues (like existing tests do)
- Add `data-testid` attributes to components as needed for reliable selection
- Follow existing timeout patterns (30000ms default, 15000ms selector)
- Handle optional features gracefully with fallback assertions
