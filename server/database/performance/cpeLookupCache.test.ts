/**
 * Unit tests for CPE Lookup Cache
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CPELookupCache,
  getCPELookupCache,
  resetCPELookupCache,
  cachedCPELookup,
  type CPELookupResult,
  type VendorStats,
  type ProductStats,
} from './cpeLookupCache.js'

/**
 * Helper to create a better-sqlite3-compatible mock database.
 *
 * The production code uses `db.prepare(sql).all(...params)` exclusively,
 * so `prepare` must return a statement object with `.all()` that resolves
 * via the provided handler.
 */
function createMockDb(handler: (sql: string) => Record<string, unknown>[] = () => []): Record<string, unknown> {
  return {
    prepare: vi.fn((sql: string) => ({
      all: vi.fn(() => handler(sql)),
      get: vi.fn(() => undefined),
      run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
    })),
    exec: vi.fn(),
    pragma: vi.fn(() => []),
  }
}

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
      const mockDb = createMockDb()

      await cache.initialize(mockDb)

      expect(cache.getStats().initialized).toBe(true)
    })

    it('should skip re-initialization', async () => {
      const mockDb = createMockDb()

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
      const mockDb = createMockDb()

      await cache.initialize(mockDb)
      expect(cache.needsRefresh()).toBe(false)
    })

    it('should return true after TTL expires', async () => {
      vi.useFakeTimers()

      const mockDb = createMockDb()

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
      const mockDb = createMockDb()

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

describe('LRU Eviction', () => {
  let cache: CPELookupCache

  beforeEach(() => {
    cache = new CPELookupCache({
      maxVendors: 1,
      maxProductsPerVendor: 2,
      maxCVEsPerProduct: 10,
      ttlMs: 30000,
      preloadPopularVendors: false,
    })
  })

  afterEach(() => {
    cache.clear()
    resetCPELookupCache()
  })

  it('should evict oldest entry when exceeding capacity', () => {
    cache.storeLookup('v1', 'p1', true, {
      cveIds: ['CVE-1'],
      totalCount: 1,
      vulnerableCount: 1,
    })
    cache.storeLookup('v1', 'p2', true, {
      cveIds: ['CVE-2'],
      totalCount: 1,
      vulnerableCount: 1,
    })

    expect(cache.lookup('v1', 'p1', true)).not.toBeNull()
    expect(cache.lookup('v1', 'p2', true)).not.toBeNull()

    cache.storeLookup('v1', 'p3', true, {
      cveIds: ['CVE-3'],
      totalCount: 1,
      vulnerableCount: 1,
    })

    expect(cache.lookup('v1', 'p1', true)).toBeNull()
    expect(cache.lookup('v1', 'p2', true)).not.toBeNull()
    expect(cache.lookup('v1', 'p3', true)).not.toBeNull()
  })

  it('should update access order on cache hit preventing eviction', () => {
    cache.storeLookup('v1', 'p1', true, {
      cveIds: ['CVE-1'],
      totalCount: 1,
      vulnerableCount: 1,
    })
    cache.storeLookup('v1', 'p2', true, {
      cveIds: ['CVE-2'],
      totalCount: 1,
      vulnerableCount: 1,
    })

    cache.lookup('v1', 'p1', true)

    cache.storeLookup('v1', 'p3', true, {
      cveIds: ['CVE-3'],
      totalCount: 1,
      vulnerableCount: 1,
    })

    expect(cache.lookup('v1', 'p1', true)).not.toBeNull()
    expect(cache.lookup('v1', 'p2', true)).toBeNull()
    expect(cache.lookup('v1', 'p3', true)).not.toBeNull()
  })
})

describe('cachedCPELookup', () => {
  beforeEach(() => {
    resetCPELookupCache()
  })

  afterEach(() => {
    resetCPELookupCache()
  })

  it('should query database on cache miss and store result', async () => {
    const mockCveRows = [{ cve_id: 'CVE-2024-0001' }, { cve_id: 'CVE-2024-0002' }]
    const mockDb = createMockDb((sql: string) => {
      if (sql.includes('SELECT DISTINCT cve_id')) return mockCveRows
      return []
    })

    const result = await cachedCPELookup(mockDb, 'microsoft', 'windows')

    expect(result.cveIds).toEqual(['CVE-2024-0001', 'CVE-2024-0002'])
    expect(result.totalCount).toBe(2)
  })

  it('should return cached result on cache hit', async () => {
    const mockCveRows = [{ cve_id: 'CVE-2024-0001' }]
    const callCount = { value: 0 }
    const mockDb = createMockDb((sql: string) => {
      if (sql.includes('SELECT DISTINCT cve_id')) {
        callCount.value++
        return mockCveRows
      }
      return []
    })

    await cachedCPELookup(mockDb, 'microsoft', 'windows')
    const lookupCallsBefore = callCount.value

    const result = await cachedCPELookup(mockDb, 'microsoft', 'windows')

    expect(result.cveIds).toEqual(['CVE-2024-0001'])
    expect(callCount.value).toBe(lookupCallsBefore)
  })

  it('should query without product filter when product is undefined', async () => {
    let capturedSql = ''
    const mockDb = createMockDb((sql: string) => {
      if (sql.includes('SELECT DISTINCT cve_id')) {
        capturedSql = sql
        return [{ cve_id: 'CVE-1' }]
      }
      return []
    })

    await cachedCPELookup(mockDb, 'microsoft')

    expect(capturedSql).not.toContain('cpe_product')
  })

  it('should filter by vulnerable flag when set to false', async () => {
    let capturedSql = ''
    const mockDb = createMockDb((sql: string) => {
      if (sql.includes('SELECT DISTINCT cve_id')) {
        capturedSql = sql
        return [{ cve_id: 'CVE-1' }]
      }
      return []
    })

    await cachedCPELookup(mockDb, 'microsoft', 'windows', { vulnerable: false })

    expect(capturedSql).not.toContain('vulnerable = 1')
  })

  it('should apply pagination with limit and offset', async () => {
    const mockCveRows = Array.from({ length: 10 }, (_, i) => ({ cve_id: `CVE-2024-${String(i).padStart(4, '0')}` }))
    const mockDb = createMockDb((sql: string) => {
      if (sql.includes('SELECT DISTINCT cve_id')) return mockCveRows
      return []
    })

    const result = await cachedCPELookup(mockDb, 'microsoft', 'windows', { limit: 3, offset: 2 })

    expect(result.cveIds).toEqual(['CVE-2024-0002', 'CVE-2024-0003', 'CVE-2024-0004'])
    expect(result.totalCount).toBe(10)
  })

  it('should apply pagination on cache hit', async () => {
    const mockCveRows = Array.from({ length: 5 }, (_, i) => ({ cve_id: `CVE-${i}` }))
    const mockDb = createMockDb((sql: string) => {
      if (sql.includes('SELECT DISTINCT cve_id')) return mockCveRows
      return []
    })

    await cachedCPELookup(mockDb, 'vendor1', 'product1')

    const result = await cachedCPELookup(mockDb, 'vendor1', 'product1', { limit: 2, offset: 1 })

    expect(result.cveIds).toEqual(['CVE-1', 'CVE-2'])
    expect(result.totalCount).toBe(5)
  })

  it('should handle empty database results', async () => {
    const mockDb = createMockDb()

    const result = await cachedCPELookup(mockDb, 'nonexistent', 'product')

    expect(result.cveIds).toEqual([])
    expect(result.totalCount).toBe(0)
  })
})

describe('CPELookupCache updateFromDatabase', () => {
  let cache: CPELookupCache

  beforeEach(() => {
    resetCPELookupCache()
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

  it('should clear existing cache and reinitialize', async () => {
    const mockDb = createMockDb()

    await cache.initialize(mockDb)
    cache.storeLookup('vendor1', 'product1', true, {
      cveIds: ['CVE-1'],
      totalCount: 1,
      vulnerableCount: 1,
    })

    expect(cache.lookup('vendor1', 'product1', true)).not.toBeNull()

    await cache.updateFromDatabase(mockDb)

    expect(cache.lookup('vendor1', 'product1', true)).toBeNull()
    expect(cache.getStats().initialized).toBe(true)
  })
})

describe('CPELookupCache invalidateVendor with products', () => {
  let cache: CPELookupCache

  beforeEach(() => {
    resetCPELookupCache()
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

  it('should remove product stats when invalidating vendor', async () => {
    const mockDb = createMockDb((sql: string) => {
      if (sql.includes('GROUP BY cpe_vendor')) {
        return [{ vendor: 'microsoft', product_count: 2, cve_count: 10, vulnerable_cve_count: 8 }]
      }
      if (sql.includes('GROUP BY cpe_product')) {
        return [
          { product: 'windows', cve_count: 5, vulnerable_cve_count: 4 },
          { product: 'office', cve_count: 5, vulnerable_cve_count: 4 },
        ]
      }
      return []
    })

    const productCache = new CPELookupCache({
      maxVendors: 100,
      maxProductsPerVendor: 10,
      maxCVEsPerProduct: 50,
      ttlMs: 30000,
      preloadPopularVendors: true,
    })

    await productCache.initialize(mockDb)

    expect(productCache.getProductStats('microsoft', 'windows')).not.toBeNull()
    expect(productCache.getProductStats('microsoft', 'office')).not.toBeNull()

    productCache.invalidateVendor('microsoft')

    expect(productCache.getProductStats('microsoft', 'windows')).toBeNull()
    expect(productCache.getProductStats('microsoft', 'office')).toBeNull()

    productCache.clear()
  })

  it('should remove lookup cache entries for vendor', async () => {
    const mockDb = createMockDb()

    await cache.initialize(mockDb)

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

describe('CPELookupCache getCachedVendors and getCachedProducts', () => {
  let cache: CPELookupCache

  beforeEach(() => {
    resetCPELookupCache()
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

  it('should return list of cached vendors', async () => {
    const mockDb = createMockDb((sql: string) => {
      if (sql.includes('GROUP BY cpe_vendor')) {
        return [
          { vendor: 'apache', product_count: 3, cve_count: 15, vulnerable_cve_count: 10 },
          { vendor: 'nginx', product_count: 1, cve_count: 5, vulnerable_cve_count: 3 },
        ]
      }
      return []
    })

    await cache.initialize(mockDb)

    const vendors = cache.getCachedVendors()
    expect(vendors).toContain('apache')
    expect(vendors).toContain('nginx')
  })

  it('should return list of cached products for a vendor', async () => {
    const productCache = new CPELookupCache({
      maxVendors: 100,
      maxProductsPerVendor: 10,
      maxCVEsPerProduct: 50,
      ttlMs: 30000,
      preloadPopularVendors: true,
    })

    const mockDb = createMockDb((sql: string) => {
      if (sql.includes('GROUP BY cpe_vendor')) {
        return [{ vendor: 'apache', product_count: 2, cve_count: 10, vulnerable_cve_count: 8 }]
      }
      if (sql.includes('GROUP BY cpe_product')) {
        return [
          { product: 'log4j', cve_count: 5, vulnerable_cve_count: 4 },
          { product: 'tomcat', cve_count: 5, vulnerable_cve_count: 4 },
        ]
      }
      return []
    })

    await productCache.initialize(mockDb)

    const products = productCache.getCachedProducts('apache')
    expect(products).toContain('log4j')
    expect(products).toContain('tomcat')

    productCache.clear()
  })

  it('should return empty array for vendor with no products', async () => {
    const mockDb = createMockDb()

    await cache.initialize(mockDb)

    const products = cache.getCachedProducts('nonexistent')
    expect(products).toEqual([])
  })
})
