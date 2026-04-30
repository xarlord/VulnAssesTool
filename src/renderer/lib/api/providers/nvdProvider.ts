import type {
  NvdApiCve,
  NvdApiResponse,
  Vulnerability,
  VulnerabilitySource,
  ProviderCapabilities,
  PatchInfo,
  PatchLink,
  RemediationAdvice,
  RemediationStep,
} from '@@/types'
import { NVD_API_BASE_URL } from '@@/constants'
import {
  BaseVulnerabilityProvider,
  type PurlQueryOptions,
  type CpeQueryOptions,
  type BatchQueryOptions,
  type VulnerabilityQueryResult,
  type ProviderHealthStatus,
} from './base'
import { parseCvssVector } from '../../cvss/parser'

/**
 * Build a URL with query parameters.
 * Works with both absolute URLs and relative paths (for dev proxy).
 */
function buildUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params)
  const separator = NVD_API_BASE_URL.includes('?') ? '&' : '?'
  return `${NVD_API_BASE_URL}${separator}${searchParams.toString()}`
}

/**
 * NVD Provider Implementation
 */
export class NvdProvider extends BaseVulnerabilityProvider {
  readonly id: VulnerabilitySource = 'nvd'
  readonly name = 'NVD (National Vulnerability Database)'
  readonly baseUrl = NVD_API_BASE_URL
  readonly capabilities: ProviderCapabilities = {
    purlSupport: false,
    cpeSupport: true,
    batchQueries: true,
    patchInfo: true, // NVD provides patch info via reference tags
    cvssVector: true,
    cweData: true,
    exploitStatus: false,
    aliases: false,
  }
  readonly defaultRateLimit = 600 // requests per hour without API key

  /**
   * Determine severity from CVSS score
   */
  private getSeverityFromScore(score: number): Vulnerability['severity'] {
    if (score >= 9.0) return 'critical'
    if (score >= 7.0) return 'high'
    if (score >= 4.0) return 'medium'
    if (score > 0) return 'low'
    return 'none'
  }

  /**
   * Extract CWEs from NVD API response
   */
  private extractCwes(cve: NvdApiCve): string[] | undefined {
    if (!cve.weaknesses || cve.weaknesses.length === 0) {
      return undefined
    }

    const cwes = cve.weaknesses.flatMap((w) => w.description.map((d) => d.value).filter(Boolean))

    return cwes.length > 0 ? cwes : undefined
  }

  /**
   * Extract patch information from NVD reference tags
   *
   * NVD reference tags that indicate patch availability:
   * - "Patch" - Direct link to a patch
   * - "Vendor Advisory" - Vendor has acknowledged/provided fix
   * - "Third Party Advisory" - Third party has info about fix
   * - "Issue Tracking" - May contain patch info in issue discussion
   * - "Release Notes" - May contain fix information
   */
  private extractPatchInfo(cve: NvdApiCve, cvssScore?: number): PatchInfo | undefined {
    const patchLinks: PatchLink[] = []
    const vendorAdvisoryLinks: PatchLink[] = []
    const thirdPartyLinks: PatchLink[] = []
    let hasPatchTag = false
    let hasVendorAdvisory = false

    // Analyze references for patch-related tags
    if (cve.references) {
      for (const ref of cve.references) {
        const tags = ref.tags || []
        // URL content analysis for patch detection

        // Check for Patch tag - highest priority
        if (tags.includes('Patch')) {
          hasPatchTag = true
          patchLinks.push({
            type: this.classifyReferenceUrl(ref.url),
            url: ref.url,
            source: ref.source || 'NVD',
            description: 'Official patch',
          })
        }

        // Check for Vendor Advisory tag
        if (tags.includes('Vendor Advisory')) {
          hasVendorAdvisory = true
          vendorAdvisoryLinks.push({
            type: 'vendor',
            url: ref.url,
            source: ref.source || 'NVD',
            description: 'Vendor advisory',
          })
        }

        // Check for Third Party Advisory
        if (tags.includes('Third Party Advisory')) {
          thirdPartyLinks.push({
            type: 'advisory',
            url: ref.url,
            source: ref.source || 'NVD',
            description: 'Third party advisory',
          })
        }

        // Issue tracking may contain patch info
        if (tags.includes('Issue Tracking')) {
          thirdPartyLinks.push({
            type: 'advisory',
            url: ref.url,
            source: ref.source || 'NVD',
            description: 'Issue tracking',
          })
        }
      }
    }

    // Combine all patch-related links (patches first, then vendor advisories, then third party)
    const allPatchLinks = [...patchLinks, ...vendorAdvisoryLinks, ...thirdPartyLinks]

    // If no patch-related information found, return undefined
    if (allPatchLinks.length === 0) {
      return undefined
    }

    // Determine patch availability status
    const patchAvailability = this.determinePatchAvailability(hasPatchTag, hasVendorAdvisory, patchLinks.length)

    // Generate remediation advice
    const remediationAdvice = this.generateRemediationAdvice(
      hasPatchTag,
      hasVendorAdvisory,
      allPatchLinks,
      cve,
      cvssScore,
    )

    return {
      fixedVersions: [], // NVD doesn't provide specific version info in references
      patchLinks: allPatchLinks,
      remediationAdvice,
      affectedVersionRanges: [], // NVD doesn't provide version ranges in references
      patchAvailability,
    }
  }

  /**
   * Classify reference URL by type
   */
  private classifyReferenceUrl(url: string): PatchLink['type'] {
    const lowerUrl = url.toLowerCase()
    if (lowerUrl.includes('/commit/') || lowerUrl.includes('/commits/')) {
      return 'commit'
    }
    if (lowerUrl.includes('/pull/') || lowerUrl.includes('/pulls/') || lowerUrl.includes('/pr/')) {
      return 'pr'
    }
    if (lowerUrl.includes('/releases/') || lowerUrl.includes('/release/')) {
      return 'release'
    }
    if (lowerUrl.includes('advisory') || lowerUrl.includes('security')) {
      return 'advisory'
    }
    return 'vendor'
  }

  /**
   * Determine patch availability status from NVD tags
   */
  private determinePatchAvailability(
    hasPatchTag: boolean,
    hasVendorAdvisory: boolean,
    patchLinkCount: number,
  ): PatchInfo['patchAvailability'] {
    if (hasPatchTag) {
      return 'available'
    }
    if (hasVendorAdvisory) {
      return 'available' // Vendor advisory typically means a fix is available
    }
    if (patchLinkCount > 0) {
      return 'partial' // Some references available but no explicit patch
    }
    return 'none'
  }

  /**
   * Generate remediation advice for NVD vulnerabilities
   */
  private generateRemediationAdvice(
    hasPatchTag: boolean,
    hasVendorAdvisory: boolean,
    patchLinks: PatchLink[],
    cve: NvdApiCve,
    cvssScore?: number,
  ): RemediationAdvice {
    const steps: RemediationStep[] = []
    let priority: RemediationAdvice['priority'] = 'low'
    let category: RemediationAdvice['category'] = 'monitor'

    // Determine priority based on severity
    if (cvssScore !== undefined) {
      if (cvssScore >= 9.0) priority = 'immediate'
      else if (cvssScore >= 7.0) priority = 'high'
      else if (cvssScore >= 4.0) priority = 'medium'
    }

    if (hasPatchTag) {
      category = 'patch'
      steps.push({
        step: 1,
        action: 'Apply the official patch',
        description: 'A patch is available. Review and apply the patch from the following sources.',
      })

      for (let i = 0; i < patchLinks.length; i++) {
        if (patchLinks[i].description === 'Official patch') {
          steps.push({
            step: i + 2,
            action: `Review patch source`,
            description: patchLinks[i].url,
          })
        }
      }
    } else if (hasVendorAdvisory) {
      category = 'upgrade'
      steps.push({
        step: 1,
        action: 'Review vendor advisory',
        description: 'The vendor has released an advisory. Check for upgrade instructions or patches.',
      })

      const vendorLinks = patchLinks.filter((l) => l.description === 'Vendor advisory')
      for (let i = 0; i < vendorLinks.length; i++) {
        steps.push({
          step: i + 2,
          action: `View vendor advisory`,
          description: vendorLinks[i].url,
        })
      }
    } else {
      category = 'mitigation'
      steps.push({
        step: 1,
        action: 'Review available references',
        description: 'Check the references for information about potential fixes or workarounds.',
      })

      for (let i = 0; i < Math.min(patchLinks.length, 3); i++) {
        steps.push({
          step: i + 2,
          action: `Review ${patchLinks[i].description || 'reference'}`,
          description: patchLinks[i].url,
        })
      }
    }

    return {
      priority,
      category,
      steps,
    }
  }

  /**
   * Convert NVD API CVE to internal Vulnerability type
   */
  private convertNvdCveToVulnerability(cve: NvdApiCve): Vulnerability {
    // Get CVSS score and vector
    let cvssScore: number | undefined
    let cvssVector: string | undefined
    let severity: Vulnerability['severity'] = 'none'
    let cvssBreakdown: any = undefined

    const cvssMetrics = cve.metrics?.cvssMetricV31?.[0]
    if (cvssMetrics) {
      cvssScore = cvssMetrics.cvssData.baseScore
      cvssVector = cvssMetrics.cvssData.vectorString
      severity = this.getSeverityFromScore(cvssScore)

      // Parse CVSS vector for detailed breakdown
      if (cvssVector) {
        cvssBreakdown = parseCvssVector(cvssVector)
      }
    }

    // Extract CWEs
    const cwes = this.extractCwes(cve)

    // Extract description
    const description =
      cve.descriptions.find((d) => d.lang === 'en')?.value || cve.descriptions[0]?.value || 'No description available'

    // Extract references
    const references = (cve.references || []).map((ref) => ({
      source: ref.source || 'NVD',
      url: ref.url,
      tags: ref.tags || [],
    }))

    // Extract patch information from reference tags
    const patchInfo = this.extractPatchInfo(cve, cvssScore)

    return {
      id: cve.id,
      source: 'nvd',
      severity,
      cvssScore,
      cvssVector,
      cvssBreakdown,
      cwes,
      description,
      references,
      patchInfo,
      affectedComponents: [],
      publishedAt: cve.published ? new Date(cve.published) : undefined,
      modifiedAt: cve.lastModified ? new Date(cve.lastModified) : undefined,
    }
  }

  /**
   * Check NVD API health
   */
  async checkHealth(apiKey?: string): Promise<ProviderHealthStatus> {
    const startTime = Date.now()

    try {
      // Try to fetch a specific, recent CVE
      const result = await this.getCveById('CVE-2024-2389', apiKey)

      const responseTime = Date.now() - startTime

      return {
        isHealthy: result !== null,
        responseTime,
        lastChecked: new Date(),
      }
    } catch (error) {
      return {
        isHealthy: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
        lastChecked: new Date(),
      }
    }
  }

  /**
   * Query by PURL - Not supported by NVD
   */
  async queryByPurl(_options: PurlQueryOptions): Promise<VulnerabilityQueryResult> {
    return {
      vulnerabilities: [],
      source: this.id,
      queryTime: 0,
    }
  }

  /**
   * Query by CPE
   */
  async queryByCpe(options: CpeQueryOptions): Promise<VulnerabilityQueryResult> {
    const startTime = Date.now()
    const vulnerabilities: Vulnerability[] = []
    let startIndex = 0
    let hasMore = true
    const maxResults = options.maxResults || 2000

    while (hasMore && vulnerabilities.length < maxResults) {
      const query = async () => {
        const url = buildUrl({
          cpeName: options.cpe,
          resultsPerPage: Math.min(2000, maxResults - vulnerabilities.length).toString(),
          startIndex: startIndex.toString(),
        })

        const headers: Record<string, string> = {}
        if (options.apiKey) {
          headers['apiKey'] = options.apiKey
        }

        const response = await fetch(url, { headers })

        if (!response.ok) {
          if (response.status === 403) {
            throw new Error('NVD API rate limit exceeded. Please provide an API key or wait.')
          }
          throw new Error(`NVD API error: ${response.status} ${response.statusText}`)
        }

        return (await response.json()) as NvdApiResponse
      }

      const data = await this.executeApiCall(query, 3, 10000)

      // Convert CVEs to internal format
      const cves = data.vulnerabilities || []
      for (const cve of cves) {
        vulnerabilities.push(this.convertNvdCveToVulnerability(cve))
      }

      // Check if there are more results
      hasMore = startIndex + data.resultsPerPage < data.totalResults
      startIndex += data.resultsPerPage
    }

    return {
      vulnerabilities,
      source: this.id,
      queryTime: Date.now() - startTime,
      hasMore,
    }
  }

  /**
   * Batch query for multiple CPEs
   */
  async batchQuery(options: BatchQueryOptions): Promise<Map<string, Vulnerability[]>> {
    const resultMap = new Map<string, Vulnerability[]>()

    // Initialize map with empty arrays
    for (const component of options.components) {
      resultMap.set(component.id, [])
    }

    // Collect unique CPEs
    const cpeMap = new Map<string, string[]>() // CPE to component IDs
    for (const component of options.components) {
      if (component.cpe) {
        if (!cpeMap.has(component.cpe)) {
          cpeMap.set(component.cpe, [])
        }
        cpeMap.get(component.cpe)!.push(component.id)
      }
    }

    // Query for each unique CPE
    for (const [cpe, componentIds] of cpeMap.entries()) {
      try {
        const result = await this.queryByCpe({ cpe, apiKey: options.apiKey })

        // Add vulnerabilities to all matching components
        for (const componentId of componentIds) {
          const existing = resultMap.get(componentId) || []
          resultMap.set(componentId, [...existing, ...result.vulnerabilities])
        }
      } catch (error) {
        console.error(`Failed to query NVD for CPE ${cpe}:`, error)
      }
    }

    return resultMap
  }

  /**
   * Get a specific CVE by ID
   */
  async getCveById(cveId: string, apiKey?: string): Promise<Vulnerability | null> {
    // Ensure CVE ID is in correct format
    const formattedCveId = cveId.toUpperCase().startsWith('CVE-') ? cveId.toUpperCase() : `CVE-${cveId.toUpperCase()}`

    const query = async () => {
      const url = buildUrl({ cveId: formattedCveId })

      const headers: Record<string, string> = {}
      if (apiKey) {
        headers['apiKey'] = apiKey
      }

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

      return (await response.json()) as NvdApiResponse
    }

    const data = await this.executeApiCall(query, 3, 10000)

    if (data.vulnerabilities && data.vulnerabilities.length > 0) {
      return this.convertNvdCveToVulnerability(data.vulnerabilities[0])
    }

    return null
  }

  /**
   * Validate NVD API key format
   */
  validateApiKey(apiKey: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(apiKey)
  }
}
