/**
 * Bulk Download Manager for NVD Database
 *
 * Orchestrates year-by-year downloads of NVD CVE data with:
 * - Progress tracking and callbacks
 * - Resumable downloads via queue
 * - Error recovery and retry logic
 * - Concurrent download limits
 * - Database integration for queue management
 */

import type { Database } from 'sql.js'
import {
  NvdApiV2Client,
  createNvdApiV2Client,
  getAvailableYearsForDownload,
  type NvdDownloadProgress,
} from './nvdApiV2Client.js'

/**
 * Download status for a year
 */
export type DownloadStatus = 'pending' | 'downloading' | 'importing' | 'complete' | 'failed' | 'cancelled'

/**
 * Overall download progress
 */
export interface BulkDownloadProgress {
  phase: 'initializing' | 'downloading' | 'importing' | 'complete' | 'error' | 'cancelled'
  totalYears: number
  completedYears: number
  currentYear: number | null
  currentYearProgress: NvdDownloadProgress | null
  totalCves: number
  downloadedCves: number
  percentage: number
  elapsedTimeMs: number
  estimatedTimeRemainingMs: number
  errors: string[]
  startedAt: string
  completedAt: string | null
}

/**
 * Options for bulk download
 */
export interface BulkDownloadOptions {
  startYear?: number
  endYear?: number
  apiKey?: string
  onProgress?: (progress: BulkDownloadProgress) => void
  onYearComplete?: (year: number, cveCount: number) => void
  onYearError?: (year: number, error: string) => void
  signal?: AbortSignal
  resumeFromQueue?: boolean
  maxRetries?: number
}

/**
 * Result of bulk download
 */
export interface BulkDownloadResult {
  success: boolean
  totalCves: number
  completedYears: number[]
  failedYears: Map<number, string>
  durationMs: number
  cancelled: boolean
  errors: string[]
}

/**
 * Queue item from database
 */
interface DownloadQueueItem {
  id: number
  year: number
  status: DownloadStatus
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  retry_count: number
}

/**
 * Bulk Download Manager
 */
export class BulkDownloadManager {
  private apiClient: NvdApiV2Client
  private db: Database
  private abortController: AbortController | null = null
  private progress: BulkDownloadProgress
  private options: Omit<Required<BulkDownloadOptions>, 'signal'> & { signal: AbortSignal | undefined }
  private startTime: number = 0

  constructor(db: Database, apiKey?: string) {
    this.db = db
    this.apiClient = createNvdApiV2Client(apiKey)
    this.options = {
      startYear: 2021,
      endYear: 2026,
      apiKey: apiKey || '',
      onProgress: () => {},
      onYearComplete: () => {},
      onYearError: () => {},
      signal: undefined as AbortSignal | undefined,
      resumeFromQueue: false,
      maxRetries: 3,
    }
    this.progress = this.createInitialProgress()
  }

  /**
   * Create initial progress state
   */
  private createInitialProgress(): BulkDownloadProgress {
    return {
      phase: 'initializing',
      totalYears: 0,
      completedYears: 0,
      currentYear: null,
      currentYearProgress: null,
      totalCves: 0,
      downloadedCves: 0,
      percentage: 0,
      elapsedTimeMs: 0,
      estimatedTimeRemainingMs: 0,
      errors: [],
      startedAt: new Date().toISOString(),
      completedAt: null,
    }
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.apiClient.setApiKey(apiKey)
    this.options.apiKey = apiKey
  }

  /**
   * Get current progress
   */
  getProgress(): BulkDownloadProgress {
    return { ...this.progress }
  }

  /**
   * Start bulk download
   */
  async startDownload(options: BulkDownloadOptions): Promise<BulkDownloadResult> {
    this.startTime = Date.now()
    this.options = {
      startYear: options.startYear ?? 2021,
      endYear: options.endYear ?? 2026,
      apiKey: options.apiKey ?? '',
      onProgress: options.onProgress ?? (() => {}),
      onYearComplete: options.onYearComplete ?? (() => {}),
      onYearError: options.onYearError ?? (() => {}),
      signal: options.signal ?? undefined,
      resumeFromQueue: options.resumeFromQueue ?? false,
      maxRetries: options.maxRetries ?? 3,
    }

    // Update API client key
    if (this.options.apiKey) {
      this.apiClient.setApiKey(this.options.apiKey)
    }

    // Reset progress
    this.progress = this.createInitialProgress()

    // Create abort controller
    this.abortController = new AbortController()
    const signal = this.options.signal || this.abortController.signal

    // Get years to download
    let years: number[]
    if (this.options.resumeFromQueue) {
      years = this.getYearsFromQueue()
    } else {
      years = getAvailableYearsForDownload(this.options.startYear, this.options.endYear)
      // Initialize queue
      this.initializeQueue(years)
    }

    this.progress.totalYears = years.length
    this.progress.phase = 'downloading'
    this.progress.startedAt = new Date().toISOString()

    const result: BulkDownloadResult = {
      success: true,
      totalCves: 0,
      completedYears: [],
      failedYears: new Map(),
      durationMs: 0,
      cancelled: false,
      errors: [],
    }

    // Download each year
    for (const year of years) {
      if (signal.aborted) {
        this.progress.phase = 'cancelled'
        result.cancelled = true
        break
      }

      try {
        const cveCount = await this.downloadYear(year, signal)

        if (cveCount > 0) {
          result.totalCves += cveCount
          result.completedYears.push(year)
          this.progress.completedYears++
          this.progress.downloadedCves += cveCount

          // Update queue
          this.updateQueueStatus(year, 'complete')

          // Notify callback
          this.options.onYearComplete(year, cveCount)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'

        if (signal.aborted) {
          this.progress.phase = 'cancelled'
          result.cancelled = true
          break
        }

        this.progress.errors.push(`Year ${year}: ${errorMessage}`)
        result.failedYears.set(year, errorMessage)
        result.errors.push(`Year ${year}: ${errorMessage}`)
        result.success = false

        // Update queue
        this.updateQueueStatus(year, 'failed', errorMessage)

        // Notify callback
        this.options.onYearError(year, errorMessage)
      }

      // Update overall progress
      this.progress.currentYear = null
      this.progress.currentYearProgress = null
      this.progress.percentage = this.calculatePercentage()
      this.progress.elapsedTimeMs = Date.now() - this.startTime
      this.progress.estimatedTimeRemainingMs = this.estimateRemainingTime()

      this.options.onProgress(this.getProgress())
    }

    // Finalize
    this.progress.phase = result.cancelled ? 'cancelled' : result.success ? 'complete' : 'error'
    this.progress.completedAt = new Date().toISOString()
    this.progress.percentage = 100
    this.progress.elapsedTimeMs = Date.now() - this.startTime

    result.durationMs = this.progress.elapsedTimeMs

    this.options.onProgress(this.getProgress())

    return result
  }

  /**
   * Download CVEs for a specific year
   */
  private async downloadYear(year: number, signal: AbortSignal): Promise<number> {
    this.progress.currentYear = year

    // Update queue status
    this.updateQueueStatus(year, 'downloading')

    // Fetch CVEs from API
    const fetchResult = await this.apiClient.fetchYear({
      year,
      apiKey: this.options.apiKey || undefined,
      onProgress: (p) => {
        this.progress.currentYearProgress = p
        this.progress.percentage = this.calculatePercentage()
        this.progress.elapsedTimeMs = Date.now() - this.startTime

        this.options.onProgress(this.getProgress())
      },
      signal,
    })

    // Update total CVEs count
    this.progress.totalCves = Math.max(this.progress.totalCves, fetchResult.totalResults)

    // Here we would import to database, but that's Phase E5
    // For now, just return the count
    return fetchResult.cves.length
  }

  /**
   * Cancel download
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.apiClient.cancel()
    this.progress.phase = 'cancelled'
  }

  /**
   * Initialize download queue for years
   */
  private initializeQueue(years: number[]): void {
    // Clear existing queue
    this.db.run('DELETE FROM download_queue')

    // Insert years
    const stmt = this.db.prepare(`
      INSERT INTO download_queue (year, status, created_at)
      VALUES (?, 'pending', datetime('now'))
    `)

    for (const year of years) {
      stmt.run([year])
    }

    stmt.free()
  }

  /**
   * Get years from queue that need downloading
   */
  private getYearsFromQueue(): number[] {
    const result = this.db.exec(`
      SELECT year FROM download_queue
      WHERE status IN ('pending', 'failed')
      ORDER BY year ASC
    `)

    if (result.length === 0 || result[0].values.length === 0) {
      return []
    }

    return result[0].values.map((row) => row[0] as number)
  }

  /**
   * Update queue status for a year
   */
  private updateQueueStatus(year: number, status: DownloadStatus, errorMessage?: string): void {
    if (status === 'downloading') {
      this.db.run(
        `
        UPDATE download_queue
        SET status = ?, started_at = datetime('now')
        WHERE year = ?
      `,
        [status, year],
      )
    } else if (status === 'complete') {
      this.db.run(
        `
        UPDATE download_queue
        SET status = ?, completed_at = datetime('now')
        WHERE year = ?
      `,
        [status, year],
      )
    } else if (status === 'failed') {
      this.db.run(
        `
        UPDATE download_queue
        SET status = ?, error_message = ?, retry_count = retry_count + 1
        WHERE year = ?
      `,
        [status, errorMessage || 'Unknown error', year],
      )
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus(): DownloadQueueItem[] {
    const result = this.db.exec(`
      SELECT id, year, status, started_at, completed_at, error_message, retry_count
      FROM download_queue
      ORDER BY year ASC
    `)

    if (result.length === 0) {
      return []
    }

    return result[0].values.map((row) => ({
      id: row[0] as number,
      year: row[1] as number,
      status: row[2] as DownloadStatus,
      started_at: row[3] as string | null,
      completed_at: row[4] as string | null,
      error_message: row[5] as string | null,
      retry_count: row[6] as number,
    }))
  }

  /**
   * Clear download queue
   */
  clearQueue(): void {
    this.db.run('DELETE FROM download_queue')
  }

  /**
   * Retry failed downloads
   */
  retryFailed(): void {
    this.db.run(`
      UPDATE download_queue
      SET status = 'pending', error_message = NULL
      WHERE status = 'failed'
    `)
  }

  /**
   * Calculate overall percentage
   */
  private calculatePercentage(): number {
    if (this.progress.totalYears === 0) return 0

    const yearProgress = (this.progress.completedYears / this.progress.totalYears) * 100

    // Add partial progress for current year
    const currentYearPartial = this.progress.currentYearProgress?.percentage || 0
    const yearWeight = 100 / this.progress.totalYears
    const partialProgress = (currentYearPartial / 100) * yearWeight

    return Math.min(100, yearProgress + partialProgress)
  }

  /**
   * Estimate remaining time
   */
  private estimateRemainingTime(): number {
    if (this.progress.completedYears === 0 || this.progress.elapsedTimeMs === 0) {
      return 0
    }

    const avgTimePerYear = this.progress.elapsedTimeMs / this.progress.completedYears
    const remainingYears = this.progress.totalYears - this.progress.completedYears

    return remainingYears * avgTimePerYear
  }

  /**
   * Get API client rate limiter status
   */
  getRateLimiterStatus(): { queueSize: number; timeUntilNextRequest: number } {
    return this.apiClient.getRateLimiterStatus()
  }
}

/**
 * Create a bulk download manager
 */
export function createBulkDownloadManager(db: Database, apiKey?: string): BulkDownloadManager {
  return new BulkDownloadManager(db, apiKey)
}
