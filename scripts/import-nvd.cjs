#!/usr/bin/env node
/**
 * Import NVD CVE JSON files into the VulnAssesTool SQLite database.
 * Uses better-sqlite3 for maximum import performance.
 *
 * Usage: node scripts/import-nvd.cjs [jsonDir] [dbPath]
 *   jsonDir: Directory containing nvdcve-2.0-YYYY.json files (default: D:\nvd-data)
 *   dbPath: Target SQLite database path (default: %APPDATA%/vuln-assess-tool/nvd-data.db)
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

const jsonDir = process.argv[2] || 'D:\\nvd-data'
const dbPath = process.argv[3] || path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'vuln-assess-tool',
  'nvd-data.db'
)

console.log('NVD CVE Database Importer')
console.log(`JSON source: ${jsonDir}`)
console.log(`Database:    ${dbPath}`)
console.log('')

let Database
try {
  Database = require('better-sqlite3')
} catch {
  console.error('Error: better-sqlite3 not found. Install with: npm install better-sqlite3')
  process.exit(1)
}

// Ensure DB directory exists
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

// Open database
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = OFF')
db.pragma('cache_size = -64000') // 64MB cache
db.pragma('foreign_keys = ON')

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS cves (
    id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    cvss_score REAL,
    cvss_vector TEXT,
    severity TEXT CHECK(severity IN ('NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    published_at TEXT NOT NULL,
    modified_at TEXT NOT NULL,
    source TEXT CHECK(source IN ('NVD', 'OSV')) NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cpe_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cve_id TEXT NOT NULL,
    cpe_text TEXT NOT NULL,
    vulnerable INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "references" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cve_id TEXT NOT NULL,
    url TEXT NOT NULL,
    source TEXT,
    tags TEXT,
    FOREIGN KEY (cve_id) REFERENCES cves(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_status (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL UNIQUE,
    year INTEGER,
    last_sync_at TEXT NOT NULL DEFAULT '',
    last_successful_sync_at TEXT,
    total_cves INTEGER DEFAULT 0,
    cves_synced INTEGER DEFAULT 0,
    last_error TEXT,
    sync_duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'idle',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_cves_severity ON cves(severity);
  CREATE INDEX IF NOT EXISTS idx_cves_cvss_score ON cves(cvss_score);
  CREATE INDEX IF NOT EXISTS idx_cves_published_at ON cves(published_at);
  CREATE INDEX IF NOT EXISTS idx_cpe_matches_cve_id ON cpe_matches(cve_id);
  CREATE INDEX IF NOT EXISTS idx_cpe_matches_cpe_text ON cpe_matches(cpe_text);
  CREATE INDEX IF NOT EXISTS idx_references_cve_id ON "references"(cve_id);
`)

// Prepare statements
const upsertCve = db.prepare(`
  INSERT OR REPLACE INTO cves (id, description, cvss_score, cvss_vector, severity, published_at, modified_at, source)
  VALUES (?, ?, ?, ?, ?, ?, ?, 'NVD')
`)

const insertCpe = db.prepare(`
  INSERT INTO cpe_matches (cve_id, cpe_text, vulnerable)
  VALUES (?, ?, ?)
`)

const insertRef = db.prepare(`
  INSERT INTO "references" (cve_id, url, source, tags)
  VALUES (?, ?, ?, ?)
`)

// Delete existing CPEs and refs for a CVE (before re-insert)
const deleteCpes = db.prepare('DELETE FROM cpe_matches WHERE cve_id = ?')
const deleteRefs = db.prepare('DELETE FROM "references" WHERE cve_id = ?')

/**
 * Parse a single CVE from NVD 2.0 format
 */
function parseCve(item) {
  const cve = item.cve
  if (!cve || !cve.id) return null

  const id = cve.id
  const description = cve.descriptions?.[0]?.value || ''
  const published = cve.published || ''
  const modified = cve.lastModified || ''

  // Extract CVSS
  let cvssScore = null
  let cvssVector = null
  let severity = null

  const metrics = cve.metrics
  if (metrics) {
    const v31 = metrics.cvssMetricV31?.[0]?.cvssData
    const v30 = metrics.cvssMetricV30?.[0]?.cvssData
    const v2 = metrics.cvssMetricV2?.[0]?.cvssData

    if (v31) {
      cvssScore = v31.baseScore
      cvssVector = v31.vectorString
      severity = v31.baseSeverity
    } else if (v30) {
      cvssScore = v30.baseScore
      cvssVector = v30.vectorString
      severity = v30.baseSeverity
    } else if (v2) {
      cvssScore = v2.baseScore
      cvssVector = v2.vectorString
      severity = v2.baseSeverity
    }
  }

  // Extract CPE matches
  const cpes = []
  const configs = cve.configurations || []
  for (const config of configs) {
    const nodes = config.nodes || []
    for (const node of nodes) {
      for (const cpe of (node.cpeMatch || [])) {
        cpes.push({
          cpe_text: cpe.criteria || cpe.cpe23Uri || '',
          vulnerable: cpe.vulnerable !== false ? 1 : 0,
        })
      }
      // Handle children (AND operator)
      for (const child of (node.children || [])) {
        for (const cpe of (child.cpeMatch || [])) {
          cpes.push({
            cpe_text: cpe.criteria || cpe.cpe23Uri || '',
            vulnerable: cpe.vulnerable !== false ? 1 : 0,
          })
        }
      }
    }
  }

  // Extract references
  const refs = []
  for (const ref of (cve.references || [])) {
    refs.push({
      url: ref.url || '',
      source: ref.source || '',
      tags: ref.tags?.join(',') || '',
    })
  }

  return { id, description, cvssScore, cvssVector, severity, published, modified, cpes, refs }
}

/**
 * Import a single CVE with its CPEs and references
 */
const importOne = (cve) => {
  upsertCve.run(cve.id, cve.description, cve.cvssScore, cve.cvssVector, cve.severity, cve.published, cve.modified)
  deleteCpes.run(cve.id)
  deleteRefs.run(cve.id)
  for (const cpe of cve.cpes) {
    insertCpe.run(cve.id, cpe.cpe_text, cpe.vulnerable)
  }
  for (const ref of cve.refs) {
    insertRef.run(cve.id, ref.url, ref.source, ref.tags)
  }
}

/**
 * Import a year's JSON file
 */
function importYear(year) {
  const filePath = path.join(jsonDir, `nvdcve-2.0-${year}.json`)

  if (!fs.existsSync(filePath)) {
    console.log(`  [${year}] File not found, skipping`)
    return { imported: 0, failed: 0 }
  }

  const stat = fs.statSync(filePath)
  process.stdout.write(`  [${year}] Reading ${(stat.size / 1024 / 1024).toFixed(1)}MB...`)
  const startMs = Date.now()

  let json
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    json = JSON.parse(content)
  } catch (err) {
    console.log(` PARSE ERROR: ${err.message}`)
    return { imported: 0, failed: 1 }
  }

  const vulnerabilities = json.vulnerabilities || []
  const total = vulnerabilities.length
  process.stdout.write(` ${total.toLocaleString()} CVEs...`)

  let imported = 0
  let failed = 0

  // Batch import in a transaction per 5000 CVEs
  const BATCH = 5000

  const batchImport = db.transaction((cves) => {
    for (const cve of cves) {
      try {
        importOne(cve)
        imported++
      } catch (err) {
        failed++
        if (failed <= 3) console.error(`\n    Failed: ${cve.id} - ${err.message}`)
      }
    }
  })

  const batch = []
  for (const item of vulnerabilities) {
    const parsed = parseCve(item)
    if (parsed) {
      batch.push(parsed)
      if (batch.length >= BATCH) {
        batchImport(batch)
        batch.length = 0
        process.stdout.write('.')
      }
    }
  }

  // Remaining
  if (batch.length > 0) {
    batchImport(batch)
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
  console.log(` ${imported.toLocaleString()} imported, ${failed} failed (${elapsed}s)`)

  // Update sync_status
  db.prepare(`
    INSERT OR REPLACE INTO sync_status (source, year, last_sync_at, last_successful_sync_at, total_cves, cves_synced, status, sync_duration_ms)
    VALUES ('NVD', ?, datetime('now'), datetime('now'), ?, ?, 'complete', ?)
  `).run(year, total, imported, Date.now() - startMs)

  return { imported, failed }
}

// Main
const years = []
for (let y = 2002; y <= new Date().getFullYear(); y++) years.push(y)

console.log(`Importing years ${years[0]}-${years[years.length - 1]}...\n`)

const totalStart = Date.now()
let totalImported = 0
let totalFailed = 0

for (const year of years) {
  const result = importYear(year)
  totalImported += result.imported
  totalFailed += result.failed
}

const totalElapsed = ((Date.now() - totalStart) / 1000).toFixed(1)

// Update metadata
db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run('last_full_import', new Date().toISOString())
db.prepare("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)").run('total_cves', String(totalImported))

console.log('')
console.log('=== Import Complete ===')
console.log(`Total CVEs imported: ${totalImported.toLocaleString()}`)
console.log(`Total failed:        ${totalFailed}`)
console.log(`Duration:            ${totalElapsed}s`)

// Verify
const count = db.prepare('SELECT COUNT(*) as cnt FROM cves').get()
console.log(`Database CVE count:  ${count.cnt.toLocaleString()}`)
console.log(`Database size:       ${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)}MB`)

db.close()
console.log('\nDatabase saved.')
