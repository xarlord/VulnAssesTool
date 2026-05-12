/**
 * NVD API v2 Client for Bulk Downloads
 *
 * Provides efficient, rate-limited access to the NVD CVE API 2.0
 * for downloading large amounts of CVE data for local database population.
 *
 * Features:
 * - Rate limiting (5 req/30s without key, 50 req/30s with key)
 * - Automatic pagination for large result sets
 * - Progress callbacks for UI integration
 * - Cancellation support
 * - Retry logic with exponential backoff
 * - Date range filtering for year-by-year downloads
 * - Parallel request capability with configurable concurrency
 * - API response caching to avoid re-fetching
 * - Comprehensive error handling
 */

import { RateLimiter, createNvdRateLimiter } from './rateLimiter.js'

// NVD API 2.0 base URL
const NVD_API_V2_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0'

// API configuration
const DEFAULT_RESULTS_PER_PAGE = 2000 // Maximum allowed by NVD API
const MAX_RETRIES = 5
const RETRY_BASE_DELAY_MS = 1000
const DEFAULT_CONCURRENCY = 3
const CACHE_TTL_MS = 3600000 // 1 hour cache TTL

/**
 * NVD API 2.0 CVE structure (simplified for database import)
 */
export interface NvdCveV2 {
  id: string
  sourceIdentifier: string
  published: string
  lastModified: string
  vulnStatus: string
  descriptions: Array<{
    lang: string
    value: string
    source?: string
  }>
  metrics?: {
    cvssMetricV31?: Array<{
      source: string
      type: string
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
      exploitabilityScore?: number
      impactScore?: number
    }>
    cvssMetricV30?: Array<{
      source: string
      type: string
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
      exploitabilityScore?: number
      impactScore?: number
    }>
    cvssMetricV2?: Array<{
      source: string
      type: string
      acInsufInfo?: boolean
      cvssData: {
        version: string
        vectorString: string
        accessVector: string
        accessComplexity: string
        authentication: string
        confidentialityImpact: string
        integrityImpact: string
        availabilityImpact: string
        baseScore: number
      }
      baseSeverity?: string
      exploitabilityScore?: number
      impactScore?: number
      obtainAllPrivilege?: boolean
      obtainUserPrivilege?: boolean
      obtainOtherPrivilege?: boolean
      userInteractionRequired?: boolean
    }>
  }
  weaknesses?: Array<{
    source: string
    type: string
    description: Array<{
      lang: string
      value: string
    }>
  }>
  configurations?: Array<{
    operator: string
    negate?: boolean
    nodes: Array<{
      operator: string
      negate?: boolean
      cpeMatch: Array<{
        vulnerable: boolean
        cpe23Uri: string
        versionStartIncluding?: string
        versionStartExcluding?: string
        versionEndIncluding?: string
        versionEndExcluding?: string
      }>
    }>
  }>
  references?: Array<{
    url: string
    source?: string
    tags?: string[]
  }>
}

/**
 * NVD API 2.0 response structure
 */
export interface NvdApiResponseV2 {
  resultsPerPage: number
  startIndex: number
  totalResults: number
  format: string
  version: string
  timestamp: string
  vulnerabilities: Array<{
    cve: NvdCveV2
  }>
}

/**
 * Progress callback data
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
 * Options for fetching CVEs by year
 */
export interface NvdYearFetchOptions {
  year: number
  apiKey?: string
  onProgress?: (progress: NvdDownloadProgress) => void
  signal?: AbortSignal
  resultsPerPage?: number
  useCache?: boolean
}

/**
 * Options for fetching CVEs by date range
 */
export interface NvdDateRangeFetchOptions {
  startDate: Date
  endDate: Date
  apiKey?: string
  onProgress?: (progress: NvdDownloadProgress) => void
  signal?: AbortSignal
  resultsPerPage?: number
  useCache?: boolean
}

/**
 * Options for fetching CVEs modified since a date
 */
export interface NvdDeltaFetchOptions {
  lastModifiedDate: Date
  apiKey?: string
  onProgress?: (progress: NvdDownloadProgress) => void
  signal?: AbortSignal
  resultsPerPage?: number
  useCache?: boolean
}

/**
 * Fetch result
 */
export interface NvdFetchResult {
  cves: NvdCveV2[]
  totalResults: number
  truncated: boolean
  durationMs: number
  fromCache: boolean
}

/**
 * Bulk download options for multiple years
 */
export interface NvdBulkFetchOptions {
  years: number[]
  apiKey?: string
  concurrency?: number
  onYearProgress?: (year: number, progress: NvdDownloadProgress) => void
  onYearComplete?: (year: number, result: NvdFetchResult) => void
  onYearError?: (year: number, error: Error) => void
  onOverallProgress?: (progress: NvdBulkDownloadProgress) => void
  signal?: AbortSignal
  useCache?: boolean
}

/**
 * Bulk download progress
 */
export interface NvdBulkDownloadProgress {
  totalYears: number
  completedYears: number
  currentYears: number[]
  totalCves: number
  downloadedCves: number
  percentage: number
  elapsedTimeMs: number
  estimatedTimeRemainingMs: number
  failedYears: number[]
  status: 'running' | 'complete' | 'cancelled' | 'error'
}

/**
 * Bulk download result
 */
export interface NvdBulkFetchResult {
  results: Map<number, NvdFetchResult>
  failedYears: Map<number, string>
  totalCves: number
  durationMs: number
  cancelled: boolean
}

/**
 * Cache entry structure
 */
interface CacheEntry<T> {
  data: T
  timestamp: number
  key: string
}

/**
 * API error with additional context
 */
export class NvdApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false,
    public readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'NvdApiError'
  }
}

/**
 * Response cache for avoiding re-fetches
 */
class ResponseCache {
  private cache: Map<string, CacheEntry<NvdApiResponseV2>> = new Map()
  private ttlMs: number

  constructor(ttlMs: number = CACHE_TTL_MS) {
    this.ttlMs = ttlMs
  }

  /**
   * Generate cache key from URL parameters
   */
  generateKey(params: Record<string, string>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&')
    return sortedParams
  }

  /**
   * Get cached response if valid
   */
  get(key: string): NvdApiResponseV2 | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    const age = Date.now() - entry.timestamp
    if (age > this.ttlMs) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * Store response in cache
   */
  set(key: string, data: NvdApiResponseV2): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      key,
    })
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Clear entries older than specified age
   */
  clearOlderThan(ageMs: number): number {
    const cutoff = Date.now() - ageMs
    let cleared = 0

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < cutoff) {
        this.cache.delete(key)
        cleared++
      }
    }

    return cleared
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; oldestEntry: number | null } {
    let oldest: number | null = null

    for (const entry of this.cache.values()) {
      if (oldest === null || entry.timestamp < oldest) {
        oldest = entry.timestamp
      }
    }

    return {
      size: this.cache.size,
      oldestEntry: oldest,
    }
  }
}

/**
 * Concurrent request executor
 */
class ConcurrentExecutor {
  private concurrency: number
  private activeCount: number = 0
  private queue: Array<() => Promise<void>> = []

  constructor(concurrency: number = DEFAULT_CONCURRENCY) {
    this.concurrency = Math.max(1, Math.min(concurrency, 10))
  }

  /**
   * Execute a task with concurrency control
   */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const wrappedTask = async () => {
        this.activeCount++
        try {
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        } finally {
          this.activeCount--
          this.processQueue()
        }
      }

      if (this.activeCount < this.concurrency) {
        wrappedTask()
      } else {
        this.queue.push(wrappedTask)
      }
    })
  }

  /**
   * Process queued tasks
   */
  private processQueue(): void {
    if (this.queue.length > 0 && this.activeCount < this.concurrency) {
      const next = this.queue.shift()
      if (next) {
        next()
      }
    }
  }

  /**
   * Get current concurrency stats
   */
  getStats(): { active: number; queued: number; concurrency: number } {
    return {
      active: this.activeCount,
      queued: this.queue.length,
      concurrency: this.concurrency,
    }
  }

  /**
   * Clear the queue
   */
  clearQueue(): void {
    this.queue = []
  }
}

/**
 * NVD API v2 Client for bulk downloads
 */
export class NvdApiV2Client {
  private rateLimiter: RateLimiter
  private apiKey?: string
  private abortController: AbortController | null = null
  private cache: ResponseCache
  private executor: ConcurrentExecutor

  constructor(apiKey?: string, concurrency: number = DEFAULT_CONCURRENCY) {
    this.apiKey = apiKey
    this.rateLimiter = createNvdRateLimiter(!!apiKey)
    this.cache = new ResponseCache(CACHE_TTL_MS)
    this.executor = new ConcurrentExecutor(concurrency)
  }

  /**
   * Set or update the API key
   */
  setApiKey(apiKey: string | undefined): void {
    this.apiKey = apiKey
    // Recreate rate limiter with new limits
    this.rateLimiter = createNvdRateLimiter(!!apiKey)
  }

  /**
   * Get current API key status
   */
  hasApiKey(): boolean {
    return !!this.apiKey
  }

  /**
   * Set concurrency level for parallel requests
   */
  setConcurrency(concurrency: number): void {
    this.executor = new ConcurrentExecutor(concurrency)
  }

  /**
   * Get rate limit configuration
   */
  getRateLimitConfig(): { requestsPerWindow: number; windowMs: number } {
    return {
      requestsPerWindow: this.apiKey ? 50 : 5,
      windowMs: 30000,
    }
  }

  /**
   * Clear the response cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; oldestEntry: number | null } {
    return this.cache.getStats()
  }

  /**
   * Fetch all CVEs for a specific year
   */
  async fetchYear(options: NvdYearFetchOptions): Promise<NvdFetchResult> {
    const startDate = new Date(options.year, 0, 1) // January 1st
    const endDate = new Date(options.year, 11, 31, 23, 59, 59) // December 31st

    return this.fetchDateRange({
      ...options,
      startDate,
      endDate,
    })
  }

  /**
   * Fetch CVEs within a date range
   */
  async fetchDateRange(options: NvdDateRangeFetchOptions): Promise<NvdFetchResult> {
    const startTime = Date.now()
    const allCves: NvdCveV2[] = []
    let totalResults = 0
    let truncated = false
    let fromCache = false

    // Format dates for NVD API (ISO 8601, UTC)
    // Use UTC dates to avoid timezone issues
    const pubStartDate = this.formatDateForNvd(options.startDate)
    const pubEndDate = this.formatDateForNvd(options.endDate)

    let startIndex = 0
    const resultsPerPage = options.resultsPerPage || DEFAULT_RESULTS_PER_PAGE
    const useCache = options.useCache !== false

    // Create abort controller if not provided
    this.abortController = new AbortController()
    const signal = options.signal || this.abortController.signal

    try {
      let hasMore = true

      while (hasMore) {
        // Check for cancellation
        if (signal.aborted) {
          options.onProgress?.({
            phase: 'cancelled',
            startIndex,
            totalResults,
            resultsPerPage,
            percentage: totalResults > 0 ? (allCves.length / totalResults) * 100 : 0,
            cvesDownloaded: allCves.length,
            elapsedTimeMs: Date.now() - startTime,
            estimatedTimeRemainingMs: 0,
          })
          throw new NvdApiError('Download cancelled', undefined, false)
        }

        // Build cache key
        const cacheParams: Record<string, string> = {
          pubStartDate,
          pubEndDate,
          resultsPerPage: resultsPerPage.toString(),
          startIndex: startIndex.toString(),
        }
        const cacheKey = this.cache.generateKey(cacheParams)

        // Check cache first
        let response: NvdApiResponseV2 | null = null
        if (useCache) {
          response = this.cache.get(cacheKey)
          if (response) {
            fromCache = true
          }
        }

        // Build URL with parameters
        const url = new URL(NVD_API_V2_URL)
        url.searchParams.append('pubStartDate', pubStartDate)
        url.searchParams.append('pubEndDate', pubEndDate)
        url.searchParams.append('resultsPerPage', resultsPerPage.toString())
        url.searchParams.append('startIndex', startIndex.toString())

        // Report progress
        options.onProgress?.({
          phase: 'fetching',
          startIndex,
          totalResults,
          resultsPerPage,
          percentage: totalResults > 0 ? (allCves.length / totalResults) * 100 : 0,
          cvesDownloaded: allCves.length,
          elapsedTimeMs: Date.now() - startTime,
          estimatedTimeRemainingMs: this.estimateRemainingTime(allCves.length, totalResults, Date.now() - startTime),
        })

        // Execute rate-limited request if not cached
        if (!response) {
          response = await this.executeWithRetry(url.toString(), signal)

          // Cache the response
          if (response && useCache) {
            this.cache.set(cacheKey, response)
          }
        }

        if (!response) {
          break
        }

        // Update total results on first page
        if (startIndex === 0) {
          totalResults = response.totalResults
        }

        // Extract CVEs
        const cves = response.vulnerabilities.map((v) => v.cve)
        allCves.push(...cves)

        // Check if there are more pages
        hasMore = startIndex + response.resultsPerPage < totalResults
        startIndex += response.resultsPerPage

        // Mark as truncated if we hit any limits
        if (allCves.length >= 50000) {
          truncated = true
          break
        }
      }

      // Report completion
      options.onProgress?.({
        phase: 'complete',
        startIndex,
        totalResults,
        resultsPerPage,
        percentage: 100,
        cvesDownloaded: allCves.length,
        elapsedTimeMs: Date.now() - startTime,
        estimatedTimeRemainingMs: 0,
      })

      return {
        cves: allCves,
        totalResults,
        truncated,
        durationMs: Date.now() - startTime,
        fromCache,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      options.onProgress?.({
        phase: 'error',
        startIndex,
        totalResults,
        resultsPerPage,
        percentage: totalResults > 0 ? (allCves.length / totalResults) * 100 : 0,
        cvesDownloaded: allCves.length,
        elapsedTimeMs: Date.now() - startTime,
        estimatedTimeRemainingMs: 0,
        error: errorMessage,
      })

      throw error
    }
  }

  /**
   * Fetch CVEs modified since a specific date (for delta sync)
   */
  async fetchModifiedSince(options: NvdDeltaFetchOptions): Promise<NvdFetchResult> {
    const startTime = Date.now()
    const allCves: NvdCveV2[] = []
    let totalResults = 0
    let fromCache = false

    // Format date for NVD API (ISO 8601, UTC)
    const lastModStartDate = this.formatDateForNvd(options.lastModifiedDate)
    const lastModEndDate = this.formatDateForNvd(new Date())

    let startIndex = 0
    const resultsPerPage = options.resultsPerPage || DEFAULT_RESULTS_PER_PAGE
    const useCache = options.useCache !== false

    this.abortController = new AbortController()
    const signal = options.signal || this.abortController.signal

    try {
      let hasMore = true

      while (hasMore) {
        if (signal.aborted) {
          throw new NvdApiError('Download cancelled', undefined, false)
        }

        // Build cache key
        const cacheParams: Record<string, string> = {
          lastModStartDate,
          lastModEndDate,
          resultsPerPage: resultsPerPage.toString(),
          startIndex: startIndex.toString(),
        }
        const cacheKey = this.cache.generateKey(cacheParams)

        // Check cache first
        let response: NvdApiResponseV2 | null = null
        if (useCache) {
          response = this.cache.get(cacheKey)
          if (response) {
            fromCache = true
          }
        }

        // Build URL
        const url = new URL(NVD_API_V2_URL)
        url.searchParams.append('lastModStartDate', lastModStartDate)
        url.searchParams.append('lastModEndDate', lastModEndDate)
        url.searchParams.append('resultsPerPage', resultsPerPage.toString())
        url.searchParams.append('startIndex', startIndex.toString())

        options.onProgress?.({
          phase: 'fetching',
          startIndex,
          totalResults,
          resultsPerPage,
          percentage: totalResults > 0 ? (allCves.length / totalResults) * 100 : 0,
          cvesDownloaded: allCves.length,
          elapsedTimeMs: Date.now() - startTime,
          estimatedTimeRemainingMs: this.estimateRemainingTime(allCves.length, totalResults, Date.now() - startTime),
        })

        if (!response) {
          response = await this.executeWithRetry(url.toString(), signal)

          if (response && useCache) {
            this.cache.set(cacheKey, response)
          }
        }

        if (!response) break

        if (startIndex === 0) {
          totalResults = response.totalResults
        }

        const cves = response.vulnerabilities.map((v) => v.cve)
        allCves.push(...cves)

        hasMore = startIndex + response.resultsPerPage < totalResults
        startIndex += response.resultsPerPage
      }

      options.onProgress?.({
        phase: 'complete',
        startIndex,
        totalResults,
        resultsPerPage,
        percentage: 100,
        cvesDownloaded: allCves.length,
        elapsedTimeMs: Date.now() - startTime,
        estimatedTimeRemainingMs: 0,
      })

      return {
        cves: allCves,
        totalResults,
        truncated: false,
        durationMs: Date.now() - startTime,
        fromCache,
      }
    } catch (error) {
      options.onProgress?.({
        phase: 'error',
        startIndex,
        totalResults,
        resultsPerPage,
        percentage: 0,
        cvesDownloaded: allCves.length,
        elapsedTimeMs: Date.now() - startTime,
        estimatedTimeRemainingMs: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      throw error
    }
  }

  /**
   * Fetch a single CVE by ID
   */
  async fetchCveById(cveId: string, useCache: boolean = true): Promise<NvdCveV2 | null> {
    const url = new URL(NVD_API_V2_URL)
    url.searchParams.append('cveId', cveId.toUpperCase())

    const cacheParams = { cveId: cveId.toUpperCase() }
    const cacheKey = this.cache.generateKey(cacheParams)

    // Check cache first
    if (useCache) {
      const cached = this.cache.get(cacheKey)
      if (cached && cached.vulnerabilities.length > 0) {
        return cached.vulnerabilities[0].cve
      }
    }

    const response = await this.rateLimiter.execute(async () => {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      }

      if (this.apiKey) {
        headers['apiKey'] = this.apiKey
      }

      const res = await fetch(url.toString(), { headers })

      if (!res.ok) {
        if (res.status === 404) return null
        throw new NvdApiError(`NVD API error: ${res.status}`, res.status, res.status >= 500 || res.status === 429)
      }

      return res.json() as Promise<NvdApiResponseV2>
    })

    if (response && response.vulnerabilities.length > 0) {
      // Cache the response
      if (useCache) {
        this.cache.set(cacheKey, response)
      }
      return response.vulnerabilities[0].cve
    }

    return null
  }

  /**
   * Fetch multiple years in parallel with configurable concurrency
   */
  async fetchYearsParallel(options: NvdBulkFetchOptions): Promise<NvdBulkFetchResult> {
    const startTime = Date.now()
    const results = new Map<number, NvdFetchResult>()
    const failedYears = new Map<number, string>()
    let cancelled = false
    let totalCves = 0

    const progress: NvdBulkDownloadProgress = {
      totalYears: options.years.length,
      completedYears: 0,
      currentYears: [],
      totalCves: 0,
      downloadedCves: 0,
      percentage: 0,
      elapsedTimeMs: 0,
      estimatedTimeRemainingMs: 0,
      failedYears: [],
      status: 'running',
    }

    const signal = options.signal

    // Process years with concurrency control
    const tasks = options.years.map((year) =>
      this.executor.execute(async () => {
        if (signal?.aborted) {
          return
        }

        progress.currentYears.push(year)
        options.onOverallProgress?.({ ...progress })

        try {
          const result = await this.fetchYear({
            year,
            apiKey: options.apiKey,
            useCache: options.useCache,
            signal,
            onProgress: (p) => {
              options.onYearProgress?.(year, p)
            },
          })

          results.set(year, result)
          totalCves += result.cves.length
          progress.completedYears++
          progress.downloadedCves = totalCves

          options.onYearComplete?.(year, result)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'

          if (signal?.aborted) {
            cancelled = true
            return
          }

          failedYears.set(year, errorMessage)
          progress.failedYears.push(year)
          options.onYearError?.(year, error instanceof Error ? error : new Error(errorMessage))
        } finally {
          const idx = progress.currentYears.indexOf(year)
          if (idx > -1) {
            progress.currentYears.splice(idx, 1)
          }

          progress.percentage = (progress.completedYears / progress.totalYears) * 100
          progress.elapsedTimeMs = Date.now() - startTime
          progress.estimatedTimeRemainingMs = this.estimateBulkRemainingTime(
            progress.completedYears,
            progress.totalYears,
            progress.elapsedTimeMs,
          )

          options.onOverallProgress?.({ ...progress })
        }
      }),
    )

    // Wait for all tasks to complete
    await Promise.allSettled(tasks)

    // Update final status
    progress.status = cancelled ? 'cancelled' : failedYears.size > 0 ? 'error' : 'complete'
    progress.elapsedTimeMs = Date.now() - startTime
    options.onOverallProgress?.({ ...progress })

    return {
      results,
      failedYears,
      totalCves,
      durationMs: Date.now() - startTime,
      cancelled,
    }
  }

  /**
   * Execute a request with retry logic and exponential backoff
   */
  private async executeWithRetry(
    url: string,
    signal: AbortSignal,
    attempt: number = 0,
  ): Promise<NvdApiResponseV2 | null> {
    try {
      return await this.rateLimiter.execute(async () => {
        const headers: Record<string, string> = {
          Accept: 'application/json',
        }

        if (this.apiKey) {
          headers['apiKey'] = this.apiKey
        }

        const res = await fetch(url, {
          headers,
          signal,
        })

        if (!res.ok) {
          // Handle specific error codes
          if (res.status === 403) {
            const retryAfter = res.headers.get('Retry-After')
            throw new NvdApiError(
              'NVD API rate limit exceeded. Please wait or provide an API key.',
              403,
              true,
              retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
            )
          }
          if (res.status === 404) {
            return null
          }
          if (res.status === 429) {
            const retryAfter = res.headers.get('Retry-After')
            throw new NvdApiError(
              'Too many requests. Please retry later.',
              429,
              true,
              retryAfter ? parseInt(retryAfter, 10) * 1000 : 30000,
            )
          }
          if (res.status >= 500) {
            throw new NvdApiError(`NVD API server error: ${res.status}`, res.status, true)
          }
          throw new NvdApiError(`NVD API error: ${res.status} ${res.statusText}`, res.status, false)
        }

        return res.json() as Promise<NvdApiResponseV2>
      })
    } catch (error) {
      // Check if it's a retryable error
      if (error instanceof NvdApiError && error.retryable && attempt < MAX_RETRIES) {
        const delay = error.retryAfter ? error.retryAfter : RETRY_BASE_DELAY_MS * Math.pow(2, attempt)

        console.warn(
          `NVD API request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}), ` +
            `retrying in ${delay}ms: ${error.message}`,
        )

        await this.delay(delay)
        return this.executeWithRetry(url, signal, attempt + 1)
      }

      throw error
    }
  }

  /**
   * Cancel any ongoing download
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.rateLimiter.reset()
    this.executor.clearQueue()
  }

  /**
   * Get rate limiter status
   */
  getRateLimiterStatus(): {
    queueSize: number
    timeUntilNextRequest: number
  } {
    return {
      queueSize: this.rateLimiter.getQueueSize(),
      timeUntilNextRequest: this.rateLimiter.getTimeUntilNextRequest(),
    }
  }

  /**
   * Get executor status
   */
  getExecutorStats(): { active: number; queued: number; concurrency: number } {
    return this.executor.getStats()
  }

  /**
   * Estimate remaining time based on current progress
   */
  private estimateRemainingTime(completed: number, total: number, elapsedMs: number): number {
    if (completed === 0 || total === 0) return 0

    const rate = completed / elapsedMs // CVEs per ms
    const remaining = total - completed
    return remaining / rate
  }

  /**
   * Estimate remaining time for bulk downloads
   */
  private estimateBulkRemainingTime(completedYears: number, totalYears: number, elapsedMs: number): number {
    if (completedYears === 0 || totalYears === 0) return 0

    const avgTimePerYear = elapsedMs / completedYears
    const remainingYears = totalYears - completedYears
    return remainingYears * avgTimePerYear
  }

  /**
   * Format date for NVD API (ISO 8601 without timezone)
   */
  private formatDateForNvd(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.000`
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * Create a new NVD API v2 client
 */
export function createNvdApiV2Client(apiKey?: string, concurrency?: number): NvdApiV2Client {
  return new NvdApiV2Client(apiKey, concurrency)
}

/**
 * Create a test NVD API v2 client with disabled rate limiting
 * For unit testing only
 */
export function createTestNvdApiV2Client(apiKey?: string): NvdApiV2Client {
  const client = new NvdApiV2Client(apiKey)
  // Replace rate limiter with a pass-through for testing
  ;(client as unknown as Record<string, unknown>).rateLimiter = {
    execute: async <T>(fn: () => Promise<T>): Promise<T> => {
      return await fn()
    },
    getQueueSize: () => 0,
    getTimeUntilNextRequest: () => 0,
    reset: () => {},
  } as RateLimiter
  return client
}

/**
 * Get available years for download (1999 to present for full historical data)
 */
export function getAvailableYearsForDownload(startYear = 1999, endYear?: number): number[] {
  const currentYear = new Date().getFullYear()
  const end = Math.min(endYear || currentYear, 2030) // Allow up to 2030 for future-proofing
  const years: number[] = []

  for (let year = startYear; year <= end; year++) {
    years.push(year)
  }

  return years
}

/**
 * Get recent years for download (last 2 years by default)
 */
export function getRecentYearsForDownload(yearsBack: number = 2): number[] {
  const currentYear = new Date().getFullYear()
  const years: number[] = []

  for (let year = currentYear - yearsBack + 1; year <= currentYear; year++) {
    years.push(year)
  }

  return years
}
