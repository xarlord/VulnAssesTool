/**
 * Full-Text Search (FTS5) Migration
 * Adds FTS5 virtual table for fast text search on CVE descriptions
 */

import type { Database } from 'sql.js'
import { rowsToObjects } from './queryUtils.js'

/**
 * Run FTS5 migration on the database
 *
 * This creates:
 * 1. A virtual FTS5 table for CVE descriptions
 * 2. Triggers to keep the FTS index in sync
 * 3. Indexes for performance
 *
 * @param db The SQLite database instance
 */
export async function runFTSMigration(db: Database): Promise<void> {
  console.log('[FTS Migration] Starting FTS5 migration...')

  // Check if migration already ran
  const checkResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'")

  if (checkResult.length > 0) {
    console.log('[FTS Migration] FTS5 table already exists, skipping migration')
    return
  }

  try {
    // Create FTS5 virtual table for CVE descriptions
    db.run(`
      CREATE VIRTUAL TABLE cves_fts USING fts5(
        id,
        description,
        content='cves',
        content_rowid='rowid'
      )
    `)

    console.log('[FTS Migration] Created FTS5 virtual table')

    // Create indexes for FTS table
    db.run('CREATE INDEX IF NOT EXISTS idx_cves_fts_id ON cves_fts(id)')

    // Populate FTS table with existing data
    const populateResult = db.exec(`
      INSERT INTO cves_fts(rowid, id, description)
      SELECT rowid, id, description FROM cves WHERE description IS NOT NULL
    `)

    console.log(`[FTS Migration] Populated FTS5 table with ${populateResult.length} rows`)

    // Create triggers to keep FTS table in sync
    // Trigger for INSERT
    db.run(`
      CREATE TRIGGER IF NOT EXISTS cves_fts_insert AFTER INSERT ON cves
      BEGIN
        INSERT INTO cves_fts(rowid, id, description)
        VALUES (NEW.rowid, NEW.id, NEW.description);
      END
    `)

    // Trigger for UPDATE
    db.run(`
      CREATE TRIGGER IF NOT EXISTS cves_fts_update AFTER UPDATE ON cves
      BEGIN
        UPDATE cves_fts
        SET description = NEW.description
        WHERE rowid = NEW.rowid;
      END
    `)

    // Trigger for DELETE
    db.run(`
      CREATE TRIGGER IF NOT EXISTS cves_fts_delete AFTER DELETE ON cves
      BEGIN
        DELETE FROM cves_fts WHERE rowid = OLD.rowid;
      END
    `)

    console.log('[FTS Migration] Created FTS5 sync triggers')

    // Record migration in schema_migrations
    db.exec(`
      INSERT INTO schema_migrations (version, applied_at)
      VALUES (2, datetime('now'))
    `)

    console.log('[FTS Migration] FTS5 migration completed successfully')
  } catch (error) {
    console.error('[FTS Migration] Error during FTS5 migration:', error)
    throw error
  }
}

/**
 * Search CVEs using FTS5
 *
 * @param db The SQLite database instance
 * @param query The search query
 * @param limit Maximum number of results
 * @param offset Number of results to skip
 * @returns Array of CVE IDs matching the query
 */
export function searchCVEsFTS(
  db: Database,
  query: string,
  limit = 100,
  offset = 0,
): Array<{ id: string; rank: number }> {
  // Use FTS5 search with BM25 ranking
  const results = db.exec(
    `
    SELECT
      c.id,
      c.description,
      c.cvss_score,
      c.cvss_vector,
      c.severity,
      c.published_at,
      c.modified_at,
      c.source,
      cves_fts.rank AS search_rank
    FROM cves c
    INNER JOIN cves_fts f ON c.id = f.id
    WHERE cves_fts MATCH ?
    ORDER BY search_rank
    LIMIT ? OFFSET ?
  `,
    [query, limit, offset],
  )

  const cves: Array<{ id: string; rank: number }> = []

  if (results.length > 0) {
    const rows = rowsToObjects(results[0].columns, results[0].values)
    for (const cve of rows) {
      cves.push({
        id: cve.id as string,
        rank: cve.search_rank as number,
      })
    }
  }

  return cves
}

/**
 * Check if FTS5 is available
 *
 * @param db The SQLite database instance
 * @returns true if FTS5 table exists
 */
export function isFTSAvailable(db: Database): boolean {
  const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'")
  return result.length > 0
}

/**
 * Get FTS5 statistics
 *
 * @param db The SQLite database instance
 * @returns Statistics about the FTS5 index
 */
export function getFTSStats(db: Database): {
  indexedCount: number
  totalCount: number
} {
  const totalResult = db.exec('SELECT COUNT(*) as count FROM cves')
  const ftsResult = db.exec('SELECT COUNT(*) as count FROM cves_fts')

  const total = totalResult.length > 0 && totalResult[0].values.length > 0 ? (totalResult[0].values[0][0] as number) : 0

  const indexed = ftsResult.length > 0 && ftsResult[0].values.length > 0 ? (ftsResult[0].values[0][0] as number) : 0

  return {
    indexedCount: indexed,
    totalCount: total,
  }
}
