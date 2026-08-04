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
