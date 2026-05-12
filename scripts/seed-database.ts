/**
 * Database Seeding Script for Build Process
 *
 * This script creates a pre-seeded database with recent CVE data (2024-2025)
 * that can be bundled with the application for faster initial setup.
 *
 * Usage:
 *   npx tsx scripts/seed-database.ts
 *   npx tsx scripts/seed-database.ts --years=2024-2025
 *   npx tsx scripts/seed-database.ts --output=./resources/nvd-seed.db
 *   npx tsx scripts/seed-database.ts --api-key=YOUR_KEY
 *
 * The script will:
 * 1. Create a new SQLite database
 * 2. Apply all schema migrations
 * 3. Download CVEs for specified years (default: 2024-2025)
 * 4. Import CVEs into the database
 * 5. Record seed metadata
 * 6. Output the database file
 */

import initSqlJs from 'sql.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { runMigrations, getSchemaVersion } from '../electron/database/migrations/v2SchemaMigration.js'
import { createDbVersionManager, generateVersion, getCurrentBuildDate } from '../electron/database/dbVersionManager.js'
import { createNvdApiV2Client, getAvailableYearsForDownload } from '../electron/database/nvd/nvdApiV2Client.js'
import { createNvdDataImporter } from '../electron/database/nvd/nvdDataImporter.js'

// ============================================================================
// Configuration
// ============================================================================

interface SeedConfig {
  startYear: number
  endYear: number
  outputPath: string
  apiKey?: string
  compress: boolean
  verify: boolean
}

const DEFAULT_CONFIG: SeedConfig = {
  startYear: 2024,
  endYear: new Date().getFullYear(),
  outputPath: './resources/nvd-seed.db',
  compress: true,
  verify: true,
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs(): SeedConfig {
  const args = process.argv.slice(2)
  const config = { ...DEFAULT_CONFIG }

  for (const arg of args) {
    if (arg.startsWith('--years=')) {
      const years = arg.split('=')[1].split('-').map(Number)
      config.startYear = years[0] || DEFAULT_CONFIG.startYear
      config.endYear = years[1] || years[0] || DEFAULT_CONFIG.endYear
    } else if (arg.startsWith('--output=')) {
      config.outputPath = arg.split('=')[1]
    } else if (arg.startsWith('--api-key=')) {
      config.apiKey = arg.split('=')[1]
    } else if (arg === '--no-compress') {
      config.compress = false
    } else if (arg === '--no-verify') {
      config.verify = false
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }
  }

  return config
}

function printUsage(): void {
  console.log(`
Database Seeding Script

Usage:
  npx tsx scripts/seed-database.ts [options]

Options:
  --years=RANGE       Years to seed (e.g., "2024-2025" or "2024")
  --output=PATH       Output file path (default: ./resources/nvd-seed.db)
  --api-key=KEY       NVD API key for faster downloads (50 req/30s vs 5 req/30s)
  --no-compress       Skip gzip compression of output
  --no-verify         Skip verification of imported data
  --help, -h          Show this help message

Examples:
  # Seed recent 2 years (default)
  npx tsx scripts/seed-database.ts

  # Seed specific years
  npx tsx scripts/seed-database.ts --years=2023-2025

  # Use API key for faster downloads
  npx tsx scripts/seed-database.ts --api-key=YOUR_API_KEY

  # Custom output path
  npx tsx scripts/seed-database.ts --output=./build/nvd-seed.db

Environment Variables:
  NVD_API_KEY         NVD API key (alternative to --api-key)
`)
}

// ============================================================================
// Main Script
// ============================================================================

async function main(): Promise<void> {
  const config = parseArgs()

  console.log('=== CVE Database Seeding Script ===\n')
  console.log(`Years: ${config.startYear}-${config.endYear}`)
  console.log(`Output: ${config.outputPath}`)
  console.log(`Compress: ${config.compress}`)
  console.log(`Verify: ${config.verify}`)
  console.log(`API Key: ${config.apiKey ? 'Provided' : 'Not provided'}`)
  console.log('')

  const startTime = Date.now()

  // Initialize SQL.js
  console.log('[1/6] Initializing SQL.js...')
  const sqlJs = await initSqlJs({})
  const db = new sqlJs.Database()

  // Run migrations
  console.log('[2/6] Running schema migrations...')
  runMigrations(db, 0)
  const schemaVersion = getSchemaVersion(db)
  console.log(`      Schema version: ${schemaVersion}`)

  // Initialize API client
  console.log('[3/6] Initializing NVD API client...')
  const apiKey = config.apiKey || process.env.NVD_API_KEY
  const apiClient = createNvdApiV2Client(apiKey)

  // Initialize data importer
  const dataImporter = createNvdDataImporter(db)

  // Download and import CVEs
  console.log('[4/6] Downloading and importing CVEs...')
  const years = getAvailableYearsForDownload(config.startYear, config.endYear)
  let totalCves = 0
  let totalImported = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const year of years) {
    console.log(`\n      Processing year ${year}...`)

    try {
      const result = await apiClient.fetchYear({
        year,
        apiKey,
        useCache: true,
        onProgress: (progress) => {
          const pct = progress.percentage.toFixed(1)
          const downloaded = progress.cvesDownloaded.toLocaleString()
          process.stdout.write(`\r      Downloading: ${pct}% (${downloaded} CVEs)`)
        },
      })

      console.log(`\n      Downloaded ${result.cves.length.toLocaleString()} CVEs`)
      totalCves += result.cves.length

      if (result.cves.length > 0) {
        // Import CVEs
        const importResult = await dataImporter.importCves(result.cves, {
          batchSize: 1000,
          skipExisting: true,
        })

        totalImported += importResult.importedCves
        totalSkipped += importResult.skippedCves
        totalFailed += importResult.failedCves

        console.log(`      Imported: ${importResult.importedCves.toLocaleString()}`)
        console.log(`      Skipped: ${importResult.skippedCves.toLocaleString()}`)
        console.log(`      Failed: ${importResult.failedCves}`)
      }
    } catch (error) {
      console.error(`\n      Error processing year ${year}:`, error)
    }
  }

  // Record seed metadata
  console.log('\n[5/6] Recording seed metadata...')
  const versionManager = createDbVersionManager(db, {
    appVersion: '2.0.0',
    schemaVersion,
    minSchemaVersion: 1,
  })

  const seedDate = getCurrentBuildDate().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
  const version = generateVersion(2, 0, 0, parseInt(getCurrentBuildDate(), 10))

  versionManager.recordSeed(version, totalImported, seedDate)
  versionManager.recordSync(new Date().toISOString())

  console.log(`      Version: ${version}`)
  console.log(`      Seed Date: ${seedDate}`)
  console.log(`      CVE Count: ${totalImported.toLocaleString()}`)

  // Verify database
  if (config.verify) {
    console.log('\n[6/6] Verifying database...')
    const stats = dataImporter.getStats()
    console.log(`      Total CVEs: ${stats.totalCves.toLocaleString()}`)
    console.log(`      Total CPE: ${stats.totalCpe.toLocaleString()}`)
    console.log(`      Total CWE: ${stats.totalCwe.toLocaleString()}`)
    console.log(`      Total References: ${stats.totalRefs.toLocaleString()}`)

    // Verify FTS index
    const ftsResult = db.exec("SELECT COUNT(*) FROM cves_fts WHERE cves_fts MATCH 'vulnerability'")
    const ftsCount = (ftsResult[0]?.values[0]?.[0] as number) || 0
    console.log(`      FTS Index Entries: ${ftsCount.toLocaleString()}`)
  }

  // Save database
  console.log('\nSaving database...')
  const outputDir = path.dirname(config.outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const dbData = db.export()
  const dbBuffer = Buffer.from(dbData)
  fs.writeFileSync(config.outputPath, dbBuffer)

  const fileSizeMb = (dbBuffer.length / (1024 * 1024)).toFixed(2)
  console.log(`      File size: ${fileSizeMb} MB`)

  // Compress if requested
  if (config.compress) {
    console.log('\nCompressing database...')
    const gzip = await import('node:zlib')
    const compressed = gzip.gzipSync(dbBuffer)
    const compressedPath = `${config.outputPath}.gz`
    fs.writeFileSync(compressedPath, compressed)

    const compressedSizeMb = (compressed.length / (1024 * 1024)).toFixed(2)
    const compressionRatio = ((1 - compressed.length / dbBuffer.length) * 100).toFixed(1)
    console.log(`      Compressed size: ${compressedSizeMb} MB (${compressionRatio}% reduction)`)
    console.log(`      Output: ${compressedPath}`)
  }

  // Close database
  db.close()

  // Print summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('\n=== Seeding Complete ===')
  console.log(`Duration: ${duration} seconds`)
  console.log(`CVEs Downloaded: ${totalCves.toLocaleString()}`)
  console.log(`CVEs Imported: ${totalImported.toLocaleString()}`)
  console.log(`CVEs Skipped: ${totalSkipped.toLocaleString()}`)
  console.log(`CVEs Failed: ${totalFailed}`)
  console.log(`Output: ${config.outputPath}`)
}

// Run main function
main().catch((error) => {
  console.error('\nError:', error)
  process.exit(1)
})
