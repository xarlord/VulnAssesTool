/**
 * Unit tests for the consolidated NVD Import Manager (B1).
 *
 * importNvdData now fetches through the injected NvdApiV2Client (REST API v2) and imports
 * into the shared v2-schema database via NvdDataImporter — no feed downloads, no bulk DB.
 * Tests inject a fake client so nothing touches the network.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { importNvdData, getAvailableNvdYears } from './nvdImportManager.js'
import type { NvdApiV2Client, NvdCveV2, NvdFetchResult, NvdDateRangeFetchOptions } from './nvdApiV2Client.js'
import { runMigrations } from '../migrations/v2SchemaMigration.js'

const DAY_MS = 24 * 60 * 60 * 1000

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

function makeCve(id: string): NvdCveV2 {
  return {
    id,
    sourceIdentifier: 'test@nvd.nist.gov',
    published: '2024-06-01T00:00:00.000',
    lastModified: '2024-06-02T00:00:00.000',
    vulnStatus: 'ANALYZED',
    descriptions: [{ lang: 'en', value: `desc for ${id}` }],
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
        },
      ],
    },
    weaknesses: [],
    configurations: [],
    references: [],
  }
}

/** A fake NvdApiV2Client exposing only what the manager uses (fetchDateRange + cancel). */
function makeFakeClient(
  fetchDateRange: (options: NvdDateRangeFetchOptions) => Promise<NvdFetchResult>,
): NvdApiV2Client {
  return {
    fetchDateRange: vi.fn(fetchDateRange),
    cancel: vi.fn(),
  } as unknown as NvdApiV2Client
}

describe('importNvdData (consolidated onto the REST client — B1)', () => {
  let db: InstanceType<typeof Database>

  afterEach(() => {
    if (db) db.close()
    vi.clearAllMocks()
  })

  it('fetches a year via the injected REST client and imports it into the shared DB', async () => {
    // WHY (B1/M9/C6): the old path shelled to dead NVD JSON feeds and a separate bulk DB, so
    // /sync/start imported nothing (404s). It must now fetch through NvdApiV2Client and write
    // the CVEs into the same v2-schema database the rest of the app reads.
    db = createTestDatabase()
    const client = makeFakeClient(async () => ({
      cves: [makeCve('CVE-2024-0001'), makeCve('CVE-2024-0002')],
      totalResults: 2,
      truncated: false,
      durationMs: 1,
      fromCache: false,
    }))

    const result = await importNvdData({ years: [2024], db, apiClient: client, batchSize: 100 })

    expect(result.success).toBe(true)
    expect(result.importedCVEs).toBe(2)
    const row = db.prepare('SELECT COUNT(*) as c FROM cves').get() as { c: number }
    expect(row.c).toBe(2)
  })

  it('sub-chunks a truncated (>50k) year by date so no CVEs are silently dropped', async () => {
    // WHY: a single fetchDateRange caps at 50k and flags truncated. Importing only that page
    // would silently miss the rest of a high-volume year; the manager must split the window
    // and collect every sub-range.
    db = createTestDatabase()
    const fetchDateRange = vi.fn(async (options: NvdDateRangeFetchOptions): Promise<NvdFetchResult> => {
      const spanDays = (options.endDate.getTime() - options.startDate.getTime()) / DAY_MS
      if (spanDays > 200) {
        // Simulate the full-year window exceeding the 50k page cap.
        return { cves: [], totalResults: 60000, truncated: true, durationMs: 1, fromCache: false }
      }
      // Each sub-window returns one distinct CVE keyed by its start day.
      const key = Math.floor(options.startDate.getTime() / DAY_MS)
      return {
        cves: [makeCve(`CVE-2024-${key}`)],
        totalResults: 1,
        truncated: false,
        durationMs: 1,
        fromCache: false,
      }
    })
    const client = makeFakeClient(fetchDateRange)

    const result = await importNvdData({ years: [2024], db, apiClient: client })

    expect(result.success).toBe(true)
    // 1 full-year (truncated) call + 2 half-year sub-range calls.
    expect(fetchDateRange).toHaveBeenCalledTimes(3)
    const row = db.prepare('SELECT COUNT(*) as c FROM cves').get() as { c: number }
    expect(row.c).toBe(2)
  })

  it('records a failing year without aborting the remaining years', async () => {
    // WHY: one bad year (network blip) must not sink the whole import; the others still land.
    db = createTestDatabase()
    const client = makeFakeClient(async (options: NvdDateRangeFetchOptions) => {
      if (options.startDate.getUTCFullYear() === 2023) {
        throw new Error('network error for 2023')
      }
      return {
        cves: [makeCve(`CVE-${options.startDate.getUTCFullYear()}-0001`)],
        totalResults: 1,
        truncated: false,
        durationMs: 1,
        fromCache: false,
      }
    })

    const result = await importNvdData({ years: [2023, 2024], db, apiClient: client })

    expect(result.success).toBe(false)
    expect(result.yearsFailed).toContain(2023)
    expect(result.yearsProcessed).toContain(2024)
    const row = db.prepare('SELECT COUNT(*) as c FROM cves').get() as { c: number }
    expect(row.c).toBe(1)
  })
})

describe('getAvailableNvdYears', () => {
  it('returns an inclusive ascending year range', () => {
    const years = getAvailableNvdYears(2020, 2024)
    expect(years).toEqual([2020, 2021, 2022, 2023, 2024])
  })
})
