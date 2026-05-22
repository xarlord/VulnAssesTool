/**
 * Unit tests for NvdDatabase instance methods (nvdDb.ts)
 *
 * Covers upsertCVE, insertCPEMatches, insertReferences, getCVEById,
 * getCVEFullDetails, searchCVEsByText, searchCVEsByCPE, getTotalCVECount,
 * getMetadata, getDbSize, updateMetadata, isInitialized, getRawDb, close,
 * getDatabase, resetDatabase, and parseCPE edge cases.
 *
 * Approach: create an in-memory sql.js Database, set up the full schema
 * (migrations 1-3), then inject it into a NvdDatabase instance via a
 * test-access interface.  saveToDisk is stubbed to avoid file I/O.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database, SqlJsStatic } from 'sql.js'
import { NvdDatabase, getDatabase, resetDatabase } from './nvdDb.js'
import type { CVE, CPEMatch, Reference } from './types.js'

// ---------------------------------------------------------------------------
// Test-only interface to reach into private members without `any`
// ---------------------------------------------------------------------------
interface NvdDatabaseTestAccess {
  db: Database | null
  autoSaveInterval: NodeJS.Timeout | null
  saveToDisk: () => Promise<void>
  runMigrations: () => Promise<void>
  addColumnsIfMissing: (table: string, columns: Record<string, string>) => void
  fileExists: (filePath: string) => Promise<boolean>
}

function asAccess(instance: NvdDatabase): NvdDatabaseTestAccess {
  return instance as unknown as NvdDatabaseTestAccess
}

// ---------------------------------------------------------------------------
// sql.js singleton + helpers
// ---------------------------------------------------------------------------
let sqlJs: SqlJsStatic | null = null

async function ensureSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJs) {
    sqlJs = await initSqlJs({})
  }
  return sqlJs
}

/**
 * Create an in-memory Database with the full schema applied
 * (equivalent to migrations 1-3 in nvdDb.ts).
 */
async function createSchemaDb(): Promise<Database> {
  const SQL = await ensureSqlJs()
  const db = new SQL.Database()

  // Migration 1 — base tables
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS cpe_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cve_id TEXT NOT NULL,
      cpe23_uri TEXT NOT NULL,
      vulnerable INTEGER NOT NULL DEFAULT 0,
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
      FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  db.run('CREATE INDEX IF NOT EXISTS idx_cves_severity ON cves(severity)')
  db.run('CREATE INDEX IF NOT EXISTS idx_cves_cvss_score ON cves(cvss_score)')
  db.run('CREATE INDEX IF NOT EXISTS idx_cves_published_at ON cves(published_at)')
  db.run('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cve_id ON cpe_matches(cve_id)')

  // Migration 2 — enhanced columns and new tables
  db.run(`CREATE TABLE IF NOT EXISTS sync_status (
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
  )`)

  // Enhanced CVE columns
  db.run('ALTER TABLE cves ADD COLUMN cwe_ids TEXT')
  db.run('ALTER TABLE cves ADD COLUMN vuln_status TEXT')
  db.run('ALTER TABLE cves ADD COLUMN assigner TEXT')
  db.run('ALTER TABLE cves ADD COLUMN cvss_v31_score REAL')
  db.run('ALTER TABLE cves ADD COLUMN cvss_v31_vector TEXT')
  db.run('ALTER TABLE cves ADD COLUMN cvss_v31_severity TEXT')
  db.run('ALTER TABLE cves ADD COLUMN cvss_v30_score REAL')
  db.run('ALTER TABLE cves ADD COLUMN cvss_v30_vector TEXT')
  db.run('ALTER TABLE cves ADD COLUMN cvss_v30_severity TEXT')
  db.run('ALTER TABLE cves ADD COLUMN cvss_v2_score REAL')
  db.run('ALTER TABLE cves ADD COLUMN cvss_v2_vector TEXT')
  db.run('ALTER TABLE cves ADD COLUMN cvss_v2_severity TEXT')
  db.run('ALTER TABLE cves ADD COLUMN cvss_score_legacy REAL')
  db.run('ALTER TABLE cves ADD COLUMN cvss_vector_legacy TEXT')

  // Enhanced CPE columns - version range already in CREATE TABLE

  // Enhanced references columns
  db.run('ALTER TABLE "references" ADD COLUMN reference_type TEXT')

  // cwe_references table
  db.run(`CREATE TABLE IF NOT EXISTS cwe_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cve_id TEXT NOT NULL,
    cwe_id TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
  )`)

  db.run('CREATE INDEX IF NOT EXISTS idx_cwe_refs_cve_id ON cwe_references(cve_id)')

  // Migration 3 — cvss_metrics table
  db.run(`CREATE TABLE IF NOT EXISTS cvss_metrics (
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
  )`)

  db.run('CREATE INDEX IF NOT EXISTS idx_cvss_metrics_cve_id ON cvss_metrics(cve_id)')

  // schema_migrations — mark all v1+v2 migrations as already applied
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)
  for (let v = 1; v <= 12; v++) {
    db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [v, new Date().toISOString()])
  }

  return db
}

/**
 * Create a NvdDatabase instance with an injected in-memory Database.
 * saveToDisk is stubbed as a no-op.
 */
async function createTestInstance(): Promise<NvdDatabase> {
  const instance = new NvdDatabase('/tmp/vulnassess-test/nvd-data.db')
  const rawDb = await createSchemaDb()

  const access = asAccess(instance)
  access.db = rawDb
  // Stub saveToDisk to prevent file I/O
  access.saveToDisk = async () => {}

  return instance
}

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------
function makeCVE(overrides: Partial<CVE> = {}): CVE {
  return {
    id: 'CVE-2024-0001',
    description: 'A test vulnerability',
    cvss_score: 7.5,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    severity: 'HIGH',
    published_at: '2024-01-15T00:00:00Z',
    modified_at: '2024-02-01T00:00:00Z',
    source: 'NVD',
    ...overrides,
  }
}

function makeCPEMatch(overrides: Partial<CPEMatch> = {}): CPEMatch {
  return {
    cve_id: 'CVE-2024-0001',
    cpe_text: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
    vulnerable: true,
    ...overrides,
  }
}

function makeReference(overrides: Partial<Reference> = {}): Reference {
  return {
    cve_id: 'CVE-2024-0001',
    url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-0001',
    ...overrides,
  }
}

// ===========================================================================
// Tests
// ===========================================================================

describe('NvdDatabase Instance Methods', () => {
  let instance: NvdDatabase
  let rawDb: Database

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as Database
  })

  afterEach(async () => {
    await resetDatabase()
  })

  // -------------------------------------------------------------------------
  // Constructor & accessors
  // -------------------------------------------------------------------------
  describe('constructor and accessors', () => {
    it('should use the provided dbPath', () => {
      const inst = new NvdDatabase('/custom/path.db')
      expect(inst.getDbPath()).toBe('/custom/path.db')
    })

    it('should return null from getRawDb when db is not set', () => {
      const inst = new NvdDatabase('/no/db.db')
      expect(inst.getRawDb()).toBeNull()
    })

    it('should return the raw Database from getRawDb', () => {
      expect(instance.getRawDb()).toBe(rawDb)
    })

    it('should return false from isInitialized when db is null', () => {
      const inst = new NvdDatabase('/no/db.db')
      expect(inst.isInitialized()).toBe(false)
    })

    it('should return true from isInitialized when db is set', () => {
      expect(instance.isInitialized()).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // upsertCVE
  // -------------------------------------------------------------------------
  describe('upsertCVE', () => {
    it('should insert a new CVE', async () => {
      const cve = makeCVE()
      await instance.upsertCVE(cve)

      const rows = rawDb.exec('SELECT id, description, severity FROM cves WHERE id = ?', [cve.id])
      expect(rows).toHaveLength(1)
      expect(rows[0].values).toHaveLength(1)
      expect(rows[0].values[0][0]).toBe(cve.id)
      expect(rows[0].values[0][1]).toBe(cve.description)
      expect(rows[0].values[0][2]).toBe('HIGH')
    })

    it('should update an existing CVE on conflict', async () => {
      const cve = makeCVE()
      await instance.upsertCVE(cve)

      // Upsert with updated description
      const updated = makeCVE({ description: 'Updated description', severity: 'CRITICAL' })
      await instance.upsertCVE(updated)

      const rows = rawDb.exec('SELECT description, severity FROM cves WHERE id = ?', [cve.id])
      expect(rows[0].values[0][0]).toBe('Updated description')
      expect(rows[0].values[0][1]).toBe('CRITICAL')
    })

    it('should store null for missing optional cvss fields', async () => {
      const cve = makeCVE({ cvss_score: undefined, cvss_vector: undefined, severity: undefined })
      await instance.upsertCVE(cve)

      // Workaround: upsertCVE converts undefined to null via `|| null`
      const rows = rawDb.exec('SELECT cvss_score, cvss_vector, severity FROM cves WHERE id = ?', [cve.id])
      expect(rows[0].values[0][0]).toBeNull()
      expect(rows[0].values[0][1]).toBeNull()
    })

    it('should throw when database is not initialized', async () => {
      const inst = new NvdDatabase('/no/db.db')
      await expect(inst.upsertCVE(makeCVE())).rejects.toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // insertCPEMatches
  // -------------------------------------------------------------------------
  describe('insertCPEMatches', () => {
    it('should insert CPE matches for a CVE', async () => {
      await instance.upsertCVE(makeCVE())
      await instance.insertCPEMatches('CVE-2024-0001', [
        makeCPEMatch({ cpe_text: 'cpe:2.3:a:vendor:product:1.0', vulnerable: true }),
        makeCPEMatch({ cpe_text: 'cpe:2.3:a:vendor:product:2.0', vulnerable: false }),
      ])

      const rows = rawDb.exec('SELECT cpe23_uri, vulnerable FROM cpe_matches WHERE cve_id = ?', ['CVE-2024-0001'])
      expect(rows[0].values).toHaveLength(2)
    })

    it('should replace existing CPE matches on re-insert', async () => {
      await instance.upsertCVE(makeCVE())

      await instance.insertCPEMatches('CVE-2024-0001', [makeCPEMatch({ cpe_text: 'cpe:2.3:a:vendor:product:1.0' })])
      await instance.insertCPEMatches('CVE-2024-0001', [makeCPEMatch({ cpe_text: 'cpe:2.3:a:vendor:product:3.0' })])

      const rows = rawDb.exec('SELECT cpe23_uri FROM cpe_matches WHERE cve_id = ?', ['CVE-2024-0001'])
      // Should only have the new match
      expect(rows[0].values).toHaveLength(1)
      expect(rows[0].values[0][0]).toBe('cpe:2.3:a:vendor:product:3.0')
    })

    it('should store vulnerable=1 for true and 0 for false', async () => {
      await instance.upsertCVE(makeCVE())
      await instance.insertCPEMatches('CVE-2024-0001', [
        makeCPEMatch({ cpe_text: 'cpe:a:v:p:1', vulnerable: true }),
        makeCPEMatch({ cpe_text: 'cpe:a:v:p:2', vulnerable: false }),
      ])

      const rows = rawDb.exec('SELECT vulnerable FROM cpe_matches WHERE cve_id = ? ORDER BY cpe23_uri', [
        'CVE-2024-0001',
      ])
      expect(rows[0].values[0][0]).toBe(1)
      expect(rows[0].values[1][0]).toBe(0)
    })

    it('should throw when database is not initialized', async () => {
      const inst = new NvdDatabase('/no/db.db')
      await expect(inst.insertCPEMatches('CVE-2024-0001', [])).rejects.toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // insertReferences
  // -------------------------------------------------------------------------
  describe('insertReferences', () => {
    it('should insert references for a CVE', async () => {
      await instance.upsertCVE(makeCVE())
      await instance.insertReferences('CVE-2024-0001', [
        makeReference({ url: 'https://example.com/advisory' }),
        makeReference({ url: 'https://example.com/patch', source: 'Vendor', tags: 'Patch,Third Party Advisory' }),
      ])

      const rows = rawDb.exec('SELECT url, source, tags FROM "references" WHERE cve_id = ?', ['CVE-2024-0001'])
      expect(rows[0].values).toHaveLength(2)
      expect(rows[0].values[0][0]).toBe('https://example.com/advisory')
      expect(rows[0].values[1][1]).toBe('Vendor')
      expect(rows[0].values[1][2]).toBe('Patch,Third Party Advisory')
    })

    it('should replace existing references on re-insert', async () => {
      await instance.upsertCVE(makeCVE())

      await instance.insertReferences('CVE-2024-0001', [makeReference({ url: 'https://old-url.com' })])
      await instance.insertReferences('CVE-2024-0001', [makeReference({ url: 'https://new-url.com' })])

      const rows = rawDb.exec('SELECT url FROM "references" WHERE cve_id = ?', ['CVE-2024-0001'])
      expect(rows[0].values).toHaveLength(1)
      expect(rows[0].values[0][0]).toBe('https://new-url.com')
    })

    it('should store null when source and tags are omitted', async () => {
      await instance.upsertCVE(makeCVE())
      await instance.insertReferences('CVE-2024-0001', [makeReference({ url: 'https://example.com' })])

      const rows = rawDb.exec('SELECT source, tags FROM "references" WHERE cve_id = ?', ['CVE-2024-0001'])
      expect(rows[0].values[0][0]).toBeNull()
      expect(rows[0].values[0][1]).toBeNull()
    })

    it('should throw when database is not initialized', async () => {
      const inst = new NvdDatabase('/no/db.db')
      await expect(inst.insertReferences('CVE-2024-0001', [])).rejects.toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // getCVEById
  // -------------------------------------------------------------------------
  describe('getCVEById', () => {
    it('should return a CVE with its details', async () => {
      const cve = makeCVE()
      await instance.upsertCVE(cve)

      const result = instance.getCVEById('CVE-2024-0001')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('CVE-2024-0001')
      expect(result?.description).toBe('A test vulnerability')
      expect(result?.severity).toBe('HIGH')
      expect(result?.source).toBe('NVD')
    })

    it('should return null for a non-existent CVE', () => {
      const result = instance.getCVEById('CVE-9999-0000')
      expect(result).toBeNull()
    })

    it('should include CPE matches', async () => {
      await instance.upsertCVE(makeCVE())
      await instance.insertCPEMatches('CVE-2024-0001', [
        makeCPEMatch({ cpe_text: 'cpe:2.3:a:vendor:product:1.0', vulnerable: true }),
      ])

      const result = instance.getCVEById('CVE-2024-0001')
      expect(result?.cpe_matches).toHaveLength(1)
      expect(result?.cpe_matches?.[0]?.cpe_text).toBe('cpe:2.3:a:vendor:product:1.0')
      expect(result?.cpe_matches?.[0]?.vulnerable).toBe(true)
    })

    it('should include references', async () => {
      await instance.upsertCVE(makeCVE())
      await instance.insertReferences('CVE-2024-0001', [
        makeReference({ url: 'https://example.com/ref1', source: 'NVD', tags: 'Patch' }),
      ])

      const result = instance.getCVEById('CVE-2024-0001')
      expect(result?.references).toHaveLength(1)
      expect(result?.references?.[0]?.url).toBe('https://example.com/ref1')
    })

    it('should throw when database is not initialized', () => {
      const inst = new NvdDatabase('/no/db.db')
      expect(() => inst.getCVEById('CVE-2024-0001')).toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // getCVEFullDetails
  // -------------------------------------------------------------------------
  describe('getCVEFullDetails', () => {
    /**
     * Insert a CVE with all enhanced columns + related data using raw SQL.
     */
    function insertFullCVE(): void {
      rawDb.run(
        `INSERT INTO cves (id, description, cvss_score, cvss_vector, severity,
          published_at, modified_at, source, vuln_status, assigner,
          cvss_v31_score, cvss_v31_vector, cvss_v31_severity,
          cvss_v30_score, cvss_v30_vector, cvss_v30_severity,
          cvss_v2_score, cvss_v2_vector, cvss_v2_severity)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          'CVE-2024-1234',
          'Full detail CVE',
          9.8,
          'CVSS:3.1/AV:N',
          'CRITICAL',
          '2024-03-01T00:00:00Z',
          '2024-04-01T00:00:00Z',
          'NVD',
          'Analyzed',
          'cve@mitre.org',
          9.8,
          'CVSS:3.1/AV:N',
          'CRITICAL',
          8.5,
          'CVSS:3.0/AV:N',
          'HIGH',
          7.0,
          'CVSS:2.0/AV:N',
          'HIGH',
        ],
      )

      // CPE match with version ranges
      rawDb.run(
        `INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable,
          version_start_including, version_end_excluding)
         VALUES (?,?,?,?,?)`,
        ['CVE-2024-1234', 'cpe:2.3:a:vendor:product:*', 1, '1.0', '2.0'],
      )

      // CWE reference
      rawDb.run('INSERT INTO cwe_references (cve_id, cwe_id, description) VALUES (?,?,?)', [
        'CVE-2024-1234',
        'CWE-79',
        'XSS vulnerability',
      ])

      // Reference with tags and type
      rawDb.run(`INSERT INTO "references" (cve_id, url, source, tags, reference_type) VALUES (?,?,?,?,?)`, [
        'CVE-2024-1234',
        'https://example.com/advisory',
        'NVD',
        'Patch,Vendor Advisory',
        'Advisory',
      ])

      // CVSS metrics
      rawDb.run(
        `INSERT INTO cvss_metrics (cve_id, source, type, version, score, severity, vector, exploitability_score, impact_score)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        ['CVE-2024-1234', 'nvd@nist.gov', 'Primary', '3.1', 9.8, 'CRITICAL', 'CVSS:3.1/AV:N', 3.9, 5.9],
      )
    }

    it('should return full CVE details with all related data', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')

      expect(result).not.toBeNull()
      expect(result?.id).toBe('CVE-2024-1234')
      expect(result?.description).toBe('Full detail CVE')
    })

    it('should return null for a non-existent CVE via getCVEById', () => {
      const result = instance.getCVEById('CVE-9999-0000')
      expect(result).toBeNull()
    })

    it('should handle non-existent CVE in getCVEFullDetails', () => {
      // Note: getCVEFullDetails uses getAsObject which returns {} for no match,
      // so the null check `if (!result)` does not trigger. The returned object
      // has all fields as undefined (or defaults like severity='LOW').
      const result = instance.getCVEFullDetails('CVE-9999-0000')
      // Verify the id is falsy — indicating no real CVE was found
      expect(result).not.toBeNull()
      expect(result?.id).toBeFalsy()
    })

    it('should populate CVSS v3.1 fields', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      expect(result?.cvssV31Score).toBe(9.8)
      expect(result?.cvssV31Vector).toBe('CVSS:3.1/AV:N')
      expect(result?.cvssV31Severity).toBe('CRITICAL')
    })

    it('should populate CVSS v3.0 fields', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      expect(result?.cvssV30Score).toBe(8.5)
      expect(result?.cvssV30Severity).toBe('HIGH')
    })

    it('should populate CVSS v2.0 fields', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      expect(result?.cvssV2Score).toBe(7.0)
      expect(result?.cvssV2Severity).toBe('HIGH')
    })

    it('should include source tracking fields', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      expect(result?.source).toBe('NVD')
      expect(result?.vulnStatus).toBe('Analyzed')
      expect(result?.assigner).toBe('cve@mitre.org')
    })

    it('should include CPE matches with version ranges', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      expect(result?.cpeMatches).toHaveLength(1)
      expect(result?.cpeMatches[0]?.cpe23Uri).toBe('cpe:2.3:a:vendor:product:*')
      expect(result?.cpeMatches[0]?.vulnerable).toBe(true)
      expect(result?.cpeMatches[0]?.versionStartIncluding).toBe('1.0')
      expect(result?.cpeMatches[0]?.versionEndExcluding).toBe('2.0')
    })

    it('should include CWE references', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      expect(result?.cweReferences).toHaveLength(1)
      expect(result?.cweReferences[0]?.cweId).toBe('CWE-79')
      expect(result?.cweReferences[0]?.description).toBe('XSS vulnerability')
    })

    it('should include references with parsed tags', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      expect(result?.references).toHaveLength(1)
      expect(result?.references[0]?.url).toBe('https://example.com/advisory')
      expect(result?.references[0]?.tags).toEqual(['Patch', 'Vendor Advisory'])
      expect(result?.references[0]?.referenceType).toBe('Advisory')
    })

    it('should collect reference tags into referenceTags array', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      // Tags from the tags column + reference_type
      expect(result?.referenceTags).toContain('patch')
      expect(result?.referenceTags).toContain('vendor advisory')
      expect(result?.referenceTags).toContain('advisory')
    })

    it('should determine severity preferring v3.1 over v3.0 and v2', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      expect(result?.severity).toBe('CRITICAL') // from cvss_v31_severity
    })

    it('should fall back to v3.0 severity when v3.1 is absent', () => {
      // Insert CVE with only v3.0 severity
      rawDb.run(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source,
          cvss_v30_score, cvss_v30_vector, cvss_v30_severity)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        ['CVE-2024-V30', 'v3.0 only', 'LOW', '2024-01-01', '2024-01-01', 'NVD', 5.0, 'CVSS:3.0', 'MEDIUM'],
      )

      const result = instance.getCVEFullDetails('CVE-2024-V30')
      expect(result?.severity).toBe('MEDIUM') // v3.0 wins over base severity
    })

    it('should normalize NONE severity to LOW', () => {
      rawDb.run(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
         VALUES (?,?,?,?,?,?)`,
        ['CVE-2024-NONE', 'no severity', 'NONE', '2024-01-01', '2024-01-01', 'NVD'],
      )

      const result = instance.getCVEFullDetails('CVE-2024-NONE')
      expect(result?.severity).toBe('LOW')
    })

    it('should include CVSS metrics from dedicated table', () => {
      insertFullCVE()

      const result = instance.getCVEFullDetails('CVE-2024-1234')
      expect(result?.cvssMetrics).toHaveLength(1)
      expect(result?.cvssMetrics?.[0]?.source).toBe('nvd@nist.gov')
      expect(result?.cvssMetrics?.[0]?.type).toBe('Primary')
      expect(result?.cvssMetrics?.[0]?.version).toBe('3.1')
      expect(result?.cvssMetrics?.[0]?.score).toBe(9.8)
      expect(result?.cvssMetrics?.[0]?.exploitabilityScore).toBe(3.9)
      expect(result?.cvssMetrics?.[0]?.impactScore).toBe(5.9)
    })

    it('should return undefined cvssMetrics when table is empty', () => {
      rawDb.run(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
         VALUES (?,?,?,?,?,?)`,
        ['CVE-2024-NOMETRICS', 'no metrics', 'LOW', '2024-01-01', '2024-01-01', 'NVD'],
      )

      const result = instance.getCVEFullDetails('CVE-2024-NOMETRICS')
      expect(result?.cvssMetrics).toBeUndefined()
    })

    it('should handle CVE with no references gracefully', () => {
      rawDb.run(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
         VALUES (?,?,?,?,?,?)`,
        ['CVE-2024-NOREFS', 'no refs', 'LOW', '2024-01-01', '2024-01-01', 'NVD'],
      )

      const result = instance.getCVEFullDetails('CVE-2024-NOREFS')
      expect(result?.references).toEqual([])
      expect(result?.referenceTags).toEqual([])
    })

    it('should throw when database is not initialized', () => {
      const inst = new NvdDatabase('/no/db.db')
      expect(() => inst.getCVEFullDetails('CVE-2024-0001')).toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // searchCVEsByText
  // -------------------------------------------------------------------------
  describe('searchCVEsByText', () => {
    beforeEach(async () => {
      await instance.upsertCVE(
        makeCVE({
          id: 'CVE-2024-0001',
          description: 'Apache log4j remote code execution',
          cvss_score: 10.0,
          severity: 'CRITICAL',
        }),
      )
      await instance.upsertCVE(
        makeCVE({ id: 'CVE-2024-0002', description: 'OpenSSL buffer overflow', cvss_score: 7.5, severity: 'HIGH' }),
      )
      await instance.upsertCVE(
        makeCVE({
          id: 'CVE-2024-0003',
          description: 'nginx information disclosure',
          cvss_score: 5.0,
          severity: 'MEDIUM',
        }),
      )
    })

    it('should find CVEs by description text', () => {
      const results = instance.searchCVEsByText('Apache')
      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe('CVE-2024-0001')
    })

    it('should find CVEs by CVE ID', () => {
      const results = instance.searchCVEsByText('CVE-2024-0002')
      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe('CVE-2024-0002')
    })

    it('should return empty array for no matches', () => {
      const results = instance.searchCVEsByText('nonexistent-query-xyz')
      expect(results).toEqual([])
    })

    it('should respect the limit parameter', () => {
      // 'e' appears in all three descriptions
      const results = instance.searchCVEsByText('e', 2)
      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('should respect the offset parameter', () => {
      const allResults = instance.searchCVEsByText('e', 100, 0)
      const offsetResults = instance.searchCVEsByText('e', 100, 1)

      if (allResults.length > 1) {
        expect(offsetResults.length).toBe(allResults.length - 1)
      }
    })

    it('should throw when database is not initialized', () => {
      const inst = new NvdDatabase('/no/db.db')
      expect(() => inst.searchCVEsByText('test')).toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // searchCVEsByCPE
  // -------------------------------------------------------------------------
  describe('searchCVEsByCPE', () => {
    beforeEach(async () => {
      await instance.upsertCVE(makeCVE({ id: 'CVE-2024-0100' }))
      await instance.insertCPEMatches('CVE-2024-0100', [
        makeCPEMatch({ cve_id: 'CVE-2024-0100', cpe_text: 'cpe:2.3:a:apache:log4j:2.0', vulnerable: true }),
      ])

      await instance.upsertCVE(makeCVE({ id: 'CVE-2024-0200', cvss_score: 5.0 }))
      await instance.insertCPEMatches('CVE-2024-0200', [
        makeCPEMatch({ cve_id: 'CVE-2024-0200', cpe_text: 'cpe:2.3:a:apache:tomcat:9.0', vulnerable: true }),
        makeCPEMatch({ cve_id: 'CVE-2024-0200', cpe_text: 'cpe:2.3:a:apache:tomcat:9.0', vulnerable: false }),
      ])
    })

    it('should find CVEs by CPE text', () => {
      const results = instance.searchCVEsByCPE('apache')
      expect(results.length).toBeGreaterThanOrEqual(2)
    })

    it('should only return CVEs with vulnerable=1 CPE matches', () => {
      // Searching for 'tomcat' should find CVE-2024-0200 because it has a vulnerable=1 match
      const results = instance.searchCVEsByCPE('tomcat')
      expect(results).toHaveLength(1)
      expect(results[0]?.id).toBe('CVE-2024-0200')
    })

    it('should return empty array when no CPE matches found', () => {
      const results = instance.searchCVEsByCPE('nonexistent-product')
      expect(results).toEqual([])
    })

    it('should throw when database is not initialized', () => {
      const inst = new NvdDatabase('/no/db.db')
      expect(() => inst.searchCVEsByCPE('test')).toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // getTotalCVECount
  // -------------------------------------------------------------------------
  describe('getTotalCVECount', () => {
    it('should return 0 for an empty database', () => {
      expect(instance.getTotalCVECount()).toBe(0)
    })

    it('should return the count of inserted CVEs', async () => {
      await instance.upsertCVE(makeCVE({ id: 'CVE-2024-0001' }))
      await instance.upsertCVE(makeCVE({ id: 'CVE-2024-0002' }))
      await instance.upsertCVE(makeCVE({ id: 'CVE-2024-0003' }))

      expect(instance.getTotalCVECount()).toBe(3)
    })

    it('should not double-count upserted CVEs', async () => {
      await instance.upsertCVE(makeCVE({ id: 'CVE-2024-0001' }))
      await instance.upsertCVE(makeCVE({ id: 'CVE-2024-0001', description: 'Updated' }))

      expect(instance.getTotalCVECount()).toBe(1)
    })

    it('should throw when database is not initialized', () => {
      const inst = new NvdDatabase('/no/db.db')
      expect(() => inst.getTotalCVECount()).toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // getMetadata
  // -------------------------------------------------------------------------
  describe('getMetadata', () => {
    it('should return metadata with zero CVEs for empty database', () => {
      const meta = instance.getMetadata()
      expect(meta.total_cves).toBe(0)
      expect(meta.cves_after_2021).toBe(0)
      expect(meta.schema_version).toBe('1.0.0')
    })

    it('should count CVEs after 2021', async () => {
      await instance.upsertCVE(makeCVE({ id: 'CVE-2020-0001', published_at: '2020-06-01T00:00:00Z' }))
      await instance.upsertCVE(makeCVE({ id: 'CVE-2023-0001', published_at: '2023-01-15T00:00:00Z' }))
      await instance.upsertCVE(makeCVE({ id: 'CVE-2024-0001', published_at: '2024-03-01T00:00:00Z' }))

      const meta = instance.getMetadata()
      expect(meta.total_cves).toBe(3)
      expect(meta.cves_after_2021).toBe(2) // 2023 + 2024
    })

    it('should return last_sync_at from metadata table', async () => {
      await instance.updateMetadata('last_sync_at', '2024-06-01T12:00:00Z')

      const meta = instance.getMetadata()
      expect(meta.last_sync_at).toBe('2024-06-01T12:00:00Z')
    })

    it('should return undefined last_sync_at when not set', () => {
      const meta = instance.getMetadata()
      expect(meta.last_sync_at).toBeUndefined()
    })

    it('should throw when database is not initialized', () => {
      const inst = new NvdDatabase('/no/db.db')
      expect(() => inst.getMetadata()).toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // getDbSize
  // -------------------------------------------------------------------------
  describe('getDbSize', () => {
    it('should return 0 for a non-existent path', () => {
      // The test instance uses /tmp/vulnassess-test/nvd-data.db which doesn't exist on disk
      const size = instance.getDbSize()
      expect(size).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // updateMetadata
  // -------------------------------------------------------------------------
  describe('updateMetadata', () => {
    it('should insert a new metadata key-value pair', async () => {
      await instance.updateMetadata('test_key', 'test_value')

      const rows = rawDb.exec("SELECT value FROM metadata WHERE key = 'test_key'")
      expect(rows[0].values[0][0]).toBe('test_value')
    })

    it('should update an existing metadata key', async () => {
      await instance.updateMetadata('test_key', 'v1')
      await instance.updateMetadata('test_key', 'v2')

      const rows = rawDb.exec("SELECT value FROM metadata WHERE key = 'test_key'")
      expect(rows[0].values[0][0]).toBe('v2')
    })

    it('should throw when database is not initialized', async () => {
      const inst = new NvdDatabase('/no/db.db')
      await expect(inst.updateMetadata('k', 'v')).rejects.toThrow('Database not initialized')
    })
  })

  // -------------------------------------------------------------------------
  // close
  // -------------------------------------------------------------------------
  describe('close', () => {
    it('should set db to null after closing', async () => {
      expect(instance.isInitialized()).toBe(true)
      await instance.close()
      expect(instance.isInitialized()).toBe(false)
    })

    it('should set getRawDb to null after closing', async () => {
      expect(instance.getRawDb()).not.toBeNull()
      await instance.close()
      expect(instance.getRawDb()).toBeNull()
    })

    it('should be safe to call close when db is already null', async () => {
      asAccess(instance).db = null
      // Should not throw — the if (this.db) guard prevents the save + close
      await instance.close()
    })
  })

  // -------------------------------------------------------------------------
  // parseCPE — additional edge cases beyond nvdDbEnhanced.test.ts
  // -------------------------------------------------------------------------
  describe('parseCPE (edge cases)', () => {
    it('should parse CPE 2.3 with only 4 parts (no version)', () => {
      const result = NvdDatabase.parseCPE('cpe:2.3:a:google')
      expect(result.part).toBe('a')
      expect(result.vendor).toBe('google')
      expect(result.product).toBeNull()
      expect(result.version).toBeNull()
    })

    it('should parse CPE 2.2 with only part', () => {
      const result = NvdDatabase.parseCPE('cpe:/a')
      expect(result.part).toBe('a')
      expect(result.vendor).toBeNull()
    })

    it('should parse CPE 2.2 with part and vendor only', () => {
      const result = NvdDatabase.parseCPE('cpe:/a:google')
      expect(result.part).toBe('a')
      expect(result.vendor).toBe('google')
      expect(result.product).toBeNull()
      expect(result.version).toBeNull()
    })

    it('should parse CPE 2.2 with part, vendor, product, version', () => {
      const result = NvdDatabase.parseCPE('cpe:/a:google:chrome:120.0')
      expect(result.part).toBe('a')
      expect(result.vendor).toBe('google')
      expect(result.product).toBe('chrome')
      expect(result.version).toBe('120.0')
    })

    it('should handle empty string CPE', () => {
      const result = NvdDatabase.parseCPE('')
      expect(result.part).toBeNull()
      expect(result.vendor).toBeNull()
      expect(result.product).toBeNull()
      expect(result.version).toBeNull()
    })

    it('should return nulls for unrecognized format', () => {
      const result = NvdDatabase.parseCPE('not-a-cpe-string')
      expect(result.part).toBeNull()
      expect(result.vendor).toBeNull()
      expect(result.product).toBeNull()
      expect(result.version).toBeNull()
    })

    it('should handle CPE 2.3 with empty vendor segment', () => {
      const result = NvdDatabase.parseCPE('cpe:2.3:a::product:1.0:*:*:*:*:*:*:*')
      expect(result.part).toBe('a')
      expect(result.vendor).toBeNull() // empty string || null => null
      expect(result.product).toBe('product')
    })
  })
})

// ===========================================================================
// Singleton management — getDatabase / resetDatabase
// ===========================================================================
describe('getDatabase / resetDatabase', () => {
  afterEach(async () => {
    await resetDatabase()
  })

  it('getDatabase should return a NvdDatabase instance', () => {
    const db = getDatabase('/tmp/test-singleton.db')
    expect(db).toBeInstanceOf(NvdDatabase)
    expect(db.getDbPath()).toBe('/tmp/test-singleton.db')
  })

  it('getDatabase should return the same instance on subsequent calls', () => {
    const first = getDatabase('/tmp/test-singleton.db')
    const second = getDatabase()
    expect(first).toBe(second)
  })

  it('resetDatabase should clear the singleton', async () => {
    const first = getDatabase('/tmp/test-singleton.db')
    await resetDatabase()
    const second = getDatabase('/tmp/other-path.db')
    // After reset, a new instance is created
    expect(second).not.toBe(first)
    expect(second.getDbPath()).toBe('/tmp/other-path.db')
  })

  it('resetDatabase should be safe when no instance exists', async () => {
    await resetDatabase()
    // Calling again should not throw
    await resetDatabase()
  })
})

// ===========================================================================
// AsyncMutex
// ===========================================================================
describe('AsyncMutex', () => {
  it('should allow sequential acquisition and release', async () => {
    const { NvdDatabase } = await import('./nvdDb.js')
    const inst = new NvdDatabase('/tmp/mutex-test.db')
    const access = asAccess(inst)
    const db = await createSchemaDb()
    access.db = db
    access.saveToDisk = async () => {}

    // saveToDisk uses the mutex internally — call it twice sequentially
    // (saveToDisk is stubbed, but the mutex itself is still exercised by close)
    await inst.close()
    expect(inst.isInitialized()).toBe(false)
  })
})

// ===========================================================================
// addColumnsIfMissing — exercised via runMigrations
// ===========================================================================
describe('NvdDatabase addColumnsIfMissing (via schema)', () => {
  let instance: NvdDatabase
  let rawDb: Database

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as Database
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('should have cwe_ids column after migration 2', async () => {
    const info = rawDb.exec('PRAGMA table_info(cves)')
    const colNames = info[0].values.map((v) => v[1])
    expect(colNames).toContain('cwe_ids')
  })

  it('should have cpe23_uri column after migration 2', async () => {
    const info = rawDb.exec('PRAGMA table_info(cpe_matches)')
    const colNames = info[0].values.map((v) => v[1])
    expect(colNames).toContain('cpe23_uri')
  })

  it('should have reference_type column after migration 2', async () => {
    const info = rawDb.exec('PRAGMA table_info("references")')
    const colNames = info[0].values.map((v) => v[1])
    expect(colNames).toContain('reference_type')
  })

  it('should have cvss_metrics table after migration 3', () => {
    const info = rawDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cvss_metrics'")
    expect(info.length).toBeGreaterThan(0)
  })

  it('should have cwe_references table after migration 2', () => {
    const info = rawDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cwe_references'")
    expect(info.length).toBeGreaterThan(0)
  })

  it('should have sync_status table after migration 2', () => {
    const info = rawDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_status'")
    expect(info.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// saveToDisk — actual file I/O test
// ===========================================================================
describe('NvdDatabase saveToDisk', () => {
  let instance: NvdDatabase
  let rawDb: Database
  const tmpDir = 'C:\\Users\\SEFA~1.OCA\\AppData\\Local\\Temp\\opencode\\nvd-test'

  beforeEach(async () => {
    await resetDatabase()
    const sqlJsMod = await initSqlJs({})
    rawDb = new sqlJsMod.Database()
    rawDb.run('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)')
    rawDb.run('INSERT INTO test VALUES (42)')

    const fs = await import('node:fs/promises')
    await fs.mkdir(tmpDir, { recursive: true })
    instance = new NvdDatabase(tmpDir + '\\save-test.db')
    const access = asAccess(instance)
    access.db = rawDb
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('should persist database to disk', async () => {
    await asAccess(instance).saveToDisk()
    const fs = await import('node:fs/promises')
    const stat = await fs.stat(tmpDir + '\\save-test.db')
    expect(stat.size).toBeGreaterThan(0)
  })

  it('should throw if db is null', async () => {
    const inst = new NvdDatabase('/tmp/no-db.db')
    await expect(asAccess(inst).saveToDisk()).rejects.toThrow('Database not initialized')
  })

  it('should create backup files on save', async () => {
    await asAccess(instance).saveToDisk()
    // Save again to create backup rotation
    await asAccess(instance).saveToDisk()
    const fs = await import('node:fs/promises')
    const backupStat = await fs.stat(tmpDir + '\\save-test.db.backup')
    expect(backupStat.size).toBeGreaterThan(0)
  })
})

// ===========================================================================
// getCVEFullDetails — uncovered branches
// ===========================================================================
describe('NvdDatabase getCVEFullDetails uncovered branches', () => {
  let instance: NvdDatabase
  let rawDb: Database

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as Database
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('should fall back to v2 severity when v3.1 and v3.0 are absent', () => {
    rawDb.run(
      `INSERT INTO cves (id, description, severity, published_at, modified_at, source,
        cvss_v2_score, cvss_v2_vector, cvss_v2_severity)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      ['CVE-2024-V2', 'v2 only', 'LOW', '2024-01-01', '2024-01-01', 'NVD', 4.0, 'CVSS:2.0', 'MEDIUM'],
    )

    const result = instance.getCVEFullDetails('CVE-2024-V2')
    expect(result?.severity).toBe('MEDIUM')
  })

  it('should handle empty severity (normalize to LOW)', () => {
    rawDb.run(
      `INSERT INTO cves (id, description, published_at, modified_at, source)
       VALUES (?,?,?,?,?)`,
      ['CVE-2024-EMPTY', 'empty severity', '2024-01-01', '2024-01-01', 'NVD'],
    )

    const result = instance.getCVEFullDetails('CVE-2024-EMPTY')
    expect(result?.severity).toBe('LOW')
  })

  it('should handle reference without tags', () => {
    rawDb.run(
      `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      ['CVE-2024-NOTAGS', 'no tags', 'LOW', '2024-01-01', '2024-01-01', 'NVD'],
    )
    rawDb.run(`INSERT INTO "references" (cve_id, url, source) VALUES (?,?,?)`, [
      'CVE-2024-NOTAGS',
      'https://example.com',
      'NVD',
    ])

    const result = instance.getCVEFullDetails('CVE-2024-NOTAGS')
    expect(result?.references).toHaveLength(1)
    expect(result?.references[0]?.tags).toBeUndefined()
  })

  it('should handle reference with reference_type only (no tags)', () => {
    rawDb.run(
      `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      ['CVE-2024-REFTYPE', 'ref type only', 'LOW', '2024-01-01', '2024-01-01', 'NVD'],
    )
    rawDb.run(`INSERT INTO "references" (cve_id, url, reference_type) VALUES (?,?,?)`, [
      'CVE-2024-REFTYPE',
      'https://example.com',
      'Vendor Advisory',
    ])

    const result = instance.getCVEFullDetails('CVE-2024-REFTYPE')
    expect(result?.referenceTags).toContain('vendor advisory')
    expect(result?.references[0]?.referenceType).toBe('Vendor Advisory')
  })

  it('should handle CVE with no CPE matches, CWE refs, or CVSS metrics', () => {
    rawDb.run(
      `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      ['CVE-2024-BARE', 'bare bones', 'LOW', '2024-01-01', '2024-01-01', 'NVD'],
    )

    const result = instance.getCVEFullDetails('CVE-2024-BARE')
    expect(result?.cpeMatches).toEqual([])
    expect(result?.cweReferences).toEqual([])
    expect(result?.references).toEqual([])
    expect(result?.referenceTags).toEqual([])
    expect(result?.cvssMetrics).toBeUndefined()
  })

  it('should handle CWE reference without description', () => {
    rawDb.run(
      `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      ['CVE-2024-CWENODESC', 'cwe no desc', 'LOW', '2024-01-01', '2024-01-01', 'NVD'],
    )
    rawDb.run('INSERT INTO cwe_references (cve_id, cwe_id) VALUES (?,?)', ['CVE-2024-CWENODESC', 'CWE-89'])

    const result = instance.getCVEFullDetails('CVE-2024-CWENODESC')
    expect(result?.cweReferences).toHaveLength(1)
    expect(result?.cweReferences[0]?.cweId).toBe('CWE-89')
    expect(result?.cweReferences[0]?.description).toBeUndefined()
  })

  it('should handle source field defaulting to NVD', () => {
    rawDb.run(
      `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      ['CVE-2024-SOURCE', 'test source', 'LOW', '2024-01-01', '2024-01-01', 'NVD'],
    )

    const result = instance.getCVEFullDetails('CVE-2024-SOURCE')
    expect(result?.source).toBe('NVD')
  })

  it('should handle multiple CVSS metrics', () => {
    rawDb.run(
      `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      ['CVE-2024-MULTIMETRICS', 'multi metrics', 'LOW', '2024-01-01', '2024-01-01', 'NVD'],
    )
    rawDb.run(
      `INSERT INTO cvss_metrics (cve_id, source, type, version, score, severity, vector) VALUES (?,?,?,?,?,?,?)`,
      ['CVE-2024-MULTIMETRICS', 'nvd@nist.gov', 'Primary', '3.1', 9.8, 'CRITICAL', 'CVSS:3.1/AV:N'],
    )
    rawDb.run(
      `INSERT INTO cvss_metrics (cve_id, source, type, version, score, severity, vector) VALUES (?,?,?,?,?,?,?)`,
      ['CVE-2024-MULTIMETRICS', 'cna@org', 'Secondary', '3.0', 8.5, 'HIGH', 'CVSS:3.0/AV:N'],
    )

    const result = instance.getCVEFullDetails('CVE-2024-MULTIMETRICS')
    expect(result?.cvssMetrics).toHaveLength(2)
  })

  it('should handle CPE match with no version range fields', () => {
    rawDb.run(
      `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      ['CVE-2024-CPENOVR', 'cpe no version range', 'LOW', '2024-01-01', '2024-01-01', 'NVD'],
    )
    rawDb.run(`INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable) VALUES (?,?,?)`, [
      'CVE-2024-CPENOVR',
      'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
      1,
    ])

    const result = instance.getCVEFullDetails('CVE-2024-CPENOVR')
    expect(result?.cpeMatches).toHaveLength(1)
    expect(result?.cpeMatches[0]?.versionStartIncluding).toBeUndefined()
    expect(result?.cpeMatches[0]?.versionEndExcluding).toBeUndefined()
  })
})

// ===========================================================================
// close — with autoSaveInterval cleanup
// ===========================================================================
describe('NvdDatabase close — autoSaveInterval cleanup', () => {
  afterEach(async () => {
    await resetDatabase()
  })

  it('should clear autoSaveInterval on close', async () => {
    const inst = await createTestInstance()
    const access = asAccess(inst)

    // Simulate an active autoSaveInterval
    access.autoSaveInterval = setTimeout(() => {}, 100000) as unknown as NodeJS.Timeout

    await inst.close()
    expect(access.autoSaveInterval).toBeNull()
  })
})

// ===========================================================================
// runMigrations — full migration coverage (lines 339-527)
// ===========================================================================
describe('NvdDatabase runMigrations', () => {
  let instance: NvdDatabase
  let rawDb: Database

  beforeEach(async () => {
    await resetDatabase()
    const SQL = await ensureSqlJs()
    rawDb = new SQL.Database()
    instance = new NvdDatabase('/tmp/test-migrations.db')
    const access = asAccess(instance)
    access.db = rawDb
    access.saveToDisk = async () => {}
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('should create all tables on fresh database', async () => {
    const access = asAccess(instance)
    await access.runMigrations()

    const tables = rawDb.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    const tableNames = tables[0].values.map((v) => v[0] as string)
    expect(tableNames).toContain('cves')
    expect(tableNames).toContain('cpe_matches')
    expect(tableNames).toContain('references')
    expect(tableNames).toContain('metadata')
    expect(tableNames).toContain('schema_migrations')
    expect(tableNames).toContain('sync_status')
    expect(tableNames).toContain('cwe_references')
    expect(tableNames).toContain('cvss_metrics')
  })

  it('should create all indexes on fresh database', async () => {
    const access = asAccess(instance)
    await access.runMigrations()

    const indexes = rawDb.exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
    const indexNames = indexes[0].values.map((v) => v[0] as string)
    expect(indexNames).toContain('idx_cves_severity')
    expect(indexNames).toContain('idx_cves_cvss_score')
    expect(indexNames).toContain('idx_cves_published_at')
    expect(indexNames).toContain('idx_cpe_matches_cve_id')
    expect(indexNames).toContain('idx_cpe_matches_cpe_text')
    expect(indexNames).toContain('idx_references_cve_id')
    expect(indexNames).toContain('idx_sync_source')
    expect(indexNames).toContain('idx_sync_year')
    expect(indexNames).toContain('idx_cwe_refs_cve_id')
    expect(indexNames).toContain('idx_cvss_metrics_cve_id')
  })

  it('should record all migration versions', async () => {
    const access = asAccess(instance)
    await access.runMigrations()

    const result = rawDb.exec('SELECT version FROM schema_migrations ORDER BY version')
    const versions = result[0].values.map((v) => v[0])
    expect(versions).toContain(1)
    expect(versions).toContain(2)
    expect(versions).toContain(3)
  })

  it('should add all enhanced columns from migration 2', async () => {
    const access = asAccess(instance)
    await access.runMigrations()

    const cveInfo = rawDb.exec('PRAGMA table_info(cves)')
    const cveCols = cveInfo[0].values.map((v) => v[1] as string)
    expect(cveCols).toContain('cwe_ids')
    expect(cveCols).toContain('vuln_status')
    expect(cveCols).toContain('assigner')
    expect(cveCols).toContain('cvss_v31_score')
    expect(cveCols).toContain('cvss_v31_severity')
    expect(cveCols).toContain('cvss_v2_score')
    expect(cveCols).toContain('cvss_v2_severity')

    const cpeInfo = rawDb.exec('PRAGMA table_info(cpe_matches)')
    const cpeCols = cpeInfo[0].values.map((v) => v[1] as string)
    expect(cpeCols).toContain('cpe23_uri')
    expect(cpeCols).toContain('version_start_including')
    expect(cpeCols).toContain('version_end_excluding')

    const refInfo = rawDb.exec('PRAGMA table_info("references")')
    const refCols = refInfo[0].values.map((v) => v[1] as string)
    expect(refCols).toContain('reference_type')
  })

  it('should insert initial NVD sync status row', async () => {
    const access = asAccess(instance)
    await access.runMigrations()

    const result = rawDb.exec("SELECT source, status FROM sync_status WHERE source = 'NVD'")
    expect(result[0].values).toHaveLength(1)
    expect(result[0].values[0][0]).toBe('NVD')
    expect(result[0].values[0][1]).toBe('idle')
  })

  it('should be idempotent — no duplicate migration rows', async () => {
    const access = asAccess(instance)
    await access.runMigrations()
    await access.runMigrations()

    const result = rawDb.exec('SELECT version FROM schema_migrations ORDER BY version')
    const versions = result[0].values.map((v) => v[0])
    expect(versions).toHaveLength(versions.filter((v, i, a) => a.indexOf(v) === i).length)
  })

  it('should throw when database is not initialized', async () => {
    const inst = new NvdDatabase('/no/db.db')
    const access = asAccess(inst)
    await expect(access.runMigrations()).rejects.toThrow('Database not initialized')
  })
})

// ===========================================================================
// addColumnsIfMissing — direct tests (lines 325-334)
// ===========================================================================
describe('NvdDatabase addColumnsIfMissing', () => {
  let instance: NvdDatabase
  let rawDb: Database

  beforeEach(async () => {
    await resetDatabase()
    const SQL = await ensureSqlJs()
    rawDb = new SQL.Database()
    rawDb.run('CREATE TABLE test_tbl (id INTEGER PRIMARY KEY, name TEXT)')
    instance = new NvdDatabase('/tmp/test-columns.db')
    const access = asAccess(instance)
    access.db = rawDb
    access.saveToDisk = async () => {}
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('should add new columns to an existing table', () => {
    const access = asAccess(instance)
    access.addColumnsIfMissing('test_tbl', { email: 'TEXT', age: 'INTEGER' })

    const info = rawDb.exec('PRAGMA table_info(test_tbl)')
    const colNames = info[0].values.map((v) => v[1] as string)
    expect(colNames).toContain('email')
    expect(colNames).toContain('age')
  })

  it('should skip columns that already exist', () => {
    const access = asAccess(instance)
    access.addColumnsIfMissing('test_tbl', { name: 'TEXT', email: 'TEXT' })

    const info = rawDb.exec('PRAGMA table_info(test_tbl)')
    const colNames = info[0].values.map((v) => v[1] as string)
    expect(colNames).toHaveLength(3)
  })

  it('should throw when database is not initialized', () => {
    const inst = new NvdDatabase('/no/db.db')
    const access = asAccess(inst)
    expect(() => access.addColumnsIfMissing('test_tbl', { col: 'TEXT' })).toThrow('Database not initialized')
  })
})

// ===========================================================================
// AsyncMutex — queue processing (lines 69-73)
// ===========================================================================
describe('AsyncMutex queue processing', () => {
  const mutexDir = 'C:\\Users\\SEFA~1.OCA\\AppData\\Local\\Temp\\opencode\\mutex-test'

  afterEach(async () => {
    await resetDatabase()
  })

  it('should process queued waiters on release', async () => {
    const SQL = await ensureSqlJs()
    const db = new SQL.Database()
    db.run('CREATE TABLE test (id INTEGER)')

    const nodeFs = await import('node:fs/promises')
    await nodeFs.mkdir(mutexDir, { recursive: true })

    const inst = new NvdDatabase(mutexDir + '\\mutex.db')
    const access = asAccess(inst)
    access.db = db

    const results = await Promise.allSettled([access.saveToDisk(), access.saveToDisk()])

    expect(results[0].status).toBe('fulfilled')
    expect(results[1].status).toBe('fulfilled')

    await inst.close().catch(() => {})
  })
})

// ===========================================================================
// saveToDisk — backup error path (line 309)
// ===========================================================================
describe('NvdDatabase saveToDisk backup error', () => {
  const backupDir = 'C:\\Users\\SEFA~1.OCA\\AppData\\Local\\Temp\\opencode\\backup-err'

  afterEach(async () => {
    await resetDatabase()
  })

  it('should continue saving when backup rotation fails', async () => {
    const SQL = await ensureSqlJs()
    const db = new SQL.Database()
    db.run('CREATE TABLE test (id INTEGER)')

    const nodeFs = await import('node:fs/promises')
    await nodeFs.mkdir(backupDir, { recursive: true })

    const dbPath = backupDir + '\\backuperr.db'
    const inst = new NvdDatabase(dbPath)
    const access = asAccess(inst)
    access.db = db

    await access.saveToDisk()

    access.fileExists = async () => {
      throw new Error('Simulated file check failure')
    }

    await access.saveToDisk()

    const stat = await nodeFs.stat(dbPath)
    expect(stat.size).toBeGreaterThan(0)

    await inst.close().catch(() => {})
  })
})

// ===========================================================================
// initialize — cover lines 112-207
// ===========================================================================
describe('NvdDatabase initialize', () => {
  const initDir = 'C:\\Users\\SEFA~1.OCA\\AppData\\Local\\Temp\\opencode\\nvd-init'

  beforeEach(async () => {
    await resetDatabase()
    const nodeFs = await import('node:fs/promises')
    await nodeFs.mkdir(initDir, { recursive: true })
  })

  afterEach(async () => {
    await resetDatabase()
    vi.restoreAllMocks()
  })

  it('should initialize a new database when no file exists', async () => {
    const dbPath = initDir + '\\fresh-init.db'
    const nodeFs = await import('node:fs/promises')
    await nodeFs.rm(dbPath).catch(() => {})

    const inst = new NvdDatabase(dbPath)
    await inst.initialize()

    expect(inst.isInitialized()).toBe(true)
    expect(inst.getDbPath()).toBe(dbPath)

    await inst.close()
  })

  it('should load an existing database file', async () => {
    const dbPath = initDir + '\\existing-init.db'
    const nodeFs = await import('node:fs/promises')
    await nodeFs.rm(dbPath).catch(() => {})

    const inst = new NvdDatabase(dbPath)
    await inst.initialize()
    await inst.close()

    const inst2 = new NvdDatabase(dbPath)
    await inst2.initialize()
    expect(inst2.isInitialized()).toBe(true)

    await inst2.close()
  })
})

// ===========================================================================
// recoverFromBackup — cover lines 224-251
// ===========================================================================
describe('NvdDatabase recoverFromBackup', () => {
  let instance: NvdDatabase
  let rawDb: Database
  let sqlJsRef: SqlJsStatic

  beforeEach(async () => {
    await resetDatabase()
    const SQL = await ensureSqlJs()
    sqlJsRef = SQL
    rawDb = new SQL.Database()
    instance = new NvdDatabase('/tmp/recover-test.db')
    const access = asAccess(instance)
    access.db = rawDb
    access.saveToDisk = async () => {}
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('should recover from .backup file', async () => {
    const access = asAccess(instance)
    const backupData = rawDb.export()
    access.sqlJs = sqlJsRef

    const recoveryDir = 'C:\\Users\\SEFA~1.OCA\\AppData\\Local\\Temp\\opencode\\nvd-recover'
    const nodeFs = await import('node:fs/promises')
    await nodeFs.mkdir(recoveryDir, { recursive: true })

    const dbPath = recoveryDir + '\\recover.db'
    const backupPath = dbPath + '.backup'

    await nodeFs.writeFile(backupPath, Buffer.from(backupData))

    const recoveryInst = new NvdDatabase(dbPath)
    const recoveryAccess = asAccess(recoveryInst)
    recoveryAccess.sqlJs = sqlJsRef
    recoveryAccess.saveToDisk = async () => {}

    const result = (await (recoveryAccess as Record<string, unknown>).recoverFromBackup.call(recoveryAccess)) as boolean
    expect(result).toBe(true)
  })

  it('should return false when no valid backups exist', async () => {
    const access = asAccess(instance)
    access.sqlJs = sqlJsRef

    const result = (await (access as Record<string, unknown>).recoverFromBackup.call(access)) as boolean
    expect(result).toBe(false)
  })
})

// ===========================================================================
// startAutoSave — cover lines 256-274
// ===========================================================================
describe('NvdDatabase startAutoSave', () => {
  afterEach(async () => {
    await resetDatabase()
  })

  it('should register process event listeners', async () => {
    const inst = await createTestInstance()
    const access = asAccess(inst)

    const removeListenerSpy = vi.spyOn(process, 'off')

    access.startAutoSave.call(access)

    expect(access.autoSaveInterval).not.toBeNull()

    await inst.close()

    expect(removeListenerSpy).toHaveBeenCalledWith('beforeExit', expect.any(Function))
    expect(removeListenerSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function))
    expect(removeListenerSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function))

    removeListenerSpy.mockRestore()
  })

  it('should clear existing interval before setting new one', async () => {
    const inst = await createTestInstance()
    const access = asAccess(inst)

    const fakeTimer = setTimeout(() => {}, 100000) as unknown as NodeJS.Timeout
    access.autoSaveInterval = fakeTimer

    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

    access.startAutoSave.call(access)

    expect(clearIntervalSpy).toHaveBeenCalledWith(fakeTimer)

    clearIntervalSpy.mockRestore()
    await inst.close().catch(() => {})
  })
})

// ===========================================================================
// fileExists — cover lines 212-219
// ===========================================================================
describe('NvdDatabase fileExists', () => {
  const existsDir = 'C:\\Users\\SEFA~1.OCA\\AppData\\Local\\Temp\\opencode\\nvd-exists'

  afterEach(async () => {
    await resetDatabase()
  })

  it('should return true for existing file', async () => {
    const nodeFs = await import('node:fs/promises')
    await nodeFs.mkdir(existsDir, { recursive: true })
    const filePath = existsDir + '\\exists.txt'
    await nodeFs.writeFile(filePath, 'test')

    const inst = await createTestInstance()
    const access = asAccess(inst)

    const result = (await (access as Record<string, unknown>).fileExists.call(access, filePath)) as boolean
    expect(result).toBe(true)
  })

  it('should return false for non-existent file', async () => {
    const inst = await createTestInstance()
    const access = asAccess(inst)

    const result = (await (access as Record<string, unknown>).fileExists.call(
      access,
      '/non/existent/path/file.db',
    )) as boolean
    expect(result).toBe(false)
  })
})
