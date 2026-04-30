/**
 * NVD Database Sync Script
 *
 * Run with: npx tsx scripts/sync-nvd-db.ts
 *
 * Options:
 *   --years=2021-2024    Bulk download specific years
 *   --delta              Run delta sync (incremental updates)
 *   --api-key=YOUR_KEY   Use NVD API key for faster requests
 */

import initSqlJs from 'sql.js'
import * as fs from 'fs'
import * as path from 'path'
import { runMigrations, getSchemaVersion } from '../electron/database/migrations/v2SchemaMigration.js'
import { createNvdDeltaSync } from '../electron/database/nvd/nvdDeltaSync.js'
import { createBulkDownloadManager } from '../electron/database/nvd/bulkDownloadManager.js'

// Parse command line args
const args = process.argv.slice(2)
const options = {
  delta: args.includes('--delta'),
  years: args.find((a) => a.startsWith('--years='))?.split('=')[1],
  apiKey: args.find((a) => a.startsWith('--api-key='))?.split('=')[1],
}

async function getDatabasePath(): Promise<string> {
  const userDataPath = path.join(process.env.APPDATA || process.env.HOME || '.', 'vuln-assess-tool')
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }
  return path.join(userDataPath, 'nvd-data.db')
}

async function main() {
  console.log('=== NVD Database Sync Tool ===\n')

  // Initialize SQL.js
  console.log('Initializing SQL.js...')
  const sqlJs = await initSqlJs({})

  // Load or create database
  const dbPath = await getDatabasePath()
  console.log(`Database path: ${dbPath}`)

  let db: any
  if (fs.existsSync(dbPath)) {
    console.log('Loading existing database...')
    const fileBuffer = fs.readFileSync(dbPath)
    db = new sqlJs.Database(fileBuffer)
  } else {
    console.log('Creating new database...')
    db = new sqlJs.Database()
  }

  // Run migrations
  console.log('Running migrations...')
  runMigrations(db, 0)
  const version = getSchemaVersion(db)
  console.log(`Schema version: ${version}`)

  // Save database
  const saveDb = () => {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(dbPath, buffer)
  }

  try {
    if (options.delta) {
      // Delta sync
      console.log('\n--- Starting Delta Sync ---')
      const deltaSync = createNvdDeltaSync(db, options.apiKey)

      const result = await deltaSync.sync({
        forceFullSync: false,
        onProgress: (progress) => {
          console.log(
            `[${progress.phase}] ${progress.percentage.toFixed(1)}% - ` +
              `Fetched: ${progress.cvesFetched}, Added: ${progress.cvesAdded}, Updated: ${progress.cvesUpdated}`,
          )
        },
      })

      console.log('\n--- Delta Sync Complete ---')
      console.log(`Success: ${result.success}`)
      console.log(`CVEs Fetched: ${result.cvesFetched}`)
      console.log(`CVEs Added: ${result.cvesAdded}`)
      console.log(`CVEs Updated: ${result.cvesUpdated}`)
      console.log(`CVEs Skipped: ${result.cvesSkipped}`)
      console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`)
      if (result.errors.length > 0) {
        console.log(`Errors: ${result.errors.join(', ')}`)
      }
    } else if (options.years) {
      // Bulk download by years
      const [startYear, endYear] = options.years.split('-').map(Number)
      console.log(`\n--- Starting Bulk Download (${startYear}-${endYear}) ---`)

      const bulkDownload = createBulkDownloadManager(db, options.apiKey)

      const result = await bulkDownload.startDownload({
        startYear,
        endYear,
        onProgress: (progress) => {
          console.log(
            `[${progress.phase}] ${progress.percentage.toFixed(1)}% - ` +
              `Years: ${progress.completedYears}/${progress.totalYears}, CVEs: ${progress.totalCves}`,
          )
        },
      })

      console.log('\n--- Bulk Download Complete ---')
      console.log(`Success: ${result.success}`)
      console.log(`Completed Years: ${result.completedYears.join(', ')}`)
      console.log(`Total CVEs: ${result.totalCves}`)
      console.log(`Duration: ${(result.durationMs / 1000).toFixed(1)}s`)
      if (result.failedYears.size > 0) {
        console.log('Failed Years:')
        result.failedYears.forEach((error, year) => {
          console.log(`  ${year}: ${error}`)
        })
      }
    } else {
      // Show usage
      console.log('\nUsage:')
      console.log('  npx tsx scripts/sync-nvd-db.ts --delta')
      console.log('  npx tsx scripts/sync-nvd-db.ts --years=2021-2024')
      console.log('  npx tsx scripts/sync-nvd-db.ts --delta --api-key=YOUR_KEY')
      console.log('\nOptions:')
      console.log('  --delta            Run incremental delta sync')
      console.log('  --years=RANGE      Bulk download years (e.g., 2021-2024)')
      console.log('  --api-key=KEY      NVD API key for faster requests (50/30s vs 5/30s)')

      // Show current stats
      const deltaSync = createNvdDeltaSync(db)
      const stats = deltaSync.getStats()
      console.log('\n--- Current Database Stats ---')
      console.log(`Total CVEs: ${stats.totalCves.toLocaleString()}`)
      console.log(`CWE References: ${stats.totalCwe.toLocaleString()}`)
      console.log(`CPE Matches: ${stats.totalCpe.toLocaleString()}`)
      console.log(`References: ${stats.totalRefs.toLocaleString()}`)
      if (stats.oldestCve) {
        console.log(`Oldest CVE: ${stats.oldestCve}`)
      }
      if (stats.newestCve) {
        console.log(`Newest CVE: ${stats.newestCve}`)
      }
    }
  } finally {
    // Save and close
    saveDb()
    db.close()
    console.log('\nDatabase saved.')
  }
}

main().catch(console.error)
