/**
 * BDD Step Definitions for NVD Database Operations
 *
 * Implements step definitions for database/nvd-database.feature.
 * Drives the real `server/database/nvdDb.ts` (better-sqlite3) against a throwaway
 * database under the OS temp directory — one per scenario, deleted afterwards, so
 * nothing touches the user's real DATA_DIR.
 */

import { Given, When, Then, Before, After } from '@cucumber/cucumber'
import { expect } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NvdDatabase } from '../../../server/database/nvdDb.ts'
import type { CVE, CPEMatch, CVEWithDetails, DatabaseMetadata, Reference } from '../../../server/database/types.ts'

interface DatabaseTestContext {
  tempDir: string
  dbPath: string
  db: NvdDatabase | null
  /** CVE built by a Given step, not yet written. */
  pendingCve: CVE | null
  retrievedCve: CVEWithDetails | null
  searchResults: CVEWithDetails[]
  metadata: DatabaseMetadata | null
  error: Error | null
  /** cpe23_uri values written by the most recent insertCPEMatches call. */
  lastCpeUris: string[]
  /** cpe23_uri values written before the most recent replace. */
  replacedCpeUris: string[]
}

const context: DatabaseTestContext = {
  tempDir: '',
  dbPath: '',
  db: null,
  pendingCve: null,
  retrievedCve: null,
  searchResults: [],
  metadata: null,
  error: null,
  lastCpeUris: [],
  replacedCpeUris: [],
}

// ============================================================================
// HELPERS
// ============================================================================

/** The database under test, or a clear failure if a step forgot to open one. */
function requireDb(): NvdDatabase {
  if (!context.db) throw new Error('No NvdDatabase in scope — a Given step must initialize one first')
  return context.db
}

/** The underlying better-sqlite3 handle, for assertions the public API cannot make. */
function requireRawDb(): NonNullable<ReturnType<NvdDatabase['getRawDb']>> {
  const raw = requireDb().getRawDb()
  if (!raw) throw new Error('Database is not open')
  return raw
}

function makeCve(id: string, overrides: Partial<CVE> = {}): CVE {
  return {
    id,
    description: `Description for ${id}`,
    cvss_score: 7.5,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    severity: 'HIGH',
    published_at: '2024-01-01T00:00:00.000Z',
    modified_at: '2024-01-01T00:00:00.000Z',
    source: 'NVD',
    ...overrides,
  }
}

function makeCpeMatch(cveId: string, cpe23Uri: string): CPEMatch {
  return { cve_id: cveId, cpe_text: cpe23Uri, cpe23_uri: cpe23Uri, vulnerable: true }
}

async function openDatabaseAt(dbPath: string): Promise<void> {
  context.dbPath = dbPath
  context.db = new NvdDatabase(dbPath)
  await context.db.initialize()
}

function countRows(table: string, cveId?: string): number {
  const raw = requireRawDb()
  const sql = cveId
    ? `SELECT COUNT(*) as count FROM "${table}" WHERE cve_id = ?`
    : `SELECT COUNT(*) as count FROM "${table}"`
  const row = (cveId ? raw.prepare(sql).get(cveId) : raw.prepare(sql).get()) as { count: number }
  return row.count
}

// ============================================================================
// HOOKS
// ============================================================================

Before({ tags: '@database' }, async function () {
  context.tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bdd-nvddb-'))
  context.dbPath = path.join(context.tempDir, 'nvd.db')
  context.db = null
  context.pendingCve = null
  context.retrievedCve = null
  context.searchResults = []
  context.metadata = null
  context.error = null
  context.lastCpeUris = []
  context.replacedCpeUris = []
})

After({ tags: '@database' }, async function () {
  // close() also unregisters the process exit handlers initialize() adds, so a
  // 16-scenario feature does not accumulate 48 listeners and trip Node's warning.
  if (context.db) await context.db.close()
  context.db = null
  await fs.rm(context.tempDir, { recursive: true, force: true })
})

// ============================================================================
// GIVEN — database lifecycle
// ============================================================================

Given('no database exists at the target location', async function () {
  await expect(fs.access(context.dbPath)).rejects.toThrow()
})

Given('a custom database path {string}', function (relativePath: string) {
  context.dbPath = path.join(context.tempDir, relativePath)
})

Given('the database is initialized', async function () {
  await openDatabaseAt(context.dbPath)
})

Given('the database is initialized and open', async function () {
  await openDatabaseAt(context.dbPath)
  expect(requireDb().isInitialized()).toBe(true)
})

Given('the database was closed', async function () {
  await openDatabaseAt(context.dbPath)
  await requireDb().upsertCVE(makeCve('CVE-2024-0001'))
  await requireDb().close()
  expect(requireDb().isInitialized()).toBe(false)
})

Given('a database path that cannot be created', async function () {
  // A regular file standing where the parent directory would go: mkdir cannot
  // create it, on Windows and POSIX alike.
  const blocker = path.join(context.tempDir, 'blocker')
  await fs.writeFile(blocker, 'not a directory')
  context.dbPath = path.join(blocker, 'nvd.db')
})

// ============================================================================
// GIVEN — seeding
// ============================================================================

Given('I have a CVE record with ID {string}', function (cveId: string) {
  context.pendingCve = makeCve(cveId)
})

Given('CVE {string} exists in the database', async function (cveId: string) {
  await requireDb().upsertCVE(makeCve(cveId))
})

Given('CVE {string} exists with description {string}', async function (cveId: string, description: string) {
  await requireDb().upsertCVE(makeCve(cveId, { description }))
})

Given('CVE {string} exists with CPE matches and references', async function (cveId: string) {
  const db = requireDb()
  await db.upsertCVE(makeCve(cveId))
  await db.insertCPEMatches(cveId, [
    makeCpeMatch(cveId, 'cpe:2.3:a:nginx:nginx:1.18.0:*:*:*:*:*:*:*'),
    makeCpeMatch(cveId, 'cpe:2.3:a:nginx:nginx:1.19.0:*:*:*:*:*:*:*'),
  ])
  await db.insertReferences(cveId, [
    { cve_id: cveId, url: 'https://example.test/advisory', source: 'NVD', tags: 'Vendor Advisory' },
    { cve_id: cveId, url: 'https://example.test/patch', source: 'NVD', tags: 'Patch' },
  ])
})

Given('{int} CVEs exist with CPE matches for {string}', async function (count: number, product: string) {
  const db = requireDb()
  for (let i = 0; i < count; i++) {
    const cveId = `CVE-2024-${String(1000 + i).padStart(4, '0')}`
    // Descending scores so "ordered by CVSS descending" is not satisfiable by
    // insertion order alone.
    await db.upsertCVE(makeCve(cveId, { cvss_score: Number((10 - i * 0.1).toFixed(1)) }))
    await db.insertCPEMatches(cveId, [makeCpeMatch(cveId, `cpe:2.3:a:${product}:${product}:1.${i}.0:*:*:*:*:*:*:*`)])
  }
})

Given(
  'the database contains {int} CVEs, {int} of them published after 2021',
  async function (total: number, recent: number) {
    // Seeded with their final publication dates in one pass: upsertCVE never rewrites
    // published_at, so back-dating and then "updating" would silently leave every row
    // in the pre-2021 bucket (see the re-import scenario).
    const db = requireDb()
    for (let i = 0; i < total; i++) {
      const publishedAt = i < recent ? '2022-03-01T00:00:00.000Z' : '2019-06-01T00:00:00.000Z'
      await db.upsertCVE(makeCve(`CVE-2024-${String(2000 + i).padStart(4, '0')}`, { published_at: publishedAt }))
    }
  },
)

// ============================================================================
// WHEN
// ============================================================================

When('I initialize the NVD database', async function () {
  await openDatabaseAt(context.dbPath)
})

When('I initialize the NVD database with the custom path', async function () {
  await openDatabaseAt(context.dbPath)
})

When('I initialize the database again', async function () {
  await requireDb().initialize()
})

When('I attempt to initialize the database', async function () {
  context.db = new NvdDatabase(context.dbPath)
  try {
    await context.db.initialize()
  } catch (error) {
    context.error = error instanceof Error ? error : new Error(String(error))
  }
})

When('I close the database connection', async function () {
  await requireDb().close()
})

When('I insert the CVE into the database', async function () {
  if (!context.pendingCve) throw new Error('No pending CVE — a Given step must build one first')
  await requireDb().upsertCVE(context.pendingCve)
})

When('I update the CVE with a new description {string}', async function (description: string) {
  const db = requireDb()
  const existing = db.getCVEById('CVE-2024-1234')
  if (!existing) throw new Error('CVE-2024-1234 is not in the database')
  context.pendingCve = makeCve('CVE-2024-1234', {
    description,
    modified_at: '2024-09-30T00:00:00.000Z',
  })
  await db.upsertCVE(context.pendingCve)
  context.retrievedCve = existing
})

Given('I insert {int} CPE matches for the CVE', async function (count: number) {
  const uris: string[] = []
  for (let i = 0; i < count; i++) uris.push(`cpe:2.3:a:vendor:product:1.${i}.0:*:*:*:*:*:*:*`)
  await requireDb().insertCPEMatches(
    'CVE-2024-1234',
    uris.map((uri) => makeCpeMatch('CVE-2024-1234', uri)),
  )
  context.lastCpeUris = uris
})

When('I insert {int} different CPE matches for the CVE', async function (count: number) {
  context.replacedCpeUris = context.lastCpeUris
  const uris: string[] = []
  for (let i = 0; i < count; i++) uris.push(`cpe:2.3:a:other:replacement:9.${i}.0:*:*:*:*:*:*:*`)
  await requireDb().insertCPEMatches(
    'CVE-2024-1234',
    uris.map((uri) => makeCpeMatch('CVE-2024-1234', uri)),
  )
  context.lastCpeUris = uris
})

When('I insert {int} references for the CVE', async function (count: number) {
  const refs: Reference[] = []
  for (let i = 0; i < count; i++) {
    refs.push({ cve_id: 'CVE-2024-1234', url: `https://example.test/ref-${i}`, source: 'NVD' })
  }
  await requireDb().insertReferences('CVE-2024-1234', refs)
})

When('I re-import the CVE with a later publication date', async function () {
  const db = requireDb()
  const before = db.getCVEById('CVE-2024-1234')
  if (!before) throw new Error('CVE-2024-1234 is not in the database')
  context.retrievedCve = before
  await db.upsertCVE(
    makeCve('CVE-2024-1234', {
      description: 'New description',
      published_at: '2026-01-01T00:00:00.000Z',
      modified_at: '2026-01-01T00:00:00.000Z',
    }),
  )
})

Then('the publication date should be unchanged', function () {
  const after = requireDb().getCVEById('CVE-2024-1234')
  expect(after?.published_at).toBe(context.retrievedCve?.published_at)
  expect(after?.published_at).not.toBe('2026-01-01T00:00:00.000Z')
})

When('I retrieve the CVE by ID', function () {
  context.retrievedCve = requireDb().getCVEById('CVE-2024-1234')
})

When('I attempt to retrieve CVE {string}', function (cveId: string) {
  context.retrievedCve = requireDb().getCVEById(cveId)
})

When('I search CVEs using CPE text {string}', function (cpeText: string) {
  context.searchResults = requireDb().searchCVEsByCPE(cpeText)
})

When('I search CVEs using CPE text {string} with limit {int}', function (cpeText: string, limit: number) {
  context.searchResults = requireDb().searchCVEsByCPE(cpeText, limit)
})

When('I retrieve the database metadata', function () {
  context.metadata = requireDb().getMetadata()
})

When('I update metadata with key {string} and value {string}', async function (key: string, value: string) {
  await requireDb().updateMetadata(key, value)
})

// ============================================================================
// THEN — initialization
// ============================================================================

Then('a new database file should be created', async function () {
  await expect(fs.access(context.dbPath)).resolves.toBeUndefined()
})

Then('the database schema should be applied', function () {
  const raw = requireRawDb()
  const tables = (
    raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
  ).map((row) => row.name)
  expect(tables).toEqual(expect.arrayContaining(['cves', 'cpe_matches', 'references', 'metadata']))
})

Then('WAL mode should be enabled', function () {
  const mode = requireRawDb().pragma('journal_mode', { simple: true })
  expect(String(mode).toLowerCase()).toBe('wal')
})

Then('foreign keys should be enabled', function () {
  expect(requireRawDb().pragma('foreign_keys', { simple: true })).toBe(1)
})

Then('the database should be created at the custom path', async function () {
  expect(requireDb().getDbPath()).toBe(context.dbPath)
  await expect(fs.access(context.dbPath)).resolves.toBeUndefined()
})

Then('initialization should fail with an error', function () {
  expect(context.error).toBeInstanceOf(Error)
})

Then('the connection should be terminated', function () {
  expect(requireDb().isInitialized()).toBe(false)
})

Then('subsequent operations should throw an error', function () {
  expect(() => requireDb().getTotalCVECount()).toThrow('Database not initialized')
})

Then('the connection should be established', function () {
  expect(requireDb().isInitialized()).toBe(true)
})

Then('existing data should be accessible', function () {
  expect(requireDb().getCVEById('CVE-2024-0001')?.id).toBe('CVE-2024-0001')
})

// ============================================================================
// THEN — CVE records
// ============================================================================

Then('the CVE should be stored successfully', function () {
  expect(requireDb().getTotalCVECount()).toBe(1)
})

Then('I should be able to retrieve it by ID', function () {
  if (!context.pendingCve) throw new Error('No pending CVE to look up')
  const stored = requireDb().getCVEById(context.pendingCve.id)
  expect(stored?.id).toBe(context.pendingCve.id)
  expect(stored?.description).toBe(context.pendingCve.description)
})

Then('the CVE should reflect the updated description', function () {
  expect(requireDb().getCVEById('CVE-2024-1234')?.description).toBe('New description')
})

Then('the modified date should be updated', function () {
  const before = context.retrievedCve?.modified_at
  const after = requireDb().getCVEById('CVE-2024-1234')?.modified_at
  expect(after).not.toBe(before)
  expect(after).toBe('2024-09-30T00:00:00.000Z')
})

Then('the database should still hold exactly {int} CVE', function (count: number) {
  expect(requireDb().getTotalCVECount()).toBe(count)
})

Then('the result should be null', function () {
  expect(context.retrievedCve).toBeNull()
})

// ============================================================================
// THEN — CPE matches and references
// ============================================================================

Then('all {int} CPE matches should be stored', function (count: number) {
  expect(countRows('cpe_matches', 'CVE-2024-1234')).toBe(count)
})

Then('exactly {int} CPE matches should be stored', function (count: number) {
  expect(countRows('cpe_matches', 'CVE-2024-1234')).toBe(count)
})

Then('each CPE match should be linked to the CVE', function () {
  const matches = requireDb().getCVEById('CVE-2024-1234')?.cpe_matches ?? []
  expect(matches.length).toBeGreaterThan(0)
  for (const match of matches) expect(match.cve_id).toBe('CVE-2024-1234')
})

Then('none of the replaced CPE matches should remain', function () {
  expect(context.replacedCpeUris.length).toBeGreaterThan(0)
  const stored = (requireDb().getCVEById('CVE-2024-1234')?.cpe_matches ?? []).map((match) => match.cpe_text)
  for (const uri of context.replacedCpeUris) expect(stored).not.toContain(uri)
})

Then('all {int} references should be stored', function (count: number) {
  expect(countRows('references', 'CVE-2024-1234')).toBe(count)
})

Then('each reference should be linked to the CVE', function () {
  const refs = requireDb().getCVEById('CVE-2024-1234')?.references ?? []
  expect(refs.length).toBeGreaterThan(0)
  for (const ref of refs) expect(ref.cve_id).toBe('CVE-2024-1234')
})

Then('I should receive the CVE with all CPE matches', function () {
  expect(context.retrievedCve?.cpe_matches).toHaveLength(2)
})

Then('I should receive all references', function () {
  expect(context.retrievedCve?.references).toHaveLength(2)
})

Then('the vulnerable flag should be a boolean', function () {
  const matches = context.retrievedCve?.cpe_matches ?? []
  expect(matches.length).toBeGreaterThan(0)
  for (const match of matches) expect(typeof match.vulnerable).toBe('boolean')
})

// ============================================================================
// THEN — search
// ============================================================================

Then('I should receive results containing CVEs with nginx CPE matches', function () {
  expect(context.searchResults.length).toBe(10)
  for (const cve of context.searchResults) {
    expect((cve.cpe_matches ?? []).some((match) => match.cpe_text.includes('nginx'))).toBe(true)
  }
})

Then('results should be ordered by CVSS score descending', function () {
  const scores = context.searchResults.map((cve) => cve.cvss_score ?? -1)
  expect(scores).toEqual([...scores].sort((a, b) => b - a))
})

Then('I should receive exactly {int} results', function (count: number) {
  expect(context.searchResults).toHaveLength(count)
})

Then('results should be the highest CVSS scored CVEs', function () {
  const raw = requireRawDb()
  const topScores = (
    raw
      .prepare('SELECT cvss_score FROM cves ORDER BY cvss_score DESC LIMIT ?')
      .all(context.searchResults.length) as Array<{ cvss_score: number }>
  ).map((row) => row.cvss_score)
  expect(context.searchResults.map((cve) => cve.cvss_score)).toEqual(topScores)
})

// ============================================================================
// THEN — metadata
// ============================================================================

Then('total CVEs should be {int}', function (count: number) {
  expect(context.metadata?.total_cves).toBe(count)
})

Then('CVEs after 2021 should be {int}', function (count: number) {
  expect(context.metadata?.cves_after_2021).toBe(count)
})

Then('schema version should be returned', function () {
  expect(context.metadata?.schema_version).toBeTruthy()
})

Then('the metadata should be stored', function () {
  const row = requireRawDb().prepare("SELECT value FROM metadata WHERE key = 'last_sync_at'").get() as
    | { value: string }
    | undefined
  expect(row?.value).toBe('2024-01-15T10:00:00Z')
})

Then('the reported last sync time should be {string}', function (value: string) {
  expect(requireDb().getMetadata().last_sync_at).toBe(value)
})
