import React, { useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useProjects, useSettings, useRefreshingProjectIds } from '@/store/useStore'
import { Shield, Plus, Upload, Download, Search, BarChart3, FileText } from 'lucide-react'
import CreateProjectDialog from '@/components/CreateProjectDialog'
import SbomUploadDialog from '@/components/SbomUploadDialog'
import SbomGeneratorDialog from '@/components/SbomGeneratorDialog'
import ExportDialog from '@/components/ExportDialog'
import ProjectCard from '@/components/ProjectCard'
import { NotificationCenter } from '@/components/NotificationCenter'
import { useMenuActionListener } from '@/components/MenuActionListener'
import { OfflineIndicator } from '@/components/OfflineIndicator'
import { refreshVulnerabilityData } from '@/lib/refresh'
import { AppLogo } from '@/components/AppLogo'
import type { Project } from '@@/types'

export default function Dashboard() {
  const navigate = useNavigate()
  const projects = useProjects()
  const deleteProject = useStore((s) => s.deleteProject)
  const settings = useSettings()
  const _refreshingProjectIds = useRefreshingProjectIds()
  const updateProject = useStore((s) => s.updateProject)
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [showUploadDialog, setShowUploadDialog] = React.useState(false)
  const [showExportDialog, setShowExportDialog] = React.useState(false)
  const [showSbomGeneratorDialog, setShowSbomGeneratorDialog] = React.useState(false)

  // Bulk selection state
  const [selectedProjectIds, setSelectedProjectIds] = React.useState<Set<string>>(new Set())
  const [isBulkMode, setIsBulkMode] = React.useState(false)

  // Handle manual refresh of vulnerability data
  const handleRefreshVulnData = async (projectId: string) => {
    try {
      const project = projects.find((p) => p.id === projectId)
      if (!project) return

      const result = await refreshVulnerabilityData(project.components, {
        cacheTTL: settings.vulnDataCacheTTL,
        onProgress: (current, total) => {
          console.log(`Refresh progress: ${current}/${total}`)
        },
      })

      if (result.success) {
        // Update the project with new vulnerabilities and last refresh timestamp
        updateProject(projectId, {
          vulnerabilities: result.vulnerabilities,
          lastVulnDataRefresh: new Date(),
          statistics: {
            ...project.statistics,
            totalVulnerabilities: result.vulnerabilities.length,
            criticalCount: result.vulnerabilities.filter((v) => v.severity === 'critical').length,
            highCount: result.vulnerabilities.filter((v) => v.severity === 'high').length,
            mediumCount: result.vulnerabilities.filter((v) => v.severity === 'medium').length,
            lowCount: result.vulnerabilities.filter((v) => v.severity === 'low').length,
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

  // Calculate aggregate statistics across all projects
  const statistics = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        return {
          totalProjects: acc.totalProjects + 1,
          criticalCount: acc.criticalCount + project.statistics.criticalCount,
          highCount: acc.highCount + project.statistics.highCount,
          mediumCount: acc.mediumCount + project.statistics.mediumCount,
          lowCount: acc.lowCount + project.statistics.lowCount,
          totalVulnerabilities: acc.totalVulnerabilities + project.statistics.totalVulnerabilities,
          totalComponents: acc.totalComponents + project.statistics.totalComponents,
        }
      },
      {
        totalProjects: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        totalVulnerabilities: 0,
        totalComponents: 0,
      },
    )
  }, [projects])

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
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <AppLogo size="md" showText={true} />
          <div className="flex items-center gap-3">
            <OfflineIndicator compact />
            <button
              onClick={() => navigate('/search')}
              data-testid="nav-search"
              className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
            <NotificationCenter />
            <button
              onClick={() => navigate('/settings')}
              data-tour="settings-link"
              className="rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80"
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6" data-tour="dashboard">
        <div className="mx-auto max-w-7xl">
          {/* Quick Actions */}
          <div className="mb-8 flex flex-wrap gap-4">
            <button
              onClick={() => setShowCreateDialog(true)}
              data-tour="new-project-button"
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-5 w-5" />
              New Project
            </button>
            <button
              onClick={() => setShowUploadDialog(true)}
              data-tour="import-sbom-button"
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 hover:bg-muted"
              disabled={projects.length === 0}
            >
              <Upload className="h-5 w-5" />
              Import SBOM
            </button>
            <button
              onClick={() => setShowSbomGeneratorDialog(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 hover:bg-muted"
            >
              <FileText className="h-5 w-5" />
              Generate SBOM from Excel
            </button>
            <button
              onClick={() => setShowExportDialog(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 hover:bg-muted"
              disabled={projects.length === 0}
            >
              <Download className="h-5 w-5" />
              Export All
            </button>
            <button
              onClick={() => navigate('/executive')}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 hover:bg-muted"
              disabled={projects.length === 0}
            >
              <BarChart3 className="h-5 w-5" />
              Executive Dashboard
            </button>
          </div>

          {/* Statistics */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="text-sm text-muted-foreground">Projects</div>
              <div className="mt-2 text-3xl font-bold">{statistics.totalProjects}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="text-sm text-destructive">Critical</div>
              <div className="mt-2 text-3xl font-bold text-destructive">{statistics.criticalCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="text-sm text-orange-700 dark:text-orange-400">High</div>
              <div className="mt-2 text-3xl font-bold text-orange-700 dark:text-orange-400">{statistics.highCount}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="text-sm text-muted-foreground">Total Vulnerabilities</div>
              <div className="mt-2 text-3xl font-bold">{statistics.totalVulnerabilities}</div>
            </div>
          </div>

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
                  <button
                    onClick={handleClearSelection}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
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
                    onClick={() => {
                      if (confirm(`Delete ${selectedProjectIds.size} selected projects?`)) {
                        handleBulkAction('delete')
                      }
                    }}
                    className="flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}

            {projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/50 p-12">
                <Shield className="mb-4 h-16 w-16 text-muted-foreground" />
                <h3 className="text-lg font-medium">No projects yet</h3>
                <p className="text-center text-muted-foreground">
                  Create a new project to get started with vulnerability assessment
                </p>
                <button
                  onClick={() => setShowCreateDialog(true)}
                  className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Create Your First Project
                </button>
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
      </main>

      {/* Create Project Dialog */}
      <CreateProjectDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />

      {/* SBOM Upload Dialog */}
      <SbomUploadDialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} />

      {/* SBOM Generator Dialog */}
      <SbomGeneratorDialog open={showSbomGeneratorDialog} onClose={() => setShowSbomGeneratorDialog(false)} />

      {/* Export Dialog */}
      <ExportDialog open={showExportDialog} onClose={() => setShowExportDialog(false)} projects={projects} />
    </div>
  )
}
