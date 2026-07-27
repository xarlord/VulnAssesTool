import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import type { Express } from 'express'
import { createTestApp } from '../test-utils/testApp'
import { getKevService, resetKevService } from '../services/intelligence/KevService'
import { getEpssService, resetEpssService } from '../services/intelligence/EpssService'

// Integration tests for /api/intelligence (NFR-08 — every API endpoint covered). Every handler in
// this router is `try { call KevService/EpssService } catch { success:false }` with no HTTP status
// mapping — unlike /api/osv, this route always answers 200 and encodes failure in the JSON body.
// These tests pin that contract, plus the two real external calls the services make underneath
// (the CISA KEV feed and the first.org EPSS API), both mocked via global.fetch per the pattern in
// server/routes/osv.test.ts so nothing here touches the network.
//
// KevService/EpssService are lazy singletons normally wired to the shared NVD database at server
// startup (server/database/initialize.ts calls getKevService(rawDb) — but nothing in production
// ever calls getEpssService(db), a real gap: every /api/intelligence/epss/* call throws "EpssService
// not initialized" today). To exercise the real success paths we initialize both singletons here
// against a throwaway in-memory DB before any request reaches the router's no-arg getters.

let app: Express
let dataDir: string
let db: InstanceType<typeof Database>

beforeAll(async () => {
  ;({ app, dataDir } = await createTestApp())

  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE cves (
      id TEXT PRIMARY KEY,
      is_kev INTEGER DEFAULT 0,
      epss_score REAL,
      epss_percentile REAL,
      epss_updated_at TEXT
    )
  `)
  db.exec(`
    CREATE TABLE kev_catalog (
      cve_id TEXT PRIMARY KEY,
      vendor_project TEXT,
      product TEXT,
      vulnerability_name TEXT,
      date_added TEXT NOT NULL,
      short_description TEXT,
      required_action TEXT,
      due_date TEXT,
      known_ransomware_use INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  // Wire the module-level singletons the router reaches via getKevService()/getEpssService()
  // with no arguments — see comment above on why this is required for the success paths.
  getKevService(db)
  getEpssService(db)
})

afterAll(() => {
  resetKevService()
  resetEpssService()
  db.close()
  rmSync(dataDir, { recursive: true, force: true })
})

beforeEach(() => {
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function insertKevEntry(cveId: string, knownRansomwareUse: boolean): void {
  db.prepare(
    `INSERT INTO kev_catalog (cve_id, vendor_project, product, vulnerability_name, date_added,
      short_description, required_action, due_date, known_ransomware_use, notes)
     VALUES (?, 'Vendor', 'Product', 'Vuln name', '2024-01-01', 'desc', 'action', '2024-02-01', ?, NULL)`,
  ).run(cveId, knownRansomwareUse ? 1 : 0)
}

function insertCachedEpssScore(cveId: string, score: number, percentile: number, updatedAt: string): void {
  db.prepare('INSERT INTO cves (id, epss_score, epss_percentile, epss_updated_at) VALUES (?, ?, ?, ?)').run(
    cveId,
    score,
    percentile,
    updatedAt,
  )
}

describe('POST /api/intelligence/kev/check', () => {
  // Drives the KEV badge shown throughout the UI — a CVE actually in the catalog must report
  // true, one that isn't must report false, and neither case may throw.
  it('reports true for a CVE seeded in the KEV catalog', async () => {
    insertKevEntry('CVE-2024-1709', true)
    const res = await request(app).post('/api/intelligence/kev/check').send({ cveId: 'CVE-2024-1709' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, isKev: true })
  })

  it('reports false for a CVE that is not in the catalog', async () => {
    const res = await request(app).post('/api/intelligence/kev/check').send({ cveId: 'CVE-0000-0000' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, isKev: false })
  })

  // The handler never validates req.body.cveId; a malformed (non-string) value must still degrade
  // to a graceful success:false JSON response rather than crashing the request.
  it('degrades gracefully (success:false) when cveId is not a string', async () => {
    const res = await request(app)
      .post('/api/intelligence/kev/check')
      .send({ cveId: { bad: true } })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.isKev).toBe(false)
    expect(typeof res.body.error).toBe('string')
  })
})

describe('POST /api/intelligence/kev/details', () => {
  // Pins the full-entry lookup used by the vulnerability detail modal: found vs. not-found must
  // be distinguishable (entry object vs. entry:null), both under success:true.
  it('returns the full KEV entry for a seeded CVE', async () => {
    insertKevEntry('CVE-2024-27198', true)
    const res = await request(app).post('/api/intelligence/kev/details').send({ cveId: 'CVE-2024-27198' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.entry).toMatchObject({ cveId: 'CVE-2024-27198', knownRansomwareUse: true })
  })

  it('returns entry:null for a CVE that is not in the catalog', async () => {
    const res = await request(app).post('/api/intelligence/kev/details').send({ cveId: 'CVE-0000-0001' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, entry: null })
  })

  it('degrades gracefully when cveId is not a string', async () => {
    const res = await request(app)
      .post('/api/intelligence/kev/details')
      .send({ cveId: { bad: true } })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.entry).toBeNull()
  })
})

describe('GET /api/intelligence/kev/stats', () => {
  // Powers the KEV summary tile — the totals must move exactly by what was seeded, so this
  // asserts a delta rather than an absolute count (robust to fixture rows from other tests).
  it('reflects catalog counts, including ransomware-related entries', async () => {
    const before = await request(app).get('/api/intelligence/kev/stats')
    const baseTotal = before.body.stats.total
    const baseRansomware = before.body.stats.ransomwareRelated

    insertKevEntry('CVE-3000-0001', true)
    insertKevEntry('CVE-3000-0002', false)

    const res = await request(app).get('/api/intelligence/kev/stats')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.stats.total).toBe(baseTotal + 2)
    expect(res.body.stats.ransomwareRelated).toBe(baseRansomware + 1)
  })

  // If getCatalogStats throws (e.g. DB unavailable), the route must still answer with the
  // documented zero-value shape instead of an unhandled rejection.
  it('degrades gracefully when the service throws', async () => {
    const kevService = getKevService()
    vi.spyOn(kevService, 'getCatalogStats').mockImplementation(() => {
      throw new Error('db unavailable')
    })
    const res = await request(app).get('/api/intelligence/kev/stats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      stats: { total: 0, ransomwareRelated: 0, lastUpdated: null },
      error: 'db unavailable',
    })
  })
})

describe('POST /api/intelligence/kev/sync', () => {
  // The only endpoint that reaches the network directly (via KevService.syncFromCisa) — proves
  // a mocked CISA payload is imported and the diff is reported back to the caller.
  it('imports the mocked CISA catalog and reports the diff', async () => {
    const catalogJson = {
      title: 'CISA KEV',
      catalogVersion: '2026.1',
      dateReleased: '2026-07-01',
      count: 1,
      vulnerabilities: [
        {
          cveID: 'CVE-9999-0001',
          vendorProject: 'Acme',
          product: 'Widget',
          vulnerabilityName: 'Acme Widget RCE',
          dateAdded: '2026-07-01',
          shortDescription: 'desc',
          requiredAction: 'patch',
          dueDate: '2026-07-21',
          knownRansomwareCampaignUse: 'Known',
          notes: '',
        },
      ],
    }
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => catalogJson,
    } as unknown as Response)

    const res = await request(app).post('/api/intelligence/kev/sync')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.result.success).toBe(true)
    expect(res.body.result.added).toBe(1)

    const row = db.prepare('SELECT cve_id FROM kev_catalog WHERE cve_id = ?').get('CVE-9999-0001')
    expect(row).toBeDefined()
  })

  // KevService.syncFromCisa catches its own fetch errors and resolves to a {success:false}
  // *result* rather than rejecting — so the outer route response stays success:true even though
  // the sync itself failed. This pins that real (if surprising) contract so a refactor can't
  // silently flip it to a 5xx without a test noticing.
  it('reports the sync failure inside result when the CISA fetch rejects', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    const res = await request(app).post('/api/intelligence/kev/sync')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.result.success).toBe(false)
    expect(res.body.result.error).toContain('network down')
  })
})

describe('POST /api/intelligence/epss/score', () => {
  // Cache-miss path: no cached row for the CVE forces a call through to the (mocked) first.org
  // EPSS API, and the parsed score must reach the caller.
  it('fetches and returns a fresh score when there is no cache entry', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        data: [{ cve: 'CVE-8000-0001', epss: '0.42', percentile: '0.77', date: '2026-07-01' }],
      }),
    } as unknown as Response)

    const res = await request(app).post('/api/intelligence/epss/score').send({ cveId: 'CVE-8000-0001' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.score).toMatchObject({ cveId: 'CVE-8000-0001', score: 0.42, percentile: 0.77 })
  })

  // EpssService swallows fetch failures internally and resolves to null rather than rejecting,
  // so the route — which only catches thrown errors — must still answer success:true with a null
  // score. This is the real "upstream down" behaviour: degrade, don't 5xx.
  it('resolves to a null score (not an error) when the EPSS API is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    const res = await request(app).post('/api/intelligence/epss/score').send({ cveId: 'CVE-8000-0002' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: true, score: null })
  })

  // A non-string cveId breaks the cache lookup's bound parameter before fetch is ever reached —
  // the route must still answer gracefully, and upstream must not be called with garbage input.
  it('degrades gracefully when cveId is not a string', async () => {
    const res = await request(app)
      .post('/api/intelligence/epss/score')
      .send({ cveId: { bad: true } })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.score).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('POST /api/intelligence/epss/scores', () => {
  // Batch lookup used by the vulnerabilities table — verifies the upstream response is correctly
  // assembled into a map keyed by CVE id.
  it('batches the upstream lookup and returns a map keyed by CVE id', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        data: [
          { cve: 'CVE-8100-0001', epss: '0.1', percentile: '0.2', date: '2026-07-01' },
          { cve: 'CVE-8100-0002', epss: '0.3', percentile: '0.4', date: '2026-07-01' },
        ],
      }),
    } as unknown as Response)

    const res = await request(app)
      .post('/api/intelligence/epss/scores')
      .send({ cveIds: ['CVE-8100-0001', 'CVE-8100-0002'] })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Object.keys(res.body.scores).sort()).toEqual(['CVE-8100-0001', 'CVE-8100-0002'])
    expect(res.body.scores['CVE-8100-0001']).toMatchObject({ score: 0.1, percentile: 0.2 })
  })

  // req.body.cveIds is cast to string[] with no runtime check; a missing/non-array value makes
  // the service's for-of loop throw ("not iterable"), which the route must still turn into a
  // graceful success:false response instead of an unhandled 500.
  it('degrades gracefully when cveIds is missing (not an array)', async () => {
    const res = await request(app).post('/api/intelligence/epss/scores').send({})
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.scores).toEqual({})
    expect(typeof res.body.error).toBe('string')
    expect(res.body.error).toContain('iterable')
  })
})

describe('POST /api/intelligence/epss/refresh', () => {
  // Force-refresh must bypass whatever is cached and return the newly fetched value — proven by
  // seeding a different stale score first and asserting the response reflects the fresh mock.
  it('bypasses the cache and returns the freshly fetched score', async () => {
    insertCachedEpssScore('CVE-8200-0001', 0.9, 0.95, new Date().toISOString())
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'OK',
        data: [{ cve: 'CVE-8200-0001', epss: '0.05', percentile: '0.11', date: '2026-07-01' }],
      }),
    } as unknown as Response)

    const res = await request(app).post('/api/intelligence/epss/refresh').send({ cveId: 'CVE-8200-0001' })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.score).toMatchObject({ cveId: 'CVE-8200-0001', score: 0.05, percentile: 0.11 })
  })

  // The cache-clearing UPDATE runs before any fetch — a non-string cveId must fail that bound
  // parameter gracefully rather than crash the request.
  it('degrades gracefully when cveId is not a string', async () => {
    const res = await request(app)
      .post('/api/intelligence/epss/refresh')
      .send({ cveId: { bad: true } })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(false)
    expect(res.body.score).toBeNull()
  })
})

describe('GET /api/intelligence/epss/stats', () => {
  // Powers the EPSS summary tile — asserts the cached-score aggregate moves by exactly what was
  // seeded (delta-based, robust to rows left by other tests sharing this in-memory DB).
  it('reflects the cached-score aggregate', async () => {
    const before = await request(app).get('/api/intelligence/epss/stats')
    const baseCount = before.body.stats.cachedCount

    insertCachedEpssScore('CVE-8300-0001', 0.6, 0.7, new Date().toISOString())

    const res = await request(app).get('/api/intelligence/epss/stats')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.stats.cachedCount).toBe(baseCount + 1)
  })

  // If getStats throws, the route must still answer with the documented zero-value shape instead
  // of an unhandled rejection.
  it('degrades gracefully when the service throws', async () => {
    const epssService = getEpssService()
    vi.spyOn(epssService, 'getStats').mockImplementation(() => {
      throw new Error('db unavailable')
    })
    const res = await request(app).get('/api/intelligence/epss/stats')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      success: false,
      stats: { cachedCount: 0, avgScore: 0, avgPercentile: 0 },
      error: 'db unavailable',
    })
  })
})

describe('POST /api/intelligence/epss/cleanup', () => {
  // Scheduled cache eviction — an entry older than the 24h TTL must be cleared and counted.
  it('clears cache entries older than the TTL and reports how many', async () => {
    const expired = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // TTL is 24h
    insertCachedEpssScore('CVE-8400-0001', 0.5, 0.5, expired)

    const res = await request(app).post('/api/intelligence/epss/cleanup')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.cleanedCount).toBeGreaterThanOrEqual(1)

    const row = db.prepare('SELECT epss_score FROM cves WHERE id = ?').get('CVE-8400-0001') as {
      epss_score: number | null
    }
    expect(row.epss_score).toBeNull()
  })

  // If cleanupCache rejects, the route must still answer with the documented zero-count shape
  // instead of an unhandled rejection.
  it('degrades gracefully when the service throws', async () => {
    const epssService = getEpssService()
    vi.spyOn(epssService, 'cleanupCache').mockRejectedValue(new Error('db unavailable'))
    const res = await request(app).post('/api/intelligence/epss/cleanup')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ success: false, cleanedCount: 0, error: 'db unavailable' })
  })
})
