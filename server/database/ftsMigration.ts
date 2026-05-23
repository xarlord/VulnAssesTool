/**
 * Full-Text Search (FTS5) Migration
 * Adds FTS5 virtual table for fast text search on CVE descriptions
 */

import Database from 'better-sqlite3'

type BetterDb = InstanceType<typeof Database>

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
export async function runFTSMigration(db: BetterDb): Promise<void> {
  console.log('[FTS Migration] Starting FTS5 migration...')

  // Check if migration already ran
  const checkResult = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'").get() as
    | { name: string }
    | undefined

  if (checkResult) {
    console.log('[FTS Migration] FTS5 table already exists, skipping migration')
    return
  }

  try {
    // Create FTS5 virtual table for CVE descriptions
    db.exec(`
      CREATE VIRTUAL TABLE cves_fts USING fts5(
        id,
        description,
        content='cves',
        content_rowid='rowid'
      )
    `)

    console.log('[FTS Migration] Created FTS5 virtual table')

    // Create indexes for FTS table
    db.exec('CREATE INDEX IF NOT EXISTS idx_cves_fts_id ON cves_fts(id)')

    // Populate FTS table with existing data
    const populateResult = db
      .prepare(
        `
      INSERT INTO cves_fts(rowid, id, description)
      SELECT rowid, id, description FROM cves WHERE description IS NOT NULL
    `,
      )
      .run()

    console.log(`[FTS Migration] Populated FTS5 table with ${populateResult.changes} rows`)

    // Create triggers to keep FTS table in sync
    // Trigger for INSERT
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS cves_fts_insert AFTER INSERT ON cves
      BEGIN
        INSERT INTO cves_fts(rowid, id, description)
        VALUES (NEW.rowid, NEW.id, NEW.description);
      END
    `)

    // Trigger for UPDATE
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS cves_fts_update AFTER UPDATE ON cves
      BEGIN
        UPDATE cves_fts
        SET description = NEW.description
        WHERE rowid = NEW.rowid;
      END
    `)

    // Trigger for DELETE
    db.exec(`
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
  db: BetterDb,
  query: string,
  limit = 100,
  offset = 0,
): Array<{ id: string; rank: number }> {
  // Use FTS5 search with BM25 ranking
  const results = db
    .prepare(
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
    )
    .all(query, limit, offset) as Array<{ id: string; search_rank: number }>

  const cves: Array<{ id: string; rank: number }> = []

  for (const cve of results) {
    cves.push({
      id: cve.id,
      rank: cve.search_rank,
    })
  }

  return cves
}

/**
 * Check if FTS5 is available
 *
 * @param db The SQLite database instance
 * @returns true if FTS5 table exists
 */
export function isFTSAvailable(db: BetterDb): boolean {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'").get() as
    | { name: string }
    | undefined
  return result !== undefined
}

/**
 * Get FTS5 statistics
 *
 * @param db The SQLite database instance
 * @returns Statistics about the FTS5 index
 */
export function getFTSStats(db: BetterDb): {
  indexedCount: number
  totalCount: number
} {
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM cves').get() as { count: number } | undefined
  const ftsRow = db.prepare('SELECT COUNT(*) as count FROM cves_fts').get() as { count: number } | undefined

  const total = totalRow?.count ?? 0
  const indexed = ftsRow?.count ?? 0

  return {
    indexedCount: indexed,
    totalCount: total,
  }
}
