/**
 * Notification Center E2E Tests — content contracts
 *
 * NotificationCenter.tsx is pure client state (zustand store, no network), so its
 * behavior is fully deterministic offline. Grounding:
 *   - data-testid="notification-bell" / "notification-dropdown" (NotificationCenter.tsx:100,113)
 *   - bell click toggles the same boolean: `onClick={() => setIsOpen(!isOpen)}` (L97); the
 *     bell button lives inside the same `dropdownRef` div as the dropdown (L95), so clicking it
 *     never fires the outside-click handler (L27-36) — a second click must close the dropdown.
 *   - a `mousedown` listener outside `dropdownRef` sets `isOpen` to false (L27-36)
 *   - nothing seeds a notification automatically: notificationsStore.ts starts with
 *     `notifications: []` (L36) and only persists `preferences` (partialize, L101-103); no
 *     caller in notificationService.ts adds one on load. So in a fresh test the list is always
 *     empty, which renders the designed empty state "No notifications" (NotificationCenter.tsx:146)
 *     and drives unreadCount to 0.
 *   - the bell's aria-label template is `Notifications ${unreadCount > 0 ? '(N unread)' : ''}`
 *     (L99); with unreadCount always 0 here, the literal rendered value is "Notifications "
 *     (trailing space from the template, not a typo).
 *
 * Replaced: a regex-OR locator (`text=/notification|no.*notification|empty/i`) that always
 * matched the dropdown's own "Notifications" header regardless of whether the list or the empty
 * state rendered, a boolean-presence check (`ariaLabel !== null`) that could never fail while any
 * aria-label is set, and a toggle test that asserted nothing at all after its second click.
 */

import { test, expect, resetAppState } from '../test-helper'

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

  test('should show the empty-notifications state when dropdown is open', async ({ page }) => {
    // Nothing seeds a notification automatically (see notificationsStore.ts / notificationService.ts),
    // so a fresh app state always renders NotificationCenter.tsx's designed empty state.
    const bellIcon = page.getByTestId('notification-bell')
    await bellIcon.click()

    const dropdown = page.getByTestId('notification-dropdown')
    await expect(dropdown).toBeVisible({ timeout: 5000 })
    await expect(dropdown.getByText('No notifications')).toBeVisible()
  })

  test('should expose the zero unread count in the bell aria-label', async ({ page }) => {
    // aria-label is `Notifications ${unreadCount > 0 ? '(N unread)' : ''}` (NotificationCenter.tsx:99).
    // With zero notifications the ternary's else-branch is '', so the rendered label is
    // literally "Notifications " (trailing space from the template).
    const bellButton = page.getByTestId('notification-bell')
    await expect(bellButton).toBeVisible()
    await expect(bellButton).toHaveAttribute('aria-label', 'Notifications ')
  })

  test('should toggle the dropdown closed on a second bell click', async ({ page }) => {
    const bellIcon = page.getByTestId('notification-bell')
    const dropdown = page.getByTestId('notification-dropdown')

    // First click - open
    await bellIcon.click()
    await expect(dropdown).toBeVisible({ timeout: 3000 })

    // Second click flips the same isOpen boolean (`onClick={() => setIsOpen(!isOpen)}`,
    // NotificationCenter.tsx:97), so the dropdown must close again.
    await bellIcon.click()
    await expect(dropdown).not.toBeVisible({ timeout: 3000 })
  })
})
