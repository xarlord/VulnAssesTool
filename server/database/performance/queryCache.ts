/**
 * Query Cache Layer for CVE Database
 *
 * Provides LRU caching for frequent search patterns to improve
 * performance when searching 250K+ CVEs.
 *
 * Features:
 * - LRU eviction policy with configurable size limit
 * - TTL-based cache invalidation
 * - Cache invalidation on database updates
 * - Memory-efficient storage
 * - Cache statistics for monitoring
 */

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T
  createdAt: number
  expiresAt: number
  accessCount: number
  lastAccessedAt: number
  key: string
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number
  maxSize: number
  hits: number
  misses: number
  hitRate: number
  evictions: number
  memoryUsageBytes: number
  oldestEntryAge: number
  avgAccessCount: number
}

/**
 * Cache configuration options
 */
export interface QueryCacheOptions {
  /** Maximum number of entries in the cache */
  maxSize: number
  /** Time-to-live in milliseconds (default: 5 minutes) */
  ttlMs: number
  /** Whether to enable statistics tracking */
  enableStats: boolean
  /** Maximum memory usage in bytes (approximate) */
  maxMemoryBytes?: number
}

/**
 * Default cache configuration
 */
const DEFAULT_OPTIONS: QueryCacheOptions = {
  maxSize: 1000,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  enableStats: true,
  maxMemoryBytes: 50 * 1024 * 1024, // 50 MB
}

/**
 * LRU Query Cache for CVE database searches
 */
export class QueryCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private options: QueryCacheOptions
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  }
  private accessOrder: string[] = []

  constructor(options: Partial<QueryCacheOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * Generate a cache key from query parameters
   */
  static generateKey(prefix: string, params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map((key) => `${key}=${JSON.stringify(params[key])}`)
      .join('&')
    return `${prefix}:${sortedParams}`
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      if (this.options.enableStats) {
        this.stats.misses++
      }
      return null
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.removeFromAccessOrder(key)
      if (this.options.enableStats) {
        this.stats.misses++
      }
      return null
    }

    // Update access statistics
    entry.accessCount++
    entry.lastAccessedAt = Date.now()

    // Move to end of access order (most recently used)
    this.removeFromAccessOrder(key)
    this.accessOrder.push(key)

    if (this.options.enableStats) {
      this.stats.hits++
    }

    return entry.value
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T, customTtlMs?: number): void {
    const ttlMs = customTtlMs ?? this.options.ttlMs
    const now = Date.now()

    // Check if we need to evict entries
    while (this.shouldEvict()) {
      this.evictLRU()
    }

    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.removeFromAccessOrder(key)
    }

    // Create new entry
    const entry: CacheEntry<T> = {
      value,
      createdAt: now,
      expiresAt: now + ttlMs,
      accessCount: 0,
      lastAccessedAt: now,
      key,
    }

    this.cache.set(key, entry)
    this.accessOrder.push(key)
  }

  /**
   * Check if we should evict entries
   */
  private shouldEvict(): boolean {
    if (this.cache.size >= this.options.maxSize) {
      return true
    }

    // Check memory usage if limit is set
    if (this.options.maxMemoryBytes) {
      const currentMemory = this.estimateMemoryUsage()
      if (currentMemory >= this.options.maxMemoryBytes) {
        return true
      }
    }

    return false
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return

    // Find first non-expired entry to evict
    let evicted = false
    while (!evicted && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift()
      if (lruKey && this.cache.has(lruKey)) {
        this.cache.delete(lruKey)
        if (this.options.enableStats) {
          this.stats.evictions++
        }
        evicted = true
      }
    }
  }

  /**
   * Remove a key from the access order tracking
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index !== -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  /**
   * Estimate memory usage of the cache
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0

    for (const entry of this.cache.values()) {
      // Rough estimate: key length + value JSON size + metadata overhead
      totalSize += entry.key.length * 2 // UTF-16 characters
      totalSize += JSON.stringify(entry.value).length * 2
      totalSize += 100 // Metadata overhead per entry
    }

    return totalSize
  }

  /**
   * Delete a specific key from the cache
   */
  delete(key: string): boolean {
    const existed = this.cache.delete(key)
    if (existed) {
      this.removeFromAccessOrder(key)
    }
    return existed
  }

  /**
   * Invalidate cache entries matching a pattern
   */
  invalidatePattern(pattern: string): number {
    let count = 0
    const regex = new RegExp(pattern)

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
        this.removeFromAccessOrder(key)
        count++
      }
    }

    return count
  }

  /**
   * Invalidate all cache entries with a given prefix
   */
  invalidatePrefix(prefix: string): number {
    let count = 0

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
        this.removeFromAccessOrder(key)
        count++
      }
    }

    return count
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.accessOrder = []
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now()
    let count = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        this.removeFromAccessOrder(key)
        count++
      }
    }

    return count
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values())
    const now = Date.now()

    let oldestAge = 0
    let totalAccessCount = 0

    for (const entry of entries) {
      const age = now - entry.createdAt
      if (age > oldestAge) {
        oldestAge = age
      }
      totalAccessCount += entry.accessCount
    }

    const totalRequests = this.stats.hits + this.stats.misses

    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      evictions: this.stats.evictions,
      memoryUsageBytes: this.estimateMemoryUsage(),
      oldestEntryAge: oldestAge,
      avgAccessCount: entries.length > 0 ? totalAccessCount / entries.length : 0,
    }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    }
  }

  /**
   * Check if a key exists in the cache (without updating access stats)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    // Check expiration
    return Date.now() <= entry.expiresAt
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Get remaining TTL for a key in milliseconds
   */
  getRemainingTTL(key: string): number {
    const entry = this.cache.get(key)
    if (!entry) return 0

    const remaining = entry.expiresAt - Date.now()
    return Math.max(0, remaining)
  }

  /**
   * Update the TTL for an existing entry
   */
  updateTTL(key: string, ttlMs: number): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    entry.expiresAt = Date.now() + ttlMs
    return true
  }
}

/**
 * Specialized cache for CVE search results
 */
export class CVESearchCache {
  private cache: QueryCache<CVECacheResult>

  constructor(options: Partial<QueryCacheOptions> = {}) {
    this.cache = new QueryCache<CVECacheResult>({
      maxSize: 500, // Cache up to 500 different search queries
      ttlMs: 5 * 60 * 1000, // 5 minutes
      ...options,
    })
  }

  /**
   * Get cached text search results
   */
  getTextSearch(query: string, limit: number, offset: number): CVECacheResult | null {
    const key = QueryCache.generateKey('text', { query, limit, offset })
    return this.cache.get(key)
  }

  /**
   * Cache text search results
   */
  setTextSearch(query: string, limit: number, offset: number, result: CVECacheResult): void {
    const key = QueryCache.generateKey('text', { query, limit, offset })
    this.cache.set(key, result)
  }

  /**
   * Get cached CPE search results
   */
  getCPESearch(vendor: string, product: string | undefined, options: Record<string, unknown>): CVECacheResult | null {
    const key = QueryCache.generateKey('cpe', { vendor, product, ...options })
    return this.cache.get(key)
  }

  /**
   * Cache CPE search results
   */
  setCPESearch(
    vendor: string,
    product: string | undefined,
    options: Record<string, unknown>,
    result: CVECacheResult,
  ): void {
    const key = QueryCache.generateKey('cpe', { vendor, product, ...options })
    this.cache.set(key, result)
  }

  /**
   * Get cached severity/date search results
   */
  getSeveritySearch(options: Record<string, unknown>): CVECacheResult | null {
    const key = QueryCache.generateKey('severity', options)
    return this.cache.get(key)
  }

  /**
   * Cache severity/date search results
   */
  setSeveritySearch(options: Record<string, unknown>, result: CVECacheResult): void {
    const key = QueryCache.generateKey('severity', options)
    this.cache.set(key, result)
  }

  /**
   * Invalidate all search caches (call on database update)
   */
  invalidateAll(): void {
    this.cache.clear()
  }

  /**
   * Invalidate CPE-related caches (call on CPE data update)
   */
  invalidateCPE(): number {
    return this.cache.invalidatePrefix('cpe:')
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return this.cache.getStats()
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    return this.cache.cleanup()
  }
}

/**
 * Cached CVE search result
 */
export interface CVECacheResult {
  /** Array of CVE IDs (fetch details separately) */
  cveIds: string[]
  /** Total count of matching CVEs */
  totalCount: number
  /** Whether the result is from cache */
  fromCache?: boolean
  /** Query execution time in ms (for cache hits, this is the original time) */
  queryTimeMs: number
}

/**
 * Singleton instance for application-wide use
 */
let searchCacheInstance: CVESearchCache | null = null

export function getSearchCache(options?: Partial<QueryCacheOptions>): CVESearchCache {
  if (!searchCacheInstance) {
    searchCacheInstance = new CVESearchCache(options)
  }
  return searchCacheInstance
}

export function resetSearchCache(): void {
  if (searchCacheInstance) {
    searchCacheInstance.invalidateAll()
  }
  searchCacheInstance = null
}
