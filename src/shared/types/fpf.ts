/**
 * False Positive Filter (FPF) Types
 *
 * Type definitions for the hybrid false positive vulnerability filtering system.
 * ISO 21434 compliant with full audit trail support.
 *
 * @module fpf
 */

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Project tier affects filter strictness
 */
export type ProjectTier = 'prototype' | 'development' | 'production'

/**
 * Attack surface classification (ISO 21434)
 */
export type AttackSurface = 'low' | 'intermediate' | 'high'

/**
 * ASIL classification (automotive safety)
 */
export type ASILLevel = 'None' | 'QM' | 'A' | 'B' | 'C' | 'D'

/**
 * Exposure level for interfaces and services
 */
export type ExposureLevel = 'external' | 'internal' | 'isolated'

/**
 * Project configuration section
 */
export interface ProjectConfig {
  name: string
  version: string
  tier: ProjectTier
  configId?: string
  lastModified?: string
  approvedBy?: string
}

/**
 * Cybersecurity classification (ISO 21434)
 */
export interface CybersecurityConfig {
  attackSurface: AttackSurface
  safetyRelated: boolean
  asilLevel?: ASILLevel
  externalInterfaces?: string[]
  networkSegments?: NetworkSegment[]
}

/**
 * Network segment definition
 */
export interface NetworkSegment {
  name: string
  type: 'internal' | 'external' | 'dmz'
  trusted: boolean
}

/**
 * Interface configuration
 */
export interface InterfaceConfig {
  enabled: boolean
  reason?: string
  confidence: number
  exposure?: ExposureLevel
  // Interface-specific extensions
  modes?: string[]
  wpaVersion?: number
  frequencies?: string[]
  generations?: string[]
  dataOnly?: boolean
  version?: string
  pairingMode?: 'secure' | 'just_works' | 'none'
  profiles?: string[]
  bleEnabled?: boolean
  bleRole?: 'central' | 'peripheral' | 'both'
  variant?: string
  speed?: string
  safetyCritical?: boolean
  ports?: number
  allowedDevices?: string[]
  blockedDevices?: string[]
}

/**
 * Service configuration
 */
export interface ServiceConfig {
  enabled: boolean
  externalAccess: boolean
  usage?: string
  allowedCallers?: string[]
  exposedProtocols?: string[]
  reason?: string
  confidence: number
}

/**
 * Feature configuration
 */
export interface FeatureConfig {
  enabled: boolean | string[]
  disabled?: string[]
  exposure?: ExposureLevel
  reason?: string
  confidence: number
  // Feature-specific extensions
  type?: string
  offlineMaps?: boolean
  onlineMaps?: boolean
  source?: string
  signatureRequired?: boolean
  dataTransmission?: string
  encryptionRequired?: boolean
}

/**
 * Suppression rule for explicit false positive handling
 */
export interface SuppressionRule {
  id: string
  cpePattern: string
  reason: string
  severityLimit: ('critical' | 'high' | 'medium' | 'low')[]
  expires?: string
  approvedBy?: string
  notes?: string
}

/**
 * Miss-filter detection configuration
 */
export interface MissFilterDetectionConfig {
  enabled: boolean
  lowConfidenceThreshold: number
  recentCveDays: number
  flagKnownExploits: boolean
}

/**
 * Audit configuration
 */
export interface AuditConfig {
  logAllDecisions: boolean
  logLlmResponses: boolean
  retentionDays: number
}

/**
 * Filter settings configuration
 */
export interface FilterSettingsConfig {
  autoFilterConfidenceThreshold: number
  neverAutoFilter: ('critical' | 'high' | 'medium' | 'low')[]
  alwaysEscalateToReview: ('critical' | 'high' | 'medium' | 'low')[]
  missFilterDetection: MissFilterDetectionConfig
  audit: AuditConfig
}

/**
 * Complete system configuration for FPF
 */
export interface SystemConfig {
  project: ProjectConfig
  cybersecurity: CybersecurityConfig
  interfaces: Record<string, InterfaceConfig>
  services: Record<string, ServiceConfig>
  features: Record<string, FeatureConfig>
  suppressionRules?: SuppressionRule[]
  filterSettings?: FilterSettingsConfig
  metadata?: {
    formatVersion: string
    compatibleWith?: string
    schema?: string
    changes?: Array<{
      date: string
      author: string
      description: string
    }>
  }
}

// ============================================================================
// FILTER RESULT TYPES
// ============================================================================

/**
 * Filter action taken
 */
export type FilterAction = 'filtered' | 'kept' | 'escalated'

/**
 * Filter tier
 */
export type FilterTier = 1 | 2 | 3

/**
 * Filter type identifier
 */
export type FilterType =
  | 'disabled_interface'
  | 'version_mismatch'
  | 'suppression_rule'
  | 'feature_disabled'
  | 'internal_only'
  | 'attack_path_blocked'
  | 'llm_analysis'

/**
 * Result of filtering a single vulnerability
 */
export interface FilterResult {
  /** Vulnerability ID being filtered */
  vulnerabilityId: string

  /** Component ID affected */
  componentId: string

  /** Action taken */
  action: FilterAction

  /** Which tier made the decision */
  tier: FilterTier

  /** Type of filter that matched */
  filterType: FilterType

  /** Human-readable reason */
  reason: string

  /** Rule ID if matched a rule */
  ruleId?: string

  /** Confidence score (0-100) */
  confidence: number

  /** Attack paths that were blocked */
  attackPathsBlocked?: string[]

  /** Timestamp of decision */
  timestamp: string
}

/**
 * Result of batch filtering
 */
export interface FilterBatchResult {
  /** Total vulnerabilities processed */
  total: number

  /** Number filtered as false positives */
  filtered: number

  /** Number kept (real vulnerabilities) */
  kept: number

  /** Number escalated for review */
  escalated: number

  /** Breakdown by severity */
  bySeverity: {
    critical: { filtered: number; kept: number; escalated: number }
    high: { filtered: number; kept: number; escalated: number }
    medium: { filtered: number; kept: number; escalated: number }
    low: { filtered: number; kept: number; escalated: number }
  }

  /** Individual results */
  results: FilterResult[]

  /** Processing time in ms */
  processingTimeMs: number
}

// ============================================================================
// ATTACK GRAPH TYPES
// ============================================================================

/**
 * Node type in attack graph
 */
export type AttackNodeType = 'entry_point' | 'interface' | 'service' | 'component'

/**
 * Edge type in attack graph
 */
export type AttackEdgeType = 'data_flow' | 'control_flow' | 'blocking'

/**
 * Node in attack graph
 */
export interface AttackGraphNode {
  id: string
  type: AttackNodeType
  name: string
  enabled: boolean
  exposure: ExposureLevel
  config?: Record<string, unknown>
}

/**
 * Edge in attack graph
 */
export interface AttackGraphEdge {
  from: string
  to: string
  type: AttackEdgeType
  protocol?: string
  condition?: string
}

/**
 * Complete attack graph
 */
export interface AttackGraph {
  nodes: AttackGraphNode[]
  edges: AttackGraphEdge[]
}

/**
 * Result of reachability analysis
 */
export interface ReachabilityResult {
  /** Is the target reachable from external */
  reachable: boolean

  /** All paths found */
  paths: string[][]

  /** Shortest path */
  shortestPath: string[] | null

  /** What's blocking the path */
  blockedBy: string[]

  /** Confidence in the result */
  confidence: number
}

// ============================================================================
// AUDIT TYPES (ISO 21434)
// ============================================================================

/**
 * Audit event type
 */
export type AuditEventType = 'filter_decision' | 'config_change' | 'override' | 'review' | 'llm_analysis'

/**
 * Vulnerability reference for audit
 */
export interface VulnerabilityRef {
  cveId: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  cvssScore: number
  component: {
    name: string
    version: string
    cpe: string
  }
}

/**
 * Filter decision for audit
 */
export interface FilterDecision {
  action: FilterAction
  tier: FilterTier
  filterType: FilterType
  reason: string
  ruleId?: string
  confidence: number
  attackPathsBlocked?: string[]
}

/**
 * Filter context for audit
 */
export interface FilterContext {
  projectId: string
  projectName: string
  sbomFileId?: string
  configVersion: string
}

/**
 * User reference for audit
 */
export interface UserRef {
  id: string
  name: string
  role: string
}

/**
 * Filter audit event (ISO 21434 compliant)
 */
export interface FilterAuditEvent {
  /** Unique event ID */
  id: string

  /** ISO 8601 timestamp */
  timestamp: string

  /** Type of event */
  eventType: AuditEventType

  /** Vulnerability details */
  vulnerability: VulnerabilityRef

  /** Decision made */
  decision: FilterDecision

  /** Context information */
  context: FilterContext

  /** User who made/overrode decision */
  user: UserRef

  /** SHA-256 hash of this event */
  hash: string

  /** Hash of previous event (chain) */
  previousHash: string

  /** LLM-specific data if applicable */
  llmData?: {
    model: string
    prompt: string
    response: string
    parsedResult: LLMAnalysisResult
  }
}

// ============================================================================
// LLM TYPES
// ============================================================================

/**
 * LLM configuration
 */
export interface LLMConfig {
  enabled: boolean
  mode: 'manual' | 'auto_uncertain' | 'auto_critical'
  model: {
    name: string
    quantization: string
    contextLength: number
  }
  runtime: {
    engine: 'llama.cpp'
    threads: number
    gpuLayers: number
    memoryMb: number
  }
  behavior: {
    temperature: number
    topP: number
    maxTokens: number
  }
}

/**
 * LLM analysis result
 */
export interface LLMAnalysisResult {
  isExploitable: boolean
  confidence: number
  attackPath: string | null
  blockedBy: string[]
  reasoning: string
  recommendation: 'accept_risk' | 'mitigate' | 'patch' | 'needs_review'
  iso21434Notes: string
}

// ============================================================================
// ISO 21434 REPORT TYPES
// ============================================================================

/**
 * Vulnerability summary for report
 */
export interface VulnerabilitySummary {
  cveId: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  cvssScore: number
  componentName: string
  componentVersion: string
  description: string
  recommendation: string
}

/**
 * Filtered vulnerability summary
 */
export interface FilteredSummary extends VulnerabilitySummary {
  filterReason: string
  filterTier: FilterTier
  confidence: number
  filterDate: string
}

/**
 * ISO 21434 compliance report
 */
export interface ISO21434Report {
  reportId: string
  generatedAt: string
  projectName: string
  projectVersion: string
  reportVersion: string

  summary: {
    totalVulnerabilities: number
    filteredCount: number
    reviewedCount: number
    criticalKept: number
    highKept: number
    riskLevel: 'unacceptable' | 'acceptable' | 'negligible'
  }

  methodology: {
    filterApproach: string
    tiersUsed: number[]
    llmUsed: boolean
    configHash: string
  }

  sections: {
    kept: VulnerabilitySummary[]
    filtered: FilteredSummary[]
    uncertain: VulnerabilitySummary[]
  }

  auditSummary: {
    totalEvents: number
    eventsByTier: Record<number, number>
    configChanges: Array<{
      timestamp: string
      change: string
      user: string
    }>
    userReviews: Array<{
      timestamp: string
      cveId: string
      decision: string
      user: string
    }>
  }

  evidence: {
    sbomHash: string
    nvdDatabaseVersion: string
    configSnapshot: string
  }

  signatures: {
    generated: string
    reviewed?: string
    approved?: string
  }
}

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  valid: boolean
  errors: ConfigValidationError[]
  warnings: ConfigValidationWarning[]
}

/**
 * Configuration validation error
 */
export interface ConfigValidationError {
  path: string
  message: string
  value?: unknown
}

/**
 * Configuration validation warning
 */
export interface ConfigValidationWarning {
  path: string
  message: string
  suggestion?: string
}

// ============================================================================
// UI STATE TYPES
// ============================================================================

/**
 * FPF state for UI store
 */
export interface FPFState {
  /** Current project configuration */
  config: SystemConfig | null

  /** Configuration loading state */
  configLoading: boolean

  /** Configuration validation errors */
  configErrors: string[]

  /** Last filter batch result */
  lastFilterResult: FilterBatchResult | null

  /** Filter loading state */
  filterLoading: boolean

  /** Selected vulnerability for review */
  selectedVulnerability: string | null

  /** Wizard step (for ConfigWizard) */
  wizardStep: number

  /** Audit events for current project */
  auditEvents: FilterAuditEvent[]

  /** LLM availability */
  llmAvailable: boolean

  /** LLM analysis loading */
  llmLoading: boolean
}

/**
 * Default filter settings
 */
export const DEFAULT_FILTER_SETTINGS: FilterSettingsConfig = {
  autoFilterConfidenceThreshold: 75,
  neverAutoFilter: ['critical'],
  alwaysEscalateToReview: ['critical', 'high'],
  missFilterDetection: {
    enabled: true,
    lowConfidenceThreshold: 70,
    recentCveDays: 30,
    flagKnownExploits: true,
  },
  audit: {
    logAllDecisions: true,
    logLlmResponses: true,
    retentionDays: 365,
  },
}

/**
 * Default FPF state
 */
export const DEFAULT_FPF_STATE: FPFState = {
  config: null,
  configLoading: false,
  configErrors: [],
  lastFilterResult: null,
  filterLoading: false,
  selectedVulnerability: null,
  wizardStep: 0,
  auditEvents: [],
  llmAvailable: false,
  llmLoading: false,
}
