/**
 * Secure Storage Service
 * Provides encrypted storage for API keys using Electron's safeStorage API
 *
 * This service uses Electron's built-in safeStorage encryption which leverages
 * platform-specific secure storage (DPAPI on Windows, Keychain on macOS, libsecret on Linux)
 */

import { safeStorage, app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ApiKeyStorage, SecureStorageOptions } from './types.js'

const SERVICE_NAME = 'com.vulnasstool.apikeys'
const ENCRYPTION_PREFIX = 'enc:'

// Simple JSON file storage (replaces electron-store)
// Lazily initialized to avoid calling app.getPath() before app is ready
class SimpleStore {
  private filePath: string | null = null
  private data: Record<string, string> = {}
  private initialized = false

  constructor(private name: string) {}

  private init(): void {
    if (this.initialized) return

    try {
      const userDataPath = app.getPath('userData')
      this.filePath = path.join(userDataPath, `${this.name}.json`)

      if (existsSync(this.filePath)) {
        const content = readFileSync(this.filePath, 'utf-8')
        this.data = JSON.parse(content)
      }
    } catch (err) {
      console.warn('SimpleStore init error:', err)
      this.data = {}
    }

    this.initialized = true
  }

  private save(): void {
    if (!this.filePath) return
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
    } catch (err) {
      console.error('Failed to save credentials:', err)
    }
  }

  get(key: string): string | undefined {
    this.init()
    return this.data[key]
  }

  set(key: string, value: string): void {
    this.init()
    this.data[key] = value
    this.save()
  }

  delete(key: string): void {
    this.init()
    delete this.data[key]
    this.save()
  }
}

// Lazy credential store - won't be initialized until first use
let credentialStore: SimpleStore | null = null

function getCredentialStore(): SimpleStore {
  if (!credentialStore) {
    credentialStore = new SimpleStore('secure-credentials')
  }
  return credentialStore
}

/**
 * Check if safeStorage is available and enabled
 */
export function isSafeStorageAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

/**
 * Ensure safeStorage is available, throw error if not
 */
function requireSafeStorage(): void {
  if (!isSafeStorageAvailable()) {
    throw new Error(
      'Secure storage is not available on this system. ' +
        'This may require additional system configuration or running in production mode.',
    )
  }
}

/**
 * Encrypt a string using safeStorage
 */
function encryptString(plaintext: string): Buffer {
  requireSafeStorage()
  const buffer = Buffer.from(plaintext, 'utf8')
  return safeStorage.encryptString(buffer.toString('base64'))
}

/**
 * Check if a string is encrypted (has our prefix)
 */
function isEncrypted(value: string): boolean {
  return value.startsWith(ENCRYPTION_PREFIX)
}

/**
 * Add encryption prefix to encrypted value
 */
function addEncryptionPrefix(encrypted: string): string {
  return `${ENCRYPTION_PREFIX}${encrypted}`
}

/**
 * Remove encryption prefix from encrypted value
 */
function removeEncryptionPrefix(value: string): string {
  if (!isEncrypted(value)) {
    return value
  }
  return value.slice(ENCRYPTION_PREFIX.length)
}

/**
 * Secure API Key Storage Implementation
 */
export class SecureApiKeyStorage implements ApiKeyStorage {
  private readonly keyName: string

  constructor(options: SecureStorageOptions) {
    this.keyName = `${options.service}.${options.account}`
  }

  /**
   * Store an API key securely
   */
  async setApiKey(key: string): Promise<boolean> {
    try {
      if (!key || key.trim().length === 0) {
        // Empty key - delete any existing key
        await this.deleteApiKey()
        return true
      }

      // Check if key is already encrypted (migration scenario)
      if (isEncrypted(key)) {
        // Already encrypted, store as-is
        getCredentialStore().set(this.keyName, key)
        return true
      }

      // Encrypt the key
      const encrypted = encryptString(key)
      const encryptedWithPrefix = addEncryptionPrefix(encrypted.toString('base64'))

      // Store in encrypted credential store
      getCredentialStore().set(this.keyName, encryptedWithPrefix)

      return true
    } catch (error) {
      console.error('Failed to store API key securely:', error)
      return false
    }
  }

  /**
   * Retrieve an API key
   */
  async getApiKey(): Promise<string | null> {
    try {
      const stored = getCredentialStore().get(this.keyName)

      if (stored === undefined || stored === null) {
        return null
      }

      // Check if it's encrypted (has prefix)
      if (isEncrypted(stored)) {
        const encryptedBase64 = removeEncryptionPrefix(stored)
        const encrypted = Buffer.from(encryptedBase64, 'base64')
        const decrypted = safeStorage.decryptString(encrypted)
        return Buffer.from(decrypted, 'base64').toString('utf8')
      }

      // Legacy plaintext key - return as-is for migration
      return stored
    } catch (error) {
      console.error('Failed to retrieve API key:', error)
      return null
    }
  }

  /**
   * Delete an API key
   */
  async deleteApiKey(): Promise<boolean> {
    try {
      getCredentialStore().delete(this.keyName)
      return true
    } catch (error) {
      console.error('Failed to delete API key:', error)
      return false
    }
  }

  /**
   * Check if a key exists
   */
  async hasApiKey(): Promise<boolean> {
    try {
      const key = await this.getApiKey()
      return key !== null && key.length > 0
    } catch {
      return false
    }
  }
}

/**
 * Factory function to create secure storage for specific API key type
 */
export function createApiKeyStorage(keyType: 'nvd' | 'osv' | 'github'): ApiKeyStorage {
  return new SecureApiKeyStorage({
    service: SERVICE_NAME,
    account: keyType,
  })
}

/**
 * Get all stored API keys
 */
export async function getAllStoredApiKeys(): Promise<{
  nvd: string | null
  osv: string | null
  github: string | null
}> {
  const results = {
    nvd: null as string | null,
    osv: null as string | null,
    github: null as string | null,
  }

  const nvdStorage = createApiKeyStorage('nvd')
  const osvStorage = createApiKeyStorage('osv')
  const githubStorage = createApiKeyStorage('github')

  results.nvd = await nvdStorage.getApiKey()
  results.osv = await osvStorage.getApiKey()
  results.github = await githubStorage.getApiKey()

  return results
}

/**
 * Check if any keys need migration (are stored in plaintext)
 */
export async function needsMigration(): Promise<boolean> {
  const keys = await getAllStoredApiKeys()

  for (const value of Object.values(keys)) {
    if (value && !isEncrypted(value)) {
      return true
    }
  }

  return false
}

/**
 * Migrate all plaintext keys to encrypted storage
 */
export async function migratePlaintextKeys(): Promise<{
  success: boolean
  migrated: string[]
  failed: string[]
}> {
  const result = {
    success: true,
    migrated: [] as string[],
    failed: [] as string[],
  }

  if (!isSafeStorageAvailable()) {
    result.success = false
    return result
  }

  const keyTypes: Array<'nvd' | 'osv' | 'github'> = ['nvd', 'osv', 'github']

  for (const keyType of keyTypes) {
    try {
      const storage = createApiKeyStorage(keyType)
      const currentValue = await storage.getApiKey()

      // Only migrate if exists and not already encrypted
      if (currentValue && !isEncrypted(currentValue)) {
        const success = await storage.setApiKey(currentValue)
        if (success) {
          result.migrated.push(keyType)
        } else {
          result.failed.push(keyType)
          result.success = false
        }
      }
    } catch (error) {
      console.error(`Failed to migrate ${keyType} key:`, error)
      result.failed.push(keyType)
      result.success = false
    }
  }

  return result
}
