import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
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
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { useStore } from '@/store/useStore'
import { toast } from '@/components/Toaster'
import { SbomUploadDialog } from '@/components/SbomUploadDialog'
import { ContainerScanDialog } from '@/components/ContainerScanDialog'
import { ExportDialog } from '@/components/ExportDialog'
import { VulnerabilityDetailModal } from '@/components/VulnerabilityDetailModal'
import { ComponentVulnerabilitiesPopup } from '@/components/ComponentVulnerabilitiesPopup'
import { StalenessIndicator } from '@/components/StalenessIndicator'
import { FilterPresets, CvssRangeSlider, MultiSelectFilter } from '@/components/FilterPresets'
import { HealthDashboard } from '@/components/HealthDashboard'
import { RemediationQueue } from '@/components/RemediationQueue'
import { VirtualList } from '@/components/VirtualList'
import { KevBadge } from '@/components/vulnerabilities/KevBadge'
import { RiskScoreBadge } from '@/components/vulnerabilities/RiskScoreCell'
import { matchVulnerabilitiesForComponents, getVulnerabilityStatistics, sortBySeverity } from '@/lib/api/vulnMatcher'
import type { ScanProgressEvent } from '@/lib/api/vulnMatcher'
import { refreshVulnerabilityData } from '@/lib/refresh'
import { calculateComponentHealth, calculateProjectHealth, calculateTrend } from '@/lib/health'
import { formatVulnerabilityId } from '@/lib/utils/vulnIdFormat'
import { getSecureKeyService } from '@/lib/storage'
import { enrichVulnerabilities } from '@/lib/services/intelligence/enrichVulnerabilities'
import type { Vulnerability, FilterPreset, ComponentHealth, ProjectHealthSummary, Component } from '@@/types'
import { AppHeader } from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select'

type TabValue = 'overview' | 'components' | 'vulnerabilities' | 'health'

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
  const [showExportDialog, setShowExportDialog] = React.useState(false)
  const [selectedVulnerability, setSelectedVulnerability] = React.useState<Vulnerability | null>(null)
  const [showVulnDetail, setShowVulnDetail] = React.useState(false)
  const [isScanning, setIsScanning] = React.useState(false)
  const [isRefreshingVuln, setIsRefreshingVuln] = React.useState(false)
  const [scanProgress, setScanProgress] = React.useState(0)
  const [scanLog, setScanLog] = React.useState<string[]>([])
  const [scanPhase, setScanPhase] = React.useState<string>('')
  const [severityFilter, setSeverityFilter] = React.useState<'all' | Vulnerability['severity']>('all')
  const [activeTab, setActiveTab] = React.useState<TabValue>('overview')
  const [copiedVulnId, setCopiedVulnId] = React.useState<string | null>(null)
  const isRefreshing = (projectId != null && refreshingProjectIds.has(projectId)) || isRefreshingVuln

  const [selectedComponent, setSelectedComponent] = React.useState<Component | null>(null)
  const [showComponentVulnPopup, setShowComponentVulnPopup] = React.useState(false)

  const [cvssRange, setCvssRange] = React.useState<[number, number]>([0, 10])
  const [sourceFilter, setSourceFilter] = React.useState<string[]>([])
  const [referenceTagFilter, setReferenceTagFilter] = React.useState<string[]>([])
  const [expandedVulns, setExpandedVulns] = React.useState<Set<string>>(new Set())
  const [filterPresets, setFilterPresets] = React.useState<FilterPreset[]>(() => {
    try {
      const saved = localStorage.getItem(`vuln-filter-presets-${projectId}`)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false)

  React.useEffect(() => {
    try {
      localStorage.setItem(`vuln-filter-presets-${projectId}`, JSON.stringify(filterPresets))
    } catch {
      // Ignore localStorage errors
    }
  }, [filterPresets, projectId])

  const applyAdvancedFilters = (vulns: Vulnerability[]): Vulnerability[] => {
    return vulns.filter((vuln) => {
      if (vuln.cvssScore) {
        const [min, max] = cvssRange
        if (vuln.cvssScore < min || vuln.cvssScore > max) {
          return false
        }
      }

      if (sourceFilter.length > 0 && !sourceFilter.includes(vuln.source)) {
        return false
      }

      if (referenceTagFilter.length > 0) {
        const vulnTags = new Set((vuln.references ?? []).flatMap((ref) => (ref.tags ?? []).map((t) => t.toLowerCase())))
        if (!referenceTagFilter.some((tag) => vulnTags.has(tag.toLowerCase()))) {
          return false
        }
      }

      return true
    })
  }

  const handleSavePreset = (name: string, filters: FilterPreset['filters']) => {
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name,
      filters,
    }
    setFilterPresets([...filterPresets, newPreset])
    toast.success('Preset Saved', `Filter preset "${name}" has been saved.`)
  }

  const handleLoadPreset = (presetId: string) => {
    const preset = filterPresets.find((p) => p.id === presetId)
    if (!preset) return

    const { filters } = preset

    if (filters.severity) {
      setSeverityFilter(filters.severity.length === 1 ? filters.severity[0] : 'all')
    }

    if (filters.cvssRange) {
      setCvssRange(filters.cvssRange)
    }

    if (filters.source) {
      setSourceFilter(filters.source)
    }

    toast.success('Preset Loaded', `Filter preset "${preset.name}" has been applied.`)
  }

  const handleDeletePreset = (presetId: string) => {
    setFilterPresets(filterPresets.filter((p) => p.id !== presetId))
    toast.success('Preset Deleted', 'Filter preset has been deleted.')
  }

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

    return filters
  }

  const [componentSearch, setComponentSearch] = React.useState('')
  const [componentTypeFilter, setComponentTypeFilter] = React.useState<'all' | Component['type']>('all')
  const [componentVulnFilter, setComponentVulnFilter] = React.useState<'all' | 'vulnerable' | 'safe'>('all')
  const [componentLicenseFilter, setComponentLicenseFilter] = React.useState<string>('all')
  const [componentSort, setComponentSort] = React.useState<'name' | 'version' | 'type'>('name')

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

  const handleComponentClick = (component: Component) => {
    setSelectedComponent(component)
    setShowComponentVulnPopup(true)
  }

  const getVulnerabilitiesForComponent = (componentId: string): Vulnerability[] => {
    return project?.vulnerabilities.filter((v) => v.affectedComponents.includes(componentId)) || []
  }

  const [editingProject, setEditingProject] = React.useState<{
    name: string
    description: string
  }>({ name: '', description: '' })

  const project = React.useMemo(() => {
    return currentProject?.id === projectId
      ? currentProject
      : projects.find((p) => p.id === projectId) || currentProject
  }, [currentProject, projects, projectId])

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
      <div className="flex min-h-screen flex-col">
        <AppHeader
          title="Project Not Found"
          breadcrumbs={[{ label: 'Projects', path: '/dashboard' }, { label: 'Not Found' }]}
        />
        <main className="flex flex-1 items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <CardContent className="pt-6">
              <Shield className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
              <h3 className="text-lg font-medium">Project not found</h3>
              <p className="mt-1 text-muted-foreground">The project you&apos;re looking for doesn&apos;t exist</p>
              <Button className="mt-4" onClick={() => navigate('/dashboard')}>
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  const handleDeleteProject = () => {
    if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
      deleteProject(project.id)
      navigate('/dashboard')
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
    setScanLog([])
    setScanPhase('Initializing...')

    const appendLog = (msg: string) => {
      setScanLog((prev) => [...prev.slice(-4), msg])
    }

    const handleMatchProgress = (event: ScanProgressEvent) => {
      const pct = event.total > 0 ? Math.round((event.current / event.total) * 70) : 70
      setScanProgress(pct)
      setScanPhase(event.message)
      appendLog(event.message)
    }

    try {
      const results = await matchVulnerabilitiesForComponents(
        project.components,
        nvdApiKey ?? undefined,
        handleMatchProgress,
      )

      setScanProgress(75)
      setScanPhase('Deduplicating results...')
      appendLog('Deduplicating vulnerability results...')

      const allVulnerabilities: Vulnerability[] = []
      const seenIds = new Set<string>()

      for (const [componentId, vulns] of results.entries()) {
        for (const vuln of vulns) {
          if (!seenIds.has(vuln.id)) {
            allVulnerabilities.push({
              ...vuln,
              affectedComponents: [componentId],
            })
            seenIds.add(vuln.id)
          } else {
            const existingVuln = allVulnerabilities.find((v) => v.id === vuln.id)
            if (existingVuln && !existingVuln.affectedComponents.includes(componentId)) {
              existingVuln.affectedComponents.push(componentId)
            }
          }
        }
      }

      setScanProgress(80)
      setScanPhase('Merging with SBOM data...')
      appendLog(`Found ${allVulnerabilities.length} vulnerabilities from NVD/OSV`)

      const existingVulnerabilities = project.vulnerabilities || []
      const mergedVulnerabilities: Vulnerability[] = []

      for (const existingVuln of existingVulnerabilities) {
        const foundInScan = allVulnerabilities.find((v) => v.id === existingVuln.id)
        if (foundInScan) {
          mergedVulnerabilities.push(foundInScan)
        } else {
          mergedVulnerabilities.push(existingVuln)
        }
      }

      for (const scanVuln of allVulnerabilities) {
        if (!existingVulnerabilities.some((v) => v.id === scanVuln.id)) {
          mergedVulnerabilities.push(scanVuln)
        }
      }

      setScanProgress(85)
      setScanPhase('Enriching with KEV/EPSS intelligence...')
      appendLog(`Enriching ${mergedVulnerabilities.length} vulnerabilities with threat intelligence...`)

      const enrichedVulnerabilities = await enrichVulnerabilities(mergedVulnerabilities, {
        onProgress: (msg) => {
          appendLog(msg)
          setScanPhase(msg)
        },
      })

      setScanProgress(95)
      setScanPhase('Calculating statistics...')
      appendLog('Finalizing scan results...')

      const stats = getVulnerabilityStatistics(enrichedVulnerabilities)
      const vulnerableComponents = new Set(enrichedVulnerabilities.flatMap((v) => v.affectedComponents)).size

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
          vulnerableComponents,
        },
      })

      setScanProgress(100)
      setScanPhase('Scan complete!')
      appendLog(`Done: ${stats.total} vulnerabilities (${stats.critical} critical, ${stats.high} high)`)

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
      setScanPhase('')
    }
  }

  const handleRefreshVulnData = async () => {
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

    const componentsToRemove = project.components.filter((c) => c.sbomFileId === sbomFileId)
    const componentIdsToRemove = new Set(componentsToRemove.map((c) => c.id))

    const updatedSbomFiles = project.sbomFiles.filter((f) => f.id !== sbomFileId)
    const updatedComponents = project.components.filter((c) => c.sbomFileId !== sbomFileId)

    const updatedVulnerabilities = project.vulnerabilities
      .map((vuln) => ({
        ...vuln,
        affectedComponents: vuln.affectedComponents.filter((compId) => !componentIdsToRemove.has(compId)),
      }))
      .filter((vuln) => vuln.affectedComponents.length > 0)

    const stats = {
      totalVulnerabilities: updatedVulnerabilities.length,
      criticalCount: updatedVulnerabilities.filter((v) => v.severity === 'critical').length,
      highCount: updatedVulnerabilities.filter((v) => v.severity === 'high').length,
      mediumCount: updatedVulnerabilities.filter((v) => v.severity === 'medium').length,
      lowCount: updatedVulnerabilities.filter((v) => v.severity === 'low').length,
    }

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

  const getSbomFilename = (sbomFileId: string | undefined): string | null => {
    if (!sbomFileId) return null
    const sbomFile = project.sbomFiles.find((f) => f.id === sbomFileId)
    return sbomFile ? sbomFile.filename : null
  }

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

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        title={project.name}
        breadcrumbs={[{ label: 'Projects', path: '/dashboard' }, { label: project.name }]}
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setShowUploadDialog(true)}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Upload
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowContainerScanDialog(true)}>
              <Container className="mr-1.5 h-3.5 w-3.5" />
              Container
            </Button>
            {isScanning ? (
              <Button size="sm" disabled>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {scanProgress}%
              </Button>
            ) : (
              <Button size="sm" onClick={handleScan} disabled={project.components.length === 0}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                Scan
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowExportDialog(true)}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/project/${projectId}/fpf`)}>
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              FPF
            </Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button variant="ghost" size="sm" onClick={handleEditProject}>
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteProject}
              className="text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          </div>
        }
      />

      <div className="border-b border-border px-6 py-2">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          {project.description && <p className="text-sm text-muted-foreground truncate">{project.description}</p>}
          <div className="ml-auto flex items-center">
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

      {isScanning && (
        <div className="border-b border-border bg-blue-50/50 px-6 py-3">
          <div className="mx-auto max-w-7xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-blue-900">{scanPhase}</span>
              <Badge variant="secondary">{scanProgress}%</Badge>
            </div>
            <Progress value={scanProgress} className="h-1.5" />
            {scanLog.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {scanLog.slice(-3).map((line, idx) => (
                  <p key={idx} className="text-xs text-muted-foreground/70 truncate">
                    {line}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-7xl">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="components">
                Components
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                  {new Set(project.components.map((c) => c.id)).size}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="vulnerabilities">
                Vulnerabilities
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5">
                  {project.vulnerabilities.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="health">Health</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6 space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Components
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{project.statistics.totalComponents}</div>
                  </CardContent>
                </Card>
                <Card className="border-red-200">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-4 w-4" />
                      Critical
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-destructive">{project.statistics.criticalCount}</div>
                  </CardContent>
                </Card>
                <Card className="border-orange-200">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-2 text-orange-700">
                      <AlertTriangle className="h-4 w-4" />
                      High
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-700">{project.statistics.highCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Total Vulnerabilities
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{project.statistics.totalVulnerabilities}</div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle>SBOM Files</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowContainerScanDialog(true)}>
                      <Container className="mr-1.5 h-3.5 w-3.5" />
                      Scan Container
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setShowUploadDialog(true)}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Upload SBOM
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
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
                          className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                        >
                          <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <div className="font-medium">{file.filename}</div>
                              <div className="text-sm text-muted-foreground">
                                {file.format} &bull; {file.componentCount} components
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveSbom(file.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Project Information</CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="components" className="mt-6">
              <Card>
                <CardHeader className="space-y-4 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle>Components ({new Set(project.components.map((c) => c.id)).size})</CardTitle>
                  </div>
                  {project.components.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="text"
                        placeholder="Search components..."
                        aria-label="Search components"
                        value={componentSearch}
                        onChange={(e) => setComponentSearch(e.target.value)}
                        className="w-56"
                      />
                      <Select
                        value={componentTypeFilter}
                        onValueChange={(v) => setComponentTypeFilter(v as 'all' | Component['type'])}
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="library">Libraries</SelectItem>
                          <SelectItem value="framework">Frameworks</SelectItem>
                          <SelectItem value="application">Applications</SelectItem>
                          <SelectItem value="container">Containers</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={componentVulnFilter}
                        onValueChange={(v) => setComponentVulnFilter(v as 'all' | 'vulnerable' | 'safe')}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="vulnerable">Has Vulnerabilities</SelectItem>
                          <SelectItem value="safe">No Vulnerabilities</SelectItem>
                        </SelectContent>
                      </Select>
                      {uniqueLicenses.length > 0 && (
                        <Select value={componentLicenseFilter} onValueChange={setComponentLicenseFilter}>
                          <SelectTrigger className="w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Licenses</SelectItem>
                            {uniqueLicenses.map((license) => (
                              <SelectItem key={license} value={license}>
                                {license}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Select
                        value={componentSort}
                        onValueChange={(v) => setComponentSort(v as 'name' | 'version' | 'type')}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Sort: Name</SelectItem>
                          <SelectItem value="version">Sort: Version</SelectItem>
                          <SelectItem value="type">Sort: Type</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {project.components.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <Shield className="mb-3 h-12 w-12 text-muted-foreground" />
                      <p className="text-muted-foreground">No components found</p>
                      <p className="text-sm text-muted-foreground">Upload an SBOM file to view components</p>
                    </div>
                  ) : (
                    (() => {
                      const uniqueComponents = project.components.reduce(
                        (acc, component) => {
                          if (!acc.find((c) => c.id === component.id)) {
                            acc.push(component)
                          }
                          return acc
                        },
                        [] as typeof project.components,
                      )

                      let filtered = uniqueComponents.filter((component) => {
                        const matchesSearch =
                          !componentSearch ||
                          component.name.toLowerCase().includes(componentSearch.toLowerCase()) ||
                          component.version.toLowerCase().includes(componentSearch.toLowerCase())

                        const matchesType = componentTypeFilter === 'all' || component.type === componentTypeFilter

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
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => {
                                  setComponentSearch('')
                                  setComponentTypeFilter('all')
                                  setComponentVulnFilter('all')
                                  setComponentLicenseFilter('all')
                                }}
                              >
                                Clear filters
                              </Button>
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
                                    className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background p-3 transition-colors hover:bg-muted/50"
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
                                            <Badge variant="secondary" className="text-[10px]">
                                              Source: {sbomFilename}
                                            </Badge>
                                          )}
                                          {component.cpe && !component.hasMissingCpe ? (
                                            <Badge className="bg-green-500/10 text-green-700 border-green-500/20 text-[10px]">
                                              CPE Verified
                                            </Badge>
                                          ) : component.suggestedCpes && component.suggestedCpes.length > 0 ? (
                                            <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20 text-[10px]">
                                              CPE Estimated
                                            </Badge>
                                          ) : component.hasMissingCpe ? (
                                            <Badge className="bg-red-500/10 text-red-700 border-red-500/20 text-[10px]">
                                              No CPE
                                            </Badge>
                                          ) : null}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                          <span>{component.version}</span>
                                          <span>&bull;</span>
                                          <span className="capitalize">{component.type}</span>
                                          {component.purl && (
                                            <>
                                              <span>&bull;</span>
                                              <span className="font-mono text-xs">{component.purl}</span>
                                            </>
                                          )}
                                          {componentVulns.length > 0 && (
                                            <span className="font-medium text-destructive">
                                              &bull; {componentVulns.length} vulnerability
                                              {componentVulns.length > 1 ? 's' : ''}
                                            </span>
                                          )}
                                          {component.licenses.length > 0 && (
                                            <>
                                              <span>&bull;</span>
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
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="vulnerabilities" className="mt-6 space-y-4">
              <Card>
                <CardHeader className="space-y-4 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle>Vulnerabilities ({project.vulnerabilities.length})</CardTitle>
                    {project.vulnerabilities.length > 0 && (
                      <div className="flex items-center gap-2">
                        <FilterPresets
                          presets={filterPresets}
                          currentFilters={getCurrentFilters()}
                          onSavePreset={handleSavePreset}
                          onLoadPreset={handleLoadPreset}
                          onDeletePreset={handleDeletePreset}
                        />
                        <Button
                          variant={showAdvancedFilters ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        >
                          <Filter className="mr-1.5 h-3.5 w-3.5" />
                          Advanced
                          {showAdvancedFilters && <CheckCircle2 className="ml-1.5 h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    )}
                  </div>

                  {project.vulnerabilities.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => {
                        const isActive = severityFilter === sev
                        const count =
                          sev === 'all'
                            ? project.vulnerabilities.length
                            : project.vulnerabilities.filter((v) => v.severity === sev).length
                        return (
                          <Badge
                            key={sev}
                            variant={isActive ? 'default' : 'outline'}
                            className={`cursor-pointer select-none ${
                              isActive && sev === 'critical'
                                ? 'bg-red-600 hover:bg-red-700 text-white border-red-600'
                                : isActive && sev === 'high'
                                  ? 'bg-orange-600 hover:bg-orange-700 text-white border-orange-600'
                                  : isActive && sev === 'medium'
                                    ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-600'
                                    : isActive && sev === 'low'
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                                      : ''
                            }`}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSeverityFilter(sev)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                setSeverityFilter(sev)
                              }
                            }}
                          >
                            {sev === 'all' ? 'All' : sev.charAt(0).toUpperCase() + sev.slice(1)} ({count})
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                </CardHeader>

                {showAdvancedFilters && (
                  <div className="border-b border-border bg-muted/30 p-6">
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
                        label="Reference Tags"
                        options={[
                          { value: 'exploit', label: 'Exploit' },
                          { value: 'patch', label: 'Patch Available' },
                          { value: 'vendor advisory', label: 'Vendor Advisory' },
                          { value: 'third party advisory', label: 'Third Party Advisory' },
                          { value: 'mitigation', label: 'Mitigation' },
                          { value: 'release notes', label: 'Release Notes' },
                        ]}
                        selected={referenceTagFilter}
                        onChange={setReferenceTagFilter}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {(sourceFilter.length > 0 ||
                          referenceTagFilter.length > 0 ||
                          cvssRange[0] !== 0 ||
                          cvssRange[1] !== 10) && <span>Advanced filters active</span>}
                      </span>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => {
                          setCvssRange([0, 10])
                          setSourceFilter([])
                          setReferenceTagFilter([])
                        }}
                      >
                        Clear Advanced Filters
                      </Button>
                    </div>
                  </div>
                )}

                <CardContent>
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
                        let filteredVulns =
                          severityFilter === 'all'
                            ? project.vulnerabilities
                            : project.vulnerabilities.filter((v) => v.severity === severityFilter)
                        filteredVulns = applyAdvancedFilters(filteredVulns)
                        const sortedVulns = sortBySeverity(filteredVulns)

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
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => {
                                setSeverityFilter('all')
                                setCvssRange([0, 10])
                                setSourceFilter([])
                                setReferenceTagFilter([])
                              }}
                            >
                              Clear all filters
                            </Button>
                          </div>
                        ) : (
                          <>
                            {Object.entries(groupedVulns)
                              .filter(([, vulns]) => vulns.length > 0)
                              .map(([severity, vulns]) => {
                                const config = severityConfig[severity as keyof typeof severityConfig]
                                return (
                                  <div
                                    key={severity}
                                    className={`rounded-lg border ${config.borderColor} ${config.bgColor}`}
                                  >
                                    <div
                                      className={`flex items-center justify-between border-b ${config.borderColor} bg-background px-4 py-3`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <AlertTriangle className={`h-5 w-5 ${config.color}`} />
                                        <h3 className={`font-semibold ${config.color}`}>{config.label}</h3>
                                      </div>
                                      <Badge variant="outline" className={config.color}>
                                        {vulns.length} {vulns.length === 1 ? 'vulnerability' : 'vulnerabilities'}
                                      </Badge>
                                    </div>

                                    <VirtualList
                                      items={vulns}
                                      itemKey="id"
                                      renderItem={(vuln) => {
                                        const { primaryId, aliases } = formatVulnerabilityId(vuln)
                                        const sbomFilenames = getSbomFilenamesForVulnerability(vuln)
                                        const isExpanded = expandedVulns.has(vuln.id)
                                        const hasDetails =
                                          (vuln.cwes?.length ?? 0) > 0 || (vuln.references?.length ?? 0) > 0
                                        const refTags = new Set(
                                          (vuln.references ?? []).flatMap((ref) =>
                                            (ref.tags ?? []).map((t) => t.toLowerCase()),
                                          ),
                                        )
                                        const hasExploitRef = refTags.has('exploit')
                                        const hasPatchRef = refTags.has('patch') || refTags.has('vendor advisory')
                                        const hasMitigationRef = refTags.has('mitigation')
                                        return (
                                          <>
                                            <div className="bg-background transition-colors hover:bg-muted/50">
                                              <div className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
                                                <div className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
                                                  <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 shrink-0"
                                                    onClick={() => {
                                                      setExpandedVulns((prev) => {
                                                        const next = new Set(prev)
                                                        if (next.has(vuln.id)) {
                                                          next.delete(vuln.id)
                                                        } else {
                                                          next.add(vuln.id)
                                                        }
                                                        return next
                                                      })
                                                    }}
                                                    aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                                                  >
                                                    {isExpanded ? (
                                                      <ChevronDown className={`h-4 w-4 ${config.color}`} />
                                                    ) : (
                                                      <ChevronRight className={`h-4 w-4 ${config.color}`} />
                                                    )}
                                                  </Button>
                                                  <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-1.5 font-medium md:gap-2">
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
                                                      {vuln.cwes?.map((cwe) => (
                                                        <Badge
                                                          key={cwe}
                                                          className="bg-blue-100 text-blue-800 text-[10px] dark:bg-blue-900/40 dark:text-blue-300"
                                                        >
                                                          {cwe}
                                                        </Badge>
                                                      ))}
                                                      {hasExploitRef && (
                                                        <Badge className="bg-red-100 text-red-800 text-[10px] dark:bg-red-900/40 dark:text-red-300">
                                                          Exploit
                                                        </Badge>
                                                      )}
                                                      {hasPatchRef && (
                                                        <Badge className="bg-green-100 text-green-800 text-[10px] dark:bg-green-900/40 dark:text-green-300">
                                                          Patch
                                                        </Badge>
                                                      )}
                                                      {hasMitigationRef && (
                                                        <Badge className="bg-cyan-100 text-cyan-800 text-[10px] dark:bg-cyan-900/40 dark:text-cyan-300">
                                                          Mitigation
                                                        </Badge>
                                                      )}
                                                      {aliases.length > 0 && (
                                                        <span className="max-w-[120px] truncate text-xs font-normal text-muted-foreground md:max-w-none">
                                                          (aka: {aliases.slice(0, 2).join(', ')}
                                                          {aliases.length > 2 ? ` +${aliases.length - 2}` : ''})
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                                                      <span className="whitespace-nowrap">
                                                        {vuln.sources
                                                          ? vuln.sources.map((s) => s.toUpperCase()).join(' + ')
                                                          : vuln.source.toUpperCase()}
                                                      </span>
                                                      {vuln.cvssScore && (
                                                        <span className="whitespace-nowrap">
                                                          CVSS: {vuln.cvssScore}
                                                        </span>
                                                      )}
                                                      {sbomFilenames.length > 0 && (
                                                        <span className="hidden whitespace-nowrap sm:inline">
                                                          From: {sbomFilenames.slice(0, 1).join(', ')}
                                                          {sbomFilenames.length > 1
                                                            ? ` +${sbomFilenames.length - 1}`
                                                            : ''}
                                                        </span>
                                                      )}
                                                      {vuln.affectedComponents.length > 0 && (
                                                        <span className="hidden whitespace-nowrap sm:inline">
                                                          {vuln.affectedComponents.length} component
                                                          {vuln.affectedComponents.length > 1 ? 's' : ''}
                                                        </span>
                                                      )}
                                                      {(vuln.references?.length ?? 0) > 0 && (
                                                        <span className="whitespace-nowrap">
                                                          {vuln.references?.length} ref
                                                          {(vuln.references?.length ?? 0) > 1 ? 's' : ''}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
                                                <div className="flex shrink-0 items-center gap-2 self-end md:self-center">
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleCopyVulnId(primaryId)}
                                                    aria-label={`Copy ${primaryId} to clipboard`}
                                                  >
                                                    <Copy className="mr-1 h-3.5 w-3.5" />
                                                    <span className="hidden sm:inline">
                                                      {copiedVulnId === primaryId ? 'Copied' : 'Copy'}
                                                    </span>
                                                  </Button>
                                                  <Button
                                                    variant="link"
                                                    size="sm"
                                                    onClick={() => {
                                                      setSelectedVulnerability(vuln)
                                                      setShowVulnDetail(true)
                                                    }}
                                                    className="whitespace-nowrap"
                                                  >
                                                    View Details
                                                  </Button>
                                                </div>
                                              </div>
                                              {isExpanded && hasDetails && (
                                                <div className="ml-7 space-y-2 border-t border-border px-4 pb-3 pt-2 md:ml-11">
                                                  {vuln.cwes && vuln.cwes.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                      <span className="text-xs font-medium text-muted-foreground">
                                                        CWE:
                                                      </span>
                                                      {vuln.cwes.map((cwe) => (
                                                        <a
                                                          key={cwe}
                                                          href={`https://cwe.mitre.org/data/definitions/${cwe.replace('CWE-', '')}.html`}
                                                          target="_blank"
                                                          rel="noopener noreferrer"
                                                          className="inline-flex items-center gap-0.5 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60"
                                                        >
                                                          {cwe}
                                                          <ExternalLink className="h-2.5 w-2.5" />
                                                        </a>
                                                      ))}
                                                    </div>
                                                  )}
                                                  {vuln.references && vuln.references.length > 0 && (
                                                    <div>
                                                      <span className="text-xs font-medium text-muted-foreground">
                                                        References:
                                                      </span>
                                                      <div className="mt-1 space-y-1">
                                                        {vuln.references.slice(0, 5).map((ref, idx) => {
                                                          const tagColors = (ref.tags ?? []).map((t) => {
                                                            const lower = t.toLowerCase()
                                                            if (lower === 'exploit')
                                                              return 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                                                            if (lower === 'patch')
                                                              return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                                                            if (lower === 'vendor advisory')
                                                              return 'text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                                                            if (lower === 'mitigation')
                                                              return 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/20'
                                                            if (lower === 'third party advisory')
                                                              return 'text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
                                                            return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/40'
                                                          })
                                                          return (
                                                            <div key={idx} className="flex items-start gap-1.5 text-xs">
                                                              <a
                                                                href={ref.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="max-w-[400px] truncate text-primary hover:underline"
                                                              >
                                                                {ref.url.length > 80
                                                                  ? ref.url.substring(0, 80) + '...'
                                                                  : ref.url}
                                                              </a>
                                                              {ref.tags && ref.tags.length > 0 && (
                                                                <div className="flex shrink-0 flex-wrap gap-1">
                                                                  {ref.tags.map((tag, tagIdx) => (
                                                                    <span
                                                                      key={tagIdx}
                                                                      className={`rounded px-1 py-0.5 text-[9px] font-medium ${tagColors[tagIdx] ?? tagColors[0] ?? ''}`}
                                                                    >
                                                                      {tag}
                                                                    </span>
                                                                  ))}
                                                                </div>
                                                              )}
                                                            </div>
                                                          )
                                                        })}
                                                        {vuln.references.length > 5 && (
                                                          <span className="text-xs text-muted-foreground">
                                                            +{vuln.references.length - 5} more references
                                                          </span>
                                                        )}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                              )}
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
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="health" className="mt-6 space-y-6">
              {(() => {
                const componentHealths: ComponentHealth[] = project.components.map((component) => {
                  const componentVulns = project.vulnerabilities.filter((v) =>
                    v.affectedComponents.includes(component.id),
                  )
                  return calculateComponentHealth(component, componentVulns)
                })

                const componentHealthsWithTrends = componentHealths.map((health) => ({
                  ...health,
                  trend: calculateTrend(health.score, health.previousScore),
                }))

                const projectHealth: ProjectHealthSummary = calculateProjectHealth(componentHealthsWithTrends)

                return (
                  <>
                    <HealthDashboard
                      projectHealth={projectHealth}
                      componentHealths={componentHealthsWithTrends}
                      components={project.components}
                    />

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
                  </>
                )
              })()}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {showEditDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowEditDialog(false)} aria-hidden="true" />
          <Card className="relative z-50 w-full max-w-md">
            <CardHeader>
              <CardTitle>Edit Project</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveProject} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="edit-name" className="text-sm font-medium">
                    Project Name
                  </label>
                  <Input
                    id="edit-name"
                    value={editingProject.name}
                    onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })}
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
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Save Changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      <SbomUploadDialog open={showUploadDialog} onClose={() => setShowUploadDialog(false)} projectId={projectId} />

      <ContainerScanDialog
        open={showContainerScanDialog}
        onClose={() => setShowContainerScanDialog(false)}
        projectId={projectId}
      />

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

      <ExportDialog open={showExportDialog} onClose={() => setShowExportDialog(false)} project={project} />

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
