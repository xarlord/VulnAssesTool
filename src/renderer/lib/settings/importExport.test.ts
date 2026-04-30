import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  exportSettings,
  exportSettingsToFile,
  importSettings,
  importSettingsFromFile,
  validateSettingsExport,
  summarizeImportData,
  type ValidationResult,
} from './importExport'
import type { SettingsProfile, SettingsExport, AppSettings } from '@@/types'

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
    ossIndex: {
      enabled: false,
      priority: 3,
      rateLimit: {
        requestsPerHour: 1000,
        requestsPerMinute: 16,
      },
    },
    githubAdvisory: {
      enabled: false,
      priority: 4,
      rateLimit: {
        requestsPerHour: 5000,
        requestsPerMinute: 83,
      },
    },
    snyk: {
      enabled: false,
      priority: 5,
      rateLimit: {
        requestsPerHour: 200,
      },
    },
  },
  cvssVersion: '3.1',
  showCvssBreakdown: true,
  maxGraphNodes: 500,
  showVulnerableOnly: false,
}

const mockProfile: SettingsProfile = {
  id: 'profile-1',
  name: 'Test Profile',
  description: 'Test description',
  settings: mockSettings,
  isDefault: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  lastUsed: new Date('2024-01-02T00:00:00.000Z'),
}

describe('Settings Import/Export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validateSettingsExport', () => {
    it('should validate correct settings export data', () => {
      const data: SettingsExport = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [mockProfile],
      }

      expect(validateSettingsExport(data)).toBe(true)
    })

    it('should reject data with missing version', () => {
      const data = {
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [mockProfile],
      } as unknown

      expect(validateSettingsExport(data)).toBe(false)
    })

    it('should reject data with missing exportedAt', () => {
      const data = {
        version: '1.0.0',
        profiles: [mockProfile],
      } as unknown

      expect(validateSettingsExport(data)).toBe(false)
    })

    it('should reject data with empty profiles array', () => {
      const data = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [],
      } as unknown

      expect(validateSettingsExport(data)).toBe(false)
    })

    it('should reject data with invalid profile', () => {
      const data = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [
          {
            id: 'profile-1',
            name: '', // Empty name should fail validation
            settings: mockSettings,
            isDefault: true,
            createdAt: new Date(),
            lastUsed: new Date(),
          },
        ],
      } as unknown

      expect(validateSettingsExport(data)).toBe(false)
    })

    it('should reject data with invalid settings', () => {
      const data = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [
          {
            id: 'profile-1',
            name: 'Test Profile',
            settings: {
              theme: 'invalid', // Invalid theme
            },
            isDefault: true,
            createdAt: new Date(),
            lastUsed: new Date(),
          },
        ],
      } as unknown

      expect(validateSettingsExport(data)).toBe(false)
    })
  })

  describe('exportSettings', () => {
    it('should export profiles to SettingsExport format', () => {
      const profiles = [mockProfile]
      const exported = exportSettings(profiles)

      expect(exported.version).toBe('1.0.0')
      expect(exported.profiles).toHaveLength(1)
      expect(exported.profiles[0].id).toBe(mockProfile.id)
    })

    it('should convert Date objects to ISO strings', () => {
      const profiles = [mockProfile]
      const exported = exportSettings(profiles)

      expect(typeof exported.profiles[0].createdAt).toBe('string')
      expect(typeof exported.profiles[0].lastUsed).toBe('string')
      expect(exported.profiles[0].createdAt).toBe('2024-01-01T00:00:00.000Z')
    })

    it('should set exportedAt to current time', () => {
      const before = new Date()
      const exported = exportSettings([mockProfile])
      const after = new Date()

      const exportedAt = new Date(exported.exportedAt)
      expect(exportedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(exportedAt.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it('should throw error for empty profiles array', () => {
      expect(() => {
        exportSettings([])
      }).toThrow('No profiles to export')
    })

    it('should handle multiple profiles', () => {
      const profile2: SettingsProfile = {
        ...mockProfile,
        id: 'profile-2',
        name: 'Second Profile',
        isDefault: false,
      }

      const exported = exportSettings([mockProfile, profile2])

      expect(exported.profiles).toHaveLength(2)
      expect(exported.profiles[0].id).toBe(mockProfile.id)
      expect(exported.profiles[1].id).toBe(profile2.id)
    })
  })

  describe('exportSettingsToFile', () => {
    it('should trigger file download', () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any)
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any)
      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any)
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL')

      exportSettingsToFile([mockProfile])

      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(mockLink.click).toHaveBeenCalled()
      expect(removeChildSpy).toHaveBeenCalled()
      expect(revokeObjectURLSpy).toHaveBeenCalled()

      createElementSpy.mockRestore()
      appendChildSpy.mockRestore()
      removeChildSpy.mockRestore()
      revokeObjectURLSpy.mockRestore()
    })

    it('should use default filename if not provided', () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any)
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any)
      vi.spyOn(URL, 'revokeObjectURL')

      exportSettingsToFile([mockProfile])

      expect(mockLink.download).toMatch(/^vuln-assess-settings-\d{4}-\d{2}-\d{2}\.json$/)

      vi.restoreAllMocks()
    })

    it('should use custom filename if provided', () => {
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
      }
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any)
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any)
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any)
      vi.spyOn(URL, 'revokeObjectURL')

      exportSettingsToFile([mockProfile], 'custom-settings.json')

      expect(mockLink.download).toBe('custom-settings.json')

      vi.restoreAllMocks()
    })

    it('should throw error on export failure', () => {
      vi.spyOn(JSON, 'stringify').mockImplementation(() => {
        throw new Error('JSON error')
      })

      expect(() => {
        exportSettingsToFile([mockProfile])
      }).toThrow('Failed to export settings. Please try again.')

      vi.restoreAllMocks()
    })
  })

  describe('importSettings', () => {
    const validExport: SettingsExport = {
      version: '1.0.0',
      exportedAt: '2024-01-01T00:00:00.000Z',
      profiles: [mockProfile],
    }

    it('should import valid settings JSON', () => {
      const json = JSON.stringify(validExport)
      const result = importSettings(json)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data?.profiles).toHaveLength(1)
    })

    it('should convert ISO string dates back to Date objects', () => {
      const json = JSON.stringify(validExport)
      const result = importSettings(json)

      expect(result.success).toBe(true)
      expect(result.data?.profiles[0].createdAt).toBeInstanceOf(Date)
      expect(result.data?.profiles[0].lastUsed).toBeInstanceOf(Date)
    })

    it('should reject invalid JSON', () => {
      const result = importSettings('invalid json')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid JSON format')
    })

    it('should reject data with missing required fields', () => {
      const invalidData = {
        version: '1.0.0',
        // Missing exportedAt and profiles
      }
      const json = JSON.stringify(invalidData)
      const result = importSettings(json)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid settings format')
    })

    it('should reject data with invalid profile name', () => {
      const invalidData = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [
          {
            id: 'profile-1',
            name: '', // Empty name
            settings: mockSettings,
            isDefault: true,
            createdAt: '2024-01-01T00:00:00.000Z',
            lastUsed: '2024-01-01T00:00:00.000Z',
          },
        ],
      }
      const json = JSON.stringify(invalidData)
      const result = importSettings(json)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid settings format')
    })

    it('should reject unsupported version', () => {
      const invalidData = {
        version: '2.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [mockProfile],
      }
      const json = JSON.stringify(invalidData)
      const result = importSettings(json)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unsupported settings version')
    })

    it('should accept version 1.x', () => {
      const data = {
        version: '1.5.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [mockProfile],
      }
      const json = JSON.stringify(data)
      const result = importSettings(json)

      expect(result.success).toBe(true)
    })
  })

  describe('importSettingsFromFile', () => {
    it('should import valid JSON file', async () => {
      const validExport: SettingsExport = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [mockProfile],
      }

      // Create a mock file with text method
      const fileContent = JSON.stringify(validExport)
      const file = {
        name: 'settings.json',
        type: 'application/json',
        size: new Blob([fileContent]).size,
        text: async () => fileContent,
      } as unknown as File

      const result = await importSettingsFromFile(file)

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
    })

    it('should reject non-JSON file', async () => {
      const file = {
        name: 'settings.txt',
        type: 'text/plain',
        size: 100,
        text: async () => 'content',
      } as unknown as File

      const result = await importSettingsFromFile(file)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid file type')
    })

    it('should reject files larger than 5MB', async () => {
      const file = {
        name: 'settings.json',
        type: 'application/json',
        size: 6 * 1024 * 1024, // 6MB
        text: async () => '{}',
      } as unknown as File

      const result = await importSettingsFromFile(file)

      expect(result.success).toBe(false)
      expect(result.error).toContain('File too large')
    })

    it('should handle file read errors', async () => {
      const file = {
        name: 'settings.json',
        type: 'application/json',
        size: 100,
        text: async () => {
          throw new Error('Read error')
        },
      } as unknown as File

      const result = await importSettingsFromFile(file)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Read error')
    })

    it('should validate file contents after reading', async () => {
      const invalidContent = JSON.stringify({
        version: '1.0.0',
        // Missing required fields
      })

      const file = {
        name: 'settings.json',
        type: 'application/json',
        size: new Blob([invalidContent]).size,
        text: async () => invalidContent,
      } as unknown as File

      const result = await importSettingsFromFile(file)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid settings format')
    })
  })

  describe('summarizeImportData', () => {
    it('should generate correct summary for single profile', () => {
      const data: SettingsExport = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [mockProfile],
      }

      const summary = summarizeImportData(data)

      expect(summary).toContain('1 profile')
      expect(summary).toContain('version 1.0.0')
      expect(summary).toContain(`"${mockProfile.name}"`)
    })

    it('should generate correct summary for multiple profiles', () => {
      const profile2: SettingsProfile = {
        ...mockProfile,
        id: 'profile-2',
        name: 'Second Profile',
        isDefault: false,
      }

      const data: SettingsExport = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [mockProfile, profile2],
      }

      const summary = summarizeImportData(data)

      expect(summary).toContain('2 profiles')
    })

    it('should show "None" when no default profile', () => {
      const data: SettingsExport = {
        version: '1.0.0',
        exportedAt: '2024-01-01T00:00:00.000Z',
        profiles: [
          {
            ...mockProfile,
            isDefault: false,
          },
        ],
      }

      const summary = summarizeImportData(data)

      expect(summary).toContain('Default profile: "None"')
    })
  })
})
