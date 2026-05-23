/**
 * CacheManager Service
 *
 * LRU cache implementation for CVE data with SQLite persistence.
 * Provides configurable TTL (Time-To-Live) management and cache statistics.
 *
 * Features:
 * - SQLite-backed cache storage
 * - LRU (Least Recently Used) eviction
 * - Configurable TTL (default: 24 hours)
 * - Cache hit/miss statistics
 * - Automatic cleanup of expired entries
 */

import Database from 'better-sqlite3'

type BetterDb = InstanceType<typeof Database>

/**
 * Cache configuration options
 */
export interface CacheConfig {
  /** Maximum cache size in megabytes (default: 50) */
  maxSizeMB: number
  /** Time-to-live in milliseconds (default: 24 hours) */
  ttlMs: number
  /** Enable/disable cache (default: true) */
  enabled: boolean
  /** Cleanup interval in milliseconds (default: 1 hour) */
  cleanupIntervalMs: number
}

/**
 * Cache entry structure
 */
export interface CacheEntry<T = unknown> {
  /** Cache key */
  key: string
  /** Cached value (JSON serialized) */
  value: T
  /** Timestamp when entry was created */
  createdAt: number
  /** Timestamp when entry was last accessed */
  lastAccessedAt: number
  /** Size of the entry in bytes */
  size: number
  /** Namespace for the cache entry */
  namespace: string
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total number of cache hits */
  hits: number
  /** Total number of cache misses */
  misses: number
  /** Current number of entries in cache */
  entryCount: number
  /** Current cache size in bytes */
  sizeBytes: number
  /** Maximum cache size in bytes */
  maxSizeBytes: number
  /** Cache hit rate (0-1) */
  hitRate: number
  /** Oldest entry timestamp */
  oldestEntry?: number
  /** Newest entry timestamp */
  newestEntry?: number
}

/**
 * Cache manager for CVE data with SQLite persistence
 */
export class CacheManager {
  private static instance: CacheManager | null = null
  private db: BetterDb | null = null
  private config: CacheConfig
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private stats = {
    hits: 0,
    misses: 0,
  }

  private defaultConfig: CacheConfig = {
    maxSizeMB: 50,
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    enabled: true,
    cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
  }

  private constructor(config?: Partial<CacheConfig>) {
    this.config = { ...this.defaultConfig, ...config }
  }

  /**
   * Get the singleton instance of CacheManager
   */
  public static getInstance(config?: Partial<CacheConfig>): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager(config)
    }
    return CacheManager.instance
  }

  /**
   * Initialize the cache manager with a database instance
   */
  public async initialize(db: BetterDb): Promise<void> {
    this.db = db
    this.createTables()

    // Start cleanup timer
    if (this.config.enabled) {
      this.startCleanupTimer()
    }

    console.log('[CacheManager] Initialized with config:', this.config)
  }

  /**
   * Create cache tables if they don't exist
   */
  private createTables(): void {
    if (!this.db) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        size INTEGER NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'default',
        PRIMARY KEY (key, namespace)
      )
    `)

    // Create index on last_accessed_at for LRU queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cache_last_accessed
      ON cache_entries(last_accessed_at)
    `)

    // Create index on namespace for namespace-based operations
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cache_namespace
      ON cache_entries(namespace)
    `)

    // Create index on created_at for TTL cleanup
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cache_created_at
      ON cache_entries(created_at)
    `)
  }

  /**
   * Get a value from the cache
   */
  public get<T>(key: string, namespace: string = 'default'): T | null {
    if (!this.config.enabled || !this.db) {
      return null
    }

    const now = Date.now()
    const row = this.db
      .prepare('SELECT value, created_at FROM cache_entries WHERE key = ? AND namespace = ?')
      .get(key, namespace) as { value: string; created_at: number } | undefined

    if (!row) {
      this.stats.misses++
      return null
    }

    // Check TTL
    if (now - row.created_at > this.config.ttlMs) {
      // Entry has expired, delete it
      this.delete(key, namespace)
      this.stats.misses++
      return null
    }

    // Update last accessed time
    this.db
      .prepare('UPDATE cache_entries SET last_accessed_at = ? WHERE key = ? AND namespace = ?')
      .run(now, key, namespace)

    this.stats.hits++

    try {
      return JSON.parse(row.value) as T
    } catch {
      console.error('[CacheManager] Failed to parse cached value for key:', key)
      return null
    }
  }

  /**
   * Set a value in the cache
   */
  public set<T>(key: string, value: T, namespace: string = 'default'): boolean {
    if (!this.config.enabled || !this.db) {
      return false
    }

    const now = Date.now()
    const valueJson = JSON.stringify(value)
    const size = Buffer.byteLength(valueJson, 'utf-8')

    try {
      this.evictIfNeeded(size)

      this.db
        .prepare(
          `INSERT OR REPLACE INTO cache_entries
           (key, value, created_at, last_accessed_at, size, namespace)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(key, valueJson, now, now, size, namespace)
      return true
    } catch (error) {
      console.error('[CacheManager] Failed to set cache entry:', error)
      return false
    }
  }

  /**
   * Delete a value from the cache
   */
  public delete(key: string, namespace: string = 'default'): boolean {
    if (!this.db) return false

    try {
      this.db.prepare('DELETE FROM cache_entries WHERE key = ? AND namespace = ?').run(key, namespace)
      return true
    } catch (error) {
      console.error('[CacheManager] Failed to delete cache entry:', error)
      return false
    }
  }

  /**
   * Clear all entries in a namespace (or all entries if namespace not specified)
   */
  public clear(namespace?: string): number {
    if (!this.db) return 0

    try {
      if (namespace) {
        const countRow = this.db
          .prepare('SELECT COUNT(*) as cnt FROM cache_entries WHERE namespace = ?')
          .get(namespace) as { cnt: number } | undefined
        const count = countRow?.cnt ?? 0
        this.db.prepare('DELETE FROM cache_entries WHERE namespace = ?').run(namespace)
        return count
      } else {
        const countRow = this.db.prepare('SELECT COUNT(*) as cnt FROM cache_entries').get() as
          | { cnt: number }
          | undefined
        const count = countRow?.cnt ?? 0
        this.db.exec('DELETE FROM cache_entries')
        return count
      }
    } catch (error) {
      console.error('[CacheManager] Failed to clear cache:', error)
      return 0
    }
  }

  /**
   * Check if a key exists in the cache (and is not expired)
   */
  public has(key: string, namespace: string = 'default'): boolean {
    if (!this.config.enabled || !this.db) {
      return false
    }

    const now = Date.now()
    const row = this.db
      .prepare('SELECT created_at FROM cache_entries WHERE key = ? AND namespace = ?')
      .get(key, namespace) as { created_at: number } | undefined

    if (!row) {
      return false
    }

    // Check TTL
    return now - row.created_at <= this.config.ttlMs
  }

  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    const stats: CacheStats = {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entryCount: 0,
      sizeBytes: 0,
      maxSizeBytes: this.config.maxSizeMB * 1024 * 1024,
      hitRate: 0,
    }

    if (this.db) {
      const countRow = this.db
        .prepare(
          `SELECT COUNT(*) as cnt, COALESCE(SUM(size), 0) as total_size, MIN(created_at) as oldest, MAX(created_at) as newest
           FROM cache_entries`,
        )
        .get() as { cnt: number; total_size: number; oldest: number | null; newest: number | null } | undefined

      if (countRow) {
        stats.entryCount = countRow.cnt
        stats.sizeBytes = countRow.total_size
        stats.oldestEntry = countRow.oldest ?? undefined
        stats.newestEntry = countRow.newest ?? undefined
      }
    }

    const totalRequests = stats.hits + stats.misses
    stats.hitRate = totalRequests > 0 ? stats.hits / totalRequests : 0

    return stats
  }

  /**
   * Get the current configuration
   */
  public getConfig(): CacheConfig {
    return { ...this.config }
  }

  /**
   * Update the configuration
   */
  public updateConfig(newConfig: Partial<CacheConfig>): void {
    const wasEnabled = this.config.enabled
    this.config = { ...this.config, ...newConfig }

    // Handle enabled/disabled state change
    if (wasEnabled && !this.config.enabled) {
      this.stopCleanupTimer()
    } else if (!wasEnabled && this.config.enabled) {
      this.startCleanupTimer()
    }

    console.log('[CacheManager] Config updated:', this.config)
  }

  /**
   * Evict entries using LRU policy if cache size exceeds limit
   */
  private evictIfNeeded(newEntrySize: number): void {
    if (!this.db) return

    const maxSizeBytes = this.config.maxSizeMB * 1024 * 1024
    const sizeRow = this.db.prepare('SELECT COALESCE(SUM(size), 0) as total FROM cache_entries').get() as
      | { total: number }
      | undefined
    const currentSize = sizeRow?.total ?? 0

    // If adding the new entry would exceed the limit, evict oldest entries
    let sizeToFree = currentSize + newEntrySize - maxSizeBytes

    while (sizeToFree > 0) {
      // Get the least recently used entry
      const lruRow = this.db
        .prepare(
          `SELECT key, namespace, size FROM cache_entries
           ORDER BY last_accessed_at ASC LIMIT 1`,
        )
        .get() as { key: string; namespace: string; size: number } | undefined

      if (!lruRow) {
        break
      }

      this.db.prepare('DELETE FROM cache_entries WHERE key = ? AND namespace = ?').run(lruRow.key, lruRow.namespace)

      sizeToFree -= lruRow.size
      console.log(`[CacheManager] Evicted LRU entry: ${lruRow.key} (freed ${lruRow.size} bytes)`)
    }
  }

  /**
   * Clean up expired entries
   */
  public cleanup(): number {
    if (!this.db) return 0

    const now = Date.now()
    const cutoffTime = now - this.config.ttlMs

    try {
      const countRow = this.db
        .prepare('SELECT COUNT(*) as cnt FROM cache_entries WHERE created_at < ?')
        .get(cutoffTime) as { cnt: number } | undefined
      const count = countRow?.cnt ?? 0

      this.db.prepare('DELETE FROM cache_entries WHERE created_at < ?').run(cutoffTime)

      if (count > 0) {
        console.log(`[CacheManager] Cleaned up ${count} expired entries`)
      }

      return count
    } catch (error) {
      console.error('[CacheManager] Failed to cleanup expired entries:', error)
      return 0
    }
  }

  /**
   * Start the cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) return

    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupIntervalMs)

    // Prevent timer from keeping process alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref()
    }
  }

  /**
   * Stop the cleanup timer
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats.hits = 0
    this.stats.misses = 0
  }

  /**
   * Get all keys in a namespace
   */
  public getKeys(namespace: string = 'default'): string[] {
    if (!this.db) return []

    const rows = this.db.prepare('SELECT key FROM cache_entries WHERE namespace = ?').all(namespace) as Array<{
      key: string
    }>

    return rows.map((row) => row.key)
  }

  /**
   * Get entries count by namespace
   */
  public getNamespaceStats(): Record<string, { count: number; sizeBytes: number }> {
    if (!this.db) return {}

    const rows = this.db
      .prepare('SELECT namespace, COUNT(*) as cnt, SUM(size) as total_size FROM cache_entries GROUP BY namespace')
      .all() as Array<{ namespace: string; cnt: number; total_size: number | null }>

    const stats: Record<string, { count: number; sizeBytes: number }> = {}

    for (const row of rows) {
      stats[row.namespace] = {
        count: row.cnt,
        sizeBytes: row.total_size || 0,
      }
    }

    return stats
  }

  /**
   * Shutdown the cache manager
   */
  public shutdown(): void {
    this.stopCleanupTimer()
    this.db = null
    console.log('[CacheManager] Shutdown complete')
  }

  /**
   * Reset the singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (CacheManager.instance) {
      CacheManager.instance.shutdown()
      CacheManager.instance = null
    }
  }
}

// Export singleton getter
export const getCacheManager = (config?: Partial<CacheConfig>): CacheManager => {
  return CacheManager.getInstance(config)
}

// Export initialization helper
export const initializeCacheManager = async (db: BetterDb, config?: Partial<CacheConfig>): Promise<CacheManager> => {
  const manager = CacheManager.getInstance(config)
  await manager.initialize(db)
  return manager
}
