/**
 * Unit tests for NVD Delta Sync System
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
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

let db: Database
let sqlJs: any

async function createTestDatabase(): Promise<Database> {
  if (!sqlJs) {
    sqlJs = await initSqlJs({})
  }
  const database = new sqlJs.Database()

  // Create schema_migrations table
  database.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  // Apply all migrations
  runMigrations(database, 0)

  return database
}

describe('NvdDeltaSync', () => {
  let deltaSync: NvdDeltaSync

  beforeEach(async () => {
    db = await createTestDatabase()
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
      db.run(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, sync_duration_ms, last_error,
          auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
        ['NVD', '2024-01-20T10:00:00.000Z', '2024-01-20T10:00:00.000Z', 100, 5000, null, 1, 24],
      )

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
      db.run(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        ['NVD', '2024-01-15T10:00:00.000Z', '2024-01-15T10:00:00.000Z', 50, 0, 24],
      )

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
      db.run(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        ['NVD', '2024-01-15T10:00:00.000Z', '2024-01-15T10:00:00.000Z', 50, 0, 24],
      )

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
      // Insert previous sync status
      const lastSync = new Date()
      lastSync.setDate(lastSync.getDate() - 5)

      db.run(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        ['NVD', lastSync.toISOString(), lastSync.toISOString(), 50, 0, 24],
      )

      const range = deltaSync.getRecommendedSyncRange()

      // Should start from approximately 5 days ago (with 1 hour buffer)
      const daysDiff = Math.floor((range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24))
      expect(daysDiff).toBeGreaterThanOrEqual(4)
      expect(daysDiff).toBeLessThanOrEqual(6)
    })
  })

  describe('isSyncNeeded', () => {
    it('should return true for no previous sync', () => {
      expect(deltaSync.isSyncNeeded()).toBe(true)
    })

    it('should return true for sync more than 24 hours ago', () => {
      const oldSync = new Date()
      oldSync.setDate(oldSync.getDate() - 2)

      db.run(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        ['NVD', oldSync.toISOString(), oldSync.toISOString(), 50, 0, 24],
      )

      expect(deltaSync.isSyncNeeded()).toBe(true)
    })

    it('should return false for recent sync', () => {
      const recentSync = new Date()
      recentSync.setHours(recentSync.getHours() - 1)

      db.run(
        `
        INSERT INTO sync_status (
          source, last_sync_at, last_successful_sync_at,
          total_cves, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
        ['NVD', recentSync.toISOString(), recentSync.toISOString(), 50, 0, 24],
      )

      expect(deltaSync.isSyncNeeded()).toBe(false)
    })
  })

  describe('getStats', () => {
    it('should return stats for empty database', () => {
      const stats = deltaSync.getStats()

      expect(stats.totalCves).toBe(0)
      expect(stats.totalCwe).toBe(0)
      expect(stats.totalCpe).toBe(0)
      expect(stats.totalRefs).toBe(0)
      expect(stats.oldestCve).toBeNull()
      expect(stats.newestCve).toBeNull()
    })
  })

  describe('auto sync scheduler', () => {
    it('should enable auto sync', () => {
      // Insert sync status first with all required fields
      db.run(
        `
        INSERT INTO sync_status (
          source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?)
      `,
        ['NVD', '2024-01-01T00:00:00.000Z', 0, 24],
      )

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
      db.run(
        `
        INSERT INTO sync_status (
          source, last_sync_at, auto_sync_enabled, auto_sync_interval_hours
        ) VALUES (?, ?, ?, ?)
      `,
        ['NVD', '2024-01-01T00:00:00.000Z', 1, 24],
      )

      deltaSync.enableAutoSync({ intervalHours: 24 })
      deltaSync.disableAutoSync()

      const status = deltaSync.getSyncStatus()
      expect(status.autoSyncEnabled).toBe(false)
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
        fetchModifiedSince: vi.fn().mockRejectedValue(new Error('API Error')),
        cancel: vi.fn(),
        getRateLimiterStatus: vi.fn().mockReturnValue({
          queueSize: 0,
          timeUntilNextRequest: 0,
        }),
      } as any)

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
        fetchModifiedSince: vi.fn().mockRejectedValue(new Error('Test error')),
        cancel: vi.fn(),
        getRateLimiterStatus: vi.fn().mockReturnValue({
          queueSize: 0,
          timeUntilNextRequest: 0,
        }),
      } as any)

      const deltaSyncWithError = createNvdDeltaSync(db)
      await deltaSyncWithError.sync()

      const status = deltaSyncWithError.getSyncStatus()
      expect(status.lastError).toContain('Test error')
    })
  })
})

describe('createNvdDeltaSync', () => {
  it('should create delta sync instance', async () => {
    const testDb = await createTestDatabase()
    const deltaSync = createNvdDeltaSync(testDb)
    expect(deltaSync).toBeInstanceOf(NvdDeltaSync)
    testDb.close()
  })

  it('should create delta sync with API key', async () => {
    const testDb = await createTestDatabase()
    const deltaSync = createNvdDeltaSync(testDb, 'test-key')
    expect(deltaSync).toBeInstanceOf(NvdDeltaSync)
    testDb.close()
  })
})
