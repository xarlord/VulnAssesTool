import type { Component, Vulnerability } from '@@/types'
import { queryByPurls } from './osv'
import { VULN_SEARCH_CPE_LIMIT, VULN_SEARCH_NAME_LIMIT } from '@@/constants'
import { getPlatform } from '@/lib/platform'

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
      cvssVector: cve.cvssVector,
      cwes: [],
      description: cve.description,
      references: [],
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
      cvssVector: cve.cvssVector,
      cwes: [],
      description: cve.description,
      references: [],
      affectedComponents: [],
      publishedAt: cve.publishedAt ? new Date(cve.publishedAt) : undefined,
      modifiedAt: cve.modifiedAt ? new Date(cve.modifiedAt) : undefined,
    }))
  } catch (error) {
    console.error(`[VulnMatcher] Failed to search local NVD for name ${componentName}:`, error)
    return []
  }
}

/**
 * Match component to vulnerabilities using local NVD database and OSV
 *
 * **CPE-Prioritized Matching Strategy:**
 * 1. Priority 1: Use CPE-based search if component has CPE (most accurate)
 * 2. Priority 2: Use high-confidence suggested CPEs if available (>= 80% confidence)
 * 3. Priority 3: Fall back to name-based search (least accurate)
 *
 * **IMPORTANT: OSV Behavior in Electron Environment**
 *
 * In Electron, OSV API queries are conditionally disabled because:
 * 1. The renderer process runs in a web context subject to CORS restrictions
 * 2. Direct API calls to osv.dev from the renderer are blocked by browser security
 * 3. Unlike NVD (which uses local database), OSV requires live API calls
 *
 * OSV is only queried when:
 * - Running in a non-Electron environment (e.g., pure web app)
 * - OR when a proper API proxy is configured to bypass CORS
 *
 * For Electron users, vulnerability coverage is provided by:
 * - Local NVD database (comprehensive CVE data)
 * - Periodic database syncs to keep data current
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

  // ============================================================
  // PRIORITY 1: CPE-based search (most accurate)
  // ============================================================
  if (component.cpe) {
    try {
      const nvdVulns = await searchLocalNvdByCpe(component.cpe)
      for (const vuln of nvdVulns) {
        if (!seenIds.has(vuln.id)) {
          vulnerabilities.push({ ...vuln, affectedComponents: [component.id] })
          seenIds.add(vuln.id)
        }
      }

      // If CPE search returned results, use them exclusively (most accurate)
      if (nvdVulns.length > 0) {
        console.log(`[VulnMatcher] Found ${nvdVulns.length} vulns for ${component.name} via CPE: ${component.cpe}`)
      } else {
        // CPE search returned no results, try fallback text search by name
        const fallbackVulns = await searchLocalNvdByName(component.name, component.cpe)
        for (const vuln of fallbackVulns) {
          if (!seenIds.has(vuln.id)) {
            vulnerabilities.push({ ...vuln, affectedComponents: [component.id] })
            seenIds.add(vuln.id)
          }
        }
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
          for (const vuln of nvdVulns) {
            if (!seenIds.has(vuln.id)) {
              vulnerabilities.push({ ...vuln, affectedComponents: [component.id] })
              seenIds.add(vuln.id)
            }
          }
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
      for (const vuln of fallbackVulns) {
        if (!seenIds.has(vuln.id)) {
          vulnerabilities.push({ ...vuln, affectedComponents: [component.id] })
          seenIds.add(vuln.id)
        }
      }
    }
  }
  // ============================================================
  // PRIORITY 3: Name-based fallback (least accurate)
  // ============================================================
  else if (component.name) {
    const fallbackVulns = await searchLocalNvdByName(component.name)
    for (const vuln of fallbackVulns) {
      if (!seenIds.has(vuln.id)) {
        vulnerabilities.push({ ...vuln, affectedComponents: [component.id] })
        seenIds.add(vuln.id)
      }
    }
  }

  // Try PURL matching with OSV
  // NOTE: In Electron environment, this is conditionally skipped to avoid CORS issues.
  // See the function documentation above for details on OSV behavior.
  // OSV queries are enabled when NOT running in Electron (no electronAPI.database available)
  if (component.purl && typeof window !== 'undefined' && getPlatform()?.database) {
    try {
      const osvResults = await queryByPurls([component.purl])
      const osvVulns = osvResults.get(component.purl) || []
      for (const vuln of osvVulns) {
        if (!seenIds.has(vuln.id)) {
          vulnerabilities.push({ ...vuln, affectedComponents: [component.id] })
          seenIds.add(vuln.id)
        }
      }
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
 * **IMPORTANT: OSV Behavior in Electron Environment**
 *
 * OSV is only queried when NOT running in Electron (no electronAPI.database available).
 * See matchVulnerabilitiesForComponent documentation for details.
 *
 * @param components - Array of components to find vulnerabilities for
 * @param _nvdApiKey - Optional NVD API key (not used, kept for API compatibility)
 * @returns Map of component ID to array of vulnerabilities
 */
export async function matchVulnerabilitiesForComponents(
  components: Component[],
  _nvdApiKey?: string,
): Promise<Map<string, Vulnerability[]>> {
  const resultMap = new Map<string, Vulnerability[]>()
  const vulnerabilityMap = new Map<string, Vulnerability>()

  // Initialize result map
  for (const component of components) {
    resultMap.set(component.id, [])
  }

  // Process each component with CPE-prioritized matching
  for (const component of components) {
    let foundVulns = false

    // ============================================================
    // PRIORITY 1: CPE-based search (most accurate)
    // ============================================================
    if (component.cpe) {
      try {
        let vulns = await searchLocalNvdByCpe(component.cpe)

        // If CPE search returned results, use them exclusively (most accurate)
        if (vulns.length > 0) {
          foundVulns = true
          console.log(`[VulnMatcher] Batch: Found ${vulns.length} vulns for ${component.name} via CPE`)
        } else if (component.name) {
          // CPE search returned no results, try fallback text search by name
          vulns = await searchLocalNvdByName(component.name, component.cpe)
        }

        for (const vuln of vulns) {
          if (!vulnerabilityMap.has(vuln.id)) {
            vulnerabilityMap.set(vuln.id, { ...vuln, affectedComponents: [] })
          }
          const entry = vulnerabilityMap.get(vuln.id)
          if (entry) entry.affectedComponents.push(component.id)
        }
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
        console.log(
          `[VulnMatcher] Batch: Using ${highConfidenceCpes.length} high-confidence suggested CPEs for ${component.name}`,
        )
        for (const suggestedCpe of highConfidenceCpes) {
          try {
            const vulns = await searchLocalNvdByCpe(suggestedCpe.cpe)
            for (const vuln of vulns) {
              if (!vulnerabilityMap.has(vuln.id)) {
                vulnerabilityMap.set(vuln.id, { ...vuln, affectedComponents: [] })
              }
              const entry = vulnerabilityMap.get(vuln.id)
              if (entry) entry.affectedComponents.push(component.id)
              foundVulns = true
            }
            // If we found results from a high-confidence CPE, stop searching
            if (vulns.length > 0) {
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
          for (const vuln of vulns) {
            if (!vulnerabilityMap.has(vuln.id)) {
              vulnerabilityMap.set(vuln.id, { ...vuln, affectedComponents: [] })
            }
            const entry = vulnerabilityMap.get(vuln.id)
            if (entry) entry.affectedComponents.push(component.id)
          }
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
        const vulns = await searchLocalNvdByName(component.name)
        for (const vuln of vulns) {
          if (!vulnerabilityMap.has(vuln.id)) {
            vulnerabilityMap.set(vuln.id, { ...vuln, affectedComponents: [] })
          }
          const entry = vulnerabilityMap.get(vuln.id)
          if (entry) entry.affectedComponents.push(component.id)
        }
      } catch (error) {
        console.error(`[VulnMatcher] Failed to search local NVD for name ${component.name}:`, error)
      }
    }
  }

  // Query OSV by PURLs
  // NOTE: Only runs when NOT in Electron environment to avoid CORS issues.
  // See matchVulnerabilitiesForComponent documentation for details.
  if (typeof window === 'undefined' || !getPlatform()?.database) {
    const purls = components.filter((c) => c.purl).map((c) => c.purl as string)
    try {
      const osvResults = await queryByPurls(purls)
      for (const component of components) {
        if (component.purl) {
          const vulns = osvResults.get(component.purl) || []
          for (const vuln of vulns) {
            if (!vulnerabilityMap.has(vuln.id)) {
              vulnerabilityMap.set(vuln.id, { ...vuln, affectedComponents: [] })
            }
            const entry = vulnerabilityMap.get(vuln.id)
            if (entry) entry.affectedComponents.push(component.id)
          }
        }
      }
    } catch (error) {
      console.error('[VulnMatcher] Failed to query OSV:', error)
    }
  }

  // Populate result map
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
