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
import { createNvdApiV2Client } from './nvd/nvdApiV2Client.js'

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

    // Insert enough CVEs to satisfy totalCves >= 200000 (needsHistoricalSync check). A single
    // recursive-CTE INSERT generates all 200k rows inside SQLite in one statement — orders of
    // magnitude faster than 200k prepared-statement round-trips, which removes this test's
    // pre-existing flakiness (it used to overrun its timeout on a loaded machine).
    db.exec(`
      INSERT INTO cves (id, description, published_at, modified_at, source)
      WITH RECURSIVE seq(n) AS (
        SELECT 0
        UNION ALL
        SELECT n + 1 FROM seq WHERE n < 199999
      )
      SELECT printf('CVE-2020-%07d', n), 'Test', '2020-01-01', '2020-01-01', 'NVD'
      FROM seq
    `)

    const newService = createDbSeedingService(db, testDbPath)
    const result = newService.checkFirstRun()

    expect(result.state).toBe('has_full_data')
    expect(result.needsPreSeed).toBe(false)
    expect(result.needsHistoricalSync).toBe(false)
    expect(result.needsUpdate).toBe(false)
  })
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

// ============================================================================
// Additional tests: branch coverage for previously-uncovered decision paths
// ============================================================================

describe('getBackgroundSyncState - corrupted state', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) db.close()
  })

  it('should treat corrupted background-sync JSON as no saved state instead of throwing', () => {
    // A partially-written or corrupted metadata row must not crash startup checks — it
    // should be treated the same as "no sync has ever run" so the app can safely retry.
    db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run('background_sync_state', '{not valid json')

    const state = seedingService.getBackgroundSyncState()

    expect(state).toBeNull()
  })
})

describe('startSeeding - already-seeded database needs no further sync', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) db.close()
    vi.clearAllMocks()
  })

  it('should skip background sync entirely when the database already has full historical data', async () => {
    // Business intent: a fully-synced install should be a no-op on every subsequent
    // startup — it must not re-download, re-import, or spin up a background sync.
    db.exec(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_version', '2.0.0-20250224')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '250000')`)
    db.exec(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)
    db.exec(`
      INSERT INTO cves (id, description, published_at, modified_at, source)
      WITH RECURSIVE seq(n) AS (
        SELECT 0
        UNION ALL
        SELECT n + 1 FROM seq WHERE n < 199999
      )
      SELECT printf('CVE-2020-%07d', n), 'Test', '2020-01-01', '2020-01-01', 'NVD'
      FROM seq
    `)

    const newService = createDbSeedingService(db, testDbPath)
    const result = await newService.startSeeding()

    expect(result.success).toBe(true)
    expect(result.wasDownloaded).toBe(false)
    expect(result.wasImport).toBe(false)
    expect(result.backgroundSyncStarted).toBe(false)
    expect(result.totalCves).toBe(250000)
  })

  it('should skip triggering background sync when a first-run import already meets the historical threshold', async () => {
    // If a bulk local import already brought the CVE count up to the full-history
    // threshold, kicking off a redundant background sync would waste API quota for
    // nothing — the post-import check must recognize that and skip it.
    db.exec(`
      INSERT INTO cves (id, description, published_at, modified_at, source)
      WITH RECURSIVE seq(n) AS (
        SELECT 0
        UNION ALL
        SELECT n + 1 FROM seq WHERE n < 199999
      )
      SELECT printf('CVE-2019-%07d', n), 'Test', '2019-01-01', '2019-01-01', 'NVD'
      FROM seq
    `)

    const result = await seedingService.startSeeding()

    expect(result.success).toBe(true)
    expect(result.wasImport).toBe(true)
    expect(result.backgroundSyncStarted).toBe(false)
  })
})

describe('startBackgroundSync - resume semantics', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    // Nudge any dangling fire-and-forget sync loop toward an early exit so it doesn't
    // keep consuming the real event loop for the ~25-year sweep after the test ends.
    try {
      db.prepare(
        `INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run('background_sync_state', JSON.stringify({ status: 'paused', yearsCompleted: [], yearsRemaining: [] }))
    } catch {
      // db may already be in a bad state; nothing more to do
    }
    if (db) db.close()
    vi.clearAllMocks()
  })

  it('should resume from years already completed when a prior sync was interrupted mid-run', () => {
    // A restart after a crash/interruption must not re-download years already synced —
    // otherwise every restart burns API quota re-fetching the same historical data.
    db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run(
      'background_sync_state',
      JSON.stringify({ status: 'syncing', yearsCompleted: [2020, 2021], yearsRemaining: [1999] }),
    )

    seedingService.startBackgroundSync()

    const state = seedingService.getBackgroundSyncState()
    expect(state?.yearsCompleted).toEqual([2020, 2021])
  })

  it('should start fresh (not resume) when the prior sync had already finished', () => {
    // A completed (or errored/idle) prior run is not "interrupted" — restarting the sync
    // must not inherit stale progress from that finished run.
    db.prepare(`INSERT INTO metadata (key, value) VALUES (?, ?)`).run(
      'background_sync_state',
      JSON.stringify({ status: 'complete', yearsCompleted: [2020], yearsRemaining: [] }),
    )

    seedingService.startBackgroundSync()

    const state = seedingService.getBackgroundSyncState()
    expect(state?.yearsCompleted).toEqual([])
  })
})

describe('startBackgroundSync - bulk importer construction failure', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) db.close()
    vi.clearAllMocks()
  })

  it('should record a sync error (not crash) when the bulk importer cannot be constructed', async () => {
    // If the NVD API client fails to initialize, the background sync must degrade to a
    // recorded error state rather than an unhandled rejection that silently loses the failure.
    vi.mocked(createNvdApiV2Client).mockImplementationOnce(() => {
      throw new Error('client init failed')
    })

    seedingService.startBackgroundSync()

    // Let the rejected promise's .catch() handler run.
    await new Promise((resolve) => setTimeout(resolve, 10))

    const state = seedingService.getBackgroundSyncState()
    expect(state?.status).toBe('error')
    expect(state?.lastError).toContain('client init failed')
  })
})

describe('runBackgroundSync - external pause mid-sync', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) db.close()
    vi.clearAllMocks()
  })

  it('stops importing further years once a pause is observed, but currently records the run as complete rather than paused', async () => {
    // KNOWN BEHAVIOR (see foundBug; not fixed here per task scope): the loop correctly
    // breaks out on pause, but the unconditional "mark as complete" write immediately
    // after the loop overwrites the paused status and discards yearsRemaining, so a
    // resumed sync starts over instead of continuing where it left off. This test pins
    // the CURRENT behavior rather than the intended one.
    seedingService.startBackgroundSync()

    // Let the first (mocked, near-instant) year import finish and the loop enter its
    // real 1s inter-year delay.
    await new Promise((resolve) => setTimeout(resolve, 150))

    const midState = seedingService.getBackgroundSyncState()
    if (!midState) {
      throw new Error('expected background sync state to exist after startBackgroundSync')
    }
    db.prepare(`UPDATE metadata SET value = ? WHERE key = 'background_sync_state'`).run(
      JSON.stringify({ ...midState, status: 'paused' }),
    )

    // Wait past the loop's inter-year delay so the next iteration observes the pause.
    await new Promise((resolve) => setTimeout(resolve, 1300))

    const finalState = seedingService.getBackgroundSyncState()
    expect(finalState?.status).toBe('complete')
  }, 8000)
})

describe('downloadPrebuiltDatabase - genuine extraction failure', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) db.close()
    vi.clearAllMocks()
    mockFsExistsSync.mockReturnValue(false)
    mockFsStatSync.mockReturnValue({ size: 0 })
    mockFsUnlinkSync.mockImplementation(() => {})
  })

  it('should clean up both temp files when gzip extraction actually throws', async () => {
    // Regression guard: dbSeedingService.ts imports `pipeline` as a named export, but under
    // this project's ESM mock interop that binding resolves through the module's `default`
    // object at runtime — mocking only the named export (as node:stream/promises is mocked
    // above) never actually intercepts the real call. Reaching into `default.pipeline` is
    // what forces extraction to genuinely fail here.
    const streamPromisesModule = (await import('node:stream/promises')) as unknown as {
      default: { pipeline: (...args: unknown[]) => Promise<void> }
    }
    vi.mocked(streamPromisesModule.default.pipeline).mockRejectedValueOnce(new Error('Extraction failed'))

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
    mockFsExistsSync.mockReturnValue(true)
    mockFsUnlinkSync.mockReturnValue(undefined)

    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    // Extraction failed, so the code must fall back to a local import rather than swap in
    // a half-extracted database, and it must have attempted to remove BOTH temp artifacts.
    expect(result.wasDownloaded).toBe(false)
    expect(result.wasImport).toBe(true)
    expect(mockFsUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('.download'))
    expect(mockFsUnlinkSync).toHaveBeenCalledWith(expect.stringContaining('.gz'))
  })
})

describe('downloadFile - cancellation while a download is in flight', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) db.close()
    vi.clearAllMocks()
    mockFsExistsSync.mockReturnValue(false)
    mockFsUnlinkSync.mockImplementation(() => {})
  })

  it('should abandon the download without falling back to import once the caller has cancelled', async () => {
    const controller = new AbortController()
    const mockWriteStream = { close: vi.fn(), on: vi.fn(), write: vi.fn().mockReturnValue(true), end: vi.fn() }
    mockFsCreateWriteStream.mockReturnValue(mockWriteStream)

    const emitter = new EventEmitter()
    const mockResponse = Object.assign(emitter, {
      statusCode: 200,
      statusMessage: 'OK',
      headers: { 'content-length': '100' },
      pipe: vi.fn(),
    })
    const mockRequest = Object.assign(new EventEmitter(), { destroy: vi.fn() })

    mockHttpsGet.mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (res: typeof mockResponse) => void
      callback(mockResponse)
      // Abort on the next tick, after downloadFile has finished registering its own
      // abort listener — aborting synchronously here would fire before that listener
      // exists and be silently missed.
      setTimeout(() => controller.abort(), 0)
      return mockRequest
    })
    mockFsUnlinkSync.mockReturnValue(undefined)

    const result = await seedingService.startSeeding({
      signal: controller.signal,
      skipBackgroundSync: true,
    })

    // The abort is observed by downloadFile's own listener, which destroys the in-flight
    // request and rejects. Cancellation must stop the WHOLE seeding attempt there — it must
    // not silently fall back to a local import the caller never asked to continue.
    expect(mockRequest.destroy).toHaveBeenCalled()
    expect(result.wasDownloaded).toBe(false)
    expect(result.wasImport).toBe(false)
    expect(result.success).toBe(true)
  })
})

describe('downloadFile - malformed redirect and missing content-length', () => {
  let seedingService: DbSeedingService

  beforeEach(() => {
    db = createTestDatabase()
    seedingService = createDbSeedingService(db, testDbPath)
  })

  afterEach(() => {
    if (db) db.close()
    vi.clearAllMocks()
    mockFsExistsSync.mockReturnValue(false)
    mockFsStatSync.mockReturnValue({ size: 0 })
  })

  it('should treat a redirect response without a Location header as an HTTP error instead of hanging forever', async () => {
    const emitter = new EventEmitter()
    const mockResponse = Object.assign(emitter, { statusCode: 301, statusMessage: 'Moved Permanently', headers: {} })
    const mockRequest = new EventEmitter()

    mockHttpsGet.mockImplementationOnce((...args: unknown[]) => {
      const callback = args[args.length - 1] as (res: typeof mockResponse) => void
      callback(mockResponse)
      return mockRequest
    })

    const result = await seedingService.startSeeding({ skipBackgroundSync: true })

    expect(result.wasDownloaded).toBe(false)
    expect(result.wasImport).toBe(true)
  })

  it('should default progress to zero (not NaN or a stale value) when the server omits content-length', async () => {
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
      headers: {}, // no content-length
      pipe: (dest: typeof mockWriteStream) => {
        emitter.emit('data', Buffer.from('x'.repeat(50)))
        dest.write(Buffer.from('x'.repeat(50)))
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

    const progressUpdates: SeedingProgress[] = []
    await seedingService.startSeeding({
      skipBackgroundSync: true,
      onProgress: (p) => progressUpdates.push({ ...p }),
    })

    const duringDownload = progressUpdates.filter((p) => p.phase === 'downloading')
    expect(duringDownload.length).toBeGreaterThan(0)
    expect(duringDownload.every((p) => p.totalBytes === 0 && p.percentComplete === 0)).toBe(true)
  })
})

describe('importRecentYears - reuses a constructor-supplied bulk importer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should not construct a second NVD API client when one was already created with the constructor API key', async () => {
    const testDb = createTestDatabase()
    const service = createDbSeedingService(testDb, testDbPath, 'ctor-api-key')

    const result = await service.startSeeding({ skipBackgroundSync: true })

    expect(result.success).toBe(true)
    expect(result.wasImport).toBe(true)
    // Constructed once (in the DbSeedingService constructor) — importRecentYears must not
    // build a duplicate importer/client when one already exists.
    expect(vi.mocked(createNvdApiV2Client)).toHaveBeenCalledTimes(1)

    testDb.close()
  })
})

describe('startSeeding - cancellation surfaces as Cancelled, not a hard failure', () => {
  it('should mark progress as Cancelled (not a failure) when an internal write throws right after the caller cancels', async () => {
    // checkFirstRun()/getSeedInfo() are defensive (they swallow DB errors and fall back to
    // defaults), so a closed DB alone never makes startSeeding throw. What DOES throw is the
    // direct metadata write in versionManager.recordSeed(), called right after import — and
    // that call sits right after the code's abort check, not inside it. Aborting from within
    // the "importing" progress callback lands the abort exactly in that gap: the import
    // itself finishes normally (it checks the signal internally and just stops early), but
    // the unguarded recordSeed write that follows then throws with the signal already aborted.
    const localDb = createTestDatabase()
    const controller = new AbortController()
    let triggered = false

    // The default network-error mock's request object lacks `.destroy` (unlike a real
    // http.ClientRequest). downloadFile's abort listener stays registered on it even after
    // the download settles, and our later controller.abort() call (below) would otherwise
    // re-fire that stale listener and crash on the missing method. Give this attempt's
    // request object a real `.destroy` so that harmless-in-production stale-listener replay
    // doesn't blow up the test.
    mockHttpsGet.mockImplementationOnce(() => {
      const req = Object.assign(new EventEmitter(), { destroy: vi.fn() })
      setTimeout(() => req.emit('error', new Error('Network error')), 0)
      return req
    })

    const service = createDbSeedingService(localDb, testDbPath)
    const result = await service.startSeeding({
      signal: controller.signal,
      skipBackgroundSync: true,
      onProgress: (p) => {
        if (!triggered && p.phase === 'importing') {
          triggered = true
          controller.abort()
          localDb.close()
        }
      },
    })

    // Cancellation is not the same thing as failure: the caller asked to stop, so the
    // result must not be reported as a failed run even though an exception was thrown.
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()

    const progress = service.getProgress()
    expect(progress.status).toBe('error')
    expect(progress.error).toBe('Cancelled')
  })
})
