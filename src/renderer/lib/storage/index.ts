/**
 * Secure Key Service (Renderer Process)
 * Provides a secure interface for storing and retrieving API keys
 */

import type { ApiKeyType } from './types'

export interface SecureKeyService {
  /**
   * Check if secure storage is available
   */
  isAvailable(): Promise<boolean>

  /**
   * Store an API key securely
   */
  setApiKey(keyType: ApiKeyType, apiKey: string): Promise<boolean>

  /**
   * Retrieve an API key
   */
  getApiKey(keyType: ApiKeyType): Promise<string | null>

  /**
   * Delete an API key
   */
  deleteApiKey(keyType: ApiKeyType): Promise<boolean>

  /**
   * Check if a key exists
   */
  hasApiKey(keyType: ApiKeyType): Promise<boolean>

  /**
   * Check if migration is needed (keys stored in plaintext)
   */
  needsMigration(): Promise<boolean>

  /**
   * Migrate plaintext keys to secure storage
   */
  migrateKeys(plaintextKeys: Partial<Record<ApiKeyKeyType, string>>): Promise<{
    success: boolean
    migrated: string[]
    failed: string[]
  }>

  /**
   * Get all stored API keys
   */
  getAllKeys(): Promise<Partial<Record<ApiKeyType, string | null>>>
}

export type ApiKeyType = 'nvd' | 'osv' | 'github'
export type ApiKeyKeyType = 'nvdApiKey' | 'osvApiKey' | 'githubApiKey'

/**
 * Map ApiKeyType to the settings key name
 */
export function getKeyTypeSettingName(keyType: ApiKeyType): ApiKeyKeyType {
  const map: Record<ApiKeyType, ApiKeyKeyType> = {
    nvd: 'nvdApiKey',
    osv: 'osvApiKey',
    github: 'githubApiKey',
  }
  return map[keyType]
}

/**
 * Create secure key service using Electron API
 */
export function createSecureKeyService(): SecureKeyService {
  const electronAPI = (window as any).electronAPI

  if (!electronAPI || !electronAPI.secureStorage) {
    console.warn('Electron secureStorage API not available, using fallback')
    return createFallbackService()
  }

  return {
    async isAvailable(): Promise<boolean> {
      try {
        const result = await electronAPI.secureStorage.isAvailable()
        return result.isAvailable
      } catch {
        return false
      }
    },

    async setApiKey(keyType: ApiKeyType, apiKey: string): Promise<boolean> {
      try {
        const result = await electronAPI.secureStorage.setApiKey({ keyType, apiKey })
        return result.success
      } catch {
        return false
      }
    },

    async getApiKey(keyType: ApiKeyType): Promise<string | null> {
      try {
        const result = await electronAPI.secureStorage.getApiKey({ keyType })
        if (!result.success) {
          return null
        }
        return result.apiKey
      } catch {
        return null
      }
    },

    async deleteApiKey(keyType: ApiKeyType): Promise<boolean> {
      try {
        const result = await electronAPI.secureStorage.deleteApiKey({ keyType })
        return result.success
      } catch {
        return false
      }
    },

    async hasApiKey(keyType: ApiKeyType): Promise<boolean> {
      try {
        const result = await electronAPI.secureStorage.hasApiKey({ keyType })
        if (!result.success) {
          return false
        }
        return result.hasKey
      } catch {
        return false
      }
    },

    async needsMigration(): Promise<boolean> {
      try {
        const result = await electronAPI.secureStorage.needsMigration()
        if (!result.success) {
          return false
        }
        return result.needsMigration
      } catch {
        return false
      }
    },

    async migrateKeys(plaintextKeys: Partial<Record<ApiKeyKeyType, string>>): Promise<{
      success: boolean
      migrated: string[]
      failed: string[]
    }> {
      try {
        // First, check if secure storage is available
        const available = await this.isAvailable()
        if (!available) {
          return { success: false, migrated: [], failed: [] }
        }

        const migrated: string[] = []
        const failed: string[] = []

        // Migrate each key type
        for (const [settingName, keyValue] of Object.entries(plaintextKeys)) {
          if (!keyValue) continue

          // Map settings key name to key type
          const keyTypeMap: Record<string, ApiKeyType> = {
            nvdApiKey: 'nvd',
            osvApiKey: 'osv',
            githubApiKey: 'github',
          }

          const keyType = keyTypeMap[settingName]
          if (!keyType) continue

          const success = await this.setApiKey(keyType, keyValue)
          if (success) {
            migrated.push(keyType)
          } else {
            failed.push(keyType)
          }
        }

        return { success: failed.length === 0, migrated, failed }
      } catch (error) {
        console.error('Failed to migrate keys:', error)
        return { success: false, migrated: [], failed: [] }
      }
    },

    async getAllKeys(): Promise<Partial<Record<ApiKeyType, string | null>>> {
      try {
        const result = await electronAPI.secureStorage.getAllKeys()
        if (!result.success) {
          return { nvd: null, osv: null, github: null }
        }
        return result.keys
      } catch {
        return { nvd: null, osv: null, github: null }
      }
    },
  }
}

/**
 * Fallback service for when Electron API is not available (e.g., in browser dev mode)
 */
function createFallbackService(): SecureKeyService {
  const storageKey = 'vuln-assess-apikeys-fallback'

  return {
    async isAvailable(): Promise<boolean> {
      return false
    },

    async setApiKey(keyType: ApiKeyType, apiKey: string): Promise<boolean> {
      try {
        const stored = localStorage.getItem(storageKey)
        const keys = stored ? JSON.parse(stored) : {}
        keys[keyType] = apiKey
        localStorage.setItem(storageKey, JSON.stringify(keys))
        return true
      } catch {
        return false
      }
    },

    async getApiKey(keyType: ApiKeyType): Promise<string | null> {
      try {
        const stored = localStorage.getItem(storageKey)
        if (!stored) return null
        const keys = JSON.parse(stored)
        return keys[keyType] || null
      } catch {
        return null
      }
    },

    async deleteApiKey(keyType: ApiKeyType): Promise<boolean> {
      try {
        const stored = localStorage.getItem(storageKey)
        if (!stored) return true
        const keys = JSON.parse(stored)
        delete keys[keyType]
        localStorage.setItem(storageKey, JSON.stringify(keys))
        return true
      } catch {
        return false
      }
    },

    async hasApiKey(keyType: ApiKeyType): Promise<boolean> {
      const key = await this.getApiKey(keyType)
      return key !== null && key.length > 0
    },

    async needsMigration(): Promise<boolean> {
      return false
    },

    async migrateKeys(): Promise<{
      success: boolean
      migrated: string[]
      failed: string[]
    }> {
      return { success: false, migrated: [], failed: [] }
    },

    async getAllKeys(): Promise<Partial<Record<ApiKeyType, string | null>>> {
      try {
        const stored = localStorage.getItem(storageKey)
        if (!stored) return { nvd: null, osv: null, github: null }
        return JSON.parse(stored)
      } catch {
        return { nvd: null, osv: null, github: null }
      }
    },
  }
}

// Global instance
let globalSecureKeyService: SecureKeyService | null = null

/**
 * Get the global secure key service instance
 */
export function getSecureKeyService(): SecureKeyService {
  if (!globalSecureKeyService) {
    globalSecureKeyService = createSecureKeyService()
  }
  return globalSecureKeyService
}
