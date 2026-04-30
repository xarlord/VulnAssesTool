/**
 * CacheManager Tests
 *
 * Comprehensive tests for the LRU cache with SQLite persistence
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { Database } from 'sql.js'
import { CacheManager, getCacheManager, initializeCacheManager, type CacheConfig } from './CacheManager'

describe('CacheManager', () => {
  let db: Database
  let cacheManager: CacheManager

  const testConfig: Partial<CacheConfig> = {
    maxSizeMB: 1, // 1 MB for testing
    ttlMs: 1000, // 1 second for testing
    cleanupIntervalMs: 500, // 500ms for testing
  }

  beforeEach(async () => {
    // Reset singleton
    CacheManager.resetInstance()

    // Initialize SQL.js
    const SQL = await initSqlJs({})
    db = new SQL.Database()

    // Get fresh instance
    cacheManager = getCacheManager(testConfig)
    await cacheManager.initialize(db)
  })

  afterEach(() => {
    cacheManager.shutdown()
    db.close()
    CacheManager.resetInstance()
  })

  describe('initialization', () => {
    it('should create cache tables on initialization', async () => {
      const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='cache_entries'`)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should create indexes for LRU queries', async () => {
      const result = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cache_last_accessed'`)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should create indexes for namespace queries', async () => {
      const result = db.exec(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cache_namespace'`)
      expect(result.length).toBeGreaterThan(0)
    })

    it('should accept custom configuration', async () => {
      const customConfig: Partial<CacheConfig> = {
        maxSizeMB: 100,
        ttlMs: 3600000,
      }

      CacheManager.resetInstance()
      const manager = getCacheManager(customConfig)
      await manager.initialize(db)

      const config = manager.getConfig()
      expect(config.maxSizeMB).toBe(100)
      expect(config.ttlMs).toBe(3600000)

      manager.shutdown()
    })
  })

  describe('get and set', () => {
    it('should set and get a value', () => {
      const testData = { cve: 'CVE-2024-1234', severity: 'HIGH' }

      cacheManager.set('test-key', testData)
      const result = cacheManager.get<typeof testData>('test-key')

      expect(result).toEqual(testData)
    })

    it('should return null for non-existent key', () => {
      const result = cacheManager.get('non-existent')
      expect(result).toBeNull()
    })

    it('should handle different value types', () => {
      // String
      cacheManager.set('string-key', 'test string')
      expect(cacheManager.get<string>('string-key')).toBe('test string')

      // Number
      cacheManager.set('number-key', 42)
      expect(cacheManager.get<number>('number-key')).toBe(42)

      // Array
      cacheManager.set('array-key', [1, 2, 3])
      expect(cacheManager.get<number[]>('array-key')).toEqual([1, 2, 3])

      // Boolean
      cacheManager.set('bool-key', true)
      expect(cacheManager.get<boolean>('bool-key')).toBe(true)
    })

    it('should track cache hits and misses', () => {
      cacheManager.set('hit-key', 'value')
      cacheManager.get('hit-key')
      cacheManager.get('miss-key')

      const stats = cacheManager.getStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
    })

    it('should update last accessed time on get', () => {
      cacheManager.set('access-key', 'value')

      // Wait a bit
      const beforeTime = Date.now()
      vi.useFakeTimers()
      vi.advanceTimersByTime(100)

      cacheManager.get('access-key')

      const result = db.exec(`SELECT last_accessed_at FROM cache_entries WHERE key = 'access-key'`)
      const lastAccessed = result[0].values[0][0] as number

      expect(lastAccessed).toBeGreaterThanOrEqual(beforeTime + 100)
      vi.useRealTimers()
    })
  })

  describe('TTL (Time-To-Live)', () => {
    it('should return null for expired entries', async () => {
      cacheManager.set('expire-key', 'value')

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100))

      const result = cacheManager.get('expire-key')
      expect(result).toBeNull()
    })

    it('should delete expired entries when accessed', async () => {
      cacheManager.set('expire-delete-key', 'value')

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 1100))

      cacheManager.get('expire-delete-key')

      const result = db.exec(`SELECT COUNT(*) FROM cache_entries WHERE key = 'expire-delete-key'`)
      const count = result[0].values[0][0] as number

      expect(count).toBe(0)
    })

    it('should respect custom TTL configuration', async () => {
      CacheManager.resetInstance()
      const longTtlManager = getCacheManager({ ttlMs: 10000 })
      await longTtlManager.initialize(db)

      longTtlManager.set('long-ttl-key', 'value')

      // Wait 1.5 seconds (longer than default test TTL but shorter than custom TTL)
      await new Promise((resolve) => setTimeout(resolve, 1500))

      const result = longTtlManager.get('long-ttl-key')
      expect(result).toBe('value')

      longTtlManager.shutdown()
    })
  })

  describe('namespaces', () => {
    it('should support multiple namespaces', () => {
      const result1 = cacheManager.set('key1', 'value1', 'ns1')
      const result2 = cacheManager.set('key1', 'value2', 'ns2')

      expect(result1).toBe(true)
      expect(result2).toBe(true)
      expect(cacheManager.get('key1', 'ns1')).toBe('value1')
      expect(cacheManager.get('key1', 'ns2')).toBe('value2')
    })

    it('should use default namespace when not specified', () => {
      cacheManager.set('default-key', 'default-value')

      const result = cacheManager.get('default-key', 'default')
      expect(result).toBe('default-value')
    })

    it('should clear only specific namespace', () => {
      cacheManager.set('key1', 'value1', 'ns1')
      cacheManager.set('key2', 'value2', 'ns2')

      const cleared = cacheManager.clear('ns1')

      expect(cleared).toBe(1)
      expect(cacheManager.get('key1', 'ns1')).toBeNull()
      expect(cacheManager.get('key2', 'ns2')).toBe('value2')
    })

    it('should get keys by namespace', () => {
      cacheManager.set('key1', 'value1', 'ns1')
      cacheManager.set('key2', 'value2', 'ns1')
      cacheManager.set('key3', 'value3', 'ns2')

      const keys = cacheManager.getKeys('ns1')

      expect(keys).toContain('key1')
      expect(keys).toContain('key2')
      expect(keys).not.toContain('key3')
    })

    it('should get namespace statistics', () => {
      cacheManager.set('key1', 'value1', 'ns1')
      cacheManager.set('key2', 'value2-value2', 'ns1')
      cacheManager.set('key3', 'value3', 'ns2')

      const stats = cacheManager.getNamespaceStats()

      expect(stats['ns1'].count).toBe(2)
      expect(stats['ns2'].count).toBe(1)
    })
  })

  describe('LRU eviction', () => {
    it('should evict oldest entries when cache is full', () => {
      // Set a very small cache size for testing (500 bytes)
      CacheManager.resetInstance()
      const smallCache = getCacheManager({ maxSizeMB: 0.0005 })
      smallCache.initialize(db)

      // Add entries that are large enough to trigger eviction
      // Each entry needs to be large enough to fill the cache
      const largeEntry = 'x'.repeat(200)
      smallCache.set('key1', largeEntry)
      smallCache.set('key2', largeEntry)
      smallCache.set('key3', largeEntry)

      // key1 should have been evicted (it's the oldest)
      expect(smallCache.get('key1')).toBeNull()
      // key2 and key3 should still exist
      expect(smallCache.get('key2')).toBe(largeEntry)
      expect(smallCache.get('key3')).toBe(largeEntry)

      smallCache.shutdown()
    })

    it('should update LRU order on access', () => {
      vi.useFakeTimers()
      const time1 = Date.now()

      cacheManager.set('key1', 'value1')

      vi.advanceTimersByTime(100)
      cacheManager.set('key2', 'value2')

      vi.advanceTimersByTime(100)
      // Access key1 to make it more recently used
      cacheManager.get('key1')

      // Verify order in database
      const result = db.exec(`SELECT key FROM cache_entries ORDER BY last_accessed_at ASC`)
      const keys = result[0].values.map((row) => row[0] as string)

      // key2 should be older (first to evict)
      expect(keys[0]).toBe('key2')
      expect(keys[1]).toBe('key1')

      vi.useRealTimers()
    })
  })

  describe('has', () => {
    it('should return true for existing non-expired key', () => {
      cacheManager.set('exists-key', 'value')
      expect(cacheManager.has('exists-key')).toBe(true)
    })

    it('should return false for non-existent key', () => {
      expect(cacheManager.has('not-exists')).toBe(false)
    })

    it('should return false for expired key', async () => {
      cacheManager.set('expired-key', 'value')

      await new Promise((resolve) => setTimeout(resolve, 1100))

      expect(cacheManager.has('expired-key')).toBe(false)
    })
  })

  describe('delete', () => {
    it('should delete an entry', () => {
      cacheManager.set('delete-key', 'value')
      expect(cacheManager.has('delete-key')).toBe(true)

      cacheManager.delete('delete-key')
      expect(cacheManager.has('delete-key')).toBe(false)
    })

    it('should return true even if key does not exist', () => {
      const result = cacheManager.delete('non-existent')
      expect(result).toBe(true)
    })
  })

  describe('clear', () => {
    it('should clear all entries when no namespace specified', () => {
      cacheManager.set('key1', 'value1', 'ns1')
      cacheManager.set('key2', 'value2', 'ns2')

      const cleared = cacheManager.clear()

      expect(cleared).toBe(2)
      expect(cacheManager.get('key1', 'ns1')).toBeNull()
      expect(cacheManager.get('key2', 'ns2')).toBeNull()
    })

    it('should return 0 when clearing empty cache', () => {
      const cleared = cacheManager.clear()
      expect(cleared).toBe(0)
    })
  })

  describe('statistics', () => {
    it('should return correct statistics', () => {
      cacheManager.set('key1', 'value1')
      cacheManager.get('key1') // hit
      cacheManager.get('missing') // miss

      const stats = cacheManager.getStats()

      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(1)
      expect(stats.entryCount).toBe(1)
      expect(stats.hitRate).toBe(0.5)
      expect(stats.maxSizeBytes).toBe(testConfig.maxSizeMB! * 1024 * 1024)
    })

    it('should return 0 hit rate when no requests', () => {
      const stats = cacheManager.getStats()
      expect(stats.hitRate).toBe(0)
    })

    it('should track entry count', () => {
      cacheManager.set('key1', 'value1')
      cacheManager.set('key2', 'value2')

      const stats = cacheManager.getStats()
      expect(stats.entryCount).toBe(2)
    })

    it('should track oldest and newest entry timestamps', () => {
      const before = Date.now()
      cacheManager.set('key1', 'value1')

      const stats = cacheManager.getStats()
      expect(stats.oldestEntry).toBeGreaterThanOrEqual(before)
      expect(stats.newestEntry).toBeGreaterThanOrEqual(before)
    })

    it('should reset statistics', () => {
      cacheManager.set('key1', 'value1')
      cacheManager.get('key1')
      cacheManager.get('missing')

      cacheManager.resetStats()

      const stats = cacheManager.getStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(0)
    })
  })

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      vi.useFakeTimers()

      cacheManager.set('expire1', 'value1')
      cacheManager.set('expire2', 'value2')

      // Advance time past TTL
      vi.advanceTimersByTime(1100)

      const cleaned = cacheManager.cleanup()
      expect(cleaned).toBe(2)

      vi.useRealTimers()
    })

    it('should not remove non-expired entries', () => {
      cacheManager.set('keep-key', 'value')

      const cleaned = cacheManager.cleanup()
      expect(cleaned).toBe(0)
      expect(cacheManager.has('keep-key')).toBe(true)
    })
  })

  describe('configuration', () => {
    it('should get current configuration', () => {
      const config = cacheManager.getConfig()

      expect(config.maxSizeMB).toBe(testConfig.maxSizeMB)
      expect(config.ttlMs).toBe(testConfig.ttlMs)
      expect(config.enabled).toBe(true)
    })

    it('should update configuration', () => {
      cacheManager.updateConfig({ maxSizeMB: 200, ttlMs: 7200000 })

      const config = cacheManager.getConfig()
      expect(config.maxSizeMB).toBe(200)
      expect(config.ttlMs).toBe(7200000)
    })

    it('should disable cache when enabled is false', () => {
      cacheManager.updateConfig({ enabled: false })

      cacheManager.set('disabled-key', 'value')
      const result = cacheManager.get('disabled-key')

      expect(result).toBeNull()
    })

    it('should not return cached values when disabled', () => {
      cacheManager.set('before-disable', 'value')
      cacheManager.updateConfig({ enabled: false })

      const result = cacheManager.get('before-disable')
      expect(result).toBeNull()
    })
  })

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = getCacheManager()
      const instance2 = getCacheManager()

      expect(instance1).toBe(instance2)
    })

    it('should reset instance', () => {
      const instance1 = getCacheManager()
      CacheManager.resetInstance()
      const instance2 = getCacheManager()

      expect(instance1).not.toBe(instance2)
    })
  })

  describe('initialization helper', () => {
    it('should initialize and return manager', async () => {
      CacheManager.resetInstance()

      const manager = await initializeCacheManager(db, testConfig)
      const config = manager.getConfig()

      expect(config.maxSizeMB).toBe(testConfig.maxSizeMB)

      manager.shutdown()
    })
  })

  describe('shutdown', () => {
    it('should stop cleanup timer on shutdown', () => {
      const manager = getCacheManager()
      manager.initialize(db)

      manager.shutdown()

      // Should not throw when getting config after shutdown
      const config = manager.getConfig()
      expect(config).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle empty string key', () => {
      cacheManager.set('', 'empty-key-value')
      expect(cacheManager.get('')).toBe('empty-key-value')
    })

    it('should handle null value in JSON', () => {
      cacheManager.set('null-key', null)
      const result = cacheManager.get('null-key')
      expect(result).toBeNull()

      // But the key should exist (null is a valid value)
      expect(cacheManager.has('null-key')).toBe(true)
    })

    it('should handle large values', () => {
      const largeValue = 'x'.repeat(10000)
      cacheManager.set('large-key', largeValue)

      const result = cacheManager.get('large-key')
      expect(result).toBe(largeValue)
    })

    it('should handle special characters in key', () => {
      const specialKey = 'key:with/special\\chars?and=more'
      cacheManager.set(specialKey, 'value')

      expect(cacheManager.get(specialKey)).toBe('value')
    })

    it('should handle unicode in values', () => {
      const unicodeValue = { emoji: '🔐🔒', text: '日本語' }
      cacheManager.set('unicode-key', unicodeValue)

      expect(cacheManager.get('unicode-key')).toEqual(unicodeValue)
    })
  })
})
