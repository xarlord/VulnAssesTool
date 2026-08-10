/**
 * Tests for the executive report HTML template (FR-09.2).
 *
 * The vulnerability table must be sorted most-severe-first (so a reader skimming
 * top-to-bottom sees the highest-priority findings first) and must render the
 * CVSS vector, not just the score. The template also has three optional sections
 * (executive summary, severity chart, recommendations) gated by ReportOptions
 * flags, plus several defensive fallbacks (unknown risk level / severity) that
 * must degrade gracefully instead of crashing a report mid-generation — those
 * are exercised below.
 */

import { describe, it, expect } from 'vitest'
import { generateExecutiveReportHTML } from './executiveReport'
import type { ReportOptions, ReportData, ExecutiveSummaryMetrics } from '../types'
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

function baseOptions(overrides: Partial<ReportOptions> = {}): ReportOptions {
  return {
    title: 'Test Report',
    projectName: 'Test Project',
    includeExecutiveSummary: false,
    includeCharts: false,
    includeRecommendations: false,
    ...overrides,
  }
}

function baseMetrics(overrides: Partial<ExecutiveSummaryMetrics> = {}): ExecutiveSummaryMetrics {
  return {
    overallRiskScore: 50,
    riskLevel: 'Medium',
    trend: 'stable',
    keyFindings: [],
    topVulnerableComponents: [],
    recommendedActions: [],
    ...overrides,
  }
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
      baseOptions(),
      baseMetrics(),
    )

    expect(html.indexOf('CVE-CRIT')).toBeLessThan(html.indexOf('CVE-LOW'))
  })

  it('renders the CVSS vector when present', () => {
    const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
    const html = generateExecutiveReportHTML(
      reportData([vuln({ id: 'CVE-V', severity: 'high', cvssScore: 7.5, cvssVector: vector })]),
      baseOptions(),
      baseMetrics(),
    )

    expect(html).toContain(vector)
  })

  it("renders 'N/A' for a vulnerability with no CVSS vector", () => {
    const html = generateExecutiveReportHTML(
      reportData([vuln({ id: 'CVE-NV', severity: 'high', cvssScore: 7.5 })]),
      baseOptions(),
      baseMetrics(),
    )

    // cvssScore is present (7.5), so the only N/A in the row is the vector cell.
    expect(html).toContain('N/A')
  })
})

describe('generateExecutiveReportHTML — executive summary section', () => {
  it('omits the executive summary section when includeExecutiveSummary is false', () => {
    // Note: the stylesheet has an unconditional `/* Executive Summary */` comment, so
    // the assertion must target the actual content div, not the bare heading text.
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeExecutiveSummary: false }),
      baseMetrics(),
    )

    expect(html).not.toContain('<div class="executive-summary">')
  })

  it('renders the risk badge and key findings when includeExecutiveSummary is true', () => {
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeExecutiveSummary: true }),
      baseMetrics({ riskLevel: 'High', overallRiskScore: 72, keyFindings: ['3 critical CVEs need patching'] }),
    )

    expect(html).toContain('<div class="executive-summary">')
    expect(html).toContain('Overall Risk: High (72/100)')
    expect(html).toContain('3 critical CVEs need patching')
  })

  it.each(['Critical', 'High', 'Medium', 'Low'] as const)('colors the risk badge for risk level "%s"', (riskLevel) => {
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeExecutiveSummary: true }),
      baseMetrics({ riskLevel }),
    )

    expect(html).toContain(`Overall Risk: ${riskLevel}`)
  })

  it('falls back to a neutral badge instead of crashing on an unrecognized risk level', () => {
    // Defensive branch: a persisted report (or a future risk-level value outside the
    // current enum) must still render — never throw and blank the whole report.
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeExecutiveSummary: true }),
      baseMetrics({ riskLevel: 'Unknown' as ExecutiveSummaryMetrics['riskLevel'] }),
    )

    expect(html).toContain('Overall Risk: Unknown')
  })

  it('omits the "Top Vulnerable Components" block when there are none', () => {
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeExecutiveSummary: true }),
      baseMetrics({ topVulnerableComponents: [] }),
    )

    expect(html).not.toContain('Top Vulnerable Components')
  })

  it('lists a vulnerable component with its name, version and vulnerability count', () => {
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeExecutiveSummary: true }),
      baseMetrics({
        topVulnerableComponents: [
          { name: 'openssl', version: '1.1.1', vulnerabilityCount: 4, highestSeverity: 'critical' },
        ],
      }),
    )

    expect(html).toContain('Top Vulnerable Components')
    expect(html).toContain('openssl@1.1.1')
    expect(html).toContain('4 vulnerabilities')
  })

  it('caps the rendered component list at the 5 most vulnerable, dropping the rest', () => {
    const components = Array.from({ length: 8 }, (entry, i) => ({
      name: `pkg-${i}`,
      version: '1.0.0',
      vulnerabilityCount: 1,
      highestSeverity: 'low',
    }))
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeExecutiveSummary: true }),
      baseMetrics({ topVulnerableComponents: components }),
    )

    expect(html).toContain('pkg-4@1.0.0')
    expect(html).not.toContain('pkg-5@1.0.0')
  })

  it('falls back to a neutral badge for a component with an unrecognized highestSeverity', () => {
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeExecutiveSummary: true }),
      baseMetrics({
        topVulnerableComponents: [
          { name: 'weird-pkg', version: '2.0.0', vulnerabilityCount: 1, highestSeverity: 'unknown' },
        ],
      }),
    )

    expect(html).toContain('weird-pkg@2.0.0')
  })
})

describe('generateExecutiveReportHTML — severity distribution chart', () => {
  it('omits the severity chart when includeCharts is false', () => {
    const html = generateExecutiveReportHTML(reportData([]), baseOptions({ includeCharts: false }), baseMetrics())

    expect(html).not.toContain('Vulnerability Distribution by Severity')
  })

  it('renders a bar per severity band reflecting the statistics counts', () => {
    const data = reportData([])
    data.statistics.criticalCount = 3
    data.statistics.highCount = 5

    const html = generateExecutiveReportHTML(data, baseOptions({ includeCharts: true }), baseMetrics())

    expect(html).toContain('Vulnerability Distribution by Severity')
    expect(html).toContain('<div class="bar-value">3</div>')
    expect(html).toContain('<div class="bar-value">5</div>')
  })

  it('renders the chart without a divide-by-zero artifact when every count is 0', () => {
    // generateSeverityChart floors its divisor at 1 specifically so an all-zero
    // project (nothing scanned yet) doesn't render "NaN" bar heights.
    const html = generateExecutiveReportHTML(reportData([]), baseOptions({ includeCharts: true }), baseMetrics())

    expect(html).not.toContain('NaN')
  })
})

describe('generateExecutiveReportHTML — recommendations section', () => {
  it('omits the recommendations section when includeRecommendations is false', () => {
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeRecommendations: false }),
      baseMetrics({ recommendedActions: ['Patch openssl'] }),
    )

    expect(html).not.toContain('Recommended Actions')
  })

  it('numbers each recommended action in the order supplied', () => {
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({ includeRecommendations: true }),
      baseMetrics({ recommendedActions: ['Patch openssl', 'Upgrade libxml2'] }),
    )

    expect(html).toContain('Recommended Actions')
    expect(html.indexOf('Patch openssl')).toBeLessThan(html.indexOf('Upgrade libxml2'))
  })

  it('renders an empty recommendations section without throwing when there are no actions', () => {
    expect(() =>
      generateExecutiveReportHTML(
        reportData([]),
        baseOptions({ includeRecommendations: true }),
        baseMetrics({ recommendedActions: [] }),
      ),
    ).not.toThrow()
  })
})

describe('generateExecutiveReportHTML — vulnerability table', () => {
  it('breaks a severity tie by the higher CVSS score first', () => {
    const html = generateExecutiveReportHTML(
      reportData([
        vuln({ id: 'CVE-LOW-CVSS', severity: 'high', cvssScore: 4 }),
        vuln({ id: 'CVE-HIGH-CVSS', severity: 'high', cvssScore: 8.9 }),
      ]),
      baseOptions(),
      baseMetrics(),
    )

    expect(html.indexOf('CVE-HIGH-CVSS')).toBeLessThan(html.indexOf('CVE-LOW-CVSS'))
  })

  it('renders a row with a fallback badge color for a severity outside the known set', () => {
    // Legacy data or an unexpected severity string must still render a row, not
    // crash the whole table.
    const html = generateExecutiveReportHTML(
      reportData([vuln({ id: 'CVE-WEIRD', severity: 'unknown' as Vulnerability['severity'] })]),
      baseOptions(),
      baseMetrics(),
    )

    expect(html).toContain('CVE-WEIRD')
  })

  it("shows 'No description' when a vulnerability has no description", () => {
    const html = generateExecutiveReportHTML(
      reportData([vuln({ id: 'CVE-NODESC', description: undefined })]),
      baseOptions(),
      baseMetrics(),
    )

    expect(html).toContain('No description')
  })

  it('truncates a description over 100 characters and appends an ellipsis', () => {
    const longDescription = 'A'.repeat(150)
    const html = generateExecutiveReportHTML(
      reportData([vuln({ id: 'CVE-LONGDESC', description: longDescription })]),
      baseOptions(),
      baseMetrics(),
    )

    expect(html).toContain(`${'A'.repeat(100)}...`)
    expect(html).not.toContain('A'.repeat(101))
  })

  it('does not append an ellipsis to a description of 100 characters or fewer', () => {
    const shortDescription = 'B'.repeat(50)
    const html = generateExecutiveReportHTML(
      reportData([vuln({ id: 'CVE-SHORTDESC', description: shortDescription })]),
      baseOptions(),
      baseMetrics(),
    )

    expect(html).toContain(shortDescription)
    expect(html).not.toContain(`${shortDescription}...`)
  })

  it('caps the table at 50 rows and notes the true count when there are more', () => {
    const many = Array.from({ length: 55 }, (entry, i) => vuln({ id: `CVE-${String(i).padStart(4, '0')}` }))

    const html = generateExecutiveReportHTML(reportData(many), baseOptions(), baseMetrics())

    expect(html).toContain('CVE-0000')
    expect(html).not.toContain('CVE-0054')
    expect(html).toContain('Showing 50 of 55 vulnerabilities')
  })

  it('does not show the overflow note at exactly 50 vulnerabilities', () => {
    const fifty = Array.from({ length: 50 }, (entry, i) => vuln({ id: `CVE-${String(i).padStart(4, '0')}` }))

    const html = generateExecutiveReportHTML(reportData(fifty), baseOptions(), baseMetrics())

    expect(html).not.toContain('Showing 50 of')
  })
})

describe('generateExecutiveReportHTML — header/footer optional fields and theme', () => {
  it('renders the company logo, "Generated by" line and company footer when all are provided', () => {
    const html = generateExecutiveReportHTML(
      reportData([]),
      baseOptions({
        companyLogo: 'data:image/png;base64,iVBORw0KGgo=',
        generatedBy: 'Jane Analyst',
        companyName: 'Acme Corp',
      }),
      baseMetrics(),
    )

    // Note: the stylesheet has an unconditional `.company-logo { ... }` CSS rule, so
    // the assertion must target the actual <img> tag, not the bare class name.
    expect(html).toContain('<img')
    expect(html).toContain('data:image/png;base64,iVBORw0KGgo=')
    expect(html).toContain('By: Jane Analyst')
    expect(html).toContain('Acme Corp')
  })

  it('omits the logo, "Generated by" line and company footer when none are provided', () => {
    const html = generateExecutiveReportHTML(reportData([]), baseOptions(), baseMetrics())

    expect(html).not.toContain('<img')
    expect(html).not.toContain('By:')
  })

  it('applies dark theme colors when theme is "dark"', () => {
    // '#1E293B' is used only on the isDark-true side of every themed rule in the
    // stylesheet (verified against the source), so it safely distinguishes dark
    // from light — several other theme hex values are reused on both sides.
    const html = generateExecutiveReportHTML(reportData([]), baseOptions({ theme: 'dark' }), baseMetrics())

    expect(html).toContain('#1E293B')
  })

  it('defaults to light theme colors when theme is not specified', () => {
    const html = generateExecutiveReportHTML(reportData([]), baseOptions(), baseMetrics())

    expect(html).not.toContain('#1E293B')
  })
})
