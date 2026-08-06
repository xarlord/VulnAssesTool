/**
 * Tests for FTS5 search wiring (NFR-02.3 / NFR-02.5).
 *
 * Two concerns:
 *  1. buildFtsMatchExpression() must turn arbitrary user text into a MATCH
 *     expression that FTS5 accepts WITHOUT throwing a `fts5: syntax error` — the
 *     failure mode that would otherwise make free-text search unusable and force
 *     a silent fallback for every query containing punctuation.
 *  2. The FTS search query must stay index-backed at scale: its EXPLAIN QUERY
 *     PLAN must reach the base `cves` table via an index SEARCH, never a full
 *     SCAN. A full scan is the exact regression that makes a 10GB+ DB (NFR-02.5)
 *     and 1M+ rows (NFR-02.3) unusably slow.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { searchCVEsFTS, buildFtsMatchExpression, FTS_SEARCH_SQL } from './ftsMigration.js'

type BetterDb = InstanceType<typeof Database>

/**
 * Build the FTS index exactly as production migration_7_fts5_search does
 * (external-content fts5 + sync triggers). Deliberately NOT runFTSMigration(),
 * which is dead code with an invalid `CREATE INDEX ON <vtable>` step.
 */
function enableFts(db: BetterDb): void {
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

describe('buildFtsMatchExpression', () => {
  it('quotes a single token and appends a prefix star', () => {
    expect(buildFtsMatchExpression('log4j')).toBe('"log4j"*')
  })

  it('AND-joins multiple tokens, each prefix-matched', () => {
    expect(buildFtsMatchExpression('buffer overflow')).toBe('"buffer"* "overflow"*')
  })

  it('tokenizes on punctuation so hyphenated terms become separate tokens', () => {
    expect(buildFtsMatchExpression('buffer-overflow')).toBe('"buffer"* "overflow"*')
  })

  it('strips FTS syntax characters that would otherwise throw', () => {
    // Raw `log4j:"()` fed to MATCH throws fts5: syntax error; sanitized it must not.
    expect(buildFtsMatchExpression('log4j:"()')).toBe('"log4j"*')
  })

  it('returns null when no alphanumeric tokens survive', () => {
    expect(buildFtsMatchExpression('   ')).toBeNull()
    expect(buildFtsMatchExpression('---')).toBeNull()
    expect(buildFtsMatchExpression('')).toBeNull()
  })
})

describe('FTS5 search against a real virtual table', () => {
  let db: BetterDb

  beforeEach(async () => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE cves (
        id TEXT PRIMARY KEY,
        description TEXT,
        cvss_score REAL,
        cvss_vector TEXT,
        severity TEXT,
        published_at TEXT,
        modified_at TEXT,
        source TEXT
      )
    `)
    const insert = db.prepare('INSERT INTO cves (id, description, cvss_score, severity, source) VALUES (?, ?, ?, ?, ?)')
    insert.run('CVE-2024-0001', 'Apache log4j remote code execution', 10.0, 'CRITICAL', 'NVD')
    insert.run('CVE-2024-0002', 'OpenSSL buffer overflow', 7.5, 'HIGH', 'NVD')
    insert.run('CVE-2024-0003', 'nginx information disclosure', 5.0, 'MEDIUM', 'NVD')
    enableFts(db)
  })

  afterEach(() => {
    db.close()
  })

  it('finds a CVE by a whole-token description match', () => {
    const match = buildFtsMatchExpression('log4j')
    expect(match).not.toBeNull()
    const results = searchCVEsFTS(db, match as string)
    expect(results.map((r) => r.id)).toEqual(['CVE-2024-0001'])
  })

  it('supports token-prefix matching (log4 -> log4j)', () => {
    const results = searchCVEsFTS(db, buildFtsMatchExpression('log4') as string)
    expect(results.map((r) => r.id)).toEqual(['CVE-2024-0001'])
  })

  it('does not throw on a sanitized query full of FTS syntax characters', () => {
    const match = buildFtsMatchExpression('log4j:"()') as string
    expect(() => searchCVEsFTS(db, match)).not.toThrow()
    expect(searchCVEsFTS(db, match).map((r) => r.id)).toEqual(['CVE-2024-0001'])
  })

  it('confirms the raw query WOULD throw without sanitization (why the helper exists)', () => {
    // Feeding raw user input straight to MATCH is exactly what buildFtsMatchExpression prevents.
    expect(() => searchCVEsFTS(db, 'log4j:"()')).toThrow()
  })

  it('reaches the base cves table by index, never a full scan (NFR-02.5)', () => {
    const match = buildFtsMatchExpression('overflow') as string
    const plan = db.prepare('EXPLAIN QUERY PLAN ' + FTS_SEARCH_SQL).all(match, 100, 0) as Array<{ detail: string }>
    const details = plan.map((r) => r.detail)

    // The FTS index must drive the query (shows as a virtual-table index step).
    expect(details.some((d) => /VIRTUAL TABLE INDEX/i.test(d))).toBe(true)

    // No plain full-table SCAN is allowed. The FTS virtual-table index is the only
    // step SQLite labels SCAN here; a base-table SCAN would mean the id index was
    // dropped — the exact regression that makes a 10GB+ DB unusably slow.
    const plainScans = details.filter((d) => /\bSCAN\b/i.test(d) && !/VIRTUAL TABLE INDEX/i.test(d))
    expect(plainScans).toEqual([])

    // The base row lookup must use an index SEARCH (the id primary key).
    expect(details.some((d) => /SEARCH .*USING .*INDEX/i.test(d))).toBe(true)
  })
})
