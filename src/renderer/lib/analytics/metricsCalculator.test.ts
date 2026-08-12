/**
 * Tests for metricsCalculator (FR-06.1).
 *
 * Two Executive-Dashboard metrics the PRD requires but the code did not deliver:
 *  - an "exploited vulnerability count" (vulns in the CISA KEV catalog, isKev),
 *  - a "fixable vulnerability percentage" measured against ALL vulnerabilities,
 *    not just those that happen to carry patch metadata.
 */

import { describe, it, expect } from 'vitest'
import {
  calculateOverallMetrics,
  calculateComplianceMetrics,
  calculateTrendMetrics,
  calculateTopCriticalVulnerabilities,
  calculateProductivityMetrics,
  calculateProjectMetrics,
  calculateExecutiveMetrics,
  computeNextComplianceReview,
} from '@/lib/analytics'
import type { Project, Vulnerability, PatchInfo } from '@@/types'

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

function project(vulnerabilities: Vulnerability[], statistics?: Partial<Project['statistics']>): Project {
  return {
    statistics: {
      totalVulnerabilities: vulnerabilities.length,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: 5,
      vulnerableComponents: 0,
      ...statistics,
    },
    vulnerabilities,
  } as Project
}

const availablePatch = { patchAvailability: 'available' } as PatchInfo
const noPatch = { patchAvailability: 'none' } as PatchInfo

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

/**
 * A date exactly `n` full weeks before now (with a small mid-week pad). `calculateTrendMetrics`
 * buckets projects into contiguous 7-day calendar weeks, so two dates exactly 7 days apart always
 * fall into adjacent buckets — this lets `weeksAgo(0)`..`weeksAgo(7)` deterministically produce 8
 * consecutive, correctly-ordered weekly periods no matter what weekday the suite runs on.
 */
function weeksAgo(n: number): Date {
  return new Date(Date.now() - (n * 7 + 2) * 24 * 60 * 60 * 1000)
}

describe('calculateOverallMetrics — exploited count (FR-06.1)', () => {
  it('counts every KEV-flagged vulnerability regardless of severity', () => {
    // isKev, not severity, is the exploited signal — a KEV medium counts the same
    // as a KEV critical. Two are flagged across the two projects.
    const projects = [
      project([vuln({ isKev: true, severity: 'critical' }), vuln({ isKev: false, severity: 'high' })]),
      project([vuln({ isKev: true, severity: 'medium' }), vuln({ severity: 'low' })]),
    ]

    expect(calculateOverallMetrics(projects).exploitedCount).toBe(2)
  })

  it('returns 0 exploited count when no vulnerability is in the KEV catalog', () => {
    const projects = [project([vuln({ severity: 'critical' }), vuln({ isKev: false })])]

    expect(calculateOverallMetrics(projects).exploitedCount).toBe(0)
  })
})

describe('calculateOverallMetrics — divide-by-zero guards', () => {
  it('reports 0% vulnerable-component rate and a neutral 100 health score when every project has zero components', () => {
    // A project can be scanned before any component is extracted (e.g. an empty/unsupported
    // SBOM). Dividing by zero components must not produce NaN in either figure.
    const projects = [project([], { totalComponents: 0, vulnerableComponents: 0, totalVulnerabilities: 0 })]

    const metrics = calculateOverallMetrics(projects)

    expect(metrics.vulnerableComponentPercentage).toBe(0)
    expect(metrics.averageHealthScore).toBe(100)
  })

  it('returns neutral defaults instead of NaN when there are no projects at all', () => {
    const metrics = calculateOverallMetrics([])

    expect(metrics.vulnerableComponentPercentage).toBe(0)
    expect(metrics.averageHealthScore).toBe(100)
    expect(metrics.riskLevel).toBe('excellent')
  })
})

describe('calculateOverallMetrics — risk level banding', () => {
  it.each<[string, Partial<Project['statistics']>, 'critical' | 'high' | 'medium' | 'low' | 'excellent']>([
    [
      'a single critical-severity vulnerability forces "critical" even when the health score stays high',
      {
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        totalVulnerabilities: 1,
        totalComponents: 1000,
        vulnerableComponents: 1,
      },
      'critical',
    ],
    [
      'an average health score below 40 forces "critical" even with zero critical/high vulnerabilities',
      {
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        totalVulnerabilities: 70,
        totalComponents: 10,
        vulnerableComponents: 10,
      },
      'critical',
    ],
    [
      'more than 5 high-severity vulnerabilities forces "high" even when the health score stays high',
      {
        criticalCount: 0,
        highCount: 6,
        mediumCount: 0,
        totalVulnerabilities: 6,
        totalComponents: 1000,
        vulnerableComponents: 6,
      },
      'high',
    ],
    [
      'an average health score below 60 forces "high" even with zero high-severity vulnerabilities',
      {
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        totalVulnerabilities: 45,
        totalComponents: 10,
        vulnerableComponents: 10,
      },
      'high',
    ],
    [
      'more than 10 medium-severity vulnerabilities forces "medium" even with a low vulnerable-component rate',
      {
        criticalCount: 0,
        highCount: 0,
        mediumCount: 11,
        totalVulnerabilities: 11,
        totalComponents: 2000,
        vulnerableComponents: 11,
      },
      'medium',
    ],
    [
      'a vulnerable-component rate above 30% forces "medium" even with zero medium-severity vulnerabilities',
      {
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        totalVulnerabilities: 4,
        totalComponents: 10,
        vulnerableComponents: 4,
      },
      'medium',
    ],
    [
      'a vulnerable-component rate above 10% (but at or below 30%) is "low"',
      {
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        totalVulnerabilities: 3,
        totalComponents: 20,
        vulnerableComponents: 3,
      },
      'low',
    ],
    [
      'a vulnerable-component rate at or below 10% with no other risk factors is "excellent"',
      {
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        totalVulnerabilities: 5,
        totalComponents: 100,
        vulnerableComponents: 5,
      },
      'excellent',
    ],
  ])('%s', (_description, statistics, expected) => {
    const metrics = calculateOverallMetrics([project([], statistics)])
    expect(metrics.riskLevel).toBe(expected)
  })
})

describe('calculateComplianceMetrics — remediation rate denominator (FR-06.1)', () => {
  it('measures fixable % against ALL vulnerabilities, not just those carrying patch metadata', () => {
    // 4 vulns total; only 2 carry patchInfo; only 1 of those is actually available.
    // The PRD wants "% of all vulns that are fixable" = 1/4 = 25, NOT 1/2 = 50.
    const projects = [project([vuln({ patchInfo: availablePatch }), vuln({ patchInfo: noPatch }), vuln({}), vuln({})])]

    expect(calculateComplianceMetrics(projects).remediationRate).toBe(25)
  })

  it('reports a 100% remediation rate when a project has zero vulnerabilities (no division by zero)', () => {
    expect(calculateComplianceMetrics([project([])]).remediationRate).toBe(100)
  })
})

describe('calculateComplianceMetrics — SLA aging by vulnerability severity', () => {
  it('counts only vulnerabilities older than their severity SLA window as breaches', () => {
    // Critical SLA is 30 days, high SLA is 60 days. One of each severity is past its window and
    // one is fresh, so exactly half of each band has breached.
    const vulns = [
      vuln({ id: 'C-OLD', severity: 'critical', publishedAt: daysAgo(60) }),
      vuln({ id: 'C-NEW', severity: 'critical', publishedAt: daysAgo(5) }),
      vuln({ id: 'H-OLD', severity: 'high', publishedAt: daysAgo(90) }),
      vuln({ id: 'H-NEW', severity: 'high', publishedAt: daysAgo(10) }),
    ]
    const projects = [project(vulns, { criticalCount: 2, highCount: 2 })]

    const { slaCompliance } = calculateComplianceMetrics(projects)

    expect(slaCompliance.slaCritical).toBe(50)
    expect(slaCompliance.slaHigh).toBe(50)
    expect(slaCompliance.slaOverall).toBe(50) // 50 * 0.6 + 50 * 0.4
  })

  it('treats a vulnerability with no published date as SLA-compliant rather than assuming a breach', () => {
    // WHY: age can't be computed without publishedAt, so the aging loop skips it (`continue`).
    // It must not be silently counted as a breach just because its age is unknown.
    const projects = [project([vuln({ severity: 'critical' })], { criticalCount: 1 })]

    expect(calculateComplianceMetrics(projects).slaCompliance.slaCritical).toBe(100)
  })
})

describe('calculateComplianceMetrics — empty project set', () => {
  it('reports 100% scan coverage and data freshness when there are no projects to fall short on', () => {
    const metrics = calculateComplianceMetrics([])

    expect(metrics.scanCoverage).toBe(100)
    expect(metrics.dataFreshness).toBe(100)
  })
})

function projectNamed(id: string, name: string, vulnerabilities: Vulnerability[]): Project {
  return {
    id,
    name,
    statistics: {
      totalVulnerabilities: vulnerabilities.length,
      criticalCount: vulnerabilities.filter((v) => v.severity === 'critical').length,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: 5,
      vulnerableComponents: 0,
    },
    vulnerabilities,
  } as Project
}

describe('calculateProjectMetrics — per-project health & risk scoring', () => {
  it('ranks a never-scanned project as riskier than an otherwise-identical recently-scanned one', () => {
    // A stale/never-scanned project is the more urgent one to re-assess; the risk sort must
    // surface it first even when its vulnerability counts are no worse than a scanned peer's.
    const stats = { totalComponents: 100, totalVulnerabilities: 10, criticalCount: 0, highCount: 0 }
    const stale = { ...project([], stats), id: 'stale', name: 'Stale' }
    const fresh = { ...project([], stats), id: 'fresh', name: 'Fresh', lastScanAt: new Date() }

    const [first, second] = calculateProjectMetrics([fresh, stale])

    expect(first.projectId).toBe('stale')
    expect(second.projectId).toBe('fresh')
  })

  it('caps the staleness risk contribution at 20, so a project scanned 1000 days ago is no riskier than one scanned 40 days ago', () => {
    const stats = { totalComponents: 100, totalVulnerabilities: 10 }
    const veryStale = { ...project([], stats), id: 'very-stale', lastScanAt: daysAgo(1000) }
    const atCap = { ...project([], stats), id: 'at-cap', lastScanAt: daysAgo(40) } // 40 * 0.5 = 20, exactly the cap

    const [a, b] = calculateProjectMetrics([veryStale, atCap])

    expect(a.riskScore).toBe(b.riskScore)
  })

  it('reports a perfect 100 health score for a zero-component project instead of null', () => {
    const metrics = calculateProjectMetrics([project([], { totalComponents: 0 })])

    expect(metrics[0].healthScore).toBe(100)
  })

  it('defaults fixableCount to 0 when project statistics omit it, and passes it through when present', () => {
    const withoutFixable = { ...project([]), id: 'a' }
    const withFixable = { ...project([], { fixableCount: 3 }), id: 'b' }

    const metrics = calculateProjectMetrics([withoutFixable, withFixable])

    expect(metrics.find((m) => m.projectId === 'a')?.fixableCount).toBe(0)
    expect(metrics.find((m) => m.projectId === 'b')?.fixableCount).toBe(3)
  })

  it.each<[string, Partial<Project['statistics']>, number]>([
    [
      'caps the vulnerability-density contribution at 50 no matter how far vulnerabilities outnumber components',
      { totalComponents: 10, totalVulnerabilities: 1000, criticalCount: 0, highCount: 0, mediumCount: 0 },
      50,
    ],
    [
      'caps the medium-severity volume contribution at 30 no matter how many medium vulnerabilities exist',
      { totalComponents: 1000, totalVulnerabilities: 0, criticalCount: 0, highCount: 0, mediumCount: 1000 },
      30,
    ],
    [
      'caps the combined risk score at 100 even when every contributing factor is individually maxed out',
      { totalComponents: 1, totalVulnerabilities: 1000, criticalCount: 100, highCount: 100, mediumCount: 1000 },
      100,
    ],
  ])('%s', (_description, statistics, expected) => {
    const proj = { ...project([], statistics), lastScanAt: new Date() }
    expect(calculateProjectMetrics([proj])[0].riskScore).toBe(expected)
  })

  it.each<[string, Partial<Project['statistics']>, number]>([
    [
      'clamps a catastrophically unhealthy project at a 0 health score instead of going negative',
      { totalComponents: 10, totalVulnerabilities: 30, criticalCount: 30, highCount: 0 },
      0,
    ],
    [
      'clamps the patch-coverage bonus so health score cannot exceed 100',
      { totalComponents: 1000, totalVulnerabilities: 1, criticalCount: 0, highCount: 0, fixableCount: 1 },
      100,
    ],
  ])('%s', (_description, statistics, expected) => {
    expect(calculateProjectMetrics([project([], statistics)])[0].healthScore).toBe(expected)
  })
})

describe('calculateTrendMetrics — 6-month window (FR-06.2)', () => {
  it('covers a 6-month (26-week) window, not just the last 3 months', () => {
    // A project last updated ~19 weeks ago falls inside 6 months (26 weeks) but
    // OUTSIDE the old 3-month (12-week) window, so no trend period existed for it.
    const daysAgo = 130
    const updatedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    const proj = project([vuln({ severity: 'high' })], { totalVulnerabilities: 7 })
    ;(proj as { updatedAt: Date }).updatedAt = updatedAt

    const periods = calculateTrendMetrics([proj]).periods

    // Before the fix (12-week window) this project is out of range -> zero periods.
    expect(periods.length).toBeGreaterThan(0)
    expect(periods.some((p) => p.vulnerabilityCount === 7)).toBe(true)
  })
})

function weeklyVulnerabilityProjects(recentCount: number, olderCount: number): Project[] {
  return Array.from({ length: 8 }, (_unused, weeksBack) => ({
    ...project([], {
      totalVulnerabilities: weeksBack < 4 ? recentCount : olderCount,
      totalComponents: 100_000, // keeps the health-score term negligible so only the vuln trend moves
    }),
    updatedAt: weeksAgo(weeksBack),
  }))
}

describe('calculateTrendMetrics — vulnerability trend direction', () => {
  it('reports "increasing" when the last 4 weeks average more than 10% above the previous 4 weeks', () => {
    const trends = calculateTrendMetrics(weeklyVulnerabilityProjects(50, 10))
    expect(trends.vulnerabilityTrend).toBe('increasing')
  })

  it('reports "decreasing" when the last 4 weeks average more than 10% below the previous 4 weeks', () => {
    const trends = calculateTrendMetrics(weeklyVulnerabilityProjects(10, 50))
    expect(trends.vulnerabilityTrend).toBe('decreasing')
  })

  it('reports "stable" when the change is within the ±10% noise band, instead of flagging minor fluctuations', () => {
    const trends = calculateTrendMetrics(weeklyVulnerabilityProjects(21, 20)) // +5%, inside the band
    expect(trends.vulnerabilityTrend).toBe('stable')
  })
})

function weeklyHealthProjects(recentCriticalCount: number, olderCriticalCount: number): Project[] {
  return Array.from({ length: 8 }, (_unused, weeksBack) => ({
    ...project([], {
      criticalCount: weeksBack < 4 ? recentCriticalCount : olderCriticalCount,
      totalVulnerabilities: 5,
      totalComponents: 1000, // keeps the vuln-ratio term negligible so only criticalCount moves health
    }),
    updatedAt: weeksAgo(weeksBack),
  }))
}

describe('calculateTrendMetrics — health trend direction', () => {
  it('reports "improving" when recent 4-week health is more than 5 points above the previous 4 weeks', () => {
    const trends = calculateTrendMetrics(weeklyHealthProjects(0, 3)) // recent health ~100, older ~85
    expect(trends.healthTrend).toBe('improving')
  })

  it('reports "degrading" when recent 4-week health is more than 5 points below the previous 4 weeks', () => {
    const trends = calculateTrendMetrics(weeklyHealthProjects(3, 0)) // recent health ~85, older ~100
    expect(trends.healthTrend).toBe('degrading')
  })

  it('reports "stable" when the improvement is exactly 5 points, since the rule requires strictly more', () => {
    const trends = calculateTrendMetrics(weeklyHealthProjects(1, 2)) // recent ~95, older ~90 — diff is exactly 5
    expect(trends.healthTrend).toBe('stable')
  })
})

describe('calculateTrendMetrics — insufficient history guard', () => {
  it('keeps trends "stable" when fewer than 4 prior weeks exist to compare against, instead of fabricating a baseline', () => {
    const onlyThisWeek = { ...project([], { totalVulnerabilities: 999 }), updatedAt: new Date() }

    const trends = calculateTrendMetrics([onlyThisWeek])

    expect(trends.vulnerabilityTrend).toBe('stable')
    expect(trends.healthTrend).toBe('stable')
  })

  it('returns an empty periods list and stable/zero defaults when there are no projects at all', () => {
    const trends = calculateTrendMetrics([])

    expect(trends.periods).toEqual([])
    expect(trends.vulnerabilityTrend).toBe('stable')
    expect(trends.healthTrend).toBe('stable')
    expect(trends.scanFrequency).toBe(0)
  })
})

describe('calculateTrendMetrics — scan completion & weekly scan frequency', () => {
  it('counts a scan toward its own calendar week and toward weekly frequency, independent of vulnerability-count tracking', () => {
    // scannedThisWeek has no `updatedAt`, so it must not contribute to any period's
    // vulnerabilityCount — only to scansCompleted / scanFrequency, which key off lastScanAt.
    const scannedThisWeek = { ...project([]), lastScanAt: new Date() }
    const scannedWeeksAgo = { ...project([]), lastScanAt: weeksAgo(6) }

    const trends = calculateTrendMetrics([scannedThisWeek, scannedWeeksAgo])
    const currentPeriod = trends.periods.at(-1)

    expect(currentPeriod?.scansCompleted).toBe(1)
    expect(trends.scanFrequency).toBe(1)
  })
})

describe('calculateTopCriticalVulnerabilities (FR-06.2)', () => {
  it('returns only critical vulnerabilities, sorted by CVSS descending, capped at the limit', () => {
    const criticals = Array.from({ length: 12 }, (_unused, i) =>
      vuln({ id: `CVE-C-${i}`, severity: 'critical', cvssScore: 9.0 + (i % 10) / 10 }),
    )
    const projects = [
      projectNamed('p1', 'Alpha', [...criticals.slice(0, 6), vuln({ id: 'H-1', severity: 'high', cvssScore: 8 })]),
      projectNamed('p2', 'Beta', [...criticals.slice(6), vuln({ id: 'M-1', severity: 'medium', cvssScore: 5 })]),
    ]

    const top = calculateTopCriticalVulnerabilities(projects)

    expect(top).toHaveLength(10)
    expect(top.every((t) => t.severity === 'critical')).toBe(true)
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].cvssScore ?? 0).toBeGreaterThanOrEqual(top[i].cvssScore ?? 0)
    }
  })

  it('deduplicates a CVE that appears in multiple projects, keeping the highest-scoring occurrence', () => {
    const projects = [
      projectNamed('p1', 'Alpha', [vuln({ id: 'CVE-2021-44228', severity: 'critical', cvssScore: 9.0 })]),
      projectNamed('p2', 'Beta', [vuln({ id: 'CVE-2021-44228', severity: 'critical', cvssScore: 10.0 })]),
    ]

    const top = calculateTopCriticalVulnerabilities(projects)

    expect(top.filter((t) => t.id === 'CVE-2021-44228')).toHaveLength(1)
    expect(top[0].cvssScore).toBe(10.0)
  })
})

describe('calculateTopCriticalVulnerabilities — dedup keeps the higher score', () => {
  it('keeps the existing higher-scoring occurrence when a later duplicate has a lower CVSS score', () => {
    const projects = [
      projectNamed('p1', 'Alpha', [vuln({ id: 'CVE-X', severity: 'critical', cvssScore: 9.5 })]),
      projectNamed('p2', 'Beta', [vuln({ id: 'CVE-X', severity: 'critical', cvssScore: 8.0 })]),
    ]

    const top = calculateTopCriticalVulnerabilities(projects)

    expect(top).toHaveLength(1)
    expect(top[0].cvssScore).toBe(9.5)
  })

  it('keeps the first occurrence when neither duplicate has a CVSS score, treating both as equally (un)ranked', () => {
    // WHY: without this case, `candidate.cvssScore ?? 0` / `existing.cvssScore ?? 0` are only
    // ever exercised on their defined side — an all-unscored duplicate must not crash or
    // silently prefer the later occurrence just because comparing two `0` fallbacks is a no-op.
    const projects = [
      projectNamed('p1', 'Alpha', [vuln({ id: 'CVE-NOSCORE', severity: 'critical', cvssScore: undefined })]),
      projectNamed('p2', 'Beta', [vuln({ id: 'CVE-NOSCORE', severity: 'critical', cvssScore: undefined })]),
    ]

    const top = calculateTopCriticalVulnerabilities(projects)

    expect(top).toHaveLength(1)
    expect(top[0].projectId).toBe('p1')
  })
})

describe('calculateTopCriticalVulnerabilities — unscored entries sort last', () => {
  it('sorts an unscored vulnerability after all scored ones, including a genuine 0.0 score', () => {
    // WHY: the sort key is `?? -1`, not `?? 0` — a real CVSS of 0.0 is a valid (if unusual)
    // score and must still outrank a vulnerability whose score is simply unknown. Order is
    // deliberately scored/unscored/scored on input, so the unscored entry gets compared from
    // both sides of the comparator, not just one.
    const projects = [
      projectNamed('p1', 'Alpha', [
        vuln({ id: 'CVE-ZERO', severity: 'critical', cvssScore: 0.0 }),
        vuln({ id: 'CVE-UNSCORED', severity: 'critical', cvssScore: undefined }),
        vuln({ id: 'CVE-HIGH', severity: 'critical', cvssScore: 7.0 }),
      ]),
    ]

    const top = calculateTopCriticalVulnerabilities(projects)

    expect(top.map((t) => t.id)).toEqual(['CVE-HIGH', 'CVE-ZERO', 'CVE-UNSCORED'])
  })

  it('falls back to an affected-component count of 0 when the field is missing from a vulnerability', () => {
    const projects = [
      projectNamed('p1', 'Alpha', [vuln({ id: 'CVE-NOCOMP', severity: 'critical', affectedComponents: undefined })]),
    ]

    expect(calculateTopCriticalVulnerabilities(projects)[0].affectedComponentCount).toBe(0)
  })
})

describe('calculateComplianceMetrics — date coercion after store rehydration (H6)', () => {
  it('counts a recently-scanned project even when lastScanAt is an ISO string (post-reload)', () => {
    // WHY: zustand-persist rehydrates Date fields as ISO strings, so `p.lastScanAt` is a
    // string at runtime. Comparing a string against a Date object (string >= Date) is a
    // broken lexicographic compare that zeroed scanCoverage/dataFreshness after every reload.
    const recentIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const projects = [
      {
        ...project([]),
        lastScanAt: recentIso as unknown as Date,
        lastVulnDataRefresh: recentIso as unknown as Date,
      },
    ]

    const metrics = calculateComplianceMetrics(projects)

    expect(metrics.scanCoverage).toBe(100)
    expect(metrics.dataFreshness).toBe(100)
  })
})

describe('calculateProductivityMetrics — measured average scan time (M5)', () => {
  it('averages real per-scan durations instead of a component-count proxy', () => {
    // Measured durations of 60s and 180s → mean 120s = 2 minutes. The old proxy
    // (components * 0.5 / 60) was unrelated to how long a scan actually took.
    const projects = [
      { ...project([]), sbomFiles: [], lastScanAt: new Date(), lastScanDurationMs: 60_000 },
      { ...project([]), sbomFiles: [], lastScanAt: new Date(), lastScanDurationMs: 180_000 },
    ]

    expect(calculateProductivityMetrics(projects).averageScanTime).toBe(2)
  })

  it('reports 0 average scan time when no scan durations have been recorded', () => {
    // A large component count would make the OLD proxy (components * 0.5 / 60) report a
    // fabricated non-zero time; with no measured durations the real average is 0.
    const projects = [{ ...project([], { totalComponents: 100_000 }), sbomFiles: [], lastScanAt: new Date() }]

    expect(calculateProductivityMetrics(projects).averageScanTime).toBe(0)
  })
})

describe('calculateProductivityMetrics — never-scanned project', () => {
  it('reports zero scans and zero weekly/monthly throughput for a project that has never been scanned', () => {
    const projects = [{ ...project([], { totalComponents: 50 }), sbomFiles: [] }]

    const metrics = calculateProductivityMetrics(projects)

    expect(metrics.totalScans).toBe(0)
    expect(metrics.scansThisWeek).toBe(0)
    expect(metrics.scansThisMonth).toBe(0)
  })
})

describe('computeNextComplianceReview — real review date (M3)', () => {
  const DAY = 24 * 60 * 60 * 1000

  it('anchors the next review to the most recent data refresh plus the interval', () => {
    // WHY: the widget fabricated "today + 7 days". A real next-review date is derived from
    // when the assessment data was last refreshed + a defined cadence.
    const last = new Date('2026-01-01T00:00:00Z')
    const older = new Date('2025-06-01T00:00:00Z')
    const projects = [
      { ...project([]), lastVulnDataRefresh: older },
      { ...project([]), lastVulnDataRefresh: last },
    ]

    const next = computeNextComplianceReview(projects, 90)

    expect(next?.getTime()).toBe(last.getTime() + 90 * DAY)
  })

  it('falls back to lastScanAt when a project has no data-refresh date', () => {
    const scan = new Date('2026-02-01T00:00:00Z')
    const projects = [{ ...project([]), lastScanAt: scan }]

    expect(computeNextComplianceReview(projects, 30)?.getTime()).toBe(scan.getTime() + 30 * DAY)
  })

  it('returns null when nothing has ever been scanned or refreshed (no fabrication)', () => {
    expect(computeNextComplianceReview([project([])], 90)).toBeNull()
  })
})

describe('calculateExecutiveMetrics — wiring', () => {
  it('aggregates all six metric groups from the same project set, kept in sync with each other', () => {
    const projects = [
      { ...projectNamed('p1', 'Alpha', [vuln({ id: 'CVE-1', severity: 'critical', cvssScore: 9.8 })]), sbomFiles: [] },
    ]

    const metrics = calculateExecutiveMetrics(projects)

    expect(metrics.overall.totalProjects).toBe(1)
    expect(metrics.byProject).toHaveLength(1)
    expect(metrics.byProject[0].projectId).toBe('p1')
    expect(metrics.topCriticalVulnerabilities.map((v) => v.id)).toContain('CVE-1')
  })
})
