import { describe, it, expect } from 'vitest'
import { sha256Hex } from './sha256'

describe('sha256Hex', () => {
  it('produces the known SHA-256 digest of the empty string', async () => {
    // WHY: pins the function to the real SHA-256 algorithm, not any hash. If the
    // implementation silently changed algorithm/encoding, this vector breaks.
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('is deterministic: identical input yields an identical digest', async () => {
    // WHY: the whole point of a content hash (SBOM fileHash, audit chain) is that
    // the same bytes always hash the same. The bug this replaces used Date.now()+
    // Math.random(), which produced a different value every call for one file.
    expect(await sha256Hex('the same bytes')).toBe(await sha256Hex('the same bytes'))
  })

  it('is content-derived: different input yields a different digest', async () => {
    expect(await sha256Hex('content A')).not.toBe(await sha256Hex('content B'))
  })

  it('returns a 64-character lowercase hex string', async () => {
    expect(await sha256Hex('anything')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes an ArrayBuffer identically to its UTF-8 string form', async () => {
    const text = 'buffer vs string'
    const buffer = new TextEncoder().encode(text).buffer
    expect(await sha256Hex(buffer)).toBe(await sha256Hex(text))
  })
})
