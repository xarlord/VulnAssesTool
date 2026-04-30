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
})
