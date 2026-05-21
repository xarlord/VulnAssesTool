/**
 * NVD Delta Sync System
 *
 * Handles incremental updates to the NVD database:
 * - Detects CVEs modified since last sync
 * - Fetches only changes from NVD API
 * - Resolves conflicts with existing data
 * - Provides scheduling for automatic daily sync
 */

import type { Database } from 'sql.js'
import { NvdApiV2Client, createNvdApiV2Client, type NvdCveV2 } from './nvdApiV2Client.js'
import { NvdDataImporter, createNvdDataImporter } from './nvdDataImporter.js'

/**
 * Sync status information
 */
export interface SyncStatus {
  lastSyncAt: string | null
  lastSuccessfulSyncAt: string | null
  totalCves: number
  syncDurationMs: number | null
  lastError: string | null
  nextScheduledSync: string | null
  autoSyncEnabled: boolean
  autoSyncIntervalHours: number
}

/**
 * Delta sync options
 */
export interface DeltaSyncOptions {
  apiKey?: string
  onProgress?: (progress: DeltaSyncProgress) => void
  signal?: AbortSignal
  forceFullSync?: boolean // Ignore last sync time and fetch all recent
}

/**
 * Delta sync progress
 */
export interface DeltaSyncProgress {
  phase: 'checking' | 'fetching' | 'importing' | 'complete' | 'error' | 'cancelled'
  lastSyncAt: string | null
  fetchingFrom: string
  cvesFetched: number
  cvesProcessed: number
  cvesAdded: number
  cvesUpdated: number
  cvesSkipped: number
  percentage: number
  elapsedTimeMs: number
  estimatedTimeRemainingMs: number
  errors: string[]
}

/**
 * Delta sync result
 */
export interface DeltaSyncResult {
  success: boolean
  cvesFetched: number
  cvesAdded: number
  cvesUpdated: number
  cvesSkipped: number
  cvesFailed: number
  durationMs: number
  syncedAt: string
  errors: string[]
}

/**
 * Scheduler options
 */
export interface SchedulerOptions {
  intervalHours: number
  onSyncStart?: () => void
  onSyncComplete?: (result: DeltaSyncResult) => void
  onSyncError?: (error: Error) => void
}

/**
 * NVD Delta Sync Manager
 */
export class NvdDeltaSync {
  private db: Database
  private apiClient: NvdApiV2Client
  private importer: NvdDataImporter
  private progress: DeltaSyncProgress
  private startTime: number = 0
  private schedulerTimer: ReturnType<typeof setTimeout> | null = null
  private schedulerOptions: SchedulerOptions | null = null

  constructor(db: Database, apiKey?: string) {
    this.db = db
    this.apiClient = createNvdApiV2Client(apiKey)
    this.importer = createNvdDataImporter(db)
    this.progress = this.createInitialProgress()
  }

  /**
   * Create initial progress state
   */
  private createInitialProgress(): DeltaSyncProgress {
    return {
      phase: 'checking',
      lastSyncAt: null,
      fetchingFrom: '',
      cvesFetched: 0,
      cvesProcessed: 0,
      cvesAdded: 0,
      cvesUpdated: 0,
      cvesSkipped: 0,
      percentage: 0,
      elapsedTimeMs: 0,
      estimatedTimeRemainingMs: 0,
      errors: [],
    }
  }

  /**
   * Get current progress
   */
  getProgress(): DeltaSyncProgress {
    return { ...this.progress }
  }

  /**
   * Get sync status from database
   */
  getSyncStatus(): SyncStatus {
    const result = this.db.exec(`
      SELECT
        last_sync_at,
        last_successful_sync_at,
        total_cves,
        sync_duration_ms,
        last_error,
        next_scheduled_sync,
        auto_sync_enabled,
        auto_sync_interval_hours
      FROM sync_status
      WHERE source = 'NVD'
      ORDER BY id DESC
      LIMIT 1
    `)

    const defaultStatus: SyncStatus = {
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      totalCves: 0,
      syncDurationMs: null,
      lastError: null,
      nextScheduledSync: null,
      autoSyncEnabled: false,
      autoSyncIntervalHours: 24,
    }

    if (result.length === 0 || result[0].values.length === 0) {
      return defaultStatus
    }

    const row = result[0].values[0]
    return {
      lastSyncAt: row[0] as string | null,
      lastSuccessfulSyncAt: row[1] as string | null,
      totalCves: row[2] as number,
      syncDurationMs: row[3] as number | null,
      lastError: row[4] as string | null,
      nextScheduledSync: row[5] as string | null,
      autoSyncEnabled: row[6] === 1,
      autoSyncIntervalHours: row[7] as number,
    }
  }

  /**
   * Set API key for NVD API
   */
  setApiKey(apiKey: string): void {
    this.apiClient.setApiKey(apiKey)
  }

  /**
   * Perform delta sync
   */
  async sync(options: DeltaSyncOptions = {}): Promise<DeltaSyncResult> {
    this.startTime = Date.now()
    this.progress = this.createInitialProgress()

    const result: DeltaSyncResult = {
      success: true,
      cvesFetched: 0,
      cvesAdded: 0,
      cvesUpdated: 0,
      cvesSkipped: 0,
      cvesFailed: 0,
      durationMs: 0,
      syncedAt: new Date().toISOString(),
      errors: [],
    }

    // Get last sync time
    const status = this.getSyncStatus()
    this.progress.lastSyncAt = status.lastSuccessfulSyncAt

    // Determine start date for delta
    let syncFromDate: Date
    if (options.forceFullSync || !status.lastSuccessfulSyncAt) {
      // Default to last 7 days for initial sync or forced full sync
      syncFromDate = new Date()
      syncFromDate.setDate(syncFromDate.getDate() - 7)
    } else {
      // Start from last successful sync (with 1 hour buffer)
      syncFromDate = new Date(status.lastSuccessfulSyncAt)
      syncFromDate.setHours(syncFromDate.getHours() - 1)
    }

    this.progress.fetchingFrom = syncFromDate.toISOString()

    // Check for cancellation
    if (options.signal?.aborted) {
      result.success = false
      result.errors.push('Sync cancelled before starting')
      return result
    }

    try {
      // Phase 1: Fetch modified CVEs
      this.progress.phase = 'fetching'
      options.onProgress?.(this.getProgress())

      const allCves: NvdCveV2[] = []
      let hasMore = true

      while (hasMore) {
        if (options.signal?.aborted) {
          result.success = false
          result.errors.push('Sync cancelled')
          break
        }

        const fetchResult = await this.apiClient.fetchModifiedSince({
          lastModifiedDate: syncFromDate,
          signal: options.signal,
        })

        if (!fetchResult.cves || fetchResult.cves.length === 0) {
          hasMore = false
          break
        }

        allCves.push(...fetchResult.cves)
        this.progress.cvesFetched = allCves.length
        this.progress.percentage = fetchResult.truncated ? 50 : 100
        this.progress.elapsedTimeMs = Date.now() - this.startTime

        options.onProgress?.(this.getProgress())

        if (fetchResult.truncated) {
          // Continue fetching next page
        } else {
          hasMore = false
        }
      }

      result.cvesFetched = allCves.length

      if (!result.success) {
        return result
      }

      // Phase 2: Import CVEs
      this.progress.phase = 'importing'
      options.onProgress?.(this.getProgress())

      const importResult = await this.importer.importCves(allCves, {
        updateExisting: true,
        skipExisting: false, // We want to update all
        signal: options.signal,
        onProgress: (importProgress) => {
          this.progress.cvesProcessed = importProgress.processedCves
          this.progress.percentage = 50 + importProgress.percentage / 2
          this.progress.elapsedTimeMs = Date.now() - this.startTime
          options.onProgress?.(this.getProgress())
        },
      })

      result.cvesAdded = importResult.importedCves
      result.cvesUpdated = importResult.updatedCves
      result.cvesSkipped = importResult.skippedCves
      result.cvesFailed = importResult.failedCves

      if (!importResult.success) {
        result.success = false
        result.errors.push(...importResult.errors)
      }

      // Phase 3: Update sync status
      this.progress.phase = 'complete'
      this.progress.percentage = 100
      this.updateSyncStatus(result, !result.success)
    } catch (error) {
      result.success = false
      const errorMsg = `Sync failed: ${error}`
      result.errors.push(errorMsg)
      this.progress.errors.push(errorMsg)
      this.progress.phase = 'error'
      this.updateSyncStatus(result, true)
    }

    result.durationMs = Date.now() - this.startTime
    this.progress.elapsedTimeMs = result.durationMs

    options.onProgress?.(this.getProgress())

    return result
  }

  /**
   * Update sync status in database
   */
  private updateSyncStatus(result: DeltaSyncResult, isError: boolean): void {
    const now = result.syncedAt
    const totalCves = this.importer.getStats().totalCves

    this.db.run('BEGIN TRANSACTION')
    try {
      // Check if sync_status entry exists
      const existing = this.db.exec("SELECT id FROM sync_status WHERE source = 'NVD'")

      if (existing.length > 0 && existing[0].values.length > 0) {
        // Update existing
        this.db.run(
          `
          UPDATE sync_status SET
            last_sync_at = ?,
            last_successful_sync_at = ?,
            total_cves = ?,
            sync_duration_ms = ?,
            last_error = ?
          WHERE source = 'NVD'
        `,
          [now, isError ? null : now, totalCves, result.durationMs, isError ? result.errors.join('; ') : null],
        )
      } else {
        // Insert new
        this.db.run(
          `
          INSERT INTO sync_status (
            source,
            last_sync_at,
            last_successful_sync_at,
            total_cves,
            sync_duration_ms,
            last_error,
            auto_sync_enabled,
            auto_sync_interval_hours
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 24)
        `,
          ['NVD', now, isError ? null : now, totalCves, result.durationMs, isError ? result.errors.join('; ') : null],
        )
      }
      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }

  /**
   * Enable automatic sync scheduler
   */
  enableAutoSync(options: SchedulerOptions): void {
    this.disableAutoSync()

    this.schedulerOptions = options

    // Update database in transaction
    this.db.run('BEGIN TRANSACTION')
    try {
      this.db.run(
        `
        UPDATE sync_status SET
          auto_sync_enabled = 1,
          auto_sync_interval_hours = ?
        WHERE source = 'NVD'
      `,
        [options.intervalHours],
      )
      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }

    // Schedule first sync
    this.scheduleNextSync()
  }

  /**
   * Disable automatic sync scheduler
   */
  disableAutoSync(): void {
    if (this.schedulerTimer) {
      clearTimeout(this.schedulerTimer)
      this.schedulerTimer = null
    }

    this.schedulerOptions = null

    // Update database in transaction
    this.db.run('BEGIN TRANSACTION')
    try {
      this.db.run(`
        UPDATE sync_status SET
          auto_sync_enabled = 0,
          next_scheduled_sync = NULL
        WHERE source = 'NVD'
      `)
      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }

  /**
   * Schedule next sync
   */
  private scheduleNextSync(): void {
    if (!this.schedulerOptions) return

    const intervalMs = this.schedulerOptions.intervalHours * 60 * 60 * 1000
    const nextSync = new Date(Date.now() + intervalMs)

    // Update next scheduled time in database
    this.db.run(
      `
      UPDATE sync_status SET
        next_scheduled_sync = ?
      WHERE source = 'NVD'
    `,
      [nextSync.toISOString()],
    )

    this.schedulerTimer = setTimeout(async () => {
      if (!this.schedulerOptions) return

      this.schedulerOptions.onSyncStart?.()

      try {
        const result = await this.sync()
        this.schedulerOptions.onSyncComplete?.(result)
      } catch (error) {
        this.schedulerOptions.onSyncError?.(error as Error)
      }

      // Schedule next sync
      this.scheduleNextSync()
    }, intervalMs)
  }

  /**
   * Get recommended sync date range
   */
  getRecommendedSyncRange(): { start: Date; end: Date } {
    const status = this.getSyncStatus()

    if (!status.lastSuccessfulSyncAt) {
      // No previous sync, recommend last 30 days
      const start = new Date()
      start.setDate(start.getDate() - 30)
      return { start, end: new Date() }
    }

    // Start from last sync with 1 hour buffer
    const start = new Date(status.lastSuccessfulSyncAt)
    start.setHours(start.getHours() - 1)
    return { start, end: new Date() }
  }

  /**
   * Check if sync is needed
   */
  isSyncNeeded(): boolean {
    const status = this.getSyncStatus()

    if (!status.lastSuccessfulSyncAt) {
      return true
    }

    // Check if last sync was more than 24 hours ago
    const lastSync = new Date(status.lastSuccessfulSyncAt)
    const hoursSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60)

    return hoursSinceSync >= 24
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalCves: number
    totalCwe: number
    totalCpe: number
    totalRefs: number
    oldestCve: string | null
    newestCve: string | null
  } {
    const importerStats = this.importer.getStats()

    const oldestResult = this.db.exec('SELECT MIN(published_at) FROM cves')
    const newestResult = this.db.exec('SELECT MAX(published_at) FROM cves')

    return {
      ...importerStats,
      oldestCve: oldestResult[0]?.values[0]?.[0] as string | null,
      newestCve: newestResult[0]?.values[0]?.[0] as string | null,
    }
  }

  /**
   * Cancel ongoing sync
   */
  cancel(): void {
    this.apiClient.cancel()
    this.progress.phase = 'cancelled'
  }
}

/**
 * Create a delta sync manager
 */
export function createNvdDeltaSync(db: Database, apiKey?: string): NvdDeltaSync {
  return new NvdDeltaSync(db, apiKey)
}
