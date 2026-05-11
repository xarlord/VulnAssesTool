/**
 * DependencyGraphPage
 *
 * Full-page view for the interactive dependency graph visualization.
 * Accessible via /project/:projectId/graph
 */

import React, { useMemo, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Filter } from 'lucide-react'
import { DependencyGraph } from '@/components/graph/DependencyGraph'
import { useProjects } from '@/store/useStore'
import type { Component } from '@@/types'

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

export function DependencyGraphPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const projects = useProjects()

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [showVulnerableOnly, setShowVulnerableOnly] = useState(false)

  // Get current project
  const project = useMemo(() => {
    return projects.find((p) => p.id === projectId)
  }, [projects, projectId])

  // Get project components
  const components = useMemo(() => {
    return project?.components || []
  }, [project])

  // Get project vulnerabilities
  const projectVulnerabilities = useMemo(() => {
    if (!project) return []
    return project.vulnerabilities || []
  }, [project])

  // Filter components based on severity
  const filteredComponents = useMemo(() => {
    let filtered = components

    if (showVulnerableOnly) {
      const vulnerableIds = new Set(projectVulnerabilities.flatMap((v) => v.affectedComponents || []))
      filtered = filtered.filter((c) => vulnerableIds.has(c.id))
    }

    if (severityFilter !== 'all') {
      const severityIds = new Set(
        projectVulnerabilities.filter((v) => v.severity === severityFilter).flatMap((v) => v.affectedComponents || []),
      )
      filtered = filtered.filter((c) => severityIds.has(c.id))
    }

    return filtered
  }, [components, projectVulnerabilities, severityFilter, showVulnerableOnly])

  // Handle node click
  const handleNodeClick = useCallback((component: Component) => {
    console.log('[DependencyGraphPage] Node clicked:', component.name)
  }, [])

  // Handle back navigation
  const handleBack = useCallback(() => {
    navigate(`/project/${projectId}`)
  }, [navigate, projectId])

  // Severity counts
  const counts = useMemo(
    () => ({
      critical: projectVulnerabilities.filter((v) => v.severity === 'critical').length,
      high: projectVulnerabilities.filter((v) => v.severity === 'high').length,
      medium: projectVulnerabilities.filter((v) => v.severity === 'medium').length,
      low: projectVulnerabilities.filter((v) => v.severity === 'low').length,
    }),
    [projectVulnerabilities],
  )

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Project not found</h2>
          <p className="text-muted-foreground mt-2">The project you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Project
          </button>
          <div>
            <h1 className="text-lg font-semibold">Dependency Graph</h1>
            <p className="text-sm text-muted-foreground">{project.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
              className="px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <button
            onClick={() => setShowVulnerableOnly(!showVulnerableOnly)}
            className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
              showVulnerableOnly
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground hover:bg-accent'
            }`}
          >
            Vulnerable Only
          </button>
        </div>
      </header>

      {/* Graph Container */}
      <main className="flex-1 p-6">
        <DependencyGraph
          components={filteredComponents}
          vulnerabilities={projectVulnerabilities}
          onNodeClick={handleNodeClick}
          height="calc(100vh - 180px)"
          showControls={true}
          showLegend={true}
          className="border rounded-lg"
        />
      </main>

      {/* Stats Footer */}
      <footer className="px-6 py-3 border-t bg-card">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>
              Showing {filteredComponents.length} of {components.length} components
            </span>
            <span>•</span>
            <span>{projectVulnerabilities.length} vulnerabilities</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-600" />
              Critical: {counts.critical}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-orange-600" />
              High: {counts.high}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-yellow-600" />
              Medium: {counts.medium}
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-green-600" />
              Low: {counts.low}
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
