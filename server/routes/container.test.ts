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
  // /api/container sits behind the tighter containerLimiter (5/min); this file drives more than
  // that from one IP, so raise the cap for the controlled run (must be set before createTestApp
  // imports the app + rate limiter).
  process.env.RATE_LIMIT_MAX = '1000000'
  ;({ app, dataDir } = await createTestApp())
})

afterAll(() => {
  delete process.env.RATE_LIMIT_MAX
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

  // Protects the `error instanceof Error ? ... : 'default message'` fallback branch: a rejection
  // that is not an Error instance (e.g. a raw string thrown from native bindings) must still
  // produce a stable, generic message rather than leaking the non-Error value or crashing.
  it('falls back to a generic message when the service rejects with a non-Error value', async () => {
    containerServiceMock.checkRuntime.mockRejectedValue('docker daemon socket refused')

    const res = await request(app).post('/api/container/check-runtime').send({ runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Failed to check container runtime' })
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

  // Protects the progress-forwarding wiring: the status callback handed to pullImage is not a
  // dead parameter — when the service actually invokes it mid-pull, the route must run that
  // callback body (broadcasting scan-progress) rather than only wiring it up unused.
  it('invokes the pull-status callback for each progress update reported by the service', async () => {
    containerServiceMock.pullImage.mockImplementation(
      async (_imageRef, _runtime, onStatus: (status: string) => void) => {
        onStatus('Downloading layer 1/3')
        onStatus('Downloading layer 2/3')
        return { digest: 'sha256:pulled456' }
      },
    )

    const res = await request(app).post('/api/container/pull').send({ imageRef: 'nginx:latest', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, digest: 'sha256:pulled456' })
  })

  // Protects the `error instanceof Error ? ... : 'default message'` fallback branch for this
  // route specifically — a non-Error rejection must still yield the route's own generic message.
  it('falls back to a generic message when the pull rejects with a non-Error value', async () => {
    containerServiceMock.pullImage.mockRejectedValue({ code: 'ENOENT' })

    const res = await request(app).post('/api/container/pull').send({ imageRef: 'nginx:latest', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Failed to pull image' })
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

  // Protects the `error instanceof Error ? ... : 'default message'` fallback branch for this
  // route specifically — a non-Error rejection must still yield the route's own generic message.
  it('falls back to a generic message when the lookup rejects with a non-Error value', async () => {
    containerServiceMock.getManifest.mockRejectedValue(42)

    const res = await request(app).post('/api/container/manifest').send({ imageRef: 'nginx:latest', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Failed to get manifest' })
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

  // Protects the `error instanceof Error ? ... : 'default message'` fallback branch for this
  // route specifically — a non-Error rejection must still yield the route's own generic message.
  it('falls back to a generic message when inspect rejects with a non-Error value', async () => {
    containerServiceMock.inspectImage.mockRejectedValue('not-an-error')

    const res = await request(app).post('/api/container/inspect').send({ imageRef: 'nginx:latest', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Failed to inspect image' })
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
      warnings: [],
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

  // Protects the `error instanceof Error ? ... : 'default message'` fallback branch for this
  // route specifically — a non-Error rejection mid-pipeline must still yield the route's own
  // generic message rather than propagating the raw rejection value.
  it('falls back to a generic message when a downstream step rejects with a non-Error value', async () => {
    containerServiceMock.checkRuntime.mockResolvedValue({ type: 'docker', version: '24.0.5', available: true })
    containerServiceMock.pullImage.mockRejectedValue('network unreachable')

    const res = await request(app).post('/api/container/scan').send({ imageRef: 'alpine:3.19', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Failed to scan image' })
  })

  // Protects the progress-forwarding wiring for both the pull and extract phases of a scan: the
  // callbacks handed to pullImage/extractPackages must actually run (broadcasting scan-progress)
  // when the service invokes them, not just be wired up and left unused.
  it('invokes the pull-status and extract-phase callbacks reported by the service during a scan', async () => {
    containerServiceMock.checkRuntime.mockResolvedValue({ type: 'docker', version: '24.0.5', available: true })
    containerServiceMock.pullImage.mockImplementation(
      async (_imageRef, _runtime, onStatus: (status: string) => void) => {
        onStatus('Downloading layer 1/1')
        return { digest: 'sha256:pulled' }
      },
    )
    containerServiceMock.getManifest.mockResolvedValue({
      digest: 'sha256:manifestdigest',
      config: { digest: 'sha256:configdigest' },
      layers: [],
    })
    containerServiceMock.inspectImage.mockResolvedValue({ os: 'linux', architecture: 'amd64' })
    containerServiceMock.extractPackages.mockImplementation(
      async (_imageRef, _runtime, _layerDigests, onPhase: (phase: string) => void) => {
        onPhase('scanning apk database')
        return { packages: [], layers: [], warnings: [] }
      },
    )

    const res = await request(app).post('/api/container/scan').send({ imageRef: 'alpine:3.19', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  // Protects the route's own optional-chaining/default fallbacks that run on top of the mocked
  // service calls: a manifest missing `config`/`digest` must not throw (imageDigest/manifestDigest
  // fall back to ''), an inspect result missing os/architecture must default to linux/amd64 here
  // too (this is a separate branch from the /inspect endpoint's own defaulting), and packages that
  // collide on manager+name+architecture (falling back to 'noarch' when architecture is absent)
  // must be deduplicated down to the last-seen entry rather than double-counted in stats.
  it('defaults missing manifest digests and platform fields, and deduplicates same-key packages', async () => {
    containerServiceMock.checkRuntime.mockResolvedValue({ type: 'docker', version: '24.0.5', available: true })
    containerServiceMock.pullImage.mockResolvedValue({ digest: 'sha256:pulled' })
    containerServiceMock.getManifest.mockResolvedValue({ digest: '', config: undefined, layers: [] })
    containerServiceMock.inspectImage.mockResolvedValue({})
    containerServiceMock.extractPackages.mockResolvedValue({
      packages: [
        { name: 'openssl', version: '1.1.1n-r0', manager: 'apk', layerDigest: 'sha256:layer1' },
        { name: 'openssl', version: '1.1.1t-r0', manager: 'apk', layerDigest: 'sha256:layer2' },
      ],
      layers: [
        { digest: 'sha256:layer1', size: 100, mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip' },
        { digest: 'sha256:layer2', size: 200, mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip' },
      ],
      warnings: [],
    })

    const res = await request(app).post('/api/container/scan').send({ imageRef: 'alpine:3.19', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body.result.imageDigest).toBe('')
    expect(res.body.result.manifestDigest).toBe('')
    expect(res.body.result.platform).toEqual({ os: 'linux', architecture: 'amd64' })
    // Both packages share manager:name:noarch (no architecture given) — the second (later) entry
    // wins the dedup, so only one survives in the consolidated list and stats.
    expect(res.body.result.packages).toHaveLength(1)
    expect(res.body.result.packages[0].version).toBe('1.1.1t-r0')
    expect(res.body.result.stats.totalPackages).toBe(2)
    expect(res.body.result.stats.uniquePackages).toBe(1)
  })

  describe('image reference parsing (parseImageRef)', () => {
    beforeEach(() => {
      containerServiceMock.checkRuntime.mockResolvedValue({ type: 'docker', version: '24.0.5', available: true })
      containerServiceMock.pullImage.mockResolvedValue({ digest: 'sha256:pulled' })
      containerServiceMock.getManifest.mockResolvedValue({
        digest: 'sha256:m',
        config: { digest: 'sha256:c' },
        layers: [],
      })
      containerServiceMock.inspectImage.mockResolvedValue({ os: 'linux', architecture: 'amd64' })
      containerServiceMock.extractPackages.mockResolvedValue({ packages: [], layers: [], warnings: [] })
    })

    // Protects the registry-detection branch (a first path segment containing '.') plus the
    // explicit-tag branch: a fully-qualified ref must have its registry host split off, not left
    // fused into the repository path.
    it('splits a dotted registry host and repository path off a fully-qualified ref', async () => {
      const res = await request(app)
        .post('/api/container/scan')
        .send({ imageRef: 'myregistry.example.com/team/app:v2.1.0', runtime: 'docker' })

      expect(res.body.result.image).toMatchObject({
        name: 'myregistry.example.com/team/app:v2.1.0',
        registry: 'myregistry.example.com',
        repository: 'team/app',
        tag: 'v2.1.0',
        original: 'myregistry.example.com/team/app:v2.1.0',
      })
      expect(res.body.result.image.digest).toBeUndefined()
    })

    // Protects the registry-detection branch's other trigger (a first path segment containing
    // ':', e.g. a host:port registry) together with the default-tag branch (no tag in the ref).
    it('splits a host:port registry off the repository and defaults the tag to latest', async () => {
      const res = await request(app)
        .post('/api/container/scan')
        .send({ imageRef: 'localhost:5000/myapp', runtime: 'docker' })

      expect(res.body.result.image).toMatchObject({
        name: 'localhost:5000/myapp:latest',
        registry: 'localhost:5000',
        repository: 'myapp',
        tag: 'latest',
        original: 'localhost:5000/myapp',
      })
    })

    // Protects the case where a ref has a path segment but neither a dot nor a colon in the first
    // part (e.g. a docker.io namespace/repo) — the registry-detection branch must be false, leaving
    // the default docker.io registry and keeping the namespace fused into the repository.
    it('keeps a namespace/repo path fused into the repository when no registry host is present', async () => {
      const res = await request(app)
        .post('/api/container/scan')
        .send({ imageRef: 'library/nginx:latest', runtime: 'docker' })

      expect(res.body.result.image).toMatchObject({
        name: 'docker.io/library/nginx:latest',
        registry: 'docker.io',
        repository: 'library/nginx',
        tag: 'latest',
        original: 'library/nginx:latest',
      })
    })

    // Protects the digest branch: a @sha256:-pinned ref must populate `digest` and omit `tag`
    // entirely (the digest/tag ternary), rather than trying to also parse a tag off the digest.
    it('treats a @sha256-pinned ref as digest-addressed and omits the tag field', async () => {
      const digest = `sha256:${'a'.repeat(64)}`
      const res = await request(app)
        .post('/api/container/scan')
        .send({ imageRef: `alpine@${digest}`, runtime: 'docker' })

      expect(res.body.result.image).toMatchObject({
        name: `docker.io/alpine@${digest}`,
        registry: 'docker.io',
        repository: 'alpine',
        digest,
        original: `alpine@${digest}`,
      })
      expect(res.body.result.image.tag).toBeUndefined()
    })
  })
})

describe('POST /api/container/extract', () => {
  // Protects the pass-through contract: extracted packages reach the client unchanged.
  it('returns extracted packages on success', async () => {
    containerServiceMock.extractPackages.mockResolvedValue({
      packages: [{ name: 'zlib', version: '1.2.11', manager: 'apk', layerDigest: 'sha256:layer1' }],
      layers: [],
      warnings: [],
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

  // Protects the progress-forwarding wiring: the phase callback handed to extractPackages must
  // actually run (broadcasting scan-progress) when the service invokes it, not just be wired up
  // and left unused.
  it('invokes the extract-phase callback for each phase reported by the service', async () => {
    containerServiceMock.extractPackages.mockImplementation(
      async (_imageRef, _runtime, _layerDigests, onPhase: (phase: string) => void) => {
        onPhase('reading apk database')
        return { packages: [], layers: [], warnings: [] }
      },
    )

    const res = await request(app)
      .post('/api/container/extract')
      .send({ imageRef: 'alpine:3.19', runtime: 'docker', layerDigests: ['sha256:layer1'] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, packages: [] })
  })

  // Protects the `error instanceof Error ? ... : 'default message'` fallback branch for this
  // route specifically — a non-Error rejection must still yield the route's own generic message.
  it('falls back to a generic message when extraction rejects with a non-Error value', async () => {
    containerServiceMock.extractPackages.mockRejectedValue('not-an-error')

    const res = await request(app).post('/api/container/extract').send({ imageRef: 'alpine:3.19', runtime: 'docker' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Failed to extract packages' })
  })
})
