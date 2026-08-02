import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { rmSync } from 'node:fs'
import type { Express } from 'express'
import { createTestApp } from '../test-utils/testApp'
import { resetSyncStateForTests } from './database.js'
import { importNvdData } from '../database/nvd/index.js'
import type { NvdImportResult } from '../database/nvd/index.js'

// Integration tests for /api/database (NFR-08 — every API endpoint covered). createTestApp()
// builds the real Express app but never calls initializeDatabase(), so getDb() / getDeltaSync() /
// getCpeSearch() resolve to null for the lifetime of this file — exactly the "DB not ready" state
// the route-level task guidance calls out. That means every DB-backed handler below takes its
// not-initialized branch; these tests pin (a) the input-validation contract that runs BEFORE any
// DB access ever happens, and (b) the graceful `success: false` fallback the renderer depends on
// instead of a 500/crash when the DB genuinely isn't ready yet. importNvdData is mocked so
// POST /sync/start never reaches the real network — it is the one handler that kicks off real
// work without first checking DB readiness.
vi.mock('../database/nvd/index.js', () => ({
  importNvdData: vi.fn(),
  getAvailableNvdYears: vi.fn((start: number, end: number) => {
    const years: number[] = []
    for (let year = start; year <= end; year++) years.push(year)
    return years
  }),
}))

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

let app: Express
let dataDir: string

beforeAll(async () => {
  // /api/database sits behind the default rate limiter (60 req/min/IP), and this file drives ~30
  // requests against it from a single test process/IP. Raise the cap for this controlled run —
  // same rationale and pattern as server/routes/storage.test.ts.
  process.env.RATE_LIMIT_MAX = '1000000'
  ;({ app, dataDir } = await createTestApp())
})

afterAll(() => {
  delete process.env.RATE_LIMIT_MAX
  rmSync(dataDir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(importNvdData).mockReset()
  vi.mocked(importNvdData).mockResolvedValue(mockImportResult)
})

afterEach(() => {
  // /sync/start and /sync/delta share a module-level `syncState` flag that outlives any single
  // request (only flipped back by callbacks the mocked importNvdData never invokes). /sync/cancel
  // now (correctly) refuses to clear a full/bulk sync, so reset directly via the test-only hook so
  // a test that leaves it `true` can never leak into an unrelated later test.
  resetSyncStateForTests()
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
})

describe('GET /api/database/stats/detailed', () => {
  // Same not-ready contract as /stats, but for the detailed dashboard view.
  it('reports not-initialized instead of throwing', async () => {
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
      validateChecksums: true,
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
})

describe('POST /api/database/sync/cancel', () => {
  // Must always succeed, even with no delta-sync engine and nothing in progress — the "cancel"
  // button in the UI can't be allowed to error out.
  it('succeeds even when nothing is syncing', async () => {
    const res = await request(app).post('/api/database/sync/cancel')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })
})

describe('POST /api/database/sync/bulk', () => {
  // The handler checks getDb() before anything else (including the API-key lookup), so in this
  // harness "database not initialized" is the only reachable branch. Covering the "no API key"
  // validation branch would require a real initialized DB, which is out of scope per the task's
  // "no seeded data" constraint — noted as a gap, not faked.
  it('reports not-initialized instead of attempting a download', async () => {
    const res = await request(app).post('/api/database/sync/bulk').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
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
})

describe('PUT /api/database/config/storage', () => {
  it('accepts a storage config update', async () => {
    const res = await request(app).put('/api/database/config/storage').send({ maxSizeMB: 100 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })
})

describe('PUT /api/database/config/perf', () => {
  it('accepts a performance config update', async () => {
    const res = await request(app).put('/api/database/config/perf').send({ searchResultLimit: 50 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })
})

describe('POST /api/database/reset', () => {
  // Destructive operation — must refuse gracefully rather than throw when there is no DB to reset.
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).post('/api/database/reset')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })
})

describe('POST /api/database/rebuild', () => {
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).post('/api/database/rebuild')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })
})

describe('POST /api/database/fts/search', () => {
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).post('/api/database/fts/search').send({ query: 'lodash' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
  })
})

describe('GET /api/database/fts/stats', () => {
  it('reports not-initialized instead of throwing', async () => {
    const res = await request(app).get('/api/database/fts/stats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, error: 'Database not initialized' })
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
})

describe('POST /api/database/download/clear', () => {
  it('reports success', async () => {
    const res = await request(app).post('/api/database/download/clear')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true })
  })
})
