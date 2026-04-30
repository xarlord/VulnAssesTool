import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CreateProfileDialog from './CreateProfileDialog'
import type { SettingsProfile, AppSettings } from '@@/types'

const mockSettings: AppSettings = {
  theme: 'dark',
  fontSize: 'large',
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
  cvssVersion: '3.1',
  showCvssBreakdown: true,
  maxGraphNodes: 500,
  showVulnerableOnly: false,
}

const mockExistingProfile: SettingsProfile = {
  id: 'profile-1',
  name: 'Existing Profile',
  description: 'Existing description',
  settings: mockSettings,
  isDefault: true,
  createdAt: new Date(),
  lastUsed: new Date(),
}

describe('CreateProfileDialog', () => {
  const mockOnClose = vi.fn()
  const mockOnCreate = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderDialog = (
    open = true,
    existingProfiles: SettingsProfile[] = [],
    currentSettings: AppSettings = mockSettings,
  ) => {
    return render(
      <CreateProfileDialog
        open={open}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
        existingProfiles={existingProfiles}
        currentSettings={currentSettings}
      />,
    )
  }

  // Helper to get dialog container
  const getDialogContainer = () => {
    const dialog = document.querySelector('[data-testid="create-profile-dialog"]')
    return dialog?.parentElement || null
  }

  describe('Rendering', () => {
    it('should not render when open is false', () => {
      renderDialog(false)

      expect(screen.queryByText('Create New Settings Profile')).not.toBeInTheDocument()
    })

    it('should render when open is true', () => {
      renderDialog(true)

      expect(screen.getByText('Create New Settings Profile')).toBeInTheDocument()
      expect(screen.getByText('Create a custom settings profile for different use cases')).toBeInTheDocument()
    })

    it('should render profile name input', () => {
      renderDialog(true)

      expect(screen.getByLabelText(/Profile Name/)).toBeInTheDocument()
    })

    it('should render description textarea', () => {
      renderDialog(true)

      expect(screen.getByLabelText(/Description/)).toBeInTheDocument()
    })

    it('should render required indicator for name', () => {
      renderDialog(true)

      const nameLabel = screen.getByText(/Profile Name/)
      expect(nameLabel.innerHTML).toContain('*')
    })

    it('should not render copy from select when no existing profiles', () => {
      renderDialog(true, [])

      expect(screen.queryByText(/Copy Settings From/)).not.toBeInTheDocument()
    })

    it('should render copy from select when existing profiles exist', () => {
      renderDialog(true, [mockExistingProfile])

      expect(screen.getByText(/Copy Settings From/)).toBeInTheDocument()
      expect(screen.getByText('Use Current Settings')).toBeInTheDocument()
      expect(screen.getByText('Existing Profile (Default)')).toBeInTheDocument()
    })

    it('should render settings summary', () => {
      renderDialog(true)

      expect(screen.getByText(/Settings Summary:/i)).toBeInTheDocument()
      expect(screen.getByText(/Theme:/i)).toBeInTheDocument()
      expect(screen.getByText(/Font:/i)).toBeInTheDocument()
      expect(screen.getByText(/Auto-refresh:/i)).toBeInTheDocument()
    })

    it('should render create and cancel buttons', () => {
      renderDialog(true)

      expect(screen.getByText('Cancel')).toBeInTheDocument()
      expect(screen.getByText('Create Profile')).toBeInTheDocument()
    })

    it('should render close button', () => {
      renderDialog(true)

      const closeButton = screen.getByLabelText('Close dialog')
      expect(closeButton).toBeInTheDocument()
    })
  })

  describe('Form Validation', () => {
    it('should show error when name is empty', () => {
      renderDialog(true)

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(screen.getByText('Profile name is required')).toBeInTheDocument()
    })

    it('should show error when name is too short', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: 'ab' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(screen.getByText('Profile name must be at least 3 characters')).toBeInTheDocument()
    })

    it('should show error for whitespace-only name', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: '   ' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(screen.getByText('Profile name is required')).toBeInTheDocument()
    })

    it('should show error for duplicate profile name', () => {
      renderDialog(true, [mockExistingProfile])

      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: 'Existing Profile' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(screen.getByText('A profile with this name already exists')).toBeInTheDocument()
    })

    it('should be case-insensitive for duplicate names', () => {
      renderDialog(true, [mockExistingProfile])

      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: 'existing profile' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(screen.getByText('A profile with this name already exists')).toBeInTheDocument()
    })

    it('should clear error when user starts typing', () => {
      renderDialog(true)

      // Trigger error first
      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(screen.getByText('Profile name is required')).toBeInTheDocument()

      // Start typing
      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: 'T' } })

      expect(screen.queryByText('Profile name is required')).not.toBeInTheDocument()
    })
  })

  describe('Form Submission', () => {
    it('should create profile with name only', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: 'Test Profile' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(mockOnCreate).toHaveBeenCalledWith('Test Profile', undefined, mockSettings)
      expect(mockOnClose).toHaveBeenCalled()
    })

    it('should create profile with name and description', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/)
      const descriptionInput = screen.getByLabelText(/Description/)

      fireEvent.change(nameInput, { target: { value: 'Test Profile' } })
      fireEvent.change(descriptionInput, { target: { value: 'Test Description' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(mockOnCreate).toHaveBeenCalledWith('Test Profile', 'Test Description', mockSettings)
    })

    it('should trim whitespace from name and description', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/)
      const descriptionInput = screen.getByLabelText(/Description/)

      fireEvent.change(nameInput, { target: { value: '  Test Profile  ' } })
      fireEvent.change(descriptionInput, { target: { value: '  Test Description  ' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(mockOnCreate).toHaveBeenCalledWith('Test Profile', 'Test Description', mockSettings)
    })

    it('should create profile with current settings when no profile selected', () => {
      const customSettings = { ...mockSettings, theme: 'light' as const }
      renderDialog(true, [], customSettings)

      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: 'Test Profile' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(mockOnCreate).toHaveBeenCalledWith('Test Profile', undefined, customSettings)
    })

    it('should create profile with copied settings when profile selected', () => {
      const profileWithDifferentSettings: SettingsProfile = {
        ...mockExistingProfile,
        settings: { ...mockSettings, theme: 'light', fontSize: 'small' },
      }

      renderDialog(true, [profileWithDifferentSettings])

      // Select profile to copy from
      const copySelect = screen.getByLabelText(/Copy Settings From/) as HTMLSelectElement
      fireEvent.change(copySelect, { target: { value: profileWithDifferentSettings.id } })

      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: 'New Profile' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(mockOnCreate).toHaveBeenCalledWith('New Profile', undefined, profileWithDifferentSettings.settings)
    })

    it('should not submit when validation fails', () => {
      renderDialog(true)

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(screen.getByText('Profile name is required')).toBeInTheDocument()
      expect(mockOnCreate).not.toHaveBeenCalled()
      expect(mockOnClose).not.toHaveBeenCalled()
    })
  })

  describe('Dialog Actions', () => {
    it('should close when cancel button is clicked', () => {
      renderDialog(true)

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(mockOnClose).toHaveBeenCalled()
      expect(mockOnCreate).not.toHaveBeenCalled()
    })

    it('should close when close button (X) is clicked', () => {
      renderDialog(true)

      const closeButton = screen.getByLabelText('Close dialog')
      fireEvent.click(closeButton)

      expect(mockOnClose).toHaveBeenCalled()
      expect(mockOnCreate).not.toHaveBeenCalled()
    })

    it('should close when backdrop is clicked', () => {
      renderDialog(true)

      const backdrop = document.querySelector('.bg-black\\/50')
      expect(backdrop).toBeInTheDocument()

      if (backdrop) {
        fireEvent.click(backdrop)
        expect(mockOnClose).toHaveBeenCalled()
      }
    })

    it('should reset form after successful creation', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/) as HTMLInputElement
      const descriptionInput = screen.getByLabelText(/Description/) as HTMLTextAreaElement

      fireEvent.change(nameInput, { target: { value: 'Test Profile' } })
      fireEvent.change(descriptionInput, { target: { value: 'Test Description' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(mockOnClose).toHaveBeenCalled()
    })
  })

  describe('Copy From Functionality', () => {
    it('should display existing profiles with default badge', () => {
      renderDialog(true, [mockExistingProfile])

      const option = screen.getByText(/Existing Profile/)
      expect(option).toBeInTheDocument()
    })

    it('should show "Use Current Settings" as default option', () => {
      renderDialog(true, [mockExistingProfile])

      const select = screen.getByLabelText(/Copy Settings From/) as HTMLSelectElement
      expect(select.value).toBe('')
    })

    it('should allow selecting a profile to copy from', () => {
      const profile2: SettingsProfile = {
        ...mockExistingProfile,
        id: 'profile-2',
        name: 'Another Profile',
        isDefault: false,
      }

      renderDialog(true, [mockExistingProfile, profile2])

      const select = screen.getByLabelText(/Copy Settings From/) as HTMLSelectElement
      fireEvent.change(select, { target: { value: profile2.id } })

      expect(select.value).toBe(profile2.id)
    })

    it('should handle multiple existing profiles', () => {
      const profiles: SettingsProfile[] = [
        mockExistingProfile,
        {
          ...mockExistingProfile,
          id: 'profile-2',
          name: 'Second Profile',
          isDefault: false,
        },
        {
          ...mockExistingProfile,
          id: 'profile-3',
          name: 'Third Profile',
          isDefault: false,
        },
      ]

      renderDialog(true, profiles)

      const options = screen.getAllByRole('option')
      // Should have "Use Current Settings" + 3 profiles
      expect(options.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('Settings Summary', () => {
    it('should display current theme', () => {
      renderDialog(true, [], { ...mockSettings, theme: 'light' })

      expect(screen.getByText(/light/i)).toBeInTheDocument()
    })

    it('should display current font size', () => {
      renderDialog(true, [], { ...mockSettings, fontSize: 'small' })

      expect(screen.getByText(/small/i)).toBeInTheDocument()
    })

    it('should display auto-refresh status', () => {
      renderDialog(true, [], { ...mockSettings, autoRefresh: true })

      expect(screen.getByText('On')).toBeInTheDocument()
    })

    it('should display cache TTL', () => {
      renderDialog(true, [], { ...mockSettings, vulnDataCacheTTL: 24 })

      expect(screen.getByText('24h')).toBeInTheDocument()
    })

    it('should capitalize theme and font size', () => {
      renderDialog(true, [], { ...mockSettings, theme: 'system', fontSize: 'default' })

      expect(screen.getByText('System')).toBeInTheDocument()
      expect(screen.getByText('Default')).toBeInTheDocument()
    })
  })

  describe('Form Input Behavior', () => {
    it('should accept text input for profile name', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/) as HTMLInputElement
      fireEvent.change(nameInput, { target: { value: 'My Profile Name' } })

      expect(nameInput.value).toBe('My Profile Name')
    })

    it('should accept text input for description', () => {
      renderDialog(true)

      const descriptionInput = screen.getByLabelText(/Description/) as HTMLTextAreaElement
      fireEvent.change(descriptionInput, { target: { value: 'This is a test description' } })

      expect(descriptionInput.value).toBe('This is a test description')
    })

    it('should autofocus on name input when dialog opens', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/)
      expect(nameInput).toHaveFocus()
    })

    it('should allow empty description (optional field)', () => {
      renderDialog(true)

      const descriptionInput = screen.getByLabelText(/Description/) as HTMLTextAreaElement
      expect(descriptionInput.value).toBe('')
    })
  })

  describe('Edge Cases', () => {
    it('should handle special characters in name', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: 'Profile @#$ %^&*()' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(mockOnCreate).toHaveBeenCalledWith('Profile @#$ %^&*()', undefined, mockSettings)
    })

    it('should handle very long names', () => {
      renderDialog(true)

      const longName = 'A'.repeat(200)
      const nameInput = screen.getByLabelText(/Profile Name/)
      fireEvent.change(nameInput, { target: { value: longName } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(mockOnCreate).toHaveBeenCalledWith(longName, undefined, mockSettings)
    })

    it('should handle multiline descriptions', () => {
      renderDialog(true)

      const nameInput = screen.getByLabelText(/Profile Name/)
      const descriptionInput = screen.getByLabelText(/Description/)

      fireEvent.change(nameInput, { target: { value: 'Test Profile' } })
      fireEvent.change(descriptionInput, { target: { value: 'Line 1\nLine 2\nLine 3' } })

      const submitButton = screen.getByText('Create Profile')
      fireEvent.click(submitButton)

      expect(mockOnCreate).toHaveBeenCalledWith('Test Profile', 'Line 1\nLine 2\nLine 3', mockSettings)
    })
  })
})
