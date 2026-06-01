import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Shield, Filter, Settings, AlertTriangle } from 'lucide-react'
import { useProjects } from '@/store/useStore'
import { FilterDashboard } from '@/components/FPF/FilterDashboard'
import { FilteredItemsReview } from '@/components/FPF/FilteredItemsReview'
import type { FilteredVulnerability } from '@/components/FPF/FilteredItemsReview'
import { ConfigWizard } from '@/components/FPF/ConfigWizard'
import { MissFilterPanel } from '@/components/FPF/MissFilterPanel'
import type { MissFilterItem } from '@/components/FPF/MissFilterPanel'
import { toast } from '@/components/Toaster'
import type { SystemConfig, FilterBatchResult, FilterResult, MissFilterDetectionConfig } from '@@/types/fpf'
import type { Vulnerability, Component } from '@@/types'
import { FalsePositiveFilter } from '@/lib/services/fpf/falsePositiveFilter'
import { AppHeader } from '@/components/layout/AppHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

type TabType = 'dashboard' | 'review' | 'config' | 'missfilter'

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function exportToCsv(items: FilteredVulnerability[]): void {
  const headers = [
    'CVE ID',
    'Severity',
    'CVSS Score',
    'Component',
    'Version',
    'Filtered By',
    'Confidence',
    'Action',
    'Tier',
  ]
  const rows = items.map((item) =>
    [
      escapeCsvField(item.cveId),
      item.severity,
      item.cvssScore.toFixed(1),
      escapeCsvField(item.componentName),
      escapeCsvField(item.componentVersion),
      escapeCsvField(item.filteredBy),
      String(item.confidence),
      item.action,
      String(item.tier),
    ].join(','),
  )
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `fpf-filter-results-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function resolveSeverity(vuln: Vulnerability): 'critical' | 'high' | 'medium' | 'low' {
  if (vuln.severity === 'none') return 'low'
  return vuln.severity
}

function resultToReviewItem(
  r: FilterResult,
  vuln: Vulnerability | undefined,
  component: Component | undefined,
  undoneIds: Set<string>,
): FilteredVulnerability {
  return {
    vulnerabilityId: r.vulnerabilityId,
    cveId: r.vulnerabilityId,
    severity: vuln ? resolveSeverity(vuln) : 'medium',
    cvssScore: vuln?.cvssScore ?? 0,
    componentName: component?.name ?? r.componentId,
    componentVersion: component?.version ?? 'unknown',
    filteredBy: r.reason || r.filterType,
    confidence: r.confidence,
    action: undoneIds.has(r.vulnerabilityId) ? 'kept' : r.action,
    tier: r.tier,
    filterType: r.filterType,
  }
}

export function FalsePositiveFilterPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const projects = useProjects()

  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [filterResult, setFilterResult] = useState<FilterBatchResult | null>(null)
  const [isFiltering, setIsFiltering] = useState(false)
  const [undoneIds, setUndoneIds] = useState<Set<string>>(new Set())
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set())
  const [missFilterConfig, setMissFilterConfig] = useState<MissFilterDetectionConfig>({
    enabled: true,
    lowConfidenceThreshold: 70,
    recentCveDays: 30,
    flagKnownExploits: true,
  })

  const project = projectId ? projects.find((p) => p.id === projectId) : null

  const vulnMap = useMemo(() => {
    if (!project) return new Map<string, Vulnerability>()
    return new Map(project.vulnerabilities.map((v) => [v.id, v]))
  }, [project])

  const componentMap = useMemo(() => {
    if (!project) return new Map<string, Component>()
    return new Map(project.components.map((c) => [c.id, c]))
  }, [project])

  useEffect(() => {
    if (project && !config) {
      const defaultConfig: SystemConfig = {
        project: {
          name: project.name,
          version: '1.0.0',
          tier: 'development',
        },
        cybersecurity: {
          attackSurface: 'intermediate',
          safetyRelated: false,
        },
        interfaces: {},
        services: {},
        features: {},
        suppressionRules: [],
      }
      setConfig(defaultConfig)
    }
  }, [project, config])

  const reviewItems = useMemo<FilteredVulnerability[]>(() => {
    if (!filterResult) return []
    return filterResult.results.map((r) => {
      const vuln = vulnMap.get(r.vulnerabilityId)
      const comp = componentMap.get(r.componentId)
      return resultToReviewItem(r, vuln, comp, undoneIds)
    })
  }, [filterResult, vulnMap, componentMap, undoneIds])

  const missFilterItems = useMemo<MissFilterItem[]>(() => {
    if (!filterResult || !missFilterConfig.enabled) return []

    const threshold = missFilterConfig.lowConfidenceThreshold
    const recentCutoff = new Date()
    recentCutoff.setDate(recentCutoff.getDate() - missFilterConfig.recentCveDays)

    return filterResult.results
      .filter((r) => {
        if (undoneIds.has(r.vulnerabilityId)) return false
        const vuln = vulnMap.get(r.vulnerabilityId)
        if (!vuln) return false

        const lowConfidence = r.confidence < threshold
        const isRecent = vuln.publishedAt ? new Date(vuln.publishedAt) >= recentCutoff : false
        const hasExploit = vuln.isKev === true
        if (missFilterConfig.flagKnownExploits && hasExploit) return true
        return lowConfidence || isRecent
      })
      .map((r, idx) => {
        const vuln = vulnMap.get(r.vulnerabilityId)
        if (!vuln) return null
        const comp = componentMap.get(r.componentId)
        const reasons: string[] = []
        if (r.confidence < threshold) reasons.push(`Low confidence (${r.confidence}%)`)
        if (vuln.publishedAt && new Date(vuln.publishedAt) >= recentCutoff) {
          reasons.push('Recently published CVE')
        }
        if (vuln.isKev) reasons.push('Known exploit (CISA KEV)')

        return {
          id: `mf-${idx}`,
          vulnerabilityId: r.vulnerabilityId,
          cveId: r.vulnerabilityId,
          severity: resolveSeverity(vuln),
          cvssScore: vuln.cvssScore ?? 0,
          componentName: comp?.name ?? r.componentId,
          componentVersion: comp?.version ?? 'unknown',
          originalAction: r.action,
          detectionReason: reasons.join('; '),
          detectionConfidence: r.confidence,
          isFlagged: flaggedIds.has(r.vulnerabilityId),
          isRecent: !!vuln.publishedAt && new Date(vuln.publishedAt) >= recentCutoff,
          hasKnownExploit: vuln.isKev === true,
          detectedAt: r.timestamp,
        }
      })
      .filter((item): item is MissFilterItem => item !== null)
  }, [filterResult, missFilterConfig, vulnMap, componentMap, undoneIds, flaggedIds])

  const handleRunFilter = async () => {
    if (!project || !config) return

    setIsFiltering(true)
    try {
      const fpf = new FalsePositiveFilter(config)

      const items = project.vulnerabilities.map((vuln) => {
        const componentId = vuln.affectedComponents?.[0]
        const component = componentId ? project.components.find((c) => c.id === componentId) : project.components[0]
        return {
          vulnerability: vuln,
          component: component || {
            id: 'unknown',
            name: 'Unknown',
            version: '0.0.0',
            type: 'other' as const,
            licenses: [],
            vulnerabilities: [],
          },
        }
      })

      const result = await fpf.filterBatch(items, {
        projectId: project.id,
        projectName: project.name,
        configVersion: '1.0.0',
      })

      setFilterResult(result)
      setUndoneIds(new Set())
      setFlaggedIds(new Set())
      if (result.results.length > 0) {
        setActiveTab('review')
      }
    } finally {
      setIsFiltering(false)
    }
  }

  const handleConfigSave = (newConfig: SystemConfig) => {
    setConfig(newConfig)
    setActiveTab('dashboard')
  }

  const handleUndo = useCallback((vulnerabilityId: string) => {
    setUndoneIds((prev) => {
      const next = new Set(prev)
      next.add(vulnerabilityId)
      return next
    })
    toast.success('Filter Undone', `${vulnerabilityId} restored to "kept" status.`)
  }, [])

  const handleExportReport = useCallback(() => {
    if (!reviewItems.length) {
      toast.info('Nothing to Export', 'Run the filter first to generate a report.')
      return
    }
    exportToCsv(reviewItems)
    toast.success('Report Exported', `${reviewItems.length} items exported as CSV.`)
  }, [reviewItems])

  const handleExportItems = useCallback((items: FilteredVulnerability[]) => {
    if (!items.length) return
    exportToCsv(items)
    toast.success('Exported', `${items.length} items exported as CSV.`)
  }, [])

  const handleLlmUnavailable = useCallback(() => {
    toast.info('LLM Analysis Unavailable', 'Tier 3 LLM analysis is planned for a future release.')
  }, [])

  const handleThresholdChange = useCallback((threshold: number) => {
    setMissFilterConfig((prev) => ({
      ...prev,
      lowConfidenceThreshold: threshold,
    }))
  }, [])

  const handleFlagForReview = useCallback((vulnerabilityId: string) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev)
      if (next.has(vulnerabilityId)) {
        next.delete(vulnerabilityId)
      } else {
        next.add(vulnerabilityId)
      }
      return next
    })
  }, [])

  const handleMissFilterConfigChange = useCallback((newConfig: MissFilterDetectionConfig) => {
    setMissFilterConfig(newConfig)
  }, [])

  const handleMissFlag = useCallback(
    (itemId: string) => {
      const vulnId = itemId.replace(/^mf-\d+-/, '')
      handleFlagForReview(vulnId || itemId)
    },
    [handleFlagForReview],
  )

  const breadcrumbs = [
    { label: 'Projects', path: '/dashboard' },
    { label: 'Project', path: projectId ? `/project/${projectId}` : undefined },
    { label: 'False Positive Filter' },
  ]

  if (!project) {
    return (
      <div className="flex flex-col min-h-full">
        <AppHeader title="False Positive Filter" breadcrumbs={[{ label: 'Projects', path: '/dashboard' }]} />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
                <Shield className="h-7 w-7 text-blue-600" />
              </div>
              <CardTitle className="text-xl">No Project Selected</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Select a project from the dashboard to use the False Positive Filter.
              </p>
              <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <AppHeader
        title="False Positive Filter"
        breadcrumbs={breadcrumbs}
        actions={
          <Badge variant="secondary" className="text-xs font-normal">
            {project.name}
          </Badge>
        }
      />

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
            <div className="flex items-center justify-between mb-6">
              <TabsList>
                <TabsTrigger value="dashboard" className="gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  Dashboard
                </TabsTrigger>
                <TabsTrigger value="review" className="gap-1.5">
                  <Filter className="h-3.5 w-3.5" />
                  Review Filtered
                </TabsTrigger>
                <TabsTrigger value="config" className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  Configuration
                </TabsTrigger>
                <TabsTrigger value="missfilter" className="gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Miss-Filter
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="dashboard">
              <FilterDashboard
                config={config}
                filterResult={filterResult}
                isFiltering={isFiltering}
                onRunFilter={handleRunFilter}
                onConfigure={() => setActiveTab('config')}
                onExportReport={handleExportReport}
              />
            </TabsContent>

            <TabsContent value="review">
              {filterResult ? (
                <FilteredItemsReview
                  items={reviewItems}
                  onUndo={handleUndo}
                  onLlmAnalysis={handleLlmUnavailable}
                  onExport={handleExportItems}
                />
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                      <Filter className="h-7 w-7 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">No Filter Results</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                      Run the filter from the Dashboard to see results here.
                    </p>
                    <Button variant="outline" onClick={() => setActiveTab('dashboard')}>
                      Go to Dashboard
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="config">
              <ConfigWizard
                initialConfig={config}
                onSave={handleConfigSave}
                onCancel={() => setActiveTab('dashboard')}
              />
            </TabsContent>

            <TabsContent value="missfilter">
              <MissFilterPanel
                items={missFilterItems}
                config={missFilterConfig}
                onConfigChange={handleMissFilterConfigChange}
                onFlag={handleMissFlag}
                onUnflag={handleMissFlag}
                onLlmAnalysis={handleLlmUnavailable}
                filterResult={filterResult}
                confidenceThreshold={missFilterConfig.lowConfidenceThreshold}
                onThresholdChange={handleThresholdChange}
                onFlagForReview={handleFlagForReview}
                onLLMAnalysis={handleLlmUnavailable}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
