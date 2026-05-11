/**
 * NVD Database Manager (Main Process)
 * Provides SQLite database operations for local CVE storage
 * Uses sql.js (pure JavaScript/WebAssembly SQLite) for Electron compatibility
 */

import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { promises as fs } from 'node:fs'
import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { CVE, CPEMatch, Reference, CVEWithDetails, DatabaseMetadata } from './types.js'
import { rowsToObjects } from './queryUtils.js'

/**
 * Async mutex to prevent concurrent database operations
 */
class AsyncMutex {
  private queue: (() => void)[] = []
  private locked = false

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true
          resolve(() => this.release())
        } else {
          this.queue.push(tryAcquire)
        }
      }
      tryAcquire()
    })
  }

  private release(): void {
    this.locked = false
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      if (next) next()
    }
  }
}

// In CommonJS, __dirname is available natively

export class NvdDatabase {
  private db: Database | null = null
  private dbPath: string
  private sqlJs: any = null
  private autoSaveInterval: NodeJS.Timeout | null = null
  private saveMutex = new AsyncMutex()
  // Store bound handlers for proper cleanup
  private boundCloseHandler: () => void

  constructor(dbPath?: string) {
    // Use userData directory for database storage
    const userDataPath = app.getPath('userData')
    this.dbPath = dbPath || path.join(userDataPath, 'nvd-data.db')
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
  getRawDb(): Database | null {
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

      // Load the WASM file directly to avoid __dirname issues in sql.js
      let wasmPath: string | null = null
      const possiblePaths = [
        // Development: relative to the current file
        path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm'),
        // Production: dist/electron directory (parent of database directory)
        path.join(__dirname, '..', 'sql-wasm.wasm'),
        path.join(__dirname, 'sql-wasm.wasm'),
        // Production: relative to the app executable
        path.join(process.resourcesPath || app.getAppPath(), 'sql.js/dist/sql-wasm.wasm'),
        // Fallback: userData directory
        path.join(app.getPath('userData'), 'sql.js/sql-wasm.wasm'),
      ]

      // Find the WASM file
      for (const testPath of possiblePaths) {
        try {
          if (statSync(testPath).isFile()) {
            wasmPath = testPath
            console.log('Found sql.js WASM at:', wasmPath)
            break
          }
        } catch {
          // Path doesn't exist, try next
        }
      }

      if (!wasmPath) {
        throw new Error('Could not find sql.js WASM file. Tried: ' + JSON.stringify(possiblePaths))
      }

      // Read WASM file and initialize sql.js
      const wasmBuffer = readFileSync(wasmPath)
      this.sqlJs = await initSqlJs({
        wasmBinary: wasmBuffer.buffer.slice(wasmBuffer.byteOffset, wasmBuffer.byteOffset + wasmBuffer.byteLength),
      })

      // Load or create database with corruption recovery
      try {
        const buffer = readFileSync(this.dbPath)
        this.db = new this.sqlJs.Database(buffer)
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
            this.db = new this.sqlJs.Database()
            console.log('Created new database (corrupted file was renamed)')
          }
        } else {
          // Database doesn't exist, create new one
          this.db = new this.sqlJs.Database()
          console.log('Created new database at:', this.dbPath)
        }
      }

      // Enable foreign keys (db is now definitely not null)
      if (!this.db) throw new Error('Database initialization failed')
      this.db.run('PRAGMA foreign_keys = ON')

      // Run migrations
      await this.runMigrations()

      // Start auto-save interval (save every 30 seconds)
      this.startAutoSave()

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
        const buffer = readFileSync(backupPath)
        const testDb = new this.sqlJs.Database(buffer)

        // Test if database is valid by running a simple query
        testDb.exec('SELECT 1')

        // If we get here, the backup is valid
        this.db = testDb
        console.log(`Recovered database from: ${backupPath}`)

        // Restore the backup as the main database
        await fs.writeFile(this.dbPath, buffer)

        return true
      } catch {
        // This backup is also corrupted, try next
        continue
      }
    }

    return false
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval)
    }

    // Auto-save every 30 seconds
    this.autoSaveInterval = setInterval(() => {
      if (this.db) {
        this.saveToDisk().catch((err) => {
          console.error('Auto-save failed:', err)
        })
      }
    }, 30000)

    // Also save on these events for extra safety - use bound handler for cleanup
    process.on('beforeExit', this.boundCloseHandler)
    process.on('SIGINT', this.boundCloseHandler)
    process.on('SIGTERM', this.boundCloseHandler)
  }

  /**
   * Save database to disk with atomic write pattern
   */
  private async saveToDisk(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')
    const release = await this.saveMutex.acquire()
    try {
      const data = this.db.export()
      const buffer = Buffer.from(data)

      // Atomic write: write to temp file first, then rename
      const tempPath = `${this.dbPath}.tmp`
      await fs.writeFile(tempPath, buffer)

      // Create backup before overwriting main database
      const backupPath = `${this.dbPath}.backup`
      const backupPath1 = `${this.dbPath}.backup-1`
      const backupPath2 = `${this.dbPath}.backup-2`

      try {
        // Rotate backups: backup-1 -> backup-2, backup -> backup-1
        if (await this.fileExists(backupPath1)) {
          await fs.rename(backupPath1, backupPath2).catch(() => {})
        }
        if (await this.fileExists(backupPath)) {
          await fs.rename(backupPath, backupPath1).catch(() => {})
        }

        // Backup current database
        if (await this.fileExists(this.dbPath)) {
          await fs.copyFile(this.dbPath, backupPath).catch(() => {})
        }
      } catch (backupError) {
        console.warn('Failed to create backup:', backupError)
        // Continue with save even if backup fails
      }

      // Rename temp to main (atomic on most filesystems)
      await fs.rename(tempPath, this.dbPath)
    } finally {
      release()
    }
  }

  /**
   * Add columns to a table if they don't already exist.
   * @param table - Table name (use quotes for reserved words, e.g. '"references"')
   * @param columns - Map of column name to SQL type definition
   */
  private addColumnsIfMissing(table: string, columns: Record<string, string>): void {
    if (!this.db) throw new Error('Database not initialized')
    const tableInfo = this.db.exec(`PRAGMA table_info(${table})`)
    const existing = new Set(tableInfo[0]?.values.map((v) => v[1]) || [])
    for (const [col, type] of Object.entries(columns)) {
      if (!existing.has(col)) {
        this.db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`)
      }
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // Create schema_migrations table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `)

    // Get current version
    const result = this.db.exec('SELECT MAX(version) as version FROM schema_migrations')
    const currentVersion = result.length > 0 && result[0].values.length > 0 ? (result[0].values[0][0] as number) : 0

    // Create main tables if they don't exist
    if (currentVersion < 1) {
      this.db.run(`
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

      this.db.run(`
        CREATE TABLE IF NOT EXISTS cpe_matches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          cpe_text TEXT NOT NULL,
          vulnerable INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      this.db.run(`
        CREATE TABLE IF NOT EXISTS "references" (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          url TEXT NOT NULL,
          source TEXT,
          tags TEXT,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      this.db.run(`
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `)

      this.db.run('CREATE INDEX IF NOT EXISTS idx_cves_severity ON cves(severity)')
      this.db.run('CREATE INDEX IF NOT EXISTS idx_cves_cvss_score ON cves(cvss_score)')
      this.db.run('CREATE INDEX IF NOT EXISTS idx_cves_published_at ON cves(published_at)')
      this.db.run('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cve_id ON cpe_matches(cve_id)')
      this.db.run('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cpe_text ON cpe_matches(cpe_text)')
      this.db.run('CREATE INDEX IF NOT EXISTS idx_references_cve_id ON "references"(cve_id)')

      // Record migration
      this.db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)', [new Date().toISOString()])

      // Save to disk after migration
      await this.saveToDisk()

      console.log('Applied migration: 1')
    }

    // Migration 2: Add sync_status table and enhanced CVE/CPE tables
    if (currentVersion < 2) {
      // Create sync_status table for delta sync (matching nvdDeltaSync.ts expectations)
      this.db.run(`
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
      this.db.run(`
        CREATE TABLE IF NOT EXISTS cwe_references (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cve_id TEXT NOT NULL,
          cwe_id TEXT NOT NULL,
          description TEXT,
          FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
        )
      `)

      // Create indexes
      this.db.run('CREATE INDEX IF NOT EXISTS idx_sync_source ON sync_status(source)')
      this.db.run('CREATE INDEX IF NOT EXISTS idx_sync_year ON sync_status(year)')
      this.db.run('CREATE INDEX IF NOT EXISTS idx_cwe_refs_cve_id ON cwe_references(cve_id)')

      // Insert initial NVD sync status row if not exists
      const existingStatus = this.db.exec("SELECT id FROM sync_status WHERE source = 'NVD'")
      if (existingStatus.length === 0 || existingStatus[0].values.length === 0) {
        this.db.run(
          `INSERT INTO sync_status (source, last_sync_at, status, created_at) VALUES ('NVD', '', 'idle', datetime('now'))`,
        )
      }

      // Record migration
      this.db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)', [new Date().toISOString()])

      // Save to disk after migration
      await this.saveToDisk()

      console.log('Applied migration: 2')
    }

    // Migration 3: Add cvss_metrics table for multiple CVSS entries
    if (currentVersion < 3) {
      // Create cvss_metrics table for storing multiple CVSS scores from different sources
      this.db.run(`
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
      this.db.run('CREATE INDEX IF NOT EXISTS idx_cvss_metrics_cve_id ON cvss_metrics(cve_id)')

      // Record migration
      this.db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)', [new Date().toISOString()])

      // Save to disk after migration
      await this.saveToDisk()

      console.log('Applied migration: 3')
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
    // Stop auto-save interval
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval)
      this.autoSaveInterval = null
    }

    // Remove process event listeners to prevent memory leaks
    if (this.boundCloseHandler) {
      process.off('beforeExit', this.boundCloseHandler)
      process.off('SIGINT', this.boundCloseHandler)
      process.off('SIGTERM', this.boundCloseHandler)
    }

    if (this.db) {
      // Force a final save
      await this.saveToDisk()
      this.db.close()
      this.db = null
    }
  }

  /**
   * Insert or update a CVE
   */
  async upsertCVE(cve: CVE): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare(`
      INSERT INTO cves (id, description, cvss_score, cvss_vector, severity, published_at, modified_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        description = excluded.description,
        cvss_score = excluded.cvss_score,
        cvss_vector = excluded.cvss_vector,
        severity = excluded.severity,
        modified_at = excluded.modified_at
    `)

    stmt.run([
      cve.id,
      cve.description,
      cve.cvss_score || null,
      cve.cvss_vector || null,
      cve.severity || null,
      cve.published_at,
      cve.modified_at,
      cve.source,
    ])

    stmt.free()

    await this.saveToDisk()
  }

  /**
   * Insert CPE matches for a CVE
   */
  async insertCPEMatches(cveId: string, matches: CPEMatch[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // First delete existing matches for this CVE
    const deleteStmt = this.db.prepare('DELETE FROM cpe_matches WHERE cve_id = ?')
    deleteStmt.run([cveId])
    deleteStmt.free()

    const stmt = this.db.prepare(`
      INSERT INTO cpe_matches (cve_id, cpe_text, vulnerable)
      VALUES (?, ?, ?)
    `)

    for (const match of matches) {
      stmt.run([cveId, match.cpe_text, match.vulnerable ? 1 : 0])
    }

    stmt.free()

    await this.saveToDisk()
  }

  /**
   * Insert references for a CVE
   */
  async insertReferences(cveId: string, refs: Reference[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized')

    // First delete existing references for this CVE
    const deleteStmt = this.db.prepare('DELETE FROM "references" WHERE cve_id = ?')
    deleteStmt.run([cveId])
    deleteStmt.free()

    const stmt = this.db.prepare(`
      INSERT INTO "references" (cve_id, url, source, tags)
      VALUES (?, ?, ?, ?)
    `)

    for (const ref of refs) {
      stmt.run([cveId, ref.url, ref.source || null, ref.tags || null])
    }

    stmt.free()

    await this.saveToDisk()
  }

  /**
   * Get a CVE by ID with all details
   */
  getCVEById(id: string): CVEWithDetails | null {
    if (!this.db) throw new Error('Database not initialized')

    const stmt = this.db.prepare('SELECT * FROM cves WHERE id = ?')
    const result = stmt.getAsObject([id]) as any
    stmt.free()

    if (!result) return null

    // Get CPE matches
    const cpeStmt = this.db.prepare('SELECT * FROM cpe_matches WHERE cve_id = ?')
    const cpeResults = this.db.exec('SELECT * FROM cpe_matches WHERE cve_id = ?', [id])
    const cpeMatches: CPEMatch[] = []

    if (cpeResults.length > 0) {
      const rows = rowsToObjects(cpeResults[0].columns, cpeResults[0].values)
      for (const match of rows) {
        cpeMatches.push({
          id: match.id,
          cve_id: match.cve_id,
          cpe_text: match.cpe_text,
          vulnerable: match.vulnerable === 1,
        })
      }
    }

    cpeStmt.free()

    // Get references
    const refResults = this.db.exec('SELECT * FROM "references" WHERE cve_id = ?', [id])
    const references: Reference[] = []

    if (refResults.length > 0) {
      const rows = rowsToObjects(refResults[0].columns, refResults[0].values)
      for (const ref of rows) {
        references.push({
          id: ref.id,
          cve_id: ref.cve_id,
          url: ref.url,
          source: ref.source || undefined,
          tags: ref.tags || undefined,
        })
      }
    }

    return {
      id: result.id,
      description: result.description,
      cvss_score: result.cvss_score,
      cvss_vector: result.cvss_vector,
      severity: result.severity,
      published_at: result.published_at,
      modified_at: result.modified_at,
      source: result.source,
      cpe_matches: cpeMatches,
      references,
    }
  }

  /**
   * Get full CVE details with CPE matches, CWE references, and external references
   */
  getCVEFullDetails(id: string): any | null {
    if (!this.db) throw new Error('Database not initialized')

    // Get main CVE record
    const stmt = this.db.prepare('SELECT * FROM cves WHERE id = ?')
    const result = stmt.getAsObject([id]) as any
    stmt.free()

    if (!result) return null

    // Get CPE matches with version ranges
    const cpeResults = this.db.exec(
      `
      SELECT id, cve_id, cpe23_uri, vulnerable,
             version_start_including, version_start_excluding,
             version_end_including, version_end_excluding
      FROM cpe_matches WHERE cve_id = ?
    `,
      [id],
    )
    const cpeMatches: any[] = []

    if (cpeResults.length > 0) {
      const rows = rowsToObjects(cpeResults[0].columns, cpeResults[0].values)
      for (const match of rows) {
        cpeMatches.push({
          id: match.id,
          cveId: match.cve_id,
          cpe23Uri: match.cpe23_uri,
          vulnerable: match.vulnerable === 1,
          versionStartIncluding: match.version_start_including || undefined,
          versionStartExcluding: match.version_start_excluding || undefined,
          versionEndIncluding: match.version_end_including || undefined,
          versionEndExcluding: match.version_end_excluding || undefined,
        })
      }
    }

    // Get CWE references
    const cweResults = this.db.exec(
      `
      SELECT id, cve_id, cwe_id, description
      FROM cwe_references WHERE cve_id = ?
    `,
      [id],
    )
    const cweReferences: any[] = []

    if (cweResults.length > 0) {
      const rows = rowsToObjects(cweResults[0].columns, cweResults[0].values)
      for (const cwe of rows) {
        cweReferences.push({
          id: cwe.id,
          cveId: cwe.cve_id,
          cweId: cwe.cwe_id,
          description: cwe.description || undefined,
        })
      }
    }

    // Get external references with type information
    const refResults = this.db.exec(
      `
      SELECT id, cve_id, url, source, tags, reference_type
      FROM "references" WHERE cve_id = ?
    `,
      [id],
    )
    const references: any[] = []
    const referenceTags: Set<string> = new Set()

    if (refResults.length > 0) {
      const refRows = rowsToObjects(refResults[0].columns, refResults[0].values)
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
          id: ref.id,
          cveId: ref.cve_id,
          url: ref.url,
          source: ref.source || undefined,
          tags: tagsArray.length > 0 ? tagsArray : undefined,
          referenceType: ref.reference_type || undefined,
        })
      }
    }

    // Determine severity from CVSS scores (prefer v3.1, then v3.0, then v2.0, then legacy)
    let severity = result.severity || 'LOW'
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
    const cvssMetricsResults = this.db.exec(
      `
      SELECT source, type, version, score, severity, vector, exploitability_score, impact_score
      FROM cvss_metrics WHERE cve_id = ?
      ORDER BY
        CASE WHEN type = 'Primary' THEN 0 ELSE 1 END,
        CASE version WHEN '3.1' THEN 0 WHEN '3.0' THEN 1 WHEN '2.0' THEN 2 ELSE 3 END
    `,
      [id],
    )

    const cvssMetrics: any[] = []
    if (cvssMetricsResults.length > 0 && cvssMetricsResults[0].values.length > 0) {
      for (const row of cvssMetricsResults[0].values) {
        cvssMetrics.push({
          source: row[0],
          type: row[1],
          version: row[2],
          score: row[3],
          severity: row[4],
          vector: row[5],
          exploitabilityScore: row[6] || undefined,
          impactScore: row[7] || undefined,
        })
      }
    }

    return {
      id: result.id,
      description: result.description,
      // CVSS v3.1
      cvssV31Score: result.cvss_v31_score || undefined,
      cvssV31Vector: result.cvss_v31_vector || undefined,
      cvssV31Severity: result.cvss_v31_severity || undefined,
      // CVSS v3.0
      cvssV30Score: result.cvss_v30_score || undefined,
      cvssV30Vector: result.cvss_v30_vector || undefined,
      cvssV30Severity: result.cvss_v30_severity || undefined,
      // CVSS v2.0
      cvssV2Score: result.cvss_v2_score || undefined,
      cvssV2Vector: result.cvss_v2_vector || undefined,
      cvssV2Severity: result.cvss_v2_severity || undefined,
      // Legacy fields
      cvssScore: result.cvss_score || result.cvss_v31_score || result.cvss_v30_score || result.cvss_v2_score || 0,
      cvssVector: result.cvss_vector || result.cvss_v31_vector || result.cvss_v30_vector || result.cvss_v2_vector,
      severity: severity,
      // Dates
      publishedAt: result.published_at,
      modifiedAt: result.modified_at,
      // Source tracking
      source: result.source || 'NVD',
      vulnStatus: result.vuln_status || undefined,
      assigner: result.assigner || undefined,
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
   * Search CVEs by text (description or CVE ID)
   */
  searchCVEsByText(query: string, limit = 100, offset = 0): CVEWithDetails[] {
    if (!this.db) throw new Error('Database not initialized')

    const results = this.db.exec(
      `
      SELECT * FROM cves
      WHERE description LIKE ?
         OR id LIKE ?
      ORDER BY cvss_score DESC
      LIMIT ? OFFSET ?
    `,
      [`%${query}%`, `%${query}%`, limit, offset],
    )

    const cves: CVE[] = []

    if (results.length > 0) {
      const rows = rowsToObjects(results[0].columns, results[0].values)
      for (const cve of rows) {
        cves.push(cve as CVE)
      }
    }

    return cves.map((cve) => this.getCVEById(cve.id)).filter((r): r is CVEWithDetails => r !== undefined)
  }

  /**
   * Search CVEs by CPE text
   */
  searchCVEsByCPE(cpeText: string, limit = 100, offset = 0): CVEWithDetails[] {
    if (!this.db) throw new Error('Database not initialized')

    const results = this.db.exec(
      `
      SELECT DISTINCT c.* FROM cves c
      INNER JOIN cpe_matches cp ON c.id = cp.cve_id
      WHERE cp.cpe_text LIKE ?
      AND cp.vulnerable = 1
      ORDER BY c.cvss_score DESC
      LIMIT ? OFFSET ?
    `,
      [`%${cpeText}%`, limit, offset],
    )

    const cves: CVE[] = []

    if (results.length > 0) {
      const rows = rowsToObjects(results[0].columns, results[0].values)
      for (const cve of rows) {
        cves.push(cve as CVE)
      }
    }

    return cves.map((cve) => this.getCVEById(cve.id)).filter((r): r is CVEWithDetails => r !== undefined)
  }

  /**
   * Get total count of CVEs
   */
  getTotalCVECount(): number {
    if (!this.db) throw new Error('Database not initialized')

    const result = this.db.exec('SELECT COUNT(*) as count FROM cves')
    return result.length > 0 && result[0].values.length > 0 ? (result[0].values[0][0] as number) : 0
  }

  /**
   * Get database metadata
   */
  getMetadata(): DatabaseMetadata {
    if (!this.db) throw new Error('Database not initialized')

    const totalCves = this.db.exec('SELECT COUNT(*) as count FROM cves')
    const total = totalCves.length > 0 && totalCves[0].values.length > 0 ? (totalCves[0].values[0][0] as number) : 0

    const cvesAfter2021 = this.db.exec("SELECT COUNT(*) as count FROM cves WHERE published_at >= '2021-01-01'")
    const after2021 =
      cvesAfter2021.length > 0 && cvesAfter2021[0].values.length > 0 ? (cvesAfter2021[0].values[0][0] as number) : 0

    const lastSync = this.db.exec("SELECT value FROM metadata WHERE key = 'last_sync_at'")
    const lastSyncAt =
      lastSync.length > 0 && lastSync[0].values.length > 0 ? (lastSync[0].values[0][0] as string) : undefined

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
      const { statSync } = require('node:fs')
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

    this.db.run(
      `
      INSERT INTO metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
      [key, value],
    )

    await this.saveToDisk()
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
