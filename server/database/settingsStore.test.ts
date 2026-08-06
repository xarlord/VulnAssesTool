import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigrations } from './migrations/v2SchemaMigration.js'
import {
  getSetting,
  setSetting,
  getStorageConfig,
  setStorageConfig,
  getPerfConfig,
  setPerfConfig,
  pruneCvesOlderThan,
} from './settingsStore.js'

let db: InstanceType<typeof Database>

beforeEach(() => {
  db = new Database(':memory:')
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  runMigrations(db, 0)
})

afterEach(() => {
  db.close()
})

describe('settingsStore key-value', () => {
  it('round-trips a JSON setting', () => {
    setSetting(db, 'config.storage', { maxSizeMB: 100 })
    expect(getSetting(db, 'config.storage')).toEqual({ maxSizeMB: 100 })
  })

  it('upserts: a second write to the same key overwrites the first', () => {
    // WHY: settings are edited repeatedly; a plain INSERT would throw on the PK the
    // second time and drop the user's change.
    setSetting(db, 'k', { a: 1 })
    setSetting(db, 'k', { a: 2 })
    expect(getSetting(db, 'k')).toEqual({ a: 2 })
  })

  it('returns undefined for a missing key', () => {
    expect(getSetting(db, 'never-set')).toBeUndefined()
  })

  it('persists and reads the storage config (H1)', () => {
    setStorageConfig(db, { maxSizeMB: 50, pruneOldCves: true, pruneOlderThanYear: 2020 })
    expect(getStorageConfig(db)).toEqual({ maxSizeMB: 50, pruneOldCves: true, pruneOlderThanYear: 2020 })
  })

  it('persists and reads the performance config (H2)', () => {
    setPerfConfig(db, { searchResultLimit: 50, enableSearchCache: false, cacheSizeMB: 25, cacheTTLMinutes: 10 })
    expect(getPerfConfig(db)).toEqual({
      searchResultLimit: 50,
      enableSearchCache: false,
      cacheSizeMB: 25,
      cacheTTLMinutes: 10,
    })
  })
})

describe('pruneCvesOlderThan (H1 enforcement)', () => {
  function insertCve(id: string, year: number): void {
    db.prepare(
      `INSERT INTO cves (id, description, published_at, modified_at, published_year)
       VALUES (?, 'desc', ?, ?, ?)`,
    ).run(id, `${year}-01-01T00:00:00Z`, `${year}-01-01T00:00:00Z`, year)
  }

  it('deletes CVEs older than the cutoff year and keeps newer ones, returning the count', () => {
    // WHY: the storage-config prune must actually free space — persisting the setting
    // without deleting anything is the stub behaviour this replaces.
    insertCve('CVE-2017-0001', 2017)
    insertCve('CVE-2018-0001', 2018)
    insertCve('CVE-2021-0001', 2021)

    const deleted = pruneCvesOlderThan(db, 2020)

    expect(deleted).toBe(2)
    const remaining = db.prepare('SELECT id FROM cves ORDER BY id').all()
    expect(remaining).toEqual([{ id: 'CVE-2021-0001' }])
  })

  it('removes dependent rows so no orphans are left behind', () => {
    insertCve('CVE-2018-0001', 2018)
    db.prepare('INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable) VALUES (?, ?, 1)').run(
      'CVE-2018-0001',
      'cpe:2.3:a:v:p:1:*:*:*:*:*:*:*',
    )
    db.prepare('INSERT INTO cvss_metrics (cve_id, source, version, score) VALUES (?, ?, ?, ?)').run(
      'CVE-2018-0001',
      'nvd',
      '3.1',
      7.5,
    )

    pruneCvesOlderThan(db, 2020)

    expect((db.prepare('SELECT COUNT(*) AS n FROM cpe_matches').get() as { n: number }).n).toBe(0)
    expect((db.prepare('SELECT COUNT(*) AS n FROM cvss_metrics').get() as { n: number }).n).toBe(0)
  })

  it('keeps rows with an unknown (NULL) year rather than deleting them', () => {
    db.prepare(
      `INSERT INTO cves (id, description, published_at, modified_at, published_year)
       VALUES ('CVE-2000-0001', 'desc', '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z', NULL)`,
    ).run()

    const deleted = pruneCvesOlderThan(db, 2020)

    expect(deleted).toBe(0)
    expect((db.prepare('SELECT COUNT(*) AS n FROM cves').get() as { n: number }).n).toBe(1)
  })
})
