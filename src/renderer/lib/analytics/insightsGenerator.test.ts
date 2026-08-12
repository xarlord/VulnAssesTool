/**
 * Tests for insightsGenerator — the Executive-Dashboard narrative layer (FR-06.x).
 *
 * WHY these tests matter: the generator turns raw metrics into the risk narrative an
 * executive acts on. The mapping from a metric crossing a threshold to a specific insight,
 * recommendation, headline and overall status IS the business logic — if a critical-vuln
 * count stopped producing a 'critical' insight, or a HIGH-risk project stopped surfacing,
 * the dashboard would silently under-report risk. Each test pins one such threshold→output
 * rule so a regression in the rule (not just the wording) fails the test.
 */

import { describe, it, expect } from 'vitest'
import { generateExecutiveSummary, generateInsights } from '@/lib/analytics/insightsGenerator'
import type {
  ExecutiveMetrics,
  OverallMetrics,
  ComplianceMetrics,
  TrendMetrics,
  ProductivityMetrics,
  ProjectMetrics,
} from '@/lib/analytics/metricsCalculator'
import type { Project } from '@@/types'

// ---------------------------------------------------------------------------
// Fixtures — a "clean" baseline (excellent posture, nothing wrong) that each
// test perturbs on exactly one axis, so a produced insight is attributable to
// that one change.
// ---------------------------------------------------------------------------

function overall(o: Partial<OverallMetrics> = {}): OverallMetrics {
  return {
    totalProjects: 2,
    totalComponents: 40,
    totalVulnerabilities: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    averageHealthScore: 95,
    riskLevel: 'excellent',
    vulnerableComponentPercentage: 0,
    exploitedCount: 0,
    ...o,
  }
}

function compliance(o: Partial<ComplianceMetrics> = {}): ComplianceMetrics {
  return {
    slaCompliance: { slaCritical: 100, slaHigh: 100, slaOverall: 100 },
    scanCoverage: 100,
    dataFreshness: 100,
    remediationRate: 100,
    ...o,
  }
}

function trends(o: Partial<TrendMetrics> = {}): TrendMetrics {
  return {
    vulnerabilityTrend: 'stable',
    healthTrend: 'stable',
    scanFrequency: 5,
    averageResolutionTime: 0,
    periods: [],
    ...o,
  }
}

function productivity(o: Partial<ProductivityMetrics> = {}): ProductivityMetrics {
  return {
    totalScans: 5,
    sbomsProcessed: 3,
    componentsAnalyzed: 40,
    vulnerabilitiesAssessed: 0,
    averageScanTime: 2,
    scansThisWeek: 3,
    scansThisMonth: 5,
    ...o,
  }
}

function projectMetric(o: Partial<ProjectMetrics> = {}): ProjectMetrics {
  return {
    projectId: 'p1',
    projectName: 'Alpha',
    healthScore: 95,
    vulnerabilityCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    componentCount: 20,
    vulnerableComponents: 0,
    fixableCount: 0,
    lastScanDate: new Date(),
    riskScore: 0,
    ...o,
  }
}

function metrics(o: Partial<ExecutiveMetrics> = {}): ExecutiveMetrics {
  return {
    overall: overall(),
    byProject: [],
    trends: trends(),
    compliance: compliance(),
    productivity: productivity(),
    topCriticalVulnerabilities: [],
    ...o,
  }
}

// generateSecurityInsights reads only `id` and `statistics.criticalCount` off each project,
// so a minimal shape is enough to prove the affectedProjects wiring.
function project(id: string, criticalCount: number): Project {
  return { id, statistics: { criticalCount } } as unknown as Project
}

const NEVER_SCANNED = undefined
const LONG_AGO = new Date('2000-01-01T00:00:00Z')

describe('generateExecutiveSummary', () => {
  it('assembles every section of the summary', () => {
    const summary = generateExecutiveSummary(metrics(), [])

    // The dashboard renders each of these; a missing key would blank a panel.
    expect(summary).toMatchObject({
      overallStatus: expect.any(String),
      headline: expect.any(String),
    })
    expect(Array.isArray(summary.keyPoints)).toBe(true)
    expect(Array.isArray(summary.insights)).toBe(true)
    expect(Array.isArray(summary.topRisks)).toBe(true)
    expect(Array.isArray(summary.topRecommendations)).toBe(true)
    expect(summary.reportPeriod).toMatch(/\d{4}/) // "Month YYYY"
  })
})

describe('security insights', () => {
  it('flags critical vulnerabilities and lists exactly the projects that carry them', () => {
    // WHY: the "critical" insight must name the affected projects so remediation can be routed;
    // only projects whose own criticalCount > 0 belong on that list.
    const summary = generateExecutiveSummary(metrics({ overall: overall({ criticalCount: 3 }) }), [
      project('affected', 2),
      project('clean', 0),
    ])

    const critical = summary.insights.find((i) => i.id === 'critical-vulns-detected')
    expect(critical?.type).toBe('critical')
    expect(critical?.affectedProjects).toEqual(['affected'])
    expect(critical?.actionItems?.length).toBeGreaterThan(0)
  })

  it('raises a critical-typed risk insight when overall risk level is critical', () => {
    const insights = generateInsights(
      metrics({ overall: overall({ riskLevel: 'critical', averageHealthScore: 30 }) }),
      [],
    )
    const risk = insights.find((i) => i.id === 'elevated-risk-level')
    expect(risk?.type).toBe('critical')
  })

  it('raises a warning-typed risk insight when overall risk level is high (not critical)', () => {
    // WHY: 'high' must warn, not scream 'critical' — the type drives badge colour and triage order.
    const insights = generateInsights(metrics({ overall: overall({ riskLevel: 'high' }) }), [])
    const risk = insights.find((i) => i.id === 'elevated-risk-level')
    expect(risk?.type).toBe('warning')
  })

  it('warns on a low average health score', () => {
    const insights = generateInsights(metrics({ overall: overall({ averageHealthScore: 55 }) }), [])
    expect(insights.some((i) => i.id === 'low-health-score')).toBe(true)
  })

  it('celebrates an excellent posture only when health is high AND there are no criticals', () => {
    const good = generateInsights(metrics({ overall: overall({ averageHealthScore: 95, criticalCount: 0 }) }), [])
    expect(good.some((i) => i.id === 'good-health-score')).toBe(true)

    // A single critical must suppress the success message even at a high health score.
    const withCritical = generateInsights(
      metrics({ overall: overall({ averageHealthScore: 95, criticalCount: 1 }) }),
      [],
    )
    expect(withCritical.some((i) => i.id === 'good-health-score')).toBe(false)
  })
})

describe('compliance insights', () => {
  it('warns when SLA compliance is below the 80% target', () => {
    const insights = generateInsights(
      metrics({ compliance: compliance({ slaCompliance: { slaCritical: 60, slaHigh: 70, slaOverall: 65 } }) }),
      [],
    )
    expect(insights.some((i) => i.id === 'sla-compliance-low')).toBe(true)
  })

  it('warns when scan coverage is below 80%', () => {
    const insights = generateInsights(metrics({ compliance: compliance({ scanCoverage: 50 }) }), [])
    expect(insights.some((i) => i.id === 'low-scan-coverage')).toBe(true)
  })

  it('flags stale vulnerability data below 70% freshness', () => {
    const insights = generateInsights(metrics({ compliance: compliance({ dataFreshness: 60 }) }), [])
    expect(insights.some((i) => i.id === 'stale-data-detected')).toBe(true)
  })

  it('produces no compliance insights when every compliance metric is healthy', () => {
    const insights = generateInsights(metrics(), [])
    expect(insights.some((i) => i.category === 'compliance' && i.type === 'warning')).toBe(false)
  })
})

describe('trend insights', () => {
  it('warns on an increasing vulnerability trend', () => {
    const insights = generateInsights(metrics({ trends: trends({ vulnerabilityTrend: 'increasing' }) }), [])
    const t = insights.find((i) => i.id === 'vulns-increasing')
    expect(t?.type).toBe('warning')
  })

  it('reports success on a decreasing vulnerability trend', () => {
    const insights = generateInsights(metrics({ trends: trends({ vulnerabilityTrend: 'decreasing' }) }), [])
    expect(insights.find((i) => i.id === 'vulns-decreasing')?.type).toBe('success')
  })

  it('reports success when health is improving and a warning when it is degrading', () => {
    const improving = generateInsights(metrics({ trends: trends({ healthTrend: 'improving' }) }), [])
    expect(improving.find((i) => i.id === 'health-improving')?.type).toBe('success')

    const degrading = generateInsights(metrics({ trends: trends({ healthTrend: 'degrading' }) }), [])
    expect(degrading.find((i) => i.id === 'health-degrading')?.type).toBe('warning')
  })

  it('warns when no scans ran in the past week (scanFrequency 0)', () => {
    const insights = generateInsights(metrics({ trends: trends({ scanFrequency: 0 }) }), [])
    expect(insights.some((i) => i.id === 'no-recent-scans')).toBe(true)
  })
})

describe('productivity insights', () => {
  it('nudges the user to start scanning when no scans have run', () => {
    const insights = generateInsights(metrics({ productivity: productivity({ totalScans: 0 }) }), [])
    expect(insights.some((i) => i.id === 'no-scans-performed')).toBe(true)
  })
})

describe('project-specific insights', () => {
  it('surfaces a high-risk project as critical at riskScore >= 85, warning otherwise', () => {
    const critical = generateInsights(
      metrics({ byProject: [projectMetric({ projectId: 'x', projectName: 'X', riskScore: 90, criticalCount: 3 })] }),
      [],
    )
    expect(critical.find((i) => i.id === 'high-risk-x')?.type).toBe('critical')

    const warning = generateInsights(
      metrics({ byProject: [projectMetric({ projectId: 'y', projectName: 'Y', riskScore: 72 })] }),
      [],
    )
    expect(warning.find((i) => i.id === 'high-risk-y')?.type).toBe('warning')
  })

  it('treats both never-scanned and long-ago-scanned projects as stale', () => {
    const insights = generateInsights(
      metrics({
        byProject: [
          projectMetric({ projectId: 'never', lastScanDate: NEVER_SCANNED }),
          projectMetric({ projectId: 'old', lastScanDate: LONG_AGO }),
        ],
      }),
      [],
    )
    const stale = insights.find((i) => i.id === 'stale-projects-detected')
    expect(stale?.affectedProjects).toEqual(expect.arrayContaining(['never', 'old']))
  })

  it('does not mark a freshly scanned, low-risk project as stale or high-risk', () => {
    const insights = generateInsights(metrics({ byProject: [projectMetric({ lastScanDate: new Date() })] }), [])
    expect(insights.some((i) => i.id === 'stale-projects-detected')).toBe(false)
    expect(insights.some((i) => i.id.startsWith('high-risk-'))).toBe(false)
  })
})

describe('top risks', () => {
  it('ranks projects by risk, caps at 5, and maps score to severity band', () => {
    const byProject = Array.from({ length: 7 }, (_unused, i) =>
      projectMetric({ projectId: `p${i}`, projectName: `P${i}`, riskScore: 90 - i * 12 }),
    )
    const summary = generateExecutiveSummary(metrics({ byProject }), [])

    expect(summary.topRisks).toHaveLength(5) // capped
    expect(summary.topRisks[0].severity).toBe('critical') // 90 -> critical
    // Descending by risk score.
    for (let i = 1; i < summary.topRisks.length; i++) {
      expect(Number.parseInt(summary.topRisks[i - 1].risk, 10)).toBeGreaterThanOrEqual(
        Number.parseInt(summary.topRisks[i].risk, 10),
      )
    }
  })

  it('describes a risk from its critical/high/never-scanned facts, or a default when none apply', () => {
    const summary = generateExecutiveSummary(
      metrics({
        byProject: [
          projectMetric({ projectId: 'a', riskScore: 88, criticalCount: 2, highCount: 1, lastScanDate: NEVER_SCANNED }),
          projectMetric({ projectId: 'b', riskScore: 55, criticalCount: 0, highCount: 0, lastScanDate: new Date() }),
        ],
      }),
      [],
    )
    const a = summary.topRisks.find((r) => r.projectId === 'a')
    expect(a?.severity).toBe('critical')
    expect(a?.description).toContain('critical')
    expect(a?.description).toContain('never scanned')

    const b = summary.topRisks.find((r) => r.projectId === 'b')
    expect(b?.severity).toBe('medium') // 55 -> medium band
    expect(b?.description).toBe('Elevated vulnerability count') // default when no specific facts
  })
})

describe('recommendations', () => {
  it('emits an immediate recommendation to patch when criticals exist', () => {
    const summary = generateExecutiveSummary(metrics({ overall: overall({ criticalCount: 4 }) }), [])
    const rec = summary.topRecommendations.find((r) => r.title === 'Address Critical Vulnerabilities')
    expect(rec?.priority).toBe('immediate')
  })

  it('recommends scanning stale projects, improving SLA, refreshing data, scanning cadence and high-risk work', () => {
    // One metrics object that trips every recommendation branch at once.
    const summary = generateExecutiveSummary(
      metrics({
        overall: overall({ criticalCount: 1 }),
        compliance: compliance({ slaCompliance: { slaCritical: 50, slaHigh: 50, slaOverall: 50 }, dataFreshness: 40 }),
        trends: trends({ scanFrequency: 1 }),
        byProject: [projectMetric({ riskScore: 80, lastScanDate: LONG_AGO })],
      }),
      [],
    )
    const titles = summary.topRecommendations.map((r) => r.title)
    expect(titles).toEqual(
      expect.arrayContaining([
        'Address Critical Vulnerabilities',
        'Scan Stale Projects',
        'Improve SLA Compliance',
        'Refresh Vulnerability Data',
        'Establish Regular Scanning Schedule',
        'Remediate High-Risk Projects',
      ]),
    )
  })

  it('emits no recommendations when everything is healthy', () => {
    const summary = generateExecutiveSummary(metrics(), [])
    expect(summary.topRecommendations).toHaveLength(0)
  })
})

describe('overall status', () => {
  it('is critical when any critical vuln exists', () => {
    expect(generateExecutiveSummary(metrics({ overall: overall({ criticalCount: 1 }) }), []).overallStatus).toBe(
      'critical',
    )
  })

  it('is warning on high risk / poor SLA / degrading health but no criticals', () => {
    const summary = generateExecutiveSummary(
      metrics({
        overall: overall({ riskLevel: 'high' }),
        compliance: compliance({ slaCompliance: { slaCritical: 60, slaHigh: 60, slaOverall: 60 } }),
      }),
      [],
    )
    expect(summary.overallStatus).toBe('warning')
  })

  it('is excellent only when risk is excellent, SLA >= 90 and health is improving', () => {
    const summary = generateExecutiveSummary(
      metrics({
        overall: overall({ riskLevel: 'excellent' }),
        compliance: compliance({ slaCompliance: { slaCritical: 95, slaHigh: 95, slaOverall: 95 } }),
        trends: trends({ healthTrend: 'improving' }),
      }),
      [],
    )
    expect(summary.overallStatus).toBe('excellent')
  })

  it('is good in the ordinary middle case', () => {
    const summary = generateExecutiveSummary(metrics({ overall: overall({ riskLevel: 'low' }) }), [])
    expect(summary.overallStatus).toBe('good')
  })
})

describe('headline', () => {
  it('leads with the critical count when status is critical', () => {
    const summary = generateExecutiveSummary(metrics({ overall: overall({ criticalCount: 2 }) }), [])
    expect(summary.headline).toContain('2 critical')
  })

  it('calls out an increasing trend when warning', () => {
    const summary = generateExecutiveSummary(
      metrics({ overall: overall({ riskLevel: 'high' }), trends: trends({ vulnerabilityTrend: 'increasing' }) }),
      [],
    )
    expect(summary.headline).toContain('increasing')
  })

  it('calls out the high count when warning without an increasing trend', () => {
    const summary = generateExecutiveSummary(metrics({ overall: overall({ riskLevel: 'high', highCount: 7 }) }), [])
    expect(summary.headline).toContain('7 high-priority')
  })

  it('states a positive posture for the good case', () => {
    const summary = generateExecutiveSummary(
      metrics({ overall: overall({ riskLevel: 'low', totalVulnerabilities: 3 }) }),
      [],
    )
    expect(summary.headline).toContain('good')
  })
})

describe('key points', () => {
  it('always reports the core counts and only mentions trends when they are not stable', () => {
    const stable = generateExecutiveSummary(metrics(), []).keyPoints
    expect(stable.some((p) => p.includes('project(s) monitored'))).toBe(true)
    expect(stable.some((p) => p.startsWith('Vulnerability trend'))).toBe(false)

    const moving = generateExecutiveSummary(
      metrics({ trends: trends({ vulnerabilityTrend: 'increasing', healthTrend: 'degrading' }) }),
      [],
    ).keyPoints
    expect(moving.some((p) => p.startsWith('Vulnerability trend'))).toBe(true)
    expect(moving.some((p) => p.startsWith('Health trend'))).toBe(true)
  })
})

describe('insight ordering & cap', () => {
  it('sorts critical insights ahead of warnings/info/success and caps the list at 20', () => {
    // 30 high-risk projects => >20 candidate insights, so the cap is exercised, and the
    // criticals (riskScore >= 85) must sort to the front regardless of insertion order.
    const byProject = Array.from({ length: 30 }, (_unused, i) =>
      projectMetric({ projectId: `p${i}`, projectName: `P${i}`, riskScore: i < 15 ? 90 : 75 }),
    )

    const all = generateInsights(metrics({ overall: overall({ criticalCount: 2 }), byProject }), [])
    expect(all.length).toBeLessThanOrEqual(20)
    expect(all[0].type).toBe('critical')
  })
})
