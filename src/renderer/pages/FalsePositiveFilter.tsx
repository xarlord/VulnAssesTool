import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Shield, Filter, Settings, AlertTriangle } from 'lucide-react'
import { useProjects } from '@/store/useStore'
import { PageHeader } from '@/components/PageHeader'
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
import type { Severity } from '@/lib/severity'

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

function resolveSeverity(vuln: Vulnerability): Severity {
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
  const { t } = useTranslation('falsePositiveFilter')
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
          // Encode the CVE id in the element id so handleMissFlag's `mf-<idx>-` strip yields the
          // real vulnerabilityId (isFlagged checks that), instead of the synthetic `mf-<idx>`.
          id: `mf-${idx}-${r.vulnerabilityId}`,
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
    } catch (error) {
      // filterBatch throwing was previously an unhandled rejection: the spinner just stopped
      // with no feedback. Surface it.
      toast.error('Filter Failed', error instanceof Error ? error.message : 'Failed to run the false-positive filter.')
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

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: t('tabs.dashboard'), icon: <Shield className="w-4 h-4" /> },
    { id: 'review', label: t('tabs.review'), icon: <Filter className="w-4 h-4" /> },
    { id: 'config', label: t('tabs.config'), icon: <Settings className="w-4 h-4" /> },
    {
      id: 'missfilter',
      label: t('tabs.missFilter'),
      icon: <AlertTriangle className="w-4 h-4" />,
    },
  ]

  if (!project) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <Shield className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-semibold mb-2">{t('noProject.heading')}</h1>
            <p className="text-muted-foreground mb-4">{t('noProject.description')}</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              {t('noProject.goToDashboard')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              {t('header.title')}
            </span>
          }
          description={t('header.description', { name: project.name })}
        />
      </div>

      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex gap-1" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'dashboard' && (
          <FilterDashboard
            config={config}
            filterResult={filterResult}
            isFiltering={isFiltering}
            onRunFilter={handleRunFilter}
            onConfigure={() => setActiveTab('config')}
            onExportReport={handleExportReport}
          />
        )}

        {activeTab === 'review' && filterResult && (
          <FilteredItemsReview
            items={reviewItems}
            onUndo={handleUndo}
            onLlmAnalysis={handleLlmUnavailable}
            onExport={handleExportItems}
          />
        )}

        {activeTab === 'review' && !filterResult && (
          <div className="text-center py-12">
            <Filter className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">{t('noResults.heading')}</h3>
            <p className="text-muted-foreground mb-4">{t('noResults.description')}</p>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              {t('noResults.goToDashboard')}
            </button>
          </div>
        )}

        {activeTab === 'config' && (
          <ConfigWizard initialConfig={config} onSave={handleConfigSave} onCancel={() => setActiveTab('dashboard')} />
        )}

        {activeTab === 'missfilter' && (
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
        )}
      </div>
    </div>
  )
}
