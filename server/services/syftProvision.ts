/**
 * Syft Provisioning
 *
 * Resolves the path to the Syft CLI used for binary/container -> SBOM generation.
 *
 * Resolution order:
 *   1. SYFT_PATH env var (explicit override)
 *   2. A version-pinned copy previously provisioned into the app data dir
 *   3. `syft` on PATH (same "assume on PATH" convention as docker/podman/tar)
 *
 * Security: when provisioning a copy we download a PINNED release and verify it
 * against the release's published sha256 checksum before trusting it. We never
 * follow mutable tags. (This is the concrete lesson from the March 2026 Trivy
 * supply-chain compromise: pin + verify.)
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, timingSafeEqual } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { config } from '../config.js'

const execFileAsync = promisify(execFile)

/** Pinned Syft release. Bump deliberately, never track a moving tag. */
export const SYFT_VERSION = 'v1.44.0'

const DOWNLOAD_TIMEOUT = 120_000

function binaryName(): string {
  return process.platform === 'win32' ? 'syft.exe' : 'syft'
}

function cacheDir(): string {
  return path.join(config.DATA_DIR, 'tools', `syft-${SYFT_VERSION}`)
}

function cachedBinaryPath(): string {
  return path.join(cacheDir(), binaryName())
}

interface ReleaseAsset {
  archiveName: string
  isZip: boolean
}

/** Map the current platform/arch to the Syft release asset name. */
export function platformAsset(platform: NodeJS.Platform = process.platform, arch: string = process.arch): ReleaseAsset {
  const version = SYFT_VERSION.replace(/^v/, '')
  const osPart = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'darwin' : 'linux'
  const archPart = arch === 'arm64' ? 'arm64' : 'amd64'
  const isZip = platform === 'win32'
  const ext = isZip ? 'zip' : 'tar.gz'
  return { archiveName: `syft_${version}_${osPart}_${archPart}.${ext}`, isZip }
}

/**
 * Find the sha256 hex for `assetName` inside a `checksums.txt` body.
 * Format is `<sha256>  <filename>` per line.
 */
export function findChecksum(checksumsBody: string, assetName: string): string | null {
  for (const line of checksumsBody.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [hash, name] = trimmed.split(/\s+/)
    if (name === assetName && /^[0-9a-f]{64}$/i.test(hash)) {
      return hash.toLowerCase()
    }
  }
  return null
}

/**
 * Verify a file's sha256 matches `expectedHex`. Throws on mismatch.
 * Exported for testing — this is the security-critical gate.
 */
export async function verifyChecksum(filePath: string, expectedHex: string): Promise<void> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve())
  })
  const actual = hash.digest('hex').toLowerCase()
  const expected = expectedHex.toLowerCase()
  const actualBuf = Buffer.from(actual, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new Error(`Syft checksum mismatch: expected ${expected}, got ${actual}. Refusing to use the binary.`)
  }
}

async function download(url: string, destPath: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}) for ${url}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await fs.promises.writeFile(destPath, buffer)
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`)
  }
  return response.text()
}

/**
 * Ensure a pinned, checksum-verified Syft binary exists in the cache and return
 * its path. Downloads on first use. Extraction reuses the OS `tar` command
 * (bsdtar handles both .tar.gz and .zip), matching the ContainerService pattern.
 */
export async function provisionSyft(): Promise<string> {
  const cached = cachedBinaryPath()
  if (fs.existsSync(cached)) {
    return cached
  }

  const dir = cacheDir()
  await fs.promises.mkdir(dir, { recursive: true })

  const { archiveName } = platformAsset()
  const version = SYFT_VERSION.replace(/^v/, '')
  const base = `https://github.com/anchore/syft/releases/download/${SYFT_VERSION}`
  const archivePath = path.join(dir, archiveName)

  await download(`${base}/${archiveName}`, archivePath)

  const checksums = await fetchText(`${base}/syft_${version}_checksums.txt`)
  const expected = findChecksum(checksums, archiveName)
  if (!expected) {
    await fs.promises.rm(archivePath, { force: true })
    throw new Error(`No published checksum found for ${archiveName}`)
  }
  await verifyChecksum(archivePath, expected)

  // Extract just the syft binary. bsdtar (Windows/macOS) and GNU tar both accept -xf.
  await execFileAsync('tar', ['-xf', archivePath, '-C', dir, binaryName()], {
    timeout: DOWNLOAD_TIMEOUT,
    windowsHide: true,
  })
  await fs.promises.rm(archivePath, { force: true })

  if (!fs.existsSync(cached)) {
    throw new Error('Syft binary was not found in the downloaded archive')
  }
  if (process.platform !== 'win32') {
    await fs.promises.chmod(cached, 0o755)
  }
  return cached
}

/**
 * Resolve a usable Syft path without downloading. Returns the explicit override,
 * a cached provisioned copy, or bare `syft` (resolved from PATH by execFile).
 */
export function resolveSyftPath(): string {
  if (process.env.SYFT_PATH && process.env.SYFT_PATH.trim()) {
    return process.env.SYFT_PATH.trim()
  }
  const cached = cachedBinaryPath()
  if (fs.existsSync(cached)) {
    return cached
  }
  return 'syft'
}
