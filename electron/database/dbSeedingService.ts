/**
 * Database Seeding Service
 *
 * Manages:
 * - First-run detection
 * - Pre-seeded database distribution
 * - Background historical sync triggering
 * - Download/extraction of pre-built databases
 *
 * Hybrid Seeding Strategy:
 * 1. Pre-seed recent 2 years (2024-2025) in application bundle
 * 2. Detect first-run and trigger background sync for historical data (1999-2023)
 * 3. Track database version to know when updates are needed
 */

import type { Database } from 'sql.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as https from 'node:https'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { createWriteStream, createReadStream } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import {
  DbVersionManager,
  createDbVersionManager,
  SEED_VERSIONS,
  getCurrentBuildDate,
  type DatabaseVersion,
} from './dbVersionManager.js'
import { NvdBulkImporter, createNvdBulkImporter, type ImportProgress, type ImportResult } from './nvdBulkImporter.js'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Seeding status
 */
export type SeedingStatus = 'idle' | 'checking' | 'downloading' | 'extracting' | 'importing' | 'complete' | 'error'

/**
 * First-run state
 */
export type FirstRunState = 'first_run' | 'has_seed' | 'has_full_data' | 'needs_update' | 'incompatible'

/**
 * Seeding progress information
 */
export interface SeedingProgress {
  status: SeedingStatus
  phase: 'checking' | 'downloading' | 'extracting' | 'importing' | 'background_sync' | 'complete' | 'error'
  percentComplete: number
  bytesDownloaded: number
  totalBytes: number
  downloadSpeed: number // bytes per second
  estimatedTimeRemainingSec: number
  cvesImported: number
  totalCves: number
  currentYear: number | null
  yearsCompleted: number[]
  yearsRemaining: number[]
  startedAt: string
  lastUpdatedAt: string
  error?: string
  isBackground: boolean
}

/**
 * Seeding options
 */
export interface SeedingOptions {
  /** Force download even if local seed exists */
  forceDownload?: boolean
  /** Skip background historical sync */
  skipBackgroundSync?: boolean
  /** Custom download URL for pre-built database */
  downloadUrl?: string
  /** API key for NVD API */
  apiKey?: string
  /** Progress callback */
  onProgress?: (progress: SeedingProgress) => void
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * Seeding result
 */
export interface SeedingResult {
  success: boolean
  wasDownloaded: boolean
  wasExtraction: boolean
  wasImport: boolean
  backgroundSyncStarted: boolean
  totalCves: number
  yearsImported: number[]
  durationMs: number
  error?: string
}

/**
 * First-run check result
 */
export interface FirstRunCheckResult {
  state: FirstRunState
  version: DatabaseVersion | null
  needsPreSeed: boolean
  needsHistoricalSync: boolean
  needsUpdate: boolean
  seedInfo: {
    hasSeed: boolean
    seedDate: string | null
    cveCount: number
  }
}

/**
 * Pre-built database download options
 */
export interface PrebuiltDbOptions {
  version: string
  downloadUrl: string
  checksum: string
  sizeBytes: number
  cveCount: number
  seedDate: string
}

// ============================================================================
// Constants
// ============================================================================

const BACKGROUND_SYNC_STATE_KEY = 'background_sync_state'

// Default download URLs for pre-built databases
const DEFAULT_PREBUILT_DB_URLS: Record<string, string> = {
  '2.0.0-20250224': 'https://github.com/example/vuln-assess-tool/releases/download/v2.0.0/nvd-seed-20250224.db.gz',
}

// Current pre-built database info
const CURRENT_PREBUILT: PrebuiltDbOptions = {
  version: SEED_VERSIONS.LATEST,
  downloadUrl: DEFAULT_PREBUILT_DB_URLS[SEED_VERSIONS.LATEST] || '',
  checksum: '', // SHA-256 checksum for verification
  sizeBytes: 0, // Approximate size
  cveCount: 60000, // Approximate CVEs for 2024-2025
  seedDate: '2025-02-24',
}

// ============================================================================
// DbSeedingService Class
// ============================================================================

/**
 * Database Seeding Service
 *
 * Handles first-run detection, pre-seeding, and background sync management
 */
export class DbSeedingService {
  private db: Database
  private dbPath: string
  private versionManager: DbVersionManager
  private bulkImporter: NvdBulkImporter | null = null
  private progress: SeedingProgress
  private startTime: number = 0

  constructor(db: Database, dbPath: string, apiKey?: string) {
    this.db = db
    this.dbPath = dbPath
    this.versionManager = createDbVersionManager(db)

    if (apiKey) {
      this.bulkImporter = createNvdBulkImporter(db, apiKey)
    }

    this.progress = this.createInitialProgress()
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Check first-run state
   */
  checkFirstRun(): FirstRunCheckResult {
    const version = this.versionManager.getVersion()
    const seedInfo = this.versionManager.getSeedInfo()
    const isFirstRun = this.versionManager.isFirstRun()
    const isCompatible = this.versionManager.isCompatible()
    const needsUpdate = this.versionManager.needsUpdate(CURRENT_PREBUILT.version, CURRENT_PREBUILT.seedDate)

    let state: FirstRunState
    let needsPreSeed = false
    let needsHistoricalSync = false

    if (!isCompatible) {
      state = 'incompatible'
      needsPreSeed = true
    } else if (isFirstRun) {
      state = 'first_run'
      needsPreSeed = true
      needsHistoricalSync = true
    } else if (needsUpdate) {
      state = 'needs_update'
      needsPreSeed = false // Optional update
      needsHistoricalSync = seedInfo.needsHistoricalSync
    } else if (seedInfo.needsHistoricalSync) {
      state = 'has_seed'
      needsHistoricalSync = true
    } else {
      state = 'has_full_data'
    }

    return {
      state,
      version: isFirstRun ? null : version,
      needsPreSeed,
      needsHistoricalSync,
      needsUpdate,
      seedInfo,
    }
  }

  /**
   * Check if background sync is in progress
   */
  isBackgroundSyncInProgress(): boolean {
    const state = this.getBackgroundSyncState()
    return state?.status === 'syncing'
  }

  /**
   * Get background sync state
   */
  getBackgroundSyncState(): {
    status: 'idle' | 'syncing' | 'paused' | 'complete' | 'error'
    startedAt?: string
    yearsCompleted: number[]
    yearsRemaining: number[]
    lastError?: string
  } | null {
    try {
      const result = this.db.exec('SELECT value FROM metadata WHERE key = ?', [BACKGROUND_SYNC_STATE_KEY])

      if (result.length > 0 && result[0].values.length > 0) {
        return JSON.parse(result[0].values[0][0] as string)
      }
    } catch {
      // Ignore errors
    }
    return null
  }

  /**
   * Start seeding process
   *
   * This will:
   * 1. Check if pre-built database download is available
   * 2. Download and extract if needed
   * 3. Import seed data if building locally
   * 4. Start background historical sync if needed
   */
  async startSeeding(options: SeedingOptions = {}): Promise<SeedingResult> {
    this.startTime = Date.now()
    this.progress = this.createInitialProgress()
    this.progress.status = 'checking'
    this.progress.phase = 'checking'
    this.updateProgress(options)

    const result: SeedingResult = {
      success: true,
      wasDownloaded: false,
      wasExtraction: false,
      wasImport: false,
      backgroundSyncStarted: false,
      totalCves: 0,
      yearsImported: [],
      durationMs: 0,
    }

    try {
      // Check if we need to seed
      const firstRunCheck = this.checkFirstRun()

      if (!firstRunCheck.needsPreSeed && !options.forceDownload) {
        // Already seeded, check for historical sync
        if (firstRunCheck.needsHistoricalSync && !options.skipBackgroundSync) {
          this.startBackgroundSync(options)
          result.backgroundSyncStarted = true
        }

        result.totalCves = firstRunCheck.seedInfo.cveCount
        return result
      }

      // Try to download pre-built database first
      const downloadUrl = options.downloadUrl || CURRENT_PREBUILT.downloadUrl

      if (downloadUrl && !options.signal?.aborted) {
        this.progress.status = 'downloading'
        this.progress.phase = 'downloading'
        this.updateProgress(options)

        const downloadResult = await this.downloadPrebuiltDatabase(downloadUrl, options)

        if (downloadResult.success) {
          result.wasDownloaded = true
          result.wasExtraction = true
          result.totalCves = downloadResult.cveCount || CURRENT_PREBUILT.cveCount

          // Record the seed
          this.versionManager.recordSeed(CURRENT_PREBUILT.version, result.totalCves, CURRENT_PREBUILT.seedDate)
        } else if (downloadResult.error) {
          // Download failed, fall back to local build
          console.warn('Pre-built database download failed, building locally:', downloadResult.error)
          result.wasDownloaded = false
        }
      }

      // If download didn't happen or failed, build locally
      if (!result.wasDownloaded && !options.signal?.aborted) {
        this.progress.status = 'importing'
        this.progress.phase = 'importing'
        this.updateProgress(options)

        const importResult = await this.importRecentYears(options)

        result.wasImport = true
        result.totalCves = importResult.imported
        result.yearsImported = importResult.yearsProcessed

        // Record the seed
        this.versionManager.recordSeed(
          SEED_VERSIONS.LATEST,
          result.totalCves,
          getCurrentBuildDate().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
        )
      }

      // Start background historical sync if needed
      if (!options.skipBackgroundSync && !options.signal?.aborted) {
        const seedInfo = this.versionManager.getSeedInfo()
        if (seedInfo.needsHistoricalSync) {
          this.startBackgroundSync(options)
          result.backgroundSyncStarted = true
        }
      }

      this.progress.status = 'complete'
      this.progress.phase = 'complete'
      this.progress.percentComplete = 100
      this.updateProgress(options)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (options.signal?.aborted) {
        this.progress.status = 'error'
        this.progress.error = 'Cancelled'
      } else {
        this.progress.status = 'error'
        this.progress.error = errorMessage
        result.success = false
        result.error = errorMessage
      }
    }

    result.durationMs = Date.now() - this.startTime
    return result
  }

  /**
   * Start background historical sync
   */
  startBackgroundSync(options: SeedingOptions = {}): void {
    const yearsToSync = this.getHistoricalYearsToSync()

    if (yearsToSync.length === 0) {
      return
    }

    // Save background sync state
    this.saveBackgroundSyncState({
      status: 'syncing',
      startedAt: new Date().toISOString(),
      yearsCompleted: [],
      yearsRemaining: yearsToSync,
    })

    // Start background sync (non-blocking)
    this.runBackgroundSync(yearsToSync, options).catch((error) => {
      console.error('Background sync error:', error)
      this.saveBackgroundSyncState({
        status: 'error',
        yearsCompleted: [],
        yearsRemaining: yearsToSync,
        lastError: error instanceof Error ? error.message : 'Unknown error',
      })
    })
  }

  /**
   * Get current progress
   */
  getProgress(): SeedingProgress {
    return { ...this.progress }
  }

  /**
   * Get pre-built database information
   */
  getPrebuiltDbInfo(): PrebuiltDbOptions {
    return { ...CURRENT_PREBUILT }
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  /**
   * Download pre-built database
   */
  private async downloadPrebuiltDatabase(
    url: string,
    options: SeedingOptions,
  ): Promise<{ success: boolean; cveCount?: number; error?: string }> {
    const tempPath = `${this.dbPath}.download`
    const gzipPath = `${this.dbPath}.gz`

    try {
      // Download the gzipped database
      await this.downloadFile(url, gzipPath, options)

      if (options.signal?.aborted) {
        return { success: false, error: 'Cancelled' }
      }

      // Extract the database
      this.progress.status = 'extracting'
      this.progress.phase = 'extracting'
      this.updateProgress(options)

      await this.extractGzip(gzipPath, tempPath)

      if (options.signal?.aborted) {
        return { success: false, error: 'Cancelled' }
      }

      // Verify the extracted database
      const stats = fs.statSync(tempPath)
      if (stats.size < 1000) {
        throw new Error('Downloaded file is too small, likely corrupted')
      }

      // Replace the current database with the downloaded one
      // Create backup first
      if (fs.existsSync(this.dbPath)) {
        fs.copyFileSync(this.dbPath, `${this.dbPath}.backup`)
      }

      fs.renameSync(tempPath, this.dbPath)

      // Clean up
      fs.unlinkSync(gzipPath)

      return { success: true, cveCount: CURRENT_PREBUILT.cveCount }
    } catch (error) {
      // Clean up temp files
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
        if (fs.existsSync(gzipPath)) fs.unlinkSync(gzipPath)
      } catch {
        // Ignore cleanup errors
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Download failed',
      }
    }
  }

  /**
   * Download a file with progress tracking
   */
  private async downloadFile(url: string, destPath: string, options: SeedingOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = createWriteStream(destPath)
      let downloadedBytes = 0
      let totalBytes = 0
      const downloadStart = Date.now()

      const request = https.get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            file.close()
            this.downloadFile(redirectUrl, destPath, options).then(resolve).catch(reject)
            return
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`))
          return
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10)
        this.progress.totalBytes = totalBytes

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length
          this.progress.bytesDownloaded = downloadedBytes

          // Calculate speed
          const elapsed = (Date.now() - downloadStart) / 1000
          this.progress.downloadSpeed = elapsed > 0 ? downloadedBytes / elapsed : 0

          // Estimate remaining time
          if (this.progress.downloadSpeed > 0 && totalBytes > 0) {
            const remainingBytes = totalBytes - downloadedBytes
            this.progress.estimatedTimeRemainingSec = remainingBytes / this.progress.downloadSpeed
          }

          // Calculate percentage
          this.progress.percentComplete = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0

          this.updateProgress(options)
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close()
          resolve()
        })
      })

      request.on('error', (error) => {
        file.close()
        try {
          fs.unlinkSync(destPath)
        } catch {
          /* ignore */
        }
        reject(error)
      })

      // Handle abort signal
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          request.destroy()
          file.close()
          try {
            fs.unlinkSync(destPath)
          } catch {
            /* ignore */
          }
          reject(new Error('Download cancelled'))
        })
      }
    })
  }

  /**
   * Extract a gzip file
   */
  private async extractGzip(gzipPath: string, destPath: string): Promise<void> {
    await pipeline(createReadStream(gzipPath), createGunzip(), createWriteStream(destPath))
  }

  /**
   * Import recent years (2024-2025) for pre-seeding
   */
  private async importRecentYears(options: SeedingOptions): Promise<ImportResult> {
    if (!this.bulkImporter) {
      this.bulkImporter = createNvdBulkImporter(this.db, options.apiKey)
    }

    const currentYear = new Date().getFullYear()
    const startYear = Math.max(currentYear - 1, 2024) // 2024 or current year - 1

    return this.bulkImporter.startImport({
      startYear,
      endYear: currentYear,
      batchSize: 1000,
      apiKey: options.apiKey,
      skipExisting: true,
      signal: options.signal,
      onProgress: (importProgress: ImportProgress) => {
        this.progress.cvesImported = importProgress.cvesImported
        this.progress.totalCves = importProgress.cvesImported + importProgress.cvesSkipped
        this.progress.currentYear = importProgress.currentYear || null
        this.progress.percentComplete = importProgress.percentComplete
        this.progress.estimatedTimeRemainingSec = importProgress.estimatedTimeRemainingSec
        this.updateProgress(options)
      },
    })
  }

  /**
   * Run background historical sync
   */
  private async runBackgroundSync(years: number[], options: SeedingOptions): Promise<void> {
    if (!this.bulkImporter) {
      this.bulkImporter = createNvdBulkImporter(this.db, options.apiKey)
    }

    const completed: number[] = []
    const state = this.getBackgroundSyncState()
    const startFrom = state?.yearsCompleted?.length || 0

    this.progress.isBackground = true
    this.progress.phase = 'background_sync'
    this.progress.yearsRemaining = years
    this.updateProgress(options)

    for (let i = startFrom; i < years.length; i++) {
      // Check if we should continue
      const currentState = this.getBackgroundSyncState()
      if (currentState?.status === 'paused') {
        break
      }

      const year = years[i]

      try {
        await this.bulkImporter.startImport({
          startYear: year,
          endYear: year,
          batchSize: 1000,
          apiKey: options.apiKey,
          skipExisting: true,
          onProgress: (importProgress) => {
            this.progress.currentYear = year
            this.progress.cvesImported = importProgress.cvesImported
            this.progress.percentComplete = ((i + 1) / years.length) * 100
            this.updateProgress(options)
          },
        })

        completed.push(year)
        this.progress.yearsCompleted = [...completed]
        this.progress.yearsRemaining = years.filter((y) => !completed.includes(y))

        // Update state
        this.saveBackgroundSyncState({
          status: 'syncing',
          startedAt: state?.startedAt || new Date().toISOString(),
          yearsCompleted: completed,
          yearsRemaining: this.progress.yearsRemaining,
        })

        // Small delay between years to avoid overwhelming the API
        await sleep(1000)
      } catch (error) {
        console.error(`Failed to sync year ${year}:`, error)
        // Continue with next year
      }
    }

    // Mark as complete
    this.saveBackgroundSyncState({
      status: 'complete',
      startedAt: state?.startedAt,
      yearsCompleted: completed,
      yearsRemaining: [],
    })

    // Record sync
    this.versionManager.recordSync(new Date().toISOString())
  }

  /**
   * Get historical years that need syncing
   */
  private getHistoricalYearsToSync(): number[] {
    const years: number[] = []

    // Start from 2023 (before pre-seed years 2024-2025)
    for (let year = 2023; year >= SEED_VERSIONS.HISTORICAL_START_YEAR; year--) {
      years.push(year)
    }

    return years
  }

  /**
   * Save background sync state
   */
  private saveBackgroundSyncState(state: {
    status: 'idle' | 'syncing' | 'paused' | 'complete' | 'error'
    startedAt?: string
    yearsCompleted: number[]
    yearsRemaining: number[]
    lastError?: string
  }): void {
    this.db.run(
      `
      INSERT INTO metadata (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
      [BACKGROUND_SYNC_STATE_KEY, JSON.stringify(state)],
    )
  }

  /**
   * Update progress and call callback
   */
  private updateProgress(options: SeedingOptions): void {
    this.progress.lastUpdatedAt = new Date().toISOString()
    options.onProgress?.(this.getProgress())
  }

  /**
   * Create initial progress state
   */
  private createInitialProgress(): SeedingProgress {
    return {
      status: 'idle',
      phase: 'checking',
      percentComplete: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      downloadSpeed: 0,
      estimatedTimeRemainingSec: 0,
      cvesImported: 0,
      totalCves: 0,
      currentYear: null,
      yearsCompleted: [],
      yearsRemaining: [],
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      isBackground: false,
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a database seeding service instance
 */
export function createDbSeedingService(db: Database, dbPath: string, apiKey?: string): DbSeedingService {
  return new DbSeedingService(db, dbPath, apiKey)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get bundled seed database path (for pre-seeded app bundle)
 */
export function getBundledSeedPath(): string | null {
  // In production, the seed database is bundled with the app
  // This path is relative to the app resources
  const seedPaths = [
    path.join(process.resourcesPath || '', 'nvd-seed.db'),
    path.join(process.resourcesPath || '', 'seed', 'nvd-seed.db'),
    path.join(__dirname, '..', '..', 'resources', 'nvd-seed.db'),
  ]

  for (const seedPath of seedPaths) {
    if (fs.existsSync(seedPath)) {
      return seedPath
    }
  }

  return null
}

/**
 * Check if bundled seed exists
 */
export function hasBundledSeed(): boolean {
  return getBundledSeedPath() !== null
}

/**
 * Copy bundled seed to user data directory
 */
export function copyBundledSeed(destPath: string): boolean {
  const seedPath = getBundledSeedPath()

  if (!seedPath) {
    return false
  }

  try {
    // Ensure destination directory exists
    const destDir = path.dirname(destPath)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    fs.copyFileSync(seedPath, destPath)
    return true
  } catch (error) {
    console.error('Failed to copy bundled seed:', error)
    return false
  }
}
