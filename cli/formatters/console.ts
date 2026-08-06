/**
 * Human-readable console formatter for CLI scan results.
 * ASCII-only (portable across Windows/Unix terminals), no color dependencies.
 */

import type { ScanResult } from '../commands/scan.js'
import type { Vulnerability } from '../../src/shared/types.js'

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 }

// Truncate to width-1 and keep a trailing space so long values never collide
// with the next column (and the following cell is still readable).
function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width - 1) + ' ' : value.padEnd(width)
}

function firstComponent(vuln: Vulnerability): string {
  return vuln.affectedComponents[0] ?? '-'
}

function epssCell(vuln: Vulnerability): string {
  if (vuln.epssScore === undefined) return '-'
  return `${(vuln.epssScore * 100).toFixed(1)}%`
}

function fixedCell(vuln: Vulnerability): string {
  return vuln.patchedVersions && vuln.patchedVersions.length > 0 ? vuln.patchedVersions[0] : '-'
}

export function formatConsole(result: ScanResult, sbomPath: string): string {
  const { summary } = result
  const lines: string[] = []

  lines.push(
    `Scanned ${sbomPath} — ${result.componentsScanned} component(s), ${result.format}, ${result.scanDuration}ms`,
  )
  lines.push('')
  lines.push(
    `Findings: ${summary.total}  ` +
      `(Critical: ${summary.critical}  High: ${summary.high}  Medium: ${summary.medium}  ` +
      `Low: ${summary.low}  None: ${summary.none})  KEV: ${summary.kev}  Fixable: ${summary.fixable}`,
  )

  if (result.warnings && result.warnings.length > 0) {
    lines.push('')
    for (const warning of result.warnings) lines.push(`  warning: ${warning}`)
  }

  if (summary.total === 0) {
    lines.push('')
    lines.push('No vulnerabilities found.')
    return lines.join('\n')
  }

  const sorted = [...result.vulnerabilities].sort((a, b) => {
    const bySeverity = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0)
    if (bySeverity !== 0) return bySeverity
    return (b.cvssScore ?? 0) - (a.cvssScore ?? 0)
  })

  lines.push('')
  lines.push(
    pad('SEVERITY', 9) +
      pad('CVE', 18) +
      pad('CVSS', 6) +
      pad('EPSS', 8) +
      pad('KEV', 4) +
      pad('COMPONENT', 32) +
      'FIXED',
  )
  for (const vuln of sorted) {
    lines.push(
      pad(vuln.severity.toUpperCase(), 9) +
        pad(vuln.id, 18) +
        pad(vuln.cvssScore !== undefined ? vuln.cvssScore.toFixed(1) : '-', 6) +
        pad(epssCell(vuln), 8) +
        pad(vuln.isKev ? 'yes' : '-', 4) +
        pad(firstComponent(vuln), 32) +
        fixedCell(vuln),
    )
  }

  return lines.join('\n')
}
