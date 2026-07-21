import { describe, it, expect } from 'vitest'
import { formatConsole } from '../../cli/formatters/console.js'
import { formatJson } from '../../cli/formatters/json.js'
import { generateSummary } from '../../cli/commands/scan.js'
import type { ScanResult } from '../../cli/commands/scan.js'
import type { Vulnerability } from '../../src/shared/types.js'

function makeResult(vulns: Vulnerability[]): ScanResult {
  return {
    success: true,
    vulnerabilities: vulns,
    componentsScanned: 2,
    scanDuration: 1234,
    format: 'cyclonedx',
    warnings: [],
    summary: generateSummary(vulns),
  }
}

const criticalKev: Vulnerability = {
  id: 'CVE-2021-44228',
  source: 'nvd',
  severity: 'critical',
  cvssScore: 10.0,
  isKev: true,
  description: 'Log4Shell',
  references: [],
  affectedComponents: ['pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1'],
  patchedVersions: ['2.15.0'],
}

describe('formatConsole', () => {
  it('renders a summary and a row per vulnerability', () => {
    const output = formatConsole(makeResult([criticalKev]), 'bom.json')
    expect(output).toContain('Scanned bom.json')
    expect(output).toContain('Findings: 1')
    expect(output).toContain('CRITICAL')
    expect(output).toContain('CVE-2021-44228')
    expect(output).toContain('yes') // KEV marker
    expect(output).toContain('2.15.0') // fixed version
  })

  it('reports a clean result when there are no findings', () => {
    const output = formatConsole(makeResult([]), 'bom.json')
    expect(output).toContain('Findings: 0')
    expect(output).toContain('No vulnerabilities found.')
  })
})

describe('formatJson', () => {
  it('emits parseable JSON that round-trips the result', () => {
    const result = makeResult([criticalKev])
    const parsed = JSON.parse(formatJson(result)) as ScanResult
    expect(parsed.summary.total).toBe(1)
    expect(parsed.vulnerabilities).toHaveLength(1)
    expect(parsed.vulnerabilities[0].id).toBe('CVE-2021-44228')
  })

  it('emits an empty vulnerabilities array for a clean scan', () => {
    const parsed = JSON.parse(formatJson(makeResult([]))) as ScanResult
    expect(parsed.summary.total).toBe(0)
    expect(parsed.vulnerabilities).toHaveLength(0)
  })
})
