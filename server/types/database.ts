/**
 * IPC Type Definitions for Database Operations
 *
 * Defines the communication protocol between renderer and main process
 * for NVD database operations via IPC.
 */

/**
 * NVD search query types
 */
export type NvdSearchType = 'cve-id' | 'cpe' | 'text'

/**
 * NVD search request
 */
export interface NvdSearchRequest {
  type: NvdSearchType
  query: string
  limit?: number
  offset?: number
}

/**
 * Severity levels for vulnerabilities
 */
export type Severity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

/**
 * Minimal CVE representation for search results
 */
export interface CveResult {
  id: string
  cveId: string
  description: string
  severity: Severity
  cvssScore: number
  cvssVector?: string
  publishedAt: string
  modifiedAt?: string
  source: string
}

/**
 * NVD search response
 */
export interface NvdSearchResponse {
  success: boolean
  results: CveResult[]
  total: number
  limit: number
  offset: number
  error?: string
}

/**
 * Get CVE by ID request
 */
export interface GetCveRequest {
  cveId: string
}

/**
 * Get CVE response
 */
export interface GetCveResponse {
  success: boolean
  cve: CveResult | null
  error?: string
}

/**
 * CPE Match with version range information
 */
export interface CpeMatchFull {
  id: number
  cveId: string
  cpe23Uri: string
  vulnerable: boolean
  versionStartIncluding?: string
  versionStartExcluding?: string
  versionEndIncluding?: string
  versionEndExcluding?: string
}

/**
 * CWE Reference
 */
export interface CweReference {
  id: number
  cveId: string
  cweId: string
  description?: string
}

/**
 * External Reference with full details
 */
export interface ReferenceFull {
  id: number
  cveId: string
  url: string
  source?: string
  tags?: string[]
  referenceType?: string
}

/**
 * CVE with full details including all related data
 */
export interface CveFullDetails {
  // Main CVE fields
  id: string
  description: string
  // CVSS v3.1
  cvssV31Score?: number
  cvssV31Vector?: string
  cvssV31Severity?: Severity
  // CVSS v3.0
  cvssV30Score?: number
  cvssV30Vector?: string
  cvssV30Severity?: Severity
  // CVSS v2.0
  cvssV2Score?: number
  cvssV2Vector?: string
  cvssV2Severity?: string
  // Legacy fields
  cvssScore?: number
  cvssVector?: string
  severity: Severity
  // Dates
  publishedAt: string
  modifiedAt: string
  // Source tracking
  source: string
  vulnStatus?: string
  assigner?: string
  // Related data
  cpeMatches: CpeMatchFull[]
  cweReferences: CweReference[]
  references: ReferenceFull[]
  // Extracted tags for quick access
  referenceTags: string[]
  // Multiple CVSS metrics from different sources
  cvssMetrics?: CvssMetric[]
}

/**
 * CVSS Metric with source information
 */
export interface CvssMetric {
  source: string
  type: string // Primary or Secondary
  version: '3.1' | '3.0' | '2.0'
  score: number
  severity: string
  vector: string
  exploitabilityScore?: number
  impactScore?: number
}

/**
 * Get full CVE details request
 */
export interface GetCveFullRequest {
  cveId: string
}

/**
 * Get full CVE details response
 */
export interface GetCveFullResponse {
  success: boolean
  cve: CveFullDetails | null
  error?: string
}

/**
 * Database statistics
 */
export interface DatabaseStats {
  totalCves: number
  lastUpdate: string | null
  dbSize: number
  version: number
}

/**
 * Get database stats response
 */
export interface GetStatsResponse {
  success: boolean
  stats: DatabaseStats | null
  error?: string
}

/**
 * Sync status
 */
export interface SyncStatus {
  isSyncing: boolean
  progress: number
  total: number
  currentFile: string | null
  error: string | null
  lastSync: string | null
}

/**
 * Get sync status response
 */
export interface SyncStatusResponse {
  success: boolean
  status: SyncStatus | null
  error?: string
}

/**
 * Start sync request
 */
export interface StartSyncRequest {
  force?: boolean
  years?: number[] // Years to download (e.g., [2020, 2021, ..., 2026])
}

/**
 * Start sync response
 */
export interface StartSyncResponse {
  success: boolean
  message: string
  error?: string
}

/**
 * NVD database detailed statistics
 */
export interface NvdDetailedStats {
  totalCves: number
  totalCwe: number
  totalCpe: number
  totalRefs: number
  oldestCve: string | null
  newestCve: string | null
  lastSuccessfulSync: string | null
  autoSyncEnabled: boolean
  autoSyncIntervalHours: number
}

/**
 * Get detailed stats response
 */
export interface GetDetailedStatsResponse {
  success: boolean
  stats: NvdDetailedStats | null
  error?: string
}

/**
 * Delta sync progress
 */
export interface DeltaSyncProgress {
  phase: 'checking' | 'fetching' | 'importing' | 'complete' | 'error' | 'cancelled'
  lastSyncAt: string | null
  fetchingFrom: string
  cvesFetched: number
  cvesProcessed: number
  cvesAdded: number
  cvesUpdated: number
  cvesSkipped: number
  percentage: number
  elapsedTimeMs: number
  estimatedTimeRemainingMs: number
  errors: string[]
}

/**
 * Delta sync result
 */
export interface DeltaSyncResult {
  success: boolean
  cvesFetched: number
  cvesAdded: number
  cvesUpdated: number
  cvesSkipped: number
  cvesFailed: number
  durationMs: number
  syncedAt: string
  errors: string[]
}

/**
 * NVD download progress for a single year
 */
export interface NvdDownloadProgress {
  phase: 'fetching' | 'parsing' | 'complete' | 'error' | 'cancelled'
  year?: number
  startIndex: number
  totalResults: number
  resultsPerPage: number
  percentage: number
  cvesDownloaded: number
  elapsedTimeMs: number
  estimatedTimeRemainingMs: number
  error?: string
}

/**
 * Bulk download progress
 */
export interface BulkDownloadProgress {
  phase: 'initializing' | 'downloading' | 'importing' | 'complete' | 'error' | 'cancelled'
  totalYears: number
  completedYears: number
  currentYear: number | null
  currentYearProgress: NvdDownloadProgress | null
  totalCves: number
  downloadedCves: number
  percentage: number
  elapsedTimeMs: number
  estimatedTimeRemainingMs: number
  errors: string[]
  startedAt: string
  completedAt: string | null
}

/**
 * Start bulk download request
 */
export interface StartBulkDownloadRequest {
  startYear: number
  endYear: number
  apiKey?: string
}

/**
 * Bulk download result
 */
export interface BulkDownloadResult {
  success: boolean
  completedYears: number[]
  failedYears: Map<number, string>
  totalCves: number
  durationMs: number
  cancelled: boolean
  errors: string[]
}

/**
 * IPC Channel Names
 */
export const DB_IPC_CHANNELS = {
  /** Search NVD database */
  SEARCH: 'db:nvd-search',
  /** Get specific CVE by ID */
  GET_CVE: 'db:nvd-get-by-cve',
  /** Get full CVE details including CPE, CWE, and references */
  GET_CVE_FULL: 'db:nvd-get-cve-full',
  /** Get database statistics */
  GET_STATS: 'db:nvd-get-stats',
  /** Get sync status */
  GET_SYNC_STATUS: 'db:sync-status',
  /** Start NVD sync */
  START_SYNC: 'db:sync-start',
  /** Get detailed NVD statistics */
  GET_DETAILED_STATS: 'db:nvd-detailed-stats',
  /** Start delta sync */
  START_DELTA_SYNC: 'db:delta-sync-start',
  /** Cancel sync */
  CANCEL_SYNC: 'db:sync-cancel',
  /** Start bulk download */
  START_BULK_DOWNLOAD: 'db:bulk-download-start',
  /** Get download queue status */
  GET_DOWNLOAD_QUEUE: 'db:download-queue',
  /** Clear download queue */
  CLEAR_DOWNLOAD_QUEUE: 'db:download-queue-clear',
  /** Enable auto sync */
  SET_AUTO_SYNC: 'db:auto-sync-set',
  /** Search CPEs */
  CPE_SEARCH: 'cpe:search',
  /** Get sync configuration */
  GET_SYNC_CONFIG: 'db:sync-config-get',
  /** Update sync configuration */
  UPDATE_SYNC_CONFIG: 'db:sync-config-update',
  /** Update storage configuration */
  UPDATE_STORAGE_CONFIG: 'db:storage-config-update',
  /** Update performance configuration */
  UPDATE_PERFORMANCE_CONFIG: 'db:performance-config-update',
  /** Reset database */
  RESET_DATABASE: 'db:reset',
  /** Rebuild indexes */
  REBUILD_INDEXES: 'db:rebuild-indexes',
} as const

/**
 * Database API interface for renderer process
 * This is exposed via the preload script
 */
export interface DatabaseAPI {
  /**
   * Search the NVD database
   * @param request Search parameters
   * @returns Promise with search results
   */
  search(request: NvdSearchRequest): Promise<NvdSearchResponse>

  /**
   * Get a specific CVE by ID
   * @param request CVE ID to fetch
   * @returns Promise with CVE details
   */
  getCve(request: GetCveRequest): Promise<GetCveResponse>

  /**
   * Get full CVE details including CPE matches, CWE references, and references
   * @param request CVE ID to fetch
   * @returns Promise with full CVE details
   */
  getCveFull(request: GetCveFullRequest): Promise<GetCveFullResponse>

  /**
   * Get database statistics
   * @returns Promise with database stats
   */
  getStats(): Promise<GetStatsResponse>

  /**
   * Get current sync status
   * @returns Promise with sync status
   */
  getSyncStatus(): Promise<SyncStatusResponse>

  /**
   * Start NVD data synchronization
   * @param request Optional force sync flag and years
   * @returns Promise with sync result
   */
  startSync(request?: StartSyncRequest): Promise<StartSyncResponse>

  /**
   * Get detailed NVD statistics
   * @returns Promise with detailed stats
   */
  getDetailedStats(): Promise<GetDetailedStatsResponse>

  /**
   * Start delta sync (incremental updates)
   * @param force Force full sync ignoring last sync time
   * @returns Promise with sync result
   */
  startDeltaSync(force?: boolean): Promise<DeltaSyncResult>

  /**
   * Cancel ongoing sync
   * @returns Promise with cancellation result
   */
  cancelSync(): Promise<{ success: boolean }>

  /**
   * Start bulk download for years
   * @param request Download parameters
   * @returns Promise with download result
   */
  startBulkDownload(request: StartBulkDownloadRequest): Promise<BulkDownloadResult>

  /**
   * Set auto sync configuration
   * @param enabled Enable auto sync
   * @param intervalHours Sync interval in hours
   * @returns Promise with result
   */
  setAutoSync(enabled: boolean, intervalHours: number): Promise<{ success: boolean }>

  /**
   * Listen to sync progress updates
   * @param callback Progress callback
   * @returns Cleanup function
   */
  onSyncProgress(callback: (progress: DeltaSyncProgress) => void): () => void

  /**
   * Listen to sync completion
   * @param callback Completion callback
   * @returns Cleanup function
   */
  onSyncComplete(callback: (result: DeltaSyncResult) => void): () => void

  /**
   * Listen to sync errors
   * @param callback Error callback
   * @returns Cleanup function
   */
  onSyncError(callback: (error: string) => void): () => void

  /**
   * Listen to bulk download progress
   * @param callback Progress callback
   * @returns Cleanup function
   */
  onBulkDownloadProgress(callback: (progress: BulkDownloadProgress) => void): () => void

  /**
   * Search for CPEs matching product name or tokens
   * @param request Search parameters
   * @returns Promise with CPE search results
   */
  cpeSearch(request: CPESearchRequest): Promise<CPESearchResponse>

  /**
   * Get sync configuration
   * @returns Promise with sync config
   */
  getSyncConfig(): Promise<{ success: boolean; config?: { syncInterval?: string }; error?: string }>

  /**
   * Update sync configuration
   * @param config Sync configuration
   * @returns Promise with result
   */
  updateSyncConfig(config: { syncInterval?: string }): Promise<{ success: boolean; error?: string }>

  /**
   * Update storage configuration
   * @param config Storage configuration
   * @returns Promise with result
   */
  updateStorageConfig(config: {
    maxSizeMB?: number
    pruneOldCves?: boolean
    pruneOlderThanYear?: number
  }): Promise<{ success: boolean; error?: string }>

  /**
   * Update performance configuration
   * @param config Performance configuration
   * @returns Promise with result
   */
  updatePerformanceConfig(config: {
    searchResultLimit?: number
    enableSearchCache?: boolean
    cacheSizeMB?: number
    cacheTTLMinutes?: number
  }): Promise<{ success: boolean; error?: string }>

  /**
   * Reset database to empty state
   * @returns Promise with result
   */
  resetDatabase(): Promise<{ success: boolean; error?: string }>

  /**
   * Rebuild database indexes
   * @returns Promise with result
   */
  rebuildIndexes(): Promise<{ success: boolean; error?: string }>
}

/**
 * Error codes for database operations
 */
export const DatabaseErrorCode = {
  DATABASE_NOT_INITIALIZED: 'DATABASE_NOT_INITIALIZED',
  DATABASE_LOCKED: 'DATABASE_LOCKED',
  INVALID_CVE_FORMAT: 'INVALID_CVE_FORMAT',
  INVALID_CPE_FORMAT: 'INVALID_CPE_FORMAT',
  SEARCH_FAILED: 'SEARCH_FAILED',
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type DatabaseErrorCodeValue = (typeof DatabaseErrorCode)[keyof typeof DatabaseErrorCode]

/**
 * Standard error response format
 */
export interface DatabaseError {
  code: DatabaseErrorCodeValue
  message: string
  details?: unknown
}

/**
 * CPE Search Request
 */
export interface CPESearchRequest {
  productName?: string
  tokens?: string[]
  limit?: number
}

/**
 * CPE Search Result
 */
export interface CPESearchResult {
  cpe23Uri: string
  vendor: string
  product: string
  version: string
  vulnerable: boolean
}

/**
 * CPE Search Response
 */
export interface CPESearchResponse {
  success: boolean
  results: CPESearchResult[]
  error?: string
}
