/**
 * Unit tests for Database Version Manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import {
  DbVersionManager,
  createDbVersionManager,
  generateVersion,
  getCurrentBuildDate,
  SEED_VERSIONS,
} from './dbVersionManager.js'
import { runMigrations } from './migrations/v2SchemaMigration.js'

let db: Database
let sqlJs: unknown

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

describe('DbVersionManager', () => {
  let versionManager: DbVersionManager

  beforeEach(async () => {
    db = await createTestDatabase()
    versionManager = createDbVersionManager(db, {
      appVersion: '2.0.0',
      schemaVersion: 10,
      minSchemaVersion: 1,
    })
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  describe('getVersion', () => {
    it('should return default version for new database', () => {
      const version = versionManager.getVersion()

      expect(version.version).toBe('0.0.0-0')
      expect(version.major).toBe(0)
      expect(version.minor).toBe(0)
      expect(version.patch).toBe(0)
      expect(version.buildDate).toBe(0)
    })

    it('should return version after setting', () => {
      versionManager.setVersion({
        version: '2.1.0-20250224',
        schemaVersion: 10,
        seedVersion: '20250224',
        seedDate: '2025-02-24',
        seedCveCount: 50000,
      })

      const version = versionManager.getVersion()

      expect(version.version).toBe('2.1.0-20250224')
      expect(version.major).toBe(2)
      expect(version.minor).toBe(1)
      expect(version.patch).toBe(0)
      expect(version.buildDate).toBe(20250224)
      expect(version.schemaVersion).toBe(10)
      expect(version.seedVersion).toBe('20250224')
      expect(version.seedDate).toBe('2025-02-24')
      expect(version.seedCveCount).toBe(50000)
    })
  })

  describe('setVersion', () => {
    it('should set version string', () => {
      versionManager.setVersion({ version: '3.0.0-20251231' })
      const version = versionManager.getVersion()

      expect(version.version).toBe('3.0.0-20251231')
      expect(version.major).toBe(3)
    })

    it('should set seed information', () => {
      versionManager.setVersion({
        seedVersion: '20250224',
        seedDate: '2025-02-24',
        seedCveCount: 60000,
      })

      const version = versionManager.getVersion()

      expect(version.seedVersion).toBe('20250224')
      expect(version.seedDate).toBe('2025-02-24')
      expect(version.seedCveCount).toBe(60000)
    })

    it('should set last sync time', () => {
      const syncTime = '2025-02-24T12:00:00.000Z'
      versionManager.setVersion({ lastSyncAt: syncTime })

      const version = versionManager.getVersion()
      expect(version.lastSyncAt).toBe(syncTime)
    })
  })

  describe('isCompatible', () => {
    it('should return true for compatible schema', () => {
      versionManager.setVersion({ schemaVersion: 10 })
      expect(versionManager.isCompatible()).toBe(true)
    })

    it('should return true for newer schema', () => {
      versionManager.setVersion({ schemaVersion: 15 })
      expect(versionManager.isCompatible()).toBe(true)
    })

    it('should return false for older schema', () => {
      const oldVersionManager = createDbVersionManager(db, {
        appVersion: '2.0.0',
        schemaVersion: 10,
        minSchemaVersion: 5,
      })

      oldVersionManager.setVersion({ schemaVersion: 3 })
      expect(oldVersionManager.isCompatible()).toBe(false)
    })
  })

  describe('isFirstRun', () => {
    it('should return true for new database', () => {
      expect(versionManager.isFirstRun()).toBe(true)
    })

    it('should return false after seeding', () => {
      versionManager.recordSeed('2.0.0-20250224', 50000, '2025-02-24')
      expect(versionManager.isFirstRun()).toBe(false)
    })

    it('should return true for incompatible schema', () => {
      versionManager.setVersion({
        version: '2.0.0-20250224',
        schemaVersion: 0,
      })

      expect(versionManager.isFirstRun()).toBe(true)
    })
  })

  describe('needsUpdate', () => {
    it('should return true when newer seed available', () => {
      versionManager.recordSeed('2.0.0-20250101', 50000, '2025-01-01')

      const needsUpdate = versionManager.needsUpdate('2.0.0-20250224', '2025-02-24')
      expect(needsUpdate).toBe(true)
    })

    it('should return false when on latest seed', () => {
      versionManager.recordSeed('2.0.0-20250224', 50000, '2025-02-24')

      const needsUpdate = versionManager.needsUpdate('2.0.0-20250224', '2025-02-24')
      expect(needsUpdate).toBe(false)
    })

    it('should return true for older seed date', () => {
      versionManager.recordSeed('2.0.0-20250220', 50000, '2025-02-20')

      const needsUpdate = versionManager.needsUpdate('2.0.0-20250224', '2025-02-24')
      expect(needsUpdate).toBe(true)
    })
  })

  describe('compareVersions', () => {
    it('should return "same" for equal versions', () => {
      expect(versionManager.compareVersions('2.0.0-20250224', '2.0.0-20250224')).toBe('same')
    })

    it('should return "newer" for higher minor version', () => {
      expect(versionManager.compareVersions('2.1.0-20250224', '2.0.0-20250224')).toBe('newer')
    })

    it('should return "older" for lower patch version', () => {
      expect(versionManager.compareVersions('2.0.0-20250224', '2.0.1-20250224')).toBe('older')
    })

    it('should return "incompatible" for different major versions', () => {
      expect(versionManager.compareVersions('3.0.0-20250224', '2.0.0-20250224')).toBe('incompatible')
    })

    it('should compare build dates', () => {
      expect(versionManager.compareVersions('2.0.0-20250224', '2.0.0-20250220')).toBe('newer')
      expect(versionManager.compareVersions('2.0.0-20250220', '2.0.0-20250224')).toBe('older')
    })
  })

  describe('compareSeedVersions', () => {
    it('should compare numeric seed versions', () => {
      expect(versionManager.compareSeedVersions('20250224', '20250220')).toBe('newer')
      expect(versionManager.compareSeedVersions('20250220', '20250224')).toBe('older')
      expect(versionManager.compareSeedVersions('20250224', '20250224')).toBe('same')
    })

    it('should fall back to semantic version comparison', () => {
      expect(versionManager.compareSeedVersions('2.0.0', '1.0.0')).toBe('newer')
      expect(versionManager.compareSeedVersions('1.0.0', '2.0.0')).toBe('older')
    })
  })

  describe('recordSeed', () => {
    it('should record seed information', () => {
      versionManager.recordSeed('2.0.0-20250224', 60000, '2025-02-24')

      const version = versionManager.getVersion()

      expect(version.version).toBe('2.0.0-20250224')
      expect(version.seedVersion).toBe('2.0.0-20250224')
      expect(version.seedDate).toBe('2025-02-24')
      expect(version.seedCveCount).toBe(60000)
      expect(version.schemaVersion).toBe(10)
    })
  })

  describe('recordSync', () => {
    it('should record sync timestamp', () => {
      const syncTime = '2025-02-24T15:30:00.000Z'
      versionManager.recordSync(syncTime)

      const version = versionManager.getVersion()
      expect(version.lastSyncAt).toBe(syncTime)
    })
  })

  describe('getSeedInfo', () => {
    it('should return seed info for new database', () => {
      const info = versionManager.getSeedInfo()

      expect(info.hasSeed).toBe(false)
      expect(info.seedDate).toBeNull()
      expect(info.cveCount).toBe(0)
      expect(info.needsHistoricalSync).toBe(false)
    })

    it('should return seed info after seeding', () => {
      versionManager.recordSeed('2.0.0-20250224', 60000, '2025-02-24')

      const info = versionManager.getSeedInfo()

      expect(info.hasSeed).toBe(true)
      expect(info.seedDate).toBe('2025-02-24')
      expect(info.cveCount).toBe(60000)
    })

    it('should indicate need for historical sync', () => {
      // Add some CVEs but not enough for full history
      db.run(`INSERT INTO cves (id, description, published_at, modified_at, source)
              VALUES ('CVE-2024-00001', 'Test', '2024-01-01', '2024-01-01', 'NVD')`)

      versionManager.recordSeed('2.0.0-20250224', 1, '2025-02-24')

      const info = versionManager.getSeedInfo()

      expect(info.hasSeed).toBe(true)
      expect(info.needsHistoricalSync).toBe(true) // Only 1 CVE, less than 200K
    })
  })
})

describe('createDbVersionManager', () => {
  it('should create version manager with default options', async () => {
    const testDb = await createTestDatabase()
    const vm = createDbVersionManager(testDb)

    expect(vm).toBeInstanceOf(DbVersionManager)
    testDb.close()
  })

  it('should create version manager with custom options', async () => {
    const testDb = await createTestDatabase()
    const vm = createDbVersionManager(testDb, {
      appVersion: '3.0.0',
      schemaVersion: 15,
      minSchemaVersion: 10,
    })

    expect(vm).toBeInstanceOf(DbVersionManager)
    testDb.close()
  })
})

describe('generateVersion', () => {
  it('should generate version string', () => {
    const version = generateVersion(2, 1, 0, 20250224)
    expect(version).toBe('2.1.0-20250224')
  })

  it('should use current date if buildDate not provided', () => {
    const version = generateVersion(2, 0, 0)
    const buildDate = parseInt(getCurrentBuildDate(), 10)

    expect(version).toBe(`2.0.0-${buildDate}`)
  })
})

describe('getCurrentBuildDate', () => {
  it('should return date in YYYYMMDD format', () => {
    const date = getCurrentBuildDate()

    expect(date).toMatch(/^\d{8}$/)
    expect(date.length).toBe(8)
  })
})

describe('SEED_VERSIONS', () => {
  it('should have latest version defined', () => {
    expect(SEED_VERSIONS.LATEST).toBeDefined()
    expect(SEED_VERSIONS.LATEST).toMatch(/^\d+\.\d+\.\d+-\d+$/)
  })

  it('should have minimum compatible version defined', () => {
    expect(SEED_VERSIONS.MIN_COMPATIBLE).toBeDefined()
  })

  it('should have pre-seed years defined', () => {
    expect(SEED_VERSIONS.PRE_SEED_YEARS).toBeDefined()
    expect(Array.isArray(SEED_VERSIONS.PRE_SEED_YEARS)).toBe(true)
    expect(SEED_VERSIONS.PRE_SEED_YEARS.length).toBe(2)
  })

  it('should have historical start year defined', () => {
    expect(SEED_VERSIONS.HISTORICAL_START_YEAR).toBe(1999)
  })
})
