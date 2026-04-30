import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Shield,
  Upload,
  FileText,
  AlertTriangle,
  Search,
  Loader2,
  Filter,
  Download,
  Copy,
  CheckCircle2,
  Container,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toast } from '@/components/Toaster'
import SbomUploadDialog from '@/components/SbomUploadDialog'
import ContainerScanDialog from '@/components/ContainerScanDialog'
import ExportDialog from '@/components/ExportDialog'
import VulnerabilityDetailModal from '@/components/VulnerabilityDetailModal'
import ComponentVulnerabilitiesPopup from '@/components/ComponentVulnerabilitiesPopup'
import { StalenessIndicator } from '@/components/StalenessIndicator'
import { FilterPresets, CvssRangeSlider, MultiSelectFilter } from '@/components/FilterPresets'
import HealthDashboard from '@/components/HealthDashboard'
import RemediationQueue from '@/components/RemediationQueue'
import { VirtualList } from '@/components/VirtualList'
import { KevBadge } from '@/components/vulnerabilities/KevBadge'
import { RiskScoreBadge } from '@/components/vulnerabilities/RiskScoreCell'
import { matchVulnerabilitiesForComponents, getVulnerabilityStatistics, sortBySeverity } from '@/lib/api/vulnMatcher'
import { refreshVulnerabilityData } from '@/lib/refresh'
import { calculateComponentHealth, calculateProjectHealth, calculateTrend } from '@/lib/health'
import { formatVulnerabilityId } from '@/lib/utils/vulnIdFormat'
import { getSecureKeyService } from '@/lib/storage'
import { enrichVulnerabilities } from '@/lib/services/intelligence/enrichVulnerabilities'
import type { Vulnerability, FilterPreset, ComponentHealth, ProjectHealthSummary, Component } from '@@/types'

type TabValue = 'overview' | 'components' | 'vulnerabilities' | 'health'

export default function ProjectDetail() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const { projects, currentProject, setCurrentProject, deleteProject, updateProject, settings, refreshingProjectIds } =
    useStore()

  const [showEditDialog, setShowEditDialog] = React.useState(false)
  const [showUploadDialog, setShowUploadDialog] = React.useState(false)
  const [showContainerScanDialog, setShowContainerScanDialog] = React.useState(false)
  const [showExportDialog, setShowExportDialog] = React.useState(false)
  const [selectedVulnerability, setSelectedVulnerability] = React.useState<Vulnerability | null>(null)
  const [showVulnDetail, setShowVulnDetail] = React.useState(false)
  const [isScanning, setIsScanning] = React.useState(false)
  const [isRefreshingVuln, setIsRefreshingVuln] = React.useState(false)
  const [scanProgress, setScanProgress] = React.useState(0)
  const [severityFilter, setSeverityFilter] = React.useState<'all' | Vulnerability['severity']>('all')
  const [activeTab, setActiveTab] = React.useState<TabValue>('overview')
  const [copiedVulnId, setCopiedVulnId] = React.useState<string | null>(null)
  const isRefreshing = refreshingProjectIds.has(projectId) || isRefreshingVuln

  // Component vulnerabilities popup state
  const [selectedComponent, setSelectedComponent] = React.useState<Component | null>(null)
  const [showComponentVulnPopup, setShowComponentVulnPopup] = React.useState(false)

  // Advanced filter states
  const [cvssRange, setCvssRange] = React.useState<[number, number]>([0, 10])
  const [sourceFilter, setSourceFilter] = React.useState<string[]>([])
  const [patchAvailabilityFilter, setPatchAvailabilityFilter] = React.useState<string[]>([])
  // Filter presets with localStorage persistence
  const [filterPresets, setFilterPresets] = React.useState<FilterPreset[]>(() => {
    try {
      const saved = localStorage.getItem(`vuln-filter-presets-${projectId}`)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false)

  // Persist filter presets to localStorage when they change
  React.useEffect(() => {
    try {
      localStorage.setItem(`vuln-filter-presets-${projectId}`, JSON.stringify(filterPresets))
    } catch {
      // Ignore localStorage errors
    }
  }, [filterPresets, projectId])

  // Helper function to apply all filters
  const applyAdvancedFilters = (vulns: Vulnerability[]): Vulnerability[] => {
    return vulns.filter((vuln) => {
      // CVSS score range filter
      if (vuln.cvssScore) {
        const [min, max] = cvssRange
        if (vuln.cvssScore < min || vuln.cvssScore > max) {
          return false
        }
      }

      // Source filter
      if (sourceFilter.length > 0 && !sourceFilter.includes(vuln.source)) {
        return false
      }

      // Patch availability filter
      if (patchAvailabilityFilter.length > 0) {
        // If patchInfo is missing, treat as 'not-specified'
        const patchStatus = vuln.patchInfo?.patchAvailability || 'not-specified'
        if (!patchAvailabilityFilter.includes(patchStatus)) {
          return false
        }
      }

      return true
    })
  }

  // Save filter preset
  const handleSavePreset = (name: string, filters: FilterPreset['filters']) => {
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name,
      filters,
    }
    setFilterPresets([...filterPresets, newPreset])
    toast.success('Preset Saved', `Filter preset "${name}" has been saved.`)
  }

  // Load filter preset
  const handleLoadPreset = (presetId: string) => {
    const preset = filterPresets.find((p) => p.id === presetId)
    if (!preset) return

    const { filters } = preset

    // Apply filters to state
    if (filters.severity) {
      setSeverityFilter(filters.severity.length === 1 ? filters.severity[0] : 'all')
    }

    if (filters.cvssRange) {
      setCvssRange(filters.cvssRange)
    }

    if (filters.source) {
      setSourceFilter(filters.source)
    }

    if (filters.hasPatch !== undefined) {
      if (filters.hasPatch) {
        setPatchAvailabilityFilter(['available', 'partial'])
      } else {
        setPatchAvailabilityFilter(['none'])
      }
    }

    toast.success('Preset Loaded', `Filter preset "${preset.name}" has been applied.`)
  }

  // Delete filter preset
  const handleDeletePreset = (presetId: string) => {
    setFilterPresets(filterPresets.filter((p) => p.id !== presetId))
    toast.success('Preset Deleted', 'Filter preset has been deleted.')
  }

  // Get current filters for saving
  const getCurrentFilters = (): FilterPreset['filters'] => {
    const filters: FilterPreset['filters'] = {}

    if (severityFilter !== 'all') {
      filters.severity = [severityFilter]
    }

    if (cvssRange[0] !== 0 || cvssRange[1] !== 10) {
      filters.cvssRange = cvssRange
    }

    if (sourceFilter.length > 0) {
      filters.source = sourceFilter as Vulnerability['source'][]
    }

    if (patchAvailabilityFilter.length > 0) {
      filters.hasPatch = patchAvailabilityFilter.includes('available') || patchAvailabilityFilter.includes('partial')
    }

    return filters
  }

  // Component filtering state
  const [componentSearch, setComponentSearch] = React.useState('')
  const [componentTypeFilter, setComponentTypeFilter] = React.useState<'all' | Component['type']>('all')
  const [componentVulnFilter, setComponentVulnFilter] = React.useState<'all' | 'vulnerable' | 'safe'>('all')
  const [componentLicenseFilter, setComponentLicenseFilter] = React.useState<string>('all')
  const [componentSort, setComponentSort] = React.useState<'name' | 'version' | 'type'>('name')

  // Handle copy vulnerability ID
  const handleCopyVulnId = async (vulnId: string) => {
    try {
      await navigator.clipboard.writeText(vulnId)
      setCopiedVulnId(vulnId)
      toast.success(`Copied ${vulnId} to clipboard`)
      setTimeout(() => setCopiedVulnId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      toast.error('Failed to copy to clipboard')
    }
  }

  // Handle component click to show vulnerabilities popup
  const handleComponentClick = (component: Component) => {
    setSelectedComponent(component)
    setShowComponentVulnPopup(true)
  }

  // Get vulnerabilities for a specific component
  const getVulnerabilitiesForComponent = (componentId: string): Vulnerability[] => {
    return project?.vulnerabilities.filter((v) => v.affectedComponents.includes(componentId)) || []
  }

  const [editingProject, setEditingProject] = React.useState<{
    name: string
    description: string
  }>({ name: '', description: '' })

  // Find project from store - prioritize currentProject from store for better reactivity
  // When updateProject is called, currentProject is updated directly in the store
  const project = React.useMemo(() => {
    return currentProject?.id === projectId
      ? currentProject
      : projects.find((p) => p.id === projectId) || currentProject
  }, [currentProject, projects, projectId])

  // Extract unique licenses from components for filter dropdown
  const uniqueLicenses = React.useMemo(() => {
    const licenseSet = new Set<string>()
    const components = project?.components || []
    components.forEach((component) => {
      component.licenses.forEach((license) => licenseSet.add(license))
    })
    return Array.from(licenseSet).sort()
  }, [project?.components])

  React.useEffect(() => {
    if (project && project.id === projectId) {
      setCurrentProject(project)
    }
  }, [project, projectId, setCurrentProject])

  if (!project) {
    return (
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-muted-foreground hover:text-foreground"
              aria-label="back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold">Project Not Found</h1>
          </div>
        </header>
        <main className="flex-1 p-6">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/50 p-12">
              <Shield className="mb-4 h-16 w-16 text-muted-foreground" />
              <h3 className="text-lg font-medium">Project not found</h3>
              <p className="text-muted-foreground">The project you're looking for doesn't exist</p>
              <button
                onClick={() => navigate('/')}
                className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </main>
      </div>
    )
  }

  const handleDeleteProject = () => {
    if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
      deleteProject(project.id)
      navigate('/')
    }
  }

  const handleEditProject = () => {
    setEditingProject({
      name: project.name,
      description: project.description || '',
    })
    setShowEditDialog(true)
  }

  const handleSaveProject = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingProject.name.trim()) return

    updateProject(project.id, {
      name: editingProject.name.trim(),
      description: editingProject.description.trim() || undefined,
    })
    setShowEditDialog(false)
  }

  const handleScan = async () => {
    if (project.components.length === 0) {
      toast.warning('Cannot Scan', 'No components to scan. Please upload an SBOM first.')
      return
    }

    // Check if NVD API key is configured
    // API key is now fetched from secure storage, not from settings
    const secureKeyService = getSecureKeyService()
    const nvdApiKey = await secureKeyService.getApiKey('nvd')

    if (!nvdApiKey) {
      toast.info(
        'No NVD API Key',
        'Scanning will use the public NVD API with rate limits. Add an API key in Settings for better performance.',
      )
    }

    setIsScanning(true)
    setScanProgress(0)

    // Simulate progress for better UX
    const progressInterval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + 10
      })
    }, 200)

    try {
      // Match vulnerabilities for all components, passing NVD API key
      const results = await matchVulnerabilitiesForComponents(project.components, nvdApiKey)

      // Flatten results into a single array of vulnerabilities
      const allVulnerabilities: Vulnerability[] = []
      const seenIds = new Set<string>()

      for (const [componentId, vulns] of results.entries()) {
        for (const vuln of vulns) {
          if (!seenIds.has(vuln.id)) {
            // Update affectedComponents
            allVulnerabilities.push({
              ...vuln,
              affectedComponents: [componentId],
            })
            seenIds.add(vuln.id)
          } else {
            // Add component to existing vulnerability
            const existingVuln = allVulnerabilities.find((v) => v.id === vuln.id)
            if (existingVuln && !existingVuln.affectedComponents.includes(componentId)) {
              existingVuln.affectedComponents.push(componentId)
            }
          }
        }
      }

      clearInterval(progressInterval)
      setScanProgress(100)

      // Merge with existing vulnerabilities from SBOM (preserve those not found in NVD/OSV)
      const existingVulnerabilities = project.vulnerabilities || []
      const mergedVulnerabilities: Vulnerability[] = []

      // Add existing vulnerabilities (from SBOM) first
      for (const existingVuln of existingVulnerabilities) {
        const foundInScan = allVulnerabilities.find((v) => v.id === existingVuln.id)
        if (foundInScan) {
          // Use the one from scan (has fresh data from NVD/OSV)
          mergedVulnerabilities.push(foundInScan)
        } else {
          // Keep the SBOM vulnerability even if not found in NVD/OSV
          mergedVulnerabilities.push(existingVuln)
        }
      }

      // Add any new vulnerabilities from scan that weren't in existing
      for (const scanVuln of allVulnerabilities) {
        if (!existingVulnerabilities.some((v) => v.id === scanVuln.id)) {
          mergedVulnerabilities.push(scanVuln)
        }
      }

      // Enrich vulnerabilities with KEV/EPSS intelligence
      const enrichedVulnerabilities = await enrichVulnerabilities(mergedVulnerabilities)

      // Calculate statistics from enriched vulnerabilities
      const stats = getVulnerabilityStatistics(enrichedVulnerabilities)
      const vulnerableComponents = new Set(enrichedVulnerabilities.flatMap((v) => v.affectedComponents)).size

      // Update project with enriched vulnerabilities and statistics
      updateProject(project.id, {
        vulnerabilities: enrichedVulnerabilities,
        lastScanAt: new Date(),
        updatedAt: new Date(),
        statistics: {
          ...project.statistics,
          totalVulnerabilities: stats.total,
          criticalCount: stats.critical,
          highCount: stats.high,
          mediumCount: stats.medium,
          lowCount: stats.low,
          none: stats.none,
          vulnerableComponents,
        },
      })

      const newVulnsFound = allVulnerabilities.length
      const sbomVulnsPreserved =
        existingVulnerabilities.length -
        existingVulnerabilities.filter((v) => allVulnerabilities.some((s) => s.id === v.id)).length

      toast.success(
        'Scan Complete',
        `Found ${newVulnsFound} vulnerabilities from NVD/OSV APIs. ` +
          `Total vulnerabilities: ${stats.total} ` +
          (sbomVulnsPreserved > 0 ? `(${sbomVulnsPreserved} from SBOM preserved)` : ''),
      )
    } catch (error) {
      toast.error('Scan Failed', error instanceof Error ? error.message : 'Unknown error occurred')
    } finally {
      setIsScanning(false)
      setScanProgress(0)
    }
  }

  const handleRefreshVulnData = async () => {
    // API key is now fetched from secure storage, not from settings
    const secureKeyService = getSecureKeyService()
    const apiKey = await secureKeyService.getApiKey('nvd')
    if (!apiKey) {
      toast.warning('No NVD API Key', 'Please add your NVD API key in Settings to refresh vulnerability data from NVD.')
      return
    }

    setIsRefreshingVuln(true)
    try {
      const result = await refreshVulnerabilityData(project.components, {
        cacheTTL: settings.vulnDataCacheTTL,
        onProgress: (current, total) => {
          console.log(`Refresh progress: ${current}/${total}`)
        },
      })

      if (result.success) {
        // Update the project with new vulnerabilities
        updateProject(project.id, {
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

        toast.success('Refresh Complete', `Refreshed vulnerability data for ${result.componentsScanned} components`)
      }
    } catch (error) {
      console.error('Failed to refresh vulnerability data:', error)
      toast.error('Refresh Failed', error instanceof Error ? error.message : 'Unknown error occurred')
    } finally {
      setIsRefreshingVuln(false)
    }
  }

  const handleRemoveSbom = (sbomFileId: string) => {
    const sbomFile = project.sbomFiles.find((f) => f.id === sbomFileId)
    if (!sbomFile) return

    // Find components that belong to this SBOM file
    const componentsToRemove = project.components.filter((c) => c.sbomFileId === sbomFileId)
    const componentIdsToRemove = new Set(componentsToRemove.map((c) => c.id))

    // Remove the SBOM file from the project
    const updatedSbomFiles = project.sbomFiles.filter((f) => f.id !== sbomFileId)

    // Remove components that came from this SBOM file
    // Keep components that either have no sbomFileId (legacy data) or belong to other SBOMs
    const updatedComponents = project.components.filter((c) => c.sbomFileId !== sbomFileId)

    // Update vulnerabilities: remove affectedComponents references for removed components
    // If a vulnerability no longer affects any components, remove it entirely
    const updatedVulnerabilities = project.vulnerabilities
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
      none: updatedVulnerabilities.filter((v) => v.severity === 'none').length,
    }

    // Calculate vulnerable components from remaining vulnerabilities
    const vulnerableComponentIds = new Set(updatedVulnerabilities.flatMap((v) => v.affectedComponents))

    updateProject(project.id, {
      sbomFiles: updatedSbomFiles,
      components: updatedComponents,
      vulnerabilities: updatedVulnerabilities,
      updatedAt: new Date(),
      statistics: {
        ...project.statistics,
        ...stats,
        totalComponents: updatedComponents.length,
        vulnerableComponents: vulnerableComponentIds.size,
      },
    })

    toast.success(
      'SBOM Removed',
      `Removed ${sbomFile.filename} and ${componentsToRemove.length} associated component(s) from project`,
    )
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(date))
  }

  // Helper function to get SBOM filename from sbomFileId
  const getSbomFilename = (sbomFileId: string | undefined): string | null => {
    if (!sbomFileId) return null
    const sbomFile = project.sbomFiles.find((f) => f.id === sbomFileId)
    return sbomFile ? sbomFile.filename : null
  }

  // Helper function to get SBOM filenames for a vulnerability based on affected components
  const getSbomFilenamesForVulnerability = (vuln: Vulnerability): string[] => {
    const sbomIds = new Set<string>()
    for (const componentId of vuln.affectedComponents) {
      const component = project.components.find((c) => c.id === componentId)
      if (component?.sbomFileId) {
        sbomIds.add(component.sbomFileId)
      }
    }
    return Array.from(sbomIds)
      .map((id) => getSbomFilename(id))
      .filter((name): name is string => name !== null)
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="mx-auto max-w-7xl mt-6 space-y-6">
            <h2 className="text-lg font-semibold">Overview</h2>
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <span className="text-sm">Components</span>
                </div>
                <div className="mt-2 text-3xl font-bold">{project.statistics.totalComponents}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">Critical</span>
                </div>
                <div className="mt-2 text-3xl font-bold text-destructive">{project.statistics.criticalCount}</div>
              </div>
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">High</span>
                </div>
                <div className="mt-2 text-3xl font-bold text-orange-700 dark:text-orange-400">
                  {project.statistics.highCount}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">Total Vulns</span>
                </div>
                <div className="mt-2 text-3xl font-bold">{project.statistics.totalVulnerabilities}</div>
              </div>
            </div>

            {/* SBOM Files Section */}
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border p-4">
                <h2 className="font-semibold">SBOM Files</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowContainerScanDialog(true)}
                    className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
                  >
                    <Container className="h-4 w-4" />
                    Scan Container
                  </button>
                  <button
                    onClick={() => setShowUploadDialog(true)}
                    className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80"
                  >
                    <Upload className="h-4 w-4" />
                    Upload SBOM
                  </button>
                </div>
              </div>
              <div className="p-4">
                {project.sbomFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="mb-3 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">No SBOM files uploaded yet</p>
                    <p className="text-sm text-muted-foreground">Upload a CycloneDX or SPDX file to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {project.sbomFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between rounded-md border border-border bg-background p-3"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{file.filename}</div>
                            <div className="text-sm text-muted-foreground">
                              {file.format} • {file.componentCount} components
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveSbom(file.id)}
                          className="text-sm text-muted-foreground hover:text-destructive"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-4 font-semibold">Project Information</h2>
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                <div>
                  <div className="text-muted-foreground">Created</div>
                  <div className="font-medium">{formatDate(project.createdAt)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Last Updated</div>
                  <div className="font-medium">{formatDate(project.updatedAt)}</div>
                </div>
                {project.lastScanAt && (
                  <div>
                    <div className="text-muted-foreground">Last Scan</div>
                    <div className="font-medium">{formatDate(project.lastScanAt)}</div>
                  </div>
                )}
                <div>
                  <div className="text-muted-foreground">Vulnerable Components</div>
                  <div className="font-medium">{project.statistics.vulnerableComponents}</div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'components':
        return (
          <div className="mx-auto max-w-7xl mt-6 space-y-4">
            <h2 className="text-lg font-semibold">Components</h2>
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border p-4">
                <h2 className="font-semibold">Components ({new Set(project.components.map((c) => c.id)).size})</h2>
                {project.components.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="text"
                      placeholder="Search components..."
                      aria-label="Search components"
                      value={componentSearch}
                      onChange={(e) => setComponentSearch(e.target.value)}
                      className="w-48 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <select
                      value={componentTypeFilter}
                      onChange={(e) => setComponentTypeFilter(e.target.value as 'all' | Component['type'])}
                      aria-label="Filter by component type"
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="all">All Types</option>
                      <option value="library">Libraries</option>
                      <option value="framework">Frameworks</option>
                      <option value="application">Applications</option>
                      <option value="container">Containers</option>
                      <option value="other">Other</option>
                    </select>
                    <select
                      value={componentVulnFilter}
                      onChange={(e) => setComponentVulnFilter(e.target.value as 'all' | 'vulnerable' | 'safe')}
                      aria-label="Filter by vulnerability status"
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="all">All</option>
                      <option value="vulnerable">Has Vulnerabilities</option>
                      <option value="safe">No Vulnerabilities</option>
                    </select>
                    {uniqueLicenses.length > 0 && (
                      <select
                        value={componentLicenseFilter}
                        onChange={(e) => setComponentLicenseFilter(e.target.value)}
                        aria-label="Filter by license"
                        className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="all">All Licenses</option>
                        {uniqueLicenses.map((license) => (
                          <option key={license} value={license}>
                            {license}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      value={componentSort}
                      onChange={(e) => setComponentSort(e.target.value as 'name' | 'version' | 'type')}
                      aria-label="Sort components by"
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="name">Sort: Name</option>
                      <option value="version">Sort: Version</option>
                      <option value="type">Sort: Type</option>
                    </select>
                  </div>
                )}
              </div>
              <div className="p-4">
                {project.components.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Shield className="mb-3 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">No components found</p>
                    <p className="text-sm text-muted-foreground">Upload an SBOM file to view components</p>
                  </div>
                ) : (
                  (() => {
                    // Deduplicate components by ID first to ensure each unique component is shown only once
                    // This handles cases where the same component might appear from multiple SBOMs
                    const uniqueComponents = project.components.reduce(
                      (acc, component) => {
                        if (!acc.find((c) => c.id === component.id)) {
                          acc.push(component)
                        }
                        return acc
                      },
                      [] as typeof project.components,
                    )

                    // Filter and sort components
                    let filtered = uniqueComponents.filter((component) => {
                      const matchesSearch =
                        !componentSearch ||
                        component.name.toLowerCase().includes(componentSearch.toLowerCase()) ||
                        component.version.toLowerCase().includes(componentSearch.toLowerCase())

                      const matchesType = componentTypeFilter === 'all' || component.type === componentTypeFilter

                      // Check if component has vulnerabilities by looking at project.vulnerabilities
                      // This is more reliable than component.vulnerabilities which may not be synchronized
                      const componentVulns = project.vulnerabilities.filter((v) =>
                        v.affectedComponents.includes(component.id),
                      )
                      const hasVulnerabilities = componentVulns.length > 0

                      const matchesVuln =
                        componentVulnFilter === 'all' ||
                        (componentVulnFilter === 'vulnerable' && hasVulnerabilities) ||
                        (componentVulnFilter === 'safe' && !hasVulnerabilities)

                      const matchesLicense =
                        componentLicenseFilter === 'all' || component.licenses.includes(componentLicenseFilter)

                      return matchesSearch && matchesType && matchesVuln && matchesLicense
                    })

                    // Sort components
                    filtered = [...filtered].sort((a, b) => {
                      if (componentSort === 'name') {
                        return a.name.localeCompare(b.name)
                      } else if (componentSort === 'version') {
                        return a.version.localeCompare(b.version)
                      } else {
                        return a.type.localeCompare(b.type)
                      }
                    })

                    const displayComponents = filtered

                    return (
                      <>
                        {displayComponents.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-8 text-center">
                            <Shield className="mb-3 h-12 w-12 text-muted-foreground" />
                            <p className="text-muted-foreground">No components match your filters</p>
                            <button
                              onClick={() => {
                                setComponentSearch('')
                                setComponentTypeFilter('all')
                                setComponentVulnFilter('all')
                                setComponentLicenseFilter('all')
                              }}
                              className="mt-2 text-sm text-primary hover:underline"
                            >
                              Clear filters
                            </button>
                          </div>
                        ) : (
                          <VirtualList
                            items={displayComponents}
                            itemKey="id"
                            renderItem={(component) => {
                              const sbomFilename = getSbomFilename(component.sbomFileId)
                              const componentVulns = getVulnerabilitiesForComponent(component.id)
                              return (
                                <div
                                  key={component.id}
                                  onClick={() => handleComponentClick(component)}
                                  className="flex items-center justify-between rounded-md border border-border bg-background p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      handleComponentClick(component)
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    <Shield
                                      className={`h-5 w-5 ${
                                        componentVulns.length > 0 ? 'text-destructive' : 'text-muted-foreground'
                                      }`}
                                    />
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <span className="font-medium">{component.name}</span>
                                        {sbomFilename && (
                                          <span className="inline-flex items-center rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 border border-blue-500/20">
                                            Source: {sbomFilename}
                                          </span>
                                        )}
                                        {/* CPE Status Indicator */}
                                        {component.cpe && !component.hasMissingCpe ? (
                                          <span
                                            className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 border border-green-500/20"
                                            title={`CPE: ${component.cpe}`}
                                          >
                                            CPE Verified
                                          </span>
                                        ) : component.suggestedCpes && component.suggestedCpes.length > 0 ? (
                                          <span
                                            className="inline-flex items-center rounded-md bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600 border border-yellow-500/20"
                                            title={`${component.suggestedCpes.length} suggested CPEs available`}
                                          >
                                            CPE Estimated
                                          </span>
                                        ) : component.hasMissingCpe ? (
                                          <span
                                            className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 border border-red-500/20"
                                            title="No CPE available - vulnerability matching may be less accurate"
                                          >
                                            No CPE
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                        <span>{component.version}</span>
                                        <span>•</span>
                                        <span className="capitalize">{component.type}</span>
                                        {component.purl && (
                                          <>
                                            <span>•</span>
                                            <span className="font-mono text-xs">{component.purl}</span>
                                          </>
                                        )}
                                        {componentVulns.length > 0 && (
                                          <span className="text-destructive font-medium">
                                            • {componentVulns.length} vulnerability
                                            {componentVulns.length > 1 ? 's' : ''}
                                          </span>
                                        )}
                                        {component.licenses.length > 0 && (
                                          <>
                                            <span>•</span>
                                            <span>{component.licenses.join(', ')}</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            }}
                            defaultItemHeight={80}
                            height="600px"
                            className="border-0"
                          />
                        )}
                      </>
                    )
                  })()
                )}
              </div>
            </div>
          </div>
        )

      case 'vulnerabilities':
        return (
          <div className="mx-auto max-w-7xl mt-6 space-y-4">
            <h2 className="text-lg font-semibold">Vulnerabilities</h2>
            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border p-4">
                <h2 className="font-semibold">Vulnerabilities ({project.vulnerabilities.length})</h2>
                {project.vulnerabilities.length > 0 && (
                  <div className="flex items-center gap-2">
                    <FilterPresets
                      presets={filterPresets}
                      currentFilters={getCurrentFilters()}
                      onSavePreset={handleSavePreset}
                      onLoadPreset={handleLoadPreset}
                      onDeletePreset={handleDeletePreset}
                    />
                    <button
                      onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                      className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
                    >
                      <Filter className="h-4 w-4" />
                      Advanced Filters
                      {showAdvancedFilters ? <CheckCircle2 className="h-4 w-4" /> : null}
                    </button>
                    <select
                      value={severityFilter}
                      onChange={(e) => setSeverityFilter(e.target.value as 'all' | Vulnerability['severity'])}
                      className="rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="all">All Severities</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Advanced Filters Panel */}
              {showAdvancedFilters && (
                <div className="border-b border-border bg-muted/30 p-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <CvssRangeSlider value={cvssRange} onChange={setCvssRange} />
                    <MultiSelectFilter
                      label="Source"
                      options={[
                        { value: 'nvd', label: 'NVD' },
                        { value: 'osv', label: 'OSV' },
                        { value: 'both', label: 'Both' },
                      ]}
                      selected={sourceFilter}
                      onChange={setSourceFilter}
                    />
                    <MultiSelectFilter
                      label="Patch Availability"
                      options={[
                        { value: 'available', label: 'Fix Available' },
                        { value: 'partial', label: 'Partial Fix' },
                        { value: 'upstream', label: 'Fix Upstream' },
                        { value: 'investigating', label: 'Investigating' },
                        { value: 'none', label: 'No Fix Available' },
                        { value: 'not-specified', label: 'Not Specified' },
                      ]}
                      selected={patchAvailabilityFilter}
                      onChange={setPatchAvailabilityFilter}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {(sourceFilter.length > 0 ||
                        patchAvailabilityFilter.length > 0 ||
                        cvssRange[0] !== 0 ||
                        cvssRange[1] !== 10) && <span>Advanced filters active</span>}
                    </span>
                    <button
                      onClick={() => {
                        setCvssRange([0, 10])
                        setSourceFilter([])
                        setPatchAvailabilityFilter([])
                      }}
                      className="text-sm text-primary hover:underline"
                    >
                      Clear Advanced Filters
                    </button>
                  </div>
                </div>
              )}
              <div className="p-4">
                {project.vulnerabilities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertTriangle className="mb-3 h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">No vulnerabilities found</p>
                    <p className="text-sm text-muted-foreground">
                      Run a vulnerability scan to check for security issues
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      // Filter by exact severity (not minimum severity)
                      let filteredVulns =
                        severityFilter === 'all'
                          ? project.vulnerabilities
                          : project.vulnerabilities.filter((v) => v.severity === severityFilter)
                      // Apply advanced filters
                      filteredVulns = applyAdvancedFilters(filteredVulns)
                      const sortedVulns = sortBySeverity(filteredVulns)

                      // Group by severity
                      const groupedVulns = {
                        critical: sortedVulns.filter((v) => v.severity === 'critical'),
                        high: sortedVulns.filter((v) => v.severity === 'high'),
                        medium: sortedVulns.filter((v) => v.severity === 'medium'),
                        low: sortedVulns.filter((v) => v.severity === 'low'),
                      }

                      const severityConfig = {
                        critical: {
                          label: 'Critical',
                          color: 'text-destructive',
                          bgColor: 'bg-destructive/10',
                          borderColor: 'border-destructive/30',
                        },
                        high: {
                          label: 'High',
                          color: 'text-orange-700 dark:text-orange-400',
                          bgColor: 'bg-orange-500/10',
                          borderColor: 'border-orange-500/30',
                        },
                        medium: {
                          label: 'Medium',
                          color: 'text-amber-700 dark:text-amber-400',
                          bgColor: 'bg-yellow-600/10',
                          borderColor: 'border-yellow-600/30',
                        },
                        low: {
                          label: 'Low',
                          color: 'text-blue-700 dark:text-blue-400',
                          bgColor: 'bg-blue-500/10',
                          borderColor: 'border-blue-500/30',
                        },
                      }

                      return sortedVulns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Filter className="mb-3 h-12 w-12 text-muted-foreground" />
                          <p className="text-muted-foreground">No vulnerabilities match the current filters</p>
                          <p className="text-sm text-muted-foreground">Try adjusting your filter settings</p>
                          <button
                            onClick={() => {
                              setSeverityFilter('all')
                              setCvssRange([0, 10])
                              setSourceFilter([])
                              setPatchAvailabilityFilter([])
                            }}
                            className="mt-2 text-sm text-primary hover:underline"
                          >
                            Clear all filters
                          </button>
                        </div>
                      ) : (
                        <>
                          {Object.entries(groupedVulns)
                            .filter(([_, vulns]) => vulns.length > 0)
                            .map(([severity, vulns]) => {
                              const config = severityConfig[severity as keyof typeof severityConfig]
                              return (
                                <div
                                  key={severity}
                                  className={`rounded-lg border ${config.borderColor} ${config.bgColor}`}
                                >
                                  {/* Severity Header */}
                                  <div
                                    className={`flex items-center justify-between border-b ${config.borderColor} bg-background px-4 py-3`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <AlertTriangle className={`h-5 w-5 ${config.color}`} />
                                      <h3 className={`font-semibold ${config.color}`}>{config.label}</h3>
                                    </div>
                                    <span className={`text-sm font-medium ${config.color}`}>
                                      {vulns.length} {vulns.length === 1 ? 'vulnerability' : 'vulnerabilities'}
                                    </span>
                                  </div>

                                  {/* Vulnerabilities in this severity group */}
                                  <VirtualList
                                    items={vulns}
                                    itemKey="id"
                                    renderItem={(vuln) => {
                                      const { primaryId, aliases } = formatVulnerabilityId(vuln)
                                      const sbomFilenames = getSbomFilenamesForVulnerability(vuln)
                                      return (
                                        <>
                                          <div className="flex flex-col md:flex-row md:items-center justify-between bg-background p-3 hover:bg-muted/50 transition-colors gap-2">
                                            <div className="flex items-start md:items-center gap-3 min-w-0 flex-1">
                                              <AlertTriangle
                                                className={`h-5 w-5 ${config.color} shrink-0 mt-0.5 md:mt-0`}
                                              />
                                              <div className="min-w-0 flex-1">
                                                <div className="font-medium flex flex-wrap items-center gap-1.5 md:gap-2">
                                                  {primaryId}
                                                  <KevBadge
                                                    isKev={vuln.isKev ?? false}
                                                    knownRansomwareUse={vuln.kevDetails?.knownRansomwareUse}
                                                    compact
                                                  />
                                                  {vuln.riskScore !== undefined && (
                                                    <RiskScoreBadge
                                                      isKev={vuln.isKev ?? false}
                                                      epssPercentile={vuln.epssPercentile ?? null}
                                                      severity={
                                                        vuln.severity.toUpperCase() as
                                                          | 'CRITICAL'
                                                          | 'HIGH'
                                                          | 'MEDIUM'
                                                          | 'LOW'
                                                          | 'NONE'
                                                      }
                                                    />
                                                  )}
                                                  {aliases.length > 0 && (
                                                    <span className="text-xs text-muted-foreground font-normal truncate max-w-[120px] md:max-w-none">
                                                      (aka: {aliases.slice(0, 2).join(', ')}
                                                      {aliases.length > 2 ? ` +${aliases.length - 2}` : ''})
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="text-sm text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                                                  <span className="whitespace-nowrap">
                                                    {vuln.sources
                                                      ? vuln.sources.map((s) => s.toUpperCase()).join(' + ')
                                                      : vuln.source.toUpperCase()}
                                                  </span>
                                                  {vuln.cvssScore && (
                                                    <span className="whitespace-nowrap">CVSS: {vuln.cvssScore}</span>
                                                  )}
                                                  {sbomFilenames.length > 0 && (
                                                    <span className="whitespace-nowrap hidden sm:inline">
                                                      From: {sbomFilenames.slice(0, 1).join(', ')}
                                                      {sbomFilenames.length > 1 ? ` +${sbomFilenames.length - 1}` : ''}
                                                    </span>
                                                  )}
                                                  {vuln.affectedComponents.length > 0 && (
                                                    <span className="whitespace-nowrap hidden sm:inline">
                                                      {vuln.affectedComponents.length} component
                                                      {vuln.affectedComponents.length > 1 ? 's' : ''}
                                                    </span>
                                                  )}
                                                  <span className="whitespace-nowrap">
                                                    Patch:{' '}
                                                    {vuln.patchInfo ? (
                                                      <span
                                                        className={`${
                                                          vuln.patchInfo.patchAvailability === 'available'
                                                            ? 'text-green-600 dark:text-green-400'
                                                            : vuln.patchInfo.patchAvailability === 'partial'
                                                              ? 'text-yellow-600 dark:text-yellow-400'
                                                              : vuln.patchInfo.patchAvailability === 'none'
                                                                ? 'text-red-600 dark:text-red-400'
                                                                : 'text-muted-foreground'
                                                        }`}
                                                      >
                                                        {vuln.patchInfo.patchAvailability === 'available'
                                                          ? 'Fix Available'
                                                          : vuln.patchInfo.patchAvailability === 'partial'
                                                            ? 'Partial Fix'
                                                            : vuln.patchInfo.patchAvailability === 'none'
                                                              ? 'No Fix'
                                                              : vuln.patchInfo.patchAvailability === 'upstream'
                                                                ? 'Upstream Fix'
                                                                : vuln.patchInfo.patchAvailability === 'investigating'
                                                                  ? 'Investigating'
                                                                  : vuln.patchInfo.patchAvailability}
                                                      </span>
                                                    ) : (
                                                      <span className="text-muted-foreground">Not Specified</span>
                                                    )}
                                                  </span>
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                                              <button
                                                onClick={() => handleCopyVulnId(primaryId)}
                                                className="flex items-center gap-1 rounded border border-border bg-secondary px-2 py-1 text-xs font-medium hover:bg-secondary/80 transition-colors"
                                                aria-label={`Copy ${primaryId} to clipboard`}
                                              >
                                                <Copy className="h-3.5 w-3.5" />
                                                <span className="hidden sm:inline">
                                                  {copiedVulnId === primaryId ? 'Copied' : 'Copy'}
                                                </span>
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setSelectedVulnerability(vuln)
                                                  setShowVulnDetail(true)
                                                }}
                                                className="text-sm text-primary hover:underline whitespace-nowrap"
                                              >
                                                View Details
                                              </button>
                                            </div>
                                          </div>
                                        </>
                                      )
                                    }}
                                    defaultItemHeight={100}
                                    height={vulns.length < 7 ? vulns.length * 100 : 400}
                                    className="divide-y divide-border border-0"
                                  />
                                </div>
                              )
                            })}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'health':
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
                onViewComponent={handleComponentClick}
                onViewVulnerability={(vuln) => {
                  setSelectedVulnerability(vuln)
                  setShowVulnDetail(true)
                }}
              />
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="text-muted-foreground hover:text-foreground"
              aria-label="back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold">{project.name}</h1>
                <button onClick={handleEditProject} className="text-sm text-muted-foreground hover:text-foreground">
                  Edit
                </button>
              </div>
              <div className="mt-1 flex items-center gap-3">
                {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
                <StalenessIndicator
                  lastRefresh={project.lastVulnDataRefresh}
                  settings={settings}
                  onRefresh={handleRefreshVulnData}
                  isRefreshing={isRefreshing}
                  compact
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isScanning ? (
              <button
                disabled
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-75"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning {scanProgress}%
              </button>
            ) : (
              <button
                onClick={handleScan}
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
              onClick={() => navigate(`/project/${projectId}/fpf`)}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80"
            >
              <Shield className="h-4 w-4" />
              False Positive Filter
            </button>
            <button
              onClick={handleDeleteProject}
              className="rounded-md border border-border bg-secondary px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
            >
              Delete
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl">
          {/* Tab Navigation */}
          <div className="border-b border-border">
            <nav className="flex gap-4" role="tablist">
              <button
                role="tab"
                aria-selected={activeTab === 'overview'}
                onClick={() => setActiveTab('overview')}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'overview'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Overview
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'components'}
                onClick={() => setActiveTab('components')}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'components'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Components
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'vulnerabilities'}
                onClick={() => setActiveTab('vulnerabilities')}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'vulnerabilities'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Vulnerabilities
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'health'}
                onClick={() => setActiveTab('health')}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'health'
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Health
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </main>

      {/* Edit Project Dialog */}
      {showEditDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowEditDialog(false)} aria-hidden="true" />
          <div className="relative z-50 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg">
            <h2 className="mb-4 text-lg font-semibold">Edit Project</h2>
            <form onSubmit={handleSaveProject} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="edit-name" className="text-sm font-medium">
                  Project Name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={editingProject.name}
                  onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="edit-description" className="text-sm font-medium">
                  Description
                </label>
                <textarea
                  id="edit-description"
                  value={editingProject.description}
                  onChange={(e) => setEditingProject({ ...editingProject, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowEditDialog(false)}
                  className="rounded-md border border-border bg-secondary px-4 py-2 text-sm hover:bg-secondary/80"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SBOM Upload Dialog */}
      <SbomUploadDialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} projectId={projectId} />

      {/* Container Scan Dialog */}
      <ContainerScanDialog
        open={showContainerScanDialog}
        onClose={() => setShowContainerScanDialog(false)}
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

      {/* Component Vulnerabilities Popup */}
      {selectedComponent && (
        <ComponentVulnerabilitiesPopup
          component={selectedComponent}
          vulnerabilities={getVulnerabilitiesForComponent(selectedComponent.id)}
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
