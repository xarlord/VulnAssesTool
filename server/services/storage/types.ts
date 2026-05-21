export interface SecureStorageOptions {
  service: string
  account: string
}

export interface ApiKeyStorage {
  setApiKey(key: string): Promise<boolean>
  getApiKey(): Promise<string | null>
  deleteApiKey(): Promise<boolean>
  hasApiKey(): Promise<boolean>
}

export type ApiKeyType = 'nvd' | 'osv' | 'github'

export interface MigrationResult {
  success: boolean
  migratedKeys: ApiKeyType[]
  failedKeys: ApiKeyType[]
  errors: Map<ApiKeyType, string>
}
