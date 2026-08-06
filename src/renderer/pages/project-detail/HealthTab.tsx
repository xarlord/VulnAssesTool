import { lazy, Suspense, useEffect, useMemo } from 'react'
import { HealthDashboard } from '@/components/HealthDashboard'
import { RemediationQueue } from '@/components/RemediationQueue'
import {
  calculateComponentHealth,
  calculateProjectHealth,
  calculateTrend,
  calculateTrendFromHistory,
  getHealthHistory,
  mergeTodaySnapshot,
  recordHealthScore,
} from '@/lib/health'
import type { Component, ComponentHealth, Project, ProjectHealthSummary, Vulnerability } from '@@/types'

const HealthTrendChart = lazy(() =>
  import('@/components/HealthTrendChart').then((m) => ({ default: m.HealthTrendChart })),
)

interface HealthTabProps {
  project: Project
  onComponentClick: (component: Component) => void
  onViewVulnerability: (vuln: Vulnerability) => void
}

export function HealthTab({ project, onComponentClick, onViewVulnerability }: HealthTabProps) {
  // Calculate health scores for all components
  const componentHealths: ComponentHealth[] = project.components.map((component) => {
    const componentVulns = project.vulnerabilities.filter((v) => v.affectedComponents.includes(component.id))
    return calculateComponentHealth(component, componentVulns)
  })

  // Calculate trends for components (in a real app, you'd fetch historical data)
  const componentHealthsWithTrends = componentHealths.map((health) => ({
    ...health,
    trend: calculateTrend(health.score, health.previousScore),
  }))

  // Calculate project health summary
  const projectHealth: ProjectHealthSummary = calculateProjectHealth(componentHealthsWithTrends)

  // Drive the trend line + trend badge from a persisted daily score history (FR-05.3), rather
  // than the always-unknown per-component trend. The displayed history is derived purely
  // (stored points + today's snapshot) so render stays side-effect-free; the effect only
  // persists today's point.
  const history = useMemo(
    () => mergeTodaySnapshot(getHealthHistory(project.id), projectHealth.averageScore),
    [project.id, projectHealth.averageScore],
  )
  useEffect(() => {
    recordHealthScore(project.id, projectHealth.averageScore)
  }, [project.id, projectHealth.averageScore])

  const historicalTrend = calculateTrendFromHistory(history.map((snapshot) => snapshot.score))
  const projectHealthWithTrend: ProjectHealthSummary =
    historicalTrend === 'unknown' ? projectHealth : { ...projectHealth, trend: historicalTrend }

  return (
    <div className="mx-auto max-w-7xl mt-6 space-y-6">
      <h2 className="text-lg font-semibold">Component Health Dashboard</h2>

      {/* Health Dashboard */}
      <HealthDashboard
        projectHealth={projectHealthWithTrend}
        componentHealths={componentHealthsWithTrends}
        components={project.components}
      />

      {/* Health Score Trend (FR-05.3) */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h3 className="mb-4 text-lg font-semibold">Health Score Trend</h3>
        <Suspense
          fallback={<div className="flex h-64 items-center justify-center text-muted-foreground">Loading chart...</div>}
        >
          <HealthTrendChart history={history} />
        </Suspense>
      </div>

      {/* Remediation Queue */}
      <div>
        <h3 className="mb-4 text-lg font-semibold">Remediation Queue</h3>
        <RemediationQueue
          componentHealths={componentHealthsWithTrends}
          components={project.components}
          vulnerabilities={project.vulnerabilities}
          onViewComponent={onComponentClick}
          onViewVulnerability={onViewVulnerability}
        />
      </div>
    </div>
  )
}
