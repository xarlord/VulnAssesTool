/**
 * Syft Service
 *
 * Generates a CycloneDX SBOM from a binary/archive file or a container image
 * reference by shelling out to the Syft CLI. The CycloneDX JSON it returns is
 * consumed unchanged by the existing client-side parser
 * (`src/renderer/lib/parsers/cyclonedx.ts`), so no new parsing is required.
 *
 * Mirrors the ContainerService conventions: `execFile` (never a shell),
 * bounded timeout + buffer, and typed errors.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolveSyftPath } from './syftProvision.js'

const execFileAsync = promisify(execFile)

// Syft can be very slow on large local artifacts (multi-GB prebuilt images), so
// allow up to 15 min before giving up (the client waits at least as long).
const COMMAND_TIMEOUT = 900_000
// SBOMs for large images can be tens of MB.
const MAX_BUFFER = 100 * 1024 * 1024

export type SyftSourceKind = 'file' | 'image' | 'dir'

export interface SyftSource {
  kind: SyftSourceKind
  /** Absolute path (kind: 'file' | 'dir') or image reference (kind: 'image'). */
  value: string
}

export interface SyftEngineStatus {
  available: boolean
  version?: string
  path: string
  error?: string
}

/** Progress phase callback (coarse — before/after the scan). */
export type SyftProgress = (phase: string, message: string) => void

/** Typed error so callers/routes can distinguish failure modes. */
export class SyftError extends Error {
  constructor(
    message: string,
    readonly code: 'not_installed' | 'scan_failed' | 'invalid_output',
  ) {
    super(message)
    this.name = 'SyftError'
  }
}

export class SyftService {
  private readonly syftPath: string

  constructor(syftPath: string = resolveSyftPath()) {
    this.syftPath = syftPath
  }

  /** Report whether Syft is runnable and its version (for UI gating). */
  async getEngineStatus(): Promise<SyftEngineStatus> {
    try {
      const { stdout } = await execFileAsync(this.syftPath, ['version', '-o', 'json'], {
        timeout: 15_000,
        windowsHide: true,
      })
      let version: string | undefined
      try {
        const parsed = JSON.parse(stdout) as { version?: string }
        version = parsed.version
      } catch {
        version = stdout.trim() || undefined
      }
      return { available: true, version, path: this.syftPath }
    } catch (error) {
      return {
        available: false,
        path: this.syftPath,
        error: normalizeExecError(error, this.syftPath).message,
      }
    }
  }

  /**
   * Generate a CycloneDX-JSON SBOM for the given source. Returns the raw JSON
   * text (validated to be CycloneDX). Throws SyftError on failure.
   */
  async generateSbom(source: SyftSource, onProgress?: SyftProgress): Promise<string> {
    // Explicit schemes disambiguate: `file:` for a single artifact/archive,
    // `dir:` for a directory tree (works with Windows drive letters), and a
    // bare reference for an image (Syft detects the registry source itself).
    const target =
      source.kind === 'image' ? source.value : source.kind === 'dir' ? `dir:${source.value}` : `file:${source.value}`

    onProgress?.('scanning', `Analyzing ${source.kind === 'image' ? source.value : 'source'} with Syft...`)

    let stdout: string
    try {
      const result = await execFileAsync(this.syftPath, [target, '-o', 'cyclonedx-json', '-q'], {
        timeout: COMMAND_TIMEOUT,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
      })
      stdout = result.stdout
    } catch (error) {
      const normalized = normalizeExecError(error, this.syftPath)
      if (normalized.notFound) {
        throw new SyftError(
          `Syft is not installed or not on PATH (${this.syftPath}). Install Syft to generate SBOMs from binaries.`,
          'not_installed',
        )
      }
      throw new SyftError(`Syft failed to analyze the source: ${normalized.message}`, 'scan_failed')
    }

    // Validate it is CycloneDX before handing back — the client parser requires this.
    try {
      const parsed = JSON.parse(stdout) as { bomFormat?: string }
      if (parsed.bomFormat !== 'CycloneDX') {
        throw new Error('output is not a CycloneDX document')
      }
    } catch (error) {
      throw new SyftError(
        `Syft did not produce valid CycloneDX JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
        'invalid_output',
      )
    }

    onProgress?.('done', 'SBOM generated')
    return stdout
  }
}

interface NormalizedExecError {
  message: string
  notFound: boolean
}

function normalizeExecError(error: unknown, tool: string): NormalizedExecError {
  const execError = error as { stderr?: string; message?: string; code?: string }
  const stderr = execError.stderr || ''
  const message = execError.message || 'command failed'
  const notFound =
    message.includes('ENOENT') ||
    message.includes('not found') ||
    message.includes('not recognized') ||
    execError.code === 'ENOENT'
  if (notFound) {
    return { message: `${tool} not found`, notFound: true }
  }
  return { message: `${message}. ${stderr}`.trim(), notFound: false }
}
