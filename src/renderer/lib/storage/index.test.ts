import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSecureKeyService, getSecureKeyService, getKeyTypeSettingName } from './index'
import type { ApiKeyType, ApiKeyKeyType } from './index'
import { getPlatform } from '@/lib/platform'

describe('storage/index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getKeyTypeSettingName', () => {
    it('should map nvd to nvdApiKey', () => {
      expect(getKeyTypeSettingName('nvd')).toBe('nvdApiKey')
    })

    it('should map osv to osvApiKey', () => {
      expect(getKeyTypeSettingName('osv')).toBe('osvApiKey')
    })

    it('should map github to githubApiKey', () => {
      expect(getKeyTypeSettingName('github')).toBe('githubApiKey')
    })
  })

  describe('createSecureKeyService', () => {
    let service: ReturnType<typeof createSecureKeyService>

    beforeEach(() => {
      service = createSecureKeyService()
    })

    describe('isAvailable', () => {
      it('should return true when platform reports available', async () => {
        vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({
          success: true,
          isAvailable: true,
        })

        const result = await service.isAvailable()
        expect(result).toBe(true)
      })

      it('should return false when platform reports unavailable', async () => {
        vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({
          success: true,
          isAvailable: false,
        })

        const result = await service.isAvailable()
        expect(result).toBe(false)
      })

      it('should return false on platform error', async () => {
        vi.mocked(getPlatform().secureStorage.isAvailable).mockRejectedValue(new Error('fail'))
        const result = await service.isAvailable()
        expect(result).toBe(false)
      })
    })

    describe('setApiKey', () => {
      it('should return true on successful set', async () => {
        vi.mocked(getPlatform().secureStorage.setApiKey).mockResolvedValue({ success: true })

        const result = await service.setApiKey('nvd', 'my-key')
        expect(result).toBe(true)
        expect(getPlatform().secureStorage.setApiKey).toHaveBeenCalledWith({
          keyType: 'nvd',
          apiKey: 'my-key',
        })
      })

      it('should return false on failed set', async () => {
        vi.mocked(getPlatform().secureStorage.setApiKey).mockResolvedValue({ success: false })

        const result = await service.setApiKey('osv', 'key')
        expect(result).toBe(false)
      })

      it('should return false on platform error', async () => {
        vi.mocked(getPlatform().secureStorage.setApiKey).mockRejectedValue(new Error('fail'))
        const result = await service.setApiKey('github', 'key')
        expect(result).toBe(false)
      })
    })

    describe('getApiKey', () => {
      it('should return the API key on success', async () => {
        vi.mocked(getPlatform().secureStorage.getApiKey).mockResolvedValue({
          success: true,
          apiKey: 'stored-key',
        })

        const result = await service.getApiKey('nvd')
        expect(result).toBe('stored-key')
        expect(getPlatform().secureStorage.getApiKey).toHaveBeenCalledWith({ keyType: 'nvd' })
      })

      it('should return null when platform reports failure', async () => {
        vi.mocked(getPlatform().secureStorage.getApiKey).mockResolvedValue({
          success: false,
          apiKey: null,
        })

        const result = await service.getApiKey('nvd')
        expect(result).toBeNull()
      })

      it('should return null on platform error', async () => {
        vi.mocked(getPlatform().secureStorage.getApiKey).mockRejectedValue(new Error('fail'))
        const result = await service.getApiKey('nvd')
        expect(result).toBeNull()
      })
    })

    describe('deleteApiKey', () => {
      it('should return true on successful delete', async () => {
        vi.mocked(getPlatform().secureStorage.deleteApiKey).mockResolvedValue({ success: true })

        const result = await service.deleteApiKey('nvd')
        expect(result).toBe(true)
        expect(getPlatform().secureStorage.deleteApiKey).toHaveBeenCalledWith({ keyType: 'nvd' })
      })

      it('should return false on failed delete', async () => {
        vi.mocked(getPlatform().secureStorage.deleteApiKey).mockResolvedValue({ success: false })

        const result = await service.deleteApiKey('nvd')
        expect(result).toBe(false)
      })

      it('should return false on platform error', async () => {
        vi.mocked(getPlatform().secureStorage.deleteApiKey).mockRejectedValue(new Error('fail'))
        const result = await service.deleteApiKey('nvd')
        expect(result).toBe(false)
      })
    })

    describe('hasApiKey', () => {
      it('should return true when key exists', async () => {
        vi.mocked(getPlatform().secureStorage.hasApiKey).mockResolvedValue({
          success: true,
          hasKey: true,
        })

        const result = await service.hasApiKey('nvd')
        expect(result).toBe(true)
      })

      it('should return false when platform reports failure', async () => {
        vi.mocked(getPlatform().secureStorage.hasApiKey).mockResolvedValue({
          success: false,
          hasKey: false,
        })

        const result = await service.hasApiKey('nvd')
        expect(result).toBe(false)
      })

      it('should return false when key does not exist', async () => {
        vi.mocked(getPlatform().secureStorage.hasApiKey).mockResolvedValue({
          success: true,
          hasKey: false,
        })

        const result = await service.hasApiKey('nvd')
        expect(result).toBe(false)
      })

      it('should return false on platform error', async () => {
        vi.mocked(getPlatform().secureStorage.hasApiKey).mockRejectedValue(new Error('fail'))
        const result = await service.hasApiKey('nvd')
        expect(result).toBe(false)
      })
    })

    describe('needsMigration', () => {
      it('should return true when migration is needed', async () => {
        vi.mocked(getPlatform().secureStorage.needsMigration).mockResolvedValue({
          success: true,
          needsMigration: true,
        })

        const result = await service.needsMigration()
        expect(result).toBe(true)
      })

      it('should return false when platform reports failure', async () => {
        vi.mocked(getPlatform().secureStorage.needsMigration).mockResolvedValue({
          success: false,
          needsMigration: false,
        })

        const result = await service.needsMigration()
        expect(result).toBe(false)
      })

      it('should return false on platform error', async () => {
        vi.mocked(getPlatform().secureStorage.needsMigration).mockRejectedValue(new Error('fail'))
        const result = await service.needsMigration()
        expect(result).toBe(false)
      })
    })

    describe('migrateKeys', () => {
      it('should return failure when storage is not available', async () => {
        vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({
          success: false,
          isAvailable: false,
        })

        const result = await service.migrateKeys({ nvdApiKey: 'key1' })
        expect(result).toEqual({ success: false, migrated: [], failed: [] })
      })

      it('should migrate all provided keys successfully', async () => {
        vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({
          success: true,
          isAvailable: true,
        })
        vi.mocked(getPlatform().secureStorage.setApiKey).mockResolvedValue({ success: true })

        const result = await service.migrateKeys({
          nvdApiKey: 'nvd-key',
          osvApiKey: 'osv-key',
          githubApiKey: 'github-key',
        })

        expect(result.success).toBe(true)
        expect(result.migrated).toEqual(expect.arrayContaining(['nvd', 'osv', 'github']))
        expect(result.failed).toEqual([])
      })

      it('should report failed keys when setApiKey fails', async () => {
        vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({
          success: true,
          isAvailable: true,
        })
        vi.mocked(getPlatform().secureStorage.setApiKey)
          .mockResolvedValueOnce({ success: true })
          .mockResolvedValueOnce({ success: false })
          .mockResolvedValueOnce({ success: true })

        const result = await service.migrateKeys({
          nvdApiKey: 'nvd-key',
          osvApiKey: 'osv-key',
          githubApiKey: 'github-key',
        })

        expect(result.success).toBe(false)
        expect(result.failed).toContain('osv')
        expect(result.migrated).toEqual(expect.arrayContaining(['nvd', 'github']))
      })

      it('should skip null/undefined/empty key values', async () => {
        vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({
          success: true,
          isAvailable: true,
        })
        vi.mocked(getPlatform().secureStorage.setApiKey).mockResolvedValue({ success: true })

        const result = await service.migrateKeys({
          nvdApiKey: 'valid-key',
          osvApiKey: '',
          githubApiKey: undefined as unknown as string,
        })

        // Only nvd should be migrated; empty string is falsy and skipped
        expect(result.migrated).toEqual(['nvd'])
      })

      it('should skip unknown setting names', async () => {
        vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({
          success: true,
          isAvailable: true,
        })
        vi.mocked(getPlatform().secureStorage.setApiKey).mockResolvedValue({ success: true })

        const result = await service.migrateKeys({
          unknownKey: 'some-value',
        } as unknown as Partial<Record<ApiKeyKeyType, string>>)

        expect(result.migrated).toEqual([])
        expect(result.failed).toEqual([])
      })

      it('should handle errors gracefully', async () => {
        vi.mocked(getPlatform().secureStorage.isAvailable).mockRejectedValue(new Error('fail'))

        const result = await service.migrateKeys({ nvdApiKey: 'key' })
        expect(result).toEqual({ success: false, migrated: [], failed: [] })
      })
    })

    describe('getAllKeys', () => {
      it('should return keys on success', async () => {
        vi.mocked(getPlatform().secureStorage.getAllKeys).mockResolvedValue({
          success: true,
          keys: {
            nvd: 'nvd-key',
            osv: null,
            github: 'gh-key',
          },
        })

        const result = await service.getAllKeys()
        expect(result).toEqual({
          nvd: 'nvd-key',
          osv: null,
          github: 'gh-key',
        })
      })

      it('should return null values when platform reports failure', async () => {
        vi.mocked(getPlatform().secureStorage.getAllKeys).mockResolvedValue({
          success: false,
          keys: {},
        })

        const result = await service.getAllKeys()
        expect(result).toEqual({ nvd: null, osv: null, github: null })
      })

      it('should return null values on platform error', async () => {
        vi.mocked(getPlatform().secureStorage.getAllKeys).mockRejectedValue(new Error('fail'))
        const result = await service.getAllKeys()
        expect(result).toEqual({ nvd: null, osv: null, github: null })
      })
    })
  })

  describe('getSecureKeyService', () => {
    it('should return a singleton service instance', () => {
      const service1 = getSecureKeyService()
      const service2 = getSecureKeyService()
      expect(service1).toBe(service2)
    })

    it('should return a service with all required methods', () => {
      const service = getSecureKeyService()
      expect(typeof service.isAvailable).toBe('function')
      expect(typeof service.setApiKey).toBe('function')
      expect(typeof service.getApiKey).toBe('function')
      expect(typeof service.deleteApiKey).toBe('function')
      expect(typeof service.hasApiKey).toBe('function')
      expect(typeof service.needsMigration).toBe('function')
      expect(typeof service.migrateKeys).toBe('function')
      expect(typeof service.getAllKeys).toBe('function')
    })
  })
})
