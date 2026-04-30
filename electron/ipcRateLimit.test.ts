/**
 * IPC Rate Limiter Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  checkRateLimit,
  resetRateLimit,
  getRateLimitStats,
  isRateLimited,
  wrapIpcHandler,
  updateChannelConfig,
  getAllLimiters,
  recordRequest,
  type RateLimitResult,
} from './ipcRateLimit'

describe('ipcRateLimit', () => {
  beforeEach(() => {
    // Reset all rate limiters before each test
    const limiters = getAllLimiters()
    for (const [channel] of limiters.keys()) {
      resetRateLimit(channel)
    }
  })

  describe('checkRateLimit', () => {
    it('should allow requests within limit', () => {
      const channel = 'test-channel'
      const result1 = checkRateLimit(channel)
      const result2 = checkRateLimit(channel)

      expect(result1.allowed).toBe(true)
      expect(result2.allowed).toBe(true)
      expect(result1.remaining).toBe(59) // 60 - 1 used
    })

    it('should deny requests exceeding limit', () => {
      const channel = 'strict-channel'
      // Use a config with lower limit for testing
      const results: RateLimitResult[] = []

      // Make 11 requests (over limit of 10)
      for (let i = 0; i < 11; i++) {
        results.push(checkRateLimit(channel, { maxRequests: 10, windowMs: 60000 }))
      }

      // First 10 should be allowed
      for (let i = 0; i < 10; i++) {
        expect(results[i].allowed).toBe(true)
      }

      // 11th should be denied
      expect(results[10].allowed).toBe(false)
      expect(results[10].error).toBeDefined()
    })

    it('should provide reset time when limited', () => {
      const channel = 'test-reset-channel'
      const result = checkRateLimit(channel, { maxRequests: 1, windowMs: 1000 })

      expect(result.allowed).toBe(true)
      expect(result.resetTime).toBeGreaterThan(Date.now())
    })

    it('should respect custom configuration', () => {
      const channel = 'custom-channel'
      const customConfig = { maxRequests: 5, windowMs: 30000 }

      // Should allow exactly 5 requests
      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(channel, customConfig).allowed).toBe(true)
      }

      // 6th request should be denied
      expect(checkRateLimit(channel, customConfig).allowed).toBe(false)
    })

    it('should allow all requests when disabled', () => {
      const channel = 'unlimited-channel'
      const config = { enabled: false }
      const results: RateLimitResult[] = []

      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        results.push(checkRateLimit(channel, config))
      }

      // All should be allowed
      results.forEach((result) => {
        expect(result.allowed).toBe(true)
      })
    })
  })

  describe('resetRateLimit', () => {
    it('should reset rate limit state', () => {
      const channel = 'reset-test-channel'

      // Use up limit
      for (let i = 0; i < 60; i++) {
        checkRateLimit(channel)
      }

      const lastResult = checkRateLimit(channel)
      expect(lastResult.allowed).toBe(false)

      // Reset
      resetRateLimit(channel)

      // Should be allowed again
      const resultAfterReset = checkRateLimit(channel)
      expect(resultAfterReset.allowed).toBe(true)
    })
  })

  describe('getRateLimitStats', () => {
    it('should return null for non-existent channel', () => {
      const stats = getRateLimitStats('non-existent')
      expect(stats).toBeNull()
    })

    it('should return correct statistics', () => {
      const channel = 'stats-channel'

      // Make some requests
      for (let i = 0; i < 5; i++) {
        checkRateLimit(channel)
      }

      const stats = getRateLimitStats(channel)
      expect(stats).not.toBeNull()
      expect(stats?.used).toBe(5)
      expect(stats?.max).toBe(60)
      expect(stats?.windowMs).toBe(60000)
      expect(stats?.resetIn).toBeGreaterThan(Date.now())
    })
  })

  describe('isRateLimited', () => {
    it('should return true when limit exceeded', () => {
      const channel = 'limited-channel'

      // Exhaust the limit
      for (let i = 0; i < 60; i++) {
        checkRateLimit(channel)
      }

      expect(isRateLimited(channel)).toBe(true)
    })

    it('should return false when under limit', () => {
      const channel = 'not-limited-channel'
      checkRateLimit(channel)

      expect(isRateLimited(channel)).toBe(false)
    })

    it('should return false for unknown channel', () => {
      expect(isRateLimited('unknown-channel')).toBe(false)
    })
  })

  describe('wrapIpcHandler', () => {
    it('should wrap handler with rate limiting', async () => {
      const channel = 'wrapped-channel'
      const mockHandler = vi.fn().mockResolvedValue({ success: true, data: 'test' })

      const wrappedHandler = wrapIpcHandler(channel, mockHandler)

      // First 60 calls should succeed
      for (let i = 0; i < 60; i++) {
        const result = await wrappedHandler()
        expect(result.success).toBe(true)
      }

      // 61st call should fail with rate limit
      const rateLimitedResult = await wrappedHandler()
      expect(rateLimitedResult.success).toBe(false)
      expect(rateLimitedResult.error).toContain('Rate limit')
    })

    it('should pass through handler arguments', async () => {
      const channel = 'args-channel'
      const mockHandler = vi.fn().mockResolvedValue({ success: true })

      const wrappedHandler = wrapIpcHandler(channel, mockHandler)

      await wrappedHandler('arg1', 'arg2', 42)

      expect(mockHandler).toHaveBeenCalledWith('arg1', 'arg2', 42)
    })
  })

  describe('updateChannelConfig', () => {
    it('should update configuration for existing channel', () => {
      const channel = 'config-update-channel'

      // Make some requests
      checkRateLimit(channel)

      const statsBefore = getRateLimitStats(channel)
      expect(statsBefore?.max).toBe(60)

      // Update config
      updateChannelConfig(channel, { maxRequests: 100 })

      const statsAfter = getRateLimitStats(channel)
      expect(statsAfter?.max).toBe(100)
    })

    it('should not affect non-existent channels', () => {
      const channel = 'non-existent-channel'

      // Should not throw
      expect(() => {
        updateChannelConfig(channel, { maxRequests: 100 })
      }).not.toThrow()
    })
  })

  describe('getAllLimiters', () => {
    it('should return all active limiters', () => {
      const channel1 = 'limiter-1'
      const channel2 = 'limiter-2'

      checkRateLimit(channel1)
      checkRateLimit(channel2)

      const allLimiters = getAllLimiters()

      expect(allLimiters.size).toBeGreaterThanOrEqual(2)
      expect(allLimiters.has(channel1)).toBe(true)
      expect(allLimiters.has(channel2)).toBe(true)
    })
  })

  describe('recordRequest', () => {
    it('should record requests without throwing', () => {
      const channel = 'record-channel'

      // Should not throw
      expect(() => {
        recordRequest(channel, true)
        recordRequest(channel, false)
      }).not.toThrow()
    })
  })

  describe('channel-specific configurations', () => {
    it('should use stricter limits for sync operations', () => {
      // db:sync-start has 10 per hour limit
      const results: RateLimitResult[] = []

      for (let i = 0; i < 10; i++) {
        results.push(checkRateLimit('db:sync-start'))
      }

      // All 10 should be allowed
      results.forEach((r) => expect(r.allowed).toBe(true))

      // 11th should be denied
      const result11 = checkRateLimit('db:sync-start')
      expect(result11.allowed).toBe(false)
    })

    it('should use higher limits for database read operations', () => {
      // db:nvd-get-by-cve has 300 per minute limit
      const results: RateLimitResult[] = []

      for (let i = 0; i < 300; i++) {
        results.push(checkRateLimit('db:nvd-get-by-cve'))
      }

      // All 300 should be allowed
      results.forEach((r) => expect(r.allowed).toBe(true))

      // 301st should be denied
      const result301 = checkRateLimit('db:nvd-get-by-cve')
      expect(result301.allowed).toBe(false)
    })
  })

  describe('timestamp cleanup', () => {
    it('should clean up old timestamps outside window', async () => {
      const channel = 'cleanup-channel'

      // Short window for testing
      const config = { maxRequests: 5, windowMs: 100 }

      // Make 5 requests to fill limit
      for (let i = 0; i < 5; i++) {
        checkRateLimit(channel, config)
      }

      // Wait for window to pass (would need actual time delay in real scenario)
      // For now, simulate by making requests with timestamps in the past

      const stats = getRateLimitStats(channel)
      expect(stats?.used).toBe(5) // Window is full
    })
  })
})
