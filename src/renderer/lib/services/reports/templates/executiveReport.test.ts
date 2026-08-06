/**
 * Tests for the executive report HTML template (FR-09.2).
 *
 * The vulnerability table must be sorted most-severe-first (so a reader skimming
 * top-to-bottom sees the highest-priority findings first) and must render the
 * CVSS vector, not just the score.
 */

import { describe, it, expect } from 'vitest'
import { generateExecutiveReportHTML } from './executiveReport'
import type { ReportData, ReportOptions, ExecutiveSummaryMetrics } from '../types'
import type { Project, Vulnerability } from '@@/types'

function vuln(overrides: Partial<Vulnerability>): Vulnerability {
  return {
    id: 'CVE-0000',
    source: 'nvd',
    severity: 'medium',
    references: [],
    affectedComponents: [],
    ...overrides,
  }
}

const options: ReportOptions = {
  title: 'Test Report',
  projectName: 'Test Project',
  includeExecutiveSummary: false,
  includeCharts: false,
  includeRecommendations: false,
}

const metrics: ExecutiveSummaryMetrics = {
  overallRiskScore: 50,
  riskLevel: 'Medium',
  trend: 'stable',
  keyFindings: [],
  topVulnerableComponents: [],
  recommendedActions: [],
}

function reportData(vulnerabilities: Vulnerability[]): ReportData {
  return {
    project: { id: 'p1', name: 'Test Project' } as Project,
    vulnerabilities,
    components: [],
    statistics: {
      totalVulnerabilities: vulnerabilities.length,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      noneCount: 0,
      totalComponents: 0,
      vulnerableComponents: 0,
      kevCount: 0,
      avgEpssScore: 0,
    },
  }
}

describe('generateExecutiveReportHTML (FR-09.2)', () => {
  it('sorts the vulnerability table most-severe-first regardless of input order', () => {
    // Input deliberately reversed (low before critical); output must still list
    // the critical row before the low row.
    const html = generateExecutiveReportHTML(
      reportData([vuln({ id: 'CVE-LOW', severity: 'low' }), vuln({ id: 'CVE-CRIT', severity: 'critical' })]),
      options,
      metrics,
    )

    expect(html.indexOf('CVE-CRIT')).toBeLessThan(html.indexOf('CVE-LOW'))
  })

  it('renders the CVSS vector when present', () => {
    const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
    const html = generateExecutiveReportHTML(
      reportData([vuln({ id: 'CVE-V', severity: 'high', cvssScore: 7.5, cvssVector: vector })]),
      options,
      metrics,
    )

    expect(html).toContain(vector)
  })

  it("renders 'N/A' for a vulnerability with no CVSS vector", () => {
    const html = generateExecutiveReportHTML(
      reportData([vuln({ id: 'CVE-NV', severity: 'high', cvssScore: 7.5 })]),
      options,
      metrics,
    )

    // cvssScore is present (7.5), so the only N/A in the row is the vector cell.
    expect(html).toContain('N/A')
  })
})
