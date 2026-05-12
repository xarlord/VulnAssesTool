/**
 * Unit tests for NVD Data Importer
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { NvdDataImporter, createNvdDataImporter, type ImportProgress, type ImportResult } from './nvdDataImporter.js'
import { runMigrations, getSchemaVersion } from '../migrations/v2SchemaMigration.js'
import type { NvdCveV2 } from './nvdApiV2Client.js'

let db: Database
let sqlJs: any

// Sample CVE for testing
const sampleCve: NvdCveV2 = {
  id: 'CVE-2024-12345',
  sourceIdentifier: 'test@nvd.nist.gov',
  published: '2024-01-15T10:00:00.000',
  lastModified: '2024-01-20T15:30:00.000',
  vulnStatus: 'ANALYZED',
  descriptions: [
    { lang: 'en', value: 'Test vulnerability description' },
    { lang: 'es', value: 'Descripción de prueba' },
  ],
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
    cvssMetricV2: [
      {
        source: 'nvd@nist.gov',
        type: 'Primary',
        cvssData: {
          version: '2.0',
          vectorString: 'AV:N/AC:L/Au:N/C:P/I:P/A:P',
          accessVector: 'NETWORK',
          accessComplexity: 'LOW',
          authentication: 'NONE',
          confidentialityImpact: 'PARTIAL',
          integrityImpact: 'PARTIAL',
          availabilityImpact: 'PARTIAL',
          baseScore: 7.5,
        },
        baseSeverity: 'HIGH',
        exploitabilityScore: 10,
        impactScore: 6.4,
      },
    ],
  },
  weaknesses: [
    {
      source: 'nvd@nist.gov',
      type: 'Primary',
      description: [
        { lang: 'en', value: 'CWE-79' },
        { lang: 'en', value: 'CWE-89' },
      ],
    },
  ],
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
              versionStartIncluding: '1.0',
              versionEndExcluding: '2.0',
            },
            {
              vulnerable: false,
              cpe23Uri: 'cpe:2.3:a:vendor:product:2.0:*:*:*:*:*:*:*',
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
      tags: ['Vendor Advisory', 'Patch'],
    },
    {
      url: 'https://example.com/exploit',
      tags: ['Exploit'],
    },
  ],
}

async function createTestDatabase(): Promise<Database> {
  if (!sqlJs) {
    sqlJs = await initSqlJs({})
  }
  const database = new sqlJs.Database()

  // Run migrations to set up v2 schema
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

describe('NvdDataImporter', () => {
  let importer: NvdDataImporter

  beforeEach(async () => {
    db = await createTestDatabase()
    importer = createNvdDataImporter(db)
  })

  afterEach(() => {
    if (db) {
      db.close()
    }
  })

  describe('constructor', () => {
    it('should create importer instance', () => {
      expect(importer).toBeInstanceOf(NvdDataImporter)
    })
  })

  describe('getProgress', () => {
    it('should return initial progress', () => {
      const progress = importer.getProgress()

      expect(progress.phase).toBe('preparing')
      expect(progress.totalCves).toBe(0)
      expect(progress.processedCves).toBe(0)
      expect(progress.percentage).toBe(0)
    })
  })

  describe('importCves', () => {
    it('should import a single CVE', async () => {
      const result = await importer.importCves([sampleCve])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)
      expect(result.failedCves).toBe(0)
    })

    it('should import multiple CVEs', async () => {
      const cves = [sampleCve, { ...sampleCve, id: 'CVE-2024-11111' }, { ...sampleCve, id: 'CVE-2024-22222' }]

      const result = await importer.importCves(cves)

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(3)
    })

    it('should report progress during import', async () => {
      const progressUpdates: ImportProgress[] = []

      const result = await importer.importCves([sampleCve, { ...sampleCve, id: 'CVE-2024-99999' }], {
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      expect(result.success).toBe(true)
      expect(progressUpdates.length).toBeGreaterThan(0)

      // Final progress should show complete
      const finalProgress = progressUpdates[progressUpdates.length - 1]
      expect(finalProgress.phase).toBe('complete')
      expect(finalProgress.percentage).toBe(100)
    })

    it('should import CVSS v3.1 scores', async () => {
      await importer.importCves([sampleCve])

      const result = db.exec('SELECT cvss_v31_score, cvss_v31_severity FROM cves WHERE id = ?', [sampleCve.id])

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].values[0][0]).toBe(9.8)
      expect(result[0].values[0][1]).toBe('CRITICAL')
    })

    it('should import CVSS v2.0 scores', async () => {
      await importer.importCves([sampleCve])

      const result = db.exec('SELECT cvss_v2_score, cvss_v2_severity FROM cves WHERE id = ?', [sampleCve.id])

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].values[0][0]).toBe(7.5)
    })

    it('should import CWE references', async () => {
      await importer.importCves([sampleCve])

      const result = db.exec('SELECT cwe_id FROM cwe_references WHERE cve_id = ?', [sampleCve.id])

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].values.length).toBe(2) // CWE-79 and CWE-89
    })

    it('should import CPE matches with version ranges', async () => {
      await importer.importCves([sampleCve])

      const result = db.exec(
        `
        SELECT cpe23_uri, vulnerable, version_start_including, version_end_excluding
        FROM cpe_matches WHERE cve_id = ?
      `,
        [sampleCve.id],
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].values.length).toBe(2)

      // Check vulnerable CPE
      const vulnerableCpe = result[0].values.find((v) => v[1] === 1)
      expect(vulnerableCpe).toBeDefined()
      expect(vulnerableCpe![2]).toBe('1.0')
      expect(vulnerableCpe![3]).toBe('2.0')
    })

    it('should import references with types', async () => {
      await importer.importCves([sampleCve])

      const result = db.exec(
        `
        SELECT url, source, tags, reference_type
        FROM "references" WHERE cve_id = ?
      `,
        [sampleCve.id],
      )

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].values.length).toBe(2)

      // Check reference with type
      const vendorRef = result[0].values.find((v) => v[3] === 'vendor')
      expect(vendorRef).toBeDefined()
    })

    it('should skip existing CVEs when skipExisting is true', async () => {
      // Import once
      await importer.importCves([sampleCve])

      // Import again with skipExisting
      const result = await importer.importCves([sampleCve], { skipExisting: true })

      expect(result.skippedCves).toBe(1)
      expect(result.importedCves).toBe(0)
    })

    it('should update existing CVEs when updateExisting is true', async () => {
      // Import once
      await importer.importCves([sampleCve])

      // Modify CVE and import again
      const updatedCve = {
        ...sampleCve,
        descriptions: [{ lang: 'en', value: 'Updated description' }],
      }

      const result = await importer.importCves([updatedCve], { updateExisting: true })

      expect(result.updatedCves).toBe(1)

      // Verify update
      const cveResult = db.exec('SELECT description FROM cves WHERE id = ?', [sampleCve.id])
      expect(cveResult[0].values[0][0]).toBe('Updated description')
    })

    it('should track import statistics', async () => {
      await importer.importCves([sampleCve])

      const stats = importer.getStats()

      expect(stats.totalCves).toBe(1)
      expect(stats.totalCwe).toBe(2)
      expect(stats.totalCpe).toBe(2)
      expect(stats.totalRefs).toBe(2)
    })

    it('should handle CVE without metrics', async () => {
      const cveWithoutMetrics: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-99999',
        metrics: undefined,
      }

      const result = await importer.importCves([cveWithoutMetrics])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)
    })

    it('should handle CVE without configurations', async () => {
      const cveWithoutConfig: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-99998',
        configurations: undefined,
      }

      const result = await importer.importCves([cveWithoutConfig])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)

      // Should not have any CPE matches
      const cpeResult = db.exec('SELECT COUNT(*) FROM cpe_matches WHERE cve_id = ?', [cveWithoutConfig.id])
      expect(cpeResult[0].values[0][0]).toBe(0)
    })

    it('should handle CVE without references', async () => {
      const cveWithoutRefs: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-99997',
        references: undefined,
      }

      const result = await importer.importCves([cveWithoutRefs])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)
    })

    it('should handle cancellation', async () => {
      const controller = new AbortController()

      // Start import with many CVEs
      const cves: NvdCveV2[] = []
      for (let i = 0; i < 100; i++) {
        cves.push({ ...sampleCve, id: `CVE-2024-${i.toString().padStart(5, '0')}` })
      }

      // Pre-abort the signal to test cancellation
      controller.abort()

      const result = await importer.importCves(cves, { signal: controller.signal })

      // Should have cancelled
      expect(result.errors).toContain('Import cancelled')
    })
  })

  describe('getStats', () => {
    it('should return zero stats for empty database', () => {
      const stats = importer.getStats()

      expect(stats.totalCves).toBe(0)
      expect(stats.totalCwe).toBe(0)
      expect(stats.totalCpe).toBe(0)
      expect(stats.totalRefs).toBe(0)
    })

    it('should return correct stats after import', async () => {
      await importer.importCves([sampleCve])

      const stats = importer.getStats()

      expect(stats.totalCves).toBe(1)
      expect(stats.totalCwe).toBeGreaterThan(0)
      expect(stats.totalCpe).toBeGreaterThan(0)
      expect(stats.totalRefs).toBeGreaterThan(0)
    })
  })
})

describe('createNvdDataImporter', () => {
  it('should create importer instance', async () => {
    const testDb = await createTestDatabase()
    const importer = createNvdDataImporter(testDb)
    expect(importer).toBeInstanceOf(NvdDataImporter)
    testDb.close()
  })
})
