/**
 * JUnit XML Exporter
 * Exports vulnerability results in JUnit XML format for CI/CD integration
 *
 * Compatible with Jenkins, GitLab CI, and other tools that consume JUnit XML
 */

import type { Vulnerability } from '../../src/shared/types.js'

/**
 * JUnit XML Structure (for XML generation)
 */
export interface JunitTestSuites {
  name: string
  tests: string
  failures: string
  errors: string
  time?: string
  testsuite: JunitTestSuite[]
}

export interface JunitTestSuite {
  name: string
  tests: number
  failures: number
  errors: number
  timestamp: string
  time?: string
  testcase: JunitTestCase[]
}

export interface JunitTestCase {
  name: string
  classname: string
  time?: string
  properties?: {
    property: Array<{
      name: string
      value: string
    }>
  }
  failure?: Array<{
    text: string
    message?: string
    type?: string
  }>
  systemOut?: string
}

export interface JunitReport {
  testsuites: JunitTestSuites
}

export interface JunitExportOptions {
  projectName: string
  minSeverity?: 'critical' | 'high' | 'medium' | 'low' | 'none'
  minEpss?: number
  onlyKev?: boolean
  failureThreshold?: 'critical' | 'high' | 'medium' | 'low' | 'none'
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
function meetsMinSeverity(vulnerability: Vulnerability, minSeverity?: string): boolean {
  if (!minSeverity) return true

  const vulnPriority = SEVERITY_PRIORITY[vulnerability.severity] ?? 0
  const minPriority = SEVERITY_PRIORITY[minSeverity] ?? 0

  return vulnPriority >= minPriority
}

/**
 * Checks if a vulnerability should be marked as a failure
 */
function isFailure(vulnerability: Vulnerability, threshold?: string): boolean {
  const thresholdLevel = threshold ?? 'high'
  const vulnPriority = SEVERITY_PRIORITY[vulnerability.severity] ?? 0
  const thresholdPriority = SEVERITY_PRIORITY[thresholdLevel] ?? 3 // default to high

  return vulnPriority >= thresholdPriority
}

/**
 * Exports vulnerabilities to JUnit XML format (as JSON structure for XML serialization)
 */
export function exportToJunit(vulnerabilities: Vulnerability[], options: JunitExportOptions): JunitReport {
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

  // Generate test cases
  const testcases: JunitTestCase[] = filteredVulns.map((vuln) => {
    // Build component info
    const componentInfo = vuln.affectedComponents?.[0] ?? 'unknown component'
    const componentName = componentInfo.split('@')[0] ?? 'unknown'

    // Build properties
    const properties: Array<{ name: string; value: string }> = []

    if (vuln.cvssScore !== undefined) {
      properties.push({ name: 'cvssScore', value: String(vuln.cvssScore) })
    }

    if (vuln.epssScore !== undefined) {
      properties.push({ name: 'epss', value: String(vuln.epssScore) })
    }

    properties.push({ name: 'kev', value: String(vuln.isKev ?? false) })

    if (vuln.cwes && vuln.cwes.length > 0) {
      properties.push({ name: 'cwe', value: vuln.cwes[0] })
    }

    properties.push({ name: 'severity', value: vuln.severity })
    properties.push({ name: 'component', value: componentInfo })

    // Build failure message if applicable
    let failure: Array<{ text: string; message?: string; type?: string }> | undefined

    if (isFailure(vuln, options.failureThreshold)) {
      const lines = [
        `Vulnerability: ${vuln.id}`,
        `Component: ${componentInfo}`,
        `Severity: ${vuln.severity.toUpperCase()}`,
        `CVSS Score: ${vuln.cvssScore ?? 'N/A'}`,
        `EPSS Score: ${vuln.epssScore ?? 'N/A'}`,
        `KEV: ${vuln.isKev ? 'Yes' : 'No'}`,
        `CWE: ${vuln.cwes?.[0] ?? 'N/A'}`,
        '',
        `Description: ${vuln.description}`,
        '',
      ]

      if (vuln.patchInfo?.fixedVersions && vuln.patchInfo.fixedVersions.length > 0) {
        lines.push(`Remediation: Upgrade to version ${vuln.patchInfo.fixedVersions.join(' or ')}`)
      }

      if (vuln.references && vuln.references.length > 0) {
        lines.push('')
        lines.push('References:')
        for (const ref of vuln.references) {
          lines.push(`  - ${ref.source}: ${ref.url}`)
        }
      }

      failure = [
        {
          text: lines.join('\n'),
          message: `${vuln.severity.toUpperCase()}: ${vuln.id} in ${componentName}`,
          type: vuln.severity,
        },
      ]
    }

    return {
      name: vuln.id,
      classname: componentName,
      time: '0',
      properties: properties.length > 0 ? { property: properties } : undefined,
      failure,
    }
  })

  // Calculate counts
  const totalTests = testcases.length
  const failureCount = testcases.filter((tc) => tc.failure !== undefined).length

  // Build testsuite
  const testsuite: JunitTestSuite = {
    name: `${options.projectName} - Security Vulnerabilities`,
    tests: totalTests,
    failures: failureCount,
    errors: 0,
    timestamp: new Date().toISOString(),
    time: '0',
    testcase: testcases,
  }

  // Build testsuites
  const testsuites: JunitTestSuites = {
    name: options.projectName,
    tests: String(totalTests),
    failures: String(failureCount),
    errors: '0',
    time: '0',
    testsuite: [testsuite],
  }

  return {
    testsuites,
  }
}

/**
 * Serializes JUnit report to XML string
 */
export function junitToXml(report: JunitReport): string {
  const { testsuites } = report

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'

  // Open testsuites
  xml += `<testsuites name="${escapeXml(testsuites.name)}" tests="${testsuites.tests}" failures="${testsuites.failures}" errors="${testsuites.errors}"`
  if (testsuites.time !== undefined) {
    xml += ` time="${testsuites.time}"`
  }
  xml += '>\n'

  // Process each testsuite
  for (const suite of testsuites.testsuite) {
    xml += `  <testsuite name="${escapeXml(suite.name)}" tests="${suite.tests}" failures="${suite.failures}" errors="${suite.errors}" timestamp="${suite.timestamp}"`
    if (suite.time !== undefined) {
      xml += ` time="${suite.time}"`
    }
    xml += '>\n'

    // Process testcases
    for (const tc of suite.testcase) {
      xml += `    <testcase name="${escapeXml(tc.name)}" classname="${escapeXml(tc.classname)}"`
      if (tc.time !== undefined) {
        xml += ` time="${tc.time}"`
      }
      xml += '>\n'

      // Add properties if present
      if (tc.properties && tc.properties.property.length > 0) {
        xml += '      <properties>\n'
        for (const prop of tc.properties.property) {
          xml += `        <property name="${escapeXml(prop.name)}" value="${escapeXml(prop.value)}"/>\n`
        }
        xml += '      </properties>\n'
      }

      // Add failure if present
      if (tc.failure && tc.failure.length > 0) {
        for (const fail of tc.failure) {
          xml += `      <failure`
          if (fail.message) {
            xml += ` message="${escapeXml(fail.message)}"`
          }
          if (fail.type) {
            xml += ` type="${escapeXml(fail.type)}"`
          }
          xml += `>${escapeXml(fail.text)}</failure>\n`
        }
      }

      // Add system-out if present
      if (tc.systemOut) {
        xml += `      <system-out>${escapeXml(tc.systemOut)}</system-out>\n`
      }

      xml += '    </testcase>\n'
    }

    xml += '  </testsuite>\n'
  }

  xml += '</testsuites>\n'

  return xml
}

/**
 * Escapes XML special characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
