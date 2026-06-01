import React from 'react'
import { Shield, AlertTriangle, Calendar, Trash2, RefreshCw, Filter } from 'lucide-react'
import { useSettings, useRefreshingProjectIds } from '@/store/useStore'
import { StalenessBadge } from './StalenessIndicator'
import { formatTimeUntilRefresh, getNextRefreshTime } from '@/lib/refresh'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Project } from '@@/types'

interface ProjectCardProps {
  project: Project
  onView: (project: Project) => void
  onDelete: (projectId: string) => void
  onRefresh?: (projectId: string) => void
  onFpf?: (projectId: string) => void
}

const ProjectCard = React.memo(function ProjectCard({ project, onView, onDelete, onRefresh, onFpf }: ProjectCardProps) {
  const settings = useSettings()
  const refreshingProjectIds = useRefreshingProjectIds()
  const isRefreshing = refreshingProjectIds.has(project.id)

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date))
  }

  const totalVulns = project.statistics.totalVulnerabilities
  const criticalPct = totalVulns > 0 ? (project.statistics.criticalCount / totalVulns) * 100 : 0
  const highPct = totalVulns > 0 ? (project.statistics.highCount / totalVulns) * 100 : 0
  const mediumPct = totalVulns > 0 ? (project.statistics.mediumCount / totalVulns) * 100 : 0
  const lowPct = totalVulns > 0 ? (project.statistics.lowCount / totalVulns) * 100 : 0

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
      onDelete(project.id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onView(project)
    }
  }

  return (
    <Card
      className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/20 focus-within:ring-2 focus-within:ring-ring"
      onClick={() => onView(project)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View project ${project.name}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="truncate text-base">{project.name}</CardTitle>
              <StalenessBadge lastRefresh={project.lastVulnDataRefresh} settings={settings} />
            </div>
            {project.description && (
              <p className="mt-1 truncate text-sm text-muted-foreground">{project.description}</p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  onRefresh(project.id)
                }}
                disabled={isRefreshing}
                aria-label="Refresh vulnerability data"
                className="h-8 w-8"
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            )}
            {onFpf && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  onFpf(project.id)
                }}
                title="False Positive Filter"
                className="h-8 px-2"
              >
                <Filter className="mr-1 h-3.5 w-3.5" />
                FPF
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDeleteClick}
              aria-label="Delete project"
              className="h-8 w-8 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {totalVulns > 0 && (
          <div className="space-y-2">
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
              {criticalPct > 0 && <div className="bg-red-500 transition-all" style={{ width: `${criticalPct}%` }} />}
              {highPct > 0 && <div className="bg-orange-500 transition-all" style={{ width: `${highPct}%` }} />}
              {mediumPct > 0 && <div className="bg-amber-500 transition-all" style={{ width: `${mediumPct}%` }} />}
              {lowPct > 0 && <div className="bg-green-500 transition-all" style={{ width: `${lowPct}%` }} />}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {project.statistics.criticalCount > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {project.statistics.criticalCount} Critical
                </Badge>
              )}
              {project.statistics.highCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-400 text-xs"
                >
                  {project.statistics.highCount} High
                </Badge>
              )}
              {project.statistics.mediumCount > 0 && (
                <Badge
                  variant="outline"
                  className="border-yellow-300 bg-yellow-50 text-amber-700 dark:border-yellow-700 dark:bg-yellow-950 dark:text-amber-400 text-xs"
                >
                  {project.statistics.mediumCount} Medium
                </Badge>
              )}
              {project.statistics.lowCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {project.statistics.lowCount} Low
                </Badge>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            <span>{project.statistics.totalComponents} components</span>
          </div>
          <div className="flex items-center gap-1">
            <AlertTriangle className={`h-3 w-3 ${project.statistics.criticalCount > 0 ? 'text-destructive' : ''}`} />
            <span>{totalVulns} vulnerabilities</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatDate(project.updatedAt)}</span>
          </div>
          {settings.autoRefresh && project.lastVulnDataRefresh && (
            <div className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              <span>{formatTimeUntilRefresh(getNextRefreshTime(project, settings.autoRefreshInterval))}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})
export { ProjectCard }
