/**
 * Perf regression guard for searchCVEsByCPE's version-range path (FR-03.1).
 *
 * The range path scopes candidates by an index-usable cpe23_uri prefix and then
 * filters them in JS with isVersionInRange. This test stresses the worst case —
 * tens of thousands of range rows for a SINGLE product — and asserts two things:
 *   1. Correctness at scale: the one CVE whose range contains the queried version
 *      is still resolved out of a 50k-row haystack (teeth independent of machine
 *      speed).
 *   2. A generous wall-clock budget, to catch a regression back to an O(n^2) or
 *      per-row-query design.
 *
 * Inserts are batched in a single transaction, per the flaky-perf guidance in
 * CLAUDE.md (never insert tens of thousands of rows one statement at a time).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { NvdDatabase, resetDatabase } from './nvdDb.js'

interface NvdDatabaseTestAccess {
  db: InstanceType<typeof Database> | null
  saveToDisk: () => Promise<void>
}

const ROW_COUNT = 50_000
// Deliberately generous: this guards against gross algorithmic regressions, not
// micro-perf. The correctness-at-scale assertion below is the machine-independent
// signal; this only fails if the query becomes pathologically slow.
const TIME_BUDGET_MS = 2_000

function createIndexedSchemaDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE cves (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    cvss_score REAL,
    cvss_vector TEXT,
    severity TEXT,
    published_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    source TEXT NOT NULL
  )`)
  db.exec(`CREATE TABLE cpe_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cve_id TEXT NOT NULL,
    cpe23_uri TEXT NOT NULL,
    vulnerable INTEGER NOT NULL DEFAULT 0,
    version_start_including TEXT,
    version_start_excluding TEXT,
    version_end_including TEXT,
    version_end_excluding TEXT
  )`)
  db.exec(`CREATE TABLE "references" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cve_id TEXT NOT NULL,
    url TEXT NOT NULL,
    source TEXT,
    tags TEXT
  )`)
  db.exec(`CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  // Mirror the production index the range-candidate prefix query relies on.
  db.exec('CREATE INDEX idx_cpe_matches_cpe23_uri ON cpe_matches(cpe23_uri)')
  return db
}

describe('searchCVEsByCPE version-range performance (FR-03.1)', () => {
  let instance: NvdDatabase

  beforeEach(async () => {
    await resetDatabase()
    instance = new NvdDatabase('/tmp/vulnassess-range-perf/nvd-data.db')
    const access = instance as unknown as NvdDatabaseTestAccess
    const raw = createIndexedSchemaDb()
    access.db = raw
    access.saveToDisk = async () => {}

    const insertCve = raw.prepare(
      `INSERT INTO cves (id, description, cvss_score, cvss_vector, severity, published_at, modified_at, source)
       VALUES (?, 'perf fixture', 5.0, 'vec', 'MEDIUM', '2023-01-01T00:00:00Z', '2023-06-01T00:00:00Z', 'NVD')`,
    )
    const insertMatch = raw.prepare(
      `INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable, version_start_including, version_end_excluding)
       VALUES (?, 'cpe:2.3:a:perfvendor:perfproduct:*:*:*:*:*:*:*:*', 1, ?, ?)`,
    )
    // Each CVE i owns a disjoint range [i.0, i.999) for the same product, so a
    // single queried version lands inside exactly one of the 50k rows.
    const seed = raw.transaction((count: number) => {
      for (let i = 0; i < count; i++) {
        const id = `CVE-PERF-${i}`
        insertCve.run(id)
        insertMatch.run(id, `${i}.0`, `${i}.999`)
      }
    })
    seed(ROW_COUNT)
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('resolves an in-range version out of a 50k-row single-product haystack within budget', () => {
    const start = performance.now()
    const results = instance.searchCVEsByCPE('cpe:2.3:a:perfvendor:perfproduct:25000.5:*:*:*:*:*:*:*')
    const elapsed = performance.now() - start

    // Correctness at scale: only CVE-PERF-25000's range [25000.0, 25000.999)
    // contains 25000.5 — neighbours must not match.
    expect(results.some((r) => r.id === 'CVE-PERF-25000')).toBe(true)
    expect(results.some((r) => r.id === 'CVE-PERF-25001')).toBe(false)
    expect(results.some((r) => r.id === 'CVE-PERF-24999')).toBe(false)

    expect(elapsed).toBeLessThan(TIME_BUDGET_MS)
  })
})
