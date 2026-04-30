/**
 * IPC Request Validation Module
 * Provides validation functions for IPC request structures to prevent
 * invalid or malicious requests from reaching database operations.
 */

import type { NvdSearchRequest, GetCveRequest, StartSyncRequest } from '../types/database.js'
import type { SetApiKeyRequest, GetApiKeyRequest, DeleteApiKeyRequest, HasApiKeyRequest } from '../types/storage.js'

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Validate NVD search request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateNvdSearchRequest(request: any): NvdSearchRequest {
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  // Validate type
  const validTypes = ['cve-id', 'cpe', 'text']
  if (!request.type || typeof request.type !== 'string') {
    throw new ValidationError('Missing or invalid search type', 'type')
  }
  if (!validTypes.includes(request.type)) {
    throw new ValidationError(`Invalid search type. Must be one of: ${validTypes.join(', ')}`, 'type')
  }

  // Validate query
  if (!request.query || typeof request.query !== 'string') {
    throw new ValidationError('Missing or invalid query parameter', 'query')
  }
  if (request.query.length === 0) {
    throw new ValidationError('Query parameter cannot be empty', 'query')
  }
  if (request.query.length > 500) {
    throw new ValidationError('Query parameter exceeds maximum length of 500 characters', 'query')
  }

  // Check for SQL injection patterns in query
  // Note: CPE strings and component names often contain hyphens, so we avoid
  // patterns that would incorrectly flag legitimate queries like "some-component-name"
  const dangerousPatterns = [
    /(;)\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC)/gi, // SQL statement injection
    /(\/\*)|(\*\/)/gi, // Multi-line comments
    /(\b(OR|AND)\s+[\d\s]+=)/gi, // Boolean-based injection (with number comparison)
    /(')\s*(OR|AND)\s+/gi, // Quote-based injection
    /(\\x[0-9a-f]{2})/gi, // Hex escape sequences
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(request.query)) {
      throw new ValidationError('Query contains potentially malicious patterns', 'query')
    }
  }

  // Validate CVE ID format for cve-id searches
  // Note: cve-id type should only be used for complete CVE IDs
  // Text searches can also search for CVE-like patterns
  if (request.type === 'cve-id') {
    // Complete CVE ID requires 4-7 digits after the year
    const completeCveIdPattern = /^CVE-\d{4}-\d{4,7}$/i
    if (!completeCveIdPattern.test(request.query)) {
      throw new ValidationError(
        'Invalid CVE ID format. Expected CVE-YYYY-NNNNN (4-7 digits after year). For partial CVE searches, use text search type.',
        'query',
      )
    }
  }

  // For text searches, validate that the query doesn't look like a maliciously crafted CVE pattern
  // but allow partial CVE-like patterns for searching
  if (request.type === 'text') {
    // Allow CVE-like patterns but ensure they don't contain injection attempts
    // The general query validation above already checks for SQL injection
  }

  // Validate limit
  if (request.limit !== undefined) {
    const limit = Number(request.limit)
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new ValidationError('Limit must be between 1 and 1000', 'limit')
    }
  }

  // Validate offset
  if (request.offset !== undefined) {
    const offset = Number(request.offset)
    if (isNaN(offset) || offset < 0) {
      throw new ValidationError('Offset must be a non-negative number', 'offset')
    }
  }

  return request as NvdSearchRequest
}

/**
 * Validate get CVE request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateGetCveRequest(request: any): GetCveRequest {
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  if (!request.cveId || typeof request.cveId !== 'string') {
    throw new ValidationError('Missing or invalid CVE ID', 'cveId')
  }

  const cveId = request.cveId.trim()
  const cveIdPattern = /^CVE-\d{4}-\d{4,7}$/i

  if (!cveIdPattern.test(cveId)) {
    throw new ValidationError('Invalid CVE ID format. Expected CVE-YYYY-NNNNN', 'cveId')
  }

  return { cveId } as GetCveRequest
}

/**
 * Validate start sync request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateStartSyncRequest(request: any = {}): StartSyncRequest {
  if (request && typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  // Validate years array if provided
  if (request.years !== undefined) {
    if (!Array.isArray(request.years)) {
      throw new ValidationError('Years must be an array', 'years')
    }

    const currentYear = new Date().getFullYear()
    for (const year of request.years) {
      const yearNum = Number(year)
      if (isNaN(yearNum) || yearNum < 1999 || yearNum > currentYear + 1) {
        throw new ValidationError(`Invalid year: ${year}. Must be between 1999 and ${currentYear + 1}`, 'years')
      }
    }
  }

  return request as StartSyncRequest
}

/**
 * Validate set API key request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateSetApiKeyRequest(request: any): SetApiKeyRequest {
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  const validKeyTypes = ['nvd', 'osv', 'github']
  if (!request.keyType || typeof request.keyType !== 'string') {
    throw new ValidationError('Missing or invalid keyType', 'keyType')
  }
  if (!validKeyTypes.includes(request.keyType)) {
    throw new ValidationError(`Invalid keyType. Must be one of: ${validKeyTypes.join(', ')}`, 'keyType')
  }

  if (!request.apiKey || typeof request.apiKey !== 'string') {
    throw new ValidationError('Missing or invalid apiKey', 'apiKey')
  }

  // Trim whitespace from API key
  const apiKey = request.apiKey.trim()

  // Validate NVD API key format (UUID-like)
  if (request.keyType === 'nvd' && apiKey.length > 0) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidPattern.test(apiKey)) {
      throw new ValidationError('NVD API key must be in UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)', 'apiKey')
    }
  }

  // Validate API key length
  if (apiKey.length > 256) {
    throw new ValidationError('API key exceeds maximum length of 256 characters', 'apiKey')
  }

  return { keyType: request.keyType, apiKey } as SetApiKeyRequest
}

/**
 * Validate get API key request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateGetApiKeyRequest(request: any): GetApiKeyRequest {
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  const validKeyTypes = ['nvd', 'osv', 'github']
  if (!request.keyType || typeof request.keyType !== 'string') {
    throw new ValidationError('Missing or invalid keyType', 'keyType')
  }
  if (!validKeyTypes.includes(request.keyType)) {
    throw new ValidationError(`Invalid keyType. Must be one of: ${validKeyTypes.join(', ')}`, 'keyType')
  }

  return request as GetApiKeyRequest
}

/**
 * Validate delete API key request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateDeleteApiKeyRequest(request: any): DeleteApiKeyRequest {
  return validateGetApiKeyRequest(request) as DeleteApiKeyRequest
}

/**
 * Validate has API key request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateHasApiKeyRequest(request: any): HasApiKeyRequest {
  return validateGetApiKeyRequest(request) as HasApiKeyRequest
}

/**
 * Validate CPE search request
 *
 * @param request - The CPE search request to validate
 * @returns Object with validated limit and optional error message
 */
export function validateCpeSearchRequest(request: any): { limit: number; error?: string } {
  const MAX_PRODUCT_NAME_LENGTH = 256
  const MAX_TOKENS = 20
  const MAX_TOKEN_LENGTH = 128
  const MAX_LIMIT = 1000
  const DEFAULT_LIMIT = 100

  // Validate productName
  if (request.productName !== undefined) {
    if (typeof request.productName !== 'string') {
      return { limit: DEFAULT_LIMIT, error: 'productName must be a string' }
    }
    if (request.productName.length > MAX_PRODUCT_NAME_LENGTH) {
      return { limit: DEFAULT_LIMIT, error: 'productName exceeds maximum length' }
    }
  }

  // Validate tokens
  if (request.tokens !== undefined) {
    if (!Array.isArray(request.tokens)) {
      return { limit: DEFAULT_LIMIT, error: 'tokens must be an array' }
    }
    if (request.tokens.length > MAX_TOKENS) {
      return { limit: DEFAULT_LIMIT, error: 'Too many tokens' }
    }
    for (const token of request.tokens) {
      if (typeof token !== 'string') {
        return { limit: DEFAULT_LIMIT, error: 'All tokens must be strings' }
      }
      if (token.length > MAX_TOKEN_LENGTH) {
        return { limit: DEFAULT_LIMIT, error: 'Token exceeds maximum length' }
      }
    }
  }

  // Validate limit
  const limit = Math.min(
    typeof request.limit === 'number' && request.limit > 0 ? request.limit : DEFAULT_LIMIT,
    MAX_LIMIT,
  )

  return { limit }
}

/**
 * Sanitize error messages for user-facing output
 * Prevents information disclosure via error messages
 *
 * @param error - The error to sanitize
 * @returns User-friendly error message
 */
export function sanitizeErrorMessage(error: unknown): string {
  // Log detailed error for debugging (in development)
  if (process.env.NODE_ENV !== 'production') {
    console.error('Detailed error:', error)
  }

  // Return user-friendly messages for known errors
  if (error instanceof ValidationError) {
    return error.message
  }

  if (error instanceof Error) {
    // Map specific error types to user-friendly messages
    const errorMessages: Record<string, string> = {
      DATABASE_NOT_INITIALIZED: 'Database is not ready. Please restart the application.',
      DATABASE_LOCKED: 'Database is busy. Please try again.',
      INVALID_CVE_FORMAT: 'Invalid CVE ID format.',
      INVALID_CPE_FORMAT: 'Invalid CPE format.',
      SEARCH_FAILED: 'Search failed. Please try again.',
      SYNC_IN_PROGRESS: 'A sync is already in progress.',
      NETWORK_ERROR: 'Network connection failed. Please check your internet.',
    }

    return errorMessages[error.message] || 'An unexpected error occurred.'
  }

  return 'An unexpected error occurred.'
}
