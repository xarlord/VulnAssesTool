import type {
  OsvVulnerability,
  Vulnerability,
  VulnerabilitySource,
  ProviderCapabilities,
  PatchInfo,
  PatchLink,
  VersionRange,
  RemediationAdvice,
  RemediationStep,
} from '@@/types'
import { OSV_API_BASE_URL, HIGH_SCORE_THRESHOLD, MEDIUM_SCORE_THRESHOLD } from '@@/constants'
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
 * OSV Provider Implementation
 */
export class OsvProvider extends BaseVulnerabilityProvider {
  readonly id: VulnerabilitySource = 'osv'
  readonly name = 'OSV (Open Source Vulnerabilities)'
  readonly baseUrl = OSV_API_BASE_URL
  readonly capabilities: ProviderCapabilities = {
    purlSupport: true,
    cpeSupport: false,
    batchQueries: true,
    patchInfo: true,
    cvssVector: true,
    cweData: false,
    exploitStatus: false,
    aliases: true,
  }
  readonly defaultRateLimit = 1000 // OSV has generous limits

  /**
   * Determine severity from score
   */
  private getSeverityFromScore(score: number): Vulnerability['severity'] {
    if (score >= 9.0) return 'critical'
    if (score >= HIGH_SCORE_THRESHOLD) return 'high'
    if (score >= MEDIUM_SCORE_THRESHOLD) return 'medium'
    if (score > 0) return 'low'
    return 'none'
  }

  /**
   * Extract patch information from OSV vulnerability
   */
  private extractPatchInfo(osvVuln: OsvVulnerability): PatchInfo | undefined {
    const fixedVersions: string[] = []
    const patchLinks: PatchLink[] = []
    const affectedVersionRanges: VersionRange[] = []

    // Extract fixed versions and ranges
    for (const affected of osvVuln.affected) {
      for (const range of affected.ranges) {
        const versionRange: VersionRange = {
          type: this.normalizeRangeType(range.type),
          introduction: '0', // Default to beginning
        }

        // Extract events
        for (const event of range.events) {
          if (event.introduced) {
            versionRange.introduction = event.introduced
          }
          if (event.fixed) {
            if (!fixedVersions.includes(event.fixed)) {
              fixedVersions.push(event.fixed)
            }
            versionRange.fixIn = event.fixed
          }
        }

        affectedVersionRanges.push(versionRange)
      }
    }

    // Extract patch links from references
    if (osvVuln.references) {
      for (const ref of osvVuln.references) {
        const linkType = this.classifyReferenceUrl(ref.url)
        if (linkType) {
          patchLinks.push({
            type: linkType,
            url: ref.url,
            source: 'OSV',
            description: ref.type,
          })
        }
      }
    }

    if (fixedVersions.length === 0 && patchLinks.length === 0) {
      return undefined
    }

    // Determine patch availability
    const patchAvailability = this.determinePatchAvailability(fixedVersions, patchLinks)

    // Generate remediation advice
    const remediationAdvice = this.generateRemediationAdvice(fixedVersions, patchLinks, osvVuln)

    return {
      fixedVersions,
      patchLinks,
      remediationAdvice,
      affectedVersionRanges,
      patchAvailability,
    }
  }

  /**
   * Normalize range type to standard format
   */
  private normalizeRangeType(type: string): VersionRange['type'] {
    const typeMap: Record<string, VersionRange['type']> = {
      SEMVER: 'SEMVER',
      ECOSYSTEM: 'CUSTOM',
      GIT: 'CUSTOM',
      MAVEN: 'MAVEN',
      PYPI: 'PEP440',
      NPM: 'SEMVER',
      COMPOSER: 'COMPOSER',
      NUGET: 'NUGET',
    }
    return typeMap[type] || 'CUSTOM'
  }

  /**
   * Classify reference URL by type
   */
  private classifyReferenceUrl(url: string): PatchLink['type'] | null {
    if (url.includes('/commit/') || url.includes('/commits/')) {
      return 'commit'
    }
    if (url.includes('/pull/') || url.includes('/pulls/') || url.includes('/pr/')) {
      return 'pr'
    }
    if (url.includes('/releases/') || url.includes('/release/')) {
      return 'release'
    }
    if (url.includes('advisory') || url.includes('security')) {
      return 'advisory'
    }
    return null
  }

  /**
   * Determine patch availability status
   */
  private determinePatchAvailability(fixedVersions: string[], patchLinks: PatchLink[]): PatchInfo['patchAvailability'] {
    if (fixedVersions.length > 0) {
      return 'available'
    }
    if (patchLinks.length > 0) {
      return 'partial'
    }
    return 'none'
  }

  /**
   * Generate remediation advice
   */
  private generateRemediationAdvice(
    fixedVersions: string[],
    patchLinks: PatchLink[],
    osvVuln: OsvVulnerability,
  ): RemediationAdvice {
    const steps: RemediationStep[] = []
    let priority: RemediationAdvice['priority'] = 'low'
    let category: RemediationAdvice['category'] = 'upgrade'

    // Determine priority based on severity
    if (osvVuln.severity && osvVuln.severity.length > 0) {
      const score = parseFloat(osvVuln.severity[0].score)
      if (!isNaN(score)) {
        if (score >= 9.0) priority = 'immediate'
        else if (score >= 7.0) priority = 'high'
        else if (score >= 4.0) priority = 'medium'
      }
    }

    // Generate upgrade steps
    if (fixedVersions.length > 0) {
      category = 'upgrade'
      steps.push({
        step: 1,
        action: 'Update to fixed version',
        description: `Update to version ${fixedVersions[0]} or later which contains the security fix.`,
        command: this.generateUpdateCommand(osvVuln, fixedVersions[0]),
      })

      if (fixedVersions.length > 1) {
        steps.push({
          step: 2,
          action: 'Verify all fixed versions',
          description: `Multiple fixed versions are available: ${fixedVersions.join(', ')}. Update to the latest compatible version.`,
        })
      }
    } else if (patchLinks.length > 0) {
      category = 'patch'
      steps.push({
        step: 1,
        action: 'Apply security patch',
        description: 'Review and apply the security patch from the following sources.',
      })

      for (let i = 0; i < patchLinks.length; i++) {
        steps.push({
          step: i + 2,
          action: `Review ${patchLinks[i].type}`,
          description: patchLinks[i].description || patchLinks[i].url,
        })
      }
    } else {
      category = 'mitigation'
      steps.push({
        step: 1,
        action: 'Monitor for updates',
        description: 'No patch is currently available. Monitor for security updates from the vendor.',
      })
    }

    return {
      priority,
      category,
      steps,
    }
  }

  /**
   * Generate update command based on ecosystem
   */
  private generateUpdateCommand(osvVuln: OsvVulnerability, version: string): string | undefined {
    const ecosystem = osvVuln.affected[0]?.package.ecosystem
    const packageName = osvVuln.affected[0]?.package.name

    if (!ecosystem || !packageName) {
      return undefined
    }

    const commands: Record<string, string> = {
      npm: `npm install ${packageName}@${version}`,
      yarn: `yarn upgrade ${packageName}@${version}`,
      pnpm: `pnpm update ${packageName}@${version}`,
      PyPI: `pip install ${packageName}==${version}`,
      Maven: `Update to version ${version} in your pom.xml`,
      Go: `go get ${packageName}@${version}`,
      cargo: `cargo update ${packageName} --precise ${version}`,
      composer: `composer require ${packageName}:${version}`,
      nuget: `Update-Package ${packageName} -Version ${version}`,
    }

    return commands[ecosystem] || `Update ${packageName} to version ${version}`
  }

  /**
   * Convert OSV vulnerability to internal type
   */
  private convertOsvVulnerabilityToVulnerability(osvVuln: OsvVulnerability): Vulnerability {
    // Determine severity from severity data if available
    let severity: Vulnerability['severity'] = 'none'
    let cvssScore: number | undefined
    let cvssVector: string | undefined
    let cvssBreakdown: any = undefined

    if (osvVuln.severity && osvVuln.severity.length > 0) {
      const severityData = osvVuln.severity[0]
      const score = parseFloat(severityData.score)
      if (!isNaN(score)) {
        cvssScore = score
        severity = this.getSeverityFromScore(score)

        // Try to extract CVSS vector from severity
        if (severityData.type === 'CVSS_V3' && severityData.score.includes('/')) {
          cvssVector = severityData.score
          cvssBreakdown = parseCvssVector(cvssVector)
        }
      }
    }

    // Extract description
    const description = osvVuln.summary || osvVuln.details

    // Extract references
    const references = (osvVuln.references || []).map((ref) => ({
      source: 'OSV',
      url: ref.url,
      tags: ref.type ? [ref.type] : [],
    }))

    // Extract affected package information
    const affectedPackage = osvVuln.affected[0]
    const purl = affectedPackage?.package.purl

    // Extract patch info
    const patchInfo = this.extractPatchInfo(osvVuln)

    // Extract aliases (CVEs, GHSA, etc.)
    const aliases = osvVuln.aliases

    return {
      id: osvVuln.id,
      source: 'osv',
      severity,
      cvssScore,
      cvssVector,
      cvssBreakdown,
      cwes: undefined,
      description,
      references,
      affectedComponents: purl ? [purl] : [],
      publishedAt: osvVuln.published ? new Date(osvVuln.published) : undefined,
      modifiedAt: new Date(osvVuln.modified),
      patchInfo,
      aliases,
      patchedVersions: patchInfo?.fixedVersions,
    }
  }

  /**
   * Check OSV API health
   */
  async checkHealth(_apiKey?: string): Promise<ProviderHealthStatus> {
    const startTime = Date.now()

    try {
      // Try to get a known vulnerability (even if it doesn't exist, API should respond)
      const query = async () => {
        const url = new URL(`${this.baseUrl}/vulns/OSV-2024-1234`)
        const response = await fetch(url.toString())
        return response.ok || response.status === 404
      }

      const isHealthy = await this.executeApiCall(query, 2, 5000)

      return {
        isHealthy,
        responseTime: Date.now() - startTime,
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
   * Query by PURL
   */
  async queryByPurl(options: PurlQueryOptions): Promise<VulnerabilityQueryResult> {
    const startTime = Date.now()

    const query = async () => {
      const url = new URL(`${this.baseUrl}/query`)
      const requestBody = {
        package: {
          purl: options.purl,
        },
      }

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

      return await response.json()
    }

    const data = await this.executeApiCall(query, 3, 2000)
    const vulns: OsvVulnerability[] = data.vulns || []
    const vulnerabilities = vulns.map(this.convertOsvVulnerabilityToVulnerability.bind(this))

    return {
      vulnerabilities,
      source: this.id,
      queryTime: Date.now() - startTime,
    }
  }

  /**
   * Query by CPE - Not supported by OSV
   */
  async queryByCpe(_options: CpeQueryOptions): Promise<VulnerabilityQueryResult> {
    return {
      vulnerabilities: [],
      source: this.id,
      queryTime: 0,
    }
  }

  /**
   * Batch query for multiple PURLs
   */
  async batchQuery(options: BatchQueryOptions): Promise<Map<string, Vulnerability[]>> {
    const resultMap = new Map<string, Vulnerability[]>()

    // Initialize map with empty arrays
    for (const component of options.components) {
      resultMap.set(component.id, [])
    }

    // Group components by PURL to avoid duplicate queries
    const purlMap = new Map<string, string[]>() // PURL to component IDs
    for (const component of options.components) {
      if (component.purl) {
        if (!purlMap.has(component.purl)) {
          purlMap.set(component.purl, [])
        }
        const entry = purlMap.get(component.purl)
        if (entry) entry.push(component.id)
      }
    }

    // Query for each unique PURL
    for (const [purl, componentIds] of purlMap.entries()) {
      try {
        const result = await this.queryByPurl({ purl, apiKey: options.apiKey })

        // Add vulnerabilities to all matching components
        for (const componentId of componentIds) {
          const existing = resultMap.get(componentId) || []
          resultMap.set(componentId, [...existing, ...result.vulnerabilities])
        }
      } catch (error) {
        console.error(`Failed to query OSV for PURL ${purl}:`, error)
      }
    }

    return resultMap
  }

  /**
   * Get a specific vulnerability by ID
   */
  async getVulnerabilityById(vulnId: string, _apiKey?: string): Promise<Vulnerability | null> {
    const query = async () => {
      const url = new URL(`${this.baseUrl}/vulns/${vulnId}`)
      const response = await fetch(url.toString())

      if (!response.ok) {
        if (response.status === 404) {
          return null
        }
        throw new Error(`OSV API error: ${response.status} ${response.statusText}`)
      }

      return (await response.json()) as OsvVulnerability
    }

    const vuln = await this.executeApiCall(query, 3, 2000)
    return vuln ? this.convertOsvVulnerabilityToVulnerability(vuln) : null
  }
}
