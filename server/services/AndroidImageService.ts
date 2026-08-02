/**
 * Android Image Service
 *
 * Turns an Android prebuilt-image directory (super.img + boot.img + …) into a
 * CycloneDX SBOM by running scripts/unpack-android-image.sh, which unpacks the
 * sparse/super/EROFS partitions that Syft cannot read directly and then scans
 * the extracted trees. Implements the §1 fallback from
 * docs/sbom-cataloging-guidelines.md.
 *
 * On Windows the unpack must run in Linux, so we invoke the script through WSL2
 * (`wsl.exe -d <distro> -e bash <script> <dir>`); on a Linux host we run bash
 * directly. Progress lines the script prints as `PROGRESS:<msg>` on stderr are
 * forwarded to the caller.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs'
import * as path from 'node:path'

/** Android sparse image magic (super.img), little-endian 0x3aff26ed. */
const SPARSE_MAGIC = Buffer.from([0x3a, 0xff, 0x26, 0xed])
/** liblp geometry magic ('gDla', 0x616c4467) at offset 4096 of a raw super image. */
const LP_GEOMETRY_MAGIC = Buffer.from([0x67, 0x44, 0x6c, 0x61])
/** Android boot image magic. */
const BOOT_MAGIC = Buffer.from('ANDROID!', 'ascii')

/** Coarse progress callback (phase message shown in the UI). */
export type AndroidProgress = (message: string) => void

export class AndroidImageError extends Error {
  constructor(
    message: string,
    readonly code: 'no_wsl' | 'unpack_failed' | 'invalid_output',
  ) {
    super(message)
    this.name = 'AndroidImageError'
  }
}

function readMagic(filePath: string, offset: number, length: number): Buffer | null {
  try {
    const fd = fs.openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(length)
      const read = fs.readSync(fd, buf, 0, length, offset)
      return read === length ? buf : null
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return null
  }
}

/**
 * True when `dir` looks like an Android prebuilt-image directory: a super.img
 * that is either an Android sparse image or a raw LP super container, or an
 * Android boot image. These are exactly the artifacts Syft can't read as-is.
 */
export function isAndroidImageDir(dir: string): boolean {
  try {
    if (!fs.statSync(dir).isDirectory()) return false
  } catch {
    return false
  }

  const superImg = path.join(dir, 'super.img')
  if (fs.existsSync(superImg)) {
    const head = readMagic(superImg, 0, 4)
    if (head && head.equals(SPARSE_MAGIC)) return true
    const geo = readMagic(superImg, 4096, 4)
    if (geo && geo.equals(LP_GEOMETRY_MAGIC)) return true
  }

  const bootImg = path.join(dir, 'boot.img')
  if (fs.existsSync(bootImg)) {
    const head = readMagic(bootImg, 0, 8)
    if (head && head.equals(BOOT_MAGIC)) return true
  }

  return false
}

/** Convert a Windows path (`D:\a\b`) to its WSL mount path (`/mnt/d/a/b`). */
function toWslPath(winPath: string): string {
  const match = /^([A-Za-z]):[\\/](.*)$/.exec(winPath)
  if (!match) return winPath.replace(/\\/g, '/')
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`
}

function scriptPath(): string {
  // server/services/AndroidImageService.ts -> <repo>/scripts/unpack-android-image.sh
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../../scripts/unpack-android-image.sh')
}

export class AndroidImageService {
  private readonly distro: string

  constructor(distro: string = process.env.VAT_WSL_DISTRO || 'Ubuntu') {
    this.distro = distro
  }

  /**
   * Run the unpack + Syft pipeline for an Android image directory and return the
   * CycloneDX JSON. Throws AndroidImageError on failure.
   */
  async generateSbom(imageDir: string, onProgress?: AndroidProgress): Promise<string> {
    const script = scriptPath()
    if (!fs.existsSync(script)) {
      throw new AndroidImageError(`Unpack script not found: ${script}`, 'unpack_failed')
    }

    const isWindows = process.platform === 'win32'
    const command = isWindows ? 'wsl.exe' : 'bash'
    const args = isWindows
      ? ['-d', this.distro, '-e', 'bash', toWslPath(script), toWslPath(imageDir)]
      : [script, imageDir]

    onProgress?.('Starting Android image unpack…')

    return new Promise<string>((resolve, reject) => {
      // Bound both output size and runtime so a runaway or hung unpack can't exhaust memory
      // or leave the child (and request) alive forever, matching SyftService's limits.
      const MAX_STDOUT_BYTES = 100 * 1024 * 1024 // 100MB
      const UNPACK_TIMEOUT_MS = 900_000 // 15 min
      let stdout = ''
      let stdoutBytes = 0
      let stderrTail = ''
      let settled = false
      const child = spawn(command, args, { windowsHide: true })

      const timeoutTimer = setTimeout(() => {
        if (settled) return
        settled = true
        child.kill()
        reject(new AndroidImageError('Android image unpack timed out', 'unpack_failed'))
      }, UNPACK_TIMEOUT_MS)

      child.stdout.setEncoding('utf-8')
      child.stdout.on('data', (chunk: string) => {
        stdoutBytes += Buffer.byteLength(chunk)
        if (stdoutBytes > MAX_STDOUT_BYTES) {
          if (settled) return
          settled = true
          clearTimeout(timeoutTimer)
          child.kill()
          reject(new AndroidImageError('Android unpack output exceeded the maximum buffer size', 'unpack_failed'))
          return
        }
        stdout += chunk
      })

      child.stderr.setEncoding('utf-8')
      child.stderr.on('data', (chunk: string) => {
        for (const line of chunk.split('\n')) {
          const progress = line.match(/^PROGRESS:(.*)$/)
          if (progress) {
            onProgress?.(progress[1].trim())
          }
        }
        stderrTail = (stderrTail + chunk).slice(-4000)
      })

      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timeoutTimer)
        if (settled) return
        settled = true
        if (err.code === 'ENOENT') {
          reject(
            new AndroidImageError(
              isWindows
                ? 'WSL2 is required to scan Android images on Windows, but `wsl.exe` was not found.'
                : 'bash was not found to run the Android unpack script.',
              'no_wsl',
            ),
          )
          return
        }
        reject(new AndroidImageError(`Failed to start Android unpack: ${err.message}`, 'unpack_failed'))
      })

      child.on('close', (exitCode) => {
        clearTimeout(timeoutTimer)
        if (settled) return
        settled = true
        if (exitCode !== 0) {
          reject(
            new AndroidImageError(
              `Android unpack failed (exit ${exitCode}). ${stderrTail.trim().split('\n').slice(-3).join(' ')}`,
              'unpack_failed',
            ),
          )
          return
        }
        try {
          const parsed = JSON.parse(stdout) as { bomFormat?: string }
          if (parsed.bomFormat !== 'CycloneDX') {
            throw new Error('output is not a CycloneDX document')
          }
        } catch (error) {
          reject(
            new AndroidImageError(
              `Android unpack did not produce valid CycloneDX JSON: ${
                error instanceof Error ? error.message : 'unknown error'
              }`,
              'invalid_output',
            ),
          )
          return
        }
        onProgress?.('Android image SBOM ready')
        resolve(stdout)
      })
    })
  }
}
