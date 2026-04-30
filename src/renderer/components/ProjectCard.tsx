import React from 'react'
import { Shield, AlertTriangle, Calendar, Trash2, RefreshCw, Filter } from 'lucide-react'
import { useSettings, useRefreshingProjectIds } from '@/store/useStore'
import { StalenessBadge } from './StalenessIndicator'
import { formatTimeUntilRefresh, getNextRefreshTime } from '@/lib/refresh'
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

  const getSeverityColor = (count: number) => {
    if (count === 0) return 'text-muted-foreground'
    return 'text-destructive'
  }

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
    <div
      className="group flex cursor-pointer items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={() => onView(project)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View project ${project.name}`}
    >
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{project.name}</h3>
              <StalenessBadge lastRefresh={project.lastVulnDataRefresh} settings={settings} />
            </div>
            {project.description && <p className="text-sm text-muted-foreground line-clamp-1">{project.description}</p>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          {/* Components count */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            <span>{project.statistics.totalComponents} components</span>
          </div>

          {/* Vulnerabilities count */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <AlertTriangle className={`h-3.5 w-3.5 ${getSeverityColor(project.statistics.criticalCount)}`} />
            <span>{project.statistics.totalVulnerabilities} vulnerabilities</span>
          </div>

          {/* Last updated */}
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>Updated {formatDate(project.updatedAt)}</span>
          </div>

          {/* Next refresh time (if auto-refresh enabled) */}
          {settings.autoRefresh && project.lastVulnDataRefresh && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{formatTimeUntilRefresh(getNextRefreshTime(project, settings.autoRefreshInterval))}</span>
            </div>
          )}
        </div>

        {/* Severity badges */}
        {project.statistics.totalVulnerabilities > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {project.statistics.criticalCount > 0 && (
              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                {project.statistics.criticalCount} Critical
              </span>
            )}
            {project.statistics.highCount > 0 && (
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                {project.statistics.highCount} High
              </span>
            )}
            {project.statistics.mediumCount > 0 && (
              <span className="rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {project.statistics.mediumCount} Medium
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onView(project)
          }}
          className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
        >
          View
        </button>
        {onFpf && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onFpf(project.id)
            }}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80 flex items-center gap-1.5"
            title="False Positive Filter"
          >
            <Filter className="h-3.5 w-3.5" />
            FPF
          </button>
        )}
        {onRefresh && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRefresh(project.id)
            }}
            disabled={isRefreshing}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Refresh vulnerability data"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
        <button
          onClick={handleDeleteClick}
          className="rounded-md border border-border bg-secondary p-1.5 text-destructive hover:bg-destructive/10"
          aria-label="Delete project"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
})
export default ProjectCard
