/**
 * Unit tests for NvdDatabase instance methods (nvdDb.ts)
 *
 * Covers upsertCVE, insertCPEMatches, insertReferences, getCVEById,
 * getCVEFullDetails, searchCVEsByText, searchCVEsByCPE, getTotalCVECount,
 * getMetadata, getDbSize, updateMetadata, isInitialized, getRawDb, close,
 * getDatabase, resetDatabase, and parseCPE edge cases.
 *
 * Approach: create an in-memory better-sqlite3 Database, set up the full schema
 * (migrations 1-3), then inject it into a NvdDatabase instance via a
 * test-access interface.  saveToDisk is stubbed to avoid file I/O.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { NvdDatabase, getDatabase, resetDatabase } from './nvdDb.js'
import type { CVE, CPEMatch, Reference } from './types.js'
import { config } from '../config.js'
import * as nodeOs from 'node:os'
import * as nodePath from 'node:path'

// ---------------------------------------------------------------------------
// Test-only interface to reach into private members without `any`
// ---------------------------------------------------------------------------
interface NvdDatabaseTestAccess {
  db: InstanceType<typeof Database> | null
  autoSaveInterval: NodeJS.Timeout | null
  saveToDisk: () => Promise<void>
  runMigrations: () => Promise<void>
  addColumnsIfMissing: (table: string, columns: Record<string, string>) => void
  fileExists: (filePath: string) => Promise<boolean>
}

function asAccess(instance: NvdDatabase): NvdDatabaseTestAccess {
  return instance as unknown as NvdDatabaseTestAccess
}

function createSchemaDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:')

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  db.exec(`
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

  db.exec(`
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS "references" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cve_id TEXT NOT NULL,
      url TEXT NOT NULL,
      source TEXT,
      tags TEXT,
      FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  db.exec('CREATE INDEX IF NOT EXISTS idx_cves_severity ON cves(severity)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_cves_cvss_score ON cves(cvss_score)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_cves_published_at ON cves(published_at)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cve_id ON cpe_matches(cve_id)')

  // Migration 2 — enhanced columns and new tables
  db.exec(`CREATE TABLE IF NOT EXISTS sync_status (
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
  db.exec('ALTER TABLE cves ADD COLUMN cwe_ids TEXT')
  db.exec('ALTER TABLE cves ADD COLUMN vuln_status TEXT')
  db.exec('ALTER TABLE cves ADD COLUMN assigner TEXT')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_v31_score REAL')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_v31_vector TEXT')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_v31_severity TEXT')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_v30_score REAL')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_v30_vector TEXT')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_v30_severity TEXT')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_v2_score REAL')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_v2_vector TEXT')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_v2_severity TEXT')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_score_legacy REAL')
  db.exec('ALTER TABLE cves ADD COLUMN cvss_vector_legacy TEXT')

  // Enhanced CPE columns - version range already in CREATE TABLE

  // Enhanced references columns
  db.exec('ALTER TABLE "references" ADD COLUMN reference_type TEXT')

  // cwe_references table
  db.exec(`CREATE TABLE IF NOT EXISTS cwe_references (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cve_id TEXT NOT NULL,
    cwe_id TEXT NOT NULL,
    description TEXT,
    FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
  )`)

  db.exec('CREATE INDEX IF NOT EXISTS idx_cwe_refs_cve_id ON cwe_references(cve_id)')

  // Migration 3 — cvss_metrics table
  db.exec(`CREATE TABLE IF NOT EXISTS cvss_metrics (
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

  db.exec('CREATE INDEX IF NOT EXISTS idx_cvss_metrics_cve_id ON cvss_metrics(cve_id)')

  // schema_migrations — mark all v1+v2 migrations as already applied
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`)
  for (let v = 1; v <= 12; v++) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(v, new Date().toISOString())
  }

  return db
}

async function createTestInstance(): Promise<NvdDatabase> {
  const instance = new NvdDatabase('/tmp/vulnassess-test/nvd-data.db')
  const rawDb = createSchemaDb()

  const access = asAccess(instance)
  access.db = rawDb
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
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as InstanceType<typeof Database>
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

    it('should fall back to config.DB_PATH when no dbPath is provided', () => {
      // WHY: production code (getDatabase()) can construct NvdDatabase with zero args;
      // it must resolve to the app's configured default location, not an empty path.
      const inst = new NvdDatabase()
      expect(inst.getDbPath()).toBe(config.DB_PATH)
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

      const rows = rawDb.prepare('SELECT id, description, severity FROM cves WHERE id = ?').all(cve.id) as Record<
        string,
        unknown
      >[]
      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe(cve.id)
      expect(rows[0].description).toBe(cve.description)
      expect(rows[0].severity).toBe('HIGH')
    })

    it('should update an existing CVE on conflict', async () => {
      const cve = makeCVE()
      await instance.upsertCVE(cve)

      // Upsert with updated description
      const updated = makeCVE({ description: 'Updated description', severity: 'CRITICAL' })
      await instance.upsertCVE(updated)

      const rows = rawDb.prepare('SELECT description, severity FROM cves WHERE id = ?').all(cve.id) as Record<
        string,
        unknown
      >[]
      expect(rows[0].description).toBe('Updated description')
      expect(rows[0].severity).toBe('CRITICAL')
    })

    it('should store null for missing optional cvss fields', async () => {
      const cve = makeCVE({ cvss_score: undefined, cvss_vector: undefined, severity: undefined })
      await instance.upsertCVE(cve)

      // Workaround: upsertCVE converts undefined to null via `|| null`
      const rows = rawDb
        .prepare('SELECT cvss_score, cvss_vector, severity FROM cves WHERE id = ?')
        .all(cve.id) as Record<string, unknown>[]
      expect(rows[0].cvss_score).toBeNull()
      expect(rows[0].cvss_vector).toBeNull()
    })

    it('should store a real CVSS score of 0.0 as 0, not null', async () => {
      // WHY: a legitimate CVSS baseScore of 0.0 is falsy; the old `cvss_score || null`
      // stored it as NULL, erasing a real "no impact" score. `?? null` preserves 0.0.
      const cve = makeCVE({ cvss_score: 0, severity: 'NONE' })
      await instance.upsertCVE(cve)

      const rows = rawDb.prepare('SELECT cvss_score, severity FROM cves WHERE id = ?').all(cve.id) as Record<
        string,
        unknown
      >[]
      expect(rows[0].cvss_score).toBe(0)
      expect(rows[0].severity).toBe('NONE')
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

      const rows = rawDb
        .prepare('SELECT cpe23_uri, vulnerable FROM cpe_matches WHERE cve_id = ?')
        .all('CVE-2024-0001') as Record<string, unknown>[]
      expect(rows).toHaveLength(2)
    })

    it('should replace existing CPE matches on re-insert', async () => {
      await instance.upsertCVE(makeCVE())

      await instance.insertCPEMatches('CVE-2024-0001', [makeCPEMatch({ cpe_text: 'cpe:2.3:a:vendor:product:1.0' })])
      await instance.insertCPEMatches('CVE-2024-0001', [makeCPEMatch({ cpe_text: 'cpe:2.3:a:vendor:product:3.0' })])

      const rows = rawDb.prepare('SELECT cpe23_uri FROM cpe_matches WHERE cve_id = ?').all('CVE-2024-0001') as Record<
        string,
        unknown
      >[]
      expect(rows).toHaveLength(1)
      expect(rows[0].cpe23_uri).toBe('cpe:2.3:a:vendor:product:3.0')
    })

    it('should store vulnerable=1 for true and 0 for false', async () => {
      await instance.upsertCVE(makeCVE())
      await instance.insertCPEMatches('CVE-2024-0001', [
        makeCPEMatch({ cpe_text: 'cpe:a:v:p:1', vulnerable: true }),
        makeCPEMatch({ cpe_text: 'cpe:a:v:p:2', vulnerable: false }),
      ])

      const rows = rawDb
        .prepare('SELECT vulnerable FROM cpe_matches WHERE cve_id = ? ORDER BY cpe23_uri')
        .all('CVE-2024-0001') as Record<string, unknown>[]
      expect(rows[0].vulnerable).toBe(1)
      expect(rows[1].vulnerable).toBe(0)
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

      const rows = rawDb
        .prepare('SELECT url, source, tags FROM "references" WHERE cve_id = ?')
        .all('CVE-2024-0001') as Record<string, unknown>[]
      expect(rows).toHaveLength(2)
      expect(rows[0].url).toBe('https://example.com/advisory')
      expect(rows[1].source).toBe('Vendor')
      expect(rows[1].tags).toBe('Patch,Third Party Advisory')
    })

    it('should replace existing references on re-insert', async () => {
      await instance.upsertCVE(makeCVE())

      await instance.insertReferences('CVE-2024-0001', [makeReference({ url: 'https://old-url.com' })])
      await instance.insertReferences('CVE-2024-0001', [makeReference({ url: 'https://new-url.com' })])

      const rows = rawDb.prepare('SELECT url FROM "references" WHERE cve_id = ?').all('CVE-2024-0001') as Record<
        string,
        unknown
      >[]
      expect(rows).toHaveLength(1)
      expect(rows[0].url).toBe('https://new-url.com')
    })

    it('should store null when source and tags are omitted', async () => {
      await instance.upsertCVE(makeCVE())
      await instance.insertReferences('CVE-2024-0001', [makeReference({ url: 'https://example.com' })])

      const rows = rawDb
        .prepare('SELECT source, tags FROM "references" WHERE cve_id = ?')
        .all('CVE-2024-0001') as Record<string, unknown>[]
      expect(rows[0].source).toBeNull()
      expect(rows[0].tags).toBeNull()
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

    it('should include every reference when a CVE has more than one', async () => {
      // WHY: getCVEsByIds only initializes the per-CVE references array the FIRST time it
      // sees that cve_id; a regression back to re-creating it on every row would silently
      // drop all but the last reference for any CVE with 2+ of them.
      await instance.upsertCVE(makeCVE())
      await instance.insertReferences('CVE-2024-0001', [
        makeReference({ url: 'https://example.com/ref1' }),
        makeReference({ url: 'https://example.com/ref2' }),
      ])

      const result = instance.getCVEById('CVE-2024-0001')
      expect(result?.references?.map((r) => r.url)).toEqual(['https://example.com/ref1', 'https://example.com/ref2'])
    })

    it('should throw when database is not initialized', () => {
      const inst = new NvdDatabase('/no/db.db')
      expect(() => inst.getCVEById('CVE-2024-0001')).toThrow('Database not initialized')
    })

    it('should surface missing optional fields as undefined, not null (score, severity, reference source/tags)', () => {
      // WHY: getCVEsByIds hydrates raw SQL NULLs via `?? undefined`; a regression back to
      // passing the raw `null` through would leak a SQLite NULL into the CVEWithDetails
      // shape that every caller (UI, exporters) expects to be a clean optional field.
      rawDb
        .prepare('INSERT INTO cves (id, description, published_at, modified_at, source) VALUES (?,?,?,?,?)')
        .run('CVE-2024-BLANKFIELDS', 'no optional fields yet', '2024-01-01', '2024-01-01', 'NVD')
      rawDb
        .prepare('INSERT INTO "references" (cve_id, url) VALUES (?,?)')
        .run('CVE-2024-BLANKFIELDS', 'https://example.com/bare')

      const result = instance.getCVEById('CVE-2024-BLANKFIELDS')

      expect(result?.cvss_score).toBeUndefined()
      expect(result?.severity).toBeUndefined()
      expect(result?.references?.[0]?.source).toBeUndefined()
      expect(result?.references?.[0]?.tags).toBeUndefined()
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
      rawDb
        .prepare(
          `INSERT INTO cves (id, description, cvss_score, cvss_vector, severity,
          published_at, modified_at, source, vuln_status, assigner,
          cvss_v31_score, cvss_v31_vector, cvss_v31_severity,
          cvss_v30_score, cvss_v30_vector, cvss_v30_severity,
          cvss_v2_score, cvss_v2_vector, cvss_v2_severity)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
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
        )

      rawDb
        .prepare(
          `INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable,
          version_start_including, version_end_excluding)
         VALUES (?,?,?,?,?)`,
        )
        .run('CVE-2024-1234', 'cpe:2.3:a:vendor:product:*', 1, '1.0', '2.0')

      rawDb
        .prepare('INSERT INTO cwe_references (cve_id, cwe_id, description) VALUES (?,?,?)')
        .run('CVE-2024-1234', 'CWE-79', 'XSS vulnerability')

      rawDb
        .prepare(`INSERT INTO "references" (cve_id, url, source, tags, reference_type) VALUES (?,?,?,?,?)`)
        .run('CVE-2024-1234', 'https://example.com/advisory', 'NVD', 'Patch,Vendor Advisory', 'Advisory')

      rawDb
        .prepare(
          `INSERT INTO cvss_metrics (cve_id, source, type, version, score, severity, vector, exploitability_score, impact_score)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run('CVE-2024-1234', 'nvd@nist.gov', 'Primary', '3.1', 9.8, 'CRITICAL', 'CVSS:3.1/AV:N', 3.9, 5.9)
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
      const result = instance.getCVEFullDetails('CVE-9999-0000')
      expect(result).toBeNull()
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
      rawDb
        .prepare(
          `INSERT INTO cves (id, description, severity, published_at, modified_at, source,
          cvss_v30_score, cvss_v30_vector, cvss_v30_severity)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .run('CVE-2024-V30', 'v3.0 only', 'LOW', '2024-01-01', '2024-01-01', 'NVD', 5.0, 'CVSS:3.0', 'MEDIUM')

      const result = instance.getCVEFullDetails('CVE-2024-V30')
      expect(result?.severity).toBe('MEDIUM') // v3.0 wins over base severity
    })

    it('should normalize NONE severity to LOW', () => {
      rawDb
        .prepare(
          `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
         VALUES (?,?,?,?,?,?)`,
        )
        .run('CVE-2024-NONE', 'no severity', 'NONE', '2024-01-01', '2024-01-01', 'NVD')

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
      rawDb
        .prepare(
          `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
         VALUES (?,?,?,?,?,?)`,
        )
        .run('CVE-2024-NOMETRICS', 'no metrics', 'LOW', '2024-01-01', '2024-01-01', 'NVD')

      const result = instance.getCVEFullDetails('CVE-2024-NOMETRICS')
      expect(result?.cvssMetrics).toBeUndefined()
    })

    it('should handle CVE with no references gracefully', () => {
      rawDb
        .prepare(
          `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
         VALUES (?,?,?,?,?,?)`,
        )
        .run('CVE-2024-NOREFS', 'no refs', 'LOW', '2024-01-01', '2024-01-01', 'NVD')

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

      const rows = rawDb.prepare("SELECT value FROM metadata WHERE key = 'test_key'").all() as Record<string, unknown>[]
      expect(rows[0].value).toBe('test_value')
    })

    it('should update an existing metadata key', async () => {
      await instance.updateMetadata('test_key', 'v1')
      await instance.updateMetadata('test_key', 'v2')

      const rows = rawDb.prepare("SELECT value FROM metadata WHERE key = 'test_key'").all() as Record<string, unknown>[]
      expect(rows[0].value).toBe('v2')
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

    it('should leave every field null for a CPE 2.3 string with fewer than 4 parts', () => {
      // 'cpe:2.3:a' splits into only 3 parts — too few to safely index vendor/product/version.
      const result = NvdDatabase.parseCPE('cpe:2.3:a')
      expect(result.part).toBeNull()
      expect(result.vendor).toBeNull()
      expect(result.product).toBeNull()
      expect(result.version).toBeNull()
    })

    it('should handle CPE 2.3 with an empty part segment', () => {
      const result = NvdDatabase.parseCPE('cpe:2.3::vendor:product:1.0:*:*:*:*:*:*:*')
      expect(result.part).toBeNull() // empty string || null => null
      expect(result.vendor).toBe('vendor')
      expect(result.product).toBe('product')
    })

    it('should fall back to null for an empty segment at any position in CPE 2.2', () => {
      // Mirrors the CPE 2.3 empty-segment fallbacks above, one position at a time.
      expect(NvdDatabase.parseCPE('cpe:/').part).toBeNull()
      expect(NvdDatabase.parseCPE('cpe:/a:').vendor).toBeNull()
      expect(NvdDatabase.parseCPE('cpe:/a:vendor:').product).toBeNull()
      expect(NvdDatabase.parseCPE('cpe:/a:vendor:product:').version).toBeNull()
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
// ===========================================================================
// addColumnsIfMissing — exercised via runMigrations
// ===========================================================================
describe('NvdDatabase addColumnsIfMissing (via schema)', () => {
  let instance: NvdDatabase
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as InstanceType<typeof Database>
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('should have cwe_ids column after migration 2', async () => {
    const info = rawDb.pragma('table_info(cves)')
    const colNames = (info as Record<string, unknown>[]).map((v) => v.name as string)
    expect(colNames).toContain('cwe_ids')
  })

  it('should have cpe23_uri column after migration 2', async () => {
    const info = rawDb.pragma('table_info(cpe_matches)')
    const colNames = (info as Record<string, unknown>[]).map((v) => v.name as string)
    expect(colNames).toContain('cpe23_uri')
  })

  it('should have reference_type column after migration 2', async () => {
    const info = rawDb.pragma('table_info("references")')
    const colNames = (info as Record<string, unknown>[]).map((v) => v.name as string)
    expect(colNames).toContain('reference_type')
  })

  it('should have cvss_metrics table after migration 3', () => {
    const info = rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cvss_metrics'")
      .all() as Record<string, unknown>[]
    expect(info.length).toBeGreaterThan(0)
  })

  it('should have cwe_references table after migration 2', () => {
    const info = rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cwe_references'")
      .all() as Record<string, unknown>[]
    expect(info.length).toBeGreaterThan(0)
  })

  it('should have sync_status table after migration 2', () => {
    const info = rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_status'")
      .all() as Record<string, unknown>[]
    expect(info.length).toBeGreaterThan(0)
  })
})

// ===========================================================================
// getCVEFullDetails — uncovered branches
// ===========================================================================
describe('NvdDatabase getCVEFullDetails uncovered branches', () => {
  let instance: NvdDatabase
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as InstanceType<typeof Database>
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('should fall back to v2 severity when v3.1 and v3.0 are absent', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source,
        cvss_v2_score, cvss_v2_vector, cvss_v2_severity)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      )
      .run('CVE-2024-V2', 'v2 only', 'LOW', '2024-01-01', '2024-01-01', 'NVD', 4.0, 'CVSS:2.0', 'MEDIUM')

    const result = instance.getCVEFullDetails('CVE-2024-V2')
    expect(result?.severity).toBe('MEDIUM')
  })

  it('should handle empty severity (normalize to LOW)', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, published_at, modified_at, source)
       VALUES (?,?,?,?,?)`,
      )
      .run('CVE-2024-EMPTY', 'empty severity', '2024-01-01', '2024-01-01', 'NVD')

    const result = instance.getCVEFullDetails('CVE-2024-EMPTY')
    expect(result?.severity).toBe('LOW')
  })

  it('should handle reference without tags', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      )
      .run('CVE-2024-NOTAGS', 'no tags', 'LOW', '2024-01-01', '2024-01-01', 'NVD')
    rawDb
      .prepare(`INSERT INTO "references" (cve_id, url, source) VALUES (?,?,?)`)
      .run('CVE-2024-NOTAGS', 'https://example.com', 'NVD')

    const result = instance.getCVEFullDetails('CVE-2024-NOTAGS')
    expect(result?.references).toHaveLength(1)
    expect(result?.references[0]?.tags).toBeUndefined()
  })

  it('should handle reference with reference_type only (no tags)', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      )
      .run('CVE-2024-REFTYPE', 'ref type only', 'LOW', '2024-01-01', '2024-01-01', 'NVD')
    rawDb
      .prepare(`INSERT INTO "references" (cve_id, url, reference_type) VALUES (?,?,?)`)
      .run('CVE-2024-REFTYPE', 'https://example.com', 'Vendor Advisory')

    const result = instance.getCVEFullDetails('CVE-2024-REFTYPE')
    expect(result?.referenceTags).toContain('vendor advisory')
    expect(result?.references[0]?.referenceType).toBe('Vendor Advisory')
  })

  it('should handle CVE with no CPE matches, CWE refs, or CVSS metrics', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      )
      .run('CVE-2024-BARE', 'bare bones', 'LOW', '2024-01-01', '2024-01-01', 'NVD')

    const result = instance.getCVEFullDetails('CVE-2024-BARE')
    expect(result?.cpeMatches).toEqual([])
    expect(result?.cweReferences).toEqual([])
    expect(result?.references).toEqual([])
    expect(result?.referenceTags).toEqual([])
    expect(result?.cvssMetrics).toBeUndefined()
  })

  it('should handle CWE reference without description', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      )
      .run('CVE-2024-CWENODESC', 'cwe no desc', 'LOW', '2024-01-01', '2024-01-01', 'NVD')
    rawDb.prepare('INSERT INTO cwe_references (cve_id, cwe_id) VALUES (?,?)').run('CVE-2024-CWENODESC', 'CWE-89')

    const result = instance.getCVEFullDetails('CVE-2024-CWENODESC')
    expect(result?.cweReferences).toHaveLength(1)
    expect(result?.cweReferences[0]?.cweId).toBe('CWE-89')
    expect(result?.cweReferences[0]?.description).toBeUndefined()
  })

  it('should handle source field defaulting to NVD', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      )
      .run('CVE-2024-SOURCE', 'test source', 'LOW', '2024-01-01', '2024-01-01', 'NVD')

    const result = instance.getCVEFullDetails('CVE-2024-SOURCE')
    expect(result?.source).toBe('NVD')
  })

  it('should handle multiple CVSS metrics', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      )
      .run('CVE-2024-MULTIMETRICS', 'multi metrics', 'LOW', '2024-01-01', '2024-01-01', 'NVD')
    rawDb
      .prepare(
        `INSERT INTO cvss_metrics (cve_id, source, type, version, score, severity, vector) VALUES (?,?,?,?,?,?,?)`,
      )
      .run('CVE-2024-MULTIMETRICS', 'nvd@nist.gov', 'Primary', '3.1', 9.8, 'CRITICAL', 'CVSS:3.1/AV:N')
    rawDb
      .prepare(
        `INSERT INTO cvss_metrics (cve_id, source, type, version, score, severity, vector) VALUES (?,?,?,?,?,?,?)`,
      )
      .run('CVE-2024-MULTIMETRICS', 'cna@org', 'Secondary', '3.0', 8.5, 'HIGH', 'CVSS:3.0/AV:N')

    const result = instance.getCVEFullDetails('CVE-2024-MULTIMETRICS')
    expect(result?.cvssMetrics).toHaveLength(2)
  })

  it('should handle CPE match with no version range fields', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, severity, published_at, modified_at, source)
       VALUES (?,?,?,?,?,?)`,
      )
      .run('CVE-2024-CPENOVR', 'cpe no version range', 'LOW', '2024-01-01', '2024-01-01', 'NVD')
    rawDb
      .prepare(`INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable) VALUES (?,?,?)`)
      .run('CVE-2024-CPENOVR', 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*', 1)

    const result = instance.getCVEFullDetails('CVE-2024-CPENOVR')
    expect(result?.cpeMatches).toHaveLength(1)
    expect(result?.cpeMatches[0]?.versionStartIncluding).toBeUndefined()
    expect(result?.cpeMatches[0]?.versionEndExcluding).toBeUndefined()
  })
})

// ===========================================================================
// runMigrations — full migration coverage (lines 339-527)
// ===========================================================================
describe('NvdDatabase runMigrations', () => {
  let instance: NvdDatabase
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    rawDb = new Database(':memory:')
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

    const tables = rawDb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Record<
      string,
      unknown
    >[]
    const tableNames = tables.map((v) => v.name as string)
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

    const indexes = rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as Record<string, unknown>[]
    const indexNames = indexes.map((v) => v.name as string)
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

    const result = rawDb.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Record<
      string,
      unknown
    >[]
    const versions = result.map((v) => v.version)
    expect(versions).toContain(1)
    expect(versions).toContain(2)
    expect(versions).toContain(3)
  })

  it('should add all enhanced columns from migration 2', async () => {
    const access = asAccess(instance)
    await access.runMigrations()

    const cveInfo = rawDb.pragma('table_info(cves)') as Record<string, unknown>[]
    const cveCols = cveInfo.map((v) => v.name as string)
    expect(cveCols).toContain('cwe_ids')
    expect(cveCols).toContain('vuln_status')
    expect(cveCols).toContain('assigner')
    expect(cveCols).toContain('cvss_v31_score')
    expect(cveCols).toContain('cvss_v31_severity')
    expect(cveCols).toContain('cvss_v2_score')
    expect(cveCols).toContain('cvss_v2_severity')

    const cpeInfo = rawDb.pragma('table_info(cpe_matches)') as Record<string, unknown>[]
    const cpeCols = cpeInfo.map((v) => v.name as string)
    expect(cpeCols).toContain('cpe23_uri')
    expect(cpeCols).toContain('version_start_including')
    expect(cpeCols).toContain('version_end_excluding')

    const refInfo = rawDb.pragma('table_info("references")') as Record<string, unknown>[]
    const refCols = refInfo.map((v) => v.name as string)
    expect(refCols).toContain('reference_type')
  })

  it('should insert initial NVD sync status row', async () => {
    const access = asAccess(instance)
    await access.runMigrations()

    const result = rawDb.prepare("SELECT source, status FROM sync_status WHERE source = 'NVD'").all() as Record<
      string,
      unknown
    >[]
    expect(result).toHaveLength(1)
    expect(result[0].source).toBe('NVD')
    expect(result[0].status).toBe('idle')
  })

  it('should be idempotent — no duplicate migration rows', async () => {
    const access = asAccess(instance)
    await access.runMigrations()
    await access.runMigrations()

    const result = rawDb.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Record<
      string,
      unknown
    >[]
    const versions = result.map((v) => v.version)
    expect(versions).toHaveLength(versions.filter((v, i, a) => a.indexOf(v) === i).length)
  })

  it('indexes cpe23_uri instead of cpe_text when a pre-existing cpe_matches table already uses the new column', async () => {
    // Simulates a partially-migrated table: cpe_matches already has cpe23_uri (not the
    // original v1 cpe_text) even though schema_migrations is still at version 0, so the
    // `CREATE TABLE IF NOT EXISTS` in migration 1 is a no-op. The index-picking logic must
    // inspect the table's actual columns rather than assume the v1 (cpe_text) shape.
    rawDb.exec(`CREATE TABLE cpe_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cve_id TEXT NOT NULL,
      cpe23_uri TEXT NOT NULL,
      vulnerable INTEGER NOT NULL DEFAULT 0
    )`)

    const access = asAccess(instance)
    await access.runMigrations()

    const indexes = rawDb
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cpe_matches_%'")
      .all() as Record<string, unknown>[]
    const indexNames = indexes.map((v) => v.name as string)
    expect(indexNames).toContain('idx_cpe_matches_cpe23_uri')
    expect(indexNames).not.toContain('idx_cpe_matches_cpe_text')
  })

  it('does not duplicate the seed NVD sync_status row when one already exists at migration time', async () => {
    // Puts the schema at "version 1 applied" (base tables exist) so migration 2 — which
    // seeds the NVD sync_status row — is the one that runs, against a sync_status table
    // that (as if from a prior partial run) already has that row.
    rawDb.exec(`CREATE TABLE cves (id TEXT PRIMARY KEY, description TEXT NOT NULL, cvss_score REAL,
      cvss_vector TEXT, severity TEXT, published_at TEXT NOT NULL, modified_at TEXT NOT NULL, source TEXT NOT NULL)`)
    rawDb.exec(`CREATE TABLE cpe_matches (id INTEGER PRIMARY KEY AUTOINCREMENT, cve_id TEXT NOT NULL,
      cpe_text TEXT NOT NULL, vulnerable INTEGER NOT NULL DEFAULT 0)`)
    rawDb.exec(
      `CREATE TABLE "references" (id INTEGER PRIMARY KEY AUTOINCREMENT, cve_id TEXT NOT NULL, url TEXT NOT NULL, source TEXT, tags TEXT)`,
    )
    rawDb.exec('CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    rawDb.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    rawDb.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(new Date().toISOString())

    rawDb.exec(`CREATE TABLE sync_status (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL UNIQUE,
      year INTEGER, last_sync_at TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'idle',
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    rawDb.exec(`INSERT INTO sync_status (source, last_sync_at, status) VALUES ('NVD', '', 'idle')`)

    const access = asAccess(instance)
    await access.runMigrations()

    const rows = rawDb.prepare("SELECT id FROM sync_status WHERE source = 'NVD'").all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
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
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    rawDb = new Database(':memory:')
    rawDb.exec('CREATE TABLE test_tbl (id INTEGER PRIMARY KEY, name TEXT)')
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

    const info = rawDb.pragma('table_info(test_tbl)') as Record<string, unknown>[]
    const colNames = info.map((v) => v.name as string)
    expect(colNames).toContain('email')
    expect(colNames).toContain('age')
  })

  it('should skip columns that already exist', () => {
    const access = asAccess(instance)
    access.addColumnsIfMissing('test_tbl', { name: 'TEXT', email: 'TEXT' })

    const info = rawDb.pragma('table_info(test_tbl)') as Record<string, unknown>[]
    const colNames = info.map((v) => v.name as string)
    expect(colNames).toHaveLength(3)
  })

  it('should throw when database is not initialized', () => {
    const inst = new NvdDatabase('/no/db.db')
    const access = asAccess(inst)
    expect(() => access.addColumnsIfMissing('test_tbl', { col: 'TEXT' })).toThrow('Database not initialized')
  })
})

// ===========================================================================
// initialize — cover lines 112-207
// ===========================================================================
describe('NvdDatabase initialize', () => {
  const initDir = nodePath.join(nodeOs.tmpdir(), 'vulnassess-nvddb-init')

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
    const dbPath = nodePath.join(initDir, 'fresh-init.db')
    const nodeFs = await import('node:fs/promises')
    await nodeFs.rm(dbPath).catch(() => {})

    const inst = new NvdDatabase(dbPath)
    await inst.initialize()

    expect(inst.isInitialized()).toBe(true)
    expect(inst.getDbPath()).toBe(dbPath)

    await inst.close()
  })

  it('should load an existing database file', async () => {
    const dbPath = nodePath.join(initDir, 'existing-init.db')
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
// fileExists — cover lines 212-219
// ===========================================================================
describe('NvdDatabase fileExists', () => {
  const existsDir = nodePath.join(nodeOs.tmpdir(), 'vulnassess-nvddb-exists')

  afterEach(async () => {
    await resetDatabase()
  })

  it('should return true for existing file', async () => {
    const nodeFs = await import('node:fs/promises')
    await nodeFs.mkdir(existsDir, { recursive: true })
    const filePath = nodePath.join(existsDir, 'exists.txt')
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

// ===========================================================================
// Bug-hunt fixes 2026-08-02 — behavioral guards for the nvdDb.ts cluster
// ===========================================================================
describe('NvdDatabase bug-hunt fixes (2026-08-02)', () => {
  let instance: NvdDatabase

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('M2: searchCVEsByText treats % as a literal, not a wildcard', async () => {
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-1000', description: 'contains a 50% discount bug' }))
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-1001', description: 'a wholly unrelated entry' }))

    // Before the escape fix, '50%' -> LIKE '%50%%' matched EVERY row; now it must
    // match only the row whose text literally contains "50%".
    const results = instance.searchCVEsByText('50%')
    expect(results.map((c) => c.id)).toEqual(['CVE-2024-1000'])
  })

  it('H12: insertCPEMatches persists version-range bounds so they round-trip', async () => {
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-2000' }))
    await instance.insertCPEMatches('CVE-2024-2000', [
      makeCPEMatch({
        cve_id: 'CVE-2024-2000',
        cpe_text: 'cpe:2.3:a:vendor:product:*:*:*:*:*:*:*:*',
        version_start_including: '1.0.0',
        version_end_excluding: '2.0.0',
      }),
    ])

    const match = instance.getCVEFullDetails('CVE-2024-2000')?.cpeMatches[0]
    expect(match?.versionStartIncluding).toBe('1.0.0')
    expect(match?.versionEndExcluding).toBe('2.0.0')
  })

  it('H11: upsertCVE routes the score into the version its vector prefix names', async () => {
    await instance.upsertCVE(
      makeCVE({ id: 'CVE-2024-3000', cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', cvss_score: 9.8 }),
    )

    const raw = asAccess(instance).db as InstanceType<typeof Database>
    const row = raw.prepare('SELECT cvss_v31_score, cvss_v2_score FROM cves WHERE id = ?').get('CVE-2024-3000') as {
      cvss_v31_score: number | null
      cvss_v2_score: number | null
    }
    expect(row.cvss_v31_score).toBe(9.8)
    expect(row.cvss_v2_score).toBeNull()
  })

  it('M1: upsertCVE updates the source column on a re-sync conflict', async () => {
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-4000', source: 'OSV' }))
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-4000', source: 'NVD' }))

    const raw = asAccess(instance).db as InstanceType<typeof Database>
    const row = raw.prepare('SELECT source FROM cves WHERE id = ?').get('CVE-2024-4000') as { source: string }
    expect(row.source).toBe('NVD')
  })
})

// ===========================================================================
// searchCVEsByText with FTS5 enabled (NFR-02.3 / NFR-02.5)
//
// The default test harness omits the cves_fts virtual table, so the existing
// searchCVEsByText tests above exercise the LIKE fallback tier. These tests run
// the FTS migration first, proving searchCVEsByText routes free-text through the
// index-backed FTS path while preserving exact CVE-ID lookup.
// ===========================================================================
describe('searchCVEsByText with FTS5', () => {
  let instance: NvdDatabase

  // Build the FTS index the way production migration_7_fts5_search does (external
  // content + insert trigger), NOT via the dead/buggy runFTSMigration helper.
  function enableFts(db: InstanceType<typeof Database>): void {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS cves_fts USING fts5(
        id, description, content='cves', content_rowid='rowid', tokenize='porter unicode61'
      )
    `)
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS cves_fts_insert AFTER INSERT ON cves BEGIN
        INSERT INTO cves_fts(rowid, id, description) VALUES (new.rowid, new.id, new.description);
      END
    `)
    db.exec(`INSERT INTO cves_fts(rowid, id, description) SELECT rowid, id, description FROM cves`)
  }

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    await instance.upsertCVE(
      makeCVE({ id: 'CVE-2024-0001', description: 'Apache log4j remote code execution', cvss_score: 10.0 }),
    )
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-0002', description: 'OpenSSL buffer overflow', cvss_score: 7.5 }))
    await instance.upsertCVE(
      makeCVE({ id: 'CVE-2024-0003', description: 'nginx buffer information disclosure', cvss_score: 5.0 }),
    )
    // Build the FTS index over the seeded rows.
    enableFts(asAccess(instance).db as InstanceType<typeof Database>)
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('finds CVEs by description token via the FTS path', () => {
    const results = instance.searchCVEsByText('log4j')
    expect(results.map((r) => r.id)).toEqual(['CVE-2024-0001'])
  })

  it('matches multiple CVEs sharing a token', () => {
    const results = instance.searchCVEsByText('buffer')
    expect(results.map((r) => r.id).sort()).toEqual(['CVE-2024-0002', 'CVE-2024-0003'])
  })

  it('preserves exact CVE-ID lookup when FTS is present', () => {
    const results = instance.searchCVEsByText('CVE-2024-0002')
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('CVE-2024-0002')
  })

  it('does not throw on a query full of FTS syntax characters', () => {
    // A raw MATCH of this string throws fts5: syntax error; the sanitizer prevents it.
    expect(() => instance.searchCVEsByText('log4j:"()')).not.toThrow()
    expect(instance.searchCVEsByText('log4j:"()').map((r) => r.id)).toEqual(['CVE-2024-0001'])
  })

  it('returns empty for a punctuation-only query rather than erroring', () => {
    expect(instance.searchCVEsByText('---')).toEqual([])
  })

  it('routes free text through the FTS index instead of a full scan of cves (NFR-02.5)', () => {
    // WHY this has to assert the QUERY PLAN and not the results: searchCVEsByText has three
    // tiers, and tier 2 (FTS MATCH) and tier 3 (LIKE %term% over cves) return the SAME rows
    // for these fixtures. Every other test in this describe therefore passes whether or not
    // the FTS index is used, so a silent fall-through to the LIKE tier — a dropped cves_fts
    // table, a migration that stops creating it, an FTS syntax error swallowed by the catch in
    // nvdDb.ts:886 — is completely invisible to them. That fall-through is the exact regression
    // NFR-02.5 exists to prevent: the LIKE tier is a full table scan whose cost grows with row
    // count, while an FTS lookup stays flat, which is what makes a 10GB database usable at all.
    const rawDb = asAccess(instance).db as InstanceType<typeof Database>
    const calls: Array<{ sql: string; args: unknown[] }> = []
    // The spy must forward get/run too, not just all: searchCVEsByText calls isFTSAvailable,
    // which probes sqlite_master with .get(), and a spy that only exposes .all() makes the
    // production code throw instead of exercising the path under test.
    type Stmt = {
      all: (...p: unknown[]) => unknown[]
      get: (...p: unknown[]) => unknown
      run: (...p: unknown[]) => unknown
    }
    const capturable = rawDb as unknown as { prepare: (sql: string) => Stmt }
    const originalPrepare = capturable.prepare.bind(capturable)
    vi.spyOn(capturable, 'prepare').mockImplementation((sql: string) => {
      const stmt = originalPrepare(sql)
      return {
        all: (...args: unknown[]) => {
          calls.push({ sql, args })
          return stmt.all(...args)
        },
        get: (...args: unknown[]) => stmt.get(...args),
        run: (...args: unknown[]) => stmt.run(...args),
      }
    })

    instance.searchCVEsByText('log4j')
    vi.restoreAllMocks()

    // Plan the statement the code actually issued, rather than a hand-copied copy of it, so the
    // assertion cannot drift away from production SQL.
    const ftsCall = calls.find((c) => c.sql.includes('cves_fts') && c.sql.includes('MATCH'))
    expect(ftsCall, 'searchCVEsByText issued no FTS MATCH query — it fell through to the LIKE scan tier').toBeDefined()
    if (!ftsCall) throw new Error('no FTS query captured')

    const details = (
      rawDb.prepare('EXPLAIN QUERY PLAN ' + ftsCall.sql).all(...ftsCall.args) as Array<{
        detail: string
      }>
    ).map((r) => r.detail)

    // SQLite words an FTS5 lookup as "SCAN cves_fts VIRTUAL TABLE INDEX 0:M2" — the token SCAN
    // appears in a fully index-backed plan. So the sibling NFR-02.5 tests' blanket
    // word-boundary SCAN rule is WRONG here and would fail on a correct plan. Assert that the
    // virtual-table index is used, and separately that no REAL table is scanned end-to-end.
    expect(details.some((d) => /VIRTUAL TABLE INDEX/i.test(d))).toBe(true)
    // Plain string logic rather than a regex: a real-table scan is a step that STARTS with
    // "SCAN", is not a virtual-table step, and names one of the two big tables.
    const scansRealTable = details.some((d) => {
      const step = d.toUpperCase()
      if (!step.startsWith('SCAN ')) return false
      if (step.includes('VIRTUAL TABLE')) return false
      return step.includes('CVES') || step.includes('CPE_MATCHES')
    })
    expect(scansRealTable, 'plan scanned a real table: ' + details.join(' | ')).toBe(false)
  })
})

// ===========================================================================
// NFR-02.5 — Scalability (Database Size 10GB+): index usage at scale
//
// Literally provisioning a 10GB+ database in the automated suite is impractical.
// The credible proxy: an indexed query's latency is size-invariant, so proving
// searchCVEsByCPE/searchCVEsByProduct resolve their CVE rows via an index — never
// a full SCAN of the (potentially 10GB+) `cves` table — is what actually guards
// them from becoming unusably slow at that scale.
//
// Scope note (verified, not assumed): searchCVEsByCPE's `cpe_matches` side does a
// substring `LIKE '%text%'` scan by design (a leading-wildcard pattern can never
// use an index) — that is a `cpe_matches` scan, not a `cves` scan, and is the
// known, accepted tradeoff for free-text CPE substring search. What every one of
// these queries must NEVER do, at any scale, is fall back to a full scan of
// `cves` itself to resolve the matched rows — that table is the one whose size
// actually tracks the PRD's 10GB+/1M+-row figures. Both queries below join back
// to `cves` on its primary key, so this asserts that join stays index-backed.
//
// Rather than hand-copying nvdDb.ts's SQL into this file (which would drift
// silently if the real query changed), these tests spy on the raw db's `prepare`/
// `Statement.all` to capture the ACTUAL SQL text and bound parameters the
// production methods send to better-sqlite3, then re-run each captured query
// under EXPLAIN QUERY PLAN. A future change that starts resolving `cves` rows by
// a full scan (e.g. losing the primary-key join, or a rewrite that scans `cves`
// directly) fails this test even though it never touches this file.
// ===========================================================================
describe('NFR-02.5 — index usage at scale (searchCVEsByCPE / searchCVEsByProduct)', () => {
  let instance: NvdDatabase
  let rawDb: InstanceType<typeof Database>

  type PrepareFn = (sql: string) => { all: (...params: unknown[]) => unknown[] }

  /** Records every SQL statement + bound args issued via `db.prepare(...).all(...)`. */
  function captureQueries(db: InstanceType<typeof Database>): Array<{ sql: string; args: unknown[] }> {
    const calls: Array<{ sql: string; args: unknown[] }> = []
    const capturable = db as unknown as { prepare: PrepareFn }
    const originalPrepare = capturable.prepare.bind(capturable)
    vi.spyOn(capturable, 'prepare').mockImplementation((sql: string) => {
      const stmt = originalPrepare(sql)
      return {
        all: (...args: unknown[]) => {
          calls.push({ sql, args })
          return stmt.all(...args)
        },
      }
    })
    return calls
  }

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as InstanceType<typeof Database>

    // createSchemaDb() above only carries the base v1 schema. Add the two
    // production indexes these methods actually rely on: idx_cpe_matches_cpe23_uri
    // (nvdDb.ts runMigrations, migration 1) and the cpe_product covering index
    // (v2SchemaMigration.ts migration_13_cpe_product_index) — done here, not in
    // the shared helper, so the ~200 other tests using it are untouched.
    rawDb.exec('CREATE INDEX IF NOT EXISTS idx_cpe_matches_cpe23_uri ON cpe_matches(cpe23_uri)')
    rawDb.exec('ALTER TABLE cpe_matches ADD COLUMN cpe_product TEXT')
    rawDb.exec('CREATE INDEX IF NOT EXISTS idx_cpe_product_lookup ON cpe_matches(cpe_product, vulnerable, cpe23_uri)')

    rawDb
      .prepare(
        `INSERT INTO cves (id, description, cvss_score, severity, published_at, modified_at, source)
         VALUES ('CVE-2024-1111', 'fixture', 7.0, 'HIGH', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'NVD')`,
      )
      .run()
    rawDb
      .prepare(
        `INSERT INTO cpe_matches (cve_id, cpe23_uri, cpe_product, vulnerable, version_start_including, version_end_excluding)
         VALUES ('CVE-2024-1111', 'cpe:2.3:a:vendor:widgetproduct:*:*:*:*:*:*:*:*', 'widgetproduct', 1, '1.0', '2.0')`,
      )
      .run()
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('searchCVEsByCPE resolves matched CVE rows via the cves primary-key index, never a full scan of cves', () => {
    const calls = captureQueries(rawDb)

    instance.searchCVEsByCPE('cpe:2.3:a:vendor:widgetproduct')

    // The literal substring path runs unconditionally on every call.
    const literalCall = calls.find((c) => c.sql.includes('cp.cpe23_uri LIKE') && c.sql.includes('LIMIT ?'))
    expect(literalCall).toBeDefined()
    if (!literalCall) throw new Error('literal CPE-match query was not issued')

    const plan = rawDb.prepare('EXPLAIN QUERY PLAN ' + literalCall.sql).all(...literalCall.args) as Array<{
      detail: string
    }>
    const details = plan.map((r) => r.detail)

    // cves (alias `c`) must be reached by SEARCH-ing its primary key, not scanned —
    // this is the join step whose cost would grow with a 10GB+/1M+-row cves table
    // if the index were ever dropped or the join rewritten.
    expect(details.some((d) => /SEARCH c USING INDEX/i.test(d))).toBe(true)
    expect(details.some((d) => /SCAN TABLE cves|SCAN c\b/i.test(d))).toBe(false)
  })

  it('searchCVEsByProduct reaches cpe_matches via the cpe_product covering index, never a full scan', () => {
    const calls = captureQueries(rawDb)

    instance.searchCVEsByProduct('widgetproduct')

    const productCall = calls.find((c) => c.sql.includes('cp.cpe_product = ?'))
    expect(productCall).toBeDefined()
    if (!productCall) throw new Error('exact cpe_product query was not issued')

    const plan = rawDb.prepare('EXPLAIN QUERY PLAN ' + productCall.sql).all(...productCall.args) as Array<{
      detail: string
    }>
    const details = plan.map((r) => r.detail)

    expect(details.some((d) => /USING INDEX idx_cpe_product_lookup/i.test(d))).toBe(true)
    expect(details.some((d) => /\bSCAN\b/i.test(d))).toBe(false)
  })
})

// ===========================================================================
// initialize — recovery when the initial open fails (nvdDb.ts lines ~94-117)
//
// NOTE on scope: better-sqlite3 opens lazily — empirically, `new
// BetterSqlite3(path)` does NOT throw for a garbage-content file; only a
// later `.pragma()`/`.prepare()` call does (outside this recovery try/catch).
// So a genuinely-corrupted-content file can't reach this branch at all, and a
// `.backup` file can't be exercised either: recoverFromBackup's own
// `fs.copyFile(backupPath, this.dbPath)` requires `this.dbPath` to not be a
// directory, which is the only reliable way to make the initial open itself
// throw. What CAN be exercised, and is otherwise fully uncovered, is the
// dbExists=true / recovered=false path: the initial open throwing (here,
// because the path is unexpectedly a directory — any cause is equivalent to
// the code) with no valid backup, which renames the bad path aside and starts
// a fresh, usable database rather than crashing.
// ===========================================================================
describe('NvdDatabase initialize — recovery when the initial open fails', () => {
  afterEach(async () => {
    await resetDatabase()
  })

  it('renames the unusable path aside and starts fresh when no valid backup exists', async () => {
    const nodeFs = await import('node:fs/promises')
    const dir = nodePath.join(nodeOs.tmpdir(), 'vulnassess-nvddb-open-fails')
    await nodeFs.rm(dir, { recursive: true, force: true })
    await nodeFs.mkdir(dir, { recursive: true })
    const dbPath = nodePath.join(dir, 'unopenable.db')
    // A directory at dbPath makes `new BetterSqlite3(dbPath)` throw synchronously.
    await nodeFs.mkdir(dbPath)

    const inst = new NvdDatabase(dbPath)
    await inst.initialize()

    expect(inst.isInitialized()).toBe(true)
    expect(inst.getTotalCVECount()).toBe(0) // fresh, usable schema

    const entries = await nodeFs.readdir(dir)
    expect(entries.some((f) => f.startsWith('unopenable.db.corrupted-'))).toBe(true)

    await inst.close()
  })
})

// ===========================================================================
// cvssVersionColumns — CVSS vector version routing (private helper, via upsertCVE)
//
// The H11 bug-hunt test above proves this for a CVSS:3.1 vector; these cover the
// v3.0, bare-v2 (no "CVSS:" prefix), "CVSS:2.0"-prefixed, and unrecognized-format
// branches so a future edit can't silently mis-route (or drop) a CVE's score.
// ===========================================================================
describe('cvssVersionColumns — CVSS version routing via upsertCVE', () => {
  let instance: NvdDatabase
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as InstanceType<typeof Database>
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('routes a CVSS:3.0 vector into the v3.0 columns, not v3.1', async () => {
    await instance.upsertCVE(
      makeCVE({
        id: 'CVE-2024-V30ROUTE',
        cvss_vector: 'CVSS:3.0/AV:N/AC:L/Au:N/C:P/I:P/A:P',
        cvss_score: 8.1,
        severity: 'HIGH',
      }),
    )

    const row = rawDb
      .prepare('SELECT cvss_v30_score, cvss_v30_severity, cvss_v31_score FROM cves WHERE id = ?')
      .get('CVE-2024-V30ROUTE') as {
      cvss_v30_score: number | null
      cvss_v30_severity: string | null
      cvss_v31_score: number | null
    }
    expect(row.cvss_v30_score).toBe(8.1)
    expect(row.cvss_v30_severity).toBe('HIGH')
    expect(row.cvss_v31_score).toBeNull()
  })

  it('routes a bare CVSS v2 vector (no "CVSS:" prefix) into the v2 columns', async () => {
    await instance.upsertCVE(
      makeCVE({
        id: 'CVE-2024-V2BARE',
        cvss_vector: 'AV:N/AC:L/Au:N/C:P/I:P/A:P',
        cvss_score: 5.0,
        severity: 'MEDIUM',
      }),
    )

    const row = rawDb
      .prepare('SELECT cvss_v2_score, cvss_v2_severity FROM cves WHERE id = ?')
      .get('CVE-2024-V2BARE') as {
      cvss_v2_score: number | null
      cvss_v2_severity: string | null
    }
    expect(row.cvss_v2_score).toBe(5.0)
    expect(row.cvss_v2_severity).toBe('MEDIUM')
  })

  it('routes a "CVSS:2.0"-prefixed vector into the v2 columns', async () => {
    await instance.upsertCVE(
      makeCVE({
        id: 'CVE-2024-V2PREFIXED',
        cvss_vector: 'CVSS:2.0/AV:N/AC:L/Au:N/C:P/I:P/A:P',
        cvss_score: 5.0,
        severity: 'MEDIUM',
      }),
    )

    const row = rawDb.prepare('SELECT cvss_v2_score FROM cves WHERE id = ?').get('CVE-2024-V2PREFIXED') as {
      cvss_v2_score: number | null
    }
    expect(row.cvss_v2_score).toBe(5.0)
  })

  it('leaves every version-specific CVSS column null for an unrecognized vector format', async () => {
    // WHY: an unrecognized prefix must never be mislabeled as v3.1/v3.0/v2 — leaving all
    // three null is safer than guessing wrong and showing a misleading score/severity.
    await instance.upsertCVE(
      makeCVE({
        id: 'CVE-2024-UNKNOWNVEC',
        cvss_vector: 'SOME-FUTURE-FORMAT/X:Y',
        cvss_score: 4.0,
        severity: 'MEDIUM',
      }),
    )

    const row = rawDb
      .prepare('SELECT cvss_v31_score, cvss_v30_score, cvss_v2_score FROM cves WHERE id = ?')
      .get('CVE-2024-UNKNOWNVEC') as {
      cvss_v31_score: number | null
      cvss_v30_score: number | null
      cvss_v2_score: number | null
    }
    expect(row.cvss_v31_score).toBeNull()
    expect(row.cvss_v30_score).toBeNull()
    expect(row.cvss_v2_score).toBeNull()
  })

  it('stores a null version-specific score/severity when the CVE has a vector but omits score and severity', async () => {
    await instance.upsertCVE(
      makeCVE({
        id: 'CVE-2024-VECONLY',
        cvss_vector: 'CVSS:3.1/AV:N/AC:L',
        cvss_score: undefined,
        severity: undefined,
      }),
    )

    const row = rawDb
      .prepare('SELECT cvss_v31_score, cvss_v31_severity, cvss_v31_vector FROM cves WHERE id = ?')
      .get('CVE-2024-VECONLY') as {
      cvss_v31_score: number | null
      cvss_v31_severity: string | null
      cvss_v31_vector: string | null
    }
    expect(row.cvss_v31_score).toBeNull()
    expect(row.cvss_v31_severity).toBeNull()
    expect(row.cvss_v31_vector).toBe('CVSS:3.1/AV:N/AC:L')
  })
})

// ===========================================================================
// getCVEsByIds — cpe_text fallback for legacy (pre-cpe23_uri) rows
//
// insertCPEMatches always writes cpe23_uri, but the migration only ADDS that
// column (addColumnsIfMissing) — a row synced before the migration keeps its
// original cpe_text and a NULL cpe23_uri. getCVEsByIds must still surface a
// usable identifier for such a row instead of an empty/undefined value.
// ===========================================================================
describe('getCVEsByIds — legacy cpe_matches fallback', () => {
  let instance: NvdDatabase
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as InstanceType<typeof Database>
    // Give this schema back its pre-migration `cpe_text` column so a legacy row can be
    // simulated (the shared test schema already made cpe23_uri NOT NULL/native).
    rawDb.exec('ALTER TABLE cpe_matches ADD COLUMN cpe_text TEXT')
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('falls back to cpe_text when a legacy row has no cpe23_uri', async () => {
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-LEGACY1' }))
    rawDb
      .prepare('INSERT INTO cpe_matches (cve_id, cpe23_uri, cpe_text, vulnerable) VALUES (?, ?, ?, ?)')
      .run('CVE-2024-LEGACY1', '', 'cpe:2.3:a:legacy:product:1.0', 1)

    const result = instance.getCVEById('CVE-2024-LEGACY1')
    expect(result?.cpe_matches?.[0]?.cpe_text).toBe('cpe:2.3:a:legacy:product:1.0')
  })

  it('returns an empty string when a cpe_matches row has neither cpe23_uri nor cpe_text', async () => {
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-LEGACY2' }))
    rawDb
      .prepare('INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable) VALUES (?, ?, ?)')
      .run('CVE-2024-LEGACY2', '', 1)

    const result = instance.getCVEById('CVE-2024-LEGACY2')
    expect(result?.cpe_matches?.[0]?.cpe_text).toBe('')
  })
})

// ===========================================================================
// parseCpeForRange (private helper) — gating for the version-range path (FR-03.1)
//
// searchCVEsByCPE calls this on every query, but only a well-formed 6+-segment
// CPE with a concrete (non-wildcard, non-"-") version should enable range
// matching; every other shape must return null so only the literal tier runs.
// ===========================================================================
interface RangeParseAccess {
  parseCpeForRange: (cpeText: string) => { part: string; vendor: string; product: string; version: string } | null
}

describe('parseCpeForRange', () => {
  let instance: NvdDatabase

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
  })

  afterEach(async () => {
    await resetDatabase()
  })

  function parse(cpeText: string): { part: string; vendor: string; product: string; version: string } | null {
    return (instance as unknown as RangeParseAccess).parseCpeForRange(cpeText)
  }

  it('parses a well-formed CPE 2.3 string with a concrete version', () => {
    expect(parse('cpe:2.3:a:vendor:product:1.5:*:*:*:*:*:*:*')).toEqual({
      part: 'a',
      vendor: 'vendor',
      product: 'product',
      version: '1.5',
    })
  })

  it('returns null for a wildcard version — nothing concrete to range-match', () => {
    expect(parse('cpe:2.3:a:vendor:product:*:*:*:*:*:*:*:*')).toBeNull()
  })

  it('returns null for a "-" (not applicable) version', () => {
    expect(parse('cpe:2.3:a:vendor:product:-:*:*:*:*:*:*:*')).toBeNull()
  })

  it('returns null for a bare token with no CPE structure', () => {
    expect(parse('apache')).toBeNull()
  })
})

// ===========================================================================
// searchCVEsByCPE — version-range candidate matching (FR-03.1)
//
// nvdDb.perf.test.ts proves this path is fast at 50k rows; these prove it is
// CORRECT: both NVD bound-pair shapes round-trip through searchVersionRangeCandidates,
// an out-of-range version is excluded right at the boundary, a CVE the literal tier
// already found isn't duplicated by the range tier, and results are ordered with a
// null score sorting last (per searchCVEsByCPE's own "nulls last" comment).
// ===========================================================================
describe('searchCVEsByCPE version-range matching (FR-03.1)', () => {
  let instance: NvdDatabase
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as InstanceType<typeof Database>
  })

  afterEach(async () => {
    await resetDatabase()
  })

  function seedRangeRow(
    cveId: string,
    bounds: { start?: string; startExcl?: string; end?: string; endExcl?: string },
  ): void {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, cvss_score, published_at, modified_at, source)
         VALUES (?, 'range fixture', 5.0, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'NVD')`,
      )
      .run(cveId)
    rawDb
      .prepare(
        `INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable, version_start_including,
          version_start_excluding, version_end_including, version_end_excluding)
         VALUES (?, 'cpe:2.3:a:vendor:rangeproduct:*:*:*:*:*:*:*:*', 1, ?, ?, ?, ?)`,
      )
      .run(cveId, bounds.start ?? null, bounds.startExcl ?? null, bounds.end ?? null, bounds.endExcl ?? null)
  }

  it('matches a concrete version against an inclusive-start/exclusive-end range', () => {
    seedRangeRow('CVE-2024-RANGE1', { start: '1.0', endExcl: '2.0' })

    const results = instance.searchCVEsByCPE('cpe:2.3:a:vendor:rangeproduct:1.5:*:*:*:*:*:*:*')
    expect(results.map((r) => r.id)).toEqual(['CVE-2024-RANGE1'])
  })

  it('excludes a version outside the range', () => {
    seedRangeRow('CVE-2024-RANGE2', { start: '1.0', endExcl: '2.0' })

    const results = instance.searchCVEsByCPE('cpe:2.3:a:vendor:rangeproduct:2.0:*:*:*:*:*:*:*')
    expect(results).toEqual([])
  })

  it('matches a concrete version against an exclusive-start/inclusive-end range', () => {
    seedRangeRow('CVE-2024-RANGE3', { startExcl: '1.0', end: '2.0' })

    const withinRange = instance.searchCVEsByCPE('cpe:2.3:a:vendor:rangeproduct:2.0:*:*:*:*:*:*:*')
    const atExcludedStart = instance.searchCVEsByCPE('cpe:2.3:a:vendor:rangeproduct:1.0:*:*:*:*:*:*:*')
    expect(withinRange.map((r) => r.id)).toEqual(['CVE-2024-RANGE3'])
    expect(atExcludedStart).toEqual([]) // 1.0 itself is excluded by versionStartExcluding
  })

  it('does not duplicate a CVE that both the literal and range tiers would independently match', () => {
    // This row's cpe23_uri contains the queried version literally AND carries version
    // bounds that the range tier's cpe23_uri-prefix scan would also pick up. The merge
    // is keyed by cve.id in a Map, so finding the same CVE via both tiers must still
    // yield exactly one result.
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, cvss_score, published_at, modified_at, source)
         VALUES ('CVE-2024-RANGEDUP', 'dup fixture', 5.0, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'NVD')`,
      )
      .run()
    rawDb
      .prepare(
        `INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable, version_start_including, version_end_excluding)
         VALUES ('CVE-2024-RANGEDUP', 'cpe:2.3:a:vendor:rangeproduct:1.5:*:*:*:*:*:*:*', 1, '1.0', '2.0')`,
      )
      .run()

    const results = instance.searchCVEsByCPE('cpe:2.3:a:vendor:rangeproduct:1.5:*:*:*:*:*:*:*')
    expect(results).toHaveLength(1)
    expect(results.map((r) => r.id)).toEqual(['CVE-2024-RANGEDUP'])
  })

  it('orders combined range matches by CVSS score descending, with a null score sorting last', () => {
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, cvss_score, published_at, modified_at, source)
         VALUES ('CVE-2024-RANGEHI', 'high score', 9.0, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'NVD')`,
      )
      .run()
    rawDb
      .prepare(
        `INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable, version_start_including, version_end_excluding)
         VALUES ('CVE-2024-RANGEHI', 'cpe:2.3:a:vendor:rangeproduct:*:*:*:*:*:*:*:*', 1, '1.0', '5.0')`,
      )
      .run()
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, published_at, modified_at, source)
         VALUES ('CVE-2024-RANGENULL', 'no score', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'NVD')`,
      )
      .run()
    rawDb
      .prepare(
        `INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable, version_start_including, version_end_excluding)
         VALUES ('CVE-2024-RANGENULL', 'cpe:2.3:a:vendor:rangeproduct:*:*:*:*:*:*:*:*', 1, '1.0', '5.0')`,
      )
      .run()

    const results = instance.searchCVEsByCPE('cpe:2.3:a:vendor:rangeproduct:2.0:*:*:*:*:*:*:*')
    expect(results.map((r) => r.id)).toEqual(['CVE-2024-RANGEHI', 'CVE-2024-RANGENULL'])
  })
})

// ===========================================================================
// searchCVEsByProduct
//
// Only exercised previously via the NFR-02.5 index-plan test (which adds a
// cpe_product column and never inspects the actual results). These prove the
// three-tier precision fallback (exact -> prefix -> cpe23_uri substring) is
// functionally correct, including on the default/pre-migration schema that
// lacks cpe_product entirely, and that the schema-detection is cached.
// ===========================================================================
describe('searchCVEsByProduct', () => {
  let instance: NvdDatabase
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as InstanceType<typeof Database>
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('should throw when database is not initialized', () => {
    const inst = new NvdDatabase('/no/db.db')
    expect(() => inst.searchCVEsByProduct('anything')).toThrow('Database not initialized')
  })

  it('should return an empty array for a blank product query', () => {
    expect(instance.searchCVEsByProduct('   ')).toEqual([])
  })

  it('falls back to a cpe23_uri substring match when the cpe_product column is absent (pre-migration schema)', async () => {
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-PRODLEGACY' }))
    await instance.insertCPEMatches('CVE-2024-PRODLEGACY', [
      makeCPEMatch({ cve_id: 'CVE-2024-PRODLEGACY', cpe_text: 'cpe:2.3:a:vendor:widgetlegacy:1.0', vulnerable: true }),
    ])

    const results = instance.searchCVEsByProduct('widgetlegacy')
    expect(results.map((r) => r.id)).toEqual(['CVE-2024-PRODLEGACY'])
  })

  it('falls back to a cpe_product prefix match when no row has an exact cpe_product match', () => {
    rawDb.exec('ALTER TABLE cpe_matches ADD COLUMN cpe_product TEXT')
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, cvss_score, published_at, modified_at, source)
         VALUES ('CVE-2024-PRODPREFIX', 'prefix fixture', 6.0, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'NVD')`,
      )
      .run()
    rawDb
      .prepare(
        `INSERT INTO cpe_matches (cve_id, cpe23_uri, cpe_product, vulnerable)
         VALUES ('CVE-2024-PRODPREFIX', 'cpe:2.3:a:vendor:widgetextended:1.0', 'widgetextended', 1)`,
      )
      .run()

    // No row's cpe_product is exactly 'widget' — only the prefix match should find it.
    const results = instance.searchCVEsByProduct('widget')
    expect(results.map((r) => r.id)).toEqual(['CVE-2024-PRODPREFIX'])
  })

  it('caches the cpe_product column check so repeated calls only inspect the schema once', () => {
    rawDb.exec('ALTER TABLE cpe_matches ADD COLUMN cpe_product TEXT')
    const prepareSpy = vi.spyOn(rawDb, 'prepare')

    instance.searchCVEsByProduct('first-call')
    instance.searchCVEsByProduct('second-call')

    const schemaChecks = prepareSpy.mock.calls.filter(([sql]) => sql === 'PRAGMA table_info(cpe_matches)')
    expect(schemaChecks).toHaveLength(1)
  })
})

// ===========================================================================
// getCveListDetails
//
// Only exercised elsewhere via a mocked stub (server/routes/database.test.ts),
// so the real implementation — pre-population, CWE collection, and reference
// tag parsing/dedup — has no direct coverage at all.
// ===========================================================================
describe('getCveListDetails', () => {
  let instance: NvdDatabase
  let rawDb: InstanceType<typeof Database>

  beforeEach(async () => {
    await resetDatabase()
    instance = await createTestInstance()
    rawDb = asAccess(instance).db as InstanceType<typeof Database>
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('returns an empty map when no CVE ids are requested', () => {
    expect(instance.getCveListDetails([]).size).toBe(0)
  })

  it('returns an empty map (does not throw) when the database is not initialized', () => {
    // WHY: unlike most other query methods here, this one is a best-effort batch
    // enrichment helper — a caller resolving a list of CVEs shouldn't crash entirely
    // just because CWE/reference enrichment is unavailable.
    const inst = new NvdDatabase('/no/db.db')
    expect(inst.getCveListDetails(['CVE-2024-0001']).size).toBe(0)
  })

  it('pre-populates an empty-shaped entry for every requested id, even with no related rows', async () => {
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-CLD1' }))
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-CLD2' }))

    const result = instance.getCveListDetails(['CVE-2024-CLD1', 'CVE-2024-CLD2'])

    expect(result.get('CVE-2024-CLD1')).toEqual({ cwes: [], references: [], referenceTags: [] })
    expect(result.get('CVE-2024-CLD2')).toEqual({ cwes: [], references: [], referenceTags: [] })
  })

  it('collects CWE ids for a requested CVE and skips a blank cwe_id', async () => {
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-CLD3' }))
    rawDb.prepare('INSERT INTO cwe_references (cve_id, cwe_id) VALUES (?, ?)').run('CVE-2024-CLD3', 'CWE-79')
    rawDb.prepare('INSERT INTO cwe_references (cve_id, cwe_id) VALUES (?, ?)').run('CVE-2024-CLD3', '')

    const result = instance.getCveListDetails(['CVE-2024-CLD3'])

    expect(result.get('CVE-2024-CLD3')?.cwes).toEqual(['CWE-79'])
  })

  it('parses reference tags, dedupes a tag repeated across references, and tolerates a reference with no tags', async () => {
    await instance.upsertCVE(makeCVE({ id: 'CVE-2024-CLD4' }))
    rawDb
      .prepare('INSERT INTO "references" (cve_id, url, source, tags) VALUES (?,?,?,?)')
      .run('CVE-2024-CLD4', 'https://example.com/a', 'NVD', 'Patch,Vendor Advisory')
    rawDb
      .prepare('INSERT INTO "references" (cve_id, url, tags) VALUES (?,?,?)')
      .run('CVE-2024-CLD4', 'https://example.com/b', 'Patch')
    rawDb.prepare('INSERT INTO "references" (cve_id, url) VALUES (?,?)').run('CVE-2024-CLD4', 'https://example.com/c')

    const entry = instance.getCveListDetails(['CVE-2024-CLD4']).get('CVE-2024-CLD4')

    expect(entry?.references).toHaveLength(3)
    expect(entry?.references[0]).toEqual({
      url: 'https://example.com/a',
      source: 'NVD',
      tags: ['Patch', 'Vendor Advisory'],
    })
    expect(entry?.references[2]).toEqual({ url: 'https://example.com/c', source: undefined, tags: undefined })
    // 'Patch' appears on refs a and b — referenceTags must not contain it twice.
    expect(entry?.referenceTags).toEqual(['patch', 'vendor advisory'])
  })
})

// ===========================================================================
// recoverFromBackup (private) — success + candidate-fallthrough branches
//
// The "initialize — recovery when the initial open fails" suite above can only
// exercise the recovered=false path: its dbPath must be a directory to make the
// initial open throw synchronously, but that same directory-at-dbPath then makes
// recoverFromBackup's own `fs.copyFile(backupPath, this.dbPath)` fail for every
// candidate (can't copy a file onto a directory), so `recovered` is always false
// through that route — its own comment block says as much. These call the
// private method directly (same pattern as the runMigrations/fileExists suites
// above) to cover the return-true branch (a valid backup found, copied in, and
// reopened as the primary db) and the loop's continue-to-next-candidate branch
// when an earlier backup path doesn't exist.
// ===========================================================================
interface RecoverFromBackupAccess {
  recoverFromBackup: () => Promise<boolean>
  db: InstanceType<typeof Database> | null
}

describe('NvdDatabase recoverFromBackup', () => {
  const recoverDir = nodePath.join(nodeOs.tmpdir(), 'vulnassess-nvddb-recover')

  afterEach(async () => {
    await resetDatabase()
  })

  it('recovers from a valid .backup file: copies it in, reopens it as the primary db, and returns true', async () => {
    const nodeFs = await import('node:fs/promises')
    const dir = nodePath.join(recoverDir, 'valid-backup')
    await nodeFs.rm(dir, { recursive: true, force: true })
    await nodeFs.mkdir(dir, { recursive: true })
    const dbPath = nodePath.join(dir, 'primary.db')
    const backupPath = `${dbPath}.backup`

    const seedDb = new Database(backupPath)
    seedDb.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY)')
    seedDb.prepare('INSERT INTO marker (id) VALUES (42)').run()
    seedDb.close()

    const inst = new NvdDatabase(dbPath)
    const access = inst as unknown as RecoverFromBackupAccess
    const recovered = await access.recoverFromBackup()

    expect(recovered).toBe(true)
    const row = access.db?.prepare('SELECT id FROM marker').get() as { id: number } | undefined
    expect(row?.id).toBe(42)

    await inst.close()
  })

  it('skips a missing .backup and falls through to the next candidate (.backup-1)', async () => {
    // WHY: the loop over backupPaths must keep trying subsequent candidates after an
    // earlier one is absent/invalid, not stop at the first failure.
    const nodeFs = await import('node:fs/promises')
    const dir = nodePath.join(recoverDir, 'fallthrough')
    await nodeFs.rm(dir, { recursive: true, force: true })
    await nodeFs.mkdir(dir, { recursive: true })
    const dbPath = nodePath.join(dir, 'primary.db')
    // Deliberately no `${dbPath}.backup` file — only the second candidate exists.
    const backupPath1 = `${dbPath}.backup-1`

    const seedDb = new Database(backupPath1)
    seedDb.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY)')
    seedDb.prepare('INSERT INTO marker (id) VALUES (7)').run()
    seedDb.close()

    const inst = new NvdDatabase(dbPath)
    const access = inst as unknown as RecoverFromBackupAccess
    const recovered = await access.recoverFromBackup()

    expect(recovered).toBe(true)
    const row = access.db?.prepare('SELECT id FROM marker').get() as { id: number } | undefined
    expect(row?.id).toBe(7)

    await inst.close()
  })

  it('returns false when none of the backup candidates exist', async () => {
    const nodeFs = await import('node:fs/promises')
    const dir = nodePath.join(recoverDir, 'no-backups')
    await nodeFs.rm(dir, { recursive: true, force: true })
    await nodeFs.mkdir(dir, { recursive: true })
    const dbPath = nodePath.join(dir, 'primary.db')

    const inst = new NvdDatabase(dbPath)
    const access = inst as unknown as RecoverFromBackupAccess
    const recovered = await access.recoverFromBackup()

    expect(recovered).toBe(false)
    expect(access.db).toBeNull()

    await inst.close()
  })
})

// ===========================================================================
// getDbSize — real file (try-branch), not just the catch/non-existent-path case
//
// The "getDbSize" suite above only proves the catch branch (statSync throws for
// a path that was never written to disk, returning 0). This proves the other
// side of that try/catch: a real database file on disk reports a real,
// non-zero byte size.
// ===========================================================================
describe('NvdDatabase getDbSize (existing file on disk)', () => {
  afterEach(async () => {
    await resetDatabase()
  })

  it('returns a positive byte size for a database file that actually exists on disk', async () => {
    const dir = nodePath.join(nodeOs.tmpdir(), 'vulnassess-nvddb-size')
    const nodeFs = await import('node:fs/promises')
    await nodeFs.rm(dir, { recursive: true, force: true })
    await nodeFs.mkdir(dir, { recursive: true })
    const dbPath = nodePath.join(dir, 'sized.db')

    const inst = new NvdDatabase(dbPath)
    await inst.initialize()
    await inst.updateMetadata('k', 'v')

    expect(inst.getDbSize()).toBeGreaterThan(0)

    await inst.close()
  })
})
