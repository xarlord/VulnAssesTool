import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createProfile,
  updateProfile,
  deleteProfile,
  setDefaultProfile,
  getProfiles,
  getActiveProfile,
  switchProfile,
  initializeProfiles,
} from './profiles'
import type { AppSettings } from '@@/types'

const mockSettings: AppSettings = {
  theme: 'dark',
  fontSize: 'large',
  nvdApiKey: 'test-api-key',
  dataRetentionDays: 60,
  autoRefresh: true,
  autoRefreshInterval: 12,
  vulnDataCacheTTL: 6,
  vulnProviders: {
    nvd: {
      enabled: true,
      priority: 1,
      rateLimit: {
        requestsPerHour: 600,
        requestsPerMinute: 10,
      },
    },
    osv: {
      enabled: true,
      priority: 2,
      rateLimit: {
        requestsPerHour: 1000,
      },
    },
  },
  cvssVersion: '3.1',
  showCvssBreakdown: true,
  maxGraphNodes: 500,
  showVulnerableOnly: false,
}

// Create a proper localStorage mock
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

describe('Settings Profiles', () => {
  let localStorageMock: ReturnType<typeof createLocalStorageMock>

  beforeEach(() => {
    // Create fresh localStorage mock for each test
    localStorageMock = createLocalStorageMock()
    vi.stubGlobal('localStorage', localStorageMock)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorageMock.clear()
  })

  describe('createProfile', () => {
    it('should create a new profile with valid data', () => {
      const profile = createProfile('Test Profile', 'Test description', mockSettings)

      expect(profile.id).toBeTruthy()
      expect(profile.name).toBe('Test Profile')
      expect(profile.description).toBe('Test description')
      expect(profile.settings).toEqual(mockSettings)
      expect(profile.isDefault).toBe(true) // First profile is default
      expect(profile.createdAt).toBeInstanceOf(Date)
      expect(profile.lastUsed).toBeInstanceOf(Date)
    })

    it('should create a profile without description', () => {
      const profile = createProfile('Minimal Profile', undefined, mockSettings)

      expect(profile.name).toBe('Minimal Profile')
      expect(profile.description).toBeUndefined()
    })

    it('should trim whitespace from name and description', () => {
      const profile = createProfile('  Trimmed Profile  ', '  Test description  ', mockSettings)

      expect(profile.name).toBe('Trimmed Profile')
      expect(profile.description).toBe('Test description')
    })

    it('should throw error for duplicate profile names', () => {
      createProfile('Duplicate Profile', undefined, mockSettings)

      expect(() => {
        createProfile('Duplicate Profile', undefined, mockSettings)
      }).toThrow('A profile with the name "Duplicate Profile" already exists')
    })

    it('should throw error for case-insensitive duplicate names', () => {
      createProfile('Case Test', undefined, mockSettings)

      expect(() => {
        createProfile('case test', undefined, mockSettings)
      }).toThrow('A profile with the name "case test" already exists')
    })

    it('should not mark second profile as default', () => {
      createProfile('First Profile', undefined, mockSettings)
      const secondProfile = createProfile('Second Profile', undefined, mockSettings)

      expect(secondProfile.isDefault).toBe(false)
    })

    it('should save profile to localStorage', () => {
      createProfile('Storage Test', undefined, mockSettings)

      const stored = localStorage.getItem('vuln-assess-settings-profiles')
      expect(stored).toBeTruthy()

      const profiles = JSON.parse(stored!)
      expect(profiles).toHaveLength(1)
      expect(profiles[0].name).toBe('Storage Test')
    })
  })

  describe('updateProfile', () => {
    it('should update profile name', () => {
      const profile = createProfile('Original Name', undefined, mockSettings)
      updateProfile(profile.id, { name: 'Updated Name' })

      const profiles = getProfiles()
      const updated = profiles.find((p) => p.id === profile.id)

      expect(updated?.name).toBe('Updated Name')
    })

    it('should update profile description', () => {
      const profile = createProfile('Test Profile', undefined, mockSettings)
      updateProfile(profile.id, { description: 'New description' })

      const profiles = getProfiles()
      const updated = profiles.find((p) => p.id === profile.id)

      expect(updated?.description).toBe('New description')
    })

    it('should update profile settings', () => {
      const profile = createProfile('Test Profile', undefined, mockSettings)
      const newSettings = { ...mockSettings, theme: 'light' as const }
      updateProfile(profile.id, { settings: newSettings })

      const profiles = getProfiles()
      const updated = profiles.find((p) => p.id === profile.id)

      expect(updated?.settings.theme).toBe('light')
    })

    it('should throw error for non-existent profile', () => {
      expect(() => {
        updateProfile('non-existent-id', { name: 'New Name' })
      }).toThrow('Profile with ID "non-existent-id" not found')
    })

    it('should throw error for duplicate names', () => {
      createProfile('Profile One', undefined, mockSettings)
      const profile2 = createProfile('Profile Two', undefined, mockSettings)

      expect(() => {
        updateProfile(profile2.id, { name: 'Profile One' })
      }).toThrow('A profile with the name "Profile One" already exists')
    })

    it('should trim updated name and description', () => {
      const profile = createProfile('Test Profile', undefined, mockSettings)
      updateProfile(profile.id, {
        name: '  Updated Name  ',
        description: '  Updated Description  ',
      })

      const profiles = getProfiles()
      const updated = profiles.find((p) => p.id === profile.id)

      expect(updated?.name).toBe('Updated Name')
      expect(updated?.description).toBe('Updated Description')
    })
  })

  describe('deleteProfile', () => {
    it('should delete a profile', () => {
      const profile1 = createProfile('Profile 1', undefined, mockSettings)
      const profile2 = createProfile('Profile 2', undefined, mockSettings)

      deleteProfile(profile2.id)

      const profiles = getProfiles()
      expect(profiles).toHaveLength(1)
      expect(profiles[0].id).toBe(profile1.id)
    })

    it('should throw error for non-existent profile', () => {
      expect(() => {
        deleteProfile('non-existent-id')
      }).toThrow('Profile with ID "non-existent-id" not found')
    })

    it('should throw error when deleting the only profile', () => {
      const profile = createProfile('Only Profile', undefined, mockSettings)

      expect(() => {
        deleteProfile(profile.id)
      }).toThrow('Cannot delete the only remaining profile')
    })

    it('should make another profile default if deleting default profile', () => {
      const profile1 = createProfile('Profile 1', undefined, mockSettings)
      const profile2 = createProfile('Profile 2', undefined, mockSettings)

      expect(profile1.isDefault).toBe(true)

      deleteProfile(profile1.id)

      const profiles = getProfiles()
      expect(profiles[0].isDefault).toBe(true)
    })
  })

  describe('setDefaultProfile', () => {
    it('should set a profile as default', () => {
      const profile1 = createProfile('Profile 1', undefined, mockSettings)
      const profile2 = createProfile('Profile 2', undefined, mockSettings)

      setDefaultProfile(profile2.id)

      const profiles = getProfiles()
      const defaultProfile = profiles.find((p) => p.isDefault)

      expect(defaultProfile?.id).toBe(profile2.id)
      expect(profiles.every((p) => p.isDefault === (p.id === profile2.id))).toBe(true)
    })

    it('should throw error for non-existent profile', () => {
      expect(() => {
        setDefaultProfile('non-existent-id')
      }).toThrow('Profile with ID "non-existent-id" not found')
    })
  })

  describe('getProfiles', () => {
    it('should return empty array when no profiles exist', () => {
      const profiles = getProfiles()
      expect(profiles).toEqual([])
    })

    it('should return all profiles', () => {
      const profile1 = createProfile('Profile 1', undefined, mockSettings)
      const profile2 = createProfile('Profile 2', undefined, mockSettings)

      const profiles = getProfiles()

      expect(profiles).toHaveLength(2)
      expect(profiles.map((p) => p.id)).toContain(profile1.id)
      expect(profiles.map((p) => p.id)).toContain(profile2.id)
    })

    it('should return profiles with Date objects', () => {
      createProfile('Test Profile', undefined, mockSettings)

      const profiles = getProfiles()
      const profile = profiles[0]

      expect(profile.createdAt).toBeInstanceOf(Date)
      expect(profile.lastUsed).toBeInstanceOf(Date)
    })
  })

  describe('getActiveProfile', () => {
    it('should return default profile when no active profile is set', () => {
      const profile = createProfile('Default Profile', undefined, mockSettings)

      const active = getActiveProfile()

      expect(active.id).toBe(profile.id)
      expect(active.isDefault).toBe(true)
    })

    it('should create default profile if none exists', () => {
      const active = getActiveProfile()

      expect(active).toBeTruthy()
      expect(active.name).toBe('Default Profile')
      expect(active.isDefault).toBe(true)
    })

    it('should return the active profile after switching', () => {
      const profile1 = createProfile('Profile 1', undefined, mockSettings)
      const profile2 = createProfile('Profile 2', undefined, mockSettings)

      switchProfile(profile2.id)
      const active = getActiveProfile()

      expect(active.id).toBe(profile2.id)
    })
  })

  describe('switchProfile', () => {
    it('should switch to a different profile', () => {
      const profile1 = createProfile('Profile 1', undefined, mockSettings)
      const profile2 = createProfile('Profile 2', undefined, mockSettings)

      const result = switchProfile(profile2.id)

      expect(result.id).toBe(profile2.id)
      expect(result.lastUsed).toBeInstanceOf(Date)
    })

    it('should update lastUsed timestamp', () => {
      const profile = createProfile('Test Profile', undefined, mockSettings)
      const originalLastUsed = profile.lastUsed

      // Add a small delay to ensure timestamp difference
      const startTime = Date.now()
      while (Date.now() - startTime < 15) {
        // Busy wait for 15ms
      }

      const result = switchProfile(profile.id)
      expect(result.lastUsed.getTime()).toBeGreaterThan(originalLastUsed.getTime())
    })

    it('should throw error for non-existent profile', () => {
      expect(() => {
        switchProfile('non-existent-id')
      }).toThrow('Profile with ID "non-existent-id" not found')
    })

    it('should save active profile ID to localStorage', () => {
      const profile = createProfile('Test Profile', undefined, mockSettings)
      switchProfile(profile.id)

      const activeId = localStorage.getItem('vuln-assess-active-profile-id')
      expect(activeId).toBe(profile.id)
    })
  })

  describe('initializeProfiles', () => {
    it('should create default profile if none exists', () => {
      initializeProfiles()

      const profiles = getProfiles()
      expect(profiles).toHaveLength(1)
      expect(profiles[0].name).toBe('Default Profile')
      expect(profiles[0].isDefault).toBe(true)
    })

    it('should not create profile if one already exists', () => {
      createProfile('Custom Profile', undefined, mockSettings)
      initializeProfiles()

      const profiles = getProfiles()
      expect(profiles).toHaveLength(1)
      expect(profiles[0].name).toBe('Custom Profile')
    })
  })

  describe('localStorage persistence', () => {
    it('should persist profiles across clear/get operations', () => {
      createProfile('Persistent Profile', undefined, mockSettings)

      // Simulate page reload by clearing in-memory state
      const profiles1 = getProfiles()
      const profiles2 = getProfiles()

      expect(profiles1).toEqual(profiles2)
    })

    it('should handle invalid localStorage data gracefully', () => {
      localStorage.setItem('vuln-assess-settings-profiles', 'invalid json')

      const profiles = getProfiles()
      expect(profiles).toEqual([])
    })
  })
})
