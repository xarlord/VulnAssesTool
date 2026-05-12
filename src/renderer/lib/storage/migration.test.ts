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
    it('should return true when plaintext API keys exist', () => {
      const settings = {
        nvdApiKey: 'test-nvd-key',
        theme: 'dark',
      }

      expect(hasPlaintextApiKeys(settings)).toBe(true)
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
    it('should extract all plaintext API keys', () => {
      const settings = {
        nvdApiKey: 'test-nvd-key',
        osvApiKey: 'test-osv-key',
        theme: 'dark',
      }

      const result = getPlaintextApiKeys(settings)

      expect(result).toEqual({
        nvdApiKey: 'test-nvd-key',
        osvApiKey: 'test-osv-key',
      })
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
    it('should migrate API keys to secure storage', async () => {
      const settings = {
        nvdApiKey: 'test-nvd-key',
        theme: 'dark',
        fontSize: 'default' as const,
        dataRetentionDays: 30,
        autoRefresh: false,
        vulnDataCacheTTL: 3600000,
      }

      const result = await migrateApiKeysToSecureStorage(settings)

      expect(result.success).toBe(true)
      expect(result.migrated).toContain('nvd')
      expect(result.updatedSettings.nvdApiKey).toBeUndefined()
      expect(mockSecureKeyService.migrateKeys).toHaveBeenCalledWith({
        nvdApiKey: 'test-nvd-key',
      })
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

    it('should return failure when secure storage is not available', async () => {
      mockSecureKeyService.isAvailable.mockResolvedValue(false)

      const settings = {
        nvdApiKey: 'test-nvd-key',
        theme: 'dark',
        fontSize: 'default' as const,
        dataRetentionDays: 30,
        autoRefresh: false,
        vulnDataCacheTTL: 3600000,
      }

      const result = await migrateApiKeysToSecureStorage(settings)

      expect(result.success).toBe(false)
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
  })
})
