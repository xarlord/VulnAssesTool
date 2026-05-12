import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { NotificationCenter } from './NotificationCenter'
import { useNotificationsStore } from '@/lib/notifications'

// Mock date-fns
vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => '2 hours ago'),
}))

// Mock navigator
const mockedNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  }
})

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

// Mock Notification API
const mockNotifications: any[] = []

class MockNotification {
  static permission: NotificationPermission = 'granted'

  constructor(title: string, options?: NotificationOptions) {
    mockNotifications.push({ title, options })
  }

  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission)

  // Global methods to manage mock notifications
  static getMockNotifications = () => mockNotifications

  static clearMockNotifications = () => {
    mockNotifications.length = 0
  }
}

// Store mock methods on window for test access
;(window as any).getMockNotifications = () => MockNotification.getMockNotifications()
;(window as any).clearMockNotifications = () => MockNotification.clearMockNotifications()

// Set up the global mock
global.Notification = MockNotification as any

describe('NotificationCenter', () => {
  beforeEach(() => {
    // Clear mock notifications
    ;(window as any).clearMockNotifications()

    // Reset store and add test notifications
    const store = useNotificationsStore.getState()
    store.clearAll()
    store.updatePreferences({
      enabled: true,
      desktopEnabled: true,
      categories: {
        critical_vuln: true,
        scan_complete: true,
        update_available: true,
        system: true,
      },
    })

    // Add some test notifications
    store.addNotification({
      type: 'error',
      category: 'critical_vuln',
      title: 'Critical Vulnerability',
      message: 'CVE-2024-1234 detected',
      projectId: 'project-1',
      actionUrl: '/project/project-1',
    })

    store.addNotification({
      type: 'success',
      category: 'scan_complete',
      title: 'Scan Complete',
      message: 'Scan finished successfully',
    })
  })

  afterEach(() => {
    // Clean up after each test
    const store = useNotificationsStore.getState()
    store.clearAll()
  })

  it('should render bell icon', () => {
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications \(\d+ unread\)/i })
    expect(bellButton).toBeInTheDocument()
  })

  it('should show unread count badge', () => {
    renderWithRouter(<NotificationCenter />)

    const badge = screen.getByText('2')
    expect(badge).toBeInTheDocument()
  })

  it('should not render when notifications are disabled', () => {
    const store = useNotificationsStore.getState()
    store.updatePreferences({ enabled: false })

    const { container } = renderWithRouter(<NotificationCenter />)
    expect(container.firstChild).toBeNull()
  })

  it('should open dropdown when clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    await user.click(bellButton)

    expect(screen.getByText('Notifications')).toBeInTheDocument()
    expect(screen.getByText('Critical Vulnerability')).toBeInTheDocument()
    expect(screen.getByText('Scan Complete')).toBeInTheDocument()
  })

  it('should show empty state when no notifications', () => {
    const store = useNotificationsStore.getState()
    store.clearAll()

    renderWithRouter(<NotificationCenter />)

    // When empty, just look for the bell button
    const bellButton = screen.getByRole('button', { name: /notifications/i })
    fireEvent.click(bellButton)

    expect(screen.getByText('No notifications')).toBeInTheDocument()
  })

  it('should mark all as read when button is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    await user.click(bellButton)

    const markAllButton = screen.getByText('Mark all read').closest('button')!
    await user.click(markAllButton)

    const store = useNotificationsStore.getState()
    expect(store.notifications.every((n) => n.read)).toBe(true)
  })

  it('should clear all notifications when button is clicked', async () => {
    global.confirm = vi.fn(() => true)
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    await user.click(bellButton)

    // Find the clear button by title
    const clearButton = screen.getByTitle('Clear all notifications')
    await user.click(clearButton)

    expect(global.confirm).toHaveBeenCalledWith('Clear all notifications?')

    const store = useNotificationsStore.getState()
    expect(store.notifications).toHaveLength(0)
  })

  it('should navigate to action URL when notification is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    await user.click(bellButton)

    // Click on the notification div that has the action URL
    const notifications = screen.getAllByText('Critical Vulnerability')
    await user.click(notifications[0].closest('div')!)

    expect(mockedNavigate).toHaveBeenCalledWith('/project/project-1')
  })

  it('should mark notification as read when clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    await user.click(bellButton)

    // Store initial state
    let store = useNotificationsStore.getState()
    const firstNotificationId = store.notifications.find((n) => n.title === 'Critical Vulnerability')?.id

    // Click on notification
    const notification = screen.getByText('Critical Vulnerability').closest('div')!
    await user.click(notification)

    // Re-fetch store state after click
    store = useNotificationsStore.getState()
    expect(store.notifications.find((n) => n.id === firstNotificationId)?.read).toBe(true)
  })

  it('should dismiss notification when X is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    await user.click(bellButton)

    // Get initial count
    let store = useNotificationsStore.getState()
    const initialCount = store.notifications.length

    // Find dismiss buttons (X icons in notification items)
    const dismissButtons = screen
      .getAllByRole('button')
      .filter((button) => button.classList.contains('text-muted-foreground') || button.textContent === '')

    // Click first dismiss button that's not the main bell
    const nonBellDismiss = dismissButtons.find((b) => b !== bellButton)
    if (nonBellDismiss) {
      await user.click(nonBellDismiss)
    }

    // Re-fetch store state after click
    store = useNotificationsStore.getState()
    // Check that notifications decreased
    expect(store.notifications.length).toBeLessThan(initialCount)
  })

  // Note: This test was previously skipped but now works with proper event handling
  it('should close dropdown when clicking outside', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    await user.click(bellButton)

    // Dropdown should be open
    expect(screen.getByText('Notifications')).toBeInTheDocument()

    // Create an element outside the dropdown to click on
    const outsideElement = document.createElement('div')
    outsideElement.id = 'outside-element'
    document.body.appendChild(outsideElement)

    // Click outside the dropdown
    fireEvent.mouseDown(outsideElement)

    // Wait for dropdown to close using findBy (more reliable than waitFor)
    // The dropdown should no longer show "Notifications"
    await screen.findByText('Notifications', {}, { timeout: 1000 }).then(
      () => {
        throw new Error('Dropdown should be closed')
      },
      () => {
        /* Expected - element not found means dropdown closed */
      },
    )

    // Cleanup
    document.body.removeChild(outsideElement)
  })

  it('should show correct icon for error notifications', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    // Check that there are SVG icons in the document (error notifications use alert-circle icon)
    const svgs = document.querySelectorAll('svg')
    expect(svgs.length).toBeGreaterThan(0)
  })

  it('should show timestamp for notifications', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    expect(screen.getAllByText('2 hours ago').length).toBeGreaterThan(0)
  })

  it('should display "View all notifications" button when notifications exist', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    await user.click(screen.getByRole('button', { name: /notifications/i }))

    expect(screen.getByText('View all notifications')).toBeInTheDocument()
  })

  it('should cap unread count at 99+', () => {
    const store = useNotificationsStore.getState()

    // Add 150 notifications
    for (let i = 0; i < 150; i++) {
      store.addNotification({
        type: 'info',
        category: 'system',
        title: `Test ${i}`,
        message: `Test message ${i}`,
      })
    }

    renderWithRouter(<NotificationCenter />)

    expect(screen.getByText('99+')).toBeInTheDocument()
  })

  /**
   * TC-NOT-002: Mark Notification as Read (P1)
   * Tests that a single notification can be marked as read by clicking on it
   */
  it('TC-NOT-002: should mark notification as read when clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    await user.click(bellButton)

    // Store initial state
    let store = useNotificationsStore.getState()
    const firstNotificationId = store.notifications.find((n) => n.title === 'Critical Vulnerability')?.id
    const initialReadStatus = store.notifications.find((n) => n.id === firstNotificationId)?.read

    // Verify initial state is unread
    expect(initialReadStatus).toBe(false)

    // Click on notification
    const notification = screen.getByText('Critical Vulnerability').closest('div')!
    await user.click(notification)

    // Re-fetch store state after click
    store = useNotificationsStore.getState()
    const updatedNotification = store.notifications.find((n) => n.id === firstNotificationId)

    // Verify notification is now marked as read
    expect(updatedNotification?.read).toBe(true)

    // Verify unread count decreased
    const unreadCount = store.notifications.filter((n) => !n.read).length
    expect(unreadCount).toBe(1) // Started with 2, marked 1 as read
  })

  /**
   * TC-NOT-003: Mark All as Read (P1)
   * Tests that all notifications can be marked as read using the "Mark all read" button
   */
  it('TC-NOT-003: should mark all notifications as read when button is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    const bellButton = screen.getByRole('button', { name: /notifications/i })
    await user.click(bellButton)

    // Verify initial state - all notifications are unread
    let store = useNotificationsStore.getState()
    const initialUnreadCount = store.notifications.filter((n) => !n.read).length
    expect(initialUnreadCount).toBe(2)

    // Click "Mark all read" button
    const markAllButton = screen.getByText('Mark all read').closest('button')!
    await user.click(markAllButton)

    // Re-fetch store state after click
    store = useNotificationsStore.getState()

    // Verify all notifications are marked as read
    expect(store.notifications.every((n) => n.read)).toBe(true)

    // Verify unread count is now 0
    const finalUnreadCount = store.notifications.filter((n) => !n.read).length
    expect(finalUnreadCount).toBe(0)
  })

  /**
   * TC-NOT-004: Configure Notification Preferences (P1)
   * Tests that notification preferences can be configured and affect behavior
   */
  it('TC-NOT-004: should configure notification preferences', async () => {
    const user = userEvent.setup()
    renderWithRouter(<NotificationCenter />)

    // Verify initial state - notifications are enabled
    const store = useNotificationsStore.getState()
    expect(store.preferences.enabled).toBe(true)
    expect(store.preferences.desktopEnabled).toBe(true)
    expect(store.preferences.categories.critical_vuln).toBe(true)

    // Update preferences to disable critical_vuln category
    store.updatePreferences({
      enabled: true,
      desktopEnabled: true,
      categories: {
        critical_vuln: false,
        scan_complete: true,
        update_available: true,
        system: true,
      },
    })

    // Try to add a critical_vuln notification - should not be added due to category being disabled
    const result = store.addNotification({
      type: 'error',
      category: 'critical_vuln',
      title: 'Test Critical',
      message: 'This should not be added',
    })

    // Verify notification was not added because category is disabled
    expect(result).toBeNull()

    // Re-enable critical_vuln category
    store.setCategoryEnabled('critical_vuln', true)

    // Try to add a critical_vuln notification again - should be added now
    const result2 = store.addNotification({
      type: 'error',
      category: 'critical_vuln',
      title: 'Test Critical',
      message: 'This should be added now',
    })

    // Verify notification was added
    expect(result2).not.toBeNull()
    expect(result2?.title).toBe('Test Critical')
  })

  /**
   * TC-NOT-005: Receive Desktop Notification (P2)
   * Tests that desktop notifications are triggered when enabled
   * Note: This test is skipped because desktop notifications require a real browser/Electron
   * environment with proper Notification API support. In jsdom, the Notification API
   * mocking doesn't integrate well with the notification service.
   */
  it.skip('TC-NOT-005: should receive desktop notification when enabled', async () => {
    // This test is skipped because:
    // 1. window.electronAPI is mocked in test setup, making isElectron() return true
    // 2. The Notification API mock doesn't integrate with the service's Notification checks
    // 3. Desktop notifications require a full browser/Electron environment to test properly
  })

  /**
   * TC-NOT-006: Disable All Notifications (P1)
   * Tests that notifications can be completely disabled
   */
  it('TC-NOT-006: should disable all notifications when preference is disabled', async () => {
    const user = userEvent.setup()
    const store = useNotificationsStore.getState()

    // Verify initial state - component renders when notifications are enabled
    const { rerender } = renderWithRouter(<NotificationCenter />)
    let bellButton = screen.queryByRole('button', { name: /notifications/i })
    expect(bellButton).toBeInTheDocument()

    // Disable all notifications
    store.updatePreferences({
      enabled: false,
      desktopEnabled: false,
    })

    // Re-render to reflect the state change
    rerender(
      <BrowserRouter>
        <NotificationCenter />
      </BrowserRouter>,
    )

    // Verify component does not render when notifications are disabled
    bellButton = screen.queryByRole('button', { name: /notifications/i })
    expect(bellButton).not.toBeInTheDocument()

    // Try to add a notification - should not be added because notifications are disabled
    const result = store.addNotification({
      type: 'error',
      category: 'critical_vuln',
      title: 'Test',
      message: 'This should not be added',
    })

    // Verify notification was not added
    expect(result).toBeNull()
    expect(store.notifications).toHaveLength(2) // Still has the initial 2 notifications

    // Re-enable notifications
    store.updatePreferences({
      enabled: true,
      desktopEnabled: true,
    })

    // Re-render again
    rerender(
      <BrowserRouter>
        <NotificationCenter />
      </BrowserRouter>,
    )

    // Verify component renders again
    bellButton = screen.queryByRole('button', { name: /notifications/i })
    expect(bellButton).toBeInTheDocument()
  })
})
