/**
 * DependencyGraphPage
 *
 * Full-page view for the interactive dependency graph visualization.
 * Accessible via /project/:projectId/graph
 */

import { useMemo, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Filter } from 'lucide-react'
import { DependencyGraph } from '@/components/graph/DependencyGraph'
import { findShortestPath } from '@/components/graph'
import { MAX_GRAPH_NODES } from '@/components/graph/types'
import { PageHeader } from '@/components/PageHeader'
import { ComponentVulnerabilitiesPopup } from '@/components/ComponentVulnerabilitiesPopup'
import { toast } from '@/components/Toaster'
import { useProjects } from '@/store/useStore'
import { getVulnerabilitiesForComponent } from './project-detail/helpers'
import type { Component } from '@@/types'

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

export function DependencyGraphPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const projects = useProjects()

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [showVulnerableOnly, setShowVulnerableOnly] = useState(false)

  // Node-selection details popup (FR-11.2-a)
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null)
  const [showDetail, setShowDetail] = useState(false)

  // Path highlighting (FR-11.2-b)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [highlightedPath, setHighlightedPath] = useState<string[] | null>(null)

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

  // Handle node click — open the shared component details popup (FR-11.2-a)
  const handleNodeClick = useCallback((component: Component) => {
    setSelectedComponent(component)
    setShowDetail(true)
  }, [])

  // Path highlighting (FR-11.2-b) — wire the From/To picker to findShortestPath
  const handleHighlightPath = useCallback(() => {
    const path = findShortestPath(components, fromId, toId)
    if (path) {
      setHighlightedPath(path)
    } else {
      setHighlightedPath(null)
      toast.error('No path found between these components')
    }
  }, [components, fromId, toId])

  const handleClearPath = useCallback(() => {
    setHighlightedPath(null)
  }, [])

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
            onClick={() => navigate('/dashboard')}
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
      <div className="px-6 pt-6">
        <PageHeader
          title="Dependency Graph"
          description={project.name}
          actions={
            <>
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

              {/* Path highlighting controls (FR-11.2-b) */}
              <div className="flex items-center gap-2">
                <select
                  aria-label="Path from"
                  value={fromId}
                  onChange={(e) => {
                    setFromId(e.target.value)
                    setHighlightedPath(null)
                  }}
                  className="px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">From…</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.version}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Path to"
                  value={toId}
                  onChange={(e) => {
                    setToId(e.target.value)
                    setHighlightedPath(null)
                  }}
                  className="px-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">To…</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.version}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleHighlightPath}
                  disabled={!fromId || !toId}
                  className="px-3 py-1.5 text-sm rounded-md border bg-background text-muted-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Highlight Path
                </button>
                <button
                  onClick={handleClearPath}
                  disabled={!highlightedPath}
                  className="px-3 py-1.5 text-sm rounded-md border bg-background text-muted-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Clear Path
                </button>
              </div>
            </>
          }
        />
      </div>

      {/* Truncation banner (FR-11.1-b): the graph caps at MAX_GRAPH_NODES. */}
      {filteredComponents.length > MAX_GRAPH_NODES && (
        <div className="mx-6 mb-2 rounded-md bg-yellow-500/15 px-3 py-2 text-sm text-yellow-600">
          Showing first {MAX_GRAPH_NODES} of {filteredComponents.length} components — narrow the filter to see the rest.
        </div>
      )}

      {/* Graph Container — the AppShell owns the single <main> landmark. */}
      <div className="flex-1 px-6 pb-6">
        <DependencyGraph
          components={filteredComponents}
          vulnerabilities={projectVulnerabilities}
          onNodeClick={handleNodeClick}
          highlightPath={highlightedPath ?? undefined}
          clearHighlight={!highlightedPath}
          height="calc(100vh - 180px)"
          showControls={true}
          showLegend={true}
          className="border rounded-lg"
        />
      </div>

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

      {/* Node-selection details (FR-11.2-a) — reuses the shared component popup. */}
      {selectedComponent && (
        <ComponentVulnerabilitiesPopup
          component={selectedComponent}
          vulnerabilities={getVulnerabilitiesForComponent(project, selectedComponent.id)}
          open={showDetail}
          onClose={() => {
            setShowDetail(false)
            setSelectedComponent(null)
          }}
          onViewVulnerability={() => navigate(`/project/${project.id}`)}
        />
      )}
    </div>
  )
}
