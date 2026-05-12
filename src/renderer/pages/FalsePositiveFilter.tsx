import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Shield, Filter, Settings, AlertTriangle } from 'lucide-react'
import { useProjects } from '@/store/useStore'
import { FilterDashboard } from '@/components/FPF/FilterDashboard'
import { FilteredItemsReview } from '@/components/FPF/FilteredItemsReview'
import { ConfigWizard } from '@/components/FPF/ConfigWizard'
import { MissFilterPanel } from '@/components/FPF/MissFilterPanel'
import type { SystemConfig, FilterBatchResult } from '@@/types/fpf'
import { FalsePositiveFilter } from '@/lib/services/fpf/falsePositiveFilter'

type TabType = 'dashboard' | 'review' | 'config' | 'missfilter'

export function FalsePositiveFilterPage() {
  const navigate = useNavigate()
  const { projectId } = useParams<{ projectId: string }>()
  const projects = useProjects()

  const [activeTab, setActiveTab] = useState<TabType>('dashboard')
  const [config, setConfig] = useState<SystemConfig | null>(null)
  const [filterResult, setFilterResult] = useState<FilterBatchResult | null>(null)
  const [isFiltering, setIsFiltering] = useState(false)

  // Get current project
  const project = projectId ? projects.find((p) => p.id === projectId) : null

  // Initialize config from project or create default
  useEffect(() => {
    if (project && !config) {
      // Create a default config based on project
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

  const handleRunFilter = async () => {
    if (!project || !config) return

    setIsFiltering(true)
    try {
      const fpf = new FalsePositiveFilter(config)

      // Pair vulnerabilities with their first affected component
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

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Shield className="w-4 h-4" /> },
    { id: 'review', label: 'Review Filtered', icon: <Filter className="w-4 h-4" /> },
    { id: 'config', label: 'Configuration', icon: <Settings className="w-4 h-4" /> },
    { id: 'missfilter', label: 'Miss-Filter Detection', icon: <AlertTriangle className="w-4 h-4" /> },
  ]

  if (!project) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>

          <div className="text-center py-12">
            <Shield className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-semibold mb-2">No Project Selected</h1>
            <p className="text-muted-foreground mb-4">
              Select a project from the dashboard to use the False Positive Filter.
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(`/project/${projectId}`)}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Project</span>
              </button>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-semibold">False Positive Filter</h1>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Project: <span className="font-medium text-foreground">{project.name}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
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

      {/* Content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'dashboard' && (
          <FilterDashboard
            config={config}
            filterResult={filterResult}
            isFiltering={isFiltering}
            onRunFilter={handleRunFilter}
            onConfigure={() => setActiveTab('config')}
            onExportReport={() => {
              // TODO: Implement export
              console.log('Export report')
            }}
          />
        )}

        {activeTab === 'review' && filterResult && (
          <FilteredItemsReview
            items={filterResult.results.map((r) => ({
              vulnerabilityId: r.vulnerabilityId,
              cveId: r.vulnerabilityId, // Use vulnerabilityId as cveId
              severity: 'medium' as const, // Default severity
              cvssScore: 0, // Default CVSS score
              componentName: r.componentId,
              componentVersion: 'unknown',
              filteredBy: r.filterType || r.reason,
              confidence: r.confidence,
              action: r.action,
              tier: r.tier,
            }))}
            onUndo={(vulnerabilityId) => {
              console.log('Undo:', vulnerabilityId)
            }}
            onLlmAnalysis={(vulnerabilityId) => {
              console.log('LLM Analysis:', vulnerabilityId)
            }}
            onExport={(items) => {
              console.log('Export:', items)
            }}
          />
        )}

        {activeTab === 'review' && !filterResult && (
          <div className="text-center py-12">
            <Filter className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Filter Results</h3>
            <p className="text-muted-foreground mb-4">Run the filter to see results here.</p>
            <button
              onClick={() => setActiveTab('dashboard')}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {activeTab === 'config' && (
          <ConfigWizard initialConfig={config} onSave={handleConfigSave} onCancel={() => setActiveTab('dashboard')} />
        )}

        {activeTab === 'missfilter' && (
          <MissFilterPanel
            filterResult={filterResult}
            confidenceThreshold={70}
            onThresholdChange={(threshold) => {
              console.log('Threshold changed:', threshold)
            }}
            onFlagForReview={(vulnerabilityId) => {
              console.log('Flag for review:', vulnerabilityId)
            }}
            onLLMAnalysis={(vulnerabilityId) => {
              console.log('LLM Analysis:', vulnerabilityId)
            }}
          />
        )}
      </main>
    </div>
  )
}
