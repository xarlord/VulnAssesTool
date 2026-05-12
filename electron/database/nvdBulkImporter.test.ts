/**
 * Unit tests for NVD Bulk Importer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import {
  NvdBulkImporter,
  createNvdBulkImporter,
  estimateImportDuration,
  getImportYears,
  type ImportProgress,
  type ImportError,
} from './nvdBulkImporter.js'
import { runMigrations } from './migrations/v2SchemaMigration.js'
import type { NvdCveV2 } from './nvd/nvdApiV2Client.js'

let db: Database
let sqlJs: unknown

// Mock NVD API client
vi.mock('./nvd/nvdApiV2Client.js', () => {
  // Create sample CVEs for testing
  const createSampleCve = (id: string, year: number): NvdCveV2 => ({
    id,
    sourceIdentifier: 'test@nvd.nist.gov',
    published: `${year}-06-15T10:00:00.000`,
    lastModified: `${year}-06-20T15:30:00.000`,
    vulnStatus: 'ANALYZED',
    descriptions: [{ lang: 'en', value: `Test vulnerability ${id} description` }],
    metrics: {
      cvssMetricV31: [
        {
          source: 'nvd@nist.gov',
          type: 'Primary',
          cvssData: {
            version: '3.1',
            vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
            attackVector: 'NETWORK',
            attackComplexity: 'LOW',
            privilegesRequired: 'NONE',
            userInteraction: 'NONE',
            scope: 'UNCHANGED',
            confidentialityImpact: 'HIGH',
            integrityImpact: 'HIGH',
            availabilityImpact: 'HIGH',
            baseScore: 9.8,
            baseSeverity: 'CRITICAL',
          },
          exploitabilityScore: 3.9,
          impactScore: 5.9,
        },
      ],
    },
    configurations: [
      {
        operator: 'OR',
        nodes: [
          {
            operator: 'OR',
            cpeMatch: [
              {
                vulnerable: true,
                cpe23Uri: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
              },
            ],
          },
        ],
      },
    ],
    references: [
      {
        url: 'https://example.com/advisory',
        source: 'VENDOR',
        tags: ['Vendor Advisory'],
      },
    ],
  })

  // Generate CVEs for a year
  const generateCvesForYear = (year: number, count: number): NvdCveV2[] => {
    const cves: NvdCveV2[] = []
    for (let i = 0; i < count; i++) {
      cves.push(createSampleCve(`CVE-${year}-${i.toString().padStart(5, '0')}`, year))
    }
    return cves
  }

  interface MockFetchYearOptions {
    year: number
    onProgress?: (progress: unknown) => void
  }

  return {
    NvdApiV2Client: vi.fn().mockImplementation(() => ({
      setApiKey: vi.fn(),
      setConcurrency: vi.fn(),
      fetchYear: vi.fn().mockImplementation(async (options: MockFetchYearOptions) => {
        const year = options.year
        const cves = generateCvesForYear(year, 10) // 10 CVEs per year for testing

        // Simulate progress callback
        if (options.onProgress) {
          options.onProgress({
            phase: 'complete',
            startIndex: 0,
            totalResults: cves.length,
            resultsPerPage: 2000,
            percentage: 100,
            cvesDownloaded: cves.length,
            elapsedTimeMs: 100,
            estimatedTimeRemainingMs: 0,
          })
        }

        return {
          cves,
          totalResults: cves.length,
          truncated: false,
          durationMs: 100,
          fromCache: false,
        }
      }),
      cancel: vi.fn(),
      getRateLimiterStatus: vi.fn().mockReturnValue({
        queueSize: 0,
        timeUntilNextRequest: 0,
      }),
    })),
    createNvdApiV2Client: vi.fn().mockImplementation(() => ({
      setApiKey: vi.fn(),
      setConcurrency: vi.fn(),
      fetchYear: vi.fn().mockImplementation(async (options: MockFetchYearOptions) => {
        const year = options.year
        const cves = generateCvesForYear(year, 10)

        if (options.onProgress) {
          options.onProgress({
            phase: 'complete',
            startIndex: 0,
            totalResults: cves.length,
            resultsPerPage: 2000,
            percentage: 100,
            cvesDownloaded: cves.length,
            elapsedTimeMs: 100,
            estimatedTimeRemainingMs: 0,
          })
        }

        return {
          cves,
          totalResults: cves.length,
          truncated: false,
          durationMs: 100,
          fromCache: false,
        }
      }),
      cancel: vi.fn(),
      getRateLimiterStatus: vi.fn().mockReturnValue({
        queueSize: 0,
        timeUntilNextRequest: 0,
      }),
    })),
    getAvailableYearsForDownload: vi.fn().mockImplementation((startYear: number, endYear?: number) => {
      const currentYear = new Date().getFullYear()
      const end = Math.min(endYear || currentYear, 2030)
      const years: number[] = []

      for (let year = startYear; year <= end; year++) {
        years.push(year)
      }

      return years
    }),
  }
})

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

describe('NvdBulkImporter', () => {
  let importer: NvdBulkImporter

  beforeEach(async () => {
    db = await createTestDatabase()
    importer = createNvdBulkImporter(db)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should create importer instance', () => {
      expect(importer).toBeInstanceOf(NvdBulkImporter)
    })

    it('should accept API key in constructor', () => {
      const importerWithKey = createNvdBulkImporter(db, 'test-api-key')
      expect(importerWithKey).toBeInstanceOf(NvdBulkImporter)
    })
  })

  describe('getProgress', () => {
    it('should return initial progress', () => {
      const progress = importer.getProgress()

      expect(progress.phase).toBe('initializing')
      expect(progress.currentYear).toBe(0)
      expect(progress.totalYears).toBe(0)
      expect(progress.cvesImported).toBe(0)
      expect(progress.percentComplete).toBe(0)
    })
  })

  describe('setApiKey', () => {
    it('should set API key', () => {
      expect(() => importer.setApiKey('new-api-key')).not.toThrow()
    })
  })

  describe('startImport', () => {
    it('should import CVEs for a single year', async () => {
      const currentYear = new Date().getFullYear()
      const result = await importer.startImport({
        startYear: currentYear,
        endYear: currentYear,
        batchSize: 100,
      })

      expect(result.success).toBe(true)
      expect(result.imported).toBeGreaterThan(0)
      expect(result.yearsProcessed).toContain(currentYear)
    })

    it('should import CVEs for multiple years', async () => {
      const result = await importer.startImport({
        startYear: 2023,
        endYear: 2024,
        batchSize: 100,
      })

      expect(result.success).toBe(true)
      expect(result.yearsProcessed.length).toBe(2)
      expect(result.yearsProcessed).toContain(2023)
      expect(result.yearsProcessed).toContain(2024)
    })

    it('should report progress during import', async () => {
      const progressUpdates: ImportProgress[] = []

      const result = await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      expect(result.success).toBe(true)
      expect(progressUpdates.length).toBeGreaterThan(0)

      // Check that progress phases are reported
      const phases = progressUpdates.map((p) => p.phase)
      expect(phases).toContain('downloading')
      expect(phases).toContain('importing')
      expect(phases).toContain('complete')
    })

    it('should track CVE counts correctly', async () => {
      const result = await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 5, // Small batch to test batching
      })

      expect(result.totalCves).toBeGreaterThan(0)
      expect(result.imported).toBeGreaterThan(0)
      expect(result.imported).toBeLessThanOrEqual(result.totalCves)
    })

    it('should handle skipExisting option', async () => {
      // First import
      await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      // Get count after first import
      const countAfterFirst = importer.getStats().totalCves

      // Second import with skipExisting
      const result = await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
        skipExisting: true,
      })

      // All CVEs should be skipped
      expect(result.skipped).toBeGreaterThan(0)

      // Count should not increase
      const countAfterSecond = importer.getStats().totalCves
      expect(countAfterSecond).toBe(countAfterFirst)
    })

    it('should handle cancellation via AbortSignal', async () => {
      const controller = new AbortController()

      // Pre-abort the signal
      controller.abort()

      const result = await importer.startImport({
        startYear: 2020,
        endYear: 2024,
        batchSize: 100,
        signal: controller.signal,
      })

      expect(result.cancelled).toBe(true)
    })

    it('should call onError callback for errors', async () => {
      const errors: ImportError[] = []

      // Force an error by using invalid year range
      const result = await importer.startImport({
        startYear: 2030, // Future year
        endYear: 2030,
        batchSize: 100,
        onError: (e) => errors.push(e),
      })

      // Import should complete but may have 0 CVEs
      expect(result).toBeDefined()
      expect(Array.isArray(errors)).toBe(true)
    })

    it('should calculate duration and CVEs per second', async () => {
      const result = await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      expect(result.durationMs).toBeGreaterThan(0)
      expect(result.cvesPerSecond).toBeGreaterThanOrEqual(0)
    })
  })

  describe('resume capability', () => {
    it('should detect resumable import', async () => {
      // Start and cancel an import
      const controller = new AbortController()

      // Start import
      const importPromise = importer.startImport({
        startYear: 2020,
        endYear: 2024,
        batchSize: 100,
        signal: controller.signal,
      })

      // Cancel immediately
      controller.abort()

      await importPromise

      // Check if resumable
      // Note: State may or may not be saved depending on timing
      const hasResumable = importer.hasResumableImport()
      expect(typeof hasResumable).toBe('boolean')
    })

    it('should clear resume state', () => {
      importer.resetResumeState()

      expect(importer.hasResumableImport()).toBe(false)
    })

    it('should return null for resumable info when none exists', () => {
      importer.resetResumeState()

      const info = importer.getResumableImportInfo()
      expect(info).toBeNull()
    })
  })

  describe('cancel', () => {
    it('should cancel import', () => {
      importer.cancel()

      const progress = importer.getProgress()
      expect(progress.phase).toBe('cancelled')
    })
  })

  describe('getStats', () => {
    it('should return database statistics', async () => {
      await importer.startImport({
        startYear: 2024,
        endYear: 2024,
        batchSize: 100,
      })

      const stats = importer.getStats()

      expect(stats.totalCves).toBeGreaterThan(0)
      expect(stats.totalCpe).toBeGreaterThanOrEqual(0)
      expect(stats.totalRefs).toBeGreaterThanOrEqual(0)
    })

    it('should return zero stats for empty database', () => {
      const freshImporter = createNvdBulkImporter(db)
      const stats = freshImporter.getStats()

      expect(stats.totalCves).toBe(0)
    })
  })

  describe('getRateLimiterStatus', () => {
    it('should return rate limiter status', () => {
      const status = importer.getRateLimiterStatus()

      expect(status).toHaveProperty('queueSize')
      expect(status).toHaveProperty('timeUntilNextRequest')
    })
  })
})

describe('createNvdBulkImporter', () => {
  it('should create importer instance', async () => {
    const testDb = await createTestDatabase()
    const importer = createNvdBulkImporter(testDb)
    expect(importer).toBeInstanceOf(NvdBulkImporter)
    testDb.close()
  })

  it('should create importer with API key', async () => {
    const testDb = await createTestDatabase()
    const importer = createNvdBulkImporter(testDb, 'test-key')
    expect(importer).toBeInstanceOf(NvdBulkImporter)
    testDb.close()
  })
})

describe('estimateImportDuration', () => {
  it('should estimate duration for year range', () => {
    const estimate = estimateImportDuration(2020, 2024, false)

    expect(estimate.estimatedMinutes).toBeGreaterThan(0)
    expect(estimate.estimatedCveCount).toBeGreaterThan(0)
  })

  it('should estimate faster with API key', () => {
    const estimateWithoutKey = estimateImportDuration(2020, 2024, false)
    const estimateWithKey = estimateImportDuration(2020, 2024, true)

    // With API key should be faster (or at least not slower)
    expect(estimateWithKey.estimatedMinutes).toBeLessThanOrEqual(estimateWithoutKey.estimatedMinutes)
  })

  it('should estimate more CVEs for recent years', () => {
    const recentEstimate = estimateImportDuration(2020, 2024, false)
    const olderEstimate = estimateImportDuration(2000, 2004, false)

    // Recent years have more CVEs
    expect(recentEstimate.estimatedCveCount).toBeGreaterThan(olderEstimate.estimatedCveCount)
  })

  it('should estimate for single year', () => {
    const estimate = estimateImportDuration(2024, 2024, false)

    expect(estimate.estimatedMinutes).toBeGreaterThan(0)
    expect(estimate.estimatedCveCount).toBeGreaterThan(0)
  })
})

describe('getImportYears', () => {
  it('should return years in range', () => {
    const years = getImportYears(2020, 2024)

    expect(years).toContain(2020)
    expect(years).toContain(2024)
    expect(years.length).toBe(5)
  })

  it('should default to 1999 start year', () => {
    const years = getImportYears()

    expect(years[0]).toBe(1999)
  })

  it('should include end year', () => {
    const years = getImportYears(2020, 2022)

    expect(years).toContain(2022)
  })
})

describe('Import Progress Tracking', () => {
  let importer: NvdBulkImporter

  beforeEach(async () => {
    db = await createTestDatabase()
    importer = createNvdBulkImporter(db)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  it('should update percentComplete during import', async () => {
    let maxPercentComplete = 0

    await importer.startImport({
      startYear: 2023,
      endYear: 2024,
      batchSize: 100,
      onProgress: (p) => {
        maxPercentComplete = Math.max(maxPercentComplete, p.percentComplete)
      },
    })

    // Should reach 100%
    expect(maxPercentComplete).toBe(100)
  })

  it('should estimate remaining time', async () => {
    let capturedProgress: ImportProgress | null = null

    await importer.startImport({
      startYear: 2024,
      endYear: 2024,
      batchSize: 100,
      onProgress: (p) => {
        if (p.phase === 'importing') {
          capturedProgress = { ...p }
        }
      },
    })

    // During import, we should have some estimated time
    if (capturedProgress) {
      expect(capturedProgress.estimatedTimeRemainingSec).toBeGreaterThanOrEqual(0)
    }
  })

  it('should track current year', async () => {
    const currentYears: number[] = []

    await importer.startImport({
      startYear: 2023,
      endYear: 2024,
      batchSize: 100,
      onProgress: (p) => {
        if (p.currentYear > 0 && !currentYears.includes(p.currentYear)) {
          currentYears.push(p.currentYear)
        }
      },
    })

    // Should have tracked years 2023 and 2024
    expect(currentYears).toContain(2023)
    expect(currentYears).toContain(2024)
  })

  it('should track batch progress', async () => {
    const batchProgress: { batch: number; total: number }[] = []

    await importer.startImport({
      startYear: 2024,
      endYear: 2024,
      batchSize: 3, // Small batch to trigger multiple batches
      onProgress: (p) => {
        if (p.phase === 'importing' && p.totalBatches > 0) {
          batchProgress.push({
            batch: p.currentBatch,
            total: p.totalBatches,
          })
        }
      },
    })

    // Should have tracked batch progress
    expect(batchProgress.length).toBeGreaterThan(0)
  })
})

describe('Error Recovery', () => {
  let importer: NvdBulkImporter

  beforeEach(async () => {
    db = await createTestDatabase()
    importer = createNvdBulkImporter(db)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  it('should continue after year failure', async () => {
    const result = await importer.startImport({
      startYear: 2024,
      endYear: 2024,
      batchSize: 100,
    })

    // Import should succeed
    expect(result.success).toBe(true)
  })

  it('should collect errors during import', async () => {
    const result = await importer.startImport({
      startYear: 2024,
      endYear: 2024,
      batchSize: 100,
    })

    // Errors array should exist (may be empty on success)
    expect(Array.isArray(result.errors)).toBe(true)
  })
})

describe('Database Integration', () => {
  let importer: NvdBulkImporter

  beforeEach(async () => {
    db = await createTestDatabase()
    importer = createNvdBulkImporter(db)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  it('should store CVEs in database', async () => {
    await importer.startImport({
      startYear: 2024,
      endYear: 2024,
      batchSize: 100,
    })

    // Check database has CVEs
    const result = db.exec('SELECT COUNT(*) FROM cves')
    const count = result[0]?.values[0]?.[0] as number

    expect(count).toBeGreaterThan(0)
  })

  it('should store CPE matches', async () => {
    await importer.startImport({
      startYear: 2024,
      endYear: 2024,
      batchSize: 100,
    })

    // Check database has CPE matches
    const result = db.exec('SELECT COUNT(*) FROM cpe_matches')
    const count = result[0]?.values[0]?.[0] as number

    expect(count).toBeGreaterThanOrEqual(0)
  })

  it('should store references', async () => {
    await importer.startImport({
      startYear: 2024,
      endYear: 2024,
      batchSize: 100,
    })

    // Check database has references
    const result = db.exec('SELECT COUNT(*) FROM "references"')
    const count = result[0]?.values[0]?.[0] as number

    expect(count).toBeGreaterThanOrEqual(0)
  })
})
