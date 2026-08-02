import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { rmSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Express } from 'express'
import { createTestApp } from '../test-utils/testApp'

// Integration tests for /api/sbom (NFR-08 — every API endpoint covered). Syft (and, for Android
// images, WSL2) are external tools that don't exist in CI, so SyftService and AndroidImageService
// are replaced with controllable stand-ins — this is the only way to drive the route's real
// branching (validation, file-vs-image-vs-local-path source selection, Android-image detection,
// error-code mapping) end-to-end without ever spawning a process.

const syftState = vi.hoisted(() => ({
  getEngineStatus: vi.fn(),
  generateSbom: vi.fn(),
}))

const androidState = vi.hoisted(() => ({
  isAndroidImageDir: vi.fn(),
  generateSbom: vi.fn(),
}))

vi.mock('../services/SyftService.js', () => {
  class SyftError extends Error {
    readonly code: 'not_installed' | 'scan_failed' | 'invalid_output'
    constructor(message: string, code: 'not_installed' | 'scan_failed' | 'invalid_output') {
      super(message)
      this.code = code
      this.name = 'SyftError'
    }
  }
  class SyftService {
    getEngineStatus(): Promise<unknown> {
      return syftState.getEngineStatus()
    }
    generateSbom(source: unknown, onProgress?: unknown): Promise<unknown> {
      return syftState.generateSbom(source, onProgress)
    }
  }
  return { SyftService, SyftError }
})

vi.mock('../services/AndroidImageService.js', () => {
  class AndroidImageError extends Error {
    readonly code: 'no_wsl' | 'unpack_failed' | 'invalid_output'
    constructor(message: string, code: 'no_wsl' | 'unpack_failed' | 'invalid_output') {
      super(message)
      this.code = code
      this.name = 'AndroidImageError'
    }
  }
  class AndroidImageService {
    generateSbom(dir: string, onProgress?: unknown): Promise<unknown> {
      return androidState.generateSbom(dir, onProgress)
    }
  }
  function isAndroidImageDir(dir: string): boolean {
    return androidState.isAndroidImageDir(dir) as boolean
  }
  return { AndroidImageService, AndroidImageError, isAndroidImageDir }
})

// Imported after the mocks are registered, so these are the exact classes the route's
// `instanceof SyftError` / `instanceof AndroidImageError` checks compare against.
const { SyftError } = await import('../services/SyftService.js')
const { AndroidImageError } = await import('../services/AndroidImageService.js')

let app: Express
let dataDir: string
let scratchDir: string

beforeAll(async () => {
  // /api/sbom sits behind the tighter containerLimiter (5/min); this file drives more than that
  // from one IP, so raise the cap for the controlled run (before createTestApp imports the app).
  process.env.RATE_LIMIT_MAX = '1000000'
  ;({ app, dataDir } = await createTestApp())
  // Real files/dirs for the `localPath` branch — the route calls fs.statSync on
  // whatever path it's given, so it needs to resolve against something real.
  scratchDir = mkdtempSync(path.join(tmpdir(), 'vat-sbom-route-test-'))
})

afterAll(() => {
  delete process.env.RATE_LIMIT_MAX
  rmSync(dataDir, { recursive: true, force: true })
  rmSync(scratchDir, { recursive: true, force: true })
})

beforeEach(() => {
  syftState.getEngineStatus.mockReset()
  syftState.generateSbom.mockReset()
  androidState.isAndroidImageDir.mockReset().mockReturnValue(false)
  androidState.generateSbom.mockReset()
})

const FAKE_CYCLONEDX = JSON.stringify({ bomFormat: 'CycloneDX', components: [] })

describe('GET /api/sbom/engine-status', () => {
  // Gates the "SBOM from binary" UI on whether Syft is actually runnable — the route must
  // pass the service's status straight through, success or not, without ever throwing.
  it('reports an available engine with its version', async () => {
    syftState.getEngineStatus.mockResolvedValue({ available: true, version: '1.44.0', path: '/usr/bin/syft' })

    const res = await request(app).get('/api/sbom/engine-status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, available: true, version: '1.44.0', path: '/usr/bin/syft' })
  })

  it('reports an unavailable engine as success:true with available:false (not an error)', async () => {
    syftState.getEngineStatus.mockResolvedValue({ available: false, path: 'syft', error: 'syft not found' })

    const res = await request(app).get('/api/sbom/engine-status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, available: false, path: 'syft', error: 'syft not found' })
  })

  it('surfaces an unexpected failure as a 500 instead of hanging the request', async () => {
    // The route has no try/catch around this call — Express 5 auto-forwards a rejected
    // handler promise to the default error handler, so this must not silently hang.
    syftState.getEngineStatus.mockRejectedValue(new Error('unexpected failure'))

    const res = await request(app).get('/api/sbom/engine-status')

    expect(res.status).toBe(500)
  })
})

describe('POST /api/sbom/generate — validation', () => {
  // Without a file, local path, or image reference there is nothing to hand Syft — the route
  // must reject before ever constructing a source, not forward an empty scan target.
  it('rejects a request with no artifact, local path, or image reference', async () => {
    const res = await request(app).post('/api/sbom/generate').send({})

    // The route reports this via the house `{success:false}` shape without ever calling
    // res.status(), so the HTTP status is the express.json() default (200) — pinning that
    // here so a future change to add res.status(400) is a deliberate, visible diff.
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      error: 'Provide an artifact file, a local path, or an image reference.',
    })
    expect(syftState.generateSbom).not.toHaveBeenCalled()
  })
})

describe('POST /api/sbom/generate — image reference source', () => {
  // A container image reference (no upload, no local disk access) is the primary path for
  // scanning a registry image; it must reach Syft as an `image` source and round-trip the
  // resulting CycloneDX JSON to the client untouched.
  it('generates an SBOM from an image reference', async () => {
    syftState.generateSbom.mockResolvedValue(FAKE_CYCLONEDX)

    const res = await request(app).post('/api/sbom/generate').send({ imageRef: 'alpine:3.19' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      cyclonedxJson: FAKE_CYCLONEDX,
      meta: {
        engine: 'syft',
        source: 'image',
        filename: undefined,
        imageRef: 'alpine:3.19',
        byteLength: FAKE_CYCLONEDX.length,
      },
    })
    expect(syftState.generateSbom).toHaveBeenCalledWith({ kind: 'image', value: 'alpine:3.19' }, expect.any(Function))
  })

  it('maps a Syft failure to success:false with the error code (never a raw stack trace)', async () => {
    syftState.generateSbom.mockRejectedValue(new SyftError('Syft is not installed', 'not_installed'))

    const res = await request(app).post('/api/sbom/generate').send({ imageRef: 'alpine:3.19' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      error: 'Syft is not installed',
      code: 'not_installed',
    })
  })
})

describe('POST /api/sbom/generate — uploaded artifact', () => {
  // An uploaded binary/archive is the other primary scan input; multer must land it on disk
  // as a `file` source, and the response must report the caller's original filename.
  it('generates an SBOM from an uploaded file', async () => {
    syftState.generateSbom.mockResolvedValue(FAKE_CYCLONEDX)

    const res = await request(app)
      .post('/api/sbom/generate')
      .attach('artifact', Buffer.from('fake-binary-content'), 'app.jar')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.cyclonedxJson).toBe(FAKE_CYCLONEDX)
    expect(res.body.meta).toMatchObject({ engine: 'syft', source: 'file', filename: 'app.jar' })
    const [source] = syftState.generateSbom.mock.calls[0] as [{ kind: string; value: string }]
    expect(source.kind).toBe('file')
  })
})

describe('POST /api/sbom/generate — local path source', () => {
  // Scanning a path already on the host (no upload) is how multi-GB local artifacts, like
  // Android prebuilt images, get scanned at all — this covers the dir/file/not-found/Android
  // branches that only this input path can reach.

  it('reports a clear error when the local path does not exist (never calls Syft)', async () => {
    const missingPath = path.join(scratchDir, 'does-not-exist')

    const res = await request(app).post('/api/sbom/generate').send({ localPath: missingPath })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: `Path not found on server: ${missingPath}` })
    expect(syftState.generateSbom).not.toHaveBeenCalled()
  })

  it('scans a local directory that is not an Android image via Syft as a dir source', async () => {
    const dirPath = path.join(scratchDir, 'plain-dir')
    mkdirSync(dirPath)
    syftState.generateSbom.mockResolvedValue(FAKE_CYCLONEDX)

    const res = await request(app).post('/api/sbom/generate').send({ localPath: dirPath })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(syftState.generateSbom).toHaveBeenCalledWith({ kind: 'dir', value: dirPath }, expect.any(Function))
  })

  it('scans a local file via Syft as a file source', async () => {
    const filePath = path.join(scratchDir, 'artifact.bin')
    writeFileSync(filePath, 'binary-ish-content')
    syftState.generateSbom.mockResolvedValue(FAKE_CYCLONEDX)

    const res = await request(app).post('/api/sbom/generate').send({ localPath: filePath })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(syftState.generateSbom).toHaveBeenCalledWith({ kind: 'file', value: filePath }, expect.any(Function))
  })

  it('routes a detected Android image directory to AndroidImageService instead of Syft', async () => {
    const androidDir = path.join(scratchDir, 'android-dir')
    mkdirSync(androidDir)
    androidState.isAndroidImageDir.mockReturnValue(true)
    androidState.generateSbom.mockResolvedValue(FAKE_CYCLONEDX)

    const res = await request(app).post('/api/sbom/generate').send({ localPath: androidDir })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      cyclonedxJson: FAKE_CYCLONEDX,
      meta: {
        engine: 'syft+android-unpack',
        source: 'android-image',
        imageRef: undefined,
        filename: undefined,
        byteLength: FAKE_CYCLONEDX.length,
      },
    })
    expect(androidState.generateSbom).toHaveBeenCalledWith(androidDir, expect.any(Function))
    // The Android path is a substitute for Syft, not an addition to it.
    expect(syftState.generateSbom).not.toHaveBeenCalled()
  })

  it('maps an AndroidImageError to success:false with the error code', async () => {
    const androidDir = path.join(scratchDir, 'android-dir-fail')
    mkdirSync(androidDir)
    androidState.isAndroidImageDir.mockReturnValue(true)
    androidState.generateSbom.mockRejectedValue(new AndroidImageError('WSL2 is required', 'no_wsl'))

    const res = await request(app).post('/api/sbom/generate').send({ localPath: androidDir })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      error: 'WSL2 is required',
      code: 'no_wsl',
    })
  })
})
