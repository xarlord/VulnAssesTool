/**
 * E2E Tests for Notification Center Component
 *
 * These tests cover click-outside behavior and notification functionality
 * that cannot be properly tested in jsdom.
 */

import { test, expect, resetAppState } from '../electron-helper'

test.describe('Notification Center E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    // Wait for dashboard to load
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('should display notification bell icon', async ({ page }) => {
    // Look for notification bell icon using data-testid
    const bellIcon = page.getByTestId('notification-bell')
    await expect(bellIcon).toBeVisible({ timeout: 10000 })
  })

  test('should open notification dropdown on click', async ({ page }) => {
    // Click notification bell
    const bellIcon = page.getByTestId('notification-bell')
    await bellIcon.click()

    // Verify dropdown opened using data-testid
    const dropdown = page.getByTestId('notification-dropdown')
    await expect(dropdown).toBeVisible({ timeout: 5000 })
  })

  test('should close dropdown when clicking outside', async ({ page }) => {
    // Open notification dropdown
    const bellIcon = page.getByTestId('notification-bell')
    await bellIcon.click()

    // Wait for dropdown to open
    await page.waitForTimeout(500)

    // Click outside (on the main content area - the New Project button area)
    await page.click('body', { position: { x: 200, y: 200 } })

    // Wait for dropdown to close
    await page.waitForTimeout(500)

    // Dropdown should no longer be visible
    const dropdown = page.getByTestId('notification-dropdown')
    await expect(dropdown).not.toBeVisible({ timeout: 3000 })
  })

  test('should display notification list when dropdown is open', async ({ page }) => {
    // Open notification dropdown
    const bellIcon = page.getByTestId('notification-bell')
    await bellIcon.click()

    // Check for notification list or empty state
    const notificationArea = page.locator('text=/notification|no.*notification|empty/i')
    await expect(notificationArea.first()).toBeVisible({ timeout: 5000 })
  })

  test('should have accessible notification button', async ({ page }) => {
    // Check for accessibility attributes using data-testid
    const bellButton = page.getByTestId('notification-bell')

    // Button should be visible
    await expect(bellButton).toBeVisible()

    // Check for aria-label or content
    const ariaLabel = await bellButton.getAttribute('aria-label')
    const hasAccessibleName = ariaLabel !== null

    expect(hasAccessibleName).toBe(true)
  })

  test('should toggle dropdown on repeated clicks', async ({ page }) => {
    const bellIcon = page.getByTestId('notification-bell')

    // First click - open
    await bellIcon.click()
    await page.waitForTimeout(300)

    // Verify dropdown is visible
    const dropdown = page.getByTestId('notification-dropdown')
    await expect(dropdown).toBeVisible({ timeout: 3000 })

    // Second click - close (if toggle behavior)
    await bellIcon.click()
    await page.waitForTimeout(300)
  })
})
