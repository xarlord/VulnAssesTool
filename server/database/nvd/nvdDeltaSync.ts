/**
 * NVD Delta Sync System
 *
 * Handles incremental updates to the NVD database:
 * - Detects CVEs modified since last sync
 * - Fetches only changes from NVD API
 * - Resolves conflicts with existing data
 * - Provides scheduling for automatic daily sync
 */

import Database from 'better-sqlite3'
import { NvdApiV2Client, createNvdApiV2Client, type NvdCveV2 } from './nvdApiV2Client.js'
import { NvdDataImporter, createNvdDataImporter } from './nvdDataImporter.js'

type BetterDb = InstanceType<typeof Database>

// Maximum span of a single lastModified query window. The NVD API rejects a range wider
// than 120 days, so a long gap since the last sync is chunked into windows of this size (H25).
const MAX_DELTA_WINDOW_DAYS = 120
const DAY_MS = 24 * 60 * 60 * 1000

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
  bandwidthLimitKBps: number
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
  private db: BetterDb
  private apiClient: NvdApiV2Client
  private importer: NvdDataImporter
  private progress: DeltaSyncProgress
  private startTime: number = 0
  private schedulerTimer: ReturnType<typeof setTimeout> | null = null
  private schedulerOptions: SchedulerOptions | null = null

  constructor(db: BetterDb, apiKey?: string) {
    this.db = db
    this.apiClient = createNvdApiV2Client(apiKey)
    this.importer = createNvdDataImporter(db)
    this.progress = this.createInitialProgress()
    // Re-apply the persisted bandwidth cap so a restart keeps throttling updates
    // at the user's chosen rate (migrations have already run before this point).
    this.apiClient.setBandwidthLimitKBps(this.getSyncStatus().bandwidthLimitKBps)
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
    const row = this.db
      .prepare(
        `
      SELECT
        last_sync_at,
        last_successful_sync_at,
        total_cves,
        sync_duration_ms,
        last_error,
        next_scheduled_sync,
        auto_sync_enabled,
        auto_sync_interval_hours,
        bandwidth_limit_kbps
      FROM sync_status
      WHERE source = 'NVD'
      ORDER BY id DESC
      LIMIT 1
    `,
      )
      .get() as
      | {
          last_sync_at: string | null
          last_successful_sync_at: string | null
          total_cves: number
          sync_duration_ms: number | null
          last_error: string | null
          next_scheduled_sync: string | null
          auto_sync_enabled: number
          auto_sync_interval_hours: number
          bandwidth_limit_kbps: number | null
        }
      | undefined

    const defaultStatus: SyncStatus = {
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      totalCves: 0,
      syncDurationMs: null,
      lastError: null,
      nextScheduledSync: null,
      autoSyncEnabled: false,
      autoSyncIntervalHours: 24,
      bandwidthLimitKBps: 0,
    }

    if (!row) {
      return defaultStatus
    }

    return {
      lastSyncAt: row.last_sync_at,
      lastSuccessfulSyncAt: row.last_successful_sync_at,
      totalCves: row.total_cves,
      syncDurationMs: row.sync_duration_ms,
      lastError: row.last_error,
      nextScheduledSync: row.next_scheduled_sync,
      autoSyncEnabled: row.auto_sync_enabled === 1,
      autoSyncIntervalHours: row.auto_sync_interval_hours,
      bandwidthLimitKBps: row.bandwidth_limit_kbps ?? 0,
    }
  }

  /**
   * Persist the auto-sync interval (in hours) without starting the scheduler.
   * A value of 0 means auto-sync is disabled (manual only). Used by the
   * settings UI to remember the chosen sync schedule across reloads; the
   * scheduler itself is (re)started separately via enableAutoSync().
   */
  setAutoSyncInterval(hours: number): void {
    const existing = this.db.prepare(`SELECT id FROM sync_status WHERE source = 'NVD'`).get()
    const enabled = hours > 0 ? 1 : 0
    if (existing) {
      this.db
        .prepare(`UPDATE sync_status SET auto_sync_enabled = ?, auto_sync_interval_hours = ? WHERE source = 'NVD'`)
        .run(enabled, hours)
    } else {
      this.db
        .prepare(
          `INSERT INTO sync_status (source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours)
           VALUES ('NVD', '', ?, ?)`,
        )
        .run(enabled, hours)
    }
  }

  /**
   * Persist the update bandwidth limit (KB/s, 0 = unlimited) and apply it to the
   * API client immediately so in-flight and future syncs honour it. Mirrors how
   * setAutoSyncInterval persists to sync_status; survives reload/restart.
   */
  setBandwidthLimitKBps(kbps: number): void {
    const normalized = kbps > 0 ? kbps : 0
    const existing = this.db.prepare(`SELECT id FROM sync_status WHERE source = 'NVD'`).get()
    if (existing) {
      this.db.prepare(`UPDATE sync_status SET bandwidth_limit_kbps = ? WHERE source = 'NVD'`).run(normalized)
    } else {
      this.db
        .prepare(`INSERT INTO sync_status (source, last_sync_at, bandwidth_limit_kbps) VALUES ('NVD', '', ?)`)
        .run(normalized)
    }
    this.apiClient.setBandwidthLimitKBps(normalized)
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
      // Split the gap since the last sync into ≤120-day windows the NVD API accepts (H25).
      const windows = this.buildSyncWindows(syncFromDate, new Date())
      let cancelled = false

      for (const [windowStart, windowEnd] of windows) {
        if (cancelled) break

        // Page through this window with a cursor that advances by the number of CVEs
        // returned, so a truncated (>50k) window resumes instead of re-fetching page 0 (C3).
        let startIndex = 0
        let windowTruncated = true

        while (windowTruncated) {
          if (options.signal?.aborted) {
            result.success = false
            result.errors.push('Sync cancelled')
            cancelled = true
            break
          }

          const fetchResult = await this.apiClient.fetchModifiedSince({
            lastModifiedDate: windowStart,
            lastModifiedEndDate: windowEnd,
            startIndex,
            signal: options.signal,
          })

          allCves.push(...fetchResult.cves)
          startIndex += fetchResult.cves.length

          this.progress.cvesFetched = allCves.length
          this.progress.percentage = fetchResult.truncated ? 50 : 100
          this.progress.elapsedTimeMs = Date.now() - this.startTime
          options.onProgress?.(this.getProgress())

          // Keep paging only while truncated AND still returning rows; the empty guard
          // prevents an infinite loop on a degenerate truncated-but-empty page.
          windowTruncated = fetchResult.truncated && fetchResult.cves.length > 0
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
   * Split [start, end] into consecutive windows no wider than MAX_DELTA_WINDOW_DAYS. The
   * NVD API rejects a lastModified range wider than 120 days, so a long gap since the last
   * successful sync must be chunked rather than sent as one over-wide window (H25).
   */
  private buildSyncWindows(start: Date, end: Date): Array<[Date, Date]> {
    const maxSpanMs = MAX_DELTA_WINDOW_DAYS * DAY_MS
    const windows: Array<[Date, Date]> = []

    let windowStart = start
    while (windowStart.getTime() < end.getTime()) {
      const tentativeEnd = new Date(windowStart.getTime() + maxSpanMs)
      const windowEnd = tentativeEnd.getTime() < end.getTime() ? tentativeEnd : end
      windows.push([windowStart, windowEnd])
      // Step 1s past the boundary so consecutive windows don't overlap on the edge CVE.
      windowStart = new Date(windowEnd.getTime() + 1000)
    }

    // Always issue at least one window (e.g. if start >= end from clock skew).
    if (windows.length === 0) {
      windows.push([start, end])
    }

    return windows
  }

  /**
   * Update sync status in database
   */
  private updateSyncStatus(result: DeltaSyncResult, isError: boolean): void {
    const now = result.syncedAt
    const totalCves = this.importer.getStats().totalCves

    this.db.exec('BEGIN TRANSACTION')
    try {
      // Check if sync_status entry exists
      const existing = this.db.prepare("SELECT id FROM sync_status WHERE source = 'NVD'").get() as
        | { id: number }
        | undefined

      if (existing) {
        // Update existing
        this.db
          .prepare(
            `
          UPDATE sync_status SET
            last_sync_at = ?,
            last_successful_sync_at = ?,
            total_cves = ?,
            sync_duration_ms = ?,
            last_error = ?
          WHERE source = 'NVD'
        `,
          )
          .run(now, isError ? null : now, totalCves, result.durationMs, isError ? result.errors.join('; ') : null)
      } else {
        // Insert new
        this.db
          .prepare(
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
          )
          .run(
            'NVD',
            now,
            isError ? null : now,
            totalCves,
            result.durationMs,
            isError ? result.errors.join('; ') : null,
          )
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
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
    this.db.exec('BEGIN TRANSACTION')
    try {
      this.db
        .prepare(
          `
        UPDATE sync_status SET
          auto_sync_enabled = 1,
          auto_sync_interval_hours = ?
        WHERE source = 'NVD'
      `,
        )
        .run(options.intervalHours)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
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
    this.db.exec('BEGIN TRANSACTION')
    try {
      this.db.exec(`
        UPDATE sync_status SET
          auto_sync_enabled = 0,
          next_scheduled_sync = NULL
        WHERE source = 'NVD'
      `)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
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
    this.db
      .prepare(
        `
      UPDATE sync_status SET
        next_scheduled_sync = ?
      WHERE source = 'NVD'
    `,
      )
      .run(nextSync.toISOString())

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

    const oldestRow = this.db.prepare('SELECT MIN(published_at) as pub FROM cves').get() as { pub: string | null }
    const newestRow = this.db.prepare('SELECT MAX(published_at) as pub FROM cves').get() as { pub: string | null }

    return {
      ...importerStats,
      oldestCve: oldestRow?.pub ?? null,
      newestCve: newestRow?.pub ?? null,
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
export function createNvdDeltaSync(db: BetterDb, apiKey?: string): NvdDeltaSync {
  return new NvdDeltaSync(db, apiKey)
}
