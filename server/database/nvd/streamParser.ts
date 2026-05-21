/**
 * Streaming NVD CVE JSON Parser
 * Parses NVD CVE 2.0 JSON format in a streaming fashion to avoid
 * loading entire files into memory.
 *
 * Supports both NVD CVE 2.0 (current) and 1.1 (legacy) formats.
 */

import { createReadStream } from 'node:fs'
import type { CPEMatch, Reference } from '../types.js'

export interface ParsedCVE {
  id: string
  description: string
  cvss_score?: number
  cvss_vector?: string
  severity?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  published_at: string
  modified_at: string
  source: 'NVD'
  cpe_matches: CPEMatch[]
  references: Reference[]
}

export interface ParserOptions {
  batchSize?: number // Process CVEs in batches (default: 1000)
  onProgress?: (processed: number, total: number) => void
  onError?: (error: Error, cveId?: string) => void
}

export interface ParseResult {
  totalCVEs: number
  processedCVEs: number
  failedCVEs: number
  startTime: number
  endTime: number
}

/**
 * NVD CVE 2.0 Stream Parser
 */
export class NvdStreamParser {
  private options: Required<Omit<ParserOptions, 'onProgress' | 'onError'>>

  constructor(options: ParserOptions = {}) {
    this.options = {
      batchSize: options.batchSize || 1000,
    }
  }

  /**
   * Parse NVD CVE JSON file and process CVEs in batches
   */
  async parseFile(
    filePath: string,
    processBatch: (cves: ParsedCVE[]) => Promise<void>,
    options: ParserOptions = {},
  ): Promise<ParseResult> {
    const startTime = Date.now()
    let processedCVEs = 0
    let failedCVEs = 0
    let totalCVEs = 0

    try {
      // Read file
      const fileContent = await this.readFileContent(filePath)

      // Parse JSON
      const json = JSON.parse(fileContent)
      const cves = this.extractCVEs(json)
      totalCVEs = cves.length

      // Process in batches
      const batch: ParsedCVE[] = []

      for (let i = 0; i < cves.length; i++) {
        try {
          const cve = this.parseCVE(cves[i])
          if (cve) {
            batch.push(cve)
          }

          // Process batch when full
          if (batch.length >= this.options.batchSize) {
            await processBatch(batch)
            processedCVEs += batch.length
            batch.length = 0

            options.onProgress?.(processedCVEs, totalCVEs)
          }
        } catch (error) {
          failedCVEs++
          const rawCve = cves[i] as
            | Record<string, Record<string, Record<string, string> | undefined> | undefined>
            | undefined
          options.onError?.(error as Error, rawCve?.cve?.CVE_data_meta?.ID)
        }
      }

      // Process remaining batch
      if (batch.length > 0) {
        await processBatch(batch)
        processedCVEs += batch.length
        options.onProgress?.(processedCVEs, totalCVEs)
      }

      const endTime = Date.now()

      return {
        totalCVEs,
        processedCVEs,
        failedCVEs,
        startTime,
        endTime,
      }
    } catch (error) {
      throw new Error(`Failed to parse file ${filePath}: ${(error as Error).message}`)
    }
  }

  /**
   * Read file content efficiently
   */
  private async readFileContent(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const content: Buffer[] = []
      const stream = createReadStream(filePath)

      stream.on('data', (chunk: Buffer | string) => {
        content.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      stream.on('end', () => resolve(Buffer.concat(content).toString('utf-8')))
      stream.on('error', reject)
    })
  }

  /**
   * Extract CVE array from NVD JSON format
   */
  private extractCVEs(json: Record<string, unknown>): Array<Record<string, unknown>> {
    // NVD CVE 2.0 format
    if (json.vulnerabilities) {
      return json.vulnerabilities as Array<Record<string, unknown>>
    }

    // NVD CVE 1.1 format
    const cveData = json.CVE_data as Record<string, unknown> | undefined
    if (cveData?.CVE_Items) {
      return cveData.CVE_Items as Array<Record<string, unknown>>
    }

    // CVE_Items at root (some 1.1 formats)
    if (json.CVE_Items) {
      return json.CVE_Items as Array<Record<string, unknown>>
    }

    return []
  }

  /**
   * Parse a single CVE from NVD format
   */
  private parseCVE(rawItem: unknown): ParsedCVE | null {
    // NVD API responses are deeply nested dynamic JSON; cast once at the boundary
    type CvssMetric = {
      cvssData: {
        baseScore?: number
        vectorString?: string
        baseSeverity?: string
      }
    }
    type CpeMatch = {
      cpe23Uri?: string
      cpe_name?: string
      vulnerable?: string | boolean
    }
    type ConfigNode = {
      cpe_match?: CpeMatch[]
      operator?: string
      children?: Array<{ cpe_match?: CpeMatch[] }>
    }
    type RefItem = { url?: string; source?: string; tags?: string | string[]; href?: string }
    type NvdMetrics = {
      cvssMetricV31?: CvssMetric[]
      cvssMetricV30?: CvssMetric[]
      cvssMetricV2?: CvssMetric[]
    }

    const item = rawItem as {
      cve?: {
        id?: string
        descriptions?: Array<{ value?: string }>
        published?: string
        lastModified?: string
        CVE_data_meta?: { ID?: string }
        description?: { description_data?: Array<{ value?: string }> }
        references?: RefItem[] | { reference_data?: RefItem[] }
        metrics?: NvdMetrics
        configurations?: { nodes?: ConfigNode[] }
      }
      publishedDate?: string
      lastModifiedDate?: string
      metrics?: NvdMetrics
      configurations?: { nodes?: ConfigNode[] }
    }

    let cveId: string
    let description: string
    let publishedDate: string
    let modifiedDate: string

    // Handle different NVD formats
    if (item.cve?.id) {
      // NVD 2.0 format
      cveId = item.cve.id
      description = item.cve?.descriptions?.[0]?.value || ''
      publishedDate = item.cve?.published || ''
      modifiedDate = item.cve?.lastModified || ''
    } else if (item.cve?.CVE_data_meta?.ID) {
      // NVD 1.1 format
      cveId = item.cve.CVE_data_meta.ID
      description = item.cve.description?.description_data?.[0]?.value || ''
      publishedDate = item.publishedDate || ''
      modifiedDate = item.lastModifiedDate || ''
    } else {
      return null
    }

    if (!cveId) return null

    // Get CVSS score
    let cvss_score: number | undefined
    let cvss_vector: string | undefined
    let severity: string | undefined

    const metrics = item.cve?.metrics || item.metrics
    if (metrics) {
      // Try CVSS v3.1 first
      const cvssV31 = metrics.cvssMetricV31?.[0]
      if (cvssV31?.cvssData) {
        cvss_score = cvssV31.cvssData.baseScore
        cvss_vector = cvssV31.cvssData.vectorString
        severity = cvssV31.cvssData.baseSeverity
      }

      // Fall back to CVSS v3.0
      if (!cvss_score) {
        const cvssV30 = metrics.cvssMetricV30?.[0]
        if (cvssV30?.cvssData) {
          cvss_score = cvssV30.cvssData.baseScore
          cvss_vector = cvssV30.cvssData.vectorString
          severity = cvssV30.cvssData.baseSeverity
        }
      }

      // Fall back to CVSS v2.0
      if (!cvss_score) {
        const cvssV2 = metrics.cvssMetricV2?.[0]
        if (cvssV2?.cvssData) {
          cvss_score = cvssV2.cvssData.baseScore
          cvss_vector = cvssV2.cvssData.vectorString
          // Map v2 severity to v3 levels
          const baseSeverity = cvssV2.cvssData.baseSeverity
          if (baseSeverity === 'HIGH') severity = 'HIGH'
          else if (baseSeverity === 'MEDIUM') severity = 'MEDIUM'
          else if (baseSeverity === 'LOW') severity = 'LOW'
        }
      }
    }

    // Parse CPE matches
    const cpe_matches: CPEMatch[] = []
    const configNodes = item.cve?.configurations?.nodes || item.configurations?.nodes || []

    for (const config of configNodes) {
      const cpeList = config.cpe_match || []
      for (const cpe of cpeList) {
        cpe_matches.push({
          cpe_text: cpe.cpe23Uri || cpe.cpe_name || '',
          vulnerable: cpe.vulnerable ? cpe.vulnerable === 'true' || cpe.vulnerable === true : true,
          cve_id: cveId,
        })
      }

      // Handle negated CPEs in AND operations
      if (config.operator === 'AND' && config.children) {
        for (const child of config.children) {
          const childCpeList = child.cpe_match || []
          for (const cpe of childCpeList) {
            cpe_matches.push({
              cpe_text: cpe.cpe23Uri || cpe.cpe_name || '',
              vulnerable: cpe.vulnerable ? cpe.vulnerable === 'true' || cpe.vulnerable === true : true,
              cve_id: cveId,
            })
          }
        }
      }
    }

    // Parse references
    const references: Reference[] = []
    const refsRaw = item.cve?.references
    const refs: Array<RefItem> = Array.isArray(refsRaw) ? refsRaw : (refsRaw?.reference_data ?? [])

    for (const ref of refs) {
      if (typeof ref === 'object') {
        const rawTags = ref.tags
        const tags = Array.isArray(rawTags) ? rawTags.join(',') : rawTags || ''
        references.push({
          url: ref.url || ref.href || '',
          source: ref.source || '',
          tags: tags || undefined,
          cve_id: cveId,
        })
      }
    }

    return {
      id: cveId,
      description,
      cvss_score,
      cvss_vector,
      severity: severity as 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined,
      published_at: publishedDate,
      modified_at: modifiedDate,
      source: 'NVD',
      cpe_matches,
      references,
    }
  }

  /**
   * Quick count of CVEs in a file without parsing
   */
  async countCVEs(filePath: string): Promise<number> {
    try {
      const fileContent = await this.readFileContent(filePath)
      const json = JSON.parse(fileContent)
      const cves = this.extractCVEs(json)
      return cves.length
    } catch {
      return 0
    }
  }
}

/**
 * Create a stream parser with default options
 */
export function createStreamParser(options?: ParserOptions): NvdStreamParser {
  return new NvdStreamParser(options)
}
