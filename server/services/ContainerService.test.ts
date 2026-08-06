import { describe, it, expect, vi, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ContainerService } from './ContainerService.js'

// Access private methods under test. TS `private` is compile-time only; the runtime object
// exposes them, and vitest runs via esbuild without type-checking, so this is safe.
type PrivateService = {
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
})
