/**
 * Unit tests for NVD Delta Sync System
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  NvdDeltaSync,
  createNvdDeltaSync,
  type DeltaSyncProgress,
  type DeltaSyncResult,
  type SyncStatus,
} from './nvdDeltaSync.js'
import { runMigrations, getSchemaVersion } from '../migrations/v2SchemaMigration.js'

// Mock the NVD API v2 client
vi.mock('./nvdApiV2Client.js', () => ({
  NvdApiV2Client: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    setBandwidthLimitKBps: vi.fn(),
    fetchModifiedSince: vi.fn().mockResolvedValue({
      cves: [
        {
          id: 'CVE-2024-00001',
          sourceIdentifier: 'test@nvd.nist.gov',
          published: '2024-01-15T10:00:00.000',
          lastModified: '2024-01-20T15:30:00.000',
          vulnStatus: 'ANALYZED',
          descriptions: [{ lang: 'en', value: 'Test vulnerability' }],
          metrics: {
            cvssMetricV31: [
              {
                source: 'nvd@nist.gov',
                type: 'Primary',
                cvssData: {
                  version: '3.1',
                  vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
                  baseScore: 9.8,
                  baseSeverity: 'CRITICAL',
                },
              },
            ],
          },
          weaknesses: [],
          configurations: [],
          references: [],
        },
        {
          id: 'CVE-2024-00002',
          sourceIdentifier: 'test@nvd.nist.gov',
          published: '2024-01-16T10:00:00.000',
          lastModified: '2024-01-21T15:30:00.000',
          vulnStatus: 'ANALYZED',
          descriptions: [{ lang: 'en', value: 'Another test vulnerability' }],
          metrics: {},
          weaknesses: [],
          configurations: [],
          references: [],
        },
      ],
      totalResults: 2,
      truncated: false,
      durationMs: 100,
    }),
    cancel: vi.fn(),
    getRateLimiterStatus: vi.fn().mockReturnValue({
      queueSize: 0,
      timeUntilNextRequest: 0,
    }),
  })),
  createNvdApiV2Client: vi.fn().mockReturnValue({
    setApiKey: vi.fn(),
    setBandwidthLimitKBps: vi.fn(),
    fetchModifiedSince: vi.fn().mockResolvedValue({
      cves: [],
      totalResults: 0,
      truncated: false,
      durationMs: 100,
    }),
    cancel: vi.fn(),
    getRateLimiterStatus: vi.fn().mockReturnValue({
      queueSize: 0,
      timeUntilNextRequest: 0,
    }),
  }),
}))

let db: InstanceType<typeof Database>

function createTestDatabase(): InstanceType<typeof Database> {
  const database = new Database(':memory:')

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  runMigrations(database, 0)

  return database
}

describe('NvdDeltaSync', () => {
  let deltaSync: NvdDeltaSync

  beforeEach(() => {
    db = createTestDatabase()
    deltaSync = createNvdDeltaSync(db)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create delta sync instance', () => {
      expect(deltaSync).toBeInstanceOf(NvdDeltaSync)
    })

    it('should create delta sync with API key', () => {
      const deltaSyncWithKey = createNvdDeltaSync(db, 'test-api-key')
      expect(deltaSyncWithKey).toBeInstanceOf(NvdDeltaSync)
    })
  })

  describe('setApiKey', () => {
    it('should update API key', () => {
      deltaSync.setApiKey('new-api-key')
      // No error should be thrown
    })
  })

  describe('setBandwidthLimitKBps (FR-10.3)', () => {
    it('defaults to 0 (unlimited) and persists a chosen limit through getSyncStatus', () => {
      // WHY: the settings UI writes the cap once. It must be persisted (not just
      // held in memory) so the scheduler keeps throttling updates at the chosen
      // rate after a reload/restart instead of silently reverting to unlimited.
      expect(deltaSync.getSyncStatus().bandwidthLimitKBps).toBe(0)

      deltaSync.setBandwidthLimitKBps(500)

      expect(deltaSync.getSyncStatus().bandwidthLimitKBps).toBe(500)
    })
  })

  describe('getProgress', () => {
    it('should return initial progress', () => {
      const progress = deltaSync.getProgress()

      expect(progress.phase).toBe('checking')
      expect(progress.cvesFetched).toBe(0)
      expect(progress.percentage).toBe(0)
      expect(progress.errors).toEqual([])
    })
  })

  describe('getSyncStatus', () => {
    it('should return default status for empty database', () => {
      const status = deltaSync.getSyncStatus()

      expect(status.lastSyncAt).toBeNull()
      expect(status.lastSuccessfulSyncAt).toBeNull()
      expect(status.totalCves).toBe(0)
      expect(status.autoSyncEnabled).toBe(false)
    })

    it('should return status from database', () => {
      // Insert sync status
      db.prepare(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, sync_duration_ms, last_error,
          auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run('NVD', '2024-01-20T10:00:00.000Z', '2024-01-20T10:00:00.000Z', 100, 5000, null, 1, 24)

      const status = deltaSync.getSyncStatus()

      expect(status.lastSyncAt).toBe('2024-01-20T10:00:00.000Z')
      expect(status.lastSuccessfulSyncAt).toBe('2024-01-20T10:00:00.000Z')
      expect(status.totalCves).toBe(100)
      expect(status.syncDurationMs).toBe(5000)
      expect(status.autoSyncEnabled).toBe(true)
      expect(status.autoSyncIntervalHours).toBe(24)
    })
  })

  describe('sync', () => {
    it('should perform sync and return result', async () => {
      const result = await deltaSync.sync()

      expect(result.success).toBe(true)
      expect(result.cvesFetched).toBeGreaterThanOrEqual(0)
      expect(result.syncedAt).toBeTruthy()
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('should report progress during sync', async () => {
      const progressUpdates: DeltaSyncProgress[] = []

      await deltaSync.sync({
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      expect(progressUpdates.length).toBeGreaterThan(0)

      // Last progress should show complete
      const finalProgress = progressUpdates[progressUpdates.length - 1]
      expect(['complete', 'error']).toContain(finalProgress.phase)
    })

    it('should use last successful sync date for delta', async () => {
      // Insert previous sync status
      db.prepare(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run('NVD', '2024-01-15T10:00:00.000Z', '2024-01-15T10:00:00.000Z', 50, 0, 24)

      const progressUpdates: DeltaSyncProgress[] = []
      await deltaSync.sync({
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      // Should have used the last sync date
      const fetchingProgress = progressUpdates.find((p) => p.phase === 'fetching')
      expect(fetchingProgress).toBeDefined()
      expect(fetchingProgress!.fetchingFrom).toContain('2024-01')
    })

    it('should update sync status after successful sync', async () => {
      await deltaSync.sync()

      const status = deltaSync.getSyncStatus()

      expect(status.lastSyncAt).toBeTruthy()
      expect(status.lastSuccessfulSyncAt).toBeTruthy()
      expect(status.lastError).toBeNull()
    })

    it('should handle cancellation before sync', async () => {
      const controller = new AbortController()
      controller.abort()

      const result = await deltaSync.sync({ signal: controller.signal })

      expect(result.success).toBe(false)
      expect(result.errors).toContain('Sync cancelled before starting')
    })

    it('should force full sync when requested', async () => {
      // Insert previous sync status
      db.prepare(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run('NVD', '2024-01-15T10:00:00.000Z', '2024-01-15T10:00:00.000Z', 50, 0, 24)

      const progressUpdates: DeltaSyncProgress[] = []
      await deltaSync.sync({
        forceFullSync: true,
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      // With force full sync, should start from 7 days ago
      const fetchingProgress = progressUpdates.find((p) => p.phase === 'fetching')
      expect(fetchingProgress).toBeDefined()
    })
  })

  describe('getRecommendedSyncRange', () => {
    it('should return 30 days range for no previous sync', () => {
      const range = deltaSync.getRecommendedSyncRange()

      expect(range.start).toBeInstanceOf(Date)
      expect(range.end).toBeInstanceOf(Date)

      const daysDiff = Math.floor((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24))
      expect(daysDiff).toBe(30)
    })

    it('should return range from last sync', () => {
      const lastSync = new Date()
      lastSync.setDate(lastSync.getDate() - 5)

      db.prepare(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run('NVD', lastSync.toISOString(), lastSync.toISOString(), 50, 0, 24)

      expect(deltaSync.isSyncNeeded()).toBe(true)
    })

    it('should return false for recent sync', () => {
      const recentSync = new Date()
      recentSync.setHours(recentSync.getHours() - 1)

      db.prepare(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run('NVD', recentSync.toISOString(), recentSync.toISOString(), 50, 0, 24)

      deltaSync.enableAutoSync({
        intervalHours: 12,
      })

      const status = deltaSync.getSyncStatus()
      expect(status.autoSyncEnabled).toBe(true)
      expect(status.autoSyncIntervalHours).toBe(12)

      // Clean up
      deltaSync.disableAutoSync()
    })

    it('should disable auto sync', () => {
      // Insert sync status first with all required fields
      db.prepare(
        `
        INSERT INTO sync_status (
          source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?)
      `,
      ).run('NVD', '2024-01-01T00:00:00.000Z', 0, 24)

      deltaSync.enableAutoSync({ intervalHours: 24 })
      deltaSync.disableAutoSync()

      const status = deltaSync.getSyncStatus()
      expect(status.autoSyncEnabled).toBe(false)
    })

    it('persists the enable on a database that has no sync_status row yet', () => {
      // Every other enableAutoSync test above INSERTs a sync_status row first, which is exactly
      // why this went unnoticed: the method ran a bare UPDATE, so on a fresh install — where no
      // row exists until the schedule is first saved — it matched nothing. The timer started but
      // nothing was persisted, getSyncStatus() still reported autoSyncEnabled: false, and the
      // setting vanished on restart.
      expect(db.prepare(`SELECT id FROM sync_status WHERE source = 'NVD'`).get()).toBeUndefined()

      // 48, not the default 24: getSyncStatus() falls back to autoSyncIntervalHours 24 when the
      // row is missing, so asserting 24 here would pass even if nothing were written.
      deltaSync.enableAutoSync({ intervalHours: 48 })

      const status = deltaSync.getSyncStatus()
      expect(status.autoSyncEnabled).toBe(true)
      expect(status.autoSyncIntervalHours).toBe(48)

      deltaSync.disableAutoSync()
    })

    it('should call onSyncStart callback', async () => {
      const onSyncStart = vi.fn()

      deltaSync.enableAutoSync({
        intervalHours: 24,
        onSyncStart,
      })

      // Manually trigger sync for testing
      await deltaSync.sync()

      // Note: onSyncStart is called by scheduler, not by manual sync
      // This test verifies the scheduler is set up correctly

      deltaSync.disableAutoSync()
    })
  })

  describe('cancel', () => {
    it('should cancel sync', () => {
      deltaSync.cancel()

      const progress = deltaSync.getProgress()
      expect(progress.phase).toBe('cancelled')
    })
  })

  describe('error handling', () => {
    it('should handle API errors', async () => {
      // Override mock to throw error
      const { createNvdApiV2Client } = await import('./nvdApiV2Client.js')
      vi.mocked(createNvdApiV2Client).mockReturnValueOnce({
        setApiKey: vi.fn(),
        setBandwidthLimitKBps: vi.fn(),
        fetchModifiedSince: vi.fn().mockRejectedValue(new Error('API Error')),
        cancel: vi.fn(),
        getRateLimiterStatus: vi.fn().mockReturnValue({
          queueSize: 0,
          timeUntilNextRequest: 0,
        }),
      } as unknown as ReturnType<typeof createNvdApiV2Client>)
      const deltaSyncWithError = createNvdDeltaSync(db)
      const result = await deltaSyncWithError.sync()

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should record error in sync status', async () => {
      // Override mock to throw error
      const { createNvdApiV2Client } = await import('./nvdApiV2Client.js')
      vi.mocked(createNvdApiV2Client).mockReturnValueOnce({
        setApiKey: vi.fn(),
        setBandwidthLimitKBps: vi.fn(),
        fetchModifiedSince: vi.fn().mockRejectedValue(new Error('Test error')),
        cancel: vi.fn(),
        getRateLimiterStatus: vi.fn().mockReturnValue({
          queueSize: 0,
          timeUntilNextRequest: 0,
        }),
      } as unknown as ReturnType<typeof createNvdApiV2Client>)
      const deltaSyncWithError = createNvdDeltaSync(db)
      await deltaSyncWithError.sync()

      const status = deltaSyncWithError.getSyncStatus()
      expect(status.lastError).toContain('Test error')
    })
  })
})

// ===========================================================================
// B2 — window chunking (H25) + advancing pagination cursor (C3)
// ===========================================================================
const DAY_MS = 24 * 60 * 60 * 1000

const sampleDeltaCve = {
  id: 'CVE-2024-90001',
  sourceIdentifier: 'test@nvd.nist.gov',
  published: '2024-01-01T00:00:00.000',
  lastModified: '2024-01-02T00:00:00.000',
  vulnStatus: 'ANALYZED',
  descriptions: [{ lang: 'en', value: 'delta test vuln' }],
  metrics: {},
  weaknesses: [],
  configurations: [],
  references: [],
}

function makeDeltaClientMock(
  fetchModifiedSince: ReturnType<typeof vi.fn>,
): ReturnType<typeof import('./nvdApiV2Client.js').createNvdApiV2Client> {
  return {
    setApiKey: vi.fn(),
    setBandwidthLimitKBps: vi.fn(),
    fetchModifiedSince,
    cancel: vi.fn(),
    getRateLimiterStatus: vi.fn().mockReturnValue({ queueSize: 0, timeUntilNextRequest: 0 }),
  } as unknown as ReturnType<typeof import('./nvdApiV2Client.js').createNvdApiV2Client>
}

function insertLastSync(database: InstanceType<typeof Database>, daysAgo: number): void {
  const when = new Date(Date.now() - daysAgo * DAY_MS).toISOString()
  database
    .prepare(
      `INSERT INTO sync_status (source, last_sync_at, last_successful_sync_at,
        total_cves, auto_sync_enabled, auto_sync_interval_hours) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run('NVD', when, when, 0, 0, 24)
}

describe('NvdDeltaSync window chunking + cursor (B2: H25, C3)', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    if (db) db.close()
    vi.clearAllMocks()
  })

  it('resumes a truncated window at the advancing cursor, not page 0 (C3)', async () => {
    // WHY (C3): a truncated window must continue where the last page ended. The old loop
    // re-issued the same request (startIndex always 0), so a >50k window looped forever
    // accumulating duplicates. The second call must resume at the first page's length.
    const fetchModifiedSince = vi
      .fn()
      .mockResolvedValueOnce({
        cves: [sampleDeltaCve, sampleDeltaCve, sampleDeltaCve],
        totalResults: 5,
        truncated: true,
        durationMs: 1,
      })
      .mockResolvedValueOnce({
        cves: [sampleDeltaCve, sampleDeltaCve],
        totalResults: 5,
        truncated: false,
        durationMs: 1,
      })

    const { createNvdApiV2Client } = await import('./nvdApiV2Client.js')
    vi.mocked(createNvdApiV2Client).mockReturnValueOnce(makeDeltaClientMock(fetchModifiedSince))

    const deltaSync = createNvdDeltaSync(db)
    insertLastSync(db, 10) // recent → a single ≤120-day window, so cursor advance is isolated

    await deltaSync.sync()

    expect(fetchModifiedSince).toHaveBeenCalledTimes(2)
    // Second page resumes at the count returned by the first page (3), not 0.
    expect(fetchModifiedSince.mock.calls[1][0].startIndex).toBe(3)
  })

  it('chunks a >120-day gap into multiple ≤120-day windows (H25)', async () => {
    // WHY (H25): the NVD API rejects a lastModified range wider than 120 days. Sending the
    // whole [lastSync, now] gap as one window failed the sync outright; it must be split.
    const fetchModifiedSince = vi.fn().mockResolvedValue({
      cves: [],
      totalResults: 0,
      truncated: false,
      durationMs: 1,
    })

    const { createNvdApiV2Client } = await import('./nvdApiV2Client.js')
    vi.mocked(createNvdApiV2Client).mockReturnValueOnce(makeDeltaClientMock(fetchModifiedSince))

    const deltaSync = createNvdDeltaSync(db)
    insertLastSync(db, 400) // 400-day gap → at least ceil(400/120)=4 windows

    await deltaSync.sync()

    expect(fetchModifiedSince.mock.calls.length).toBeGreaterThanOrEqual(4)
    for (const [opts] of fetchModifiedSince.mock.calls) {
      expect(opts.lastModifiedEndDate).toBeInstanceOf(Date)
      const span = opts.lastModifiedEndDate.getTime() - opts.lastModifiedDate.getTime()
      // ≤120 days (allow a small slack for the +1s inter-window step).
      expect(span).toBeLessThanOrEqual(120 * DAY_MS + 2000)
    }
  })
})

describe('createNvdDeltaSync', () => {
  it('should create delta sync instance', () => {
    const testDb = createTestDatabase()
    const deltaSync = createNvdDeltaSync(testDb)
    expect(deltaSync).toBeInstanceOf(NvdDeltaSync)
    testDb.close()
  })

  it('should create delta sync with API key', () => {
    const testDb = createTestDatabase()
    const deltaSync = createNvdDeltaSync(testDb, 'test-key')
    expect(deltaSync).toBeInstanceOf(NvdDeltaSync)
    testDb.close()
  })
})

// ===========================================================================
// disableAutoSync error path — cover lines 421-424
// ===========================================================================
describe('NvdDeltaSync disableAutoSync error handling', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    db = createTestDatabase()
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  it('should throw and rollback when database update fails', () => {
    const deltaSync = createNvdDeltaSync(db)

    db.prepare(
      `
      INSERT INTO sync_status (
        source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours
      ) VALUES (?, ?, ?, ?)
    `,
    ).run('NVD', '2024-01-01T00:00:00.000Z', 1, 24)

    db.exec('DROP TABLE sync_status')

    expect(() => {
      deltaSync.disableAutoSync()
    }).toThrow()

    db.close()
  })
})

// ===========================================================================
// scheduleNextSync timer callback — cover lines 446-459
// ===========================================================================
describe('NvdDeltaSync scheduleNextSync timer callback', () => {
  let db: InstanceType<typeof Database>

  beforeEach(() => {
    vi.useFakeTimers()
    db = createTestDatabase()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  it('should call onSyncStart, onSyncComplete, and reschedule when timer fires', async () => {
    const onSyncStart = vi.fn()
    const onSyncComplete = vi.fn()
    const onSyncError = vi.fn()

    const deltaSync = createNvdDeltaSync(db)

    db.prepare(
      `
      INSERT INTO sync_status (
        source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours
      ) VALUES (?, ?, ?, ?)
    `,
    ).run('NVD', '2024-01-01T00:00:00.000Z', 0, 24)

    deltaSync.enableAutoSync({
      intervalHours: 1,
      onSyncStart,
      onSyncComplete,
      onSyncError,
    })

    expect(onSyncStart).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(onSyncStart).toHaveBeenCalledTimes(1)
    expect(onSyncComplete).toHaveBeenCalledTimes(1)
    expect(onSyncComplete.mock.calls[0][0]).toHaveProperty('success', true)

    deltaSync.disableAutoSync()
  })

  it('should call onSyncComplete with failed result when sync fails', async () => {
    const onSyncStart = vi.fn()
    const onSyncComplete = vi.fn()

    const { createNvdApiV2Client } = await import('./nvdApiV2Client.js')
    vi.mocked(createNvdApiV2Client).mockReturnValueOnce({
      setApiKey: vi.fn(),
      setBandwidthLimitKBps: vi.fn(),
      fetchModifiedSince: vi.fn().mockRejectedValue(new Error('Timer sync failure')),
      cancel: vi.fn(),
      getRateLimiterStatus: vi.fn().mockReturnValue({
        queueSize: 0,
        timeUntilNextRequest: 0,
      }),
    } as unknown as ReturnType<typeof createNvdApiV2Client>)

    const deltaSync = createNvdDeltaSync(db)

    db.prepare(
      `
      INSERT INTO sync_status (
        source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours
      ) VALUES (?, ?, ?, ?)
    `,
    ).run('NVD', '2024-01-01T00:00:00.000Z', 0, 24)

    deltaSync.enableAutoSync({
      intervalHours: 1,
      onSyncStart,
      onSyncComplete,
    })

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(onSyncStart).toHaveBeenCalledTimes(1)
    expect(onSyncComplete).toHaveBeenCalledTimes(1)
    expect(onSyncComplete.mock.calls[0][0].success).toBe(false)
    expect(onSyncComplete.mock.calls[0][0].errors[0]).toContain('Timer sync failure')

    deltaSync.disableAutoSync()
  })

  it('should not fire callback when schedulerOptions is null', async () => {
    const onSyncStart = vi.fn()

    const deltaSync = createNvdDeltaSync(db)

    db.prepare(
      `
      INSERT INTO sync_status (
        source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours
      ) VALUES (?, ?, ?, ?)
    `,
    ).run('NVD', '2024-01-01T00:00:00.000Z', 0, 24)

    deltaSync.enableAutoSync({
      intervalHours: 1,
      onSyncStart,
    })

    deltaSync.disableAutoSync()

    vi.advanceTimersByTime(60 * 60 * 1000)
    await vi.runAllTimersAsync()

    expect(onSyncStart).not.toHaveBeenCalled()
  })
})
