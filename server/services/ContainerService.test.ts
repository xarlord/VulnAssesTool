import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type { ContainerRuntime } from '../types/container.js'

// Controllable stand-in for child_process.execFile, keyed by the invoked program name
// ('docker' | 'podman' | 'tar'). Hoisted so it is visible inside the vi.mock factory below
// (mirrors the pattern in SyftService.test.ts, another execFile-based shell-out service).
const execState = vi.hoisted(() => ({
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
    const handler = execState.handlers.get(cmd)
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

// Imported after the mock is registered (see SyftService.test.ts for the same pattern).
const { ContainerService, createContainerService } = await import('./ContainerService.js')

afterEach(() => {
  execState.handlers.clear()
})

// Access private methods under test. TS `private` is compile-time only; the runtime object
// exposes them, and vitest runs via esbuild without type-checking, so this is safe.
type PrivateService = {
  runCommand(runtime: ContainerRuntime, args: string[], timeout?: number): Promise<{ stdout: string; stderr: string }>
  extractTar(tarPath: string, destDir: string, options?: { tolerateErrors?: boolean }): Promise<void>
  getLayerDigestFromPath(layerPath: string): string
  getRuntimeSocket(runtime: ContainerRuntime): string
  cleanVersion(version: string): string
  parseDpkgStatus(filePath: string, layerDigest: string): unknown[]
  parseApkInstalled(filePath: string, layerDigest: string): unknown[]
  parseRpmQueryOutput(stdout: string, layerDigest: string): unknown[]
  scanLayerForPackages(layerDir: string, layerDigest: string): Promise<{ packages: unknown[]; warnings: string[] }>
  queryRpmDatabase(rpmDbDir: string): Promise<string>
}

const RPM_OUTPUT =
  ['bash|5.1.8-6.el9|x86_64', 'glibc|2.34-60.el9|x86_64', 'gpg-pubkey|gpg-key-abc|(none)'].join('\n') + '\n'

describe('ContainerService.parseRpmQueryOutput (C1)', () => {
  it('parses rpm -qa output into rpm ContainerPackages', () => {
    const svc = new ContainerService() as unknown as PrivateService

    const pkgs = svc.parseRpmQueryOutput(RPM_OUTPUT, 'sha256:layer') as Array<Record<string, unknown>>

    expect(pkgs).toHaveLength(3)
    const bash = pkgs.find((p) => p.name === 'bash')
    expect(bash).toMatchObject({ name: 'bash', version: '5.1.8-6.el9', manager: 'rpm', architecture: 'x86_64' })
    expect(bash?.purl).toBe('pkg:rpm/bash@5.1.8-6.el9?arch=x86_64')
    // rpm reports "(none)" for arch-less packages; that must be normalized away, not emitted.
    const key = pkgs.find((p) => p.name === 'gpg-pubkey')
    expect(key?.architecture).toBeUndefined()
  })

  it('skips a malformed line missing a name or version instead of emitting a garbage package', () => {
    const svc = new ContainerService() as unknown as PrivateService
    const malformed = ['bash|5.1.8-6.el9|x86_64', '|missing-name|x86_64', 'no-version-field'].join('\n')

    const pkgs = svc.parseRpmQueryOutput(malformed, 'sha256:layer')

    expect(pkgs).toHaveLength(1)
  })
})

describe('ContainerService.scanLayerForPackages rpm fallback (C1)', () => {
  let tmp = ''

  afterEach(() => {
    vi.restoreAllMocks()
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true })
      tmp = ''
    }
  })

  function makeLayerWithRpmDb(): string {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-rpm-'))
    const rpmDir = path.join(tmp, 'var', 'lib', 'rpm')
    fs.mkdirSync(rpmDir, { recursive: true })
    fs.writeFileSync(path.join(rpmDir, 'Packages'), 'binary-rpm-db')
    return tmp
  }

  it('surfaces a warning (not a silent empty list) when rpm cannot be run', async () => {
    // WHY (C1): the old stub returned [] for any rpm layer, so a RHEL/Fedora image with an
    // unparseable rpm DB looked fully scanned with zero packages. Coverage gaps must be visible.
    const svc = new ContainerService() as unknown as PrivateService
    const layerDir = makeLayerWithRpmDb()
    vi.spyOn(svc, 'queryRpmDatabase').mockRejectedValueOnce(new Error('rpm is not installed or not in PATH'))

    const result = await svc.scanLayerForPackages(layerDir, 'sha256:layer')

    expect(result.packages).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toMatch(/rpm/i)
  })

  it('parses packages from the rpm DB when rpm is available', async () => {
    const svc = new ContainerService() as unknown as PrivateService
    const layerDir = makeLayerWithRpmDb()
    vi.spyOn(svc, 'queryRpmDatabase').mockResolvedValueOnce(RPM_OUTPUT)

    const result = await svc.scanLayerForPackages(layerDir, 'sha256:layer')

    expect((result.packages as Array<Record<string, unknown>>).map((p) => p.name)).toEqual(
      expect.arrayContaining(['bash', 'glibc']),
    )
    expect(result.warnings).toEqual([])
  })

  it('warns (does not silently report a clean layer) when rpm runs but the DB yields zero packages', async () => {
    // WHY (C1): a present-but-empty rpm DB is a parsing gap, not evidence the layer truly has
    // zero packages — the old code could not distinguish the two, so it must warn here too.
    const svc = new ContainerService() as unknown as PrivateService
    const layerDir = makeLayerWithRpmDb()
    vi.spyOn(svc, 'queryRpmDatabase').mockResolvedValueOnce('')

    const result = await svc.scanLayerForPackages(layerDir, 'sha256:layer')

    expect(result.packages).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/yielded no packages/)
  })

  it('formats an rpm parsing failure message even when the thrown value is not an Error instance', async () => {
    const svc = new ContainerService() as unknown as PrivateService
    const layerDir = makeLayerWithRpmDb()
    vi.spyOn(svc, 'queryRpmDatabase').mockRejectedValueOnce('rpm binary crashed')

    const result = await svc.scanLayerForPackages(layerDir, 'sha256:layer')

    expect(result.packages).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/rpm binary crashed/)
  })
})

describe('ContainerService.queryRpmDatabase', () => {
  it('resolves with the raw `rpm -qa` stdout on success', async () => {
    execState.handlers.set('rpm', () => ({ stdout: RPM_OUTPUT, stderr: '' }))
    const svc = new ContainerService() as unknown as PrivateService

    await expect(svc.queryRpmDatabase('/some/rpm/dir')).resolves.toBe(RPM_OUTPUT)
  })

  it('maps an ENOENT execFile failure to a clear "rpm not installed" error', async () => {
    // WHY: unlike docker/podman (checked by runCommand), rpm has its own execFileAsync call and
    // needs the same actionable "not installed" mapping instead of a raw ENOENT message.
    execState.handlers.set('rpm', () => {
      throw new Error('spawn rpm ENOENT')
    })
    const svc = new ContainerService() as unknown as PrivateService

    await expect(svc.queryRpmDatabase('/some/rpm/dir')).rejects.toThrow('rpm is not installed or not in PATH')
  })

  it('propagates a non-ENOENT rpm failure as-is (e.g. a corrupt database)', async () => {
    execState.handlers.set('rpm', () => {
      throw new Error('error: rpmdbNextIterator: skipping h#1 corrupt header')
    })
    const svc = new ContainerService() as unknown as PrivateService

    await expect(svc.queryRpmDatabase('/some/rpm/dir')).rejects.toThrow(/corrupt header/)
  })

  it('wraps a non-Error rejection (e.g. a raw string) in an Error instead of throwing it as-is', async () => {
    // WHY: execFile can reject with a non-Error value; callers rely on rejections always being
    // Error instances (e.g. `.message` access), so this must be normalized, not passed through.
    execState.handlers.set('rpm', () => {
      throw 'segmentation fault'
    })
    const svc = new ContainerService() as unknown as PrivateService

    await expect(svc.queryRpmDatabase('/some/rpm/dir')).rejects.toThrow('segmentation fault')
  })
})

describe('ContainerService.getRuntimeSocket', () => {
  it('resolves POSIX socket paths on non-Windows platforms', () => {
    // WHY: checkRuntime's `socket` field is platform-conditional; this test only runs on
    // Windows CI/dev machines, so the POSIX branch needs an explicit platform stub or it would
    // never be exercised.
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux' })
    try {
      const svc = new ContainerService() as unknown as PrivateService
      expect(svc.getRuntimeSocket('docker')).toBe('/var/run/docker.sock')
      expect(svc.getRuntimeSocket('podman')).toBe('/run/user/1000/podman/podman.sock')
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('returns an empty socket path for a runtime outside the known set (defensive default branch)', () => {
    const svc = new ContainerService() as unknown as PrivateService

    expect(svc.getRuntimeSocket('containerd' as unknown as ContainerRuntime)).toBe('')
  })
})

describe('ContainerService.runCommand (arbitrary command execution guard)', () => {
  it('rejects a runtime outside the docker/podman allowlist before shelling out', async () => {
    // WHY: `runtime` can arrive straight from a request body (a compile-time-only type), so an
    // unvalidated value would become the literal executable passed to execFile — i.e. arbitrary
    // command execution. If the guard were skipped, execFile would run with no handler
    // registered and reject with a different (ENOENT-style) message instead, so pinning this
    // exact message also proves the guard runs before any shell-out is attempted.
    const svc = new ContainerService() as unknown as PrivateService

    await expect(svc.runCommand('sh -c "rm -rf /"' as unknown as ContainerRuntime, ['version'])).rejects.toThrow(
      'Unsupported container runtime: sh -c "rm -rf /"',
    )
  })

  it('maps an ENOENT execFile failure to a clear "not installed" message', async () => {
    execState.handlers.set('docker', () => {
      throw new Error('spawn docker ENOENT')
    })
    const svc = new ContainerService() as unknown as PrivateService

    await expect(svc.runCommand('docker', ['version'])).rejects.toThrow(/docker is not installed or not in PATH/)
  })

  it('wraps a non-zero-exit failure (e.g. a timeout) with the command and stderr for diagnosis', async () => {
    // WHY: the CLI is invoked with a bounded timeout; a hang must surface as an actionable
    // error (command + stderr), not an opaque rejection.
    execState.handlers.set('docker', () => {
      const timeoutError = new Error('Command failed: docker ps') as Error & { stderr?: string }
      timeoutError.stderr = 'context deadline exceeded'
      throw timeoutError
    })
    const svc = new ContainerService() as unknown as PrivateService

    await expect(svc.runCommand('docker', ['ps'])).rejects.toThrow(
      'docker ps failed: Command failed: docker ps. context deadline exceeded',
    )
  })

  it('falls back to a generic "Command failed" message when the thrown error has no message', async () => {
    execState.handlers.set('docker', () => {
      const err = new Error('unused')
      err.message = ''
      throw err
    })
    const svc = new ContainerService() as unknown as PrivateService

    await expect(svc.runCommand('docker', ['ps'])).rejects.toThrow('docker ps failed: Command failed.')
  })

  it('resolves with stdout/stderr on success', async () => {
    execState.handlers.set('podman', () => ({ stdout: 'ok', stderr: '' }))
    const svc = new ContainerService() as unknown as PrivateService

    await expect(svc.runCommand('podman', ['version'])).resolves.toEqual({ stdout: 'ok', stderr: '' })
  })
})

describe('ContainerService.checkRuntime', () => {
  it('parses Docker-style version JSON ({ Version })', async () => {
    execState.handlers.set('docker', () => ({ stdout: JSON.stringify({ Version: '24.0.5' }), stderr: '' }))
    const svc = new ContainerService()

    const result = await svc.checkRuntime('docker')

    expect(result).toMatchObject({ type: 'docker', version: '24.0.5', available: true })
  })

  it('parses Podman-style version JSON ({ Client: { Version } })', async () => {
    execState.handlers.set('podman', () => ({
      stdout: JSON.stringify({ Client: { Version: '4.9.0' }, Server: { Version: '4.9.0' } }),
      stderr: '',
    }))
    const svc = new ContainerService()

    const result = await svc.checkRuntime('podman')

    expect(result.version).toBe('4.9.0')
  })

  it('parses a bare JSON string as the version (some runtimes emit a quoted string)', async () => {
    execState.handlers.set('docker', () => ({ stdout: JSON.stringify('  26.1.0  '), stderr: '' }))
    const svc = new ContainerService()

    const result = await svc.checkRuntime('docker')

    expect(result.version).toBe('26.1.0')
  })

  it('falls back to regex extraction when the runtime prints non-JSON version text', async () => {
    execState.handlers.set('docker', () => ({
      stdout: 'Client:\n Version:           24.0.5\n API version:  1.43\n',
      stderr: '',
    }))
    const svc = new ContainerService()

    const result = await svc.checkRuntime('docker')

    expect(result.version).toBe('24.0.5')
  })

  it('reports version "unknown" when output is neither JSON nor matches the Version: pattern', async () => {
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    const svc = new ContainerService()

    const result = await svc.checkRuntime('docker')

    expect(result).toMatchObject({ available: true, version: 'unknown' })
  })

  it('reports version "unknown" when the runtime returns valid JSON with no recognizable version field', async () => {
    // WHY: distinct from the non-JSON case above — this exercises the if/else-if/else-if chain
    // itself falling through (valid JSON, but none of the Docker/Podman/string shapes match),
    // rather than the catch-block regex fallback.
    execState.handlers.set('docker', () => ({ stdout: JSON.stringify({}), stderr: '' }))
    const svc = new ContainerService()

    const result = await svc.checkRuntime('docker')

    expect(result).toMatchObject({ available: true, version: 'unknown' })
  })

  it('reports the runtime as unavailable (not throwing) when the CLI is missing', async () => {
    // WHY: the UI needs a clean "not available" state to prompt installation, not a crash.
    execState.handlers.set('docker', () => {
      throw new Error('spawn docker ENOENT')
    })
    const svc = new ContainerService()

    const result = await svc.checkRuntime('docker')

    expect(result).toEqual({ type: 'docker', version: '', available: false })
  })

  it('includes the platform-specific socket path for docker and podman on success', async () => {
    execState.handlers.set('docker', () => ({ stdout: JSON.stringify({ Version: '1.0.0' }), stderr: '' }))
    execState.handlers.set('podman', () => ({ stdout: JSON.stringify({ Version: '1.0.0' }), stderr: '' }))
    const svc = new ContainerService()

    const docker = await svc.checkRuntime('docker')
    const podman = await svc.checkRuntime('podman')

    expect(docker.socket).toBe(process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock')
    expect(podman.socket).toBe(
      process.platform === 'win32' ? '//./pipe/podman-machine-default' : '/run/user/1000/podman/podman.sock',
    )
  })
})

describe('ContainerService.pullImage', () => {
  it('skips the pull and returns the local image Id when the image already exists locally', async () => {
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'image' && args[1] === 'inspect') {
        return { stdout: JSON.stringify([{ Id: 'sha256:local123' }]), stderr: '' }
      }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()
    const onProgress = vi.fn()

    const result = await svc.pullImage('alpine:3.19', 'docker', onProgress)

    expect(result).toEqual({ digest: 'sha256:local123' })
    expect(onProgress).toHaveBeenCalledWith('Image already available locally')
  })

  it('pulls the image and returns the post-pull Id when not present locally', async () => {
    let inspectCalls = 0
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'image' && args[1] === 'inspect') {
        inspectCalls++
        if (inspectCalls === 1) throw new Error('no such image: alpine:3.19')
        return { stdout: JSON.stringify([{ Id: 'sha256:pulled456' }]), stderr: '' }
      }
      if (args[0] === 'pull') return { stdout: 'Pulled', stderr: '' }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()
    const onProgress = vi.fn()

    const result = await svc.pullImage('alpine:3.19', 'docker', onProgress)

    expect(result).toEqual({ digest: 'sha256:pulled456' })
    expect(onProgress).toHaveBeenCalledWith('Pulling alpine:3.19...')
    expect(onProgress).toHaveBeenCalledWith('Image pulled successfully')
  })

  it('returns an empty digest when the image cannot be inspected even after a successful pull', async () => {
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'image' && args[1] === 'inspect') throw new Error('still not found')
      if (args[0] === 'pull') return { stdout: '', stderr: '' }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()

    const result = await svc.pullImage('ghost:latest', 'docker')

    expect(result).toEqual({ digest: '' })
  })

  it('propagates a pull failure (e.g. a registry auth error) instead of swallowing it', async () => {
    // WHY: unlike the local-existence probe (allowed to fail silently and fall through to
    // pull), a failed pull must reach the caller — otherwise a bad ref/auth failure would look
    // like a successful scan of nothing.
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'image' && args[1] === 'inspect') throw new Error('no such image')
      if (args[0] === 'pull') throw new Error('unauthorized: authentication required')
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()

    await expect(svc.pullImage('private/image:latest', 'docker')).rejects.toThrow(/unauthorized/)
  })

  it('proceeds to pull when the local-existence inspect resolves without an Id (not just when it throws)', async () => {
    // WHY: the "already local" short-circuit only fires on a truthy Id; a runtime that resolves
    // successfully but returns a record with no Id must still fall through to a real pull instead
    // of being mistaken for "found locally".
    let inspectCalls = 0
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'image' && args[1] === 'inspect') {
        inspectCalls++
        if (inspectCalls === 1) return { stdout: JSON.stringify([{}]), stderr: '' }
        return { stdout: JSON.stringify([{ Id: 'sha256:afterpull' }]), stderr: '' }
      }
      if (args[0] === 'pull') return { stdout: 'Pulled', stderr: '' }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()
    const onProgress = vi.fn()

    const result = await svc.pullImage('img:latest', 'docker', onProgress)

    expect(onProgress).toHaveBeenCalledWith('Pulling img:latest...')
    expect(result).toEqual({ digest: 'sha256:afterpull' })
  })

  it('returns an empty digest when the post-pull inspect resolves without an Id (no exception)', async () => {
    // WHY: distinct from the "inspect throws after pull" case above — here the runtime call
    // succeeds but the record has no Id, exercising the plain fall-through path rather than the
    // catch-block fallback, and both must land on the same safe empty-digest result.
    let inspectCalls = 0
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'image' && args[1] === 'inspect') {
        inspectCalls++
        if (inspectCalls === 1) throw new Error('no such image')
        return { stdout: JSON.stringify([{}]), stderr: '' }
      }
      if (args[0] === 'pull') return { stdout: 'Pulled', stderr: '' }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()

    const result = await svc.pullImage('ghost2:latest', 'docker')

    expect(result).toEqual({ digest: '' })
  })
})

describe('ContainerService.getManifest', () => {
  it('normalizes a Docker manifest v2 schema (config + layers)', async () => {
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'manifest' && args[1] === 'inspect') {
        return {
          stdout: JSON.stringify({
            digest: 'sha256:manifestDigest',
            config: { digest: 'sha256:configDigest' },
            layers: [
              { digest: 'sha256:layer1', size: 100, mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip' },
            ],
          }),
          stderr: '',
        }
      }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()

    const manifest = await svc.getManifest('myimage:tag', 'docker')

    expect(manifest).toEqual({
      digest: 'sha256:manifestDigest',
      config: { digest: 'sha256:configDigest' },
      layers: [{ digest: 'sha256:layer1', size: 100, mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip' }],
    })
  })

  it('normalizes a multi-arch manifest list (manifests[] + configDigest, default mediaType)', async () => {
    execState.handlers.set('docker', () => ({
      stdout: JSON.stringify({
        digest: 'sha256:listDigest',
        configDigest: 'sha256:cfg',
        manifests: [{ digest: 'sha256:platformA', size: 500 }],
      }),
      stderr: '',
    }))
    const svc = new ContainerService()

    const manifest = await svc.getManifest('myimage:tag', 'docker')

    expect(manifest.config.digest).toBe('sha256:cfg')
    expect(manifest.layers).toEqual([
      { digest: 'sha256:platformA', size: 500, mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip' },
    ])
  })

  it('falls back to empty/zero defaults for a maximally degenerate manifest response', async () => {
    // WHY: a truncated/unexpected manifest response must not crash the scan — every digest
    // field has a safe default so the rest of the pipeline still runs.
    execState.handlers.set('docker', () => ({ stdout: JSON.stringify({}), stderr: '' }))
    const svc = new ContainerService()

    const manifest = await svc.getManifest('bare:latest', 'docker')

    expect(manifest).toEqual({ digest: '', config: { digest: '' }, layers: [] })
  })

  it('falls back to `image inspect` RootFS layers when `manifest inspect` is unsupported', async () => {
    // WHY: not every registry/runtime combo supports `manifest inspect` (e.g. local-only
    // images); the scan must still produce a usable layer list instead of failing outright.
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'manifest') throw new Error('manifest inspect not supported for local images')
      if (args[0] === 'image' && args[1] === 'inspect') {
        return {
          stdout: JSON.stringify([{ Id: 'sha256:localid', RootFS: { Layers: ['sha256:layerA', 'sha256:layerB'] } }]),
          stderr: '',
        }
      }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()

    const manifest = await svc.getManifest('local:latest', 'docker')

    expect(manifest).toEqual({
      digest: 'sha256:localid',
      config: { digest: 'sha256:localid' },
      layers: [
        { digest: 'sha256:layerA', size: 0, mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip' },
        { digest: 'sha256:layerB', size: 0, mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip' },
      ],
    })
  })

  it('defaults a manifest layer entry missing digest/size to empty/zero instead of crashing', async () => {
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'manifest' && args[1] === 'inspect') {
        return {
          stdout: JSON.stringify({
            digest: 'sha256:d',
            config: { digest: 'sha256:c' },
            layers: [{ mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip' }],
          }),
          stderr: '',
        }
      }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()

    const manifest = await svc.getManifest('degenerate-layer:tag', 'docker')

    expect(manifest.layers).toEqual([
      { digest: '', size: 0, mediaType: 'application/vnd.docker.image.rootfs.diff.tar.gzip' },
    ])
  })

  it('handles a non-array, Id-less, RootFS-less `image inspect` fallback response without crashing', async () => {
    // WHY: getManifestFromInspect/getImageInspect must tolerate every combination of the
    // Docker/Podman inspect shape (array vs. bare object) and missing Id/RootFS, since a
    // truncated response must still produce safe defaults rather than throwing mid-scan.
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'manifest') throw new Error('manifest inspect not supported for local images')
      if (args[0] === 'image' && args[1] === 'inspect') {
        return { stdout: JSON.stringify({}), stderr: '' }
      }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    const svc = new ContainerService()

    const manifest = await svc.getManifest('bare-local:latest', 'docker')

    expect(manifest).toEqual({ digest: '', config: { digest: '' }, layers: [] })
  })
})

describe('ContainerService.inspectImage', () => {
  it('extracts config fields from a single-object inspect response', async () => {
    execState.handlers.set('docker', () => ({
      stdout: JSON.stringify({
        Id: 'sha256:abc',
        Os: 'linux',
        Architecture: 'arm64',
        Variant: 'v8',
        Created: '2024-01-01T00:00:00Z',
        DockerVersion: '24.0.5',
        Config: { Labels: { maintainer: 'me' } },
        History: [{ createdBy: 'RUN x' }],
        RootFS: { Layers: ['sha256:l1'] },
      }),
      stderr: '',
    }))
    const svc = new ContainerService()

    const result = await svc.inspectImage('img:tag', 'docker')

    expect(result).toMatchObject({
      Id: 'sha256:abc',
      os: 'linux',
      architecture: 'arm64',
      variant: 'v8',
      dockerVersion: '24.0.5',
      labels: { maintainer: 'me' },
    })
  })

  it('unwraps an array inspect response (Docker/Podman return a one-element array)', async () => {
    execState.handlers.set('docker', () => ({
      stdout: JSON.stringify([{ Id: 'sha256:def', Os: 'linux' }]),
      stderr: '',
    }))
    const svc = new ContainerService()

    const result = await svc.inspectImage('img:tag', 'docker')

    expect(result.Id).toBe('sha256:def')
  })

  it('defaults os/architecture/labels/history when the runtime omits them', async () => {
    execState.handlers.set('docker', () => ({ stdout: JSON.stringify({ Id: 'sha256:ghi' }), stderr: '' }))
    const svc = new ContainerService()

    const result = await svc.inspectImage('img:tag', 'docker')

    expect(result).toMatchObject({
      os: 'linux',
      architecture: 'amd64',
      labels: {},
      history: [],
      RootFS: { Layers: [] },
    })
  })

  it('falls back to a lowercase "architecture" field when "Architecture" is absent', async () => {
    execState.handlers.set('docker', () => ({
      stdout: JSON.stringify({ Id: 'sha256:jkl', architecture: 'arm' }),
      stderr: '',
    }))
    const svc = new ContainerService()

    const result = await svc.inspectImage('img:tag', 'docker')

    expect(result.architecture).toBe('arm')
  })

  it('throws a clear error when the runtime prints non-JSON output', async () => {
    execState.handlers.set('docker', () => ({ stdout: 'not json{{{', stderr: '' }))
    const svc = new ContainerService()

    await expect(svc.inspectImage('img:tag', 'docker')).rejects.toThrow(/Failed to parse docker inspect output/)
  })

  it('throws when the runtime returns no usable inspect data (e.g. null)', async () => {
    execState.handlers.set('docker', () => ({ stdout: 'null', stderr: '' }))
    const svc = new ContainerService()

    await expect(svc.inspectImage('img:tag', 'docker')).rejects.toThrow(/No inspect data returned/)
  })
})

describe('ContainerService.extractTar (tolerateErrors)', () => {
  it('swallows a non-zero tar exit when tolerateErrors is set (Windows cannot recreate rootfs symlinks)', async () => {
    execState.handlers.set('tar', () => {
      throw new Error('tar: some files differ')
    })
    const svc = new ContainerService() as unknown as PrivateService
    const destDir = path.join(os.tmpdir(), 'cs-extracttar-dest')
    const tarPath = path.join(os.tmpdir(), 'cs-extracttar-src', 'layer.tar')

    await expect(svc.extractTar(tarPath, destDir, { tolerateErrors: true })).resolves.toBeUndefined()
  })

  it('propagates a tar failure when tolerateErrors is not set (the outer image tar must extract cleanly)', async () => {
    execState.handlers.set('tar', () => {
      throw new Error('tar: unexpected end of file')
    })
    const svc = new ContainerService() as unknown as PrivateService
    const destDir = path.join(os.tmpdir(), 'cs-extracttar-dest2')
    const tarPath = path.join(os.tmpdir(), 'cs-extracttar-src2', 'image.tar')

    await expect(svc.extractTar(tarPath, destDir)).rejects.toThrow(/Failed to extract tar/)
  })

  it('falls back to the tar basename when the tar path already equals the destination directory', async () => {
    // WHY: `path.relative(destDir, tarPath)` is '' when the two are equal; the fallback must
    // still hand tar *some* archive name rather than an empty string argument.
    let capturedArg = ''
    execState.handlers.set('tar', (args) => {
      capturedArg = args[1]
      return { stdout: '', stderr: '' }
    })
    const svc = new ContainerService() as unknown as PrivateService
    const dir = path.join(os.tmpdir(), 'cs-extracttar-same-dir')

    await expect(svc.extractTar(dir, dir)).resolves.toBeUndefined()

    expect(capturedArg).toBe(path.basename(dir))
  })

  it('formats a tar failure message even when the thrown value is not an Error instance', async () => {
    execState.handlers.set('tar', () => {
      throw 'raw tar crash'
    })
    const svc = new ContainerService() as unknown as PrivateService
    const destDir = path.join(os.tmpdir(), 'cs-extracttar-dest3')
    const tarPath = path.join(os.tmpdir(), 'cs-extracttar-src3', 'image.tar')

    await expect(svc.extractTar(tarPath, destDir)).rejects.toThrow('Failed to extract tar: raw tar crash')
  })
})

describe('ContainerService.getLayerDigestFromPath', () => {
  it('extracts a bare sha256 hex digest from a blobs path', () => {
    const svc = new ContainerService() as unknown as PrivateService
    const hex = 'a'.repeat(64)

    expect(svc.getLayerDigestFromPath(`blobs/sha256/${hex}`)).toBe(`sha256:${hex}`)
  })

  it('passes through a path segment already prefixed with sha256:', () => {
    const svc = new ContainerService() as unknown as PrivateService
    const hex = 'b'.repeat(64)

    expect(svc.getLayerDigestFromPath(`sha256:${hex}/layer.tar`)).toBe(`sha256:${hex}`)
  })

  it('falls back to the filename when no digest-shaped segment is present', () => {
    // WHY: some `docker save` layouts use a short layer-id directory, not a digest — packages
    // must still get *some* stable per-layer identifier rather than crashing.
    const svc = new ContainerService() as unknown as PrivateService

    expect(svc.getLayerDigestFromPath('1a2b3c4d/layer.tar')).toBe('layer.tar')
  })

  it('falls back to the original path when it ends in a trailing slash (no non-empty last segment)', () => {
    const svc = new ContainerService() as unknown as PrivateService

    expect(svc.getLayerDigestFromPath('some/layer/dir/')).toBe('some/layer/dir/')
  })
})

describe('ContainerService.cleanVersion', () => {
  it('strips a dpkg epoch prefix (e.g. "1:2.0.0" -> "2.0.0") so version matching against NVD is not thrown off', () => {
    const svc = new ContainerService() as unknown as PrivateService

    expect(svc.cleanVersion('1:2.0.0')).toBe('2.0.0')
  })

  it('leaves a version with no epoch prefix unchanged', () => {
    const svc = new ContainerService() as unknown as PrivateService

    expect(svc.cleanVersion('2.0.0-1ubuntu1')).toBe('2.0.0-1ubuntu1')
  })
})

describe('ContainerService.parseDpkgStatus', () => {
  let tmp = ''

  afterEach(() => {
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true })
      tmp = ''
    }
  })

  it('parses multiple stanzas separated by blank lines into distinct packages, stripping the epoch', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-dpkg-'))
    const statusPath = path.join(tmp, 'status')
    fs.writeFileSync(
      statusPath,
      [
        'Package: bash',
        'Version: 5.1-6ubuntu1',
        'Architecture: amd64',
        '',
        'Package: coreutils',
        'Version: 1:8.32-4.1ubuntu1',
        'Architecture: amd64',
        '',
      ].join('\n'),
    )
    const svc = new ContainerService() as unknown as PrivateService

    const packages = svc.parseDpkgStatus(statusPath, 'sha256:layer') as Array<Record<string, unknown>>

    expect(packages.map((p) => p.name)).toEqual(['bash', 'coreutils'])
    // dpkg epoch ("1:") must be stripped so version-matching against NVD isn't thrown off by an
    // epoch NVD doesn't record.
    expect(packages[1].version).toBe('8.32-4.1ubuntu1')
    expect(packages[1].purl).toBe('pkg:deb/amd64/coreutils@8.32-4.1ubuntu1')
  })

  it('skips a stanza missing Package or Version rather than emitting a partial package', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-dpkg-'))
    const statusPath = path.join(tmp, 'status')
    fs.writeFileSync(statusPath, ['Package: incomplete', 'Architecture: amd64', ''].join('\n'))
    const svc = new ContainerService() as unknown as PrivateService

    const packages = svc.parseDpkgStatus(statusPath, 'sha256:layer')

    expect(packages).toEqual([])
  })

  it('omits the arch segment from the purl for an "all"-architecture package', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-dpkg-'))
    const statusPath = path.join(tmp, 'status')
    fs.writeFileSync(statusPath, ['Package: tzdata', 'Version: 2024a', 'Architecture: all', ''].join('\n'))
    const svc = new ContainerService() as unknown as PrivateService

    const packages = svc.parseDpkgStatus(statusPath, 'sha256:layer') as Array<Record<string, unknown>>

    expect(packages[0].purl).toBe('pkg:deb/tzdata@2024a')
  })

  it('does not corrupt Package/Version when a later field wraps across continuation lines', () => {
    // WHY: real dpkg status stanzas commonly end with a multi-line Description (each
    // continuation line indented with a space); that folding logic must not lose or corrupt
    // the Package/Version/Architecture already parsed earlier in the same stanza.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-dpkg-'))
    const statusPath = path.join(tmp, 'status')
    fs.writeFileSync(
      statusPath,
      [
        'Package: openssl',
        'Version: 3.0.2-0ubuntu1.10',
        'Architecture: amd64',
        'Description: Secure Sockets Layer toolkit',
        ' This package provides the OpenSSL runtime',
        ' environment libraries and utilities.',
        '',
      ].join('\n'),
    )
    const svc = new ContainerService() as unknown as PrivateService

    const packages = svc.parseDpkgStatus(statusPath, 'sha256:layer') as Array<Record<string, unknown>>

    expect(packages).toHaveLength(1)
    expect(packages[0]).toMatchObject({ name: 'openssl', version: '3.0.2-0ubuntu1.10', architecture: 'amd64' })
  })

  it('defaults architecture to amd64 when a stanza omits the Architecture field', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-dpkg-'))
    const statusPath = path.join(tmp, 'status')
    fs.writeFileSync(statusPath, ['Package: minimal', 'Version: 1.0', ''].join('\n'))
    const svc = new ContainerService() as unknown as PrivateService

    const packages = svc.parseDpkgStatus(statusPath, 'sha256:layer') as Array<Record<string, unknown>>

    expect(packages[0].architecture).toBe('amd64')
  })

  it('ignores a continuation-style line before any field has been set, without crashing', () => {
    // WHY: a malformed/truncated stanza could start mid-continuation; the folding logic must not
    // assume a field is already active when it sees a leading-space line.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-dpkg-'))
    const statusPath = path.join(tmp, 'status')
    fs.writeFileSync(
      statusPath,
      [' orphaned continuation before any field', 'Package: foo', 'Version: 1.0', ''].join('\n'),
    )
    const svc = new ContainerService() as unknown as PrivateService

    const packages = svc.parseDpkgStatus(statusPath, 'sha256:layer') as Array<Record<string, unknown>>

    expect(packages).toHaveLength(1)
    expect(packages[0]).toMatchObject({ name: 'foo', version: '1.0' })
  })
})

describe('ContainerService.parseApkInstalled', () => {
  let tmp = ''

  afterEach(() => {
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true })
      tmp = ''
    }
  })

  it("parses Alpine's P:/V:/A: installed-db fields into packages", () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-apk-'))
    const dbPath = path.join(tmp, 'installed')
    fs.writeFileSync(
      dbPath,
      ['P:musl', 'V:1.2.3-r0', 'A:x86_64', '', 'P:busybox', 'V:1.35.0-r17', 'A:x86_64', ''].join('\n'),
    )
    const svc = new ContainerService() as unknown as PrivateService

    const packages = svc.parseApkInstalled(dbPath, 'sha256:layer') as Array<Record<string, unknown>>

    expect(packages).toHaveLength(2)
    expect(packages[0]).toMatchObject({ name: 'musl', version: '1.2.3-r0', manager: 'apk', architecture: 'x86_64' })
    expect(packages[0].purl).toBe('pkg:alpine/musl@1.2.3-r0')
  })

  it('skips an entry missing a name or version', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-apk-'))
    const dbPath = path.join(tmp, 'installed')
    fs.writeFileSync(dbPath, ['A:x86_64', ''].join('\n'))
    const svc = new ContainerService() as unknown as PrivateService

    const packages = svc.parseApkInstalled(dbPath, 'sha256:layer')

    expect(packages).toEqual([])
  })

  it('leaves architecture undefined when an entry omits the A: field', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctr-apk-'))
    const dbPath = path.join(tmp, 'installed')
    fs.writeFileSync(dbPath, ['P:noarch-pkg', 'V:1.0', ''].join('\n'))
    const svc = new ContainerService() as unknown as PrivateService

    const packages = svc.parseApkInstalled(dbPath, 'sha256:layer') as Array<Record<string, unknown>>

    expect(packages[0].architecture).toBeUndefined()
  })
})

describe('ContainerService.extractPackages', () => {
  /**
   * Registers `docker save` / `tar` mock handlers that simulate an exported image. `tar -xf` is
   * mocked to populate its destination directory (the `cwd` option) instead of touching a real
   * tarball, since no real docker/tar binary runs in unit tests. The outer call (against
   * `image.tar`) writes manifest.json and touches each layer path; subsequent calls extract into
   * a `layer-<n>` directory, whose index is recovered from `cwd` so the test can drop
   * runtime-specific fixtures (a dpkg status file, an apk db, ...) into the right layer.
   */
  function mockExportedImage(opts: {
    layers: string[]
    populateLayer?: (layerIndex: number, layerCwd: string) => void
  }): void {
    execState.handlers.set('docker', (args) => {
      if (args[0] === 'save') return { stdout: '', stderr: '' }
      throw new Error(`unexpected docker invocation: ${args.join(' ')}`)
    })
    execState.handlers.set('tar', (args, options) => {
      const cwd = options.cwd as string
      if (args[1] === 'image.tar') {
        fs.writeFileSync(path.join(cwd, 'manifest.json'), JSON.stringify([{ Layers: opts.layers }]))
        for (const layerFile of opts.layers) {
          const full = path.join(cwd, layerFile)
          fs.mkdirSync(path.dirname(full), { recursive: true })
          fs.writeFileSync(full, 'layer-tar-bytes')
        }
        return { stdout: '', stderr: '' }
      }
      const layerMatch = /layer-(\d+)$/.exec(cwd)
      opts.populateLayer?.(layerMatch ? Number(layerMatch[1]) : -1, cwd)
      return { stdout: '', stderr: '' }
    })
  }

  function writeDpkgLayer(cwd: string, pkgName: string): void {
    const dpkgDir = path.join(cwd, 'var', 'lib', 'dpkg')
    fs.mkdirSync(dpkgDir, { recursive: true })
    fs.writeFileSync(path.join(dpkgDir, 'status'), `Package: ${pkgName}\nVersion: 1.0\nArchitecture: amd64\n\n`)
  }

  it('extracts dpkg + apk packages and attributes each to its own layer digest', async () => {
    const digestA = 'a'.repeat(64)
    const digestB = 'b'.repeat(64)
    mockExportedImage({
      layers: [`blobs/sha256/${digestA}`, `blobs/sha256/${digestB}`],
      populateLayer: (index, cwd) => {
        if (index === 0) {
          writeDpkgLayer(cwd, 'bash')
        } else if (index === 1) {
          const apkDir = path.join(cwd, 'lib', 'apk', 'db')
          fs.mkdirSync(apkDir, { recursive: true })
          fs.writeFileSync(path.join(apkDir, 'installed'), 'P:musl\nV:1.2.3-r0\nA:x86_64\n\n')
        }
      },
    })
    const svc = new ContainerService()
    const onProgress = vi.fn()

    const result = await svc.extractPackages('myimage:latest', 'docker', [], onProgress)

    expect(result.packages.map((p) => p.name).sort()).toEqual(['bash', 'musl'])
    const bash = result.packages.find((p) => p.name === 'bash')
    const musl = result.packages.find((p) => p.name === 'musl')
    expect(bash?.layerDigest).toBe(`sha256:${digestA}`)
    expect(musl?.layerDigest).toBe(`sha256:${digestB}`)
    expect(result.warnings).toEqual([])
    expect(onProgress).toHaveBeenCalledWith('Saving container image to tar...')
    expect(onProgress).toHaveBeenCalledWith('Scanning layer 1/2...')
  })

  it('throws a clear error when manifest.json is missing from the exported image', async () => {
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    execState.handlers.set('tar', () => ({ stdout: '', stderr: '' }))
    const svc = new ContainerService()

    await expect(svc.extractPackages('broken:latest', 'docker', [])).rejects.toThrow(
      /manifest\.json not found in exported image/,
    )
  })

  it('cleans up the temp working directory even when the scan throws', async () => {
    // WHY: extractPackages runs per scan request; leaking a temp dir on every failed scan would
    // slowly fill the disk.
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    execState.handlers.set('tar', () => ({ stdout: '', stderr: '' }))
    const before = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('vat-container-'))
    const svc = new ContainerService()

    await expect(svc.extractPackages('broken:latest', 'docker', [])).rejects.toThrow()

    const after = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('vat-container-'))
    expect(after).toEqual(before)
  })

  it('rejects a manifest.json layer path that escapes the extraction directory', async () => {
    // WHY: manifest.json comes from the (attacker-controlled) scanned image; a `../` entry must
    // never be resolved and read from outside the temp extraction dir.
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    execState.handlers.set('tar', (args, options) => {
      const cwd = options.cwd as string
      if (args[1] === 'image.tar') {
        fs.writeFileSync(path.join(cwd, 'manifest.json'), JSON.stringify([{ Layers: ['../../evil.tar'] }]))
      }
      return { stdout: '', stderr: '' }
    })
    const svc = new ContainerService()

    await expect(svc.extractPackages('evil:latest', 'docker', [])).rejects.toThrow(/Unsafe path in manifest\.json/)
  })

  it('only extracts layers matching a non-empty layerDigests filter', async () => {
    const digestA = 'a'.repeat(64)
    const digestB = 'b'.repeat(64)
    mockExportedImage({
      layers: [`blobs/sha256/${digestA}`, `blobs/sha256/${digestB}`],
      populateLayer: (index, cwd) => writeDpkgLayer(cwd, `pkg${index}`),
    })
    const svc = new ContainerService()

    const result = await svc.extractPackages('myimage:latest', 'docker', [`sha256:${digestA}`])

    expect(result.layers).toHaveLength(1)
    expect(result.layers[0].digest).toBe(`sha256:${digestA}`)
    expect(result.packages.map((p) => p.name)).toEqual(['pkg0'])
  })

  it('skips a layer listed in manifest.json but absent from the tar, without failing the scan', async () => {
    const digestPresent = 'a'.repeat(64)
    const digestMissing = 'c'.repeat(64)
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    execState.handlers.set('tar', (args, options) => {
      const cwd = options.cwd as string
      if (args[1] === 'image.tar') {
        fs.writeFileSync(
          path.join(cwd, 'manifest.json'),
          JSON.stringify([{ Layers: [`blobs/sha256/${digestPresent}`, `blobs/sha256/${digestMissing}`] }]),
        )
        // Only the first layer's tar actually exists in the export.
        const full = path.join(cwd, 'blobs', 'sha256', digestPresent)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, 'bytes')
      } else {
        writeDpkgLayer(cwd, 'bash')
      }
      return { stdout: '', stderr: '' }
    })
    const svc = new ContainerService()

    const result = await svc.extractPackages('partial:latest', 'docker', [])

    expect(result.layers).toHaveLength(1)
    expect(result.packages.map((p) => p.name)).toEqual(['bash'])
    expect(result.warnings).toEqual([])
  })

  it('captures a per-layer scan failure as a warning instead of aborting the whole scan', async () => {
    // WHY: one corrupt/unreadable layer must not blank out results for every other layer.
    const digestBad = 'd'.repeat(64)
    const digestGood = 'e'.repeat(64)
    mockExportedImage({
      layers: [`blobs/sha256/${digestBad}`, `blobs/sha256/${digestGood}`],
      populateLayer: (index, cwd) => {
        if (index === 0) {
          // A directory where parseDpkgStatus expects a file makes readFileSync throw.
          fs.mkdirSync(path.join(cwd, 'var', 'lib', 'dpkg', 'status'), { recursive: true })
        } else {
          writeDpkgLayer(cwd, 'bash')
        }
      },
    })
    const svc = new ContainerService()

    const result = await svc.extractPackages('flaky:latest', 'docker', [])

    expect(result.layers).toHaveLength(2)
    expect(result.packages.map((p) => p.name)).toEqual(['bash'])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/Failed to process layer 0/)
  })

  it('formats a per-layer failure message even when the thrown value is not an Error instance', async () => {
    const digest = '4'.repeat(64)
    mockExportedImage({ layers: [`blobs/sha256/${digest}`] })
    const svc = new ContainerService()
    vi.spyOn(svc as unknown as PrivateService, 'scanLayerForPackages').mockRejectedValueOnce('layer scan segfaulted')

    const result = await svc.extractPackages('nonstandard-throw:latest', 'docker', [])

    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/layer scan segfaulted/)
  })

  it('accepts manifest.json as a bare object (not wrapped in an array)', async () => {
    const digest = 'f'.repeat(64)
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    execState.handlers.set('tar', (args, options) => {
      const cwd = options.cwd as string
      if (args[1] === 'image.tar') {
        fs.writeFileSync(path.join(cwd, 'manifest.json'), JSON.stringify({ Layers: [`blobs/sha256/${digest}`] }))
        const full = path.join(cwd, 'blobs', 'sha256', digest)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, 'bytes')
      } else {
        writeDpkgLayer(cwd, 'bash')
      }
      return { stdout: '', stderr: '' }
    })
    const svc = new ContainerService()

    const result = await svc.extractPackages('bare-manifest:latest', 'docker', [])

    expect(result.packages.map((p) => p.name)).toEqual(['bash'])
  })

  it('treats a manifest entry with no Layers field as zero layers instead of crashing', async () => {
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    execState.handlers.set('tar', (args, options) => {
      const cwd = options.cwd as string
      if (args[1] === 'image.tar') {
        fs.writeFileSync(path.join(cwd, 'manifest.json'), JSON.stringify([{}]))
      }
      return { stdout: '', stderr: '' }
    })
    const svc = new ContainerService()

    const result = await svc.extractPackages('no-layers:latest', 'docker', [])

    expect(result).toEqual({ packages: [], layers: [], warnings: [] })
  })

  it("reads a present Config file's layer history without failing extraction (skips emptyLayer entries)", async () => {
    // WHY: history-walking must tolerate real config.json shapes — including leading
    // emptyLayer entries (e.g. Dockerfile ENV/LABEL instructions) that must be skipped rather
    // than mis-attributed or crashing the scan.
    const digest = '1'.repeat(64)
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    execState.handlers.set('tar', (args, options) => {
      const cwd = options.cwd as string
      if (args[1] === 'image.tar') {
        fs.writeFileSync(
          path.join(cwd, 'manifest.json'),
          JSON.stringify([{ Layers: [`blobs/sha256/${digest}`], Config: 'config.json' }]),
        )
        fs.writeFileSync(
          path.join(cwd, 'config.json'),
          JSON.stringify({ history: [{ emptyLayer: true }, { createdBy: 'RUN echo hi' }] }),
        )
        const full = path.join(cwd, 'blobs', 'sha256', digest)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, 'bytes')
      } else {
        writeDpkgLayer(cwd, 'bash')
      }
      return { stdout: '', stderr: '' }
    })
    const svc = new ContainerService()

    const result = await svc.extractPackages('with-history:latest', 'docker', [])

    expect(result.packages.map((p) => p.name)).toEqual(['bash'])
    expect(result.warnings).toEqual([])
  })

  it('does not fail extraction when manifest.json references a Config file that was not exported', async () => {
    const digest = '2'.repeat(64)
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    execState.handlers.set('tar', (args, options) => {
      const cwd = options.cwd as string
      if (args[1] === 'image.tar') {
        fs.writeFileSync(
          path.join(cwd, 'manifest.json'),
          JSON.stringify([{ Layers: [`blobs/sha256/${digest}`], Config: 'missing-config.json' }]),
        )
        const full = path.join(cwd, 'blobs', 'sha256', digest)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, 'bytes')
        // missing-config.json is deliberately never written.
      } else {
        writeDpkgLayer(cwd, 'bash')
      }
      return { stdout: '', stderr: '' }
    })
    const svc = new ContainerService()

    const result = await svc.extractPackages('missing-config:latest', 'docker', [])

    expect(result.packages.map((p) => p.name)).toEqual(['bash'])
  })

  it('defaults to no layer history when a present Config file has no history field', async () => {
    const digest = '3'.repeat(64)
    execState.handlers.set('docker', () => ({ stdout: '', stderr: '' }))
    execState.handlers.set('tar', (args, options) => {
      const cwd = options.cwd as string
      if (args[1] === 'image.tar') {
        fs.writeFileSync(
          path.join(cwd, 'manifest.json'),
          JSON.stringify([{ Layers: [`blobs/sha256/${digest}`], Config: 'config.json' }]),
        )
        fs.writeFileSync(path.join(cwd, 'config.json'), JSON.stringify({}))
        const full = path.join(cwd, 'blobs', 'sha256', digest)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, 'bytes')
      } else {
        writeDpkgLayer(cwd, 'bash')
      }
      return { stdout: '', stderr: '' }
    })
    const svc = new ContainerService()

    const result = await svc.extractPackages('empty-config:latest', 'docker', [])

    expect(result.packages.map((p) => p.name)).toEqual(['bash'])
  })
})

describe('createContainerService', () => {
  it('returns a usable ContainerService instance', () => {
    expect(createContainerService()).toBeInstanceOf(ContainerService)
  })
})
