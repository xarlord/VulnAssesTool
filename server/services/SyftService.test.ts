import { describe, it, expect, beforeEach, vi } from 'vitest'
import { parseCycloneDX } from '../../src/renderer/lib/parsers/cyclonedx.js'

// Controllable stand-in for child_process.execFile. Hoisted so it can be
// referenced inside the vi.mock factory.
const execState = vi.hoisted(() => ({
  impl: (_args: unknown[], cb: (err: unknown, res?: { stdout: string; stderr: string }) => void) =>
    cb(null, { stdout: '', stderr: '' }),
}))

vi.mock('node:child_process', () => {
  const execFile = (...args: unknown[]) => {
    const cb = args[args.length - 1] as (err: unknown, res?: { stdout: string; stderr: string }) => void
    execState.impl(args, cb)
  }
  return { execFile, default: { execFile } }
})

// Imported after the mock is registered.
const { SyftService, SyftError, assertRegistryImageRef } = await import('./SyftService.js')

// A realistic Syft `cyclonedx-json` document (bomFormat + purl-bearing components).
const SYFT_CYCLONEDX = JSON.stringify({
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  metadata: { tools: { components: [{ name: 'syft', version: '1.44.0' }] } },
  components: [
    { type: 'library', name: 'openssl', version: '3.0.2', purl: 'pkg:deb/debian/openssl@3.0.2' },
    { type: 'library', name: 'zlib', version: '1.2.11', purl: 'pkg:generic/zlib@1.2.11' },
  ],
})

describe('SyftService.generateSbom', () => {
  beforeEach(() => {
    execState.impl = (_args, cb) => cb(null, { stdout: SYFT_CYCLONEDX, stderr: '' })
  })

  it('returns CycloneDX JSON that round-trips the existing importer with purl ids', async () => {
    // Intent: the whole "integrate easily" claim rests on Syft output flowing
    // through parseCycloneDX unchanged, with purl preserved as the component id
    // (so vulnerability `affects` refs resolve). If that breaks, the feature is dead.
    const svc = new SyftService('syft')
    const json = await svc.generateSbom({ kind: 'image', value: 'alpine:3.19' })

    const parsed = await parseCycloneDX(json, 'syft-generated.json')
    expect(parsed.metadata.format).toBe('cyclonedx')
    expect(parsed.components).toHaveLength(2)
    expect(parsed.components[0].purl).toBe('pkg:deb/debian/openssl@3.0.2')
    expect(parsed.components[0].id).toBe('pkg:deb/debian/openssl@3.0.2')
  })

  it('rejects output that is not a CycloneDX document', async () => {
    // Intent: never hand non-CycloneDX text to the importer — fail loudly instead.
    execState.impl = (_args, cb) => cb(null, { stdout: JSON.stringify({ notCyclone: true }), stderr: '' })
    let caught: unknown
    try {
      await new SyftService('syft').generateSbom({ kind: 'file', value: '/tmp/x' })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(SyftError)
    expect((caught as InstanceType<typeof SyftError>).code).toBe('invalid_output')
  })

  it('maps a missing Syft binary to a not_installed error', async () => {
    // Intent: a clear, actionable error when Syft is absent (like docker/podman today).
    execState.impl = (_args, cb) => cb(new Error('spawn syft ENOENT'))
    let caught: unknown
    try {
      await new SyftService('syft').generateSbom({ kind: 'image', value: 'alpine:3.19' })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(SyftError)
    expect((caught as InstanceType<typeof SyftError>).code).toBe('not_installed')
  })

  it('uses the file: scheme for uploaded artifacts', async () => {
    // Intent: uploaded artifacts must be passed unambiguously as a file source,
    // not misinterpreted as an image reference.
    let seenArgs: unknown[] = []
    execState.impl = (args, cb) => {
      seenArgs = args[1] as unknown[]
      cb(null, { stdout: SYFT_CYCLONEDX, stderr: '' })
    }
    await new SyftService('syft').generateSbom({ kind: 'file', value: '/tmp/app.jar' })
    expect(seenArgs[0]).toBe('file:/tmp/app.jar')
    expect(seenArgs).toContain('cyclonedx-json')
  })
})

// SEC-1 (docs/reports/code-review-2026-08-22.md). The `imageRef` input reached Syft's argv with no
// validation at all, while the sibling `localPath` input was confined to SBOM_LOCAL_SCAN_ROOT.
// Both bypasses below were REPRODUCED against the real Syft v1.44.0 before this guard existed:
// `dir:<host path>` returned an SBOM of that directory, and `--help` returned Syft's help text.
describe('assertRegistryImageRef (SEC-1)', () => {
  it('rejects filesystem source schemes that would bypass the local-scan containment', () => {
    for (const ref of [
      'dir:C:/Users',
      'dir:/etc',
      'file:/etc/passwd',
      'DIR:/etc',
      'oci-dir:/var/lib',
      'docker-archive:/tmp/x.tar',
      'oci-archive:/tmp/x.tar',
      'singularity:/tmp/x.sif',
      'sbom:/tmp/x.json',
    ]) {
      expect(() => assertRegistryImageRef(ref), ref).toThrow(/local-filesystem source/i)
    }
  })

  it('rejects a reference that would be parsed as a Syft flag rather than a target', () => {
    for (const ref of ['--help', '-o', '--output=/tmp/x']) {
      expect(() => assertRegistryImageRef(ref), ref).toThrow(/may not start with/i)
    }
  })

  it('rejects an empty or whitespace-only reference', () => {
    expect(() => assertRegistryImageRef('')).toThrow(/empty/i)
    expect(() => assertRegistryImageRef('   ')).toThrow(/empty/i)
  })

  // The guard is worthless if it also blocks real work, and registry references are varied:
  // a bare name, a tag, a digest, a host with a PORT (which looks like a scheme), and Syft's own
  // registry-side schemes must all still pass.
  it('accepts the registry references people actually use', () => {
    for (const ref of [
      'nginx',
      'nginx:latest',
      'docker.io/library/nginx:1.25.3',
      'ghcr.io/owner/repo:sha-abc123',
      'registry.example.com:5000/team/service:2.1.0',
      'alpine@sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      'registry:nginx:latest',
      'docker:nginx:latest',
      'podman:nginx:latest',
    ]) {
      expect(() => assertRegistryImageRef(ref), ref).not.toThrow()
    }
  })
})
