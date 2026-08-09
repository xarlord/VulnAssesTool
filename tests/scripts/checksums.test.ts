/**
 * Tests for the release checksum utility (SR-03 — update security / checksum validation).
 *
 * WHY: SR-03 calls for checksum validation of release artifacts. Post-Electron the app ships
 * as a self-hosted web server + CLI (no signed desktop installers), so artifact *integrity via
 * SHA256 checksums* is the meaningful, achievable control. This util is its tested core: it must
 * produce the canonical SHA256 for a file's bytes, emit the standard `<hash>  <name>` format that
 * `sha256sum -c` consumes, and — the load-bearing case — its verification must REJECT a tampered
 * artifact. A silent-accept there would defeat the whole integrity check.
 */
import { describe, it, expect } from 'vitest'
import { sha256Hex, formatChecksumsFile, parseChecksumsFile, verifyChecksum } from '../../scripts/lib/checksums.mjs'

describe('release checksum utility (SR-03)', () => {
  it('computes the canonical SHA256 of a buffer', () => {
    // Known-answer test: SHA256("hello") is a fixed, independently verifiable value.
    expect(sha256Hex(Buffer.from('hello', 'utf8'))).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
  })

  it('emits the standard "<hash>  <file>" lines that sha256sum -c consumes', () => {
    const content = formatChecksumsFile([
      { file: 'vulnasstool-2.0.0.tar.gz', sha256: 'aaa' },
      { file: 'vulnshield-cli.tar.gz', sha256: 'bbb' },
    ])
    expect(content).toBe('aaa  vulnasstool-2.0.0.tar.gz\nbbb  vulnshield-cli.tar.gz\n')
  })

  it('round-trips through parse (two-space GNU separator)', () => {
    const entries = [
      { file: 'vulnasstool-2.0.0.tar.gz', sha256: 'aaa' },
      { file: 'vulnshield-cli.tar.gz', sha256: 'bbb' },
    ]
    expect(parseChecksumsFile(formatChecksumsFile(entries))).toEqual(entries)
  })

  it('accepts an untampered artifact and REJECTS a tampered one', () => {
    const bytes = Buffer.from('release artifact contents', 'utf8')
    const good = sha256Hex(bytes)
    expect(verifyChecksum(good, bytes)).toBe(true)
    // A single flipped byte must fail verification — the entire point of SR-03.
    expect(verifyChecksum(good, Buffer.from('release artifact contentX', 'utf8'))).toBe(false)
  })
})
