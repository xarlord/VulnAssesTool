/**
 * NVD Database Manager (Main Process)
 * Provides SQLite database operations for local CVE storage
 * Uses better-sqlite3 for native SQLite access with memory-mapped I/O
 */

import BetterSqlite3 from 'better-sqlite3'
import { promises as fs } from 'node:fs'
import { statSync } from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import type { CVE, CPEMatch, Reference, CVEWithDetails, DatabaseMetadata } from './types.js'
import type { CveFullDetails, CpeMatchFull, CweReference, ReferenceFull, CvssMetric } from '../types/database.js'
import { runMigrations as runV2Migrations } from './migrations/v2SchemaMigration.js'
import { escapeLikePattern } from './sqlSanitizer.js'
import { isFTSAvailable, searchCVEsFTS, buildFtsMatchExpression } from './ftsMigration.js'
import { isVersionInRange, type VersionRange } from './versionRange.js'

type BetterDatabase = InstanceType<typeof BetterSqlite3>

/** Row shape from the `cves` table */
interface CveRow {
  id: string
  description: string
  cvss_score: number | null
  cvss_vector: string | null
  severity: string | null
  published_at: string
  modified_at: string
  source: string
  vuln_status: string | null
  assigner: string | null
  cvss_v31_score: number | null
  cvss_v31_vector: string | null
  cvss_v31_severity: string | null
  cvss_v30_score: number | null
  cvss_v30_vector: string | null
  cvss_v30_severity: string | null
  cvss_v2_score: number | null
  cvss_v2_vector: string | null
  cvss_v2_severity: string | null
  cvss_score_legacy: number | null
  cvss_vector_legacy: string | null
}

export class NvdDatabase {
  private db: BetterDatabase | null = null
  private dbPath: string
  // Store bound handler for proper cleanup
  private boundCloseHandler: () => void
  // Lazily-detected: the indexed cpe_product column exists only after the v2 schema migration;
  // older / seed databases fall back to a cpe23_uri substring (mirrors CPESearch).
  private cpeProductColumn: boolean | null = null

  constructor(dbPath?: string) {
    this.dbPath = dbPath || config.DB_PATH
    // Bind the close handler once for proper removal
    this.boundCloseHandler = () => {
      this.close().catch(() => {})
    }
  }

  /**
   * Get database path
   */
  getDbPath(): string {
    return this.dbPath
  }

  /**
   * Get raw Database instance for delta sync
   */
  getRawDb(): BetterDatabase | null {
    return this.db
  }

  /**
   * Initialize database connection and run migrations
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      const dbDir = path.dirname(this.dbPath)
      await fs.mkdir(dbDir, { recursive: true })

      // Load or create database with corruption recovery
      try {
        this.db = new BetterSqlite3(this.dbPath)
        console.log('Loaded existing database from:', this.dbPath)
      } catch {
        // Check if database file exists but is corrupted
        const dbExists = await this.fileExists(this.dbPath)

        if (dbExists) {
          console.warn('Database appears corrupted, attempting recovery from backup...')
          const recovered = await this.recoverFromBackup()

          if (recovered) {
            console.log('Successfully recovered database from backup')
          } else {
            // No backup available, rename corrupted file and create fresh database
            const backupPath = `${this.dbPath}.corrupted-${Date.now()}`
            try {
              await fs.rename(this.dbPath, backupPath)
              console.warn(`Renamed corrupted database to: ${backupPath}`)
            } catch {
              // If rename fails, try to delete
              await fs.unlink(this.dbPath).catch(() => {})
            }
            this.db = new BetterSqlite3(this.dbPath)
            console.log('Created new database (corrupted file was renamed)')
          }
        } else {
          // Database doesn't exist, create new one
          this.db = new BetterSqlite3(this.dbPath)
          console.log('Created new database at:', this.dbPath)
        }
      }

      // db is now definitely not null
      if (!this.db) throw new Error('Database initialization failed')

      // Apply performance pragmas
      this.db.pragma('journal_mode = WAL')
      this.db.pragma('synchronous = NORMAL')
      this.db.pragma('cache_size = -64000')
      this.db.pragma('temp_store = MEMORY')
      this.db.pragma('mmap_size = 268435456')
      this.db.pragma('foreign_keys = ON')

      // Run migrations
      await this.runMigrations()

      // Register process exit handlers
      process.on('beforeExit', this.boundCloseHandler)
      process.on('SIGINT', this.boundCloseHandler)
      process.on('SIGTERM', this.boundCloseHandler)

      console.log('NVD Database initialized successfully at:', this.dbPath)
    } catch (error) {
      console.error('Failed to initialize NVD database:', error)
      throw error
    }
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Attempt to recover database from backup
   */
  private async recoverFromBackup(): Promise<boolean> {
    const backupPaths = [`${this.dbPath}.backup`, `${this.dbPath}.backup-1`, `${this.dbPath}.backup-2`]

    for (const backupPath of backupPaths) {
      try {
        // Test if backup is a valid database by opening it readonly
        const testDb = new BetterSqlite3(backupPath, { readonly: true })
        testDb.prepare('SELECT 1').get()
        testDb.close()

        // Backup is valid, copy it to main database path
        await fs.copyFile(backupPath, this.dbPath)
        this.db = new BetterSqlite3(this.dbPath)
        console.log(`Recovered database from: ${backupPath}`)

        return true
      } catch {
        // This backup is also corrupted, try next
        continue
      }
    }

    return false
  }

  /**
   * Add columns to a table if they don't already exist.
   * @param table - Table name (use quotes for reserved words, e.g. '"references"')
   * @param columns - Map of column name to SQL type definition
   */
  private addColumnsIfMissing(table: string, columns: Record<string, string>): void {
    if (!this.db) throw new Error('Database not initialized')
    const tableInfo = this.db.pragma(`table_info(${table})`) as Array<{ name: string }>
    const existing = new Set(tableInfo.map((row) => row.name))
    for (const [col, type] of Object.entries(columns)) {
      if (!existing.has(col)) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
      }
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // Create schema_migrations table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `)

    // Get current version
    const initialRow = this.db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as
      | { version: number | null }
      | undefined
    const currentVersion = initialRow?.version ?? 0

    // Create main tables if they don't exist
    if (currentVersion < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cves (
          id TEXT PRIMARY KEY,
          description TEXT NOT NULL,
          cvss_score REAL,
          cvss_vector TEXT,
          severity TEXT CHECK(severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
          published_at TEXT NOT NULL,
          modified_at TEXT NOT NULL,
          source TEXT CHECK(source IN ('NVD', 'OSV')) NOT NULL
        )
      `)

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cpe_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          cpe_text TEXT NOT NULL,
          vulnerable INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS "references" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          url TEXT NOT NULL,
          source TEXT,
          tags TEXT,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `)

      this.db.exec('CREATE INDEX IF NOT EXISTS idx_cves_severity ON cves(severity)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_cves_cvss_score ON cves(cvss_score)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_cves_published_at ON cves(published_at)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cve_id ON cpe_matches(cve_id)')
      // cpe_matches may have cpe_text (v1) or cpe23_uri (post-migration-4)
      const cpeCols = this.db.pragma('table_info(cpe_matches)') as Array<{ name: string }>
      const cpeColNames = cpeCols.map((r) => r.name)
      if (cpeColNames.includes('cpe23_uri')) {
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cpe23_uri ON cpe_matches(cpe23_uri)')
      } else if (cpeColNames.includes('cpe_text')) {
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cpe_text ON cpe_matches(cpe_text)')
      }
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_references_cve_id ON "references"(cve_id)')

      // Record migration
      this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(new Date().toISOString())

      console.log('Applied migration: 1')
    }

    // Migration 2: Add sync_status table and enhanced CVE/CPE tables
    if (currentVersion < 2) {
      // Create sync_status table for delta sync (matching nvdDeltaSync.ts expectations)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sync_status (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT NOT NULL UNIQUE,
          year INTEGER,
          last_sync_at TEXT NOT NULL DEFAULT '',
          last_successful_sync_at TEXT,
          total_cves INTEGER DEFAULT 0,
          cves_synced INTEGER DEFAULT 0,
          last_error TEXT,
          sync_duration_ms INTEGER,
          next_scheduled_sync TEXT,
          auto_sync_enabled INTEGER DEFAULT 0,
          auto_sync_interval_hours INTEGER DEFAULT 24,
          status TEXT NOT NULL DEFAULT 'idle',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `)

      // Add missing columns to cves table if they don't exist
      this.addColumnsIfMissing('cves', {
        cwe_ids: 'TEXT',
        vuln_status: 'TEXT',
        assigner: 'TEXT',
        cvss_v31_score: 'REAL',
        cvss_v31_vector: 'TEXT',
        cvss_v31_severity: 'TEXT',
        cvss_v30_score: 'REAL',
        cvss_v30_vector: 'TEXT',
        cvss_v30_severity: 'TEXT',
        cvss_v2_score: 'REAL',
        cvss_v2_vector: 'TEXT',
        cvss_v2_severity: 'TEXT',
      })

      // Add missing columns to cpe_matches table
      this.addColumnsIfMissing('cpe_matches', {
        cpe23_uri: 'TEXT',
        version_start_including: 'TEXT',
        version_start_excluding: 'TEXT',
        version_end_including: 'TEXT',
        version_end_excluding: 'TEXT',
      })

      // Add missing columns to references table
      this.addColumnsIfMissing('"references"', {
        reference_type: 'TEXT',
      })

      // Create cwe_references table if it doesn't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cwe_references (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          cwe_id TEXT NOT NULL,
          description TEXT,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      // Create indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_sync_source ON sync_status(source)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_sync_year ON sync_status(year)')
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_cwe_refs_cve_id ON cwe_references(cve_id)')

      // Insert initial NVD sync status row if not exists
      const existingStatus = this.db.prepare("SELECT id FROM sync_status WHERE source = 'NVD'").get() as
        | { id: number }
        | undefined
      if (!existingStatus) {
        this.db.exec(
          `INSERT INTO sync_status (source, last_sync_at, status, created_at) VALUES ('NVD', '', 'idle', datetime('now'))`,
        )
      }

      // Record migration
      this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)').run(new Date().toISOString())

      console.log('Applied migration: 2')
    }

    // Migration 3: Add cvss_metrics table for multiple CVSS entries
    if (currentVersion < 3) {
      // Create cvss_metrics table for storing multiple CVSS scores from different sources
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS cvss_metrics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          source TEXT NOT NULL,
          type TEXT NOT NULL,
          version TEXT NOT NULL,
          score REAL NOT NULL,
          severity TEXT NOT NULL,
          vector TEXT NOT NULL,
          exploitability_score REAL,
          impact_score REAL,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      // Create index
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_cvss_metrics_cve_id ON cvss_metrics(cve_id)')

      // Record migration
      this.db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)').run(new Date().toISOString())

      console.log('Applied migration: 3')
    }

    // Run v2 schema migrations (4-12: KEV, EPSS, FTS5, performance, etc.)
    const v2Row = this.db.prepare('SELECT MAX(version) as version FROM schema_migrations').get() as
      | { version: number | null }
      | undefined
    const v2CurrentVersion = v2Row?.version ?? 0

    const v2Result = runV2Migrations(this.db, v2CurrentVersion)
    if (v2Result.migrationsApplied > 0) {
      console.log(
        `Applied v2 migrations: ${v2Result.fromVersion} -> ${v2Result.toVersion} (${v2Result.migrationsApplied} migrations)`,
      )
      if (v2Result.errors.length > 0) {
        console.error('v2 migration errors:', v2Result.errors)
      }
    }
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    // Remove process event listeners to prevent memory leaks
    if (this.boundCloseHandler) {
      process.off('beforeExit', this.boundCloseHandler)
      process.off('SIGINT', this.boundCloseHandler)
      process.off('SIGTERM', this.boundCloseHandler)
    }

    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  /**
   * Map a single legacy CVSS score/vector/severity to the version-specific column set
   * the v2 schema and detail view rely on, detecting the version from the vector prefix
   * (CVSS:3.1 / CVSS:3.0 / bare v2 vectors have no CVSS: prefix). Returns all-null when
   * the version can't be determined, so a score is never mislabeled with a wrong version.
   */
  private cvssVersionColumns(cve: CVE): {
    v31Score: number | null
    v31Vector: string | null
    v31Severity: string | null
    v30Score: number | null
    v30Vector: string | null
    v30Severity: string | null
    v2Score: number | null
    v2Vector: string | null
    v2Severity: string | null
  } {
    const empty = {
      v31Score: null,
      v31Vector: null,
      v31Severity: null,
      v30Score: null,
      v30Vector: null,
      v30Severity: null,
      v2Score: null,
      v2Vector: null,
      v2Severity: null,
    }
    const vector = cve.cvss_vector
    if (!vector) return empty
    const score = cve.cvss_score ?? null
    const severity = cve.severity ?? null
    if (vector.startsWith('CVSS:3.1')) return { ...empty, v31Score: score, v31Vector: vector, v31Severity: severity }
    if (vector.startsWith('CVSS:3.0')) return { ...empty, v30Score: score, v30Vector: vector, v30Severity: severity }
    // CVSS v2 base vectors have no 'CVSS:' prefix (e.g. 'AV:N/AC:L/Au:N/C:P/I:P/A:P').
    if (vector.startsWith('CVSS:2.0') || vector.startsWith('AV:')) {
      return { ...empty, v2Score: score, v2Vector: vector, v2Severity: severity }
    }
    return empty
  }

  /**
   * Insert or update a CVE
   */
  async upsertCVE(cve: CVE): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // Populate the version-specific CVSS columns (left NULL by this legacy path before
    // the fix) so getCVEFullDetails and the severity indexes see this CVE's real data.
    const v = this.cvssVersionColumns(cve)

    const stmt = this.db.prepare(`
      INSERT INTO cves (
        id, description, cvss_score, cvss_vector, severity, published_at, modified_at, source,
        cvss_v31_score, cvss_v31_vector, cvss_v31_severity,
        cvss_v30_score, cvss_v30_vector, cvss_v30_severity,
        cvss_v2_score, cvss_v2_vector, cvss_v2_severity
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        description = excluded.description,
        cvss_score = excluded.cvss_score,
        cvss_vector = excluded.cvss_vector,
        severity = excluded.severity,
        modified_at = excluded.modified_at,
        source = excluded.source,
        cvss_v31_score = excluded.cvss_v31_score,
        cvss_v31_vector = excluded.cvss_v31_vector,
        cvss_v31_severity = excluded.cvss_v31_severity,
        cvss_v30_score = excluded.cvss_v30_score,
        cvss_v30_vector = excluded.cvss_v30_vector,
        cvss_v30_severity = excluded.cvss_v30_severity,
        cvss_v2_score = excluded.cvss_v2_score,
        cvss_v2_vector = excluded.cvss_v2_vector,
        cvss_v2_severity = excluded.cvss_v2_severity
    `)

    stmt.run(
      cve.id,
      cve.description,
      cve.cvss_score ?? null,
      cve.cvss_vector || null,
      cve.severity || null,
      cve.published_at,
      cve.modified_at,
      cve.source,
      v.v31Score,
      v.v31Vector,
      v.v31Severity,
      v.v30Score,
      v.v30Vector,
      v.v30Severity,
      v.v2Score,
      v.v2Vector,
      v.v2Severity,
    )
  }

  /**
   * Insert CPE matches for a CVE
   */
  async insertCPEMatches(cveId: string, matches: CPEMatch[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    const db = this.db

    const del = db.prepare('DELETE FROM cpe_matches WHERE cve_id = ?')
    const stmt = db.prepare(`
      INSERT INTO cpe_matches (
        cve_id, cpe23_uri, vulnerable,
        version_start_including, version_start_excluding,
        version_end_including, version_end_excluding
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    // Atomic: delete + all inserts commit together, so a mid-loop failure can never
    // leave a CVE with its old matches deleted and only some new ones written. Also
    // persists the version-range bounds so range search can find these CVEs.
    const replaceAll = db.transaction((rows: CPEMatch[]) => {
      del.run(cveId)
      for (const match of rows) {
        stmt.run(
          cveId,
          match.cpe23_uri ?? match.cpe_text,
          match.vulnerable ? 1 : 0,
          match.version_start_including ?? null,
          match.version_start_excluding ?? null,
          match.version_end_including ?? null,
          match.version_end_excluding ?? null,
        )
      }
    })
    replaceAll(matches)
  }

  /**
   * Insert references for a CVE
   */
  async insertReferences(cveId: string, refs: Reference[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    const db = this.db

    const del = db.prepare('DELETE FROM "references" WHERE cve_id = ?')
    const stmt = db.prepare(`
      INSERT INTO "references" (cve_id, url, source, tags)
      VALUES (?, ?, ?, ?)
    `)

    // Atomic delete + re-insert (see insertCPEMatches).
    const replaceAll = db.transaction((rows: Reference[]) => {
      del.run(cveId)
      for (const ref of rows) {
        stmt.run(cveId, ref.url, ref.source || null, ref.tags || null)
      }
    })
    replaceAll(refs)
  }

  /**
   * Get a CVE by ID with all details
   */
  getCVEById(id: string): CVEWithDetails | null {
    if (!this.db) throw new Error('Database not initialized')
    const batch = this.getCVEsByIds([id])
    return batch.get(id) ?? null
  }

  getCVEsByIds(ids: string[]): Map<string, CVEWithDetails> {
    const result = new Map<string, CVEWithDetails>()
    if (!this.db || ids.length === 0) return result

    const placeholders = ids.map(() => '?').join(',')

    const cveRows = this.db.prepare(`SELECT * FROM cves WHERE id IN (${placeholders})`).all(...ids) as CveRow[]
    const cveMap = new Map<string, CveRow>()
    for (const cve of cveRows) {
      if (cve.id) cveMap.set(cve.id, cve)
    }

    const cpeRows = this.db.prepare(`SELECT * FROM cpe_matches WHERE cve_id IN (${placeholders})`).all(...ids) as Array<
      Record<string, unknown>
    >
    const cpeByCve = new Map<string, CPEMatch[]>()
    for (const match of cpeRows) {
      const cveId = match.cve_id as string
      if (!cpeByCve.has(cveId)) cpeByCve.set(cveId, [])
      const entry = cpeByCve.get(cveId)
      if (entry) {
        entry.push({
          id: match.id as number,
          cve_id: cveId,
          cpe_text: (match.cpe23_uri as string) || (match.cpe_text as string) || '',
          vulnerable: match.vulnerable === 1,
        })
      }
    }

    const refRows = this.db
      .prepare(`SELECT * FROM "references" WHERE cve_id IN (${placeholders})`)
      .all(...ids) as Array<Record<string, unknown>>
    const refByCve = new Map<string, Reference[]>()
    for (const ref of refRows) {
      const cveId = ref.cve_id as string
      if (!refByCve.has(cveId)) refByCve.set(cveId, [])
      const entry = refByCve.get(cveId)
      if (entry) {
        entry.push({
          id: ref.id as number,
          cve_id: cveId,
          url: ref.url as string,
          source: (ref.source as string) || undefined,
          tags: (ref.tags as string) || undefined,
        })
      }
    }

    for (const [id, cve] of cveMap) {
      result.set(id, {
        id: cve.id,
        description: cve.description,
        cvss_score: cve.cvss_score ?? undefined,
        cvss_vector: cve.cvss_vector ?? undefined,
        severity: (cve.severity ?? undefined) as CVE['severity'],
        published_at: cve.published_at,
        modified_at: cve.modified_at,
        source: cve.source as CVE['source'],
        cpe_matches: cpeByCve.get(id) || [],
        references: refByCve.get(id) || [],
      })
    }

    return result
  }

  /**
   * Get full CVE details with CPE matches, CWE references, and external references
   */
  getCVEFullDetails(id: string): CveFullDetails | null {
    if (!this.db) throw new Error('Database not initialized')

    // Get main CVE record
    const result = this.db.prepare('SELECT * FROM cves WHERE id = ?').get(id) as CveRow | undefined

    if (!result) return null

    // Get CPE matches with version ranges
    const cpeRows = this.db
      .prepare(
        `
      SELECT id, cve_id, cpe23_uri, vulnerable,
             version_start_including, version_start_excluding,
             version_end_including, version_end_excluding
      FROM cpe_matches WHERE cve_id = ?
    `,
      )
      .all(id) as Array<Record<string, unknown>>
    const cpeMatches: CpeMatchFull[] = []

    for (const match of cpeRows) {
      cpeMatches.push({
        id: match.id as number,
        cveId: match.cve_id as string,
        cpe23Uri: match.cpe23_uri as string,
        vulnerable: match.vulnerable === 1,
        versionStartIncluding: (match.version_start_including as string) || undefined,
        versionStartExcluding: (match.version_start_excluding as string) || undefined,
        versionEndIncluding: (match.version_end_including as string) || undefined,
        versionEndExcluding: (match.version_end_excluding as string) || undefined,
      })
    }

    // Get CWE references
    const cweRows = this.db
      .prepare(
        `
      SELECT id, cve_id, cwe_id, description
      FROM cwe_references WHERE cve_id = ?
    `,
      )
      .all(id) as Array<Record<string, unknown>>
    const cweReferences: CweReference[] = []

    for (const cwe of cweRows) {
      cweReferences.push({
        id: cwe.id as number,
        cveId: cwe.cve_id as string,
        cweId: cwe.cwe_id as string,
        description: (cwe.description as string) || undefined,
      })
    }

    // Get external references with type information
    const refRows = this.db
      .prepare(
        `
      SELECT id, cve_id, url, source, tags, reference_type
      FROM "references" WHERE cve_id = ?
    `,
      )
      .all(id) as Array<Record<string, unknown>>
    const references: ReferenceFull[] = []
    const referenceTags: Set<string> = new Set()

    for (const ref of refRows) {
      // Parse tags from comma-separated string
      let tagsArray: string[] = []
      if (ref.tags) {
        tagsArray = (ref.tags as string)
          .split(',')
          .map((t: string) => t.trim())
          .filter(Boolean)
        tagsArray.forEach((t: string) => referenceTags.add(t.toLowerCase()))
      }

      // Add reference_type to tags if present
      if (ref.reference_type) {
        referenceTags.add((ref.reference_type as string).toLowerCase())
      }

      references.push({
        id: ref.id as number,
        cveId: ref.cve_id as string,
        url: ref.url as string,
        source: (ref.source as string) || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
        referenceType: (ref.reference_type as string) || undefined,
      })
    }

    // Determine severity from CVSS scores (prefer v3.1, then v3.0, then v2.0, then legacy)
    let severity: string = result.severity || 'LOW'
    if (result.cvss_v31_severity) {
      severity = result.cvss_v31_severity
    } else if (result.cvss_v30_severity) {
      severity = result.cvss_v30_severity
    } else if (result.cvss_v2_severity) {
      severity = result.cvss_v2_severity
    }

    // Normalize NONE severity to LOW for display
    if (severity === 'NONE' || !severity) {
      severity = 'LOW'
    }

    // Get CVSS metrics from the dedicated table
    const cvssMetricRows = this.db
      .prepare(
        `
      SELECT source, type, version, score, severity, vector, exploitability_score, impact_score
      FROM cvss_metrics WHERE cve_id = ?
      ORDER BY
        CASE WHEN type = 'Primary' THEN 0 ELSE 1 END,
        CASE version WHEN '3.1' THEN 0 WHEN '3.0' THEN 1 WHEN '2.0' THEN 2 ELSE 3 END
    `,
      )
      .all(id) as Array<{
      source: string
      type: string
      version: string
      score: number
      severity: string
      vector: string
      exploitability_score: number | null
      impact_score: number | null
    }>

    const cvssMetrics: CvssMetric[] = []
    for (const row of cvssMetricRows) {
      cvssMetrics.push({
        source: row.source,
        type: row.type,
        version: row.version as '3.1' | '3.0' | '2.0',
        score: row.score,
        severity: row.severity,
        vector: row.vector,
        exploitabilityScore: row.exploitability_score ?? undefined,
        impactScore: row.impact_score ?? undefined,
      })
    }

    return {
      id: result.id,
      description: result.description,
      // CVSS v3.1
      cvssV31Score: result.cvss_v31_score ?? undefined,
      cvssV31Vector: result.cvss_v31_vector ?? undefined,
      cvssV31Severity: (result.cvss_v31_severity ?? undefined) as import('../types/database.js').Severity | undefined,
      // CVSS v3.0
      cvssV30Score: result.cvss_v30_score ?? undefined,
      cvssV30Vector: result.cvss_v30_vector ?? undefined,
      cvssV30Severity: (result.cvss_v30_severity ?? undefined) as import('../types/database.js').Severity | undefined,
      // CVSS v2.0
      cvssV2Score: result.cvss_v2_score ?? undefined,
      cvssV2Vector: result.cvss_v2_vector ?? undefined,
      cvssV2Severity: (result.cvss_v2_severity ?? undefined) as string | undefined,
      // Legacy fields
      cvssScore: result.cvss_score ?? result.cvss_v31_score ?? result.cvss_v30_score ?? result.cvss_v2_score ?? 0,
      cvssVector:
        result.cvss_vector ?? result.cvss_v31_vector ?? result.cvss_v30_vector ?? result.cvss_v2_vector ?? undefined,
      severity: severity as import('../types/database.js').Severity,
      // Dates
      publishedAt: result.published_at,
      modifiedAt: result.modified_at,
      // Source tracking
      source: result.source || 'NVD',
      vulnStatus: result.vuln_status ?? undefined,
      assigner: result.assigner ?? undefined,
      // Related data
      cpeMatches,
      cweReferences,
      references,
      // Extracted tags for quick access
      referenceTags: Array.from(referenceTags),
      // Multiple CVSS metrics from different sources
      cvssMetrics: cvssMetrics.length > 0 ? cvssMetrics : undefined,
    }
  }

  /**
   * Search CVEs by text (description or CVE ID).
   *
   * Three tiers: an exact CVE ID resolves via the id primary key; free text goes
   * through the index-backed FTS5 path (token-prefix matching, size-invariant)
   * when the cves_fts table is present; otherwise a substring LIKE scan is used
   * as a fallback (and if the FTS query is ever rejected).
   */
  searchCVEsByText(query: string, limit = 100, offset = 0): CVEWithDetails[] {
    if (!this.db) throw new Error('Database not initialized')

    const hydrate = (ids: string[]): CVEWithDetails[] => {
      const batchDetails = this.getCVEsByIds(ids)
      return ids.map((id) => batchDetails.get(id)).filter((r): r is CVEWithDetails => r !== undefined)
    }

    const trimmed = query.trim()

    // Tier 1: an exact CVE ID resolves directly via the id primary key.
    if (/^CVE-\d{4}-\d+$/i.test(trimmed)) {
      return hydrate([trimmed.toUpperCase()])
    }

    // Tier 2: free text goes through the index-backed FTS5 path when available.
    const match = buildFtsMatchExpression(trimmed)
    if (match && isFTSAvailable(this.db)) {
      try {
        const ftsHits = searchCVEsFTS(this.db, match, limit, offset)
        return hydrate(ftsHits.map((r) => r.id))
      } catch {
        // FTS rejected the query — fall through to the LIKE scan below.
      }
    }

    // Tier 3: substring LIKE fallback (no FTS table, or FTS rejected the query).
    const rows = this.db
      .prepare(
        `
      SELECT * FROM cves
      WHERE description LIKE ? ESCAPE '\\'
         OR id LIKE ? ESCAPE '\\'
      ORDER BY cvss_score DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(`%${escapeLikePattern(query)}%`, `%${escapeLikePattern(query)}%`, limit, offset) as CVE[]

    return hydrate(rows.map((cve) => cve.id))
  }

  /**
   * Search CVEs by CPE text.
   *
   * Two matching strategies are unioned:
   *  1. Literal substring match on the full cpe23_uri (fast path, unchanged) —
   *     catches rows that list the component's exact version.
   *  2. Version-RANGE match (FR-03.1): when the query CPE carries a concrete
   *     version, also match same part/vendor/product rows whose cpe23_uri uses
   *     version='*' plus version_start/end bound columns and whose range actually
   *     contains that version. Most real NVD applicability data is published as
   *     ranges, which a literal substring can never hit.
   */
  searchCVEsByCPE(cpeText: string, limit = 100, offset = 0): CVEWithDetails[] {
    if (!this.db) throw new Error('Database not initialized')

    // Cap the literal candidate set so a very common CPE substring can't pull an
    // unbounded number of rows into memory before the JS-side merge/sort below.
    const LITERAL_CPE_MATCH_CAP = 5000
    const literalRows = this.db
      .prepare(
        `SELECT DISTINCT c.* FROM cves c
         INNER JOIN cpe_matches cp ON c.id = cp.cve_id
         WHERE cp.cpe23_uri LIKE ? ESCAPE '\\' AND cp.vulnerable = 1
         LIMIT ?`,
      )
      .all(`%${escapeLikePattern(cpeText)}%`, LITERAL_CPE_MATCH_CAP) as CVE[]

    // Merge both strategies by CVE id (literal wins on collision — same CVE).
    const matched = new Map<string, CVE>()
    for (const row of literalRows) if (row.id) matched.set(row.id, row)

    const parsed = this.parseCpeForRange(cpeText)
    if (parsed) {
      for (const { cve, range } of this.searchVersionRangeCandidates(parsed)) {
        if (cve.id && !matched.has(cve.id) && isVersionInRange(parsed.version, range)) {
          matched.set(cve.id, cve)
        }
      }
    }

    // Order by CVSS desc (nulls last) and paginate in JS: the union of the two
    // strategies cannot be expressed as one paginated query.
    const ordered = [...matched.values()].sort((a, b) => (b.cvss_score ?? -1) - (a.cvss_score ?? -1))
    const pageIds = ordered.slice(offset, offset + limit).map((cve) => cve.id)

    const batchDetails = this.getCVEsByIds(pageIds)
    return pageIds.map((id) => batchDetails.get(id)).filter((r): r is CVEWithDetails => r !== undefined)
  }

  /**
   * Parse a cpe:2.3 URI into the fields the range query needs. Returns null for
   * bare tokens or wildcard/absent versions (nothing to range-match), so those
   * queries use the literal path only.
   */
  private parseCpeForRange(cpeText: string): { part: string; vendor: string; product: string; version: string } | null {
    const parts = cpeText.split(':')
    if (parts.length < 6 || parts[0] !== 'cpe' || parts[1] !== '2.3') return null
    const [, , part, vendor, product, version] = parts
    if (!part || !vendor || !product || !version || version === '*' || version === '-') return null
    return { part, vendor, product, version }
  }

  /**
   * Candidate rows for range matching: same part/vendor/product as the query CPE,
   * carrying at least one version bound. Scoped via an index-usable cpe23_uri
   * prefix (`cpe:2.3:part:vendor:product:`) rather than the cpe_product column —
   * insertCPEMatches (the sync insert path) leaves cpe_product NULL, so scoping by
   * it would miss freshly-synced rows; the cpe23_uri prefix is always populated
   * and still uses idx_cpe_matches_cpe23_uri (no leading wildcard).
   */
  private searchVersionRangeCandidates(parsed: {
    part: string
    vendor: string
    product: string
  }): Array<{ cve: CVE; range: VersionRange }> {
    if (!this.db) return []
    const prefix = `cpe:2.3:${parsed.part}:${parsed.vendor}:${parsed.product}:`
    const rows = this.db
      .prepare(
        `SELECT DISTINCT c.*,
           cp.version_start_including AS versionStartIncluding,
           cp.version_start_excluding AS versionStartExcluding,
           cp.version_end_including  AS versionEndIncluding,
           cp.version_end_excluding  AS versionEndExcluding
         FROM cves c INNER JOIN cpe_matches cp ON c.id = cp.cve_id
         WHERE cp.cpe23_uri LIKE ? ESCAPE '\\'
           AND cp.vulnerable = 1
           AND (cp.version_start_including IS NOT NULL OR cp.version_start_excluding IS NOT NULL
                OR cp.version_end_including IS NOT NULL OR cp.version_end_excluding IS NOT NULL)`,
      )
      .all(`${escapeLikePattern(prefix)}%`) as Array<Record<string, unknown>>

    return rows.map((row) => ({
      cve: row as unknown as CVE,
      range: {
        versionStartIncluding: (row.versionStartIncluding as string) || undefined,
        versionStartExcluding: (row.versionStartExcluding as string) || undefined,
        versionEndIncluding: (row.versionEndIncluding as string) || undefined,
        versionEndExcluding: (row.versionEndExcluding as string) || undefined,
      },
    }))
  }

  /** Whether the indexed cpe_product column exists (added by the v2 migration). */
  private hasCpeProductColumn(): boolean {
    if (!this.db) return false
    if (this.cpeProductColumn === null) {
      const cols = this.db.prepare('PRAGMA table_info(cpe_matches)').all() as Array<{ name: string }>
      this.cpeProductColumn = cols.some((c) => c.name === 'cpe_product')
    }
    return this.cpeProductColumn
  }

  /**
   * Search CVEs by CPE PRODUCT name, precision-first: exact `cpe_product`, then a prefix match,
   * then a `cpe23_uri` substring fallback only for recall. This scopes a bare product term to the
   * CPE product field instead of a blunt `%term%` over the whole URI (which over-matches — e.g.
   * `%ssl%` also hits unrelated products/vendors). Falls straight to the substring when the
   * indexed column is absent (older/seed DBs), so recall is never worse than searchCVEsByCPE.
   */
  searchCVEsByProduct(product: string, limit = 100, offset = 0): CVEWithDetails[] {
    if (!this.db) throw new Error('Database not initialized')
    const db = this.db
    const term = product.toLowerCase().trim()
    if (!term) return []

    const runQuery = (clause: string, param: string): CVE[] =>
      db
        .prepare(
          `SELECT DISTINCT c.* FROM cves c
           INNER JOIN cpe_matches cp ON c.id = cp.cve_id
           WHERE ${clause} AND cp.vulnerable = 1
           ORDER BY c.cvss_score DESC
           LIMIT ? OFFSET ?`,
        )
        .all(param, limit, offset) as CVE[]

    let rows: CVE[] = []
    if (this.hasCpeProductColumn()) {
      rows = runQuery('cp.cpe_product = ?', term)
      if (rows.length === 0) rows = runQuery('cp.cpe_product LIKE ?', `${escapeLikePattern(term)}%`)
    }
    if (rows.length === 0) rows = runQuery('cp.cpe23_uri LIKE ?', `%${escapeLikePattern(term)}%`)

    const cveIds = rows.map((cve) => cve.id)
    const batchDetails = this.getCVEsByIds(cveIds)
    return cveIds.map((id) => batchDetails.get(id)).filter((r): r is CVEWithDetails => r !== undefined)
  }

  /**
   * Get total count of CVEs
   */
  getTotalCVECount(): number {
    if (!this.db) throw new Error('Database not initialized')

    const row = this.db.prepare('SELECT COUNT(*) as count FROM cves').get() as { count: number } | undefined
    return row?.count ?? 0
  }

  /**
   * Get database metadata
   */
  getMetadata(): DatabaseMetadata {
    if (!this.db) throw new Error('Database not initialized')

    const totalRow = this.db.prepare('SELECT COUNT(*) as count FROM cves').get() as { count: number } | undefined
    const total = totalRow?.count ?? 0

    const after2021Row = this.db
      .prepare("SELECT COUNT(*) as count FROM cves WHERE published_at >= '2021-01-01'")
      .get() as { count: number } | undefined
    const after2021 = after2021Row?.count ?? 0

    const lastSyncRow = this.db.prepare("SELECT value FROM metadata WHERE key = 'last_sync_at'").get() as
      | { value: string }
      | undefined
    const lastSyncAt = lastSyncRow?.value

    return {
      last_sync_at: lastSyncAt,
      schema_version: '1.0.0',
      total_cves: total,
      cves_after_2021: after2021,
    }
  }

  /**
   * Get database file size in bytes
   */
  getDbSize(): number {
    try {
      const stats = statSync(this.dbPath)
      return stats.size
    } catch {
      return 0
    }
  }

  /**
   * Update metadata
   */
  async updateMetadata(key: string, value: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    this.db
      .prepare(
        `
      INSERT INTO metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
      )
      .run(key, value)
  }

  /**
   * Parse CPE URI into components
   * Supports both CPE 2.2 (cpe:/a:vendor:product:version) and
   * CPE 2.3 (cpe:2.3:a:vendor:product:version:...)
   */
  static parseCPE(cpeUri: string): {
    part: string | null
    vendor: string | null
    product: string | null
    version: string | null
  } {
    const result = {
      part: null as string | null,
      vendor: null as string | null,
      product: null as string | null,
      version: null as string | null,
    }

    if (!cpeUri) return result

    try {
      // CPE 2.3 format: cpe:2.3:<part>:<vendor>:<product>:<version>:...
      if (cpeUri.startsWith('cpe:2.3:')) {
        const parts = cpeUri.split(':')
        if (parts.length >= 4) {
          result.part = parts[2] || null
          result.vendor = parts[3] || null
          result.product = parts[4] || null
          result.version = parts[5] || null
        }
      }
      // CPE 2.2 format: cpe:/<part>:<vendor>:<product>:<version>:...
      else if (cpeUri.startsWith('cpe:/')) {
        const parts = cpeUri.substring(5).split(':')
        if (parts.length >= 1) result.part = parts[0] || null
        if (parts.length >= 2) result.vendor = parts[1] || null
        if (parts.length >= 3) result.product = parts[2] || null
        if (parts.length >= 4) result.version = parts[3] || null
      }
    } catch {
      // Return empty result on parse error
    }

    return result
  }

  /**
   * Get CWE IDs and references for multiple CVE IDs in batch.
   * Returns a map of CVE ID → { cwes, references, referenceTags }.
   */
  getCveListDetails(
    cveIds: string[],
  ): Map<
    string,
    { cwes: string[]; references: Array<{ url: string; source?: string; tags?: string[] }>; referenceTags: string[] }
  > {
    const result = new Map<
      string,
      { cwes: string[]; references: Array<{ url: string; source?: string; tags?: string[] }>; referenceTags: string[] }
    >()
    if (!this.db || cveIds.length === 0) return result

    for (const cveId of cveIds) {
      result.set(cveId, { cwes: [], references: [], referenceTags: [] })
    }

    const placeholders = cveIds.map(() => '?').join(',')
    const cweRows = this.db
      .prepare(`SELECT cve_id, cwe_id FROM cwe_references WHERE cve_id IN (${placeholders})`)
      .all(...cveIds) as Array<{ cve_id: string; cwe_id: string }>
    for (const row of cweRows) {
      const entry = result.get(row.cve_id)
      if (entry && row.cwe_id) entry.cwes.push(row.cwe_id)
    }

    const refRows = this.db
      .prepare(`SELECT cve_id, url, source, tags FROM "references" WHERE cve_id IN (${placeholders})`)
      .all(...cveIds) as Array<{ cve_id: string; url: string; source: string | null; tags: string | null }>
    for (const row of refRows) {
      const entry = result.get(row.cve_id)
      if (!entry) continue
      const tags = row.tags
        ? row.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined
      if (tags) {
        for (const t of tags) {
          if (!entry.referenceTags.includes(t.toLowerCase())) {
            entry.referenceTags.push(t.toLowerCase())
          }
        }
      }
      entry.references.push({
        url: row.url,
        source: row.source || undefined,
        tags: tags && tags.length > 0 ? tags : undefined,
      })
    }

    return result
  }
}

// Singleton instance
let dbInstance: NvdDatabase | null = null

export function getDatabase(dbPath?: string): NvdDatabase {
  if (!dbInstance) {
    dbInstance = new NvdDatabase(dbPath)
  }
  return dbInstance
}

export async function resetDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close()
    dbInstance = null
  }
}
