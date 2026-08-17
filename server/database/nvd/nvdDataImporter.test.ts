/**
 * Unit tests for NVD Data Importer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { NvdDataImporter, createNvdDataImporter, type ImportProgress, type ImportResult } from './nvdDataImporter.js'
import { runMigrations, getSchemaVersion } from '../migrations/v2SchemaMigration.js'
import type { NvdCveV2 } from './nvdApiV2Client.js'

let db: InstanceType<typeof Database>

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

describe('NvdDataImporter', () => {
  let importer: NvdDataImporter

  beforeEach(() => {
    db = createTestDatabase()
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

      const result = db.prepare('SELECT cvss_v31_score, cvss_v31_severity FROM cves WHERE id = ?').all(sampleCve.id)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].cvss_v31_score).toBe(9.8)
      expect(result[0].cvss_v31_severity).toBe('CRITICAL')
    })

    it('should import CVSS v2.0 scores', async () => {
      await importer.importCves([sampleCve])

      const result = db.prepare('SELECT cvss_v2_score, cvss_v2_severity FROM cves WHERE id = ?').all(sampleCve.id)

      expect(result.length).toBeGreaterThan(0)
      expect(result[0].cvss_v2_score).toBe(7.5)
    })

    it('should import CWE references', async () => {
      await importer.importCves([sampleCve])

      const result = db.prepare('SELECT cwe_id FROM cwe_references WHERE cve_id = ?').all(sampleCve.id)

      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBe(2)
    })

    it('should import CPE matches with version ranges', async () => {
      await importer.importCves([sampleCve])

      const result = db
        .prepare(
          `
        SELECT cpe23_uri, vulnerable, version_start_including, version_end_excluding
        FROM cpe_matches WHERE cve_id = ?
      `,
        )
        .all(sampleCve.id)

      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBe(2)

      const vulnerableCpe = result.find((r) => r.vulnerable === 1)
      expect(vulnerableCpe).toBeDefined()
      expect(vulnerableCpe?.version_start_including).toBe('1.0')
      expect(vulnerableCpe?.version_end_excluding).toBe('2.0')
    })

    it('should import references with types', async () => {
      await importer.importCves([sampleCve])

      const result = db
        .prepare(
          `
        SELECT url, source, tags, reference_type
        FROM "references" WHERE cve_id = ?
      `,
        )
        .all(sampleCve.id)

      expect(result.length).toBeGreaterThan(0)
      expect(result.length).toBe(2)

      const vendorRef = result.find((r) => r.reference_type === 'vendor')
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
      const cveResult = db.prepare('SELECT description FROM cves WHERE id = ?').all(sampleCve.id)
      expect(cveResult[0].description).toBe('Updated description')
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
      const cpeResult = db
        .prepare('SELECT COUNT(*) as cnt FROM cpe_matches WHERE cve_id = ?')
        .get(cveWithoutConfig.id) as { cnt: number }
      expect(cpeResult.cnt).toBe(0)
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

      const cveRow = db
        .prepare(
          'SELECT cvss_v30_score, cvss_v30_severity, cvss_v30_vector, cvss_score, severity FROM cves WHERE id = ?',
        )
        .all(cveWithV30.id)
      expect(cveRow[0].cvss_v30_score).toBe(9.6)
      expect(cveRow[0].cvss_v30_severity).toBe('CRITICAL')
      expect(cveRow[0].cvss_v30_vector).toBe('CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')

      expect(cveRow[0].cvss_score).toBe(9.6)
      expect(cveRow[0].severity).toBe('CRITICAL')

      const metricsRow = db
        .prepare("SELECT version, score, severity FROM cvss_metrics WHERE cve_id = ? AND version = '3.0'")
        .all(cveWithV30.id)
      expect(metricsRow.length).toBeGreaterThan(0)
      expect(metricsRow[0].version).toBe('3.0')
      expect(metricsRow[0].score).toBe(9.6)
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
      const metricsRows = db
        .prepare("SELECT source, type, score FROM cvss_metrics WHERE cve_id = ? AND version = '3.0'")
        .all(cveWithMultipleV30.id)
      expect(metricsRows.length).toBe(2)
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
      const cveRow = db
        .prepare('SELECT cvss_score, severity, cvss_v2_score FROM cves WHERE id = ?')
        .all(cveWithV2Only.id)
      expect(cveRow[0].cvss_score).toBe(7.5)
      expect(cveRow[0].severity).toBe('HIGH')
      expect(cveRow[0].cvss_v2_score).toBe(7.5)
    })

    it('should keep a real CVSS v3.1 baseScore of 0.0 as primary (not fall through to v2)', async () => {
      // WHY: 0.0 is a legitimate "no impact" v3.1 score but is falsy; the old
      // `!transformed.cvss_score` check treated it as missing and overwrote the primary
      // with the v2 7.5 fallback. `=== null` preserves the real 0.0.
      const cveZeroV31: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-ZEROV31',
        metrics: {
          cvssMetricV31: [
            {
              source: 'nvd@nist.gov',
              type: 'Primary',
              cvssData: {
                version: '3.1',
                vectorString: 'CVSS:3.1/AV:N/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:N',
                attackVector: 'NETWORK',
                attackComplexity: 'HIGH',
                privilegesRequired: 'HIGH',
                userInteraction: 'REQUIRED',
                scope: 'UNCHANGED',
                confidentialityImpact: 'NONE',
                integrityImpact: 'NONE',
                availabilityImpact: 'NONE',
                baseScore: 0.0,
                baseSeverity: 'NONE',
              },
            },
          ],
          // A higher v2 score must NOT overwrite the real 0.0 v3.1 primary.
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
            },
          ],
        },
      }

      const result = await importer.importCves([cveZeroV31])
      expect(result.success).toBe(true)

      const cveRow = db.prepare('SELECT cvss_score, cvss_v31_score, severity FROM cves WHERE id = ?').all(cveZeroV31.id)
      expect(cveRow[0].cvss_v31_score).toBe(0)
      expect(cveRow[0].cvss_score).toBe(0)
      expect(cveRow[0].severity).toBe('NONE')
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

      const cveRow = db.prepare('SELECT vuln_status, assigner FROM cves WHERE id = ?').all(cveMinimal.id)
      expect(cveRow[0].vuln_status).toBeNull()
      expect(cveRow[0].assigner).toBeNull()
    })

    it('should handle CVE with empty descriptions', async () => {
      const cveNoDesc: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-NODESC',
        descriptions: [],
      }

      const result = await importer.importCves([cveNoDesc])

      expect(result.success).toBe(true)

      const cveRow = db.prepare('SELECT description FROM cves WHERE id = ?').all(cveNoDesc.id)
      expect(cveRow[0].description).toBe('No description available')
    })

    it('should handle CVE with non-English description only', async () => {
      const cveNonEn: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-NONEN',
        descriptions: [{ lang: 'es', value: 'Descripción en español' }],
      }

      const result = await importer.importCves([cveNonEn])

      expect(result.success).toBe(true)

      const cveRow = db.prepare('SELECT description FROM cves WHERE id = ?').all(cveNonEn.id)
      expect(cveRow[0].description).toBe('Descripción en español')
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
      const cweRows = db.prepare('SELECT cwe_id FROM cwe_references WHERE cve_id = ?').all(cveNonCwe.id)
      const cweIds = cweRows.map((r) => r.cwe_id)
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

      const refRows = db.prepare('SELECT url, reference_type FROM "references" WHERE cve_id = ?').all(cveWithRefs.id)
      const refs = refRows

      const findByUrl = (url: string) => refs.find((r) => r.url === url)
      expect(findByUrl('https://example.com/patch')?.reference_type).toBe('patch')
      expect(findByUrl('https://example.com/third-party')?.reference_type).toBe('third-party')
      expect(findByUrl('https://example.com/issue')?.reference_type).toBe('issue')
      expect(findByUrl('https://example.com/release')?.reference_type).toBe('release')
      expect(findByUrl('https://example.com/exploit')?.reference_type).toBe('exploit')
      expect(findByUrl('https://example.com/unknown')?.reference_type).toBeNull()
      expect(findByUrl('https://example.com/notags')?.reference_type).toBeNull()
    })

    it('should handle reference without source or tags', async () => {
      const cveWithMinimalRef: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-MINREF',
        references: [{ url: 'https://example.com/basic' }],
      }

      const result = await importer.importCves([cveWithMinimalRef])

      expect(result.success).toBe(true)

      const refRows = db
        .prepare('SELECT source, tags, reference_type FROM "references" WHERE cve_id = ?')
        .all(cveWithMinimalRef.id)
      expect(refRows[0].source).toBeNull()
      expect(refRows[0].tags).toBeNull()
      expect(refRows[0].reference_type).toBeNull()
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
      db.exec('CREATE TABLE IF NOT EXISTS cves_fts (id TEXT, description TEXT)')
      db.exec("INSERT INTO cves_fts (id, description) VALUES ('old', 'old desc')")

      const cve = { ...sampleCve, id: 'CVE-2024-FAKEFTS' }
      const result = await importer.importCves([cve])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)

      // Verify the FTS table was rebuilt (old data cleared, new data inserted)
      const ftsRows = db.prepare('SELECT id FROM cves_fts').all()
      const ids = ftsRows.map((r) => r.id)
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

      const metricsRows = db
        .prepare('SELECT exploitability_score, impact_score FROM cvss_metrics WHERE cve_id = ?')
        .all(cveNoExploitScores.id)
      expect(metricsRows[0].exploitability_score).toBeNull()
      expect(metricsRows[0].impact_score).toBeNull()
    })

    it('should reuse an already-open transaction instead of aborting when one is active', async () => {
      // WHY: importCves can be called while the caller already holds a transaction (e.g. a
      // nested import flow). BEGIN TRANSACTION then throws "cannot start a transaction
      // within a transaction"; the catch must detect db.inTransaction and reuse it instead
      // of treating that as a fatal error and aborting the whole import.
      db.exec('BEGIN TRANSACTION')

      const cve = { ...sampleCve, id: 'CVE-2024-REUSETXN' }
      const result = await importer.importCves([cve])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)
      // The importer's own COMMIT closed out the reused transaction.
      expect(db.inTransaction).toBe(false)

      const row = db.prepare('SELECT id FROM cves WHERE id = ?').get(cve.id)
      expect(row).toBeDefined()
    })

    it('should record a malformed CVE as failed without discarding the rest of the batch', async () => {
      // WHY: a single bad record (missing descriptions) must not roll back CVEs that
      // parsed fine in the same transaction — only that one record should count as failed,
      // and the batch must keep going.
      const malformedCve = {
        ...sampleCve,
        id: 'CVE-2024-MALFORMED',
        descriptions: undefined,
      } as unknown as NvdCveV2
      const goodCve = { ...sampleCve, id: 'CVE-2024-GOODONE' }

      const result = await importer.importCves([malformedCve, goodCve])

      expect(result.success).toBe(true)
      expect(result.failedCves).toBe(1)
      expect(result.importedCves).toBe(1)
      expect(result.errors[0]).toContain('Failed to import CVE-2024-MALFORMED')

      const malformedRow = db.prepare('SELECT id FROM cves WHERE id = ?').get(malformedCve.id)
      expect(malformedRow).toBeUndefined()
      const goodRow = db.prepare('SELECT id FROM cves WHERE id = ?').get(goodCve.id)
      expect(goodRow).toBeDefined()
    })

    it('should report zero throughput in progress updates when every CVE in a batch fails', async () => {
      // WHY: progress.cvesPerSecond divides processedCves by elapsed time; when nothing in
      // the batch actually got processed (every CVE threw before the processedCves++),
      // that division must fall back to 0 instead of surfacing NaN to the progress UI.
      const malformed1 = { ...sampleCve, id: 'CVE-2024-BAD1', descriptions: undefined } as unknown as NvdCveV2
      const malformed2 = { ...sampleCve, id: 'CVE-2024-BAD2', descriptions: undefined } as unknown as NvdCveV2

      const progressUpdates: ImportProgress[] = []
      const result = await importer.importCves([malformed1, malformed2], {
        onProgress: (p) => progressUpdates.push({ ...p }),
      })

      expect(result.failedCves).toBe(2)
      expect(result.importedCves).toBe(0)
      expect(progressUpdates.length).toBeGreaterThan(0)
      expect(progressUpdates.every((p) => p.cvesPerSecond === 0)).toBe(true)
      // WHY: a batch where EVERY CVE failed imported nothing, so reporting success:true
      // would let a caller (sync/bulk-import) treat a total failure as a good run and
      // advance its sync cursor past data it never stored. `success` must reflect whether
      // anything was actually imported, not merely that the transaction committed.
      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('should return zero cvesPerSecond instead of NaN/Infinity for an empty CVE list', async () => {
      // WHY: result.cvesPerSecond divides totalCves by durationMs; with totalCves === 0 the
      // division is falsy (0 or NaN) and must fall back to 0, not leak a NaN/Infinity metric.
      const result = await importer.importCves([])

      expect(result.success).toBe(true)
      expect(result.totalCves).toBe(0)
      expect(result.cvesPerSecond).toBe(0)
    })

    it('should skip CWE reference rows entirely for a CVE with no weaknesses field', async () => {
      const cveNoWeaknesses = { ...sampleCve, id: 'CVE-2024-NOWEAK', weaknesses: undefined }

      const result = await importer.importCves([cveNoWeaknesses])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)

      const cweRows = db.prepare('SELECT cwe_id FROM cwe_references WHERE cve_id = ?').all(cveNoWeaknesses.id)
      expect(cweRows.length).toBe(0)
    })

    it('should create and populate the FTS index at import time when the table does not exist yet', async () => {
      // WHY: migration 7 normally creates cves_fts ahead of time, so a fresh DB never
      // exercises the importer's own "build it if missing" fallback. Simulate a DB that
      // predates/lacks that table (mirroring the migration's own down-step) to prove the
      // fallback actually builds and populates it.
      db.exec('DROP TABLE IF EXISTS cves_fts')
      db.exec('DROP TRIGGER IF EXISTS cves_fts_insert')
      db.exec('DROP TRIGGER IF EXISTS cves_fts_delete')
      db.exec('DROP TRIGGER IF EXISTS cves_fts_update')

      const cve = { ...sampleCve, id: 'CVE-2024-NOFTSYET' }
      const result = await importer.importCves([cve])

      expect(result.success).toBe(true)
      const ftsRows = db.prepare('SELECT id FROM cves_fts WHERE id = ?').all(cve.id)
      expect(ftsRows.length).toBe(1)
    })

    it('should warn but not fail the import when the FTS rebuild throws', async () => {
      // WHY: rebuildFtsIndex has its own try/catch specifically so a broken FTS rebuild
      // (search index) never fails the whole CVE import — it should log and move on.
      db.exec('DROP TABLE IF EXISTS cves_fts')
      db.exec('DROP TRIGGER IF EXISTS cves_fts_insert')
      db.exec('DROP TRIGGER IF EXISTS cves_fts_delete')
      db.exec('DROP TRIGGER IF EXISTS cves_fts_update')
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const realExec = db.exec.bind(db)
      vi.spyOn(db, 'exec').mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO cves_fts')) {
          throw new Error('simulated FTS failure')
        }
        return realExec(sql)
      })

      const cve = { ...sampleCve, id: 'CVE-2024-FTSFAIL' }
      const result = await importer.importCves([cve])

      expect(result.success).toBe(true)
      expect(result.importedCves).toBe(1)
      expect(warnSpy).toHaveBeenCalledWith('FTS index rebuild failed:', expect.any(Error))

      warnSpy.mockRestore()
      vi.mocked(db.exec).mockRestore()
    })

    it('should fall back to default source/type labels and null scores when NVD omits them', async () => {
      // WHY: source/type/exploitability/impact are optional per NVD's schema; the importer
      // must default them (Unknown/Secondary/null) rather than storing undefined-derived
      // garbage in cvss_metrics.
      const cveDefaultsMetrics = {
        ...sampleCve,
        id: 'CVE-2024-METRICDEFAULTS',
        metrics: {
          cvssMetricV31: [
            {
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
                baseScore: 9.1,
                baseSeverity: 'CRITICAL',
              },
            },
          ],
          cvssMetricV30: [
            {
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
                baseScore: 8.1,
                baseSeverity: 'HIGH',
              },
            },
          ],
          cvssMetricV2: [
            {
              cvssData: {
                version: '2.0',
                vectorString: 'AV:N/AC:L/Au:N/C:P/I:P/A:P',
                accessVector: 'NETWORK',
                accessComplexity: 'LOW',
                authentication: 'NONE',
                confidentialityImpact: 'PARTIAL',
                integrityImpact: 'PARTIAL',
                availabilityImpact: 'PARTIAL',
                baseScore: 5.0,
              },
              // baseSeverity intentionally omitted
            },
          ],
        },
      } as unknown as NvdCveV2

      const result = await importer.importCves([cveDefaultsMetrics])
      expect(result.success).toBe(true)

      const metricsRows = db
        .prepare(
          'SELECT version, source, type, exploitability_score, impact_score, severity FROM cvss_metrics WHERE cve_id = ?',
        )
        .all(cveDefaultsMetrics.id)

      expect(metricsRows.length).toBe(3)
      for (const row of metricsRows) {
        expect(row.source).toBe('Unknown')
        expect(row.type).toBe('Secondary')
      }

      const v30Row = metricsRows.find((r) => r.version === '3.0')
      expect(v30Row?.exploitability_score).toBeNull()
      expect(v30Row?.impact_score).toBeNull()

      const v2Row = metricsRows.find((r) => r.version === '2.0')
      expect(v2Row?.severity).toBe('UNKNOWN')

      // cves.cvss_v2_severity mirrors the same "no baseSeverity" default at the
      // transformCve level (independent from the extractCvssMetrics default above).
      const cveRow = db.prepare('SELECT cvss_v2_severity FROM cves WHERE id = ?').all(cveDefaultsMetrics.id)
      expect(cveRow[0].cvss_v2_severity).toBeNull()
    })

    it('should use a null primary severity when the only available metric (v2) omits baseSeverity', async () => {
      const cveV2OnlyNoSeverity: NvdCveV2 = {
        ...sampleCve,
        id: 'CVE-2024-V2NOSEV',
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
                baseScore: 5.0,
              },
              // baseSeverity intentionally omitted
            },
          ],
        },
      }

      const result = await importer.importCves([cveV2OnlyNoSeverity])
      expect(result.success).toBe(true)

      const cveRow = db.prepare('SELECT cvss_score, severity FROM cves WHERE id = ?').all(cveV2OnlyNoSeverity.id)
      expect(cveRow[0].cvss_score).toBe(5.0)
      expect(cveRow[0].severity).toBeNull()
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
  it('should create importer instance', () => {
    const testDb = createTestDatabase()
    const importer = createNvdDataImporter(testDb)
    expect(importer).toBeInstanceOf(NvdDataImporter)
    testDb.close()
  })
})
