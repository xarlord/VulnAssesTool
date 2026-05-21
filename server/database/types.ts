/**
 * Type definitions for NVD Database (Main Process)
 */

export interface CVE {
  id: string
  description: string
  cvss_score?: number
  cvss_vector?: string
  severity?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  published_at: string
  modified_at: string
  source: 'NVD' | 'OSV'
}

export interface CPEMatch {
  id?: number
  cve_id: string
  cpe_text: string
  vulnerable: boolean
  // Enhanced CPE fields for fast lookups (added in migration 10)
  cpe23_uri?: string
  cpe_part?: string // 'a' (application), 'o' (os), 'h' (hardware)
  cpe_vendor?: string // e.g., 'microsoft', 'google'
  cpe_product?: string // e.g., 'chrome', 'windows'
  cpe_version?: string // e.g., '1.0', '2024'
  // Version range fields
  version_start_including?: string
  version_start_excluding?: string
  version_end_including?: string
  version_end_excluding?: string
}

export interface Reference {
  id?: number
  cve_id: string
  url: string
  source?: string
  tags?: string
}

export interface CVEWithDetails extends CVE {
  cpe_matches?: CPEMatch[]
  references?: Reference[]
}

export interface DatabaseMetadata {
  last_sync_at?: string
  schema_version: string
  total_cves: number
  cves_after_2021: number
}

export interface SyncProgress {
  stage: 'downloading' | 'parsing' | 'inserting' | 'complete' | 'error'
  progress: number // 0-100
  total_files?: number
  current_file?: string
  error?: string
}

export interface SyncOptions {
  startDate?: string // ISO date string, e.g., '2021-01-01'
  endDate?: string // ISO date string
  apiKey?: string
  onProgress?: (progress: SyncProgress) => void
}

export interface DatabaseQueryOptions {
  severity?: CVE['severity'][]
  minCvssScore?: number
  maxCvssScore?: number
  startDate?: string
  endDate?: string
  year?: number
  cpeText?: string
  limit?: number
  offset?: number
}

/**
 * Options for CPE component-based search (optimized for 250K+ CVEs)
 */
export interface CPEComponentSearchOptions {
  vendor: string
  product?: string
  vulnerable?: boolean
  severity?: CVE['severity'][]
  minScore?: number
  year?: number
  limit?: number
  offset?: number
}

/**
 * Options for severity and date range search (optimized for 250K+ CVEs)
 */
export interface SeverityDateSearchOptions {
  severity?: CVE['severity'][]
  minScore?: number
  maxScore?: number
  startDate?: string
  endDate?: string
  year?: number
  limit?: number
  offset?: number
}

/**
 * Parsed CPE components from CPE URI
 */
export interface ParsedCPE {
  part: string | null // 'a' (application), 'o' (os), 'h' (hardware)
  vendor: string | null
  product: string | null
  version: string | null
}

/**
 * CVE statistics for dashboard display
 */
export interface CVEStatistics {
  totalCount: number
  byYear: Array<{ year: number; count: number }>
  bySeverity: Array<{ severity: string; count: number }>
  lastSyncAt?: string
  dbSizeBytes: number
}

export interface Migration {
  version: number
  name: string
  up: string
  down: string
}
