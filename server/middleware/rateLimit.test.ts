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
// Each test uses vi.resetModules() + dynamic import so the mock call
// history reflects only that test's module execution.

describe('Rate Limiters', () => {
  it('should export all four limiters', async () => {
    vi.resetModules()
    const mod = await import('./rateLimit')
    expect(mod.searchLimiter).toBeDefined()
    expect(mod.syncLimiter).toBeDefined()
    expect(mod.containerLimiter).toBeDefined()
    expect(mod.defaultLimiter).toBeDefined()
  })

  it('should call rateLimit exactly four times', async () => {
    vi.resetModules()
    await import('./rateLimit')
    expect(mockRateLimit).toHaveBeenCalledTimes(4)
  })

  it('should configure searchLimiter with 1-minute window and 300 max', async () => {
    vi.resetModules()
    await import('./rateLimit')
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          success: false,
          error: 'Too many search requests, please try again later',
        },
      }),
    )
  })

  it('should configure syncLimiter with 1-hour window and 10 max', async () => {
    vi.resetModules()
    await import('./rateLimit')
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 60 * 60 * 1000,
        max: 10,
        message: {
          success: false,
          error: 'Too many sync requests, please try again later',
        },
      }),
    )
  })

  it('should configure containerLimiter with 1-minute window and 5 max', async () => {
    vi.resetModules()
    await import('./rateLimit')
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 60 * 1000,
        max: 5,
        message: {
          success: false,
          error: 'Too many container scan requests',
        },
      }),
    )
  })

  it('should configure defaultLimiter with 1-minute window and 60 max', async () => {
    vi.resetModules()
    await import('./rateLimit')
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 60 * 1000,
        max: 60,
        message: {
          success: false,
          error: 'Too many requests, please try again later',
        },
      }),
    )
  })

  it('should have distinct rate limit windows', async () => {
    vi.resetModules()
    await import('./rateLimit')
    const calls = mockRateLimit.mock.calls as Array<[Record<string, unknown>]>
    const windowMs = calls.map((call) => call[0].windowMs as number)

    // searchLimiter: 60s, syncLimiter: 3600s, containerLimiter: 60s, defaultLimiter: 60s
    expect(windowMs[0]).toBe(60_000)
    expect(windowMs[1]).toBe(3_600_000)
    expect(windowMs[2]).toBe(60_000)
    expect(windowMs[3]).toBe(60_000)
  })

  it('should have distinct max request limits', async () => {
    vi.resetModules()
    await import('./rateLimit')
    const calls = mockRateLimit.mock.calls as Array<[Record<string, unknown>]>
    const maxValues = calls.map((call) => call[0].max as number)

    expect(maxValues).toEqual([300, 10, 5, 60])
  })

  it('should enable standardHeaders for all limiters', async () => {
    vi.resetModules()
    await import('./rateLimit')
    const calls = mockRateLimit.mock.calls as Array<[Record<string, unknown>]>
    for (const call of calls) {
      expect(call[0].standardHeaders).toBe(true)
    }
  })

  it('should disable legacyHeaders for all limiters', async () => {
    vi.resetModules()
    await import('./rateLimit')
    const calls = mockRateLimit.mock.calls as Array<[Record<string, unknown>]>
    for (const call of calls) {
      expect(call[0].legacyHeaders).toBe(false)
    }
  })

  it('should include error message in all limiter configs', async () => {
    vi.resetModules()
    await import('./rateLimit')
    const calls = mockRateLimit.mock.calls as Array<[Record<string, unknown>]>
    for (const call of calls) {
      const message = call[0].message as Record<string, unknown>
      expect(message.success).toBe(false)
      expect(typeof message.error).toBe('string')
      expect((message.error as string).length).toBeGreaterThan(0)
    }
  })

  it('should return limiter objects from mock', async () => {
    vi.resetModules()
    const { searchLimiter } = await import('./rateLimit')
    expect(searchLimiter).toMatchObject({
      windowMs: 60_000,
      max: 300,
      __mockLimiter: true,
    })
  })
})
