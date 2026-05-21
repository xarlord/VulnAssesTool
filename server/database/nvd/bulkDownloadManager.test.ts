/**
 * Unit tests for Bulk Download Manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import {
  BulkDownloadManager,
  createBulkDownloadManager,
  type BulkDownloadProgress,
  type BulkDownloadResult,
  type DownloadStatus,
} from './bulkDownloadManager.js'

// Mock the NVD API v2 client
vi.mock('./nvdApiV2Client.js', () => ({
  NvdApiV2Client: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    fetchYear: vi.fn().mockResolvedValue({
      cves: [{ id: 'CVE-2024-00001' }],
      totalResults: 1,
      truncated: false,
      durationMs: 100,
    }),
    fetchDateRange: vi.fn().mockResolvedValue({
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
  })),
  createNvdApiV2Client: vi.fn().mockReturnValue({
    setApiKey: vi.fn(),
    fetchYear: vi.fn().mockResolvedValue({
      cves: [{ id: 'CVE-2024-00001' }],
      totalResults: 1,
      truncated: false,
      durationMs: 100,
    }),
    cancel: vi.fn(),
    getRateLimiterStatus: vi.fn().mockReturnValue({
      queueSize: 0,
      timeUntilNextRequest: 0,
    }),
  }),
  getAvailableYearsForDownload: vi.fn((start, end) => {
    const years: number[] = []
    for (let y = start; y <= end; y++) {
      years.push(y)
    }
    return years
  }),
}))

let db: Database
let sqlJs: any

async function createTestDatabase(): Promise<Database> {
  if (!sqlJs) {
    sqlJs = await initSqlJs({})
  }
  const database = new sqlJs.Database()

  // Create required tables
  database.run(`
    CREATE TABLE IF NOT EXISTS download_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      started_at TEXT,
      completed_at TEXT,
      error_message TEXT,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  return database
}

describe('BulkDownloadManager', () => {
  let manager: BulkDownloadManager

  beforeEach(async () => {
    db = await createTestDatabase()
    manager = createBulkDownloadManager(db)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create manager instance', () => {
      expect(manager).toBeInstanceOf(BulkDownloadManager)
    })

    it('should create manager with API key', () => {
      const managerWithKey = createBulkDownloadManager(db, 'test-api-key')
      expect(managerWithKey).toBeInstanceOf(BulkDownloadManager)
    })
  })

  describe('setApiKey', () => {
    it('should update API key', () => {
      manager.setApiKey('new-api-key')
      // No error should be thrown
    })
  })

  describe('getProgress', () => {
    it('should return initial progress', () => {
      const progress = manager.getProgress()

      expect(progress.phase).toBe('initializing')
      expect(progress.totalYears).toBe(0)
      expect(progress.completedYears).toBe(0)
      expect(progress.currentYear).toBeNull()
      expect(progress.percentage).toBe(0)
    })
  })

  describe('getQueueStatus', () => {
    it('should return empty queue initially', () => {
      const status = manager.getQueueStatus()
      expect(status).toEqual([])
    })

    it('should return queue items after initialization', async () => {
      // Start download (which initializes queue) but cancel immediately
      const signal = new AbortController().signal
      const abortController = new AbortController()

      // Initialize queue manually for testing
      db.run("INSERT INTO download_queue (year, status) VALUES (2024, 'pending')")
      db.run("INSERT INTO download_queue (year, status) VALUES (2025, 'pending')")

      const status = manager.getQueueStatus()
      expect(status.length).toBe(2)
      expect(status[0].year).toBe(2024)
      expect(status[1].year).toBe(2025)
    })
  })

  describe('clearQueue', () => {
    it('should clear the queue', () => {
      db.run("INSERT INTO download_queue (year, status) VALUES (2024, 'pending')")
      expect(manager.getQueueStatus().length).toBe(1)

      manager.clearQueue()
      expect(manager.getQueueStatus().length).toBe(0)
    })
  })

  describe('retryFailed', () => {
    it('should update failed items to pending', () => {
      db.run("INSERT INTO download_queue (year, status, error_message) VALUES (2024, 'failed', 'Test error')")
      db.run("INSERT INTO download_queue (year, status) VALUES (2025, 'complete')")

      manager.retryFailed()

      const status = manager.getQueueStatus()
      const failed = status.find((s) => s.year === 2024)
      expect(failed?.status).toBe('pending')
      expect(failed?.error_message).toBeNull()
    })
  })

  describe('startDownload', () => {
    it('should download a single year', async () => {
      const progressCallback = vi.fn()

      const result = await manager.startDownload({
        startYear: 2024,
        endYear: 2024,
        onProgress: progressCallback,
      })

      expect(result.success).toBe(true)
      expect(result.completedYears).toContain(2024)
      expect(result.cancelled).toBe(false)

      // Progress callback should have been called
      expect(progressCallback).toHaveBeenCalled()
    })

    it('should download multiple years', async () => {
      const result = await manager.startDownload({
        startYear: 2024,
        endYear: 2025,
      })

      expect(result.success).toBe(true)
      expect(result.completedYears.length).toBe(2)
      expect(result.completedYears).toContain(2024)
      expect(result.completedYears).toContain(2025)
    })

    it('should report progress during download', async () => {
      const progressUpdates: BulkDownloadProgress[] = []

      await manager.startDownload({
        startYear: 2024,
        endYear: 2024,
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      // Should have at least initializing, downloading, and complete phases
      const phases = progressUpdates.map((p) => p.phase)
      expect(phases).toContain('complete')
    })

    it('should call onYearComplete callback', async () => {
      const yearCompleteCallback = vi.fn()

      await manager.startDownload({
        startYear: 2024,
        endYear: 2024,
        onYearComplete: yearCompleteCallback,
      })

      expect(yearCompleteCallback).toHaveBeenCalledWith(2024, expect.any(Number))
    })

    it('should track elapsed time', async () => {
      await manager.startDownload({
        startYear: 2024,
        endYear: 2024,
      })

      const progress = manager.getProgress()
      expect(progress.elapsedTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should update queue status during download', async () => {
      await manager.startDownload({
        startYear: 2024,
        endYear: 2024,
      })

      const queue = manager.getQueueStatus()
      const item = queue.find((q) => q.year === 2024)
      expect(item?.status).toBe('complete')
    })
  })

  describe('cancel', () => {
    it('should cancel download', async () => {
      const controller = new AbortController()

      // Start download in background
      const downloadPromise = manager.startDownload({
        startYear: 2021,
        endYear: 2026,
        signal: controller.signal,
      })

      // Cancel immediately
      manager.cancel()
      controller.abort()

      const result = await downloadPromise
      expect(result.cancelled).toBe(true)
    })

    it('should update progress to cancelled', () => {
      manager.cancel()
      const progress = manager.getProgress()
      expect(progress.phase).toBe('cancelled')
    })
  })

  describe('getRateLimiterStatus', () => {
    it('should return rate limiter status', () => {
      const status = manager.getRateLimiterStatus()

      expect(status).toHaveProperty('queueSize')
      expect(status).toHaveProperty('timeUntilNextRequest')
    })
  })

  describe('error handling', () => {
    it('should handle API errors', async () => {
      // Override the mock to throw an error
      const { createNvdApiV2Client } = await import('./nvdApiV2Client.js')
      vi.mocked(createNvdApiV2Client).mockReturnValueOnce({
        setApiKey: vi.fn(),
        fetchYear: vi.fn().mockRejectedValue(new Error('API Error')),
        cancel: vi.fn(),
        getRateLimiterStatus: vi.fn().mockReturnValue({
          queueSize: 0,
          timeUntilNextRequest: 0,
        }),
      } as any)

      const managerWithError = createBulkDownloadManager(db)
      const yearErrorCallback = vi.fn()

      const result = await managerWithError.startDownload({
        startYear: 2024,
        endYear: 2024,
        onYearError: yearErrorCallback,
      })

      expect(result.success).toBe(false)
      expect(result.failedYears.has(2024)).toBe(true)
    })

    it('should record errors in progress', async () => {
      const { createNvdApiV2Client } = await import('./nvdApiV2Client.js')
      vi.mocked(createNvdApiV2Client).mockReturnValueOnce({
        setApiKey: vi.fn(),
        fetchYear: vi.fn().mockRejectedValue(new Error('Test error')),
        cancel: vi.fn(),
        getRateLimiterStatus: vi.fn().mockReturnValue({
          queueSize: 0,
          timeUntilNextRequest: 0,
        }),
      } as any)

      const managerWithError = createBulkDownloadManager(db)

      await managerWithError.startDownload({
        startYear: 2024,
        endYear: 2024,
      })

      const progress = managerWithError.getProgress()
      expect(progress.errors.length).toBeGreaterThan(0)
    })
  })

  describe('queue management', () => {
    it('should populate queue on start', async () => {
      await manager.startDownload({
        startYear: 2024,
        endYear: 2025,
      })

      const queue = manager.getQueueStatus()
      expect(queue.length).toBe(2)
    })

    it('should support resume from queue', async () => {
      // Setup: Add failed items to queue
      db.run("INSERT INTO download_queue (year, status, error_message) VALUES (2023, 'failed', 'Previous error')")
      db.run("INSERT INTO download_queue (year, status) VALUES (2024, 'complete')")

      const result = await manager.startDownload({
        resumeFromQueue: true,
        startYear: 2021,
        endYear: 2026,
      })

      // Should only download failed item (2023), not complete (2024)
      // And the queue should already exist, so startYear/endYear are ignored
      expect(result.completedYears).toContain(2023)
    })
  })
})

describe('createBulkDownloadManager', () => {
  it('should create manager instance', async () => {
    const testDb = await createTestDatabase()
    const manager = createBulkDownloadManager(testDb)
    expect(manager).toBeInstanceOf(BulkDownloadManager)
    testDb.close()
  })

  it('should create manager with API key', async () => {
    const testDb = await createTestDatabase()
    const manager = createBulkDownloadManager(testDb, 'test-key')
    expect(manager).toBeInstanceOf(BulkDownloadManager)
    testDb.close()
  })
})
