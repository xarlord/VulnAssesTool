import { HealthDashboard } from '@/components/HealthDashboard'
import { RemediationQueue } from '@/components/RemediationQueue'
import { calculateComponentHealth, calculateProjectHealth, calculateTrend } from '@/lib/health'
import type { Component, ComponentHealth, Project, ProjectHealthSummary, Vulnerability } from '@@/types'

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

  return (
    <div className="mx-auto max-w-7xl mt-6 space-y-6">
      <h2 className="text-lg font-semibold">Component Health Dashboard</h2>

      {/* Health Dashboard */}
      <HealthDashboard
        projectHealth={projectHealth}
        componentHealths={componentHealthsWithTrends}
        components={project.components}
      />

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
