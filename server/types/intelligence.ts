/**
 * IPC Type Definitions for Intelligence Services (KEV & EPSS)
 *
 * Defines the communication protocol between renderer and main process
 * for exploit intelligence operations.
 */

/**
 * KEV catalog entry
 */
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

/**
 * KEV sync result
 */
export interface KevSyncResult {
  success: boolean
  added: number
  removed: number
  unchanged: number
  total: number
  error?: string
  durationMs: number
}

/**
 * KEV catalog statistics
 */
export interface KevCatalogStats {
  total: number
  ransomwareRelated: number
  lastUpdated: string | null
}

/**
 * EPSS score data
 */
export interface EpssScore {
  cveId: string
  score: number // 0.0 to 1.0 (probability)
  percentile: number // 0.0 to 1.0 (rank among all CVEs)
  fetchedAt: Date // Date object
}

/**
 * EPSS statistics
 */
export interface EpssStats {
  cachedCount: number
  avgScore: number
  avgPercentile: number
}

/**
 * Check if CVE is in KEV catalog request
 */
export interface CheckKevRequest {
  cveId: string
}

/**
 * Check if CVE is in KEV catalog response
 */
export interface CheckKevResponse {
  success: boolean
  isKev: boolean
  error?: string
}

/**
 * Get KEV details request
 */
export interface GetKevDetailsRequest {
  cveId: string
}

/**
 * Get KEV details response
 */
export interface GetKevDetailsResponse {
  success: boolean
  entry: KevEntry | null
  error?: string
}

/**
 * Get KEV catalog stats response
 */
export interface GetKevStatsResponse {
  success: boolean
  stats: KevCatalogStats
  error?: string
}

/**
 * Sync KEV catalog response
 */
export interface SyncKevResponse {
  success: boolean
  result: KevSyncResult | null
  error?: string
}

/**
 * Get EPSS score request
 */
export interface GetEpssScoreRequest {
  cveId: string
}

/**
 * Get EPSS score response
 */
export interface GetEpssScoreResponse {
  success: boolean
  score: EpssScore | null
  error?: string
}

/**
 * Get EPSS scores batch request
 */
export interface GetEpssScoresRequest {
  cveIds: string[]
}

/**
 * Get EPSS scores batch response
 */
export interface GetEpssScoresResponse {
  success: boolean
  scores: Record<string, EpssScore>
  error?: string
}

/**
 * Refresh EPSS score request
 */
export interface RefreshEpssScoreRequest {
  cveId: string
}

/**
 * Refresh EPSS score response
 */
export interface RefreshEpssScoreResponse {
  success: boolean
  score: EpssScore | null
  error?: string
}

/**
 * Get EPSS stats response
 */
export interface GetEpssStatsResponse {
  success: boolean
  stats: EpssStats
  error?: string
}

/**
 * IPC Channels for Intelligence operations
 */
export const INTELLIGENCE_IPC_CHANNELS = {
  // KEV operations
  CHECK_KEV: 'intelligence:checkKev',
  GET_KEV_DETAILS: 'intelligence:getKevDetails',
  GET_KEV_STATS: 'intelligence:getKevStats',
  SYNC_KEV: 'intelligence:syncKev',

  // EPSS operations
  GET_EPSS_SCORE: 'intelligence:getEpssScore',
  GET_EPSS_SCORES: 'intelligence:getEpssScores',
  REFRESH_EPSS_SCORE: 'intelligence:refreshEpssScore',
  GET_EPSS_STATS: 'intelligence:getEpssStats',
  CLEANUP_EPSS_CACHE: 'intelligence:cleanupEpssCache',
} as const

/**
 * Intelligence API interface for renderer
 */
export interface IntelligenceAPI {
  // KEV operations
  checkKev(cveId: string): Promise<CheckKevResponse>
  getKevDetails(cveId: string): Promise<GetKevDetailsResponse>
  getKevStats(): Promise<GetKevStatsResponse>
  syncKev(): Promise<SyncKevResponse>

  // EPSS operations
  getEpssScore(cveId: string): Promise<GetEpssScoreResponse>
  getEpssScores(cveIds: string[]): Promise<GetEpssScoresResponse>
  refreshEpssScore(cveId: string): Promise<RefreshEpssScoreResponse>
  getEpssStats(): Promise<GetEpssStatsResponse>
  cleanupEpssCache(): Promise<{ success: boolean; cleanedCount: number; error?: string }>
}
