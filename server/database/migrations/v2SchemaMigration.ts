/**
 * Database Schema Migration System
 *
 * Handles migration from schema v1 to v2 with:
 * - Enhanced CVE table with separate CVSS v3.1, v3.0, v2.0 fields
 * - CWE references table
 * - CPE matches with version ranges
 * - Enhanced references with type information
 * - Sync status tracking
 * - FTS5 full-text search
 */

import type BetterSqlite3 from 'better-sqlite3'

type Database = InstanceType<typeof BetterSqlite3>

/**
 * Migration definition
 */
export interface Migration {
  version: number
  name: string
  description: string
  up: (db: Database) => void
  down: (db: Database) => void
}

/**
 * Migration result
 */
export interface MigrationResult {
  success: boolean
  fromVersion: number
  toVersion: number
  migrationsApplied: number
  errors: string[]
  durationMs: number
}

/**
 * Get all available migrations in order
 */
export function getMigrations(): Migration[] {
  return [
    migration_2_cve_cvss_v2(),
    migration_3_cwe_references(),
    migration_4_cpe_version_ranges(),
    migration_5_enhanced_references(),
    migration_6_sync_status(),
    migration_7_fts5_search(),
    migration_8_sync_status_enhanced(),
    migration_9_cvss_metrics(),
    migration_10_performance_250k(),
    migration_11_kev_catalog(),
    migration_12_epss_columns(),
    migration_13_cpe_product_index(),
  ]
}

/**
 * Migration 2: Enhanced CVE table with separate CVSS versions
 */
function migration_2_cve_cvss_v2(): Migration {
  return {
    version: 2,
    name: 'cve_cvss_v2',
    description: 'Enhanced CVE table with separate CVSS v3.1, v3.0, and v2.0 fields',
    up: (db: Database) => {
      // Check if v1 cves table exists
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cves'")
        .all() as Array<{ name: string }>

      if (tableExists.length > 0) {
        // Migration path: v1 exists, need to migrate data

        // Create new CVEs table with enhanced schema
        db.exec(`
          CREATE TABLE IF NOT EXISTS cves_v2 (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            -- CVSS v3.1
            cvss_v31_score REAL,
            cvss_v31_vector TEXT,
            cvss_v31_severity TEXT CHECK(cvss_v31_severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
            -- CVSS v3.0
            cvss_v30_score REAL,
            cvss_v30_vector TEXT,
            cvss_v30_severity TEXT CHECK(cvss_v30_severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
            -- CVSS v2.0
            cvss_v2_score REAL,
            cvss_v2_vector TEXT,
            cvss_v2_severity TEXT,
            -- Legacy fields (for backward compatibility)
            cvss_score REAL,
            cvss_vector TEXT,
            severity TEXT CHECK(severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
            -- Dates
            published_at TEXT NOT NULL,
            modified_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            -- Source tracking
            source TEXT NOT NULL DEFAULT 'NVD',
            -- Additional metadata
            vuln_status TEXT,
            assigner TEXT,
            -- Sync tracking
            last_synced_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)

        // Create indexes for v2 table
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_v2_published ON cves_v2(published_at)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_v2_modified ON cves_v2(modified_at)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_v2_severity ON cves_v2(severity)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_v2_v31_severity ON cves_v2(cvss_v31_severity)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_v2_v31_score ON cves_v2(cvss_v31_score)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_v2_source ON cves_v2(source)')

        // Migrate existing data from cves to cves_v2
        db.exec(`
          INSERT OR IGNORE INTO cves_v2 (
            id, description,
            cvss_score, cvss_vector, severity,
            cvss_v31_score, cvss_v31_vector, cvss_v31_severity,
            published_at, modified_at, source
          )
          SELECT
            id, description,
            cvss_score, cvss_vector, severity,
            cvss_score, cvss_vector, severity,
            published_at, modified_at, source
          FROM cves
        `)

        // Rename old table
        db.exec('ALTER TABLE cves RENAME TO cves_v1_backup')

        // Rename new table to cves
        db.exec('ALTER TABLE cves_v2 RENAME TO cves')

        // Recreate indexes on the renamed table
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_severity ON cves(severity)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_cvss_score ON cves(cvss_score)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_published_at ON cves(published_at)')
      } else {
        // Fresh install: create v2 schema directly
        db.exec(`
          CREATE TABLE IF NOT EXISTS cves (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            -- CVSS v3.1
            cvss_v31_score REAL,
            cvss_v31_vector TEXT,
            cvss_v31_severity TEXT CHECK(cvss_v31_severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
            -- CVSS v3.0
            cvss_v30_score REAL,
            cvss_v30_vector TEXT,
            cvss_v30_severity TEXT CHECK(cvss_v30_severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
            -- CVSS v2.0
            cvss_v2_score REAL,
            cvss_v2_vector TEXT,
            cvss_v2_severity TEXT,
            -- Legacy fields (for backward compatibility)
            cvss_score REAL,
            cvss_vector TEXT,
            severity TEXT CHECK(severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
            -- Dates
            published_at TEXT NOT NULL,
            modified_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            -- Source tracking
            source TEXT NOT NULL DEFAULT 'NVD',
            -- Additional metadata
            vuln_status TEXT,
            assigner TEXT,
            -- Sync tracking
            last_synced_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `)

        // Create indexes
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_published ON cves(published_at)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_modified ON cves(modified_at)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_severity ON cves(severity)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_v31_severity ON cves(cvss_v31_severity)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_v31_score ON cves(cvss_v31_score)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_cvss_score ON cves(cvss_score)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_published_at ON cves(published_at)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cves_source ON cves(source)')
      }
    },
    down: (db: Database) => {
      // Check if backup exists
      const backupExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_v1_backup'")
        .all() as Array<{ name: string }>

      if (backupExists.length > 0) {
        // Drop new table
        db.exec('DROP TABLE IF EXISTS cves')

        // Restore backup
        db.exec('ALTER TABLE cves_v1_backup RENAME TO cves')
      }
    },
  }
}

/**
 * Migration 3: CWE references table
 */
function migration_3_cwe_references(): Migration {
  return {
    version: 3,
    name: 'cwe_references',
    description: 'Add CWE (Common Weakness Enumeration) references table',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cwe_references (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          cwe_id TEXT NOT NULL,
          description TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      // Create indexes
      db.exec('CREATE INDEX IF NOT EXISTS idx_cwe_cve ON cwe_references(cve_id)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_cwe_id ON cwe_references(cve_id)')
    },
    down: (db: Database) => {
      db.exec('DROP TABLE IF EXISTS cwe_references')
    },
  }
}

/**
 * Migration 4: CPE matches with version ranges
 */
function migration_4_cpe_version_ranges(): Migration {
  return {
    version: 4,
    name: 'cpe_version_ranges',
    description: 'Enhanced CPE matches with version range support',
    up: (db: Database) => {
      // Check if v1 cpe_matches table exists
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cpe_matches'")
        .all() as Array<{ name: string }>

      if (tableExists.length > 0) {
        // Migration path: v1 exists
        db.exec(`
          CREATE TABLE IF NOT EXISTS cpe_matches_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cve_id TEXT NOT NULL,
            cpe23_uri TEXT NOT NULL,
            vulnerable INTEGER NOT NULL DEFAULT 1,
            -- Version range
            version_start_including TEXT,
            version_start_excluding TEXT,
            version_end_including TEXT,
            version_end_excluding TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
          )
        `)

        // Create indexes
        db.exec('CREATE INDEX IF NOT EXISTS idx_cpes_v2_cve ON cpe_matches_v2(cve_id)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cpes_v2_uri ON cpe_matches_v2(cpe23_uri)')

        // Migrate existing data
        db.exec(`
          INSERT OR IGNORE INTO cpe_matches_v2 (cve_id, cpe23_uri, vulnerable)
          SELECT cve_id, cpe_text, vulnerable FROM cpe_matches
        `)

        // Rename old table
        db.exec('ALTER TABLE cpe_matches RENAME TO cpe_matches_v1_backup')

        // Rename new table
        db.exec('ALTER TABLE cpe_matches_v2 RENAME TO cpe_matches')

        // Recreate indexes
        db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cve_id ON cpe_matches(cve_id)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cpe_text ON cpe_matches(cpe23_uri)')
      } else {
        // Fresh install: create v2 schema directly
        db.exec(`
          CREATE TABLE IF NOT EXISTS cpe_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cve_id TEXT NOT NULL,
            cpe23_uri TEXT NOT NULL,
            vulnerable INTEGER NOT NULL DEFAULT 1,
            -- Version range
            version_start_including TEXT,
            version_start_excluding TEXT,
            version_end_including TEXT,
            version_end_excluding TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
          )
        `)

        // Create indexes
        db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cve_id ON cpe_matches(cve_id)')
        db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cpe_text ON cpe_matches(cpe23_uri)')
      }
    },
    down: (db: Database) => {
      const backupExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cpe_matches_v1_backup'")
        .all() as Array<{ name: string }>

      if (backupExists.length > 0) {
        db.exec('DROP TABLE IF EXISTS cpe_matches')
        db.exec('ALTER TABLE cpe_matches_v1_backup RENAME TO cpe_matches')
      }
    },
  }
}

/**
 * Migration 5: Enhanced references with type information
 */
function migration_5_enhanced_references(): Migration {
  return {
    version: 5,
    name: 'enhanced_references',
    description: 'Enhanced references with type and source information',
    up: (db: Database) => {
      // Check if v1 references table exists
      const tableExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='references'")
        .all() as Array<{ name: string }>

      if (tableExists.length > 0) {
        // Migration path: v1 exists
        db.exec(`
          CREATE TABLE IF NOT EXISTS references_v2 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cve_id TEXT NOT NULL,
            url TEXT NOT NULL,
            source TEXT,
            tags TEXT,
            reference_type TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
          )
        `)

        // Create indexes
        db.exec('CREATE INDEX IF NOT EXISTS idx_refs_v2_cve ON references_v2(cve_id)')

        // Migrate existing data
        db.exec(`
          INSERT OR IGNORE INTO references_v2 (cve_id, url, source, tags)
          SELECT cve_id, url, source, tags FROM "references"
        `)

        // Rename old table
        db.exec('ALTER TABLE "references" RENAME TO references_v1_backup')

        // Rename new table
        db.exec('ALTER TABLE references_v2 RENAME TO "references"')

        // Recreate index
        db.exec('CREATE INDEX IF NOT EXISTS idx_references_cve_id ON "references"(cve_id)')
      } else {
        // Fresh install: create v2 schema directly
        db.exec(`
          CREATE TABLE IF NOT EXISTS "references" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cve_id TEXT NOT NULL,
            url TEXT NOT NULL,
            source TEXT,
            tags TEXT,
            reference_type TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
          )
        `)

        // Create index
        db.exec('CREATE INDEX IF NOT EXISTS idx_references_cve_id ON "references"(cve_id)')
      }
    },
    down: (db: Database) => {
      const backupExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='references_v1_backup'")
        .all() as Array<{ name: string }>

      if (backupExists.length > 0) {
        db.exec('DROP TABLE IF EXISTS "references"')
        db.exec('ALTER TABLE references_v1_backup RENAME TO "references"')
      }
    },
  }
}

/**
 * Migration 6: Sync status tracking
 */
function migration_6_sync_status(): Migration {
  return {
    version: 6,
    name: 'sync_status',
    description: 'Add sync status tracking and download queue tables',
    up: (db: Database) => {
      // Sync status table
      db.exec(`
        CREATE TABLE IF NOT EXISTS sync_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT NOT NULL,
          year INTEGER,
          last_sync_at TEXT NOT NULL,
          total_cves INTEGER DEFAULT 0,
          cves_synced INTEGER DEFAULT 0,
          last_error TEXT,
          sync_duration_ms INTEGER,
          status TEXT NOT NULL DEFAULT 'idle',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)

      // Download queue table
      db.exec(`
        CREATE TABLE IF NOT EXISTS download_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          year INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          started_at TEXT,
          completed_at TEXT,
          error_message TEXT,
          retry_count INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)

      // Create indexes
      db.exec('CREATE INDEX IF NOT EXISTS idx_sync_source ON sync_status(source)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_sync_year ON sync_status(year)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_queue_status ON download_queue(status)')
    },
    down: (db: Database) => {
      db.exec('DROP TABLE IF EXISTS sync_status')
      db.exec('DROP TABLE IF EXISTS download_queue')
    },
  }
}

/**
 * Migration 7: FTS5 full-text search
 */
function migration_7_fts5_search(): Migration {
  return {
    version: 7,
    name: 'fts5_search',
    description: 'Add FTS5 full-text search for CVE descriptions',
    up: (db: Database) => {
      // Check if FTS5 is available
      try {
        // Create FTS5 virtual table for CVE descriptions
        db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS cves_fts USING fts5(
            id,
            description,
            content='cves',
            content_rowid='rowid',
            tokenize='porter unicode61'
          )
        `)

        // Create triggers to keep FTS in sync
        db.exec(`
          CREATE TRIGGER IF NOT EXISTS cves_fts_insert AFTER INSERT ON cves BEGIN
            INSERT INTO cves_fts(rowid, id, description)
            VALUES (new.rowid, new.id, new.description);
          END
        `)

        db.exec(`
          CREATE TRIGGER IF NOT EXISTS cves_fts_delete AFTER DELETE ON cves BEGIN
            INSERT INTO cves_fts(cves_fts, rowid, id, description)
            VALUES ('delete', old.rowid, old.id, old.description);
          END
        `)

        db.exec(`
          CREATE TRIGGER IF NOT EXISTS cves_fts_update AFTER UPDATE ON cves BEGIN
            INSERT INTO cves_fts(cves_fts, rowid, id, description)
            VALUES ('delete', old.rowid, old.id, old.description);
            INSERT INTO cves_fts(rowid, id, description)
            VALUES (new.rowid, new.id, new.description);
          END
        `)

        // Populate FTS with existing data
        db.exec(`
          INSERT INTO cves_fts(rowid, id, description)
          SELECT rowid, id, description FROM cves
        `)
      } catch (error) {
        // FTS5 might not be available in all SQLite builds
        console.warn('FTS5 not available, skipping full-text search setup:', error)
      }
    },
    down: (db: Database) => {
      db.exec('DROP TABLE IF EXISTS cves_fts')
      db.exec('DROP TRIGGER IF EXISTS cves_fts_insert')
      db.exec('DROP TRIGGER IF EXISTS cves_fts_delete')
      db.exec('DROP TRIGGER IF EXISTS cves_fts_update')
    },
  }
}

/**
 * Migration 8: Enhanced sync status with auto-sync fields
 */
function migration_8_sync_status_enhanced(): Migration {
  return {
    version: 8,
    name: 'sync_status_enhanced',
    description: 'Add auto-sync fields to sync_status table',
    up: (db: Database) => {
      // Check if columns already exist
      const tableInfo = db.pragma('table_info(sync_status)') as Array<{ name: string }>
      const existingColumns = tableInfo.map((row) => row.name)

      // Add last_successful_sync_at if not exists
      if (!existingColumns.includes('last_successful_sync_at')) {
        db.exec('ALTER TABLE sync_status ADD COLUMN last_successful_sync_at TEXT')
      }

      // Add next_scheduled_sync if not exists
      if (!existingColumns.includes('next_scheduled_sync')) {
        db.exec('ALTER TABLE sync_status ADD COLUMN next_scheduled_sync TEXT')
      }

      // Add auto_sync_enabled if not exists
      if (!existingColumns.includes('auto_sync_enabled')) {
        db.exec('ALTER TABLE sync_status ADD COLUMN auto_sync_enabled INTEGER DEFAULT 0')
      }

      // Add auto_sync_interval_hours if not exists
      if (!existingColumns.includes('auto_sync_interval_hours')) {
        db.exec('ALTER TABLE sync_status ADD COLUMN auto_sync_interval_hours INTEGER DEFAULT 24')
      }
    },
    down: (_db: Database) => {},
  }
}

/**
 * Migration 9: CVSS metrics table for multiple CVSS entries
 */
function migration_9_cvss_metrics(): Migration {
  return {
    version: 9,
    name: 'cvss_metrics',
    description: 'Add cvss_metrics table for storing multiple CVSS scores from different sources',
    up: (db: Database) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cvss_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          source TEXT NOT NULL,
          type TEXT,
          version TEXT NOT NULL,
          score REAL NOT NULL,
          severity TEXT,
          vector TEXT,
          exploitability_score REAL,
          impact_score REAL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      // Create index for faster lookups by CVE ID
      db.exec('CREATE INDEX IF NOT EXISTS idx_cvss_metrics_cve_id ON cvss_metrics(cve_id)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_cvss_metrics_source ON cvss_metrics(source)')
    },
    down: (db: Database) => {
      db.exec('DROP INDEX IF EXISTS idx_cvss_metrics_cve_id')
      db.exec('DROP INDEX IF EXISTS idx_cvss_metrics_source')
      db.exec('DROP TABLE IF EXISTS cvss_metrics')
    },
  }
}

/**
 * Migration 10: Performance optimization for 250K+ CVEs
 *
 * This migration adds:
 * 1. Parsed CPE columns (part, vendor, product, version) for fast component lookups
 * 2. Composite indexes for CPE-based vulnerability searches
 * 3. Composite indexes for severity + date filtering
 * 4. Year-based index for efficient year-range queries
 * 5. Enhanced FTS5 configuration for sub-second text searches
 */
function migration_10_performance_250k(): Migration {
  return {
    version: 10,
    name: 'performance_250k',
    description: 'Performance optimization for 250K+ CVEs with composite indexes and parsed CPE columns',
    up: (db: Database) => {
      console.log('[Migration 10] Starting performance optimization for 250K+ CVEs...')

      // ========================================
      // 1. Add parsed CPE columns to cpe_matches
      // ========================================
      const cpeTableInfo = db.pragma('table_info(cpe_matches)') as Array<{ name: string }>
      const cpeColumns = cpeTableInfo.map((row) => row.name)

      // Add parsed CPE component columns for fast lookups
      if (!cpeColumns.includes('cpe_part')) {
        db.exec('ALTER TABLE cpe_matches ADD COLUMN cpe_part TEXT')
      }
      if (!cpeColumns.includes('cpe_vendor')) {
        db.exec('ALTER TABLE cpe_matches ADD COLUMN cpe_vendor TEXT')
      }
      if (!cpeColumns.includes('cpe_product')) {
        db.exec('ALTER TABLE cpe_matches ADD COLUMN cpe_product TEXT')
      }
      if (!cpeColumns.includes('cpe_version')) {
        db.exec('ALTER TABLE cpe_matches ADD COLUMN cpe_version TEXT')
      }

      console.log('[Migration 10] Added parsed CPE columns')

      // ========================================
      // 2. Parse existing CPE URIs to populate new columns (JS-based)
      // ========================================
      // CPE 2.3 format: cpe:2.3:<part>:<vendor>:<product>:<version>:...
      // CPE 2.2 format: cpe:/<part>:<vendor>:<product>:<version>:...
      // SQL SUBSTR is unreliable for CPE parsing due to variable-length escaped chars;
      // use JS split(':') then batch-update via prepared statements.
      const unParsedRows = db
        .prepare('SELECT rowid, cpe23_uri FROM cpe_matches WHERE cpe23_uri IS NOT NULL AND cpe_part IS NULL')
        .all() as Array<{ rowid: number; cpe23_uri: string }>
      if (unParsedRows.length > 0) {
        const updateStmt = db.prepare(
          'UPDATE cpe_matches SET cpe_part = ?, cpe_vendor = ?, cpe_product = ?, cpe_version = ? WHERE rowid = ?',
        )
        let parsedCount = 0
        for (const row of unParsedRows) {
          const rowid = row.rowid
          const uri = row.cpe23_uri
          let part: string | null = null
          let vendor: string | null = null
          let product: string | null = null
          let version: string | null = null

          if (uri.startsWith('cpe:2.3:')) {
            const parts = uri.split(':')
            if (parts.length >= 6) {
              part = parts[2] || null
              vendor = parts[3] || null
              product = parts[4] || null
              version = parts[5] || null
            }
          } else if (uri.startsWith('cpe:/')) {
            const segments = uri.substring(5).split(':')
            if (segments.length >= 1) part = segments[0] || null
            if (segments.length >= 2) vendor = segments[1] || null
            if (segments.length >= 3) product = segments[2] || null
            if (segments.length >= 4) version = segments[3] || null
          }

          if (part || vendor || product || version) {
            updateStmt.run(part, vendor, product, version, rowid)
            parsedCount++
          }
        }
        console.log(`[Migration 10] Parsed ${parsedCount} CPE URIs via JS`)
      } else {
        console.log('[Migration 10] No unparsed CPE URIs found')
      }

      // ========================================
      // 3. Create composite indexes for CPE lookups
      // ========================================

      // Index for looking up vulnerabilities by vendor + product (most common query)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cpe_vendor_product
        ON cpe_matches(cpe_vendor, cpe_product, vulnerable)
      `)

      // Index for looking up by part (application/os/hardware) + vendor + product
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cpe_part_vendor_product
        ON cpe_matches(cpe_part, cpe_vendor, cpe_product)
      `)

      // Index for full CPE lookup with version
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cpe_full_lookup
        ON cpe_matches(cpe_vendor, cpe_product, cpe_version, vulnerable)
      `)

      // Covering index for CPE vulnerability searches (includes CVE ID for join optimization)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cpe_vuln_search
        ON cpe_matches(cpe_vendor, cpe_product, vulnerable, cve_id)
      `)

      console.log('[Migration 10] Created CPE composite indexes')

      // ========================================
      // 4. Create composite indexes for CVE filtering
      // ========================================

      // Index for severity + date queries (common filter: HIGH/CRITICAL CVEs in date range)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cves_severity_date
        ON cves(severity, published_at DESC)
      `)

      // Index for CVSS v3.1 severity + date queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cves_v31_severity_date
        ON cves(cvss_v31_severity, published_at DESC)
      `)

      // Index for severity + score (filter by severity, sort by score)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cves_severity_score
        ON cves(severity, cvss_score DESC)
      `)

      // Index for source + published date (filter by source, sort by date)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cves_source_date
        ON cves(source, published_at DESC)
      `)

      // Covering index for common dashboard queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cves_dashboard
        ON cves(published_at DESC, severity, cvss_score DESC)
      `)

      console.log('[Migration 10] Created CVE composite indexes')

      // ========================================
      // 5. Create year-based index for efficient year queries
      // ========================================

      // Create expression index using generated column for year
      // First check if published_year column exists
      const cvesTableInfo = db.pragma('table_info(cves)') as Array<{ name: string }>
      const cvesColumns = cvesTableInfo.map((row) => row.name)

      if (!cvesColumns.includes('published_year')) {
        db.exec('ALTER TABLE cves ADD COLUMN published_year INTEGER')
      }

      // Populate published_year from existing data
      db.exec(`
        UPDATE cves
        SET published_year = CAST(SUBSTR(published_at, 1, 4) AS INTEGER)
        WHERE published_at IS NOT NULL AND published_year IS NULL
      `)

      // Create index on year for efficient year-based queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cves_published_year
        ON cves(published_year DESC)
      `)

      // Composite index for year + severity (common query: "all HIGH CVEs from 2024")
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cves_year_severity
        ON cves(published_year, severity)
      `)

      console.log('[Migration 10] Created year-based indexes')

      // ========================================
      // 6. Optimize FTS5 for better search performance
      // ========================================

      // Check if FTS5 table exists
      const ftsExists = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'")
        .all() as Array<{ name: string }>

      if (ftsExists.length > 0) {
        // Rebuild FTS index for optimal performance with 250K+ records
        try {
          db.exec("INSERT INTO cves_fts(cves_fts) VALUES('optimize')")
          console.log('[Migration 10] Optimized FTS5 index')
        } catch (error) {
          console.warn('[Migration 10] FTS5 optimize failed (non-critical):', error)
        }
      }

      // ========================================
      // 7. Create indexes for joined queries
      // ========================================

      // Index for CVE + CPE joined queries with severity filter
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cpe_matches_vulnerable_cve
        ON cpe_matches(vulnerable, cve_id)
      `)

      // Index for CVSS metrics lookups by score range
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cvss_metrics_score
        ON cvss_metrics(score DESC)
      `)

      console.log('[Migration 10] Created additional join indexes')

      // ========================================
      // 8. Analyze tables for query optimizer
      // ========================================
      db.exec('ANALYZE')

      console.log('[Migration 10] Performance optimization complete')
    },
    down: (db: Database) => {
      // Drop composite CPE indexes
      db.exec('DROP INDEX IF EXISTS idx_cpe_vendor_product')
      db.exec('DROP INDEX IF EXISTS idx_cpe_part_vendor_product')
      db.exec('DROP INDEX IF EXISTS idx_cpe_full_lookup')
      db.exec('DROP INDEX IF EXISTS idx_cpe_vuln_search')
      db.exec('DROP INDEX IF EXISTS idx_cpe_matches_vulnerable_cve')

      // Drop composite CVE indexes
      db.exec('DROP INDEX IF EXISTS idx_cves_severity_date')
      db.exec('DROP INDEX IF EXISTS idx_cves_v31_severity_date')
      db.exec('DROP INDEX IF EXISTS idx_cves_severity_score')
      db.exec('DROP INDEX IF EXISTS idx_cves_source_date')
      db.exec('DROP INDEX IF EXISTS idx_cves_dashboard')
      db.exec('DROP INDEX IF EXISTS idx_cves_published_year')
      db.exec('DROP INDEX IF EXISTS idx_cves_year_severity')

      // Drop CVSS metrics score index
      db.exec('DROP INDEX IF EXISTS idx_cvss_metrics_score')

      // Note: We don't drop the columns since SQLite doesn't support DROP COLUMN
      // The columns will remain but be unused
    },
  }
}

/**
 * Migration 11: KEV (Known Exploited Vulnerabilities) catalog
 *
 * Stores CISA KEV entries for exploit intelligence.
 * Used by KevService to identify actively exploited vulnerabilities.
 */
function migration_11_kev_catalog(): Migration {
  return {
    version: 11,
    name: 'kev_catalog',
    description: 'Add KEV catalog table for CISA Known Exploited Vulnerabilities',
    up: (db: Database) => {
      console.log('[Migration 11] Creating KEV catalog table...')

      // Create KEV catalog table
      db.exec(`
        CREATE TABLE IF NOT EXISTS kev_catalog (
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

      // Create indexes for efficient lookups
      db.exec('CREATE INDEX IF NOT EXISTS idx_kev_date_added ON kev_catalog(date_added)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_kev_vendor ON kev_catalog(vendor_project)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_kev_product ON kev_catalog(product)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_kev_ransomware ON kev_catalog(known_ransomware_use)')

      // Add is_kev column to cves table for fast lookups
      const cvesTableInfo = db.pragma('table_info(cves)') as Array<{ name: string }>
      const cvesColumns = cvesTableInfo.map((row) => row.name)

      if (!cvesColumns.includes('is_kev')) {
        db.exec('ALTER TABLE cves ADD COLUMN is_kev INTEGER DEFAULT 0')
      }

      // Create index for is_kev filtering
      db.exec('CREATE INDEX IF NOT EXISTS idx_cves_is_kev ON cves(is_kev)')

      console.log('[Migration 11] KEV catalog table created')
    },
    down: (db: Database) => {
      db.exec('DROP INDEX IF EXISTS idx_kev_date_added')
      db.exec('DROP INDEX IF EXISTS idx_kev_vendor')
      db.exec('DROP INDEX IF EXISTS idx_kev_product')
      db.exec('DROP INDEX IF EXISTS idx_kev_ransomware')
      db.exec('DROP INDEX IF EXISTS idx_cves_is_kev')
      db.exec('DROP TABLE IF EXISTS kev_catalog')
      // Note: is_kev column remains (SQLite doesn't support DROP COLUMN)
    },
  }
}

/**
 * Migration 12: EPSS (Exploit Prediction Scoring System) columns
 *
 * Adds columns to store EPSS scores for vulnerability prioritization.
 * EPSS scores are fetched on-demand from api.first.org and cached.
 */
function migration_12_epss_columns(): Migration {
  return {
    version: 12,
    name: 'epss_columns',
    description: 'Add EPSS score columns to cves table for exploit prediction',
    up: (db: Database) => {
      console.log('[Migration 12] Adding EPSS columns to cves table...')

      // Check existing columns
      const tableInfo = db.pragma('table_info(cves)') as Array<{ name: string }>
      const existingColumns = tableInfo.map((row) => row.name)

      // Add epss_score (probability 0.0-1.0)
      if (!existingColumns.includes('epss_score')) {
        db.exec('ALTER TABLE cves ADD COLUMN epss_score REAL')
      }

      // Add epss_percentile (rank 0.0-1.0)
      if (!existingColumns.includes('epss_percentile')) {
        db.exec('ALTER TABLE cves ADD COLUMN epss_percentile REAL')
      }

      // Add epss_updated_at (cache timestamp)
      if (!existingColumns.includes('epss_updated_at')) {
        db.exec('ALTER TABLE cves ADD COLUMN epss_updated_at TEXT')
      }

      // Create indexes for EPSS-based sorting and filtering
      db.exec('CREATE INDEX IF NOT EXISTS idx_cves_epss_score ON cves(epss_score DESC)')
      db.exec('CREATE INDEX IF NOT EXISTS idx_cves_epss_percentile ON cves(epss_percentile DESC)')

      // Composite index for risk prioritization (KEV + EPSS + Severity)
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cves_risk_priority
        ON cves(is_kev DESC, epss_percentile DESC, cvss_score DESC)
      `)

      console.log('[Migration 12] EPSS columns added')
    },
    down: (db: Database) => {
      db.exec('DROP INDEX IF EXISTS idx_cves_epss_score')
      db.exec('DROP INDEX IF EXISTS idx_cves_epss_percentile')
      db.exec('DROP INDEX IF EXISTS idx_cves_risk_priority')
      // Note: EPSS columns remain (SQLite doesn't support DROP COLUMN)
    },
  }
}

/**
 * Migration 13: cpe_product-leading index for product-name CPE search
 *
 * The migration 10 indexes all lead with `cpe_vendor`, so a search that only
 * knows the product (component name) — `WHERE cpe_product = ? AND vulnerable = 1
 * ORDER BY cpe23_uri` — can't use them and falls back to a full 3M-row scan of
 * `idx_cpes_v2_uri` (~2s warm, >30s cold). That blows the SBOM upload dialog's
 * CPE-estimation budget, so the partial-match dialog never opens. This index
 * leads with `cpe_product` and covers the query (vulnerable filter + cpe23_uri
 * ordering + selected columns), turning the scan into a seek.
 */
function migration_13_cpe_product_index(): Migration {
  return {
    version: 13,
    name: 'cpe_product_index',
    description: 'Add cpe_product-leading covering index so product-name CPE search seeks instead of full-scanning',
    up: (db: Database) => {
      console.log('[Migration 13] Creating cpe_product covering index...')
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cpe_product_lookup
        ON cpe_matches(cpe_product, vulnerable, cpe23_uri)
      `)
      // Refresh optimizer stats so the planner picks the new index.
      db.exec('ANALYZE cpe_matches')
      console.log('[Migration 13] cpe_product covering index created')
    },
    down: (db: Database) => {
      db.exec('DROP INDEX IF EXISTS idx_cpe_product_lookup')
    },
  }
}

/**
 * Run all pending migrations
 */
export function runMigrations(db: Database, currentVersion: number): MigrationResult {
  const startTime = Date.now()
  const result: MigrationResult = {
    success: true,
    fromVersion: currentVersion,
    toVersion: currentVersion,
    migrationsApplied: 0,
    errors: [],
    durationMs: 0,
  }

  const migrations = getMigrations()

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue
    }

    try {
      console.log(`Applying migration ${migration.version}: ${migration.name}`)

      // Run migration
      migration.up(db)

      // Record migration
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      )

      result.toVersion = migration.version
      result.migrationsApplied++
    } catch (error) {
      result.success = false
      result.errors.push(`Migration ${migration.version} (${migration.name}) failed: ${error}`)
      console.error(`Migration ${migration.version} failed:`, error)
      break
    }
  }

  result.durationMs = Date.now() - startTime
  return result
}

/**
 * Rollback to a specific version
 */
export function rollbackToVersion(db: Database, targetVersion: number, currentVersion: number): MigrationResult {
  const startTime = Date.now()
  const result: MigrationResult = {
    success: true,
    fromVersion: currentVersion,
    toVersion: currentVersion,
    migrationsApplied: 0,
    errors: [],
    durationMs: 0,
  }

  const migrations = getMigrations().reverse() // Reverse order for rollback

  for (const migration of migrations) {
    if (migration.version <= targetVersion || migration.version > currentVersion) {
      continue
    }

    try {
      console.log(`Rolling back migration ${migration.version}: ${migration.name}`)

      // Run down migration
      migration.down(db)

      // Remove migration record
      db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(migration.version)

      result.toVersion = migration.version - 1
      result.migrationsApplied++
    } catch (error) {
      result.success = false
      result.errors.push(`Rollback ${migration.version} (${migration.name}) failed: ${error}`)
      console.error(`Rollback ${migration.version} failed:`, error)
      break
    }
  }

  result.durationMs = Date.now() - startTime
  return result
}

/**
 * Get current schema version
 */
export function getSchemaVersion(db: Database): number {
  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  const row = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as
    | { version: number | null }
    | undefined
  return row?.version ?? 0
}

/**
 * Check if a specific migration has been applied
 */
export function isMigrationApplied(db: Database, version: number): boolean {
  const row = db.prepare('SELECT COUNT(*) as count FROM schema_migrations WHERE version = ?').get(version) as
    | { count: number }
    | undefined
  return (row?.count ?? 0) > 0
}
