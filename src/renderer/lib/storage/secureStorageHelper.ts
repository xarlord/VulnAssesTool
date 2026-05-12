/**
 * Secure Storage Helper
 * Provides consistent API key access patterns using secure storage IPC
 * instead of accessing keys directly from settings state.
 */

import { getPlatform } from '@/lib/platform'

/**
 * API key type
 */
export type ApiKeyType = 'nvd' | 'osv' | 'github'

/**
 * Get API key from secure storage
 * This is the preferred method for accessing API keys in the renderer process
 *
 * @param keyType - The type of API key to retrieve
 * @returns The API key or null if not found
 */
export async function getApiKey(keyType: ApiKeyType): Promise<string | null> {
  try {
    const result = await getPlatform().secureStorage.getApiKey({ keyType })
    if (result.success && result.apiKey) {
      return result.apiKey
    }
    return null
  } catch (error) {
    console.error(`Failed to retrieve ${keyType} API key from secure storage:`, error)
    return null
  }
}

/**
 * Set API key in secure storage
 *
 * @param keyType - The type of API key to store
 * @param apiKey - The API key to store
 * @returns true if successful, false otherwise
 */
export async function setApiKey(keyType: ApiKeyType, apiKey: string): Promise<boolean> {
  try {
    const result = await getPlatform().secureStorage.setApiKey({ keyType, apiKey })
    return result.success
  } catch (error) {
    console.error(`Failed to store ${keyType} API key in secure storage:`, error)
    return false
  }
}

/**
 * Delete API key from secure storage
 *
 * @param keyType - The type of API key to delete
 * @returns true if successful, false otherwise
 */
export async function deleteApiKey(keyType: ApiKeyType): Promise<boolean> {
  try {
    const result = await getPlatform().secureStorage.deleteApiKey({ keyType })
    return result.success
  } catch (error) {
    console.error(`Failed to delete ${keyType} API key from secure storage:`, error)
    return false
  }
}

/**
 * Check if API key exists in secure storage
 *
 * @param keyType - The type of API key to check
 * @returns true if key exists, false otherwise
 */
export async function hasApiKey(keyType: ApiKeyType): Promise<boolean> {
  try {
    const result = await getPlatform().secureStorage.hasApiKey({ keyType })
    return result.success && result.hasKey
  } catch (error) {
    console.error(`Failed to check ${keyType} API key in secure storage:`, error)
    return false
  }
}

/**
 * Get all API keys from secure storage
 *
 * @returns Object containing all stored API keys
 */
export async function getAllApiKeys(): Promise<{
  nvd: string | null
  osv: string | null
  github: string | null
}> {
  try {
    const result = await getPlatform().secureStorage.getAllKeys()
    if (result.success) {
      return result.keys
    }
    return { nvd: null, osv: null, github: null }
  } catch (error) {
    console.error('Failed to retrieve all API keys from secure storage:', error)
    return { nvd: null, osv: null, github: null }
  }
}

/**
 * Check if secure storage is available
 *
 * @returns true if secure storage is available, false otherwise
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
  try {
    const result = await getPlatform().secureStorage.isAvailable()
    return result.success && result.isAvailable
  } catch (error) {
    console.error('Failed to check secure storage availability:', error)
    return false
  }
}

/**
 * Check if API keys need migration from old settings to secure storage
 *
 * @returns true if migration is needed, false otherwise
 */
export async function needsMigration(): Promise<boolean> {
  try {
    const result = await getPlatform().secureStorage.needsMigration()
    return result.success && result.needsMigration
  } catch (error) {
    console.error('Failed to check migration status:', error)
    return false
  }
}

/**
 * Migrate API keys from old settings to secure storage
 *
 * @returns true if migration was successful, false otherwise
 */
export async function migrateKeys(): Promise<boolean> {
  try {
    const result = await getPlatform().secureStorage.migrateKeys()
    return result.success
  } catch (error) {
    console.error('Failed to migrate API keys:', error)
    return false
  }
}
