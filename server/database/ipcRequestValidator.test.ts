/**
 * Tests for IPC Request Validator
 * Tests request validation for SQL injection prevention
 */

import { describe, it, expect } from 'vitest'
import {
  validateNvdSearchRequest,
  validateGetCveRequest,
  validateStartSyncRequest,
  validateSetApiKeyRequest,
  validateGetApiKeyRequest,
  validateDeleteApiKeyRequest,
  validateHasApiKeyRequest,
  validateCpeSearchRequest,
  sanitizeErrorMessage,
  ValidationError,
} from './ipcRequestValidator'

describe('IPC Request Validator', () => {
  describe('validateNvdSearchRequest', () => {
    it('should accept valid CVE ID search', () => {
      const request = {
        type: 'cve-id',
        query: 'CVE-2021-12345',
        limit: 10,
        offset: 0,
      }
      expect(validateNvdSearchRequest(request)).toEqual(request)
    })

    it('should accept valid CPE search', () => {
      const request = {
        type: 'cpe',
        query: 'cpe:2.3:a:vendor:product:1.0',
      }
      expect(validateNvdSearchRequest(request)).toEqual(request)
    })

    it('should accept valid text search', () => {
      const request = {
        type: 'text',
        query: 'apache',
      }
      expect(validateNvdSearchRequest(request)).toEqual(request)
    })

    it('should reject invalid search type', () => {
      const request = {
        type: 'invalid-type',
        query: 'test',
      }
      expect(() => validateNvdSearchRequest(request)).toThrow(ValidationError)
    })

    it('should reject empty query', () => {
      const request = {
        type: 'text',
        query: '',
      }
      expect(() => validateNvdSearchRequest(request)).toThrow(ValidationError)
    })

    it('should reject query exceeding max length', () => {
      const request = {
        type: 'text',
        query: 'a'.repeat(501),
      }
      expect(() => validateNvdSearchRequest(request)).toThrow(ValidationError)
    })

    it('should reject SQL injection patterns in query', () => {
      // Note: Component names often contain hyphens, so -- and # patterns are not blocked
      const sqlInjectionAttempts = [
        { type: 'text' as const, query: "test'; DROP TABLE users;--" },
        { type: 'text' as const, query: "test' OR '1'='1" },
        { type: 'text' as const, query: "test' AND 1=1--" },
        { type: 'text' as const, query: 'test/*comment*/' },
        { type: 'text' as const, query: "test'; SELECT * FROM users" },
      ]

      for (const attempt of sqlInjectionAttempts) {
        expect(() => validateNvdSearchRequest(attempt)).toThrow(ValidationError)
      }
    })

    it('should reject invalid CVE ID format', () => {
      const request = {
        type: 'cve-id',
        query: 'INVALID-CVE-FORMAT',
      }
      expect(() => validateNvdSearchRequest(request)).toThrow(ValidationError)
    })

    it('should reject invalid limit', () => {
      const request = {
        type: 'text',
        query: 'test',
        limit: 2000,
      }
      expect(() => validateNvdSearchRequest(request)).toThrow(ValidationError)
    })

    it('should reject negative offset', () => {
      const request = {
        type: 'text',
        query: 'test',
        offset: -1,
      }
      expect(() => validateNvdSearchRequest(request)).toThrow(ValidationError)
    })
  })

  describe('validateGetCveRequest', () => {
    it('should accept valid CVE ID', () => {
      const request = { cveId: 'CVE-2021-12345' }
      expect(validateGetCveRequest(request)).toEqual(request)
    })

    it('should accept CVE ID with 4-digit suffix', () => {
      const request = { cveId: 'CVE-2021-1234' }
      expect(validateGetCveRequest(request)).toEqual(request)
    })

    it('should accept CVE ID with 7-digit suffix', () => {
      const request = { cveId: 'CVE-2021-1234567' }
      expect(validateGetCveRequest(request)).toEqual(request)
    })

    it('should reject invalid CVE ID format', () => {
      const invalidFormats = [
        { cveId: 'INVALID' },
        { cveId: 'CVE-21-12345' },
        { cveId: 'CVE-2021-123' },
        { cveId: 'CVE-2021-12345678' },
      ]

      for (const attempt of invalidFormats) {
        expect(() => validateGetCveRequest(attempt)).toThrow(ValidationError)
      }
    })

    it('should reject CVE ID with SQL injection', () => {
      const request = { cveId: "CVE-2021-12345'; DROP TABLE users;--" }
      expect(() => validateGetCveRequest(request)).toThrow(ValidationError)
    })
  })

  describe('validateStartSyncRequest', () => {
    it('should accept empty request', () => {
      expect(validateStartSyncRequest()).toEqual({})
    })

    it('should accept valid years array', () => {
      const request = { years: [2020, 2021, 2022] }
      expect(validateStartSyncRequest(request)).toEqual(request)
    })

    it('should reject non-array years', () => {
      const request = { years: 'not-an-array' as any }
      expect(() => validateStartSyncRequest(request)).toThrow(ValidationError)
    })

    it('should reject invalid year values', () => {
      const invalidYears = [{ years: [1998] }, { years: [2100] }, { years: ['invalid' as any] }]

      for (const attempt of invalidYears) {
        expect(() => validateStartSyncRequest(attempt)).toThrow(ValidationError)
      }
    })
  })

  describe('validateSetApiKeyRequest', () => {
    it('should accept valid NVD API key', () => {
      const request = {
        keyType: 'nvd',
        apiKey: '12345678-1234-1234-1234-123456789012',
      }
      expect(validateSetApiKeyRequest(request)).toEqual(request)
    })

    it('should accept valid OSV API key', () => {
      const request = {
        keyType: 'osv',
        apiKey: 'some-osv-api-key',
      }
      expect(validateSetApiKeyRequest(request)).toEqual(request)
    })

    it('should reject invalid key type', () => {
      const request = {
        keyType: 'invalid',
        apiKey: 'test-key',
      }
      expect(() => validateSetApiKeyRequest(request)).toThrow(ValidationError)
    })

    it('should reject NVD API key with invalid UUID format', () => {
      const request = {
        keyType: 'nvd',
        apiKey: 'not-a-uuid',
      }
      expect(() => validateSetApiKeyRequest(request)).toThrow(ValidationError)
    })

    it('should reject API key exceeding max length', () => {
      const request = {
        keyType: 'osv',
        apiKey: 'a'.repeat(257),
      }
      expect(() => validateSetApiKeyRequest(request)).toThrow(ValidationError)
    })

    it('should trim whitespace from API key', () => {
      const request = {
        keyType: 'nvd',
        apiKey: '  12345678-1234-1234-1234-123456789012  ',
      }
      const validated = validateSetApiKeyRequest(request)
      expect(validated.apiKey).toBe('12345678-1234-1234-1234-123456789012')
    })
  })

  describe('validateGetApiKeyRequest', () => {
    it('should accept valid request', () => {
      const request = { keyType: 'nvd' }
      expect(validateGetApiKeyRequest(request)).toEqual(request)
    })

    it('should reject invalid key type', () => {
      const request = { keyType: 'invalid' }
      expect(() => validateGetApiKeyRequest(request)).toThrow(ValidationError)
    })
  })

  describe('validateDeleteApiKeyRequest', () => {
    it('should accept valid request', () => {
      const request = { keyType: 'nvd' }
      expect(validateDeleteApiKeyRequest(request)).toEqual(request)
    })
  })

  describe('validateHasApiKeyRequest', () => {
    it('should accept valid request', () => {
      const request = { keyType: 'nvd' }
      expect(validateHasApiKeyRequest(request)).toEqual(request)
    })
  })

  describe('sanitizeErrorMessage', () => {
    it('should return user-friendly message for ValidationError', () => {
      const error = new ValidationError('Test validation error')
      expect(sanitizeErrorMessage(error)).toBe('Test validation error')
    })

    it('should return user-friendly message for known errors', () => {
      const knownErrors = [
        new Error('DATABASE_NOT_INITIALIZED'),
        new Error('NETWORK_ERROR'),
        new Error('SYNC_IN_PROGRESS'),
      ]

      knownErrors.forEach((error) => {
        const message = sanitizeErrorMessage(error)
        expect(message).not.toBe(error.message)
        expect(message).toBeDefined()
        expect(message.length).toBeGreaterThan(0)
      })
    })

    it('should return generic message for unknown errors', () => {
      const error = new Error('UNKNOWN_ERROR_CODE')
      expect(sanitizeErrorMessage(error)).toBe('An unexpected error occurred.')
    })

    it('should return generic message for non-Error types', () => {
      expect(sanitizeErrorMessage('string error')).toBe('An unexpected error occurred.')
      expect(sanitizeErrorMessage(null)).toBe('An unexpected error occurred.')
      expect(sanitizeErrorMessage(undefined)).toBe('An unexpected error occurred.')
    })
  })

  describe('validateNvdSearchRequest — uncovered branches', () => {
    it('should reject null request', () => {
      expect(() => validateNvdSearchRequest(null)).toThrow(ValidationError)
    })

    it('should reject non-string type', () => {
      expect(() => validateNvdSearchRequest({ type: 123, query: 'test' })).toThrow(ValidationError)
    })

    it('should reject non-string query', () => {
      expect(() => validateNvdSearchRequest({ type: 'text', query: 123 })).toThrow(ValidationError)
    })

    it('should reject hex escape sequences in query', () => {
      expect(() => validateNvdSearchRequest({ type: 'text', query: 'test\\x41\\x42' })).toThrow(ValidationError)
    })

    it('should reject boolean injection pattern', () => {
      expect(() => validateNvdSearchRequest({ type: 'text', query: 'test OR 1=1' })).toThrow(ValidationError)
    })

    it('should reject multi-line comment patterns', () => {
      expect(() => validateNvdSearchRequest({ type: 'text', query: 'test/*comment*/' })).toThrow(ValidationError)
    })

    it('should accept CVE ID with lowercase prefix', () => {
      const request = { type: 'cve-id' as const, query: 'cve-2024-12345' }
      expect(validateNvdSearchRequest(request)).toBeDefined()
    })

    it('should accept limit of 1', () => {
      const request = { type: 'text' as const, query: 'test', limit: 1 }
      expect(validateNvdSearchRequest(request)).toBeDefined()
    })

    it('should accept offset of 0', () => {
      const request = { type: 'text' as const, query: 'test', offset: 0 }
      expect(validateNvdSearchRequest(request)).toBeDefined()
    })

    it('should reject NaN limit', () => {
      expect(() => validateNvdSearchRequest({ type: 'text', query: 'test', limit: NaN })).toThrow(ValidationError)
    })

    it('should reject limit of 0', () => {
      expect(() => validateNvdSearchRequest({ type: 'text', query: 'test', limit: 0 })).toThrow(ValidationError)
    })

    it('should reject NaN offset', () => {
      expect(() => validateNvdSearchRequest({ type: 'text', query: 'test', offset: NaN })).toThrow(ValidationError)
    })

    it('should accept text search type', () => {
      const request = { type: 'text' as const, query: 'apache' }
      expect(validateNvdSearchRequest(request)).toBeDefined()
    })

    it('should accept request without limit and offset', () => {
      const request = { type: 'text' as const, query: 'test' }
      const result = validateNvdSearchRequest(request)
      expect(result.limit).toBeUndefined()
      expect(result.offset).toBeUndefined()
    })
  })

  describe('validateGetCveRequest — additional branches', () => {
    it('should reject null request', () => {
      expect(() => validateGetCveRequest(null)).toThrow(ValidationError)
    })

    it('should reject non-string cveId', () => {
      expect(() => validateGetCveRequest({ cveId: 123 })).toThrow(ValidationError)
    })

    it('should trim whitespace from cveId', () => {
      const request = { cveId: '  CVE-2024-12345  ' }
      const result = validateGetCveRequest(request)
      expect(result.cveId).toBe('CVE-2024-12345')
    })
  })

  describe('validateStartSyncRequest — additional branches', () => {
    it('should accept request with force flag', () => {
      const request = { force: true }
      expect(validateStartSyncRequest(request)).toEqual({ force: true, years: undefined })
    })

    it('should accept empty object', () => {
      expect(validateStartSyncRequest({})).toEqual({})
    })

    it('should reject non-object request', () => {
      expect(() => validateStartSyncRequest('not-an-object')).toThrow(ValidationError)
    })

    it('should accept valid year range', () => {
      const currentYear = new Date().getFullYear()
      const request = { years: [1999, currentYear] }
      expect(validateStartSyncRequest(request)).toBeDefined()
    })

    it('should reject year below 1999', () => {
      expect(() => validateStartSyncRequest({ years: [1997] })).toThrow(ValidationError)
    })

    it('should reject year above current + 1', () => {
      const futureYear = new Date().getFullYear() + 2
      expect(() => validateStartSyncRequest({ years: [futureYear] })).toThrow(ValidationError)
    })

    it('should handle NaN year values', () => {
      expect(() => validateStartSyncRequest({ years: [NaN] })).toThrow(ValidationError)
    })
  })

  describe('validateSetApiKeyRequest — additional branches', () => {
    it('should reject null request', () => {
      expect(() => validateSetApiKeyRequest(null)).toThrow(ValidationError)
    })

    it('should reject missing keyType', () => {
      expect(() => validateSetApiKeyRequest({ apiKey: 'key' })).toThrow(ValidationError)
    })

    it('should reject non-string keyType', () => {
      expect(() => validateSetApiKeyRequest({ keyType: 123, apiKey: 'key' })).toThrow(ValidationError)
    })

    it('should reject missing apiKey', () => {
      expect(() => validateSetApiKeyRequest({ keyType: 'nvd' })).toThrow(ValidationError)
    })

    it('should reject non-string apiKey', () => {
      expect(() => validateSetApiKeyRequest({ keyType: 'nvd', apiKey: 123 })).toThrow(ValidationError)
    })

    it('should accept valid github API key', () => {
      const request = { keyType: 'github', apiKey: 'ghp_1234567890abcdef' }
      expect(validateSetApiKeyRequest(request)).toBeDefined()
    })

    it('should accept valid osv API key', () => {
      const request = { keyType: 'osv', apiKey: 'some-key' }
      expect(validateSetApiKeyRequest(request)).toBeDefined()
    })

    it('should accept NVD key with whitespace-only apiKey (trimmed is truthy)', () => {
      // '   ' is truthy as a string, passes the `!req.apiKey` check,
      // then trim produces '' which has length 0, skipping the UUID check,
      // then the length check (0 < 256) passes
      const request = { keyType: 'nvd', apiKey: '   ' }
      const result = validateSetApiKeyRequest(request)
      expect(result.apiKey).toBe('')
    })
  })

  describe('validateGetApiKeyRequest — additional branches', () => {
    it('should reject null request', () => {
      expect(() => validateGetApiKeyRequest(null)).toThrow(ValidationError)
    })

    it('should reject missing keyType', () => {
      expect(() => validateGetApiKeyRequest({})).toThrow(ValidationError)
    })

    it('should reject non-string keyType', () => {
      expect(() => validateGetApiKeyRequest({ keyType: 123 })).toThrow(ValidationError)
    })

    it('should accept github keyType', () => {
      const result = validateGetApiKeyRequest({ keyType: 'github' })
      expect(result.keyType).toBe('github')
    })

    it('should accept osv keyType', () => {
      const result = validateGetApiKeyRequest({ keyType: 'osv' })
      expect(result.keyType).toBe('osv')
    })
  })

  describe('validateCpeSearchRequest', () => {
    it('should return default limit for null request', () => {
      const result = validateCpeSearchRequest(null)
      expect(result.limit).toBe(100)
      expect(result.error).toBe('Invalid request structure')
    })

    it('should return default limit for undefined request', () => {
      const result = validateCpeSearchRequest(undefined)
      expect(result.limit).toBe(100)
      expect(result.error).toBe('Invalid request structure')
    })

    it('should return default limit for empty object', () => {
      const result = validateCpeSearchRequest({})
      expect(result.limit).toBe(100)
      expect(result.error).toBeUndefined()
    })

    it('should validate productName as string', () => {
      const result = validateCpeSearchRequest({ productName: 123 })
      expect(result.error).toBe('productName must be a string')
      expect(result.limit).toBe(100)
    })

    it('should reject productName exceeding max length', () => {
      const result = validateCpeSearchRequest({ productName: 'a'.repeat(257) })
      expect(result.error).toBe('productName exceeds maximum length')
    })

    it('should validate tokens as array', () => {
      const result = validateCpeSearchRequest({ tokens: 'not-array' })
      expect(result.error).toBe('tokens must be an array')
    })

    it('should reject too many tokens', () => {
      const result = validateCpeSearchRequest({ tokens: Array(21).fill('token') })
      expect(result.error).toBe('Too many tokens')
    })

    it('should reject non-string tokens', () => {
      const result = validateCpeSearchRequest({ tokens: [123, 'valid'] })
      expect(result.error).toBe('All tokens must be strings')
    })

    it('should reject token exceeding max length', () => {
      const result = validateCpeSearchRequest({ tokens: ['a'.repeat(129)] })
      expect(result.error).toBe('Token exceeds maximum length')
    })

    it('should accept valid productName and tokens', () => {
      const result = validateCpeSearchRequest({ productName: 'apache', tokens: ['log4j'] })
      expect(result.error).toBeUndefined()
      expect(result.limit).toBe(100)
    })

    it('should use provided valid limit', () => {
      const result = validateCpeSearchRequest({ limit: 50 })
      expect(result.limit).toBe(50)
    })

    it('should cap limit at 1000', () => {
      const result = validateCpeSearchRequest({ limit: 5000 })
      expect(result.limit).toBe(1000)
    })

    it('should use default limit for invalid limit value', () => {
      const result = validateCpeSearchRequest({ limit: -1 })
      expect(result.limit).toBe(100)
    })

    it('should use default limit for zero limit', () => {
      const result = validateCpeSearchRequest({ limit: 0 })
      expect(result.limit).toBe(100)
    })

    it('should use default limit for non-number limit', () => {
      const result = validateCpeSearchRequest({ limit: 'abc' })
      expect(result.limit).toBe(100)
    })

    it('should accept valid request with all fields', () => {
      const result = validateCpeSearchRequest({
        productName: 'log4j',
        tokens: ['apache', 'log4j'],
        limit: 200,
      })
      expect(result.error).toBeUndefined()
      expect(result.limit).toBe(200)
    })
  })

  describe('sanitizeErrorMessage — additional branches', () => {
    it('should map DATABASE_LOCKED error', () => {
      expect(sanitizeErrorMessage(new Error('DATABASE_LOCKED'))).toBe('Database is busy. Please try again.')
    })

    it('should map INVALID_CVE_FORMAT error', () => {
      expect(sanitizeErrorMessage(new Error('INVALID_CVE_FORMAT'))).toBe('Invalid CVE ID format.')
    })

    it('should map INVALID_CPE_FORMAT error', () => {
      expect(sanitizeErrorMessage(new Error('INVALID_CPE_FORMAT'))).toBe('Invalid CPE format.')
    })

    it('should map SEARCH_FAILED error', () => {
      expect(sanitizeErrorMessage(new Error('SEARCH_FAILED'))).toBe('Search failed. Please try again.')
    })

    it('should map SYNC_IN_PROGRESS error', () => {
      expect(sanitizeErrorMessage(new Error('SYNC_IN_PROGRESS'))).toBe('A sync is already in progress.')
    })

    it('should return generic for number error', () => {
      expect(sanitizeErrorMessage(42)).toBe('An unexpected error occurred.')
    })

    it('should return generic for boolean error', () => {
      expect(sanitizeErrorMessage(true)).toBe('An unexpected error occurred.')
    })
  })
})
