/**
 * SARIF (Static Analysis Results Interchange Format) Exporter
 * Exports vulnerability results in SARIF 2.1.0 format for CI/CD integration
 *
 * @see https://sarifweb.azurewebsites.net/
 */

import type { Vulnerability } from '../../src/shared/types.js'

/**
 * SARIF 2.1.0 Report Structure
 */
export interface SarifReport {
  $schema: string
  version: '2.1.0'
  runs: SarifRun[]
}

export interface SarifRun {
  tool: {
    driver: {
      name: string
      version: string
      informationUri: string
      rules?: SarifRule[]
    }
  }
  results: SarifResult[]
}

export interface SarifRule {
  id: string
  name: string
  shortDescription: {
    text: string
  }
  fullDescription?: {
    text: string
  }
  helpUri?: string
  properties?: {
    tags?: string[]
    severity?: string
  }
}

export interface SarifResult {
  ruleId: string
  level: 'error' | 'warning' | 'note' | 'none'
  message: {
    text: string
  }
  locations?: Array<{
    physicalLocation: {
      artifactLocation: {
        uri: string
      }
    }
  }>
  relatedLocations?: Array<{
    id: number
    message: {
      text: string
    }
    uri?: string
  }>
  fixes?: Array<{
    description: {
      text: string
    }
    artifactChanges?: Array<{
      artifactLocation: {
        uri: string
      }
      replacements: Array<{
        deletedRegion: {
          startLine: number
        }
      }>
    }>
  }>
  properties?: Record<string, unknown>
}

export interface SarifExportOptions {
  toolName: string
  toolVersion: string
  minSeverity?: 'critical' | 'high' | 'medium' | 'low' | 'none'
  minEpss?: number
  onlyKev?: boolean
}

/**
 * Maps severity levels to SARIF levels
 */
function severityToSarifLevel(severity: string): 'error' | 'warning' | 'note' | 'none' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'error'
    case 'medium':
      return 'warning'
    case 'low':
      return 'note'
    default:
      return 'none'
  }
}

/**
 * Severity priority for filtering
 */
const SEVERITY_PRIORITY: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
}

/**
 * Checks if a vulnerability meets the minimum severity threshold
 */
function meetsMinSeverity(vulnerability: Vulnerability, minSeverity?: string): boolean {
  if (!minSeverity) return true

  const vulnPriority = SEVERITY_PRIORITY[vulnerability.severity] ?? 0
  const minPriority = SEVERITY_PRIORITY[minSeverity] ?? 0

  return vulnPriority >= minPriority
}

/**
 * Exports vulnerabilities to SARIF 2.1.0 format
 */
export function exportToSarif(vulnerabilities: Vulnerability[], options: SarifExportOptions): SarifReport {
  // Apply filters
  let filteredVulns = vulnerabilities

  // Filter by minimum severity
  if (options.minSeverity) {
    filteredVulns = filteredVulns.filter((v) => meetsMinSeverity(v, options.minSeverity))
  }

  // Filter by minimum EPSS
  if (options.minEpss !== undefined) {
    filteredVulns = filteredVulns.filter((v) => (v.epssScore ?? 0) >= options.minEpss)
  }

  // Filter by KEV status
  if (options.onlyKev) {
    filteredVulns = filteredVulns.filter((v) => v.isKev === true)
  }

  // Generate unique rules for CWEs
  const cweMap = new Map<string, { name: string; description: string }>()
  for (const vuln of filteredVulns) {
    if (vuln.cwes) {
      for (const cwe of vuln.cwes) {
        if (!cweMap.has(cwe)) {
          cweMap.set(cwe, {
            name: cwe,
            description: vuln.description,
          })
        }
      }
    }
  }

  const rules: SarifRule[] = Array.from(cweMap.entries()).map(([cweId, info]) => ({
    id: cweId,
    name: cweId,
    shortDescription: {
      text: info.description,
    },
    properties: {
      tags: ['security', 'vulnerability'],
    },
  }))

  // Generate results
  const results: SarifResult[] = filteredVulns.map((vuln) => {
    // Build message text
    const messageText = `${vuln.id}: ${vuln.description} in ${componentInfo}. Severity: ${vuln.severity.toUpperCase()}. CVSS: ${vuln.cvssScore ?? 'N/A'}`

    // Build locations
    const locations = vuln.affectedComponents?.map((component) => ({
      physicalLocation: {
        artifactLocation: {
          uri: `pkg:/${component}`,
        },
      },
    }))

    // Build related locations (references)
    const relatedLocations = vuln.references?.map((ref, index) => ({
      id: index,
      message: {
        text: `${ref.source}: ${ref.url}`,
      },
      uri: ref.url,
    }))

    // Build fixes
    const fixes =
      vuln.patchedVersions && vuln.patchedVersions.length > 0
        ? [
            {
              description: {
                text: `Upgrade to version ${vuln.patchedVersions.join(' or ')}`,
              },
            },
          ]
        : undefined

    // Build properties
    const properties: Record<string, unknown> = {
      severity: vuln.severity,
      kev: vuln.isKev ?? false,
    }

    if (vuln.cvssScore !== undefined) {
      properties.cvssScore = vuln.cvssScore
    }

    if (vuln.epssScore !== undefined) {
      properties.epss = vuln.epssScore
    }

    if (vuln.cwes && vuln.cwes.length > 0) {
      properties.cwe = vuln.cwes[0]
    }

    return {
      ruleId: vuln.id,
      level: severityToSarifLevel(vuln.severity),
      message: {
        text: messageText,
      },
      locations,
      relatedLocations,
      fixes,
      properties,
    }
  })

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: options.toolName,
            version: options.toolVersion,
            informationUri: 'https://github.com/vulnasstool/vuln-asses-tool',
            rules: rules.length > 0 ? rules : undefined,
          },
        },
        results,
      },
    ],
  }
}
