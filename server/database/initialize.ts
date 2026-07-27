/**
 * Database Initialization Module
 *
 * Extracts DB init logic from Electron's main process into a standalone module.
 * Initializes database, delta sync, CPE search, and backup service.
 */

import fs from 'node:fs'
import { getDatabase } from './nvdDb.js'
import { createNvdDeltaSync } from './nvd/nvdDeltaSync.js'
import { CPESearch } from './cpeSearch.js'
import { initializeBackupService, type BackupConfig } from '../services/BackupService.js'
import { initializeStorage } from '../services/storage/index.js'
import { getKevService } from '../services/intelligence/KevService.js'
import { getEpssService } from '../services/intelligence/EpssService.js'
import { config } from '../config.js'

let database: ReturnType<typeof getDatabase> | null = null
let deltaSync: ReturnType<typeof createNvdDeltaSync> | null = null
let cpeSearch: CPESearch | null = null

export function getDb() {
  return database
}

export function getDeltaSync() {
  return deltaSync
}

export function getCpeSearch() {
  return cpeSearch
}

export async function initializeDatabase(): Promise<void> {
  try {
    initializeStorage()

    database = getDatabase()
    await database.initialize()

    const dbPath = database.getDbPath?.()
    if (dbPath) {
      const { hasBundledSeed, copyBundledSeed } = await import('./dbSeedingService.js')
      if (hasBundledSeed() && !fs.existsSync(dbPath)) {
        console.log('Bundled seed database found, copying to user data...')
        copyBundledSeed(dbPath)
        await database.initialize()
      }
    }

    const rawDb = database.getRawDb?.()
    if (rawDb) {
      deltaSync = createNvdDeltaSync(rawDb)
      console.log('Delta sync initialized')

      cpeSearch = new CPESearch(rawDb)
      console.log('CPE search initialized')

      const kevService = getKevService(rawDb)
      kevService.initialize().catch((err: unknown) => {
        console.error('[Init] KEV service initialization failed:', err)
      })
      console.log('KEV service initializing')

      // Prime the EPSS singleton against the shared DB. EpssService has no async init (it reads and
      // caches scores in the cves table on demand), but the intelligence routes reach it via a
      // no-arg getEpssService(), which throws unless the singleton was already created with a db —
      // so this call is what makes /api/intelligence/epss/* work in production.
      getEpssService(rawDb)
      console.log('EPSS service initialized')
    }

    if (rawDb) {
      const backupConfig: Partial<BackupConfig> = {
        backupDir: config.BACKUP_DIR,
      }
      const dbFilePath = dbPath || config.DB_PATH
      const getDbBuffer = async () => fs.promises.readFile(dbFilePath)
      initializeBackupService(dbFilePath, getDbBuffer, backupConfig)
      console.log('Backup service initialized')
    }

    console.log('Database initialized successfully')
  } catch (error) {
    console.error('Failed to initialize database:', error)
    throw error
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    if (database) {
      await database.close()
      database = null
      deltaSync = null
      cpeSearch = null
      console.log('Database closed')
    }
  } catch (error) {
    console.error('Failed to close database:', error)
  }
}
