import { describe, it, expect, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { findChecksum, verifyChecksum, platformAsset, SYFT_VERSION } from './syftProvision.js'

describe('syftProvision.findChecksum', () => {
  const body = [
    `${'a'.repeat(64)}  syft_1.44.0_linux_amd64.tar.gz`,
    `${'b'.repeat(64)}  syft_1.44.0_windows_amd64.zip`,
    'garbage-line-no-hash',
  ].join('\n')

  it('returns the sha256 for the exact matching asset name', () => {
    // Intent: we must bind the checksum to the exact artifact we downloaded,
    // never a different asset — otherwise verification is meaningless.
    expect(findChecksum(body, 'syft_1.44.0_windows_amd64.zip')).toBe('b'.repeat(64))
  })

  it('returns null when the asset is absent', () => {
    expect(findChecksum(body, 'syft_1.44.0_darwin_arm64.tar.gz')).toBeNull()
  })

  it('ignores lines whose hash is not a 64-char hex', () => {
    const bad = `nothex  syft_1.44.0_linux_amd64.tar.gz`
    expect(findChecksum(bad, 'syft_1.44.0_linux_amd64.tar.gz')).toBeNull()
  })
})

describe('syftProvision.verifyChecksum', () => {
  const tmpFiles: string[] = []

  afterEach(async () => {
    await Promise.all(tmpFiles.splice(0).map((f) => fs.rm(f, { force: true })))
  })

  async function writeTemp(content: string): Promise<string> {
    const p = path.join(os.tmpdir(), `vat-syft-verify-${process.pid}-${tmpFiles.length}.bin`)
    await fs.writeFile(p, content)
    tmpFiles.push(p)
    return p
  }

  it('resolves when the sha256 matches', async () => {
    const content = 'pinned syft binary bytes'
    const p = await writeTemp(content)
    const sha = createHash('sha256').update(content).digest('hex')
    await expect(verifyChecksum(p, sha)).resolves.toBeUndefined()
  })

  it('rejects when the sha256 does NOT match (security gate)', async () => {
    // Intent: a tampered/wrong binary must be refused before we ever execute it.
    // This is the concrete defense against a Trivy-style poisoned-release attack.
    const p = await writeTemp('pinned syft binary bytes')
    await expect(verifyChecksum(p, 'f'.repeat(64))).rejects.toThrow(/mismatch/i)
  })
})

describe('syftProvision.platformAsset', () => {
  const version = SYFT_VERSION.replace(/^v/, '')

  it('maps linux/amd64 to a .tar.gz asset', () => {
    const asset = platformAsset('linux', 'x64')
    expect(asset.archiveName).toBe(`syft_${version}_linux_amd64.tar.gz`)
    expect(asset.isZip).toBe(false)
  })

  it('maps darwin/arm64 correctly', () => {
    expect(platformAsset('darwin', 'arm64').archiveName).toBe(`syft_${version}_darwin_arm64.tar.gz`)
  })

  it('maps win32 to a .zip asset (extraction differs)', () => {
    const asset = platformAsset('win32', 'x64')
    expect(asset.archiveName).toBe(`syft_${version}_windows_amd64.zip`)
    expect(asset.isZip).toBe(true)
  })
})
