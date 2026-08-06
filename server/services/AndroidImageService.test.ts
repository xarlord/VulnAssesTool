/**
 * Tests for Android-image *detection* (isAndroidImageDir).
 *
 * The full unpack+scan pipeline needs WSL2 and a multi-GB image, so it is
 * verified manually against a real device image (see docs/sbom-cataloging-
 * guidelines.md §1) rather than in CI. What matters to keep correct here is the
 * routing decision: a directory is only sent down the (expensive, WSL) Android
 * path when it actually carries artifacts Syft can't read — a sparse/super
 * super.img or an Android boot.img — and never otherwise.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { isAndroidImageDir } from './AndroidImageService.js'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vat-android-detect-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

/** Write a file whose first bytes are `magic`, optionally at a byte offset. */
function writeWithMagic(name: string, magic: Buffer, offset = 0): void {
  const buf = Buffer.alloc(offset + magic.length)
  magic.copy(buf, offset)
  fs.writeFileSync(path.join(dir, name), buf)
}

describe('isAndroidImageDir', () => {
  it('detects a sparse super.img (magic 0x3aff26ed)', () => {
    writeWithMagic('super.img', Buffer.from([0x3a, 0xff, 0x26, 0xed]))
    expect(isAndroidImageDir(dir)).toBe(true)
  })

  it('detects a raw LP super.img (gDla geometry magic at offset 4096)', () => {
    writeWithMagic('super.img', Buffer.from([0x67, 0x44, 0x6c, 0x61]), 4096)
    expect(isAndroidImageDir(dir)).toBe(true)
  })

  it('detects an Android boot.img (ANDROID! magic)', () => {
    writeWithMagic('boot.img', Buffer.from('ANDROID!', 'ascii'))
    expect(isAndroidImageDir(dir)).toBe(true)
  })

  it('ignores a super.img with an unrelated header (does not route to unpack)', () => {
    writeWithMagic('super.img', Buffer.from([0x00, 0x01, 0x02, 0x03]))
    expect(isAndroidImageDir(dir)).toBe(false)
  })

  it('returns false for an ordinary directory (e.g. an extracted rootfs)', () => {
    fs.writeFileSync(path.join(dir, 'README.txt'), 'hello')
    fs.mkdirSync(path.join(dir, 'usr'))
    expect(isAndroidImageDir(dir)).toBe(false)
  })

  it('returns false for a non-existent path', () => {
    expect(isAndroidImageDir(path.join(dir, 'nope'))).toBe(false)
  })

  it('returns false when given a file instead of a directory', () => {
    const file = path.join(dir, 'super.img')
    writeWithMagic('super.img', Buffer.from([0x3a, 0xff, 0x26, 0xed]))
    expect(isAndroidImageDir(file)).toBe(false)
  })
})
