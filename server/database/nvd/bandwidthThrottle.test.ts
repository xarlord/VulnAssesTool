/**
 * Unit tests for NVD bulk-download bandwidth throttling (FR-10.3).
 *
 * `computeThrottleDelayMs` answers a single question: after downloading a page
 * of `bytes`, how long must we wait so the *average* transfer rate stays at or
 * below `kbpsLimit` KB/s? The delay is the time that many bytes SHOULD have
 * taken at the limit, so the next request is deferred by the overshoot.
 *
 * WHY the concrete magnitudes matter: a limit is only meaningful if the math is
 * right. An inverted formula (rate/bytes), a unit slip (KB vs bytes), or a
 * failure to treat "<= 0" as unlimited would each still "return a number" — so
 * the assertions below pin exact millisecond values, not just the type.
 */

import { describe, it, expect } from 'vitest'
import { computeThrottleDelayMs } from './bandwidthThrottle.js'

describe('computeThrottleDelayMs (FR-10.3)', () => {
  it('returns 0 when the limit is 0 (unlimited) — the default must not throttle', () => {
    // The whole feature must be a no-op at the default so existing sync speed is unchanged.
    expect(computeThrottleDelayMs(1024, 0)).toBe(0)
  })

  it('returns 0 for a negative/invalid limit rather than producing a bogus wait', () => {
    expect(computeThrottleDelayMs(1024, -5)).toBe(0)
  })

  it('returns 0 when no bytes were downloaded', () => {
    expect(computeThrottleDelayMs(0, 100)).toBe(0)
  })

  it('waits ~1s after 100KB at a 100KB/s limit (correct magnitude and units)', () => {
    // 100 KB (102400 bytes) at 100 KB/s should take ~1000ms; a KB-vs-byte slip
    // would be off by 1024x and fail this.
    expect(computeThrottleDelayMs(102400, 100)).toBe(1000)
  })

  it('scales the delay linearly with bytes (not inverted)', () => {
    // Twice the payload -> twice the wait. An inverted formula would shrink it.
    expect(computeThrottleDelayMs(204800, 100)).toBe(2000)
  })

  it('scales the delay inversely with the rate limit', () => {
    // Half the allowed rate -> twice the wait for the same payload.
    expect(computeThrottleDelayMs(102400, 50)).toBe(2000)
  })
})
