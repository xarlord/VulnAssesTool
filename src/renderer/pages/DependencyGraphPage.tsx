import { useMemo, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Filter, Shield } from 'lucide-react'
import { DependencyGraph } from '@/components/graph/DependencyGraph'
import { AppHeader } from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProjects } from '@/store/useStore'
import type { Component } from '@@/types'

type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

export function DependencyGraphPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const projects = useProjects()

  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all')
  const [showVulnerableOnly, setShowVulnerableOnly] = useState(false)

  const project = useMemo(() => {
    return projects.find((p) => p.id === projectId)
  }, [projects, projectId])

  const components = useMemo(() => {
    return project?.components || []
  }, [project])

  const projectVulnerabilities = useMemo(() => {
    if (!project) return []
    return project.vulnerabilities || []
  }, [project])

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

  const handleNodeClick = useCallback((component: Component) => {
    console.log('[DependencyGraphPage] Node clicked:', component.name)
  }, [])

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
      <div className="flex flex-col h-full">
        <AppHeader title="Dependency Graph" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground">Project not found</h2>
            <p className="text-sm text-muted-foreground">The project you are looking for does not exist.</p>
            <Button onClick={() => navigate('/dashboard')} variant="outline">
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const breadcrumbs = [
    { label: 'Projects', path: '/dashboard' },
    { label: project.name, path: `/project/${projectId}` },
    { label: 'Dependency Graph' },
  ]

  const filterActions = (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={severityFilter} onValueChange={(value) => setSeverityFilter(value as SeverityFilter)}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="All Severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <Checkbox checked={showVulnerableOnly} onCheckedChange={(checked) => setShowVulnerableOnly(checked === true)} />
        Vulnerable Only
      </label>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <AppHeader title="Dependency Graph" breadcrumbs={breadcrumbs} actions={filterActions} />

      <div className="flex-1 p-4 min-h-0">
        <DependencyGraph
          components={filteredComponents}
          vulnerabilities={projectVulnerabilities}
          onNodeClick={handleNodeClick}
          height="calc(100vh - 12rem)"
          showControls={true}
          showLegend={true}
          className="border rounded-lg"
        />
      </div>

      <footer className="px-6 py-2.5 border-t bg-card">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span>
              {filteredComponents.length} of {components.length} components
            </span>
            <span className="text-border">|</span>
            <span>{projectVulnerabilities.length} vulnerabilities</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 font-medium">
              Critical {counts.critical}
            </Badge>
            <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100 font-medium">
              High {counts.high}
            </Badge>
            <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100 font-medium">
              Medium {counts.medium}
            </Badge>
            <Badge className="bg-green-100 text-green-700 border-green-200 hover:bg-green-100 font-medium">
              Low {counts.low}
            </Badge>
          </div>
        </div>
      </footer>
    </div>
  )
}
