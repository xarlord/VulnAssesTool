import { describe, it, expect } from 'vitest'
import type { Project, ProjectStatistics, Vulnerability } from '@@/types'
import { hasAvailablePatch, isExploitedVuln, buildReportData } from './helpers'

function makeVuln(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: 'CVE-2024-0001',
    source: 'nvd',
    severity: 'high',
    description: 'test vuln',
    references: [],
    affectedComponents: ['comp-1'],
    ...overrides,
  }
}

function makeProject(overrides: Partial<Project> = {}): Project {
  const statistics: ProjectStatistics = {
    totalVulnerabilities: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    totalComponents: 0,
    vulnerableComponents: 0,
  }
  return {
    id: 'p1',
    name: 'Test Project',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sbomFiles: [],
    components: [],
    vulnerabilities: [],
    statistics,
    ...overrides,
  }
}

describe('hasAvailablePatch', () => {
  // FR-08.3 requires a patch-availability filter that hides unpatched vulns. If this predicate
  // treated any patchInfo as "patched" it would hide vulns that are merely under investigation.
  it('returns true when patchInfo.patchAvailability is "available"', () => {
    expect(hasAvailablePatch(makeVuln({ patchInfo: { patchAvailability: 'available' } }))).toBe(true)
  })

  it('returns true when patchedVersions has at least one entry, even without patchInfo', () => {
    expect(hasAvailablePatch(makeVuln({ patchedVersions: ['1.2.3'] }))).toBe(true)
  })

  it.each(['partial', 'upstream', 'investigating', 'none'] as const)(
    'returns false for patchAvailability "%s" — not a usable fix yet',
    (status) => {
      expect(hasAvailablePatch(makeVuln({ patchInfo: { patchAvailability: status } }))).toBe(false)
    },
  )

  it('returns false when there is no patchInfo and no patchedVersions', () => {
    expect(hasAvailablePatch(makeVuln())).toBe(false)
  })

  it('returns false when patchedVersions is present but empty', () => {
    expect(hasAvailablePatch(makeVuln({ patchedVersions: [] }))).toBe(false)
  })
})

describe('isExploitedVuln', () => {
  // FR-08.3's exploit-status filter must key off the CISA KEV catalog / exploitStatus fields —
  // not an incidental "exploit" reference tag — so "Exploited" only ever surfaces known-exploited
  // vulnerabilities.
  it('returns true when isKev is true', () => {
    expect(isExploitedVuln(makeVuln({ isKev: true }))).toBe(true)
  })

  it('returns true when exploitStatus is "exploited"', () => {
    expect(isExploitedVuln(makeVuln({ exploitStatus: 'exploited' }))).toBe(true)
  })

  it('returns false when exploitStatus is "publicly-disclosed" and isKev is not set', () => {
    expect(isExploitedVuln(makeVuln({ exploitStatus: 'publicly-disclosed' }))).toBe(false)
  })

  it('returns false when isKev is false and exploitStatus is unset', () => {
    expect(isExploitedVuln(makeVuln({ isKev: false }))).toBe(false)
  })

  it('returns false for a vuln with no exploit signals at all', () => {
    expect(isExploitedVuln(makeVuln())).toBe(false)
  })
})

describe('buildReportData', () => {
  // WHY: the report's none/KEV/EPSS aggregates are derived here because ProjectStatistics
  // doesn't carry them. A wrong severity string, a bad KEV filter, or a divide-by-zero would
  // silently corrupt every generated report — and nothing exercised this logic until now.
  it('derives noneCount, kevCount and avgEpssScore from the vulnerability list', () => {
    const project = makeProject({
      vulnerabilities: [
        makeVuln({ id: 'a', severity: 'none' }),
        makeVuln({ id: 'b', severity: 'critical', isKev: true, epssScore: 0.9 }),
        makeVuln({ id: 'c', severity: 'high', isKev: true, epssScore: 0.1 }),
        makeVuln({ id: 'd', severity: 'low' }), // no epssScore -> excluded from the average
      ],
    })

    const data = buildReportData(project)

    expect(data.statistics.noneCount).toBe(1)
    expect(data.statistics.kevCount).toBe(2)
    // Average is over ONLY the vulns that actually carry an epssScore: (0.9 + 0.1) / 2.
    expect(data.statistics.avgEpssScore).toBeCloseTo(0.5)
  })

  it('returns avgEpssScore 0 (never NaN) when no vulnerability has an epssScore', () => {
    const project = makeProject({ vulnerabilities: [makeVuln({ epssScore: undefined })] })

    const data = buildReportData(project)

    expect(data.statistics.avgEpssScore).toBe(0)
    expect(Number.isNaN(data.statistics.avgEpssScore)).toBe(false)
  })

  it('passes through project statistics, components and vulnerabilities unchanged', () => {
    const vulns = [makeVuln()]
    const project = makeProject({
      vulnerabilities: vulns,
      statistics: {
        totalVulnerabilities: 1,
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        totalComponents: 3,
        vulnerableComponents: 1,
      },
    })

    const data = buildReportData(project)

    expect(data.project).toBe(project)
    expect(data.vulnerabilities).toBe(vulns)
    expect(data.components).toBe(project.components)
    expect(data.statistics.totalVulnerabilities).toBe(1)
    expect(data.statistics.criticalCount).toBe(1)
    expect(data.statistics.totalComponents).toBe(3)
    expect(data.statistics.vulnerableComponents).toBe(1)
  })
})
