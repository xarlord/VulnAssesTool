import { describe, it, expect } from 'vitest'
import { aggregateProjectStats } from './projectAggregates'
import type { Project } from '@@/types'

function project(stats: Partial<Project['statistics']>): Project {
  return {
    statistics: {
      totalVulnerabilities: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: 0,
      vulnerableComponents: 0,
      ...stats,
    },
  } as Project
}

describe('aggregateProjectStats', () => {
  it('returns a zeroed roll-up for no projects', () => {
    expect(aggregateProjectStats([])).toEqual({
      totalProjects: 0,
      totalComponents: 0,
      totalVulnerabilities: 0,
      vulnerableComponents: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    })
  })

  it('sums every severity and count field across projects', () => {
    const result = aggregateProjectStats([
      project({
        criticalCount: 2,
        highCount: 5,
        mediumCount: 1,
        lowCount: 0,
        totalVulnerabilities: 8,
        totalComponents: 10,
        vulnerableComponents: 4,
      }),
      project({
        criticalCount: 3,
        highCount: 1,
        mediumCount: 4,
        lowCount: 7,
        totalVulnerabilities: 15,
        totalComponents: 20,
        vulnerableComponents: 6,
      }),
    ])

    // Why: the Dashboard stat tiles and the Reports metrics both read these
    // totals — a wrong sum here silently misreports risk on two surfaces.
    expect(result).toEqual({
      totalProjects: 2,
      totalComponents: 30,
      totalVulnerabilities: 23,
      vulnerableComponents: 10,
      criticalCount: 5,
      highCount: 6,
      mediumCount: 5,
      lowCount: 7,
    })
  })
})
