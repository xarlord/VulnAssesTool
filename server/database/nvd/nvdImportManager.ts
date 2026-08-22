/**
 * NVD Import Manager
 *
 * Orchestrates a full/bulk population of the local CVE database from the NVD REST API v2.
 * Consolidated (B1) onto NvdApiV2Client → NvdDataImporter: it fetches each year through the
 * rate-limited REST client and imports the CVEs into the shared v2-schema database. The old
 * feed-file downloader / stream parser / separate bulk database have been retired.
 *
 * This is the entry point behind POST /sync/start and /sync/bulk.
 */

import Database from 'better-sqlite3'
import { NvdApiV2Client, createNvdApiV2Client, type NvdCveV2 } from './nvdApiV2Client.js'
import { createNvdDataImporter } from './nvdDataImporter.js'

type BetterDb = InstanceType<typeof Database>

// A single fetchDateRange caps at 50k CVEs and flags `truncated`. When a year exceeds that,
// the window is split by publication date and re-fetched until each sub-range fits, so no CVEs
// are silently dropped. Stop splitting below one day — no real day publishes >50k CVEs.
const DAY_MS = 24 * 60 * 60 * 1000
const MIN_SPLIT_MS = DAY_MS

export interface NvdImportOptions {
  years: number[]
  /**
   * Target database (raw better-sqlite3) — the same connection the rest of the app reads.
   * Nullable because callers pass getDb()?.getRawDb() directly; a null DB fails the import
   * cleanly (start() returns a not-initialized result) instead of forcing a cast at the call site.
   */
  db: BetterDb | null
  /** NVD API key; enables the 50-req/30s rate tier for faster fetching. */
  apiKey?: string
  /** Inject a pre-built client (tests use a fake so nothing hits the network). */
  apiClient?: NvdApiV2Client
  batchSize?: number
  signal?: AbortSignal
  onProgress?: (progress: NvdImportProgress) => void
  onComplete?: (result: NvdImportResult) => void
  onError?: (error: Error) => void
}

export interface NvdImportProgress {
  phase: 'initializing' | 'downloading' | 'parsing' | 'importing' | 'complete' | 'error'
  currentYear?: number
  years: {
    total: number
    completed: number
    failed: number
    pending: number
  }
  download: {
    totalBytes: number
    downloadedBytes: number
    percentage: number
    speedMBps: number
    etaSeconds: number
  }
  parse: {
    totalCVEs: number
    processedCVEs: number
    percentage: number
  }
  import: {
    totalCVEs: number
    importedCVEs: number
    percentage: number
  }
  error?: string
}

export interface NvdImportResult {
  success: boolean
  yearsProcessed: number[]
  yearsFailed: number[]
  totalCVEs: number
  importedCVEs: number
  failedCVEs: number
  duration: number
  dbSize: number
  error?: string
}

/**
 * NVD Import Manager - Main Orchestrator
 */
export class NvdImportManager {
  private db: BetterDb | null
  private apiClient: NvdApiV2Client
  private options: NvdImportOptions
  private progress: NvdImportProgress
  private startTime: number
  private abortController = new AbortController()
  private onProgress?: (progress: NvdImportProgress) => void
  private onComplete?: (result: NvdImportResult) => void
  private onError?: (error: Error) => void

  constructor(options: NvdImportOptions) {
    this.options = options
    this.db = options.db
    this.onProgress = options.onProgress
    this.onComplete = options.onComplete
    this.onError = options.onError

    this.apiClient = options.apiClient ?? createNvdApiV2Client(options.apiKey)

    // Compose any caller-supplied signal into our controller so both an external abort and
    // cancel() stop the fetch/import (the client also aborts in-flight requests on cancel()).
    if (options.signal) {
      if (options.signal.aborted) this.abortController.abort()
      else options.signal.addEventListener('abort', () => this.abortController.abort(), { once: true })
    }

    this.startTime = Date.now()

    this.progress = {
      phase: 'initializing',
      years: {
        total: this.options.years.length,
        completed: 0,
        failed: 0,
        pending: this.options.years.length,
      },
      download: {
        totalBytes: 0,
        downloadedBytes: 0,
        percentage: 0,
        speedMBps: 0,
        etaSeconds: 0,
      },
      parse: {
        totalCVEs: 0,
        processedCVEs: 0,
        percentage: 0,
      },
      import: {
        totalCVEs: 0,
        importedCVEs: 0,
        percentage: 0,
      },
    }
  }

  /**
   * Start the import process
   */
  async start(): Promise<NvdImportResult> {
    if (!this.db) {
      const notReady: NvdImportResult = {
        success: false,
        yearsProcessed: [],
        yearsFailed: this.options.years,
        totalCVEs: 0,
        importedCVEs: 0,
        failedCVEs: 0,
        duration: Date.now() - this.startTime,
        dbSize: 0,
        error: 'Database not initialized',
      }
      this.onError?.(new Error('Database not initialized'))
      return notReady
    }
    const importer = createNvdDataImporter(this.db)

    try {
      this.updateProgress({ phase: 'initializing' })

      const yearsProcessed: number[] = []
      const yearsFailed: number[] = []
      let totalCVEs = 0
      let importedCVEs = 0
      let failedCVEs = 0

      for (const year of this.options.years) {
        if (this.abortController.signal.aborted) {
          break
        }

        try {
          // Fetch the whole year from the REST API (sub-chunking to defeat the 50k cap).
          this.updateProgress({ phase: 'downloading', currentYear: year })
          const cves = await this.fetchYearCves(year)
          totalCVEs += cves.length

          // Import the fetched CVEs into the shared database.
          this.updateProgress({
            phase: 'importing',
            currentYear: year,
            import: { totalCVEs: cves.length, importedCVEs: 0, percentage: 0 },
          })
          const importResult = await importer.importCves(cves, {
            batchSize: this.options.batchSize,
            updateExisting: true,
            skipExisting: false,
            signal: this.abortController.signal,
            onProgress: (ip) => {
              this.updateProgress({
                phase: 'importing',
                currentYear: year,
                import: {
                  totalCVEs: ip.totalCves,
                  importedCVEs: ip.processedCves,
                  percentage: ip.percentage,
                },
              })
            },
          })

          importedCVEs += importResult.importedCves + importResult.updatedCves
          failedCVEs += importResult.failedCves
          yearsProcessed.push(year)

          this.progress.years.completed++
          this.progress.years.pending--
        } catch (error) {
          console.error('Failed to process year %s:', year, error)
          yearsFailed.push(year)
          this.progress.years.failed++
          this.progress.years.pending--

          this.updateProgress({
            phase: 'error',
            currentYear: year,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      this.updateProgress({ phase: 'complete' })

      const result: NvdImportResult = {
        success: yearsFailed.length === 0,
        yearsProcessed,
        yearsFailed,
        totalCVEs,
        importedCVEs,
        failedCVEs,
        duration: Date.now() - this.startTime,
        dbSize: this.getDbSize(),
      }

      this.onComplete?.(result)
      return result
    } catch (error) {
      this.updateProgress({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      const result: NvdImportResult = {
        success: false,
        yearsProcessed: [],
        yearsFailed: this.options.years,
        totalCVEs: 0,
        importedCVEs: 0,
        failedCVEs: 0,
        duration: Date.now() - this.startTime,
        dbSize: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      }

      this.onError?.(error instanceof Error ? error : new Error('Unknown error'))
      return result
    }
  }

  /**
   * Fetch every CVE published in a year, defeating the 50k page cap by recursively splitting
   * the publication-date window until each sub-range fits.
   */
  private async fetchYearCves(year: number): Promise<NvdCveV2[]> {
    const start = new Date(Date.UTC(year, 0, 1))
    const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
    return this.fetchRange(start, end, year)
  }

  private async fetchRange(start: Date, end: Date, year: number): Promise<NvdCveV2[]> {
    const result = await this.apiClient.fetchDateRange({
      startDate: start,
      endDate: end,
      signal: this.abortController.signal,
      onProgress: (p) => {
        this.updateProgress({
          phase: 'downloading',
          currentYear: year,
          download: {
            totalBytes: 0,
            downloadedBytes: 0,
            percentage: p.percentage,
            speedMBps: 0,
            etaSeconds: Math.round(p.estimatedTimeRemainingMs / 1000),
          },
        })
      },
    })

    if (!result.truncated) {
      return result.cves
    }

    // This window still exceeds the 50k cap — split it by time and recurse so nothing is missed.
    const spanMs = end.getTime() - start.getTime()
    if (spanMs <= MIN_SPLIT_MS) {
      console.warn(
        `NVD import: ${start.toISOString()}..${end.toISOString()} exceeds the 50k page cap in a ` +
          `minimal window; some CVEs for ${year} may be missed`,
      )
      return result.cves
    }

    const midMs = start.getTime() + Math.floor(spanMs / 2)
    const left = await this.fetchRange(start, new Date(midMs), year)
    const right = await this.fetchRange(new Date(midMs + 1000), end, year)
    return [...left, ...right]
  }

  /**
   * Best-effort database size in bytes (page_count × page_size).
   */
  private getDbSize(): number {
    if (!this.db) return 0
    try {
      const pageCount = this.db.pragma('page_count', { simple: true }) as number
      const pageSize = this.db.pragma('page_size', { simple: true }) as number
      return pageCount * pageSize
    } catch {
      return 0
    }
  }

  /**
   * Update progress and notify callback
   */
  private updateProgress(updates: Partial<NvdImportProgress>): void {
    Object.assign(this.progress, updates)
    this.onProgress?.(this.snapshotProgress())
  }

  /**
   * Copy of the current progress that shares no mutable state with this instance.
   *
   * A plain `{ ...this.progress }` was not enough: every field except phase/currentYear/error is
   * a nested object, so the spread handed the caller live references to the counters this class
   * keeps writing to. A consumer that adjusted one — or simply held the object and read it later
   * expecting a snapshot — was reading (or corrupting) internal state.
   */
  private snapshotProgress(): NvdImportProgress {
    return {
      ...this.progress,
      years: { ...this.progress.years },
      download: { ...this.progress.download },
      parse: { ...this.progress.parse },
      import: { ...this.progress.import },
    }
  }

  /**
   * Cancel the import process
   */
  cancel(): void {
    this.abortController.abort()
    this.apiClient.cancel()
  }

  /**
   * Get current progress
   */
  getProgress(): NvdImportProgress {
    return this.snapshotProgress()
  }
}

/**
 * Import NVD data for the specified years
 */
export async function importNvdData(options: NvdImportOptions): Promise<NvdImportResult> {
  const manager = new NvdImportManager(options)
  return manager.start()
}

/**
 * Get available NVD years
 */
export function getAvailableNvdYears(startYear = 2002, endYear?: number): number[] {
  const currentYear = new Date().getFullYear()
  const end = endYear || Math.min(currentYear, 2026)
  const years: number[] = []

  for (let year = startYear; year <= end; year++) {
    years.push(year)
  }

  return years
}
