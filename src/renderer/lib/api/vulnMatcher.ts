import type { Component, MatchConfidence, Vulnerability, VulnerabilityReference } from '@@/types'
import { queryByPurls } from './osv'
import { VULN_SEARCH_CPE_LIMIT, VULN_SEARCH_NAME_LIMIT, OSV_CACHE_TTL_HOURS } from '@@/constants'
import { getPlatform } from '@/lib/platform'
import { getVulnCache } from '@/lib/cache'

export interface ScanProgressEvent {
  phase: 'nvd-cpe' | 'nvd-name' | 'osv' | 'dedup' | 'done'
  current: number
  total: number
  message: string
}

export type ScanProgressCallback = (event: ScanProgressEvent) => void

/**
 * CPE 2.3 URI string validation and parsing
 * CPE format: cpe:2.3:<part>:<vendor>:<product>:<version>:<update>:<edition>:<language>:<sw_edition>:<target_sw>:<target_hw>:<other>
 *
 * @see https://nvlpubs.nist.gov/nistpubs/Legacy/IR/nistir7695.pdf
 */

/**
 * Validates a CPE 2.3 URI string
 * @param cpe - The CPE string to validate
 * @returns true if the CPE appears to be a valid CPE 2.3 URI
 */
function isValidCpe23Uri(cpe: string): boolean {
  // CPE 2.3 URI must start with cpe:2.3:
  if (!cpe.startsWith('cpe:2.3:')) {
    return false
  }

  // Must have at least 5 parts (cpe:2.3:part:vendor:product)
  const parts = cpe.split(':')
  if (parts.length < 5) {
    return false
  }

  // Part must be one of: a (application), o (operating system), h (hardware)
  const validParts = ['a', 'o', 'h']
  if (!validParts.includes(parts[2])) {
    return false
  }

  return true
}

/**
 * Decodes CPE URL-encoded values
 * CPE 2.3 uses percent-encoding for special characters
 * @param value - The encoded CPE component value
 * @returns The decoded value
 */
function decodeCpeValue(value: string): string {
  try {
    // Decode percent-encoded characters (e.g., %20 -> space, %2F -> /)
    return decodeURIComponent(value)
  } catch {
    // If decoding fails, return original value
    return value
  }
}

/**
 * Extract vendor and product from CPE string with validation and decoding
 * CPE format: cpe:2.3:a:vendor:product:version:...
 *
 * @param cpe - The CPE string to parse
 * @returns Object with vendor and product, or null if CPE is invalid
 */
function extractVendorProductFromCpe(cpe: string): { vendor: string; product: string } | null {
  // Validate CPE format first
  if (!isValidCpe23Uri(cpe)) {
    console.warn(`[VulnMatcher] Invalid CPE format: ${cpe}`)
    return null
  }

  const parts = cpe.split(':')
  if (parts.length < 5) {
    return null
  }

  // Decode the vendor and product values
  const vendor = decodeCpeValue(parts[3])
  const product = decodeCpeValue(parts[4])

  return { vendor, product }
}

/**
 * Search local NVD database by CPE using IPC
 * @param cpe - The CPE string to search for
 * @param limit - Maximum number of results to return (default from constants)
 * @returns Array of vulnerabilities matching the CPE
 */
async function searchLocalNvdByCpe(cpe: string, limit: number = VULN_SEARCH_CPE_LIMIT): Promise<Vulnerability[]> {
  if (typeof window === 'undefined' || !getPlatform()?.database) {
    console.warn('[VulnMatcher] Electron API not available, skipping local database search')
    return []
  }

  // Validate CPE before searching
  if (!isValidCpe23Uri(cpe)) {
    console.warn(`[VulnMatcher] Skipping search for invalid CPE: ${cpe}`)
    return []
  }

  try {
    const response = await getPlatform().database.search({
      type: 'cpe',
      query: cpe,
      limit,
      offset: 0,
    })

    if (!response.success) {
      console.error(`[VulnMatcher] Local NVD search failed: ${response.error}`)
      return []
    }

    // Convert CveResult to Vulnerability format
    return response.results.map((cve) => ({
      id: cve.cveId,
      source: cve.source.toLowerCase() as Vulnerability['source'],
      severity: cve.severity.toLowerCase() as Vulnerability['severity'],
      cvssScore: cve.cvssScore,
      cvssVector: cve.cvssVector ?? undefined,
      cwes: cve.cwes ?? [],
      description: cve.description,
      references: (cve.references ?? []).map(
        (ref): VulnerabilityReference => ({
          source: ref.source ?? cve.source,
          url: ref.url,
          tags: ref.tags,
        }),
      ),
      affectedComponents: [],
      publishedAt: cve.publishedAt ? new Date(cve.publishedAt) : undefined,
      modifiedAt: cve.modifiedAt ? new Date(cve.modifiedAt) : undefined,
    }))
  } catch (error) {
    console.error(`[VulnMatcher] Failed to search local NVD for CPE ${cpe}:`, error)
    return []
  }
}

/**
 * Fallback search by component name when CPE matching returns no results
 * This searches CVE descriptions for the component name
 *
 * @param componentName - The component name to search for
 * @param cpe - Optional CPE string to extract more accurate product name
 * @param limit - Maximum number of results to return (default from constants)
 * @returns Array of vulnerabilities matching the component name
 */
async function searchLocalNvdByName(
  componentName: string,
  cpe?: string,
  limit: number = VULN_SEARCH_NAME_LIMIT,
): Promise<Vulnerability[]> {
  if (typeof window === 'undefined' || !getPlatform()?.database) {
    console.warn('[VulnMatcher] Electron API not available for name search')
    return []
  }

  // Try to extract vendor/product from CPE for more accurate search
  let searchTerm = componentName.toLowerCase()
  if (cpe) {
    const extracted = extractVendorProductFromCpe(cpe)
    if (extracted) {
      // Use product name from CPE which is usually more accurate
      searchTerm = extracted.product.toLowerCase()
    }
  }

  try {
    // Use text search as fallback
    const response = await getPlatform().database.search({
      type: 'text',
      query: searchTerm,
      limit,
      offset: 0,
    })

    if (!response.success) {
      console.warn(`[VulnMatcher] Name search failed: ${response.error}`)
      return []
    }

    // Convert CveResult to Vulnerability format
    return response.results.map((cve) => ({
      id: cve.cveId,
      source: cve.source.toLowerCase() as Vulnerability['source'],
      severity: cve.severity.toLowerCase() as Vulnerability['severity'],
      cvssScore: cve.cvssScore,
      cvssVector: cve.cvssVector ?? undefined,
      cwes: cve.cwes ?? [],
      description: cve.description,
      references: (cve.references ?? []).map(
        (ref): VulnerabilityReference => ({
          source: ref.source ?? cve.source,
          url: ref.url,
          tags: ref.tags,
        }),
      ),
      affectedComponents: [],
      publishedAt: cve.publishedAt ? new Date(cve.publishedAt) : undefined,
      modifiedAt: cve.modifiedAt ? new Date(cve.modifiedAt) : undefined,
    }))
  } catch (error) {
    console.error(`[VulnMatcher] Failed to search local NVD for name ${componentName}:`, error)
    return []
  }
}

const OSV_CACHE_TTL_MS = OSV_CACHE_TTL_HOURS * 60 * 60 * 1000

/**
 * Query OSV for a set of PURLs, serving any already-cached PURL from the shared vuln
 * cache (keyed by `(purl, 'osv')`) and only hitting the OSV proxy for cache misses.
 *
 * Mirrors the NVD-cache convention already used in refreshService.ts so repeated scans
 * or refreshes of an unchanged SBOM do not needlessly re-query OSV's public, rate-limited
 * API within the TTL window (FR-03.3). Misses that return no vulnerabilities are cached as
 * an empty array so an unaffected PURL is not re-queried on every scan either.
 */
async function queryOsvWithCache(purls: string[]): Promise<Map<string, Vulnerability[]>> {
  const cache = getVulnCache()
  const results = new Map<string, Vulnerability[]>()
  const misses: string[] = []

  for (const purl of purls) {
    const cached = cache.get(purl, 'osv')
    if (cached) {
      results.set(purl, cached)
    } else {
      misses.push(purl)
    }
  }

  if (misses.length > 0) {
    const fetched = await queryByPurls(misses)
    for (const purl of misses) {
      const vulns = fetched.get(purl) || []
      cache.set(purl, 'osv', vulns, OSV_CACHE_TTL_MS)
      results.set(purl, vulns)
    }
  }

  return results
}

/**
 * Match component to vulnerabilities using local NVD database and OSV
 *
 * **CPE-Prioritized Matching Strategy:**
 * 1. Priority 1: Use CPE-based search if component has CPE (most accurate)
 * 2. Priority 2: Use high-confidence suggested CPEs if available (>= 80% confidence)
 * 3. Priority 3: Fall back to name-based search (least accurate)
 *
 * **OSV Querying**
 *
 * The browser cannot call osv.dev directly (CORS), so OSV queries go through
 * the Express server's `/api/osv` proxy route (see `queryByPurls` / `OSV_API_BASE_URL`).
 * OSV is queried whenever the platform (the server adapter) is available and the
 * component has a PURL — the same condition the app's platform layer uses for every
 * other server-backed call.
 *
 * @param component - The component to find vulnerabilities for
 * @param _nvdApiKey - Optional NVD API key (not used, kept for API compatibility)
 * @returns Array of vulnerabilities affecting this component
 */
export async function matchVulnerabilitiesForComponent(
  component: Component,
  _nvdApiKey?: string,
): Promise<Vulnerability[]> {
  const vulnerabilities: Vulnerability[] = []
  const seenIds = new Set<string>()

  // Push matches for this component, tagging each with how confidently it was matched so the
  // UI/CLI can de-emphasize name-only matches on unversioned components. First tier to find a CVE
  // wins (tiers run in descending precision), matching the seenIds dedup.
  const pushMatches = (vulns: Vulnerability[], confidence: MatchConfidence): void => {
    for (const vuln of vulns) {
      if (!seenIds.has(vuln.id)) {
        vulnerabilities.push({
          ...vuln,
          affectedComponents: [component.id],
          matchQuality: { [component.id]: confidence },
        })
        seenIds.add(vuln.id)
      }
    }
  }

  // ============================================================
  // PRIORITY 1: CPE-based search (most accurate)
  // ============================================================
  if (component.cpe) {
    try {
      const nvdVulns = await searchLocalNvdByCpe(component.cpe)
      if (nvdVulns.length > 0) {
        // CPE search returned results, use them exclusively (most accurate)
        pushMatches(nvdVulns, 'cpe-exact')
        console.log(`[VulnMatcher] Found ${nvdVulns.length} vulns for ${component.name} via CPE: ${component.cpe}`)
      } else {
        // CPE search returned no results, try fallback text search by name (least precise)
        const fallbackVulns = await searchLocalNvdByName(component.name, component.cpe)
        pushMatches(fallbackVulns, 'name-only')
      }
    } catch (error) {
      console.error(`[VulnMatcher] Failed to search local NVD for CPE ${component.cpe}:`, error)
    }
  }
  // ============================================================
  // PRIORITY 2: High-confidence suggested CPEs
  // ============================================================
  else if (component.suggestedCpes && component.suggestedCpes.length > 0) {
    // Find high-confidence suggested CPEs (>= 80% match score)
    const highConfidenceCpes = component.suggestedCpes.filter((cpe) => cpe.confidence === 'high')

    if (highConfidenceCpes.length > 0) {
      console.log(
        `[VulnMatcher] Using ${highConfidenceCpes.length} high-confidence suggested CPEs for ${component.name}`,
      )
      for (const suggestedCpe of highConfidenceCpes) {
        try {
          const nvdVulns = await searchLocalNvdByCpe(suggestedCpe.cpe)
          pushMatches(nvdVulns, 'cpe-estimated')
          // If we found results from a high-confidence CPE, stop searching
          if (nvdVulns.length > 0) {
            console.log(
              `[VulnMatcher] Found ${nvdVulns.length} vulns for ${component.name} via suggested CPE: ${suggestedCpe.cpe}`,
            )
            break
          }
        } catch (error) {
          console.error(`[VulnMatcher] Failed to search for suggested CPE ${suggestedCpe.cpe}:`, error)
        }
      }
    }

    // If no results from high-confidence CPEs, fall back to name search
    if (vulnerabilities.length === 0 && component.name) {
      const fallbackVulns = await searchLocalNvdByName(component.name)
      pushMatches(fallbackVulns, 'name-only')
    }
  }
  // ============================================================
  // PRIORITY 3: Name-based fallback (least accurate)
  // ============================================================
  else if (component.name) {
    const fallbackVulns = await searchLocalNvdByName(component.name)
    pushMatches(fallbackVulns, 'name-only')
  }

  // Try PURL matching with OSV (a precise, versioned identifier -> high confidence).
  // Queried via the server's `/api/osv` proxy — see the function documentation above.
  if (component.purl && typeof window !== 'undefined' && getPlatform()?.database) {
    try {
      const osvResults = await queryOsvWithCache([component.purl])
      const osvVulns = osvResults.get(component.purl) || []
      pushMatches(osvVulns, 'cpe-exact')
    } catch (error) {
      console.error(`[VulnMatcher] Failed to query OSV for PURL ${component.purl}:`, error)
    }
  }

  return vulnerabilities
}

/**
 * Match multiple components to vulnerabilities in batch using local NVD database
 *
 * **CPE-Prioritized Matching Strategy:**
 * 1. Priority 1: Use CPE-based search if component has CPE (most accurate)
 * 2. Priority 2: Use high-confidence suggested CPEs if available (>= 80% confidence)
 * 3. Priority 3: Fall back to name-based search (least accurate)
 *
 * **OSV Querying**
 *
 * See matchVulnerabilitiesForComponent documentation above for details on how
 * OSV queries are proxied through the Express server.
 *
 * @param components - Array of components to find vulnerabilities for
 * @param _nvdApiKey - Optional NVD API key (not used, kept for API compatibility)
 * @returns Map of component ID to array of vulnerabilities
 */
export async function matchVulnerabilitiesForComponents(
  components: Component[],
  _nvdApiKey?: string,
  onProgress?: ScanProgressCallback,
): Promise<Map<string, Vulnerability[]>> {
  const resultMap = new Map<string, Vulnerability[]>()
  const vulnerabilityMap = new Map<string, Vulnerability>()
  const totalComponents = components.length

  // Upsert a batch of matches for one component, tagging each with how confidently it was matched.
  // matchQuality is keyed by component id and MERGED (never overwritten) so a CVE shared across
  // several components keeps each component's own confidence.
  const recordMatch = (vulns: Vulnerability[], componentId: string, confidence: MatchConfidence): void => {
    for (const vuln of vulns) {
      if (!vulnerabilityMap.has(vuln.id)) {
        vulnerabilityMap.set(vuln.id, { ...vuln, affectedComponents: [], matchQuality: {} })
      }
      const entry = vulnerabilityMap.get(vuln.id)
      if (entry) {
        if (!entry.affectedComponents.includes(componentId)) entry.affectedComponents.push(componentId)
        entry.matchQuality = { ...entry.matchQuality, [componentId]: confidence }
      }
    }
  }

  // Initialize result map
  for (const component of components) {
    resultMap.set(component.id, [])
  }

  // Process each component with CPE-prioritized matching
  let componentIndex = 0
  for (const component of components) {
    componentIndex++
    let foundVulns = false

    // ============================================================
    // PRIORITY 1: CPE-based search (most accurate)
    // ============================================================
    if (component.cpe) {
      try {
        onProgress?.({
          phase: 'nvd-cpe',
          current: componentIndex,
          total: totalComponents,
          message: `Searching NVD by CPE: ${component.name} (${componentIndex}/${totalComponents})`,
        })
        let vulns = await searchLocalNvdByCpe(component.cpe)
        let confidence: MatchConfidence = 'cpe-exact'

        // If CPE search returned results, use them exclusively (most accurate)
        if (vulns.length > 0) {
          foundVulns = true
          console.log(`[VulnMatcher] Batch: Found ${vulns.length} vulns for ${component.name} via CPE`)
        } else if (component.name) {
          // CPE search returned no results, try fallback text search by name (least precise)
          onProgress?.({
            phase: 'nvd-name',
            current: componentIndex,
            total: totalComponents,
            message: `CPE had no results, searching NVD by name: ${component.name}`,
          })
          vulns = await searchLocalNvdByName(component.name, component.cpe)
          confidence = 'name-only'
        }

        recordMatch(vulns, component.id, confidence)
      } catch (error) {
        console.error(`[VulnMatcher] Failed to search local NVD for CPE ${component.cpe}:`, error)
      }
    }
    // ============================================================
    // PRIORITY 2: High-confidence suggested CPEs
    // ============================================================
    else if (component.suggestedCpes && component.suggestedCpes.length > 0) {
      // Find high-confidence suggested CPEs
      const highConfidenceCpes = component.suggestedCpes.filter((cpe) => cpe.confidence === 'high')

      if (highConfidenceCpes.length > 0) {
        onProgress?.({
          phase: 'nvd-cpe',
          current: componentIndex,
          total: totalComponents,
          message: `Trying ${highConfidenceCpes.length} suggested CPEs for ${component.name}`,
        })
        console.log(
          `[VulnMatcher] Batch: Using ${highConfidenceCpes.length} high-confidence suggested CPEs for ${component.name}`,
        )
        for (const suggestedCpe of highConfidenceCpes) {
          try {
            const vulns = await searchLocalNvdByCpe(suggestedCpe.cpe)
            recordMatch(vulns, component.id, 'cpe-estimated')
            // If we found results from a high-confidence CPE, stop searching
            if (vulns.length > 0) {
              foundVulns = true
              console.log(`[VulnMatcher] Batch: Found ${vulns.length} vulns for ${component.name} via suggested CPE`)
              break
            }
          } catch (error) {
            console.error(`[VulnMatcher] Failed to search for suggested CPE ${suggestedCpe.cpe}:`, error)
          }
        }
      }

      // If no results from high-confidence CPEs, fall back to name search
      if (!foundVulns && component.name) {
        try {
          const vulns = await searchLocalNvdByName(component.name)
          recordMatch(vulns, component.id, 'name-only')
        } catch (error) {
          console.error(`[VulnMatcher] Failed to search local NVD for name ${component.name}:`, error)
        }
      }
    }
    // ============================================================
    // PRIORITY 3: Name-based fallback (least accurate)
    // ============================================================
    else if (component.name) {
      try {
        onProgress?.({
          phase: 'nvd-name',
          current: componentIndex,
          total: totalComponents,
          message: `Searching NVD by name: ${component.name} (${componentIndex}/${totalComponents})`,
        })
        const vulns = await searchLocalNvdByName(component.name)
        recordMatch(vulns, component.id, 'name-only')
      } catch (error) {
        console.error(`[VulnMatcher] Failed to search local NVD for name ${component.name}:`, error)
      }
    }
  }

  // Query OSV by PURLs, proxied through the Express server (see
  // matchVulnerabilitiesForComponent documentation above for details).
  if (typeof window !== 'undefined' && getPlatform()?.database) {
    const purls = components.filter((c) => c.purl).map((c) => c.purl as string)
    if (purls.length > 0) {
      onProgress?.({
        phase: 'osv',
        current: 0,
        total: purls.length,
        message: `Querying OSV database for ${purls.length} package URLs...`,
      })
    }
    try {
      const osvResults = await queryOsvWithCache(purls)
      for (const component of components) {
        if (component.purl) {
          const vulns = osvResults.get(component.purl) || []
          // OSV matches by PURL (a precise, versioned identifier) — treat as a high-confidence match.
          recordMatch(vulns, component.id, 'cpe-exact')
        }
      }
    } catch (error) {
      console.error('[VulnMatcher] Failed to query OSV:', error)
    }
  }

  // Populate result map
  onProgress?.({
    phase: 'dedup',
    current: 0,
    total: 0,
    message: `Deduplicating ${vulnerabilityMap.size} unique vulnerabilities across ${components.length} components...`,
  })
  for (const component of components) {
    const componentVulns: Vulnerability[] = []
    for (const vuln of vulnerabilityMap.values()) {
      if (vuln.affectedComponents.includes(component.id)) {
        componentVulns.push(vuln)
      }
    }
    resultMap.set(component.id, componentVulns)
  }

  return resultMap
}

/**
 * Filter vulnerabilities by severity
 * @param vulnerabilities - Array of vulnerabilities
 * @param minSeverity - Minimum severity to include
 * @returns Filtered array of vulnerabilities
 */
export function filterBySeverity(
  vulnerabilities: Vulnerability[],
  minSeverity: Vulnerability['severity'],
): Vulnerability[] {
  const severityOrder: Record<Vulnerability['severity'], number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }

  return vulnerabilities.filter((v) => severityOrder[v.severity] >= severityOrder[minSeverity])
}

/**
 * Filter vulnerabilities by CVSS score
 * @param vulnerabilities - Array of vulnerabilities
 * @param minScore - Minimum CVSS score to include
 * @returns Filtered array of vulnerabilities
 */
export function filterByCvssScore(vulnerabilities: Vulnerability[], minScore: number): Vulnerability[] {
  return vulnerabilities.filter((v) => (v.cvssScore || 0) >= minScore)
}

/**
 * Sort vulnerabilities by severity (most severe first)
 * @param vulnerabilities - Array of vulnerabilities
 * @returns Sorted array of vulnerabilities
 */
export function sortBySeverity(vulnerabilities: Vulnerability[]): Vulnerability[] {
  const severityOrder: Record<Vulnerability['severity'], number> = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }

  return [...vulnerabilities].sort((a, b) => {
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity]
    if (severityDiff !== 0) return severityDiff

    // Secondary sort by CVSS score
    const scoreA = a.cvssScore || 0
    const scoreB = b.cvssScore || 0
    return scoreB - scoreA
  })
}

/**
 * Sort vulnerabilities by CVSS score (highest first); undefined scores sort last (FR-04.1).
 * Non-mutating — returns a new array.
 */
export function sortByCvssScore(vulnerabilities: Vulnerability[]): Vulnerability[] {
  return [...vulnerabilities].sort((a, b) => (b.cvssScore ?? 0) - (a.cvssScore ?? 0))
}

/**
 * Sort vulnerabilities by publication date (most recent first); missing dates sort last (FR-04.1).
 * Non-mutating — returns a new array.
 */
export function sortByPublicationDate(vulnerabilities: Vulnerability[]): Vulnerability[] {
  return [...vulnerabilities].sort((a, b) => {
    const timeA = a.publishedAt ? new Date(a.publishedAt).getTime() : -Infinity
    const timeB = b.publishedAt ? new Date(b.publishedAt).getTime() : -Infinity
    return timeB - timeA
  })
}

/**
 * Get vulnerability statistics
 * @param vulnerabilities - Array of vulnerabilities
 * @returns Object with counts by severity
 */
export function getVulnerabilityStatistics(vulnerabilities: Vulnerability[]): {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  none: number
} {
  return {
    total: vulnerabilities.length,
    critical: vulnerabilities.filter((v) => v.severity === 'critical').length,
    high: vulnerabilities.filter((v) => v.severity === 'high').length,
    medium: vulnerabilities.filter((v) => v.severity === 'medium').length,
    low: vulnerabilities.filter((v) => v.severity === 'low').length,
    none: vulnerabilities.filter((v) => v.severity === 'none').length,
  }
}

/**
 * Check if a component has any critical or high vulnerabilities
 * @param component - The component to check
 * @param vulnerabilities - Array of vulnerabilities
 * @returns true if component has critical or high vulnerabilities
 */
export function hasHighSeverityVulnerabilities(component: Component, vulnerabilities: Vulnerability[]): boolean {
  const componentVulns = vulnerabilities.filter((v) => v.affectedComponents.includes(component.id))
  return componentVulns.some((v) => v.severity === 'critical' || v.severity === 'high')
}
