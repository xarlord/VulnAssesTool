/**
 * Unit tests for Query Cache Layer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  QueryCache,
  CVESearchCache,
  getSearchCache,
  resetSearchCache,
  type CacheStats,
  type CVECacheResult,
} from './queryCache.js'

describe('QueryCache', () => {
  let cache: QueryCache<string[]>

  beforeEach(() => {
    vi.useFakeTimers()
    cache = new QueryCache<string[]>({
      maxSize: 10,
      ttlMs: 60000,
      enableStats: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should create cache with default options', () => {
      const defaultCache = new QueryCache<string[]>()
      expect(defaultCache.size).toBe(0)
    })

    it('should create cache with custom options', () => {
      expect(cache.size).toBe(0)
    })
  })

  describe('get and set', () => {
    it('should return null for non-existent key', () => {
      expect(cache.get('nonexistent')).toBeNull()
    })

    it('should store and retrieve values', () => {
      cache.set('key1', ['value1'])
      expect(cache.get('key1')).toEqual(['value1'])
    })

    it('should update access statistics on get', () => {
      cache.set('key1', ['value1'])
      cache.get('key1')
      cache.get('key1')
      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
    })

    it('should return null for expired entries', () => {
      const shortCache = new QueryCache<string[]>({ ttlMs: 100 })
      shortCache.set('key1', ['value1'])

      vi.advanceTimersByTime(200)

      expect(shortCache.get('key1')).toBeNull()
    })
  })

  describe('LRU eviction', () => {
    it('should evict least recently used entries', () => {
      // Fill cache to max
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, [`value${i}`])
      }

      // Add one more - should trigger eviction
      cache.set('key10', ['value10'])

      // The first entry should have been evicted
      expect(cache.get('key0')).toBeNull()
    })

    it('should maintain access order on get', () => {
      // Fill cache to max (10 entries)
      for (let i = 0; i < 10; i++) {
        cache.set(`key${i}`, [`value${i}`])
      }

      // Access key0, then key2 (making key1 the LRU)
      cache.get('key0')
      cache.get('key2')

      // Add one more - should trigger eviction of key1 (LRU)
      cache.set('key10', ['value10'])

      // key1 should be gone (it was the LRU after we accessed key0 and key2)
      expect(cache.get('key1')).toBeNull()
      // key0 and key2 should still exist
      expect(cache.get('key0')).toEqual(['value0'])
      expect(cache.get('key2')).toEqual(['value2'])
    })
  })

  describe('invalidatePattern', () => {
    it('should invalidate entries matching pattern', () => {
      cache.set('text:1', ['value1'])
      cache.set('text:2', ['value2'])
      cache.set('other:1', ['value3'])

      const count = cache.invalidatePattern(/^text:/)
      expect(count).toBe(2)
      expect(cache.get('text:1')).toBeNull()
      expect(cache.get('text:2')).toBeNull()
      expect(cache.get('other:1')).toEqual(['value3'])
    })
  })

  describe('invalidatePrefix', () => {
    it('should invalidate entries with prefix', () => {
      cache.set('search:text:1', ['v1'])
      cache.set('search:text:2', ['v2'])
      cache.set('other:data:1', ['v3'])

      const count = cache.invalidatePrefix('search:')
      expect(count).toBe(2)
      expect(cache.get('search:text:1')).toBeNull()
      expect(cache.get('search:text:2')).toBeNull()
    })
  })

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set('key1', ['value1'])
      cache.set('key2', ['value2'])
      cache.clear()
      expect(cache.size).toBe(0)
    })
  })

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      const shortCache = new QueryCache<string[]>({ ttlMs: 100 })
      shortCache.set('key1', ['value1'])
      shortCache.set('key2', ['value2'])

      vi.advanceTimersByTime(200)

      const removed = shortCache.cleanup()
      expect(removed).toBe(2)
      expect(shortCache.get('key1')).toBeNull()
      expect(shortCache.get('key2')).toBeNull()
      expect(shortCache.size).toBe(0)
    })
  })

  describe('has', () => {
    it('should return true for existing entry', () => {
      cache.set('key1', ['value1'])
      expect(cache.has('key1')).toBe(true)
    })

    it('should return false for non-existent entry', () => {
      expect(cache.has('nonexistent')).toBe(false)
    })

    it('should return false for expired entry', () => {
      const shortCache = new QueryCache<string[]>({ ttlMs: 100 })
      shortCache.set('key1', ['value1'])

      vi.advanceTimersByTime(200)
      expect(shortCache.has('key1')).toBe(false)
    })
  })

  describe('getRemainingTTL', () => {
    it('should return remaining TTL for existing entry', () => {
      cache.set('key1', ['value1'])
      const ttl = cache.getRemainingTTL('key1')
      expect(ttl).toBeGreaterThan(0)
    })

    it('should return 0 for non-existent entry', () => {
      expect(cache.getRemainingTTL('nonexistent')).toBe(0)
    })

    it('should return 0 for expired entry', () => {
      const shortCache = new QueryCache<string[]>({ ttlMs: 100 })
      shortCache.set('key1', ['value1'])
      vi.advanceTimersByTime(200)
      expect(shortCache.getRemainingTTL('key1')).toBe(0)
    })
  })

  describe('updateTTL', () => {
    it('should update TTL for existing entry', () => {
      cache.set('key1', ['value1'])
      const result = cache.updateTTL('key1', 120000)
      expect(result).toBe(true)
      expect(cache.getRemainingTTL('key1')).toBeGreaterThan(60000)
    })
  })

  describe('getStats', () => {
    it('should track cache statistics', () => {
      cache.set('key1', ['value1'])
      cache.get('key1')
      cache.get('key1')
      cache.get('key2') // miss

      const stats = cache.getStats()
      expect(stats.size).toBe(1) // Only key1 is in the cache
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBeCloseTo(0.667)
    })
  })
})

describe('CVESearchCache', () => {
  let cveCache: CVESearchCache

  beforeEach(() => {
    cveCache = new CVESearchCache()
  })

  describe('text search caching', () => {
    it('should cache and retrieve text search results', () => {
      cveCache.setTextSearch('test query', 10, 0, {
        cveIds: ['CVE-2024-00001'],
        totalCount: 1,
        queryTimeMs: 50,
      })
      const result = cveCache.getTextSearch('test query', 10, 0)
      expect(result).toEqual({
        cveIds: ['CVE-2024-00001'],
        totalCount: 1,
        queryTimeMs: 50,
      })
    })

    it('should return null for non-existent text search', () => {
      const cached = cveCache.getTextSearch('nonexistent query', 10, 0)
      expect(cached).toBeNull()
    })

    it('should invalidate cache on new data', () => {
      cveCache.setTextSearch('test query', 10, 0, {
        cveIds: ['CVE-2024-00001'],
        totalCount: 1,
        queryTimeMs: 50,
      })
      cveCache.invalidateAll()
      expect(cveCache.getTextSearch('test query', 10, 0)).toBeNull()
    })
  })

  describe('CPE search caching', () => {
    it('should cache and retrieve CPE search results', () => {
      const searchData = {
        cveIds: ['CVE-2024-00001', 'CVE-2024-00002'],
        totalCount: 2,
        queryTimeMs: 100,
      }
      cveCache.setCPESearch('microsoft', 'windows', { vulnerable: true }, searchData)
      const result = cveCache.getCPESearch('microsoft', 'windows', { vulnerable: true })
      expect(result).toEqual(searchData)
    })

    it('should return null for non-existent entry', () => {
      expect(cveCache.getCPESearch('nonexistent', 'product', {})).toBeNull()
    })
  })

  describe('severity/date search caching', () => {
    it('should cache and retrieve severity search results', () => {
      const searchData = {
        cveIds: ['CVE-2024-00001'],
        totalCount: 100,
        queryTimeMs: 50,
      }
      cveCache.setSeveritySearch({ severity: 'HIGH', year: 2024, limit: 50 }, searchData)
      const result = cveCache.getSeveritySearch({ severity: 'HIGH', year: 2024, limit: 50 })
      expect(result).toEqual(searchData)
    })

    it('should return null for non-existent entry', () => {
      expect(cveCache.getSeveritySearch({ severity: 'CRITICAL' })).toBeNull()
    })
  })

  describe('invalidateAll', () => {
    it('should invalidate all cached entries', () => {
      const searchData = {
        cveIds: ['CVE-2024-00001'],
        totalCount: 1,
        queryTimeMs: 50,
      }
      cveCache.setCPESearch('microsoft', 'windows', {}, searchData)
      cveCache.invalidateAll()
      expect(cveCache.getCPESearch('microsoft', 'windows', {})).toBeNull()
    })
  })
})

describe('Singleton functions', () => {
  it('should return singleton instance', () => {
    const instance1 = getSearchCache()
    const instance2 = getSearchCache()
    expect(instance1).toBe(instance2)
  })

  it('should reset singleton instance', () => {
    const instance1 = getSearchCache()
    resetSearchCache()
    const instance2 = getSearchCache()
    expect(instance1).not.toBe(instance2)
  })
})
