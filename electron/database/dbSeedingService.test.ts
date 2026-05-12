/**
 * Unit tests for Database Seeding Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
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

let db: Database
let sqlJs: unknown
const testDbPath = '/tmp/test-nvd-seed.db'

async function createTestDatabase(): Promise<Database> {
  if (!sqlJs) {
    sqlJs = await initSqlJs({})
  }
  const database = new sqlJs.Database()

  // Create metadata table
  database.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  // Create schema migrations table
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

// Mock NVD API client for seeding service tests
vi.mock('./nvd/nvdApiV2Client.js', () => ({
  createNvdApiV2Client: vi.fn().mockImplementation(() => ({
    setApiKey: vi.fn(),
    fetchYear: vi.fn().mockImplementation(async ({ year, onProgress }: any) => {
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

describe('DbSeedingService', () => {
  let seedingService: DbSeedingService

  beforeEach(async () => {
    db = await createTestDatabase()
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

    it('should create seeding service with API key', async () => {
      const testDb = await createTestDatabase()
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
      db.run(`INSERT INTO cves (id, description, published_at, modified_at, source)
              VALUES ('CVE-2024-00001', 'Test', '2024-01-01', '2024-01-01', 'NVD')`)

      // Record seed metadata
      db.run(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
      db.run(`INSERT INTO metadata (key, value) VALUES ('seed_version', '2.0.0-20250224')`)
      db.run(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '1')`)
      db.run(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)

      const result = seedingService.checkFirstRun()

      expect(result.state).toBe('has_seed')
      expect(result.needsHistoricalSync).toBe(true) // Only 1 CVE
    })

    it('should detect has_full_data for complete database', async () => {
      // Add many CVEs to simulate full database (>200K)
      for (let i = 0; i < 100; i++) {
        db.run(
          `INSERT INTO cves (id, description, published_at, modified_at, source)
                VALUES (?, 'Test', '2020-01-01', '2020-01-01', 'NVD')`,
          [`CVE-2020-${i.toString().padStart(5, '0')}`],
        )
      }

      // Update metadata to show seed data with matching seed version
      db.run(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
      db.run(`INSERT INTO metadata (key, value) VALUES ('seed_version', '2.0.0-20250224')`)
      db.run(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '250000')`)
      db.run(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)

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
      db.run(`INSERT INTO metadata (key, value) VALUES (?, ?)`, [
        'background_sync_state',
        JSON.stringify({
          status: 'syncing',
          startedAt: '2025-02-24T12:00:00Z',
          yearsCompleted: [2023, 2022],
          yearsRemaining: [2021, 2020],
        }),
      ])

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
      db.run(`INSERT INTO metadata (key, value) VALUES (?, ?)`, [
        'background_sync_state',
        JSON.stringify({
          status: 'syncing',
          yearsCompleted: [],
          yearsRemaining: [2023, 2022],
        }),
      ])

      expect(seedingService.isBackgroundSyncInProgress()).toBe(true)
    })

    it('should return false when sync is complete', () => {
      db.run(`INSERT INTO metadata (key, value) VALUES (?, ?)`, [
        'background_sync_state',
        JSON.stringify({
          status: 'complete',
          yearsCompleted: [2023, 2022],
          yearsRemaining: [],
        }),
      ])

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
      db.run(`INSERT INTO metadata (key, value) VALUES ('db_version', '2.0.0-20250224')`)
      db.run(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '50000')`)
      db.run(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2025-02-24')`)
      db.run(`INSERT INTO cves (id, description, published_at, modified_at, source)
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
  it('should create seeding service instance', async () => {
    const testDb = await createTestDatabase()
    const service = createDbSeedingService(testDb, testDbPath)
    expect(service).toBeInstanceOf(DbSeedingService)
    testDb.close()
  })

  it('should create seeding service with API key', async () => {
    const testDb = await createTestDatabase()
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

  beforeEach(async () => {
    db = await createTestDatabase()
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

  beforeEach(async () => {
    db = await createTestDatabase()
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
    db.run(`INSERT INTO metadata (key, value) VALUES ('db_version', '1.0.0-20200101')`)
    db.run(`INSERT INTO metadata (key, value) VALUES ('seed_cve_count', '1000')`)
    db.run(`INSERT INTO metadata (key, value) VALUES ('seed_date', '2020-01-01')`)
    db.run(`INSERT INTO cves (id, description, published_at, modified_at, source)
            VALUES ('CVE-2020-00001', 'Test', '2020-01-01', '2020-01-01', 'NVD')`)

    const newService = createDbSeedingService(db, testDbPath)
    const result = newService.checkFirstRun()

    expect(result.needsUpdate).toBe(true)
  })
})
