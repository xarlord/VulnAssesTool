/**
 * NVD Data Importer for v2 Schema
 *
 * Imports CVE data from NVD API v2 format into the local database
 * with support for:
 * - CVSS v3.1, v3.0, v2.0 fields
 * - CWE references
 * - CPE matches with version ranges
 * - Enhanced references with types
 */

import type { Database } from 'sql.js'
import type { NvdCveV2 } from './nvdApiV2Client.js'

/**
 * Import progress information
 */
export interface ImportProgress {
  phase: 'preparing' | 'importing' | 'indexing' | 'complete' | 'error'
  totalCves: number
  processedCves: number
  currentBatch: number
  totalBatches: number
  percentage: number
  cvesPerSecond: number
  elapsedTimeMs: number
  estimatedTimeRemainingMs: number
  errors: string[]
}

/**
 * Import options
 */
export interface ImportOptions {
  batchSize?: number // Default: 500
  onProgress?: (progress: ImportProgress) => void
  skipExisting?: boolean // Skip CVEs that already exist
  updateExisting?: boolean // Update existing CVEs
  signal?: AbortSignal
}

/**
 * Import result
 */
export interface ImportResult {
  success: boolean
  totalCves: number
  importedCves: number
  updatedCves: number
  skippedCves: number
  failedCves: number
  durationMs: number
  cvesPerSecond: number
  errors: string[]
}

/**
 * Transformed CVE for v2 schema
 */
interface TransformedCve {
  id: string
  description: string
  cvss_v31_score: number | null
  cvss_v31_vector: string | null
  cvss_v31_severity: string | null
  cvss_v30_score: number | null
  cvss_v30_vector: string | null
  cvss_v30_severity: string | null
  cvss_v2_score: number | null
  cvss_v2_vector: string | null
  cvss_v2_severity: string | null
  cvss_score: number | null
  cvss_vector: string | null
  severity: string | null
  published_at: string
  modified_at: string
  source: string
  vuln_status: string | null
  assigner: string | null
}

/**
 * CWE reference
 */
interface CweReference {
  cve_id: string
  cwe_id: string
  description: string | null
}

/**
 * CPE match with version ranges
 */
interface CpeMatchV2 {
  cve_id: string
  cpe23_uri: string
  vulnerable: number
  version_start_including: string | null
  version_start_excluding: string | null
  version_end_including: string | null
  version_end_excluding: string | null
}

/**
 * Enhanced reference
 */
interface ReferenceV2 {
  cve_id: string
  url: string
  source: string | null
  tags: string | null
  reference_type: string | null
}

/**
 * CVSS metric with source info
 */
interface CvssMetricV2 {
  cve_id: string
  source: string
  type: string
  version: string
  score: number
  severity: string
  vector: string
  exploitability_score: number | null
  impact_score: number | null
}

/**
 * NVD Data Importer for v2 Schema
 */
export class NvdDataImporter {
  private db: Database
  private batchSize: number
  private progress: ImportProgress
  private startTime: number = 0

  constructor(db: Database) {
    this.db = db
    this.batchSize = 500
    this.progress = this.createInitialProgress()
  }

  /**
   * Create initial progress state
   */
  private createInitialProgress(): ImportProgress {
    return {
      phase: 'preparing',
      totalCves: 0,
      processedCves: 0,
      currentBatch: 0,
      totalBatches: 0,
      percentage: 0,
      cvesPerSecond: 0,
      elapsedTimeMs: 0,
      estimatedTimeRemainingMs: 0,
      errors: [],
    }
  }

  /**
   * Get current progress
   */
  getProgress(): ImportProgress {
    return { ...this.progress }
  }

  /**
   * Import CVEs into database
   */
  async importCves(cves: NvdCveV2[], options: ImportOptions = {}): Promise<ImportResult> {
    this.startTime = Date.now()
    this.batchSize = options.batchSize || 500
    this.progress = this.createInitialProgress()
    this.progress.totalCves = cves.length
    this.progress.totalBatches = Math.ceil(cves.length / this.batchSize)
    this.progress.phase = 'importing'

    const result: ImportResult = {
      success: true,
      totalCves: cves.length,
      importedCves: 0,
      updatedCves: 0,
      skippedCves: 0,
      failedCves: 0,
      durationMs: 0,
      cvesPerSecond: 0,
      errors: [],
    }

    // Begin transaction
    let transactionActive = false
    try {
      this.db.run('BEGIN TRANSACTION')
      transactionActive = true
    } catch {
      // Transaction might already be active in some edge cases
      transactionActive = true
    }

    try {
      for (let i = 0; i < cves.length; i += this.batchSize) {
        // Check for cancellation
        if (options.signal?.aborted) {
          if (transactionActive) {
            try {
              this.db.run('ROLLBACK')
              transactionActive = false
            } catch {
              // Ignore rollback errors
            }
          }
          result.success = false
          result.errors.push('Import cancelled')
          break
        }

        const batch = cves.slice(i, Math.min(i + this.batchSize, cves.length))
        this.progress.currentBatch = Math.floor(i / this.batchSize) + 1

        for (const cve of batch) {
          try {
            const transformed = this.transformCve(cve)
            const existing = this.cveExists(transformed.id)

            if (existing && options.skipExisting) {
              result.skippedCves++
            } else if (existing && options.updateExisting) {
              this.updateCve(transformed)
              result.updatedCves++
            } else {
              this.insertCve(transformed)
              result.importedCves++
            }

            // Insert related data
            this.insertCweReferences(cve.id, this.extractCweReferences(cve))
            this.insertCpeMatches(cve.id, this.extractCpeMatches(cve))
            this.insertReferences(cve.id, this.extractReferences(cve))
            this.insertCvssMetrics(cve.id, this.extractCvssMetrics(cve))

            this.progress.processedCves++
          } catch (error) {
            result.failedCves++
            const errorMsg = `Failed to import ${cve.id}: ${error}`
            result.errors.push(errorMsg)
            this.progress.errors.push(errorMsg)
          }
        }

        // Update progress
        this.progress.percentage = (this.progress.processedCves / this.progress.totalCves) * 100
        this.progress.elapsedTimeMs = Date.now() - this.startTime
        this.progress.cvesPerSecond = this.progress.processedCves / (this.progress.elapsedTimeMs / 1000) || 0
        this.progress.estimatedTimeRemainingMs = this.estimateRemainingTime()

        options.onProgress?.(this.getProgress())
      }

      if (transactionActive) {
        this.db.run('COMMIT')
        transactionActive = false
      }

      // Update FTS index
      this.progress.phase = 'indexing'
      options.onProgress?.(this.getProgress())
      this.rebuildFtsIndex()

      this.progress.phase = 'complete'
      this.progress.percentage = 100
    } catch (error) {
      if (transactionActive) {
        try {
          this.db.run('ROLLBACK')
        } catch {
          // Ignore rollback errors
        }
      }
      result.success = false
      result.errors.push(`Transaction failed: ${error}`)
      this.progress.phase = 'error'
      this.progress.errors.push(`Transaction failed: ${error}`)
    }

    result.durationMs = Date.now() - this.startTime
    result.cvesPerSecond = result.totalCves / (result.durationMs / 1000) || 0

    options.onProgress?.(this.getProgress())

    return result
  }

  /**
   * Transform NVD CVE to database format
   */
  private transformCve(cve: NvdCveV2): TransformedCve {
    const transformed: TransformedCve = {
      id: cve.id,
      description: this.getEnglishDescription(cve),
      cvss_v31_score: null,
      cvss_v31_vector: null,
      cvss_v31_severity: null,
      cvss_v30_score: null,
      cvss_v30_vector: null,
      cvss_v30_severity: null,
      cvss_v2_score: null,
      cvss_v2_vector: null,
      cvss_v2_severity: null,
      cvss_score: null,
      cvss_vector: null,
      severity: null,
      published_at: cve.published,
      modified_at: cve.lastModified,
      source: 'NVD',
      vuln_status: cve.vulnStatus || null,
      assigner: cve.sourceIdentifier || null,
    }

    // Extract CVSS v3.1
    if (cve.metrics?.cvssMetricV31?.[0]) {
      const m = cve.metrics.cvssMetricV31[0]
      transformed.cvss_v31_score = m.cvssData.baseScore
      transformed.cvss_v31_vector = m.cvssData.vectorString
      transformed.cvss_v31_severity = m.cvssData.baseSeverity
      // Use v3.1 as primary
      transformed.cvss_score = m.cvssData.baseScore
      transformed.cvss_vector = m.cvssData.vectorString
      transformed.severity = m.cvssData.baseSeverity
    }

    // Extract CVSS v3.0
    if (cve.metrics?.cvssMetricV30?.[0]) {
      const m = cve.metrics.cvssMetricV30[0]
      transformed.cvss_v30_score = m.cvssData.baseScore
      transformed.cvss_v30_vector = m.cvssData.vectorString
      transformed.cvss_v30_severity = m.cvssData.baseSeverity
      // Use v3.0 as fallback for primary
      if (!transformed.cvss_score) {
        transformed.cvss_score = m.cvssData.baseScore
        transformed.cvss_vector = m.cvssData.vectorString
        transformed.severity = m.cvssData.baseSeverity
      }
    }

    // Extract CVSS v2.0
    if (cve.metrics?.cvssMetricV2?.[0]) {
      const m = cve.metrics.cvssMetricV2[0]
      transformed.cvss_v2_score = m.cvssData.baseScore
      transformed.cvss_v2_vector = m.cvssData.vectorString
      transformed.cvss_v2_severity = m.baseSeverity || null
      // Use v2.0 as fallback for primary
      if (!transformed.cvss_score) {
        transformed.cvss_score = m.cvssData.baseScore
        transformed.cvss_vector = m.cvssData.vectorString
        transformed.severity = m.baseSeverity || null
      }
    }

    return transformed
  }

  /**
   * Get English description from CVE
   */
  private getEnglishDescription(cve: NvdCveV2): string {
    const enDesc = cve.descriptions.find((d) => d.lang === 'en')
    return enDesc?.value || cve.descriptions[0]?.value || 'No description available'
  }

  /**
   * Check if CVE exists
   */
  private cveExists(id: string): boolean {
    const result = this.db.exec('SELECT 1 FROM cves WHERE id = ?', [id])
    return result.length > 0 && result[0].values.length > 0
  }

  /**
   * Insert CVE
   */
  private insertCve(cve: TransformedCve): void {
    const stmt = this.db.prepare(`
      INSERT INTO cves (
        id, description,
        cvss_v31_score, cvss_v31_vector, cvss_v31_severity,
        cvss_v30_score, cvss_v30_vector, cvss_v30_severity,
        cvss_v2_score, cvss_v2_vector, cvss_v2_severity,
        cvss_score, cvss_vector, severity,
        published_at, modified_at, source, vuln_status, assigner
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run([
      cve.id,
      cve.description,
      cve.cvss_v31_score,
      cve.cvss_v31_vector,
      cve.cvss_v31_severity,
      cve.cvss_v30_score,
      cve.cvss_v30_vector,
      cve.cvss_v30_severity,
      cve.cvss_v2_score,
      cve.cvss_v2_vector,
      cve.cvss_v2_severity,
      cve.cvss_score,
      cve.cvss_vector,
      cve.severity,
      cve.published_at,
      cve.modified_at,
      cve.source,
      cve.vuln_status,
      cve.assigner,
    ])

    stmt.free()
  }

  /**
   * Update CVE
   */
  private updateCve(cve: TransformedCve): void {
    const stmt = this.db.prepare(`
      UPDATE cves SET
        description = ?,
        cvss_v31_score = ?, cvss_v31_vector = ?, cvss_v31_severity = ?,
        cvss_v30_score = ?, cvss_v30_vector = ?, cvss_v30_severity = ?,
        cvss_v2_score = ?, cvss_v2_vector = ?, cvss_v2_severity = ?,
        cvss_score = ?, cvss_vector = ?, severity = ?,
        modified_at = ?, vuln_status = ?, assigner = ?,
        last_synced_at = datetime('now')
      WHERE id = ?
    `)

    stmt.run([
      cve.description,
      cve.cvss_v31_score,
      cve.cvss_v31_vector,
      cve.cvss_v31_severity,
      cve.cvss_v30_score,
      cve.cvss_v30_vector,
      cve.cvss_v30_severity,
      cve.cvss_v2_score,
      cve.cvss_v2_vector,
      cve.cvss_v2_severity,
      cve.cvss_score,
      cve.cvss_vector,
      cve.severity,
      cve.modified_at,
      cve.vuln_status,
      cve.assigner,
      cve.id,
    ])

    stmt.free()
  }

  /**
   * Extract CWE references from CVE
   */
  private extractCweReferences(cve: NvdCveV2): CweReference[] {
    const refs: CweReference[] = []

    if (!cve.weaknesses) return refs

    for (const weakness of cve.weaknesses) {
      for (const desc of weakness.description) {
        // CWE IDs are typically in format "CWE-XXX"
        const cweId = desc.value
        if (cweId && cweId.startsWith('CWE-')) {
          refs.push({
            cve_id: cve.id,
            cwe_id: cweId,
            description: null, // CWE descriptions would need separate lookup
          })
        }
      }
    }

    return refs
  }

  /**
   * Extract CPE matches from CVE
   */
  private extractCpeMatches(cve: NvdCveV2): CpeMatchV2[] {
    const matches: CpeMatchV2[] = []

    if (!cve.configurations) return matches

    for (const config of cve.configurations) {
      for (const node of config.nodes) {
        for (const cpe of node.cpeMatch) {
          matches.push({
            cve_id: cve.id,
            cpe23_uri: cpe.cpe23Uri,
            vulnerable: cpe.vulnerable ? 1 : 0,
            version_start_including: cpe.versionStartIncluding || null,
            version_start_excluding: cpe.versionStartExcluding || null,
            version_end_including: cpe.versionEndIncluding || null,
            version_end_excluding: cpe.versionEndExcluding || null,
          })
        }
      }
    }

    return matches
  }

  /**
   * Extract references from CVE
   */
  private extractReferences(cve: NvdCveV2): ReferenceV2[] {
    const refs: ReferenceV2[] = []

    if (!cve.references) return refs

    for (const ref of cve.references) {
      refs.push({
        cve_id: cve.id,
        url: ref.url,
        source: ref.source || null,
        tags: ref.tags?.join(',') || null,
        reference_type: this.classifyReferenceType(ref.tags || []),
      })
    }

    return refs
  }

  /**
   * Classify reference type from tags
   */
  private classifyReferenceType(tags: string[]): string | null {
    // Check Vendor Advisory before Patch since vendor advisories often include patches
    if (tags.includes('Vendor Advisory')) return 'vendor'
    if (tags.includes('Patch')) return 'patch'
    if (tags.includes('Third Party Advisory')) return 'third-party'
    if (tags.includes('Issue Tracking')) return 'issue'
    if (tags.includes('Exploit')) return 'exploit'
    if (tags.includes('Release Notes')) return 'release'
    return null
  }

  /**
   * Insert CWE references
   */
  private insertCweReferences(cveId: string, refs: CweReference[]): void {
    // Delete existing
    this.db.run('DELETE FROM cwe_references WHERE cve_id = ?', [cveId])

    if (refs.length === 0) return

    const stmt = this.db.prepare(`
      INSERT INTO cwe_references (cve_id, cwe_id, description)
      VALUES (?, ?, ?)
    `)

    for (const ref of refs) {
      stmt.run([ref.cve_id, ref.cwe_id, ref.description])
    }

    stmt.free()
  }

  /**
   * Insert CPE matches
   */
  private insertCpeMatches(cveId: string, matches: CpeMatchV2[]): void {
    // Delete existing
    this.db.run('DELETE FROM cpe_matches WHERE cve_id = ?', [cveId])

    if (matches.length === 0) return

    const stmt = this.db.prepare(`
      INSERT INTO cpe_matches (
        cve_id, cpe23_uri, vulnerable,
        version_start_including, version_start_excluding,
        version_end_including, version_end_excluding
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    for (const match of matches) {
      stmt.run([
        match.cve_id,
        match.cpe23_uri,
        match.vulnerable,
        match.version_start_including,
        match.version_start_excluding,
        match.version_end_including,
        match.version_end_excluding,
      ])
    }

    stmt.free()
  }

  /**
   * Insert references
   */
  private insertReferences(cveId: string, refs: ReferenceV2[]): void {
    // Delete existing
    this.db.run('DELETE FROM "references" WHERE cve_id = ?', [cveId])

    if (refs.length === 0) return

    const stmt = this.db.prepare(`
      INSERT INTO "references" (cve_id, url, source, tags, reference_type)
      VALUES (?, ?, ?, ?, ?)
    `)

    for (const ref of refs) {
      stmt.run([ref.cve_id, ref.url, ref.source, ref.tags, ref.reference_type])
    }

    stmt.free()
  }

  /**
   * Extract CVSS metrics from CVE (all sources)
   */
  private extractCvssMetrics(cve: NvdCveV2): CvssMetricV2[] {
    const metrics: CvssMetricV2[] = []

    // Extract CVSS v3.1 metrics (may have multiple from different sources)
    if (cve.metrics?.cvssMetricV31) {
      for (const m of cve.metrics.cvssMetricV31) {
        metrics.push({
          cve_id: cve.id,
          source: m.source || 'Unknown',
          type: m.type || 'Secondary',
          version: '3.1',
          score: m.cvssData.baseScore,
          severity: m.cvssData.baseSeverity,
          vector: m.cvssData.vectorString,
          exploitability_score: m.exploitabilityScore || null,
          impact_score: m.impactScore || null,
        })
      }
    }

    // Extract CVSS v3.0 metrics
    if (cve.metrics?.cvssMetricV30) {
      for (const m of cve.metrics.cvssMetricV30) {
        metrics.push({
          cve_id: cve.id,
          source: m.source || 'Unknown',
          type: m.type || 'Secondary',
          version: '3.0',
          score: m.cvssData.baseScore,
          severity: m.cvssData.baseSeverity,
          vector: m.cvssData.vectorString,
          exploitability_score: m.exploitabilityScore || null,
          impact_score: m.impactScore || null,
        })
      }
    }

    // Extract CVSS v2.0 metrics
    if (cve.metrics?.cvssMetricV2) {
      for (const m of cve.metrics.cvssMetricV2) {
        metrics.push({
          cve_id: cve.id,
          source: m.source || 'Unknown',
          type: m.type || 'Secondary',
          version: '2.0',
          score: m.cvssData.baseScore,
          severity: m.baseSeverity || 'UNKNOWN',
          vector: m.cvssData.vectorString,
          exploitability_score: m.exploitabilityScore || null,
          impact_score: m.impactScore || null,
        })
      }
    }

    return metrics
  }

  /**
   * Insert CVSS metrics
   */
  private insertCvssMetrics(cveId: string, metrics: CvssMetricV2[]): void {
    // Delete existing
    this.db.run('DELETE FROM cvss_metrics WHERE cve_id = ?', [cveId])

    if (metrics.length === 0) return

    const stmt = this.db.prepare(`
      INSERT INTO cvss_metrics (
        cve_id, source, type, version, score, severity, vector,
        exploitability_score, impact_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    for (const m of metrics) {
      stmt.run([
        m.cve_id,
        m.source,
        m.type,
        m.version,
        m.score,
        m.severity,
        m.vector,
        m.exploitability_score,
        m.impact_score,
      ])
    }

    stmt.free()
  }

  /**
   * Rebuild FTS index
   */
  private rebuildFtsIndex(): void {
    try {
      // Check if FTS table exists, create if not
      const tableCheck = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cves_fts'")

      if (tableCheck.length === 0 || tableCheck[0].values.length === 0) {
        // Create FTS5 virtual table
        this.db.run(`
          CREATE VIRTUAL TABLE IF NOT EXISTS cves_fts USING fts5(
            id,
            description,
            content='cves',
            content_rowid='rowid'
          )
        `)
        console.log('Created FTS5 table: cves_fts')
      }

      // Clear existing FTS data
      this.db.run('DELETE FROM cves_fts')

      // Rebuild FTS
      this.db.run(`
        INSERT INTO cves_fts(rowid, id, description)
        SELECT rowid, id, description FROM cves
      `)
    } catch (error) {
      // FTS might not be available
      console.warn('FTS index rebuild failed:', error)
    }
  }

  /**
   * Estimate remaining time
   */
  private estimateRemainingTime(): number {
    if (this.progress.processedCves === 0 || this.progress.elapsedTimeMs === 0) {
      return 0
    }

    const rate = this.progress.processedCves / this.progress.elapsedTimeMs
    const remaining = this.progress.totalCves - this.progress.processedCves

    return remaining / rate
  }

  /**
   * Get database statistics
   */
  getStats(): {
    totalCves: number
    totalCwe: number
    totalCpe: number
    totalRefs: number
  } {
    const cves = this.db.exec('SELECT COUNT(*) FROM cves')
    const cwe = this.db.exec('SELECT COUNT(*) FROM cwe_references')
    const cpe = this.db.exec('SELECT COUNT(*) FROM cpe_matches')
    const refs = this.db.exec('SELECT COUNT(*) FROM "references"')

    return {
      totalCves: (cves[0]?.values[0]?.[0] as number) || 0,
      totalCwe: (cwe[0]?.values[0]?.[0] as number) || 0,
      totalCpe: (cpe[0]?.values[0]?.[0] as number) || 0,
      totalRefs: (refs[0]?.values[0]?.[0] as number) || 0,
    }
  }
}

/**
 * Create an NVD data importer
 */
export function createNvdDataImporter(db: Database): NvdDataImporter {
  return new NvdDataImporter(db)
}
