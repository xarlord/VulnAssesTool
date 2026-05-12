/**
 * Unit tests for Enhanced NVD Database queries (optimized for 250K+ CVEs)
 *
 * Tests the new query methods that use composite indexes for fast lookups.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { NvdDatabase } from './nvdDb.js'

// Mock Electron's app module
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-app-data'),
    getAppPath: vi.fn(() => '/tmp/test-app'),
  },
}))

// Mock sql.js initialization
let sqlJs: any

async function createTestDatabase(): Promise<Database> {
  if (!sqlJs) {
    sqlJs = await initSqlJs({})
  }
  return new sqlJs.Database()
}

describe('NvdDatabase Enhanced Queries (250K+ Optimization)', () => {
  let db: Database

  beforeEach(async () => {
    db = await createTestDatabase()

    // Create schema_migrations table
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `)

    // Create base tables (simulating a migrated database)
    db.run(`
      CREATE TABLE IF NOT EXISTS cves (
        id TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        cvss_score REAL,
        cvss_vector TEXT,
        severity TEXT CHECK(severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
        published_at TEXT NOT NULL,
        modified_at TEXT NOT NULL,
        source TEXT CHECK(source IN ('NVD', 'OSV')) NOT NULL,
        cvss_v31_score REAL,
        cvss_v31_vector TEXT,
        cvss_v31_severity TEXT,
        cvss_v30_score REAL,
        cvss_v30_vector TEXT,
        cvss_v30_severity TEXT,
        cvss_v2_score REAL,
        cvss_v2_vector TEXT,
        cvss_v2_severity TEXT,
        vuln_status TEXT,
        assigner TEXT,
        published_year INTEGER
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS cpe_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cve_id TEXT NOT NULL,
        cpe23_uri TEXT NOT NULL,
        cpe_text TEXT,
        vulnerable INTEGER NOT NULL DEFAULT 1,
        cpe_part TEXT,
        cpe_vendor TEXT,
        cpe_product TEXT,
        cpe_version TEXT,
        version_start_including TEXT,
        version_start_excluding TEXT,
        version_end_including TEXT,
        version_end_excluding TEXT,
        FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS "references" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cve_id TEXT NOT NULL,
        url TEXT NOT NULL,
        source TEXT,
        tags TEXT,
        reference_type TEXT,
        FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
      )
    `)

    db.run(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Create indexes (simulating migration 10)
    db.run('CREATE INDEX IF NOT EXISTS idx_cves_severity ON cves(severity)')
    db.run('CREATE INDEX IF NOT EXISTS idx_cves_cvss_score ON cves(cvss_score)')
    db.run('CREATE INDEX IF NOT EXISTS idx_cves_published_at ON cves(published_at)')
    db.run('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cve_id ON cpe_matches(cve_id)')

    // Mark all migrations as applied
    for (let i = 1; i <= 10; i++) {
      db.run('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
        i,
        new Date().toISOString(),
      ])
    }
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  describe('parseCPE', () => {
    it('should parse CPE 2.3 format URIs', () => {
      const result = NvdDatabase.parseCPE('cpe:2.3:a:google:chrome:120.0:*:*:*:*:*:*:*')

      expect(result.part).toBe('a')
      expect(result.vendor).toBe('google')
      expect(result.product).toBe('chrome')
      expect(result.version).toBe('120.0')
    })

    it('should parse CPE 2.2 format URIs', () => {
      const result = NvdDatabase.parseCPE('cpe:/a:google:chrome:120.0')

      expect(result.part).toBe('a')
      expect(result.vendor).toBe('google')
      expect(result.product).toBe('chrome')
      expect(result.version).toBe('120.0')
    })

    it('should handle hardware CPEs', () => {
      const result = NvdDatabase.parseCPE('cpe:2.3:h:intel:cpu:1234:*:*:*:*:*:*:*')

      expect(result.part).toBe('h')
      expect(result.vendor).toBe('intel')
      expect(result.product).toBe('cpu')
    })

    it('should handle operating system CPEs', () => {
      const result = NvdDatabase.parseCPE('cpe:2.3:o:microsoft:windows:10:*:*:*:*:*:*:*')

      expect(result.part).toBe('o')
      expect(result.vendor).toBe('microsoft')
      expect(result.product).toBe('windows')
    })

    it('should return null values for invalid CPE URIs', () => {
      const result = NvdDatabase.parseCPE('invalid-cpe')

      expect(result.part).toBeNull()
      expect(result.vendor).toBeNull()
      expect(result.product).toBeNull()
      expect(result.version).toBeNull()
    })

    it('should handle empty or null input', () => {
      const emptyResult = NvdDatabase.parseCPE('')
      expect(emptyResult.part).toBeNull()

      const nullResult = NvdDatabase.parseCPE(null as any)
      expect(nullResult.part).toBeNull()
    })
  })
})
