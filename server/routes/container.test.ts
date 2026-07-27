import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { rmSync } from 'node:fs'
import type { Express } from 'express'
import { createTestApp } from '../test-utils/testApp'

// Integration tests for /api/container (NFR-08 — every API endpoint covered). container.ts shells
// out to Docker/Podman CLIs via ContainerService (execFile under the hood), so every method is
// mocked here — these tests must never spawn a real container runtime process. Hoisted so the
// vi.mock factory below (evaluated before the rest of this file) can see it, and so each test can
// reconfigure resolved/rejected values.
const containerServiceMock = vi.hoisted(() => ({
  checkRuntime: vi.fn(),
  pullImage: vi.fn(),
  getManifest: vi.fn(),
  inspectImage: vi.fn(),
  extractPackages: vi.fn(),
}))

vi.mock('../services/ContainerService.js', () => ({
  ContainerService: class {
    constructor() {
      return containerServiceMock
    }
  },
}))

// NOTE on the "input validation" contract: unlike osv.ts, container.ts performs no request-body
// schema validation of its own — every handler casts req.body straight to its request type and
// hands the fields to ContainerService. A missing/invalid field (e.g. no imageRef) is therefore
// only ever caught because the (real or mocked) service call itself fails; the route's catch block
// then reports `{ success: false, error }` with HTTP 200, never a 4xx. The tests below cover that
// actual contract for every endpoint. The one genuine 4xx these routes can produce comes from
// Express's JSON body-parser rejecting syntactically invalid JSON before the handler ever runs —
// covered once, since that behavior is identical middleware plumbing shared by all six endpoints.

let app: Express
let dataDir: string

beforeAll(async () => {
  ;({ app, dataDir } = await createTestApp())
})

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true })
})

beforeEach(() => {
  containerServiceMock.checkRuntime.mockReset()
  containerServiceMock.pullImage.mockReset()
  containerServiceMock.getManifest.mockReset()
  containerServiceMock.inspectImage.mockReset()
  containerServiceMock.extractPackages.mockReset()
})

describe('malformed request body (shared body-parser behavior)', () => {
  it('returns 400 for syntactically invalid JSON before any handler runs', async () => {
    // Intent: this is the one real 4xx these routes can produce — Express's express.json()
    // middleware rejects bad JSON ahead of routing, so the service must never be called.
    const res = await request(app)
      .post('/api/container/check-runtime')
      .set('Content-Type', 'application/json')
      .send('{not valid json')
    expect(res.status).toBe(400)
    expect(containerServiceMock.checkRuntime).not.toHaveBeenCalled()
  })
})

describe('POST /api/container/check-runtime', () => {
  // Protects the pass-through contract: a healthy runtime report comes back untouched.
  it('reports an available runtime from the mocked service', async () => {
    containerServiceMock.checkRuntime.mockResolvedValue({
      type: 'docker',
      version: '24.0.5',
      available: true,
      socket: '/var/run/docker.sock',
    })

    const res = await request(app).post('/api/container/check-runtime').send({ runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      runtime: { type: 'docker', version: '24.0.5', available: true, socket: '/var/run/docker.sock' },
    })
    expect(containerServiceMock.checkRuntime).toHaveBeenCalledWith('docker')
  })

  // Protects the no-validation contract: a missing `runtime` still reaches the service (as
  // undefined) and a service-layer failure is reported as success:false, not a crash/500.
  it('reports failure (200, success:false) when runtime is missing and the service call fails', async () => {
    containerServiceMock.checkRuntime.mockRejectedValue(new Error('runtime is not installed or not in PATH'))

    const res = await request(app).post('/api/container/check-runtime').send({})

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'runtime is not installed or not in PATH' })
  })
})

describe('POST /api/container/pull', () => {
  // Protects the pass-through contract: a successful pull surfaces the resulting digest.
  it('returns the pulled digest on success', async () => {
    containerServiceMock.pullImage.mockResolvedValue({ digest: 'sha256:pulled123' })

    const res = await request(app).post('/api/container/pull').send({ imageRef: 'nginx:latest', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, digest: 'sha256:pulled123' })
    expect(containerServiceMock.pullImage).toHaveBeenCalledWith('nginx:latest', 'docker', expect.any(Function))
  })

  // Protects the no-validation contract: a missing imageRef still reaches the service, whose
  // failure is caught and reported rather than crashing the request.
  it('reports failure (200, success:false) when imageRef is missing and the pull fails', async () => {
    containerServiceMock.pullImage.mockRejectedValue(new Error('pull failed: unknown image ref'))

    const res = await request(app).post('/api/container/pull').send({ runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'pull failed: unknown image ref' })
  })
})

describe('POST /api/container/manifest', () => {
  // Protects the pass-through contract: manifest digest/config/layers reach the client unchanged.
  it('returns the manifest on success', async () => {
    containerServiceMock.getManifest.mockResolvedValue({
      digest: 'sha256:manifest123',
      config: { digest: 'sha256:config123' },
      layers: [{ digest: 'sha256:layer1', size: 1024, mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip' }],
    })

    const res = await request(app).post('/api/container/manifest').send({ imageRef: 'nginx:latest', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      manifest: {
        digest: 'sha256:manifest123',
        config: { digest: 'sha256:config123' },
        layers: [{ digest: 'sha256:layer1', size: 1024, mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip' }],
      },
    })
  })

  // Protects the no-validation contract: a missing imageRef still reaches the service, whose
  // failure is caught and reported rather than crashing the request.
  it('reports failure (200, success:false) when imageRef is missing and the lookup fails', async () => {
    containerServiceMock.getManifest.mockRejectedValue(new Error('manifest lookup failed'))

    const res = await request(app).post('/api/container/manifest').send({ runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'manifest lookup failed' })
  })
})

describe('POST /api/container/inspect', () => {
  // Protects the pass-through contract: a fully-populated config reaches the client unchanged.
  it('returns the image config on success', async () => {
    containerServiceMock.inspectImage.mockResolvedValue({
      os: 'linux',
      architecture: 'arm64',
      variant: 'v8',
      created: '2024-01-01T00:00:00Z',
      dockerVersion: '24.0.5',
      labels: { maintainer: 'test' },
    })

    const res = await request(app).post('/api/container/inspect').send({ imageRef: 'nginx:latest', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      config: {
        os: 'linux',
        architecture: 'arm64',
        variant: 'v8',
        created: '2024-01-01T00:00:00Z',
        dockerVersion: '24.0.5',
        labels: { maintainer: 'test' },
      },
    })
  })

  // Protects the route's own fallback logic: `os`/`architecture` default to linux/amd64 when the
  // service returns them empty — a real branch in container.ts, not just pass-through.
  it('defaults os to linux and architecture to amd64 when the service omits them', async () => {
    containerServiceMock.inspectImage.mockResolvedValue({})

    const res = await request(app).post('/api/container/inspect').send({ imageRef: 'nginx:latest', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, config: { os: 'linux', architecture: 'amd64' } })
  })

  // Protects the no-validation contract: a missing imageRef still reaches the service, whose
  // failure is caught and reported rather than crashing the request.
  it('reports failure (200, success:false) when imageRef is missing and inspect fails', async () => {
    containerServiceMock.inspectImage.mockRejectedValue(new Error('inspect failed'))

    const res = await request(app).post('/api/container/inspect').send({ runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'inspect failed' })
  })
})

describe('POST /api/container/scan', () => {
  // Protects the full orchestration: runtime check -> pull -> manifest -> inspect -> extract, and
  // the route's own composition logic (image-ref parsing, layer/package attribution, dedup, stats)
  // that runs on top of the mocked service calls.
  it('composes a full scan result when every step succeeds', async () => {
    containerServiceMock.checkRuntime.mockResolvedValue({ type: 'docker', version: '24.0.5', available: true })
    containerServiceMock.pullImage.mockResolvedValue({ digest: 'sha256:pulled' })
    containerServiceMock.getManifest.mockResolvedValue({
      digest: 'sha256:manifestdigest',
      config: { digest: 'sha256:configdigest' },
      layers: [],
    })
    containerServiceMock.inspectImage.mockResolvedValue({ os: 'linux', architecture: 'amd64' })
    containerServiceMock.extractPackages.mockResolvedValue({
      packages: [
        {
          name: 'busybox',
          version: '1.36.1-r0',
          manager: 'apk',
          architecture: 'x86_64',
          layerDigest: 'sha256:layer1',
        },
      ],
      layers: [{ digest: 'sha256:layer1', size: 1234, mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip' }],
    })

    const res = await request(app).post('/api/container/scan').send({ imageRef: 'alpine:3.19', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.result.image).toMatchObject({
      name: 'docker.io/alpine:3.19',
      registry: 'docker.io',
      repository: 'alpine',
      tag: '3.19',
      original: 'alpine:3.19',
    })
    expect(res.body.result.imageDigest).toBe('sha256:configdigest')
    expect(res.body.result.manifestDigest).toBe('sha256:manifestdigest')
    expect(res.body.result.platform).toEqual({ os: 'linux', architecture: 'amd64' })
    expect(res.body.result.layers).toEqual([
      {
        digest: 'sha256:layer1',
        size: 1234,
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        packages: [
          {
            name: 'busybox',
            version: '1.36.1-r0',
            manager: 'apk',
            architecture: 'x86_64',
            layerDigest: 'sha256:layer1',
          },
        ],
      },
    ])
    expect(res.body.result.packages).toHaveLength(1)
    expect(res.body.result.stats).toMatchObject({
      totalLayers: 1,
      processedLayers: 1,
      totalPackages: 1,
      uniquePackages: 1,
    })
    expect(typeof res.body.result.stats.scanTimeMs).toBe('number')
    expect(res.body.result.warnings).toEqual([])
    expect(res.body.result.errors).toEqual([])
  })

  // Protects the route's own early-exit branch: an unavailable runtime must short-circuit before
  // ever attempting to pull, with a clear, actionable error.
  it('fails fast (200, success:false) when the runtime is not available, without pulling', async () => {
    containerServiceMock.checkRuntime.mockResolvedValue({ type: 'docker', version: '', available: false })

    const res = await request(app).post('/api/container/scan').send({ imageRef: 'alpine:3.19', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      error: 'docker runtime is not available. Please install docker to scan container images.',
    })
    expect(containerServiceMock.pullImage).not.toHaveBeenCalled()
  })

  // Protects the outer catch-all: a failure partway through the pipeline (after the runtime check
  // passes) is reported as success:false rather than propagating as an unhandled 500.
  it('reports failure (200, success:false) when a downstream step fails mid-scan', async () => {
    containerServiceMock.checkRuntime.mockResolvedValue({ type: 'docker', version: '24.0.5', available: true })
    containerServiceMock.pullImage.mockRejectedValue(new Error('pull failed: network error'))

    const res = await request(app).post('/api/container/scan').send({ imageRef: 'alpine:3.19', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'pull failed: network error' })
    expect(containerServiceMock.getManifest).not.toHaveBeenCalled()
  })
})

describe('POST /api/container/extract', () => {
  // Protects the pass-through contract: extracted packages reach the client unchanged.
  it('returns extracted packages on success', async () => {
    containerServiceMock.extractPackages.mockResolvedValue({
      packages: [{ name: 'zlib', version: '1.2.11', manager: 'apk', layerDigest: 'sha256:layer1' }],
      layers: [],
    })

    const res = await request(app)
      .post('/api/container/extract')
      .send({ imageRef: 'alpine:3.19', runtime: 'docker', layerDigests: ['sha256:layer1'] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      packages: [{ name: 'zlib', version: '1.2.11', manager: 'apk', layerDigest: 'sha256:layer1' }],
    })
    expect(containerServiceMock.extractPackages).toHaveBeenCalledWith(
      'alpine:3.19',
      'docker',
      ['sha256:layer1'],
      expect.any(Function),
    )
  })

  // Protects the no-validation contract: a missing layerDigests array still reaches the service,
  // whose failure is caught and reported rather than crashing the request.
  it('reports failure (200, success:false) when layerDigests is missing and extraction fails', async () => {
    containerServiceMock.extractPackages.mockRejectedValue(new Error('extraction failed'))

    const res = await request(app).post('/api/container/extract').send({ imageRef: 'alpine:3.19', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'extraction failed' })
  })
})
