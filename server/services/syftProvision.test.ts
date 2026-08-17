import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as fsSync from 'node:fs'
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

// --- provisionSyft / resolveSyftPath ------------------------------------------------
// These read `config.DATA_DIR` (cache location) and shell out to `tar`/PowerShell for
// extraction, so both must be mocked to exercise their branches without touching the
// network or a real syft binary. Mirrors the execFile-mock pattern used in
// ContainerService.test.ts / SyftService.test.ts.

const provisionConfigState = vi.hoisted(() => ({ config: { DATA_DIR: '' } }))
vi.mock('../config.js', () => ({ config: provisionConfigState.config, isDev: () => false }))

const provisionExecState = vi.hoisted(() => ({
  handlers: new Map<string, (args: string[], options: Record<string, unknown>) => { stdout: string; stderr: string }>(),
}))
vi.mock('node:child_process', () => {
  const execFile = (...callArgs: unknown[]) => {
    const cmd = callArgs[0] as string
    const cmdArgs = (callArgs[1] as string[] | undefined) || []
    const maybeOptions = callArgs[2]
    const options = (typeof maybeOptions === 'object' && maybeOptions !== null ? maybeOptions : {}) as Record<
      string,
      unknown
    >
    const callback = callArgs[callArgs.length - 1] as (err: unknown, res?: { stdout: string; stderr: string }) => void
    const handler = provisionExecState.handlers.get(cmd)
    if (!handler) {
      callback(new Error(`ENOENT: no test handler registered for "${cmd}"`))
      return
    }
    try {
      callback(null, handler(cmdArgs, options))
    } catch (err) {
      callback(err)
    }
  }
  return { execFile, default: { execFile } }
})

interface MockFetchResponse {
  ok: boolean
  status?: number
  arrayBuffer?: () => Promise<ArrayBuffer>
  text?: () => Promise<string>
}

const provisionFetchState = vi.hoisted(() => ({ queue: [] as MockFetchResponse[] }))
const mockFetchImpl = vi.fn(async (): Promise<MockFetchResponse> => {
  const next = provisionFetchState.queue.shift()
  if (!next) throw new Error('no mock fetch response queued')
  return next
})
global.fetch = mockFetchImpl as unknown as typeof fetch

// Imported after the mocks above are registered (vi.mock is hoisted above imports).
const { provisionSyft, resolveSyftPath } = await import('./syftProvision.js')

/** Exact-size ArrayBuffer (never a shared pooled one) so the downloaded bytes == `content`. */
function encodeArrayBuffer(content: string): ArrayBuffer {
  return new TextEncoder().encode(content).buffer
}

/** Forces process.platform for the duration of an async op, then restores it. */
async function withPlatform<T>(platform: NodeJS.Platform, run: () => Promise<T>): Promise<T> {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', { value: original })
  }
}

describe('syftProvision.resolveSyftPath', () => {
  let dataDir = ''

  beforeEach(() => {
    dataDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'vat-syftprov-resolve-'))
    provisionConfigState.config.DATA_DIR = dataDir
  })

  afterEach(() => {
    delete process.env.SYFT_PATH
    fsSync.rmSync(dataDir, { recursive: true, force: true })
  })

  it('uses SYFT_PATH verbatim (trimmed) as an explicit override, before ever checking the cache', () => {
    // WHY: SYFT_PATH is documented as the highest-priority override; if a cached copy could
    // win instead, an operator pointing at a specific syft build would be silently ignored.
    process.env.SYFT_PATH = '  /opt/custom/syft  '
    expect(resolveSyftPath()).toBe('/opt/custom/syft')
  })

  it('ignores a whitespace-only SYFT_PATH and falls through to the cache/PATH check', () => {
    // WHY: an accidentally-set blank env var (e.g. SYFT_PATH="" from a shell template) must not
    // be treated as a real override, or a valid cached/PATH syft would never be used.
    process.env.SYFT_PATH = '   '
    expect(resolveSyftPath()).toBe('syft')
  })

  it('returns the cached provisioned binary path when one exists and SYFT_PATH is unset', () => {
    const cacheDir = path.join(dataDir, 'tools', `syft-${SYFT_VERSION}`)
    fsSync.mkdirSync(cacheDir, { recursive: true })
    const cached = path.join(cacheDir, process.platform === 'win32' ? 'syft.exe' : 'syft')
    fsSync.writeFileSync(cached, 'stub')

    expect(resolveSyftPath()).toBe(cached)
  })

  it('falls back to bare "syft" (resolved from PATH) when nothing is cached and SYFT_PATH is unset', () => {
    expect(resolveSyftPath()).toBe('syft')
  })
})

describe('syftProvision.provisionSyft', () => {
  let dataDir = ''

  beforeEach(() => {
    dataDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'vat-syftprov-provision-'))
    provisionConfigState.config.DATA_DIR = dataDir
    mockFetchImpl.mockClear()
  })

  afterEach(() => {
    provisionExecState.handlers.clear()
    provisionFetchState.queue.length = 0
    fsSync.rmSync(dataDir, { recursive: true, force: true })
  })

  it('returns the already-cached binary without downloading anything', async () => {
    // WHY: re-provisioning on every call would defeat the point of caching and needlessly hit
    // the network on every scan.
    const cacheDir = path.join(dataDir, 'tools', `syft-${SYFT_VERSION}`)
    fsSync.mkdirSync(cacheDir, { recursive: true })
    const cached = path.join(cacheDir, process.platform === 'win32' ? 'syft.exe' : 'syft')
    fsSync.writeFileSync(cached, 'stub')

    await expect(provisionSyft()).resolves.toBe(cached)
    expect(mockFetchImpl).not.toHaveBeenCalled()
  })

  it('propagates a clear error when the release asset download responds not-ok (e.g. 404)', async () => {
    provisionFetchState.queue.push({ ok: false, status: 404 })

    await expect(provisionSyft()).rejects.toThrow(/Download failed \(404\)/)
  })

  it('propagates a clear error when the checksums.txt download responds not-ok', async () => {
    provisionFetchState.queue.push({ ok: true, arrayBuffer: async () => encodeArrayBuffer('archive-bytes') })
    provisionFetchState.queue.push({ ok: false, status: 500 })

    await expect(provisionSyft()).rejects.toThrow(/Download failed \(500\)/)
  })

  it('removes the downloaded archive and throws when no checksum is published for the asset', async () => {
    // WHY: silently trusting an unverifiable binary would defeat the pin+verify defense this
    // module exists for (see the Trivy supply-chain note at the top of the source file).
    provisionFetchState.queue.push({ ok: true, arrayBuffer: async () => encodeArrayBuffer('archive-bytes') })
    provisionFetchState.queue.push({ ok: true, text: async () => `${'a'.repeat(64)}  some-other-asset.tar.gz\n` })

    await expect(provisionSyft()).rejects.toThrow(/No published checksum found/)

    const { archiveName } = platformAsset()
    const cacheDir = path.join(dataDir, 'tools', `syft-${SYFT_VERSION}`)
    expect(fsSync.existsSync(path.join(cacheDir, archiveName))).toBe(false)
  })

  it('downloads, verifies, extracts via tar, and chmods the result on a non-Windows platform', async () => {
    await withPlatform('linux', async () => {
      const archiveContent = 'archive-bytes-linux'
      const { archiveName } = platformAsset('linux', process.arch)
      const sha = createHash('sha256').update(archiveContent).digest('hex')
      provisionFetchState.queue.push({ ok: true, arrayBuffer: async () => encodeArrayBuffer(archiveContent) })
      provisionFetchState.queue.push({ ok: true, text: async () => `${sha}  ${archiveName}\n` })

      const cacheDir = path.join(dataDir, 'tools', `syft-${SYFT_VERSION}`)
      const cached = path.join(cacheDir, 'syft')
      provisionExecState.handlers.set('tar', (_args, options) => {
        fsSync.writeFileSync(path.join(options.cwd as string, 'syft'), 'extracted-syft-binary')
        return { stdout: '', stderr: '' }
      })

      const result = await provisionSyft()

      expect(result).toBe(cached)
      expect(fsSync.existsSync(cached)).toBe(true)
      // The archive must be cleaned up after a successful extraction, not left on disk.
      expect(fsSync.existsSync(path.join(cacheDir, archiveName))).toBe(false)
    })
  })

  it('downloads, verifies, and extracts via PowerShell Expand-Archive on Windows (zip asset)', async () => {
    // WHY: Windows release assets are .zip, and GNU tar on PATH there (e.g. Git Bash) can't
    // read zip archives, so this platform must take the PowerShell branch, not the tar one.
    await withPlatform('win32', async () => {
      const archiveContent = 'archive-bytes-windows'
      const { archiveName } = platformAsset('win32', process.arch)
      const sha = createHash('sha256').update(archiveContent).digest('hex')
      provisionFetchState.queue.push({ ok: true, arrayBuffer: async () => encodeArrayBuffer(archiveContent) })
      provisionFetchState.queue.push({ ok: true, text: async () => `${sha}  ${archiveName}\n` })

      const cacheDir = path.join(dataDir, 'tools', `syft-${SYFT_VERSION}`)
      const cached = path.join(cacheDir, 'syft.exe')
      provisionExecState.handlers.set('powershell.exe', () => {
        fsSync.writeFileSync(cached, 'extracted-syft-binary')
        return { stdout: '', stderr: '' }
      })

      const result = await provisionSyft()

      expect(result).toBe(cached)
      expect(fsSync.existsSync(cached)).toBe(true)
    })
  })

  it('throws when the archive extracts without error but the expected binary is absent from it', async () => {
    // WHY: a truncated/mismatched archive must fail loudly instead of returning a path to a
    // binary that doesn't actually exist, which callers would then try to execute.
    await withPlatform('linux', async () => {
      const archiveContent = 'archive-bytes-empty'
      const { archiveName } = platformAsset('linux', process.arch)
      const sha = createHash('sha256').update(archiveContent).digest('hex')
      provisionFetchState.queue.push({ ok: true, arrayBuffer: async () => encodeArrayBuffer(archiveContent) })
      provisionFetchState.queue.push({ ok: true, text: async () => `${sha}  ${archiveName}\n` })
      // Extraction "succeeds" but never writes the binary.
      provisionExecState.handlers.set('tar', () => ({ stdout: '', stderr: '' }))

      await expect(provisionSyft()).rejects.toThrow(/Syft binary was not found in the downloaded archive/)
    })
  })
})
