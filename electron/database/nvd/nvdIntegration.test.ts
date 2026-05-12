/**
 * Integration Tests for NVD Database System
 *
 * Tests the complete flow of NVD database operations:
 * - Schema migration
 * - Data import
 * - Delta sync
 * - Database statistics
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { runMigrations, getSchemaVersion } from '../migrations/v2SchemaMigration.js'
import { createNvdDataImporter, type NvdDataImporter } from './nvdDataImporter.js'
import { createNvdDeltaSync, type NvdDeltaSync } from './nvdDeltaSync.js'
import type { NvdCveV2 } from './nvdApiV2Client.js'

let db: Database
let sqlJs: any
let fts5Available: boolean = false

/**
 * Check if FTS5 is available in the SQLite build
 */
function checkFts5Availability(db: Database): boolean {
  try {
    db.run('CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_test USING fts5(content)')
    db.run('DROP TABLE IF EXISTS _fts5_test')
    return true
  } catch {
    return false
  }
}

// Sample CVE for testing
const sampleCve: NvdCveV2 = {
  id: 'CVE-2024-12345',
  sourceIdentifier: 'test@nvd.nist.gov',
  published: '2024-01-15T10:00:00.000',
  lastModified: '2024-01-20T15:30:00.000',
  vulnStatus: 'ANALYZED',
  descriptions: [{ lang: 'en', value: 'Test vulnerability description' }],
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
  weaknesses: [
    {
      source: 'nvd@nist.gov',
      type: 'Primary',
      description: [{ lang: 'en', value: 'CWE-79' }],
    },
  ],
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
}

async function createTestDatabase(): Promise<Database> {
  if (!sqlJs) {
    sqlJs = await initSqlJs({})
  }
  const database = new sqlJs.Database()

  // Check FTS5 availability
  fts5Available = checkFts5Availability(database)

  // Create schema_migrations table
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

describe('NVD Database Integration Tests', () => {
  beforeEach(async () => {
    db = await createTestDatabase()
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  describe('Schema Migration', () => {
    it('should apply all migrations successfully', () => {
      const version = getSchemaVersion(db)
      expect(version).toBe(12) // All 12 migrations applied
    })

    it('should have all required tables', () => {
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")

      const tableNames = tables[0]?.values.map((v) => v[0]) || []

      expect(tableNames).toContain('cves')
      expect(tableNames).toContain('cwe_references')
      expect(tableNames).toContain('cpe_matches')
      expect(tableNames).toContain('references')
      expect(tableNames).toContain('sync_status')
      expect(tableNames).toContain('download_queue')
      expect(tableNames).toContain('cvss_metrics')

      // FTS5 table only available if FTS5 extension is present
      if (fts5Available) {
        expect(tableNames).toContain('cves_fts')
      }
    })

    it('should have correct CVE table schema', () => {
      const columns = db.exec('PRAGMA table_info(cves)')
      const columnNames = columns[0]?.values.map((v) => v[1]) || []

      expect(columnNames).toContain('id')
      expect(columnNames).toContain('description')
      expect(columnNames).toContain('cvss_v31_score')
      expect(columnNames).toContain('cvss_v31_vector')
      expect(columnNames).toContain('cvss_v31_severity')
      expect(columnNames).toContain('cvss_v2_score')
      expect(columnNames).toContain('published_at')
      expect(columnNames).toContain('modified_at')
    })

    it('should have sync_status with auto sync fields', () => {
      const columns = db.exec('PRAGMA table_info(sync_status)')
      const columnNames = columns[0]?.values.map((v) => v[1]) || []

      expect(columnNames).toContain('last_sync_at')
      expect(columnNames).toContain('last_successful_sync_at')
      expect(columnNames).toContain('auto_sync_enabled')
      expect(columnNames).toContain('auto_sync_interval_hours')
    })
  })

  describe('Data Import Integration', () => {
    let importer: NvdDataImporter

    beforeEach(() => {
      importer = createNvdDataImporter(db)
    })

    it('should import CVE with all related data', async () => {
      const result = await importer.importCves([sampleCve])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)

      // Verify CVE
      const cveResult = db.exec('SELECT * FROM cves WHERE id = ?', [sampleCve.id])
      expect(cveResult[0]?.values.length).toBe(1)

      // Verify CWE references
      const cweResult = db.exec('SELECT * FROM cwe_references WHERE cve_id = ?', [sampleCve.id])
      expect(cweResult[0]?.values.length).toBe(1)

      // Verify CPE matches
      const cpeResult = db.exec('SELECT * FROM cpe_matches WHERE cve_id = ?', [sampleCve.id])
      expect(cpeResult[0]?.values.length).toBe(1)

      // Verify references
      const refResult = db.exec('SELECT * FROM "references" WHERE cve_id = ?', [sampleCve.id])
      expect(refResult[0]?.values.length).toBe(1)
    })

    it('should handle batch import with progress', async () => {
      const cves: NvdCveV2[] = []
      for (let i = 0; i < 10; i++) {
        cves.push({
          ...sampleCve,
          id: `CVE-2024-${i.toString().padStart(5, '0')}`,
        })
      }

      const progressUpdates: any[] = []
      const result = await importer.importCves(cves, {
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(10)
      expect(progressUpdates.length).toBeGreaterThan(0)
    })

    it('should support update existing CVEs', async () => {
      // Import first
      await importer.importCves([sampleCve])

      // Update CVE
      const updatedCve: NvdCveV2 = {
        ...sampleCve,
        descriptions: [{ lang: 'en', value: 'Updated description' }],
        lastModified: '2024-02-01T00:00:00.000',
      }

      const result = await importer.importCves([updatedCve], { updateExisting: true })

      expect(result.updatedCves).toBe(1)

      // Verify update
      const cveResult = db.exec('SELECT description FROM cves WHERE id = ?', [sampleCve.id])
      expect(cveResult[0]?.values[0]?.[0]).toBe('Updated description')
    })
  })

  describe('Delta Sync Integration', () => {
    let deltaSync: NvdDeltaSync
    let importer: NvdDataImporter

    beforeEach(() => {
      deltaSync = createNvdDeltaSync(db)
      importer = createNvdDataImporter(db)
    })

    it('should track sync status', async () => {
      // Import some data first
      await importer.importCves([sampleCve])

      const stats = deltaSync.getStats()

      // getStats() returns actual database counts
      expect(stats.totalCves).toBe(1)
    })

    it('should detect when sync is needed', () => {
      // No sync done yet
      expect(deltaSync.isSyncNeeded()).toBe(true)
    })

    it('should provide recommended sync range', () => {
      const range = deltaSync.getRecommendedSyncRange()

      expect(range.start).toBeInstanceOf(Date)
      expect(range.end).toBeInstanceOf(Date)
      expect(range.start.getTime()).toBeLessThanOrEqual(range.end.getTime())
    })

    it('should get database statistics', async () => {
      await importer.importCves([sampleCve])

      const stats = deltaSync.getStats()

      expect(stats.totalCves).toBe(1)
      expect(stats.totalCwe).toBeGreaterThan(0)
      expect(stats.totalCpe).toBeGreaterThan(0)
      expect(stats.totalRefs).toBeGreaterThan(0)
    })

    it('should support auto sync configuration', () => {
      // Insert initial sync status
      db.run(
        `
        INSERT INTO sync_status (source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours)
        VALUES (?, ?, ?, ?)
      `,
        ['NVD', '2024-01-01T00:00:00.000Z', 0, 24],
      )

      deltaSync.enableAutoSync({ intervalHours: 12 })

      const status = deltaSync.getSyncStatus()
      expect(status.autoSyncEnabled).toBe(true)
      expect(status.autoSyncIntervalHours).toBe(12)

      deltaSync.disableAutoSync()
    })
  })

  describe('Full Workflow Integration', () => {
    let importer: NvdDataImporter
    let deltaSync: NvdDeltaSync

    beforeEach(() => {
      importer = createNvdDataImporter(db)
      deltaSync = createNvdDeltaSync(db)
    })

    it('should complete full import workflow', async () => {
      // 1. Import initial data
      const importResult = await importer.importCves([sampleCve])
      expect(importResult.success).toBe(true)

      // 2. Check statistics
      const stats = deltaSync.getStats()
      expect(stats.totalCves).toBe(1)

      // 3. Verify FTS search works (only if FTS5 is available)
      if (fts5Available) {
        const searchResult = db.exec('SELECT * FROM cves_fts WHERE cves_fts MATCH ?', ['vulnerability'])
        expect(searchResult.length).toBeGreaterThan(0)
      }

      // 4. Verify sync status via getStats()
      const syncStats = deltaSync.getStats()
      expect(syncStats.totalCves).toBe(1)
    })

    it('should handle concurrent operations', async () => {
      // Import multiple CVEs
      const cves: NvdCveV2[] = []
      for (let i = 0; i < 5; i++) {
        cves.push({
          ...sampleCve,
          id: `CVE-2024-${i.toString().padStart(5, '0')}`,
        })
      }

      const result = await importer.importCves(cves)
      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(5)

      // Get stats
      const stats = deltaSync.getStats()
      expect(stats.totalCves).toBe(5)
    })
  })

  describe('Error Recovery', () => {
    let importer: NvdDataImporter

    beforeEach(() => {
      importer = createNvdDataImporter(db)
    })

    it('should handle duplicate imports gracefully', async () => {
      // Import first time
      await importer.importCves([sampleCve])

      // Try to import again without update flag
      const result = await importer.importCves([sampleCve])

      // Should either skip or fail gracefully
      expect(result.failedCves).toBe(1) // Duplicate ID constraint
    })

    it('should support skip existing mode', async () => {
      // Import first time
      await importer.importCves([sampleCve])

      // Import again with skip existing
      const result = await importer.importCves([sampleCve], { skipExisting: true })

      expect(result.skippedCves).toBe(1)
      expect(result.importedCves).toBe(0)
    })
  })
})

describe('TypeScript Type Validation', () => {
  it('should have correct NvdCveV2 type structure', () => {
    const cve: NvdCveV2 = sampleCve

    expect(cve.id).toBeDefined()
    expect(cve.published).toBeDefined()
    expect(cve.lastModified).toBeDefined()
    expect(cve.descriptions).toBeInstanceOf(Array)
    expect(cve.metrics).toBeDefined()
  })
})
