/**
 * Secure Storage Module
 * Central export point for all secure storage functionality
 */

export {
  isSafeStorageAvailable,
  createApiKeyStorage,
  getAllStoredApiKeys,
  needsMigration,
  migratePlaintextKeys,
  type SecureApiKeyStorage,
} from './secureStorage.js'

export type { ApiKeyStorage, SecureStorageOptions, ApiKeyType, MigrationResult } from './types.js'
