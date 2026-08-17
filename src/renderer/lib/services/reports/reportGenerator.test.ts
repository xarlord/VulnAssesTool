/**
 * Tests for reportGenerator.generatePDF (FR-09.2).
 *
 * generatePDF must produce a real PDF blob through the jsPDF builder and must NOT
 * route through the old getPlatform().generatePDF path, which flattened HTML to
 * bare text (no chart, no logo).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

const { buildSpy, platformGeneratePdf } = vi.hoisted(() => ({
  buildSpy: vi.fn(() => ({ output: () => new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' }) })),
  platformGeneratePdf: vi.fn(() => new Uint8Array([1, 2, 3])),
}))

vi.mock('./executiveReportPdf', () => ({ buildExecutiveReportPdf: buildSpy }))
vi.mock('@/lib/platform', () => ({ getPlatform: () => ({ generatePDF: platformGeneratePdf }) }))

import { generatePDF, downloadReport, ReportGenerator } from './reportGenerator'
import type { ReportData, ReportOptions, ReportStatistics, RiskScoreResult } from './types'
import type { Project, Vulnerability, Component } from '@@/types'

const options: ReportOptions = {
  title: 'Report',
  projectName: 'Test Project',
  includeExecutiveSummary: true,
  includeCharts: true,
  includeRecommendations: true,
}

const data: ReportData = {
  project: { id: 'p1', name: 'Test Project' } as Project,
  vulnerabilities: [],
  components: [],
  statistics: {
    totalVulnerabilities: 0,
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

describe('generatePDF (FR-09.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('produces a PDF blob via the jsPDF builder and no longer calls the platform HTML-flatten path', async () => {
    const report = await generatePDF(data, options)

    expect(report.contentType).toBe('application/pdf')
    expect(report.content).toBeInstanceOf(Blob)
    expect(report.filename.endsWith('.pdf')).toBe(true)
    expect(buildSpy).toHaveBeenCalled()
    // The teeth: the text-flattening round-trip must be replaced, not supplemented.
    expect(platformGeneratePdf).not.toHaveBeenCalled()
  })
})

/**
 * Tests for ReportGenerator.calculateMetrics branch coverage.
 *
 * calculateMetrics decides risk level, key findings, and recommended actions from
 * report data. These tests pin the intent behind each branch: real per-vulnerability
 * risk scores must win over the severity heuristic, level thresholds fire from either
 * side of their `||`, and lookups against the components list degrade gracefully
 * instead of crashing on malformed/missing data.
 */
function stats(overrides: Partial<ReportStatistics>): ReportStatistics {
  return {
    totalVulnerabilities: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    noneCount: 0,
    totalComponents: 0,
    vulnerableComponents: 0,
    kevCount: 0,
    avgEpssScore: 0,
    ...overrides,
  }
}

function metricsData(overrides: Partial<ReportData>): ReportData {
  return {
    project: { id: 'p1', name: 'Test Project' } as Project,
    vulnerabilities: [],
    components: [],
    statistics: stats({}),
    ...overrides,
  }
}

function vuln(overrides: Partial<Vulnerability>): Vulnerability {
  return {
    id: 'CVE-0000',
    source: 'nvd',
    severity: 'medium',
    description: '',
    references: [],
    affectedComponents: [],
    ...overrides,
  }
}

function riskScore(score: number): RiskScoreResult {
  return { score, factors: { kev: 0, epss: 0, severity: 0 }, breakdown: '' }
}

describe('ReportGenerator.calculateMetrics', () => {
  describe('overall risk score source', () => {
    it('averages real per-vulnerability risk scores instead of the severity heuristic when scores are supplied', () => {
      const riskScores = new Map<string, RiskScoreResult>([
        ['CVE-1', riskScore(80)],
        ['CVE-2', riskScore(40)],
      ])
      // criticalCount:5 would dominate the severity-weighted fallback (score 40 * total)
      // if the fallback were used instead of the real average — proves the branch taken.
      const result = ReportGenerator.calculateMetrics(
        metricsData({ riskScores, statistics: stats({ totalVulnerabilities: 2, criticalCount: 5 }) }),
      )

      expect(result.overallRiskScore).toBe(60)
    })

    it('falls back to the severity-weighted estimate when the risk score map is present but empty', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({ riskScores: new Map(), statistics: stats({ totalVulnerabilities: 1, criticalCount: 1 }) }),
      )

      // weights.critical (40) * 1 critical / total (1) = 40 — only reachable via the fallback path.
      expect(result.overallRiskScore).toBe(40)
    })

    it('does not divide by zero when totalVulnerabilities is 0 despite nonzero severity counts', () => {
      const result = ReportGenerator.calculateMetrics(metricsData({ statistics: stats({ highCount: 2 }) }))

      expect(Number.isNaN(result.overallRiskScore)).toBe(false)
      expect(result.overallRiskScore).toBe(50)
    })
  })

  describe('risk level thresholds', () => {
    it('labels risk Critical when a critical vulnerability exists even though the computed score is low', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({ riskScores: new Map([['CVE-1', riskScore(10)]]), statistics: stats({ criticalCount: 1 }) }),
      )
      expect(result.riskLevel).toBe('Critical')
    })

    it('labels risk Critical purely from a high computed score when no critical vulnerabilities exist', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({ riskScores: new Map([['CVE-1', riskScore(75)]]), statistics: stats({}) }),
      )
      expect(result.riskLevel).toBe('Critical')
    })

    it('labels risk High when more than three high-severity vulnerabilities exist despite a low score', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({ riskScores: new Map([['CVE-1', riskScore(10)]]), statistics: stats({ highCount: 4 }) }),
      )
      expect(result.riskLevel).toBe('High')
    })

    it('labels risk High from a mid-range computed score alone', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({ riskScores: new Map([['CVE-1', riskScore(55)]]), statistics: stats({}) }),
      )
      expect(result.riskLevel).toBe('High')
    })

    it('labels risk Medium when more than five medium-severity vulnerabilities exist despite a low score', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({ riskScores: new Map([['CVE-1', riskScore(5)]]), statistics: stats({ mediumCount: 6 }) }),
      )
      expect(result.riskLevel).toBe('Medium')
    })

    it('labels risk Medium from a low-but-nonzero computed score alone', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({ riskScores: new Map([['CVE-1', riskScore(30)]]), statistics: stats({}) }),
      )
      expect(result.riskLevel).toBe('Medium')
    })

    it('labels risk Low when the score and every severity count fall below all thresholds', () => {
      const result = ReportGenerator.calculateMetrics(metricsData({}))
      expect(result.riskLevel).toBe('Low')
    })
  })

  describe('key findings', () => {
    it('warns about the CISA KEV catalog only when KEV-listed vulnerabilities are present', () => {
      const withKev = ReportGenerator.calculateMetrics(
        metricsData({ statistics: stats({ kevCount: 2, totalComponents: 1, vulnerableComponents: 1 }) }),
      )
      const without = ReportGenerator.calculateMetrics(
        metricsData({ statistics: stats({ totalComponents: 1, vulnerableComponents: 1 }) }),
      )
      expect(withKev.keyFindings.some((f) => f.includes('Known Exploited Vulnerabilities'))).toBe(true)
      expect(without.keyFindings.some((f) => f.includes('Known Exploited Vulnerabilities'))).toBe(false)
    })

    it('warns about elevated exploitation risk only when average EPSS exceeds 50%', () => {
      const highEpss = ReportGenerator.calculateMetrics(
        metricsData({ statistics: stats({ avgEpssScore: 0.9, totalComponents: 1, vulnerableComponents: 1 }) }),
      )
      const lowEpss = ReportGenerator.calculateMetrics(
        metricsData({ statistics: stats({ avgEpssScore: 0.4, totalComponents: 1, vulnerableComponents: 1 }) }),
      )
      expect(highEpss.keyFindings.some((f) => f.includes('EPSS'))).toBe(true)
      expect(lowEpss.keyFindings.some((f) => f.includes('EPSS'))).toBe(false)
    })

    it('flags critical vulnerabilities requiring immediate attention only when they are present', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({ statistics: stats({ criticalCount: 3, totalComponents: 1, vulnerableComponents: 1 }) }),
      )
      expect(result.keyFindings.some((f) => f.includes('critical vulnerabilities require immediate attention'))).toBe(
        true,
      )
    })
  })

  describe('top vulnerable components lookup', () => {
    it('falls back to the raw component id and "unknown" version when the component is not in the components list', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({ vulnerabilities: [vuln({ affectedComponents: ['missing-comp'] })], components: [] }),
      )
      expect(result.topVulnerableComponents[0]).toMatchObject({ name: 'missing-comp', version: 'unknown' })
    })

    it('uses the resolved component name and version when the affected component is found in the components list', () => {
      const comp: Component = {
        id: 'c1',
        name: 'lodash',
        version: '4.17.21',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
        dependencies: [],
      }
      const result = ReportGenerator.calculateMetrics(
        metricsData({ vulnerabilities: [vuln({ affectedComponents: ['c1'] })], components: [comp] }),
      )
      expect(result.topVulnerableComponents[0]).toMatchObject({ name: 'lodash', version: '4.17.21' })
    })

    it('treats a vulnerability record missing affectedComponents as affecting nothing, without throwing', () => {
      const malformed = {
        id: 'CVE-X',
        source: 'nvd',
        severity: 'high',
        description: '',
        references: [],
      } as unknown as Vulnerability

      expect(() => ReportGenerator.calculateMetrics(metricsData({ vulnerabilities: [malformed] }))).not.toThrow()
      const result = ReportGenerator.calculateMetrics(metricsData({ vulnerabilities: [malformed] }))
      expect(result.topVulnerableComponents).toEqual([])
    })

    it('keeps the most severe rating for a component when a less-severe duplicate is recorded afterward', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({
          vulnerabilities: [
            vuln({ id: 'CVE-A', severity: 'critical', affectedComponents: ['c1'] }),
            vuln({ id: 'CVE-B', severity: 'low', affectedComponents: ['c1'] }),
          ],
        }),
      )
      expect(result.topVulnerableComponents[0]).toMatchObject({ vulnerabilityCount: 2, highestSeverity: 'critical' })
    })

    it('upgrades the recorded severity for a component when a more-severe duplicate is recorded afterward', () => {
      const result = ReportGenerator.calculateMetrics(
        metricsData({
          vulnerabilities: [
            vuln({ id: 'CVE-A', severity: 'low', affectedComponents: ['c1'] }),
            vuln({ id: 'CVE-B', severity: 'critical', affectedComponents: ['c1'] }),
          ],
        }),
      )
      expect(result.topVulnerableComponents[0]).toMatchObject({ vulnerabilityCount: 2, highestSeverity: 'critical' })
    })
  })

  describe('recommended actions', () => {
    it('recommends immediate remediation only when critical vulnerabilities are present', () => {
      const withCritical = ReportGenerator.calculateMetrics(
        metricsData({ statistics: stats({ criticalCount: 1, totalComponents: 1 }) }),
      )
      const without = ReportGenerator.calculateMetrics(metricsData({ statistics: stats({ totalComponents: 1 }) }))
      expect(withCritical.recommendedActions.some((a) => a.includes('immediately'))).toBe(true)
      expect(without.recommendedActions.some((a) => a.includes('immediately'))).toBe(false)
    })

    it('recommends prioritizing KEV-listed vulnerabilities only when KEV entries are present', () => {
      const withKev = ReportGenerator.calculateMetrics(
        metricsData({ statistics: stats({ kevCount: 1, totalComponents: 1 }) }),
      )
      const without = ReportGenerator.calculateMetrics(metricsData({ statistics: stats({ totalComponents: 1 }) }))
      expect(withKev.recommendedActions.some((a) => a.includes('KEV-listed'))).toBe(true)
      expect(without.recommendedActions.some((a) => a.includes('KEV-listed'))).toBe(false)
    })

    it('recommends sprint scheduling only when high-severity vulnerabilities are present', () => {
      const withHigh = ReportGenerator.calculateMetrics(
        metricsData({ statistics: stats({ highCount: 1, totalComponents: 1 }) }),
      )
      const without = ReportGenerator.calculateMetrics(metricsData({ statistics: stats({ totalComponents: 1 }) }))
      expect(withHigh.recommendedActions.some((a) => a.includes('next sprint'))).toBe(true)
      expect(without.recommendedActions.some((a) => a.includes('next sprint'))).toBe(false)
    })
  })
})

/**
 * Tests for downloadReport (FR-09.2 delivery path).
 *
 * downloadReport must hand a Blob straight to the object URL without re-wrapping it,
 * but must wrap plain string HTML content in a Blob first — mirroring the established
 * download-trigger convention used by csv.ts/json.ts (see lib/export/csv.test.ts).
 */
describe('downloadReport', () => {
  const mockClick = vi.fn()
  const mockLinkElement = { href: '', download: '', click: mockClick }
  const mockCreateElement = vi.fn(() => mockLinkElement)
  const mockAppendChild = vi.fn()
  const mockRemoveChild = vi.fn()
  const mockCreateObjectURL = vi.fn(() => 'mock-url')
  const mockRevokeObjectURL = vi.fn()

  Object.defineProperty(global, 'document', {
    value: {
      createElement: mockCreateElement,
      body: { appendChild: mockAppendChild, removeChild: mockRemoveChild },
    },
    writable: true,
  })

  Object.defineProperty(global, 'URL', {
    value: { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL },
    writable: true,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockLinkElement.href = ''
    mockLinkElement.download = ''
  })

  it('passes Blob content straight through to the object URL instead of re-wrapping it', () => {
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    downloadReport({ content: blob, contentType: 'application/pdf', filename: 'report.pdf', size: blob.size })

    expect(mockCreateObjectURL).toHaveBeenCalledWith(blob)
    expect(mockLinkElement.download).toBe('report.pdf')
    expect(mockClick).toHaveBeenCalled()
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('mock-url')
  })

  it('wraps plain string HTML content in a Blob with the report content type before downloading', () => {
    downloadReport({ content: '<html></html>', contentType: 'text/html', filename: 'report.html', size: 10 })

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1)
    const passed = mockCreateObjectURL.mock.calls[0][0]
    expect(passed).toBeInstanceOf(Blob)
    expect((passed as Blob).type).toBe('text/html')
    expect(mockLinkElement.download).toBe('report.html')
  })
})
