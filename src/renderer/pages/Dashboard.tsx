import React, { useMemo, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useProjects, useSettings } from '@/store/useStore'
import {
  Plus,
  Upload,
  Download,
  FileText,
  FolderOpen,
  ShieldAlert,
  AlertTriangle,
  Bug,
  Search,
  BarChart3,
  Zap,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { CreateProjectDialog } from '@/components/CreateProjectDialog'
import { SbomUploadDialog } from '@/components/SbomUploadDialog'
import { SbomGeneratorDialog } from '@/components/SbomGeneratorDialog'
import { ExportDialog } from '@/components/ExportDialog'
import { ProjectCard } from '@/components/ProjectCard'
import { PageHeader } from '@/components/PageHeader'
import { StatCard } from '@/components/StatCard'
import { ChartCard } from '@/components/charts/ChartCard'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useMenuActionListener } from '@/components/MenuActionListener'
import { refreshVulnerabilityData } from '@/lib/refresh'
import { enrichVulnerabilities } from '@/lib/services/intelligence/enrichVulnerabilities'
import { aggregateProjectStats } from '@/lib/stats/projectAggregates'
import { getSeverityTextClass } from '@/lib/severity'
import type { Project, Vulnerability } from '@@/types'

// recharts stays out of the Dashboard chunk until a chart actually renders.
const SeverityDistributionChart = lazy(() =>
  import('@/components/charts/SeverityDistributionChart').then((m) => ({ default: m.SeverityDistributionChart })),
)

// Getting-started guide (relocated from the removed marketing HomePage). Shown
// in the empty state so a brand-new user still gets the workflow orientation.
const GETTING_STARTED: Array<{ icon: LucideIcon; title: string; description: string }> = [
  { icon: Plus, title: 'Create a project', description: 'Organize assessments per software product or component.' },
  {
    icon: Upload,
    title: 'Import an SBOM',
    description: 'Scan CycloneDX or SPDX components against NVD, KEV, and EPSS.',
  },
  { icon: Search, title: 'Search vulnerabilities', description: 'Query the NVD database by CVE ID, keyword, or CPE.' },
  {
    icon: BarChart3,
    title: 'View reports',
    description: 'Generate VEX documents, attack graphs, and executive reports.',
  },
]

const TIPS: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: Zap,
    title: 'CPE matching',
    description:
      'D-Fence estimates CPEs for components without them — review and approve suggested matches for accurate scanning.',
  },
  {
    icon: FileText,
    title: 'SBOM formats',
    description: 'CycloneDX (JSON/XML) and SPDX (JSON) are supported; Excel-based SBOMs can be generated and imported.',
  },
  {
    icon: ShieldCheck,
    title: 'False positive filters',
    description: 'Use the FPF system to suppress known non-issues and keep reports actionable.',
  },
]

export function Dashboard() {
  const navigate = useNavigate()
  const projects = useProjects()
  const deleteProject = useStore((s) => s.deleteProject)
  const settings = useSettings()
  const updateProject = useStore((s) => s.updateProject)
  const setRefreshingProject = useStore((s) => s.setRefreshingProject)
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [showUploadDialog, setShowUploadDialog] = React.useState(false)
  const [showExportDialog, setShowExportDialog] = React.useState(false)
  const [showSbomGeneratorDialog, setShowSbomGeneratorDialog] = React.useState(false)

  // Bulk selection state
  const [selectedProjectIds, setSelectedProjectIds] = React.useState<Set<string>>(new Set())
  const [isBulkMode, setIsBulkMode] = React.useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = React.useState(false)

  // Handle manual refresh of vulnerability data. `force` bypasses the vuln cache and re-queries
  // fresh data (FR-03.5); a normal click keeps the cached, TTL-bounded path.
  const handleRefreshVulnData = async (projectId: string, force = false) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    // Engage ProjectCard's spinner/disabled state for the whole refresh so overlapping clicks can't
    // race (the store selector useRefreshingProjectIds drives the card UI off this flag).
    setRefreshingProject(projectId, true)
    try {
      const result = await refreshVulnerabilityData(project.components, {
        cacheTTL: settings.vulnDataCacheTTL,
        useCache: !force,
        onProgress: (current, total) => {
          console.log(`Refresh progress: ${current}/${total}`)
        },
      })

      if (result.success) {
        // Merge by id — replace matched existing entries with the refreshed version, keep
        // existing entries this refresh didn't rediscover, then re-enrich so a refresh never
        // drops KEV/EPSS intelligence or previously-known vulns (mirrors project-detail's
        // handleScan/handleRefreshVulnData merge).
        const existingVulnerabilities = project.vulnerabilities || []
        const mergedVulnerabilities: Vulnerability[] = []

        for (const existingVuln of existingVulnerabilities) {
          const refreshedVuln = result.vulnerabilities.find((v) => v.id === existingVuln.id)
          mergedVulnerabilities.push(refreshedVuln || existingVuln)
        }

        for (const refreshedVuln of result.vulnerabilities) {
          if (!existingVulnerabilities.some((v) => v.id === refreshedVuln.id)) {
            mergedVulnerabilities.push(refreshedVuln)
          }
        }

        const enrichedVulnerabilities = await enrichVulnerabilities(mergedVulnerabilities)

        // Update the project with the merged, enriched vulnerabilities and last refresh timestamp
        updateProject(projectId, {
          vulnerabilities: enrichedVulnerabilities,
          lastVulnDataRefresh: new Date(),
          statistics: {
            ...project.statistics,
            totalVulnerabilities: enrichedVulnerabilities.length,
            criticalCount: enrichedVulnerabilities.filter((v) => v.severity === 'critical').length,
            highCount: enrichedVulnerabilities.filter((v) => v.severity === 'high').length,
            mediumCount: enrichedVulnerabilities.filter((v) => v.severity === 'medium').length,
            lowCount: enrichedVulnerabilities.filter((v) => v.severity === 'low').length,
          },
        })

        // Dispatch event for other listeners
        window.dispatchEvent(
          new CustomEvent('vuln-data-refreshed', {
            detail: { projectId, timestamp: new Date(), result },
          }),
        )
      }
    } catch (error) {
      console.error('Failed to refresh vulnerability data:', error)
    } finally {
      setRefreshingProject(projectId, false)
    }
  }

  // Listen for vulnerability data refresh events
  useEffect(() => {
    const handleRefreshEvent = (e: CustomEvent) => {
      const { projectId, timestamp } = e.detail
      // Could trigger a toast notification here
      console.log(`Project ${projectId} vulnerability data refreshed at ${timestamp}`)
    }

    window.addEventListener('vuln-data-refreshed', handleRefreshEvent as EventListener)

    return () => {
      window.removeEventListener('vuln-data-refreshed', handleRefreshEvent as EventListener)
    }
  }, [])

  // Listen for menu action events
  useMenuActionListener('menu-open-create-project', () => setShowCreateDialog(true))
  useMenuActionListener('menu-open-upload-sbom', () => setShowUploadDialog(true))
  useMenuActionListener('menu-open-sbom-generator', () => setShowSbomGeneratorDialog(true))

  // Listen for export menu action with projects data
  useEffect(() => {
    const handleExportMenu = (_e: CustomEvent) => {
      setShowExportDialog(true)
    }

    window.addEventListener('menu-open-export', handleExportMenu as EventListener)

    return () => {
      window.removeEventListener('menu-open-export', handleExportMenu as EventListener)
    }
  }, [])

  // Aggregate statistics across all projects (shared source of truth with Reports).
  const statistics = useMemo(() => aggregateProjectStats(projects), [projects])

  // Sort projects by last updated
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [projects])

  const handleViewProject = (project: Project) => {
    navigate(`/project/${project.id}`)
  }

  const handleOpenFpf = (projectId: string) => {
    navigate(`/project/${projectId}/fpf`)
  }

  const handleDeleteProject = (projectId: string) => {
    deleteProject(projectId)
  }

  // Bulk action handlers
  const handleToggleBulkMode = () => {
    setIsBulkMode(!isBulkMode)
    setSelectedProjectIds(new Set())
  }

  const handleToggleProjectSelection = (projectId: string) => {
    const newSelection = new Set(selectedProjectIds)
    if (newSelection.has(projectId)) {
      newSelection.delete(projectId)
    } else {
      newSelection.add(projectId)
    }
    setSelectedProjectIds(newSelection)
  }

  const handleToggleAllProjects = () => {
    if (selectedProjectIds.size === projects.length) {
      setSelectedProjectIds(new Set())
    } else {
      setSelectedProjectIds(new Set(projects.map((p) => p.id)))
    }
  }

  const handleBulkAction = (action: 'delete' | 'export') => {
    if (action === 'delete') {
      for (const id of selectedProjectIds) {
        deleteProject(id)
      }
      setSelectedProjectIds(new Set())
      setIsBulkMode(false)
    } else if (action === 'export') {
      setShowExportDialog(true)
    }
  }

  const handleClearSelection = () => {
    setSelectedProjectIds(new Set())
  }

  return (
    <div className="p-6" data-tour="dashboard">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title="Dashboard"
          description="Vulnerability assessment across all your projects"
          actions={
            <>
              <button
                onClick={() => setShowCreateDialog(true)}
                data-tour="new-project-button"
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                New Project
              </button>
              <button
                onClick={() => setShowUploadDialog(true)}
                data-tour="import-sbom-button"
                disabled={projects.length === 0}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Import SBOM
              </button>
              <button
                onClick={() => setShowSbomGeneratorDialog(true)}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <FileText className="h-4 w-4" />
                Generate SBOM from Excel
              </button>
              <button
                onClick={() => setShowExportDialog(true)}
                disabled={projects.length === 0}
                className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Export All
              </button>
            </>
          }
        />

        {/* Statistics */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Projects"
            value={statistics.totalProjects}
            icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />}
          />
          <StatCard
            label="Critical"
            value={statistics.criticalCount}
            valueClassName={getSeverityTextClass('critical')}
            icon={<ShieldAlert className={`h-4 w-4 ${getSeverityTextClass('critical')}`} />}
          />
          <StatCard
            label="High"
            value={statistics.highCount}
            valueClassName={getSeverityTextClass('high')}
            icon={<AlertTriangle className={`h-4 w-4 ${getSeverityTextClass('high')}`} />}
          />
          <StatCard
            label="Total Vulnerabilities"
            value={statistics.totalVulnerabilities}
            icon={<Bug className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        {/* Severity distribution — only meaningful once there are findings. */}
        {statistics.totalVulnerabilities > 0 && (
          <div className="mb-8">
            <ChartCard title="Severity distribution" description="Across all projects">
              <Suspense fallback={<div className="h-[300px] animate-pulse rounded-md bg-muted/40" />}>
                <SeverityDistributionChart
                  counts={{
                    critical: statistics.criticalCount,
                    high: statistics.highCount,
                    medium: statistics.mediumCount,
                    low: statistics.lowCount,
                    none: 0,
                  }}
                  height={280}
                />
              </Suspense>
            </ChartCard>
          </div>
        )}

        {/* Projects List */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recent Projects {projects.length > 0 && `(${projects.length})`}</h2>
            {projects.length > 0 && (
              <button
                onClick={handleToggleBulkMode}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                  isBulkMode
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border bg-secondary hover:bg-secondary/80'
                }`}
              >
                {isBulkMode ? 'Exit Selection' : 'Select Projects'}
              </button>
            )}
          </div>

          {/* Bulk Actions Bar */}
          {isBulkMode && selectedProjectIds.size > 0 && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-3">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedProjectIds.size} project{selectedProjectIds.size !== 1 ? 's' : ''} selected
                </span>
                <button onClick={handleClearSelection} className="text-sm text-muted-foreground hover:text-foreground">
                  Clear selection
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkAction('export')}
                  className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </button>
              </div>
            </div>
          )}

          {projects.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/50 p-8">
              <div className="flex flex-col items-center text-center">
                <ShieldCheck className="mb-4 h-16 w-16 text-muted-foreground" />
                <h3 className="text-lg font-medium">No projects yet</h3>
                <p className="mt-1 max-w-md text-muted-foreground">
                  Create a new project to get started with vulnerability assessment
                </p>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Create Your First Project
                </button>
              </div>

              {/* Getting-started guide (relocated from HomePage) */}
              <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {GETTING_STARTED.map((step) => {
                  const Icon = step.icon
                  return (
                    <div key={step.title} className="rounded-lg border border-border bg-card p-4">
                      <Icon className="mb-2 h-5 w-5 text-primary" aria-hidden="true" />
                      <h4 className="text-sm font-semibold">{step.title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  )
                })}
              </div>

              <div className="mx-auto mt-6 grid max-w-4xl gap-4 sm:grid-cols-3">
                {TIPS.map((tip) => {
                  const Icon = tip.icon
                  return (
                    <div key={tip.title} className="flex gap-3 rounded-lg border border-border bg-background p-4">
                      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <div>
                        <h4 className="text-xs font-semibold">{tip.title}</h4>
                        <p className="mt-1 text-xs text-muted-foreground">{tip.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <>
              {/* Select All Checkbox */}
              {isBulkMode && (
                <div className="mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.size === projects.length && projects.length > 0}
                      ref={(el) => {
                        if (el) {
                          el.indeterminate = selectedProjectIds.size > 0 && selectedProjectIds.size < projects.length
                        }
                      }}
                      onChange={handleToggleAllProjects}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                    />
                    <span className="text-sm font-medium">
                      {selectedProjectIds.size === projects.length && projects.length > 0
                        ? 'Deselect All'
                        : 'Select All'}
                    </span>
                  </label>
                </div>
              )}

              <div className="space-y-2">
                {sortedProjects.map((project) => (
                  <div key={project.id} className="relative">
                    {/* Selection Checkbox */}
                    {isBulkMode && (
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
                        <input
                          type="checkbox"
                          checked={selectedProjectIds.has(project.id)}
                          onChange={() => handleToggleProjectSelection(project.id)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    )}
                    <div className={isBulkMode ? 'pl-12' : ''}>
                      <ProjectCard
                        key={project.id}
                        project={project}
                        onView={handleViewProject}
                        onDelete={handleDeleteProject}
                        onRefresh={handleRefreshVulnData}
                        onFpf={handleOpenFpf}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Project Dialog */}
      <CreateProjectDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />

      {/* SBOM Upload Dialog */}
      <SbomUploadDialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} />

      {/* SBOM Generator Dialog */}
      <SbomGeneratorDialog open={showSbomGeneratorDialog} onClose={() => setShowSbomGeneratorDialog(false)} />

      {/* Export Dialog */}
      <ExportDialog open={showExportDialog} onClose={() => setShowExportDialog(false)} projects={projects} />

      {/* Bulk delete confirmation (replaces native confirm()) */}
      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title="Delete selected projects"
        message={`Delete ${selectedProjectIds.size} selected project${selectedProjectIds.size !== 1 ? 's' : ''}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          handleBulkAction('delete')
          setShowBulkDeleteConfirm(false)
        }}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  )
}
