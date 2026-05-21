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
export function validateNvdSearchRequest(request: unknown): NvdSearchRequest {
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  const req = request as Record<string, unknown>
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  // Validate type
  const validTypes = ['cve-id', 'cpe', 'text']
  if (!req.type || typeof req.type !== 'string') {
    throw new ValidationError('Missing or invalid search type', 'type')
  }
  if (!validTypes.includes(req.type)) {
    throw new ValidationError(`Invalid search type. Must be one of: ${validTypes.join(', ')}`, 'type')
  }

  // Validate query
  if (!req.query || typeof req.query !== 'string') {
    throw new ValidationError('Missing or invalid query parameter', 'query')
  }
  if ((req.query as string).length === 0) {
    throw new ValidationError('Query parameter cannot be empty', 'query')
  }
  if ((req.query as string).length > 500) {
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
    if (pattern.test(req.query as string)) {
      throw new ValidationError('Query contains potentially malicious patterns', 'query')
    }
  }

  // Validate CVE ID format for cve-id searches
  // Note: cve-id type should only be used for complete CVE IDs
  // Text searches can also search for CVE-like patterns
  if (req.type === 'cve-id') {
    // Complete CVE ID requires 4-7 digits after the year
    const completeCveIdPattern = /^CVE-\d{4}-\d{4,7}$/i
    if (!completeCveIdPattern.test(req.query as string)) {
      throw new ValidationError(
        'Invalid CVE ID format. Expected CVE-YYYY-NNNNN (4-7 digits after year). For partial CVE searches, use text search type.',
        'query',
      )
    }
  }

  // For text searches, validate that the query doesn't look like a maliciously crafted CVE pattern
  // but allow partial CVE-like patterns for searching
  if (req.type === 'text') {
    // Allow CVE-like patterns but ensure they don't contain injection attempts
    // The general query validation above already checks for SQL injection
  }

  // Validate limit
  if (req.limit !== undefined) {
    const limit = Number(req.limit)
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new ValidationError('Limit must be between 1 and 1000', 'limit')
    }
  }

  // Validate offset
  if (req.offset !== undefined) {
    const offset = Number(req.offset)
    if (isNaN(offset) || offset < 0) {
      throw new ValidationError('Offset must be a non-negative number', 'offset')
    }
  }

  return {
    type: req.type as NvdSearchRequest['type'],
    query: req.query as string,
    limit: req.limit as number | undefined,
    offset: req.offset as number | undefined,
  }
}

/**
 * Validate get CVE request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateGetCveRequest(request: unknown): GetCveRequest {
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  const req = request as Record<string, unknown>

  if (!req.cveId || typeof req.cveId !== 'string') {
    throw new ValidationError('Missing or invalid CVE ID', 'cveId')
  }

  const cveId = (req.cveId as string).trim()
  const cveIdPattern = /^CVE-\d{4}-\d{4,7}$/i

  if (!cveIdPattern.test(cveId)) {
    throw new ValidationError('Invalid CVE ID format. Expected CVE-YYYY-NNNNN', 'cveId')
  }

  return { cveId }
}

/**
 * Validate start sync request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateStartSyncRequest(request: unknown = {}): StartSyncRequest {
  if (request && typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  const req = (request ?? {}) as Record<string, unknown>

  // Validate years array if provided
  if (req.years !== undefined) {
    if (!Array.isArray(req.years)) {
      throw new ValidationError('Years must be an array', 'years')
    }

    const currentYear = new Date().getFullYear()
    for (const year of req.years) {
      const yearNum = Number(year)
      if (isNaN(yearNum) || yearNum < 1999 || yearNum > currentYear + 1) {
        throw new ValidationError(`Invalid year: ${year}. Must be between 1999 and ${currentYear + 1}`, 'years')
      }
    }
  }

  return { force: req.force as boolean | undefined, years: req.years as number[] | undefined }
}

/**
 * Validate set API key request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateSetApiKeyRequest(request: unknown): SetApiKeyRequest {
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  const req = request as Record<string, unknown>

  const validKeyTypes = ['nvd', 'osv', 'github']
  if (!req.keyType || typeof req.keyType !== 'string') {
    throw new ValidationError('Missing or invalid keyType', 'keyType')
  }
  if (!validKeyTypes.includes(req.keyType)) {
    throw new ValidationError(`Invalid keyType. Must be one of: ${validKeyTypes.join(', ')}`, 'keyType')
  }

  if (!req.apiKey || typeof req.apiKey !== 'string') {
    throw new ValidationError('Missing or invalid apiKey', 'apiKey')
  }

  // Trim whitespace from API key
  const apiKey = (req.apiKey as string).trim()

  // Validate NVD API key format (UUID-like)
  if (req.keyType === 'nvd' && apiKey.length > 0) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidPattern.test(apiKey)) {
      throw new ValidationError('NVD API key must be in UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)', 'apiKey')
    }
  }

  // Validate API key length
  if (apiKey.length > 256) {
    throw new ValidationError('API key exceeds maximum length of 256 characters', 'apiKey')
  }

  return { keyType: req.keyType as SetApiKeyRequest['keyType'], apiKey }
}

/**
 * Validate get API key request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateGetApiKeyRequest(request: unknown): GetApiKeyRequest {
  if (!request || typeof request !== 'object') {
    throw new ValidationError('Invalid request structure', 'request')
  }

  const req = request as Record<string, unknown>

  const validKeyTypes = ['nvd', 'osv', 'github']
  if (!req.keyType || typeof req.keyType !== 'string') {
    throw new ValidationError('Missing or invalid keyType', 'keyType')
  }
  if (!validKeyTypes.includes(req.keyType)) {
    throw new ValidationError(`Invalid keyType. Must be one of: ${validKeyTypes.join(', ')}`, 'keyType')
  }

  return { keyType: req.keyType as GetApiKeyRequest['keyType'] }
}

/**
 * Validate delete API key request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateDeleteApiKeyRequest(request: unknown): DeleteApiKeyRequest {
  return validateGetApiKeyRequest(request) as DeleteApiKeyRequest
}

/**
 * Validate has API key request
 *
 * @param request - The request to validate
 * @throws ValidationError if request is invalid
 * @returns Validated request
 */
export function validateHasApiKeyRequest(request: unknown): HasApiKeyRequest {
  return validateGetApiKeyRequest(request) as HasApiKeyRequest
}

/**
 * Validate CPE search request
 *
 * @param request - The CPE search request to validate
 * @returns Object with validated limit and optional error message
 */
export function validateCpeSearchRequest(request: unknown): { limit: number; error?: string } {
  const MAX_PRODUCT_NAME_LENGTH = 256
  const MAX_TOKENS = 20
  const MAX_TOKEN_LENGTH = 128
  const MAX_LIMIT = 1000
  const DEFAULT_LIMIT = 100

  if (!request || typeof request !== 'object') {
    return { limit: DEFAULT_LIMIT, error: 'Invalid request structure' }
  }

  const req = request as Record<string, unknown>

  // Validate productName
  if (req.productName !== undefined) {
    if (typeof req.productName !== 'string') {
      return { limit: DEFAULT_LIMIT, error: 'productName must be a string' }
    }
    if ((req.productName as string).length > MAX_PRODUCT_NAME_LENGTH) {
      return { limit: DEFAULT_LIMIT, error: 'productName exceeds maximum length' }
    }
  }

  // Validate tokens
  if (req.tokens !== undefined) {
    if (!Array.isArray(req.tokens)) {
      return { limit: DEFAULT_LIMIT, error: 'tokens must be an array' }
    }
    if (req.tokens.length > MAX_TOKENS) {
      return { limit: DEFAULT_LIMIT, error: 'Too many tokens' }
    }
    for (const token of req.tokens) {
      if (typeof token !== 'string') {
        return { limit: DEFAULT_LIMIT, error: 'All tokens must be strings' }
      }
      if (token.length > MAX_TOKEN_LENGTH) {
        return { limit: DEFAULT_LIMIT, error: 'Token exceeds maximum length' }
      }
    }
  }

  // Validate limit
  const limit = Math.min(typeof req.limit === 'number' && req.limit > 0 ? req.limit : DEFAULT_LIMIT, MAX_LIMIT)

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
