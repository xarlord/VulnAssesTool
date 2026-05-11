/**
 * CPE Matcher Service
 *
 * Provides functionality for matching components to CPE (Common Platform Enumeration) identifiers.
 * This enables vulnerability lookups in the NVD database for components that don't have a CPE.
 *
 * @module cpeMatcher
 */

/**
 * Result of a CPE matching operation
 */
export interface CPEMatchResult {
  /** Full CPE 2.3 URI */
  cpe: string
  /** Extracted vendor */
  vendor: string
  /** Extracted product */
  product: string
  /** Extracted version */
  version: string
  /** Confidence score (0-100) */
  confidence: number
  /** Type of match performed */
  matchType: 'exact' | 'token' | 'fuzzy'
}

/**
 * Input component for CPE matching
 */
export interface ComponentInput {
  /** Unique identifier */
  id: string
  /** Component name */
  name: string
  /** Component version */
  version: string
}

/**
 * Parsed CPE structure
 */
export interface ParsedCPE {
  /** CPE format version */
  part: 'a' | 'o' | 'h'
  /** Vendor name */
  vendor: string
  /** Product name */
  product: string
  /** Version string */
  version: string
  /** Full CPE URI */
  uri: string
}

/**
 * Internal CPE database for known mappings
 */
const KNOWN_CPE_MAPPINGS: Record<string, { vendor: string; product: string }> = {
  // JavaScript/Node.js packages
  lodash: { vendor: 'lodash', product: 'lodash' },
  express: { vendor: 'expressjs', product: 'express' },
  react: { vendor: 'facebook', product: 'react' },
  angular: { vendor: 'google', product: 'angular' },
  vue: { vendor: 'vuejs', product: 'vue' },
  webpack: { vendor: 'webpack.js.org', product: 'webpack' },
  typescript: { vendor: 'microsoft', product: 'typescript' },
  axios: { vendor: 'axios', product: 'axios' },
  moment: { vendor: 'momentjs', product: 'moment' },
  jquery: { vendor: 'jquery', product: 'jquery' },
  nextjs: { vendor: 'vercel', product: 'next.js' },
  'next.js': { vendor: 'vercel', product: 'next.js' },

  // Python packages
  django: { vendor: 'djangoproject', product: 'django' },
  flask: { vendor: 'palletsprojects', product: 'flask' },
  numpy: { vendor: 'numpy', product: 'numpy' },
  pandas: { vendor: 'pandas', product: 'pandas' },
  requests: { vendor: 'psf', product: 'requests' },
  tensorflow: { vendor: 'google', product: 'tensorflow' },
  pytorch: { vendor: 'pytorch', product: 'pytorch' },

  // Java libraries
  spring: { vendor: 'vmware', product: 'spring_framework' },
  'spring-boot': { vendor: 'vmware', product: 'spring_boot' },
  'spring-framework': { vendor: 'vmware', product: 'spring_framework' },
  hibernate: { vendor: 'redhat', product: 'hibernate_orm' },
  jackson: { vendor: 'fasterxml', product: 'jackson-databind' },
  log4j: { vendor: 'apache', product: 'log4j' },
  'log4j-core': { vendor: 'apache', product: 'log4j' },
  tomcat: { vendor: 'apache', product: 'tomcat' },
  'apache-tomcat': { vendor: 'apache', product: 'tomcat' },

  // Common libraries
  openssl: { vendor: 'openssl', product: 'openssl' },
  curl: { vendor: 'haxx', product: 'curl' },
  zlib: { vendor: 'zlib', product: 'zlib' },
  sqlite: { vendor: 'sqlite', product: 'sqlite' },
  postgresql: { vendor: 'postgresql', product: 'postgresql' },
  mysql: { vendor: 'oracle', product: 'mysql' },
  redis: { vendor: 'redis', product: 'redis' },
  nginx: { vendor: 'nginx', product: 'nginx' },
  'apache-httpd': { vendor: 'apache', product: 'http_server' },
  'apache-http-server': { vendor: 'apache', product: 'http_server' },
  httpd: { vendor: 'apache', product: 'http_server' },
}

/**
 * Common suffixes to remove from product names
 */
const COMMON_SUFFIXES = [
  'library',
  'lib',
  'component',
  'module',
  'package',
  'framework',
  'sdk',
  'api',
  'core',
  'common',
  'utils',
  'utilities',
  'helper',
  'tools',
  'service',
  'client',
  'server',
  'plugin',
  'extension',
  'adapter',
  'wrapper',
]

/**
 * CPE Matcher class for finding CPE identifiers for components
 */
export class CPEMatcher {
  private cpeDatabase: Map<string, ParsedCPE>

  constructor() {
    this.cpeDatabase = new Map()
    this.initializeKnownCPEs()
  }

  /**
   * Initialize known CPE mappings
   */
  private initializeKnownCPEs(): void {
    for (const [name, mapping] of Object.entries(KNOWN_CPE_MAPPINGS)) {
      const cpe: ParsedCPE = {
        part: 'a',
        vendor: mapping.vendor,
        product: mapping.product,
        version: '*',
        uri: `cpe:2.3:a:${mapping.vendor}:${mapping.product}:*:*:*:*:*:*:*`,
      }
      this.cpeDatabase.set(name.toLowerCase(), cpe)
    }
  }

  /**
   * Find matching CPEs for a component
   * @param component - Component input with name and version
   * @returns Promise resolving to array of CPE match results
   */
  async findCPEs(component: ComponentInput): Promise<CPEMatchResult[]> {
    const results: CPEMatchResult[] = []
    const { product, version } = this.normalizeInput(component.name)
    const componentVersion = component.version || version

    // Step 1: Check for exact match in known mappings
    const exactMatch = this.findExactMatch(component.name, componentVersion)
    if (exactMatch) {
      results.push(exactMatch)
    }

    // Step 2: Find token-based matches
    const tokenMatches = this.findTokenMatches(component.name, componentVersion, product)
    for (const match of tokenMatches) {
      if (!results.some((r) => r.cpe === match.cpe)) {
        results.push(match)
      }
    }

    // Step 3: Generate fuzzy matches
    const fuzzyMatches = this.findFuzzyMatches(component.name, componentVersion, product)
    for (const match of fuzzyMatches) {
      if (!results.some((r) => r.cpe === match.cpe)) {
        results.push(match)
      }
    }

    // Sort by confidence (highest first)
    results.sort((a, b) => b.confidence - a.confidence)

    return results
  }

  /**
   * Normalize input name to extract product and version
   * @param name - Raw component name
   * @returns Normalized product name and extracted version
   */
  normalizeInput(name: string): { product: string; version: string } {
    let product = name.toLowerCase().trim()
    let version = ''

    // Step 1: Extract version using regex
    const versionRegex = /(\d+\.\d+\.\d+|\d+\.\d+|\d+)/
    const versionMatch = product.match(versionRegex)
    if (versionMatch) {
      version = versionMatch[1]
      product = product.replace(versionMatch[0], '').trim()
    }

    // Step 2: Remove common suffixes
    for (const suffix of COMMON_SUFFIXES) {
      const suffixRegex = new RegExp(`[-_\\s]${suffix}$`, 'i')
      product = product.replace(suffixRegex, '')
    }

    // Step 3: Clean up special characters
    product = product.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()

    return { product, version }
  }

  /**
   * Tokenize a name into searchable tokens
   * @param name - Name to tokenize
   * @returns Array of tokens
   */
  tokenize(name: string): string[] {
    return name
      .toLowerCase()
      .replace(/[-_.]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1 && !COMMON_SUFFIXES.includes(token))
  }

  /**
   * Calculate confidence score for a CPE match
   * @param input - Original component input
   * @param cpe - Parsed CPE to evaluate
   * @returns Confidence score (0-100)
   */
  calculateConfidence(input: ComponentInput, cpe: ParsedCPE): number {
    let score = 0

    // Version exact match: +40 points
    if (input.version && cpe.version !== '*') {
      if (input.version === cpe.version) {
        score += 40
      } else if (cpe.version.startsWith(input.version) || input.version.startsWith(cpe.version)) {
        // Version partial match: +20 points
        score += 20
      }
    } else if (input.version && cpe.version === '*') {
      // Version unknown in CPE, give partial credit
      score += 10
    }

    // Get normalized product name
    const { product } = this.normalizeInput(input.name)

    // Exact product match: +10 points
    if (product === cpe.product.toLowerCase()) {
      score += 10
    }

    // Product similarity (Levenshtein): 0-30 points
    const similarity = this.calculateSimilarity(product, cpe.product.toLowerCase())
    score += Math.round(similarity * 30)

    // Token overlap: 0-20 points
    const inputTokens = this.tokenize(input.name)
    const cpeTokens = this.tokenize(cpe.product)
    const tokenOverlap = this.calculateTokenOverlap(inputTokens, cpeTokens)
    score += Math.round(tokenOverlap * 20)

    return Math.min(100, score)
  }

  /**
   * Calculate Levenshtein distance between two strings
   * @param a - First string
   * @param b - Second string
   * @returns Edit distance
   */
  levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = []

    // Initialize matrix
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j
    }

    // Fill matrix
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost, // substitution
        )
      }
    }

    return matrix[a.length][b.length]
  }

  /**
   * Parse a CPE URI string into structured data
   * @param cpeUri - CPE 2.3 URI string
   * @returns Parsed CPE or null if invalid
   */
  parseCPE(cpeUri: string): ParsedCPE | null {
    // CPE 2.3 format: cpe:2.3:part:vendor:product:version:update:edition:language:sw_edition:target_sw:target_hw:other
    // Split by colon and parse manually to handle escaped colons properly
    if (!cpeUri || !cpeUri.startsWith('cpe:2.3:')) {
      return null
    }

    // Split the CPE string, being careful about escaped colons
    const parts: string[] = []
    let current = ''
    let escaped = false

    for (const char of cpeUri) {
      if (escaped) {
        current += char
        escaped = false
      } else if (char === '\\') {
        current += char
        escaped = true
      } else if (char === ':') {
        parts.push(current)
        current = ''
      } else {
        current += char
      }
    }
    parts.push(current)

    // Validate we have enough parts (prefix + 11 components)
    if (parts.length < 7) {
      return null
    }

    const part = parts[2] // a, o, or h
    if (part !== 'a' && part !== 'o' && part !== 'h') {
      return null
    }

    return {
      part: part as 'a' | 'o' | 'h',
      vendor: this.unescapeCPE(parts[3] || '*'),
      product: this.unescapeCPE(parts[4] || '*'),
      version: this.unescapeCPE(parts[5] || '*'),
      uri: cpeUri,
    }
  }

  /**
   * Build a CPE URI from components
   */
  private buildCPE(vendor: string, product: string, version: string): string {
    const escapedVendor = this.escapeCPE(vendor)
    const escapedProduct = this.escapeCPE(product)
    const escapedVersion = version || '*'

    return `cpe:2.3:a:${escapedVendor}:${escapedProduct}:${escapedVersion}:*:*:*:*:*:*:*`
  }

  /**
   * Escape special characters for CPE
   */
  private escapeCPE(str: string): string {
    return str
      .toLowerCase()
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/\*/g, '\\*')
      .replace(/\?/g, '\\?')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/-/g, '_')
      .replace(/\s+/g, '_')
  }

  /**
   * Unescape CPE special characters
   */
  private unescapeCPE(str: string): string {
    return str
      .replace(/\\:/g, ':')
      .replace(/\\\*/g, '*')
      .replace(/\\\?/g, '?')
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\')
      .replace(/_/g, '-')
  }

  /**
   * Calculate similarity between two strings (0-1)
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1
    if (a.length === 0 || b.length === 0) return 0

    const distance = this.levenshteinDistance(a, b)
    const maxLength = Math.max(a.length, b.length)
    return 1 - distance / maxLength
  }

  /**
   * Calculate token overlap ratio (0-1)
   */
  private calculateTokenOverlap(tokens1: string[], tokens2: string[]): number {
    if (tokens1.length === 0 || tokens2.length === 0) return 0

    const set1 = new Set(tokens1)
    const set2 = new Set(tokens2)

    let overlap = 0
    for (const token of set1) {
      if (set2.has(token)) {
        overlap++
      }
    }

    return overlap / Math.max(set1.size, set2.size)
  }

  /**
   * Find exact match in known CPE database
   */
  private findExactMatch(name: string, version: string): CPEMatchResult | null {
    const normalizedName = name.toLowerCase().trim()
    const knownCPE = this.cpeDatabase.get(normalizedName)

    if (knownCPE) {
      const cpeUri = this.buildCPE(knownCPE.vendor, knownCPE.product, version)

      return {
        cpe: cpeUri,
        vendor: knownCPE.vendor,
        product: knownCPE.product,
        version,
        confidence: 95,
        matchType: 'exact',
      }
    }

    return null
  }

  /**
   * Find matches based on token overlap
   */
  private findTokenMatches(name: string, version: string, _normalizedProduct: string): CPEMatchResult[] {
    const results: CPEMatchResult[] = []
    const inputTokens = this.tokenize(name)

    for (const [_key, cpe] of this.cpeDatabase) {
      const cpeTokens = this.tokenize(cpe.product)
      const overlap = this.calculateTokenOverlap(inputTokens, cpeTokens)

      if (overlap >= 0.5) {
        const cpeUri = this.buildCPE(cpe.vendor, cpe.product, version)

        const confidence = Math.round(50 + overlap * 30)

        results.push({
          cpe: cpeUri,
          vendor: cpe.vendor,
          product: cpe.product,
          version,
          confidence,
          matchType: 'token',
        })
      }
    }

    return results
  }

  /**
   * Find fuzzy matches using Levenshtein distance
   */
  private findFuzzyMatches(name: string, version: string, normalizedProduct: string): CPEMatchResult[] {
    const results: CPEMatchResult[] = []

    for (const [_key, cpe] of this.cpeDatabase) {
      const similarity = this.calculateSimilarity(normalizedProduct, cpe.product.toLowerCase())

      if (similarity >= 0.6) {
        const cpeUri = this.buildCPE(cpe.vendor, cpe.product, version)
        const confidence = Math.round(30 + similarity * 40)

        results.push({
          cpe: cpeUri,
          vendor: cpe.vendor,
          product: cpe.product,
          version,
          confidence,
          matchType: 'fuzzy',
        })
      }
    }

    // If no matches found, generate a fallback CPE
    if (results.length === 0 && normalizedProduct.length > 0) {
      const vendor = normalizedProduct.split(/\s+/)[0] || normalizedProduct
      const cpeUri = this.buildCPE(vendor, normalizedProduct.replace(/\s+/g, '_'), version)

      results.push({
        cpe: cpeUri,
        vendor,
        product: normalizedProduct.replace(/\s+/g, '_'),
        version,
        confidence: 20,
        matchType: 'fuzzy',
      })
    }

    return results
  }
}

// Export singleton instance
export const cpeMatcher = new CPEMatcher()
