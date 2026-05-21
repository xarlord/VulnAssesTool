/**
 * Secure Key Service (Renderer Process)
 * Provides a secure interface for storing and retrieving API keys
 */

import { getPlatform } from '@/lib/platform'

export interface SecureKeyService {
  isAvailable(): Promise<boolean>
  setApiKey(keyType: ApiKeyType, apiKey: string): Promise<boolean>
  getApiKey(keyType: ApiKeyType): Promise<string | null>
  deleteApiKey(keyType: ApiKeyType): Promise<boolean>
  hasApiKey(keyType: ApiKeyType): Promise<boolean>
  needsMigration(): Promise<boolean>
  migrateKeys(plaintextKeys: Partial<Record<ApiKeyKeyType, string>>): Promise<{
    success: boolean
    migrated: string[]
    failed: string[]
  }>
  getAllKeys(): Promise<Partial<Record<ApiKeyType, string | null>>>
}

export type ApiKeyType = 'nvd' | 'osv' | 'github'
export type ApiKeyKeyType = 'nvdApiKey' | 'osvApiKey' | 'githubApiKey'

export function getKeyTypeSettingName(keyType: ApiKeyType): ApiKeyKeyType {
  const map: Record<ApiKeyType, ApiKeyKeyType> = {
    nvd: 'nvdApiKey',
    osv: 'osvApiKey',
    github: 'githubApiKey',
  }
  return map[keyType]
}

export function createSecureKeyService(): SecureKeyService {
  return {
    async isAvailable(): Promise<boolean> {
      try {
        const result = await getPlatform().secureStorage.isAvailable()
        return result.isAvailable
      } catch {
        return false
      }
    },

    async setApiKey(keyType: ApiKeyType, apiKey: string): Promise<boolean> {
      try {
        const result = await getPlatform().secureStorage.setApiKey({ keyType, apiKey })
        return result.success
      } catch {
        return false
      }
    },

    async getApiKey(keyType: ApiKeyType): Promise<string | null> {
      try {
        const result = await getPlatform().secureStorage.getApiKey({ keyType })
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
        const result = await getPlatform().secureStorage.deleteApiKey({ keyType })
        return result.success
      } catch {
        return false
      }
    },

    async hasApiKey(keyType: ApiKeyType): Promise<boolean> {
      try {
        const result = await getPlatform().secureStorage.hasApiKey({ keyType })
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
        const result = await getPlatform().secureStorage.needsMigration()
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
        const available = await this.isAvailable()
        if (!available) {
          return { success: false, migrated: [], failed: [] }
        }

        const migrated: string[] = []
        const failed: string[] = []

        for (const [settingName, keyValue] of Object.entries(plaintextKeys)) {
          if (!keyValue) continue

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
        const result = await getPlatform().secureStorage.getAllKeys()
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

let globalSecureKeyService: SecureKeyService | null = null

export function getSecureKeyService(): SecureKeyService {
  if (!globalSecureKeyService) {
    globalSecureKeyService = createSecureKeyService()
  }
  return globalSecureKeyService
}
