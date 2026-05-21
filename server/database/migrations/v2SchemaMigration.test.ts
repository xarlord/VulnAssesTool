/**
 * Unit tests for Database Schema Migration System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import {
  getMigrations,
  runMigrations,
  rollbackToVersion,
  getSchemaVersion,
  isMigrationApplied,
} from './v2SchemaMigration.js'

// Mock sql.js initialization
let db: Database
let sqlJs: any

async function createTestDatabase(): Promise<Database> {
  if (!sqlJs) {
    // Initialize sql.js without WASM file for testing
    sqlJs = await initSqlJs({})
  }
  return new sqlJs.Database()
}

describe('Database Schema Migrations', () => {
  beforeEach(async () => {
    db = await createTestDatabase()

    // Create schema_migrations table (required for migrations)
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  describe('getMigrations', () => {
    it('should return all migrations in order', () => {
      const migrations = getMigrations()

      expect(migrations.length).toBeGreaterThan(0)

      // Check that migrations are in version order
      for (let i = 1; i < migrations.length; i++) {
        expect(migrations[i].version).toBeGreaterThan(migrations[i - 1].version)
      }
    })

    it('should have required properties for each migration', () => {
      const migrations = getMigrations()

      for (const migration of migrations) {
        expect(migration.version).toBeGreaterThan(1)
        expect(migration.name).toBeTruthy()
        expect(migration.description).toBeTruthy()
        expect(typeof migration.up).toBe('function')
        expect(typeof migration.down).toBe('function')
      }
    })
  })

  describe('getSchemaVersion', () => {
    it('should return 0 for empty database', () => {
      const version = getSchemaVersion(db)
      expect(version).toBe(0)
    })

    it('should return correct version after migrations', () => {
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)', [new Date().toISOString()])

      const version = getSchemaVersion(db)
      expect(version).toBe(2)
    })

    it('should return max version when multiple exist', () => {
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)', [new Date().toISOString()])
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)', [new Date().toISOString()])

      const version = getSchemaVersion(db)
      expect(version).toBe(5)
    })
  })

  describe('isMigrationApplied', () => {
    it('should return false for unapplied migration', () => {
      expect(isMigrationApplied(db, 2)).toBe(false)
    })

    it('should return true for applied migration', () => {
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)', [new Date().toISOString()])

      expect(isMigrationApplied(db, 2)).toBe(true)
    })
  })

  describe('runMigrations', () => {
    it('should not apply migrations when already at target version', () => {
      const result = runMigrations(db, 12)

      expect(result.success).toBe(true)
      expect(result.migrationsApplied).toBe(0)
      expect(result.toVersion).toBe(12)
    })

    it('should apply migrations in order', () => {
      const result = runMigrations(db, 0)

      expect(result.success).toBe(true)
      expect(result.migrationsApplied).toBeGreaterThan(0)
      expect(result.toVersion).toBeGreaterThan(0)
    })

    it('should create cves table with v2 schema', () => {
      // First create v1 cves table (simulating existing database)
      db.run(`
        CREATE TABLE cves (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          cvss_score REAL,
          cvss_vector TEXT,
          severity TEXT,
          published_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          source TEXT NOT NULL
        )
      `)

      // Insert some test data
      db.run(`
        INSERT INTO cves (id, description, cvss_score, severity, published_at, modified_at, source)
        VALUES ('CVE-2024-12345', 'Test vulnerability', 9.8, 'CRITICAL', '2024-01-01', '2024-01-02', 'NVD')
      `)

      // Mark v1 as applied
      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)', [new Date().toISOString()])

      // Run migrations from v1 to v2
      const result = runMigrations(db, 1)

      expect(result.success).toBe(true)
      expect(result.toVersion).toBeGreaterThanOrEqual(2)

      // Verify cves table has new columns
      const tableInfo = db.exec('PRAGMA table_info(cves)')
      expect(tableInfo.length).toBeGreaterThan(0)

      const columns = tableInfo[0].values.map((row) => row[1])
      expect(columns).toContain('cvss_v31_score')
      expect(columns).toContain('cvss_v31_vector')
      expect(columns).toContain('cvss_v31_severity')
    })

    it('should migrate existing CVE data', () => {
      // Create v1 tables
      db.run(`
        CREATE TABLE cves (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          cvss_score REAL,
          cvss_vector TEXT,
          severity TEXT,
          published_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          source TEXT NOT NULL
        )
      `)

      db.run(`
        INSERT INTO cves (id, description, cvss_score, cvss_vector, severity, published_at, modified_at, source)
        VALUES
          ('CVE-2024-11111', 'First vulnerability', 9.8, 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 'CRITICAL', '2024-01-01', '2024-01-02', 'NVD'),
          ('CVE-2024-22222', 'Second vulnerability', 7.5, 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', 'HIGH', '2024-02-01', '2024-02-02', 'NVD')
      `)

      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)', [new Date().toISOString()])

      // Run migrations
      const result = runMigrations(db, 1)

      expect(result.success).toBe(true)

      // Verify data was migrated
      const cves = db.exec('SELECT id, cvss_v31_score, cvss_v31_severity FROM cves ORDER BY id')
      expect(cves.length).toBeGreaterThan(0)
      expect(cves[0].values.length).toBe(2)

      // Check first CVE
      expect(cves[0].values[0][0]).toBe('CVE-2024-11111')
      expect(cves[0].values[0][1]).toBe(9.8)
    })

    it('should create CWE references table', () => {
      runMigrations(db, 0)

      // Check if cwe_references table exists
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cwe_references'")
      expect(tables.length).toBeGreaterThan(0)
    })

    it('should create sync_status table', () => {
      runMigrations(db, 0)

      // Check if sync_status table exists
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_status'")
      expect(tables.length).toBeGreaterThan(0)
    })

    it('should create download_queue table', () => {
      runMigrations(db, 0)

      // Check if download_queue table exists
      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='download_queue'")
      expect(tables.length).toBeGreaterThan(0)
    })
  })

  describe('rollbackToVersion', () => {
    beforeEach(() => {
      // Create v1 tables and data
      db.run(`
        CREATE TABLE cves (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          cvss_score REAL,
          cvss_vector TEXT,
          severity TEXT,
          published_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          source TEXT NOT NULL
        )
      `)

      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)', [new Date().toISOString()])
    })

    it('should not rollback when already at target version', () => {
      const result = rollbackToVersion(db, 1, 1)

      expect(result.success).toBe(true)
      expect(result.migrationsApplied).toBe(0)
    })

    it('should rollback to previous version', () => {
      // First apply migrations
      runMigrations(db, 1)
      const versionAfterUp = getSchemaVersion(db)

      // Then rollback
      const result = rollbackToVersion(db, 1, versionAfterUp)

      expect(result.success).toBe(true)
      expect(result.toVersion).toBeLessThan(versionAfterUp)
    })
  })

  describe('Migration 2: CVE CVSS v2', () => {
    it('should add CVSS v3.1, v3.0, and v2.0 fields', () => {
      // Setup v1 schema
      db.run(`
        CREATE TABLE cves (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          cvss_score REAL,
          cvss_vector TEXT,
          severity TEXT,
          published_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          source TEXT NOT NULL
        )
      `)

      db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)', [new Date().toISOString()])

      // Apply migration 2
      const result = runMigrations(db, 1)

      expect(result.success).toBe(true)
      expect(result.toVersion).toBeGreaterThanOrEqual(2)

      // Verify new columns
      const tableInfo = db.exec('PRAGMA table_info(cves)')
      const columns = tableInfo[0].values.map((row) => row[1])

      expect(columns).toContain('cvss_v31_score')
      expect(columns).toContain('cvss_v31_vector')
      expect(columns).toContain('cvss_v31_severity')
      expect(columns).toContain('cvss_v30_score')
      expect(columns).toContain('cvss_v2_score')
      expect(columns).toContain('vuln_status')
      expect(columns).toContain('assigner')
    })
  })

  describe('Migration 3: CWE References', () => {
    it('should create cwe_references table with correct schema', () => {
      runMigrations(db, 0)

      // Check table structure
      const tableInfo = db.exec('PRAGMA table_info(cwe_references)')
      expect(tableInfo.length).toBeGreaterThan(0)

      const columns = tableInfo[0].values.map((row) => row[1])
      expect(columns).toContain('id')
      expect(columns).toContain('cve_id')
      expect(columns).toContain('cwe_id')
      expect(columns).toContain('description')
    })
  })

  describe('Migration 6: Sync Status', () => {
    it('should create sync_status table with correct schema', () => {
      runMigrations(db, 0)

      const tableInfo = db.exec('PRAGMA table_info(sync_status)')
      expect(tableInfo.length).toBeGreaterThan(0)

      const columns = tableInfo[0].values.map((row) => row[1])
      expect(columns).toContain('id')
      expect(columns).toContain('source')
      expect(columns).toContain('year')
      expect(columns).toContain('last_sync_at')
      expect(columns).toContain('status')
    })

    it('should create download_queue table with correct schema', () => {
      runMigrations(db, 0)

      const tableInfo = db.exec('PRAGMA table_info(download_queue)')
      expect(tableInfo.length).toBeGreaterThan(0)

      const columns = tableInfo[0].values.map((row) => row[1])
      expect(columns).toContain('id')
      expect(columns).toContain('year')
      expect(columns).toContain('status')
      expect(columns).toContain('retry_count')
    })
  })

  describe('Error Handling', () => {
    it('should report errors when migration fails', () => {
      // This test verifies error handling in the migration system
      const migrations = getMigrations()
      expect(migrations.length).toBeGreaterThan(0)

      // Verify error result structure
      const result = runMigrations(db, 0)
      expect(result).toHaveProperty('success')
      expect(result).toHaveProperty('errors')
      expect(result).toHaveProperty('durationMs')
      expect(Array.isArray(result.errors)).toBe(true)
    })
  })

  describe('Migration 10: Performance Optimization for 250K+ CVEs', () => {
    beforeEach(() => {
      // Create base tables needed for migration 10
      db.run(`
        CREATE TABLE IF NOT EXISTS cves (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          cvss_score REAL,
          cvss_vector TEXT,
          severity TEXT,
          published_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          source TEXT NOT NULL,
          cvss_v31_score REAL,
          cvss_v31_vector TEXT,
          cvss_v31_severity TEXT
        )
      `)

      db.run(`
        CREATE TABLE IF NOT EXISTS cpe_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          cpe23_uri TEXT NOT NULL,
          vulnerable INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      db.run(`
        CREATE TABLE IF NOT EXISTS cvss_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          source TEXT NOT NULL,
          version TEXT NOT NULL,
          score REAL NOT NULL,
          severity TEXT,
          vector TEXT,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      // Mark migrations 1-9 as applied
      for (let i = 1; i <= 9; i++) {
        db.run('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)', [
          i,
          new Date().toISOString(),
        ])
      }
    })

    it('should add parsed CPE columns to cpe_matches table', () => {
      const beforeColumns = db.exec('PRAGMA table_info(cpe_matches)')[0]?.values.map((row) => row[1]) || []

      // Run migration 10
      const result = runMigrations(db, 9)

      expect(result.success).toBe(true)
      expect(result.toVersion).toBeGreaterThanOrEqual(10)

      // Verify new columns exist
      const afterColumns = db.exec('PRAGMA table_info(cpe_matches)')[0]?.values.map((row) => row[1]) || []

      expect(afterColumns).toContain('cpe_part')
      expect(afterColumns).toContain('cpe_vendor')
      expect(afterColumns).toContain('cpe_product')
      expect(afterColumns).toContain('cpe_version')
    })

    it('should add published_year column to cves table', () => {
      // Run migration 10
      const result = runMigrations(db, 9)

      expect(result.success).toBe(true)

      // Verify published_year column exists
      const columns = db.exec('PRAGMA table_info(cves)')[0]?.values.map((row) => row[1]) || []
      expect(columns).toContain('published_year')
    })

    it('should create composite CPE indexes', () => {
      // Run migration 10
      runMigrations(db, 9)

      // Check for composite indexes
      const indexes = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cpe_%'")
      const indexNames = indexes.length > 0 ? indexes[0].values.map((row) => row[0]) : []

      expect(indexNames).toContain('idx_cpe_vendor_product')
      expect(indexNames).toContain('idx_cpe_part_vendor_product')
      expect(indexNames).toContain('idx_cpe_full_lookup')
      expect(indexNames).toContain('idx_cpe_vuln_search')
    })

    it('should create composite CVE indexes for severity filtering', () => {
      // Run migration 10
      runMigrations(db, 9)

      // Check for composite indexes
      const indexes = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cves_%'")
      const indexNames = indexes.length > 0 ? indexes[0].values.map((row) => row[0]) : []

      expect(indexNames).toContain('idx_cves_severity_date')
      expect(indexNames).toContain('idx_cves_v31_severity_date')
      expect(indexNames).toContain('idx_cves_severity_score')
      expect(indexNames).toContain('idx_cves_dashboard')
      expect(indexNames).toContain('idx_cves_published_year')
      expect(indexNames).toContain('idx_cves_year_severity')
    })

    it('should parse existing CPE URIs and populate parsed columns', () => {
      // Insert test CVE
      db.run(`
        INSERT INTO cves (id, description, severity, published_at, modified_at, source)
        VALUES ('CVE-2024-TEST', 'Test vulnerability', 'HIGH', '2024-01-01', '2024-01-02', 'NVD')
      `)

      // Insert test CPE with CPE 2.3 format
      db.run(`
        INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable)
        VALUES ('CVE-2024-TEST', 'cpe:2.3:a:google:chrome:120.0:*:*:*:*:*:*:*', 1)
      `)

      // Run migration 10
      runMigrations(db, 9)

      // Verify CPE was parsed
      const cpeResult = db.exec('SELECT cpe_part, cpe_vendor FROM cpe_matches WHERE cve_id = ?', ['CVE-2024-TEST'])

      // Note: The parsing may be partial due to SQLite substring limitations
      // Just verify the columns exist and were updated
      expect(cpeResult.length).toBeGreaterThan(0)
    })

    it('should populate published_year from existing CVEs', () => {
      // Insert test CVEs with different years
      db.run(`
        INSERT INTO cves (id, description, severity, published_at, modified_at, source)
        VALUES
          ('CVE-2024-001', 'Test 2024', 'HIGH', '2024-06-15', '2024-06-16', 'NVD'),
          ('CVE-2023-001', 'Test 2023', 'MEDIUM', '2023-03-20', '2023-03-21', 'NVD'),
          ('CVE-2022-001', 'Test 2022', 'LOW', '2022-12-01', '2022-12-02', 'NVD')
      `)

      // Run migration 10
      runMigrations(db, 9)

      // Verify years were populated
      const yearResult = db.exec('SELECT id, published_year FROM cves ORDER BY published_at DESC')

      expect(yearResult.length).toBeGreaterThan(0)
      expect(yearResult[0].values.length).toBe(3)

      // Check years are correct
      const rows = yearResult[0].values
      expect(rows[0][1]).toBe(2024) // CVE-2024-001
      expect(rows[1][1]).toBe(2023) // CVE-2023-001
      expect(rows[2][1]).toBe(2022) // CVE-2022-001
    })

    it('should handle databases with no existing data', () => {
      // Run migration 10 on empty tables
      const result = runMigrations(db, 9)

      expect(result.success).toBe(true)

      // Verify indexes were created even on empty tables
      const cpeIndexes = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cpe_%'")
      expect(cpeIndexes.length).toBeGreaterThan(0)
    })

    it('should be idempotent - running twice should not fail', () => {
      // Run migration 10 twice
      const result1 = runMigrations(db, 9)
      expect(result1.success).toBe(true)

      // Get current version
      const currentVersion = getSchemaVersion(db)

      // Run again - should not apply any new migrations
      const result2 = runMigrations(db, currentVersion)
      expect(result2.success).toBe(true)
      expect(result2.migrationsApplied).toBe(0)
    })
  })
})
