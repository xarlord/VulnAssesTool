/**
 * NFR-02.3 — Scalability: 1,000,000+ vulnerability records (correctness at scale).
 *
 * The only prior 6-figure-scale evidence in the repo (server/database/dbSeedingService.test.ts)
 * is capped at 200,000 rows and only exercises checkFirstRun()'s seeding-state detection — it
 * never runs a real query against that many rows. This test seeds 1,000,000 CVE rows (5x the
 * PRD's "1,000,000+" bar) and exercises the actual query path a user hits — NvdDatabase's
 * searchCVEsByText() — proving it still returns CORRECT, COMPLETE results at that scale, not
 * just that it stays fast.
 *
 * WHY this guards intent (Rule 9): a regression that makes the FTS5/index-backed query plan
 * fall back to a full description scan would still often "work" and still be reasonably fast at
 * modest row counts (see server/database/ftsMigration.test.ts's EXPLAIN QUERY PLAN check for the
 * plan-shape guard) — but at 1,000,000+ rows either it silently truncates results before finding
 * a rare match, or it becomes unusably slow. A single "needle in a haystack" row with a unique
 * description token, findable only via a correct full-scan-of-the-index (not a truncated partial
 * scan), is what actually proves completeness — a test that only checked "some results came
 * back quickly" could pass even if 90% of the haystack were silently skipped.
 *
 * Seeding uses a single `WITH RECURSIVE` INSERT (one SQL statement, not 1,000,000 prepared-
 * statement round-trips) — the same fix CLAUDE.md documents for the pre-existing 200k-row
 * flaky-insert issue, scaled up. Runs in tests/perf/ (npm run test:perf), isolated and
 * generously timed out, per the repo's existing perf-suite convention.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { NvdDatabase, resetDatabase } from '../../server/database/nvdDb.js'

type BetterDb = InstanceType<typeof Database>

interface NvdDatabaseTestAccess {
  db: BetterDb | null
  saveToDisk: () => Promise<void>
}

const ROW_COUNT = 1_000_000
// Generous: this canary only catches a gross algorithmic regression (e.g. falling back to an
// O(n) description scan across a million rows repeated per call). The correctness assertions
// below are the machine-independent signal this test primarily exists for.
const TIME_BUDGET_MS = 5_000

const NEEDLE_ID = 'CVE-2020-9999999'
const NEEDLE_TOKEN = 'zzzqualcommneedlezzz'
const KNOWN_ID = 'CVE-2020-0500000'

function createSchemaDb(): BetterDb {
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
  return db
}

/** Build the FTS index exactly as production migration_7_fts5_search does. */
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

describe('NFR-02.3 — searchCVEsByText correctness against 1,000,000 seeded CVE rows', () => {
  let instance: NvdDatabase
  let rawDb: BetterDb

  beforeEach(async () => {
    await resetDatabase()
    instance = new NvdDatabase('/tmp/vulnassess-scale-perf/nvd-data.db')
    const access = instance as unknown as NvdDatabaseTestAccess
    rawDb = createSchemaDb()
    access.db = rawDb
    access.saveToDisk = async () => {}

    // One SQL statement generates all 1,000,000 filler rows — see file header re: the
    // dbSeedingService flaky-insert fix this mirrors at 5x the row count.
    rawDb.exec(`
      INSERT INTO cves (id, description, cvss_score, severity, published_at, modified_at, source)
      WITH RECURSIVE seq(n) AS (
        SELECT 0
        UNION ALL
        SELECT n + 1 FROM seq WHERE n < ${ROW_COUNT - 1}
      )
      SELECT printf('CVE-2020-%07d', n), 'Generic filler vulnerability description', 5.0, 'MEDIUM',
             '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', 'NVD'
      FROM seq
    `)

    // A single needle row, distinguishable from all 1,000,000 filler rows by one rare token.
    rawDb
      .prepare(
        `INSERT INTO cves (id, description, cvss_score, severity, published_at, modified_at, source)
         VALUES (?, ?, 9.8, 'CRITICAL', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z', 'NVD')`,
      )
      .run(NEEDLE_ID, `Remote code execution via a ${NEEDLE_TOKEN} affected component`)

    enableFts(rawDb)
  }, 60_000)

  afterEach(async () => {
    await resetDatabase()
  })

  it('total CVE count reflects all 1,000,000 filler rows plus the needle row, none dropped', () => {
    expect(instance.getTotalCVECount()).toBe(ROW_COUNT + 1)
  })

  it('resolves an exact CVE-ID lookup out of 1,000,001 rows', () => {
    const results = instance.searchCVEsByText(KNOWN_ID)
    expect(results.map((r) => r.id)).toEqual([KNOWN_ID])
  })

  it('finds the one needle row by a rare description token, out of 1,000,001 rows, within budget', () => {
    const start = performance.now()
    const results = instance.searchCVEsByText(NEEDLE_TOKEN)
    const elapsed = performance.now() - start

    // Correctness at scale: the needle is found, and ONLY the needle — not truncated away,
    // and not swamped by false positives from the 1,000,000 unrelated filler rows.
    expect(results.map((r) => r.id)).toEqual([NEEDLE_ID])

    expect(elapsed).toBeLessThan(TIME_BUDGET_MS)
  })
})
