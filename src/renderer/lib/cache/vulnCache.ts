import type { Vulnerability } from '@@/types'

/**
 * Cache entry with expiration time
 */
interface CacheEntry<T> {
  data: T
  cachedAt: number
  ttl: number // Time to live in milliseconds
}

/**
 * Vulnerability data cache
 * Caches vulnerability data by key (e.g., component purl, CVE ID)
 * with a configurable TTL to reduce API calls
 */
class VulnerabilityDataCache {
  private cache: Map<string, CacheEntry<Vulnerability[]>>
  private metadata: Map<string, { lastRefresh: number; refreshInterval: number }>

  constructor() {
    this.cache = new Map()
    this.metadata = new Map()
  }

  /**
   * Generate cache key for a component
   */
  private getComponentKey(purl: string, source: string): string {
    return `${source}:${purl}`
  }

  /**
   * Get cached vulnerabilities for a component
   */
  get(purl: string, source: string): Vulnerability[] | null {
    const key = this.getComponentKey(purl, source)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    const now = Date.now()
    const isExpired = now - entry.cachedAt > entry.ttl

    if (isExpired) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * Set cached vulnerabilities for a component
   */
  set(purl: string, source: string, vulnerabilities: Vulnerability[], ttl: number): void {
    const key = this.getComponentKey(purl, source)
    this.cache.set(key, {
      data: vulnerabilities,
      cachedAt: Date.now(),
      ttl,
    })
  }

  /**
   * Check if cached data exists and is valid
   */
  has(purl: string, source: string): boolean {
    const key = this.getComponentKey(purl, source)
    const entry = this.cache.get(key)

    if (!entry) {
      return false
    }

    const now = Date.now()
    const isExpired = now - entry.cachedAt > entry.ttl

    return !isExpired
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.metadata.clear()
  }

  /**
   * Clear cache for specific component
   */
  clearComponent(purl: string, source: string): void {
    const key = this.getComponentKey(purl, source)
    this.cache.delete(key)
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now()
    let removed = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > entry.ttl) {
        this.cache.delete(key)
        removed++
      }
    }

    return removed
  }

  /**
   * Get all cached keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now()
    let expired = 0
    let valid = 0
    let totalSize = 0

    for (const entry of this.cache.values()) {
      totalSize += JSON.stringify(entry.data).length
      if (now - entry.cachedAt > entry.ttl) {
        expired++
      } else {
        valid++
      }
    }

    return {
      total: this.cache.size,
      valid,
      expired,
      sizeBytes: totalSize,
      sizeMB: totalSize / (1024 * 1024),
    }
  }
}

// Singleton instance
let vulnCacheInstance: VulnerabilityDataCache | null = null

/**
 * Get the vulnerability cache instance
 */
export function getVulnCache(): VulnerabilityDataCache {
  if (!vulnCacheInstance) {
    vulnCacheInstance = new VulnerabilityDataCache()
  }
  return vulnCacheInstance
}

/**
 * Reset the cache instance (useful for tests)
 */
export function resetVulnCache(): void {
  vulnCacheInstance = null
}

/**
 * Check if vulnerability data is stale based on last refresh time and cache TTL
 */
export function isVulnDataStale(lastRefresh: Date | undefined, cacheTTLHours: number): boolean {
  if (!lastRefresh) {
    return true
  }

  const now = Date.now()
  const lastRefreshTime = new Date(lastRefresh).getTime()
  const ttlMs = cacheTTLHours * 60 * 60 * 1000

  return now - lastRefreshTime > ttlMs
}

/**
 * Get human-readable staleness text
 */
export function getStalenessText(lastRefresh: Date | undefined, _cacheTTLHours: number): string {
  if (!lastRefresh) {
    return 'Never refreshed'
  }

  const now = Date.now()
  const lastRefreshTime = new Date(lastRefresh).getTime()
  const diffMs = now - lastRefreshTime
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) {
    return 'Just now'
  } else if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  } else {
    return new Date(lastRefresh).toLocaleDateString()
  }
}

/**
 * Check if data is stale and should be refreshed
 */
export function shouldRefreshData(
  lastRefresh: Date | undefined,
  autoRefreshEnabled: boolean,
  autoRefreshInterval: number,
): boolean {
  if (!lastRefresh || !autoRefreshEnabled) {
    return false
  }

  const now = Date.now()
  const lastRefreshTime = new Date(lastRefresh).getTime()
  const intervalMs = autoRefreshInterval * 60 * 60 * 1000

  return now - lastRefreshTime > intervalMs
}
