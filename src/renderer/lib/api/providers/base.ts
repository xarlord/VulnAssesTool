import type { Vulnerability, Component, VulnerabilitySource } from '@@/types'

/**
 * Query options for vulnerability searches
 */
export interface VulnerabilityQueryOptions {
  apiKey?: string
  timeout?: number
  maxResults?: number
}

/**
 * PURL-based query options
 */
export interface PurlQueryOptions extends VulnerabilityQueryOptions {
  purl: string
}

/**
 * CPE-based query options
 */
export interface CpeQueryOptions extends VulnerabilityQueryOptions {
  cpe: string
}

/**
 * Batch query options
 */
export interface BatchQueryOptions extends VulnerabilityQueryOptions {
  components: Component[]
  parallel?: boolean
}

/**
 * Query result with metadata
 */
export interface VulnerabilityQueryResult {
  vulnerabilities: Vulnerability[]
  source: VulnerabilitySource
  queryTime: number
  rateLimitRemaining?: number
  hasMore?: boolean
}

/**
 * Provider health status
 */
export interface ProviderHealthStatus {
  isHealthy: boolean
  responseTime?: number
  error?: string
  lastChecked: Date
}

/**
 * Provider capabilities
 */
export interface ProviderCapabilities {
  purlSupport: boolean
  cpeSupport: boolean
  batchQueries: boolean
  patchInfo: boolean
  cvssVector: boolean
  cweData: boolean
  exploitStatus: boolean
  aliases: boolean
}

/**
 * Base interface for all vulnerability providers
 */
export interface VulnerabilityProvider {
  /**
   * Unique provider identifier
   */
  readonly id: VulnerabilitySource

  /**
   * Human-readable provider name
   */
  readonly name: string

  /**
   * Provider API base URL
   */
  readonly baseUrl: string

  /**
   * Provider capabilities
   */
  readonly capabilities: ProviderCapabilities

  /**
   * Default rate limits (requests per hour)
   */
  readonly defaultRateLimit: number

  /**
   * Check if provider is healthy and accessible
   */
  checkHealth(apiKey?: string): Promise<ProviderHealthStatus>

  /**
   * Query vulnerabilities by PURL (Package URL)
   */
  queryByPurl(options: PurlQueryOptions): Promise<VulnerabilityQueryResult>

  /**
   * Query vulnerabilities by CPE (Common Platform Enumeration)
   */
  queryByCpe(options: CpeQueryOptions): Promise<VulnerabilityQueryResult>

  /**
   * Batch query for multiple components
   */
  batchQuery(options: BatchQueryOptions): Promise<Map<string, Vulnerability[]>>

  /**
   * Get a specific vulnerability by ID
   */
  getVulnerabilityById(id: string, apiKey?: string): Promise<Vulnerability | null>

  /**
   * Validate API key format (if applicable)
   */
  validateApiKey?(apiKey: string): boolean
}

/**
 * Base provider implementation with common functionality
 */
export abstract class BaseVulnerabilityProvider implements VulnerabilityProvider {
  abstract readonly id: VulnerabilitySource
  abstract readonly name: string
  abstract readonly baseUrl: string
  abstract readonly capabilities: ProviderCapabilities
  abstract readonly defaultRateLimit: number

  /**
   * Rate limiter token bucket
   */
  protected rateLimitTokens: number
  protected lastRateLimitRefill: number
  protected readonly rateLimitInterval: number = 3600000 // 1 hour in ms

  constructor() {
    this.rateLimitTokens = this.defaultRateLimit
    this.lastRateLimitRefill = Date.now()
  }

  /**
   * Refill rate limit tokens based on time elapsed
   */
  protected refillRateLimitTokens(): void {
    const now = Date.now()
    const elapsed = now - this.lastRateLimitRefill

    if (elapsed >= this.rateLimitInterval) {
      // Full refill
      this.rateLimitTokens = this.defaultRateLimit
      this.lastRateLimitRefill = now
    } else {
      // Partial refill based on elapsed time
      const refillAmount = Math.floor((elapsed / this.rateLimitInterval) * this.defaultRateLimit)
      this.rateLimitTokens = Math.min(this.defaultRateLimit, this.rateLimitTokens + refillAmount)
    }
  }

  /**
   * Check and consume rate limit token
   * Returns true if request can proceed, false if rate limited
   */
  protected async checkRateLimit(): Promise<boolean> {
    this.refillRateLimitTokens()

    if (this.rateLimitTokens > 0) {
      this.rateLimitTokens--
      return true
    }

    return false
  }

  /**
   * Execute API call with rate limiting and retry logic
   */
  protected async executeApiCall<T>(apiCall: () => Promise<T>, maxRetries = 3, retryDelay = 1000): Promise<T> {
    // Check rate limit
    const canProceed = await this.checkRateLimit()
    if (!canProceed) {
      throw new Error(`Rate limit exceeded for ${this.name}. Please wait before making more requests.`)
    }

    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry on certain errors
        if (
          lastError.message.includes('404') ||
          lastError.message.includes('401') ||
          lastError.message.includes('403')
        ) {
          throw lastError
        }

        // Wait before retry
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay * Math.pow(2, attempt)))
        }
      }
    }

    throw lastError || new Error('API call failed')
  }

  // Abstract methods to be implemented by concrete providers
  abstract checkHealth(apiKey?: string): Promise<ProviderHealthStatus>
  abstract queryByPurl(options: PurlQueryOptions): Promise<VulnerabilityQueryResult>
  abstract queryByCpe(options: CpeQueryOptions): Promise<VulnerabilityQueryResult>
  abstract batchQuery(options: BatchQueryOptions): Promise<Map<string, Vulnerability[]>>
  abstract getVulnerabilityById(id: string, apiKey?: string): Promise<Vulnerability | null>
}
