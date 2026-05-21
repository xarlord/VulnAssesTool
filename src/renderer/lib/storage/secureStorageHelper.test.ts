/**
 * Tests for Secure Storage Helper
 * Tests consistent API key access patterns using the platform abstraction layer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getApiKey,
  setApiKey,
  deleteApiKey,
  hasApiKey,
  getAllApiKeys,
  isSecureStorageAvailable,
  needsMigration,
  migrateKeys,
} from './secureStorageHelper'
import { getPlatform } from '@/lib/platform'

describe('Secure Storage Helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getApiKey', () => {
    it('should retrieve API key from secure storage', async () => {
      vi.mocked(getPlatform().secureStorage.getApiKey).mockResolvedValue({
        success: true,
        apiKey: 'test-nvd-key',
      })

      const key = await getApiKey('nvd')
      expect(key).toBe('test-nvd-key')
      expect(getPlatform().secureStorage.getApiKey).toHaveBeenCalledWith({ keyType: 'nvd' })
    })

    it('should return null for non-existent key', async () => {
      vi.mocked(getPlatform().secureStorage.getApiKey).mockResolvedValue({
        success: true,
        apiKey: null,
      })

      const key = await getApiKey('osv')
      expect(key).toBeNull()
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(getPlatform().secureStorage.getApiKey).mockRejectedValueOnce(new Error('Storage error'))
      const key = await getApiKey('nvd')
      expect(key).toBeNull()
    })

    it('should return null when success is false', async () => {
      vi.mocked(getPlatform().secureStorage.getApiKey).mockResolvedValue({
        success: false,
      })

      const key = await getApiKey('nvd')
      expect(key).toBeNull()
    })

    it('should handle osv key type', async () => {
      vi.mocked(getPlatform().secureStorage.getApiKey).mockResolvedValue({
        success: true,
        apiKey: 'test-osv-key',
      })

      const key = await getApiKey('osv')
      expect(key).toBe('test-osv-key')
      expect(getPlatform().secureStorage.getApiKey).toHaveBeenCalledWith({ keyType: 'osv' })
    })

    it('should handle github key type', async () => {
      vi.mocked(getPlatform().secureStorage.getApiKey).mockResolvedValue({
        success: true,
        apiKey: 'test-github-key',
      })

      const key = await getApiKey('github')
      expect(key).toBe('test-github-key')
      expect(getPlatform().secureStorage.getApiKey).toHaveBeenCalledWith({ keyType: 'github' })
    })
  })

  describe('setApiKey', () => {
    it('should store API key in secure storage', async () => {
      vi.mocked(getPlatform().secureStorage.setApiKey).mockResolvedValue({ success: true })

      const result = await setApiKey('nvd', 'new-api-key')
      expect(result).toBe(true)
      expect(getPlatform().secureStorage.setApiKey).toHaveBeenCalledWith({
        keyType: 'nvd',
        apiKey: 'new-api-key',
      })
    })

    it('should handle storage errors', async () => {
      vi.mocked(getPlatform().secureStorage.setApiKey).mockResolvedValueOnce({ success: false })
      const result = await setApiKey('nvd', 'new-api-key')
      expect(result).toBe(false)
    })

    it('should handle thrown errors', async () => {
      vi.mocked(getPlatform().secureStorage.setApiKey).mockRejectedValueOnce(new Error('Write failed'))
      const result = await setApiKey('nvd', 'key')
      expect(result).toBe(false)
    })

    it('should store osv key', async () => {
      vi.mocked(getPlatform().secureStorage.setApiKey).mockResolvedValue({ success: true })

      const result = await setApiKey('osv', 'osv-key')
      expect(result).toBe(true)
      expect(getPlatform().secureStorage.setApiKey).toHaveBeenCalledWith({
        keyType: 'osv',
        apiKey: 'osv-key',
      })
    })
  })

  describe('deleteApiKey', () => {
    it('should delete API key from secure storage', async () => {
      vi.mocked(getPlatform().secureStorage.deleteApiKey).mockResolvedValue({ success: true })

      const result = await deleteApiKey('nvd')
      expect(result).toBe(true)
      expect(getPlatform().secureStorage.deleteApiKey).toHaveBeenCalledWith({ keyType: 'nvd' })
    })

    it('should handle delete failure', async () => {
      vi.mocked(getPlatform().secureStorage.deleteApiKey).mockResolvedValueOnce({ success: false })
      const result = await deleteApiKey('nvd')
      expect(result).toBe(false)
    })

    it('should handle thrown errors', async () => {
      vi.mocked(getPlatform().secureStorage.deleteApiKey).mockRejectedValueOnce(new Error('Delete failed'))
      const result = await deleteApiKey('nvd')
      expect(result).toBe(false)
    })
  })

  describe('hasApiKey', () => {
    it('should check if API key exists', async () => {
      vi.mocked(getPlatform().secureStorage.hasApiKey).mockResolvedValue({ success: true, hasKey: true })

      const result = await hasApiKey('nvd')
      expect(result).toBe(true)
      expect(getPlatform().secureStorage.hasApiKey).toHaveBeenCalledWith({ keyType: 'nvd' })
    })

    it('should return false when hasKey is false', async () => {
      vi.mocked(getPlatform().secureStorage.hasApiKey).mockResolvedValue({ success: true, hasKey: false })

      const result = await hasApiKey('nvd')
      expect(result).toBe(false)
    })

    it('should return false when success is false', async () => {
      vi.mocked(getPlatform().secureStorage.hasApiKey).mockResolvedValue({ success: false })

      const result = await hasApiKey('nvd')
      expect(result).toBe(false)
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(getPlatform().secureStorage.hasApiKey).mockRejectedValueOnce(new Error('Check failed'))

      const result = await hasApiKey('nvd')
      expect(result).toBe(false)
    })
  })

  describe('getAllApiKeys', () => {
    it('should retrieve all stored API keys', async () => {
      vi.mocked(getPlatform().secureStorage.getAllKeys).mockResolvedValue({
        success: true,
        keys: {
          nvd: 'test-nvd-key',
          osv: 'test-osv-key',
          github: 'test-github-key',
        },
      })

      const keys = await getAllApiKeys()
      expect(keys).toEqual({
        nvd: 'test-nvd-key',
        osv: 'test-osv-key',
        github: 'test-github-key',
      })
    })

    it('should return null values on error', async () => {
      vi.mocked(getPlatform().secureStorage.getAllKeys).mockRejectedValueOnce(new Error('Storage error'))
      const keys = await getAllApiKeys()
      expect(keys).toEqual({
        nvd: null,
        osv: null,
        github: null,
      })
    })

    it('should return null values when success is false', async () => {
      vi.mocked(getPlatform().secureStorage.getAllKeys).mockResolvedValue({ success: false })
      const keys = await getAllApiKeys()
      expect(keys).toEqual({
        nvd: null,
        osv: null,
        github: null,
      })
    })
  })

  describe('isSecureStorageAvailable', () => {
    it('should check secure storage availability', async () => {
      vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({ success: true, isAvailable: true })

      const result = await isSecureStorageAvailable()
      expect(result).toBe(true)
      expect(getPlatform().secureStorage.isAvailable).toHaveBeenCalled()
    })

    it('should return false when isAvailable is false', async () => {
      vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({ success: true, isAvailable: false })

      const result = await isSecureStorageAvailable()
      expect(result).toBe(false)
    })

    it('should return false when success is false', async () => {
      vi.mocked(getPlatform().secureStorage.isAvailable).mockResolvedValue({ success: false })

      const result = await isSecureStorageAvailable()
      expect(result).toBe(false)
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(getPlatform().secureStorage.isAvailable).mockRejectedValueOnce(new Error('Availability check failed'))

      const result = await isSecureStorageAvailable()
      expect(result).toBe(false)
    })
  })

  describe('needsMigration', () => {
    it('should check if migration is needed', async () => {
      vi.mocked(getPlatform().secureStorage.needsMigration).mockResolvedValue({ success: true, needsMigration: false })

      const result = await needsMigration()
      expect(result).toBe(false)
      expect(getPlatform().secureStorage.needsMigration).toHaveBeenCalled()
    })

    it('should return true when migration is needed', async () => {
      vi.mocked(getPlatform().secureStorage.needsMigration).mockResolvedValue({ success: true, needsMigration: true })

      const result = await needsMigration()
      expect(result).toBe(true)
    })

    it('should return false when success is false', async () => {
      vi.mocked(getPlatform().secureStorage.needsMigration).mockResolvedValue({ success: false, needsMigration: true })

      const result = await needsMigration()
      expect(result).toBe(false)
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(getPlatform().secureStorage.needsMigration).mockRejectedValueOnce(new Error('Migration check failed'))

      const result = await needsMigration()
      expect(result).toBe(false)
    })
  })

  describe('migrateKeys', () => {
    it('should migrate keys to secure storage', async () => {
      vi.mocked(getPlatform().secureStorage.migrateKeys).mockResolvedValue({ success: true, migratedCount: 1 })

      const result = await migrateKeys()
      expect(result).toBe(true)
      expect(getPlatform().secureStorage.migrateKeys).toHaveBeenCalled()
    })

    it('should return false when migration fails', async () => {
      vi.mocked(getPlatform().secureStorage.migrateKeys).mockResolvedValue({ success: false })

      const result = await migrateKeys()
      expect(result).toBe(false)
    })

    it('should handle errors gracefully', async () => {
      vi.mocked(getPlatform().secureStorage.migrateKeys).mockRejectedValueOnce(new Error('Migration failed'))

      const result = await migrateKeys()
      expect(result).toBe(false)
    })
  })
})
