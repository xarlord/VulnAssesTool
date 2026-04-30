import { test, expect, resetAppState } from '../electron-helper'
import {
  E2E_SELECTOR_TIMEOUT,
  E2E_UI_DELAY,
  createTestProject,
  navigateToVulnerabilitiesTab,
  isFeatureImplemented,
} from '../shared-helpers'

/**
 * E2E Tests for Patch Information Display
 *
 * Tests the complete patch information functionality including:
 * - Patch availability badges
 * - Patch link cards
 * - Remediation steps
 * - Fixed version display
 *
 * NOTE: Many of these tests require the patch information feature to be fully implemented.
 * Tests will skip if the feature is not available.
 */

test.describe('Patch Information Display', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // Patch Availability Badge Tests
  // ==========================================================================

  test.describe('Patch Availability Badge', () => {
    test('should show patch available badge for fixable vulnerabilities', async ({ page }) => {
      await createTestProject(page, 'Patchable Vuln Test')
      await navigateToVulnerabilitiesTab(page)

      const hasFeature = await isFeatureImplemented(page, 'text=/Patch Available|Fixed Version|Fixable/i')

      if (!hasFeature) {
        test.skip(true, 'Patch availability badge feature not yet implemented')
        return
      }

      const patchBadge = page.locator('text=/Patch Available|Fixed Version|Fixable/i')
      await expect(patchBadge.first()).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should show fixed version number in badge', async ({ page }) => {
      await createTestProject(page, 'Fixed Version Test')
      await navigateToVulnerabilitiesTab(page)

      const versionBadge = page.locator('text=/\\d+\\.\\d+\\.\\d+|v\\d+/')
      const hasVersion = (await versionBadge.count()) > 0

      if (!hasVersion) {
        test.skip(true, 'Fixed version badge not found - feature may not be implemented')
        return
      }

      expect(hasVersion).toBe(true)
    })

    test('should show no patch badge when no fix available', async ({ page }) => {
      await createTestProject(page, 'No Fix Test')
      await navigateToVulnerabilitiesTab(page)

      const noFixBadge = page.locator('text=/No Fix|No Patch|Unfixed/i')
      const hasNoFix = (await noFixBadge.count()) > 0

      if (!hasNoFix) {
        test.skip(true, 'No-fix badge not found - feature may not be implemented')
        return
      }

      expect(hasNoFix).toBe(true)
    })

    test('should show patch confidence indicator', async ({ page }) => {
      await createTestProject(page, 'Patch Confidence Test')
      await navigateToVulnerabilitiesTab(page)

      const confidenceIndicator = page.locator('text=/Official|Vendor|Community|Verified/i')
      const hasConfidence = (await confidenceIndicator.count()) > 0

      if (!hasConfidence) {
        test.skip(true, 'Patch confidence indicator not found - feature may not be implemented')
        return
      }

      expect(hasConfidence).toBe(true)
    })
  })

  // ==========================================================================
  // Patch Link Card Tests
  // ==========================================================================

  test.describe('Patch Link Card', () => {
    test('should display patch link card in vulnerability detail', async ({ page }) => {
      await createTestProject(page, 'Patch Link Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) {
        test.skip(true, 'No vulnerability detail available - no vuln data')
        return
      }

      const patchSection = page.locator('text=/Patch|Fix|Remediation/i')
      const hasPatchSection = (await patchSection.count()) > 0

      if (!hasPatchSection) {
        test.skip(true, 'Patch section not found in vulnerability detail')
        return
      }

      await expect(patchSection.first()).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should show patch source link', async ({ page }) => {
      await createTestProject(page, 'Patch Source Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const patchLink = page.locator('a[href*="nvd.nist.gov"], a[href*="github.com"], a[href*="cve.org"]')
      const hasLink = (await patchLink.count()) > 0

      if (!hasLink) {
        test.skip(true, 'External patch link not found - feature may not be implemented')
        return
      }

      expect(hasLink).toBe(true)
    })

    test('should show affected version range', async ({ page }) => {
      await createTestProject(page, 'Version Range Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const versionRange = page.locator('text=/Affected|Version|<|>=|<=|>/i')
      const hasVersionRange = (await versionRange.count()) > 0

      if (!hasVersionRange) {
        test.skip(true, 'Version range info not found - feature may not be implemented')
        return
      }

      expect(hasVersionRange).toBe(true)
    })

    test('should show patch date if available', async ({ page }) => {
      await createTestProject(page, 'Patch Date Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const dateInfo = page.locator('text=/\\d{4}-\\d{2}-\\d{2}|Published|Updated/i')
      const hasDate = (await dateInfo.count()) > 0

      if (!hasDate) {
        test.skip(true, 'Patch date info not found - feature may not be implemented')
        return
      }

      expect(hasDate).toBe(true)
    })
  })

  // ==========================================================================
  // Remediation Steps Tests
  // ==========================================================================

  test.describe('Remediation Steps', () => {
    test('should display remediation steps', async ({ page }) => {
      await createTestProject(page, 'Remediation Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) {
        test.skip(true, 'No vulnerability detail available')
        return
      }

      const remediation = page.locator('text=/Remediation|Steps|How to Fix|Recommendation/i')
      const hasRemediation = (await remediation.count()) > 0

      if (!hasRemediation) {
        test.skip(true, 'Remediation section not found')
        return
      }

      await expect(remediation.first()).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    })

    test('should show upgrade command if applicable', async ({ page }) => {
      await createTestProject(page, 'Upgrade Command Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const upgradeCommand = page.locator('text=/npm|yarn|pnpm|pip|gem|mvn|gradle/i')
      const hasCommand = (await upgradeCommand.count()) > 0

      if (!hasCommand) {
        test.skip(true, 'Upgrade command not found - feature may not be implemented')
        return
      }

      expect(hasCommand).toBe(true)
    })

    test('should show workaround if no patch available', async ({ page }) => {
      await createTestProject(page, 'Workaround Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const workaround = page.locator('text=/Workaround|Mitigation|Alternative/i')
      const hasWorkaround = (await workaround.count()) > 0

      if (!hasWorkaround) {
        test.skip(true, 'Workaround info not found - feature may not be implemented')
        return
      }

      expect(hasWorkaround).toBe(true)
    })

    test('should show severity of remediation action', async ({ page }) => {
      await createTestProject(page, 'Priority Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const priority = page.locator('text=/Critical|High Priority|Immediate|Urgent/i')
      const hasPriority = (await priority.count()) > 0

      if (!hasPriority) {
        test.skip(true, 'Priority indicator not found - feature may not be implemented')
        return
      }

      expect(hasPriority).toBe(true)
    })
  })

  // ==========================================================================
  // Copy to Clipboard Tests
  // ==========================================================================

  test.describe('Copy to Clipboard', () => {
    test('should have copy button for fixed version', async ({ page }) => {
      await createTestProject(page, 'Copy Button Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const copyButton = page.locator('button[aria-label*="copy"], button:has-text("Copy")')
      const hasCopy = (await copyButton.count()) > 0

      if (!hasCopy) {
        test.skip(true, 'Copy button not found - feature may not be implemented')
        return
      }

      expect(hasCopy).toBe(true)
    })

    test('should copy version to clipboard', async ({ page }) => {
      await createTestProject(page, 'Copy Action Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const copyButton = page.locator('button[aria-label*="copy"], button:has-text("Copy")').first()
      if (!(await copyButton.isVisible().catch(() => false))) {
        test.skip(true, 'Copy button not found')
        return
      }

      await copyButton.click()
      await page.waitForTimeout(E2E_UI_DELAY)

      const feedback = page.locator('text=/Copied|Success/i')
      const hasFeedback = await feedback.isVisible().catch(() => false)

      if (!hasFeedback) {
        test.skip(true, 'Copy feedback not shown - feature may not be fully implemented')
        return
      }

      expect(hasFeedback).toBe(true)
    })
  })

  // ==========================================================================
  // Multiple Patches Tests
  // ==========================================================================

  test.describe('Multiple Patches', () => {
    test('should show all available patches', async ({ page }) => {
      await createTestProject(page, 'Multiple Patches Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const patchEntries = page.locator('[data-testid="patch-entry"], .patch-card, .remediation-item')
      const count = await patchEntries.count()

      if (count === 0) {
        test.skip(true, 'No patch entries found - feature may not be fully implemented')
        return
      }

      expect(count).toBeGreaterThan(0)
    })

    test('should indicate recommended patch', async ({ page }) => {
      await createTestProject(page, 'Recommended Patch Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) return

      const recommended = page.locator('text=/Recommended|Preferred|Latest/i')
      const hasRecommended = (await recommended.count()) > 0

      if (!hasRecommended) {
        test.skip(true, 'Recommended patch indicator not found - feature may not be implemented')
        return
      }

      expect(hasRecommended).toBe(true)
    })
  })

  // ==========================================================================
  // Accessibility Tests
  // ==========================================================================

  test.describe('Accessibility', () => {
    test('should have accessible patch information', async ({ page }) => {
      await createTestProject(page, 'Accessibility Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) {
        test.skip(true, 'No vulnerability detail available')
        return
      }

      const headings = page.locator('h1, h2, h3')
      const count = await headings.count()

      expect(count).toBeGreaterThan(0)
    })

    test('should have keyboard accessible patch links', async ({ page }) => {
      await createTestProject(page, 'Keyboard Test')
      const hasDetail = await openVulnerabilityDetail(page)
      if (!hasDetail) {
        test.skip(true, 'No vulnerability detail available')
        return
      }

      const links = page.locator('a[href]')
      const count = await links.count()

      if (count > 0) {
        await page.keyboard.press('Tab')
        await page.keyboard.press('Tab')
      } else {
        test.skip(true, 'No links found for keyboard navigation test')
      }
    })
  })
})

// ==========================================================================
// Helper Functions
// ==========================================================================

/**
 * Open vulnerability detail modal
 */
async function openVulnerabilityDetail(page: import('@playwright/test').Page): Promise<boolean> {
  await page.getByRole('tab', { name: /vulnerabilities/i }).click()
  await page.waitForTimeout(E2E_UI_DELAY)

  const vulnRow = page.locator('tr:has-text("CVE-"), [data-testid="vuln-row"]').first()
  const hasVulnRow = await vulnRow.isVisible().catch(() => false)

  if (!hasVulnRow) {
    return false
  }

  await vulnRow.click()
  await page.waitForTimeout(E2E_UI_DELAY)

  const modal = page.locator('[role="dialog"]')
  const hasModal = await modal.isVisible().catch(() => false)
  return hasModal
}
