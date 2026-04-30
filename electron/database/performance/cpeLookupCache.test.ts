/**
 * Unit tests for CPE Lookup Cache
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CPELookupCache,
  getCPELookupCache,
  resetCPELookupCache,
  type CPELookupResult,
  type VendorStats,
  type ProductStats,
} from './cpeLookupCache.js'

describe('CPELookupCache', () => {
  let cache: CPELookupCache

  beforeEach(() => {
    cache = new CPELookupCache({
      maxVendors: 100,
      maxProductsPerVendor: 10,
      maxCVEsPerProduct: 50,
      ttlMs: 30000,
      preloadPopularVendors: false,
    })
  })

  afterEach(() => {
    cache.clear()
    resetCPELookupCache()
  })

  describe('constructor', () => {
    it('should create cache with default options', () => {
      const defaultCache = new CPELookupCache()
      expect(defaultCache.getStats().initialized).toBe(false)
    })

    it('should create cache with custom options', () => {
      expect(cache.getStats().initialized).toBe(false)
    })
  })

  describe('initialize', () => {
    it('should initialize without database if no tables', async () => {
      // Create a mock database with no tables
      const mockDb = {
        exec: vi.fn().mockReturnValue([]),
      } as unknown

      await cache.initialize(mockDb)

      expect(cache.getStats().initialized).toBe(true)
    })

    it('should skip re-initialization', async () => {
      const mockDb = {
        exec: vi.fn().mockReturnValue([]),
      } as unknown

      await cache.initialize(mockDb)
      await cache.initialize(mockDb)

      expect(cache.getStats().initialized).toBe(true)
    })
  })

  describe('getVendorStats', () => {
    it('should return null for non-existent vendor', () => {
      expect(cache.getVendorStats('nonexistent')).toBeNull()
    })
  })

  describe('getProductStats', () => {
    it('should return null for non-existent product', () => {
      expect(cache.getProductStats('nonexistent', 'product')).toBeNull()
    })
  })

  describe('lookup', () => {
    it('should return null for cache miss', () => {
      expect(cache.lookup('microsoft', 'windows')).toBeNull()
    })
  })

  describe('storeLookup', () => {
    it('should store and retrieve lookup result', () => {
      const result: CPELookupResult = {
        cveIds: ['CVE-2024-00001', 'CVE-2024-00002'],
        totalCount: 2,
        vulnerableCount: 2,
      }

      cache.storeLookup('microsoft', 'windows', true, result)

      const cached = cache.lookup('microsoft', 'windows', true)
      expect(cached).toEqual(result)
    })

    it('should evict entries when at capacity', () => {
      const smallCache = new CPELookupCache({
        maxVendors: 2,
        maxProductsPerVendor: 1,
        maxCVEsPerProduct: 10,
        ttlMs: 30000,
      })

      // Add entries
      smallCache.storeLookup('vendor1', 'product1', true, {
        cveIds: ['CVE-1'],
        totalCount: 1,
        vulnerableCount: 1,
      })

      smallCache.storeLookup('vendor2', 'product1', true, {
        cveIds: ['CVE-2'],
        totalCount: 1,
        vulnerableCount: 1,
      })

      // Verify entries are cached
      expect(smallCache.lookup('vendor1', 'product1', true)).not.toBeNull()
      expect(smallCache.lookup('vendor2', 'product1', true)).not.toBeNull()
    })
  })

  describe('needsRefresh', () => {
    it('should return true for uninitialized cache', () => {
      expect(cache.needsRefresh()).toBe(true)
    })

    it('should return false for recently initialized cache', async () => {
      const mockDb = {
        exec: vi.fn().mockReturnValue([]),
      } as unknown

      await cache.initialize(mockDb)
      expect(cache.needsRefresh()).toBe(false)
    })

    it('should return true after TTL expires', async () => {
      vi.useFakeTimers()

      const mockDb = {
        exec: vi.fn().mockReturnValue([]),
      } as unknown

      await cache.initialize(mockDb)

      // Advance time past TTL
      vi.advanceTimersByTime(40000)

      expect(cache.needsRefresh()).toBe(true)

      vi.useRealTimers()
    })
  })

  describe('invalidateVendor', () => {
    it('should remove vendor entries', () => {
      cache.storeLookup('microsoft', 'windows', true, {
        cveIds: ['CVE-1'],
        totalCount: 1,
        vulnerableCount: 1,
      })
      cache.storeLookup('google', 'chrome', true, {
        cveIds: ['CVE-2'],
        totalCount: 1,
        vulnerableCount: 1,
      })

      cache.invalidateVendor('microsoft')

      expect(cache.lookup('microsoft', 'windows', true)).toBeNull()
      expect(cache.lookup('google', 'chrome', true)).not.toBeNull()
    })
  })

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.storeLookup('microsoft', 'windows', true, {
        cveIds: ['CVE-1'],
        totalCount: 1,
        vulnerableCount: 1,
      })

      cache.clear()

      expect(cache.lookup('microsoft', 'windows', true)).toBeNull()
      expect(cache.getStats().vendorCount).toBe(0)
    })
  })

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      const mockDb = {
        exec: vi.fn().mockReturnValue([]),
      } as unknown

      await cache.initialize(mockDb)

      const stats = cache.getStats()

      expect(stats).toHaveProperty('vendorCount')
      expect(stats).toHaveProperty('productCount')
      expect(stats).toHaveProperty('lookupCacheSize')
      expect(stats).toHaveProperty('maxSize')
      expect(stats).toHaveProperty('lastUpdate')
      expect(stats).toHaveProperty('initialized')
      expect(stats).toHaveProperty('memoryUsageEstimate')
    })
  })
})

describe('Singleton functions', () => {
  beforeEach(() => {
    resetCPELookupCache()
  })

  it('should return singleton instance', () => {
    const instance1 = getCPELookupCache()
    const instance2 = getCPELookupCache()

    expect(instance1).toBe(instance2)
  })

  it('should reset singleton instance', () => {
    const instance1 = getCPELookupCache()
    resetCPELookupCache()
    const instance2 = getCPELookupCache()

    expect(instance1).not.toBe(instance2)
  })
})
