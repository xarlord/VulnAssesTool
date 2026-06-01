import React, { useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useProjects, useSettings } from '@/store/useStore'
import { Shield, Plus, Upload, Download, Search, BarChart3, FileText, AlertTriangle } from 'lucide-react'
import { CreateProjectDialog } from '@/components/CreateProjectDialog'
import { SbomUploadDialog } from '@/components/SbomUploadDialog'
import { SbomGeneratorDialog } from '@/components/SbomGeneratorDialog'
import { ExportDialog } from '@/components/ExportDialog'
import { ProjectCard } from '@/components/ProjectCard'
import { NotificationCenter } from '@/components/NotificationCenter'
import { useMenuActionListener } from '@/components/MenuActionListener'
import { OfflineIndicator } from '@/components/OfflineIndicator'
import { refreshVulnerabilityData } from '@/lib/refresh'
import { AppHeader } from '@/components/layout/AppHeader'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Project } from '@@/types'

export function Dashboard() {
  const navigate = useNavigate()
  const projects = useProjects()
  const deleteProject = useStore((s) => s.deleteProject)
  const settings = useSettings()
  const updateProject = useStore((s) => s.updateProject)
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [showUploadDialog, setShowUploadDialog] = React.useState(false)
  const [showExportDialog, setShowExportDialog] = React.useState(false)
  const [showSbomGeneratorDialog, setShowSbomGeneratorDialog] = React.useState(false)

  const [selectedProjectIds, setSelectedProjectIds] = React.useState<Set<string>>(new Set())
  const [isBulkMode, setIsBulkMode] = React.useState(false)

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

  useEffect(() => {
    const handleRefreshEvent = (e: CustomEvent) => {
      const { projectId, timestamp } = e.detail
      console.log(`Project ${projectId} vulnerability data refreshed at ${timestamp}`)
    }

    window.addEventListener('vuln-data-refreshed', handleRefreshEvent as EventListener)

    return () => {
      window.removeEventListener('vuln-data-refreshed', handleRefreshEvent as EventListener)
    }
  }, [])

  useMenuActionListener('menu-open-create-project', () => setShowCreateDialog(true))
  useMenuActionListener('menu-open-upload-sbom', () => setShowUploadDialog(true))
  useMenuActionListener('menu-open-sbom-generator', () => setShowSbomGeneratorDialog(true))

  useEffect(() => {
    const handleExportMenu = (_e: CustomEvent) => {
      setShowExportDialog(true)
    }

    window.addEventListener('menu-open-export', handleExportMenu as EventListener)

    return () => {
      window.removeEventListener('menu-open-export', handleExportMenu as EventListener)
    }
  }, [])

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
      <AppHeader
        title="Dashboard"
        actions={
          <div className="flex items-center gap-1.5">
            <OfflineIndicator compact />
            <NotificationCenter />
            <div className="mx-1 h-6 w-px bg-border" />
            <Button variant="ghost" size="icon" onClick={() => navigate('/search')} data-testid="nav-search">
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/executive')} disabled={projects.length === 0}>
              <BarChart3 className="mr-1.5 h-4 w-4" />
              Executive
            </Button>
            <div className="mx-1 h-6 w-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowExportDialog(true)}
              disabled={projects.length === 0}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSbomGeneratorDialog(true)}>
              <FileText className="mr-1.5 h-4 w-4" />
              Generate SBOM
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUploadDialog(true)}
              disabled={projects.length === 0}
              data-tour="import-sbom-button"
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Import
            </Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} data-tour="new-project-button">
              <Plus className="mr-1.5 h-4 w-4" />
              New Project
            </Button>
          </div>
        }
      />

      <main className="flex-1 p-6" data-tour="dashboard">
        <div className="mx-auto max-w-7xl">
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Projects</CardTitle>
                <Shield className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statistics.totalProjects}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-destructive">Critical</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{statistics.criticalCount}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">High</CardTitle>
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-700 dark:text-orange-400">{statistics.highCount}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Vulnerabilities</CardTitle>
                <Shield className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{statistics.totalVulnerabilities}</div>
              </CardContent>
            </Card>
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent Projects {projects.length > 0 && `(${projects.length})`}</h2>
              {projects.length > 0 && (
                <Button variant={isBulkMode ? 'default' : 'outline'} size="sm" onClick={handleToggleBulkMode}>
                  {isBulkMode ? 'Exit Selection' : 'Select Projects'}
                </Button>
              )}
            </div>

            {isBulkMode && selectedProjectIds.size > 0 && (
              <Card className="mb-4">
                <CardContent className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">
                      {selectedProjectIds.size} project
                      {selectedProjectIds.size !== 1 ? 's' : ''} selected
                    </span>
                    <Button variant="ghost" size="sm" onClick={handleClearSelection}>
                      Clear selection
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleBulkAction('export')}>
                      <Download className="mr-1.5 h-4 w-4" />
                      Export
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm(`Delete ${selectedProjectIds.size} selected projects?`)) {
                          handleBulkAction('delete')
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {projects.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Shield className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">No projects yet</h3>
                  <p className="mb-4 text-center text-sm text-muted-foreground">
                    Create a new project to get started with vulnerability assessment
                  </p>
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    Create Your First Project
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {isBulkMode && (
                  <div className="mb-3">
                    <label className="flex cursor-pointer items-center gap-2">
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

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {sortedProjects.map((project) => (
                    <div key={project.id} className="relative">
                      {isBulkMode && (
                        <div className="absolute left-3 top-3 z-10">
                          <input
                            type="checkbox"
                            checked={selectedProjectIds.has(project.id)}
                            onChange={() => handleToggleProjectSelection(project.id)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-ring"
                          />
                        </div>
                      )}
                      <div className={isBulkMode ? 'pl-8' : ''}>
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

      <CreateProjectDialog open={showCreateDialog} onClose={() => setShowCreateDialog(false)} />
      <SbomUploadDialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} />
      <SbomGeneratorDialog open={showSbomGeneratorDialog} onClose={() => setShowSbomGeneratorDialog(false)} />
      <ExportDialog open={showExportDialog} onClose={() => setShowExportDialog(false)} projects={projects} />
    </div>
  )
}
