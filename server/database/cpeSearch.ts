/**
 * CPE Search Module
 * Provides database search functionality for CPE (Common Platform Enumeration) data
 * Used for software identification and vulnerability matching
 */

import Database from 'better-sqlite3'
import { escapeLikePattern } from './sqlSanitizer.js'
import type { CacheManager } from '../services/CacheManager.js'
import { getCacheManager } from '../services/CacheManager.js'

type BetterDb = InstanceType<typeof Database>

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
  private db: BetterDb
  private cacheManager: CacheManager | null = null
  // Lazily-detected: the indexed cpe_product column exists only after the v2
  // schema migration; older / seed databases fall back to a cpe23_uri substring.
  private cpeProductColumn: boolean | null = null

  /**
   * Create a new CPESearch instance
   * @param db - The Database instance
   * @param options - Optional configuration including cache manager
   */
  constructor(db: BetterDb, options?: { cacheManager?: CacheManager }) {
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

    // Normalize the cache key the same way searchByProductNameInternal normalizes the
    // query, so 'OpenSSL' / 'openssl' / ' openssl ' all resolve to one shared cache entry.
    const cacheKey = this.getCacheKey('productName', productName.toLowerCase().trim().slice(0, 200), limit)

    // Check cache
    if (useCache && !forceRefresh) {
      const cached = this.cacheManager?.get<CPESearchResult[]>(cacheKey, CACHE_NAMESPACE)
      if (cached) {
        return cached
      }
    }

    // Perform search
    const results = await this.searchByProductNameInternal(productName, limit)

    // Cache results
    if (useCache) {
      this.cacheManager?.set(cacheKey, results, CACHE_NAMESPACE)
    }

    return results
  }

  /** Whether the indexed cpe_product column exists (added by the v2 migration). */
  private hasCpeProductColumn(): boolean {
    if (this.cpeProductColumn === null) {
      const cols = this.db.prepare('PRAGMA table_info(cpe_matches)').all() as Array<{ name: string }>
      this.cpeProductColumn = cols.some((c) => c.name === 'cpe_product')
    }
    return this.cpeProductColumn
  }

  /**
   * Internal implementation of search by product name.
   *
   * Precision-first against the indexed `cpe_product` column (exact, then
   * prefix), falling back to a `cpe23_uri` substring only for recall. A bare
   * `%product%` over the whole CPE string over-matches (e.g. `%openssl%` also
   * hits other CPE fields — 278 CVEs vs 261 for the real product), so it is the
   * last resort. The query is fully parameterized, so the SQL-string sanitizer
   * isn't needed and would mangle legitimate product names
   * ("update-alternatives" -> "-alternatives", "update" -> "").
   */
  private async searchByProductNameInternal(productName: string, limit?: number): Promise<CPESearchResult[]> {
    const product = productName.toLowerCase().trim().slice(0, 200)
    if (!product) {
      return []
    }

    const actualLimit = Math.min(limit || DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
    const run = (where: string, param: string): Array<{ cpe23_uri: string; vulnerable: number }> =>
      this.db
        .prepare(
          `SELECT DISTINCT cpe23_uri, vulnerable FROM cpe_matches
           WHERE ${where} AND vulnerable = 1 ORDER BY cpe23_uri LIMIT ?`,
        )
        .all(param, actualLimit) as Array<{ cpe23_uri: string; vulnerable: number }>

    if (this.hasCpeProductColumn()) {
      const exact = run('cpe_product = ?', product)
      if (exact.length > 0) return this.parseSearchResultsFromObjects(exact)

      const prefix = run('cpe_product LIKE ?', `${escapeLikePattern(product)}%`)
      if (prefix.length > 0) return this.parseSearchResultsFromObjects(prefix)
    }

    const fallback = run('cpe23_uri LIKE ?', `%${escapeLikePattern(product)}%`)
    return this.parseSearchResultsFromObjects(fallback)
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

    // Lowercase + trim + drop empties. No sanitizeSqlInput: every token is bound as a `?`
    // parameter below (injection isn't possible), and sanitizeSqlInput would mangle
    // legitimate tokens containing SQL keywords ("update" -> "", "create-react-app" -> ...).
    const queryTokens = tokens.map((token) => token.toLowerCase().trim()).filter((token) => token.length > 0)

    if (queryTokens.length === 0) {
      return []
    }

    const actualLimit = Math.min(limit || DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT)

    // Build dynamic WHERE clause for multiple tokens
    const whereConditions = queryTokens.map(() => 'cpe23_uri LIKE ?').join(' AND ')
    const likePatterns = queryTokens.map((token) => `%${escapeLikePattern(token)}%`)

    const query = `
      SELECT DISTINCT cpe23_uri, vulnerable
      FROM cpe_matches
      WHERE ${whereConditions}
        AND vulnerable = 1
      ORDER BY cpe23_uri
      LIMIT ?
    `

    const results = this.db.prepare(query).all(...likePatterns, actualLimit) as Array<{
      cpe23_uri: string
      vulnerable: number
    }>

    return this.parseSearchResultsFromObjects(results)
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
    // Prefer the indexed parsed column: SQL does the DISTINCT (bounded to the number of
    // distinct products) instead of loading and JS-parsing every cpe23_uri row.
    if (this.hasCpeProductColumn()) {
      const rows = this.db
        .prepare(
          `SELECT DISTINCT cpe_product FROM cpe_matches
           WHERE cpe_product IS NOT NULL AND cpe_product != '' AND vulnerable = 1
           ORDER BY cpe_product`,
        )
        .all() as Array<{ cpe_product: string }>
      return rows.map((r) => r.cpe_product)
    }

    // Fallback for legacy DBs without cpe_product: bound the scan so it can't pull an
    // unbounded number of rows into memory, then parse the product field in JS.
    const results = this.db
      .prepare(
        `SELECT DISTINCT cpe23_uri FROM cpe_matches
         WHERE cpe23_uri IS NOT NULL AND cpe23_uri LIKE 'cpe:2.3:%' AND vulnerable = 1
         ORDER BY cpe23_uri LIMIT ?`,
      )
      .all(MAX_SEARCH_LIMIT) as Array<{ cpe23_uri: string }>
    const products = new Set<string>()

    for (const row of results) {
      const parsed = this.parseCPE23Uri(row.cpe23_uri)
      if (parsed && parsed.product) {
        products.add(parsed.product)
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

    const normalized = product.toLowerCase().trim()
    if (!normalized) {
      return []
    }

    const vendors = new Set<string>()

    if (this.hasCpeProductColumn()) {
      // Match the parsed product field exactly (indexed), not a positional LIKE whose `%`
      // also spans the colon delimiters. Fully parameterized, so no sanitizeSqlInput (which
      // would mangle product names containing SQL keywords).
      const rows = this.db
        .prepare(
          `SELECT DISTINCT cpe_vendor FROM cpe_matches
           WHERE cpe_product = ? AND cpe_vendor IS NOT NULL AND vulnerable = 1
           ORDER BY cpe_vendor`,
        )
        .all(normalized) as Array<{ cpe_vendor: string }>
      for (const row of rows) {
        if (row.cpe_vendor) vendors.add(row.cpe_vendor)
      }
      return Array.from(vendors).sort()
    }

    // Fallback for legacy DBs: a coarse product-position prefix (bounded), then confirm the
    // exact product field in JS — a positional LIKE can't reliably anchor to one colon-field.
    const results = this.db
      .prepare(
        `SELECT DISTINCT cpe23_uri FROM cpe_matches
         WHERE cpe23_uri LIKE ? ESCAPE '\\' AND vulnerable = 1
         ORDER BY cpe23_uri LIMIT ?`,
      )
      .all(`cpe:2.3:%:%:${escapeLikePattern(normalized)}%`, MAX_SEARCH_LIMIT) as Array<{ cpe23_uri: string }>

    for (const row of results) {
      const parsed = this.parseCPE23Uri(row.cpe23_uri)
      if (parsed && parsed.product === normalized && parsed.vendor) {
        vendors.add(parsed.vendor)
      }
    }

    return Array.from(vendors).sort()
  }

  /**
   * Parse database results into CPESearchResult array
   * @param results - Raw database result objects
   * @returns Array of CPESearchResult
   */
  private parseSearchResultsFromObjects(results: Array<{ cpe23_uri: string; vulnerable: number }>): CPESearchResult[] {
    const searchResults: CPESearchResult[] = []

    for (const row of results) {
      const uri = row.cpe23_uri
      const vulnerable = row.vulnerable === 1

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
 * @param db - The Database instance
 * @returns CPESearch instance
 */
export function createCPESearch(db: BetterDb): CPESearch {
  return new CPESearch(db)
}
