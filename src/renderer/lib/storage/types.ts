/**
 * Storage Types
 * Types for secure storage operations
 */

export type ApiKeyType = 'nvd' | 'osv' | 'github'

export type ApiKeyKeyType = 'nvdApiKey' | 'osvApiKey' | 'githubApiKey'

export interface SecureStorageResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}
