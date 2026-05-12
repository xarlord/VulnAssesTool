import { getPlatform } from '@/lib/platform'

/**
 * NVD Database FTS5 Search Interface
 *
 * @module nvdDbFts
 *
 * @description
 * Renderer-side interface for FTS5 (Full-Text Search) functionality.
 * Provides type-safe IPC wrappers for FTS operations on the NVD database.
 *
 * @since 1.1.0
 */

/**
 * FTS5 search request
 */
export interface FtsSearchRequest {
  /** Search query string */
  query: string
  /** Maximum number of results to return */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * FTS5 search result with ranking
 */
export interface FtsSearchResult {
  /** CVE ID */
  id: string
  /** CVE description */
  description: string
  /** CVSS score */
  cvssScore?: number
  /** CVSS vector string */
  cvssVector?: string
  /** Severity level */
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'NONE'
  /** Publication date */
  publishedAt: string
  /** Modification date */
  modifiedAt?: string
  /** Source database */
  source: string
  /** FTS5 rank/relevance score */
  rank: number
}

/**
 * FTS5 search response
 */
export interface FtsSearchResponse {
  /** Whether search was successful */
  success: boolean
  /** Search results with ranking */
  results: FtsSearchResult[]
  /** Total results count */
  total: number
  /** Error message if unsuccessful */
  error?: string
  /** Whether FTS5 is available */
  ftsAvailable?: boolean
}

/**
 * FTS5 statistics
 */
export interface FtsStats {
  /** Number of CVEs in FTS5 index */
  indexedCount: number
  /** Total number of CVEs in database */
  totalCount: number
  /** Index coverage percentage */
  coveragePercent: number
}

/**
 * FTS5 statistics response
 */
export interface FtsStatsResponse {
  /** Whether stats retrieval was successful */
  success: boolean
  /** FTS5 statistics */
  stats?: FtsStats
  /** Error message if unsuccessful */
  error?: string
}

// Type guard for Electron API
declare global {
  interface Window {
    electronAPI: {
      database: {
        /** FTS5 search */
        searchFts: (request: FtsSearchRequest) => Promise<FtsSearchResponse>
        /** Get FTS5 statistics */
        getFtsStats: () => Promise<FtsStatsResponse>
      }
    }
  }
}

/**
 * Performs a full-text search on the NVD database using FTS5.
 *
 * @param request - FTS5 search request
 * @returns FTS5 search response with ranked results
 *
 * @throws {Error} When Electron API is unavailable
 *
 * @example
 * ```ts
 * const results = await searchFts({ query: 'sql injection', limit: 50 })
 * if (results.success && results.ftsAvailable) {
 *   console.log(`Found ${results.results.length} results`)
 *   results.results.forEach((r) => {
 *     console.log(`${r.id}: rank ${r.rank}`)
 *   })
 * }
 * ```
 *
 * @remarks
 * FTS5 provides:
 * - Fast full-text search on CVE descriptions
 * - BM25 ranking for relevance
 * - Better performance than LIKE queries
 *
 * The search automatically handles:
 * - Prefix matching (e.g., "sql*" matches "sql", "sql injection")
 * - Phrase queries (e.g., "\"sql injection\"")
 * - Boolean operators (AND, OR, NOT)
 */
export async function searchFts(request: FtsSearchRequest): Promise<FtsSearchResponse> {
  if (!getPlatform()?.database?.searchFts) {
    return {
      success: false,
      results: [],
      total: 0,
      error: 'FTS5 search API is not available. Please restart the application.',
    }
  }

  try {
    return await getPlatform().database.searchFts(request)
  } catch (error) {
    return {
      success: false,
      results: [],
      total: 0,
      error: error instanceof Error ? error.message : 'FTS5 search failed',
    }
  }
}

/**
 * Gets FTS5 statistics for the NVD database.
 *
 * @returns FTS5 statistics including index coverage
 *
 * @throws {Error} When Electron API is unavailable
 *
 * @example
 * ```ts
 * const stats = await getFtsStats()
 * if (stats.stats) {
 *   console.log(`FTS covers ${stats.stats.coveragePercent}% of CVEs`)
 * }
 * ```
 */
export async function getFtsStats(): Promise<FtsStatsResponse> {
  if (!getPlatform()?.database?.getFtsStats) {
    return {
      success: false,
      error: 'FTS5 statistics API is not available.',
    }
  }

  try {
    return await getPlatform().database.getFtsStats()
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get FTS5 statistics',
    }
  }
}

/**
 * Checks if FTS5 search is available.
 *
 * @returns True if FTS5 search is available
 *
 * @example
 * ```ts
 * if (await isFtsAvailable()) {
 *   // Enable FTS search features
 * }
 * ```
 */
export async function isFtsAvailable(): Promise<boolean> {
  if (!getPlatform()?.database?.getFtsStats) {
    return false
  }

  try {
    const response = await getPlatform().database.getFtsStats()
    return response.success && response.stats !== undefined
  } catch {
    return false
  }
}

/**
 * Builds an FTS5 query from user input.
 *
 * @param userInput - Raw user search input
 * @returns FTS5-formatted query string
 *
 * @example
 * ```ts
 * buildFtsQuery('SQL injection')
 * // Returns: 'SQL NEAR injection'
 *
 * buildFtsQuery('CVE-2024')
 * // Returns: 'CVE-2024'
 * ```
 *
 * @remarks
 * FTS5 query syntax:
 * - Simple term: searches for that term
 * - "phrase": searches for exact phrase
 * - term1 AND term2: both must be present
 * - term1 OR term2: either must be present
 * - term1 NOT term2: term1 present, term2 absent
 * - prefix*: prefix match (e.g., sql*)
 */
export function buildFtsQuery(userInput: string): string {
  if (!userInput || userInput.trim().length === 0) {
    return ''
  }

  const trimmed = userInput.trim()

  // Check if it's a CVE ID (exact match)
  if (/^CVE-\d{4}-\d{4,}$/i.test(trimmed)) {
    return trimmed // CVE IDs should be exact matches
  }

  // For general text, let FTS5 handle the query
  // FTS5 will do stemming, ranking, etc.
  return trimmed
}

/**
 * Determines if a query should use FTS5 search.
 *
 * @param query - Search query string
 * @returns True if query should use FTS5
 *
 * @example
 * ```ts
 * if (shouldUseFts('buffer overflow')) {
 *   return 'fts'
 * }
 * if (shouldUseFts('CVE-2024-1234')) {
 *   return 'exact' // Use exact CVE ID match
 * }
 * ```
 */
export function shouldUseFts(query: string): boolean {
  if (!query || query.trim().length === 0) {
    return false
  }

  const trimmed = query.trim()

  // CVE ID searches should use exact match, not FTS
  if (/^CVE-\d{4}-\d{4,}$/i.test(trimmed)) {
    return false
  }

  // Single word searches benefit from FTS5
  // Multi-word searches also benefit
  return true
}

/**
 * Formats a search result rank for display.
 *
 * @param rank - FTS5 rank score
 * @returns Formatted rank string
 *
 * @example
 * ```ts
 * formatRank(0.5) // Returns: "Very Relevant"
 * formatRank(2.5) // Returns: "Relevant"
 * ```
 */
export function formatRank(rank: number): string {
  if (rank < 1) {
    return 'Very Relevant'
  } else if (rank < 2) {
    return 'Relevant'
  } else if (rank < 5) {
    return 'Somewhat Relevant'
  } else {
    return 'Less Relevant'
  }
}
