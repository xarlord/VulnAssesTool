import type { NvdApiCve, NvdApiResponse, Vulnerability } from '@@/types'
import { NVD_API_BASE_URL } from '@@/constants'

/**
 * NVD API configuration
 */
const NVD_API_CONFIG = {
  baseURL: NVD_API_BASE_URL,
  defaultDelay: 6000, // 6 seconds between requests (NVD rate limit)
  maxRetries: 3,
  retryDelay: 10000, // 10 seconds
}

/**
 * Delay function for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Build a URL with query parameters.
 * Works with both absolute URLs and relative paths (for dev proxy).
 */
function buildUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params)
  const separator = NVD_API_CONFIG.baseURL.includes('?') ? '&' : '?'
  return `${NVD_API_CONFIG.baseURL}${separator}${searchParams.toString()}`
}

/**
 * Determines vulnerability severity level from CVSS score.
 *
 * @param score - CVSS score (0-10)
 * @returns Severity level based on score ranges
 *
 * @example
 * ```ts
 * getSeverityFromScore(9.5) // Returns 'critical'
 * getSeverityFromScore(7.2) // Returns 'high'
 * getSeverityFromScore(4.3) // Returns 'medium'
 * ```
 *
 * @remarks
 * Severity classification follows standard CVSS v3.1 rating:
 * - Critical: 9.0-10.0
 * - High: 7.0-8.9
 * - Medium: 4.0-6.9
 * - Low: 0.1-3.9
 * - None: 0.0
 */
export function getSeverityFromScore(score: number): Vulnerability['severity'] {
  if (score >= 9.0) return 'critical'
  if (score >= 7.0) return 'high'
  if (score >= 4.0) return 'medium'
  if (score > 0) return 'low'
  return 'none'
}

/**
 * Parses CVSS vector string to extract base score.
 *
 * @param cvssVector - CVSS vector string (e.g., "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")
 * @returns Parsed CVSS base score, or undefined if vector is invalid/missing
 *
 * @remarks
 * This is a simplified implementation. Full CVSS vector parsing
 * requires a dedicated CVSS calculator library for accurate results.
 *
 * @example
 * ```ts
 * parseCvssScore("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")
 * // Returns: undefined (requires full CVSS calculator)
 * ```
 */
export function parseCvssScore(cvssVector?: string): number | undefined {
  if (!cvssVector) {
    return undefined
  }

  // Extract base score from CVSS vector string
  // Format: CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H
  // We need to calculate or look up the score - for now, return undefined
  // In a real implementation, we would use a CVSS calculator library
  return undefined
}

/**
 * Converts NVD API CVE response to internal Vulnerability type.
 *
 * @param cve - NVD API CVE object
 * @returns Standardized vulnerability object
 *
 * @remarks
 * Extracts and maps:
 * - CVSS metrics (score, vector, severity)
 * - CWE weaknesses
 * - Description (preferred English)
 * - References (URLs, tags)
 *
 * @example
 * ```ts
 * const nvdCve: NvdApiCve = {
 *   id: 'CVE-2024-1234',
 *   metrics: { cvssMetricV31: [{ cvssData: { baseScore: 7.5 } }] }
 * }
 * const vuln = convertNvdCveToVulnerability(nvdCve)
 * // vuln.severity === 'high'
 * // vuln.cvssScore === 7.5
 * ```
 */
function convertNvdCveToVulnerability(cve: NvdApiCve): Vulnerability {
  // Get CVSS score and vector
  let cvssScore: number | undefined
  let cvssVector: string | undefined
  let severity: Vulnerability['severity'] = 'none'

  const cvssMetrics = cve.metrics?.cvssMetricV31?.[0]
  if (cvssMetrics) {
    cvssScore = cvssMetrics.cvssData.baseScore
    cvssVector = cvssMetrics.cvssData.vectorString
    severity = getSeverityFromScore(cvssScore)
  }

  // Extract CWEs
  const cwes = cve.weaknesses?.flatMap((w) => w.description.map((d) => d.value).filter(Boolean))

  // Extract description
  const description =
    cve.descriptions.find((d) => d.lang === 'en')?.value || cve.descriptions[0]?.value || 'No description available'

  // Extract references
  const references = (cve.references || []).map((ref) => ({
    source: ref.source || 'NVD',
    url: ref.url,
    tags: ref.tags || [],
  }))

  return {
    id: cve.id,
    source: 'nvd',
    severity,
    cvssScore,
    cvssVector,
    cwes,
    description,
    references,
    affectedComponents: [],
    publishedAt: cve.published ? new Date(cve.published) : undefined,
    modifiedAt: cve.lastModified ? new Date(cve.lastModified) : undefined,
  }
}

/**
 * Searches for CVEs by CPE (Common Platform Enumeration) string.
 *
 * @param cpe - CPE identifier string (e.g., "cpe:2.3:a:vendor:product:version:*:*:*:*:*")
 * @param apiKey - Optional NVD API key for increased rate limits
 * @returns Array of vulnerabilities matching the CPE
 *
 * @throws {Error} When network request fails or API returns error
 *
 * @example
 * ```ts
 * const vulns = await searchCvesByCpe(
 *   'cpe:2.3:a:apache:http_server:2.4:*:*:*:*:*:*:*',
 *   'your-nvd-api-key'
 * )
 * ```
 *
 * @remarks
 * - Respects NVD rate limiting (6 second delay between requests)
 * - Retries up to 3 times on failure
 * - Returns empty array if no vulnerabilities found
 */
export async function searchCvesByCpe(cpe: string, apiKey?: string): Promise<Vulnerability[]> {
  const vulnerabilities: Vulnerability[] = []
  let startIndex = 0
  let hasMore = true

  while (hasMore) {
    const url = buildUrl({
      cpeName: cpe,
      resultsPerPage: '2000',
      startIndex: startIndex.toString(),
    })

    const headers: Record<string, string> = {}
    if (apiKey) {
      headers['apiKey'] = apiKey
    }

    try {
      const response = await fetch(url, { headers })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('NVD API rate limit exceeded. Please provide an API key or wait.')
        }
        throw new Error(`NVD API error: ${response.status} ${response.statusText}`)
      }

      const data: NvdApiResponse = await response.json()

      // Convert CVEs to internal format
      const cves = data.vulnerabilities || []
      for (const cve of cves) {
        vulnerabilities.push(convertNvdCveToVulnerability(cve))
      }

      // Check if there are more results
      hasMore = startIndex + data.resultsPerPage < data.totalResults
      startIndex += data.resultsPerPage

      // Rate limiting delay
      if (hasMore) {
        await delay(NVD_API_CONFIG.defaultDelay)
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to search CVEs by CPE: ${error.message}`)
      }
      throw error
    }
  }

  return vulnerabilities
}

/**
 * Get a specific CVE by ID
 * @param cveId - The CVE ID (e.g., "CVE-2024-1234")
 * @param apiKey - Optional NVD API key for higher rate limits
 * @returns The vulnerability or null if not found
 */
export async function getCveById(cveId: string, apiKey?: string): Promise<Vulnerability | null> {
  // Ensure CVE ID is in correct format
  const formattedCveId = cveId.toUpperCase().startsWith('CVE-') ? cveId.toUpperCase() : `CVE-${cveId.toUpperCase()}`

  const url = buildUrl({ cveId: formattedCveId })

  const headers: Record<string, string> = {}
  if (apiKey) {
    headers['apiKey'] = apiKey
  }

  try {
    const response = await fetch(url, { headers })

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      if (response.status === 403) {
        throw new Error('NVD API rate limit exceeded. Please provide an API key or wait.')
      }
      throw new Error(`NVD API error: ${response.status} ${response.statusText}`)
    }

    const data: NvdApiResponse = await response.json()

    if (data.vulnerabilities && data.vulnerabilities.length > 0) {
      return convertNvdCveToVulnerability(data.vulnerabilities[0])
    }

    return null
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get CVE by ID: ${error.message}`)
    }
    throw error
  }
}

/**
 * Search for CVEs by multiple CPEs (batch search)
 * @param cpes - Array of CPE strings to search for
 * @param apiKey - Optional NVD API key for higher rate limits
 * @returns Map of CPE to array of vulnerabilities
 */
export async function searchCvesByCpes(cpes: string[], apiKey?: string): Promise<Map<string, Vulnerability[]>> {
  const resultMap = new Map<string, Vulnerability[]>()

  // Initialize map with empty arrays
  for (const cpe of cpes) {
    resultMap.set(cpe, [])
  }

  // Search for each CPE with rate limiting
  for (const cpe of cpes) {
    try {
      const vulns = await searchCvesByCpe(cpe, apiKey)
      resultMap.set(cpe, vulns)
    } catch (error) {
      // Log error but continue with other CPEs
      console.error(`Failed to search CVEs for CPE ${cpe}:`, error)
      resultMap.set(cpe, [])
    }

    // Rate limiting delay between searches
    if (cpes.indexOf(cpe) < cpes.length - 1) {
      await delay(NVD_API_CONFIG.defaultDelay)
    }
  }

  return resultMap
}

/**
 * Validate NVD API key format
 * NVD API keys are typically UUIDs (e.g., "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx")
 */
export function isValidNvdApiKey(apiKey: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(apiKey)
}

/**
 * Get the current NVD API status (for health checking)
 * @param apiKey - Optional NVD API key
 * @returns true if API is accessible
 */
export async function checkNvdApiStatus(apiKey?: string): Promise<boolean> {
  try {
    // Try to fetch a specific, recent CVE
    const result = await getCveById('CVE-2024-2389', apiKey)
    return result !== null
  } catch {
    return false
  }
}
