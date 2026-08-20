/**
 * Intelligence Enrichment Service
 *
 * Enriches vulnerability data with KEV and EPSS intelligence.
 * Used after vulnerability matching to add exploit intelligence.
 *
 * @module enrichVulnerabilities
 */

import type { Vulnerability } from '@@/types'
import type { KevEntry } from '@@/types/ipc'
import { getPlatform } from '@/lib/platform'
import { calculateRiskScore, type Severity } from '../riskScore'

/**
 * Enrichment options
 */
export interface EnrichmentOptions {
  includeKev?: boolean
  includeEpss?: boolean
  includeRiskScore?: boolean
  onProgress?: (message: string) => void
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
  options: EnrichmentOptions = {},
): Promise<Vulnerability> {
  // Merge with defaults: a default parameter is replaced wholesale by any explicit
  // argument, so callers passing a partial object (e.g. just { onProgress }) would
  // otherwise leave every include* flag undefined and silently disable enrichment.
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const enriched = { ...vuln }

  try {
    // Fetch KEV status
    if (opts.includeKev && !vuln.isKev) {
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
    if (opts.includeEpss && vuln.epssPercentile === undefined) {
      const epssResponse = await getPlatform().intelligence.getEpssScore(vuln.id)
      if (epssResponse.success && epssResponse.score) {
        enriched.epssScore = epssResponse.score.score
        enriched.epssPercentile = epssResponse.score.percentile
      }
    }

    // Calculate risk score
    if (opts.includeRiskScore) {
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
  options: EnrichmentOptions = {},
): Promise<Vulnerability[]> {
  if (vulnerabilities.length === 0) {
    return vulnerabilities
  }

  // Merge with defaults: a default parameter is replaced wholesale by any explicit
  // argument, so callers passing a partial object (e.g. useProjectScan's { onProgress })
  // would otherwise leave every include* flag undefined and silently disable enrichment.
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const cveIds = vulnerabilities.map((v) => v.id)

  // Batch fetch EPSS scores for efficiency
  const epssScores: Map<string, { score: number; percentile: number }> = new Map()
  if (opts.includeEpss) {
    opts.onProgress?.(`Fetching EPSS scores for ${cveIds.length} vulnerabilities...`)
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

  // Batch KEV in ONE request. This used to call checkKev + getKevDetails per CVE inside the
  // Promise.all below, so a 132-CVE scan fired ~264 concurrent requests, blew the server rate
  // limit (300/min) and logged "Too many requests" for most CVEs — KEV flags silently missing.
  const kevResults: Map<string, { isKev: boolean; entry: KevEntry | null }> = new Map()
  if (opts.includeKev) {
    const needKev = vulnerabilities.filter((v) => !v.isKev).map((v) => v.id)
    if (needKev.length > 0) {
      opts.onProgress?.(`Checking KEV status for ${needKev.length} vulnerabilities...`)
      try {
        const response = await getPlatform().intelligence.checkKevBatch(needKev)
        if (response.success) {
          for (const [cveId, result] of Object.entries(response.results)) {
            kevResults.set(cveId, result)
          }
        }
      } catch (error) {
        console.error('[Intelligence] Failed to batch check KEV status:', error)
      }
    }
  }
  const enriched: Vulnerability[] = await Promise.all(
    vulnerabilities.map(async (vuln) => {
      const result = { ...vuln }

      try {
        // Use the pre-fetched KEV result (one batched request for the whole set)
        if (opts.includeKev && !vuln.isKev) {
          const kev = kevResults.get(vuln.id)
          if (kev?.isKev) {
            result.isKev = true
            if (kev.entry) {
              result.kevDetails = kev.entry
            }
          }
        }

        // Use pre-fetched EPSS score
        if (opts.includeEpss && epssScores.has(vuln.id)) {
          const score = epssScores.get(vuln.id)
          if (score) {
            result.epssScore = score.score
            result.epssPercentile = score.percentile
          }
        }

        // Calculate risk score
        if (opts.includeRiskScore) {
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

export const EnrichVulnerabilitiesDefault = {
  enrichVulnerability,
  enrichVulnerabilities,
  enrichVulnerabilityMap,
  sortByRiskScore,
  filterKevOnly,
  filterHighEpss,
}
