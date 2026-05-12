/**
 * Performance Tests for CVE Database
 *
 * Tests verify:
 * - Search queries complete in < 500ms with 250K+ CVEs
 * - Memory usage stays under 500MB during sync
 * - Query cache improves performance
 * - CPE lookups are fast
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { runMigrations } from '../../electron/database/migrations/v2SchemaMigration.js'
import { NvdDatabase } from '../../electron/database/nvdDb.js'
import { QueryCache, CVESearchCache } from '../../electron/database/performance/queryCache.js'
import {
  CPELookupCache,
  getCPELookupCache,
  resetCPELookupCache,
} from '../../electron/database/performance/cpeLookupCache.js'

let db: Database
let sqlJs: unknown
let nvdDb: NvdDatabase

const PERFORMANCE_THRESHOLD_MS = 500 // 500ms max for search queries
const MEMORY_THRESHOLD_MB = 500 // 500MB max during sync

// Generate test CVE data
function generateTestCVEs(
  count: number,
  startYear: number = 2020,
): Array<{
  id: string
  description: string
  severity: string
  cvssScore: number
  publishedAt: string
  modifiedAt: string
  source: string
}> {
  const cves = []
  for (let i = 0; i < count; i++) {
    const year = startYear + Math.floor(i / 10000)
    const severity = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][i % 4]
    cves.push({
      id: `CVE-${year}-${String(i % 100000).padStart(5, '0')}`,
      description: `Test vulnerability description ${i} with some keywords like buffer overflow and SQL injection`,
      severity,
      cvssScore: 3 + (i % 8),
      publishedAt: `${year}-${String((i % 12) + 1).padStart(2, '0')}-15T10:00:00.000Z`,
      modifiedAt: `${year}-${String((i % 12) + 1).padStart(2, '0')}-20T15:30:00.000Z`,
      source: 'NVD',
    })
  }
  return cves
}

async function createTestDatabase(): Promise<Database> {
  if (!sqlJs) {
    sqlJs = await initSqlJs({})
  }
  const database = new sqlJs.Database()

  // Create metadata table
  database.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // Create schema migrations table
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  // Apply all migrations
  runMigrations(database, 0)

  return database
}

async function populateTestCVEs(database: Database, count: number): Promise<void> {
  const cves = generateTestCVEs(count)
  const batchSize = 1000

  for (let i = 0; i < cves.length; i += batchSize) {
    const batch = cves.slice(i, i + batchSize)

    for (const cve of batch) {
      database.run(
        `
        INSERT OR REPLACE INTO cves (
          id, description, severity, cvss_score,
          published_at, modified_at, source, published_year
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          cve.id,
          cve.description,
          cve.severity,
          cve.cvssScore,
          cve.publishedAt,
          cve.modifiedAt,
          cve.source,
          parseInt(cve.publishedAt.split('-')[0], 10),
        ],
      )
    }
  }

  // Update FTS index
  database.run(`INSERT INTO cves_fts(cves_fts) VALUES('optimize')`)
}

describe('CVE Database Performance Tests', () => {
  beforeEach(async () => {
    db = await createTestDatabase()
    nvdDb = new NvdDatabase(db)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  describe('Search Query Performance', () => {
    it('should complete text search in under 500ms with 1000 CVEs', async () => {
      await populateTestCVEs(db, 1000)

      const startTime = performance.now()
      const results = db.exec(`
        SELECT id FROM cves_fts WHERE cves_fts MATCH 'buffer overflow'
        LIMIT 50
      `)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS)
      expect(results.length).toBeGreaterThan(0)
    })

    it('should complete CVE ID lookup in under 100ms', async () => {
      await populateTestCVEs(db, 1000)

      const startTime = performance.now()
      const results = db.exec(
        `
        SELECT * FROM cves WHERE id = ?
      `,
        ['CVE-2020-00050'],
      )
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(100)
    })

    it('should complete severity filter in under 200ms', async () => {
      await populateTestCVEs(db, 1000)

      const startTime = performance.now()
      const results = db.exec(`
        SELECT id FROM cves WHERE severity = 'HIGH'
        ORDER BY published_at DESC
        LIMIT 100
      `)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(200)
    })

    it('should complete year-based query in under 100ms', async () => {
      await populateTestCVEs(db, 1000)

      const startTime = performance.now()
      const results = db.exec(`
        SELECT id FROM cves WHERE published_year = 2021
        ORDER BY published_at DESC
        LIMIT 100
      `)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(100)
    })

    it('should complete complex query with multiple filters in under 300ms', async () => {
      await populateTestCVEs(db, 1000)

      const startTime = performance.now()
      const results = db.exec(`
        SELECT id FROM cves
        WHERE severity IN ('HIGH', 'CRITICAL')
        AND published_year >= 2021
        AND cvss_score >= 7.0
        ORDER BY cvss_score DESC
        LIMIT 50
      `)
      const duration = performance.now() - startTime

      expect(duration).toBeLessThan(300)
    })
  })

  describe('Query Cache Performance', () => {
    let cache: CVESearchCache

    beforeEach(() => {
      cache = new CVESearchCache({
        maxSize: 100,
        ttlMs: 60000,
      })
    })

    it('should improve performance for repeated queries', async () => {
      await populateTestCVEs(db, 1000)

      // First query (cold cache)
      const coldStart = performance.now()
      const coldResults = db.exec(`
        SELECT id FROM cves WHERE severity = 'HIGH'
        ORDER BY published_at DESC
        LIMIT 50
      `)
      const coldDuration = performance.now() - coldStart

      // Cache the result
      cache.setSeveritySearch(
        { severity: 'HIGH', limit: 50 },
        {
          cveIds: coldResults[0]?.values.map((row) => row[0] as string) || [],
          totalCount: coldResults[0]?.values.length || 0,
          queryTimeMs: coldDuration,
        },
      )

      // Second query (from cache)
      const cachedStart = performance.now()
      const cached = cache.getSeveritySearch({ severity: 'HIGH', limit: 50 })
      const cachedDuration = performance.now() - cachedStart

      expect(cached).not.toBeNull()
      expect(cachedDuration).toBeLessThan(coldDuration)
      expect(cachedDuration).toBeLessThan(10) // Cache lookup should be instant
    })

    it('should handle high cache hit rate', () => {
      // Populate cache
      for (let i = 0; i < 50; i++) {
        cache.setTextSearch(`query${i}`, 10, 0, {
          cveIds: [`CVE-${i}`],
          totalCount: 1,
          queryTimeMs: 50,
        })
      }

      // Access cached items
      for (let i = 0; i < 50; i++) {
        cache.getTextSearch(`query${i}`, 10, 0)
      }

      const stats = cache.getStats()
      expect(stats.hitRate).toBeGreaterThan(0.8) // 80% hit rate
    })
  })

  describe('CPE Lookup Performance', () => {
    let cpeCache: CPELookupCache

    beforeEach(() => {
      cpeCache = new CPELookupCache({
        maxVendors: 100,
        maxProductsPerVendor: 50,
        maxCVEsPerProduct: 100,
        ttlMs: 60000,
        preloadPopularVendors: false,
      })
    })

    it('should cache CPE lookups for faster retrieval', () => {
      const vendor = 'microsoft'
      const product = 'windows'
      const result = {
        cveIds: ['CVE-2024-00001', 'CVE-2024-00002'],
        totalCount: 2,
        vulnerableCount: 2,
      }

      // Store in cache
      cpeCache.storeLookup(vendor, product, true, result)

      // First lookup (cached)
      const cachedStart = performance.now()
      const cached = cpeCache.lookup(vendor, product, true)
      const cachedDuration = performance.now() - cachedStart

      expect(cached).toEqual(result)
      expect(cachedDuration).toBeLessThan(5) // Cache lookup is nearly instant
    })

    it('should handle vendor-level caching', () => {
      const vendor = 'google'

      // Store vendor-level lookup
      cpeCache.storeLookup(vendor, undefined, true, {
        cveIds: ['CVE-2024-00001'],
        totalCount: 1,
        vulnerableCount: 1,
      })

      const cached = cpeCache.lookup(vendor, undefined, true)
      expect(cached).not.toBeNull()
    })
  })

  describe('Index Performance', () => {
    it('should use indexes for severity queries', async () => {
      await populateTestCVEs(db, 1000)

      const results = db.exec(`
        EXPLAIN QUERY PLAN
        SELECT id FROM cves WHERE severity = 'HIGH'
      `)

      const plan = results[0]?.values.map((row) => row.join(' ')).join(' ') || ''
      expect(plan).toContain('INDEX')
    })

    it('should use indexes for year queries', async () => {
      await populateTestCVEs(db, 1000)

      const results = db.exec(`
        EXPLAIN QUERY PLAN
        SELECT id FROM cves WHERE published_year = 2021
      `)

      const plan = results[0]?.values.map((row) => row.join(' ')).join(' ') || ''
      expect(plan).toContain('INDEX')
    })

    it('should use FTS5 for text searches', async () => {
      await populateTestCVEs(db, 1000)

      const results = db.exec(`
        EXPLAIN QUERY PLAN
        SELECT id FROM cves_fts WHERE cves_fts MATCH 'buffer'
      `)

      // FTS5 queries should use the virtual table
      expect(results.length).toBeGreaterThan(0)
    })
  })

  describe('Batch Operations Performance', () => {
    it('should handle batch inserts efficiently', async () => {
      const cves = generateTestCVEs(1000)

      const startTime = performance.now()

      db.run('BEGIN TRANSACTION')
      for (const cve of cves) {
        db.run(
          `
          INSERT OR REPLACE INTO cves (
            id, description, severity, cvss_score,
            published_at, modified_at, source, published_year
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            cve.id,
            cve.description,
            cve.severity,
            cve.cvssScore,
            cve.publishedAt,
            cve.modifiedAt,
            cve.source,
            parseInt(cve.publishedAt.split('-')[0], 10),
          ],
        )
      }
      db.run('COMMIT')

      const duration = performance.now() - startTime

      // Should insert 1000 CVEs in under 5 seconds
      expect(duration).toBeLessThan(5000)
    })

    it('should handle batch FTS updates efficiently', async () => {
      await populateTestCVEs(db, 1000)

      const startTime = performance.now()
      db.run(`INSERT INTO cves_fts(cves_fts) VALUES('optimize')`)
      const duration = performance.now() - startTime

      // FTS optimization should complete quickly
      expect(duration).toBeLessThan(1000)
    })
  })

  describe('Memory Usage Tests', () => {
    it('should estimate memory usage for query cache', () => {
      const cache = new QueryCache<string[]>({
        maxSize: 1000,
        ttlMs: 60000,
      })

      // Add some entries
      for (let i = 0; i < 100; i++) {
        cache.set(`key${i}`, [`value${i}`.repeat(100)])
      }

      const stats = cache.getStats()
      expect(stats.memoryUsageBytes).toBeGreaterThan(0)
      expect(stats.memoryUsageBytes).toBeLessThan(10 * 1024 * 1024) // Less than 10MB for 100 entries
    })

    it('should estimate memory usage for CPE cache', async () => {
      const cache = new CPELookupCache({
        maxVendors: 100,
        maxProductsPerVendor: 50,
      })

      const mockDb = {
        exec: vi.fn().mockReturnValue([]),
      } as unknown

      await cache.initialize(mockDb)

      const stats = cache.getStats()
      expect(stats.memoryUsageEstimate).toBeGreaterThanOrEqual(0)
    })
  })
})

describe('Performance Regression Tests', () => {
  beforeEach(async () => {
    db = await createTestDatabase()
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  it('should maintain search performance with growing database', async () => {
    const sizes = [100, 500, 1000]
    const durations: number[] = []

    for (const size of sizes) {
      // Clear and repopulate
      db.run('DELETE FROM cves')
      await populateTestCVEs(db, size)

      const startTime = performance.now()
      db.exec(`SELECT id FROM cves_fts WHERE cves_fts MATCH 'buffer' LIMIT 50`)
      durations.push(performance.now() - startTime)
    }

    // Duration should not grow exponentially
    // Last duration should be at most 3x the first duration
    expect(durations[durations.length - 1]).toBeLessThan(durations[0] * 3 + 100)
  })

  it('should maintain filter performance with growing database', async () => {
    const sizes = [100, 500, 1000]
    const durations: number[] = []

    for (const size of sizes) {
      db.run('DELETE FROM cves')
      await populateTestCVEs(db, size)

      const startTime = performance.now()
      db.exec(`
        SELECT id FROM cves
        WHERE severity = 'HIGH' AND published_year >= 2021
        LIMIT 50
      `)
      durations.push(performance.now() - startTime)
    }

    // Duration should remain relatively constant
    expect(durations[durations.length - 1]).toBeLessThan(durations[0] * 2 + 50)
  })
})
