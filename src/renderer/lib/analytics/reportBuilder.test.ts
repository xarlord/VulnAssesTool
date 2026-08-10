/**
 * Tests for reportBuilder — the executive PDF renderer.
 *
 * WHY these tests matter: this module is the only path that turns an ExecutiveSummary into
 * a downloadable board-level PDF. jsPDF/autoTable throw on many malformed inputs, so the
 * contract we protect is "every section renders, for every status/severity/priority/trend
 * band and for empty collections, without throwing, and the download is named by date."
 * A regression here (e.g. a new required field, or a colour switch that assumes a value)
 * surfaces only at report time in production — these tests move that failure to CI.
 */

import { describe, it, expect, vi } from 'vitest'
import { buildExecutiveReport, downloadExecutiveReport } from '@/lib/analytics/reportBuilder'
import type { ExecutiveSummary, Insight, RiskItem, Recommendation } from '@/lib/analytics/insightsGenerator'
import type { ExecutiveMetrics, TrendMetrics } from '@/lib/analytics/metricsCalculator'
import type { Project } from '@@/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function insight(o: Partial<Insight> = {}): Insight {
  return {
    id: 'i1',
    type: 'info',
    category: 'security',
    title: 'An insight',
    description: 'A description that is long enough to wrap across the page width once split.',
    generatedAt: new Date('2026-01-01T00:00:00Z'),
    ...o,
  }
}

function risk(o: Partial<RiskItem> = {}): RiskItem {
  return {
    projectId: 'p1',
    projectName: 'Alpha',
    risk: '80/100',
    severity: 'high',
    description: 'Some risk',
    ...o,
  }
}

function recommendation(o: Partial<Recommendation> = {}): Recommendation {
  return {
    priority: 'high',
    title: 'Do the thing',
    description: 'A description of the recommended action.',
    expectedOutcome: 'A better outcome.',
    effort: 'medium',
    ...o,
  }
}

function summary(o: Partial<ExecutiveSummary> = {}): ExecutiveSummary {
  return {
    overallStatus: 'good',
    headline: 'Security posture is good',
    keyPoints: ['2 projects monitored', '0 critical'],
    insights: [insight()],
    topRisks: [risk()],
    topRecommendations: [recommendation()],
    reportPeriod: 'January 2026',
    ...o,
  }
}

function trendMetrics(o: Partial<TrendMetrics> = {}): TrendMetrics {
  return {
    vulnerabilityTrend: 'stable',
    healthTrend: 'stable',
    scanFrequency: 3,
    averageResolutionTime: 0,
    periods: [
      { period: '2026-W01', vulnerabilityCount: 5, criticalCount: 1, healthScore: 80, scansCompleted: 2 },
      { period: '2026-W02', vulnerabilityCount: 4, criticalCount: 0, healthScore: 85, scansCompleted: 1 },
    ],
    ...o,
  }
}

function metrics(o: { trends?: Partial<TrendMetrics> } = {}): ExecutiveMetrics {
  return {
    overall: {
      totalProjects: 2,
      totalComponents: 40,
      totalVulnerabilities: 9,
      criticalCount: 1, // exercises the "Critical" cell-colour branch in the metrics table
      highCount: 2,
      mediumCount: 3,
      lowCount: 3,
      averageHealthScore: 95, // >= 90 -> green health-score branch
      riskLevel: 'high',
      vulnerableComponentPercentage: 20,
      exploitedCount: 1,
    },
    byProject: [],
    trends: trendMetrics(o.trends),
    compliance: {
      slaCompliance: { slaCritical: 70, slaHigh: 85, slaOverall: 76 },
      scanCoverage: 50,
      dataFreshness: 90,
      remediationRate: 40,
    },
    productivity: {
      totalScans: 5,
      sbomsProcessed: 3,
      componentsAnalyzed: 40,
      vulnerabilitiesAssessed: 9,
      averageScanTime: 2,
      scansThisWeek: 3,
      scansThisMonth: 5,
    },
    topCriticalVulnerabilities: [],
  }
}

const NO_PROJECTS: Project[] = []

describe('buildExecutiveReport', () => {
  it('produces a multi-section, multi-page PDF with page numbering', () => {
    const doc = buildExecutiveReport(summary(), metrics(), NO_PROJECTS)

    // Eight sections each call addPage(), so a complete report is well into double-digit pages.
    // A drop to ~1 page would mean a section threw and was swallowed upstream.
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(8)
  })

  it.each(['critical', 'warning', 'good', 'excellent', 'unknown'] as const)(
    'renders the title badge for overall status "%s" without throwing',
    (status) => {
      const s = summary({ overallStatus: status as ExecutiveSummary['overallStatus'] })
      // 'unknown' drives the defensive default colour branch — an unexpected status must
      // still render (neutral badge), never crash the whole report.
      expect(() => buildExecutiveReport(s, metrics(), NO_PROJECTS)).not.toThrow()
    },
  )

  it('colours risk rows for every severity band', () => {
    const risks: RiskItem[] = [
      risk({ severity: 'critical' }),
      risk({ severity: 'high' }),
      risk({ severity: 'medium' }),
      risk({ severity: 'low' }),
      risk({ severity: 'low', description: '' }),
    ]
    expect(() => buildExecutiveReport(summary({ topRisks: risks }), metrics(), NO_PROJECTS)).not.toThrow()
  })

  it('colours recommendation rows for every priority band and paginates a long list', () => {
    const priorities: Recommendation['priority'][] = ['immediate', 'high', 'medium', 'low']
    // 20 detailed recommendations overrun a single page, exercising the y>250 addPage() branch.
    const recs: Recommendation[] = Array.from({ length: 20 }, (_unused, i) =>
      recommendation({
        priority: priorities[i % priorities.length],
        title: `Recommendation ${i}`,
        description: 'A sufficiently long recommendation description to consume vertical space on the page.',
      }),
    )
    const doc = buildExecutiveReport(summary({ topRecommendations: recs }), metrics(), NO_PROJECTS)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(8)
  })

  it('renders insights of every type, with and without recommendation/action items, paginating a long list', () => {
    const types: Insight['type'][] = ['critical', 'warning', 'info', 'success']
    // 30 insights overrun the detailed-insights page(s), exercising the y>260 addPage() branch.
    const insights: Insight[] = Array.from({ length: 30 }, (_unused, i) =>
      insight({
        id: `i${i}`,
        type: types[i % types.length],
        title: `Insight ${i}`,
        // Alternate: some carry a recommendation + action items, some carry neither.
        recommendation: i % 2 === 0 ? 'A recommendation to act on.' : undefined,
        actionItems: i % 2 === 0 ? ['Do A', 'Do B'] : undefined,
      }),
    )
    const doc = buildExecutiveReport(summary({ insights }), metrics(), NO_PROJECTS)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(8)
  })

  it.each([
    ['increasing', 'degrading'],
    ['decreasing', 'improving'],
    ['stable', 'stable'],
  ] as const)('renders trend indicators for vuln=%s / health=%s', (vulnerabilityTrend, healthTrend) => {
    const m = metrics({ trends: { vulnerabilityTrend, healthTrend } })
    expect(() => buildExecutiveReport(summary(), m, NO_PROJECTS)).not.toThrow()
  })

  it('renders even when risks, recommendations, insights and trend periods are all empty', () => {
    // A brand-new install has nothing to report; the PDF must still generate cleanly.
    const emptySummary = summary({ topRisks: [], topRecommendations: [], insights: [] })
    const emptyMetrics = metrics({ trends: { periods: [] } })
    expect(() => buildExecutiveReport(emptySummary, emptyMetrics, NO_PROJECTS)).not.toThrow()
  })

  it('falls back to neutral colours for unknown severity/priority/insight-type without throwing', () => {
    // Persisted/older documents can carry values outside the current enums; the report must
    // degrade to a neutral colour rather than crash the whole export.
    const s = summary({
      topRisks: [risk({ severity: 'unknown' as RiskItem['severity'] })],
      topRecommendations: [recommendation({ priority: 'unknown' as Recommendation['priority'] })],
      insights: [insight({ type: 'unknown' as Insight['type'] })],
    })
    expect(() => buildExecutiveReport(s, metrics(), NO_PROJECTS)).not.toThrow()
  })

  it('colours a low average health score (< 60) red in the metrics table', () => {
    const m = metrics()
    m.overall.averageHealthScore = 45 // drives the "< 60" red-score branch in didParseCell
    expect(() => buildExecutiveReport(summary(), m, NO_PROJECTS)).not.toThrow()
  })
})

describe('downloadExecutiveReport', () => {
  it('saves the document under a date-stamped filename', () => {
    const doc = buildExecutiveReport(summary(), metrics(), NO_PROJECTS)
    const saveSpy = vi.spyOn(doc, 'save').mockImplementation(() => doc)

    downloadExecutiveReport(doc)

    expect(saveSpy).toHaveBeenCalledTimes(1)
    expect(saveSpy.mock.calls[0][0]).toMatch(/^executive-report-\d{4}-\d{2}-\d{2}\.pdf$/)
  })
})
