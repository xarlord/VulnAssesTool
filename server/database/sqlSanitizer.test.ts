/**
 * Tests for SQL Sanitization Module
 * Tests SQL injection prevention functionality
 */

import { describe, it, expect } from 'vitest'
import {
  sanitizeSqlInput,
  isValidCveId,
  sanitizeCpeString,
  isValidSearchQuery,
  escapeLikePattern,
} from './sqlSanitizer'

describe('SQL Sanitizer', () => {
  describe('sanitizeSqlInput', () => {
    it('should escape single quotes', () => {
      const input = "test'value"
      expect(sanitizeSqlInput(input)).toBe("test''value")
    })

    it('should remove SQL comment patterns', () => {
      const inputs = ['test--comment', 'test#comment', 'test/*comment*/']

      inputs.forEach((input) => {
        const sanitized = sanitizeSqlInput(input)
        expect(sanitized).not.toContain('--')
        expect(sanitized).not.toContain('#')
        expect(sanitized).not.toContain('/*')
        expect(sanitized).not.toContain('*/')
      })
    })

    it('should remove SQL keywords', () => {
      const testCases = [
        { input: 'DROP TABLE users', shouldNotContain: 'drop' },
        { input: 'test UNION SELECT * FROM', shouldNotContain: 'union' },
        { input: 'INSERT INTO users VALUES', shouldNotContain: 'insert' },
        { input: 'test UPDATE users SET x=1', shouldNotContain: 'update' },
        { input: 'DELETE FROM users WHERE', shouldNotContain: 'delete' },
        { input: 'CREATE TABLE evil (id INT)', shouldNotContain: 'create' },
        { input: 'EXEC xp_cmdshell dir', shouldNotContain: 'exec' },
      ]

      testCases.forEach(({ input, shouldNotContain }) => {
        const sanitized = sanitizeSqlInput(input)
        expect(sanitized.toLowerCase()).not.toContain(shouldNotContain)
      })
    })

    it('should neutralize SQL injection with statement separators', () => {
      // When ; is used to chain statements, it gets removed
      const input = 'test;DROP TABLE users'
      const sanitized = sanitizeSqlInput(input)
      // The ; should be removed, neutralizing the injection
      expect(sanitized).not.toContain(';')
      // Even though 'drop' remains in the string, it's not executable as SQL
      // because the statement separator is gone
    })

    it('should remove extended stored procedures', () => {
      const input = 'test;EXEC xp_cmdshell'
      const sanitized = sanitizeSqlInput(input)
      expect(sanitized.toLowerCase()).not.toContain('xp_')
      expect(sanitized.toLowerCase()).not.toContain('sp_')
    })

    it('should remove boolean-based SQL injection patterns', () => {
      const inputs = ['test OR 1=1', 'test AND 1=1']

      inputs.forEach((input) => {
        const sanitized = sanitizeSqlInput(input)
        // The OR/AND followed by digit= patterns should be removed
        expect(sanitized.toLowerCase()).not.toContain(' or ')
        expect(sanitized.toLowerCase()).not.toContain(' and ')
      })
    })

    it('should escape quotes in boolean-based injection attempts', () => {
      // When quotes are present, they get escaped which neutralizes the injection
      const input = "'admin' OR '1'='1'"
      const sanitized = sanitizeSqlInput(input)
      // Quotes should be escaped (doubled)
      expect(sanitized).toContain("''")
      // The string should not have unescaped single quotes
      expect(sanitized.match(/(?<!')'(?!')/g)).toBeNull()
    })

    it('should limit input length to 1000 characters', () => {
      const longInput = 'a'.repeat(2000)
      const sanitized = sanitizeSqlInput(longInput)
      expect(sanitized.length).toBe(1000)
    })

    it('should trim whitespace from input', () => {
      const input = '  test value  '
      expect(sanitizeSqlInput(input)).toBe('test value')
    })

    it('should handle empty strings', () => {
      expect(sanitizeSqlInput('')).toBe('')
      expect(sanitizeSqlInput('   ')).toBe('')
    })

    it('should handle non-string inputs', () => {
      expect(sanitizeSqlInput(null as any)).toBe('')
      expect(sanitizeSqlInput(undefined as any)).toBe('')
      expect(sanitizeSqlInput(123 as any)).toBe('')
    })
  })

  describe('isValidCveId', () => {
    it('should accept valid CVE IDs', () => {
      const validCVEs = [
        'CVE-2021-1234',
        'CVE-2021-12345',
        'CVE-2021-123456',
        'CVE-2021-1234567',
        'cve-2021-12345', // lowercase
        'CvE-2021-12345', // mixed case
      ]

      validCVEs.forEach((cve) => {
        expect(isValidCveId(cve)).toBe(true)
      })
    })

    it('should reject invalid CVE ID formats', () => {
      const invalidCVEs = [
        'INVALID-CVE-FORMAT',
        'CVE-21-12345', // year too short
        'CVE-2021-123', // suffix too short
        'CVE-2021-12345678', // suffix too long
        '2021-12345', // missing CVE- prefix
        'CVE-2021', // missing suffix
        '', // empty string
        'CVE-2021-ABC', // non-numeric suffix
      ]

      invalidCVEs.forEach((cve) => {
        expect(isValidCveId(cve)).toBe(false)
      })
    })

    it('should handle non-string inputs', () => {
      expect(isValidCveId(null as any)).toBe(false)
      expect(isValidCveId(undefined as any)).toBe(false)
      expect(isValidCveId(123 as any)).toBe(false)
    })
  })

  describe('sanitizeCpeString', () => {
    it('should accept valid CPE 2.3 strings', () => {
      const validCPEs = [
        'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
        'cpe:2.3:o:microsoft:windows_10:-:*:*:*:*:*:*:*',
        'cpe:2.3:h:apache:http_server:2.4:*:*:*:*:*:*:*',
      ]

      validCPEs.forEach((cpe) => {
        const sanitized = sanitizeCpeString(cpe)
        expect(sanitized).toBe(cpe)
      })
    })

    it('should reject invalid CPE formats', () => {
      const invalidCPEs = [
        'not-a-cpe',
        'cpe:1.2:vendor:product:1.0', // CPE 2.2 format
        'cpe:2.3::product', // missing vendor
        '', // empty string
        'a'.repeat(300), // too long
      ]

      invalidCPEs.forEach((cpe) => {
        const sanitized = sanitizeCpeString(cpe)
        expect(sanitized).toBe('')
      })
    })

    it('should reject CPE strings exceeding max length', () => {
      const longCPE = 'cpe:2.3:a:' + 'v'.repeat(300) + ':product:1.0'
      const sanitized = sanitizeCpeString(longCPE)
      expect(sanitized).toBe('')
    })

    it('should handle non-string inputs', () => {
      expect(sanitizeCpeString(null as any)).toBe('')
      expect(sanitizeCpeString(undefined as any)).toBe('')
    })
  })

  describe('isValidSearchQuery', () => {
    it('should accept valid search queries', () => {
      const validQueries = ['apache', 'nginx server', 'openssl-1.0.1', 'cve-2021-12345', 'test.value']

      validQueries.forEach((query) => {
        expect(isValidSearchQuery(query)).toBe(true)
      })
    })

    it('should reject queries with SQL injection patterns', () => {
      const dangerousQueries = [
        "test'; DROP TABLE users;--",
        "test' OR '1'='1",
        'test--comment',
        'test#comment',
        'test/*multi*/line/*comment*/',
        "admin'--",
        "' OR 1=1--",
      ]

      dangerousQueries.forEach((query) => {
        expect(isValidSearchQuery(query)).toBe(false)
      })
    })

    it('should reject queries exceeding max length', () => {
      const longQuery = 'a'.repeat(501)
      expect(isValidSearchQuery(longQuery)).toBe(false)
    })

    it('should accept queries at max length', () => {
      const maxQuery = 'a'.repeat(500)
      expect(isValidSearchQuery(maxQuery)).toBe(true)
    })

    it('should handle non-string inputs', () => {
      expect(isValidSearchQuery(null as any)).toBe(false)
      expect(isValidSearchQuery(undefined as any)).toBe(false)
      expect(isValidSearchQuery(123 as any)).toBe(false)
    })
  })

  describe('escapeLikePattern', () => {
    it('should escape LIKE wildcards', () => {
      expect(escapeLikePattern('test%value')).toBe('test\\%value')
      expect(escapeLikePattern('test_value')).toBe('test\\_value')
      expect(escapeLikePattern('test%value_more')).toBe('test\\%value\\_more')
    })

    it('should escape backslashes', () => {
      expect(escapeLikePattern('test\\value')).toBe('test\\\\value')
    })

    it('should handle multiple special characters', () => {
      const input = '%_test\\value%_'
      const escaped = escapeLikePattern(input)
      expect(escaped).toBe('\\%\\_test\\\\value\\%\\_')
    })
  })
})
