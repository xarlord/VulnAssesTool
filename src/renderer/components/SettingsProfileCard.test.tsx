import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsProfileCard } from './SettingsProfileCard'
import type { SettingsProfile } from '@@/types'

const mockSettings = {
  theme: 'dark' as const,
  fontSize: 'large' as const,
  nvdApiKey: 'test-key',
  dataRetentionDays: 30,
  autoRefresh: true,
  autoRefreshInterval: 24,
  vulnDataCacheTTL: 1,
  vulnProviders: {
    nvd: {
      enabled: true,
      priority: 1,
      rateLimit: { requestsPerHour: 600, requestsPerMinute: 10 },
    },
    osv: {
      enabled: true,
      priority: 2,
      rateLimit: { requestsPerHour: 1000 },
    },
  },
  cvssVersion: '3.1' as const,
  showCvssBreakdown: true,
  maxGraphNodes: 500,
  showVulnerableOnly: false,
}

const createMockProfile = (overrides?: Partial<SettingsProfile>): SettingsProfile => ({
  id: 'profile-1',
  name: 'Test Profile',
  description: 'Test description',
  settings: mockSettings,
  isDefault: false,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  lastUsed: new Date('2024-01-02T00:00:00.000Z'),
  ...overrides,
})

describe('SettingsProfileCard', () => {
  const mockOnSwitch = vi.fn()
  const mockOnDelete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock confirm dialog
    global.confirm = vi.fn(() => true)
  })

  const renderCard = (profile: SettingsProfile, isActive = false) => {
    return render(
      <SettingsProfileCard profile={profile} isActive={isActive} onSwitch={mockOnSwitch} onDelete={mockOnDelete} />,
    )
  }

  describe('Rendering', () => {
    it('should render profile name', () => {
      const profile = createMockProfile()
      renderCard(profile)

      expect(screen.getByText('Test Profile')).toBeInTheDocument()
    })

    it('should render profile description', () => {
      const profile = createMockProfile({ description: 'Test description' })
      renderCard(profile)

      expect(screen.getByText('Test description')).toBeInTheDocument()
    })

    it('should not render description when not provided', () => {
      const profile = createMockProfile({ description: undefined })
      renderCard(profile)

      expect(screen.queryByText('Test description')).not.toBeInTheDocument()
    })

    it('should render default badge for default profile', () => {
      const profile = createMockProfile({ isDefault: true })
      renderCard(profile)

      expect(screen.getByText('Default')).toBeInTheDocument()
    })

    it('should not render default badge for non-default profile', () => {
      const profile = createMockProfile({ isDefault: false })
      renderCard(profile)

      expect(screen.queryByText('Default')).not.toBeInTheDocument()
    })

    it('should render settings summary', () => {
      const profile = createMockProfile()
      renderCard(profile)

      expect(screen.getByText(/Theme:/i)).toBeInTheDocument()
      expect(screen.getByText(/dark/i)).toBeInTheDocument()
      expect(screen.getByText(/Font Size:/i)).toBeInTheDocument()
      expect(screen.getByText(/large/i)).toBeInTheDocument()
    })

    it('should render auto-refresh status', () => {
      const profile = createMockProfile({ settings: { ...mockSettings, autoRefresh: true } })
      renderCard(profile)

      expect(screen.getByText(/Auto-refresh:/i)).toBeInTheDocument()
      expect(screen.getByText('Enabled')).toBeInTheDocument()
    })

    it('should render disabled auto-refresh status', () => {
      const profile = createMockProfile({ settings: { ...mockSettings, autoRefresh: false } })
      renderCard(profile)

      expect(screen.getByText('Disabled')).toBeInTheDocument()
    })

    it('should render last used date', () => {
      const profile = createMockProfile({ lastUsed: new Date('2024-01-02T00:00:00.000Z') })
      renderCard(profile)

      expect(screen.getByText(/Last used:/i)).toBeInTheDocument()
    })

    it('should render switch button for inactive profile', () => {
      const profile = createMockProfile()
      renderCard(profile, false)

      expect(screen.getByText('Switch to Profile')).toBeInTheDocument()
    })

    it('should render active indicator for active profile', () => {
      const profile = createMockProfile()
      renderCard(profile, true)

      expect(screen.getByText('Active Profile')).toBeInTheDocument()
    })

    it('should render delete button', () => {
      const profile = createMockProfile()
      renderCard(profile)

      const deleteButton =
        screen.getByRole('button', { name: /delete/i }) || document.querySelector('button[title*="Delete"]')
      expect(deleteButton).toBeInTheDocument()
    })
  })

  describe('Active State', () => {
    it('should show active styling when isActive is true', () => {
      const profile = createMockProfile()
      const { container } = renderCard(profile, true)

      const card = container.querySelector('.border-primary')
      expect(card).toBeInTheDocument()
    })

    it('should show active indicator badge', () => {
      const profile = createMockProfile()
      renderCard(profile, true)

      const checkIcon = document.querySelector('svg')
      expect(checkIcon).toBeInTheDocument()
    })

    it('should not show switch button when active', () => {
      const profile = createMockProfile()
      renderCard(profile, true)

      expect(screen.queryByText('Switch to Profile')).not.toBeInTheDocument()
    })

    it('should show active profile text', () => {
      const profile = createMockProfile()
      renderCard(profile, true)

      expect(screen.getByText('Active Profile')).toBeInTheDocument()
    })
  })

  describe('Inactive State', () => {
    it('should show inactive styling when isActive is false', () => {
      const profile = createMockProfile()
      const { container } = renderCard(profile, false)

      const card = container.querySelector('.border-border')
      expect(card).toBeInTheDocument()
    })

    it('should show switch button', () => {
      const profile = createMockProfile()
      renderCard(profile, false)

      expect(screen.getByText('Switch to Profile')).toBeInTheDocument()
    })
  })

  describe('Actions', () => {
    it('should call onSwitch when switch button is clicked', () => {
      const profile = createMockProfile()
      renderCard(profile, false)

      const switchButton = screen.getByText('Switch to Profile')
      fireEvent.click(switchButton)

      expect(mockOnSwitch).toHaveBeenCalledWith(profile.id)
      expect(mockOnSwitch).toHaveBeenCalledTimes(1)
    })

    it('should call onDelete after confirmation', () => {
      const profile = createMockProfile()
      renderCard(profile, false)

      // Find delete button (trash icon button)
      const deleteButtons = document.querySelectorAll('button')
      const deleteButton = Array.from(deleteButtons).find(
        (btn) => btn.querySelector('svg') && btn.getAttribute('title')?.includes('Delete'),
      )

      expect(deleteButton).toBeTruthy()
      if (deleteButton) {
        fireEvent.click(deleteButton)
        expect(global.confirm).toHaveBeenCalledWith(expect.stringContaining(profile.name))
        expect(mockOnDelete).toHaveBeenCalledWith(profile.id)
      }
    })

    it('should not call onDelete when confirmation is cancelled', () => {
      global.confirm = vi.fn(() => false)
      const profile = createMockProfile()
      renderCard(profile, false)

      const deleteButtons = document.querySelectorAll('button')
      const deleteButton = Array.from(deleteButtons).find(
        (btn) => btn.querySelector('svg') && btn.getAttribute('title')?.includes('Delete'),
      )

      expect(deleteButton).toBeTruthy()
      if (deleteButton) {
        fireEvent.click(deleteButton)
        expect(mockOnDelete).not.toHaveBeenCalled()
      }
    })

    it('should disable delete button for active profile', () => {
      const profile = createMockProfile()
      renderCard(profile, true)

      const deleteButtons = document.querySelectorAll('button')
      const deleteButton = Array.from(deleteButtons).find((btn) => btn.hasAttribute('disabled'))

      // Delete button should be disabled for active profile
      // The button should exist but have disabled styling
      const disabledDeleteButton = Array.from(deleteButtons).find((btn) => btn.className.includes('cursor-not-allowed'))

      expect(disabledDeleteButton).toBeInTheDocument()
    })

    it('should not call onDelete when active profile delete is clicked', () => {
      const profile = createMockProfile()
      renderCard(profile, true)

      const deleteButtons = document.querySelectorAll('button')
      const deleteButton = Array.from(deleteButtons).find(
        (btn) => btn.querySelector('svg') && btn.getAttribute('title')?.includes('Cannot delete'),
      )

      if (deleteButton) {
        fireEvent.click(deleteButton)
        expect(mockOnDelete).not.toHaveBeenCalled()
      }
    })
  })

  describe('Date Formatting', () => {
    beforeEach(() => {
      // Set fixed date for consistent testing
      vi.setSystemTime(new Date('2024-01-02T12:00:00.000Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should format recent lastUsed as minutes ago', () => {
      const profile = createMockProfile({
        lastUsed: new Date('2024-01-02T11:30:00.000Z'), // 30 minutes ago
      })
      renderCard(profile)

      expect(screen.getByText(/30 minutes? ago/i)).toBeInTheDocument()
    })

    it('should format lastUsed as hours ago', () => {
      const profile = createMockProfile({
        lastUsed: new Date('2024-01-02T06:00:00.000Z'), // 6 hours ago
      })
      renderCard(profile)

      expect(screen.getByText(/6 hours? ago/i)).toBeInTheDocument()
    })

    it('should format lastUsed as days ago', () => {
      const profile = createMockProfile({
        lastUsed: new Date('2024-01-01T12:00:00.000Z'), // 1 day ago
      })
      renderCard(profile)

      expect(screen.getByText(/1 day ago/i)).toBeInTheDocument()
    })

    it('should format old lastUsed as date', () => {
      const profile = createMockProfile({
        lastUsed: new Date('2023-12-01T00:00:00.000Z'), // ~32 days ago
      })
      renderCard(profile)

      expect(screen.getByText(/Last used:/i)).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle very long profile names', () => {
      const longName = 'A'.repeat(200)
      const profile = createMockProfile({ name: longName })
      renderCard(profile)

      expect(screen.getByText(longName)).toBeInTheDocument()
    })

    it('should handle very long descriptions', () => {
      const longDescription = 'B'.repeat(500)
      const profile = createMockProfile({ description: longDescription })
      renderCard(profile)

      // Description should be truncated with line-clamp-2
      expect(screen.getByText(longDescription)).toBeInTheDocument()
    })

    it('should handle profile without description', () => {
      const profile = createMockProfile({ description: undefined })
      const { container } = renderCard(profile)

      expect(container.textContent).not.toContain('undefined')
    })

    it('should handle all theme types', () => {
      const themes = ['light', 'dark', 'system'] as const

      themes.forEach((theme) => {
        const profile = createMockProfile({
          settings: { ...mockSettings, theme },
        })
        const { unmount } = renderCard(profile)

        expect(screen.getByText(new RegExp(theme, 'i'))).toBeInTheDocument()
        unmount()
      })
    })

    it('should handle all font sizes', () => {
      const fontSizes = ['small', 'default', 'large'] as const

      fontSizes.forEach((size) => {
        const profile = createMockProfile({
          settings: { ...mockSettings, fontSize: size },
        })
        const { unmount } = renderCard(profile)

        expect(screen.getByText(new RegExp(size, 'i'))).toBeInTheDocument()
        unmount()
      })
    })
  })
})
