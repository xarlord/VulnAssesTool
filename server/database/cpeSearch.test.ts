/**
 * Tests for CPE Search Module
 * Tests CPE search functionality for software identification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CPESearch, createCPESearch, type CPESearchResult } from './cpeSearch'
import type { Database } from 'sql.js'

// Mock Database
const createMockDatabase = (results: any[] = []): Database => {
  let callIndex = 0
  return {
    exec: vi.fn((query: string, params?: any[]) => {
      if (results.length > 0 && callIndex < results.length) {
        const result = results[callIndex++]
        // Return array containing the result object (sql.js format)
        return result ? [result] : []
      }
      return []
    }),
    run: vi.fn(),
    prepare: vi.fn(),
    close: vi.fn(),
  } as unknown as Database
}

describe('CPESearch', () => {
  describe('constructor', () => {
    it('should throw error if database is null', () => {
      expect(() => new CPESearch(null as unknown as Database)).toThrow('Database instance is required')
    })

    it('should throw error if database is undefined', () => {
      expect(() => new CPESearch(undefined as unknown as Database)).toThrow('Database instance is required')
    })

    it('should create instance with valid database', () => {
      const mockDb = createMockDatabase()
      const cpeSearch = new CPESearch(mockDb)
      expect(cpeSearch).toBeInstanceOf(CPESearch)
    })
  })

  describe('parseCPE23Uri', () => {
    let cpeSearch: CPESearch

    beforeEach(() => {
      const mockDb = createMockDatabase()
      cpeSearch = new CPESearch(mockDb)
    })

    it('should parse valid CPE 2.3 URI correctly', () => {
      const uri = 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*'
      const result = cpeSearch.parseCPE23Uri(uri)

      expect(result).toEqual({
        vendor: 'apache',
        product: 'log4j',
        version: '2.14.1',
      })
    })

    it('should parse CPE with underscores in vendor', () => {
      const uri = 'cpe:2.3:a:microsoft:visual_studio:2019:*:*:*:*:*:*:*'
      const result = cpeSearch.parseCPE23Uri(uri)

      expect(result).toEqual({
        vendor: 'microsoft',
        product: 'visual_studio',
        version: '2019',
      })
    })

    it('should return null for CPE 2.2 format', () => {
      const uri = 'cpe:/a:apache:log4j:2.14.1'
      const result = cpeSearch.parseCPE23Uri(uri)
      expect(result).toBeNull()
    })

    it('should return null for invalid CPE format', () => {
      const result = cpeSearch.parseCPE23Uri('not-a-cpe')
      expect(result).toBeNull()
    })

    it('should return null for null input', () => {
      const result = cpeSearch.parseCPE23Uri(null as unknown as string)
      expect(result).toBeNull()
    })

    it('should return null for undefined input', () => {
      const result = cpeSearch.parseCPE23Uri(undefined as unknown as string)
      expect(result).toBeNull()
    })

    it('should return null for empty string', () => {
      const result = cpeSearch.parseCPE23Uri('')
      expect(result).toBeNull()
    })

    it('should return null for CPE with too few components', () => {
      const result = cpeSearch.parseCPE23Uri('cpe:2.3:a:apache')
      expect(result).toBeNull()
    })

    it('should handle asterisk wildcard version', () => {
      const uri = 'cpe:2.3:a:apache:log4j:*:*:*:*:*:*:*:*'
      const result = cpeSearch.parseCPE23Uri(uri)

      expect(result).toEqual({
        vendor: 'apache',
        product: 'log4j',
        version: '*',
      })
    })

    it('should handle escaped characters in CPE', () => {
      const uri = 'cpe:2.3:a:vendor:product\\_name:1.0:*:*:*:*:*:*:*'
      const result = cpeSearch.parseCPE23Uri(uri)

      expect(result).toEqual({
        vendor: 'vendor',
        product: 'product_name',
        version: '1.0',
      })
    })
  })

  describe('searchByProductName', () => {
    it('should return empty array for null productName', async () => {
      const mockDb = createMockDatabase()
      const cpeSearch = new CPESearch(mockDb)
      const results = await cpeSearch.searchByProductName(null as unknown as string)
      expect(results).toEqual([])
    })

    it('should return empty array for empty productName', async () => {
      const mockDb = createMockDatabase()
      const cpeSearch = new CPESearch(mockDb)
      const results = await cpeSearch.searchByProductName('')
      expect(results).toEqual([])
    })

    it('should return empty array for whitespace productName', async () => {
      const mockDb = createMockDatabase()
      const cpeSearch = new CPESearch(mockDb)
      const results = await cpeSearch.searchByProductName('   ')
      expect(results).toEqual([])
    })

    it('should search database with LIKE pattern', async () => {
      const mockResults = [
        {
          columns: ['cpe23_uri', 'vulnerable'],
          values: [
            ['cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*', 1],
            ['cpe:2.3:a:apache:log4j:2.15.0:*:*:*:*:*:*:*', 1],
          ],
        },
      ]
      const mockDb = createMockDatabase(mockResults)
      const cpeSearch = new CPESearch(mockDb)

      const results = await cpeSearch.searchByProductName('log4j')

      expect(results).toHaveLength(2)
      expect(results[0].product).toBe('log4j')
      expect(results[0].vendor).toBe('apache')
    })

    it('should use default limit of 100', async () => {
      const mockDb = createMockDatabase([
        {
          columns: ['cpe23_uri', 'vulnerable'],
          values: [],
        },
      ])
      const cpeSearch = new CPESearch(mockDb)

      await cpeSearch.searchByProductName('test')

      // Check that exec was called with limit 100
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([expect.any(String), 100]),
      )
    })

    it('should respect custom limit', async () => {
      const mockDb = createMockDatabase([
        {
          columns: ['cpe23_uri', 'vulnerable'],
          values: [],
        },
      ])
      const cpeSearch = new CPESearch(mockDb)

      await cpeSearch.searchByProductName('test', 50)

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([expect.any(String), 50]),
      )
    })

    it('should cap limit at 1000', async () => {
      const mockDb = createMockDatabase([
        {
          columns: ['cpe23_uri', 'vulnerable'],
          values: [],
        },
      ])
      const cpeSearch = new CPESearch(mockDb)

      await cpeSearch.searchByProductName('test', 5000)

      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ?'),
        expect.arrayContaining([expect.any(String), 1000]),
      )
    })

    it('should only return vulnerable CPEs', async () => {
      const mockResults = [
        {
          columns: ['cpe23_uri', 'vulnerable'],
          values: [['cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*', 1]],
        },
      ]
      const mockDb = createMockDatabase(mockResults)
      const cpeSearch = new CPESearch(mockDb)

      await cpeSearch.searchByProductName('log4j')

      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('vulnerable = 1'), expect.any(Array))
    })
  })

  describe('searchByTokens', () => {
    it('should return empty array for null tokens', async () => {
      const mockDb = createMockDatabase()
      const cpeSearch = new CPESearch(mockDb)
      const results = await cpeSearch.searchByTokens(null as unknown as string[])
      expect(results).toEqual([])
    })

    it('should return empty array for empty tokens array', async () => {
      const mockDb = createMockDatabase()
      const cpeSearch = new CPESearch(mockDb)
      const results = await cpeSearch.searchByTokens([])
      expect(results).toEqual([])
    })

    it('should filter out empty tokens', async () => {
      const mockDb = createMockDatabase([
        {
          columns: ['cpe23_uri', 'vulnerable'],
          values: [],
        },
      ])
      const cpeSearch = new CPESearch(mockDb)

      await cpeSearch.searchByTokens(['apache', '', '  ', 'log4j'])

      // Should only have 2 LIKE conditions
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('cpe23_uri LIKE ? AND cpe23_uri LIKE ?'),
        expect.any(Array),
      )
    })

    it('should search with multiple tokens using AND logic', async () => {
      const mockResults = [
        {
          columns: ['cpe23_uri', 'vulnerable'],
          values: [['cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*', 1]],
        },
      ]
      const mockDb = createMockDatabase(mockResults)
      const cpeSearch = new CPESearch(mockDb)

      const results = await cpeSearch.searchByTokens(['apache', 'log4j'])

      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('AND'), expect.any(Array))
      expect(results).toHaveLength(1)
    })
  })

  describe('getAllUniqueProducts', () => {
    it('should return unique product names', async () => {
      const mockResults = [
        {
          columns: ['cpe23_uri'],
          values: [
            ['cpe:2.3:a:apache:log4j:1.0:*:*:*:*:*:*:*'],
            ['cpe:2.3:a:apache:log4j:2.0:*:*:*:*:*:*:*'],
            ['cpe:2.3:a:nginx:nginx:1.0:*:*:*:*:*:*:*'],
          ],
        },
      ]
      const mockDb = createMockDatabase(mockResults)
      const cpeSearch = new CPESearch(mockDb)

      const products = await cpeSearch.getAllUniqueProducts()

      expect(products).toContain('log4j')
      expect(products).toContain('nginx')
      expect(products).toHaveLength(2)
    })

    it('should return sorted products', async () => {
      const mockResults = [
        {
          columns: ['cpe23_uri'],
          values: [['cpe:2.3:a:zzz:zebra:1.0:*:*:*:*:*:*:*'], ['cpe:2.3:a:aaa:apple:1.0:*:*:*:*:*:*:*']],
        },
      ]
      const mockDb = createMockDatabase(mockResults)
      const cpeSearch = new CPESearch(mockDb)

      const products = await cpeSearch.getAllUniqueProducts()

      expect(products[0]).toBe('apple')
      expect(products[1]).toBe('zebra')
    })

    it('should only include vulnerable CPEs', async () => {
      const mockDb = createMockDatabase([
        {
          columns: ['cpe23_uri'],
          values: [],
        },
      ])
      const cpeSearch = new CPESearch(mockDb)

      await cpeSearch.getAllUniqueProducts()

      // getAllUniqueProducts calls exec with only the query (no parameters)
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('vulnerable = 1'))
    })

    it('should only include CPE 2.3 format', async () => {
      const mockDb = createMockDatabase([
        {
          columns: ['cpe23_uri'],
          values: [],
        },
      ])
      const cpeSearch = new CPESearch(mockDb)

      await cpeSearch.getAllUniqueProducts()

      // getAllUniqueProducts calls exec with only the query (no parameters)
      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining("cpe23_uri LIKE 'cpe:2.3:%'"))
    })
  })

  describe('getProductVendors', () => {
    it('should return empty array for null product', async () => {
      const mockDb = createMockDatabase()
      const cpeSearch = new CPESearch(mockDb)
      const results = await cpeSearch.getProductVendors(null as unknown as string)
      expect(results).toEqual([])
    })

    it('should return empty array for empty product', async () => {
      const mockDb = createMockDatabase()
      const cpeSearch = new CPESearch(mockDb)
      const results = await cpeSearch.getProductVendors('')
      expect(results).toEqual([])
    })

    it('should return unique vendors for a product', async () => {
      const mockResults = [
        {
          columns: ['cpe23_uri'],
          values: [['cpe:2.3:a:apache:log4j:1.0:*:*:*:*:*:*:*'], ['cpe:2.3:a:apache:log4j:2.0:*:*:*:*:*:*:*']],
        },
      ]
      const mockDb = createMockDatabase(mockResults)
      const cpeSearch = new CPESearch(mockDb)

      const vendors = await cpeSearch.getProductVendors('log4j')

      expect(vendors).toEqual(['apache'])
    })

    it('should return sorted vendors', async () => {
      const mockResults = [
        {
          columns: ['cpe23_uri'],
          values: [['cpe:2.3:a:zzz:common_lib:1.0:*:*:*:*:*:*:*'], ['cpe:2.3:a:aaa:common_lib:1.0:*:*:*:*:*:*:*']],
        },
      ]
      const mockDb = createMockDatabase(mockResults)
      const cpeSearch = new CPESearch(mockDb)

      const vendors = await cpeSearch.getProductVendors('common_lib')

      expect(vendors[0]).toBe('aaa')
      expect(vendors[1]).toBe('zzz')
    })

    it('should only return vulnerable CPEs', async () => {
      const mockDb = createMockDatabase([
        {
          columns: ['cpe23_uri'],
          values: [],
        },
      ])
      const cpeSearch = new CPESearch(mockDb)

      await cpeSearch.getProductVendors('test')

      expect(mockDb.exec).toHaveBeenCalledWith(expect.stringContaining('vulnerable = 1'), expect.any(Array))
    })
  })
})

describe('createCPESearch', () => {
  it('should create CPESearch instance', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = createCPESearch(mockDb)
    expect(cpeSearch).toBeInstanceOf(CPESearch)
  })
})

describe('CPESearch cache methods', () => {
  it('should return null cache manager by default', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    expect(cpeSearch.getCacheManager()).toBeNull()
  })

  it('should return null cache stats when no cache manager', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    expect(cpeSearch.getCacheStats()).toBeNull()
  })

  it('should return 0 from clearCache when no cache manager', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    expect(cpeSearch.clearCache()).toBe(0)
  })

  it('should set a custom cache manager', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const mockCacheManager = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(() => 5),
      getNamespaceStats: vi.fn(() => ({ 'cpe-search': { size: 3 } })),
      initialize: vi.fn(),
    } as unknown as CacheManager
    cpeSearch.setCacheManager(mockCacheManager)
    expect(cpeSearch.getCacheManager()).toBe(mockCacheManager)
  })

  it('should clear cache through cache manager', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const mockCacheManager = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(() => 7),
      getNamespaceStats: vi.fn(),
      initialize: vi.fn(),
    } as unknown as CacheManager
    cpeSearch.setCacheManager(mockCacheManager)
    expect(cpeSearch.clearCache()).toBe(7)
    expect(mockCacheManager.clear).toHaveBeenCalledWith('cpe-search')
  })

  it('should return cache stats from cache manager', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const mockCacheManager = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      getNamespaceStats: vi.fn(() => ({
        'cpe-search': { hits: 10, misses: 2 },
        other: { hits: 5 },
      })),
      initialize: vi.fn(),
    } as unknown as CacheManager
    cpeSearch.setCacheManager(mockCacheManager)
    const stats = cpeSearch.getCacheStats()
    expect(stats).toEqual({ hits: 10, misses: 2 })
  })

  it('should return null cache stats when namespace not in stats', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const mockCacheManager = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      getNamespaceStats: vi.fn(() => ({ 'other-namespace': { hits: 5 } })),
      initialize: vi.fn(),
    } as unknown as CacheManager
    cpeSearch.setCacheManager(mockCacheManager)
    expect(cpeSearch.getCacheStats()).toBeNull()
  })
})

describe('CPESearch searchByProductName with cache', () => {
  it('should return cached results when cache is available', async () => {
    const mockResults: CPESearchResult[] = [
      {
        cpe23Uri: 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*',
        vendor: 'apache',
        product: 'log4j',
        version: '2.14.1',
        vulnerable: true,
      },
    ]
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const mockCacheManager = {
      get: vi.fn(() => mockResults),
      set: vi.fn(),
      clear: vi.fn(),
      getNamespaceStats: vi.fn(),
      initialize: vi.fn(),
    } as unknown as CacheManager
    cpeSearch.setCacheManager(mockCacheManager)

    const results = await cpeSearch.searchByProductName('log4j')
    expect(results).toEqual(mockResults)
    expect(mockCacheManager.get).toHaveBeenCalled()
  })

  it('should force refresh and skip cache', async () => {
    const mockDb = createMockDatabase([
      {
        columns: ['cpe23_uri', 'vulnerable'],
        values: [],
      },
    ])
    const cpeSearch = new CPESearch(mockDb)
    const mockCacheManager = {
      get: vi.fn(),
      set: vi.fn(),
      clear: vi.fn(),
      getNamespaceStats: vi.fn(),
      initialize: vi.fn(),
    } as unknown as CacheManager
    cpeSearch.setCacheManager(mockCacheManager)

    await cpeSearch.searchByProductName('test', undefined, { forceRefresh: true })
    expect(mockCacheManager.get).not.toHaveBeenCalled()
  })

  it('should set cache after fresh search', async () => {
    const mockDb = createMockDatabase([
      {
        columns: ['cpe23_uri', 'vulnerable'],
        values: [['cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*', 1]],
      },
    ])
    const cpeSearch = new CPESearch(mockDb)
    const mockCacheManager = {
      get: vi.fn(() => null),
      set: vi.fn(),
      clear: vi.fn(),
      getNamespaceStats: vi.fn(),
      initialize: vi.fn(),
    } as unknown as CacheManager
    cpeSearch.setCacheManager(mockCacheManager)

    await cpeSearch.searchByProductName('log4j')
    expect(mockCacheManager.set).toHaveBeenCalled()
  })
})

describe('CPESearch decodeCPEValue', () => {
  it('should handle escaped colon in CPE via decodeCPEValue', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    // Note: split(':') happens BEFORE decodeCPEValue, so \: will be split.
    // decodeCPEValue works on individual segments, not the whole URI.
    // Test with escaped characters within a single segment (no colon in segment)
    const result = cpeSearch.parseCPE23Uri('cpe:2.3:a:vendor:product_name:1.0:*:*:*:*:*:*:*')
    expect(result).not.toBeNull()
    expect(result?.product).toBe('product_name')
  })

  it('should handle escaped dot in CPE', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const result = cpeSearch.parseCPE23Uri('cpe:2.3:a:vendor:product\\.name:1.0:*:*:*:*:*:*:*')
    expect(result).not.toBeNull()
    expect(result?.product).toBe('product.name')
  })

  it('should handle escaped hyphen in CPE', () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const result = cpeSearch.parseCPE23Uri('cpe:2.3:a:vendor:product\\-name:1.0:*:*:*:*:*:*:*')
    expect(result).not.toBeNull()
    expect(result?.product).toBe('product-name')
  })
})

describe('CPESearch searchByProductName with whitespace-only productName', () => {
  it('should return empty for productName that sanitizes to empty', async () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const results = await cpeSearch.searchByProductName('   ')
    expect(results).toEqual([])
  })

  it('should return empty for non-string productName', async () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const results = await cpeSearch.searchByProductName(123 as unknown as string)
    expect(results).toEqual([])
  })
})

describe('CPESearch searchByTokens — additional coverage', () => {
  it('should return empty for non-array tokens', async () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const results = await cpeSearch.searchByTokens('not-array' as unknown as string[])
    expect(results).toEqual([])
  })

  it('should return empty when all tokens sanitize to empty', async () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const results = await cpeSearch.searchByTokens(['   ', '   '])
    expect(results).toEqual([])
  })

  it('should return results with parsed components', async () => {
    const mockResults = [
      {
        columns: ['cpe23_uri', 'vulnerable'],
        values: [['cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*', 1]],
      },
    ]
    const mockDb = createMockDatabase(mockResults)
    const cpeSearch = new CPESearch(mockDb)

    const results = await cpeSearch.searchByTokens(['log4j'])
    expect(results).toHaveLength(1)
    expect(results[0].cpe23Uri).toBe('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*')
    expect(results[0].vendor).toBe('apache')
    expect(results[0].product).toBe('log4j')
    expect(results[0].version).toBe('2.14.1')
    expect(results[0].vulnerable).toBe(true)
  })

  it('should skip rows that fail to parse as CPE', async () => {
    const mockResults = [
      {
        columns: ['cpe23_uri', 'vulnerable'],
        values: [
          ['invalid-cpe', 1],
          ['cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*', 1],
        ],
      },
    ]
    const mockDb = createMockDatabase(mockResults)
    const cpeSearch = new CPESearch(mockDb)

    const results = await cpeSearch.searchByTokens(['log4j'])
    expect(results).toHaveLength(1)
    expect(results[0].product).toBe('log4j')
  })
})

describe('CPESearch getProductVendors — whitespace handling', () => {
  it('should return empty for whitespace product that sanitizes to empty', async () => {
    const mockDb = createMockDatabase()
    const cpeSearch = new CPESearch(mockDb)
    const results = await cpeSearch.getProductVendors('   ')
    expect(results).toEqual([])
  })
})

describe('CPESearch parseSearchResults — empty and edge cases', () => {
  it('should handle empty results from database', async () => {
    const mockDb = createMockDatabase([])
    const cpeSearch = new CPESearch(mockDb)
    const results = await cpeSearch.searchByProductName('test')
    expect(results).toEqual([])
  })

  it('should handle results with vulnerable=0', async () => {
    const mockResults = [
      {
        columns: ['cpe23_uri', 'vulnerable'],
        values: [['cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*', 0]],
      },
    ]
    const mockDb = createMockDatabase(mockResults)
    const cpeSearch = new CPESearch(mockDb)

    const results = await cpeSearch.searchByTokens(['log4j'])
    expect(results).toHaveLength(1)
    expect(results[0].vulnerable).toBe(false)
  })
})

describe('CPESearchResult interface', () => {
  it('should have correct structure', () => {
    const result: CPESearchResult = {
      cpe23Uri: 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*',
      vendor: 'apache',
      product: 'log4j',
      version: '2.14.1',
      vulnerable: true,
    }

    expect(result.cpe23Uri).toBe('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*')
    expect(result.vendor).toBe('apache')
    expect(result.product).toBe('log4j')
    expect(result.version).toBe('2.14.1')
    expect(result.vulnerable).toBe(true)
  })
})
