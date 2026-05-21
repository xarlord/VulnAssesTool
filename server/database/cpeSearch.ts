/**
 * CPE Search Module
 * Provides database search functionality for CPE (Common Platform Enumeration) data
 * Used for software identification and vulnerability matching
 */

import type { Database } from 'sql.js'
import { escapeLikePattern, sanitizeSqlInput } from './sqlSanitizer.js'
import type { CacheManager } from '../services/CacheManager.js'
import { getCacheManager } from '../services/CacheManager.js'

/**
 * Result from a CPE search
 */
export interface CPESearchResult {
  /** Full CPE 2.3 URI */
  cpe23Uri: string
  /** Vendor name extracted from CPE */
  vendor: string
  /** Product name extracted from CPE */
  product: string
  /** Version extracted from CPE */
  version: string
  /** Whether this CPE is marked as vulnerable */
  vulnerable: boolean
}

/**
 * CPE 2.3 URI parsed components
 */
interface CPEComponents {
  vendor: string
  product: string
  version: string
}

/**
 * CPE Search Options
 */
export interface CPESearchOptions {
  /** Enable caching (default: true) */
  useCache?: boolean
  /** Force refresh from database, skip cache */
  forceRefresh?: boolean
}

/**
 * Default limit for search results
 */
const DEFAULT_SEARCH_LIMIT = 100

/**
 * Maximum limit for search results
 */
const MAX_SEARCH_LIMIT = 1000

/** Cache namespace for CPE searches */
const CACHE_NAMESPACE = 'cpe-search'

/**
 * CPESearch class for searching CPE data in the database
 */
export class CPESearch {
  private db: Database
  private cacheManager: CacheManager | null = null

  /**
   * Create a new CPESearch instance
   * @param db - The sql.js Database instance
   * @param options - Optional configuration including cache manager
   */
  constructor(db: Database, options?: { cacheManager?: CacheManager }) {
    if (!db) {
      throw new Error('Database instance is required')
    }
    this.db = db
    this.cacheManager = options?.cacheManager || null
  }

  /**
   * Initialize cache manager
   */
  async initializeCache(): Promise<void> {
    if (!this.cacheManager) {
      this.cacheManager = getCacheManager({
        maxSizeMB: 10,
        ttlMs: 24 * 60 * 60 * 1000, // 24 hours
        enabled: true,
      })
      await this.cacheManager.initialize(this.db)
    }
  }

  /**
   * Set custom cache manager
   */
  setCacheManager(cacheManager: CacheManager): void {
    this.cacheManager = cacheManager
  }

  /**
   * Get cache manager
   */
  getCacheManager(): CacheManager | null {
    return this.cacheManager
  }

  /**
   * Clear the cache for this namespace
   */
  clearCache(): number {
    if (this.cacheManager) {
      return this.cacheManager.clear(CACHE_NAMESPACE)
    }
    return 0
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    if (!this.cacheManager) return null
    const namespaceStats = this.cacheManager.getNamespaceStats()
    return namespaceStats[CACHE_NAMESPACE] || null
  }

  /**
   * Generate cache key for search
   */
  private getCacheKey(method: string, ...args: (string | number | undefined)[]): string {
    return `${method}:${args.filter((a) => a !== undefined).join(':')}`
  }

  /**
   * Search for CPEs by product name with caching support
   * @param productName - Product name to search for
   * @param limit - Maximum number of results (default: 100, max: 1000)
   * @param options - Search options including cache control
   * @returns Array of matching CPE results
   */
  async searchByProductName(
    productName: string,
    limit?: number,
    options?: CPESearchOptions,
  ): Promise<CPESearchResult[]> {
    if (!productName || typeof productName !== 'string') {
      return []
    }

    const useCache = options?.useCache !== false && this.cacheManager !== null
    const forceRefresh = options?.forceRefresh === true

    // Check cache
    if (useCache && !forceRefresh) {
      const cacheKey = this.getCacheKey('productName', productName, limit)
      const cached = this.cacheManager?.get<CPESearchResult[]>(cacheKey, CACHE_NAMESPACE)
      if (cached) {
        return cached
      }
    }

    // Perform search
    const results = await this.searchByProductNameInternal(productName, limit)

    // Cache results
    if (useCache) {
      const cacheKey = this.getCacheKey('productName', productName, limit)
      this.cacheManager?.set(cacheKey, results, CACHE_NAMESPACE)
    }

    return results
  }

  /**
   * Internal implementation of search by product name
   */
  private async searchByProductNameInternal(productName: string, limit?: number): Promise<CPESearchResult[]> {
    const sanitizedProduct = sanitizeSqlInput(productName.toLowerCase())
    if (!sanitizedProduct) {
      return []
    }

    const actualLimit = Math.min(limit || DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
    const pattern = `%${escapeLikePattern(sanitizedProduct)}%`

    const query = `
      SELECT DISTINCT cpe23_uri, vulnerable
      FROM cpe_matches
      WHERE cpe23_uri LIKE ?
        AND vulnerable = 1
      ORDER BY cpe23_uri
      LIMIT ?
    `

    const results = this.db.exec(query, [pattern, actualLimit])

    return this.parseSearchResults(results)
  }

  /**
   * Search for CPEs by multiple tokens (each token must match)
   * @param tokens - Array of search tokens
   * @param limit - Maximum number of results (default: 100, max: 1000)
   * @returns Array of matching CPE results
   */
  async searchByTokens(tokens: string[], limit?: number): Promise<CPESearchResult[]> {
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return []
    }

    // Sanitize and filter tokens
    const sanitizedTokens = tokens
      .map((token) => sanitizeSqlInput(token.toLowerCase()))
      .filter((token) => token && token.length > 0)

    if (sanitizedTokens.length === 0) {
      return []
    }

    const actualLimit = Math.min(limit || DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)

    // Build dynamic WHERE clause for multiple tokens
    const whereConditions = sanitizedTokens.map(() => 'cpe23_uri LIKE ?').join(' AND ')
    const likePatterns = sanitizedTokens.map((token) => `%${escapeLikePattern(token)}%`)

    const query = `
      SELECT DISTINCT cpe23_uri, vulnerable
      FROM cpe_matches
      WHERE ${whereConditions}
        AND vulnerable = 1
      ORDER BY cpe23_uri
      LIMIT ?
    `

    const results = this.db.exec(query, [...likePatterns, actualLimit])

    return this.parseSearchResults(results)
  }

  /**
   * Parse a CPE 2.3 URI and extract components
   * CPE 2.3 format: cpe:2.3:part:vendor:product:version:update:edition:language:sw_edition:target_sw:target_hw:other
   *
   * @param uri - The CPE 2.3 URI to parse
   * @returns Object with vendor, product, version or null if invalid
   */
  parseCPE23Uri(uri: string): CPEComponents | null {
    if (!uri || typeof uri !== 'string') {
      return null
    }

    // Validate CPE 2.3 format
    if (!uri.startsWith('cpe:2.3:')) {
      return null
    }

    // Split by colon to get components
    // cpe:2.3:part:vendor:product:version:...
    const parts = uri.split(':')

    // We need at least 6 parts for vendor, product, version
    // Index: 0=cpe, 1=2.3, 2=part, 3=vendor, 4=product, 5=version
    if (parts.length < 6) {
      return null
    }

    const vendor = this.decodeCPEValue(parts[3])
    const product = this.decodeCPEValue(parts[4])
    const version = this.decodeCPEValue(parts[5])

    return {
      vendor,
      product,
      version,
    }
  }

  /**
   * Get all unique product names from CPE database
   * @returns Array of unique product names
   */
  async getAllUniqueProducts(): Promise<string[]> {
    const query = `
      SELECT DISTINCT cpe23_uri
      FROM cpe_matches
      WHERE cpe23_uri IS NOT NULL
        AND cpe23_uri LIKE 'cpe:2.3:%'
        AND vulnerable = 1
      ORDER BY cpe23_uri
    `

    const results = this.db.exec(query)
    const products = new Set<string>()

    if (results.length > 0 && results[0].values) {
      for (const row of results[0].values) {
        const uri = row[0] as string
        const parsed = this.parseCPE23Uri(uri)
        if (parsed && parsed.product) {
          products.add(parsed.product)
        }
      }
    }

    return Array.from(products).sort()
  }

  /**
   * Get all unique vendors for a specific product
   * @param product - Product name to find vendors for
   * @returns Array of vendor names
   */
  async getProductVendors(product: string): Promise<string[]> {
    if (!product || typeof product !== 'string') {
      return []
    }

    const sanitizedProduct = sanitizeSqlInput(product.toLowerCase())
    if (!sanitizedProduct) {
      return []
    }

    // Search in the product position (4th colon-separated field)
    const pattern = `cpe:2.3:%:%:${escapeLikePattern(sanitizedProduct)}%:%`

    const query = `
      SELECT DISTINCT cpe23_uri
      FROM cpe_matches
      WHERE cpe23_uri LIKE ?
        AND vulnerable = 1
      ORDER BY cpe23_uri
    `

    const results = this.db.exec(query, [pattern])
    const vendors = new Set<string>()

    if (results.length > 0 && results[0].values) {
      for (const row of results[0].values) {
        const uri = row[0] as string
        const parsed = this.parseCPE23Uri(uri)
        if (parsed && parsed.vendor) {
          vendors.add(parsed.vendor)
        }
      }
    }

    return Array.from(vendors).sort()
  }

  /**
   * Parse database results into CPESearchResult array
   * @param results - Raw database results
   * @returns Array of CPESearchResult
   */
  private parseSearchResults(results: Array<{ values: Array<Array<unknown>> }>): CPESearchResult[] {
    const searchResults: CPESearchResult[] = []

    if (results.length === 0 || !results[0].values) {
      return searchResults
    }

    for (const row of results[0].values) {
      const uri = row[0] as string
      const vulnerable = row[1] === 1

      const parsed = this.parseCPE23Uri(uri)
      if (parsed) {
        searchResults.push({
          cpe23Uri: uri,
          vendor: parsed.vendor,
          product: parsed.product,
          version: parsed.version,
          vulnerable,
        })
      }
    }

    return searchResults
  }

  /**
   * Decode CPE value (handle escaped characters)
   * In CPE 2.3, certain characters are escaped with backslash
   *
   * @param value - The CPE component value to decode
   * @returns Decoded value
   */
  private decodeCPEValue(value: string): string {
    if (!value) {
      return ''
    }

    // Handle common CPE escaping
    // In CPE 2.3, these characters can be escaped: \ : . ? * ( ) [ ] { } - _
    // For simplicity, we'll handle the backslash escaping
    return value.replace(/\\:/g, ':').replace(/\\\./g, '.').replace(/\\_/g, '_').replace(/\\-/g, '-')
  }
}

/**
 * Create a CPESearch instance
 * @param db - The sql.js Database instance
 * @returns CPESearch instance
 */
export function createCPESearch(db: Database): CPESearch {
  return new CPESearch(db)
}
