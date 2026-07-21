/**
 * Backend scan-contract tests for the CPE -> CVE lookup path (nvdDb.ts).
 *
 * These assert the REAL server-side scan function (`searchCVEsByCPE`, the exact
 * method the `POST /api/database/search` route calls for `type: 'cpe'`) resolves
 * the canonical known-vulnerable fixtures used by the E2E seed
 * (`scripts/seed-test-db.js`) to their expected CVEs.
 *
 * Distinct from `nvdDbEnhanced2.test.ts` (which queries bare vendor/product
 * tokens): here the query is the FULL CPE 2.3 URI the renderer actually sends
 * (`vulnMatcher.searchLocalNvdByCpe` forwards `component.cpe` verbatim), and the
 * fixtures/CVE ids are the seed's canonical ones — so a regression in the
 * `vulnerable = 1` filter, the `cpe23_uri` column, or the severity mapping fails
 * this test (Rule 9: it encodes "this exact known-vulnerable component must
 * resolve to this exact CVE at this severity").
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { NvdDatabase, resetDatabase } from './nvdDb.js'
import type { CVE, CPEMatch } from './types.js'

interface NvdDatabaseTestAccess {
  db: InstanceType<typeof Database> | null
  saveToDisk: () => Promise<void>
}

function asAccess(instance: NvdDatabase): NvdDatabaseTestAccess {
  return instance as unknown as NvdDatabaseTestAccess
}

/** In-memory DB with the post-migration schema (cpe_matches uses cpe23_uri). */
function createSchemaDb(): InstanceType<typeof Database> {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE IF NOT EXISTS cves (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    cvss_score REAL,
    cvss_vector TEXT,
    severity TEXT CHECK(severity IN ('NONE','LOW','MEDIUM','HIGH','CRITICAL')),
    published_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    source TEXT CHECK(source IN ('NVD','OSV')) NOT NULL
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS cpe_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cve_id TEXT NOT NULL,
    cpe23_uri TEXT NOT NULL,
    vulnerable INTEGER NOT NULL DEFAULT 0,
    version_start_including TEXT,
    version_start_excluding TEXT,
    version_end_including TEXT,
    version_end_excluding TEXT,
    FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS "references" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cve_id TEXT NOT NULL,
    url TEXT NOT NULL,
    source TEXT,
    tags TEXT,
    FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
  )`)
  db.exec(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)`)
  return db
}

async function createTestInstance(): Promise<NvdDatabase> {
  const instance = new NvdDatabase('/tmp/vulnassess-scan-contract/nvd-data.db')
  const access = asAccess(instance)
  access.db = createSchemaDb()
  access.saveToDisk = async () => {}
  return instance
}

function cve(id: string, severity: CVE['severity'], score: number): CVE {
  return {
    id,
    description: `${id} seeded fixture`,
    cvss_score: score,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    severity,
    published_at: '2023-01-01T00:00:00Z',
    modified_at: '2023-06-01T00:00:00Z',
    source: 'NVD',
  }
}

function match(cveId: string, cpe: string, vulnerable = true): CPEMatch {
  return { cve_id: cveId, cpe_text: cpe, vulnerable }
}

describe('scan contract: CPE -> CVE via searchCVEsByCPE (seed-aligned fixtures)', () => {
  let db: NvdDatabase

  beforeEach(async () => {
    await resetDatabase()
    db = await createTestInstance()

    // Canonical known-vulnerable fixtures mirrored from scripts/seed-test-db.js.
    await db.upsertCVE(cve('CVE-2023-0001', 'CRITICAL', 9.8))
    await db.insertCPEMatches('CVE-2023-0001', [
      match('CVE-2023-0001', 'cpe:2.3:a:sample:app:1.0.0:*:*:*:*:*:*:*'),
      match('CVE-2023-0001', 'cpe:2.3:a:sample:app:1.0.1:*:*:*:*:*:*:*'),
    ])
    await db.upsertCVE(cve('CVE-2023-0002', 'HIGH', 7.5))
    await db.insertCPEMatches('CVE-2023-0002', [
      match('CVE-2023-0002', 'cpe:2.3:a:sample:database:2.0.0:*:*:*:*:*:*:*'),
    ])
    await db.upsertCVE(cve('CVE-2023-3854', 'CRITICAL', 9.8))
    await db.insertCPEMatches('CVE-2023-3854', [match('CVE-2023-3854', 'cpe:2.3:a:haxx:curl:8.3.0:*:*:*:*:*:*:*')])
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('resolves a component to its seeded CVE using the full CPE 2.3 URI the renderer sends', () => {
    const results = db.searchCVEsByCPE('cpe:2.3:a:sample:app:1.0.0:*:*:*:*:*:*:*')

    const hit = results.find((r) => r.id === 'CVE-2023-0001')
    expect(hit, 'sample:app 1.0.0 must resolve to CVE-2023-0001').toBeDefined()
    // Severity must survive the DB round-trip — a broken mapping would fail here,
    // not silently downgrade a critical finding.
    expect(hit?.severity).toBe('CRITICAL')
    expect(hit?.cpe_matches.some((m) => m.cpe_text.includes('sample:app:1.0.0'))).toBe(true)
  })

  it('resolves curl 8.3.0 to CVE-2023-3854 (CRITICAL)', () => {
    const results = db.searchCVEsByCPE('cpe:2.3:a:haxx:curl:8.3.0:*:*:*:*:*:*:*')

    const hit = results.find((r) => r.id === 'CVE-2023-3854')
    expect(hit).toBeDefined()
    expect(hit?.severity).toBe('CRITICAL')
  })

  it('does NOT report a CVE for a component with no matching CPE (no false positives)', () => {
    const results = db.searchCVEsByCPE('cpe:2.3:a:acme:definitely-safe:9.9.9:*:*:*:*:*:*:*')
    expect(results).toHaveLength(0)
  })
})
