import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter, createNvdRateLimiter } from './rateLimiter'

describe('RateLimiter', () => {
  describe('constructor', () => {
    it('should use default options', () => {
      const limiter = new RateLimiter()
      expect(limiter.getQueueSize()).toBe(0)
      expect(limiter.getTimeUntilNextRequest()).toBe(0)
    })

    it('should accept custom options', () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 10,
        windowMs: 5000,
        maxRetries: 3,
        initialRetryDelay: 500,
      })
      expect(limiter.getQueueSize()).toBe(0)
    })
  })

  describe('execute', () => {
    it('should execute a request and return its result', async () => {
      const limiter = new RateLimiter({ requestsPerWindow: 5, windowMs: 1000 })
      const result = await limiter.execute(() => Promise.resolve('ok'))
      expect(result).toBe('ok')
    })

    it('should reject when request function throws with non-client error', async () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 5,
        windowMs: 1000,
        maxRetries: 1,
        initialRetryDelay: 1,
      })
      await expect(limiter.execute(() => Promise.reject(new Error('server connection fail')))).rejects.toThrow(
        'server connection fail',
      )
    })
  })

  describe('rate limiting', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should wait when rate limit is reached', async () => {
      const limiter = new RateLimiter({ requestsPerWindow: 1, windowMs: 100 })
      const fn = vi.fn(() => Promise.resolve('ok'))

      const p1 = limiter.execute(fn)
      const p2 = limiter.execute(fn)

      await vi.advanceTimersByTimeAsync(250)
      await Promise.all([p1, p2])

      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should execute requests with priority ordering', async () => {
      const limiter = new RateLimiter({ requestsPerWindow: 1, windowMs: 100 })
      const order: number[] = []

      const p1 = limiter.execute(() => {
        order.push(1)
        return Promise.resolve('low')
      }, 1)

      const p2 = limiter.execute(() => {
        order.push(2)
        return Promise.resolve('high')
      }, 10)

      await vi.advanceTimersByTimeAsync(250)
      await Promise.all([p1, p2])

      expect(order).toEqual([1, 2])
    })

    it('should track time until next request', async () => {
      const limiter = new RateLimiter({ requestsPerWindow: 2, windowMs: 1000 })

      await limiter.execute(() => Promise.resolve('a'))
      await limiter.execute(() => Promise.resolve('b'))

      const waitTime = limiter.getTimeUntilNextRequest()
      expect(waitTime).toBeGreaterThan(0)
    })

    it('should return 0 wait time when under limit', () => {
      const limiter = new RateLimiter({ requestsPerWindow: 5, windowMs: 1000 })
      expect(limiter.getTimeUntilNextRequest()).toBe(0)
    })
  })

  describe('retry logic', () => {
    it('should retry on server errors and eventually succeed', async () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 5,
        windowMs: 1000,
        maxRetries: 2,
        initialRetryDelay: 1,
      })

      let attempts = 0
      const fn = () => {
        attempts++
        if (attempts < 3) {
          return Promise.reject(new Error('http 500 internal'))
        }
        return Promise.resolve('success')
      }

      const result = await limiter.execute(fn)
      expect(result).toBe('success')
      expect(attempts).toBe(3)
    })

    it('should not retry on client errors (404)', async () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 5,
        windowMs: 1000,
        maxRetries: 3,
        initialRetryDelay: 1,
      })

      let attempts = 0
      const fn = () => {
        attempts++
        return Promise.reject(new Error('http 404 not found'))
      }

      await expect(limiter.execute(fn)).rejects.toThrow('http 404 not found')
      expect(attempts).toBe(1)
    })

    it('should not retry on http 401 errors', async () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 5,
        windowMs: 1000,
        maxRetries: 3,
        initialRetryDelay: 1,
      })

      let attempts = 0
      const fn = () => {
        attempts++
        return Promise.reject(new Error('http 401 unauthorized'))
      }

      await expect(limiter.execute(fn)).rejects.toThrow('http 401 unauthorized')
      expect(attempts).toBe(1)
    })

    it('should not retry on http 403 forbidden', async () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 5,
        windowMs: 1000,
        maxRetries: 3,
        initialRetryDelay: 1,
      })

      let attempts = 0
      const fn = () => {
        attempts++
        return Promise.reject(new Error('forbidden access'))
      }

      await expect(limiter.execute(fn)).rejects.toThrow('forbidden access')
      expect(attempts).toBe(1)
    })

    it('should not retry on http 400 bad request', async () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 5,
        windowMs: 1000,
        maxRetries: 3,
        initialRetryDelay: 1,
      })

      let attempts = 0
      const fn = () => {
        attempts++
        return Promise.reject(new Error('http 400 bad request'))
      }

      await expect(limiter.execute(fn)).rejects.toThrow('http 400 bad request')
      expect(attempts).toBe(1)
    })

    it('should throw after max retries exhausted', async () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 5,
        windowMs: 1000,
        maxRetries: 1,
        initialRetryDelay: 1,
      })

      let attempts = 0
      const fn = () => {
        attempts++
        return Promise.reject(new Error('http 500 server error'))
      }

      await expect(limiter.execute(fn)).rejects.toThrow('http 500 server error')
      expect(attempts).toBe(2)
    })

    it('should use exponential backoff for retries', async () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 5,
        windowMs: 1000,
        maxRetries: 2,
        initialRetryDelay: 10,
      })

      const timestamps: number[] = []
      const fn = () => {
        timestamps.push(Date.now())
        return Promise.reject(new Error('http 500'))
      }

      await expect(limiter.execute(fn)).rejects.toThrow('http 500')
      expect(timestamps.length).toBe(3)

      if (timestamps.length >= 3) {
        const gap1 = timestamps[1] - timestamps[0]
        const gap2 = timestamps[2] - timestamps[1]
        expect(gap2 + 5).toBeGreaterThanOrEqual(gap1)
      }
    })

    it('should detect not found as client error', async () => {
      const limiter = new RateLimiter({
        requestsPerWindow: 5,
        windowMs: 1000,
        maxRetries: 3,
        initialRetryDelay: 1,
      })

      let attempts = 0
      const fn = () => {
        attempts++
        return Promise.reject(new Error('Not Found: no resource'))
      }

      await expect(limiter.execute(fn)).rejects.toThrow('Not Found')
      expect(attempts).toBe(1)
    })
  })

  describe('reset', () => {
    it('should clear queue and request history', async () => {
      const limiter = new RateLimiter({ requestsPerWindow: 2, windowMs: 1000 })

      await limiter.execute(() => Promise.resolve('a'))
      await limiter.execute(() => Promise.resolve('b'))

      expect(limiter.getTimeUntilNextRequest()).toBeGreaterThan(0)

      limiter.reset()

      expect(limiter.getQueueSize()).toBe(0)
      expect(limiter.getTimeUntilNextRequest()).toBe(0)
    })
  })

  describe('getQueueSize', () => {
    it('should return 0 when queue is empty', () => {
      const limiter = new RateLimiter()
      expect(limiter.getQueueSize()).toBe(0)
    })

    it('should return queue length when items are queued', () => {
      const limiter = new RateLimiter({ requestsPerWindow: 1, windowMs: 10000 })
      limiter.execute(() => new Promise(() => {}))
      limiter.execute(() => new Promise(() => {}))

      expect(limiter.getQueueSize()).toBe(1)
      limiter.reset()
    })
  })
})

describe('createNvdRateLimiter', () => {
  it('should create limiter with API key limits (50 req/30s)', () => {
    const limiter = createNvdRateLimiter(true)
    expect(limiter).toBeInstanceOf(RateLimiter)
    expect(limiter.getQueueSize()).toBe(0)
  })

  it('should create limiter without API key limits (5 req/30s)', () => {
    const limiter = createNvdRateLimiter(false)
    expect(limiter).toBeInstanceOf(RateLimiter)
    expect(limiter.getQueueSize()).toBe(0)
  })
})
