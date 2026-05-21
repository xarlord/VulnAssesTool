/**
 * API Key Migration Utility
 * Handles migration of plaintext API keys to secure storage
 */

import type { AppSettings } from '@@/types'
import { getSecureKeyService, type ApiKeyKeyType } from './index'

/**
 * Check if settings contain plaintext API keys
 * API keys have been migrated to secure storage and are no longer stored in AppSettings.
 */
export function hasPlaintextApiKeys(settings: Partial<AppSettings>): boolean {
  void settings
  return false
}

/**
 * Get all plaintext API keys from settings
 * API keys have been migrated to secure storage and are no longer stored in AppSettings.
 */
export function getPlaintextApiKeys(settings: Partial<AppSettings>): Partial<Record<ApiKeyKeyType, string>> {
  void settings
  return {}
}

/**
 * Migrate API keys from settings to secure storage
 * Returns the settings with API keys removed (should be used to update state)
 */
export async function migrateApiKeysToSecureStorage(settings: AppSettings): Promise<{
  success: boolean
  updatedSettings: Partial<AppSettings>
  migrated: string[]
  failed: string[]
}> {
  const secureKeyService = getSecureKeyService()

  // Check if migration is needed
  const needsMigration = hasPlaintextApiKeys(settings)
  if (!needsMigration) {
    return {
      success: true,
      updatedSettings: {},
      migrated: [],
      failed: [],
    }
  }

  // Check if secure storage is available
  const isAvailable = await secureKeyService.isAvailable()
  if (!isAvailable) {
    console.warn('Secure storage not available, cannot migrate API keys')
    return {
      success: false,
      updatedSettings: {},
      migrated: [],
      failed: [],
    }
  }

  // Get plaintext keys
  const plaintextKeys = getPlaintextApiKeys(settings)

  // Migrate to secure storage
  const result = await secureKeyService.migrateKeys(plaintextKeys)

  // If successful, return updated settings with API keys removed
  if (result.success) {
    const updatedSettings: Partial<AppSettings> = {}
    const apiKeyKeys: ApiKeyKeyType[] = ['nvdApiKey', 'osvApiKey', 'githubApiKey']

    for (const key of apiKeyKeys) {
      if (plaintextKeys[key]) {
        // Set to undefined to remove from settings
        ;(updatedSettings as Record<string, unknown>)[key] = undefined
      }
    }

    return {
      success: true,
      updatedSettings,
      migrated: result.migrated,
      failed: result.failed,
    }
  }

  return {
    success: false,
    updatedSettings: {},
    migrated: result.migrated,
    failed: result.failed,
  }
}

/**
 * Load API key from secure storage (with fallback to settings)
 * Used during transition period
 */
export async function loadApiKeyWithFallback(
  keyType: 'nvd' | 'osv' | 'github',
  settingsKeyValue: string | undefined,
): Promise<string | undefined> {
  const secureKeyService = getSecureKeyService()

  // Try secure storage first
  const isAvailable = await secureKeyService.isAvailable()
  if (isAvailable) {
    const secureKey = await secureKeyService.getApiKey(keyType)
    if (secureKey) {
      return secureKey
    }
  }

  // Fall back to settings value (for migration)
  return settingsKeyValue
}
