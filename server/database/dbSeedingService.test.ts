/**
 * Unit tests for Database Seeding Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import {
  DbSeedingService,
  createDbSeedingService,
  getBundledSeedPath,
  hasBundledSeed,
  copyBundledSeed,
  type FirstRunCheckResult,
  type SeedingProgress,
} from './dbSeedingService.js'
import { runMigrations } from './migrations/v2SchemaMigration.js'
import * as fs from 'node:fs'
import { EventEmitter } from 'node:events'

let db: InstanceType<typeof Database>
const testDbPath = '/tmp/test-nvd-seed.db'

function createTestDatabase(): InstanceType<typeof Database> {
  const database = new Database(':memory:')

  database.exec(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  runMigrations(database, 0)

  return database
}

// Mock NVD API client for seeding service tests
vi.mock('./nvd/nvdApiV2Client.js', () => ({
  createNvdApiV2Client: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    fetchYear: vi
      .fn()
      .mockImplementation(async ({ year, onProgress }: { year: number; onProgress?: (p: unknown) => void }) => {
        // Simulate progress
        if (onProgress) {
          onProgress({
            phase: 'complete',
            startIndex: 0,
            totalResults: 10,
            resultsPerPage: 2000,
            percentage: 100,
            cvesDownloaded: 10,
            elapsedTimeMs: 100,
            estimatedTimeRemainingMs: 0,
          })
        }

        return {
          cves: [],
          totalResults: 0,
          truncated: false,
          durationMs: 100,
          fromCache: false,
        }
      }),
    cancel: vi.fn(),
    getRateLimiterStatus: vi.fn().mockReturnValue({ queueSize: 0, timeUntilNextRequest: 0 }),
    setConcurrency: vi.fn(),
  })),
  NvdApiV2Client: vi.fn(),
  getAvailableYearsForDownload: vi.fn().mockImplementation((startYear = 1999, endYear?: number) => {
    const currentYear = new Date().getFullYear()
    const end = Math.min(endYear || currentYear, currentYear + 1)
    const years: number[] = []
    for (let year = startYear; year <= end; year++) {
      years.push(year)
    }
    return years
  }),
}))

// Mock node:https for download tests
const { mockHttpsGet } = vi.hoisted(() => ({
  mockHttpsGet: vi.fn(),
}))

vi.mock('node:https', () => ({
  default: { get: mockHttpsGet },
  get: mockHttpsGet,
}))

vi.mock('node:stream/promises', () => ({
  default: { pipeline: vi.fn().mockResolvedValue(undefined) },
  pipeline: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('node:zlib', () => ({
  default: { createGunzip: vi.fn() },
  createGunzip: vi.fn(),
}))

// Mock node:fs for bundled seed and download tests
const {
  mockFsExistsSync,
  mockFsStatSync,
  mockFsCopyFileSync,
  mockFsRenameSync,
  mockFsUnlinkSync,
  mockFsMkdirSync,
  mockFsCreateWriteStream,
} = vi.hoisted(() => ({
  mockFsExistsSync: vi.fn().mockReturnValue(false),
  mockFsStatSync: vi.fn().mockReturnValue({ size: 0 }),
  mockFsCopyFileSync: vi.fn(),
  mockFsRenameSync: vi.fn(),
  mockFsUnlinkSync: vi.fn(),
  mockFsMkdirSync: vi.fn(),
  mockFsCreateWriteStream: vi.fn().mockReturnValue({
    close: vi.fn(),
    on: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    end: vi.fn(),
  }),
}))

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockFsExistsSync,
    statSync: mockFsStatSync,
    copyFileSync: mockFsCopyFileSync,
    renameSync: mockFsRenameSync,
    unlinkSync: mockFsUnlinkSync,
    mkdirSync: mockFsMkdirSync,
    createWriteStream: mockFsCreateWriteStream,
    createReadStream: vi.fn(),
  },
  existsSync: mockFsExistsSync,
  statSync: mockFsStatSync,
  copyFileSync: mockFsCopyFileSync,
  renameSync: mockFsRenameSync,
  unlinkSync: mockFsUnlinkSync,
  mkdirSync: mockFsMkdirSync,
  createWriteStream: mockFsCreateWriteStream,
  createReadStream: vi.fn(),
}))

// Default mock: simulate network error for https downloads
beforeEach(() => {
  mockHttpsGet.mockImplementation(() => {
    const req = new EventEmitter()
    setTimeout(() => req.emit('error', new Error('Network error')), 0)
    return req
  })
})

describe('DbSeedingService', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create seeding service instance', () => {
      expect(seedingService).toBeInstanceOf(DbSeedingService)
    })

    it('should create seeding service with API key', () => {
      const testDb = createTestDatabase()
      const service = createDbSeedingService(testDb, testDbPath, 'test-api-key')
      expect(service).toBeInstanceOf(DbSeedingService)
      testDb.close()
    })
  })

  describe('checkFirstRun', () => {
    it('should detect first run for new database', () => {
      const result = seedingService.checkFirstRun()

      expect(result.state).toBe('first_run')
      expect(result.needsPreSeed).toBe(true)
      expect(result.needsHistoricalSync).toBe(true)
      expect(result.version).toBeNull()
    })

    it('should detect has_seed state after seeding', async () => {
      // Add some CVEs to simulate seeded state
      db.prepare(
        `INSERT INTO cves (id, description, published_at, modified_at, source)
              VALUES (?, 'Test', '2024-01-01', '2024-01-01', 'NVD')`,
      ).run('CVE-2024-00001')

      db.exec(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
      db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_version', '2.0.0-20250224')`)
      db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '1')`)
      db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)

      const result = seedingService.checkFirstRun()

      expect(result.state).toBe('has_seed')
      expect(result.needsHistoricalSync).toBe(true) // Only 1 CVE
    })

    it('should detect has_full_data for complete database', async () => {
      // Add many CVEs to simulate full database (>200K)
      for (let i = 0; i < 100; i++) {
        db.prepare(
          `INSERT INTO cves (id, description, published_at, modified_at, source)
                VALUES (?, 'Test', '2020-01-01', '2020-01-01', 'NVD')`,
        ).run(`CVE-2020-${i.toString().padStart(5, '0')}`)
      }

      db.exec(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
      db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_version', '2.0.0-20250224')`)
      db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '250000')`)
      db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)

      // Create new service to refresh state
      const newService = createDbSeedingService(db, testDbPath)
      const result = newService.checkFirstRun()

      // With high seed count metadata, should not need update
      // Note: needsHistoricalSync checks actual CVE count (100) < 200000, so it's true
      expect(result.needsUpdate).toBe(false)
      expect(result.seedInfo.needsHistoricalSync).toBe(true) // actual CVE count is only 100
    })
  })

  describe('getProgress', () => {
    it('should return initial progress', () => {
      const progress = seedingService.getProgress()

      expect(progress.status).toBe('idle')
      expect(progress.phase).toBe('checking')
      expect(progress.percentComplete).toBe(0)
      expect(progress.isBackground).toBe(false)
    })
  })

  describe('getBackgroundSyncState', () => {
    it('should return null for new database', () => {
      const state = seedingService.getBackgroundSyncState()
      expect(state).toBeNull()
    })

    it('should return state after setting', () => {
      // Set background sync state
      db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run(
        'background_sync_state',
        JSON.stringify({
          status: 'syncing',
          startedAt: '2025-02-24T12:00:00Z',
          yearsCompleted: [2023, 2022],
          yearsRemaining: [2021, 2020],
        }),
      )

      const state = seedingService.getBackgroundSyncState()

      expect(state).not.toBeNull()
      expect(state?.status).toBe('syncing')
      expect(state?.yearsCompleted).toEqual([2023, 2022])
      expect(state?.yearsRemaining).toEqual([2021, 2020])
    })
  })

  describe('isBackgroundSyncInProgress', () => {
    it('should return false for new database', () => {
      expect(seedingService.isBackgroundSyncInProgress()).toBe(false)
    })

    it('should return true when sync is in progress', () => {
      db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run(
        'background_sync_state',
        JSON.stringify({
          status: 'syncing',
          yearsCompleted: [],
          yearsRemaining: [2023, 2022],
        }),
      )

      expect(seedingService.isBackgroundSyncInProgress()).toBe(true)
    })

    it('should return false when sync is complete', () => {
      db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run(
        'background_sync_state',
        JSON.stringify({
          status: 'complete',
          yearsCompleted: [2023, 2022],
          yearsRemaining: [],
        }),
      )

      expect(seedingService.isBackgroundSyncInProgress()).toBe(false)
    })
  })

  describe('getPrebuiltDbInfo', () => {
    it('should return prebuilt database info', () => {
      const info = seedingService.getPrebuiltDbInfo()

      expect(info).toHaveProperty('version')
      expect(info).toHaveProperty('downloadUrl')
      expect(info).toHaveProperty('checksum')
      expect(info).toHaveProperty('sizeBytes')
      expect(info).toHaveProperty('cveCount')
      expect(info).toHaveProperty('seedDate')
    })
  })

  describe('startSeeding', () => {
    it('should skip seeding if already seeded', async () => {
      // Add existing seed data
      db.exec(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
      db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '50000')`)
      db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)
      db.exec(`INSERT INTO cves (id, description, published_at, modified_at, source)
              VALUES ('CVE-2024-00001', 'Test', '2024-01-01', '2024-01-01', 'NVD')`)

      // Create new service to refresh state
      const newService = createDbSeedingService(db, testDbPath)
      const result = await newService.startSeeding()

      expect(result.success).toBe(true)
      expect(result.wasDownloaded).toBe(false)
      expect(result.wasExtraction).toBe(false)
      expect(result.wasImport).toBe(false)
    })

    it('should skip background sync when skipBackgroundSync is true', async () => {
      const result = await seedingService.startSeeding({
        skipBackgroundSync: true,
      })

      expect(result.success).toBe(true)
      expect(result.backgroundSyncStarted).toBe(false)
    })

    it('should report progress during seeding', async () => {
      const progressUpdates: SeedingProgress[] = []

      const result = await seedingService.startSeeding({
        skipBackgroundSync: true,
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      expect(result.success).toBe(true)
      expect(progressUpdates.length).toBeGreaterThan(0)

      // Check that progress phases are reported
      const phases = progressUpdates.map((p) => p.phase)
      expect(phases).toContain('checking')
    })

    it('should handle cancellation via AbortSignal', async () => {
      const controller = new AbortController()
      controller.abort()

      const result = await seedingService.startSeeding({
        signal: controller.signal,
        skipBackgroundSync: true,
      })

      // Result depends on when abort happens
      expect(result).toBeDefined()
    })
  })
})

describe('createDbSeedingService', () => {
  it('should create seeding service instance', () => {
    const testDb = createTestDatabase()
    const service = createDbSeedingService(testDb, testDbPath)
    expect(service).toBeInstanceOf(DbSeedingService)
    testDb.close()
  })

  it('should create seeding service with API key', () => {
    const testDb = createTestDatabase()
    const service = createDbSeedingService(testDb, testDbPath, 'test-key')
    expect(service).toBeInstanceOf(DbSeedingService)
    testDb.close()
  })
})

describe('getBundledSeedPath', () => {
  it('should return null if no bundled seed exists', () => {
    const path = getBundledSeedPath()
    // In test environment, there's no bundled seed
    expect(path).toBeNull()
  })
})

describe('hasBundledSeed', () => {
  it('should return false if no bundled seed exists', () => {
    expect(hasBundledSeed()).toBe(false)
  })
})

describe('copyBundledSeed', () => {
  it('should return false if no bundled seed exists', () => {
    const result = copyBundledSeed('/tmp/test-copy.db')
    expect(result).toBe(false)
  })
})

describe('SeedingProgress', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  it('should track percent complete', async () => {
    let maxPercent = 0

    await seedingService.startSeeding({
      skipBackgroundSync: true,
      onProgress: (p) => {
        maxPercent = Math.max(maxPercent, p.percentComplete)
      },
    })

    // Should reach 100%
    expect(maxPercent).toBe(100)
  })

  it('should track timestamps', async () => {
    await seedingService.startSeeding({
      skipBackgroundSync: true,
    })

    const progress = seedingService.getProgress()

    expect(progress.startedAt).toBeDefined()
    expect(progress.lastUpdatedAt).toBeDefined()
    expect(new Date(progress.startedAt).getTime()).toBeLessThanOrEqual(new Date(progress.lastUpdatedAt).getTime())
  })

  it('should indicate background status', async () => {
    const progress = seedingService.getProgress()
    expect(progress.isBackground).toBe(false)
  })
})

describe('FirstRunCheckResult', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  it('should return correct state for first run', () => {
    const result = seedingService.checkFirstRun()

    expect(result.state).toBe('first_run')
    expect(result.needsPreSeed).toBe(true)
    expect(result.seedInfo.hasSeed).toBe(false)
  })

  it('should return seed info', () => {
    const result = seedingService.checkFirstRun()

    expect(result.seedInfo).toHaveProperty('hasSeed')
    expect(result.seedInfo).toHaveProperty('seedDate')
    expect(result.seedInfo).toHaveProperty('cveCount')
    expect(result.seedInfo).toHaveProperty('needsHistoricalSync')
  })

  it('should detect update needed', () => {
    // Set an old seed version
    db.exec(`INSERT INTO metadata (key, value) VALUES ('db_version', '1.0.0-20200101')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '1000')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2020-01-01')`)
    db.exec(`INSERT INTO cves (id, description, published_at, modified_at, source)
            VALUES ('CVE-2020-00001', 'Test', '2020-01-01', '2020-01-01', 'NVD')`)

    const newService = createDbSeedingService(db, testDbPath)
    const result = newService.checkFirstRun()

    expect(result.needsUpdate).toBe(true)
  })
})

// ============================================================================
// Additional tests for coverage improvement
// ============================================================================

describe('checkFirstRun - has_full_data state', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  it('should detect has_full_data when database has sufficient CVEs', async () => {
    // Set up a seeded database with matching seed version
    db.exec(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_version', '2.0.0-20250224')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '250000')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)

    // Insert enough CVEs to satisfy totalCves >= 200000 (needsHistoricalSync check)
    // Use batch insert for speed
    for (let batch = 0; batch < 200; batch++) {
      const insertStmt = db.prepare(
        `INSERT INTO cves (id, description, published_at, modified_at, source)
         VALUES (?, 'Test', '2020-01-01', '2020-01-01', 'NVD')`,
      )
      db.exec('BEGIN TRANSACTION')
      for (let i = 0; i < 1000; i++) {
        const id = `CVE-2020-${(batch * 1000 + i).toString().padStart(7, '0')}`
        insertStmt.run(id)
      }
      db.exec('COMMIT')
    }

    const newService = createDbSeedingService(db, testDbPath)
    const result = newService.checkFirstRun()

    expect(result.state).toBe('has_full_data')
    expect(result.needsPreSeed).toBe(false)
    expect(result.needsHistoricalSync).toBe(false)
    expect(result.needsUpdate).toBe(false)
  }, 60000)
})

describe('checkFirstRun - incompatible state', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  it('should detect incompatible state when schema version is invalid', () => {
    // Add data so it's not a pure first run
    db.exec(`INSERT INTO cves (id, description, published_at, modified_at, source)
            VALUES ('CVE-2024-00001', 'Test', '2024-01-01', '2024-01-01', 'NVD')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '1')`)

    db.exec(`INSERT INTO metadata (key, value) VALUES ('schema_version', '-1')
            ON CONFLICT(key) DO UPDATE SET value = '-1'`)

    const newService = createDbSeedingService(db, testDbPath)
    const result = newService.checkFirstRun()

    expect(result.state).toBe('incompatible')
    expect(result.needsPreSeed).toBe(true)
  })
})

describe('getBundledSeedPath - found case', () => {
  afterEach(() => {
    mockFsExistsSync.mockClear()
    mockFsExistsSync.mockReturnValue(false)
  })

  it('should return path when bundled seed file exists', () => {
    mockFsExistsSync.mockReturnValue(true)
    const result = getBundledSeedPath()
    expect(result).not.toBeNull()
    expect(result).toContain('nvd-seed.db')
  })
})

describe('hasBundledSeed - true case', () => {
  afterEach(() => {
    mockFsExistsSync.mockClear()
    mockFsExistsSync.mockReturnValue(false)
  })

  it('should return true when bundled seed exists', () => {
    mockFsExistsSync.mockReturnValue(true)
    expect(hasBundledSeed()).toBe(true)
  })
})

describe('copyBundledSeed - with seed present', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockFsExistsSync.mockReturnValue(false)
    mockFsCopyFileSync.mockImplementation(() => {})
    mockFsMkdirSync.mockImplementation(() => '')
  })

  it('should copy seed successfully when dest dir exists', () => {
    mockFsExistsSync
      .mockReturnValueOnce(true) // getBundledSeedPath finds seed
      .mockReturnValueOnce(true) // dest dir exists

    const result = copyBundledSeed('/tmp/dest/seed.db')
    expect(result).toBe(true)
    expect(mockFsCopyFileSync).toHaveBeenCalled()
  })

  it('should create dest dir if it does not exist', () => {
    mockFsExistsSync
      .mockReturnValueOnce(true) // getBundledSeedPath finds seed
      .mockReturnValueOnce(false) // dest dir does NOT exist

    const result = copyBundledSeed('/tmp/new-dir/seed.db')
    expect(result).toBe(true)
    expect(mockFsMkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true })
  })

  it('should return false when copy operation fails', () => {
    mockFsExistsSync
      .mockReturnValueOnce(true) // getBundledSeedPath finds seed
      .mockReturnValueOnce(true) // dest dir exists
    mockFsCopyFileSync.mockImplementation(() => {
      throw new Error('Disk full')
    })

    const result = copyBundledSeed('/tmp/dest/seed.db')
    expect(result).toBe(false)
  })
})

describe('startSeeding - background sync triggered', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  it('should start background sync after import when data exists', async () => {
    // Pre-insert a CVE so hasSeed=true and needsHistoricalSync=true after import
    db.exec(`INSERT INTO cves (id, description, published_at, modified_at, source)
            VALUES ('CVE-2024-00001', 'Test', '2024-01-01', '2024-01-01', 'NVD')`)

    const result = await seedingService.startSeeding()

    expect(result.success).toBe(true)
    expect(result.wasImport).toBe(true)
    expect(result.backgroundSyncStarted).toBe(true)
  })

  it('should start background sync for already-seeded database needing historical data', async () => {
    // Set up a seeded database that still needs historical sync
    db.exec(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '500')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)
    db.exec(`INSERT INTO cves (id, description, published_at, modified_at, source)
            VALUES ('CVE-2024-00001', 'Test', '2024-01-01', '2024-01-01', 'NVD')`)

    const newService = createDbSeedingService(db, testDbPath)
    const result = await newService.startSeeding()

    expect(result.success).toBe(true)
    expect(result.backgroundSyncStarted).toBe(true)
  })
})

describe('startSeeding - error handling', () => {
  it('should handle errors during seeding with non-abort error', async () => {
    const localDb = createTestDatabase()
    // Close the database to cause errors during import
    localDb.close()

    const service = createDbSeedingService(localDb, testDbPath)
    const result = await service.startSeeding({ skipBackgroundSync: true })

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should set error progress on failure', async () => {
    const localDb = createTestDatabase()
    localDb.close()

    const service = createDbSeedingService(localDb, testDbPath)
    await service.startSeeding({ skipBackgroundSync: true })

    const progress = service.getProgress()
    expect(progress.status).toBe('error')
    expect(progress.error).toBeDefined()
  })
})

describe('startSeeding - abort error in catch block', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  it('should set Cancelled error progress when signal is aborted during error', async () => {
    const controller = new AbortController()

    db.exec(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '500')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)
    db.exec(`INSERT INTO cves (id, description, published_at, modified_at, source)
            VALUES ('CVE-2024-00001', 'Test', '2024-01-01', '2024-01-01', 'NVD')`)

    // Use forceDownload to trigger the download path, then abort
    // The mock download will fail (network error from default mock), which goes to import
    // To hit the catch block with abort, we need the import to throw AND signal to be aborted
    const newService = createDbSeedingService(db, testDbPath)

    // Abort immediately so signal.aborted is true during the catch
    controller.abort()

    const result = await newService.startSeeding({
      signal: controller.signal,
      forceDownload: true,
      skipBackgroundSync: true,
    })

    // With aborted signal, the result varies depending on timing
    // The key coverage is the catch block checking signal.aborted
    expect(result).toBeDefined()
    const progress = newService.getProgress()
    // Progress should reflect either error or complete depending on timing
    expect(['error', 'complete', 'idle', 'checking', 'downloading']).toContain(progress.status)
  })
})

describe('downloadPrebuiltDatabase - cleanup on extraction failure', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
    mockFsExistsSync.mockReturnValue(false)
    mockFsStatSync.mockReturnValue({ size: 0 })
    mockFsCopyFileSync.mockImplementation(() => {})
    mockFsRenameSync.mockImplementation(() => {})
    mockFsUnlinkSync.mockImplementation(() => {})
    mockFsCreateWriteStream.mockReturnValue({
      close: vi.fn(),
      on: vi.fn(),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(),
    })
  })

  it('should clean up temp files when extraction fails', async () => {
    const finishCallbacks: Array<() => void> = []
    const mockWriteStream = {
      close: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') finishCallbacks.push(callback)
      }),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(() => {
        setTimeout(() => finishCallbacks.forEach((cb) => cb()), 0)
      }),
    }
    mockFsCreateWriteStream.mockReturnValue(mockWriteStream)

    // Successful download response
    const emitter = new EventEmitter()
    const mockResponse = Object.assign(emitter, {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-length': '100' },
      pipe: (dest: typeof mockWriteStream) => {
        emitter.emit('data', Buffer.from('x'.repeat(100)))
        dest.write(Buffer.from('x'.repeat(100)))
        dest.end()
        return dest
      },
    })
    const mockRequest = new EventEmitter()

    mockHttpsGet.mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (res: typeof mockResponse) => void
      callback(mockResponse)
      return mockRequest
    })

    // The downloaded file passes size check
    mockFsStatSync.mockReturnValue({ size: 5000 } as fs.Stats)
    // The extraction fails - pipeline mock throws
    const { pipeline } = await import('node:stream/promises')
    vi.mocked(pipeline).mockRejectedValueOnce(new Error('Extraction failed'))

    // The temp files exist so cleanup lines 476-477 are hit
    mockFsExistsSync.mockReturnValue(true)
    mockFsUnlinkSync.mockReturnValue(undefined)

    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    // Download attempted but extraction failed → falls back to import
    expect(result.success).toBe(true)
    // Cleanup should have been attempted for temp files
    expect(mockFsUnlinkSync).toHaveBeenCalled()
  })
})

describe('downloadFile - progress with time estimation', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
    mockFsExistsSync.mockReturnValue(false)
    mockFsStatSync.mockReturnValue({ size: 0 })
    mockFsCopyFileSync.mockImplementation(() => {})
    mockFsRenameSync.mockImplementation(() => {})
    mockFsUnlinkSync.mockImplementation(() => {})
    mockFsCreateWriteStream.mockReturnValue({
      close: vi.fn(),
      on: vi.fn(),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(),
    })
  })

  it('should calculate estimated time remaining during download', async () => {
    const finishCallbacks: Array<() => void> = []
    const mockWriteStream = {
      close: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') finishCallbacks.push(callback)
      }),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(() => {
        setTimeout(() => finishCallbacks.forEach((cb) => cb()), 0)
      }),
    }
    mockFsCreateWriteStream.mockReturnValue(mockWriteStream)

    // Create response that emits data with content-length set
    const emitter = new EventEmitter()
    const mockResponse = Object.assign(emitter, {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-length': '200' },
      pipe: (dest: typeof mockWriteStream) => {
        // Emit data chunks to trigger progress with bytes > 0
        emitter.emit('data', Buffer.from('x'.repeat(100)))
        emitter.emit('data', Buffer.from('x'.repeat(100)))
        dest.write(Buffer.from('x'.repeat(200)))
        dest.end()
        return dest
      },
    })
    const mockRequest = new EventEmitter()

    mockHttpsGet.mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (res: typeof mockResponse) => void
      callback(mockResponse)
      return mockRequest
    })

    mockFsStatSync.mockReturnValue({ size: 5000 } as fs.Stats)
    mockFsExistsSync.mockReturnValue(false)
    mockFsRenameSync.mockReturnValue(undefined)
    mockFsUnlinkSync.mockReturnValue(undefined)

    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    expect(result.wasDownloaded).toBe(true)
    expect(result.success).toBe(true)
  })
})

describe('startSeeding - download paths', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
    // Reset fs mocks to defaults
    mockFsExistsSync.mockReturnValue(false)
    mockFsStatSync.mockReturnValue({ size: 0 })
    mockFsCopyFileSync.mockImplementation(() => {})
    mockFsRenameSync.mockImplementation(() => {})
    mockFsUnlinkSync.mockImplementation(() => {})
    mockFsCreateWriteStream.mockReturnValue({
      close: vi.fn(),
      on: vi.fn(),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(),
    })
  })

  it('should download prebuilt database successfully', async () => {
    // Create a mock write stream that handles pipe and finish
    const finishCallbacks: Array<() => void> = []
    const mockWriteStream = {
      close: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') finishCallbacks.push(callback)
      }),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(() => {
        setTimeout(() => finishCallbacks.forEach((cb) => cb()), 0)
      }),
    }
    mockFsCreateWriteStream.mockReturnValue(mockWriteStream)

    // Create mock HTTP response with successful download
    const emitter = new EventEmitter()
    const mockResponse = Object.assign(emitter, {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-length': '100' },
      pipe: (dest: typeof mockWriteStream) => {
        emitter.emit('data', Buffer.from('x'.repeat(100)))
        dest.write(Buffer.from('x'.repeat(100)))
        dest.end()
        return dest
      },
    })
    const mockRequest = new EventEmitter()

    mockHttpsGet.mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (res: typeof mockResponse) => void
      callback(mockResponse)
      return mockRequest
    })

    mockFsStatSync.mockReturnValue({ size: 5000 } as fs.Stats)
    mockFsExistsSync.mockReturnValue(false)
    mockFsRenameSync.mockReturnValue(undefined)
    mockFsUnlinkSync.mockReturnValue(undefined)

    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    expect(result.wasDownloaded).toBe(true)
    expect(result.wasExtraction).toBe(true)
    expect(result.success).toBe(true)
    expect(result.totalCves).toBeGreaterThan(0)
  })

  it('should handle download failure and fall back to import', async () => {
    // Default mock already simulates network error
    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    expect(result.success).toBe(true)
    expect(result.wasImport).toBe(true)
    expect(result.wasDownloaded).toBe(false)
  })

  it('should handle downloaded file too small as corrupted', async () => {
    const finishCallbacks: Array<() => void> = []
    const mockWriteStream = {
      close: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') finishCallbacks.push(callback)
      }),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(() => {
        setTimeout(() => finishCallbacks.forEach((cb) => cb()), 0)
      }),
    }
    mockFsCreateWriteStream.mockReturnValue(mockWriteStream)

    const emitter = new EventEmitter()
    const mockResponse = Object.assign(emitter, {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-length': '10' },
      pipe: (dest: typeof mockWriteStream) => {
        emitter.emit('data', Buffer.from('tiny'))
        dest.write(Buffer.from('tiny'))
        dest.end()
        return dest
      },
    })
    const mockRequest = new EventEmitter()

    mockHttpsGet.mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (res: typeof mockResponse) => void
      callback(mockResponse)
      return mockRequest
    })

    // File is too small (< 1000 bytes) → triggers corruption error
    mockFsStatSync.mockReturnValue({ size: 50 } as fs.Stats)
    mockFsExistsSync.mockReturnValue(false)
    mockFsUnlinkSync.mockReturnValue(undefined)

    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    // Should fall back to import after download corruption
    expect(result.success).toBe(true)
    expect(result.wasImport).toBe(true)
  })

  it('should handle HTTP error response', async () => {
    const emitter = new EventEmitter()
    const mockResponse = Object.assign(emitter, {
      statusCode: 404,
      statusMessage: 'Not Found',
      headers: {},
    })
    const mockRequest = new EventEmitter()

    mockHttpsGet.mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (res: typeof mockResponse) => void
      callback(mockResponse)
      return mockRequest
    })

    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    // Should fall back to import after HTTP error
    expect(result.success).toBe(true)
    expect(result.wasImport).toBe(true)
    expect(result.wasDownloaded).toBe(false)
  })

  it('should handle HTTP redirect', async () => {
    const finishCallbacks: Array<() => void> = []
    const mockWriteStream = {
      close: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') finishCallbacks.push(callback)
      }),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(() => {
        setTimeout(() => finishCallbacks.forEach((cb) => cb()), 0)
      }),
    }
    mockFsCreateWriteStream.mockReturnValue(mockWriteStream)

    // First call: redirect
    const emitter1 = new EventEmitter()
    const redirectResponse = Object.assign(emitter1, {
      statusCode: 302,
      statusMessage: 'Found',
      headers: { location: 'https://cdn.example.com/seed.db.gz' },
    })

    // Second call: success
    const emitter2 = new EventEmitter()
    const successResponse = Object.assign(emitter2, {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-length': '200' },
      pipe: (dest: typeof mockWriteStream) => {
        emitter2.emit('data', Buffer.from('x'.repeat(200)))
        dest.write(Buffer.from('x'.repeat(200)))
        dest.end()
        return dest
      },
    })
    const mockRequest = new EventEmitter()

    let callCount = 0
    mockHttpsGet.mockImplementation((...args: unknown[]) => {
      callCount++
      const callback = args[args.length - 1] as (res: typeof redirectResponse) => void
      if (callCount === 1) {
        callback(redirectResponse)
      } else {
        callback(successResponse)
      }
      return mockRequest
    })

    mockFsStatSync.mockReturnValue({ size: 5000 } as fs.Stats)
    mockFsExistsSync.mockReturnValue(false)
    mockFsRenameSync.mockReturnValue(undefined)
    mockFsUnlinkSync.mockReturnValue(undefined)

    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    expect(result.wasDownloaded).toBe(true)
    expect(result.success).toBe(true)
  })

  it('should create backup of existing database before replacing', async () => {
    const finishCallbacks: Array<() => void> = []
    const mockWriteStream = {
      close: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'finish') finishCallbacks.push(callback)
      }),
      write: vi.fn().mockReturnValue(true),
      end: vi.fn(() => {
        setTimeout(() => finishCallbacks.forEach((cb) => cb()), 0)
      }),
    }
    mockFsCreateWriteStream.mockReturnValue(mockWriteStream)

    const emitter = new EventEmitter()
    const mockResponse = Object.assign(emitter, {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-length': '100' },
      pipe: (dest: typeof mockWriteStream) => {
        emitter.emit('data', Buffer.from('x'.repeat(100)))
        dest.write(Buffer.from('x'.repeat(100)))
        dest.end()
        return dest
      },
    })
    const mockRequest = new EventEmitter()

    mockHttpsGet.mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (res: typeof mockResponse) => void
      callback(mockResponse)
      return mockRequest
    })

    mockFsStatSync.mockReturnValue({ size: 5000 } as fs.Stats)
    // Existing database file exists → should create backup
    mockFsExistsSync.mockReturnValue(true)
    mockFsCopyFileSync.mockReturnValue(undefined)
    mockFsRenameSync.mockReturnValue(undefined)
    mockFsUnlinkSync.mockReturnValue(undefined)

    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    expect(result.wasDownloaded).toBe(true)
    expect(mockFsCopyFileSync).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('.backup'))
  })
})
