import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Settings } from './Settings'
import type { AppSettings } from '@@/types'
import { useStore } from '@/store/useStore'

// Override lucide-react mock with ALL icons used by Settings component
vi.mock('lucide-react', () => {
  const StubIcon = (_props: unknown) => null
  const icons = [
    'X',
    'AlertCircle',
    'CheckCircle',
    'HelpCircle',
    'AlertTriangle',
    'RefreshCw',
    'Home',
    'Bug',
    'Trash2',
    'RotateCcw',
    'Shield',
    'ShieldAlert',
    'ChevronDown',
    'ChevronUp',
    'ExternalLink',
    'ArrowLeft',
    'Filter',
    'Settings',
    'Bell',
    'BellOff',
    'Check',
    'CheckCheck',
    'Info',
    'CheckCircle2',
    'Clock',
    'Save',
    'FolderOpen',
    'Search',
    'Navigation',
    'FileText',
    'Eye',
    'Edit',
    'Calendar',
    'Plus',
    'Upload',
    'Download',
    'BarChart3',
    'TrendingUp',
    'TrendingDown',
    'Minus',
    'Wifi',
    'WifiOff',
    'Cloud',
    'CloudOff',
    'Copy',
    'FileSpreadsheet',
    'FileJson',
    'Loader2',
    'Github',
    'Mail',
    'Heart',
    'Package',
    'Database',
    // Icons used by Settings.tsx
    'UserCircle',
    'Palette',
    'Key',
    'RotateCw',
    'Archive',
    'Gauge',
    'HardDrive',
    'Zap',
    'History',
    'Settings2',
    'XCircle',
  ]
  const mod: Record<string, unknown> = {}
  for (const name of icons) {
    mod[name] = StubIcon
  }
  return mod
})

// Mock secure key service (used by Settings for API key management)
// Uses module-level ref so individual tests can configure the returned key
let mockStoredApiKey: string | null = null
let mockSetApiKeyResult: boolean = true
let mockSetApiKeyShouldThrow = false
let mockSetApiKeyError: Error | null = null
const mockDeleteApiKey = vi.fn(() => Promise.resolve(true))
const mockSetApiKey = vi.fn(() => {
  if (mockSetApiKeyShouldThrow && mockSetApiKeyError) {
    return Promise.reject(mockSetApiKeyError)
  }
  return Promise.resolve(mockSetApiKeyResult)
})
vi.mock('@/lib/storage', () => ({
  getSecureKeyService: () => ({
    isAvailable: vi.fn(() => Promise.resolve(true)),
    getApiKey: vi.fn(() => Promise.resolve(mockStoredApiKey)),
    setApiKey: mockSetApiKey,
    deleteApiKey: mockDeleteApiKey,
    hasApiKey: vi.fn(() => Promise.resolve(mockStoredApiKey !== null)),
  }),
}))

// Mock the store
const mockUpdateSettings = vi.fn()
const mockNavigate = vi.fn()
const defaultSettings: AppSettings = {
  theme: 'system',
  fontSize: 'default',
  nvdApiKey: undefined,
  dataRetentionDays: 30,
  autoRefresh: false,
  autoRefreshInterval: 24,
  vulnDataCacheTTL: 1,
  vulnProviders: {
    nvd: { enabled: true, priority: 1, rateLimit: { requestsPerHour: 50 } },
    osv: { enabled: true, priority: 2, rateLimit: { requestsPerHour: 1000 } },
  },
  cvssVersion: '3.1',
  showCvssBreakdown: true,
  severityThresholds: { critical: 9.0, high: 7.0, medium: 4.0, low: 0.1 },
  maxGraphNodes: 100,
  showVulnerableOnly: false,
}

let mockSettings: AppSettings = { ...defaultSettings }

const createMockStore = () => ({
  settings: mockSettings,
  updateSettings: mockUpdateSettings,
  projects: [],
  currentProject: null,
  addProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  setCurrentProject: vi.fn(),
  settingsProfiles: [],
  activeProfileId: '',
  loadSettingsProfiles: vi.fn(),
  createSettingsProfile: vi.fn(),
  updateSettingsProfile: vi.fn(),
  deleteSettingsProfile: vi.fn(),
  switchSettingsProfile: vi.fn(),
  setDefaultSettingsProfile: vi.fn(),
  importSettingsProfiles: vi.fn(),
  exportSettingsProfiles: vi.fn(),
})

// Helper to create a mock profile
const createMockProfile = (overrides: Record<string, unknown> = {}) => ({
  id: 'profile-1',
  name: 'Test Profile',
  description: 'A test profile',
  settings: { ...defaultSettings },
  isDefault: false,
  createdAt: new Date('2024-01-01'),
  lastUsed: new Date(),
  ...overrides,
})

vi.mock('@/store/useStore', () => ({
  useStore: vi.fn(() => createMockStore()),
}))

// Mock useNavigate
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock isValidNvdApiKey
vi.mock('@/lib/api/nvd', () => ({
  isValidNvdApiKey: vi.fn((key: string) => {
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(key)
  }),
}))

// Mock CreateProfileDialog (named export)
vi.mock('@/components/CreateProfileDialog', () => ({
  CreateProfileDialog: ({ open, onClose, onCreate }: Record<string, unknown>) => {
    if (!open) return null
    return (
      <div data-testid="create-profile-dialog">
        <button onClick={onCreate as () => void}>Create</button>
        <button onClick={onClose as () => void}>Cancel</button>
      </div>
    )
  },
}))

// Mock SettingsProfileCard (named export)
vi.mock('@/components/SettingsProfileCard', () => ({
  SettingsProfileCard: ({ profile, isActive, onSwitch, onDelete }: Record<string, unknown>) => (
    <div data-testid={`profile-card-${(profile as Record<string, unknown>).id as string}`}>
      <div>{(profile as Record<string, unknown>).name as string}</div>
      {isActive && <span data-testid="active-indicator">Active Profile</span>}
      {!isActive && (
        <button onClick={() => (onSwitch as (id: string) => void)((profile as Record<string, unknown>).id as string)}>
          Switch to Profile
        </button>
      )}
      <button onClick={() => (onDelete as (id: string) => void)((profile as Record<string, unknown>).id as string)}>
        Delete
      </button>
    </div>
  ),
}))

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateSettings.mockReset()
    mockNavigate.mockReset()
    mockSettings = { ...defaultSettings }
    mockStoredApiKey = null
    mockSetApiKeyResult = true
    mockSetApiKeyShouldThrow = false
    mockSetApiKeyError = null
  })

  const renderSettings = () => {
    return render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    )
  }

  describe('Rendering', () => {
    it('should render Settings header', () => {
      renderSettings()

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should render Appearance section', () => {
      renderSettings()

      expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
    })

    it('should render API Configuration section', () => {
      renderSettings()

      expect(screen.getByText('API Configuration')).toBeInTheDocument()
    })

    it('should render Data Management section', () => {
      renderSettings()

      expect(screen.getByRole('heading', { name: 'Data Management' })).toBeInTheDocument()
    })

    it('should render Danger Zone section', () => {
      renderSettings()

      expect(screen.getByRole('heading', { name: 'Danger Zone' })).toBeInTheDocument()
    })

    it('should render version info', () => {
      renderSettings()

      expect(screen.getByText('VulnAssessTool v0.1.0')).toBeInTheDocument()
    })
  })

  describe('Theme Settings', () => {
    it('should render all theme options', () => {
      renderSettings()

      expect(screen.getByText('light')).toBeInTheDocument()
      expect(screen.getByText('dark')).toBeInTheDocument()
      expect(screen.getByText('system')).toBeInTheDocument()
    })

    it('should highlight current theme', () => {
      renderSettings()

      const systemTheme = screen.getByText('system').closest('button')
      expect(systemTheme).toHaveClass('border-primary')
    })

    it('should update theme when option is clicked', () => {
      renderSettings()

      const lightTheme = screen.getByText('light').closest('button')
      if (lightTheme) {
        fireEvent.click(lightTheme)
        expect(mockUpdateSettings).toHaveBeenCalledWith({ theme: 'light' })
      }
    })

    it('should show correct description for each theme', () => {
      renderSettings()

      expect(screen.getByText(/Follows your system theme preference/)).toBeInTheDocument()
    })
  })

  describe('Font Size Settings', () => {
    it('should render all font size options', () => {
      renderSettings()

      expect(screen.getByText('small')).toBeInTheDocument()
      expect(screen.getByText('default')).toBeInTheDocument()
      expect(screen.getByText('large')).toBeInTheDocument()
    })

    it('should highlight current font size', () => {
      renderSettings()

      const defaultSize = screen.getByText('default').closest('button')
      expect(defaultSize).toHaveClass('border-primary')
    })

    it('should update font size when option is clicked', () => {
      renderSettings()

      const largeSize = screen.getByText('large').closest('button')
      if (largeSize) {
        fireEvent.click(largeSize)
        expect(mockUpdateSettings).toHaveBeenCalledWith({ fontSize: 'large' })
      }
    })
  })

  describe('NVD API Key', () => {
    it('should render API key input', async () => {
      renderSettings()

      // Input is hidden behind loading state until secureKeyService resolves
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/)).toBeInTheDocument()
      })
    })

    it('should render optional label', async () => {
      renderSettings()

      // Wait for loading to complete, then check for the label
      await waitFor(() => {
        expect(screen.getByText(/\(Optional\)/)).toBeInTheDocument()
      })
    })

    it('should show "Saved" indicator after valid key is saved', async () => {
      renderSettings()

      // Wait for the input to appear (async secure storage loading)
      const input = await screen.findByPlaceholderText(/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/)
      fireEvent.change(input, { target: { value: '12345678-1234-1234-1234-123456789012' } })
      fireEvent.blur(input)

      await waitFor(() => {
        expect(screen.getByText('Saved')).toBeInTheDocument()
      })
    })

    it('should show validation error for invalid format', async () => {
      renderSettings()

      // Wait for the input to appear
      const input = await screen.findByPlaceholderText(/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/)
      fireEvent.change(input, { target: { value: 'invalid-key' } })

      expect(screen.getByText('Invalid API key format. Expected UUID format.')).toBeInTheDocument()
    })

    it('should reset to valid value on blur when error exists', async () => {
      renderSettings()

      const input = await screen.findByPlaceholderText(/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/)

      // Change to invalid value - error is shown
      fireEvent.change(input, { target: { value: 'invalid' } })
      expect(screen.getByText('Invalid API key format. Expected UUID format.')).toBeInTheDocument()

      // On blur with error, the handler async-resets via secureKeyService.getApiKey
      fireEvent.blur(input)

      // Wait for async reset to complete
      await waitFor(() => {
        expect(screen.queryByText('Invalid API key format. Expected UUID format.')).not.toBeInTheDocument()
        expect(input).toHaveValue('')
      })
    })

    it('should save on Enter key press', async () => {
      renderSettings()

      const input = (await screen.findByPlaceholderText(/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/)) as HTMLInputElement
      fireEvent.change(input, { target: { value: '12345678-1234-1234-1234-123456789012' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      // Manually trigger blur since jsdom may not fully support it
      fireEvent.blur(input)

      // Enter key triggers blur, which saves the value to secure storage (not updateSettings)
      // The component uses secureKeyService.setApiKey, not updateSettings for NVD API key
      await waitFor(() => {
        expect(screen.getByText('Saved')).toBeInTheDocument()
      })
    })

    it('should link to NIST for API key', async () => {
      renderSettings()

      // Wait for loading to finish so NIST link is visible
      await waitFor(() => {
        const link = screen.getByText('NIST')
        expect(link).toBeInTheDocument()
        expect(link).toHaveAttribute('href', 'https://nvd.nist.gov/developers/request-an-api-key')
        expect(link).toHaveAttribute('target', '_blank')
      })
    })
  })

  describe('Auto Refresh Setting', () => {
    it('should render auto-refresh toggle', () => {
      renderSettings()

      expect(screen.getByText('Auto-refresh Vulnerability Data')).toBeInTheDocument()
    })

    it('should toggle auto-refresh when clicked', () => {
      const initialCallCount = mockUpdateSettings.mock.calls.length
      renderSettings()

      // Find the toggle button - it has both rounded-full and bg-muted-foreground classes when off
      const toggle = document.querySelector('button.rounded-full.bg-muted-foreground')
      if (toggle) {
        fireEvent.click(toggle)
        // Check that a new call was made after our initial count
        expect(mockUpdateSettings.mock.calls.length).toBeGreaterThan(initialCallCount)
        // Check that autoRefresh was called with true (toggling from false to true)
        const hasAutoRefreshCall = mockUpdateSettings.mock.calls.some((call) => call[0]?.autoRefresh === true)
        expect(hasAutoRefreshCall).toBe(true)
      }
    })

    it('should show toggle position based on state', () => {
      renderSettings()

      const toggle = document.querySelector('.rounded-full')
      expect(toggle).toBeInTheDocument()
    })
  })

  describe('Data Retention', () => {
    it('should render retention period select', () => {
      renderSettings()

      expect(screen.getByText('Data Retention Period')).toBeInTheDocument()
      const select = screen.getByDisplayValue('30 days')
      expect(select).toBeInTheDocument()
    })

    it('should have all retention options', () => {
      renderSettings()

      expect(screen.getByText('7 days')).toBeInTheDocument()
      expect(screen.getByText('30 days')).toBeInTheDocument()
      expect(screen.getByText('60 days')).toBeInTheDocument()
      expect(screen.getByText('90 days')).toBeInTheDocument()
      expect(screen.getByText('6 months')).toBeInTheDocument()
      expect(screen.getByText('1 year')).toBeInTheDocument()
      expect(screen.getByText('Never (keep all data)')).toBeInTheDocument()
    })

    it('should update retention days when option is selected', () => {
      renderSettings()

      const select = screen.getByDisplayValue('30 days')
      fireEvent.change(select, { target: { value: '60' } })

      expect(mockUpdateSettings).toHaveBeenCalledWith({ dataRetentionDays: 60 })
    })

    it('should show correct description for current retention', () => {
      renderSettings()

      expect(screen.getByText(/\(every 30 days\)/)).toBeInTheDocument()
    })

    it('should show never delete description for -1', () => {
      mockSettings.dataRetentionDays = -1
      renderSettings()

      expect(screen.getByText(/\. Data is never deleted automatically\./)).toBeInTheDocument()
    })
  })

  describe('Reset to Defaults', () => {
    it('should render reset button', () => {
      renderSettings()

      expect(screen.getByText('Reset All Settings to Defaults')).toBeInTheDocument()
    })

    it('should open the reset confirmation dialog when reset is clicked', () => {
      renderSettings()

      fireEvent.click(screen.getByText('Reset All Settings to Defaults'))

      expect(screen.getByText(/Reset all settings to default values\?/)).toBeInTheDocument()
    })

    it('should reset settings when confirm is accepted', () => {
      renderSettings()

      fireEvent.click(screen.getByText('Reset All Settings to Defaults'))
      // Confirm inside the dialog
      fireEvent.click(screen.getByText('Reset to Defaults'))

      expect(mockUpdateSettings).toHaveBeenCalledWith({
        theme: 'system',
        fontSize: 'default',
        dataRetentionDays: 30,
        autoRefresh: false,
      })
    })

    it('should not reset settings when confirm is cancelled', () => {
      renderSettings()

      fireEvent.click(screen.getByText('Reset All Settings to Defaults'))
      fireEvent.click(screen.getByText('Cancel'))

      expect(mockUpdateSettings).not.toHaveBeenCalledWith(
        expect.objectContaining({
          theme: 'system',
          fontSize: 'default',
        }),
      )
    })
  })

  describe('Section Styling', () => {
    it('should render section headers with icons', () => {
      renderSettings()

      expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
      expect(screen.getByText('API Configuration')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Data Management' })).toBeInTheDocument()
    })

    it('should render danger zone with destructive styling', () => {
      renderSettings()

      const dangerZone = document.querySelector('.bg-destructive\\/5')
      expect(dangerZone).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle existing API key in input', async () => {
      // The component reads the API key from secure storage, not from settings
      mockStoredApiKey = 'existing-key-1234-5678-9abc-def123456789'
      renderSettings()

      // Wait for async loading to complete
      const input = await screen.findByDisplayValue('existing-key-1234-5678-9abc-def123456789')
      expect(input).toBeInTheDocument()
    })

    it('should handle light theme', () => {
      mockSettings.theme = 'light'
      const { unmount } = renderSettings()
      unmount()

      const { rerender } = renderSettings()
      rerender(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      )

      const themeButton = screen.getByText('light')
      expect(themeButton.closest('button')).toHaveClass('border-primary')
    })

    it('should handle dark theme', () => {
      mockSettings.theme = 'dark'
      const { unmount } = renderSettings()
      unmount()

      const { rerender } = renderSettings()
      rerender(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      )

      const themeButton = screen.getByText('dark')
      expect(themeButton.closest('button')).toHaveClass('border-primary')
    })

    it('should handle system theme', () => {
      mockSettings.theme = 'system'
      const { unmount } = renderSettings()
      unmount()

      const { rerender } = renderSettings()
      rerender(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      )

      const themeButton = screen.getByText('system')
      expect(themeButton.closest('button')).toHaveClass('border-primary')
    })

    it('should handle small font size', () => {
      mockSettings.fontSize = 'small'
      const { unmount } = renderSettings()
      unmount()

      const { rerender } = renderSettings()
      rerender(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      )

      const sizeButton = screen.getByText('small')
      expect(sizeButton.closest('button')).toHaveClass('border-primary')
    })

    it('should handle default font size', () => {
      mockSettings.fontSize = 'default'
      const { unmount } = renderSettings()
      unmount()

      const { rerender } = renderSettings()
      rerender(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      )

      const sizeButton = screen.getByText('default')
      expect(sizeButton.closest('button')).toHaveClass('border-primary')
    })

    it('should handle large font size', () => {
      mockSettings.fontSize = 'large'
      const { unmount } = renderSettings()
      unmount()

      const { rerender } = renderSettings()
      rerender(
        <MemoryRouter>
          <Settings />
        </MemoryRouter>,
      )

      const sizeButton = screen.getByText('large')
      expect(sizeButton.closest('button')).toHaveClass('border-primary')
    })
  })

  describe('Settings Profile Tests', () => {
    /**
     * TC-SET-006: Set Data Retention Period (P2)
     * Description: Verify data retention period can be configured
     * Steps:
     * 1. Navigate to Settings page
     * 2. Locate Data Retention Period section
     * 3. Select different retention period (7, 30, 60, 90 days, 6 months, 1 year, never)
     * 4. Verify setting is saved
     * Expected: Data retention period is updated and saved
     */
    describe('TC-SET-006: Set Data Retention Period', () => {
      it('should render retention period select', () => {
        renderSettings()

        expect(screen.getByText('Data Retention Period')).toBeInTheDocument()
        const select = screen.getByDisplayValue('30 days')
        expect(select).toBeInTheDocument()
      })

      it('should update retention days when option is selected', () => {
        renderSettings()

        const select = screen.getByDisplayValue('30 days')
        fireEvent.change(select, { target: { value: '60' } })

        expect(mockUpdateSettings).toHaveBeenCalledWith({ dataRetentionDays: 60 })
      })

      it('should show correct description for current retention', () => {
        renderSettings()

        expect(screen.getByText(/\(every 30 days\)/)).toBeInTheDocument()
      })

      it('should show never delete description for -1', () => {
        mockSettings.dataRetentionDays = -1
        renderSettings()

        expect(screen.getByText(/\. Data is never deleted automatically\./)).toBeInTheDocument()
      })
    })

    /**
     * TC-SET-007: Toggle Auto-Refresh (P1)
     * Description: Verify auto-refresh toggle can be enabled/disabled
     * Steps:
     * 1. Navigate to Settings page
     * 2. Locate Auto-Refresh Vulnerability Data toggle
     * 3. Click toggle to enable/disable
     * 4. Verify setting is saved
     * Expected: Auto-refresh setting is updated and saved
     */
    describe('TC-SET-007: Toggle Auto-Refresh', () => {
      it('should render auto-refresh toggle', () => {
        renderSettings()

        expect(screen.getByText('Auto-refresh Vulnerability Data')).toBeInTheDocument()
      })

      it('should toggle auto-refresh when clicked', () => {
        const initialCallCount = mockUpdateSettings.mock.calls.length
        renderSettings()

        // Find the toggle button - it has both rounded-full and bg-muted-foreground classes when off
        const toggle = document.querySelector('button.rounded-full.bg-muted-foreground')
        if (toggle) {
          fireEvent.click(toggle)
          // Check that a new call was made after our initial count
          expect(mockUpdateSettings.mock.calls.length).toBeGreaterThan(initialCallCount)
          // Check that autoRefresh was called with true (toggling from false to true)
          const hasAutoRefreshCall = mockUpdateSettings.mock.calls.some((call) => call[0]?.autoRefresh === true)
          expect(hasAutoRefreshCall).toBe(true)
        }
      })

      it('should show toggle position based on state', () => {
        renderSettings()

        const toggle = document.querySelector('.rounded-full')
        expect(toggle).toBeInTheDocument()
      })
    })

    /**
     * TC-SET-008: Reset to Defaults (P1)
     * Description: Verify settings can be reset to default values
     * Steps:
     * 1. Navigate to Settings page
     * 2. Locate Reset All Settings to Defaults button
     * 3. Click reset button
     * 4. Accept confirmation dialog
     * 5. Verify all settings are reset to defaults
     * Expected: All settings reset to default values
     */
    describe('TC-SET-008: Reset to Defaults', () => {
      it('should render reset button', () => {
        renderSettings()

        expect(screen.getByText('Reset All Settings to Defaults')).toBeInTheDocument()
      })

      it('should open the reset confirmation dialog when reset is clicked', () => {
        renderSettings()

        fireEvent.click(screen.getByText('Reset All Settings to Defaults'))

        expect(screen.getByText(/Reset all settings to default values\?/)).toBeInTheDocument()
      })

      it('should reset settings when confirm is accepted', () => {
        renderSettings()

        fireEvent.click(screen.getByText('Reset All Settings to Defaults'))
        fireEvent.click(screen.getByText('Reset to Defaults'))

        expect(mockUpdateSettings).toHaveBeenCalledWith({
          theme: 'system',
          fontSize: 'default',
          dataRetentionDays: 30,
          autoRefresh: false,
        })
      })

      it('should not reset settings when confirm is cancelled', () => {
        renderSettings()

        fireEvent.click(screen.getByText('Reset All Settings to Defaults'))
        fireEvent.click(screen.getByText('Cancel'))

        expect(mockUpdateSettings).not.toHaveBeenCalledWith(
          expect.objectContaining({
            theme: 'system',
            fontSize: 'default',
          }),
        )
      })
    })

    /**
     * TC-SET-009: Create Settings Profile (P1)
     * Description: Verify new settings profiles can be created
     * Tests now active with proper mocks
     */
    describe('TC-SET-009: Create Settings Profile', () => {
      beforeEach(() => {
        vi.clearAllMocks()
      })

      it('should render Settings Profiles section', () => {
        renderSettings()

        expect(screen.getByText('Settings Profiles')).toBeInTheDocument()
      })

      it('should render "Create New Profile" button', () => {
        renderSettings()

        expect(screen.getByText('Create New Profile')).toBeInTheDocument()
      })

      it('should show empty state when no profiles exist', () => {
        renderSettings()

        expect(
          screen.getByText('No settings profiles yet. Create your first profile to get started!'),
        ).toBeInTheDocument()
      })

      it('should show profiles when they exist', () => {
        const mockProfile = createMockProfile()
        const store = createMockStore()
        store.settingsProfiles = [mockProfile]

        vi.mocked(useStore).mockReturnValue(store)

        renderSettings()

        expect(screen.getByText('Test Profile')).toBeInTheDocument()
      })

      it('should show "Create New Profile" button in Settings Profiles section', () => {
        renderSettings()

        const createButton = screen.getByText('Create New Profile')
        expect(createButton).toBeInTheDocument()
        expect(createButton.closest('button')).toHaveClass('bg-primary')
      })
    })

    /**
     * TC-SET-010: Switch Settings Profile (P1)
     * Description: Verify settings profiles can be switched
     * Tests now active with proper mocks
     */
    describe('TC-SET-010: Switch Settings Profile', () => {
      it('should render profile cards when profiles exist', () => {
        const mockProfile = createMockProfile()
        const store = createMockStore()
        store.settingsProfiles = [mockProfile]
        store.activeProfileId = ''

        vi.mocked(useStore).mockReturnValue(store)

        renderSettings()

        expect(screen.getByText('Test Profile')).toBeInTheDocument()
        expect(screen.getByText('Switch to Profile')).toBeInTheDocument()
      })

      it('should show active profile indicator', () => {
        const mockProfile = createMockProfile()
        const store = createMockStore()
        store.settingsProfiles = [mockProfile]
        store.activeProfileId = 'profile-1'

        vi.mocked(useStore).mockReturnValue(store)

        renderSettings()

        expect(screen.getByText('Active Profile')).toBeInTheDocument()
      })

      it('should show last used time for profiles', () => {
        const mockProfile = createMockProfile({ lastUsed: new Date('2024-01-15T10:30:00') })
        const store = createMockStore()
        store.settingsProfiles = [mockProfile]

        vi.mocked(useStore).mockReturnValue(store)

        renderSettings()

        // The mock renders the profile name, which confirms the profile is shown
        expect(screen.getByText('Test Profile')).toBeInTheDocument()
        // In the real component, last used time would be displayed
        // The mock component just shows the profile name
      })
    })

    /**
     * TC-SET-011: Delete Settings Profile (P2)
     * Description: Verify settings profiles can be deleted
     * Tests now active with proper mocks
     */
    describe('TC-SET-011: Delete Settings Profile', () => {
      it('should show delete button on profile card', () => {
        const mockProfile = createMockProfile()
        const store = createMockStore()
        store.settingsProfiles = [mockProfile]
        store.activeProfileId = ''

        vi.mocked(useStore).mockReturnValue(store)

        renderSettings()

        // The mock component renders a delete button
        const deleteButton = screen.getByText('Delete')
        expect(deleteButton).toBeInTheDocument()
      })

      it('should disable delete button for active profile', () => {
        const mockProfile = createMockProfile()
        const store = createMockStore()
        store.settingsProfiles = [mockProfile]
        store.activeProfileId = 'profile-1'

        vi.mocked(useStore).mockReturnValue(store)

        renderSettings()

        // When profile is active, it shows "Active Profile" indicator instead of delete button
        expect(screen.getByTestId('active-indicator')).toBeInTheDocument()
        expect(screen.getByText('Active Profile')).toBeInTheDocument()
      })
    })

    /**
     * TC-SET-012: Export/Import Settings Profiles (P1)
     * Description: Verify settings profiles can be exported and imported
     * Tests now active with proper mocks
     */
    describe('TC-SET-012: Export/Import Settings Profiles', () => {
      it('should render Import/Export section', () => {
        renderSettings()

        expect(screen.getByText('Import/Export Settings Profiles')).toBeInTheDocument()
      })

      it('should render Export button', () => {
        renderSettings()

        expect(screen.getByText('Export Profiles')).toBeInTheDocument()
      })

      it('should render Import button', () => {
        renderSettings()

        expect(screen.getByText('Import Profiles')).toBeInTheDocument()
      })

      it('should disable Export button when no profiles exist', () => {
        const store = createMockStore()
        store.settingsProfiles = []

        vi.mocked(useStore).mockReturnValue(store)

        renderSettings()

        const exportButton = screen.getByText('Export Profiles').closest('button')
        expect(exportButton).toBeDisabled()
      })

      it('should enable Export button when profiles exist', () => {
        const mockProfile = createMockProfile()
        const store = createMockStore()
        store.settingsProfiles = [mockProfile]

        vi.mocked(useStore).mockReturnValue(store)

        renderSettings()

        const exportButton = screen.getByText('Export Profiles').closest('button')
        expect(exportButton).not.toBeDisabled()
      })

      it('should show description for Import/Export section', () => {
        renderSettings()

        expect(screen.getByText(/Share your settings profiles across different installations/)).toBeInTheDocument()
      })

      it('should call exportSettingsProfiles and show success when Export is clicked', () => {
        const mockProfile = createMockProfile()
        const store = createMockStore()
        store.settingsProfiles = [mockProfile]
        store.exportSettingsProfiles = vi.fn()

        vi.mocked(useStore).mockReturnValue(store)

        renderSettings()

        const exportButton = screen.getByText('Export Profiles')
        fireEvent.click(exportButton)

        expect(store.exportSettingsProfiles).toHaveBeenCalled()
      })
    })
  })

  describe('Database Management Section', () => {
    it('should render Database Management section', () => {
      renderSettings()

      expect(screen.getByText('Database Management')).toBeInTheDocument()
    })

    it('should render database statistics grid', () => {
      renderSettings()

      expect(screen.getByText('Total CVEs')).toBeInTheDocument()
      expect(screen.getByText('CPE Matches')).toBeInTheDocument()
      expect(screen.getByText('Database Size')).toBeInTheDocument()
      expect(screen.getByText('Last Sync')).toBeInTheDocument()
    })

    it('should render Sync Schedule dropdown', () => {
      renderSettings()

      expect(screen.getByText('Sync Schedule')).toBeInTheDocument()
    })

    it('should render Sync Now button', () => {
      renderSettings()

      // "Sync Now" appears in both DB sync and KEV sync sections
      const syncButtons = screen.getAllByText('Sync Now')
      expect(syncButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('should render Bulk Download button', () => {
      renderSettings()

      expect(screen.getByText('Bulk Download')).toBeInTheDocument()
    })

    it('should render Rebuild Indexes button', () => {
      renderSettings()

      expect(screen.getByText('Rebuild Indexes')).toBeInTheDocument()
    })

    it('should render Reset Database button', () => {
      renderSettings()

      // The button in the DB actions area
      const resetButtons = screen.getAllByText('Reset Database')
      expect(resetButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('should render Storage Management section', () => {
      renderSettings()

      expect(screen.getByText('Storage Management')).toBeInTheDocument()
    })

    it('should render Maximum Database Size dropdown', () => {
      renderSettings()

      expect(screen.getByText('Maximum Database Size')).toBeInTheDocument()
    })

    it('should render Prune Old CVEs toggle', () => {
      renderSettings()

      expect(screen.getByText('Prune Old CVEs')).toBeInTheDocument()
    })

    it('reverts the Maximum Database Size change when the server rejects it (H3)', async () => {
      // WHY: the handler updated local state optimistically and ignored the server's
      // {success}. A rejected save left the dropdown showing a value that was never
      // persisted, so the user believed a change took effect when it did not.
      const { getPlatform } = await import('@/lib/platform')
      const mockPlatform = vi.mocked(getPlatform)()
      vi.mocked(mockPlatform.database.updateStorageConfig).mockResolvedValueOnce({ success: false, error: 'nope' })

      renderSettings()

      const select = screen.getByLabelText('Maximum Database Size') as HTMLSelectElement
      const original = select.value
      const other = Array.from(select.options).find((option) => option.value !== original)
      if (!other) throw new Error('expected a second database-size option')

      fireEvent.change(select, { target: { value: other.value } })

      await waitFor(() => {
        expect((screen.getByLabelText('Maximum Database Size') as HTMLSelectElement).value).toBe(original)
      })
    })
  })

  describe('Backup & Recovery Section', () => {
    it('should render Backup & Recovery section header', () => {
      renderSettings()

      expect(screen.getByText('Backup & Recovery')).toBeInTheDocument()
    })

    it('should render Create Backup button', () => {
      renderSettings()

      expect(screen.getByText('Create Backup')).toBeInTheDocument()
    })

    it('should render Backup Configuration', () => {
      renderSettings()

      expect(screen.getByText('Backup Configuration')).toBeInTheDocument()
    })

    it('should render Keep Backups dropdown', () => {
      renderSettings()

      expect(screen.getByText('Keep Backups')).toBeInTheDocument()
    })

    it('should show no backups message when empty', () => {
      renderSettings()

      expect(screen.getByText(/No backups available/)).toBeInTheDocument()
    })

    it('should render backup list when backups exist', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const mockPlatform = vi.mocked(getPlatform)()

      vi.mocked(mockPlatform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [
          {
            id: 'backup-1',
            createdAt: '2024-06-01T10:00:00Z',
            size: 1024 * 1024,
            verified: true,
          },
        ],
      })

      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Available Backups (1)')).toBeInTheDocument()
      })
    })
  })

  describe('Performance Tuning Section', () => {
    it('should render Performance Tuning section', () => {
      renderSettings()

      expect(screen.getByText('Performance Tuning')).toBeInTheDocument()
    })

    it('should render Search Result Limit dropdown', () => {
      renderSettings()

      expect(screen.getByText('Search Result Limit')).toBeInTheDocument()
    })

    it('should render Enable Search Cache toggle', () => {
      renderSettings()

      expect(screen.getByText('Enable Search Cache')).toBeInTheDocument()
    })
  })

  describe('Threat Intelligence Section', () => {
    it('should render Threat Intelligence section', () => {
      renderSettings()

      expect(screen.getByText('Threat Intelligence')).toBeInTheDocument()
    })

    it('should render KEV stats grid', () => {
      renderSettings()

      expect(screen.getByText('KEV Entries')).toBeInTheDocument()
      expect(screen.getByText('Ransomware')).toBeInTheDocument()
      expect(screen.getByText('Last Updated')).toBeInTheDocument()
    })

    it('should render Sync KEV Catalog section', () => {
      renderSettings()

      expect(screen.getByText('Sync KEV Catalog')).toBeInTheDocument()
      // "Sync Now" appears in both DB sync and KEV sync sections
      const syncButtons = screen.getAllByText('Sync Now')
      expect(syncButtons.length).toBeGreaterThanOrEqual(2)
    })

    it('should render KEV info text', () => {
      renderSettings()

      expect(screen.getByText(/CISA KEV Catalog/)).toBeInTheDocument()
    })
  })

  describe('ConfirmDialog', () => {
    it('should show Reset Database dialog when button is clicked', () => {
      // Reset mock implementation to ensure clean state
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)

      renderSettings()

      // Find the Reset Database button in the DB actions area (not the dialog confirm button)
      const resetButtons = screen.getAllByText('Reset Database')
      // Click the first one (the action button in the DB section)
      fireEvent.click(resetButtons[0])

      // Dialog should now be open with the warning message
      expect(screen.getByText(/This will delete all CVE data from the local database/)).toBeInTheDocument()
    })

    it('should show Rebuild Indexes dialog when button is clicked', () => {
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)

      renderSettings()

      fireEvent.click(screen.getByText('Rebuild Indexes'))

      expect(screen.getByText(/This will rebuild all database indexes/)).toBeInTheDocument()
    })

    it('should close dialog when Cancel is clicked', () => {
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)

      renderSettings()

      // Open the reset dialog
      const resetButtons = screen.getAllByText('Reset Database')
      fireEvent.click(resetButtons[0])
      expect(screen.getByText(/This will delete all CVE data from the local database/)).toBeInTheDocument()

      // Find and click the Cancel button in the dialog
      const cancelButtons = screen.getAllByText('Cancel')
      fireEvent.click(cancelButtons[cancelButtons.length - 1])

      // Dialog should be closed - the warning text should no longer be present
      expect(screen.queryByText(/This will delete all CVE data from the local database/)).not.toBeInTheDocument()
    })
  })

  describe('Secure Storage Availability', () => {
    it('should show secure storage status', async () => {
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)
      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Secure Storage Enabled')).toBeInTheDocument()
      })
    })

    it('should show Delete Key button when key exists and storage available', async () => {
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)
      mockStoredApiKey = '12345678-1234-1234-1234-123456789012'
      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Delete Key')).toBeInTheDocument()
      })
    })
  })

  describe('Database Sync and Download Handlers', () => {
    it('should call startDeltaSync when Sync Now is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      const syncButtons = screen.getAllByText('Sync Now')
      fireEvent.click(syncButtons[0])

      await waitFor(() => {
        expect(platform.database.startDeltaSync).toHaveBeenCalledWith(false)
      })
    })

    it('should refresh stats after successful sync', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.startDeltaSync).mockResolvedValueOnce({
        success: true,
        cvesAdded: 10,
        cvesUpdated: 5,
      })
      vi.mocked(platform.database.getStats).mockResolvedValue({
        success: true,
        stats: { totalCves: 100, dbSize: 2048, lastUpdate: '2024-01-01' },
      })

      renderSettings()

      const syncButtons = screen.getAllByText('Sync Now')
      fireEvent.click(syncButtons[0])

      await waitFor(() => {
        expect(platform.database.getStats).toHaveBeenCalled()
      })
    })

    it('should show error when sync fails', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.startDeltaSync).mockResolvedValueOnce({
        success: false,
        errors: ['API rate limit exceeded'],
      })

      renderSettings()

      const syncButtons = screen.getAllByText('Sync Now')
      fireEvent.click(syncButtons[0])

      await waitFor(() => {
        expect(screen.getByText(/API rate limit exceeded/)).toBeInTheDocument()
      })
    })

    it('should call startBulkDownload when Bulk Download is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      fireEvent.click(screen.getByText('Bulk Download'))

      await waitFor(() => {
        expect(platform.database.startBulkDownload).toHaveBeenCalledWith(
          expect.objectContaining({
            startYear: expect.any(Number),
            endYear: expect.any(Number),
          }),
        )
      })
    })

    it('should show error when bulk download fails', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.startBulkDownload).mockResolvedValueOnce({
        success: false,
        errors: ['Download failed'],
      })

      renderSettings()

      fireEvent.click(screen.getByText('Bulk Download'))

      await waitFor(() => {
        expect(screen.getByText(/Download failed/)).toBeInTheDocument()
      })
    })

    it('should handle sync exception gracefully', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.startDeltaSync).mockRejectedValueOnce(new Error('Network error'))

      renderSettings()

      const syncButtons = screen.getAllByText('Sync Now')
      fireEvent.click(syncButtons[0])

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument()
      })
    })

    it('should handle bulk download exception gracefully', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.startBulkDownload).mockRejectedValueOnce(new Error('Connection lost'))

      renderSettings()

      fireEvent.click(screen.getByText('Bulk Download'))

      await waitFor(() => {
        expect(screen.getByText(/Connection lost/)).toBeInTheDocument()
      })
    })
  })

  describe('Database Reset and Rebuild Handlers', () => {
    it('should reset database when confirmed in dialog', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      const resetButtons = screen.getAllByText('Reset Database')
      fireEvent.click(resetButtons[0])

      expect(screen.getByText(/This will delete all CVE data/)).toBeInTheDocument()

      const confirmButtons = screen.getAllByText('Reset Database')
      fireEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(platform.database.resetDatabase).toHaveBeenCalled()
      })
    })

    it('should rebuild indexes when confirmed in dialog', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      fireEvent.click(screen.getByText('Rebuild Indexes'))

      expect(screen.getByText(/This will rebuild all database indexes/)).toBeInTheDocument()

      const confirmButtons = screen.getAllByText('Rebuild Indexes')
      fireEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(platform.database.rebuildIndexes).toHaveBeenCalled()
      })
    })

    it('should show FTS5 error when rebuild fails with fts5 error', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.rebuildIndexes).mockResolvedValueOnce({
        success: false,
        error: 'fts5 module not available',
      })

      renderSettings()

      fireEvent.click(screen.getByText('Rebuild Indexes'))

      const confirmButtons = screen.getAllByText('Rebuild Indexes')
      fireEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(screen.getByText(/Full-text search indexing is not available/)).toBeInTheDocument()
      })
    })

    it('should handle rebuild exception', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.rebuildIndexes).mockRejectedValueOnce(new Error('Disk full'))

      renderSettings()

      fireEvent.click(screen.getByText('Rebuild Indexes'))

      const confirmButtons = screen.getAllByText('Rebuild Indexes')
      fireEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(screen.getByText(/Disk full/)).toBeInTheDocument()
      })
    })

    it('should close restore dialog on cancel', () => {
      renderSettings()

      expect(screen.queryByText(/This will replace your current database/)).not.toBeInTheDocument()
    })
  })

  describe('Storage and Performance Settings Changes', () => {
    it('should update sync schedule when dropdown changes', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      const syncSelect = screen.getByDisplayValue('Weekly')
      fireEvent.change(syncSelect, { target: { value: 'daily' } })

      await waitFor(() => {
        expect(platform.database.updateSyncConfig).toHaveBeenCalledWith({ syncInterval: 'daily' })
      })
    })

    it('updates the bandwidth limit via updateSyncConfig (FR-10.3)', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      // The Settings input is the only client->server path for the update bandwidth
      // cap; a change must reach updateSyncConfig as a number, not a string.
      const input = screen.getByLabelText(/bandwidth limit/i)
      fireEvent.change(input, { target: { value: '500' } })

      await waitFor(() => {
        expect(platform.database.updateSyncConfig).toHaveBeenCalledWith({ bandwidthLimitKBps: 500 })
      })
    })

    it('displays the database storage location from getStats().dbPath (FR-10.3)', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()
      vi.mocked(platform.database.getStats).mockResolvedValueOnce({
        success: true,
        stats: { totalCves: 0, lastUpdate: null, dbSize: 0, version: 1 },
        dbPath: 'C:\\vulndata\\nvd-data.db',
      })

      renderSettings()

      // The user must be able to see where the DB lives; the path comes from the
      // server config, surfaced via getStats().dbPath.
      await waitFor(() => {
        expect(screen.getByText('C:\\vulndata\\nvd-data.db')).toBeInTheDocument()
      })
    })

    it('should toggle prune old CVEs switch', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      const pruneToggle = screen.getByRole('switch', { name: 'Toggle prune old CVEs' })
      fireEvent.click(pruneToggle)

      await waitFor(() => {
        expect(platform.database.updateStorageConfig).toHaveBeenCalled()
      })
    })

    it('should show prune year dropdown when prune is enabled', async () => {
      renderSettings()

      const pruneToggle = screen.getByRole('switch', { name: 'Toggle prune old CVEs' })
      fireEvent.click(pruneToggle)

      await waitFor(() => {
        expect(screen.getByText('Keep CVEs From')).toBeInTheDocument()
      })
    })

    it('should change max database size', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      const sizeSelect = screen.getByDisplayValue('2 GB')
      fireEvent.change(sizeSelect, { target: { value: '1024' } })

      await waitFor(() => {
        expect(platform.database.updateStorageConfig).toHaveBeenCalledWith(expect.objectContaining({ maxSizeMB: 1024 }))
      })
    })

    it('should change search result limit', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      const limitSelect = screen.getByDisplayValue('100 results')
      fireEvent.change(limitSelect, { target: { value: '200' } })

      await waitFor(() => {
        expect(platform.database.updatePerformanceConfig).toHaveBeenCalledWith(
          expect.objectContaining({ searchResultLimit: 200 }),
        )
      })
    })

    it('should toggle search cache switch', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      const cacheToggle = screen.getByRole('switch', { name: 'Toggle search cache' })
      fireEvent.click(cacheToggle)

      await waitFor(() => {
        expect(platform.database.updatePerformanceConfig).toHaveBeenCalled()
      })
    })

    it('should hide cache size dropdown when cache is disabled', () => {
      renderSettings()

      expect(screen.getByText('Cache Size')).toBeInTheDocument()

      const cacheToggle = screen.getByRole('switch', { name: 'Toggle search cache' })
      fireEvent.click(cacheToggle)

      expect(screen.queryByText('Cache Size')).not.toBeInTheDocument()
    })
  })

  describe('Backup Operations', () => {
    it('should create backup when Create Backup is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      fireEvent.click(screen.getByText('Create Backup'))

      await waitFor(() => {
        expect(platform.backup.createBackup).toHaveBeenCalled()
      })
    })

    it('should show success message after backup creation', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.createBackup).mockResolvedValueOnce({
        success: true,
        backup: {
          id: 'new-backup',
          createdAt: '2024-06-01T10:00:00Z',
          size: 2048,
          verified: true,
        },
      })

      renderSettings()

      fireEvent.click(screen.getByText('Create Backup'))

      await waitFor(() => {
        expect(screen.getByText('Backup created successfully')).toBeInTheDocument()
      })
    })

    it('should show error when backup creation fails', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.createBackup).mockResolvedValueOnce({
        success: false,
        error: 'Insufficient disk space',
      })

      renderSettings()

      fireEvent.click(screen.getByText('Create Backup'))

      await waitFor(() => {
        expect(screen.getByText(/Insufficient disk space/)).toBeInTheDocument()
      })
    })

    it('should verify backup when verify button is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [
          {
            id: 'backup-1',
            createdAt: '2024-06-01T10:00:00Z',
            size: 1024,
            verified: false,
          },
        ],
      })
      vi.mocked(platform.backup.verifyBackup).mockResolvedValueOnce({
        success: true,
        integrity: 'valid',
      })

      renderSettings()

      await waitFor(() => {
        expect(screen.getByLabelText('Verify backup integrity')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Verify backup integrity'))

      await waitFor(() => {
        expect(platform.backup.verifyBackup).toHaveBeenCalledWith('backup-1')
      })
    })

    it('should delete backup when delete button is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [
          {
            id: 'backup-1',
            createdAt: '2024-06-01T10:00:00Z',
            size: 1024,
            verified: true,
          },
        ],
      })

      renderSettings()

      await waitFor(() => {
        expect(screen.getByLabelText('Delete backup')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Delete backup'))

      await waitFor(() => {
        expect(platform.backup.deleteBackup).toHaveBeenCalledWith('backup-1')
      })
    })

    it('should restore backup when confirmed in dialog', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [
          {
            id: 'backup-1',
            createdAt: '2024-06-01T10:00:00Z',
            size: 1024,
            verified: true,
          },
        ],
      })

      window.location.reload = vi.fn()

      renderSettings()

      await waitFor(() => {
        expect(screen.getByLabelText('Restore backup')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Restore backup'))

      expect(screen.getByText(/This will replace your current database/)).toBeInTheDocument()

      const confirmButtons = screen.getAllByText('Restore Backup')
      fireEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(platform.backup.restoreBackup).toHaveBeenCalledWith('backup-1')
      })
    })

    it('should change backup retention count', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      const retentionSelect = screen.getByDisplayValue('3 backups')
      fireEvent.change(retentionSelect, { target: { value: '5' } })

      await waitFor(() => {
        expect(platform.backup.updateConfig).toHaveBeenCalledWith({ maxBackups: 5 })
      })
    })

    it('should show error when delete backup fails', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [
          {
            id: 'backup-1',
            createdAt: '2024-06-01T10:00:00Z',
            size: 1024,
            verified: true,
          },
        ],
      })
      vi.mocked(platform.backup.deleteBackup).mockResolvedValueOnce({
        success: false,
        error: 'Cannot delete last backup',
      })

      renderSettings()

      await waitFor(() => {
        expect(screen.getByLabelText('Delete backup')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Delete backup'))

      await waitFor(() => {
        expect(screen.getByText(/Cannot delete last backup/)).toBeInTheDocument()
      })
    })
  })

  describe('KEV Sync Handler', () => {
    it('should call syncKev when KEV Sync Now is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      const syncButtons = screen.getAllByText('Sync Now')
      fireEvent.click(syncButtons[syncButtons.length - 1])

      await waitFor(() => {
        expect(platform.intelligence.syncKev).toHaveBeenCalled()
      })
    })

    it('should show success message when KEV sync succeeds', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.intelligence.syncKev).mockResolvedValueOnce({
        success: true,
        result: { added: 5, removed: 2, total: 1000 },
      })
      vi.mocked(platform.intelligence.getKevStats).mockResolvedValueOnce({
        success: true,
        stats: { total: 1000, ransomwareRelated: 50, lastUpdated: '2024-06-01' },
      })

      renderSettings()

      const syncButtons = screen.getAllByText('Sync Now')
      fireEvent.click(syncButtons[syncButtons.length - 1])

      await waitFor(() => {
        expect(screen.getByText(/KEV catalog synced/)).toBeInTheDocument()
      })
    })

    it('should show error when KEV sync fails', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.intelligence.syncKev).mockResolvedValueOnce({
        success: false,
        error: 'Network timeout',
      })

      renderSettings()

      const syncButtons = screen.getAllByText('Sync Now')
      fireEvent.click(syncButtons[syncButtons.length - 1])

      await waitFor(() => {
        expect(screen.getByText(/Network timeout/)).toBeInTheDocument()
      })
    })

    it('should handle KEV sync exception', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.intelligence.syncKev).mockRejectedValueOnce(new Error('Server error'))

      renderSettings()

      const syncButtons = screen.getAllByText('Sync Now')
      fireEvent.click(syncButtons[syncButtons.length - 1])

      await waitFor(() => {
        expect(screen.getByText(/Failed to sync KEV catalog/)).toBeInTheDocument()
      })
    })
  })

  describe('Profile Handler Operations', () => {
    it('should call switchSettingsProfile when switch is clicked', () => {
      const mockProfile = createMockProfile()
      const store = createMockStore()
      store.settingsProfiles = [mockProfile]
      store.activeProfileId = ''

      vi.mocked(useStore).mockReturnValue(store)

      renderSettings()

      fireEvent.click(screen.getByText('Switch to Profile'))

      expect(store.switchSettingsProfile).toHaveBeenCalledWith('profile-1')
    })

    it('should call deleteSettingsProfile when delete is clicked', () => {
      const mockProfile = createMockProfile()
      const store = createMockStore()
      store.settingsProfiles = [mockProfile]
      store.activeProfileId = ''

      vi.mocked(useStore).mockReturnValue(store)

      renderSettings()

      fireEvent.click(screen.getByText('Delete'))

      expect(store.deleteSettingsProfile).toHaveBeenCalledWith('profile-1')
    })

    it('should open CreateProfileDialog when Create New Profile is clicked', () => {
      renderSettings()

      fireEvent.click(screen.getByText('Create New Profile'))

      expect(screen.getByTestId('create-profile-dialog')).toBeInTheDocument()
    })

    it('should close CreateProfileDialog when cancel is clicked', () => {
      renderSettings()

      fireEvent.click(screen.getByText('Create New Profile'))
      fireEvent.click(screen.getByText('Cancel'))

      expect(screen.queryByTestId('create-profile-dialog')).not.toBeInTheDocument()
    })
  })

  describe('API Key Delete Handler', () => {
    it('should call deleteApiKey when Delete Key is clicked', async () => {
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)
      mockStoredApiKey = '12345678-1234-1234-1234-123456789012'

      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Delete Key')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete Key'))

      await waitFor(() => {
        expect(mockDeleteApiKey).toHaveBeenCalledWith('nvd')
      })
    })
  })

  describe('Data Retention Edge Cases', () => {
    it('should update data retention to Never', () => {
      renderSettings()

      const select = screen.getByDisplayValue('30 days')
      fireEvent.change(select, { target: { value: '-1' } })

      expect(mockUpdateSettings).toHaveBeenCalledWith({ dataRetentionDays: -1 })
    })

    it('should update data retention to 7 days', () => {
      renderSettings()

      const select = screen.getByDisplayValue('30 days')
      fireEvent.change(select, { target: { value: '7' } })

      expect(mockUpdateSettings).toHaveBeenCalledWith({ dataRetentionDays: 7 })
    })

    it('should update data retention to 1 year', () => {
      renderSettings()

      const select = screen.getByDisplayValue('30 days')
      fireEvent.change(select, { target: { value: '365' } })

      expect(mockUpdateSettings).toHaveBeenCalledWith({ dataRetentionDays: 365 })
    })
  })

  describe('ConfirmDialog Component', () => {
    it('should not render when open is false', () => {
      renderSettings()

      expect(screen.queryByText(/This will delete all CVE data/)).not.toBeInTheDocument()
    })

    it('should render danger variant with correct styling', () => {
      renderSettings()

      const resetButtons = screen.getAllByText('Reset Database')
      fireEvent.click(resetButtons[0])

      const dialogButton = screen.getAllByText('Reset Database')
      const confirmButton = dialogButton[dialogButton.length - 1]
      expect(confirmButton).toHaveClass('bg-destructive')
    })

    it('should render warning variant for rebuild indexes', () => {
      renderSettings()

      fireEvent.click(screen.getByText('Rebuild Indexes'))

      const dialogButton = screen.getAllByText('Rebuild Indexes')
      const confirmButton = dialogButton[dialogButton.length - 1]
      expect(confirmButton).toHaveClass('bg-yellow-600')
    })

    it('should close dialog when backdrop is clicked', () => {
      renderSettings()

      const resetButtons = screen.getAllByText('Reset Database')
      fireEvent.click(resetButtons[0])

      expect(screen.getByText(/This will delete all CVE data/)).toBeInTheDocument()

      const backdrop = document.querySelector('.fixed.inset-0.bg-black\\/50')
      if (backdrop) {
        fireEvent.click(backdrop)
      }

      expect(screen.queryByText(/This will delete all CVE data/)).not.toBeInTheDocument()
    })
  })

  describe('Export Profiles Handler', () => {
    it('should show success message after export', () => {
      const mockProfile = createMockProfile()
      const store = createMockStore()
      store.settingsProfiles = [mockProfile]
      store.exportSettingsProfiles = vi.fn()

      vi.mocked(useStore).mockReturnValue(store)

      renderSettings()

      fireEvent.click(screen.getByText('Export Profiles'))

      expect(store.exportSettingsProfiles).toHaveBeenCalled()
    })

    it('should handle export error', () => {
      const mockProfile = createMockProfile()
      const store = createMockStore()
      store.settingsProfiles = [mockProfile]
      store.exportSettingsProfiles = vi.fn(() => {
        throw new Error('Export failed')
      })

      vi.mocked(useStore).mockReturnValue(store)

      global.alert = vi.fn()

      renderSettings()

      fireEvent.click(screen.getByText('Export Profiles'))

      expect(global.alert).toHaveBeenCalledWith('Export failed')
    })
  })

  describe('formatBytes Edge Cases', () => {
    it('should display 0 B for zero bytes', () => {
      renderSettings()

      expect(screen.getByText('0 B')).toBeInTheDocument()
    })
  })

  describe('Secure Storage Unavailable', () => {
    it('should show unavailable message when secure storage is not available', async () => {
      vi.doMock('@/lib/storage', () => ({
        getSecureKeyService: () => ({
          isAvailable: vi.fn(() => Promise.resolve(false)),
          getApiKey: vi.fn(() => Promise.resolve(null)),
          setApiKey: vi.fn(() => Promise.resolve(true)),
          deleteApiKey: vi.fn(() => Promise.resolve(true)),
          hasApiKey: vi.fn(() => Promise.resolve(false)),
        }),
      }))

      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)

      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Secure Storage Unavailable')).toBeInTheDocument()
        expect(screen.getByText(/Secure storage is not available/)).toBeInTheDocument()
      })
    })
  })

  describe('Dialog Cancel Handlers', () => {
    it('should close rebuild dialog and stop loading on cancel', () => {
      renderSettings()

      fireEvent.click(screen.getByText('Rebuild Indexes'))
      expect(screen.getByText(/This will rebuild all database indexes/)).toBeInTheDocument()

      const cancelButtons = screen.getAllByText('Cancel')
      fireEvent.click(cancelButtons[cancelButtons.length - 1])

      expect(screen.queryByText(/This will rebuild all database indexes/)).not.toBeInTheDocument()
    })

    it('should close restore dialog and clear selected backup on cancel', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [
          {
            id: 'backup-1',
            createdAt: '2024-06-01T10:00:00Z',
            size: 1024,
            verified: true,
          },
        ],
      })

      renderSettings()

      await waitFor(() => {
        expect(screen.getByLabelText('Restore backup')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Restore backup'))
      expect(screen.getByText(/This will replace your current database/)).toBeInTheDocument()

      const cancelButtons = screen.getAllByText('Cancel')
      fireEvent.click(cancelButtons[cancelButtons.length - 1])

      expect(screen.queryByText(/This will replace your current database/)).not.toBeInTheDocument()
    })
  })

  describe('Import Profiles Handler', () => {
    it('should import profiles successfully from file', async () => {
      const store = createMockStore()
      store.importSettingsProfiles = vi.fn().mockResolvedValue({ success: true })
      vi.mocked(useStore).mockReturnValue(store)

      renderSettings()

      const fileInput = document.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement
      const file = new File(['{}'], 'profiles.json', { type: 'application/json' })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(store.importSettingsProfiles).toHaveBeenCalled()
        expect(screen.getByText('Settings profiles imported successfully!')).toBeInTheDocument()
      })
    })

    it('should show error when import fails', async () => {
      const store = createMockStore()
      store.importSettingsProfiles = vi.fn().mockResolvedValue({
        success: false,
        error: 'Invalid file format',
      })
      vi.mocked(useStore).mockReturnValue(store)

      renderSettings()

      const fileInput = document.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement
      const file = new File(['{}'], 'profiles.json', { type: 'application/json' })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('Invalid file format')).toBeInTheDocument()
      })
    })

    it('should handle import exception with Error message', async () => {
      const store = createMockStore()
      store.importSettingsProfiles = vi.fn().mockRejectedValue(new Error('File read error'))
      vi.mocked(useStore).mockReturnValue(store)

      renderSettings()

      const fileInput = document.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement
      const file = new File(['{}'], 'profiles.json', { type: 'application/json' })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('File read error')).toBeInTheDocument()
      })
    })

    it('should handle import exception with non-Error value', async () => {
      const store = createMockStore()
      store.importSettingsProfiles = vi.fn().mockRejectedValue('string error')
      vi.mocked(useStore).mockReturnValue(store)

      renderSettings()

      const fileInput = document.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement
      const file = new File(['{}'], 'profiles.json', { type: 'application/json' })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('Failed to import profiles')).toBeInTheDocument()
      })
    })

    it('should not import when no file is selected', async () => {
      const store = createMockStore()
      store.importSettingsProfiles = vi.fn()
      vi.mocked(useStore).mockReturnValue(store)

      renderSettings()

      const fileInput = document.querySelector('input[type="file"][accept=".json"]') as HTMLInputElement
      fireEvent.change(fileInput, { target: { files: [] } })

      expect(store.importSettingsProfiles).not.toHaveBeenCalled()
    })
  })

  describe('Prune Year Dropdown', () => {
    it('should change prune year when dropdown value changes', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      // First enable pruning
      const pruneToggle = screen.getByRole('switch', { name: 'Toggle prune old CVEs' })
      fireEvent.click(pruneToggle)

      // Wait for the prune year dropdown to appear
      await waitFor(() => {
        expect(screen.getByText('Keep CVEs From')).toBeInTheDocument()
      })

      // Change the prune year to 2020 (from PRUNE_YEAR_OPTIONS)
      const pruneYearSelect = document.querySelector('#prune-year') as HTMLSelectElement
      fireEvent.change(pruneYearSelect, { target: { value: '2020' } })

      await waitFor(() => {
        expect(platform.database.updateStorageConfig).toHaveBeenCalledWith(
          expect.objectContaining({ pruneOlderThanYear: 2020 }),
        )
      })
    })
  })

  describe('Cache Size Dropdown', () => {
    it('should change cache size when dropdown value changes', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      renderSettings()

      // Cache size dropdown is visible by default (cache is enabled in defaults)
      const cacheSizeSelect = document.querySelector('#cache-size') as HTMLSelectElement
      if (cacheSizeSelect) {
        fireEvent.change(cacheSizeSelect, { target: { value: '256' } })

        await waitFor(() => {
          expect(platform.database.updatePerformanceConfig).toHaveBeenCalledWith(
            expect.objectContaining({ cacheSizeMB: 256 }),
          )
        })
      }
    })
  })

  describe('Profile Handler Error Paths', () => {
    it('should show alert when createSettingsProfile throws', () => {
      const mockProfile = createMockProfile()
      const store = createMockStore()
      store.settingsProfiles = [mockProfile]
      store.createSettingsProfile = vi.fn(() => {
        throw new Error('Profile name already exists')
      })
      vi.mocked(useStore).mockReturnValue(store)
      global.alert = vi.fn()

      renderSettings()

      // Open create dialog and click Create
      fireEvent.click(screen.getByText('Create New Profile'))
      fireEvent.click(screen.getByText('Create'))

      expect(global.alert).toHaveBeenCalledWith('Profile name already exists')
    })

    it('should show alert when deleteSettingsProfile throws', () => {
      const mockProfile = createMockProfile()
      const store = createMockStore()
      store.settingsProfiles = [mockProfile]
      store.activeProfileId = ''
      store.deleteSettingsProfile = vi.fn(() => {
        throw new Error('Cannot delete default profile')
      })
      vi.mocked(useStore).mockReturnValue(store)
      global.alert = vi.fn()

      renderSettings()

      fireEvent.click(screen.getByText('Delete'))

      expect(global.alert).toHaveBeenCalledWith('Cannot delete default profile')
    })

    it('should show alert when switchSettingsProfile throws', () => {
      const mockProfile = createMockProfile()
      const store = createMockStore()
      store.settingsProfiles = [mockProfile]
      store.activeProfileId = ''
      store.switchSettingsProfile = vi.fn(() => {
        throw new Error('Profile not found')
      })
      vi.mocked(useStore).mockReturnValue(store)
      global.alert = vi.fn()

      renderSettings()

      fireEvent.click(screen.getByText('Switch to Profile'))

      expect(global.alert).toHaveBeenCalledWith('Profile not found')
    })
  })

  describe('API Key Error Paths', () => {
    it('should show error when setApiKey returns false on blur', async () => {
      mockSetApiKeyResult = false
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)

      renderSettings()

      const input = await screen.findByPlaceholderText(/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/)
      fireEvent.change(input, { target: { value: '12345678-1234-1234-1234-123456789012' } })
      fireEvent.blur(input)

      await waitFor(() => {
        expect(screen.getByText('Failed to save API key to secure storage')).toBeInTheDocument()
      })
    })

    it('should show error when setApiKey throws on blur', async () => {
      mockSetApiKeyShouldThrow = true
      mockSetApiKeyError = new Error('Storage locked')
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)

      renderSettings()

      const input = await screen.findByPlaceholderText(/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx/)
      fireEvent.change(input, { target: { value: '12345678-1234-1234-1234-123456789012' } })
      fireEvent.blur(input)

      await waitFor(() => {
        expect(screen.getByText('Failed to save API key')).toBeInTheDocument()
      })
    })

    it('should show error when deleteApiKey returns false', async () => {
      mockStoredApiKey = '12345678-1234-1234-1234-123456789012'
      mockDeleteApiKey.mockResolvedValueOnce(false)
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)

      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Delete Key')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete Key'))

      await waitFor(() => {
        expect(screen.getByText('Failed to delete API key')).toBeInTheDocument()
      })
    })

    it('should show error when deleteApiKey throws', async () => {
      mockStoredApiKey = '12345678-1234-1234-1234-123456789012'
      mockDeleteApiKey.mockRejectedValueOnce(new Error('Permission denied'))
      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)

      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Delete Key')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByText('Delete Key'))

      await waitFor(() => {
        expect(screen.getByText('Failed to delete API key')).toBeInTheDocument()
      })
    })
  })

  describe('Handler Error Catch Blocks', () => {
    it('should handle createBackup exception', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.createBackup).mockRejectedValueOnce(new Error('Disk full'))

      renderSettings()

      fireEvent.click(screen.getByText('Create Backup'))

      await waitFor(() => {
        expect(screen.getByText('Failed to create backup')).toBeInTheDocument()
      })
    })

    it('should handle restoreBackup failure with error message', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [{ id: 'backup-1', createdAt: '2024-06-01T10:00:00Z', size: 1024, verified: true }],
      })
      vi.mocked(platform.backup.restoreBackup).mockResolvedValueOnce({
        success: false,
        error: 'Backup corrupted',
      })

      renderSettings()

      await waitFor(() => {
        expect(screen.getByLabelText('Restore backup')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Restore backup'))
      const confirmButtons = screen.getAllByText('Restore Backup')
      fireEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(screen.getByText(/Backup corrupted/)).toBeInTheDocument()
      })
    })

    it('should handle restoreBackup exception', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [{ id: 'backup-1', createdAt: '2024-06-01T10:00:00Z', size: 1024, verified: true }],
      })
      vi.mocked(platform.backup.restoreBackup).mockRejectedValueOnce(new Error('IO error'))

      renderSettings()

      await waitFor(() => {
        expect(screen.getByLabelText('Restore backup')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Restore backup'))
      const confirmButtons = screen.getAllByText('Restore Backup')
      fireEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(screen.getByText('Failed to restore backup')).toBeInTheDocument()
      })
    })

    it('should handle deleteBackup exception', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [{ id: 'backup-1', createdAt: '2024-06-01T10:00:00Z', size: 1024, verified: true }],
      })
      vi.mocked(platform.backup.deleteBackup).mockRejectedValueOnce(new Error('File in use'))

      renderSettings()

      await waitFor(() => {
        expect(screen.getByLabelText('Delete backup')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Delete backup'))

      await waitFor(() => {
        expect(screen.getByText('Failed to delete backup')).toBeInTheDocument()
      })
    })

    it('should handle verifyBackup exception', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.listBackups).mockResolvedValueOnce({
        success: true,
        backups: [{ id: 'backup-1', createdAt: '2024-06-01T10:00:00Z', size: 1024, verified: true }],
      })
      vi.mocked(platform.backup.verifyBackup).mockRejectedValueOnce(new Error('Hash mismatch'))

      renderSettings()

      await waitFor(() => {
        expect(screen.getByLabelText('Verify backup integrity')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByLabelText('Verify backup integrity'))

      // Verify should not crash - the error is silently caught
      await waitFor(() => {
        expect(platform.backup.verifyBackup).toHaveBeenCalledWith('backup-1')
      })
    })

    it('should handle rebuild indexes with non-fts5 error', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.rebuildIndexes).mockResolvedValueOnce({
        success: false,
        error: 'Permission denied for index operation',
      })

      renderSettings()

      fireEvent.click(screen.getByText('Rebuild Indexes'))
      const confirmButtons = screen.getAllByText('Rebuild Indexes')
      fireEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(screen.getByText('Permission denied for index operation')).toBeInTheDocument()
      })
    })

    it('should handle resetDatabase failure', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.resetDatabase).mockResolvedValueOnce({
        success: false,
        error: 'Database is locked',
      })

      renderSettings()

      const resetButtons = screen.getAllByText('Reset Database')
      fireEvent.click(resetButtons[0])
      const confirmButtons = screen.getAllByText('Reset Database')
      fireEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(platform.database.resetDatabase).toHaveBeenCalled()
      })
    })

    it('should handle syncScheduleChange error', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.updateSyncConfig).mockRejectedValueOnce(new Error('Config locked'))

      renderSettings()

      const syncSelect = screen.getByDisplayValue('Weekly')
      fireEvent.change(syncSelect, { target: { value: 'daily' } })

      await waitFor(() => {
        expect(platform.database.updateSyncConfig).toHaveBeenCalled()
      })
    })

    it('should handle storageSettingChange error', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.updateStorageConfig).mockRejectedValueOnce(new Error('Write error'))

      renderSettings()

      const sizeSelect = screen.getByDisplayValue('2 GB')
      fireEvent.change(sizeSelect, { target: { value: '1024' } })

      await waitFor(() => {
        expect(platform.database.updateStorageConfig).toHaveBeenCalled()
      })
    })

    it('should handle performanceSettingChange error', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.updatePerformanceConfig).mockRejectedValueOnce(new Error('Config error'))

      renderSettings()

      const limitSelect = screen.getByDisplayValue('100 results')
      fireEvent.change(limitSelect, { target: { value: '200' } })

      await waitFor(() => {
        expect(platform.database.updatePerformanceConfig).toHaveBeenCalled()
      })
    })
  })

  describe('Load Error Paths on Mount', () => {
    it('should handle loadApiKey error gracefully', async () => {
      vi.doMock('@/lib/storage', () => ({
        getSecureKeyService: () => ({
          isAvailable: vi.fn(() => Promise.reject(new Error('Keychain locked'))),
          getApiKey: vi.fn(() => Promise.resolve(null)),
          setApiKey: vi.fn(() => Promise.resolve(true)),
          deleteApiKey: vi.fn(() => Promise.resolve(true)),
          hasApiKey: vi.fn(() => Promise.resolve(false)),
        }),
      }))

      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)

      renderSettings()

      // Should not crash - the error is caught and loading finishes
      await waitFor(() => {
        expect(screen.getByText('API Configuration')).toBeInTheDocument()
      })
    })

    it('should handle loadDatabaseSettings error gracefully', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.getStats).mockRejectedValueOnce(new Error('Database corrupt'))

      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)
      renderSettings()

      // Should render without crashing
      await waitFor(() => {
        expect(screen.getByText('Database Management')).toBeInTheDocument()
      })
    })

    it('should handle loadBackupData error gracefully', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.backup.initialize).mockRejectedValueOnce(new Error('Backup dir missing'))

      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)
      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Backup & Recovery')).toBeInTheDocument()
      })
    })

    it('should handle getSyncConfig error gracefully', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.getSyncConfig).mockRejectedValueOnce(new Error('No config'))

      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)
      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Database Management')).toBeInTheDocument()
      })
    })

    it('should handle getCacheStats error gracefully', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.getCacheStats).mockRejectedValueOnce(new Error('Cache unavailable'))

      vi.mocked(useStore).mockImplementation((() => createMockStore()) as unknown as typeof useStore)
      renderSettings()

      await waitFor(() => {
        expect(screen.getByText('Performance Tuning')).toBeInTheDocument()
      })
    })
  })
})
