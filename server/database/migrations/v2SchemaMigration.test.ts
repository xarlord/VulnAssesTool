/**
 * Unit tests for Database Schema Migration System
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import {
  getMigrations,
  runMigrations,
  rollbackToVersion,
  getSchemaVersion,
  isMigrationApplied,
} from './v2SchemaMigration.js'
import type { Migration } from './v2SchemaMigration.js'

let db: InstanceType<typeof Database>

function createTestDatabase(): InstanceType<typeof Database> {
  return new Database(':memory:')
}

/** Looks up a single migration by version, failing fast (no non-null assertion) if absent. */
function getMigrationByVersion(version: number): Migration {
  const migration = getMigrations().find((candidate) => candidate.version === version)
  if (!migration) {
    throw new Error(`Migration ${version} not found in getMigrations()`)
  }
  return migration
}

describe('Database Schema Migrations', () => {
  beforeEach(() => {
    db = createTestDatabase()

    db.exec(`
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
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(2, new Date().toISOString())

      const version = getSchemaVersion(db)
      expect(version).toBe(2)
    })

    it('should return max version when multiple exist', () => {
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(2, new Date().toISOString())
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(5, new Date().toISOString())

      const version = getSchemaVersion(db)
      expect(version).toBe(5)
    })
  })

  describe('isMigrationApplied', () => {
    it('should return false for unapplied migration', () => {
      expect(isMigrationApplied(db, 2)).toBe(false)
    })

    it('should return true for applied migration', () => {
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(2, new Date().toISOString())

      expect(isMigrationApplied(db, 2)).toBe(true)
    })
  })

  describe('runMigrations', () => {
    it('should not apply migrations when already at target version', () => {
      // Derive the head version so this stays correct as migrations are added.
      const migrations = getMigrations()
      const latest = migrations[migrations.length - 1].version
      const result = runMigrations(db, latest)

      expect(result.success).toBe(true)
      expect(result.migrationsApplied).toBe(0)
      expect(result.toVersion).toBe(latest)
    })

    it('should apply migrations in order', () => {
      const result = runMigrations(db, 0)

      expect(result.success).toBe(true)
      expect(result.migrationsApplied).toBeGreaterThan(0)
      expect(result.toVersion).toBeGreaterThan(0)
    })

    it('should create cves table with v2 schema', () => {
      db.exec(`
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
      db.exec(`
        INSERT INTO cves (id, description, cvss_score, severity, published_at, modified_at, source)
        VALUES ('CVE-2024-12345', 'Test vulnerability', 9.8, 'CRITICAL', '2024-01-01', '2024-01-02', 'NVD')
      `)

      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString())

      const result = runMigrations(db, 1)

      expect(result.success).toBe(true)
      expect(result.toVersion).toBeGreaterThanOrEqual(2)

      const tableInfo = db.pragma('table_info(cves)') as Record<string, unknown>[]
      expect(tableInfo.length).toBeGreaterThan(0)

      const columns = tableInfo.map((row) => row.name as string)

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

      const tableInfo = db.pragma('table_info(cwe_references)') as Record<string, unknown>[]
      expect(tableInfo.length).toBeGreaterThan(0)

      const columns = tableInfo.map((row) => row.name as string)
      expect(columns).toContain('id')
      expect(columns).toContain('cve_id')
      expect(columns).toContain('cwe_id')
      expect(columns).toContain('description')
    })
  })

  describe('Migration 6: Sync Status', () => {
    it('should create sync_status table with correct schema', () => {
      runMigrations(db, 0)

      const tableInfo = db.pragma('table_info(sync_status)') as Record<string, unknown>[]
      expect(tableInfo.length).toBeGreaterThan(0)

      const columns = tableInfo.map((row) => row.name as string)
      expect(columns).toContain('id')
      expect(columns).toContain('source')
      expect(columns).toContain('year')
      expect(columns).toContain('last_sync_at')
      expect(columns).toContain('status')
    })

    it('should create download_queue table with correct schema', () => {
      runMigrations(db, 0)

      const tableInfo = db.pragma('table_info(download_queue)') as Record<string, unknown>[]
      expect(tableInfo.length).toBeGreaterThan(0)

      const columns = tableInfo.map((row) => row.name as string)
      expect(columns).toContain('id')
      expect(columns).toContain('year')
      expect(columns).toContain('status')
      expect(columns).toContain('retry_count')
    })
  })

  describe('Migration 14: Sync Bandwidth Limit', () => {
    it('adds bandwidth_limit_kbps to sync_status defaulting to 0/unlimited (FR-10.3)', () => {
      runMigrations(db, 0)

      const tableInfo = db.pragma('table_info(sync_status)') as Array<{ name: string; dflt_value: unknown }>
      const column = tableInfo.find((row) => row.name === 'bandwidth_limit_kbps')

      expect(column).toBeDefined()
      // WHY default 0: an unset limit MUST mean "unlimited" so a DB upgraded from
      // an older version keeps syncing at full speed rather than silently throttling.
      expect(Number(column?.dflt_value)).toBe(0)
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

    it('rolls back a failed migration atomically, leaving the schema exactly as it was before the attempt', () => {
      // WHY: runMigrations wraps up() + the schema_migrations insert in a single
      // db.transaction() specifically so a mid-migration throw can't leave a table
      // renamed to *_v1_backup with its v2 replacement not yet swapped in (see the
      // comment on runMigrations). Force that exact failure mode for migration 2 by
      // pre-creating its rename target, and prove the transaction actually undoes it.
      db.exec(`
        CREATE TABLE cves (
          id TEXT PRIMARY KEY, description TEXT NOT NULL, cvss_score REAL, cvss_vector TEXT,
          severity TEXT, published_at TEXT NOT NULL, modified_at TEXT NOT NULL, source TEXT NOT NULL
        )
      `)
      db.exec(`
        INSERT INTO cves (id, description, cvss_score, severity, published_at, modified_at, source)
        VALUES ('CVE-2024-12345', 'Test vulnerability', 9.8, 'CRITICAL', '2024-01-01', '2024-01-02', 'NVD')
      `)
      // Collides with migration 2's `ALTER TABLE cves RENAME TO cves_v1_backup`.
      db.exec('CREATE TABLE cves_v1_backup (id TEXT PRIMARY KEY)')
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString())

      const result = runMigrations(db, 1)

      expect(result.success).toBe(false)
      expect(result.toVersion).toBe(1)
      expect(result.migrationsApplied).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Migration 2')
      expect(isMigrationApplied(db, 2)).toBe(false)

      // No orphaned cves_v2 table, and the original v1 "cves" table/data is untouched -
      // proof the whole migration (not just the failing statement) rolled back.
      const tableNames = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
      ).map((row) => row.name)
      expect(tableNames).not.toContain('cves_v2')
      expect(tableNames).toContain('cves')

      const cvesColumns = (db.pragma('table_info(cves)') as Array<{ name: string }>).map((row) => row.name)
      expect(cvesColumns).not.toContain('cvss_v31_score')
      expect(db.prepare('SELECT description FROM cves WHERE id = ?').get('CVE-2024-12345')).toEqual({
        description: 'Test vulnerability',
      })
    })
  })

  describe('Migration 10: Performance Optimization for 250K+ CVEs', () => {
    beforeEach(() => {
      db.exec(`
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

      db.exec(`
        CREATE TABLE IF NOT EXISTS cpe_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          cpe23_uri TEXT NOT NULL,
          vulnerable INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      db.exec(`
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

      for (let i = 1; i <= 9; i++) {
        db.prepare('INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
          i,
          new Date().toISOString(),
        )
      }
    })

    it('should add parsed CPE columns to cpe_matches table', () => {
      const beforeColumns = (db.pragma('table_info(cpe_matches)') as Record<string, unknown>[]).map(
        (row) => row.name as string,
      )

      // Run migration 10
      const result = runMigrations(db, 9)

      expect(result.success).toBe(true)
      expect(result.toVersion).toBeGreaterThanOrEqual(10)

      // Verify new columns exist
      const afterColumns = (db.pragma('table_info(cpe_matches)') as Record<string, unknown>[]).map(
        (row) => row.name as string,
      )

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
      const columns = (db.pragma('table_info(cves)') as Record<string, unknown>[]).map((row) => row.name as string)
      expect(columns).toContain('published_year')
    })

    it('should create composite CPE indexes', () => {
      // Run migration 10
      runMigrations(db, 9)

      // Check for composite indexes
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cpe_%'").all()
      const indexNames = indexes.map((row) => (row as Record<string, unknown>).name as string)

      expect(indexNames).toContain('idx_cpe_vendor_product')
      expect(indexNames).toContain('idx_cpe_part_vendor_product')
      expect(indexNames).toContain('idx_cpe_full_lookup')
      expect(indexNames).toContain('idx_cpe_vuln_search')
    })

    it('should create composite CVE indexes for severity filtering', () => {
      runMigrations(db, 9)

      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cves_%'").all()
      const indexNames = indexes.map((row) => (row as Record<string, unknown>).name as string)

      expect(indexNames).toContain('idx_cves_severity_date')
      expect(indexNames).toContain('idx_cves_v31_severity_date')
      expect(indexNames).toContain('idx_cves_severity_score')
      expect(indexNames).toContain('idx_cves_dashboard')
      expect(indexNames).toContain('idx_cves_published_year')
      expect(indexNames).toContain('idx_cves_year_severity')
    })

    it('should parse existing CPE URIs and populate parsed columns', () => {
      // Insert test CVE
      db.exec(`
        INSERT INTO cves (id, description, severity, published_at, modified_at, source)
        VALUES ('CVE-2024-TEST', 'Test vulnerability', 'HIGH', '2024-01-01', '2024-01-02', 'NVD')
      `)

      db.exec(`
        INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable)
        VALUES ('CVE-2024-TEST', 'cpe:2.3:a:google:chrome:120.0:*:*:*:*:*:*:*', 1)
      `)

      runMigrations(db, 9)

      const cpeResult = db.prepare('SELECT cpe_part, cpe_vendor FROM cpe_matches WHERE cve_id = ?').all('CVE-2024-TEST')

      // Note: The parsing may be partial due to SQLite substring limitations
      // Just verify the columns exist and were updated
      expect(cpeResult.length).toBeGreaterThan(0)
    })

    it('parses legacy (CPE 2.2) and malformed CPE URIs defensively, without crashing or fabricating fields', () => {
      // Real synced/imported data spans years of NVD/legacy formats, so the JS parser must
      // degrade gracefully (leave columns NULL) instead of throwing or mis-assigning fields
      // for anything that isn't a well-formed CPE 2.3 URI.
      db.exec(`
        INSERT INTO cves (id, description, severity, published_at, modified_at, source) VALUES
          ('CVE-EDGE-SHORT', 'edge case', 'LOW', '2024-01-01', '2024-01-02', 'NVD'),
          ('CVE-EDGE-EMPTY', 'edge case', 'LOW', '2024-01-01', '2024-01-02', 'NVD'),
          ('CVE-EDGE-LEGACY-EMPTY', 'edge case', 'LOW', '2024-01-01', '2024-01-02', 'NVD'),
          ('CVE-EDGE-UNKNOWN', 'edge case', 'LOW', '2024-01-01', '2024-01-02', 'NVD')
      `)
      db.exec(`
        INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable) VALUES
          ('CVE-EDGE-SHORT', 'cpe:2.3:a', 1),
          ('CVE-EDGE-EMPTY', 'cpe:2.3::::', 1),
          ('CVE-EDGE-LEGACY-EMPTY', 'cpe:/:::', 1),
          ('CVE-EDGE-UNKNOWN', 'not-a-cpe-uri', 1)
      `)

      const result = runMigrations(db, 9)
      expect(result.success).toBe(true)

      const rows = db
        .prepare(
          'SELECT cve_id, cpe_part, cpe_vendor, cpe_product, cpe_version FROM cpe_matches WHERE cve_id LIKE ? ORDER BY cve_id',
        )
        .all('CVE-EDGE-%') as Array<{
        cve_id: string
        cpe_part: string | null
        cpe_vendor: string | null
        cpe_product: string | null
        cpe_version: string | null
      }>
      const byId = new Map(rows.map((row) => [row.cve_id, row]))

      // Too few colon-separated fields to trust: leave everything NULL.
      expect(byId.get('CVE-EDGE-SHORT')).toEqual({
        cve_id: 'CVE-EDGE-SHORT',
        cpe_part: null,
        cpe_vendor: null,
        cpe_product: null,
        cpe_version: null,
      })
      // Enough fields, but every one of them is an empty string: NULL, not ''.
      expect(byId.get('CVE-EDGE-EMPTY')).toEqual({
        cve_id: 'CVE-EDGE-EMPTY',
        cpe_part: null,
        cpe_vendor: null,
        cpe_product: null,
        cpe_version: null,
      })
      // Legacy CPE 2.2 (`cpe:/part:vendor:product:version`) with every segment empty.
      expect(byId.get('CVE-EDGE-LEGACY-EMPTY')).toEqual({
        cve_id: 'CVE-EDGE-LEGACY-EMPTY',
        cpe_part: null,
        cpe_vendor: null,
        cpe_product: null,
        cpe_version: null,
      })
      // Matches neither cpe:2.3: nor cpe:/ at all: no crash, no partial parse.
      expect(byId.get('CVE-EDGE-UNKNOWN')).toEqual({
        cve_id: 'CVE-EDGE-UNKNOWN',
        cpe_part: null,
        cpe_vendor: null,
        cpe_product: null,
        cpe_version: null,
      })
    })

    // BUG (discovered while writing coverage for this migration; not fixed here -
    // this test file is the only file this task is scoped to touch): migration 10's
    // parse loop does `SELECT rowid, cpe23_uri FROM cpe_matches ...`, but cpe_matches
    // (both the fresh-install and v1-upgrade CREATE TABLE statements) declares
    // `id INTEGER PRIMARY KEY AUTOINCREMENT`. In SQLite, once a table has a named
    // INTEGER PRIMARY KEY, that column IS the rowid, and better-sqlite3 reports the
    // result column back under its declared name ("id"), not the alias used in the
    // query ("rowid") - see the `t` vs `t2` comparison this was diagnosed with. So
    // `row.rowid` is always `undefined`, `updateStmt.run(part, vendor, product,
    // version, row.rowid)` runs `WHERE rowid = undefined` (matches zero rows), and
    // the parsed CPE columns are NEVER actually persisted for ANY row shape - even a
    // fully well-formed CPE 2.3 URI. This silently defeats every index migrations 10
    // and 13 build on top of cpe_part/cpe_vendor/cpe_product. It's asserted here via
    // `it.fails` (still executes/covers the parser) so the suite stays green and this
    // is visible rather than hidden; flip to a plain `it` once `row.rowid` is fixed to
    // read `row.id` (or the SELECT/UPDATE use an explicit alias, e.g. `rowid AS row_id`).
    it.fails('BUG: migration 10 never persists parsed CPE columns (row.rowid is always undefined)', () => {
      db.exec(`
        INSERT INTO cves (id, description, severity, published_at, modified_at, source) VALUES
          ('CVE-EDGE-BUG-V23', 'edge case', 'LOW', '2024-01-01', '2024-01-02', 'NVD'),
          ('CVE-EDGE-BUG-LEGACY', 'edge case', 'LOW', '2024-01-01', '2024-01-02', 'NVD'),
          ('CVE-EDGE-BUG-LEGACY-SHORT', 'edge case', 'LOW', '2024-01-01', '2024-01-02', 'NVD')
      `)
      db.exec(`
        INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable) VALUES
          ('CVE-EDGE-BUG-V23', 'cpe:2.3:a:google:chrome:120.0:*:*:*:*:*:*:*', 1),
          ('CVE-EDGE-BUG-LEGACY', 'cpe:/a:microsoft:windows_10:10', 1),
          ('CVE-EDGE-BUG-LEGACY-SHORT', 'cpe:/a', 1)
      `)

      runMigrations(db, 9)

      const rows = db
        .prepare('SELECT cve_id, cpe_part, cpe_vendor, cpe_product, cpe_version FROM cpe_matches ORDER BY cve_id')
        .all() as Array<{
        cve_id: string
        cpe_part: string | null
        cpe_vendor: string | null
        cpe_product: string | null
        cpe_version: string | null
      }>
      const byId = new Map(rows.map((row) => [row.cve_id, row]))

      expect(byId.get('CVE-EDGE-BUG-V23')).toEqual({
        cve_id: 'CVE-EDGE-BUG-V23',
        cpe_part: 'a',
        cpe_vendor: 'google',
        cpe_product: 'chrome',
        cpe_version: '120.0',
      })
      expect(byId.get('CVE-EDGE-BUG-LEGACY')).toEqual({
        cve_id: 'CVE-EDGE-BUG-LEGACY',
        cpe_part: 'a',
        cpe_vendor: 'microsoft',
        cpe_product: 'windows_10',
        cpe_version: '10',
      })
      // Only the part segment is present; vendor/product/version should stay NULL
      // rather than being guessed from a too-short legacy URI.
      expect(byId.get('CVE-EDGE-BUG-LEGACY-SHORT')).toEqual({
        cve_id: 'CVE-EDGE-BUG-LEGACY-SHORT',
        cpe_part: 'a',
        cpe_vendor: null,
        cpe_product: null,
        cpe_version: null,
      })
    })

    it('should populate published_year from existing CVEs', () => {
      // Insert test CVEs with different years
      db.exec(`
        INSERT INTO cves (id, description, severity, published_at, modified_at, source)
        VALUES
          ('CVE-2024-001', 'Test 2024', 'HIGH', '2024-06-15', '2024-06-16', 'NVD'),
          ('CVE-2023-001', 'Test 2023', 'MEDIUM', '2023-03-20', '2023-03-21', 'NVD'),
          ('CVE-2022-001', 'Test 2022', 'LOW', '2022-12-01', '2022-12-02', 'NVD')
      `)

      runMigrations(db, 9)

      const yearResult = db.prepare('SELECT id, published_year FROM cves ORDER BY published_at DESC').all()

      expect(yearResult.length).toBeGreaterThan(0)
      expect(yearResult.length).toBe(3)

      expect((yearResult[0] as Record<string, unknown>).published_year).toBe(2024)
      expect((yearResult[1] as Record<string, unknown>).published_year).toBe(2023)
      expect((yearResult[2] as Record<string, unknown>).published_year).toBe(2022)
    })

    it('should handle databases with no existing data', () => {
      // Run migration 10 on empty tables
      const result = runMigrations(db, 9)

      expect(result.success).toBe(true)

      // Verify indexes were created even on empty tables
      const cpeIndexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cpe_%'").all()
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

  // runMigrations() only re-invokes a migration's up() the first time its version is
  // unapplied (it skips anything <= currentVersion), so the earlier "idempotent" tests
  // never actually re-execute a migration body against columns/tables it already added.
  // These tests call up() directly a second time to prove each column-exists guard
  // (`if (!existingColumns.includes(...))`) really does skip the ALTER instead of
  // throwing "duplicate column name" - which is the scenario the guard exists for.
  describe('Idempotent up() re-application (column/table already exists)', () => {
    beforeEach(() => {
      const result = runMigrations(db, 0)
      expect(result.success).toBe(true)
    })

    it('migration 8 (sync_status_enhanced) skips columns that already exist', () => {
      const before = (db.pragma('table_info(sync_status)') as Array<{ name: string }>).map((row) => row.name)

      expect(() => getMigrationByVersion(8).up(db)).not.toThrow()

      const after = (db.pragma('table_info(sync_status)') as Array<{ name: string }>).map((row) => row.name)
      expect(after).toEqual(before)
    })

    it('migration 10 (performance_250k) skips cpe_matches/cves columns that already exist', () => {
      const beforeCpe = (db.pragma('table_info(cpe_matches)') as Array<{ name: string }>).map((row) => row.name)
      const beforeCves = (db.pragma('table_info(cves)') as Array<{ name: string }>).map((row) => row.name)

      expect(() => getMigrationByVersion(10).up(db)).not.toThrow()

      expect((db.pragma('table_info(cpe_matches)') as Array<{ name: string }>).map((row) => row.name)).toEqual(
        beforeCpe,
      )
      expect((db.pragma('table_info(cves)') as Array<{ name: string }>).map((row) => row.name)).toEqual(beforeCves)
    })

    it('migration 11 (kev_catalog) skips re-adding the is_kev column', () => {
      const before = (db.pragma('table_info(cves)') as Array<{ name: string }>).map((row) => row.name)

      expect(() => getMigrationByVersion(11).up(db)).not.toThrow()

      const after = (db.pragma('table_info(cves)') as Array<{ name: string }>).map((row) => row.name)
      expect(after).toEqual(before)
    })

    it('migration 12 (epss_columns) skips re-adding the EPSS columns', () => {
      const before = (db.pragma('table_info(cves)') as Array<{ name: string }>).map((row) => row.name)

      expect(() => getMigrationByVersion(12).up(db)).not.toThrow()

      const after = (db.pragma('table_info(cves)') as Array<{ name: string }>).map((row) => row.name)
      expect(after).toEqual(before)
    })

    it('migration 14 (sync_bandwidth_limit) skips re-adding bandwidth_limit_kbps', () => {
      const before = (db.pragma('table_info(sync_status)') as Array<{ name: string }>).map((row) => row.name)

      expect(() => getMigrationByVersion(14).up(db)).not.toThrow()

      const after = (db.pragma('table_info(sync_status)') as Array<{ name: string }>).map((row) => row.name)
      expect(after).toEqual(before)
    })
  })

  describe('rollbackToVersion', () => {
    it('rolls a fresh-install database back to v1, undoing every migration (no v1 backups to restore)', () => {
      const upResult = runMigrations(db, 0)
      expect(upResult.success).toBe(true)
      const latest = getSchemaVersion(db)

      const result = rollbackToVersion(db, 1, latest)

      expect(result.success).toBe(true)
      expect(result.toVersion).toBe(1)
      expect(result.migrationsApplied).toBe(latest - 1)

      const tableNames = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
      ).map((row) => row.name)

      expect(tableNames).not.toContain('cwe_references')
      expect(tableNames).not.toContain('sync_status')
      expect(tableNames).not.toContain('download_queue')
      expect(tableNames).not.toContain('cves_fts')
      expect(tableNames).not.toContain('cvss_metrics')
      expect(tableNames).not.toContain('kev_catalog')
      expect(tableNames).not.toContain('settings')

      // Fresh-install cves/cpe_matches have no *_v1_backup, so migrations 2/4's down()
      // is documented to no-op: there is nothing to restore them to, so they remain.
      expect(tableNames).toContain('cves')
      expect(tableNames).toContain('cpe_matches')

      for (let version = 2; version <= latest; version++) {
        expect(isMigrationApplied(db, version)).toBe(false)
      }
    })

    it('restores v1 cves/cpe_matches/references tables from their *_v1_backup tables on rollback', () => {
      db.exec(`
        CREATE TABLE cves (
          id TEXT PRIMARY KEY, description TEXT NOT NULL, cvss_score REAL, cvss_vector TEXT,
          severity TEXT, published_at TEXT NOT NULL, modified_at TEXT NOT NULL, source TEXT NOT NULL
        )
      `)
      db.exec(`
        INSERT INTO cves (id, description, cvss_score, severity, published_at, modified_at, source)
        VALUES ('CVE-2024-12345', 'Test vulnerability', 9.8, 'CRITICAL', '2024-01-01', '2024-01-02', 'NVD')
      `)
      db.exec(`
        CREATE TABLE cpe_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT, cve_id TEXT NOT NULL, cpe_text TEXT NOT NULL,
          vulnerable INTEGER NOT NULL DEFAULT 1
        )
      `)
      db.exec(`
        INSERT INTO cpe_matches (cve_id, cpe_text, vulnerable)
        VALUES ('CVE-2024-12345', 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*', 1)
      `)
      db.exec(`
        CREATE TABLE "references" (
          id INTEGER PRIMARY KEY AUTOINCREMENT, cve_id TEXT NOT NULL, url TEXT NOT NULL, source TEXT, tags TEXT
        )
      `)
      db.exec(`
        INSERT INTO "references" (cve_id, url, source, tags)
        VALUES ('CVE-2024-12345', 'https://example.com/advisory', 'NVD', 'exploit')
      `)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(1, new Date().toISOString())

      const upResult = runMigrations(db, 1)
      expect(upResult.success).toBe(true)
      const backupsBefore = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_v1_backup'").all() as Array<{
          name: string
        }>
      ).map((row) => row.name)
      expect(backupsBefore.sort()).toEqual(['cpe_matches_v1_backup', 'cves_v1_backup', 'references_v1_backup'])

      const result = rollbackToVersion(db, 1, getSchemaVersion(db))
      expect(result.success).toBe(true)

      const cvesColumns = (db.pragma('table_info(cves)') as Array<{ name: string }>).map((row) => row.name)
      expect(cvesColumns).not.toContain('cvss_v31_score')
      expect(db.prepare('SELECT description FROM cves WHERE id = ?').get('CVE-2024-12345')).toEqual({
        description: 'Test vulnerability',
      })

      const cpeColumns = (db.pragma('table_info(cpe_matches)') as Array<{ name: string }>).map((row) => row.name)
      expect(cpeColumns).toContain('cpe_text')
      expect(cpeColumns).not.toContain('cpe23_uri')

      const refColumns = (db.pragma('table_info("references")') as Array<{ name: string }>).map((row) => row.name)
      expect(refColumns).not.toContain('reference_type')
      expect(db.prepare('SELECT url FROM "references" WHERE cve_id = ?').get('CVE-2024-12345')).toEqual({
        url: 'https://example.com/advisory',
      })
    })

    it('only rolls back migrations strictly between targetVersion and currentVersion', () => {
      const upResult = runMigrations(db, 0)
      expect(upResult.success).toBe(true)

      // Simulate a database that has only ever been migrated up to v10 (currentVersion
      // param = 10) even though getMigrations() knows about later versions, and roll
      // back to v5. Versions outside (5, 10] must be left completely alone.
      const result = rollbackToVersion(db, 5, 10)

      expect(result.success).toBe(true)
      expect(result.toVersion).toBe(5)
      expect(result.migrationsApplied).toBe(5) // versions 6..10

      expect(isMigrationApplied(db, 11)).toBe(true)
      expect(isMigrationApplied(db, 15)).toBe(true)
      expect(isMigrationApplied(db, 6)).toBe(false)
      expect(isMigrationApplied(db, 10)).toBe(false)
      expect(isMigrationApplied(db, 5)).toBe(true)
      expect(isMigrationApplied(db, 2)).toBe(true)

      const tableNames = (
        db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>
      ).map((row) => row.name)
      // Migration 11 (>10) was skipped, so its table survives.
      expect(tableNames).toContain('kev_catalog')
      // Migration 6 (in the 6..10 range) was rolled back, so its tables are gone.
      expect(tableNames).not.toContain('sync_status')
    })

    it('stops and reports failure if a down() migration throws, without undoing migrations already rolled back', () => {
      const upResult = runMigrations(db, 0)
      expect(upResult.success).toBe(true)
      const latest = getSchemaVersion(db)

      // Force migration 3's unconditional `DROP TABLE IF EXISTS cwe_references` to throw:
      // SQLite errors (even with IF EXISTS) when the name resolves to a VIEW, not a table.
      db.exec('DROP TABLE cwe_references')
      db.exec('CREATE VIEW cwe_references AS SELECT 1 AS x')

      const result = rollbackToVersion(db, 1, latest)

      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Rollback 3')

      // Migrations above 3 (15..4) were rolled back before the failure...
      expect(isMigrationApplied(db, 4)).toBe(false)
      // ...but migration.down(db) is NOT wrapped in a transaction (unlike up()'s path in
      // runMigrations), so the failed step at 3 does not undo the ones already rolled
      // back before it, and 3 itself (plus everything below it) is left applied.
      expect(isMigrationApplied(db, 3)).toBe(true)
      expect(isMigrationApplied(db, 2)).toBe(true)
    })
  })
})
