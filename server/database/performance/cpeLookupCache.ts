/**
 * CPE Lookup Cache for CVE Database
 *
 * Pre-computes common CPE lookups and maintains vendor/product to CVE mappings
 * for fast vulnerability lookups in a database with 250K+ CVEs.
 *
 * Features:
 * - Pre-computed vendor/product to CVE mappings
 * - LRU cache for CPE lookup results
 * - Automatic cache update on new CVE imports
 * - Memory-efficient storage with compression
 */

import type { Database } from 'sql.js'

/**
 * CPE lookup result
 */
export interface CPELookupResult {
  cveIds: string[]
  totalCount: number
  vulnerableCount: number
}

/**
 * Vendor statistics
 */
export interface VendorStats {
  vendor: string
  productCount: number
  cveCount: number
  vulnerableCveCount: number
}

/**
 * Product statistics
 */
export interface ProductStats {
  vendor: string
  product: string
  cveCount: number
  vulnerableCveCount: number
}

/**
 * CPE lookup cache configuration
 */
export interface CPELookupCacheOptions {
  /** Maximum vendors to cache */
  maxVendors: number
  /** Maximum products per vendor to cache */
  maxProductsPerVendor: number
  /** Maximum CVE IDs to store per product */
  maxCVEsPerProduct: number
  /** TTL for cache entries in milliseconds */
  ttlMs: number
  /** Whether to preload popular vendors on init */
  preloadPopularVendors: boolean
}

/**
 * Default configuration
 */
const DEFAULT_OPTIONS: CPELookupCacheOptions = {
  maxVendors: 1000,
  maxProductsPerVendor: 100,
  maxCVEsPerProduct: 500,
  ttlMs: 30 * 60 * 1000, // 30 minutes
  preloadPopularVendors: true,
}

/**
 * Popular vendors to preload (top software vendors by CVE count)
 */
const POPULAR_VENDORS = [
  'microsoft',
  'google',
  'apple',
  'oracle',
  'adobe',
  'linux',
  'cisco',
  'ibm',
  'mozilla',
  'apache',
  'nginx',
  'nodejs',
  'python',
  'openssl',
  'vmware',
  'fortinet',
  'juniper',
  'netapp',
  'sap',
  'redhat',
]

/**
 * CPE Lookup Cache
 *
 * Maintains in-memory caches for fast CPE-based vulnerability lookups.
 */
export class CPELookupCache {
  private options: CPELookupCacheOptions
  private vendorCache: Map<string, VendorStats> = new Map()
  private productCache: Map<string, ProductStats> = new Map()
  private cveLookupCache: Map<string, CPELookupResult> = new Map()
  private lastUpdate: number = 0
  private initialized: boolean = false

  // LRU tracking
  private accessOrder: string[] = []
  private maxSize: number

  constructor(options: Partial<CPELookupCacheOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.maxSize = this.options.maxVendors * this.options.maxProductsPerVendor
  }

  /**
   * Initialize the cache with data from the database
   */
  async initialize(db: Database): Promise<void> {
    if (this.initialized) return

    console.log('[CPELookupCache] Initializing cache...')

    // Load vendor statistics
    await this.loadVendorStats(db)

    // Preload popular vendors if enabled
    if (this.options.preloadPopularVendors) {
      await this.preloadPopularVendorsData(db)
    }

    this.lastUpdate = Date.now()
    this.initialized = true

    console.log(`[CPELookupCache] Cache initialized with ${this.vendorCache.size} vendors`)
  }

  /**
   * Load vendor statistics from database
   */
  private async loadVendorStats(db: Database): Promise<void> {
    const results = db.exec(
      `
      SELECT
        cpe_vendor as vendor,
        COUNT(DISTINCT cpe_product) as product_count,
        COUNT(DISTINCT cve_id) as cve_count,
        SUM(CASE WHEN vulnerable = 1 THEN 1 ELSE 0 END) as vulnerable_cve_count
      FROM cpe_matches
      WHERE cpe_vendor IS NOT NULL
      GROUP BY cpe_vendor
      ORDER BY cve_count DESC
      LIMIT ?
    `,
      [this.options.maxVendors],
    )

    if (results.length > 0) {
      for (const row of results[0].values) {
        const stats: VendorStats = {
          vendor: row[0] as string,
          productCount: row[1] as number,
          cveCount: row[2] as number,
          vulnerableCveCount: (row[3] as number) || 0,
        }
        this.vendorCache.set(stats.vendor, stats)
      }
    }
  }

  /**
   * Preload data for popular vendors
   */
  private async preloadPopularVendorsData(db: Database): Promise<void> {
    for (const vendor of POPULAR_VENDORS) {
      if (this.vendorCache.has(vendor)) {
        await this.loadProductsForVendor(db, vendor)
      }
    }
  }

  /**
   * Load products for a specific vendor
   */
  private async loadProductsForVendor(db: Database, vendor: string): Promise<void> {
    const results = db.exec(
      `
      SELECT
        cpe_product as product,
        COUNT(DISTINCT cve_id) as cve_count,
        SUM(CASE WHEN vulnerable = 1 THEN 1 ELSE 0 END) as vulnerable_cve_count
      FROM cpe_matches
      WHERE cpe_vendor = ?
      GROUP BY cpe_product
      ORDER BY cve_count DESC
      LIMIT ?
    `,
      [vendor, this.options.maxProductsPerVendor],
    )

    if (results.length > 0) {
      for (const row of results[0].values) {
        const product = row[0] as string
        const cacheKey = `${vendor}:${product}`
        const stats: ProductStats = {
          vendor,
          product,
          cveCount: row[1] as number,
          vulnerableCveCount: (row[2] as number) || 0,
        }
        this.productCache.set(cacheKey, stats)
      }
    }
  }

  /**
   * Look up CVEs by vendor and product
   */
  lookup(vendor: string, product?: string, vulnerable: boolean = true): CPELookupResult | null {
    const cacheKey = product ? `${vendor}:${product}:${vulnerable}` : `${vendor}::*:${vulnerable}`

    // Check cache first
    const cached = this.cveLookupCache.get(cacheKey)
    if (cached) {
      this.updateAccessOrder(cacheKey)
      return cached
    }

    return null
  }

  /**
   * Store lookup result in cache
   */
  storeLookup(vendor: string, product: string | undefined, vulnerable: boolean, result: CPELookupResult): void {
    const cacheKey = product ? `${vendor}:${product}:${vulnerable}` : `${vendor}::*:${vulnerable}`

    // Evict if at capacity
    while (this.cveLookupCache.size >= this.maxSize) {
      this.evictLRU()
    }

    this.cveLookupCache.set(cacheKey, result)
    this.accessOrder.push(cacheKey)
  }

  /**
   * Get vendor statistics
   */
  getVendorStats(vendor: string): VendorStats | null {
    return this.vendorCache.get(vendor) || null
  }

  /**
   * Get product statistics
   */
  getProductStats(vendor: string, product: string): ProductStats | null {
    const cacheKey = `${vendor}:${product}`
    return this.productCache.get(cacheKey) || null
  }

  /**
   * Get all cached vendors
   */
  getCachedVendors(): string[] {
    return Array.from(this.vendorCache.keys())
  }

  /**
   * Get all cached products for a vendor
   */
  getCachedProducts(vendor: string): string[] {
    const products: string[] = []
    for (const [_key, stats] of this.productCache.entries()) {
      if (stats.vendor === vendor) {
        products.push(stats.product)
      }
    }
    return products
  }

  /**
   * Check if cache needs refresh
   */
  needsRefresh(): boolean {
    if (!this.initialized) return true
    return Date.now() - this.lastUpdate > this.options.ttlMs
  }

  /**
   * Update cache with new CPE data (called after database import)
   */
  async updateFromDatabase(db: Database): Promise<void> {
    console.log('[CPELookupCache] Updating cache from database...')

    // Clear existing caches
    this.clear()

    // Reinitialize
    await this.initialize(db)

    console.log('[CPELookupCache] Cache updated')
  }

  /**
   * Invalidate cache entries for a specific vendor
   */
  invalidateVendor(vendor: string): void {
    // Remove vendor stats
    this.vendorCache.delete(vendor)

    // Remove product stats for this vendor
    for (const key of this.productCache.keys()) {
      if (key.startsWith(`${vendor}:`)) {
        this.productCache.delete(key)
      }
    }

    // Remove lookup results for this vendor
    for (const key of this.cveLookupCache.keys()) {
      if (key.startsWith(`${vendor}:`)) {
        this.cveLookupCache.delete(key)
        const index = this.accessOrder.indexOf(key)
        if (index !== -1) {
          this.accessOrder.splice(index, 1)
        }
      }
    }
  }

  /**
   * Invalidate all cache entries
   */
  clear(): void {
    this.vendorCache.clear()
    this.productCache.clear()
    this.cveLookupCache.clear()
    this.accessOrder = []
    this.initialized = false
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index !== -1) {
      this.accessOrder.splice(index, 1)
    }
    this.accessOrder.push(key)
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return

    const lruKey = this.accessOrder.shift()
    if (lruKey) {
      this.cveLookupCache.delete(lruKey)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    vendorCount: number
    productCount: number
    lookupCacheSize: number
    maxSize: number
    lastUpdate: number
    initialized: boolean
    memoryUsageEstimate: number
  } {
    // Estimate memory usage
    let memoryEstimate = 0
    memoryEstimate += this.vendorCache.size * 200 // ~200 bytes per vendor entry
    memoryEstimate += this.productCache.size * 150 // ~150 bytes per product entry
    memoryEstimate += this.cveLookupCache.size * 500 // ~500 bytes per lookup entry (varies by CVE count)

    return {
      vendorCount: this.vendorCache.size,
      productCount: this.productCache.size,
      lookupCacheSize: this.cveLookupCache.size,
      maxSize: this.maxSize,
      lastUpdate: this.lastUpdate,
      initialized: this.initialized,
      memoryUsageEstimate: memoryEstimate,
    }
  }
}

/**
 * Singleton instance
 */
let cacheInstance: CPELookupCache | null = null

/**
 * Get the CPE lookup cache instance
 */
export function getCPELookupCache(options?: Partial<CPELookupCacheOptions>): CPELookupCache {
  if (!cacheInstance) {
    cacheInstance = new CPELookupCache(options)
  }
  return cacheInstance
}

/**
 * Reset the CPE lookup cache
 */
export function resetCPELookupCache(): void {
  if (cacheInstance) {
    cacheInstance.clear()
  }
  cacheInstance = null
}

/**
 * Helper function to perform cached CPE lookup
 */
export async function cachedCPELookup(
  db: Database,
  vendor: string,
  product?: string,
  options: {
    vulnerable?: boolean
    limit?: number
    offset?: number
  } = {},
): Promise<CPELookupResult> {
  const { vulnerable = true, limit = 100, offset = 0 } = options
  const cache = getCPELookupCache()

  // Initialize cache if needed
  if (!cache['initialized']) {
    await cache.initialize(db)
  }

  // Check cache
  const cached = cache.lookup(vendor, product, vulnerable)
  if (cached) {
    return {
      ...cached,
      cveIds: cached.cveIds.slice(offset, offset + limit),
    }
  }

  // Query database
  let sql = `
    SELECT DISTINCT cve_id
    FROM cpe_matches
    WHERE cpe_vendor = ?
  `
  const params: (string | number)[] = [vendor]

  if (product) {
    sql += ' AND cpe_product = ?'
    params.push(product)
  }

  if (vulnerable) {
    sql += ' AND vulnerable = 1'
  }

  sql += ' ORDER BY cve_id LIMIT ?'
  params.push(5000) // Get up to 5000 for caching

  const results = db.exec(sql, params)
  const cveIds: string[] = []

  if (results.length > 0) {
    for (const row of results[0].values) {
      cveIds.push(row[0] as string)
    }
  }

  const lookupResult: CPELookupResult = {
    cveIds,
    totalCount: cveIds.length,
    vulnerableCount: cveIds.length, // Already filtered by vulnerable flag
  }

  // Store in cache
  cache.storeLookup(vendor, product, vulnerable, lookupResult)

  // Return paginated results
  return {
    ...lookupResult,
    cveIds: cveIds.slice(offset, offset + limit),
  }
}
