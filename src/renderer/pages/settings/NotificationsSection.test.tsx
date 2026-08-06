/**
 * Tests for NotificationsSection (FR-10.4).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { NotificationPreferences } from '@@/types'

const { mockUpdatePreferences, mockSetCategoryEnabled, prefs } = vi.hoisted(() => ({
  mockUpdatePreferences: vi.fn(),
  mockSetCategoryEnabled: vi.fn(),
  prefs: {
    current: {
      enabled: true,
      desktopEnabled: true,
      categories: { critical_vuln: true, scan_complete: true, update_available: true, system: true },
    } as NotificationPreferences,
  },
}))

vi.mock('@/lib/notifications/notificationsStore', () => ({
  useNotificationPreferences: () => prefs.current,
  useNotificationsStore: (selector: (s: unknown) => unknown) =>
    selector({ updatePreferences: mockUpdatePreferences, setCategoryEnabled: mockSetCategoryEnabled }),
}))

import { NotificationsSection } from './NotificationsSection'

describe('NotificationsSection (FR-10.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prefs.current = {
      enabled: true,
      desktopEnabled: true,
      categories: { critical_vuln: true, scan_complete: true, update_available: true, system: true },
    }
  })

  it('renders the two top-level toggles and four category toggles reflecting store state', () => {
    render(<NotificationsSection />)
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBe(6)
    expect(switches.every((s) => s.getAttribute('aria-checked') === 'true')).toBe(true)
  })

  it('toggling Desktop Notifications calls updatePreferences with the new value', () => {
    render(<NotificationsSection />)
    fireEvent.click(screen.getByRole('switch', { name: /desktop notifications/i }))
    expect(mockUpdatePreferences).toHaveBeenCalledWith({ desktopEnabled: false })
  })

  it('toggling a category calls setCategoryEnabled for that category', () => {
    render(<NotificationsSection />)
    fireEvent.click(screen.getByRole('switch', { name: /critical vulnerabilities/i }))
    expect(mockSetCategoryEnabled).toHaveBeenCalledWith('critical_vuln', false)
  })

  it('disables the desktop + category toggles when notifications are disabled', () => {
    prefs.current = { ...prefs.current, enabled: false }
    render(<NotificationsSection />)

    // WHY: notificationService branches on these — offering an editable control
    // while the master switch is off would mislead the user.
    expect(screen.getByRole('switch', { name: /desktop notifications/i })).toBeDisabled()
    expect(screen.getByRole('switch', { name: /critical vulnerabilities/i })).toBeDisabled()
    // The master toggle itself stays enabled.
    expect(screen.getByRole('switch', { name: /enable notifications/i })).toBeEnabled()
  })
})
