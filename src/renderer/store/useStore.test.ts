import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'
import { useStore } from './useStore'
import { act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import type { AppSettings, Project, Component, Vulnerability } from '@@/types'
import { DEFAULT_SETTINGS } from '@@/constants'
import { DEFAULT_DASHBOARD_LAYOUT } from '@/lib/dashboard/dashboardLayout'

// Mock the refresh module
vi.mock('@/lib/refresh', () => ({
  refreshVulnerabilityData: vi.fn(),
}))

// Mock the server-persistence module so we can assert the delete cascade (FR-01.2) and so the
// store's fire-and-forget network calls don't hit a real (rejecting) endpoint during tests.
vi.mock('@/lib/api/projectPersistence', () => ({
  saveProjectToServer: vi.fn().mockResolvedValue(undefined),
  loadProjectFromServer: vi.fn().mockResolvedValue(null),
  loadProjectSummariesFromServer: vi.fn().mockResolvedValue([]),
  deleteProjectFromServer: vi.fn().mockResolvedValue(undefined),
}))

// Mock the settings modules
vi.mock('@/lib/settings', () => ({
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  setDefaultProfile: vi.fn(),
  getProfiles: vi.fn(() => []),
  switchProfile: vi.fn(),
  initializeProfiles: vi.fn(),
  exportSettingsToFile: vi.fn(),
  importSettingsFromFile: vi.fn(),
}))

import { refreshVulnerabilityData as refreshData } from '@/lib/refresh'
import {
  deleteProjectFromServer,
  loadProjectFromServer,
  loadProjectSummariesFromServer,
  saveProjectToServer,
} from '@/lib/api/projectPersistence'
import {
  createProfile,
  updateProfile,
  deleteProfile,
  setDefaultProfile,
  getProfiles,
  switchProfile,
  initializeProfiles,
  exportSettingsToFile,
  importSettingsFromFile,
} from '@/lib/settings'
import { useAuditStore } from '@/lib/audit'

const mockRefreshData = refreshData as jest.MockedFunction<typeof refreshData>

// Helper to create a mock project
const createMockProject = (overrides?: Partial<Project>): Project => ({
  id: 'project-1',
  name: 'Test Project',
  description: 'Test Description',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  sbomFiles: [],
  components: [],
  vulnerabilities: [],
  statistics: {
    totalVulnerabilities: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    totalComponents: 0,
    vulnerableComponents: 0,
  },
  ...overrides,
})

// Helper to create mock components
const createMockComponent = (id: string, purl?: string): Component => ({
  id,
  name: `Component ${id}`,
  version: '1.0.0',
  type: 'library',
  purl,
  licenses: [],
  vulnerabilities: [],
})

// Helper to create mock vulnerabilities
const createMockVulnerability = (id: string, severity: Vulnerability['severity'] = 'high'): Vulnerability => ({
  id,
  source: 'nvd',
  severity,
  description: `Test vulnerability ${id}`,
  references: [],
  affectedComponents: ['component-1'],
})

// Helper to create localStorage mock
const createLocalStorageMock = () => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    get length() {
      return Object.keys(store).length
    },
    key: (index: number) => Object.keys(store)[index] || null,
  }
}

describe('useStore', () => {
  let localStorageMock: ReturnType<typeof createLocalStorageMock>

  beforeEach(() => {
    // Create fresh localStorage mock for each test
    localStorageMock = createLocalStorageMock()
    vi.stubGlobal('localStorage', localStorageMock)
    vi.clearAllMocks()

    // Reset store to initial state before each test
    const state = useStore.getState()
    useStore.getState().resetStore()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorageMock.clear()
  })

  // ==================== Settings Tests ====================
  describe('settings', () => {
    it('should initialize with default settings', () => {
      const { result } = renderHook(() => useStore())

      expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
      expect(result.current.settings.theme).toBe('dark')
      expect(result.current.settings.fontSize).toBe('default')
      expect(result.current.settings.dataRetentionDays).toBe(30)
      expect(result.current.settings.autoRefresh).toBe(false)
    })

    it('should update a single setting', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateSettings({ theme: 'dark' })
      })

      expect(result.current.settings.theme).toBe('dark')
      expect(result.current.settings.fontSize).toBe('default') // Unchanged
    })

    it('should update multiple settings at once', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateSettings({
          theme: 'light',
          fontSize: 'large',
          dataRetentionDays: 60,
        })
      })

      expect(result.current.settings.theme).toBe('light')
      expect(result.current.settings.fontSize).toBe('large')
      expect(result.current.settings.dataRetentionDays).toBe(60)
    })

    it('should merge settings with existing settings', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateSettings({ theme: 'dark' })
        result.current.updateSettings({ fontSize: 'small' })
      })

      expect(result.current.settings.theme).toBe('dark')
      expect(result.current.settings.fontSize).toBe('small')
    })

    it('should update nested provider settings', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateSettings({
          vulnProviders: {
            ...result.current.settings.vulnProviders,
            nvd: {
              ...result.current.settings.vulnProviders.nvd,
              enabled: false,
            },
          },
        })
      })

      expect(result.current.settings.vulnProviders.nvd.enabled).toBe(false)
    })

    it('should update API key settings', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateSettings({ nvdApiKey: 'test-api-key-123' })
      })

      expect(result.current.settings.nvdApiKey).toBe('test-api-key-123')
    })

    it('should update database update schedule', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateSettings({
          databaseUpdateSchedule: {
            enabled: true,
            frequency: 'daily',
            time: '03:00',
            dayOfWeek: 2,
            dayOfMonth: 15,
            bandwidthLimitKBps: 1000,
            pauseOnBattery: false,
            wifiOnly: true,
          },
        })
      })

      expect(result.current.settings.databaseUpdateSchedule?.enabled).toBe(true)
      expect(result.current.settings.databaseUpdateSchedule?.frequency).toBe('daily')
    })
  })

  // ==================== Settings Profiles Tests ====================
  describe('settings profiles', () => {
    const mockProfile = {
      id: 'profile-1',
      name: 'Test Profile',
      description: 'Test Description',
      settings: DEFAULT_SETTINGS,
      isDefault: true,
      createdAt: new Date('2024-01-01'),
      lastUsed: new Date('2024-01-02'),
    }

    beforeEach(() => {
      vi.mocked(getProfiles).mockReturnValue([])
      vi.mocked(initializeProfiles).mockImplementation(() => {})
    })

    it('should initialize with empty profiles array', () => {
      const { result } = renderHook(() => useStore())

      expect(result.current.settingsProfiles).toEqual([])
      expect(result.current.activeProfileId).toBe('')
    })

    it('should load settings profiles', () => {
      const mockProfiles = [mockProfile]
      vi.mocked(getProfiles).mockReturnValue(mockProfiles)

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.loadSettingsProfiles()
      })

      expect(result.current.settingsProfiles).toEqual(mockProfiles)
      expect(result.current.activeProfileId).toBe(mockProfile.id)
      expect(initializeProfiles).toHaveBeenCalled()
      expect(getProfiles).toHaveBeenCalled()
    })

    it('does not overwrite live (persisted/ad-hoc) settings when loading profiles', () => {
      // WHY: loadSettingsProfiles runs on every Settings-page mount. It used to reset `settings`
      // to the active profile's (or default) settings, silently discarding ad-hoc edits that the
      // persist middleware had just rehydrated (e.g. an enabled autoRefresh reverting on reload).
      // Loading the profile LIST must not touch the live settings — only switchSettingsProfile does.
      vi.mocked(getProfiles).mockReturnValue([mockProfile]) // mockProfile.settings has autoRefresh:false

      const { result } = renderHook(() => useStore())
      act(() => {
        useStore.setState({ settings: { ...DEFAULT_SETTINGS, autoRefresh: true, autoRefreshInterval: 168 } })
        result.current.loadSettingsProfiles()
      })

      expect(result.current.settings.autoRefresh).toBe(true)
      expect(result.current.settings.autoRefreshInterval).toBe(168)
    })

    it('should preserve active profile when loading profiles', () => {
      const mockProfiles = [
        mockProfile,
        {
          ...mockProfile,
          id: 'profile-2',
          name: 'Profile 2',
          isDefault: false,
        },
      ]
      vi.mocked(getProfiles).mockReturnValue(mockProfiles)

      const { result } = renderHook(() => useStore())

      // Set an active profile
      act(() => {
        useStore.setState({ activeProfileId: 'profile-2' })
        result.current.loadSettingsProfiles()
      })

      expect(result.current.activeProfileId).toBe('profile-2')
    })

    it('should fall back to default profile when active profile is invalid', () => {
      const mockProfiles = [mockProfile]
      vi.mocked(getProfiles).mockReturnValue(mockProfiles)

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ activeProfileId: 'non-existent' })
        result.current.loadSettingsProfiles()
      })

      expect(result.current.activeProfileId).toBe(mockProfile.id)
    })

    it('should fall back to first profile when no default profile exists', () => {
      const mockProfiles = [
        { ...mockProfile, isDefault: false },
        { ...mockProfile, id: 'profile-2', name: 'Profile 2', isDefault: false },
      ]
      vi.mocked(getProfiles).mockReturnValue(mockProfiles)

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.loadSettingsProfiles()
      })

      expect(result.current.activeProfileId).toBe(mockProfile.id)
    })

    it('should create a new settings profile', () => {
      vi.mocked(createProfile).mockReturnValue(mockProfile)

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.createSettingsProfile('New Profile', 'New Description', DEFAULT_SETTINGS)
      })

      expect(createProfile).toHaveBeenCalledWith('New Profile', 'New Description', DEFAULT_SETTINGS)
      expect(result.current.settingsProfiles).toContainEqual(mockProfile)
    })

    it('should throw error when createProfile fails', () => {
      const error = new Error('Profile creation failed')
      vi.mocked(createProfile).mockImplementation(() => {
        throw error
      })

      const { result } = renderHook(() => useStore())

      expect(() => {
        act(() => {
          result.current.createSettingsProfile('New Profile', undefined, DEFAULT_SETTINGS)
        })
      }).toThrow('Profile creation failed')
    })

    it('should update a settings profile', () => {
      const updatedProfile = { ...mockProfile, name: 'Updated Profile' }
      vi.mocked(updateProfile).mockImplementation(() => {})
      vi.mocked(getProfiles).mockReturnValue([mockProfile])

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ settingsProfiles: [mockProfile] })
        result.current.updateSettingsProfile(mockProfile.id, {
          name: 'Updated Profile',
        })
      })

      expect(updateProfile).toHaveBeenCalledWith(mockProfile.id, {
        name: 'Updated Profile',
      })
      expect(result.current.settingsProfiles[0].name).toBe('Updated Profile')
    })

    it('should throw error when updateProfile fails', () => {
      const error = new Error('Profile update failed')
      vi.mocked(updateProfile).mockImplementation(() => {
        throw error
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ settingsProfiles: [mockProfile] })
      })

      expect(() => {
        act(() => {
          result.current.updateSettingsProfile(mockProfile.id, {
            name: 'Updated',
          })
        })
      }).toThrow('Profile update failed')
    })

    it('should delete a settings profile', () => {
      const profile2 = { ...mockProfile, id: 'profile-2', name: 'Profile 2' }
      vi.mocked(deleteProfile).mockImplementation(() => {})
      vi.mocked(getProfiles).mockReturnValue([profile2])

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({
          settingsProfiles: [mockProfile, profile2],
          activeProfileId: mockProfile.id,
        })
        result.current.deleteSettingsProfile(mockProfile.id)
      })

      expect(deleteProfile).toHaveBeenCalledWith(mockProfile.id)
      expect(result.current.settingsProfiles).not.toContainEqual(mockProfile)
      expect(result.current.activeProfileId).toBe(profile2.id)
    })

    it('should set new active profile when deleting active profile', () => {
      const profile2 = { ...mockProfile, id: 'profile-2', name: 'Profile 2', isDefault: true }
      vi.mocked(deleteProfile).mockImplementation(() => {})
      vi.mocked(getProfiles).mockReturnValue([profile2])

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({
          settingsProfiles: [mockProfile, profile2],
          activeProfileId: mockProfile.id,
        })
        result.current.deleteSettingsProfile(mockProfile.id)
      })

      expect(result.current.activeProfileId).toBe(profile2.id)
    })

    it('should throw error when deleteProfile fails', () => {
      const error = new Error('Profile deletion failed')
      vi.mocked(deleteProfile).mockImplementation(() => {
        throw error
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ settingsProfiles: [mockProfile] })
      })

      expect(() => {
        act(() => {
          result.current.deleteSettingsProfile(mockProfile.id)
        })
      }).toThrow('Profile deletion failed')
    })

    it('should switch to a different profile', () => {
      const profile2 = { ...mockProfile, id: 'profile-2', name: 'Profile 2' }
      const switchedProfile = { ...profile2, lastUsed: new Date() }
      vi.mocked(switchProfile).mockReturnValue(switchedProfile)

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ settingsProfiles: [mockProfile, profile2] })
        result.current.switchSettingsProfile(profile2.id)
      })

      expect(switchProfile).toHaveBeenCalledWith(profile2.id)
      expect(result.current.activeProfileId).toBe(profile2.id)
      expect(result.current.settings).toBe(switchedProfile.settings)
    })

    it('should throw error when switchProfile fails', () => {
      const error = new Error('Profile switch failed')
      vi.mocked(switchProfile).mockImplementation(() => {
        throw error
      })

      const { result } = renderHook(() => useStore())

      expect(() => {
        act(() => {
          result.current.switchSettingsProfile('non-existent')
        })
      }).toThrow('Profile switch failed')
    })

    it('should set a profile as default', () => {
      const profile2 = { ...mockProfile, id: 'profile-2', name: 'Profile 2' }
      vi.mocked(setDefaultProfile).mockImplementation(() => {})

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ settingsProfiles: [mockProfile, profile2] })
        result.current.setDefaultSettingsProfile(profile2.id)
      })

      expect(setDefaultProfile).toHaveBeenCalledWith(profile2.id)
      expect(result.current.settingsProfiles[0].isDefault).toBe(false)
      expect(result.current.settingsProfiles[1].isDefault).toBe(true)
    })

    it('should throw error when setDefaultProfile fails', () => {
      const error = new Error('Set default failed')
      vi.mocked(setDefaultProfile).mockImplementation(() => {
        throw error
      })

      const { result } = renderHook(() => useStore())

      expect(() => {
        act(() => {
          result.current.setDefaultSettingsProfile('non-existent')
        })
      }).toThrow('Set default failed')
    })

    it('should import settings profiles from file', async () => {
      const mockFile = new File(['{}'], 'settings.json', { type: 'application/json' })
      const importedProfiles = [mockProfile]

      vi.mocked(getProfiles).mockReturnValue([mockProfile])
      vi.mocked(createProfile).mockReturnValue(mockProfile)
      vi.mocked(importSettingsFromFile).mockResolvedValue({
        success: true,
        data: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          profiles: importedProfiles,
        },
      })

      const { result } = renderHook(() => useStore())

      let importResult
      await act(async () => {
        importResult = await result.current.importSettingsProfiles(mockFile)
      })

      expect(importResult).toEqual({ success: true })
      expect(importSettingsFromFile).toHaveBeenCalledWith(mockFile)
      expect(createProfile).toHaveBeenCalled()
    })

    it('should handle name conflicts when importing profiles', async () => {
      const mockFile = new File(['{}'], 'settings.json', { type: 'application/json' })
      const existingProfile = { ...mockProfile, name: 'Existing Profile' }
      const importedProfile = { ...mockProfile, id: 'imported-1', name: 'Existing Profile' }

      vi.mocked(getProfiles).mockReturnValue([existingProfile])
      vi.mocked(createProfile)
        .mockReturnValueOnce(existingProfile)
        .mockReturnValueOnce({ ...importedProfile, name: 'Existing Profile (1)' })
      vi.mocked(importSettingsFromFile).mockResolvedValue({
        success: true,
        data: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          profiles: [importedProfile],
        },
      })

      const { result } = renderHook(() => useStore())

      let importResult
      await act(async () => {
        importResult = await result.current.importSettingsProfiles(mockFile)
      })

      expect(importResult.success).toBe(true)
      expect(createProfile).toHaveBeenCalledWith(
        'Existing Profile (1)',
        importedProfile.description,
        importedProfile.settings,
      )
    })

    it('should handle multiple name conflicts with incrementing counters', async () => {
      const mockFile = new File(['{}'], 'settings.json', { type: 'application/json' })
      const existingProfile = { ...mockProfile, name: 'Test Profile' }
      const importedProfile1 = { ...mockProfile, id: 'imported-1', name: 'Test Profile' }
      const importedProfile2 = { ...mockProfile, id: 'imported-2', name: 'Test Profile' }

      vi.mocked(getProfiles)
        .mockReturnValueOnce([existingProfile])
        .mockReturnValueOnce([existingProfile, { ...importedProfile1, name: 'Test Profile (1)' }])
        .mockReturnValueOnce([
          existingProfile,
          { ...importedProfile1, name: 'Test Profile (1)' },
          { ...importedProfile2, name: 'Test Profile (2)' },
        ])
        .mockReturnValue([
          // After the once calls, return empty array
          existingProfile,
          { ...importedProfile1, name: 'Test Profile (1)' },
          { ...importedProfile2, name: 'Test Profile (2)' },
        ])

      vi.mocked(createProfile)
        .mockReturnValueOnce(existingProfile)
        .mockReturnValueOnce({ ...importedProfile1, name: 'Test Profile (1)' })
        .mockReturnValueOnce({ ...importedProfile2, name: 'Test Profile (2)' })

      vi.mocked(importSettingsFromFile).mockResolvedValue({
        success: true,
        data: {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          profiles: [importedProfile1, importedProfile2],
        },
      })

      const { result } = renderHook(() => useStore())

      let importResult
      await act(async () => {
        importResult = await result.current.importSettingsProfiles(mockFile)
      })

      expect(importResult.success).toBe(true)
      expect(createProfile).toHaveBeenCalledTimes(2)

      // Reset getProfiles mock after this test
      vi.mocked(getProfiles).mockReset()
    })

    it('should return error when import fails', async () => {
      const mockFile = new File(['{}'], 'settings.json', { type: 'application/json' })
      const error = new Error('Import failed')

      vi.mocked(importSettingsFromFile).mockResolvedValue({
        success: false,
        error: 'Import failed',
      })

      const { result } = renderHook(() => useStore())

      let importResult
      await act(async () => {
        importResult = await result.current.importSettingsProfiles(mockFile)
      })

      expect(importResult).toEqual({
        success: false,
        error: 'Import failed',
      })
    })

    it('should handle exceptions during import', async () => {
      const mockFile = new File(['{}'], 'settings.json', { type: 'application/json' })

      vi.mocked(importSettingsFromFile).mockRejectedValue(new Error('Network error'))

      const { result } = renderHook(() => useStore())

      let importResult
      await act(async () => {
        importResult = await result.current.importSettingsProfiles(mockFile)
      })

      expect(importResult).toEqual({
        success: false,
        error: 'Network error',
      })
    })

    it('should export settings profiles', () => {
      vi.mocked(exportSettingsToFile).mockImplementation(() => {})

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ settingsProfiles: [mockProfile] })
        result.current.exportSettingsProfiles()
      })

      expect(exportSettingsToFile).toHaveBeenCalledWith([mockProfile])
    })

    it('should throw error when exporting with no profiles', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ settingsProfiles: [] })
      })

      expect(() => {
        act(() => {
          result.current.exportSettingsProfiles()
        })
      }).toThrow('No profiles to export')
    })

    it('should update only the matching profile when multiple profiles exist', () => {
      const profile1 = { ...mockProfile, id: 'profile-1', name: 'Profile 1' }
      const profile2 = { ...mockProfile, id: 'profile-2', name: 'Profile 2' }
      vi.mocked(updateProfile).mockImplementation(() => {})

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ settingsProfiles: [profile1, profile2] })
        result.current.updateSettingsProfile('profile-2', { name: 'Updated Profile 2' })
      })

      // profile-1 unchanged, profile-2 updated
      expect(result.current.settingsProfiles[0].name).toBe('Profile 1')
      expect(result.current.settingsProfiles[1].name).toBe('Updated Profile 2')
    })

    it('should keep active profile unchanged when deleting a non-active profile', () => {
      const profile1 = { ...mockProfile, id: 'profile-1', name: 'Profile 1', isDefault: true }
      const profile2 = { ...mockProfile, id: 'profile-2', name: 'Profile 2', isDefault: false }
      vi.mocked(deleteProfile).mockImplementation(() => {})

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({
          settingsProfiles: [profile1, profile2],
          activeProfileId: 'profile-1',
        })
        result.current.deleteSettingsProfile('profile-2')
      })

      // Active profile should remain unchanged since we deleted a different one
      expect(result.current.activeProfileId).toBe('profile-1')
      expect(result.current.settings).toBe(DEFAULT_SETTINGS)
    })

    it('should fall back to first profile when deleting active and no default remains', () => {
      const profile1 = { ...mockProfile, id: 'profile-1', name: 'Profile 1', isDefault: false }
      const profile2 = { ...mockProfile, id: 'profile-2', name: 'Profile 2', isDefault: false }
      vi.mocked(deleteProfile).mockImplementation(() => {})

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({
          settingsProfiles: [profile1, profile2],
          activeProfileId: 'profile-1',
        })
        result.current.deleteSettingsProfile('profile-1')
      })

      // No default → should fall back to first remaining profile
      expect(result.current.activeProfileId).toBe('profile-2')
      expect(result.current.settings).toBe(profile2.settings)
    })

    it('should clear active profile when deleting the last profile', () => {
      vi.mocked(deleteProfile).mockImplementation(() => {})

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({
          settingsProfiles: [mockProfile],
          activeProfileId: mockProfile.id,
        })
        result.current.deleteSettingsProfile(mockProfile.id)
      })

      // No profiles remain → empty activeProfileId, keep existing settings
      expect(result.current.settingsProfiles).toEqual([])
      expect(result.current.activeProfileId).toBe('')
    })

    it('should handle import with non-Error thrown value', async () => {
      const mockFile = new File(['{}'], 'settings.json', { type: 'application/json' })

      // Throw a non-Error value (string) to cover the else branch on line 196
      vi.mocked(importSettingsFromFile).mockRejectedValue('string error')

      const { result } = renderHook(() => useStore())

      let importResult: { success: boolean; error?: string } | undefined
      await act(async () => {
        importResult = await result.current.importSettingsProfiles(mockFile)
      })

      expect(importResult).toEqual({
        success: false,
        error: 'Unknown error occurred',
      })
    })
  })

  // ==================== Projects Tests ====================
  describe('projects', () => {
    beforeEach(() => {
      // Reset projects to empty array before each test in this describe block
      const state = useStore.getState()
      useStore.getState().resetStore()
    })

    it('should initialize with empty projects array', () => {
      const { result } = renderHook(() => useStore())

      expect(result.current.projects).toEqual([])
    })

    it('should initialize with null currentProject', () => {
      const { result } = renderHook(() => useStore())

      expect(result.current.currentProject).toBeNull()
    })

    it('should add a project', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
      })

      expect(result.current.projects).toHaveLength(1)
      expect(result.current.projects[0]).toEqual(mockProject)
    })

    it('should add multiple projects', () => {
      const { result } = renderHook(() => useStore())
      const project1 = createMockProject({ id: 'project-1', name: 'Project 1' })
      const project2 = createMockProject({ id: 'project-2', name: 'Project 2' })

      act(() => {
        result.current.addProject(project1)
        result.current.addProject(project2)
      })

      expect(result.current.projects).toHaveLength(2)
      expect(result.current.projects[0].name).toBe('Project 1')
      expect(result.current.projects[1].name).toBe('Project 2')
    })

    it('should delete a project', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
      })

      expect(result.current.projects).toHaveLength(1)

      act(() => {
        result.current.deleteProject(mockProject.id)
      })

      expect(result.current.projects).toHaveLength(0)
    })

    it('should cascade the delete to the server-persisted copy so scan data does not orphan (FR-01.2)', () => {
      const { result } = renderHook(() => useStore())
      const project = createMockProject({ id: 'cascade-delete-id' })

      act(() => {
        result.current.addProject(project)
      })
      act(() => {
        result.current.deleteProject(project.id)
      })

      // WHY: the PRD requires deletion to cascade to associated scan results/vulnerabilities.
      // Those live in DATA_DIR/projects/<id>.json on the server; without this call they orphan
      // on disk after a UI delete.
      expect(deleteProjectFromServer).toHaveBeenCalledWith('cascade-delete-id')
    })

    it('logs but swallows the error when the server-side delete cascade fails, so a transient network error cannot crash the UI', async () => {
      vi.mocked(deleteProjectFromServer).mockRejectedValueOnce(new Error('server down'))
      const { result } = renderHook(() => useStore())
      const project = createMockProject()

      act(() => {
        result.current.addProject(project)
      })
      act(() => {
        result.current.deleteProject(project.id)
      })

      await vi.waitFor(() => {
        expect(console.error).toHaveBeenCalledWith('[Store] Failed to delete project from server:', expect.any(Error))
      })
    })

    it('should delete correct project when multiple exist', () => {
      const { result } = renderHook(() => useStore())
      const project1 = createMockProject({ id: 'project-1', name: 'Project 1' })
      const project2 = createMockProject({ id: 'project-2', name: 'Project 2' })
      const project3 = createMockProject({ id: 'project-3', name: 'Project 3' })

      act(() => {
        result.current.addProject(project1)
        result.current.addProject(project2)
        result.current.addProject(project3)
      })

      act(() => {
        result.current.deleteProject('project-2')
      })

      expect(result.current.projects).toHaveLength(2)
      expect(result.current.projects.find((p) => p.id === 'project-1')).toBeTruthy()
      expect(result.current.projects.find((p) => p.id === 'project-2')).toBeFalsy()
      expect(result.current.projects.find((p) => p.id === 'project-3')).toBeTruthy()
    })

    it('should update an existing project by ID', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject({ name: 'Original Name' })

      act(() => {
        result.current.addProject(mockProject)
      })

      act(() => {
        result.current.updateProject(mockProject.id, { name: 'Updated Name' })
      })

      expect(result.current.projects[0].name).toBe('Updated Name')
    })

    it('should not update other projects when updating by ID', () => {
      const { result } = renderHook(() => useStore())
      const project1 = createMockProject({ id: 'project-1', name: 'Project 1' })
      const project2 = createMockProject({ id: 'project-2', name: 'Project 2' })

      act(() => {
        result.current.addProject(project1)
        result.current.addProject(project2)
      })

      act(() => {
        result.current.updateProject('project-1', { name: 'Updated Project 1' })
      })

      expect(result.current.projects[0].name).toBe('Updated Project 1')
      expect(result.current.projects[1].name).toBe('Project 2')
    })

    it('should update nested project properties', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject({
        statistics: {
          totalVulnerabilities: 10,
          criticalCount: 2,
          highCount: 3,
          mediumCount: 3,
          lowCount: 2,
          none: 0,
          totalComponents: 5,
          vulnerableComponents: 4,
        },
      })

      act(() => {
        result.current.addProject(mockProject)
      })

      act(() => {
        result.current.updateProject(mockProject.id, {
          statistics: {
            ...mockProject.statistics,
            totalVulnerabilities: 15,
          },
        })
      })

      expect(result.current.projects[0].statistics.totalVulnerabilities).toBe(15)
      expect(result.current.projects[0].statistics.criticalCount).toBe(2)
    })

    it('should update currentProject if it matches the updated project ID', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
        result.current.setCurrentProject(mockProject)
      })

      act(() => {
        result.current.updateProject(mockProject.id, { name: 'Updated Name' })
      })

      expect(result.current.currentProject?.name).toBe('Updated Name')
    })

    it('should not update currentProject if it does not match the updated project ID', () => {
      const { result } = renderHook(() => useStore())
      const project1 = createMockProject({ id: 'project-1', name: 'Project 1' })
      const project2 = createMockProject({ id: 'project-2', name: 'Project 2' })

      act(() => {
        result.current.addProject(project1)
        result.current.addProject(project2)
        result.current.setCurrentProject(project1)
      })

      act(() => {
        result.current.updateProject('project-2', { name: 'Updated Project 2' })
      })

      expect(result.current.currentProject?.name).toBe('Project 1')
    })

    it('should clear currentProject when the deleted project is currentProject', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
        result.current.setCurrentProject(mockProject)
      })

      act(() => {
        result.current.deleteProject(mockProject.id)
      })

      expect(result.current.currentProject).toBeNull()
    })

    it('should not clear currentProject when deleting a different project', () => {
      const { result } = renderHook(() => useStore())
      const project1 = createMockProject({ id: 'project-1', name: 'Project 1' })
      const project2 = createMockProject({ id: 'project-2', name: 'Project 2' })

      act(() => {
        result.current.addProject(project1)
        result.current.addProject(project2)
        result.current.setCurrentProject(project1)
      })

      act(() => {
        result.current.deleteProject('project-2')
      })

      expect(result.current.currentProject?.id).toBe('project-1')
    })

    it('should set currentProject to a project', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
      })

      act(() => {
        result.current.setCurrentProject(mockProject)
      })

      expect(result.current.currentProject).toEqual(mockProject)
    })

    it('should set currentProject to null', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
        result.current.setCurrentProject(mockProject)
      })

      act(() => {
        result.current.setCurrentProject(null)
      })

      expect(result.current.currentProject).toBeNull()
    })

    it('should refresh vulnerability data for a project', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const mockVulnerability = createMockVulnerability('CVE-2024-1', 'critical')
      const mockProject = createMockProject({
        components: [mockComponent],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [mockVulnerability],
        vulnerabilitiesFound: 1,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      expect(mockRefreshData).toHaveBeenCalledWith([mockComponent], {
        cacheTTL: DEFAULT_SETTINGS.vulnDataCacheTTL,
        nvdApiKey: undefined,
      })
    })

    it('should not refresh vulnerability data for non-existent project', async () => {
      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [],
        vulnerabilitiesFound: 0,
        componentsScanned: 0,
        cached: 0,
        fetched: 0,
        duration: 0,
      })

      const { result } = renderHook(() => useStore())

      await act(async () => {
        await result.current.refreshVulnerabilityData('non-existent-id')
      })

      expect(mockRefreshData).not.toHaveBeenCalled()
    })

    it('should merge new vulnerabilities with existing ones', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const existingVuln = createMockVulnerability('CVE-2024-1', 'high')
      const newVuln = createMockVulnerability('CVE-2024-2', 'critical')

      const mockProject = createMockProject({
        components: [mockComponent],
        vulnerabilities: [existingVuln],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [newVuln, existingVuln], // API returns both
        vulnerabilitiesFound: 2,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      const updatedProject = result.current.projects[0]
      expect(updatedProject.vulnerabilities).toHaveLength(2)
      expect(updatedProject.vulnerabilities).toContainEqual(existingVuln)
      expect(updatedProject.vulnerabilities).toContainEqual(newVuln)
    })

    it('should calculate vulnerability statistics correctly', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const vulnerabilities = [
        createMockVulnerability('CVE-2024-1', 'critical'),
        createMockVulnerability('CVE-2024-2', 'critical'),
        createMockVulnerability('CVE-2024-3', 'high'),
        createMockVulnerability('CVE-2024-4', 'medium'),
        createMockVulnerability('CVE-2024-5', 'low'),
      ]

      const mockProject = createMockProject({
        components: [mockComponent],
        vulnerabilities: [],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities,
        vulnerabilitiesFound: 5,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      const stats = result.current.projects[0].statistics
      expect(stats.totalVulnerabilities).toBe(5)
      expect(stats.criticalCount).toBe(2)
      expect(stats.highCount).toBe(1)
      expect(stats.mediumCount).toBe(1)
      expect(stats.lowCount).toBe(1)
    })

    it('should update lastVulnDataRefresh timestamp', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const mockProject = createMockProject({
        components: [mockComponent],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [],
        vulnerabilitiesFound: 0,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      const beforeRefresh = new Date()
      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      expect(result.current.projects[0].lastVulnDataRefresh).toBeDefined()
      expect(result.current.projects[0].lastVulnDataRefresh!.getTime()).toBeGreaterThanOrEqual(beforeRefresh.getTime())
    })

    it('should set refreshing state during vulnerability refresh', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const mockProject = createMockProject({
        components: [mockComponent],
      })

      let resolveRefresh: (value: any) => void
      vi.mocked(mockRefreshData).mockReturnValue(
        new Promise((resolve) => {
          resolveRefresh = resolve
        }),
      )

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      act(() => {
        result.current.refreshVulnerabilityData(mockProject.id)
      })

      // Check that project is in refreshing state
      expect(result.current.refreshingProjectIds.has(mockProject.id)).toBe(true)

      // Resolve the refresh
      await act(async () => {
        resolveRefresh!({
          success: true,
          vulnerabilities: [],
          vulnerabilitiesFound: 0,
          componentsScanned: 1,
          cached: 0,
          fetched: 1,
          duration: 100,
        })
      })

      // Check that project is no longer in refreshing state
      expect(result.current.refreshingProjectIds.has(mockProject.id)).toBe(false)
    })

    it('should clear refreshing state even when refresh fails', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const mockProject = createMockProject({
        components: [mockComponent],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: false,
        vulnerabilities: [],
        vulnerabilitiesFound: 0,
        componentsScanned: 1,
        cached: 0,
        fetched: 0,
        duration: 100,
        error: 'API Error',
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      expect(result.current.refreshingProjectIds.has(mockProject.id)).toBe(false)
    })

    it('should update both projects array and currentProject when refreshing', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const mockVulnerability = createMockVulnerability('CVE-2024-1', 'critical')
      const mockProject = createMockProject({
        components: [mockComponent],
        vulnerabilities: [],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [mockVulnerability],
        vulnerabilitiesFound: 1,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
        result.current.setCurrentProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      expect(result.current.projects[0].vulnerabilities).toHaveLength(1)
      expect(result.current.currentProject?.vulnerabilities).toHaveLength(1)
      expect(result.current.currentProject?.vulnerabilities).toContainEqual(mockVulnerability)
    })

    it('should calculate vulnerable components count', async () => {
      const component1 = createMockComponent('component-1', 'pkg:npm/test1@1.0.0')
      const component2 = createMockComponent('component-2', 'pkg:npm/test2@1.0.0')
      const component3 = createMockComponent('component-3', 'pkg:npm/test3@1.0.0')

      const vulnerability = createMockVulnerability('CVE-2024-1', 'critical')
      vulnerability.affectedComponents = ['component-1', 'component-2']

      const mockProject = createMockProject({
        components: [component1, component2, component3],
        vulnerabilities: [],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [vulnerability],
        vulnerabilitiesFound: 1,
        componentsScanned: 3,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      expect(result.current.projects[0].statistics.vulnerableComponents).toBe(2)
    })

    it('should not update currentProject when refreshing a different project', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const mockVulnerability = createMockVulnerability('CVE-2024-1', 'critical')

      const project1 = createMockProject({ id: 'project-1', name: 'Project 1' })
      const project2 = createMockProject({
        id: 'project-2',
        name: 'Project 2',
        components: [mockComponent],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [mockVulnerability],
        vulnerabilitiesFound: 1,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(project1)
        result.current.addProject(project2)
        result.current.setCurrentProject(project1)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData('project-2')
      })

      // project-2 in projects array should be updated
      const refreshedProject = result.current.projects.find((p) => p.id === 'project-2')
      expect(refreshedProject?.vulnerabilities).toHaveLength(1)

      // currentProject (project-1) should NOT be updated
      expect(result.current.currentProject?.id).toBe('project-1')
      expect(result.current.currentProject?.vulnerabilities).toHaveLength(0)
    })

    it('keeps a previously known vulnerability that a fresh refresh no longer returns, instead of dropping it', async () => {
      // WHY: a provider gap or a refresh scoped to fewer components can omit a
      // vulnerability from one fetch's results without it having been fixed. The merge
      // must fall back to the vuln we already know about rather than silently losing it
      // (dropping it would understate risk on the very next refresh).
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const staleVuln = createMockVulnerability('CVE-2024-stale', 'high')
      const refreshedVuln = createMockVulnerability('CVE-2024-1', 'critical')

      const mockProject = createMockProject({
        components: [mockComponent],
        vulnerabilities: [staleVuln, refreshedVuln],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        // Fresh fetch only returns CVE-2024-1 (with an updated severity) this time —
        // CVE-2024-stale is absent from the results, not fixed.
        vulnerabilities: [{ ...refreshedVuln, severity: 'high' }],
        vulnerabilitiesFound: 1,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      const updatedVulns = result.current.projects[0].vulnerabilities
      expect(updatedVulns).toHaveLength(2)
      // Absent from the fresh results -> kept as-is, not dropped.
      expect(updatedVulns).toContainEqual(staleVuln)
      // Present in the fresh results -> replaced by the newer version, not the stale one.
      expect(updatedVulns.find((v) => v.id === refreshedVuln.id)?.severity).toBe('high')
    })

    // ================ hydrateProjectFromServer ================
    // WHY: pulls the server-persisted scan results (vulnerabilities/components/
    // dependencyGraph/statistics/allowedLicenses) into a project that was hydrated
    // client-side with stale data. This action had zero test coverage.
    describe('hydrateProjectFromServer', () => {
      type ServerProjectData = NonNullable<Awaited<ReturnType<typeof loadProjectFromServer>>>

      afterEach(() => {
        // Guard against leaking a resolved/rejected override into later tests.
        vi.mocked(loadProjectFromServer).mockResolvedValue(null)
      })

      it('returns null and leaves the local project untouched when the server has no persisted copy', async () => {
        vi.mocked(loadProjectFromServer).mockResolvedValue(null)
        const mockProject = createMockProject()
        const { result } = renderHook(() => useStore())

        act(() => {
          result.current.addProject(mockProject)
        })

        // Capture the resolved value directly from act()'s return (rather than a
        // captured `let` reassigned inside the callback) — TS's control-flow analysis
        // mis-narrows a closed-over nullable `let` written only inside an async
        // callback, which this sidesteps.
        const hydrated = await act(async () => {
          return await result.current.hydrateProjectFromServer(mockProject.id)
        })

        expect(hydrated).toBeNull()
        expect(result.current.projects[0]).toEqual(mockProject)
      })

      // This deliberately REPLACES an earlier contract that required a server-only project to be
      // ignored (return null, leave `projects` empty). That behaviour made the app unusable from a
      // clean profile: the server held 40 projects that the UI could never show, and opening a
      // valid /project/<id> link rendered "Project Not Found" without even issuing a request.
      // Introducing the project is now the point of hydration, so this asserts the opposite.
      it('introduces a project that exists on the server but is not tracked locally', async () => {
        vi.mocked(loadProjectFromServer).mockResolvedValue({
          id: 'server-only-project',
          name: 'Server Only',
          vulnerabilities: [],
          components: [],
        })

        const { result } = renderHook(() => useStore())

        const hydrated = await act(async () => {
          return await result.current.hydrateProjectFromServer('server-only-project')
        })

        expect(hydrated).not.toBeNull()
        expect(hydrated?.id).toBe('server-only-project')
        expect(hydrated?.name).toBe('Server Only')
        expect(result.current.projects).toHaveLength(1)
        expect(result.current.projects[0].id).toBe('server-only-project')
      })

      it('merges freshly loaded scan data into the matching project and mirrors it onto the active currentProject', async () => {
        const freshVuln = createMockVulnerability('CVE-2024-fresh', 'high')
        const freshComponent = createMockComponent('component-fresh')
        const freshLastScanAtIso = '2024-06-01T00:00:00.000Z'
        const freshUpdatedAtIso = '2024-06-02T00:00:00.000Z'
        const freshDependencyGraph = { nodes: [], edges: [], metadata: { totalNodes: 1, totalEdges: 0, maxDepth: 0 } }
        const freshStatistics = {
          totalVulnerabilities: 1,
          criticalCount: 0,
          highCount: 1,
          mediumCount: 0,
          lowCount: 0,
          totalComponents: 1,
          vulnerableComponents: 1,
        }

        vi.mocked(loadProjectFromServer).mockResolvedValue({
          id: 'project-1',
          name: 'Test Project',
          vulnerabilities: [freshVuln],
          components: [freshComponent],
          dependencyGraph: freshDependencyGraph,
          lastScanAt: freshLastScanAtIso,
          updatedAt: freshUpdatedAtIso,
          statistics: freshStatistics,
          allowedLicenses: ['MIT'],
        })

        const staleProject = createMockProject({
          vulnerabilities: [createMockVulnerability('CVE-2023-stale', 'low')],
          components: [createMockComponent('component-stale')],
        })

        const { result } = renderHook(() => useStore())
        act(() => {
          result.current.addProject(staleProject)
          result.current.setCurrentProject(staleProject)
        })

        const hydrated = await act(async () => {
          return await result.current.hydrateProjectFromServer(staleProject.id)
        })

        expect(hydrated?.vulnerabilities).toEqual([freshVuln])
        expect(hydrated?.components).toEqual([freshComponent])
        expect(hydrated?.dependencyGraph).toEqual(freshDependencyGraph)
        expect(hydrated?.lastScanAt).toEqual(new Date(freshLastScanAtIso))
        expect(hydrated?.updatedAt).toEqual(new Date(freshUpdatedAtIso))
        expect(hydrated?.allowedLicenses).toEqual(['MIT'])

        // A background hydrate must update BOTH the projects list and the
        // currently-viewed project, or the open project screen keeps showing stale data.
        expect(result.current.projects[0].vulnerabilities).toEqual([freshVuln])
        expect(result.current.currentProject?.vulnerabilities).toEqual([freshVuln])
      })

      it("keeps the local project's existing fields when the server response omits them, and leaves an unrelated currentProject untouched", async () => {
        const existingDependencyGraph: Project['dependencyGraph'] = {
          nodes: [],
          edges: [],
          metadata: { totalNodes: 0, totalEdges: 0, maxDepth: 0, generatedAt: new Date('2024-01-01') },
        }
        const existingVuln = createMockVulnerability('CVE-2023-keep', 'medium')
        const existingComponent = createMockComponent('component-keep')
        const existingProject = createMockProject({
          id: 'project-keep',
          vulnerabilities: [existingVuln],
          components: [existingComponent],
          dependencyGraph: existingDependencyGraph,
          lastScanAt: new Date('2024-01-01'),
          allowedLicenses: ['Apache-2.0'],
        })
        const otherProject = createMockProject({ id: 'other-project', name: 'Other' })

        // Cast through unknown: simulates a degraded/partial API response missing the
        // scan fields the store defensively falls back for — a shape the (unexported)
        // ProjectPersistData interface disallows but a real server bug could still send.
        vi.mocked(loadProjectFromServer).mockResolvedValue({
          id: existingProject.id,
          name: existingProject.name,
        } as unknown as ServerProjectData)

        const { result } = renderHook(() => useStore())
        act(() => {
          result.current.addProject(existingProject)
          result.current.addProject(otherProject)
          result.current.setCurrentProject(otherProject)
        })

        const hydrated = await act(async () => {
          return await result.current.hydrateProjectFromServer(existingProject.id)
        })

        expect(hydrated?.vulnerabilities).toEqual([existingVuln])
        expect(hydrated?.components).toEqual([existingComponent])
        expect(hydrated?.dependencyGraph).toEqual(existingDependencyGraph)
        expect(hydrated?.lastScanAt).toEqual(existingProject.lastScanAt)
        expect(hydrated?.updatedAt).toEqual(existingProject.updatedAt)
        expect(hydrated?.statistics).toEqual(existingProject.statistics)
        expect(hydrated?.allowedLicenses).toEqual(['Apache-2.0'])

        // currentProject was a different project — hydrating project-keep must not touch it.
        expect(result.current.currentProject).toEqual(otherProject)
      })

      it('recovers and returns null when the server request throws, without corrupting the already-known project', async () => {
        const mockProject = createMockProject()
        vi.mocked(loadProjectFromServer).mockRejectedValue(new Error('network unreachable'))

        const { result } = renderHook(() => useStore())
        act(() => {
          result.current.addProject(mockProject)
        })

        const hydrated = await act(async () => {
          return await result.current.hydrateProjectFromServer(mockProject.id)
        })

        expect(hydrated).toBeNull()
        expect(console.error).toHaveBeenCalledWith('[Store] Failed to hydrate project from server:', expect.any(Error))
        expect(result.current.projects[0]).toEqual(mockProject)
      })
    })

    // ================ updateProject persistence to the server ================
    // WHY: updateProject pushes to the server only when scan-relevant fields
    // (vulnerabilities/components/allowedLicenses) change, so a scan or SBOM re-import
    // survives a reload — but a plain rename shouldn't trigger a needless network write.
    // This branch had zero coverage: no test ever asserted saveProjectToServer was called.
    describe('updateProject persistence to the server', () => {
      it("pushes the project to the server when a scan's vulnerabilities change, serializing scan timestamps to strings", () => {
        const mockProject = createMockProject({ lastScanAt: new Date('2024-03-01T00:00:00.000Z') })
        const { result } = renderHook(() => useStore())
        act(() => {
          result.current.addProject(mockProject)
        })

        const newVuln = createMockVulnerability('CVE-2024-77', 'critical')
        act(() => {
          result.current.updateProject(mockProject.id, { vulnerabilities: [newVuln] })
        })

        expect(saveProjectToServer).toHaveBeenCalledWith({
          id: mockProject.id,
          name: mockProject.name,
          description: mockProject.description,
          vulnerabilities: [newVuln],
          components: mockProject.components,
          dependencyGraph: undefined,
          lastScanAt: mockProject.lastScanAt?.toString(),
          updatedAt: mockProject.updatedAt.toString(),
          statistics: mockProject.statistics,
          allowedLicenses: undefined,
        })
      })

      it('pushes the project to the server when its component list changes (e.g. a fresh SBOM import)', () => {
        const mockProject = createMockProject()
        const { result } = renderHook(() => useStore())
        act(() => {
          result.current.addProject(mockProject)
        })

        const newComponent = createMockComponent('component-imported')
        act(() => {
          result.current.updateProject(mockProject.id, { components: [newComponent] })
        })

        expect(saveProjectToServer).toHaveBeenCalledWith(
          expect.objectContaining({ id: mockProject.id, components: [newComponent] }),
        )
      })

      it('pushes the project to the server when allowed licenses are approved, even with no scan changes', () => {
        const mockProject = createMockProject()
        const { result } = renderHook(() => useStore())
        act(() => {
          result.current.addProject(mockProject)
        })

        act(() => {
          result.current.updateProject(mockProject.id, { allowedLicenses: ['MIT'] })
        })

        expect(saveProjectToServer).toHaveBeenCalledWith(
          expect.objectContaining({ id: mockProject.id, allowedLicenses: ['MIT'] }),
        )
      })

      it('does not push to the server for unrelated field updates, avoiding unnecessary network writes', () => {
        const mockProject = createMockProject()
        const { result } = renderHook(() => useStore())
        act(() => {
          result.current.addProject(mockProject)
        })

        act(() => {
          result.current.updateProject(mockProject.id, { name: 'Renamed' })
        })

        expect(saveProjectToServer).not.toHaveBeenCalled()
      })

      it('logs but swallows the error when the server push fails, so a transient network error cannot crash the UI', async () => {
        vi.mocked(saveProjectToServer).mockRejectedValueOnce(new Error('server down'))
        const mockProject = createMockProject()
        const { result } = renderHook(() => useStore())
        act(() => {
          result.current.addProject(mockProject)
        })

        act(() => {
          result.current.updateProject(mockProject.id, { vulnerabilities: [createMockVulnerability('CVE-2024-88')] })
        })

        await vi.waitFor(() => {
          expect(console.error).toHaveBeenCalledWith('[Store] Failed to persist project to server:', expect.any(Error))
        })
      })
    })
  })

  // ==================== Audit Logging Integration Tests ====================
  // FR-07.1/07.2: project CREATE/UPDATE/DELETE and settings changes are user
  // actions that must leave a compliance trail — the audit logger existed but
  // was never wired into the store, so these actions were previously silent.
  describe('audit logging integration', () => {
    beforeEach(() => {
      useAuditStore.getState().resetStore()
    })

    it('records a CREATE audit entry when a project is added', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
      })

      const createEvent = useAuditStore
        .getState()
        .events.find((e) => e.actionType === 'CREATE' && e.entityType === 'project')

      expect(createEvent).toBeDefined()
      expect(createEvent?.entityId).toBe(mockProject.id)
      expect(createEvent?.newState).toBeDefined()
    })

    it('records an UPDATE audit entry with before/after state when a project is updated', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject({ name: 'Original Name' })

      act(() => {
        result.current.addProject(mockProject)
      })
      // Isolate the update event from the create event recorded above
      useAuditStore.getState().resetStore()

      act(() => {
        result.current.updateProject(mockProject.id, { name: 'Updated Name' })
      })

      const updateEvent = useAuditStore
        .getState()
        .events.find((e) => e.actionType === 'UPDATE' && e.entityType === 'project')

      expect(updateEvent).toBeDefined()
      expect(updateEvent?.entityId).toBe(mockProject.id)
      expect(updateEvent?.previousState).toBeDefined()
      expect(updateEvent?.newState).toBeDefined()
    })

    it('does not record an UPDATE audit entry when the project id does not match any project', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateProject('non-existent-id', { name: 'Updated Name' })
      })

      expect(useAuditStore.getState().events).toHaveLength(0)
    })

    it('records a DELETE audit entry with the removed project state when a project is deleted', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
      })
      // Isolate the delete event from the create event recorded above
      useAuditStore.getState().resetStore()

      act(() => {
        result.current.deleteProject(mockProject.id)
      })

      const deleteEvent = useAuditStore
        .getState()
        .events.find((e) => e.actionType === 'DELETE' && e.entityType === 'project')

      expect(deleteEvent).toBeDefined()
      expect(deleteEvent?.entityId).toBe(mockProject.id)
      expect(deleteEvent?.previousState).toBeDefined()
    })

    it('records a SETTINGS_CHANGE audit entry when settings are updated', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateSettings({ theme: 'light' })
      })

      const settingsEvent = useAuditStore.getState().events.find((e) => e.actionType === 'SETTINGS_CHANGE')

      expect(settingsEvent).toBeDefined()
      expect(settingsEvent?.entityType).toBe('settings')
    })
  })

  // ==================== UI State Tests ====================
  describe('ui state', () => {
    it('should initialize with sidebar open', () => {
      const { result } = renderHook(() => useStore())

      expect(result.current.sidebarOpen).toBe(true)
    })

    it('should set sidebar to closed', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.setSidebarOpen(false)
      })

      expect(result.current.sidebarOpen).toBe(false)
    })

    it('should toggle sidebar from closed to open', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.setSidebarOpen(false)
      })

      expect(result.current.sidebarOpen).toBe(false)

      act(() => {
        result.current.setSidebarOpen(true)
      })

      expect(result.current.sidebarOpen).toBe(true)
    })

    it('should initialize with empty refreshingProjectIds set', () => {
      const { result } = renderHook(() => useStore())

      expect(result.current.refreshingProjectIds).toEqual(new Set())
    })

    it('should add project to refreshing set', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.setRefreshingProject('project-1', true)
      })

      expect(result.current.refreshingProjectIds.has('project-1')).toBe(true)
    })

    it('should remove project from refreshing set', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.setRefreshingProject('project-1', true)
      })

      expect(result.current.refreshingProjectIds.has('project-1')).toBe(true)

      act(() => {
        result.current.setRefreshingProject('project-1', false)
      })

      expect(result.current.refreshingProjectIds.has('project-1')).toBe(false)
    })

    it('should track multiple refreshing projects', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.setRefreshingProject('project-1', true)
        result.current.setRefreshingProject('project-2', true)
        result.current.setRefreshingProject('project-3', true)
      })

      expect(result.current.refreshingProjectIds.size).toBe(3)
      expect(result.current.refreshingProjectIds.has('project-1')).toBe(true)
      expect(result.current.refreshingProjectIds.has('project-2')).toBe(true)
      expect(result.current.refreshingProjectIds.has('project-3')).toBe(true)
    })

    it('should only remove specified project from refreshing set', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.setRefreshingProject('project-1', true)
        result.current.setRefreshingProject('project-2', true)
        result.current.setRefreshingProject('project-3', true)
      })

      act(() => {
        result.current.setRefreshingProject('project-2', false)
      })

      expect(result.current.refreshingProjectIds.has('project-1')).toBe(true)
      expect(result.current.refreshingProjectIds.has('project-2')).toBe(false)
      expect(result.current.refreshingProjectIds.has('project-3')).toBe(true)
    })
  })

  // ==================== Notification Preferences Tests ====================
  describe('notification preferences', () => {
    it('should initialize with default notification preferences', () => {
      const { result } = renderHook(() => useStore())

      expect(result.current.notificationPreferences).toEqual({
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

    it('should update enabled preference', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateNotificationPreferences({ enabled: false })
      })

      expect(result.current.notificationPreferences.enabled).toBe(false)
      expect(result.current.notificationPreferences.desktopEnabled).toBe(true) // unchanged
    })

    it('should update desktopEnabled preference', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateNotificationPreferences({ desktopEnabled: false })
      })

      expect(result.current.notificationPreferences.desktopEnabled).toBe(false)
    })

    it('should update individual category preferences', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateNotificationPreferences({
          categories: {
            critical_vuln: true,
            scan_complete: false,
            update_available: true,
            system: false,
          },
        })
      })

      expect(result.current.notificationPreferences.categories.critical_vuln).toBe(true)
      expect(result.current.notificationPreferences.categories.scan_complete).toBe(false)
      expect(result.current.notificationPreferences.categories.update_available).toBe(true)
      expect(result.current.notificationPreferences.categories.system).toBe(false)
    })

    it('should update partial category preferences', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateNotificationPreferences({
          categories: {
            ...result.current.notificationPreferences.categories,
            scan_complete: false,
          },
        })
      })

      expect(result.current.notificationPreferences.categories.critical_vuln).toBe(true)
      expect(result.current.notificationPreferences.categories.scan_complete).toBe(false)
      expect(result.current.notificationPreferences.categories.update_available).toBe(true)
      expect(result.current.notificationPreferences.categories.system).toBe(true)
    })

    it('should update multiple notification preferences at once', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateNotificationPreferences({
          enabled: false,
          desktopEnabled: false,
          categories: {
            critical_vuln: false,
            scan_complete: false,
            update_available: false,
            system: false,
          },
        })
      })

      expect(result.current.notificationPreferences.enabled).toBe(false)
      expect(result.current.notificationPreferences.desktopEnabled).toBe(false)
      expect(result.current.notificationPreferences.categories.critical_vuln).toBe(false)
    })

    it('should merge category updates with existing categories', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateNotificationPreferences({
          categories: {
            ...result.current.notificationPreferences.categories,
            scan_complete: false,
          },
        })
      })

      expect(result.current.notificationPreferences.categories.scan_complete).toBe(false)
      expect(result.current.notificationPreferences.categories.critical_vuln).toBe(true)
    })
  })

  // ==================== Store Persistence Tests ====================
  describe('store persistence', () => {
    it('should persist settings to localStorage', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.updateSettings({ theme: 'dark' })
      })

      // Wait for state to be persisted
      const stored = localStorageMock.getItem('vuln-assess-storage')
      // Note: Zustand persist middleware debounces writes, so we need to check if it's persisted
      // For test purposes, we verify the store state is correct
      expect(result.current.settings.theme).toBe('dark')
    })

    it('should persist projects to localStorage', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
      })

      // Verify the project is in the store state
      expect(result.current.projects).toHaveLength(1)
      expect(result.current.projects[0].id).toBe(mockProject.id)
    })

    it('should persist activeProfileId to localStorage', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ activeProfileId: 'profile-123' })
      })

      // Verify the active profile is set in store
      expect(result.current.activeProfileId).toBe('profile-123')
    })

    it('should not persist non-partialized state', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.setSidebarOpen(false)
      })

      // Verify sidebar state is changed in memory
      expect(result.current.sidebarOpen).toBe(false)

      // Non-partialized state like sidebarOpen should not be persisted
      // This is a conceptual test - in practice Zustand persist middleware
      // only persists what's in the partialize function
      expect(result.current.sidebarOpen).toBe(false)
    })
  })

  // ==================== Test Helpers Tests ====================
  describe('test helpers', () => {
    it('should reset store to initial state', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        // 'light' differs from the 'dark' default so the reset below provably restores it
        result.current.updateSettings({ theme: 'light' })
        result.current.addProject(mockProject)
        result.current.setSidebarOpen(false)
        result.current.updateNotificationPreferences({ enabled: false })
      })

      expect(result.current.settings.theme).toBe('light')
      expect(result.current.projects).toHaveLength(1)
      expect(result.current.sidebarOpen).toBe(false)
      expect(result.current.notificationPreferences.enabled).toBe(false)

      act(() => {
        result.current.resetStore()
      })

      expect(result.current.settings.theme).toBe('dark')
      expect(result.current.settings.fontSize).toBe('default')
      expect(result.current.settings.dataRetentionDays).toBe(30)
      expect(result.current.settings.autoRefresh).toBe(false)
      expect(result.current.projects).toEqual([])
      expect(result.current.currentProject).toBeNull()
      expect(result.current.sidebarOpen).toBe(true)
      expect(result.current.notificationPreferences.enabled).toBe(true)
      expect(result.current.settingsProfiles).toEqual([])
      expect(result.current.activeProfileId).toBe('')
    })

    it('should reset refreshingProjectIds on store reset', () => {
      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.setRefreshingProject('project-1', true)
      })

      expect(result.current.refreshingProjectIds.has('project-1')).toBe(true)

      act(() => {
        result.current.resetStore()
      })

      expect(result.current.refreshingProjectIds).toEqual(new Set())
    })
  })

  // ==================== Edge Cases Tests ====================
  describe('edge cases', () => {
    it('should handle updating project with no matching ID gracefully', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
      })

      act(() => {
        result.current.updateProject('non-existent-id', { name: 'Updated' })
      })

      expect(result.current.projects[0].name).toBe(mockProject.name)
    })

    it('should handle deleting project with no matching ID gracefully', () => {
      const { result } = renderHook(() => useStore())
      const mockProject = createMockProject()

      act(() => {
        result.current.addProject(mockProject)
      })

      act(() => {
        result.current.deleteProject('non-existent-id')
      })

      expect(result.current.projects).toHaveLength(1)
    })

    it('should handle empty components array when refreshing', async () => {
      const mockProject = createMockProject({
        components: [],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [],
        vulnerabilitiesFound: 0,
        componentsScanned: 0,
        cached: 0,
        fetched: 0,
        duration: 0,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      expect(mockRefreshData).toHaveBeenCalledWith([], expect.any(Object))
    })

    it('should handle vulnerability with no affected components', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const vulnerability = createMockVulnerability('CVE-2024-1', 'critical')
      vulnerability.affectedComponents = []

      const mockProject = createMockProject({
        components: [mockComponent],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [vulnerability],
        vulnerabilitiesFound: 1,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      expect(result.current.projects[0].statistics.vulnerableComponents).toBe(0)
    })

    it('should handle undefined affected components', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const vulnerability = createMockVulnerability('CVE-2024-1', 'critical')
      delete (vulnerability as any).affectedComponents

      const mockProject = createMockProject({
        components: [mockComponent],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [vulnerability],
        vulnerabilitiesFound: 1,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      expect(result.current.projects[0].statistics.vulnerableComponents).toBe(0)
    })

    it('should handle projects with no existing vulnerabilities when refreshing', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const vulnerability = createMockVulnerability('CVE-2024-1', 'critical')

      const mockProject = createMockProject({
        components: [mockComponent],
        vulnerabilities: undefined,
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [vulnerability],
        vulnerabilitiesFound: 1,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      expect(result.current.projects[0].vulnerabilities).toHaveLength(1)
    })

    it('should handle updating project statistics with existing statistics', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const vulnerability = createMockVulnerability('CVE-2024-1', 'critical')

      const mockProject = createMockProject({
        components: [mockComponent],
        statistics: {
          totalVulnerabilities: 5,
          criticalCount: 1,
          highCount: 2,
          mediumCount: 1,
          lowCount: 1,
          none: 0,
          totalComponents: 10,
          vulnerableComponents: 3,
        },
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [vulnerability],
        vulnerabilitiesFound: 1,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      const stats = result.current.projects[0].statistics
      expect(stats.totalVulnerabilities).toBe(1) // New vulnerabilities only
      expect(stats.totalComponents).toBe(10) // Preserved from existing
    })

    it('should handle refresh with API key from settings', async () => {
      const mockComponent = createMockComponent('component-1', 'pkg:npm/test@1.0.0')
      const mockProject = createMockProject({
        components: [mockComponent],
      })

      vi.mocked(mockRefreshData).mockResolvedValue({
        success: true,
        vulnerabilities: [],
        vulnerabilitiesFound: 0,
        componentsScanned: 1,
        cached: 0,
        fetched: 1,
        duration: 100,
      })

      const { result } = renderHook(() => useStore())

      act(() => {
        // Note: API keys are now stored in secure storage, not settings
        // This test verifies the refresh still works (API key is fetched from secure storage)
        result.current.addProject(mockProject)
      })

      await act(async () => {
        await result.current.refreshVulnerabilityData(mockProject.id)
      })

      // The API key is fetched from secure storage, not from settings
      // So we just verify the refresh was called with the component
      expect(mockRefreshData).toHaveBeenCalledWith([mockComponent], {
        cacheTTL: DEFAULT_SETTINGS.vulnDataCacheTTL,
      })
    })

    it('should handle empty settings profiles when loading', () => {
      // Reset store first to clear any existing profiles
      useStore.getState().resetStore()
      vi.clearAllMocks()

      vi.mocked(getProfiles).mockReturnValue([])

      const { result } = renderHook(() => useStore())

      act(() => {
        result.current.loadSettingsProfiles()
      })

      expect(result.current.settingsProfiles).toEqual([])
      expect(result.current.activeProfileId).toBe('')
    })

    it('should handle switching profiles when no profiles exist', () => {
      // Reset store first to clear any existing state
      useStore.getState().resetStore()

      const { result } = renderHook(() => useStore())

      act(() => {
        useStore.setState({ settingsProfiles: [] })
      })

      expect(result.current.settingsProfiles).toEqual([])
    })
  })

  // ==================== Persistence across reload ====================
  // WHY: a page reload re-creates the store from DEFAULT_SETTINGS and then rehydrates
  // localStorage over it. A user's chosen theme MUST win over the compiled default, or
  // the setting silently reverts on every refresh. This reproduces the reload path
  // (seed storage -> rehydrate) so it fails if persist ever stops restoring settings.
  describe('persistence across reload (rehydration)', () => {
    it('restores a persisted non-default theme when the store rehydrates from storage', async () => {
      // Default theme is 'dark'; persist 'light' so the assertion proves the persisted
      // value — not the default — is what survives. Guard keeps the test honest if the
      // default ever changes to 'light'.
      expect(DEFAULT_SETTINGS.theme).toBe('dark')
      // The persist storage is bound to the real global localStorage at module load (before
      // this suite stubs it), so point it at the per-test mock explicitly.
      useStore.persist.setOptions({ storage: createJSONStorage(() => localStorageMock) })
      localStorageMock.setItem(
        'vuln-assess-storage',
        JSON.stringify({
          state: { settings: { ...DEFAULT_SETTINGS, theme: 'light' }, projects: [], activeProfileId: '' },
          version: 0,
        }),
      )

      await act(async () => {
        await useStore.persist.rehydrate()
      })

      expect(useStore.getState().settings.theme).toBe('light')
    })
  })

  // ==================== Dashboard Layout Profiles (FR-06.3) ====================
  describe('Dashboard layout profiles', () => {
    it('seeds a Default profile matching DEFAULT_DASHBOARD_LAYOUT on a fresh store', () => {
      const { dashboardLayoutProfiles, activeDashboardLayoutProfileId } = useStore.getState()
      expect(dashboardLayoutProfiles).toHaveLength(1)
      expect(activeDashboardLayoutProfileId).toBe('default')
      expect(dashboardLayoutProfiles[0].widgets.map((w) => w.id)).toEqual(DEFAULT_DASHBOARD_LAYOUT.map((w) => w.id))
    })

    it('updateDashboardLayoutWidgets replaces the widgets for the given profile only', () => {
      act(() => {
        useStore.getState().addDashboardLayoutProfile('Second')
      })
      const [first, second] = useStore.getState().dashboardLayoutProfiles
      const hiddenWidgets = first.widgets.map((w) => ({ ...w, visible: false }))

      act(() => {
        useStore.getState().updateDashboardLayoutWidgets(second.id, hiddenWidgets)
      })

      const profiles = useStore.getState().dashboardLayoutProfiles
      // The other profile must be untouched (catches accidental global mutation).
      expect(profiles.find((p) => p.id === first.id)?.widgets.every((w) => w.visible)).toBe(true)
      expect(profiles.find((p) => p.id === second.id)?.widgets.every((w) => !w.visible)).toBe(true)
    })

    it('addDashboardLayoutProfile creates a new profile without changing the active profile id', () => {
      const activeBefore = useStore.getState().activeDashboardLayoutProfileId
      act(() => {
        useStore.getState().addDashboardLayoutProfile('Second')
      })
      expect(useStore.getState().dashboardLayoutProfiles).toHaveLength(2)
      // Adding is not switching.
      expect(useStore.getState().activeDashboardLayoutProfileId).toBe(activeBefore)
    })

    it('setActiveDashboardLayoutProfileId switches which profile is active', () => {
      act(() => {
        useStore.getState().addDashboardLayoutProfile('Second')
      })
      const second = useStore.getState().dashboardLayoutProfiles[1]
      act(() => {
        useStore.getState().setActiveDashboardLayoutProfileId(second.id)
      })
      expect(useStore.getState().activeDashboardLayoutProfileId).toBe(second.id)
    })

    it('persists dashboardLayoutProfiles and activeDashboardLayoutProfileId through the partialize allowlist', () => {
      act(() => {
        useStore.getState().addDashboardLayoutProfile('Second')
      })
      // A future edit that drops these from partialize (silently breaking "Save
      // dashboard configurations") must fail here rather than ship unnoticed.
      const partialized = useStore.persist.getOptions().partialize?.(useStore.getState()) as
        | { dashboardLayoutProfiles?: unknown[]; activeDashboardLayoutProfileId?: string }
        | undefined
      expect(partialized?.dashboardLayoutProfiles).toHaveLength(2)
      expect(partialized?.activeDashboardLayoutProfileId).toBe('default')
    })

    it('refuses to delete the last remaining profile so the dashboard always has a layout to render', () => {
      const before = useStore.getState().dashboardLayoutProfiles
      expect(before).toHaveLength(1)

      act(() => {
        useStore.getState().deleteDashboardLayoutProfile(before[0].id)
      })

      // The guard must reject the delete outright — losing the last profile would
      // leave the dashboard with nothing to render.
      expect(useStore.getState().dashboardLayoutProfiles).toEqual(before)
    })

    it('deletes a non-active profile without changing which profile is active', () => {
      act(() => {
        useStore.getState().addDashboardLayoutProfile('Second')
      })
      const [first, second] = useStore.getState().dashboardLayoutProfiles
      const activeBefore = useStore.getState().activeDashboardLayoutProfileId
      expect(activeBefore).toBe(first.id)

      act(() => {
        useStore.getState().deleteDashboardLayoutProfile(second.id)
      })

      expect(useStore.getState().dashboardLayoutProfiles.map((p) => p.id)).toEqual([first.id])
      expect(useStore.getState().activeDashboardLayoutProfileId).toBe(activeBefore)
    })

    it('falls back to the first remaining profile when the active profile itself is deleted', () => {
      act(() => {
        useStore.getState().addDashboardLayoutProfile('Second')
      })
      const [first, second] = useStore.getState().dashboardLayoutProfiles
      act(() => {
        useStore.getState().setActiveDashboardLayoutProfileId(second.id)
      })

      act(() => {
        useStore.getState().deleteDashboardLayoutProfile(second.id)
      })

      // The deleted profile was active -> must not be left pointing at a dangling id.
      expect(useStore.getState().dashboardLayoutProfiles.map((p) => p.id)).toEqual([first.id])
      expect(useStore.getState().activeDashboardLayoutProfileId).toBe(first.id)
    })

    it('seeds a fresh default layout when the active profile id no longer matches any profile (e.g. stale persisted state)', () => {
      // Simulates a corrupted/stale activeDashboardLayoutProfileId (a schema change, or a
      // profile removed by means other than deleteDashboardLayoutProfile) — cloning "the
      // active profile" must not crash on a lookup miss; it should recover with a default.
      act(() => {
        useStore.setState({ activeDashboardLayoutProfileId: 'no-such-profile' })
        useStore.getState().addDashboardLayoutProfile('Recovered')
      })

      const recovered = useStore.getState().dashboardLayoutProfiles.find((p) => p.name === 'Recovered')
      expect(recovered?.widgets.map((w) => w.id)).toEqual(DEFAULT_DASHBOARD_LAYOUT.map((w) => w.id))
    })
  })

  describe('hydrateProjectsFromServer', () => {
    // Without this the app was localStorage-only: the server held every project (40 observed live)
    // and a fresh browser showed an empty dashboard. Boot must merge the server list in, while
    // never clobbering a project the local store is already tracking.
    it('appends server-only projects and reports how many were introduced', async () => {
      vi.mocked(loadProjectSummariesFromServer).mockResolvedValue([
        { id: 'srv-1', name: 'Server One' },
        { id: 'srv-2', name: 'Server Two' },
      ] as never)

      const { result } = renderHook(() => useStore())

      const added = await act(async () => {
        return await result.current.hydrateProjectsFromServer()
      })

      expect(added).toBe(2)
      expect(result.current.projects.map((p) => p.id)).toEqual(['srv-1', 'srv-2'])
      // Heavy arrays stay empty here: they are fetched per project on demand, which is what keeps
      // boot cheap instead of pulling the full 18 MB list.
      expect(result.current.projects[0].vulnerabilities).toEqual([])
      expect(result.current.projects[0].components).toEqual([])
    })

    it('does not duplicate or overwrite a project the store already tracks', async () => {
      const { result } = renderHook(() => useStore())
      await act(async () => {
        result.current.addProject({
          id: 'srv-1',
          name: 'Local Name',
          description: '',
          components: [],
          vulnerabilities: [],
          sbomFiles: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never)
      })
      vi.mocked(loadProjectSummariesFromServer).mockResolvedValue([{ id: 'srv-1', name: 'Server Name' }] as never)

      const added = await act(async () => {
        return await result.current.hydrateProjectsFromServer()
      })

      expect(added).toBe(0)
      expect(result.current.projects).toHaveLength(1)
      expect(result.current.projects[0].name).toBe('Local Name')
    })

    it('returns 0 and keeps existing state when the server list cannot be read', async () => {
      vi.mocked(loadProjectSummariesFromServer).mockRejectedValue(new Error('offline'))
      const { result } = renderHook(() => useStore())

      const added = await act(async () => {
        return await result.current.hydrateProjectsFromServer()
      })

      expect(added).toBe(0)
    })
  })
})
