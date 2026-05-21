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

    it('should import CVE with CVSS v3.0 metrics', async () => {
      const cveWithV30: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-V30TEST',
        metrics: {
          cvssMetricV30: [
            {
              source: 'nvd@nist.gov',
              type: 'Primary',
              cvssData: {
                version: '3.0',
                vectorString: 'CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
                attackVector: 'NETWORK',
                attackComplexity: 'LOW',
                privilegesRequired: 'NONE',
                userInteraction: 'NONE',
                scope: 'UNCHANGED',
                confidentialityImpact: 'HIGH',
                integrityImpact: 'HIGH',
                availabilityImpact: 'HIGH',
                baseScore: 9.6,
                baseSeverity: 'CRITICAL',
              },
              exploitabilityScore: 3.9,
              impactScore: 6.0,
            },
          ],
        },
      }

      const result = await importer.importCves([cveWithV30])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)

      // Verify CVSS v3.0 fields were stored
      const cveRow = db.exec(
        'SELECT cvss_v30_score, cvss_v30_severity, cvss_v30_vector, cvss_score, severity FROM cves WHERE id = ?',
        [cveWithV30.id],
      )
      expect(cveRow[0].values[0][0]).toBe(9.6)
      expect(cveRow[0].values[0][1]).toBe('CRITICAL')
      expect(cveRow[0].values[0][2]).toBe('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')

      // v3.0 should be used as primary since no v3.1 exists
      expect(cveRow[0].values[0][3]).toBe(9.6)
      expect(cveRow[0].values[0][4]).toBe('CRITICAL')

      // Verify v3.0 CVSS metrics were stored
      const metricsRow = db.exec(
        "SELECT version, score, severity FROM cvss_metrics WHERE cve_id = ? AND version = '3.0'",
        [cveWithV30.id],
      )
      expect(metricsRow.length).toBeGreaterThan(0)
      expect(metricsRow[0].values[0][0]).toBe('3.0')
      expect(metricsRow[0].values[0][1]).toBe(9.6)
    })

    it('should import CVE with multiple CVSS v3.0 sources', async () => {
      const cveWithMultipleV30: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-MULTIV30',
        metrics: {
          cvssMetricV30: [
            {
              source: 'nvd@nist.gov',
              type: 'Primary',
              cvssData: {
                version: '3.0',
                vectorString: 'CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
                attackVector: 'NETWORK',
                attackComplexity: 'LOW',
                privilegesRequired: 'NONE',
                userInteraction: 'NONE',
                scope: 'UNCHANGED',
                confidentialityImpact: 'HIGH',
                integrityImpact: 'HIGH',
                availabilityImpact: 'HIGH',
                baseScore: 9.6,
                baseSeverity: 'CRITICAL',
              },
              exploitabilityScore: 3.9,
              impactScore: 6.0,
            },
            {
              source: 'vendor@security.com',
              type: 'Secondary',
              cvssData: {
                version: '3.0',
                vectorString: 'CVSS:3.0/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H',
                attackVector: 'LOCAL',
                attackComplexity: 'LOW',
                privilegesRequired: 'LOW',
                userInteraction: 'NONE',
                scope: 'UNCHANGED',
                confidentialityImpact: 'HIGH',
                integrityImpact: 'HIGH',
                availabilityImpact: 'HIGH',
                baseScore: 7.8,
                baseSeverity: 'HIGH',
              },
              exploitabilityScore: 1.8,
              impactScore: 5.9,
            },
          ],
        },
      }

      const result = await importer.importCves([cveWithMultipleV30])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)

      // Both v3.0 metrics should be stored
      const metricsRows = db.exec("SELECT source, type, score FROM cvss_metrics WHERE cve_id = ? AND version = '3.0'", [
        cveWithMultipleV30.id,
      ])
      expect(metricsRows[0].values.length).toBe(2)
    })

    it('should use CVSS v2 as primary fallback when no v3.x metrics exist', async () => {
      const cveWithV2Only: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-V2ONLY',
        metrics: {
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
      }

      const result = await importer.importCves([cveWithV2Only])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)

      // v2 should be used as primary since no v3.x exists
      const cveRow = db.exec('SELECT cvss_score, severity, cvss_v2_score FROM cves WHERE id = ?', [cveWithV2Only.id])
      expect(cveRow[0].values[0][0]).toBe(7.5)
      expect(cveRow[0].values[0][1]).toBe('HIGH')
      expect(cveRow[0].values[0][2]).toBe(7.5)
    })

    it('should handle CVE with no vulnStatus or sourceIdentifier', async () => {
      const cveMinimal: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-MINIMAL',
        vulnStatus: undefined,
        sourceIdentifier: undefined,
      }

      const result = await importer.importCves([cveMinimal])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)

      const cveRow = db.exec('SELECT vuln_status, assigner FROM cves WHERE id = ?', [cveMinimal.id])
      expect(cveRow[0].values[0][0]).toBeNull()
      expect(cveRow[0].values[0][1]).toBeNull()
    })

    it('should handle CVE with empty descriptions', async () => {
      const cveNoDesc: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-NODESC',
        descriptions: [],
      }

      const result = await importer.importCves([cveNoDesc])

      expect(result.success).toBe(true)

      const cveRow = db.exec('SELECT description FROM cves WHERE id = ?', [cveNoDesc.id])
      expect(cveRow[0].values[0][0]).toBe('No description available')
    })

    it('should handle CVE with non-English description only', async () => {
      const cveNonEn: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-NONEN',
        descriptions: [{ lang: 'es', value: 'Descripción en español' }],
      }

      const result = await importer.importCves([cveNonEn])

      expect(result.success).toBe(true)

      const cveRow = db.exec('SELECT description FROM cves WHERE id = ?', [cveNonEn.id])
      // Falls back to first description when no English one exists
      expect(cveRow[0].values[0][0]).toBe('Descripción en español')
    })

    it('should handle weakness entries with non-CWE values', async () => {
      const cveNonCwe: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-NONCWE',
        weaknesses: [
          {
            source: 'nvd@nist.gov',
            type: 'Primary',
            description: [
              { lang: 'en', value: 'NVD-CWE-Other' },
              { lang: 'en', value: 'CWE-20' },
            ],
          },
        ],
      }

      const result = await importer.importCves([cveNonCwe])

      expect(result.success).toBe(true)

      // Only CWE-20 should be stored, NVD-CWE-Other is filtered out
      const cweRows = db.exec('SELECT cwe_id FROM cwe_references WHERE cve_id = ?', [cveNonCwe.id])
      const cweIds = cweRows[0].values.map((v) => v[0])
      expect(cweIds).not.toContain('NVD-CWE-Other')
      expect(cweIds).toContain('CWE-20')
    })

    it('should classify reference types correctly by tags', async () => {
      const cveWithRefs: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-REFTYPES',
        references: [
          { url: 'https://example.com/patch', tags: ['Patch'] },
          { url: 'https://example.com/third-party', tags: ['Third Party Advisory'] },
          { url: 'https://example.com/issue', tags: ['Issue Tracking'] },
          { url: 'https://example.com/release', tags: ['Release Notes'] },
          { url: 'https://example.com/exploit', tags: ['Exploit'] },
          { url: 'https://example.com/unknown', tags: ['Some Unknown Tag'] },
          { url: 'https://example.com/notags' },
        ],
      }

      const result = await importer.importCves([cveWithRefs])

      expect(result.success).toBe(true)

      const refRows = db.exec('SELECT url, reference_type FROM "references" WHERE cve_id = ?', [cveWithRefs.id])
      const refs = refRows[0].values

      const findByUrl = (url: string) => refs.find((r) => r[0] === url)
      expect(findByUrl('https://example.com/patch')?.[1]).toBe('patch')
      expect(findByUrl('https://example.com/third-party')?.[1]).toBe('third-party')
      expect(findByUrl('https://example.com/issue')?.[1]).toBe('issue')
      expect(findByUrl('https://example.com/release')?.[1]).toBe('release')
      expect(findByUrl('https://example.com/exploit')?.[1]).toBe('exploit')
      expect(findByUrl('https://example.com/unknown')?.[1]).toBeNull()
      expect(findByUrl('https://example.com/notags')?.[1]).toBeNull()
    })

    it('should handle reference without source or tags', async () => {
      const cveWithMinimalRef: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-MINREF',
        references: [{ url: 'https://example.com/basic' }],
      }

      const result = await importer.importCves([cveWithMinimalRef])

      expect(result.success).toBe(true)

      const refRows = db.exec('SELECT source, tags, reference_type FROM "references" WHERE cve_id = ?', [
        cveWithMinimalRef.id,
      ])
      expect(refRows[0].values[0][0]).toBeNull() // source
      expect(refRows[0].values[0][1]).toBeNull() // tags
      expect(refRows[0].values[0][2]).toBeNull() // reference_type
    })

    it('should rebuild FTS index on subsequent imports', async () => {
      // First import - creates FTS table and populates it
      const cve1 = { ...sampleCve, id: 'CVE-2024-FTS1' }
      await importer.importCves([cve1])

      // Second import - should hit the FTS rebuild path (lines 738-741)
      // where the FTS table already exists
      const cve2 = { ...sampleCve, id: 'CVE-2024-FTS2' }
      const result = await importer.importCves([cve2])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)
    })

    it('should cover FTS rebuild DELETE and INSERT when table pre-exists', async () => {
      // Pre-create a regular table named cves_fts to bypass FTS5 creation.
      // This simulates the FTS table already existing so the code skips
      // CREATE VIRTUAL TABLE and goes directly to DELETE + INSERT (lines 738-741).
      db.run('CREATE TABLE IF NOT EXISTS cves_fts (id TEXT, description TEXT)')
      // Seed it so DELETE has something to clear
      db.run("INSERT INTO cves_fts (id, description) VALUES ('old', 'old desc')")

      const cve = { ...sampleCve, id: 'CVE-2024-FAKEFTS' }
      const result = await importer.importCves([cve])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)

      // Verify the FTS table was rebuilt (old data cleared, new data inserted)
      const ftsRows = db.exec('SELECT id FROM cves_fts')
      const ids = ftsRows[0]?.values.map((v) => v[0]) || []
      expect(ids).not.toContain('old')
      expect(ids).toContain('CVE-2024-FAKEFTS')
    })

    it('should handle error in progress callback during import', async () => {
      // Use multiple CVEs so the batch processes, then onProgress throws
      // before COMMIT, leaving transactionActive=true so the ROLLBACK path (lines 277-287) executes
      const cves = [
        { ...sampleCve, id: 'CVE-2024-PROG1' },
        { ...sampleCve, id: 'CVE-2024-PROG2' },
      ]

      let firstCall = true
      const result = await importer.importCves(cves, {
        batchSize: 500,
        onProgress: () => {
          if (firstCall) {
            firstCall = false
            throw new Error('Progress callback failed')
          }
        },
      })

      // The outer catch should have caught the error
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0]).toContain('Transaction failed')
    })

    it('should import CVE with CVSS metrics lacking optional exploitability/impact scores', async () => {
      const cveNoExploitScores: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-NOEXPL',
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
              // exploitabilityScore and impactScore intentionally omitted
            },
          ],
        },
      }

      const result = await importer.importCves([cveNoExploitScores])

      expect(result.success).toBe(true)

      const metricsRows = db.exec('SELECT exploitability_score, impact_score FROM cvss_metrics WHERE cve_id = ?', [
        cveNoExploitScores.id,
      ])
      expect(metricsRows[0].values[0][0]).toBeNull()
      expect(metricsRows[0].values[0][1]).toBeNull()
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
