/**
 * Intelligence Enrichment Service
 *
 * Enriches vulnerability data with KEV and EPSS intelligence.
 * Used after vulnerability matching to add exploit intelligence.
 *
 * @module enrichVulnerabilities
 */

import type { Vulnerability } from '@@/types'
import { getPlatform } from '@/lib/platform'
import { calculateRiskScore, type Severity } from '../riskScore'

/**
 * Enrichment options
 */
export interface EnrichmentOptions {
  /** Include KEV status */
  includeKev?: boolean
  /** Include EPSS scores */
  includeEpss?: boolean
  /** Calculate composite risk score */
  includeRiskScore?: boolean
}

const DEFAULT_OPTIONS: EnrichmentOptions = {
  includeKev: true,
  includeEpss: true,
  includeRiskScore: true,
}

/**
 * Enrich a single vulnerability with intelligence data
 */
export async function enrichVulnerability(
  vuln: Vulnerability,
  options: EnrichmentOptions = DEFAULT_OPTIONS,
): Promise<Vulnerability> {
  const enriched = { ...vuln }

  try {
    // Fetch KEV status
    if (options.includeKev && !vuln.isKev) {
      const kevResponse = await getPlatform().intelligence.checkKev(vuln.id)
      if (kevResponse.success && kevResponse.isKev) {
        enriched.isKev = true
        // Get full KEV details
        const detailsResponse = await getPlatform().intelligence.getKevDetails(vuln.id)
        if (detailsResponse.success && detailsResponse.entry) {
          enriched.kevDetails = detailsResponse.entry
        }
      }
    }

    // Fetch EPSS score
    if (options.includeEpss && vuln.epssPercentile === undefined) {
      const epssResponse = await getPlatform().intelligence.getEpssScore(vuln.id)
      if (epssResponse.success && epssResponse.score) {
        enriched.epssScore = epssResponse.score.score
        enriched.epssPercentile = epssResponse.score.percentile
      }
    }

    // Calculate risk score
    if (options.includeRiskScore) {
      const severity = vuln.severity.toUpperCase() as Severity
      const result = calculateRiskScore({
        isKev: enriched.isKev ?? false,
        epssPercentile: enriched.epssPercentile ?? null,
        severity,
      })
      enriched.riskScore = result.score
    }
  } catch (error) {
    console.error(`[Intelligence] Failed to enrich ${vuln.id}:`, error)
  }

  return enriched
}

/**
 * Enrich multiple vulnerabilities with intelligence data
 * Uses batch EPSS fetching for efficiency
 */
export async function enrichVulnerabilities(
  vulnerabilities: Vulnerability[],
  options: EnrichmentOptions = DEFAULT_OPTIONS,
): Promise<Vulnerability[]> {
  if (vulnerabilities.length === 0) {
    return vulnerabilities
  }

  const cveIds = vulnerabilities.map((v) => v.id)

  // Batch fetch EPSS scores for efficiency
  const epssScores: Map<string, { score: number; percentile: number }> = new Map()
  if (options.includeEpss) {
    try {
      const response = await getPlatform().intelligence.getEpssScores(cveIds)
      if (response.success) {
        for (const [cveId, score] of Object.entries(response.scores)) {
          epssScores.set(cveId, { score: score.score, percentile: score.percentile })
        }
      }
    } catch (error) {
      console.error('[Intelligence] Failed to batch fetch EPSS scores:', error)
    }
  }

  // Batch check KEV status (we need to check each individually, but can parallelize)
  const enriched: Vulnerability[] = await Promise.all(
    vulnerabilities.map(async (vuln) => {
      const result = { ...vuln }

      try {
        // Get KEV status
        if (options.includeKev && !vuln.isKev) {
          const kevResponse = await getPlatform().intelligence.checkKev(vuln.id)
          if (kevResponse.success && kevResponse.isKev) {
            result.isKev = true
            // Get full KEV details
            const detailsResponse = await getPlatform().intelligence.getKevDetails(vuln.id)
            if (detailsResponse.success && detailsResponse.entry) {
              result.kevDetails = detailsResponse.entry
            }
          }
        }

        // Use pre-fetched EPSS score
        if (options.includeEpss && epssScores.has(vuln.id)) {
          const score = epssScores.get(vuln.id)!
          result.epssScore = score.score
          result.epssPercentile = score.percentile
        }

        // Calculate risk score
        if (options.includeRiskScore) {
          const severity = vuln.severity.toUpperCase() as Severity
          const riskResult = calculateRiskScore({
            isKev: result.isKev ?? false,
            epssPercentile: result.epssPercentile ?? null,
            severity,
          })
          result.riskScore = riskResult.score
        }
      } catch (error) {
        console.error(`[Intelligence] Failed to enrich ${vuln.id}:`, error)
      }

      return result
    }),
  )

  return enriched
}

/**
 * Enrich vulnerability map (component ID -> vulnerabilities)
 */
export async function enrichVulnerabilityMap(
  vulnMap: Map<string, Vulnerability[]>,
  options: EnrichmentOptions = DEFAULT_OPTIONS,
): Promise<Map<string, Vulnerability[]>> {
  // Collect all unique vulnerabilities
  const allVulns = new Map<string, Vulnerability>()
  for (const vulns of vulnMap.values()) {
    for (const vuln of vulns) {
      if (!allVulns.has(vuln.id)) {
        allVulns.set(vuln.id, vuln)
      }
    }
  }

  // Enrich all unique vulnerabilities
  const uniqueVulns = Array.from(allVulns.values())
  const enrichedVulns = await enrichVulnerabilities(uniqueVulns, options)

  // Create map of enriched vulnerabilities
  const enrichedMap = new Map<string, Vulnerability>()
  for (const vuln of enrichedVulns) {
    enrichedMap.set(vuln.id, vuln)
  }

  // Rebuild the result map with enriched vulnerabilities
  const resultMap = new Map<string, Vulnerability[]>()
  for (const [componentId, vulns] of vulnMap.entries()) {
    resultMap.set(
      componentId,
      vulns.map((v) => enrichedMap.get(v.id) || v),
    )
  }

  return resultMap
}

/**
 * Sort vulnerabilities by risk score (highest first)
 */
export function sortByRiskScore(vulnerabilities: Vulnerability[]): Vulnerability[] {
  return [...vulnerabilities].sort((a, b) => {
    const scoreA = a.riskScore ?? 0
    const scoreB = b.riskScore ?? 0
    return scoreB - scoreA
  })
}

/**
 * Filter to show only KEV vulnerabilities
 */
export function filterKevOnly(vulnerabilities: Vulnerability[]): Vulnerability[] {
  return vulnerabilities.filter((v) => v.isKev)
}

/**
 * Filter to show only high EPSS percentile (>= 50%)
 */
export function filterHighEpss(vulnerabilities: Vulnerability[], threshold = 0.5): Vulnerability[] {
  return vulnerabilities.filter((v) => v.epssPercentile !== undefined && v.epssPercentile >= threshold)
}

export default {
  enrichVulnerability,
  enrichVulnerabilities,
  enrichVulnerabilityMap,
  sortByRiskScore,
  filterKevOnly,
  filterHighEpss,
}
