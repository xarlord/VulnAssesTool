import { describe, it, expect, vi } from 'vitest'

// --- Mock setup ---

const { mockRateLimit } = vi.hoisted(() => ({
  mockRateLimit: vi.fn((opts: Record<string, unknown>) => ({
    ...opts,
    __mockLimiter: true,
  })),
}))

vi.mock('express-rate-limit', () => ({
  __esModule: true,
  default: mockRateLimit,
}))

// --- Tests ---
// Each test uses vi.resetModules() + dynamic import so the mock call history reflects only that
// test's module execution. searchLimiter/syncLimiter are single-mount singletons; the container
// and default limiters are FACTORIES (bug-hunt H9) so each mount gets its own bucket.

describe('Rate Limiters', () => {
  it('exports the single-mount singletons and the multi-mount factories', async () => {
    vi.resetModules()
    const mod = await import('./rateLimit')
    expect(mod.searchLimiter).toBeDefined()
    expect(mod.syncLimiter).toBeDefined()
    expect(typeof mod.makeContainerLimiter).toBe('function')
    expect(typeof mod.makeDefaultLimiter).toBe('function')
  })

  it('creates only the two singleton limiters at module load (factories are lazy)', async () => {
    vi.resetModules()
    await import('./rateLimit')
    expect(mockRateLimit).toHaveBeenCalledTimes(2)
  })

  it('configures searchLimiter with a 1-minute window and 300 max', async () => {
    vi.resetModules()
    await import('./rateLimit')
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many search requests, please try again later' },
      }),
    )
  })

  it('configures syncLimiter with a 1-hour window and 10 max', async () => {
    vi.resetModules()
    await import('./rateLimit')
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 60 * 60 * 1000,
        max: 10,
        message: { success: false, error: 'Too many sync requests, please try again later' },
      }),
    )
  })

  it('makeContainerLimiter builds a fresh 60s/5 limiter on each call (independent buckets)', async () => {
    vi.resetModules()
    const { makeContainerLimiter } = await import('./rateLimit')
    const a = makeContainerLimiter()
    const b = makeContainerLimiter()
    expect(mockRateLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        windowMs: 60 * 1000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many container scan requests' },
      }),
    )
    // WHY H9: a shared instance keys ONE IP bucket across every mounted route group, so heavy
    // traffic on one feature throttles the others. A fresh instance per mount fixes that.
    expect(a).not.toBe(b)
  })

  it('makeDefaultLimiter builds a fresh 60s/60 limiter on each call (independent buckets)', async () => {
    vi.resetModules()
    const { makeDefaultLimiter } = await import('./rateLimit')
    const a = makeDefaultLimiter()
    const b = makeDefaultLimiter()
    expect(mockRateLimit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many requests, please try again later' },
      }),
    )
    expect(a).not.toBe(b)
  })

  it('enables standardHeaders and disables legacyHeaders on every limiter', async () => {
    vi.resetModules()
    const { makeContainerLimiter, makeDefaultLimiter } = await import('./rateLimit')
    makeContainerLimiter()
    makeDefaultLimiter()
    const calls = mockRateLimit.mock.calls as Array<[Record<string, unknown>]>
    for (const call of calls) {
      expect(call[0].standardHeaders).toBe(true)
      expect(call[0].legacyHeaders).toBe(false)
    }
  })

  it('includes a non-empty error message in every limiter config', async () => {
    vi.resetModules()
    const { makeContainerLimiter, makeDefaultLimiter } = await import('./rateLimit')
    makeContainerLimiter()
    makeDefaultLimiter()
    const calls = mockRateLimit.mock.calls as Array<[Record<string, unknown>]>
    for (const call of calls) {
      const message = call[0].message as Record<string, unknown>
      expect(message.success).toBe(false)
      expect(typeof message.error).toBe('string')
      expect((message.error as string).length).toBeGreaterThan(0)
    }
  })
})
