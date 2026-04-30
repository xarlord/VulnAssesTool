/**
 * NVD Bulk Importer for Full CVE Database Integration
 *
 * Efficiently imports 250,000+ CVEs from 1999 to present with:
 * - Chunked import (1000 CVEs per batch) to balance memory and performance
 * - Progress tracking with callbacks (percentage, CVE count, ETA)
 * - Resume capability (persists state to track last imported year/CVE)
 * - Error recovery (logs and skips problematic records)
 * - Duplicate detection and handling
 * - Cancellation support via AbortSignal
 *
 * Integration Points:
 * - Uses NvdApiV2Client for fetching CVEs from NVD API
 * - Uses NvdDataImporter for database operations
 * - Leverages composite indexes for efficient bulk inserts
 */

import type { Database } from 'sql.js'
import {
  NvdApiV2Client,
  createNvdApiV2Client,
  getAvailableYearsForDownload,
  type NvdCveV2,
  type NvdDownloadProgress,
} from './nvd/nvdApiV2Client.js'
import {
  NvdDataImporter,
  createNvdDataImporter,
  type ImportProgress as DataImportProgress,
} from './nvd/nvdDataImporter.js'

// Configuration constants
const DEFAULT_BATCH_SIZE = 1000 // CVEs per batch for database import
const DEFAULT_START_YEAR = 1999 // NVD started in 1999
const STATE_KEY_PREFIX = 'bulk_import_'
const MAX_ERRORS_BEFORE_ABORT = 100 // Abort if too many consecutive errors

/**
 * Import progress information
 */
export interface ImportProgress {
  phase: 'initializing' | 'downloading' | 'importing' | 'indexing' | 'complete' | 'error' | 'cancelled'
  currentYear: number
  totalYears: number
  yearsCompleted: number
  cvesImported: number
  cvesSkipped: number
  cvesFailed: number
  percentComplete: number
  estimatedTimeRemainingSec: number
  currentBatch: number
  totalBatches: number
  downloadProgress: NvdDownloadProgress | null
  importProgress: DataImportProgress | null
  startedAt: string
  lastUpdatedAt: string
  errors: ImportError[]
}

/**
 * Import error information
 */
export interface ImportError {
  timestamp: string
  cveId?: string
  year?: number
  message: string
  recoverable: boolean
}

/**
 * Bulk import options
 */
export interface BulkImportOptions {
  startYear?: number // Default: 1999
  endYear?: number // Default: current year
  batchSize?: number // Default: 1000
  apiKey?: string // NVD API key for higher rate limits
  onProgress?: (progress: ImportProgress) => void
  onError?: (error: ImportError) => void
  signal?: AbortSignal
  resume?: boolean // Resume from last position
  skipExisting?: boolean // Skip CVEs that already exist
  updateExisting?: boolean // Update existing CVEs
  concurrency?: number // Parallel download concurrency (default: 3)
}

/**
 * Bulk import result
 */
export interface ImportResult {
  success: boolean
  totalCves: number
  imported: number
  skipped: number
  failed: number
  durationMs: number
  cvesPerSecond: number
  errors: ImportError[]
  yearsProcessed: number[]
  yearsFailed: number[]
  cancelled: boolean
}

/**
 * Import state for resume capability
 */
interface ImportState {
  startYear: number
  endYear: number
  currentYear: number
  lastCveId: string | null
  yearsCompleted: number[]
  yearsFailed: number[]
  totalImported: number
  totalSkipped: number
  totalFailed: number
  startedAt: string
  lastUpdatedAt: string
  batchSize: number
}

/**
 * NVD Bulk Importer
 *
 * Handles efficient import of 250,000+ CVEs from NVD database
 */
export class NvdBulkImporter {
  private db: Database
  private apiClient: NvdApiV2Client
  private dataImporter: NvdDataImporter
  private progress: ImportProgress
  private state: ImportState | null = null
  private startTime: number = 0
  private consecutiveErrors: number = 0

  constructor(db: Database, apiKey?: string) {
    this.db = db
    this.apiClient = createNvdApiV2Client(apiKey)
    this.dataImporter = createNvdDataImporter(db)
    this.progress = this.createInitialProgress()
  }

  /**
   * Create initial progress state
   */
  private createInitialProgress(): ImportProgress {
    return {
      phase: 'initializing',
      currentYear: 0,
      totalYears: 0,
      yearsCompleted: 0,
      cvesImported: 0,
      cvesSkipped: 0,
      cvesFailed: 0,
      percentComplete: 0,
      estimatedTimeRemainingSec: 0,
      currentBatch: 0,
      totalBatches: 0,
      downloadProgress: null,
      importProgress: null,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      errors: [],
    }
  }

  /**
   * Set API key for higher rate limits
   */
  setApiKey(apiKey: string): void {
    this.apiClient.setApiKey(apiKey)
  }

  /**
   * Get current progress
   */
  getProgress(): ImportProgress {
    return { ...this.progress }
  }

  /**
   * Start bulk import
   */
  async startImport(options: BulkImportOptions = {}): Promise<ImportResult> {
    this.startTime = Date.now()
    this.consecutiveErrors = 0

    const currentYear = new Date().getFullYear()
    const startYear = options.startYear ?? DEFAULT_START_YEAR
    const endYear = Math.min(options.endYear ?? currentYear, currentYear + 1)

    // Initialize or resume state
    if (options.resume) {
      this.state = this.loadState()
    }

    if (!this.state || !options.resume) {
      this.state = {
        startYear,
        endYear,
        currentYear: startYear,
        lastCveId: null,
        yearsCompleted: [],
        yearsFailed: [],
        totalImported: 0,
        totalSkipped: 0,
        totalFailed: 0,
        startedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
      }
    }

    // Set API key if provided
    if (options.apiKey) {
      this.apiClient.setApiKey(options.apiKey)
    }

    // Set concurrency if provided
    if (options.concurrency) {
      this.apiClient.setConcurrency(options.concurrency)
    }

    // Initialize progress
    const years = getAvailableYearsForDownload(this.state.startYear, this.state.endYear)
    this.progress = this.createInitialProgress()
    this.progress.totalYears = years.length
    this.progress.phase = 'downloading'
    this.progress.startedAt = this.state.startedAt

    const result: ImportResult = {
      success: true,
      totalCves: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
      cvesPerSecond: 0,
      errors: [],
      yearsProcessed: [],
      yearsFailed: [],
      cancelled: false,
    }

    try {
      // Process each year
      for (const year of years) {
        // Check for cancellation
        if (options.signal?.aborted) {
          this.progress.phase = 'cancelled'
          result.cancelled = true
          this.saveState()
          break
        }

        // Skip already completed years
        if (this.state.yearsCompleted.includes(year)) {
          continue
        }

        this.progress.currentYear = year
        this.state.currentYear = year

        try {
          const yearResult = await this.importYear(year, options)

          result.totalCves += yearResult.totalCves
          result.imported += yearResult.imported
          result.skipped += yearResult.skipped
          result.failed += yearResult.failed

          this.state.yearsCompleted.push(year)
          this.state.totalImported += yearResult.imported
          this.state.totalSkipped += yearResult.skipped
          this.state.totalFailed += yearResult.failed

          result.yearsProcessed.push(year)
          this.progress.yearsCompleted = this.state.yearsCompleted.length

          // Reset consecutive errors on success
          this.consecutiveErrors = 0

          // Save state for resume
          this.saveState()
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'

          // Check if cancelled
          if (options.signal?.aborted) {
            this.progress.phase = 'cancelled'
            result.cancelled = true
            this.saveState()
            break
          }

          // Log error
          const importError: ImportError = {
            timestamp: new Date().toISOString(),
            year,
            message: errorMessage,
            recoverable: true,
          }

          this.progress.errors.push(importError)
          result.errors.push(importError)
          options.onError?.(importError)

          this.state.yearsFailed.push(year)
          result.yearsFailed.push(year)
          this.consecutiveErrors++

          // Abort if too many consecutive errors
          if (this.consecutiveErrors >= MAX_ERRORS_BEFORE_ABORT) {
            const abortError: ImportError = {
              timestamp: new Date().toISOString(),
              message: `Aborting: ${MAX_ERRORS_BEFORE_ABORT} consecutive errors`,
              recoverable: false,
            }
            this.progress.errors.push(abortError)
            result.errors.push(abortError)
            result.success = false
            this.progress.phase = 'error'
            this.saveState()
            break
          }

          // Continue to next year
          continue
        }

        // Update progress
        this.updateProgress(options)
      }

      // Finalize
      if (!result.cancelled && this.progress.phase !== 'error') {
        this.progress.phase = 'complete'
        this.progress.percentComplete = 100
      }

      // Clear saved state on successful completion
      if (this.progress.phase === 'complete') {
        this.clearState()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      result.success = false

      const importError: ImportError = {
        timestamp: new Date().toISOString(),
        message: `Fatal error: ${errorMessage}`,
        recoverable: false,
      }

      this.progress.errors.push(importError)
      result.errors.push(importError)
      this.progress.phase = 'error'

      this.saveState()
    }

    // Calculate final statistics
    result.durationMs = Date.now() - this.startTime
    result.cvesPerSecond = result.durationMs > 0 ? result.imported / (result.durationMs / 1000) : 0

    this.progress.lastUpdatedAt = new Date().toISOString()
    options.onProgress?.(this.getProgress())

    return result
  }

  /**
   * Import CVEs for a specific year
   */
  private async importYear(
    year: number,
    options: BulkImportOptions,
  ): Promise<{
    totalCves: number
    imported: number
    skipped: number
    failed: number
  }> {
    const result = {
      totalCves: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
    }

    // Fetch CVEs for the year
    const fetchResult = await this.apiClient.fetchYear({
      year,
      apiKey: options.apiKey,
      useCache: true,
      signal: options.signal,
      onProgress: (downloadProgress) => {
        this.progress.downloadProgress = downloadProgress
        this.updateProgress(options)
      },
    })

    result.totalCves = fetchResult.cves.length

    if (fetchResult.cves.length === 0) {
      return result
    }

    // Import CVEs in batches
    const batchSize = this.state?.batchSize ?? options.batchSize ?? DEFAULT_BATCH_SIZE
    const totalBatches = Math.ceil(fetchResult.cves.length / batchSize)

    this.progress.phase = 'importing'
    this.progress.totalBatches = totalBatches

    for (let i = 0; i < fetchResult.cves.length; i += batchSize) {
      // Check for cancellation
      if (options.signal?.aborted) {
        throw new Error('Import cancelled')
      }

      const batch = fetchResult.cves.slice(i, Math.min(i + batchSize, fetchResult.cves.length))
      this.progress.currentBatch = Math.floor(i / batchSize) + 1

      // Detect and filter duplicates
      const filteredBatch = this.filterDuplicates(batch, options)

      // Import batch
      const importResult = await this.dataImporter.importCves(filteredBatch.cves, {
        batchSize: batch.length,
        skipExisting: options.skipExisting,
        updateExisting: options.updateExisting,
        signal: options.signal,
        onProgress: (importProgress) => {
          this.progress.importProgress = importProgress
          this.updateProgress(options)
        },
      })

      result.imported += importResult.importedCves
      result.skipped += filteredBatch.skipped + importResult.skippedCves
      result.failed += importResult.failedCves

      // Track last CVE ID for resume capability
      if (batch.length > 0) {
        this.state!.lastCveId = batch[batch.length - 1].id
      }

      // Handle import errors
      for (const error of importResult.errors) {
        const importError: ImportError = {
          timestamp: new Date().toISOString(),
          year,
          message: error,
          recoverable: true,
        }

        this.progress.errors.push(importError)
        options.onError?.(importError)
      }

      this.updateProgress(options)
    }

    return result
  }

  /**
   * Filter duplicate CVEs from batch
   */
  private filterDuplicates(cves: NvdCveV2[], options: BulkImportOptions): { cves: NvdCveV2[]; skipped: number } {
    // If updateExisting is true, we don't skip duplicates
    if (options.updateExisting) {
      return { cves, skipped: 0 }
    }

    // Check for existing CVEs in database
    const existingIds = new Set<string>()
    const cvesToCheck = cves.map((c) => c.id)

    // Batch check for existing CVEs
    if (cvesToCheck.length > 0) {
      const placeholders = cvesToCheck.map(() => '?').join(',')
      const result = this.db.exec(`SELECT id FROM cves WHERE id IN (${placeholders})`, cvesToCheck)

      if (result.length > 0) {
        for (const row of result[0].values) {
          existingIds.add(row[0] as string)
        }
      }
    }

    // Filter out duplicates
    const filtered = cves.filter((cve) => !existingIds.has(cve.id))

    return {
      cves: filtered,
      skipped: cves.length - filtered.length,
    }
  }

  /**
   * Update progress and notify callback
   */
  private updateProgress(options: BulkImportOptions): void {
    if (!this.state) return

    // Calculate percentage
    const yearProgress = (this.progress.yearsCompleted / this.progress.totalYears) * 100
    const currentYearPartial = this.progress.downloadProgress?.percentage || 0
    const yearWeight = 100 / this.progress.totalYears
    const partialProgress = (currentYearPartial / 100) * yearWeight

    this.progress.percentComplete = Math.min(100, yearProgress + partialProgress)

    // Update counts
    this.progress.cvesImported = this.state.totalImported
    this.progress.cvesSkipped = this.state.totalSkipped
    this.progress.cvesFailed = this.state.totalFailed

    // Estimate remaining time
    const elapsedMs = Date.now() - this.startTime
    if (this.progress.percentComplete > 0 && this.progress.percentComplete < 100) {
      const totalEstimateMs = elapsedMs / (this.progress.percentComplete / 100)
      this.progress.estimatedTimeRemainingSec = Math.round((totalEstimateMs - elapsedMs) / 1000)
    } else {
      this.progress.estimatedTimeRemainingSec = 0
    }

    this.progress.lastUpdatedAt = new Date().toISOString()
    this.state.lastUpdatedAt = this.progress.lastUpdatedAt

    options.onProgress?.(this.getProgress())
  }

  /**
   * Save import state for resume capability
   */
  private saveState(): void {
    if (!this.state) return

    try {
      const stateKey = `${STATE_KEY_PREFIX}state`
      const stateJson = JSON.stringify(this.state)

      this.db.run(
        `
        INSERT INTO metadata (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `,
        [stateKey, stateJson],
      )
    } catch (error) {
      console.error('Failed to save import state:', error)
    }
  }

  /**
   * Load import state for resume capability
   */
  private loadState(): ImportState | null {
    try {
      const stateKey = `${STATE_KEY_PREFIX}state`
      const result = this.db.exec('SELECT value FROM metadata WHERE key = ?', [stateKey])

      if (result.length > 0 && result[0].values.length > 0) {
        const stateJson = result[0].values[0][0] as string
        return JSON.parse(stateJson) as ImportState
      }
    } catch (error) {
      console.error('Failed to load import state:', error)
    }

    return null
  }

  /**
   * Clear saved import state
   */
  private clearState(): void {
    try {
      const stateKey = `${STATE_KEY_PREFIX}state`
      this.db.run('DELETE FROM metadata WHERE key = ?', [stateKey])
    } catch (error) {
      console.error('Failed to clear import state:', error)
    }
  }

  /**
   * Check if there's a resumable import
   */
  hasResumableImport(): boolean {
    return this.loadState() !== null
  }

  /**
   * Get resumable import info
   */
  getResumableImportInfo(): {
    startYear: number
    endYear: number
    currentYear: number
    yearsCompleted: number
    totalImported: number
    startedAt: string
  } | null {
    const state = this.loadState()

    if (!state) {
      return null
    }

    return {
      startYear: state.startYear,
      endYear: state.endYear,
      currentYear: state.currentYear,
      yearsCompleted: state.yearsCompleted.length,
      totalImported: state.totalImported,
      startedAt: state.startedAt,
    }
  }

  /**
   * Cancel any ongoing import
   */
  cancel(): void {
    this.apiClient.cancel()
    this.progress.phase = 'cancelled'
    this.saveState()
  }

  /**
   * Clear any saved resume state
   */
  resetResumeState(): void {
    this.clearState()
    this.state = null
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalCves: number
    totalCwe: number
    totalCpe: number
    totalRefs: number
  } {
    return this.dataImporter.getStats()
  }

  /**
   * Get API rate limiter status
   */
  getRateLimiterStatus(): {
    queueSize: number
    timeUntilNextRequest: number
  } {
    return this.apiClient.getRateLimiterStatus()
  }
}

/**
 * Create a bulk importer instance
 */
export function createNvdBulkImporter(db: Database, apiKey?: string): NvdBulkImporter {
  return new NvdBulkImporter(db, apiKey)
}

/**
 * Get estimated import duration based on year range
 */
export function estimateImportDuration(
  startYear: number,
  endYear: number,
  hasApiKey: boolean = false,
): {
  estimatedMinutes: number
  estimatedCveCount: number
} {
  const years = endYear - startYear + 1

  // Average CVEs per year (rough estimate based on NVD data)
  // Recent years have more CVEs (~30,000), older years have fewer (~1,000-5,000)
  let estimatedCveCount = 0

  for (let year = startYear; year <= endYear; year++) {
    if (year >= 2020) {
      estimatedCveCount += 30000
    } else if (year >= 2010) {
      estimatedCveCount += 10000
    } else if (year >= 2005) {
      estimatedCveCount += 5000
    } else {
      estimatedCveCount += 2000
    }
  }

  // Rate limits: 5 req/30s without key, 50 req/30s with key
  // Each year requires ~1-15 API calls depending on CVE count
  // With 2000 CVEs per page, years with 30,000 CVEs need 15 requests

  const requestsPerYear = estimatedCveCount / years / 2000
  const totalRequests = requestsPerYear * years

  // Time per request based on rate limit
  const msPerRequest = hasApiKey ? 600 : 6000 // 50/30s = ~0.6s, 5/30s = ~6s
  const downloadTimeMs = totalRequests * msPerRequest

  // Import time: ~1000 CVEs per second on modern hardware
  const importTimeMs = estimatedCveCount

  // Total time with overhead
  const totalTimeMs = downloadTimeMs + importTimeMs + years * 10000 // 10s overhead per year

  return {
    estimatedMinutes: Math.ceil(totalTimeMs / 60000),
    estimatedCveCount,
  }
}

/**
 * Get years available for import
 */
export function getImportYears(startYear: number = DEFAULT_START_YEAR, endYear?: number): number[] {
  return getAvailableYearsForDownload(startYear, endYear)
}
