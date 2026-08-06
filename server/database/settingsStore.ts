/**
 * Settings Store
 *
 * Thin key-value accessor over the `settings` table (migration 15). Values are
 * JSON-encoded, so one table serves any config shape. Backs the /config/storage
 * and /config/perf endpoints, which previously accepted config and discarded it.
 */

import type BetterSqlite3 from 'better-sqlite3'

type Database = InstanceType<typeof BetterSqlite3>

/** Persisted database-storage limits (PUT /config/storage). */
export interface StorageConfig {
  maxSizeMB?: number
  pruneOldCves?: boolean
  pruneOlderThanYear?: number
}

/** Persisted search-performance tuning (PUT /config/perf). */
export interface PerfConfig {
  searchResultLimit?: number
  enableSearchCache?: boolean
  cacheSizeMB?: number
  cacheTTLMinutes?: number
}

const STORAGE_KEY = 'config.storage'
const PERF_KEY = 'config.perf'

/**
 * Read a JSON setting. Returns undefined for a missing key or unparseable value.
 */
export function getSetting<T>(db: Database, key: string): T | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.value) as T
  } catch {
    return undefined
  }
}

/**
 * Write a JSON setting, overwriting any existing value for the key (upsert).
 */
export function setSetting(db: Database, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value))
}

export function getStorageConfig(db: Database): StorageConfig {
  return getSetting<StorageConfig>(db, STORAGE_KEY) ?? {}
}

export function setStorageConfig(db: Database, config: StorageConfig): void {
  setSetting(db, STORAGE_KEY, config)
}

export function getPerfConfig(db: Database): PerfConfig {
  return getSetting<PerfConfig>(db, PERF_KEY) ?? {}
}

export function setPerfConfig(db: Database, config: PerfConfig): void {
  setSetting(db, PERF_KEY, config)
}

/**
 * Delete CVEs published before `year` and their dependent rows, returning the
 * number of CVEs removed. Mirrors the /reset delete set but scoped by
 * published_year via a subquery, all in one transaction. Rows with an unknown
 * (NULL) published_year are kept — `NULL < year` is never true — so a CVE whose
 * year we could not parse is never silently dropped.
 */
export function pruneCvesOlderThan(db: Database, year: number): number {
  const doomed = db.prepare('SELECT COUNT(*) AS n FROM cves WHERE published_year < ?').get(year) as { n: number }
  if (doomed.n === 0) return 0

  const prune = db.transaction((cutoff: number) => {
    const scoped = 'cve_id IN (SELECT id FROM cves WHERE published_year < ?)'
    db.prepare(`DELETE FROM cpe_matches WHERE ${scoped}`).run(cutoff)
    db.prepare(`DELETE FROM "references" WHERE ${scoped}`).run(cutoff)
    db.prepare(`DELETE FROM cwe_references WHERE ${scoped}`).run(cutoff)
    db.prepare(`DELETE FROM cvss_metrics WHERE ${scoped}`).run(cutoff)
    db.prepare('DELETE FROM cves WHERE published_year < ?').run(cutoff)
  })
  prune(year)

  return doomed.n
}
