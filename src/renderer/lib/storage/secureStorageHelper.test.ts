/**
 * Tests for Secure Storage Helper
 * Tests consistent API key access patterns using secure storage IPC
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

// Mock window.electronAPI.secureStorage
const mockSecureStorage = {
  isAvailable: vi.fn(() => Promise.resolve({ success: true, isAvailable: true })),
  setApiKey: vi.fn(() => Promise.resolve({ success: true })),
  getApiKey: vi.fn(({ keyType }: { keyType: string }) =>
    Promise.resolve({
      success: true,
      apiKey: keyType === 'nvd' ? 'test-nvd-key' : null,
    }),
  ),
  deleteApiKey: vi.fn(() => Promise.resolve({ success: true })),
  hasApiKey: vi.fn(() => Promise.resolve({ success: true, hasKey: true })),
  needsMigration: vi.fn(() => Promise.resolve({ success: true, needsMigration: false })),
  migrateKeys: vi.fn(() => Promise.resolve({ success: true, migrated: ['nvd'], failed: [] })),
  getAllKeys: vi.fn(() =>
    Promise.resolve({
      success: true,
      keys: {
        nvd: 'test-nvd-key',
        osv: 'test-osv-key',
        github: 'test-github-key',
      },
    }),
  ),
}

// Setup mocks before each test
beforeEach(() => {
  // Mock window.electronAPI
  Object.defineProperty(global, 'window', {
    value: {
      electronAPI: {
        secureStorage: mockSecureStorage,
      },
    },
    writable: true,
  })

  vi.clearAllMocks()
})

describe('Secure Storage Helper', () => {
  describe('getApiKey', () => {
    it('should retrieve API key from secure storage', async () => {
      const key = await getApiKey('nvd')
      expect(key).toBe('test-nvd-key')
      expect(mockSecureStorage.getApiKey).toHaveBeenCalledWith({ keyType: 'nvd' })
    })

    it('should return null for non-existent key', async () => {
      const key = await getApiKey('osv')
      expect(key).toBeNull()
    })

    it('should handle errors gracefully', async () => {
      mockSecureStorage.getApiKey.mockRejectedValueOnce(new Error('Storage error'))
      const key = await getApiKey('nvd')
      expect(key).toBeNull()
    })
  })

  describe('setApiKey', () => {
    it('should store API key in secure storage', async () => {
      const result = await setApiKey('nvd', 'new-api-key')
      expect(result).toBe(true)
      expect(mockSecureStorage.setApiKey).toHaveBeenCalledWith({
        keyType: 'nvd',
        apiKey: 'new-api-key',
      })
    })

    it('should handle storage errors', async () => {
      mockSecureStorage.setApiKey.mockResolvedValueOnce({ success: false })
      const result = await setApiKey('nvd', 'new-api-key')
      expect(result).toBe(false)
    })
  })

  describe('deleteApiKey', () => {
    it('should delete API key from secure storage', async () => {
      const result = await deleteApiKey('nvd')
      expect(result).toBe(true)
      expect(mockSecureStorage.deleteApiKey).toHaveBeenCalledWith({ keyType: 'nvd' })
    })
  })

  describe('hasApiKey', () => {
    it('should check if API key exists', async () => {
      const result = await hasApiKey('nvd')
      expect(result).toBe(true)
      expect(mockSecureStorage.hasApiKey).toHaveBeenCalledWith({ keyType: 'nvd' })
    })
  })

  describe('getAllApiKeys', () => {
    it('should retrieve all stored API keys', async () => {
      const keys = await getAllApiKeys()
      expect(keys).toEqual({
        nvd: 'test-nvd-key',
        osv: 'test-osv-key',
        github: 'test-github-key',
      })
    })

    it('should return null values on error', async () => {
      mockSecureStorage.getAllKeys.mockRejectedValueOnce(new Error('Storage error'))
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
      const result = await isSecureStorageAvailable()
      expect(result).toBe(true)
      expect(mockSecureStorage.isAvailable).toHaveBeenCalled()
    })
  })

  describe('needsMigration', () => {
    it('should check if migration is needed', async () => {
      const result = await needsMigration()
      expect(result).toBe(false)
      expect(mockSecureStorage.needsMigration).toHaveBeenCalled()
    })
  })

  describe('migrateKeys', () => {
    it('should migrate keys to secure storage', async () => {
      const result = await migrateKeys()
      expect(result).toBe(true)
      expect(mockSecureStorage.migrateKeys).toHaveBeenCalled()
    })
  })
})
