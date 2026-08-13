/**
 * Unit tests for EpssService.
 *
 * Focus: cache hit/miss/expiry branches, API error/validation branches, batching,
 * rate-limit scheduling, and the singleton accessor guards.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { EpssService, getEpssService, resetEpssService } from './EpssService.js'

function makeDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE cves (
      id TEXT PRIMARY KEY,
      epss_score REAL,
      epss_percentile REAL,
      epss_updated_at TEXT
    );
  `)
  return db
}

/** Seed a cves row so cacheScore's UPDATE (no INSERT) has something to land on. */
function seedCve(
  db: InstanceType<typeof Database>,
  id: string,
  fields: { score?: number | null; percentile?: number | null; updatedAt?: string | null } = {},
): void {
  db.prepare('INSERT INTO cves (id, epss_score, epss_percentile, epss_updated_at) VALUES (?, ?, ?, ?)').run(
    id,
    fields.score ?? null,
    fields.percentile ?? null,
    fields.updatedAt ?? null,
  )
}

function epssApiResponse(entries: Array<{ cve: string; epss: string; percentile: string }>): unknown {
  return {
    status: 'OK',
    data: entries.map((e) => ({ ...e, date: '2099-01-01' })),
  }
}

/** Queue of fetch responses, consumed in order — one per call to global fetch. */
function mockFetchQueue(
  impls: Array<() => { ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }>,
): ReturnType<typeof vi.fn> {
  const fn = vi.fn()
  for (const impl of impls) {
    fn.mockImplementationOnce(async () => impl())
  }
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('EpssService', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    db.close()
    resetEpssService()
  })

  describe('getEpssScore', () => {
    it('returns the cached score without calling the API when a fresh entry exists', async () => {
      seedCve(db, 'CVE-2024-0001', { score: 0.42, percentile: 0.9, updatedAt: new Date().toISOString() })
      const fetchSpy = mockFetchQueue([])
      const service = new EpssService(db)

      const result = await service.getEpssScore('CVE-2024-0001')

      // WHY: a fresh cache hit must short-circuit — hitting the network here would defeat
      // the whole point of the 24h cache and needlessly hammer api.first.org.
      expect(result).toEqual({ cveId: 'CVE-2024-0001', score: 0.42, percentile: 0.9, fetchedAt: expect.any(Date) })
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('treats a CVE with no cves row at all as uncached and falls through to the API', async () => {
      // Deliberately no seedCve() call — the id is unknown to the cves table entirely,
      // exercising the "row missing" branch (distinct from "row present but null score").
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-9999', epss: '0.3', percentile: '0.3' }]),
        }),
      ])
      const service = new EpssService(db)

      const result = await service.getEpssScore('CVE-2024-9999')

      expect(result).toMatchObject({ score: 0.3 })
    })

    it('fetches and caches from the API on a cold cache (no row for this CVE)', async () => {
      seedCve(db, 'CVE-2024-0002')
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0002', epss: '0.5', percentile: '0.8' }]),
        }),
      ])
      const service = new EpssService(db)

      const result = await service.getEpssScore('CVE-2024-0002')

      expect(result).toMatchObject({ cveId: 'CVE-2024-0002', score: 0.5, percentile: 0.8 })
      // WHY: the fetched value must actually persist to the cves row — otherwise every
      // subsequent lookup re-hits the API even inside the 24h TTL window.
      const row = db.prepare('SELECT epss_score FROM cves WHERE id = ?').get('CVE-2024-0002') as {
        epss_score: number
      }
      expect(row.epss_score).toBe(0.5)
    })

    it('returns null (not a rejection) when the underlying fetch throws', async () => {
      seedCve(db, 'CVE-2024-0003')
      mockFetchQueue([
        () => {
          throw new Error('network down')
        },
      ])
      const service = new EpssService(db)

      const result = await service.getEpssScore('CVE-2024-0003')

      // WHY: a transient API/network failure for one CVE must not crash a caller that's
      // scanning a whole SBOM — it degrades to "no EPSS data" instead of throwing.
      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[EpssService] Failed to fetch EPSS for %s:',
        'CVE-2024-0003',
        expect.objectContaining({ message: 'network down' }),
      )
    })

    it('treats a cache row with null score fields as uncached and falls through to the API', async () => {
      // A row can exist (CVE known from a scan) without EPSS enrichment having run yet.
      seedCve(db, 'CVE-2024-0004', { score: null, percentile: null, updatedAt: null })
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0004', epss: '0.1', percentile: '0.2' }]),
        }),
      ])
      const service = new EpssService(db)

      const result = await service.getEpssScore('CVE-2024-0004')

      expect(result).toMatchObject({ score: 0.1, percentile: 0.2 })
    })

    it('treats an expired cache entry (older than cacheTtlHours) as a miss', async () => {
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25h ago > 24h TTL
      seedCve(db, 'CVE-2024-0005', { score: 0.11, percentile: 0.22, updatedAt: staleDate })
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0005', epss: '0.99', percentile: '0.99' }]),
        }),
      ])
      const service = new EpssService(db)

      const result = await service.getEpssScore('CVE-2024-0005')

      // WHY: proves the TTL check actually gates on age, not just presence — a stale score
      // (e.g. from before a vuln was patched upstream) must be refreshed, not served forever.
      expect(result).toMatchObject({ score: 0.99 })
    })

    it('treats a corrupt/unparseable epss_updated_at as expired (fail-open, not fail-forever)', async () => {
      seedCve(db, 'CVE-2024-0006', { score: 0.33, percentile: 0.44, updatedAt: 'not-a-real-date' })
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0006', epss: '0.77', percentile: '0.66' }]),
        }),
      ])
      const service = new EpssService(db)

      const result = await service.getEpssScore('CVE-2024-0006')

      // WHY: Date.parse('not-a-real-date') is NaN, and `NaN > ttlMs` is false — without the
      // explicit Number.isNaN guard, a corrupt timestamp would be (wrongly) read as "not expired"
      // and the bad row would serve stale data forever.
      expect(result).toMatchObject({ score: 0.77 })
    })
  })

  describe('getEpssScore — API error-shape branches', () => {
    it('surfaces the API-provided error message when status is not OK', async () => {
      seedCve(db, 'CVE-2024-0007')
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ status: 'ERROR', error: 'invalid cve format', data: [] }),
        }),
      ])
      const service = new EpssService(db)

      const result = await service.getEpssScore('CVE-2024-0007')

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[EpssService] Failed to fetch EPSS for %s:',
        'CVE-2024-0007',
        expect.objectContaining({ message: 'invalid cve format' }),
      )
    })

    it('falls back to a generic message when status is not OK and no error field is given', async () => {
      seedCve(db, 'CVE-2024-0008')
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ status: 'ERROR', data: [] }),
        }),
      ])
      const service = new EpssService(db)

      await service.getEpssScore('CVE-2024-0008')

      expect(console.error).toHaveBeenCalledWith(
        '[EpssService] Failed to fetch EPSS for %s:',
        'CVE-2024-0008',
        expect.objectContaining({ message: 'EPSS API returned error status' }),
      )
    })

    it('throws an HTTP-status error when the response is not ok', async () => {
      seedCve(db, 'CVE-2024-0009')
      mockFetchQueue([() => ({ ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({}) })])
      const service = new EpssService(db)

      await service.getEpssScore('CVE-2024-0009')

      expect(console.error).toHaveBeenCalledWith(
        '[EpssService] Failed to fetch EPSS for %s:',
        'CVE-2024-0009',
        expect.objectContaining({ message: 'HTTP 503: Service Unavailable' }),
      )
    })

    it('drops entries whose epss/percentile fail to parse as numbers instead of caching NaN', async () => {
      seedCve(db, 'CVE-2024-0010')
      seedCve(db, 'CVE-2024-0011')
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () =>
            epssApiResponse([
              { cve: 'CVE-2024-0010', epss: 'not-a-number', percentile: '0.5' },
              { cve: 'CVE-2024-0011', epss: '0.6', percentile: '0.7' },
            ]),
        }),
      ])
      const service = new EpssService(db)

      const results = await service.getEpssScores(['CVE-2024-0010', 'CVE-2024-0011'])

      // WHY: a malformed API entry must be silently skipped, not stored as NaN — a NaN score
      // would poison any downstream sort/threshold comparison against it.
      expect(results.has('CVE-2024-0010')).toBe(false)
      expect(results.get('CVE-2024-0011')).toMatchObject({ score: 0.6 })
      const row = db.prepare('SELECT epss_score FROM cves WHERE id = ?').get('CVE-2024-0010') as {
        epss_score: number | null
      }
      expect(row.epss_score).toBeNull()
    })
  })

  describe('getEpssScores (batch)', () => {
    it('returns immediately without calling the API when every CVE is already cached', async () => {
      seedCve(db, 'CVE-2024-0020', { score: 0.5, percentile: 0.5, updatedAt: new Date().toISOString() })
      seedCve(db, 'CVE-2024-0021', { score: 0.6, percentile: 0.6, updatedAt: new Date().toISOString() })
      const fetchSpy = mockFetchQueue([])
      const service = new EpssService(db)

      const results = await service.getEpssScores(['CVE-2024-0020', 'CVE-2024-0021'])

      expect(results.size).toBe(2)
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('only fetches the uncached subset when some CVEs are already cached', async () => {
      seedCve(db, 'CVE-2024-0030', { score: 0.15, percentile: 0.25, updatedAt: new Date().toISOString() })
      seedCve(db, 'CVE-2024-0031')
      const fetchSpy = mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0031', epss: '0.9', percentile: '0.95' }]),
        }),
      ])
      const service = new EpssService(db)

      const results = await service.getEpssScores(['CVE-2024-0030', 'CVE-2024-0031'])

      expect(results.get('CVE-2024-0030')).toMatchObject({ score: 0.15 })
      expect(results.get('CVE-2024-0031')).toMatchObject({ score: 0.9 })
      // WHY: the already-cached CVE must not appear in the outgoing request — batching
      // exists specifically to avoid re-fetching what we already know.
      expect(fetchSpy).toHaveBeenCalledTimes(1)
      const requestedUrl = fetchSpy.mock.calls[0][0] as string
      expect(requestedUrl).not.toContain('CVE-2024-0030')
      expect(requestedUrl).toContain('CVE-2024-0031')
    })

    it('returns whatever was cached and swallows a total batch failure rather than throwing', async () => {
      seedCve(db, 'CVE-2024-0040', { score: 0.4, percentile: 0.4, updatedAt: new Date().toISOString() })
      seedCve(db, 'CVE-2024-0041')
      mockFetchQueue([
        () => {
          throw new Error('DNS failure')
        },
      ])
      const service = new EpssService(db)

      // WHY: one CVE's transient failure must not take down a batch scan of hundreds of
      // other components — the caller gets a partial map back, never a rejected promise.
      const results = await service.getEpssScores(['CVE-2024-0040', 'CVE-2024-0041'])

      expect(results.get('CVE-2024-0040')).toMatchObject({ score: 0.4 })
      expect(results.has('CVE-2024-0041')).toBe(false)
    })

    it('splits requests across multiple batches when exceeding maxBatchSize', async () => {
      seedCve(db, 'CVE-2024-0050')
      seedCve(db, 'CVE-2024-0051')
      const fetchSpy = mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0050', epss: '0.1', percentile: '0.1' }]),
        }),
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0051', epss: '0.2', percentile: '0.2' }]),
        }),
      ])
      const service = new EpssService(db, { maxBatchSize: 1 })

      const results = await service.getEpssScores(['CVE-2024-0050', 'CVE-2024-0051'])

      // WHY: with maxBatchSize=1 and 2 CVEs, a correct implementation must issue 2 requests —
      // a single combined request would exceed the configured API batch limit in production.
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      expect(results.size).toBe(2)
    })

    it('continues processing later batches after an earlier batch fails', async () => {
      seedCve(db, 'CVE-2024-0060')
      seedCve(db, 'CVE-2024-0061')
      mockFetchQueue([
        () => ({ ok: false, status: 500, statusText: 'Internal Server Error', json: async () => ({}) }),
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0061', epss: '0.5', percentile: '0.5' }]),
        }),
      ])
      const service = new EpssService(db, { maxBatchSize: 1 })

      const results = await service.getEpssScores(['CVE-2024-0060', 'CVE-2024-0061'])

      // WHY: one bad batch (e.g. a transient 500) must not abort the whole scan — the
      // remaining batches still get their chance to populate results.
      expect(results.has('CVE-2024-0060')).toBe(false)
      expect(results.get('CVE-2024-0061')).toMatchObject({ score: 0.5 })
    })
  })

  describe('refreshEpssScore', () => {
    it('bypasses a still-fresh cache entry and returns the newly fetched value', async () => {
      seedCve(db, 'CVE-2024-0070', { score: 0.1, percentile: 0.1, updatedAt: new Date().toISOString() })
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0070', epss: '0.95', percentile: '0.98' }]),
        }),
      ])
      const service = new EpssService(db)

      const result = await service.refreshEpssScore('CVE-2024-0070')

      // WHY: this is the explicit "force refresh" path — if it served the old 0.1 from
      // cache, a "refresh" button in the UI would silently do nothing.
      expect(result).toMatchObject({ score: 0.95 })
    })
  })

  describe('cleanupCache', () => {
    it('nulls out and counts entries older than the TTL', async () => {
      const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
      seedCve(db, 'CVE-2024-0080', { score: 0.5, percentile: 0.5, updatedAt: staleDate })
      const service = new EpssService(db)

      const count = await service.cleanupCache()

      expect(count).toBe(1)
      const row = db.prepare('SELECT epss_score FROM cves WHERE id = ?').get('CVE-2024-0080') as {
        epss_score: number | null
      }
      expect(row.epss_score).toBeNull()
    })

    it('leaves fresh entries untouched and reports zero when nothing has expired', async () => {
      seedCve(db, 'CVE-2024-0081', { score: 0.5, percentile: 0.5, updatedAt: new Date().toISOString() })
      const service = new EpssService(db)

      const count = await service.cleanupCache()

      // WHY: cleanup must be scoped to actually-expired rows — a bug here would mean
      // fresh scores get wiped and every lookup pays the API round-trip needlessly.
      expect(count).toBe(0)
      const row = db.prepare('SELECT epss_score FROM cves WHERE id = ?').get('CVE-2024-0081') as {
        epss_score: number | null
      }
      expect(row.epss_score).toBe(0.5)
    })
  })

  describe('getStats', () => {
    it('reports zeroed averages when nothing is cached (no rows to average over)', () => {
      seedCve(db, 'CVE-2024-0090')
      const service = new EpssService(db)

      const stats = service.getStats()

      // WHY: AVG() over zero matching rows is SQL NULL, not 0 — the `|| 0` fallback exists
      // specifically so callers don't have to special-case a NaN/null average.
      expect(stats).toEqual({ cachedCount: 0, avgScore: 0, avgPercentile: 0 })
    })

    it('averages only rows that actually have a cached score', () => {
      seedCve(db, 'CVE-2024-0091', { score: 0.4, percentile: 0.2, updatedAt: new Date().toISOString() })
      seedCve(db, 'CVE-2024-0092', { score: 0.6, percentile: 0.4, updatedAt: new Date().toISOString() })
      seedCve(db, 'CVE-2024-0093') // no score — must be excluded from the average
      const service = new EpssService(db)

      const stats = service.getStats()

      expect(stats.cachedCount).toBe(2)
      expect(stats.avgScore).toBeCloseTo(0.5)
      expect(stats.avgPercentile).toBeCloseTo(0.3)
    })
  })

  describe('rate limiting', () => {
    it('delays a second immediate request to respect requestsPerSecond', async () => {
      seedCve(db, 'CVE-2024-0100')
      seedCve(db, 'CVE-2024-0101')
      mockFetchQueue([
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0100', epss: '0.1', percentile: '0.1' }]),
        }),
        () => ({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => epssApiResponse([{ cve: 'CVE-2024-0101', epss: '0.2', percentile: '0.2' }]),
        }),
      ])
      // requestsPerSecond: 20 => 50ms minimum spacing between requests.
      const service = new EpssService(db, { requestsPerSecond: 20 })

      const start = Date.now()
      await service.getEpssScore('CVE-2024-0100')
      await service.getEpssScore('CVE-2024-0101')
      const elapsed = Date.now() - start

      // WHY: without throttling, two back-to-back calls would fire within a millisecond of
      // each other and risk tripping api.first.org's rate limit / getting the app blocked.
      // Allow slack below the 50ms minimum spacing for timer jitter.
      expect(elapsed).toBeGreaterThanOrEqual(35)
    })
  })

  describe('getEpssService / resetEpssService singleton', () => {
    it('throws a descriptive error when used before initialization', () => {
      expect(() => getEpssService()).toThrow('EpssService not initialized. Call getEpssService(db) first.')
    })

    it('returns the same instance on subsequent calls, ignoring a later db argument', () => {
      const first = getEpssService(db)
      const otherDb = makeDb()
      const second = getEpssService(otherDb)

      // WHY: the singleton must not silently swap its DB handle mid-run — callers rely on
      // getEpssService() (no args) elsewhere in the request lifecycle resolving to the same
      // instance that was wired up at startup.
      expect(second).toBe(first)
      otherDb.close()
    })

    it('allows a fresh instance to be created after resetEpssService (test isolation)', () => {
      const first = getEpssService(db)
      resetEpssService()
      const second = getEpssService(db)

      expect(second).not.toBe(first)
    })
  })
})
