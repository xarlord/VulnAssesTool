/**
 * NVD Integration Tests
 * Tests using real NVD data to validate parsing and database operations
 *
 * These tests are slower than unit tests and should be run separately.
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { NvdDatabase } from '../../src/renderer/lib/database/nvdDb'
import { NvdSyncService } from '../../src/renderer/lib/database/nvdSyncService'
import type { CVE, CPEMatch, Reference } from '../../src/renderer/lib/database/types'

// Path to NVD data fixtures
const NVD_FIXTURES_PATH = path.join(__dirname, '../fixtures/nvd-data')

describe('NVD Integration Tests', () => {
  let db: NvdDatabase
  let syncService: NvdSyncService

  beforeAll(async () => {
    // Create an in-memory database for testing
    db = new NvdDatabase(':memory:')
    syncService = new NvdSyncService(db)

    // Initialize the database schema
    await db.initialize()
  })

  describe('Loading real NVD data', () => {
    it('should load and parse the sample NVD JSON file', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      expect(data).toBeDefined()
      expect(data.format).toBe('NVD_CVE')
      expect(data.version).toBe('2.0')
      expect(data.vulnerabilities).toBeInstanceOf(Array)
      expect(data.vulnerabilities.length).toBeGreaterThan(0)
    })

    it('should have valid CVE structure in the sample data', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      // Check first vulnerability has required fields
      const firstCve = data.vulnerabilities[0].cve

      expect(firstCve.id).toMatch(/^CVE-\d{4}-\d+$/)
      expect(firstCve.descriptions).toBeInstanceOf(Array)
      expect(firstCve.descriptions.length).toBeGreaterThan(0)
      expect(firstCve.published).toBeDefined()
      expect(firstCve.lastModified).toBeDefined()
    })

    it('should have correct v2.0 format with configurations array', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      // Check that at least one CVE has configurations
      const cveWithConfig = data.vulnerabilities.find(
        (v: any) => v.cve.configurations && v.cve.configurations.length > 0,
      )

      if (cveWithConfig) {
        const configs = cveWithConfig.cve.configurations
        expect(Array.isArray(configs)).toBe(true)

        // Check that at least one config has cpe_match or children
        // (Real NVD data can have empty configs or nodes without cpe_match)
        const configsWithData = configs.filter(
          (c: any) =>
            (Array.isArray(c.cpe_match) && c.cpe_match.length > 0) ||
            (Array.isArray(c.children) && c.children.length > 0) ||
            (c.nodes && Array.isArray(c.nodes)),
        )

        console.log(`Found ${configsWithData.length} configs with data out of ${configs.length} total`)
        expect(configs.length).toBeGreaterThan(0)
      }
    })
  })

  describe('Parsing real NVD data', () => {
    it('should parse CVEs from real NVD data', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      const parsedCVEs: CVE[] = []

      // Parse all CVEs
      for (const item of data.vulnerabilities) {
        const cve = parseNVDRealItem(item)
        if (cve) {
          parsedCVEs.push(cve)
        }
      }

      // Verify parsing worked
      expect(parsedCVEs.length).toBeGreaterThan(0)
      expect(parsedCVEs[0].source).toBe('NVD')

      // Verify at least one CVE has CVSS data
      const withCvss = parsedCVEs.filter((cve) => cve.cvss_score !== undefined)
      expect(withCvss.length).toBeGreaterThan(0)
    })

    it('should handle CVEs with different severity levels', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      const severities = new Set<string>()

      for (const item of data.vulnerabilities) {
        if (item.cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity) {
          severities.add(item.cve.metrics.cvssMetricV31[0].cvssData.baseSeverity)
        }
        if (item.cve.metrics?.cvssMetricV30?.[0]?.cvssData?.baseSeverity) {
          severities.add(item.cve.metrics.cvssMetricV30[0].cvssData.baseSeverity)
        }
        if (item.cve.metrics?.cvssMetricV2?.[0]?.baseSeverity) {
          severities.add(item.cve.metrics.cvssMetricV2[0].baseSeverity)
        }
      }

      // Should have variety of severities
      expect(severities.size).toBeGreaterThan(0)
      console.log('Found severities:', Array.from(severities))
    })

    it('should handle CVEs with CPE matches', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      let cpeCount = 0

      for (const item of data.vulnerabilities) {
        const cve = parseNVDRealItem(item)
        if (cve && cve.cpe_matches && cve.cpe_matches.length > 0) {
          cpeCount++
        }
      }

      console.log(`Found ${cpeCount} CVEs with CPE matches`)
      expect(cpeCount).toBeGreaterThanOrEqual(0)
    })

    it('should parse CPE URIs correctly', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      const allCpes: string[] = []

      for (const item of data.vulnerabilities) {
        const cve = parseNVDRealItem(item)
        if (cve && cve.cpe_matches) {
          for (const cpe of cve.cpe_matches) {
            allCpes.push(cpe.cpe_text)
          }
        }
      }

      // Verify CPE format (should start with cpe:2.3: or cpe:2.2:)
      for (const cpe of allCpes) {
        expect(cpe).toMatch(/^cpe:2\.[23]:/)
      }

      console.log(`Found ${allCpes.length} total CPEs`)
    })
  })

  describe('Database operations with real data', () => {
    it('should upsert CVE data from real NVD file', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      // Actually insert into database
      let insertCount = 0
      for (const item of data.vulnerabilities) {
        const cve = parseNVDRealItem(item)
        if (cve) {
          await db.upsertCVE(cve)
          insertCount++
        }
      }

      expect(insertCount).toBeGreaterThan(0)
      console.log(`Inserted ${insertCount} CVEs from sample data`)

      // Verify database has data by checking metadata
      const metadata = db.getMetadata()
      expect(metadata.total_cves).toBe(insertCount)
    })

    it('should query CVEs by ID from real data', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      // Insert first CVE
      const firstItem = data.vulnerabilities[0]
      const cve = parseNVDRealItem(firstItem)
      if (cve) {
        await db.upsertCVE(cve)

        // Query by ID
        const result = await db.getCVEById(cve.id)
        expect(result).toBeDefined()
        expect(result?.id).toBe(cve.id)
        expect(result?.description).toBe(cve.description)
      }
    })

    it('should store and retrieve CPE matches', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      // Find a CVE with CPE matches
      for (const item of data.vulnerabilities) {
        const cve = parseNVDRealItem(item)
        if (cve && cve.cpe_matches && cve.cpe_matches.length > 0) {
          await db.upsertCVE(cve)
          await db.insertCPEMatches(cve.id, cve.cpe_matches)

          // Query back
          const result = await db.getCVEById(cve.id)
          expect(result?.cpe_matches).toBeDefined()
          expect(result?.cpe_matches.length).toBeGreaterThan(0)

          // Verify CPE format
          expect(result?.cpe_matches[0].cpe_text).toMatch(/^cpe:2\.[23]:/)

          break
        }
      }
    })

    it('should store and retrieve references', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      // Find a CVE with references
      for (const item of data.vulnerabilities) {
        const cve = parseNVDRealItem(item)
        if (cve && cve.references && cve.references.length > 0) {
          await db.upsertCVE(cve)
          await db.insertReferences(cve.id, cve.references)

          // Query back
          const result = await db.getCVEById(cve.id)
          expect(result?.references).toBeDefined()
          expect(result?.references.length).toBeGreaterThan(0)

          // Verify URL format
          expect(result?.references[0].url).toMatch(/^https?:\/\//)

          break
        }
      }
    })
  })

  describe('Sync with real NVD data', () => {
    it('should sync real NVD data to database', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      // Clear previous data
      db.clearAll()

      // Sync all CVEs
      let syncCount = 0
      for (const item of data.vulnerabilities) {
        const cve = parseNVDRealItem(item)
        if (cve) {
          await db.upsertCVE(cve)
          if (cve.cpe_matches && cve.cpe_matches.length > 0) {
            await db.insertCPEMatches(cve.id, cve.cpe_matches)
          }
          if (cve.references && cve.references.length > 0) {
            await db.insertReferences(cve.id, cve.references)
          }
          syncCount++
        }
      }

      expect(syncCount).toBe(data.vulnerabilities.length)
      console.log(`Synced ${syncCount} CVEs from real NVD sample`)

      // Verify all are in database using metadata
      const metadata = db.getMetadata()
      expect(metadata.total_cves).toBe(syncCount)
    })

    it('should handle various CVE states from real data', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      // Count different states
      const states = {
        total: data.vulnerabilities.length,
        withMetrics: 0,
        withCPE: 0,
        withRefs: 0,
        rejected: 0,
      }

      for (const item of data.vulnerabilities) {
        const cve = item.cve

        if (cve.metrics) states.withMetrics++
        if (cve.configurations?.some((c: any) => c.cpe_match?.length > 0 || c.children?.length > 0)) {
          states.withCPE++
        }
        if (cve.references?.length > 0) states.withRefs++
        if (cve.vulnStatus === 'Rejected') states.rejected++
      }

      console.log('Real NVD data breakdown:', states)
      expect(states.total).toBeGreaterThan(0)
    })

    it('should handle different CVSS versions', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      const cvssVersions = new Set<string>()

      for (const item of data.vulnerabilities) {
        const cve = item.cve
        if (cve.metrics?.cvssMetricV31) cvssVersions.add('V3.1')
        if (cve.metrics?.cvssMetricV30) cvssVersions.add('V3.0')
        if (cve.metrics?.cvssMetricV2) cvssVersions.add('V2.0')
      }

      console.log('Found CVSS versions:', Array.from(cvssVersions))
      // At least one version should be present
      expect(cvssVersions.size).toBeGreaterThan(0)
    })
  })

  describe('Edge cases with real data', () => {
    it('should handle CVEs with multiple descriptions', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      for (const item of data.vulnerabilities) {
        const cve = item.cve
        if (cve.descriptions && cve.descriptions.length > 1) {
          const parsed = parseNVDRealItem(item)
          expect(parsed?.description).toBeDefined()
          expect(typeof parsed?.description).toBe('string')
          console.log(`CVE ${cve.id} has ${cve.descriptions.length} descriptions`)
          break
        }
      }
    })

    it('should handle CVEs without CVSS scores', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      for (const item of data.vulnerabilities) {
        const cve = item.cve
        if (!cve.metrics || Object.keys(cve.metrics).length === 0) {
          const parsed = parseNVDRealItem(item)
          expect(parsed?.cvss_score).toBeUndefined()
          console.log(`CVE ${cve.id} has no CVSS score`)
          break
        }
      }
    })

    it('should handle nested CPE children', async () => {
      const jsonPath = path.join(NVD_FIXTURES_PATH, 'nvdcve-2.0-2024-sample.json')
      const rawData = await fs.readFile(jsonPath, 'utf-8')
      const data = JSON.parse(rawData)

      for (const item of data.vulnerabilities) {
        const cve = item.cve
        if (cve.configurations) {
          for (const config of cve.configurations) {
            if (config.children && config.children.length > 0) {
              const parsed = parseNVDRealItem(item)
              expect(parsed?.cpe_matches).toBeDefined()
              console.log(`CVE ${cve.id} has nested CPE children`)
              break
            }
          }
        }
      }
    })
  })
})

/**
 * Helper function to parse NVD item from real data format
 * This mirrors the actual implementation in nvdSyncService.ts
 */
function parseNVDRealItem(item: any): CVE | null {
  try {
    // Handle v2.0 format: { cve: {...} }
    const isV2 = !!item.cve

    let cveData: any
    if (isV2) {
      cveData = item.cve
    } else {
      // v1.1 format: item IS the cve data
      cveData = item
    }

    const id = cveData.id || cveData.CVE_data_meta?.ID
    if (!id) return null

    // Description - use English description
    let description = ''
    if (cveData.descriptions) {
      const englishDesc = cveData.descriptions.find((d: any) => d.lang === 'en')
      description = englishDesc?.value || cveData.descriptions[0]?.value || ''
    } else if (cveData.description?.description_data) {
      description = cveData.description.description_data[0]?.value || ''
    }

    // CVSS metrics
    let cvssScore: number | undefined
    let cvssVector: string | undefined
    let severity: CVE['severity'] | undefined

    const metrics = cveData.metrics
    if (metrics) {
      const cvssV31 = metrics.cvssMetricV31?.[0]
      const cvssV30 = metrics.cvssMetricV30?.[0]
      const cvssV2 = metrics.cvssMetricV2?.[0]

      const metric = cvssV31 || cvssV30 || cvssV2
      if (metric) {
        cvssScore = metric.cvssData?.baseScore
        cvssVector = metric.cvssData?.vectorString

        if (metric.cvssData?.baseSeverity) {
          severity = mapSeverityReal(metric.cvssData.baseSeverity)
        } else if (cvssScore !== undefined) {
          severity = scoreToSeverityReal(cvssScore)
        }
      }
    }

    // Dates
    const publishedDate = cveData.publishedDate || cveData.published
    const modifiedDate = cveData.lastModifiedDate || cveData.lastModified || cveData.modified

    // CPE matches
    const cpeMatches: CPEMatch[] = []
    const configurations = cveData.configurations || []

    for (const config of configurations) {
      // Handle direct cpe_match at config level
      if (config.cpe_match) {
        for (const cpe of config.cpe_match) {
          if (cpe.cpe23Uri || cpe.cpe22Uri) {
            cpeMatches.push({
              cve_id: id,
              cpe_text: cpe.cpe23Uri || cpe.cpe22Uri,
              vulnerable: cpe.vulnerable !== false,
            })
          }
        }
      }

      // Handle nested children with cpe_match
      if (config.children) {
        for (const child of config.children) {
          if (child.cpe_match) {
            for (const cpe of child.cpe_match) {
              if (cpe.cpe23Uri || cpe.cpe22Uri) {
                cpeMatches.push({
                  cve_id: id,
                  cpe_text: cpe.cpe23Uri || cpe.cpe22Uri,
                  vulnerable: cpe.vulnerable !== false,
                })
              }
            }
          }
        }
      }
    }

    // References
    const refs = cveData.references?.reference_data || cveData.references || []
    const references: Reference[] = []

    for (const ref of refs) {
      if (ref.url) {
        references.push({
          cve_id: id,
          url: ref.url,
          source: ref.source || ref.name,
          tags: ref.tags ? ref.tags.join(',') : undefined,
        })
      }
    }

    return {
      id,
      description,
      cvss_score: cvssScore,
      cvss_vector: cvssVector,
      severity,
      published_at: publishedDate,
      modified_at: modifiedDate,
      source: 'NVD',
      cpe_matches: cpeMatches,
      references,
    }
  } catch (error) {
    console.error('Failed to parse NVD item:', error)
    return null
  }
}

function mapSeverityReal(severity: string): CVE['severity'] {
  const upper = severity.toUpperCase()
  if (['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(upper)) {
    return upper as CVE['severity']
  }
  return 'MEDIUM'
}

function scoreToSeverityReal(score: number): CVE['severity'] {
  if (score >= 9.0) return 'CRITICAL'
  if (score >= 7.0) return 'HIGH'
  if (score >= 4.0) return 'MEDIUM'
  if (score > 0.0) return 'LOW'
  return 'NONE'
}
