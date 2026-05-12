/**
 * ULID Generator Tests
 */

import { describe, it, expect } from 'vitest'
import { ulid, getUlidTimestamp, isValidUlid, ulidToDate } from './ulid'

describe('ULID Generator', () => {
  describe('ulid', () => {
    it('should generate a 26-character string', () => {
      const id = ulid()
      expect(id).toHaveLength(26)
    })

    it('should generate unique IDs', () => {
      const ids = new Set()
      for (let i = 0; i < 1000; i++) {
        ids.add(ulid())
      }
      expect(ids.size).toBe(1000)
    })

    it('should use only valid Crockford Base32 characters', () => {
      const validChars = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
      const id = ulid()

      for (const char of id) {
        expect(validChars).toContain(char)
      }
    })

    it('should generate time-ordered IDs (monotonically increasing)', () => {
      // Generate multiple IDs quickly
      const ids: string[] = []
      for (let i = 0; i < 10; i++) {
        ids.push(ulid())
      }

      // Extract timestamps and verify they're non-decreasing
      const timestamps = ids.map((id) => getUlidTimestamp(id))

      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1])
      }
    })
  })

  describe('getUlidTimestamp', () => {
    it('should extract timestamp from ULID', () => {
      const now = Date.now()
      const id = ulid()
      const extractedTimestamp = getUlidTimestamp(id)

      // Timestamp should be close to current time (within 1 second)
      expect(extractedTimestamp).toBeGreaterThanOrEqual(now - 1000)
      expect(extractedTimestamp).toBeLessThanOrEqual(now + 1000)
    })

    it('should throw error for invalid ULID character', () => {
      expect(() => getUlidTimestamp('INVALID!ULIDCHARSXXXXXXXXX')).toThrow()
    })
  })

  describe('isValidUlid', () => {
    it('should return true for valid ULID', () => {
      const id = ulid()
      expect(isValidUlid(id)).toBe(true)
    })

    it('should return false for incorrect length', () => {
      expect(isValidUlid('TOOSHORT')).toBe(false)
      expect(isValidUlid('THISULIDISWAYTOOLONGTOBEAVALIDULIDSTRING')).toBe(false)
    })

    it('should return false for invalid characters', () => {
      expect(isValidUlid('ABCDEFGHIJKLMNOPQRSTUVWXYZ')).toBe(false) // Contains I, L, O, U
      expect(isValidUlid('0123456789!@#$%^&*()QWERTYUIOPAS')).toBe(false) // Contains special chars
      expect(isValidUlid('0123456789abcdefghij0123456789')).toBe(false) // Contains lowercase
    })

    it('should return false for mixed case', () => {
      expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAv')).toBe(false)
    })

    it('should handle empty string', () => {
      expect(isValidUlid('')).toBe(false)
    })
  })

  describe('ulidToDate', () => {
    it('should convert ULID to Date object', () => {
      const id = ulid()
      const date = ulidToDate(id)

      expect(date).toBeInstanceOf(Date)
      expect(date.getTime()).toBe(getUlidTimestamp(id))
    })

    it('should create date within reasonable time range', () => {
      const now = new Date()
      const id = ulid()
      const date = ulidToDate(id)

      const diffMs = Math.abs(date.getTime() - now.getTime())
      const diffSeconds = diffMs / 1000

      // Should be within 1 second
      expect(diffSeconds).toBeLessThan(1)
    })
  })

  describe('Time Ordering', () => {
    it('should generate ULIDs that sort chronologically', async () => {
      const ids: string[] = []

      // Generate IDs over time with delays to ensure different timestamps
      for (let i = 0; i < 5; i++) {
        ids.push(ulid())
        // Add small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 5))
      }

      // Sort the IDs as strings
      const sortedIds = [...ids].sort()

      // Verify they're already in time-ordered format
      // ULIDs should sort lexicographically the same as chronologically
      expect(sortedIds).toEqual(ids)
    })
  })

  describe('Entropy', () => {
    it('should generate ULIDs with sufficient randomness', () => {
      const ids = new Set<string>()

      // Generate many ULIDs
      for (let i = 0; i < 10000; i++) {
        ids.add(ulid())
      }

      // All should be unique
      expect(ids.size).toBe(10000)
    })

    it('should have different random parts for same timestamp', () => {
      // This test assumes we can generate multiple ULIDs within the same millisecond
      // In practice, this might not always be possible, but the randomness ensures uniqueness

      const ids: string[] = []
      for (let i = 0; i < 100; i++) {
        ids.push(ulid())
      }

      // Extract random parts (last 16 characters)
      const randomParts = ids.map((id) => id.substring(10))
      const uniqueRandomParts = new Set(randomParts)

      // Should have high uniqueness in random parts
      // At least 95% should be unique (accounting for potential timestamp rollover)
      expect(uniqueRandomParts.size).toBeGreaterThanOrEqual(95)
    })
  })

  describe('Format Consistency', () => {
    it('should consistently use uppercase', () => {
      for (let i = 0; i < 100; i++) {
        const id = ulid()
        expect(id).toBe(id.toUpperCase())
      }
    })

    it('should never use ambiguous characters', () => {
      const ambiguous = 'ILOU' // These are excluded from Crockford's Base32

      for (let i = 0; i < 1000; i++) {
        const id = ulid()
        for (const char of ambiguous) {
          expect(id).not.toContain(char)
        }
      }
    })
  })
})
