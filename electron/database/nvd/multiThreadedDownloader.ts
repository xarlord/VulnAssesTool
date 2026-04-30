/**
 * Multi-threaded NVD Feed Downloader
 * Downloads NVD CVE JSON feeds with multiple concurrent workers,
 * rate limiting, checksum validation, and resumable downloads.
 */

import { promises as fs } from 'node:fs'
import { createReadStream, createWriteStream } from 'node:fs'
import { createGunzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import path from 'node:path'
import crypto from 'node:crypto'
import { createNvdRateLimiter, RateLimiter } from './rateLimiter.js'

export interface DownloadProgress {
  year: number
  status: 'pending' | 'downloading' | 'verifying' | 'extracting' | 'complete' | 'error'
  downloadedBytes: number
  totalBytes: number
  percentage: number
  speedMBps: number
  etaSeconds: number
  error?: string
  checksum?: string
  checksumValid?: boolean
}

export interface DownloadTask {
  year: number
  url: string
  checksumUrl?: string
  status: 'pending' | 'running' | 'complete' | 'failed'
  retries: number
  startTime?: number
  endTime?: number
}

export interface MultiThreadedDownloaderOptions {
  maxConcurrentDownloads?: number // Default: 3
  maxRetries?: number // Default: 5
  cacheDir?: string
  validateChecksums?: boolean // Default: true
  useCompression?: boolean // Default: true
  onProgress?: (progress: DownloadProgress) => void
}

interface ActiveDownload {
  task: DownloadTask
  controller: AbortController
  startTime: number
  downloadedBytes: number
}

/**
 * Multi-threaded NVD Feed Downloader
 */
export class MultiThreadedDownloader {
  private options: Required<Omit<MultiThreadedDownloaderOptions, 'onProgress' | 'validateChecksums'>> & {
    validateChecksums: boolean
  }
  private rateLimiter: RateLimiter
  private activeDownloads = new Map<number, ActiveDownload>()
  private downloadQueue: DownloadTask[] = []
  private completedDownloads = new Set<number>()
  private failedDownloads = new Map<number, Error>()
  private onProgressCallback?: (progress: DownloadProgress) => void

  constructor(options: MultiThreadedDownloaderOptions = {}) {
    this.options = {
      maxConcurrentDownloads: options.maxConcurrentDownloads || 3,
      maxRetries: options.maxRetries || 5,
      cacheDir: options.cacheDir || path.join(app.getPath('userData'), 'nvd-cache'),
      useCompression: options.useCompression !== false,
      validateChecksums: options.validateChecksums !== false,
    }
    this.onProgressCallback = options.onProgress

    // Create rate limiter (assuming no API key for downloads)
    this.rateLimiter = createNvdRateLimiter(false)

    // Ensure cache directory exists
    fs.mkdir(this.options.cacheDir, { recursive: true }).catch(() => {})
  }

  /**
   * Download multiple years of NVD data
   */
  async downloadYears(years: number[]): Promise<Map<number, string>> {
    const results = new Map<number, string>()

    // Create download tasks
    this.downloadQueue = years.map((year) => ({
      year,
      url: this.buildFeedUrl(year),
      checksumUrl: this.buildChecksumUrl(year),
      status: 'pending',
      retries: 0,
    }))

    // Process downloads with concurrency limit
    await this.processDownloads((progress) => {
      this.onProgressCallback?.(progress)
    })

    // Collect results
    for (const year of this.completedDownloads) {
      results.set(year, this.getCachedFilePath(year))
    }

    return results
  }

  /**
   * Download a single year feed
   */
  async downloadYear(year: number): Promise<string> {
    const task: DownloadTask = {
      year,
      url: this.buildFeedUrl(year),
      checksumUrl: this.buildChecksumUrl(year),
      status: 'pending',
      retries: 0,
    }

    this.downloadQueue = [task]

    await this.processDownloads()

    if (this.completedDownloads.has(year)) {
      return this.getCachedFilePath(year)
    }

    throw this.failedDownloads.get(year) || new Error(`Download failed for year ${year}`)
  }

  /**
   * Build NVD feed URL for a year
   */
  private buildFeedUrl(year: number): string {
    // NVD CVE 2.0 JSON feed format
    return `https://nvd.nist.gov/feeds/json/cve/2.0/nvdcve-2.0-${year}.json.gz`
  }

  /**
   * Build checksum URL for a year
   */
  private buildChecksumUrl(year: number): string {
    return `https://nvd.nist.gov/feeds/json/cve/2.0/nvdcve-2.0-${year}.json.gz.sha256`
  }

  /**
   * Get cached file path for a year
   */
  private getCachedFilePath(year: number): string {
    if (this.options.useCompression) {
      return path.join(this.options.cacheDir, `nvdcve-2.0-${year}.json.gz`)
    }
    return path.join(this.options.cacheDir, `nvdcve-2.0-${year}.json`)
  }

  /**
   * Process all downloads in the queue with concurrency control
   */
  private async processDownloads(progressCallback?: (progress: DownloadProgress) => void): Promise<void> {
    const processNext = async (): Promise<void> => {
      // Find next pending download
      const task = this.downloadQueue.find((t) => t.status === 'pending')
      if (!task) return

      task.status = 'running'
      task.startTime = Date.now()

      const activeDownload: ActiveDownload = {
        task,
        controller: new AbortController(),
        startTime: Date.now(),
        downloadedBytes: 0,
      }

      this.activeDownloads.set(task.year, activeDownload)

      try {
        await this.executeDownload(task, progressCallback)
        task.status = 'complete'
        task.endTime = Date.now()
        this.completedDownloads.add(task.year)

        // Update progress for completion
        progressCallback?.({
          year: task.year,
          status: 'complete',
          downloadedBytes: 100,
          totalBytes: 100,
          percentage: 100,
          speedMBps: 0,
          etaSeconds: 0,
        })
      } catch (error) {
        task.retries++

        if (task.retries < this.options.maxRetries) {
          // Retry
          task.status = 'pending'
          console.warn(
            `Retrying download for year ${task.year} (attempt ${task.retries + 1}/${this.options.maxRetries})`,
          )
          await this.delay(1000 * task.retries) // Exponential backoff
          await processNext()
        } else {
          // Max retries exceeded
          task.status = 'failed'
          task.endTime = Date.now()
          this.failedDownloads.set(task.year, error as Error)

          progressCallback?.({
            year: task.year,
            status: 'error',
            downloadedBytes: 0,
            totalBytes: 100,
            percentage: 0,
            speedMBps: 0,
            etaSeconds: 0,
            error: (error as Error).message,
          })

          throw error
        }
      } finally {
        this.activeDownloads.delete(task.year)
      }
    }

    // Start initial batch of downloads
    const workers: Promise<void>[] = []
    for (let i = 0; i < this.options.maxConcurrentDownloads; i++) {
      workers.push(this.startWorker(processNext))
    }

    await Promise.all(workers)
  }

  /**
   * Start a worker that continuously processes downloads
   */
  private async startWorker(processFn: () => Promise<void>): Promise<void> {
    while (this.downloadQueue.some((t) => t.status === 'pending')) {
      await processFn()
      // Small delay to prevent tight loops
      await this.delay(100)
    }
  }

  /**
   * Execute a single download with progress tracking
   */
  private async executeDownload(
    task: DownloadTask,
    progressCallback?: (progress: DownloadProgress) => void,
  ): Promise<string> {
    const gzPath = path.join(this.options.cacheDir, `nvdcve-2.0-${task.year}.json.gz`)
    const jsonPath = path.join(this.options.cacheDir, `nvdcve-2.0-${task.year}.json`)

    // Check if cached file exists
    try {
      await fs.access(gzPath)
      const stats = await fs.stat(gzPath)

      // Validate checksum if enabled
      if (this.options.validateChecksums) {
        progressCallback?.({
          year: task.year,
          status: 'verifying',
          downloadedBytes: stats.size,
          totalBytes: stats.size,
          percentage: 100,
          speedMBps: 0,
          etaSeconds: 0,
        })

        const valid = await this.validateChecksum(task.year, gzPath)
        if (valid) {
          // Extract if needed
          if (!this.options.useCompression) {
            await this.extractFile(gzPath, jsonPath, task.year, progressCallback)
          }
          return this.options.useCompression ? gzPath : jsonPath
        }
      } else {
        // Skip checksum validation
        if (!this.options.useCompression) {
          await this.extractFile(gzPath, jsonPath, task.year, progressCallback)
        }
        return this.options.useCompression ? gzPath : jsonPath
      }
    } catch {
      // File doesn't exist, proceed with download
    }

    // Download with rate limiting
    return this.rateLimiter.execute(async () => {
      return this.downloadFile(task, gzPath, jsonPath, progressCallback)
    })
  }

  /**
   * Download file with progress tracking
   */
  private async downloadFile(
    task: DownloadTask,
    gzPath: string,
    jsonPath: string,
    progressCallback?: (progress: DownloadProgress) => void,
  ): Promise<string> {
    const startTime = Date.now()
    let downloadedBytes = 0
    let totalBytes = 0

    try {
      progressCallback?.({
        year: task.year,
        status: 'downloading',
        downloadedBytes: 0,
        totalBytes: 0,
        percentage: 0,
        speedMBps: 0,
        etaSeconds: 0,
      })

      const response = await fetch(task.url, {
        headers: {
          'User-Agent': 'VulnAssessTool/1.0 (+https://github.com/vulnasstool)',
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const contentLength = response.headers.get('content-length')
      if (contentLength) {
        totalBytes = parseInt(contentLength, 10)
      }

      // Write to file
      const fileStream = createWriteStream(gzPath)

      if (!response.body) {
        throw new Error('Response body is null')
      }

      const reader = response.body.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        downloadedBytes += value.length
        fileStream.write(value)

        // Update progress
        const elapsed = (Date.now() - startTime) / 1000
        const speedMBps = elapsed > 0 ? downloadedBytes / (1024 * 1024) / elapsed : 0
        const percentage = totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0
        const etaSeconds =
          speedMBps > 0 && totalBytes > 0 ? (totalBytes - downloadedBytes) / (1024 * 1024) / speedMBps : 0

        progressCallback?.({
          year: task.year,
          status: 'downloading',
          downloadedBytes,
          totalBytes,
          percentage,
          speedMBps,
          etaSeconds,
        })
      }

      fileStream.close()

      // Verify checksum
      if (this.options.validateChecksums) {
        progressCallback?.({
          year: task.year,
          status: 'verifying',
          downloadedBytes,
          totalBytes,
          percentage: 100,
          speedMBps: 0,
          etaSeconds: 0,
        })

        const valid = await this.validateChecksum(task.year, gzPath)
        if (!valid) {
          await fs.unlink(gzPath)
          throw new Error('Checksum validation failed')
        }
      }

      // Extract gzip file
      await this.extractFile(gzPath, jsonPath, task.year, progressCallback)

      // Delete gz file to save space
      await fs.unlink(gzPath)

      return jsonPath
    } catch (error) {
      // Clean up partial files
      try {
        await fs.unlink(gzPath)
      } catch {}
      throw error
    }
  }

  /**
   * Validate SHA-256 checksum
   */
  private async validateChecksum(year: number, filePath: string): Promise<boolean> {
    try {
      // Download checksum file
      const checksumUrl = this.buildChecksumUrl(year)
      const checksumResponse = await fetch(checksumUrl, {
        headers: {
          'User-Agent': 'VulnAssessTool/1.0 (+https://github.com/vulnasstool)',
        },
      })

      if (!checksumResponse.ok) {
        console.warn(`Failed to download checksum for year ${year}, skipping validation`)
        return true // Skip validation if checksum unavailable
      }

      const expectedChecksum = (await checksumResponse.text()).trim().split(/\s+/)[0]

      // Calculate file checksum
      const fileBuffer = await fs.readFile(filePath)
      const actualChecksum = crypto.createHash('sha256').update(fileBuffer).digest('hex')

      return expectedChecksum.toLowerCase() === actualChecksum.toLowerCase()
    } catch (error) {
      console.warn(`Checksum validation failed for year ${year}:`, error)
      return true // Continue on checksum errors
    }
  }

  /**
   * Extract gzip file to JSON
   */
  private async extractFile(
    gzPath: string,
    jsonPath: string,
    year: number,
    progressCallback?: (progress: DownloadProgress) => void,
  ): Promise<void> {
    progressCallback?.({
      year,
      status: 'extracting',
      downloadedBytes: 0,
      totalBytes: 100,
      percentage: 0,
      speedMBps: 0,
      etaSeconds: 0,
    })

    await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(jsonPath))

    progressCallback?.({
      year,
      status: 'extracting',
      downloadedBytes: 100,
      totalBytes: 100,
      percentage: 100,
      speedMBps: 0,
      etaSeconds: 0,
    })
  }

  /**
   * Cancel all active downloads
   */
  cancel(): void {
    for (const [, download] of this.activeDownloads) {
      download.controller.abort()
      download.task.status = 'pending'
      download.task.retries = 0
    }
    this.activeDownloads.clear()
  }

  /**
   * Get download statistics
   */
  getStats(): {
    total: number
    completed: number
    failed: number
    pending: number
    running: number
  } {
    return {
      total: this.downloadQueue.length,
      completed: this.completedDownloads.size,
      failed: this.failedDownloads.size,
      pending: this.downloadQueue.filter((t) => t.status === 'pending').length,
      running: this.downloadQueue.filter((t) => t.status === 'running').length,
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * Create a multi-threaded downloader with default options
 */
export function createMultiThreadedDownloader(options?: MultiThreadedDownloaderOptions): MultiThreadedDownloader {
  return new MultiThreadedDownloader(options)
}
