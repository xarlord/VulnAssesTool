/**
 * Secure Storage Types
 * Types for secure storage operations
 */

export interface SecureStorageOptions {
  /**
   * Service name for key storage (used by keytar/electron.safeStorage)
   */
  service: string

  /**
   * Account name for the key
   */
  account: string
}

export interface ApiKeyStorage {
  /**
   * Store an API key securely
   */
  setApiKey(key: string): Promise<boolean>

  /**
   * Retrieve an API key
   */
  getApiKey(): Promise<string | null>

  /**
   * Delete an API key
   */
  deleteApiKey(): Promise<boolean>

  /**
   * Check if a key exists
   */
  hasApiKey(): Promise<boolean>
}

export type ApiKeyType = 'nvd' | 'osv' | 'github'

/**
 * Migration result for migrating plaintext keys to secure storage
 */
export interface MigrationResult {
  success: boolean
  migratedKeys: ApiKeyType[]
  failedKeys: ApiKeyType[]
  errors: Map<ApiKeyType, string>
}
