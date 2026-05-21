/**
 * Migration Utility Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  hasPlaintextApiKeys,
  getPlaintextApiKeys,
  migrateApiKeysToSecureStorage,
  loadApiKeyWithFallback,
} from './migration'
import { getSecureKeyService } from './index'

// Mock the secure key service
vi.mock('./index', () => ({
  getSecureKeyService: vi.fn(),
}))

describe('Migration Utility', () => {
  const mockSecureKeyService = {
    isAvailable: vi.fn().mockResolvedValue(true),
    setApiKey: vi.fn().mockResolvedValue(true),
    getApiKey: vi.fn().mockResolvedValue(null),
    hasApiKey: vi.fn().mockResolvedValue(false),
    needsMigration: vi.fn().mockResolvedValue(false),
    migrateKeys: vi.fn().mockResolvedValue({
      success: true,
      migrated: ['nvd'],
      failed: [],
    }),
    getAllKeys: vi.fn().mockResolvedValue({
      nvd: null,
      osv: null,
      github: null,
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSecureKeyService).mockReturnValue(mockSecureKeyService)
  })

  describe('hasPlaintextApiKeys', () => {
    it('should return false — keys have been migrated to secure storage', () => {
      const settings = {
        nvdApiKey: 'test-nvd-key',
        theme: 'dark',
      }

      // hasPlaintextApiKeys is now a no-op: API keys are no longer stored in settings
      expect(hasPlaintextApiKeys(settings)).toBe(false)
    })

    it('should return false when no API keys exist', () => {
      const settings = {
        theme: 'dark',
      }

      expect(hasPlaintextApiKeys(settings)).toBe(false)
    })

    it('should return false when API keys are empty strings', () => {
      const settings = {
        nvdApiKey: '',
        osvApiKey: '',
      }

      expect(hasPlaintextApiKeys(settings)).toBe(false)
    })
  })

  describe('getPlaintextApiKeys', () => {
    it('should return empty object — keys have been migrated to secure storage', () => {
      const settings = {
        nvdApiKey: 'test-nvd-key',
        osvApiKey: 'test-osv-key',
        theme: 'dark',
      }

      // getPlaintextApiKeys is now a no-op: API keys are no longer stored in settings
      const result = getPlaintextApiKeys(settings)

      expect(result).toEqual({})
    })

    it('should return empty object when no keys exist', () => {
      const settings = {
        theme: 'dark',
      }

      const result = getPlaintextApiKeys(settings)

      expect(result).toEqual({})
    })
  })

  describe('migrateApiKeysToSecureStorage', () => {
    it('should return success with no migration — keys are no longer in settings', async () => {
      const settings = {
        nvdApiKey: 'test-nvd-key',
        theme: 'dark',
        fontSize: 'default' as const,
        dataRetentionDays: 30,
        autoRefresh: false,
        vulnDataCacheTTL: 3600000,
      }

      // hasPlaintextApiKeys always returns false, so no migration occurs
      const result = await migrateApiKeysToSecureStorage(settings)

      expect(result.success).toBe(true)
      expect(result.migrated).toEqual([])
      expect(result.updatedSettings).toEqual({})
      expect(mockSecureKeyService.migrateKeys).not.toHaveBeenCalled()
    })

    it('should return success with no migration when no keys exist', async () => {
      const settings = {
        theme: 'dark',
        fontSize: 'default' as const,
        dataRetentionDays: 30,
        autoRefresh: false,
        vulnDataCacheTTL: 3600000,
      }

      const result = await migrateApiKeysToSecureStorage(settings)

      expect(result.success).toBe(true)
      expect(result.migrated).toEqual([])
      expect(mockSecureKeyService.migrateKeys).not.toHaveBeenCalled()
    })

    it('should return success when secure storage is not available — no migration needed', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(false)

      const settings = {
        nvdApiKey: 'test-nvd-key',
        theme: 'dark',
        fontSize: 'default' as const,
        dataRetentionDays: 30,
        autoRefresh: false,
        vulnDataCacheTTL: 3600000,
      }

      // No plaintext keys detected → early return with success, storage availability not checked
      const result = await migrateApiKeysToSecureStorage(settings)

      expect(result.success).toBe(true)
      expect(result.migrated).toEqual([])
    })
  })

  describe('loadApiKeyWithFallback', () => {
    it('should return secure key when available', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(true)
      mockSecureKeyService.getApiKey.mockResolvedValue('secure-nvd-key')

      const result = await loadApiKeyWithFallback('nvd', 'fallback-key')

      expect(result).toBe('secure-nvd-key')
      expect(mockSecureKeyService.getApiKey).toHaveBeenCalledWith('nvd')
    })

    it('should fall back to settings when secure storage unavailable', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(false)

      const result = await loadApiKeyWithFallback('nvd', 'fallback-key')

      expect(result).toBe('fallback-key')
      expect(mockSecureKeyService.getApiKey).not.toHaveBeenCalled()
    })

    it('should fall back to settings when secure storage returns null', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(true)
      mockSecureKeyService.getApiKey.mockResolvedValue(null)

      const result = await loadApiKeyWithFallback('nvd', 'fallback-key')

      expect(result).toBe('fallback-key')
    })

    it('should return undefined when no key exists', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(true)
      mockSecureKeyService.getApiKey.mockResolvedValue(null)

      const result = await loadApiKeyWithFallback('nvd', undefined)

      expect(result).toBeUndefined()
    })

    it('should handle osv key type', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(true)
      mockSecureKeyService.getApiKey.mockResolvedValue('secure-osv-key')

      const result = await loadApiKeyWithFallback('osv', 'fallback-osv')

      expect(result).toBe('secure-osv-key')
      expect(mockSecureKeyService.getApiKey).toHaveBeenCalledWith('osv')
    })

    it('should handle github key type', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(true)
      mockSecureKeyService.getApiKey.mockResolvedValue('secure-github-key')

      const result = await loadApiKeyWithFallback('github', 'fallback-github')

      expect(result).toBe('secure-github-key')
      expect(mockSecureKeyService.getApiKey).toHaveBeenCalledWith('github')
    })

    it('should fall back for osv key when secure storage unavailable', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(false)

      const result = await loadApiKeyWithFallback('osv', 'settings-osv-key')

      expect(result).toBe('settings-osv-key')
    })

    it('should fall back for github key when secure storage returns null', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(true)
      mockSecureKeyService.getApiKey.mockResolvedValue(null)

      const result = await loadApiKeyWithFallback('github', 'settings-github-key')

      expect(result).toBe('settings-github-key')
    })
  })
})
