// Import CVSS types
export * from './types/cvss'

// ============================================================
// CVE SEARCH RESULT TYPES
// ============================================================

/**
 * CVE search result from local NVD database
 * Used by both renderer (Search page) and API (vulnMatcher)
 */
export interface CveResult {
  /** Unique identifier (internal) */
  id?: string
  /** CVE identifier (e.g., CVE-2024-12345) */
  cveId: string
  /** Vulnerability description */
  description: string
  /** Severity level (uppercase) */
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NONE'
  /** CVSS score (0-10) */
  cvssScore: number
  /** CVSS vector string */
  cvssVector?: string | null
  /** Publication date (ISO string) */
  publishedAt?: string | null
  /** Last modified date (ISO string) */
  modifiedAt?: string | null
  /** Source database */
  source: string
}

/**
 * NVD search request parameters
 */
export interface NvdSearchRequest {
  type: 'cve-id' | 'cpe' | 'text'
  query: string
  limit?: number
  offset?: number
}

/**
 * NVD search response
 */
export interface NvdSearchResponse {
  success: boolean
  results: CveResult[]
  total: number
  error?: string
}

// CPE Search Types (re-exported from electron types for renderer access)
export interface CPESearchRequest {
  productName?: string
  tokens?: string[]
  limit?: number
}

export interface CPESearchResult {
  cpe23Uri: string
  vendor: string
  product: string
  version: string
  vulnerable: boolean
}

export interface CPESearchResponse {
  success: boolean
  results: CPESearchResult[]
  error?: string
}

// Project Types
export interface Project {
  id: string
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
  lastScanAt?: Date
  lastVulnDataRefresh?: Date // When vulnerability data was last refreshed from API
  sbomFiles: SbomFile[]
  components: Component[]
  vulnerabilities: Vulnerability[]
  statistics: ProjectStatistics
  dependencyGraph?: DependencyGraph
}

export interface SbomFile {
  id: string
  filename: string
  format: 'cyclonedx' | 'spdx'
  formatVersion: string
  uploadedAt: Date
  fileHash: string
  componentCount: number
}

/**
 * CPE Suggestion for components without a CPE
 */
export interface CPESuggestion {
  cpe: string
  vendor: string
  product: string
  confidence: 'high' | 'medium' | 'low'
  source: 'known_mapping' | 'inferred' | 'fallback'
}

export interface Component {
  id: string
  name: string
  version: string
  type: 'library' | 'framework' | 'application' | 'container' | 'other'
  purl?: string
  cpe?: string
  licenses: string[]
  supplier?: string
  description?: string
  hash?: string // Hash from the SBOM file (if provided)
  componentHash?: string // Computed hash for incremental scanning (DiffEngine)
  vulnerabilities: string[]
  dependencies?: string[] // IDs of components this depends on
  dependents?: string[] // IDs of components that depend on this
  patchInfo?: ComponentPatchInfo
  sbomFileId?: string // ID of the SBOM file this component was imported from
  suggestedCpes?: CPESuggestion[] // Suggested CPEs for components without a CPE
  hasMissingCpe?: boolean // Flag to indicate if component needs CPE selection
}

export interface ComponentPatchInfo {
  hasFixAvailable: boolean
  recommendedVersion?: string
  fixedVersions: string[]
  vulnerableVersions: string[]
}

export interface Vulnerability {
  id: string
  source: VulnerabilitySource
  sources?: VulnerabilitySource[] // Track all sources that reported this
  severity: 'critical' | 'high' | 'medium' | 'low' | 'none'
  cvssScore?: number
  cvssVector?: string
  cvssBreakdown?: CvssBreakdown // Detailed CVSS analysis
  cwes?: string[]
  description: string
  references: VulnerabilityReference[]
  affectedComponents: string[]
  publishedAt?: Date
  modifiedAt?: Date
  // Patch and remediation information
  patchInfo?: PatchInfo
  exploitStatus?: 'exploited' | 'publicly-disclosed' | 'not-exploited' | 'unknown'
  patchedVersions?: string[]
  aliases?: string[] // CVE, GHSA, OSV ID mapping
  // Intelligence fields (KEV & EPSS)
  isKev?: boolean // In CISA Known Exploited Vulnerabilities catalog
  kevDetails?: KevDetails // KEV catalog details
  epssScore?: number // EPSS probability score (0-1)
  epssPercentile?: number // EPSS percentile (0-1)
  riskScore?: number // Composite risk score (0-100)
}

/**
 * Extended vulnerability source type
 */
export type VulnerabilitySource = 'nvd' | 'osv' | 'oss-index' | 'github-advisory' | 'snyk' | 'both'

export interface VulnerabilityReference {
  source: string
  url: string
  tags?: string[]
}

/**
 * Patch Information
 */
/**
 * KEV (Known Exploited Vulnerability) details
 */
export interface KevDetails {
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

export interface PatchInfo {
  fixedVersions: string[]
  patchLinks: PatchLink[]
  remediationAdvice: RemediationAdvice
  affectedVersionRanges: VersionRange[]
  patchAvailability: PatchAvailabilityStatus
}

/**
 * Patch availability status
 */
export type PatchAvailabilityStatus =
  | 'available' // Patch is available
  | 'partial' // Partial fix available
  | 'upstream' // Fix available upstream
  | 'investigating' // Being investigated
  | 'none' // No patch available

/**
 * Patch link reference
 */
export interface PatchLink {
  type: 'commit' | 'pr' | 'advisory' | 'release' | 'vendor'
  url: string
  source: string
  description?: string
}

/**
 * Remediation advice
 */
export interface RemediationAdvice {
  priority: 'immediate' | 'high' | 'medium' | 'low'
  category: 'upgrade' | 'patch' | 'mitigation' | 'monitor'
  steps: RemediationStep[]
  workarounds?: string[]
  estimatedEffort?: 'low' | 'medium' | 'high'
}

/**
 * Individual remediation step
 */
export interface RemediationStep {
  step: number
  action: string
  command?: string
  description: string
}

/**
 * Version range for vulnerability
 */
export interface VersionRange {
  type: 'SEMVER' | 'PEP440' | 'MAVEN' | 'COMPOSER' | 'NUGET' | 'RANGE' | 'CUSTOM'
  introduction: string
  fixIn?: string
}

/**
 * Dependency Graph Types
 */
export interface DependencyEdge {
  id: string
  source: string // Component ID
  target: string // Component ID
  type: 'depends-on' | 'contains'
  depth: number
}

export interface DependencyGraph {
  nodes: ComponentNode[]
  edges: DependencyEdge[]
  metadata: GraphMetadata
}

export interface ComponentNode {
  id: string
  data: Component
  vulnerabilityCount: number
  maxSeverity: 'critical' | 'high' | 'medium' | 'low' | 'none'
  hasFixAvailable: boolean
  depth: number
  isDirect: boolean
}

export interface GraphMetadata {
  totalNodes: number
  totalEdges: number
  maxDepth: number
  generatedAt: Date
}

/**
 * Vulnerability Provider Configuration
 */
export interface VulnerabilityProviderConfig {
  enabled: boolean
  apiKey?: string
  priority: number
  rateLimit: {
    requestsPerHour: number
    requestsPerMinute?: number
  }
}

/**
 * Provider Settings
 */
export interface ProviderSettings {
  nvd: VulnerabilityProviderConfig
  osv: VulnerabilityProviderConfig
  ossIndex?: VulnerabilityProviderConfig
  githubAdvisory?: VulnerabilityProviderConfig
  snyk?: VulnerabilityProviderConfig
}

export interface ProjectStatistics {
  totalVulnerabilities: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  totalComponents: number
  vulnerableComponents: number
  fixableCount?: number
  exploitedCount?: number
  averageCvssScore?: number
}

export interface ScanResult {
  id: string
  projectId: string
  startedAt: Date
  completedAt?: Date
  status: 'pending' | 'running' | 'completed' | 'failed'
  vulnerabilitiesFound: number
  componentsScanned: number
  error?: string
}

// Database Update Schedule Types
export interface DatabaseUpdateSchedule {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly' | 'never'
  time: string // HH:MM format
  dayOfWeek?: number // 0-6 for weekly (Sunday = 0)
  dayOfMonth?: number // 1-31 for monthly
  bandwidthLimitKBps?: number // Bandwidth limit in KB/s (0 = unlimited)
  pauseOnBattery: boolean // Pause updates when on battery power
  wifiOnly: boolean // Only update on WiFi connection
}

/**
 * Database sync schedule configuration
 */
export type SyncSchedule = 'daily' | 'weekly' | 'monthly' | 'manual'

/**
 * Database storage settings
 */
export interface DatabaseStorageSettings {
  /** Maximum database size in MB (0 = unlimited) */
  maxSizeMB: number
  /** Enable pruning of old CVEs */
  pruneOldCves: boolean
  /** Prune CVEs older than this year */
  pruneOlderThanYear: number
  /** Current database size in bytes */
  currentSizeBytes?: number
}

/**
 * Database performance settings
 */
export interface DatabasePerformanceSettings {
  /** Maximum number of search results to return */
  searchResultLimit: number
  /** Enable search result caching */
  enableSearchCache: boolean
  /** Maximum cache size in MB */
  cacheSizeMB: number
  /** Cache TTL in minutes */
  cacheTTLMinutes: number
}

/**
 * Complete database settings
 */
export interface DatabaseSettings {
  /** Sync schedule configuration */
  syncSchedule: SyncSchedule
  /** NVD API key for higher rate limits */
  nvdApiKey?: string
  /** Storage management settings */
  storage: DatabaseStorageSettings
  /** Performance tuning settings */
  performance: DatabasePerformanceSettings
}

// Settings Types
export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  fontSize: 'small' | 'default' | 'large'
  dataRetentionDays: number
  autoRefresh: boolean
  autoRefreshInterval: number // hours
  vulnDataCacheTTL: number // hours
  // New provider settings
  vulnProviders: ProviderSettings
  // CVSS settings
  cvssVersion: '3.0' | '3.1'
  showCvssBreakdown: boolean
  // Graph settings
  maxGraphNodes: number
  showVulnerableOnly: boolean
  // Database update schedule
  databaseUpdateSchedule?: DatabaseUpdateSchedule
}

// API Types
export interface NvdApiCve {
  id: string
  sourceIdentifier: string
  published: string
  lastModified: string
  vulnStatus: string
  descriptions: { lang: string; value: string }[]
  metrics?: {
    cvssMetricV31?: {
      cvssData: {
        version: string
        vectorString: string
        attackVector: string
        attackComplexity: string
        privilegesRequired: string
        userInteraction: string
        scope: string
        confidentialityImpact: string
        integrityImpact: string
        availabilityImpact: string
        baseScore: number
        baseSeverity: string
      }
    }[]
  }
  weaknesses?: { description: [{ lang: string; value: string }] }[]
  references?: { url: string; source: string; tags?: string[] }[]
  cpe?: {
    criteria: string
    matchCriteriaId: string
    vulnerable: boolean
  }[]
}

export interface NvdApiResponse {
  resultsPerPage: number
  startIndex: number
  totalResults: number
  vulnerabilities: NvdApiCve[]
}

export interface OsvVulnerability {
  id: string
  summary?: string
  details: string
  affected: {
    package: {
      name: string
      ecosystem: string
      purl: string
    }
    ranges: {
      type: string
      events: { introduced?: string; fixed?: string }[]
    }[]
    versions?: string[]
    database_specific?: {
      cpe?: string[]
    }
  }[]
  published?: string
  modified: string
  references?: { type: string; url: string }[]
  severity?: { type: string; score: string }[]
  aliases?: string[]
}

// Electron API Types
export interface ElectronAPI {
  ping: () => Promise<string>
  onThemeChange: (callback: (theme: string) => void) => void
  getSystemTheme: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

// ============================================================
// PHASE B, C, D SHARED TYPES
// ============================================================

// Health Dashboard Types (Phase B)
export interface ComponentHealth {
  componentId: string
  score: number // 0-100
  category: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'
  factors: HealthFactors
  trend: 'improving' | 'stable' | 'degrading' | 'unknown'
  lastCalculated: Date
  previousScore?: number // For trend calculation
}

export interface HealthFactors {
  vulnerabilityScore: number // 0-40
  ageScore: number // 0-20
  patchScore: number // 0-20
  versionScore: number // 0-20
}

export interface ProjectHealthSummary {
  averageScore: number
  totalComponents: number
  distribution: {
    excellent: number
    good: number
    fair: number
    poor: number
    critical: number
  }
  trend: 'improving' | 'stable' | 'degrading' | 'unknown'
  lastCalculated: Date
}

// Notification Types (Phase C)
export interface AppNotification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  category: 'critical_vuln' | 'scan_complete' | 'update_available' | 'system'
  title: string
  message: string
  timestamp: Date
  read: boolean
  projectId?: string
  actionUrl?: string
}

export interface NotificationPreferences {
  enabled: boolean
  desktopEnabled: boolean
  categories: {
    critical_vuln: boolean
    scan_complete: boolean
    update_available: boolean
    system: boolean
  }
}

// Settings Profile Types (Phase D)
export interface SettingsProfile {
  id: string
  name: string
  description?: string
  settings: Omit<AppSettings, 'activeProfileId'>
  isDefault: boolean
  createdAt: Date
  lastUsed: Date
}

export interface SettingsExport {
  version: string
  exportedAt: string
  profiles: SettingsProfile[]
}

// Filter Presets (Phase C)
export interface FilterPreset {
  id: string
  name: string
  filters: {
    severity?: Vulnerability['severity'][]
    source?: Vulnerability['source'][]
    cvssRange?: [number, number]
    hasPatch?: boolean
    componentType?: Component['type'][]
  }
}

// ============================================================
// PHASE 3: AUDIT & COMPLIANCE TYPES
// ============================================================

/**
 * Audit Event Types
 */
export type AuditActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'SCAN' | 'EXPORT' | 'SETTINGS_CHANGE' | 'BULK_OPERATION'

/**
 * Entity Types that can be audited
 */
export type AuditEntityType =
  | 'project'
  | 'sbom'
  | 'vulnerability'
  | 'component'
  | 'settings'
  | 'profile'
  | 'notification'

/**
 * Main Audit Event interface
 * Records all state changes for compliance and audit trail
 */
export interface AuditEvent {
  /** Unique event identifier (ULID - time-ordered) */
  id: string
  /** When the event occurred */
  timestamp: Date
  /** Session identifier for grouping related events */
  sessionId: string
  /** Optional user identifier (for future multi-user support) */
  userId?: string
  /** Type of action performed */
  actionType: AuditActionType
  /** Type of entity affected */
  entityType: AuditEntityType
  /** ID of the affected entity */
  entityId: string
  /** Previous state before the action (for UPDATE/DELETE) */
  previousState?: unknown
  /** New state after the action (for CREATE/UPDATE) */
  newState?: unknown
  /** Optional IP address (for future enterprise deployments) */
  ipAddress?: string
  /** Additional metadata for context */
  metadata?: AuditEventMetadata
}

/**
 * Additional metadata for audit events
 */
export interface AuditEventMetadata {
  /** Related entity IDs (e.g., components affected by vulnerability scan) */
  relatedEntityIds?: string[]
  /** Human-readable description */
  description?: string
  /** Whether this was a bulk operation */
  isBulkOperation?: boolean
  /** Number of items affected in bulk operation */
  bulkItemCount?: number
  /** Additional contextual data */
  [key: string]: unknown
}
