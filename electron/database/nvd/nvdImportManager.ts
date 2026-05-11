/**
 * NVD Import Manager
 * Orchestrates the complete process of downloading, parsing, and importing
 * NVD CVE data into the local database.
 *
 * This is the main entry point for populating the database with NVD data.
 */

import { promises as fs } from 'node:fs'
import { MultiThreadedDownloader, type DownloadProgress } from './multiThreadedDownloader.js'
import { NvdStreamParser, type ParsedCVE } from './streamParser.js'
import { getBulkDatabase, type BulkImportStats } from './bulkDatabase.js'
import type { CVE } from '../types.js'

export interface NvdImportOptions {
  years: number[]
  maxConcurrentDownloads?: number
  batchSize?: number
  validateChecksums?: boolean
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
  private downloader: MultiThreadedDownloader
  private parser: NvdStreamParser
  private db: ReturnType<typeof getBulkDatabase>
  private options: NvdImportOptions
  private progress: NvdImportProgress
  private startTime: number
  private abortController = new AbortController()
  private onProgress?: (progress: NvdImportProgress) => void
  private onComplete?: (result: NvdImportResult) => void
  private onError?: (error: Error) => void

  constructor(options: NvdImportOptions) {
    this.options = options
    this.onProgress = options.onProgress
    this.onComplete = options.onComplete
    this.onError = options.onError

    this.db = getBulkDatabase()

    this.downloader = new MultiThreadedDownloader({
      maxConcurrentDownloads: this.options.maxConcurrentDownloads,
      validateChecksums: this.options.validateChecksums,
    })

    this.parser = new NvdStreamParser({
      batchSize: this.options.batchSize,
    })

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
    try {
      // Initialize database
      this.updateProgress({ phase: 'initializing' })
      await this.db.initialize()

      this.onProgress?.(this.progress)

      // Process each year
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
          this.updateProgress({
            phase: 'downloading',
            currentYear: year,
          })

          // Download year data
          const filePath = await this.downloadYear(year)

          // Parse and import
          this.updateProgress({
            phase: 'parsing',
            currentYear: year,
          })

          const { yearCVEs, yearImported, yearFailed } = await this.parseAndImportYear(year, filePath)

          totalCVEs += yearCVEs
          importedCVEs += yearImported
          failedCVEs += yearFailed
          yearsProcessed.push(year)

          this.progress.years.completed++
          this.progress.years.pending--

          // Clean up downloaded file
          try {
            await fs.unlink(filePath)
          } catch {
            // best-effort: stream cleanup on error
          }
        } catch (error) {
          console.error(`Failed to process year ${year}:`, error)
          yearsFailed.push(year)
          this.progress.years.failed++
          this.progress.years.pending--

          this.updateProgress({
            phase: 'error',
            currentYear: year,
            error: (error as Error).message,
          })
        }
      }

      // Complete
      this.updateProgress({ phase: 'complete' })

      const result: NvdImportResult = {
        success: yearsFailed.length === 0,
        yearsProcessed,
        yearsFailed,
        totalCVEs,
        importedCVEs,
        failedCVEs,
        duration: Date.now() - this.startTime,
        dbSize: this.db.getStats().dbSize,
      }

      this.onComplete?.(result)
      return result
    } catch (error) {
      this.updateProgress({
        phase: 'error',
        error: (error as Error).message,
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
        error: (error as Error).message,
      }

      this.onError?.(error as Error)
      return result
    }
  }

  /**
   * Download a single year's data
   */
  private async downloadYear(year: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const downloader = new MultiThreadedDownloader({
        maxConcurrentDownloads: 1,
        validateChecksums: this.options.validateChecksums,
        onProgress: (progress: DownloadProgress) => {
          this.updateProgress({
            phase: 'downloading',
            currentYear: year,
            download: {
              totalBytes: progress.totalBytes,
              downloadedBytes: progress.downloadedBytes,
              percentage: progress.percentage,
              speedMBps: progress.speedMBps,
              etaSeconds: progress.etaSeconds,
            },
          })
        },
      })

      downloader.downloadYear(year).then(resolve).catch(reject)
    })
  }

  /**
   * Parse and import a single year's data
   */
  private async parseAndImportYear(
    year: number,
    filePath: string,
  ): Promise<{ yearCVEs: number; yearImported: number; yearFailed: number }> {
    let yearCVEs = 0
    let yearImported = 0
    let yearFailed = 0

    await this.parser.parseFile(
      filePath,
      async (batch: ParsedCVE[]) => {
        // Convert to CVE format and import
        const cves: CVE[] = batch.map((cve) => ({
          id: cve.id,
          description: cve.description,
          cvss_score: cve.cvss_score,
          cvss_vector: cve.cvss_vector,
          severity: cve.severity,
          published_at: cve.published_at,
          modified_at: cve.modified_at,
          source: cve.source,
          cpe_matches: cve.cpe_matches,
          references: cve.references,
        }))

        const result = await this.db.bulkImportCVEs(cves, {
          batchSize: this.options.batchSize,
          onProgress: (stats: BulkImportStats) => {
            this.updateProgress({
              phase: 'importing',
              currentYear: year,
              import: {
                totalCVEs: stats.totalCVEs,
                importedCVEs: stats.processedCVEs,
                percentage: stats.totalCVEs > 0 ? (stats.processedCVEs / stats.totalCVEs) * 100 : 0,
              },
            })
          },
        })

        yearImported += result.importedCVEs
        yearFailed += result.failedCVEs
      },
      {
        onProgress: (processed, total) => {
          yearCVEs = total
          this.updateProgress({
            phase: 'parsing',
            currentYear: year,
            parse: {
              totalCVEs: total,
              processedCVEs: processed,
              percentage: total > 0 ? (processed / total) * 100 : 0,
            },
          })
        },
      },
    )

    return { yearCVEs, yearImported, yearFailed }
  }

  /**
   * Update progress and notify callback
   */
  private updateProgress(updates: Partial<NvdImportProgress>): void {
    Object.assign(this.progress, updates)
    this.onProgress?.({ ...this.progress })
  }

  /**
   * Cancel the import process
   */
  cancel(): void {
    this.abortController.abort()
    this.downloader.cancel()
  }

  /**
   * Get current progress
   */
  getProgress(): NvdImportProgress {
    return { ...this.progress }
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
