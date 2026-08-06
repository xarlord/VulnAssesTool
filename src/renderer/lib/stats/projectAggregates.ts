import type { Project } from '@@/types'

/**
 * Aggregate statistics rolled up across a set of projects.
 *
 * Single source of truth for "totals across all projects" so the Dashboard
 * stat row and the analytics/Reports metrics can never drift (they previously
 * each re-implemented the same reduce).
 */
export interface ProjectAggregateStats {
  totalProjects: number
  totalComponents: number
  totalVulnerabilities: number
  vulnerableComponents: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
}

/** Sum each project's precomputed statistics into a single roll-up. */
export function aggregateProjectStats(projects: Project[]): ProjectAggregateStats {
  return projects.reduce<ProjectAggregateStats>(
    (acc, project) => {
      const s = project.statistics
      return {
        totalProjects: acc.totalProjects + 1,
        totalComponents: acc.totalComponents + s.totalComponents,
        totalVulnerabilities: acc.totalVulnerabilities + s.totalVulnerabilities,
        vulnerableComponents: acc.vulnerableComponents + s.vulnerableComponents,
        criticalCount: acc.criticalCount + s.criticalCount,
        highCount: acc.highCount + s.highCount,
        mediumCount: acc.mediumCount + s.mediumCount,
        lowCount: acc.lowCount + s.lowCount,
      }
    },
    {
      totalProjects: 0,
      totalComponents: 0,
      totalVulnerabilities: 0,
      vulnerableComponents: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
  )
}
