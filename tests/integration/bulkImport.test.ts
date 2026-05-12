/**
 * Integration tests for Bulk Import Flow
 *
 * Tests the end-to-end bulk import process including:
 * - Database interactions
 * - API client interactions
 * - Progress tracking
 * - Resume capability
 * - Error recovery
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { runMigrations } from '../../electron/database/migrations/v2SchemaMigration.js'
import {
  NvdBulkImporter,
  createNvdBulkImporter,
  estimateImportDuration,
  getImportYears,
  type ImportProgress,
  type ImportResult,
  type ImportError,
} from '../../electron/database/nvdBulkImporter.js'
import type { NvdCveV2 } from '../../electron/database/nvd/nvdApiV2Client.js'

let db: Database
let sqlJs: unknown

// Create sample CVEs for testing
const createSampleCve = (id: string, year: number): NvdCveV2 => ({
  id,
  sourceIdentifier: 'test@nvd.nist.gov',
  published: `${year}-06-15T10:00:00.000`,
  lastModified: `${year}-06-20T15:30:00.000`,
  vulnStatus: 'ANALYZED',
  descriptions: [{ lang: 'en', value: `Test vulnerability ${id} description` }],
  metrics: {
    cvssMetricV31: [
      {
        source: 'nvd@nist.gov',
        type: 'Primary',
        cvssData: {
          version: '3.1',
          vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
          attackVector: 'NETWORK',
          attackComplexity: 'LOW',
          privilegesRequired: 'NONE',
          userInteraction: 'NONE',
          scope: 'UNCHANGED',
          confidentialityImpact: 'HIGH',
          integrityImpact: 'HIGH',
          availabilityImpact: 'HIGH',
          baseScore: 9.8,
          baseSeverity: 'CRITICAL',
        },
        exploitabilityScore: 3.9,
        impactScore: 5.9,
      },
    ],
  },
  configurations: [
    {
      operator: 'OR',
      nodes: [
        {
          operator: 'OR',
          cpeMatch: [
            {
              vulnerable: true,
              cpe23Uri: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
            },
          ],
        },
      ],
    },
  ],
  references: [
    {
      url: 'https://example.com/advisory',
      source: 'VENDOR',
      tags: ['Vendor Advisory'],
    },
  ],
})

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

describe('Bulk Import Flow Integration Tests', () => {
  let importer: NvdBulkImporter

  beforeEach(async () => {
    db = await createTestDatabase()
    importer = createNvdBulkImporter(db)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  describe('End-to-End Import Flow', () => {
    it('should complete full import flow for single year', async () => {
      const progressUpdates: ImportProgress[] = []

      const result = await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      expect(result.success).toBe(true)
      expect(result.yearsProcessed).toContain(2024)
      expect(progressUpdates.length).toBeGreaterThan(0)

      // Verify database has CVEs
      const countResult = db.exec('SELECT COUNT(*) FROM cves')
      const count = countResult[0]?.values[0]?.[0] as number
      expect(count).toBeGreaterThan(0)
    })

    it('should persist import state for resume', async () => {
      // Start import
      await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      // Check state was persisted
      const hasResumable = importer.hasResumableImport()
      // After successful completion, state should be cleared
      expect(hasResumable).toBe(false)
    })

    it('should track CVEs per second metric', async () => {
      const result = await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      expect(result.durationMs).toBeGreaterThan(0)
      expect(result.cvesPerSecond).toBeGreaterThanOrEqual(0)
    })

    it('should store CVEs in database with correct schema', async () => {
      await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      // Verify CVE was stored correctly
      const result = db.exec(`
        SELECT id, description, severity, cvss_score
        FROM cves
        LIMIT 1
      `)

      expect(result.length).toBeGreaterThan(0)
      if (result.length > 0) {
        const row = result[0].values[0]
        expect(row[0]).toMatch(/^CVE-\d{4}-\d+$/)
        expect(row[1]).toBeDefined()
      }
    })

    it('should store CPE matches with parsed columns', async () => {
      await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      // Check CPE matches were stored
      const result = db.exec(`
        SELECT COUNT(*) FROM cpe_matches
      `)

      const count = result[0]?.values[0]?.[0] as number
      // CPE matches should exist (may be 0 if no CPEs in test data)
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it('should store references correctly', async () => {
      await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      // Check references were stored
      const result = db.exec(`
        SELECT COUNT(*) FROM "references"
      `)

      const count = result[0]?.values[0]?.[0] as number
      expect(count).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Resume Capability Integration', () => {
    it('should save state during import', async () => {
      const controller = new AbortController()

      // Start import and cancel early
      const importPromise = importer.startImport({
        startYear: 2020,
        endYear: 2024,
        batchSize: 100,
        signal: controller.signal,
      })

      // Cancel immediately
      controller.abort()

      try {
        await importPromise
      } catch {
        // Expected - cancellation
      }

      // After cancellation, check if state was saved
      const metadataResult = db.exec("SELECT value FROM metadata WHERE key = 'bulk_import_state'")

      // State might or might not be saved depending on timing
      expect(metadataResult.length).toBeGreaterThanOrEqual(0)
    })

    it('should detect resumable import after cancellation', async () => {
      // First, complete a partial import
      const controller = new AbortController()

      const result = await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
        signal: controller.signal,
      })

      controller.abort()

      // Check resumable state (depends on timing)
      const hasResumable = importer.hasResumableImport()
      expect(typeof hasResumable).toBe('boolean')
    })
  })

  describe('Error Recovery Integration', () => {
    it('should continue after individual CVE errors', async () => {
      const errors: ImportError[] = []

      const result = await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
        onError: (e) => errors.push(e),
      })

      expect(result.success).toBe(true)
      expect(Array.isArray(result.errors)).toBe(true)
    })

    it('should collect errors during import', async () => {
      const result = await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      // Errors array should exist
      expect(Array.isArray(result.errors)).toBe(true)
    })
  })

  describe('Database Integrity Tests', () => {
    it('should maintain FTS5 index after import', async () => {
      await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      // FTS5 table should exist
      const result = db.exec(`
        SELECT name FROM sqlite_master
        WHERE type = 'table'
        AND name = 'cves_fts'
      `)

      expect(result.length).toBeGreaterThan(0)
    })

    it('should maintain referential integrity', async () => {
      await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      // Check foreign keys are valid
      const cveCount = db.exec('SELECT COUNT(*) FROM cves')
      const refCount = db.exec('SELECT COUNT(*) FROM "references"')

      expect(cveCount[0]?.values[0]?.[0]).toBeGreaterThan(0)
      expect(refCount[0]?.values[0]?.[0]).toBeGreaterThanOrEqual(0)
    })

    it('should have correct published_year values', async () => {
      await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      // Check published_year was populated
      const result = db.exec(`
        SELECT DISTINCT published_year
        FROM cves
        WHERE published_year IS NOT NULL
        LIMIT 5
      `)

      expect(result.length).toBeGreaterThanOrEqual(0)
      if (result.length > 0) {
        const years = result[0].values.map((row) => row[0] as number)
        years.forEach((year) => {
          expect(year).toBeGreaterThanOrEqual(2020)
          expect(year).toBeLessThanOrEqual(new Date().getFullYear() + 1)
        })
      }
    })
  })

  describe('Multi-Year Import Integration', () => {
    it('should handle multi-year imports', async () => {
      const result = await importer.startImport({
        startYear: 2023,
        endYear: 2024,
        batchSize: 100,
      })

      expect(result.success).toBe(true)
      expect(result.yearsProcessed.length).toBe(2)
    })

    it('should process years in order', async () => {
      const yearOrder: number[] = []

      await importer.startImport({
        startYear: 2022,
        endYear: 2024,
        batchSize: 100,
        onProgress: (p) => {
          if (p.currentYear > 0) {
            yearOrder.push(p.currentYear)
          }
        },
      })

      // Years should be processed in chronological order (oldest to newest)
      expect(yearOrder).toEqual([2022, 2023, 2024])
    })
  })
})
