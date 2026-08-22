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

/**
 * Syft source schemes that read the LOCAL FILESYSTEM rather than a registry.
 *
 * These matter because `kind: 'image'` passes its value to Syft verbatim, so an image reference
 * carrying one of these prefixes makes Syft catalog a host path instead of an image. That routes
 * straight around the `SBOM_LOCAL_SCAN_ROOT` containment the sibling `localPath` input enforces
 * (`server/routes/sbom.ts`) — and works even when that variable is unset, which disables local
 * scanning entirely. Reported as SEC-1 in docs/reports/code-review-2026-08-22.md and reproduced:
 * `imageRef: 'dir:<host path>'` returned an SBOM of that directory.
 */
const FILESYSTEM_SOURCE_SCHEMES = [
  'dir',
  'file',
  'docker-archive',
  'oci-archive',
  'oci-dir',
  'singularity',
  'sbom',
  'attestation',
] as const

/**
 * Reject an image reference that is not one. Two distinct problems:
 *
 *  1. A leading `-` lands in Syft's argv where the target belongs and is parsed as a FLAG, not a
 *     target (verified: `imageRef: '--help'` returns Syft's help text). Argument injection.
 *  2. A filesystem scheme prefix turns a registry lookup into a host-filesystem catalog.
 *
 * Deliberately a denylist of schemes rather than an allowlist of reference shapes: registry
 * references are far too varied (`nginx`, `host:5000/team/repo@sha256:…`) to pattern-match without
 * rejecting valid input, whereas Syft's scheme set is finite and documented.
 */
export function assertRegistryImageRef(imageRef: string): void {
  const value = imageRef.trim()
  if (!value) {
    throw new SyftError('Image reference is empty.', 'scan_failed')
  }
  if (value.startsWith('-')) {
    throw new SyftError(
      `Image reference may not start with "-" (would be read as a Syft flag): ${imageRef}`,
      'scan_failed',
    )
  }
  const scheme = value.slice(0, value.indexOf(':')).toLowerCase()
  if (scheme && (FILESYSTEM_SOURCE_SCHEMES as readonly string[]).includes(scheme)) {
    throw new SyftError(
      `Image reference may not use the local-filesystem source "${scheme}:". ` +
        'Use the local-path input instead, which is confined to SBOM_LOCAL_SCAN_ROOT.',
      'scan_failed',
    )
  }
}

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
    // Only the 'image' value is caller-supplied free text; 'dir'/'file' values are already
    // resolved and containment-checked by the route before they reach here.
    if (source.kind === 'image') assertRegistryImageRef(source.value)

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
