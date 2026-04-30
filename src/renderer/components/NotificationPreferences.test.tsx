import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotificationPreferences } from './NotificationPreferences'
import { useNotificationsStore } from '@/lib/notifications'

// Mock the navigator.clipboard for clipboard operations
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn(() => Promise.resolve()),
  },
})

describe('NotificationPreferences', () => {
  beforeEach(() => {
    // Reset store and set test preferences
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
  })

  it('should render notification preferences', () => {
    render(<NotificationPreferences />)

    expect(screen.getByText('Notification Preferences')).toBeInTheDocument()
    expect(screen.getByText('Enable Notifications')).toBeInTheDocument()
  })

  it('should show enabled state when notifications are enabled', () => {
    const store = useNotificationsStore.getState()
    store.updatePreferences({ enabled: true })

    render(<NotificationPreferences />)

    expect(screen.getByText('Notifications are enabled')).toBeInTheDocument()
  })

  it('should show disabled state when notifications are disabled', () => {
    const store = useNotificationsStore.getState()
    store.updatePreferences({ enabled: false })

    render(<NotificationPreferences />)

    expect(screen.getAllByText('All notifications are disabled').length).toBeGreaterThan(0)
  })

  it('should render all category toggles when enabled', () => {
    render(<NotificationPreferences />)

    expect(screen.getByText('Critical Vulnerabilities')).toBeInTheDocument()
    expect(screen.getByText('Scan Complete')).toBeInTheDocument()
    expect(screen.getByText('Update Available')).toBeInTheDocument()
    expect(screen.getByText('System Notifications')).toBeInTheDocument()
  })

  it('should not show category toggles when disabled', () => {
    const store = useNotificationsStore.getState()
    store.updatePreferences({ enabled: false })

    render(<NotificationPreferences />)

    expect(screen.queryByText('Critical Vulnerabilities')).not.toBeInTheDocument()
  })

  it('should call updateNotificationPreferences when master toggle is clicked', async () => {
    const user = userEvent.setup()

    render(<NotificationPreferences />)

    const toggles = screen.getAllByRole('switch')
    const masterToggle = toggles[0]

    await user.click(masterToggle)

    // Re-fetch the store state after the click
    const store = useNotificationsStore.getState()
    expect(store.preferences.enabled).toBe(false)
  })

  it('should show desktop notifications toggle when enabled', () => {
    render(<NotificationPreferences />)

    expect(screen.getByText('Desktop Notifications')).toBeInTheDocument()
  })

  it('should not show desktop notifications toggle when disabled', () => {
    const store = useNotificationsStore.getState()
    store.updatePreferences({ enabled: false })

    render(<NotificationPreferences />)

    expect(screen.queryByText('Desktop Notifications')).not.toBeInTheDocument()
  })

  it('should call updateNotificationPreferences when desktop toggle is clicked', async () => {
    const user = userEvent.setup()

    render(<NotificationPreferences />)

    const toggles = screen.getAllByRole('switch')
    const desktopToggle = toggles[1] // Second toggle is desktop
    await user.click(desktopToggle)

    // Re-fetch the store state after the click
    const store = useNotificationsStore.getState()
    expect(store.preferences.desktopEnabled).toBe(false)
  })

  it('should call setCategoryEnabled when category toggle is clicked', async () => {
    const user = userEvent.setup()

    render(<NotificationPreferences />)

    const toggles = screen.getAllByRole('switch')
    const categoryToggle = toggles[2] // Third toggle is first category (critical_vuln)
    await user.click(categoryToggle)

    // Re-fetch the store state after the click
    const store = useNotificationsStore.getState()
    expect(store.preferences.categories.critical_vuln).toBe(false)
  })

  it('should show enabled badge for enabled categories', () => {
    render(<NotificationPreferences />)

    const enabledBadges = screen.getAllByText('Enabled')
    expect(enabledBadges.length).toBeGreaterThan(0)
  })

  it('should show info box when desktop notifications are disabled but notifications are enabled', () => {
    const store = useNotificationsStore.getState()
    store.updatePreferences({ desktopEnabled: false })

    render(<NotificationPreferences />)

    expect(screen.getByText('Desktop notifications are disabled')).toBeInTheDocument()
  })

  it('should show category descriptions', () => {
    render(<NotificationPreferences />)

    expect(screen.getByText(/Get notified when critical vulnerabilities are detected/)).toBeInTheDocument()
    expect(screen.getByText(/Get notified when vulnerability scans finish/)).toBeInTheDocument()
    expect(screen.getByText(/Get notified when app updates are available/)).toBeInTheDocument()
    expect(screen.getByText(/Get notified about system events and errors/)).toBeInTheDocument()
  })

  it('should render icons for each category', () => {
    render(<NotificationPreferences />)

    // Check for emoji icons
    expect(screen.getByText('🔴')).toBeInTheDocument()
    expect(screen.getByText('✅')).toBeInTheDocument()
    expect(screen.getByText('📦')).toBeInTheDocument()
    expect(screen.getByText('⚙️')).toBeInTheDocument()
  })
})
