/**
 * Storage Types for IPC
 * Types for secure storage communication between main and renderer processes
 */

// Storage IPC types - no Electron imports needed for type definitions

export enum STORAGE_IPC_CHANNELS {
  // Check if secure storage is available
  IS_AVAILABLE = 'storage-is-available',

  // Store an API key securely
  SET_API_KEY = 'storage-set-api-key',

  // Retrieve an API key
  GET_API_KEY = 'storage-get-api-key',

  // Delete an API key
  DELETE_API_KEY = 'storage-delete-api-key',

  // Check if a key exists
  HAS_API_KEY = 'storage-has-api-key',

  // Check if migration is needed
  NEEDS_MIGRATION = 'storage-needs-migration',

  // Migrate plaintext keys to secure storage
  MIGRATE_KEYS = 'storage-migrate-keys',

  // Get all stored API keys
  GET_ALL_KEYS = 'storage-get-all-keys',
}

export type ApiKeyType = 'nvd' | 'osv' | 'github'

export interface SetApiKeyRequest {
  keyType: ApiKeyType
  apiKey: string
}

export interface GetApiKeyRequest {
  keyType: ApiKeyType
}

export interface DeleteApiKeyRequest {
  keyType: ApiKeyType
}

export interface HasApiKeyRequest {
  keyType: ApiKeyType
}

export interface SetApiKeyResponse {
  success: boolean
  error?: string
}

export interface GetApiKeyResponse {
  success: boolean
  apiKey: string | null
  error?: string
}

export interface DeleteApiKeyResponse {
  success: boolean
  error?: string
}

export interface HasApiKeyResponse {
  success: boolean
  hasKey: boolean
  error?: string
}

export interface NeedsMigrationResponse {
  success: boolean
  needsMigration: boolean
  error?: string
}

export interface MigrateKeysResponse {
  success: boolean
  migrated: string[]
  failed: string[]
  error?: string
}

export interface GetAllKeysResponse {
  success: boolean
  keys: {
    nvd: string | null
    osv: string | null
    github: string | null
  }
  error?: string
}

export interface IsAvailableResponse {
  success: boolean
  isAvailable: boolean
}

/**
 * Storage API for renderer process
 */
export interface StorageAPI {
  isAvailable(): Promise<IsAvailableResponse>
  setApiKey(request: SetApiKeyRequest): Promise<SetApiKeyResponse>
  getApiKey(request: GetApiKeyRequest): Promise<GetApiKeyResponse>
  deleteApiKey(request: DeleteApiKeyRequest): Promise<DeleteApiKeyResponse>
  hasApiKey(request: HasApiKeyRequest): Promise<HasApiKeyResponse>
  needsMigration(): Promise<NeedsMigrationResponse>
  migrateKeys(): Promise<MigrateKeysResponse>
  getAllKeys(): Promise<GetAllKeysResponse>
}
