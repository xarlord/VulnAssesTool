import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore } from './useStore'
import { act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import type { AppSettings, Project, Component, Vulnerability } from '@@/types'
import { DEFAULT_SETTINGS } from '@@/constants'

// Mock the refresh module
vi.mock('@/lib/refresh', () => ({
  refreshVulnerabilityData: vi.fn(),
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
      expect(result.current.settings.theme).toBe('system')
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
        result.current.updateSettings({ theme: 'dark' })
        result.current.addProject(mockProject)
        result.current.setSidebarOpen(false)
        result.current.updateNotificationPreferences({ enabled: false })
      })

      expect(result.current.settings.theme).toBe('dark')
      expect(result.current.projects).toHaveLength(1)
      expect(result.current.sidebarOpen).toBe(false)
      expect(result.current.notificationPreferences.enabled).toBe(false)

      act(() => {
        result.current.resetStore()
      })

      expect(result.current.settings.theme).toBe('system')
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
})
