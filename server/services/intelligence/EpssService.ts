/**
 * EpssService - Exploit Prediction Scoring System Service
 *
 * Provides EPSS scores for vulnerability prioritization.
 * EPSS scores are fetched on-demand from api.first.org and cached for 24 hours.
 *
 * @module EpssService
 */

import type { Database } from 'sql.js'

/**
 * EPSS score data
 */
export interface EpssScore {
  cveId: string
  score: number // 0.0 to 1.0 (probability)
  percentile: number // 0.0 to 1.0 (rank among all CVEs)
  fetchedAt: Date
}

/**
 * EPSS API response format
 */
interface EpssApiResponse {
  status: string
  error?: string
  data: Array<{
    cve: string
    epss: string
    percentile: string
    date: string
  }>
}

/**
 * EPSS service configuration
 */
export interface EpssServiceConfig {
  /** EPSS API base URL */
  apiUrl: string
  /** Cache TTL in hours (default: 24) */
  cacheTtlHours: number
  /** Maximum batch size for API requests (default: 100) */
  maxBatchSize: number
  /** Request timeout in ms (default: 10000) */
  requestTimeoutMs: number
  /** Rate limit: requests per second (default: 10) */
  requestsPerSecond: number
}

const DEFAULT_CONFIG: EpssServiceConfig = {
  apiUrl: 'https://api.first.org/data/v1/epss',
  cacheTtlHours: 24,
  maxBatchSize: 100,
  requestTimeoutMs: 10000,
  requestsPerSecond: 10,
}

/**
 * EpssService class
 *
 * Fetches and caches EPSS scores for CVEs.
 * Uses on-demand fetching with 24-hour cache TTL.
 */
export class EpssService {
  private db: Database
  private config: EpssServiceConfig
  private requestQueue: Array<() => Promise<void>> = []
  private isProcessingQueue = false
  private lastRequestTime = 0

  constructor(db: Database, config: Partial<EpssServiceConfig> = {}) {
    this.db = db
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Get EPSS score for a single CVE
   * Returns cached score if available and not expired, otherwise fetches from API
   */
  async getEpssScore(cveId: string): Promise<EpssScore | null> {
    // Check cache first
    const cached = this.getCachedScore(cveId)
    if (cached) {
      return cached
    }

    // Fetch from API
    try {
      const scores = await this.fetchFromApi([cveId])
      return scores.get(cveId) || null
    } catch (error) {
      console.error(`[EpssService] Failed to fetch EPSS for ${cveId}:`, error)
      return null
    }
  }

  /**
   * Get EPSS scores for multiple CVEs (batch operation)
   * Efficiently batches API requests and uses cache
   */
  async getEpssScores(cveIds: string[]): Promise<Map<string, EpssScore>> {
    const results = new Map<string, EpssScore>()
    const toFetch: string[] = []

    // Check cache for all CVEs
    for (const cveId of cveIds) {
      const cached = this.getCachedScore(cveId)
      if (cached) {
        results.set(cveId, cached)
      } else {
        toFetch.push(cveId)
      }
    }

    if (toFetch.length === 0) {
      return results
    }

    console.log(`[EpssService] Fetching EPSS scores for ${toFetch.length} CVEs...`)

    // Batch fetch from API
    try {
      const fetched = await this.batchFetch(toFetch)
      for (const [cveId, score] of fetched) {
        results.set(cveId, score)
      }
    } catch (error) {
      console.error('[EpssService] Batch fetch failed:', error)
    }

    return results
  }

  /**
   * Force refresh EPSS score (bypass cache)
   */
  async refreshEpssScore(cveId: string): Promise<EpssScore | null> {
    // Clear cached entry
    this.db.run('UPDATE cves SET epss_score = NULL, epss_percentile = NULL, epss_updated_at = NULL WHERE id = ?', [
      cveId,
    ])

    // Fetch fresh
    return this.getEpssScore(cveId)
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupCache(): Promise<number> {
    const cutoffDate = new Date()
    cutoffDate.setHours(cutoffDate.getHours() - this.config.cacheTtlHours)
    const cutoffIso = cutoffDate.toISOString()

    const result = this.db.exec(
      `
      SELECT COUNT(*) FROM cves
      WHERE epss_updated_at IS NOT NULL AND epss_updated_at < ?
    `,
      [cutoffIso],
    )

    const expiredCount = result.length > 0 ? (result[0].values[0][0] as number) : 0

    if (expiredCount > 0) {
      this.db.run(
        `
        UPDATE cves
        SET epss_score = NULL, epss_percentile = NULL, epss_updated_at = NULL
        WHERE epss_updated_at IS NOT NULL AND epss_updated_at < ?
      `,
        [cutoffIso],
      )

      console.log(`[EpssService] Cleaned up ${expiredCount} expired cache entries`)
    }

    return expiredCount
  }

  /**
   * Get cached score if available and not expired
   */
  private getCachedScore(cveId: string): EpssScore | null {
    const result = this.db.exec(
      `
      SELECT epss_score, epss_percentile, epss_updated_at
      FROM cves
      WHERE id = ?
    `,
      [cveId],
    )

    if (result.length === 0 || result[0].values.length === 0) {
      return null
    }

    const row = result[0].values[0]
    const score = row[0] as number | null
    const percentile = row[1] as number | null
    const updatedAt = row[2] as string | null

    // Check if cached data exists
    if (score === null || percentile === null || !updatedAt) {
      return null
    }

    // Check cache TTL
    const cachedTime = new Date(updatedAt)
    const ttlMs = this.config.cacheTtlHours * 60 * 60 * 1000
    const isExpired = Date.now() - cachedTime.getTime() > ttlMs

    if (isExpired) {
      return null
    }

    return {
      cveId,
      score,
      percentile,
      fetchedAt: cachedTime,
    }
  }

  /**
   * Store score in cache
   */
  private cacheScore(score: EpssScore): void {
    this.db.run(
      `
      UPDATE cves
      SET epss_score = ?, epss_percentile = ?, epss_updated_at = ?
      WHERE id = ?
    `,
      [score.score, score.percentile, score.fetchedAt.toISOString(), score.cveId],
    )
  }

  /**
   * Fetch scores from EPSS API
   */
  private async fetchFromApi(cveIds: string[]): Promise<Map<string, EpssScore>> {
    const results = new Map<string, EpssScore>()

    if (cveIds.length === 0) {
      return results
    }

    // Rate limiting
    await this.waitForRateLimit()

    // Build query URL
    const cveList = cveIds.join(',')
    const url = `${this.config.apiUrl}?cve=${encodeURIComponent(cveList)}`

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.requestTimeoutMs)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      })

      clearTimeout(timeoutId)
      this.lastRequestTime = Date.now()

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = (await response.json()) as EpssApiResponse

      if (data.status !== 'OK') {
        throw new Error(data.error || 'EPSS API returned error status')
      }

      // Parse and cache results
      const now = new Date()
      for (const item of data.data) {
        const score: EpssScore = {
          cveId: item.cve,
          score: parseFloat(item.epss),
          percentile: parseFloat(item.percentile),
          fetchedAt: now,
        }

        // Validate score
        if (!isNaN(score.score) && !isNaN(score.percentile)) {
          results.set(item.cve, score)
          this.cacheScore(score)
        }
      }

      console.log(`[EpssService] Fetched ${results.size} EPSS scores from API`)
    } catch (error) {
      console.error('[EpssService] API request failed:', error)
      throw error
    }

    return results
  }

  /**
   * Batch fetch with automatic batching and rate limiting
   */
  private async batchFetch(cveIds: string[]): Promise<Map<string, EpssScore>> {
    const results = new Map<string, EpssScore>()
    const batches: string[][] = []

    // Split into batches
    for (let i = 0; i < cveIds.length; i += this.config.maxBatchSize) {
      batches.push(cveIds.slice(i, i + this.config.maxBatchSize))
    }

    // Process batches sequentially (to respect rate limits)
    for (const batch of batches) {
      try {
        const batchResults = await this.fetchFromApi(batch)
        for (const [cveId, score] of batchResults) {
          results.set(cveId, score)
        }
      } catch (error) {
        console.error(`[EpssService] Batch fetch failed for ${batch.length} CVEs:`, error)
        // Continue with other batches
      }
    }

    return results
  }

  /**
   * Wait for rate limit compliance
   */
  private async waitForRateLimit(): Promise<void> {
    const minIntervalMs = 1000 / this.config.requestsPerSecond
    const elapsed = Date.now() - this.lastRequestTime

    if (elapsed < minIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed))
    }
  }

  /**
   * Get EPSS statistics
   */
  getStats(): { cachedCount: number; avgScore: number; avgPercentile: number } {
    const result = this.db.exec(`
      SELECT
        COUNT(*) as count,
        AVG(epss_score) as avg_score,
        AVG(epss_percentile) as avg_percentile
      FROM cves
      WHERE epss_score IS NOT NULL
    `)

    if (result.length === 0 || result[0].values.length === 0) {
      return { cachedCount: 0, avgScore: 0, avgPercentile: 0 }
    }

    const row = result[0].values[0]
    return {
      cachedCount: row[0] as number,
      avgScore: (row[1] as number) || 0,
      avgPercentile: (row[2] as number) || 0,
    }
  }
}

// Singleton instance
let epssServiceInstance: EpssService | null = null

/**
 * Get or create EpssService singleton
 */
export function getEpssService(db?: Database): EpssService {
  if (!epssServiceInstance && db) {
    epssServiceInstance = new EpssService(db)
  }
  if (!epssServiceInstance) {
    throw new Error('EpssService not initialized. Call getEpssService(db) first.')
  }
  return epssServiceInstance
}

/**
 * Reset EpssService singleton (for testing)
 */
export function resetEpssService(): void {
  epssServiceInstance = null
}
