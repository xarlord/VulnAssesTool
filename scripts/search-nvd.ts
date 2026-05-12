/**
 * NVD Database Search Script
 *
 * Usage:
 *   npx tsx scripts/search-nvd.ts CVE-2024-12345
 *   npx tsx scripts/search-nvd.ts "buffer overflow"
 *   npx tsx scripts/search-nvd.ts log4j
 */

import initSqlJs from 'sql.js'
import * as fs from 'fs'
import * as path from 'path'

async function getDatabasePath(): Promise<string> {
  return path.join(process.env.APPDATA || process.env.HOME || '.', 'vuln-assess-tool', 'nvd-data.db')
}

async function main() {
  const query = process.argv[2]

  if (!query) {
    console.log('Usage: npx tsx scripts/search-nvd.ts <search-term>')
    console.log('Examples:')
    console.log('  npx tsx scripts/search-nvd.ts CVE-2024-12345')
    console.log('  npx tsx scripts/search-nvd.ts "buffer overflow"')
    console.log('  npx tsx scripts/search-nvd.ts log4j')
    process.exit(1)
  }

  // Initialize SQL.js
  const sqlJs = await initSqlJs({})

  // Load database
  const dbPath = await getDatabasePath()
  if (!fs.existsSync(dbPath)) {
    console.error('Database not found. Run sync first: npx tsx scripts/sync-nvd-db.ts --delta')
    process.exit(1)
  }

  const fileBuffer = fs.readFileSync(dbPath)
  const db = new sqlJs.Database(fileBuffer)

  console.log(`\nSearching for: "${query}"\n`)

  // Check if it's a CVE ID search
  const cvePattern = /^CVE-\d{4}-\d{4,7}$/i
  const isCveId = cvePattern.test(query)

  interface SearchResult {
    id: unknown
    description: unknown
    score: unknown
    severity: unknown
    published: unknown
  }

  let results: SearchResult[] = []

  if (isCveId) {
    // Exact CVE ID search
    const sql = `SELECT id, description, cvss_v31_score, cvss_v31_severity, published_at
                 FROM cves WHERE id = ?`
    const result = db.exec(sql, [query.toUpperCase()])
    if (result.length > 0 && result[0].values.length > 0) {
      results = result[0].values.map((row) => ({
        id: row[0] as string,
        description: row[1] as string,
        score: row[2] as number | null,
        severity: row[3] as string | null,
        published: row[4] as string | null,
      }))
    }
  } else {
    // Text search in descriptions
    const searchPattern = `%${query}%`
    const sql = `SELECT id, description, cvss_v31_score, cvss_v31_severity, published_at
                 FROM cves
                 WHERE description LIKE ? OR id LIKE ?
                 ORDER BY cvss_v31_score DESC NULLS LAST
                 LIMIT 50`
    const result = db.exec(sql, [searchPattern, searchPattern])
    if (result.length > 0) {
      results = result[0].values.map((row) => ({
        id: row[0] as string,
        description: row[1] as string,
        score: row[2] as number | null,
        severity: row[3] as string | null,
        published: row[4] as string | null,
      }))
    }
  }

  db.close()

  if (results.length === 0) {
    console.log('No results found.')
    return
  }

  console.log(`Found ${results.length} result(s):\n`)

  results.forEach((r, i) => {
    console.log(`--- ${i + 1}. ${r.id} ---`)
    console.log(`Severity: ${r.severity || 'N/A'} (${r.score || 'N/A'})`)
    console.log(`Published: ${r.published || 'N/A'}`)
    console.log(
      `Description: ${(r.description || '').substring(0, 200)}${(r.description || '').length > 200 ? '...' : ''}`,
    )
    console.log('')
  })
}

main().catch(console.error)
