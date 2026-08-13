import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { Express } from 'express'
import { createTestApp } from '../test-utils/testApp'
import { importNvdData } from '../database/nvd/index.js'
import type { NvdImportResult } from '../database/nvd/index.js'
import { runMigrations } from '../database/migrations/v2SchemaMigration.js'
import { getStorageConfig, getPerfConfig } from '../database/settingsStore.js'
import type { CVEWithDetails, DatabaseMetadata } from '../database/types.js'
import type { CveFullDetails } from '../types/database.js'

type BetterDb = InstanceType<typeof Database>

// Integration tests for /api/database (NFR-08 — every API endpoint covered). createTestApp()
// builds the real Express app but never calls initializeDatabase(), so getDb() / getDeltaSync() /
// getCpeSearch() resolve to null by default — the "DB not ready" state most handlers must
// degrade to gracefully. Those three getters are ALSO mocked directly below (same technique as
// the ContainerService mock in container.test.ts) so individual tests can additionally drive the
// initialized/success branches without running a full initializeDatabase(): getDb() resolves to a
// fake whose business-logic methods (getCVEById, searchCVEsByText, ...) are plain vi.fn()s, but
// whose getRawDb() is a real, fully-migrated in-memory better-sqlite3 connection — so handlers
// that run raw SQL directly against it (settingsStore, FTS5, /reset, /sync/auto, download_queue)
// exercise genuine SQLite behavior instead of a hand-rolled fake of the driver. importNvdData is
// mocked via importOriginal so the OTHER real exports of this module (createBulkDownloadManager,
// getRecentYearsForDownload) stay real; POST /sync/start and /sync/bulk therefore never reach the
// real network, but /download/queue and /download/clear still exercise the real queue manager.
// broadcast() is mocked so tests can assert exactly what a connected client would receive.
vi.mock('../database/nvd/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../database/nvd/index.js')>()
  return {
    ...actual,
    importNvdData: vi.fn(),
    getAvailableNvdYears: vi.fn((start: number, end: number) => {
      const years: number[] = []
      for (let year = start; year <= end; year++) years.push(year)
      return years
    }),
  }
})

const initializeMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getDeltaSync: vi.fn(),
  getCpeSearch: vi.fn(),
}))

vi.mock('../database/initialize.js', () => ({
  getDb: initializeMocks.getDb,
  getDeltaSync: initializeMocks.getDeltaSync,
  getCpeSearch: initializeMocks.getCpeSearch,
}))

const websocketMocks = vi.hoisted(() => ({ broadcast: vi.fn() }))
vi.mock('../websocket.js', () => ({ broadcast: websocketMocks.broadcast }))

const mockImportResult: NvdImportResult = {
  success: true,
  yearsProcessed: [2025],
  yearsFailed: [],
  totalCVEs: 0,
  importedCVEs: 0,
  failedCVEs: 0,
  duration: 0,
  dbSize: 0,
}

/** A fresh in-memory DB migrated to the current schema — the same shape the real NvdDatabase uses. */
function createMigratedDb(): BetterDb {
  const db = new Database(':memory:')
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  runMigrations(db, 0)
  return db
}

/**
 * A fake NvdDatabase: controllable mocks for the business-logic methods the route calls, backed
 * by a real (migrated) raw connection for the handlers that run SQL directly against getRawDb().
 */
function createFakeDatabase(rawDbConn: BetterDb | null) {
  return {
    isInitialized: vi.fn().mockReturnValue(true),
    getRawDb: vi.fn().mockReturnValue(rawDbConn),
    getCVEById: vi.fn().mockReturnValue(null),
    getCVEFullDetails: vi.fn().mockReturnValue(null),
    searchCVEsByCPE: vi.fn().mockReturnValue([]),
    searchCVEsByText: vi.fn().mockReturnValue([]),
    getCveListDetails: vi.fn().mockReturnValue(new Map()),
    getMetadata: vi.fn().mockReturnValue(fakeMetadata()),
    getDbSize: vi.fn().mockReturnValue(0),
  }
}

function createFakeDeltaSync() {
  return {
    getStats: vi.fn().mockReturnValue({
      totalCves: 0,
      totalCwe: 0,
      totalCpe: 0,
      totalRefs: 0,
      oldestCve: null,
      newestCve: null,
    }),
    getSyncStatus: vi.fn().mockReturnValue({
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      totalCves: 0,
      syncDurationMs: null,
      lastError: null,
      nextScheduledSync: null,
      autoSyncEnabled: false,
      autoSyncIntervalHours: 24,
      bandwidthLimitKBps: 0,
    }),
    sync: vi.fn(),
    cancel: vi.fn(),
    setAutoSyncInterval: vi.fn(),
    setBandwidthLimitKBps: vi.fn(),
  }
}

function createFakeCpeSearch() {
  return {
    searchByTokens: vi.fn().mockResolvedValue([]),
    searchByProductName: vi.fn().mockResolvedValue([]),
  }
}

function fakeCve(overrides: Partial<CVEWithDetails> = {}): CVEWithDetails {
  return {
    id: 'CVE-2024-10001',
    description: 'A test vulnerability description.',
    cvss_score: 7.5,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    severity: 'HIGH',
    published_at: '2024-01-15T00:00:00.000Z',
    modified_at: '2024-01-20T00:00:00.000Z',
    source: 'NVD',
    ...overrides,
  }
}

function fakeMetadata(overrides: Partial<DatabaseMetadata> = {}): DatabaseMetadata {
  return { schema_version: '2', total_cves: 0, cves_after_2021: 0, ...overrides }
}

function fakeCveFullDetails(overrides: Partial<CveFullDetails> = {}): CveFullDetails {
  return {
    id: 'CVE-2024-20002',
    description: 'Full detail test vulnerability.',
    severity: 'CRITICAL',
    publishedAt: '2024-02-01T00:00:00.000Z',
    modifiedAt: '2024-02-05T00:00:00.000Z',
    source: 'NVD',
    cpeMatches: [],
    cweReferences: [],
    references: [],
    referenceTags: [],
    ...overrides,
  }
}

/** Inserts a minimal, schema-valid CVE row (with published_year, used by prune) for setup. */
function insertCve(db: BetterDb, id: string, publishedYear: number): void {
  db.prepare(
    `INSERT INTO cves (id, description, published_at, modified_at, published_year, source)
     VALUES (?, 'test description', ?, ?, ?, 'NVD')`,
  ).run(id, `${publishedYear}-06-01T00:00:00Z`, `${publishedYear}-06-01T00:00:00Z`, publishedYear)
}

let app: Express
let dataDir: string
let rawDb: BetterDb
let resetSyncStateForTests: () => void

beforeAll(async () => {
  // /api/database sits behind the default rate limiter (60 req/min/IP), and this file drives many
  // requests against it from a single test process/IP. Raise the cap for this controlled run —
  // same rationale and pattern as server/routes/storage.test.ts. Must be set BEFORE anything
  // imports database.ts (directly or transitively, e.g. via createTestApp()'s app.js), since
  // rateLimit.ts reads RATE_LIMIT_MAX into a module-level constant the first time it loads — hence
  // the dynamic import here instead of a static one at the top of the file.
  process.env.RATE_LIMIT_MAX = '1000000'
  ;({ resetSyncStateForTests } = await import('./database.js'))
  ;({ app, dataDir } = await createTestApp())
})

afterAll(() => {
  delete process.env.RATE_LIMIT_MAX
  rmSync(dataDir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(importNvdData).mockReset()
  vi.mocked(importNvdData).mockResolvedValue(mockImportResult)
  initializeMocks.getDb.mockReset()
  initializeMocks.getDeltaSync.mockReset()
  initializeMocks.getCpeSearch.mockReset()
  websocketMocks.broadcast.mockReset()
  rawDb = createMigratedDb()
})

afterEach(() => {
  // /sync/start and /sync/delta share a module-level `syncState` flag that outlives any single
  // request (only flipped back by callbacks the mocked importNvdData never invokes). /sync/cancel
  // now (correctly) refuses to clear a full/bulk sync, so reset directly via the test-only hook so
  // a test that leaves it `true` can never leak into an unrelated later test.
  resetSyncStateForTests()
  rawDb.close()
})

describe('POST /api/database/search', () => {
  // Validation runs before the DB is ever touched — a missing/invalid type must never reach getDb().
  it('rejects a request with a missing search type', async () => {
    const res = await request(app).post('/api/database/search').send({ query: 'lodash' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      results: [],
      total: 0,
      limit: 100,
      offset: 0,
      error: 'Missing or invalid search type',
    })
  })

  // cve-id searches require a complete CVE-YYYY-NNNNN pattern; this is rejected by the validator,
  // not by a downstream lookup, so it must not depend on the DB being ready.
  it('rejects a malformed CVE ID for the cve-id search type', async () => {
    const res = await request(app).post('/api/database/search').send({ type: 'cve-id', query: 'not-a-cve' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toContain('Invalid CVE ID format')
  })

  // Once validation passes, the handler must degrade gracefully (not throw) when the DB isn't ready.
  it('returns a graceful not-ready response for a valid text search', async () => {
    const res = await request(app).post('/api/database/search').send({ type: 'text', query: 'lodash' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      results: [],
      total: 0,
      limit: 100,
      offset: 0,
      error: 'Database not initialized',
    })
  })

  // Below: the database IS initialized, exercising the mapping, enrichment, pagination-heuristic,
  // caching, and error-sanitization branches that only run once a lookup actually happens.

  it('returns a mapped CVE with CWE/reference enrichment for a found cve-id search', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getCVEById.mockReturnValue(fakeCve({ id: 'CVE-2024-10001', severity: 'HIGH' }))
    fakeDb.getCveListDetails.mockReturnValue(
      new Map([
        [
          'CVE-2024-10001',
          {
            cwes: ['CWE-79'],
            references: [{ url: 'https://example.com/advisory', source: 'nvd', tags: ['exploit'] }],
            referenceTags: ['exploit'],
          },
        ],
      ]),
    )
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/search').send({ type: 'cve-id', query: 'CVE-2024-10001' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      results: [
        {
          id: 'CVE-2024-10001',
          cveId: 'CVE-2024-10001',
          description: 'A test vulnerability description.',
          severity: 'HIGH',
          cvssScore: 7.5,
          cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
          publishedAt: '2024-01-15T00:00:00.000Z',
          modifiedAt: '2024-01-20T00:00:00.000Z',
          source: 'NVD',
          cwes: ['CWE-79'],
          references: [{ url: 'https://example.com/advisory', source: 'nvd', tags: ['exploit'] }],
          referenceTags: ['exploit'],
        },
      ],
      total: 1,
      limit: 100,
      offset: 0,
    })
  })

  it('returns an empty result without querying enrichment details when the cve-id is not found', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getCVEById.mockReturnValue(null)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/search').send({ type: 'cve-id', query: 'CVE-2024-99999' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, results: [], total: 0, limit: 100, offset: 0 })
    // Enrichment is an extra DB round trip; it must be skipped entirely when there's nothing to enrich.
    expect(fakeDb.getCveListDetails).not.toHaveBeenCalled()
  })

  it('reports an exact total for a cpe search when fewer results than the limit come back', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByCPE.mockReturnValue([fakeCve({ id: 'CVE-2024-30001' })])
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app)
      .post('/api/database/search')
      .send({ type: 'cpe', query: 'cpe:2.3:a:openssl:openssl:1.0:*:*:*:*:*:*:*', limit: 10 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.total).toBe(1) // offset(0) + results.length(1) — an exact count, not an estimate
  })

  it('reports an "at least" approximate total for a cpe search when a full page comes back', async () => {
    // WHY: a full page means there may be MORE matches beyond it; the handler must not claim the
    // page length IS the total — that under-reports and breaks "next page" pagination in the UI.
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByCPE.mockReturnValue([fakeCve({ id: 'CVE-2024-30002' })])
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app)
      .post('/api/database/search')
      .send({ type: 'cpe', query: 'cpe:2.3:a:openssl:openssl:1.0:*:*:*:*:*:*:*', limit: 1 })

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2) // offset(0) + limit(1) + 1, signaling "more may exist"
  })

  it('passes the raw text-search term to searchCVEsByText, not the SQL-mangled sanitized one', async () => {
    // WHY: sanitizeSqlInput strips SQL keywords/hyphens and would mangle a legitimate package name
    // like "update-alternatives" into "-alternatives" — searchCVEsByText already parameterizes the
    // query itself, so the raw term must reach it untouched (see the comment on this branch).
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByText.mockReturnValue([])
    initializeMocks.getDb.mockReturnValue(fakeDb)

    await request(app).post('/api/database/search').send({ type: 'text', query: 'update-alternatives' })

    expect(fakeDb.searchCVEsByText).toHaveBeenCalledWith('update-alternatives', 100, 0)
  })

  it('reports an "at least" approximate total for a text search when a full page comes back', async () => {
    // Same pagination heuristic as the cpe branch, applied independently to the text branch.
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByText.mockReturnValue([fakeCve({ id: 'CVE-2024-41001' })])
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/search').send({ type: 'text', query: 'openssl', limit: 1 })

    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2) // offset(0) + limit(1) + 1, signaling "more may exist"
  })

  it('rejects a whitespace-only text query after trimming, without ever calling the database', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/search').send({ type: 'text', query: '   ' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      results: [],
      total: 0,
      limit: 100,
      offset: 0,
      error: 'Empty search query',
    })
    expect(fakeDb.searchCVEsByText).not.toHaveBeenCalled()
  })

  it('serves a repeated identical search from the response cache instead of hitting the database again', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByText.mockReturnValue([fakeCve({ id: 'CVE-2024-40001' })])
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const body = { type: 'text' as const, query: 'unique-cache-probe-term' }
    const first = await request(app).post('/api/database/search').send(body)
    const second = await request(app).post('/api/database/search').send(body)

    expect(first.body.results).toEqual(second.body.results)
    expect(fakeDb.searchCVEsByText).toHaveBeenCalledTimes(1)
  })

  it('returns a sanitized generic error instead of leaking exception details when the search throws', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByText.mockImplementation(() => {
      throw new Error('SQLITE_CORRUPT: database disk image is malformed')
    })
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/search').send({ type: 'text', query: 'trigger-search-error' })

    expect(res.status).toBe(200)
    // sanitizeErrorMessage maps any unrecognized Error message to a generic one — raw SQLite
    // internals must never reach the client.
    expect(res.body).toEqual({
      success: false,
      results: [],
      total: 0,
      limit: 100,
      offset: 0,
      error: 'An unexpected error occurred.',
    })
  })

  // The "not ready" degrade path has two independent triggers: getDb() returning nothing (covered
  // above) and getDb() returning a real object whose isInitialized() reports false (e.g. mid-boot,
  // before the schema migration finishes). Both must produce the identical graceful response.
  it('returns a graceful not-ready response when the database object exists but reports not initialized', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.isInitialized.mockReturnValue(false)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/search').send({ type: 'text', query: 'lodash' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      results: [],
      total: 0,
      limit: 100,
      offset: 0,
      error: 'Database not initialized',
    })
  })

  it('leaves cwes/references/referenceTags unset when details exist but every array is empty', async () => {
    // WHY: each enrichment field is attached independently and only when non-empty — an empty
    // array from getCveListDetails must not add empty-array noise the UI would render as bogus
    // "0 CWEs" chips. This is distinct from the "details is entirely absent" case covered above.
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByText.mockReturnValue([fakeCve({ id: 'CVE-2024-42001' })])
    fakeDb.getCveListDetails.mockReturnValue(
      new Map([['CVE-2024-42001', { cwes: [], references: [], referenceTags: [] }]]),
    )
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/search').send({ type: 'text', query: 'empty-details-probe' })

    expect(res.status).toBe(200)
    expect(res.body.results).toHaveLength(1)
    expect(res.body.results[0]).not.toHaveProperty('cwes')
    expect(res.body.results[0]).not.toHaveProperty('references')
    expect(res.body.results[0]).not.toHaveProperty('referenceTags')
  })
})

describe('POST /api/database/cve', () => {
  // Missing cveId must be rejected by the validator before any DB lookup.
  it('rejects a missing cveId', async () => {
    const res = await request(app).post('/api/database/cve').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, cve: null, error: 'Missing or invalid CVE ID' })
  })

  // A cveId that isn't shaped like CVE-YYYY-NNNNN is rejected before touching the DB.
  it('rejects a malformed cveId', async () => {
    const res = await request(app).post('/api/database/cve').send({ cveId: 'nope' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, cve: null, error: 'Invalid CVE ID format. Expected CVE-YYYY-NNNNN' })
  })

  // A well-formed request still must not throw when the DB is not ready — it degrades to success:false.
  it('returns a graceful not-ready response for a well-formed cveId', async () => {
    const res = await request(app).post('/api/database/cve').send({ cveId: 'CVE-2024-12345' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, cve: null, error: 'Database not initialized' })
  })

  it('normalizes a NONE severity to LOW and returns the mapped CVE when found', async () => {
    // WHY: 'NONE' is a valid CVSS severity but the UI has no "None" badge; normalizeDisplaySeverity
    // maps it (and any falsy severity) to LOW so every CVE renders a real severity badge.
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getCVEById.mockReturnValue(fakeCve({ id: 'CVE-2024-50001', severity: 'NONE' }))
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/cve').send({ cveId: 'CVE-2024-50001' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.cve.severity).toBe('LOW')
    expect(fakeDb.getCVEById).toHaveBeenCalledWith('CVE-2024-50001')
  })

  it('returns cve: null when the CVE genuinely does not exist', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getCVEById.mockReturnValue(null)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/cve').send({ cveId: 'CVE-2024-50002' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, cve: null })
  })

  it('returns a sanitized error instead of throwing when the lookup fails', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getCVEById.mockImplementation(() => {
      throw new Error('unexpected internal failure')
    })
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/cve').send({ cveId: 'CVE-2024-50003' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, cve: null, error: 'An unexpected error occurred.' })
  })

  it('returns a graceful not-ready response when the database object exists but reports not initialized', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.isInitialized.mockReturnValue(false)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/cve').send({ cveId: 'CVE-2024-12345' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, cve: null, error: 'Database not initialized' })
  })

  it('normalizes an undefined severity to LOW, the same as an explicit NONE severity', async () => {
    // WHY: normalizeDisplaySeverity's `!severity` fallback is a distinct branch from its explicit
    // 'NONE' check (covered above) — a CVE record missing severity entirely must still get a badge.
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getCVEById.mockReturnValue(fakeCve({ id: 'CVE-2024-50004', severity: undefined }))
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/cve').send({ cveId: 'CVE-2024-50004' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.cve.severity).toBe('LOW')
  })
})

describe('POST /api/database/cve/full', () => {
  // Shares validateGetCveRequest with POST /cve — same pre-DB validation contract applies here.
  it('rejects a malformed cveId', async () => {
    const res = await request(app).post('/api/database/cve/full').send({ cveId: 'nope' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, cve: null, error: 'Invalid CVE ID format. Expected CVE-YYYY-NNNNN' })
  })

  it('returns a graceful not-ready response for a well-formed cveId', async () => {
    const res = await request(app).post('/api/database/cve/full').send({ cveId: 'CVE-2024-12345' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, cve: null, error: 'Database not initialized' })
  })

  it('returns the full CVE details object unmapped (unlike the summary /cve endpoint)', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    const full = fakeCveFullDetails({ id: 'CVE-2024-60001' })
    fakeDb.getCVEFullDetails.mockReturnValue(full)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/cve/full').send({ cveId: 'CVE-2024-60001' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, cve: full })
  })

  it('returns cve: null when the full record does not exist', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getCVEFullDetails.mockReturnValue(null)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/cve/full').send({ cveId: 'CVE-2024-60002' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, cve: null })
  })

  it('returns a graceful not-ready response when the database object exists but reports not initialized', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.isInitialized.mockReturnValue(false)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/cve/full').send({ cveId: 'CVE-2024-12345' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, cve: null, error: 'Database not initialized' })
  })
})

describe('GET /api/database/stats', () => {
  // The dashboard's summary tile must render `stats: null` + an error, never throw, when the DB
  // hasn't been initialized yet (e.g. first launch before any sync).
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).get('/api/database/stats')
    expect(res.status).toBe(200)
    // dbPath (FR-10.3) is a config fact independent of DB readiness, so the Settings
    // page can show the storage location even before the first sync creates the file.
    const { config } = await import('../config.js')
    expect(res.body).toEqual({
      success: false,
      stats: null,
      error: 'Database not initialized',
      dbPath: config.DB_PATH,
    })
  })

  it('returns real stats mapped from metadata when the database is initialized', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getMetadata.mockReturnValue(fakeMetadata({ total_cves: 500, last_sync_at: '2026-01-01T00:00:00.000Z' }))
    fakeDb.getDbSize.mockReturnValue(123456)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).get('/api/database/stats')

    expect(res.status).toBe(200)
    const { config } = await import('../config.js')
    expect(res.body).toEqual({
      success: true,
      stats: { totalCves: 500, lastUpdate: '2026-01-01T00:00:00.000Z', dbSize: 123456, version: 1 },
      dbPath: config.DB_PATH,
    })
  })

  it('reports lastUpdate: null when metadata has never recorded a sync', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getMetadata.mockReturnValue(fakeMetadata({ total_cves: 0 }))
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).get('/api/database/stats')

    expect(res.body.stats.lastUpdate).toBeNull()
  })

  it('reports the real error message (not sanitized) when reading stats throws', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getMetadata.mockImplementation(() => {
      throw new Error('metadata table missing')
    })
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).get('/api/database/stats')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, stats: null, error: 'metadata table missing' })
  })

  it('reports not-initialized (with dbPath) when the database object exists but reports not initialized', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.isInitialized.mockReturnValue(false)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).get('/api/database/stats')

    expect(res.status).toBe(200)
    const { config } = await import('../config.js')
    expect(res.body).toEqual({
      success: false,
      stats: null,
      error: 'Database not initialized',
      dbPath: config.DB_PATH,
    })
  })
})

describe('GET /api/database/stats/detailed', () => {
  // Same not-ready contract as /stats, but for the detailed dashboard view.
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).get('/api/database/stats/detailed')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, stats: null, error: 'Database not initialized' })
  })

  it('sources detailed stats from the delta-sync service when it is available', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    const fakeDeltaSync = createFakeDeltaSync()
    fakeDeltaSync.getStats.mockReturnValue({
      totalCves: 10,
      totalCwe: 2,
      totalCpe: 3,
      totalRefs: 4,
      oldestCve: '2020-01-01',
      newestCve: '2026-01-01',
    })
    fakeDeltaSync.getSyncStatus.mockReturnValue({
      lastSyncAt: null,
      lastSuccessfulSyncAt: '2026-01-01T00:00:00.000Z',
      totalCves: 10,
      syncDurationMs: null,
      lastError: null,
      nextScheduledSync: null,
      autoSyncEnabled: true,
      autoSyncIntervalHours: 24,
      bandwidthLimitKBps: 0,
    })
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app).get('/api/database/stats/detailed')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      stats: {
        totalCves: 10,
        totalCwe: 2,
        totalCpe: 3,
        totalRefs: 4,
        oldestCve: '2020-01-01',
        newestCve: '2026-01-01',
        lastSuccessfulSync: '2026-01-01T00:00:00.000Z',
        autoSyncEnabled: true,
        autoSyncIntervalHours: 24,
      },
    })
  })

  it('falls back to metadata defaults when the delta-sync service has no stats yet', async () => {
    // Pins the docstring's own claim: getDeltaSync() can be null even with an initialized DB
    // (it's wired up separately), and the response must still be well-formed.
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getMetadata.mockReturnValue(fakeMetadata({ total_cves: 7, last_sync_at: '2025-12-01T00:00:00.000Z' }))
    initializeMocks.getDb.mockReturnValue(fakeDb)
    initializeMocks.getDeltaSync.mockReturnValue(undefined)

    const res = await request(app).get('/api/database/stats/detailed')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      stats: {
        totalCves: 7,
        totalCwe: 0,
        totalCpe: 0,
        totalRefs: 0,
        oldestCve: null,
        newestCve: null,
        lastSuccessfulSync: '2025-12-01T00:00:00.000Z',
        autoSyncEnabled: false,
        autoSyncIntervalHours: 24,
      },
    })
  })

  it('reports an error instead of throwing when reading detailed stats fails', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getMetadata.mockImplementation(() => {
      throw new Error('boom')
    })
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).get('/api/database/stats/detailed')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, stats: null, error: 'boom' })
  })

  it('reports not-initialized when the database object exists but reports not initialized', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.isInitialized.mockReturnValue(false)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).get('/api/database/stats/detailed')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, stats: null, error: 'Database not initialized' })
  })
})

describe('GET /api/database/sync/status', () => {
  // Polled by the UI while a sync may be running; must report a safe default rather than crash
  // when the DB itself isn't initialized yet.
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).get('/api/database/sync/status')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, status: null, error: 'Database not initialized' })
  })

  it('reports the last sync time from metadata when the database is initialized', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getMetadata.mockReturnValue(fakeMetadata({ last_sync_at: '2026-02-01T00:00:00.000Z' }))
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).get('/api/database/sync/status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      status: {
        isSyncing: false,
        progress: 0,
        total: 0,
        currentFile: null,
        error: null,
        lastSync: '2026-02-01T00:00:00.000Z',
      },
    })
  })

  it('reports an error instead of throwing when reading sync status fails', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.getMetadata.mockImplementation(() => {
      throw new Error('status read failed')
    })
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).get('/api/database/sync/status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, status: null, error: 'status read failed' })
  })

  it('reports not-initialized when the database object exists but reports not initialized', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.isInitialized.mockReturnValue(false)
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).get('/api/database/sync/status')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, status: null, error: 'Database not initialized' })
  })
})

describe('POST /api/database/sync/start', () => {
  // An out-of-range year must be rejected before the (mocked) import ever kicks off, and must not
  // leave syncState stuck mid-sync.
  it('rejects an invalid years array without starting a sync', async () => {
    const res = await request(app)
      .post('/api/database/sync/start')
      .send({ years: ['not-a-year'] })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe('Failed to start NVD sync')
    expect(res.body.error).toContain('Invalid year')
    expect(importNvdData).not.toHaveBeenCalled()
  })

  // A valid request kicks off the (mocked) import fire-and-forget and immediately reports success —
  // this is the contract the renderer's "sync now" button depends on for its optimistic UI update.
  it('starts a sync for the requested years and reports success immediately', async () => {
    const res = await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2025] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, message: 'Starting NVD sync for years: 2025' })
    expect(importNvdData).toHaveBeenCalledTimes(1)
    expect(vi.mocked(importNvdData).mock.calls[0][0]).toMatchObject({
      years: [2025],
      batchSize: 1000,
    })
  })

  // A second sync request must be rejected while the first is still in flight — otherwise two
  // concurrent imports could race on the same SQLite file.
  it('rejects a second sync while one is already in progress', async () => {
    vi.mocked(importNvdData).mockImplementationOnce(() => new Promise<NvdImportResult>(() => {}))
    const first = await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2025] })
    expect(first.body.success).toBe(true)

    const second = await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2025] })
    expect(second.status).toBe(200)
    expect(second.body).toEqual({ success: false, message: 'Sync already in progress', error: 'SYNC_IN_PROGRESS' })
  })

  it('falls back to the default year range when none is specified', async () => {
    const res = await request(app).post('/api/database/sync/start').send({})

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // getAvailableNvdYears is mocked to build [2021..2026] — the fallback used when no years are given.
    expect(vi.mocked(importNvdData).mock.calls[0][0].years).toEqual([2021, 2022, 2023, 2024, 2025, 2026])
  })

  it('clears the in-progress flag so a later sync can start after the background import rejects', async () => {
    let rejectImport: (error: Error) => void = () => {}
    vi.mocked(importNvdData).mockImplementationOnce(
      () =>
        new Promise<NvdImportResult>((_resolve, reject) => {
          rejectImport = reject
        }),
    )

    const started = await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2025] })
    expect(started.body.success).toBe(true)

    rejectImport(new Error('network unreachable'))
    await new Promise((resolve) => setImmediate(resolve)) // let the fire-and-forget .catch() run

    expect(websocketMocks.broadcast).toHaveBeenCalledWith('nvd-sync-error', {
      success: false,
      message: 'network unreachable',
      error: 'network unreachable',
    })
    // The stuck-forever regression this guards against: a second sync must be allowed to start.
    const second = await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2025] })
    expect(second.body.success).toBe(true)
  })

  it('broadcasts live progress with a year label, then a completion message, as the import proceeds', async () => {
    vi.mocked(importNvdData).mockImplementationOnce((options) => {
      options.onProgress?.({
        phase: 'downloading',
        currentYear: 2024,
        years: { total: 2, completed: 0, failed: 0, pending: 2 },
        download: { totalBytes: 2000, downloadedBytes: 1000, percentage: 50, speedMBps: 1, etaSeconds: 1 },
        parse: { totalCVEs: 0, processedCVEs: 0, percentage: 0 },
        import: { totalCVEs: 0, importedCVEs: 0, percentage: 0 },
      })
      options.onComplete?.({
        success: true,
        yearsProcessed: [2024, 2025],
        yearsFailed: [],
        totalCVEs: 20,
        importedCVEs: 20,
        failedCVEs: 0,
        duration: 500,
        dbSize: 1000,
      })
      return Promise.resolve(mockImportResult)
    })

    await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2024, 2025] })

    expect(websocketMocks.broadcast).toHaveBeenCalledWith(
      'nvd-sync-progress',
      expect.objectContaining({ year: 2024, status: 'downloading', downloaded: 1000, total: 2000 }),
    )
    expect(websocketMocks.broadcast).toHaveBeenCalledWith(
      'nvd-sync-complete',
      expect.objectContaining({
        success: true,
        message: 'NVD sync completed successfully. Imported 20 CVEs from 2 years.',
      }),
    )
  })

  it('broadcasts a failure message (not the success one) when the import completes unsuccessfully', async () => {
    vi.mocked(importNvdData).mockImplementationOnce((options) => {
      options.onComplete?.({
        success: false,
        yearsProcessed: [],
        yearsFailed: [2024],
        totalCVEs: 0,
        importedCVEs: 0,
        failedCVEs: 0,
        duration: 100,
        dbSize: 0,
      })
      return Promise.resolve(mockImportResult)
    })

    await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2024] })

    expect(websocketMocks.broadcast).toHaveBeenCalledWith(
      'nvd-sync-complete',
      expect.objectContaining({ success: false, message: 'NVD sync completed with errors' }),
    )
  })

  it('broadcasts a sync error when the import reports a partial failure via onError', async () => {
    vi.mocked(importNvdData).mockImplementationOnce((options) => {
      options.onError?.(new Error('year 2025 fetch failed'))
      return Promise.resolve(mockImportResult)
    })

    await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2025] })

    expect(websocketMocks.broadcast).toHaveBeenCalledWith('nvd-sync-error', {
      success: false,
      message: 'year 2025 fetch failed',
      error: 'year 2025 fetch failed',
    })
  })
})

describe('POST /api/database/sync/delta', () => {
  // The delta-sync engine itself is only wired up by initializeDatabase(), so in this harness it is
  // always null — the handler must report that plainly rather than throw.
  it('reports delta sync as not initialized', async () => {
    const res = await request(app).post('/api/database/sync/delta').send({})
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.errors).toEqual(['Delta sync not initialized'])
  })

  // Must also refuse to run while a full /sync/start is in flight, sharing the same isSyncing guard.
  it('reports already-in-progress while a sync/start is in flight', async () => {
    vi.mocked(importNvdData).mockImplementationOnce(() => new Promise<NvdImportResult>(() => {}))
    await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2025] })
      .expect(200)

    const res = await request(app).post('/api/database/sync/delta').send({})
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.errors).toEqual(['Sync already in progress'])
  })

  it('runs a delta sync, broadcasts progress and completion, and forwards the force flag', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    fakeDeltaSync.sync.mockImplementation(async (options: { onProgress?: (progress: unknown) => void }) => {
      options.onProgress?.({ phase: 'fetching' })
      return {
        success: true,
        cvesFetched: 10,
        cvesAdded: 8,
        cvesUpdated: 2,
        cvesSkipped: 0,
        cvesFailed: 0,
        durationMs: 50,
        syncedAt: '2026-01-01T00:00:00.000Z',
        errors: [],
      }
    })
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app).post('/api/database/sync/delta').send({ force: true })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: true,
      cvesFetched: 10,
      cvesAdded: 8,
      cvesUpdated: 2,
      cvesSkipped: 0,
      cvesFailed: 0,
      durationMs: 50,
      syncedAt: '2026-01-01T00:00:00.000Z',
      errors: [],
    })
    expect(fakeDeltaSync.sync).toHaveBeenCalledWith(expect.objectContaining({ forceFullSync: true }))
    expect(websocketMocks.broadcast).toHaveBeenCalledWith('nvd:sync-progress', {
      type: 'delta-sync',
      progress: { phase: 'fetching' },
    })
    expect(websocketMocks.broadcast).toHaveBeenCalledWith(
      'nvd:sync-complete',
      expect.objectContaining({ type: 'delta-sync' }),
    )
  })

  it('reports a failure result and broadcasts an error when the delta sync throws', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    fakeDeltaSync.sync.mockRejectedValue(new Error('delta sync connection reset'))
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app).post('/api/database/sync/delta').send({})

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      cvesFetched: 0,
      cvesAdded: 0,
      cvesUpdated: 0,
      cvesSkipped: 0,
      cvesFailed: 0,
      durationMs: 0,
      syncedAt: expect.any(String),
      errors: ['delta sync connection reset'],
    })
    expect(websocketMocks.broadcast).toHaveBeenCalledWith('nvd:sync-error', {
      type: 'delta-sync',
      error: 'delta sync connection reset',
    })
  })
})

describe('POST /api/database/sync/cancel', () => {
  // Must always succeed, even with no delta-sync engine and nothing in progress — the "cancel"
  // button in the UI can't be allowed to error out.
  it('succeeds even when nothing is syncing', async () => {
    const res = await request(app).post('/api/database/sync/cancel')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })

  it('refuses to cancel while a full sync is running', async () => {
    vi.mocked(importNvdData).mockImplementationOnce(() => new Promise<NvdImportResult>(() => {}))
    await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2025] })
      .expect(200)

    const res = await request(app).post('/api/database/sync/cancel')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'A full or bulk sync is running and cannot be cancelled' })
  })

  it('cancels the delta-sync engine when one is available and nothing full/bulk is running', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app).post('/api/database/sync/cancel')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(fakeDeltaSync.cancel).toHaveBeenCalledTimes(1)
  })

  it('reports failure instead of throwing when the cancel itself errors', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    fakeDeltaSync.cancel.mockImplementation(() => {
      throw new Error('cancel token already consumed')
    })
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app).post('/api/database/sync/cancel')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false })
  })
})

describe('POST /api/database/sync/bulk', () => {
  afterEach(() => {
    delete process.env.NIST_API_KEY
  })

  // The handler checks getDb() before anything else (including the API-key lookup), so in this
  // harness "database not initialized" is the only reachable branch. Covering the "no API key"
  // validation branch would require a real initialized DB, which is out of scope per the task's
  // "no seeded data" constraint — noted as a gap, not faked.
  it('reports not-initialized instead of attempting a download', async () => {
    const res = await request(app).post('/api/database/sync/bulk').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })

  it('requires an NVD API key before starting a download, even with an initialized database', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/sync/bulk').send({})

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toContain('NVD API key required')
    expect(importNvdData).not.toHaveBeenCalled()
  })

  it('downloads using the NIST_API_KEY environment variable and reports the imported count', async () => {
    process.env.NIST_API_KEY = 'test-env-api-key'
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    vi.mocked(importNvdData).mockResolvedValueOnce({ ...mockImportResult, importedCVEs: 42 })

    const res = await request(app)
      .post('/api/database/sync/bulk')
      .send({ years: [2025] })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, totalCves: 42 })
    expect(vi.mocked(importNvdData).mock.calls[0][0]).toMatchObject({
      years: [2025],
      apiKey: 'test-env-api-key',
    })
  })

  it('reports already-in-progress instead of starting a concurrent download', async () => {
    vi.mocked(importNvdData).mockImplementationOnce(() => new Promise<NvdImportResult>(() => {}))
    await request(app)
      .post('/api/database/sync/start')
      .send({ years: [2025] })
      .expect(200)
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/sync/bulk').send({})

    expect(res.body).toEqual({ success: false, error: 'Sync already in progress' })
  })

  it('broadcasts live download progress with a year label as the bulk download proceeds', async () => {
    process.env.NIST_API_KEY = 'test-env-api-key'
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    vi.mocked(importNvdData).mockImplementationOnce((options) => {
      options.onProgress?.({
        phase: 'downloading',
        currentYear: 2025,
        years: { total: 1, completed: 0, failed: 0, pending: 1 },
        download: { totalBytes: 500, downloadedBytes: 250, percentage: 50, speedMBps: 1, etaSeconds: 1 },
        parse: { totalCVEs: 0, processedCVEs: 0, percentage: 0 },
        import: { totalCVEs: 0, importedCVEs: 0, percentage: 0 },
      })
      return Promise.resolve(mockImportResult)
    })

    await request(app)
      .post('/api/database/sync/bulk')
      .send({ years: [2025] })

    expect(websocketMocks.broadcast).toHaveBeenCalledWith(
      'nvd:bulk-download-progress',
      expect.objectContaining({ year: 2025, status: 'downloading', downloaded: 250, total: 500 }),
    )
  })

  it('reports a failure and still clears the sync lock when the download throws', async () => {
    process.env.NIST_API_KEY = 'test-env-api-key'
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    vi.mocked(importNvdData).mockRejectedValueOnce(new Error('download interrupted'))

    const res = await request(app).post('/api/database/sync/bulk').send({})
    expect(res.body).toEqual({ success: false, error: 'download interrupted' })

    // The finally-block endSync() must run even on failure, or every later sync would report
    // "already in progress" forever.
    const second = await request(app).post('/api/database/sync/bulk').send({})
    expect(second.body.error).not.toBe('Sync already in progress')
  })
})

describe('POST /api/database/sync/auto', () => {
  // There is no input validation on this endpoint by design (it silently no-ops when the DB isn't
  // ready), so even a malformed body must still resolve to success:true rather than error.
  it('accepts the config and no-ops when the DB is not ready', async () => {
    const res = await request(app).post('/api/database/sync/auto').send({ enabled: true, intervalHours: 12 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })

  it('rejects a non-boolean enabled value before touching the database', async () => {
    const res = await request(app).post('/api/database/sync/auto').send({ enabled: 'yes', intervalHours: 12 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      error: 'Invalid request: enabled must be a boolean and intervalHours a non-negative number',
    })
  })

  it('rejects a negative intervalHours before touching the database', async () => {
    const res = await request(app).post('/api/database/sync/auto').send({ enabled: true, intervalHours: -1 })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
  })

  it('actually persists the auto-sync setting to sync_status, not just a no-op success', async () => {
    rawDb
      .prepare(
        `INSERT INTO sync_status (source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours)
         VALUES ('NVD', datetime('now'), 0, 24)`,
      )
      .run()
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/sync/auto').send({ enabled: true, intervalHours: 6 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    const row = rawDb
      .prepare('SELECT auto_sync_enabled, auto_sync_interval_hours FROM sync_status WHERE source = ?')
      .get('NVD')
    expect(row).toEqual({ auto_sync_enabled: 1, auto_sync_interval_hours: 6 })
  })

  it('reports failure instead of throwing when persisting the setting fails', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    rawDb.close() // force a realistic SQLite failure: "The database connection is not open"

    const res = await request(app).post('/api/database/sync/auto').send({ enabled: true, intervalHours: 6 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false })
  })

  it('accepts a valid config and no-ops when the database wrapper has no raw connection', async () => {
    // WHY: getDb() can be a real object whose getRawDb() is still null (raw connection not wired
    // up yet) — distinct from getDb() itself being absent (covered above). Must silently no-op,
    // not throw, since there is nothing to persist to.
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(null))

    const res = await request(app).post('/api/database/sync/auto').send({ enabled: true, intervalHours: 12 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })
})

describe('POST /api/database/cpe/search', () => {
  // CPE search is only constructed by initializeDatabase(), so it is always null here — the
  // validateCpeSearchRequest branch is unreachable without a real DB and is a genuine coverage
  // gap in this harness, not something to fake.
  it('reports CPE search as not initialized', async () => {
    const res = await request(app).post('/api/database/cpe/search').send({ productName: 'openssl' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, results: [], error: 'CPE search not initialized' })
  })

  it('rejects an invalid request shape from the validator, even with CPE search initialized', async () => {
    initializeMocks.getCpeSearch.mockReturnValue(createFakeCpeSearch())

    const res = await request(app).post('/api/database/cpe/search').send({ tokens: 'not-an-array' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, results: [], error: 'tokens must be an array' })
  })

  it('searches by tokens when both tokens and productName are given (tokens take precedence)', async () => {
    const fakeCpe = createFakeCpeSearch()
    fakeCpe.searchByTokens.mockResolvedValue([
      {
        cpe23Uri: 'cpe:2.3:a:openssl:openssl:1.0:*:*:*:*:*:*:*',
        vendor: 'openssl',
        product: 'openssl',
        version: '1.0',
        vulnerable: true,
      },
    ])
    initializeMocks.getCpeSearch.mockReturnValue(fakeCpe)

    const res = await request(app)
      .post('/api/database/cpe/search')
      .send({ tokens: ['openssl'], productName: 'ignored-when-tokens-present' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.results).toHaveLength(1)
    expect(fakeCpe.searchByTokens).toHaveBeenCalledWith(['openssl'], 100)
    expect(fakeCpe.searchByProductName).not.toHaveBeenCalled()
  })

  it('falls back to a productName search when no tokens are given', async () => {
    const fakeCpe = createFakeCpeSearch()
    fakeCpe.searchByProductName.mockResolvedValue([])
    initializeMocks.getCpeSearch.mockReturnValue(fakeCpe)

    const res = await request(app).post('/api/database/cpe/search').send({ productName: 'openssl' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, results: [] })
    expect(fakeCpe.searchByProductName).toHaveBeenCalledWith('openssl', 100)
  })

  it('falls back to a productName search when tokens is present but empty', async () => {
    // WHY: `request.tokens && request.tokens.length > 0` is a two-part condition — an empty array
    // is truthy but must still defer to productName, distinct from tokens being absent entirely.
    const fakeCpe = createFakeCpeSearch()
    fakeCpe.searchByProductName.mockResolvedValue([])
    initializeMocks.getCpeSearch.mockReturnValue(fakeCpe)

    const res = await request(app).post('/api/database/cpe/search').send({ tokens: [], productName: 'openssl' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, results: [] })
    expect(fakeCpe.searchByProductName).toHaveBeenCalledWith('openssl', 100)
    expect(fakeCpe.searchByTokens).not.toHaveBeenCalled()
  })

  it('rejects a request with neither tokens nor productName', async () => {
    initializeMocks.getCpeSearch.mockReturnValue(createFakeCpeSearch())

    const res = await request(app).post('/api/database/cpe/search').send({})

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, results: [], error: 'Either productName or tokens must be provided' })
  })

  it('reports an error instead of throwing when the CPE search itself fails', async () => {
    const fakeCpe = createFakeCpeSearch()
    fakeCpe.searchByProductName.mockRejectedValue(new Error('cpe index corrupted'))
    initializeMocks.getCpeSearch.mockReturnValue(fakeCpe)

    const res = await request(app).post('/api/database/cpe/search').send({ productName: 'openssl' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, results: [], error: 'cpe index corrupted' })
  })
})

describe('GET /api/database/config/sync', () => {
  // Settings page reads this to show the current auto-sync cadence; must have a safe default
  // ('weekly') when delta sync hasn't been initialized.
  it('returns the default sync config', async () => {
    const res = await request(app).get('/api/database/config/sync')
    expect(res.status).toBe(200)
    // bandwidthLimitKBps defaults to 0 (unlimited); the Settings input reads it to
    // render the current cap, so it must always be present, not just when set.
    expect(res.body).toEqual({ success: true, config: { syncInterval: 'weekly', bandwidthLimitKBps: 0 } })
  })

  it('maps a 0-hour interval to the "manual" schedule label', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    fakeDeltaSync.getSyncStatus.mockReturnValue({
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      totalCves: 0,
      syncDurationMs: null,
      lastError: null,
      nextScheduledSync: null,
      autoSyncEnabled: false,
      autoSyncIntervalHours: 0,
      bandwidthLimitKBps: 250,
    })
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app).get('/api/database/config/sync')

    expect(res.body).toEqual({ success: true, config: { syncInterval: 'manual', bandwidthLimitKBps: 250 } })
  })

  it('maps a 24-hour interval to the "daily" schedule label', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    fakeDeltaSync.getSyncStatus.mockReturnValue({
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      totalCves: 0,
      syncDurationMs: null,
      lastError: null,
      nextScheduledSync: null,
      autoSyncEnabled: true,
      autoSyncIntervalHours: 24,
      bandwidthLimitKBps: 0,
    })
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app).get('/api/database/config/sync')

    expect(res.body.config.syncInterval).toBe('daily')
  })

  it('maps a 720-hour interval to the "monthly" schedule label', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    fakeDeltaSync.getSyncStatus.mockReturnValue({
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      totalCves: 0,
      syncDurationMs: null,
      lastError: null,
      nextScheduledSync: null,
      autoSyncEnabled: true,
      autoSyncIntervalHours: 720,
      bandwidthLimitKBps: 0,
    })
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app).get('/api/database/config/sync')

    expect(res.body.config.syncInterval).toBe('monthly')
  })

  it('reports an error instead of throwing when reading the sync config fails', async () => {
    initializeMocks.getDeltaSync.mockImplementation(() => {
      throw new Error('delta sync accessor failed')
    })

    const res = await request(app).get('/api/database/config/sync')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'delta sync accessor failed' })
  })
})

describe('PUT /api/database/config/sync', () => {
  // No longer a no-op: it validates the requested schedule BEFORE any DB access, then persists it
  // via the delta-sync service (nvdDeltaSync.setAutoSyncInterval). Here the DB is not initialized,
  // so a *valid* request takes the graceful success:false fallback instead of crashing; an unknown
  // value is rejected by the input-validation contract regardless of DB state. The real round-trip
  // (set 'monthly' → reload → 'monthly') is covered by the e2e database-settings persistence spec.
  it('rejects an unknown sync interval before touching the DB', async () => {
    const res = await request(app).put('/api/database/config/sync').send({ syncInterval: 'yearly' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/invalid syncInterval/i)
  })

  it('reports the service is unavailable when delta sync is not initialized', async () => {
    const res = await request(app).put('/api/database/config/sync').send({ syncInterval: 'monthly' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Sync service not initialized' })
  })

  it('rejects a negative bandwidth limit before touching the DB (FR-10.3)', async () => {
    // A negative cap is nonsensical and would make computeThrottleDelayMs misbehave;
    // reject it up front, same as an unknown syncInterval.
    const res = await request(app).put('/api/database/config/sync').send({ bandwidthLimitKBps: -1 })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toMatch(/invalid bandwidthLimitKBps/i)
  })

  it('accepts a bandwidth-only update with no syncInterval (FR-10.3)', async () => {
    // The Settings bandwidth input sends ONLY bandwidthLimitKBps; syncInterval must
    // no longer be mandatory. A valid value passes validation and reaches the persist
    // step, which here takes the graceful not-initialized fallback.
    const res = await request(app).put('/api/database/config/sync').send({ bandwidthLimitKBps: 500 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Sync service not initialized' })
  })

  it('applies a valid syncInterval and bandwidth limit to the delta-sync service', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app)
      .put('/api/database/config/sync')
      .send({ syncInterval: 'daily', bandwidthLimitKBps: 500 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(fakeDeltaSync.setAutoSyncInterval).toHaveBeenCalledWith(24)
    expect(fakeDeltaSync.setBandwidthLimitKBps).toHaveBeenCalledWith(500)
  })

  it('does not touch the bandwidth limit when only syncInterval is supplied', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    await request(app).put('/api/database/config/sync').send({ syncInterval: 'weekly' })

    expect(fakeDeltaSync.setAutoSyncInterval).toHaveBeenCalledWith(168)
    expect(fakeDeltaSync.setBandwidthLimitKBps).not.toHaveBeenCalled()
  })

  it('reports an error instead of throwing when persisting the sync config fails', async () => {
    const fakeDeltaSync = createFakeDeltaSync()
    fakeDeltaSync.setAutoSyncInterval.mockImplementation(() => {
      throw new Error('persist failed')
    })
    initializeMocks.getDeltaSync.mockReturnValue(fakeDeltaSync)

    const res = await request(app).put('/api/database/config/sync').send({ syncInterval: 'daily' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'persist failed' })
  })
})

describe('PUT /api/database/config/storage', () => {
  // Validation runs before any DB access — a malformed field is rejected regardless of DB state.
  it('rejects an invalid maxSizeMB before touching the DB', async () => {
    const res = await request(app).put('/api/database/config/storage').send({ maxSizeMB: -5 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Invalid maxSizeMB' })
  })

  it('rejects a non-boolean pruneOldCves before touching the DB', async () => {
    const res = await request(app).put('/api/database/config/storage').send({ pruneOldCves: 'yes' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Invalid pruneOldCves' })
  })

  it('rejects a non-integer pruneOlderThanYear before touching the DB', async () => {
    const res = await request(app).put('/api/database/config/storage').send({ pruneOlderThanYear: 2020.5 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Invalid pruneOlderThanYear' })
  })

  // No longer a no-op: a valid body persists via the settings table, so with no initialized DB it
  // takes the graceful not-ready fallback instead of a fake success. The real persist+prune
  // round-trip is covered by server/database/settingsStore.test.ts against a migrated in-memory DB.
  it('reports not-initialized for a valid update when the DB is not ready', async () => {
    const res = await request(app).put('/api/database/config/storage').send({ maxSizeMB: 100 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })

  it('merges a partial update over the existing stored config instead of wiping other fields', async () => {
    // WHY: the Settings UI saves one field at a time; a naive overwrite would silently drop
    // whatever was set earlier (H1).
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    await request(app).put('/api/database/config/storage').send({ maxSizeMB: 200 }).expect(200)

    await request(app).put('/api/database/config/storage').send({ pruneOldCves: false }).expect(200)

    expect(getStorageConfig(rawDb)).toEqual({ maxSizeMB: 200, pruneOldCves: false })
  })

  it('immediately prunes CVEs older than the configured year and reports how many were removed', async () => {
    insertCve(rawDb, 'CVE-2015-0001', 2015)
    insertCve(rawDb, 'CVE-2026-0001', 2026)
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app)
      .put('/api/database/config/storage')
      .send({ pruneOldCves: true, pruneOlderThanYear: 2020 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, pruned: 1 })
    const remaining = rawDb.prepare('SELECT id FROM cves').all()
    expect(remaining).toEqual([{ id: 'CVE-2026-0001' }])
  })

  it('reports an error instead of throwing when the storage config update fails', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    rawDb.close() // force a realistic SQLite failure: "The database connection is not open"

    const res = await request(app).put('/api/database/config/storage').send({ maxSizeMB: 50 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBeTruthy()
  })
})

describe('PUT /api/database/config/perf', () => {
  it('rejects an invalid searchResultLimit before touching the DB', async () => {
    const res = await request(app).put('/api/database/config/perf').send({ searchResultLimit: 0 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Invalid searchResultLimit' })
  })

  it('rejects a non-boolean enableSearchCache before touching the DB', async () => {
    const res = await request(app).put('/api/database/config/perf').send({ enableSearchCache: 'nope' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Invalid enableSearchCache' })
  })

  it('rejects a non-positive cacheSizeMB before touching the DB', async () => {
    const res = await request(app).put('/api/database/config/perf').send({ cacheSizeMB: 0 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Invalid cacheSizeMB' })
  })

  it('rejects a non-positive cacheTTLMinutes before touching the DB', async () => {
    const res = await request(app).put('/api/database/config/perf').send({ cacheTTLMinutes: -5 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Invalid cacheTTLMinutes' })
  })

  it('reports not-initialized for a valid update when the DB is not ready', async () => {
    const res = await request(app).put('/api/database/config/perf').send({ searchResultLimit: 50 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })

  it('reports an error instead of throwing when persisting the perf config fails', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    rawDb.close() // force a realistic SQLite failure: "The database connection is not open"

    const res = await request(app).put('/api/database/config/perf').send({ searchResultLimit: 50 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBeTruthy()
  })

  // This test intentionally runs LAST for this endpoint: a successful update mutates the router's
  // module-level searchResultLimit/searchCacheEnabled runtime state, which (by design — see
  // applyPerfConfig) is never reset between requests. No test in this file after this one may
  // assume the default (unclamped, cache-enabled) /search behavior; none do (nothing later calls
  // /search).
  it('persists and applies every field (floored searchResultLimit included) when the database is initialized', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).put('/api/database/config/perf').send({
      searchResultLimit: 50.9,
      enableSearchCache: false,
      cacheSizeMB: 10,
      cacheTTLMinutes: 5,
    })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(getPerfConfig(rawDb)).toEqual({
      searchResultLimit: 50,
      enableSearchCache: false,
      cacheSizeMB: 10,
      cacheTTLMinutes: 5,
    })
  })
})

describe('POST /api/database/search — server-side result cap set by PUT /config/perf', () => {
  // WHY: a saved searchResultLimit is meaningless unless /search actually enforces it. This block
  // deliberately runs AFTER the PUT /config/perf tests above, whose last test already set the
  // runtime cap to 50 (see that test's own comment) — exactly the state these tests rely on.
  it('clamps an unbounded search request down to the configured server-side cap', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByText.mockReturnValue([])
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app).post('/api/database/search').send({ type: 'text', query: 'cap-test-unbounded' })

    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(50)
    expect(fakeDb.searchCVEsByText).toHaveBeenCalledWith('cap-test-unbounded', 50, 0)
  })

  it('clamps a request whose explicit limit exceeds the configured cap', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByText.mockReturnValue([])
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app)
      .post('/api/database/search')
      .send({ type: 'text', query: 'cap-test-over', limit: 200 })

    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(50)
    expect(fakeDb.searchCVEsByText).toHaveBeenCalledWith('cap-test-over', 50, 0)
  })

  it('leaves a request already under the configured cap unclamped', async () => {
    const fakeDb = createFakeDatabase(rawDb)
    fakeDb.searchCVEsByText.mockReturnValue([])
    initializeMocks.getDb.mockReturnValue(fakeDb)

    const res = await request(app)
      .post('/api/database/search')
      .send({ type: 'text', query: 'cap-test-under', limit: 10 })

    expect(res.status).toBe(200)
    expect(res.body.limit).toBe(10)
    expect(fakeDb.searchCVEsByText).toHaveBeenCalledWith('cap-test-under', 10, 0)
  })
})

describe('POST /api/database/reset', () => {
  // Destructive operation — must refuse gracefully rather than throw when there is no DB to reset.
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).post('/api/database/reset')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })

  it('actually deletes existing CVE and related rows, not just a no-op success', async () => {
    insertCve(rawDb, 'CVE-2024-70001', 2024)
    rawDb.prepare('INSERT INTO cwe_references (cve_id, cwe_id) VALUES (?, ?)').run('CVE-2024-70001', 'CWE-79')
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/reset')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(rawDb.prepare('SELECT COUNT(*) AS n FROM cves').get()).toEqual({ n: 0 })
    expect(rawDb.prepare('SELECT COUNT(*) AS n FROM cwe_references').get()).toEqual({ n: 0 })
  })

  it('reports an error instead of throwing when the reset deletes fail', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    rawDb.close()

    const res = await request(app).post('/api/database/reset')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBeTruthy()
  })
})

describe('POST /api/database/rebuild', () => {
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).post('/api/database/rebuild')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })

  it('reports the raw-database-unavailable message when the database wrapper has no connection', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(null))

    const res = await request(app).post('/api/database/rebuild')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'FTS rebuild failed (database not available)' })
  })

  // NOTE: the "cves_fts doesn't exist yet, so create it" branch is not covered here. Migration 7
  // (fts5_search) already creates cves_fts as part of runMigrations, so a genuinely fresh database
  // in this harness always has it; reproducing "missing" by dropping the external-content FTS5
  // table on the same live connection reliably corrupts it ("database disk image is malformed") —
  // a SQLite/FTS5 shadow-table artifact of the test environment, not a bug in this handler. In a
  // real (migrated) database this branch is effectively dead code, so it's left uncovered rather
  // than contorted around.
  it('re-populates an already-existing FTS5 index without trying to recreate it', async () => {
    insertCve(rawDb, 'CVE-2024-80002', 2024)
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/rebuild')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    const indexed = rawDb.prepare('SELECT id FROM cves_fts').all()
    expect(indexed).toEqual([{ id: 'CVE-2024-80002' }])
  })

  it('reports an error instead of throwing when getDb() itself throws', async () => {
    initializeMocks.getDb.mockImplementation(() => {
      throw new Error('getDb accessor failed')
    })

    const res = await request(app).post('/api/database/rebuild')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'getDb accessor failed' })
  })

  it('surfaces the FTS rebuild failure instead of reporting success when the SQL fails', async () => {
    // WHY: the handler explicitly captures and reports this failure rather than swallowing it
    // (see the code comment) — drop the source table so the rebuild's INSERT...SELECT throws.
    rawDb.exec('DROP TABLE cves')
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/rebuild')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toContain('no such table')
  })
})

describe('POST /api/database/fts/search', () => {
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).post('/api/database/fts/search').send({ query: 'lodash' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })

  it('reports the raw-database-unavailable message when the wrapper has no connection', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(null))

    const res = await request(app).post('/api/database/fts/search').send({ query: 'lodash' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Raw database not available' })
  })

  it('reports the index-not-available message when the FTS5 table has not been built yet', async () => {
    // Migration 7 (fts5_search) creates cves_fts as part of runMigrations, so simulate a
    // pre-migration-7 database by dropping it back out.
    rawDb.exec('DROP TABLE cves_fts')
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/fts/search').send({ query: 'lodash' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'FTS index not available' })
  })

  it('returns matching CVE ids ranked by relevance once the FTS5 index exists', async () => {
    // cves_fts already exists post-migration, and its AFTER INSERT trigger keeps it in sync, so
    // inserting into cves is enough — no separate index population needed.
    insertCve(rawDb, 'CVE-2024-90001', 2024)
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/fts/search').send({ query: 'test' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.results).toEqual([{ id: 'CVE-2024-90001', rank: expect.any(Number) }])
  })

  it('reports an error instead of throwing when the FTS5 query syntax is invalid', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/fts/search').send({ query: '"' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBeTruthy()
  })
})

describe('GET /api/database/fts/stats', () => {
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).get('/api/database/fts/stats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })

  it('reports the raw-database-unavailable message when the wrapper has no connection', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(null))

    const res = await request(app).get('/api/database/fts/stats')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Raw database not available' })
  })

  it('returns indexed/total counts once the FTS5 index exists', async () => {
    // cves_fts already exists post-migration and its AFTER INSERT trigger keeps it in sync.
    insertCve(rawDb, 'CVE-2024-91001', 2024)
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).get('/api/database/fts/stats')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, stats: { indexedCount: 1, totalCount: 1 } })
  })

  it('reports an error instead of throwing when the FTS5 table does not exist yet', async () => {
    // Migration 7 (fts5_search) creates cves_fts as part of runMigrations, so simulate a
    // pre-migration-7 database by dropping it back out.
    rawDb.exec('DROP TABLE cves_fts')
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).get('/api/database/fts/stats')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toContain('no such table')
  })
})

describe('GET /api/database/cache/stats', () => {
  // The response cache is a standalone singleton that doesn't depend on the NVD DB — this must
  // report real (if empty) stats rather than an error.
  it('returns real cache statistics from the search-response cache', async () => {
    const res = await request(app).get('/api/database/cache/stats')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // Reports the real QueryCache stats (hits/misses/size), not the never-initialized
    // CacheManager's all-zero placeholder. Assert the numeric shape rather than exact values,
    // since the response cache is shared across this file's requests.
    expect(typeof res.body.stats.hits).toBe('number')
    expect(typeof res.body.stats.misses).toBe('number')
    expect(typeof res.body.stats.size).toBe('number')
  })
})

describe('POST /api/database/cache/clear', () => {
  it('clears the cache and reports success', async () => {
    const res = await request(app).post('/api/database/cache/clear')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })
})

describe('GET /api/database/download/queue', () => {
  // Static stub endpoint — pinning its shape so a future real download queue can't change it
  // without a visible test failure.
  it('returns an empty queue', async () => {
    const res = await request(app).get('/api/database/download/queue')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, queue: [] })
  })

  it('returns queued download entries from the real download_queue table once initialized', async () => {
    rawDb.prepare(`INSERT INTO download_queue (year, status) VALUES (2024, 'pending')`).run()
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).get('/api/database/download/queue')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.queue).toHaveLength(1)
    expect(res.body.queue[0]).toMatchObject({ year: 2024, status: 'pending' })
  })

  it('reports an error instead of throwing when reading the queue fails', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    rawDb.close() // force a realistic SQLite failure: "The database connection is not open"

    const res = await request(app).get('/api/database/download/queue')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBeTruthy()
  })
})

describe('POST /api/database/download/clear', () => {
  it('reports success', async () => {
    const res = await request(app).post('/api/database/download/clear')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })

  it('empties a non-empty download queue once initialized', async () => {
    rawDb.prepare(`INSERT INTO download_queue (year, status) VALUES (2024, 'pending')`).run()
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))

    const res = await request(app).post('/api/database/download/clear')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
    expect(rawDb.prepare('SELECT COUNT(*) AS n FROM download_queue').get()).toEqual({ n: 0 })
  })

  it('reports an error instead of throwing when clearing the queue fails', async () => {
    initializeMocks.getDb.mockReturnValue(createFakeDatabase(rawDb))
    rawDb.close() // force a realistic SQLite failure: "The database connection is not open"

    const res = await request(app).post('/api/database/download/clear')

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBeTruthy()
  })
})
