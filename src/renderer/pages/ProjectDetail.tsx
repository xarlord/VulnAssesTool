import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Shield, ShieldCheck, Search, Loader2, Download, FileText, RefreshCcw } from 'lucide-react'
import { useStore } from '@/store/useStore'
import { logSbomRemove } from '@/lib/audit'
import { toast } from '@/components/Toaster'
import { PageHeader } from '@/components/PageHeader'
import { SbomUploadDialog } from '@/components/SbomUploadDialog'
import { ContainerScanDialog } from '@/components/ContainerScanDialog'
import { BinarySbomDialog } from '@/components/BinarySbomDialog'
import { ExportDialog } from '@/components/ExportDialog'
import { ComplianceReportDialog } from '@/components/ComplianceReportDialog'
import { VulnerabilityDetailModal } from '@/components/VulnerabilityDetailModal'
import { ComponentVulnerabilitiesPopup } from '@/components/ComponentVulnerabilitiesPopup'
import { StalenessIndicator } from '@/components/StalenessIndicator'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ReportPreview } from '@/components/reports'
import { OverviewTab } from './project-detail/OverviewTab'
import { ComponentsTab } from './project-detail/ComponentsTab'
import { VulnerabilitiesTab } from './project-detail/VulnerabilitiesTab'
import { HealthTab } from './project-detail/HealthTab'
import { EditProjectDialog } from './project-detail/EditProjectDialog'
import { useProjectScan } from './project-detail/useProjectScan'
import { getVulnerabilitiesForComponent, buildReportData } from './project-detail/helpers'
import type { Vulnerability, Component } from '@@/types'

type TabValue = 'overview' | 'components' | 'vulnerabilities' | 'health'

const TABS: { value: TabValue; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'components', label: 'Components' },
  { value: 'vulnerabilities', label: 'Vulnerabilities' },
  { value: 'health', label: 'Health' },
]

export function ProjectDetail() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const {
    projects,
    currentProject,
    setCurrentProject,
    deleteProject,
    updateProject,
    settings,
    refreshingProjectIds,
    hydrateProjectFromServer,
  } = useStore()

  const [showEditDialog, setShowEditDialog] = React.useState(false)
  const [showUploadDialog, setShowUploadDialog] = React.useState(false)
  const [showContainerScanDialog, setShowContainerScanDialog] = React.useState(false)
  const [showBinarySbomDialog, setShowBinarySbomDialog] = React.useState(false)
  const [showExportDialog, setShowExportDialog] = React.useState(false)
  const [showComplianceDialog, setShowComplianceDialog] = React.useState(false)
  const [showReportPreview, setShowReportPreview] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [selectedVulnerability, setSelectedVulnerability] = React.useState<Vulnerability | null>(null)
  const [showVulnDetail, setShowVulnDetail] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState<TabValue>('overview')

  // Component vulnerabilities popup state
  const [selectedComponent, setSelectedComponent] = React.useState<Component | null>(null)
  const [showComponentVulnPopup, setShowComponentVulnPopup] = React.useState(false)

  // Find project from store - prioritize currentProject from store for better reactivity
  // When updateProject is called, currentProject is updated directly in the store
  const project = React.useMemo(() => {
    return currentProject?.id === projectId
      ? currentProject
      : projects.find((p) => p.id === projectId) || currentProject
  }, [currentProject, projects, projectId])

  const scan = useProjectScan({ project, updateProject, settings })
  const isRefreshing = (projectId != null && refreshingProjectIds.has(projectId)) || scan.isRefreshingVuln
  // Only build report data while the preview is actually open. buildReportData runs
  // several O(n) passes over the vulnerability list, and `project` gets a fresh
  // reference on every unrelated mutation (rename, etc.), so computing it eagerly
  // burned that work on every edit for a result nothing was reading.
  const reportData = React.useMemo(
    () => (project && showReportPreview ? buildReportData(project) : null),
    [project, showReportPreview],
  )

  React.useEffect(() => {
    if (project && project.id === projectId) {
      setCurrentProject(project)
    }
  }, [project, projectId, setCurrentProject])

  // Hydrate scan results from server when component mounts
  // (vulnerabilities/components are stripped from localStorage by partialize)
  React.useEffect(() => {
    if (!projectId) return
    const needsHydration =
      project &&
      project.id === projectId &&
      project.lastScanAt &&
      (!project.vulnerabilities || project.vulnerabilities.length === 0) &&
      (!project.components || project.components.length === 0)
    if (needsHydration) {
      hydrateProjectFromServer(projectId).catch((err) => {
        console.error('[ProjectDetail] Failed to hydrate:', err)
      })
    }
  }, [projectId])

  if (!project) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-7xl">
          <PageHeader title="Project Not Found" />
          <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/50 p-12">
            <Shield className="mb-4 h-16 w-16 text-muted-foreground" />
            <h3 className="text-lg font-medium">Project not found</h3>
            <p className="text-muted-foreground">The project you're looking for doesn't exist</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  const currentProjectRef = project

  const handleConfirmDelete = () => {
    setShowDeleteConfirm(false)
    deleteProject(currentProjectRef.id)
    navigate('/dashboard')
  }

  const handleComponentClick = (component: Component) => {
    setSelectedComponent(component)
    setShowComponentVulnPopup(true)
  }

  const handleViewVulnerability = (vuln: Vulnerability) => {
    setSelectedVulnerability(vuln)
    setShowVulnDetail(true)
  }

  const handleRemoveSbom = (sbomFileId: string) => {
    const sbomFile = currentProjectRef.sbomFiles.find((f) => f.id === sbomFileId)
    if (!sbomFile) return

    // Find components that belong to this SBOM file
    const componentsToRemove = currentProjectRef.components.filter((c) => c.sbomFileId === sbomFileId)
    const componentIdsToRemove = new Set(componentsToRemove.map((c) => c.id))

    // Remove the SBOM file from the project
    const updatedSbomFiles = currentProjectRef.sbomFiles.filter((f) => f.id !== sbomFileId)

    // Remove components that came from this SBOM file
    // Keep components that either have no sbomFileId (legacy data) or belong to other SBOMs
    const updatedComponents = currentProjectRef.components.filter((c) => c.sbomFileId !== sbomFileId)

    // Update vulnerabilities: remove affectedComponents references for removed components
    // If a vulnerability no longer affects any components, remove it entirely
    const updatedVulnerabilities = currentProjectRef.vulnerabilities
      .map((vuln) => ({
        ...vuln,
        affectedComponents: vuln.affectedComponents.filter((compId) => !componentIdsToRemove.has(compId)),
      }))
      .filter((vuln) => vuln.affectedComponents.length > 0)

    // Calculate new statistics from remaining vulnerabilities
    const stats = {
      totalVulnerabilities: updatedVulnerabilities.length,
      criticalCount: updatedVulnerabilities.filter((v) => v.severity === 'critical').length,
      highCount: updatedVulnerabilities.filter((v) => v.severity === 'high').length,
      mediumCount: updatedVulnerabilities.filter((v) => v.severity === 'medium').length,
      lowCount: updatedVulnerabilities.filter((v) => v.severity === 'low').length,
    }

    // Calculate vulnerable components from remaining vulnerabilities
    const vulnerableComponentIds = new Set(updatedVulnerabilities.flatMap((v) => v.affectedComponents))

    updateProject(currentProjectRef.id, {
      sbomFiles: updatedSbomFiles,
      components: updatedComponents,
      vulnerabilities: updatedVulnerabilities,
      updatedAt: new Date(),
      statistics: {
        ...currentProjectRef.statistics,
        ...stats,
        totalComponents: updatedComponents.length,
        vulnerableComponents: vulnerableComponentIds.size,
      },
    })

    // M10: record the SBOM removal in the compliance audit trail.
    logSbomRemove(currentProjectRef.id, currentProjectRef.name, sbomFile.filename)

    toast.success(
      'SBOM Removed',
      `Removed ${sbomFile.filename} and ${componentsToRemove.length} associated component(s) from project`,
    )
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-7xl">
        <PageHeader
          title={project.name}
          description={project.description || undefined}
          actions={
            <>
              <StalenessIndicator
                lastRefresh={project.lastVulnDataRefresh}
                settings={settings}
                onRefresh={scan.handleRefreshVulnData}
                isRefreshing={isRefreshing}
                compact
              />
              <button
                onClick={() => scan.handleRefreshVulnData(true)}
                disabled={isRefreshing}
                className="rounded-md border border-border bg-secondary p-2 text-sm hover:bg-secondary/80 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Force refresh vulnerability data (bypass cache)"
                title="Force refresh — bypass cache and query fresh data"
              >
                <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              {scan.isScanning ? (
                <div className="flex flex-col gap-1">
                  <button
                    disabled
                    className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-75"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scanning {scan.scanProgress}%
                  </button>
                  {scan.scanPhase && (
                    <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{scan.scanPhase}</p>
                      {scan.scanLog.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {scan.scanLog.slice(-3).map((line, idx) => (
                            <p key={idx} className="text-xs text-muted-foreground/70 truncate">
                              {line}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={scan.handleScan}
                  disabled={project.components.length === 0}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Search className="h-4 w-4" />
                  Scan for Vulnerabilities
                </button>
              )}
              <button
                onClick={() => setShowExportDialog(true)}
                className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <button
                onClick={() => setShowReportPreview(true)}
                className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                <FileText className="h-4 w-4" />
                Generate Report
              </button>
              <button
                onClick={() => setShowComplianceDialog(true)}
                className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                <ShieldCheck className="h-4 w-4" />
                Compliance
              </button>
              <button
                onClick={() => navigate(`/project/${projectId}/fpf`)}
                className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                <Shield className="h-4 w-4" />
                False Positive Filter
              </button>
              <button
                onClick={() => setShowEditDialog(true)}
                className="rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
              >
                Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            </>
          }
        />

        {/* Tab Navigation */}
        <div className="border-b border-border">
          <nav className="flex gap-4 overflow-x-auto" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.value
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <OverviewTab
            project={project}
            onUpdateProject={updateProject}
            onOpenContainerScan={() => setShowContainerScanDialog(true)}
            onOpenBinarySbom={() => setShowBinarySbomDialog(true)}
            onOpenUpload={() => setShowUploadDialog(true)}
            onRemoveSbom={handleRemoveSbom}
          />
        )}
        {activeTab === 'components' && <ComponentsTab project={project} onComponentClick={handleComponentClick} />}
        {activeTab === 'vulnerabilities' && (
          <VulnerabilitiesTab project={project} projectId={projectId} onViewVulnerability={handleViewVulnerability} />
        )}
        {activeTab === 'health' && (
          <HealthTab
            project={project}
            onComponentClick={handleComponentClick}
            onViewVulnerability={handleViewVulnerability}
          />
        )}
      </div>

      {/* Edit Project Dialog */}
      {showEditDialog && (
        <EditProjectDialog
          project={project}
          onClose={() => setShowEditDialog(false)}
          onSave={(updates) => {
            // Stamp updatedAt here (per-caller convention — see SbomUploadDialog/handleRemoveSbom)
            // so an edit reorders the project in updatedAt-sorted views (FR-01.1).
            updateProject(project.id, { ...updates, updatedAt: new Date() })
            setShowEditDialog(false)
          }}
        />
      )}

      {/* SBOM Upload Dialog */}
      <SbomUploadDialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} projectId={projectId} />

      {/* Container Scan Dialog */}
      <ContainerScanDialog
        open={showContainerScanDialog}
        onClose={() => setShowContainerScanDialog(false)}
        projectId={projectId}
      />

      {/* Binary SBOM Dialog */}
      <BinarySbomDialog
        open={showBinarySbomDialog}
        onClose={() => setShowBinarySbomDialog(false)}
        projectId={projectId}
      />

      {/* Vulnerability Detail Modal */}
      {selectedVulnerability && (
        <VulnerabilityDetailModal
          vulnerability={selectedVulnerability}
          open={showVulnDetail}
          onClose={() => {
            setShowVulnDetail(false)
            setSelectedVulnerability(null)
          }}
        />
      )}

      {/* Export Dialog */}
      <ExportDialog open={showExportDialog} onClose={() => setShowExportDialog(false)} project={project} />

      {/* Compliance Report Dialog */}
      <ComplianceReportDialog
        open={showComplianceDialog}
        onClose={() => setShowComplianceDialog(false)}
        project={project}
      />

      {/* Report Preview (FR-09.2 vulnerability report generation) */}
      <ReportPreview
        open={showReportPreview}
        onOpenChange={setShowReportPreview}
        data={reportData}
        projectName={project.name}
      />

      {/* Delete Project Confirmation */}
      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete project"
        message={`Are you sure you want to delete "${project.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Component Vulnerabilities Popup */}
      {selectedComponent && (
        <ComponentVulnerabilitiesPopup
          component={selectedComponent}
          vulnerabilities={getVulnerabilitiesForComponent(project, selectedComponent.id)}
          open={showComponentVulnPopup}
          onClose={() => {
            setShowComponentVulnPopup(false)
            setSelectedComponent(null)
          }}
          onViewVulnerability={(vuln) => {
            setShowComponentVulnPopup(false)
            setSelectedVulnerability(vuln)
            setShowVulnDetail(true)
          }}
        />
      )}
    </div>
  )
}
