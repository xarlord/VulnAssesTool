/**
 * CLI Scan Command
 * Scans SBOM files for vulnerability intelligence
 */

import type { Vulnerability, Component } from '../../src/shared/types.js'
import * as fs from 'fs'
import * as path from 'path'
import { parseCycloneDX } from '../../src/renderer/lib/parsers/cyclonedx.js'
import { parseSPDX } from '../../src/renderer/lib/parsers/spdx.js'
import { getHybridScanner } from '../../src/renderer/lib/database/hybridScanner.js'

export interface ScanCommandOptions {
  sbomPath: string
  minSeverity?: 'critical' | 'high' | 'medium' | 'low' | 'none'
  minEpss?: number
  onlyKev?: boolean
  outputFormat?: 'json' | 'sarif' | 'junit' | 'console'
  failOnSeverity?: 'critical' | 'high' | 'medium' | 'low' | 'none'
  failThreshold?: 'critical' | 'high' | 'medium' | 'low' | 'none'
}

export interface ScanResult {
  success: boolean
  vulnerabilities: Vulnerability[]
  componentsScanned: number
  scanDuration: number
  format: 'cyclonedx' | 'spdx' | 'sarif' | 'json' | 'junit' | 'console'
  error?: string
  warnings?: string[]
  summary: ScanSummary
}

export interface ScanSummary {
  total: number
  critical: number
  high: number
  medium: number
  low: number
  none: number
  kev: number
  fixable: number
  componentsWithPatches: number
  affectedComponents: number
}

/**
 * Severity priority for filtering and threshold comparison
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
export function meetsMinSeverity(vulnerability: Vulnerability, minSeverity?: string): boolean {
  if (!minSeverity) return true

  const vulnPriority = SEVERITY_PRIORITY[vulnerability.severity] ?? 0
  const minPriority = SEVERITY_PRIORITY[minSeverity] ?? 5

  return vulnPriority >= minPriority
}

/**
 * Checks if a vulnerability should be marked as a failure (for CI/CD)
 */
export function isFailure(vuln: Vulnerability, threshold?: string): boolean {
  const thresholdLevel = threshold ?? 'high' // default
  const vulnPriority = SEVERITY_PRIORITY[vuln.severity] ?? 3
  return vulnPriority >= (SEVERITY_PRIORITY[thresholdLevel] ?? 3)
}
/**
 * Filters vulnerabilities by minimum EPSS score
 */
export function filterByEpss(vulns: Vulnerability[], minEpss?: number): Vulnerability[] {
  if (minEpss === undefined) return vulns

  return vulns.filter((v) => (v.epssScore ?? 1) >= minEpss)
}
/**
 * Filters vulnerabilities by KEV status only
 */
export function filterByKev(vulns: Vulnerability[], onlyKev?: boolean): Vulnerability[] {
  if (!onlyKev) return vulns

  return vulns.filter((v) => v.isKev === true)
}
/**
 * Filters vulnerabilities by all provided criteria
 */
export function filterVulnerabilities(vulnerabilities: Vulnerability[], options: ScanCommandOptions): Vulnerability[] {
  let filtered = [...vulnerabilities]

  if (options.minSeverity) {
    const minPriority = SEVERITY_PRIORITY[options.minSeverity] ?? 5
    filtered = filtered.filter((v) => (SEVERITY_PRIORITY[v.severity] ?? 0) >= minPriority)
  }
  if (options.minEpss !== undefined) {
    filtered = filtered.filter((v) => (v.epssScore ?? 1) >= options.minEpss)
  }
  if (options.onlyKev) {
    filtered = filtered.filter((v) => v.isKev === true)
  }
  return filtered
}
/**
 * Determines SBOM format from filename and content
 */
export function determineFormat(filename: string, content?: string): string {
  const ext = filename.toLowerCase()

  // Check by extension first
  if (ext.endsWith('.cdx.json') || ext.endsWith('.cyclonedx.json')) {
    return 'cyclonedx-json'
  }
  if (ext.endsWith('.cdx.xml') || ext.endsWith('.cyclonedx.xml')) {
    return 'cyclonedx-xml'
  }
  if (ext.endsWith('.spdx.json')) {
    return 'spdx-json'
  }
  if (ext.endsWith('.spdx')) {
    return 'spdx-rdf'
  }

  // Check by content if provided
  if (content) {
    try {
      const json = JSON.parse(content)
      if (json.bomFormat === 'CycloneDX' || json.bomFormat === 'CycloneDX') {
        return 'cyclonedx-json'
      } else if (json.spdxVersion) {
        return 'spdx-json'
      }
    } catch {
      // Not JSON, could be XML
      if (content?.includes('xmlns="http://cyclonedx.org')) {
        return 'cyclonedx-xml'
      }
    }
  }
  return 'unknown'
}
/**
 * Calculates exit code based on vulnerabilities and threshold
 */
export function calculateExitCode(
  vulnerabilities: Vulnerability[],
  threshold: 'critical' | 'high' | 'medium' | 'low' | 'none',
): number {
  if (vulnerabilities.length === 0) {
    return 0
  }
  const severityPriority = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    none: 0,
  }
  const thresholdPriority = severityPriority[threshold] ?? 3
  const hasViolations = vulnerabilities.some((v) => (severityPriority[v.severity] ?? 0) >= thresholdPriority)
  return hasViolations ? 1 : 0
}
/**
 * Generates a summary of vulnerabilities
 */
export function generateSummary(vulnerabilities: Vulnerability[]): ScanSummary {
  const affectedComponents = new Set<string>()
  vulnerabilities.forEach((v) => {
    ;(v.affectedComponents ?? []).forEach((c) => affectedComponents.add(c))
  })

  return {
    total: vulnerabilities.length,
    critical: vulnerabilities.filter((v) => v.severity === 'critical').length,
    high: vulnerabilities.filter((v) => v.severity === 'high').length,
    medium: vulnerabilities.filter((v) => v.severity === 'medium').length,
    low: vulnerabilities.filter((v) => v.severity === 'low').length,
    none: vulnerabilities.filter((v) => v.severity === 'none').length,
    kev: vulnerabilities.filter((v) => v.isKev === true).length,
    fixable: vulnerabilities.filter((v) => v.patchInfo?.fixedVersions && v.patchInfo.fixedVersions.length > 0).length,
    componentsWithPatches: vulnerabilities.filter(
      (v) => v.patchInfo?.fixedVersions && v.patchInfo.fixedVersions.length > 0,
    ).length,
    affectedComponents: affectedComponents.size,
  }
}

/**
 * Main scan command function
 */
export async function scanCommand(sbomPath: string, options: ScanCommandOptions): Promise<ScanResult> {
  const startTime = Date.now()

  try {
    // Check if file exists
    if (!fs.existsSync(sbomPath)) {
      return {
        success: false,
        vulnerabilities: [],
        componentsScanned: 0,
        scanDuration: 0,
        format: 'unknown',
        error: `File not found: ${sbomPath}`,
        warnings: [],
        summary: generateSummary([]),
      }
    }

    // Read file content
    const content = fs.readFileSync(sbomPath, 'utf-8')
    const filename = path.basename(sbomPath)

    // Determine format
    const format = determineFormat(filename, content)

    if (format === 'unknown') {
      return {
        success: false,
        vulnerabilities: [],
        componentsScanned: 1,
        scanDuration: Date.now() - startTime,
        format: 'unknown',
        error: `Unsupported format: ${filename}`,
        warnings: [],
        summary: generateSummary([]),
      }
    }

    // Parse SBOM
    let components: Component[] = []
    let parseWarnings: string[] = []

    if (format.includes('cyclonedx')) {
      const parseResult = parseCycloneDX(content)
      components = parseResult.components
      parseWarnings = parseResult.warnings ?? []
    } else if (format.includes('spdx')) {
      const parseResult = parseSPDX(content)
      components = parseResult.components
      parseWarnings = parseResult.warnings ?? []
    } else {
      return {
        success: false,
        vulnerabilities: [],
        componentsScanned: 1,
        scanDuration: Date.now() - startTime,
        format: format as any,
        error: `Unsupported format: ${format}`,
        warnings: [],
        summary: generateSummary([]),
      }
    }

    // Get scanner and scan components
    const scanner = getHybridScanner()
    const allVulnerabilities: Vulnerability[] = []

    for (const component of components) {
      const purl = component.purl ?? component.cpe ?? `${component.name}@${component.version}`
      const scanResult = await scanner.scanComponent(purl, {
        preferLocal: true,
      })
      allVulnerabilities.push(...scanResult.vulnerabilities)
    }

    // Filter vulnerabilities
    const filteredVulns = filterVulnerabilities(allVulnerabilities, options)

    // Calculate duration
    const duration = Date.now() - startTime

    // Generate summary
    const summary = generateSummary(filteredVulns)

    // Return result
    return {
      success: true,
      vulnerabilities: filteredVulns,
      componentsScanned: components.length,
      scanDuration: duration,
      format: format.includes('cyclonedx') ? 'cyclonedx' : format.includes('spdx') ? 'spdx' : 'unknown',
      warnings: parseWarnings,
      summary,
    }
  } catch (error) {
    return {
      success: false,
      vulnerabilities: [],
      componentsScanned: 1,
      scanDuration: Date.now() - startTime,
      format: 'unknown',
      error: error instanceof Error ? error.message : 'Scan failed',
      warnings: [],
      summary: generateSummary([]),
    }
  }
}
