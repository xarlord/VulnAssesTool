/**
 * IPC Type Definitions
 *
 * Shared types for the Electron IPC boundary between main and renderer processes.
 * Both renderer (tsconfig.app.json) and main (tsconfig.main.json) can import these.
 * Re-exports domain types from the parent module where applicable.
 */

// Re-export domain types that are already properly defined
export type {
  CveResult,
  NvdSearchRequest,
  NvdSearchResponse,
  CPESearchRequest,
  CPESearchResult,
  CPESearchResponse,
} from '../types'

// ============================================================
// SEVERITY
// ============================================================

export type Severity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

// ============================================================
// CVE DETAIL TYPES
// ============================================================

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

export interface CweReference {
  id: number
  cveId: string
  cweId: string
  description?: string
}

export interface ReferenceFull {
  id: number
  cveId: string
  url: string
  source?: string
  tags?: string[]
  referenceType?: string
}

export interface CvssMetric {
  source: string
  type: string
  version: '3.1' | '3.0' | '2.0'
  score: number
  severity: string
  vector: string
  exploitabilityScore?: number
  impactScore?: number
}

export interface CveFullDetails {
  id: string
  description: string
  cvssV31Score?: number
  cvssV31Vector?: string
  cvssV31Severity?: Severity
  cvssV30Score?: number
  cvssV30Vector?: string
  cvssV30Severity?: Severity
  cvssV2Score?: number
  cvssV2Vector?: string
  cvssV2Severity?: string
  cvssScore?: number
  cvssVector?: string
  severity: Severity
  publishedAt: string
  modifiedAt: string
  source: string
  vulnStatus?: string
  assigner?: string
  cpeMatches: CpeMatchFull[]
  cweReferences: CweReference[]
  references: ReferenceFull[]
  referenceTags: string[]
  cvssMetrics?: CvssMetric[]
}

// ============================================================
// DATABASE REQUEST / RESPONSE
// ============================================================

export interface GetCveRequest {
  cveId: string
}

export interface GetCveResponse {
  success: boolean
  cve: import('../types').CveResult | null
  error?: string
}

export interface GetCveFullRequest {
  cveId: string
}

export interface GetCveFullResponse {
  success: boolean
  cve: CveFullDetails | null
  error?: string
}

export interface DatabaseStats {
  totalCves: number
  lastUpdate: string | null
  dbSize: number
  version: number
}

export interface GetStatsResponse {
  success: boolean
  stats: DatabaseStats | null
  error?: string
}

export interface SyncStatus {
  isSyncing: boolean
  progress: number
  total: number
  currentFile: string | null
  error: string | null
  lastSync: string | null
}

export interface SyncStatusResponse {
  success: boolean
  status: SyncStatus | null
  error?: string
}

export interface StartSyncRequest {
  force?: boolean
  years?: number[]
}

export interface StartSyncResponse {
  success: boolean
  message: string
  error?: string
}

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

export interface GetDetailedStatsResponse {
  success: boolean
  stats: NvdDetailedStats | null
  error?: string
}

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

export interface StartBulkDownloadRequest {
  startYear: number
  endYear: number
  apiKey?: string
}

export interface BulkDownloadResult {
  success: boolean
  completedYears: number[]
  failedYears: Map<number, string>
  totalCves: number
  durationMs: number
  cancelled: boolean
  errors: string[]
}

export interface FtsSearchResult {
  id: string
  cveId: string
  description: string
  severity: string
  score: number
}

export interface FtsStats {
  totalDocuments: number
  indexedTerms: number
  lastIndexed: string | null
}

export interface CacheStats {
  entries: number
  hitRate: number
  totalSizeKB: number
}

// ============================================================
// STORAGE (Secure Key Store)
// ============================================================

export type ApiKeyType = 'nvd' | 'osv' | 'github'

export interface SetApiKeyRequest {
  keyType: ApiKeyType
  apiKey: string
}

export interface GetApiKeyRequest {
  keyType: ApiKeyType
}

export interface DeleteApiKeyRequest {
  keyType: ApiKeyType
}

export interface HasApiKeyRequest {
  keyType: ApiKeyType
}

export interface SetApiKeyResponse {
  success: boolean
  error?: string
}

export interface GetApiKeyResponse {
  success: boolean
  apiKey: string | null
  error?: string
}

export interface DeleteApiKeyResponse {
  success: boolean
  error?: string
}

export interface HasApiKeyResponse {
  success: boolean
  hasKey: boolean
  error?: string
}

export interface NeedsMigrationResponse {
  success: boolean
  needsMigration: boolean
  error?: string
}

export interface MigrateKeysResponse {
  success: boolean
  migrated: string[]
  failed: string[]
  error?: string
}

export interface GetAllKeysResponse {
  success: boolean
  keys: Record<ApiKeyType, string | null>
  error?: string
}

export interface IsAvailableResponse {
  success: boolean
  isAvailable: boolean
}

// ============================================================
// BACKUP
// ============================================================

export interface BackupInfo {
  id: string
  filename: string
  createdAt: string
  size: number
  verified: boolean
  description?: string
}

export interface BackupConfig {
  enabled: boolean
  maxBackups: number
  schedule: 'daily' | 'weekly' | 'monthly' | 'manual'
  destination: string
}

export interface BackupResult {
  success: boolean
  backup?: BackupInfo
  error?: string
}

export interface BackupStats {
  totalBackups: number
  totalSize: number
  oldestBackup?: string
  newestBackup?: string
  nextScheduledBackup?: string
}

// ============================================================
// INTELLIGENCE (KEV & EPSS)
// ============================================================

export interface KevEntry {
  cveId: string
  vendorProject: string
  product: string
  vulnerabilityName: string
  dateAdded: string
  shortDescription: string
  requiredAction: string
  dueDate?: string
  knownRansomwareUse: boolean
  notes?: string
}

export interface KevSyncResult {
  success: boolean
  added: number
  removed: number
  unchanged: number
  total: number
  error?: string
  durationMs: number
}

export interface KevCatalogStats {
  total: number
  ransomwareRelated: number
  lastUpdated: string | null
}

export interface EpssScore {
  cveId: string
  score: number
  percentile: number
  fetchedAt: string
}

export interface EpssStats {
  cachedCount: number
  avgScore: number
  avgPercentile: number
}

export interface CheckKevResponse {
  success: boolean
  isKev: boolean
  error?: string
}

export interface GetKevDetailsResponse {
  success: boolean
  entry: KevEntry | null
  error?: string
}

export interface GetKevStatsResponse {
  success: boolean
  stats: KevCatalogStats
  error?: string
}

export interface SyncKevResponse {
  success: boolean
  result: KevSyncResult | null
  error?: string
}

export interface GetEpssScoreResponse {
  success: boolean
  score: EpssScore | null
  error?: string
}

export interface GetEpssScoresResponse {
  success: boolean
  scores: Record<string, EpssScore>
  error?: string
}

export interface RefreshEpssScoreResponse {
  success: boolean
  score: EpssScore | null
  error?: string
}

export interface GetEpssStatsResponse {
  success: boolean
  stats: EpssStats
  error?: string
}

// ============================================================
// CONTAINER
// ============================================================

export type ContainerRuntime = 'docker' | 'podman'

export interface CheckRuntimeResponse {
  success: boolean
  runtime?: {
    type: ContainerRuntime
    version: string
    available: boolean
    socket?: string
  }
  error?: string
}

export interface PullImageRequest {
  imageRef: string
  runtime: ContainerRuntime
  platform?: string
}

export interface PullImageResponse {
  success: boolean
  digest?: string
  error?: string
}

export interface GetManifestRequest {
  imageRef: string
  runtime: ContainerRuntime
}

export interface LayerInfo {
  digest: string
  size: number
  mediaType: string
}

export interface GetManifestResponse {
  success: boolean
  manifest?: {
    digest: string
    config: { digest: string }
    layers: LayerInfo[]
  }
  error?: string
}

export interface InspectImageRequest {
  imageRef: string
  runtime: ContainerRuntime
}

export interface InspectImageResponse {
  success: boolean
  config?: {
    os: string
    architecture: string
    variant?: string
    created?: string
    dockerVersion?: string
    labels?: Record<string, string>
  }
  error?: string
}

export interface ContainerPackage {
  name: string
  version: string
  manager: string
  architecture?: string
  cpe?: string
  purl?: string
  layerDigest: string
  filePaths?: string[]
}

export interface ExtractPackagesRequest {
  imageRef: string
  runtime: ContainerRuntime
  layerDigests: string[]
}

export interface ExtractPackagesResponse {
  success: boolean
  packages?: ContainerPackage[]
  error?: string
}

export interface ScanImageRequest {
  imageRef: string
  runtime: ContainerRuntime
  platform?: string
  maxLayers?: number
}

export interface ScanImageResponse {
  success: boolean
  result?: {
    image: {
      name: string
      registry?: string
      repository: string
      tag?: string
      digest?: string
      original: string
    }
    imageDigest: string
    manifestDigest: string
    platform: {
      os: string
      architecture: string
      variant?: string
    }
    layers: Array<{
      digest: string
      size: number
      mediaType: string
      command?: string
      packages: ContainerPackage[]
    }>
    packages: ContainerPackage[]
    stats: {
      totalLayers: number
      processedLayers: number
      totalPackages: number
      uniquePackages: number
      scanTimeMs: number
    }
    warnings: string[]
    errors: string[]
  }
  error?: string
}

export interface ContainerScanProgress {
  phase: string
  message: string
  percent?: number
}

// ============================================================
// UPDATER
// ============================================================

export interface UpdateAvailableEvent {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface UpdateNotAvailableEvent {
  version: string
}

export interface UpdateDownloadProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export interface UpdateDownloadedEvent {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface UpdateErrorEvent {
  message: string
}

// ============================================================
// CONFIG UPDATE TYPES
// ============================================================

export interface SyncConfigUpdate {
  syncInterval?: string
}

export interface StorageConfigUpdate {
  maxSizeMB?: number
  pruneOldCves?: boolean
  pruneOlderThanYear?: number
}

export interface PerformanceConfigUpdate {
  searchResultLimit?: number
  enableSearchCache?: boolean
  cacheSizeMB?: number
  cacheTTLMinutes?: number
}

export interface ConfigUpdateResponse {
  success: boolean
  error?: string
}

export interface SyncConfigResponse {
  success: boolean
  config?: { syncInterval?: string }
  error?: string
}
