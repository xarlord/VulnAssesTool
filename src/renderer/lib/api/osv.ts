import type { OsvVulnerability, Vulnerability } from '@@/types'
import { OSV_API_BASE_URL, HIGH_SCORE_THRESHOLD, MEDIUM_SCORE_THRESHOLD, CRITICAL_SCORE_THRESHOLD } from '@@/constants'
import { getCveById } from './nvd'

/**
 * Extract CVSS score from a CVSS vector string or numeric score.
 * OSV severity.score can be:
 * - A numeric string like "6.5"
 * - A CVSS vector string like "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"
 *
 * For vector strings, we estimate severity based on the impact metrics.
 */
function extractCvssScore(scoreString: string): number | null {
  // First, try direct numeric parsing
  const numericScore = parseFloat(scoreString)
  if (!isNaN(numericScore) && numericScore >= 0 && numericScore <= 10) {
    return numericScore
  }

  // Check if it's a CVSS vector string
  if (scoreString.startsWith('CVSS:')) {
    // Parse CVSS vector to estimate score
    // We'll use a simplified approach based on Confidentiality, Integrity, Availability impacts
    const vector = scoreString.toUpperCase()

    // Extract impact metrics (C, I, A values)
    const cMatch = vector.match(/\/C:([HML])/)
    const iMatch = vector.match(/\/I:([HML])/)
    const aMatch = vector.match(/\/A:([HML])/)

    // Extract exploitability metrics
    const avMatch = vector.match(/\/AV:([NALP])/)
    const acMatch = vector.match(/\/AC:([LHM])/)
    const prMatch = vector.match(/\/PR:([NLH])/)
    const uiMatch = vector.match(/\/UI:([NR])/)
    const sMatch = vector.match(/\/S:([UC])/)

    // Map values to numbers for calculation
    const impactValues: Record<string, number> = { H: 0.56, M: 0.22, L: 0.0 }

    // Separate exploitability values by metric to avoid key collisions
    const avValues: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }
    const acValues: Record<string, number> = { L: 0.77, H: 0.44 }
    const prValues: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 }
    const uiValues: Record<string, number> = { N: 0.85, R: 0.62 }

    const c = cMatch ? (impactValues[cMatch[1]] ?? 0) : 0
    const i = iMatch ? (impactValues[iMatch[1]] ?? 0) : 0
    const a = aMatch ? (impactValues[aMatch[1]] ?? 0) : 0

    const av = avMatch ? (avValues[avMatch[1]] ?? 0.5) : 0.5
    const ac = acMatch ? (acValues[acMatch[1]] ?? 0.5) : 0.5
    const pr = prMatch ? (prValues[prMatch[1]] ?? 0.5) : 0.5
    const ui = uiMatch ? (uiValues[uiMatch[1]] ?? 0.5) : 0.5
    const scopeChanged = sMatch?.[1] === 'C'

    // Calculate Impact Sub-Score (ISS)
    const iss = 1 - (1 - c) * (1 - i) * (1 - a)

    // Calculate Impact
    let impact: number
    if (scopeChanged) {
      impact = 7.52 * (iss - 0.029) - 3.25 * (iss - 0.02) ** 15
    } else {
      impact = iss * 6.42
    }

    // Calculate Exploitability
    const exploitability = 8.22 * av * ac * pr * ui

    // Calculate Base Score
    let baseScore: number
    if (impact <= 0) {
      baseScore = 0
    } else if (scopeChanged) {
      baseScore = Math.min(10, 1.08 * (impact + exploitability))
    } else {
      baseScore = Math.min(10, impact + exploitability)
    }

    // Round to 1 decimal place
    return Math.round(baseScore * 10) / 10
  }

  return null
}

/**
 * Get severity level from CVSS score
 */
function getSeverityFromScore(score: number): Vulnerability['severity'] {
  if (score >= CRITICAL_SCORE_THRESHOLD) return 'critical'
  if (score >= HIGH_SCORE_THRESHOLD) return 'high'
  if (score >= MEDIUM_SCORE_THRESHOLD) return 'medium'
  if (score > 0) return 'low'
  return 'none'
}

/**
 * Convert OSV vulnerability to internal Vulnerability type
 * Optionally enriched with NVD data if CVE alias exists
 */
async function convertOsvVulnerabilityToVulnerability(
  osvVuln: OsvVulnerability,
  nvdApiKey?: string,
): Promise<Vulnerability> {
  // Extract OSV references first (needed for potential merging)
  const osvReferences = (osvVuln.references || []).map((ref) => ({
    source: 'OSV',
    url: ref.url,
    tags: ref.type ? [ref.type] : [],
  }))

  // Determine severity from severity data if available
  let severity: Vulnerability['severity'] = 'none'
  let cvssScore: number | undefined
  let cvssVector: string | undefined

  if (osvVuln.severity && osvVuln.severity.length > 0) {
    // Try each severity entry, preferring CVSS_V3 over others
    const sortedSeverity = [...osvVuln.severity].sort((a, b) => {
      if (a.type === 'CVSS_V3' && b.type !== 'CVSS_V3') return -1
      if (a.type !== 'CVSS_V3' && b.type === 'CVSS_V3') return 1
      return 0
    })

    for (const severityData of sortedSeverity) {
      const score = extractCvssScore(severityData.score)
      if (score !== null) {
        cvssScore = score
        severity = getSeverityFromScore(score)
        // Store the vector if it was a vector string
        if (severityData.score.startsWith('CVSS:')) {
          cvssVector = severityData.score
        }
        break
      }
    }
  }

  // Extract CVE aliases for potential database lookup
  const cveAliases = osvVuln.aliases?.filter((alias) => alias.startsWith('CVE-')) || []

  // Extract affected package information
  const affectedPackage = osvVuln.affected[0]
  const purl = affectedPackage?.package.purl

  // Try to get NVD data for the first CVE alias if available
  // This makes NVD the primary source when both exist
  let primaryId = osvVuln.id
  let primarySource: Vulnerability['source'] = 'osv'
  let sources: Vulnerability['source'][] = ['osv']
  let finalSeverity = severity
  let finalCvssScore = cvssScore
  let finalCvssVector = cvssVector
  let finalDescription: string
  let finalReferences = osvReferences
  let finalCwes: string[] | undefined
  let finalPublishedAt = osvVuln.published ? new Date(osvVuln.published) : undefined
  let finalModifiedAt = new Date(osvVuln.modified)

  // If there's a CVE alias, try to fetch NVD data to use as primary
  if (cveAliases.length > 0 && nvdApiKey) {
    const primaryCve = cveAliases[0] // Use first CVE as primary
    try {
      const nvdVuln = await getCveById(primaryCve, nvdApiKey)
      if (nvdVuln) {
        // Use NVD data as primary
        primaryId = nvdVuln.id
        primarySource = 'nvd'
        sources = ['nvd', 'osv']
        finalSeverity = nvdVuln.severity
        finalCvssScore = nvdVuln.cvssScore
        finalCvssVector = nvdVuln.cvssVector
        finalCwes = nvdVuln.cwes
        finalPublishedAt = nvdVuln.publishedAt
        finalModifiedAt = nvdVuln.modifiedAt || new Date(osvVuln.modified)

        // Use NVD description as primary, fall back to OSV
        finalDescription = nvdVuln.description || osvVuln.summary || osvVuln.details

        // Merge references from both sources (NVD first, then OSV)
        finalReferences = [
          ...nvdVuln.references,
          ...osvReferences.filter((r) => !nvdVuln.references.some((nr) => nr.url === r.url)),
        ]
      } else {
        // NVD lookup failed, use OSV data
        finalDescription = osvVuln.summary || osvVuln.details
      }
    } catch (error) {
      // NVD lookup failed, continue with OSV data
      console.warn(`Failed to fetch NVD data for ${primaryCve}:`, error)
      finalDescription = osvVuln.summary || osvVuln.details
    }
  } else {
    // No CVE alias or no API key, use OSV data
    finalDescription = osvVuln.summary || osvVuln.details
  }

  return {
    id: primaryId,
    source: primarySource,
    sources,
    severity: finalSeverity,
    cvssScore: finalCvssScore,
    cvssVector: finalCvssVector,
    cwes: finalCwes,
    description: finalDescription,
    references: finalReferences,
    affectedComponents: purl ? [purl] : [],
    publishedAt: finalPublishedAt,
    modifiedAt: finalModifiedAt,
    // Store OSV ID as alias when NVD is primary
    aliases: primarySource === 'nvd' ? [osvVuln.id, ...cveAliases.filter((c) => c !== primaryId)] : cveAliases,
  }
}

/**
 * Query OSV API by package URL
 * @param purl - The package URL to query
 * @param nvdApiKey - Optional NVD API key for CVE enrichment
 * @returns Array of vulnerabilities
 */
export async function queryByPurl(purl: string, nvdApiKey?: string): Promise<Vulnerability[]> {
  const url = new URL(`${OSV_API_BASE_URL}/query`)
  const requestBody = {
    package: {
      purl,
    },
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new Error(`OSV API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    const vulns: OsvVulnerability[] = data.vulns || []
    // Convert vulnerabilities, enriching with NVD data when available
    const convertedVulns = await Promise.all(
      vulns.map((vuln) => convertOsvVulnerabilityToVulnerability(vuln, nvdApiKey)),
    )
    return convertedVulns
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to query OSV by PURL: ${error.message}`)
    }
    throw error
  }
}

/**
 * Get a specific vulnerability by ID
 * @param vulnId - The OSV vulnerability ID
 * @param nvdApiKey - Optional NVD API key for CVE enrichment
 * @returns The vulnerability or null if not found
 */
export async function getVulnerabilityById(vulnId: string, nvdApiKey?: string): Promise<Vulnerability | null> {
  const url = new URL(`${OSV_API_BASE_URL}/vulns/${vulnId}`)

  try {
    const response = await fetch(url.toString())

    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      throw new Error(`OSV API error: ${response.status} ${response.statusText}`)
    }

    const vuln: OsvVulnerability = await response.json()
    return convertOsvVulnerabilityToVulnerability(vuln, nvdApiKey)
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get OSV vulnerability by ID: ${error.message}`)
    }
    throw error
  }
}

/**
 * Query OSV API by multiple package URLs (batch query)
 * @param purls - Array of package URLs to query
 * @param nvdApiKey - Optional NVD API key for CVE enrichment
 * @returns Map of PURL to array of vulnerabilities
 */
export async function queryByPurls(purls: string[], nvdApiKey?: string): Promise<Map<string, Vulnerability[]>> {
  const resultMap = new Map<string, Vulnerability[]>()

  // Initialize map with empty arrays
  for (const purl of purls) {
    resultMap.set(purl, [])
  }

  // Query each PURL
  for (const purl of purls) {
    try {
      const vulns = await queryByPurl(purl, nvdApiKey)
      resultMap.set(purl, vulns)
    } catch (error) {
      // Log error but continue with other PURLs
      console.error(`Failed to query OSV for PURL ${purl}:`, error)
      resultMap.set(purl, [])
    }
  }

  return resultMap
}

/**
 * Batch query OSV API with a single request
 * Note: OSV API supports batch queries with multiple packages
 * @param purls - Array of package URLs
 * @param nvdApiKey - Optional NVD API key for CVE enrichment
 * @returns Array of all vulnerabilities found
 */
export async function batchQuery(purls: string[], nvdApiKey?: string): Promise<Vulnerability[]> {
  const allVulnerabilities: Vulnerability[] = []
  const uniqueVulns = new Map<string, Vulnerability>()

  for (const purl of purls) {
    try {
      const vulns = await queryByPurl(purl, nvdApiKey)
      for (const vuln of vulns) {
        uniqueVulns.set(vuln.id, vuln)
      }
    } catch (error) {
      console.error(`Failed to query OSV for PURL ${purl}:`, error)
    }
  }

  // Convert map to array
  allVulnerabilities.push(...Array.from(uniqueVulns.values()))

  return allVulnerabilities
}

/**
 * Parse package URL to extract ecosystem and name
 * @param purl - The package URL string
 * @returns Object with ecosystem and package name
 */
export function parsePurl(purl: string): { ecosystem: string; name: string; version?: string } | null {
  // PURL format: pkg:type/namespace/name@version?qualifiers
  // Example: pkg:npm/lodash@4.17.21
  // Example: pkg:npm/@babel/core@7.23.0
  const purlRegex = /^pkg:([^/]+)\/((?:@[^/]+\/)?[^@]+)(?:@([^?]+))?/
  const match = purl.match(purlRegex)

  if (!match) {
    return null
  }

  return {
    ecosystem: match[1],
    name: match[2],
    version: match[3],
  }
}

/**
 * Build a package URL from components
 * @param ecosystem - The package ecosystem (e.g., "npm", "pypi")
 * @param name - The package name
 * @param version - Optional version
 * @returns The package URL string
 */
export function buildPurl(ecosystem: string, name: string, version?: string): string {
  let purl = `pkg:${ecosystem}/${name}`
  if (version) {
    purl += `@${version}`
  }
  return purl
}

/**
 * Validate package URL format
 * @param purl - The package URL string
 * @returns true if valid
 */
export function isValidPurl(purl: string): boolean {
  return parsePurl(purl) !== null
}

/**
 * Check if OSV API is accessible
 * @returns true if API is accessible
 */
export async function checkOsvApiStatus(): Promise<boolean> {
  try {
    // Try to get a known vulnerability
    await getVulnerabilityById('OSV-2024-1234')
    // Even if the vulnerability doesn't exist (returns null), the API is working
    return true
  } catch {
    return false
  }
}
