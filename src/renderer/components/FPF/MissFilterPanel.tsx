/**
 * MissFilterPanel - Detection and management of potential miss-filters
 *
 * Provides a list of vulnerabilities that may have been incorrectly filtered,
 * confidence threshold configuration, flagging capability, and batch actions.
 */

import React, { useState, useMemo } from 'react'
import {
  AlertTriangle,
  Flag,
  CheckCircle,
  XCircle,
  Settings,
  Eye,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react'
import type { MissFilterDetectionConfig } from '@@/types/fpf'

// ============================================================================
// Types
// ============================================================================

export interface MissFilterItem {
  /** Unique identifier */
  id: string

  /** Vulnerability ID */
  vulnerabilityId: string

  /** CVE ID */
  cveId: string

  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low'

  /** CVSS score */
  cvssScore: number

  /** Component name */
  componentName: string

  /** Component version */
  componentVersion: string

  /** Original filter decision */
  originalAction: 'filtered' | 'kept' | 'escalated'

  /** Reason for miss-filter detection */
  detectionReason: string

  /** Detection confidence (0-100) */
  detectionConfidence: number

  /** Whether flagged for review */
  isFlagged: boolean

  /** Whether the item was recently published */
  isRecent: boolean

  /** Whether there's a known exploit */
  hasKnownExploit: boolean

  /** Timestamp of detection */
  detectedAt: string
}

export interface MissFilterPanelProps {
  /** List of potential miss-filters */
  items?: MissFilterItem[]

  /** Current detection configuration */
  config?: MissFilterDetectionConfig

  /** Callback when configuration changes */
  onConfigChange?: (config: MissFilterDetectionConfig) => void

  /** Callback when flagging an item */
  onFlag?: (itemId: string) => void

  /** Callback when unflagging an item */
  onUnflag?: (itemId: string) => void

  /** Callback to restore a filtered item */
  onRestore?: (itemId: string) => void

  /** Callback to dismiss a miss-filter */
  onDismiss?: (itemId: string) => void

  /** Callback for LLM analysis */
  onLlmAnalysis?: (itemId: string) => void

  /** Callback to view details */
  onViewDetails?: (itemId: string) => void

  /** Callback for batch actions */
  onBatchAction?: (action: 'flag' | 'restore' | 'dismiss', itemIds: string[]) => void

  /** Loading states */
  isLoading?: boolean
  llmLoadingIds?: string[]

  /** Alternative simple props (for backwards compatibility) */
  filterResult?: any
  confidenceThreshold?: number
  onThresholdChange?: (threshold: number) => void
  onFlagForReview?: (vulnerabilityId: string) => void
  onLLMAnalysis?: (vulnerabilityId: string) => void

  /** Additional class name */
  className?: string
}

// ============================================================================
// Helper Components
// ============================================================================

function SeverityBadge({ severity }: { severity: 'critical' | 'high' | 'medium' | 'low' }) {
  const colors = {
    critical: 'bg-red-500/10 text-red-500 border-red-500/20',
    high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
    medium: 'bg-yellow-500/10 text-amber-700 dark:text-amber-400 border-yellow-500/20',
    low: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[severity]}`}
    >
      {severity.toUpperCase()}
    </span>
  )
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const getColor = (conf: number) => {
    if (conf >= 80) return 'bg-green-500'
    if (conf >= 60) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${getColor(confidence)}`} style={{ width: `${confidence}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{confidence}%</span>
    </div>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color: 'yellow' | 'red' | 'blue' }) {
  const colors = {
    yellow: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    red: 'bg-red-500/10 text-red-600 border-red-500/20',
    blue: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  }

  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs ${colors[color]}`}>{children}</span>
  )
}

// ============================================================================
// Configuration Panel
// ============================================================================

// Default config for when none is provided
const DEFAULT_MISS_FILTER_CONFIG: MissFilterDetectionConfig = {
  enabled: true,
  lowConfidenceThreshold: 70,
  recentCveDays: 30,
  flagKnownExploits: true,
}

function ConfigPanel({
  config,
  onChange,
}: {
  config?: MissFilterDetectionConfig
  onChange?: (config: MissFilterDetectionConfig) => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Use provided config or default
  const currentConfig = config ?? DEFAULT_MISS_FILTER_CONFIG

  // Handle change with fallback if no onChange provided
  const handleChange = (newConfig: MissFilterDetectionConfig) => {
    if (onChange) {
      onChange(newConfig)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card" data-testid="miss-filter-config">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Detection Settings</span>
        </div>
        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {isExpanded && (
        <div className="space-y-4 border-t border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable Miss-Filter Detection</p>
              <p className="text-xs text-muted-foreground">
                Automatically detect potentially incorrect filter decisions
              </p>
            </div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={currentConfig.enabled}
                onChange={(e) => handleChange({ ...currentConfig, enabled: e.target.checked })}
                aria-label="Enable miss-filter detection"
                className="h-4 w-4 rounded border-border"
              />
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Low Confidence Threshold</p>
              <p className="text-xs text-muted-foreground">Flag items with filter confidence below this threshold</p>
            </div>
            <input
              type="number"
              min={0}
              max={100}
              value={currentConfig.lowConfidenceThreshold}
              onChange={(e) =>
                handleChange({
                  ...currentConfig,
                  lowConfidenceThreshold: parseInt(e.target.value, 10),
                })
              }
              aria-label="Low confidence threshold percentage"
              className="w-20 rounded border border-border bg-background px-2 py-1 text-sm"
              data-testid="confidence-threshold-input"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Recent CVE Window (days)</p>
              <p className="text-xs text-muted-foreground">Flag recently published CVEs for additional review</p>
            </div>
            <input
              type="number"
              min={0}
              max={365}
              value={currentConfig.recentCveDays}
              onChange={(e) =>
                handleChange({
                  ...currentConfig,
                  recentCveDays: parseInt(e.target.value, 10),
                })
              }
              aria-label="Recent CVE window in days"
              className="w-20 rounded border border-border bg-background px-2 py-1 text-sm"
              data-testid="recent-cve-days-input"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Flag Known Exploits</p>
              <p className="text-xs text-muted-foreground">Always flag CVEs with known exploits for review</p>
            </div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={currentConfig.flagKnownExploits}
                onChange={(e) => handleChange({ ...currentConfig, flagKnownExploits: e.target.checked })}
                aria-label="Flag known exploits"
                className="h-4 w-4 rounded border-border"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function MissFilterPanel({
  items,
  config,
  onConfigChange,
  onFlag,
  onUnflag,
  onRestore,
  onDismiss,
  onLlmAnalysis,
  onViewDetails,
  onBatchAction,
  isLoading = false,
  llmLoadingIds = [],
  filterResult,
  confidenceThreshold = 70,
  onThresholdChange,
  onFlagForReview,
  onLLMAnalysis,
  className = '',
}: MissFilterPanelProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [filterFlagged, setFilterFlagged] = useState<boolean | null>(null)

  // Use items if provided, otherwise derive from filterResult or use empty array
  const displayItems = useMemo(() => {
    if (items && items.length > 0) {
      return items
    }
    // If no items but we have filterResult, show empty state
    return [] as MissFilterItem[]
  }, [items, filterResult])

  // Filter items
  const filteredItems = useMemo(() => {
    let result = displayItems || []
    if (filterFlagged !== null) {
      result = result.filter((item) => item.isFlagged === filterFlagged)
    }
    return [...result].sort((a, b) => b.detectionConfidence - a.detectionConfidence)
  }, [items, filterFlagged])

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(filteredItems.map((i) => i.id)))
    }
  }

  const handleSelectItem = (id: string) => {
    const newSelection = new Set(selectedItems)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }
    setSelectedItems(newSelection)
  }

  const handleBatchAction = (action: 'flag' | 'restore' | 'dismiss') => {
    onBatchAction(action, Array.from(selectedItems))
    setSelectedItems(new Set())
  }

  // Stats
  const stats = useMemo(
    () => ({
      total: items?.length ?? 0,
      flagged: items?.filter((i) => i.isFlagged).length ?? 0,
      withExploits: items?.filter((i) => i.hasKnownExploit).length ?? 0,
      recent: items?.filter((i) => i.isRecent).length ?? 0,
    }),
    [items],
  )

  return (
    <div className={`space-y-4 ${className}`} data-testid="miss-filter-panel">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Miss-Filter Detection</h3>
          <p className="text-sm text-muted-foreground">Review potentially incorrect filter decisions</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <span>{stats.total} detected</span>
          </div>
          <div className="flex items-center gap-1">
            <Flag className="h-4 w-4 text-blue-500" />
            <span>{stats.flagged} flagged</span>
          </div>
        </div>
      </div>

      {/* Configuration Panel */}
      <ConfigPanel config={config} onChange={onConfigChange} />

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-yellow-500">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Potential Miss-Filters</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-red-500">{stats.withExploits}</p>
          <p className="text-xs text-muted-foreground">Known Exploits</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-blue-500">{stats.recent}</p>
          <p className="text-xs text-muted-foreground">Recent CVEs</p>
        </div>
      </div>

      {/* Filter Toggles */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <button
          onClick={() => setFilterFlagged(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filterFlagged === null
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
          data-testid="filter-all"
        >
          All ({stats.total})
        </button>
        <button
          onClick={() => setFilterFlagged(true)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filterFlagged === true
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
          data-testid="filter-flagged"
        >
          Flagged ({stats.flagged})
        </button>
        <button
          onClick={() => setFilterFlagged(false)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            filterFlagged === false
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
          data-testid="filter-unflagged"
        >
          Unflagged ({stats.total - stats.flagged})
        </button>
      </div>

      {/* Bulk Actions */}
      {selectedItems.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-4 py-2">
          <span className="text-sm">
            {selectedItems.size} item{selectedItems.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedItems(new Set())}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
            <button
              onClick={() => handleBatchAction('flag')}
              className="flex items-center gap-1 rounded-md bg-blue-500 px-3 py-1 text-sm font-medium text-white hover:bg-blue-600"
            >
              <Flag className="h-3 w-3" />
              Flag All
            </button>
            <button
              onClick={() => handleBatchAction('restore')}
              className="flex items-center gap-1 rounded-md bg-green-500 px-3 py-1 text-sm font-medium text-white hover:bg-green-600"
            >
              <CheckCircle className="h-3 w-3" />
              Restore All
            </button>
            <button
              onClick={() => handleBatchAction('dismiss')}
              className="flex items-center gap-1 rounded-md bg-red-500 px-3 py-1 text-sm font-medium text-white hover:bg-red-600"
            >
              <XCircle className="h-3 w-3" />
              Dismiss All
            </button>
          </div>
        </div>
      )}

      {/* Items List */}
      <div className="space-y-2" data-testid="miss-filter-items">
        {/* Select All Header */}
        {filteredItems.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2">
            <input
              type="checkbox"
              checked={selectedItems.size === filteredItems.length && filteredItems.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm text-muted-foreground">Select all ({filteredItems.length})</span>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 py-8 text-center">
            <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
            <p className="mt-2 text-sm text-muted-foreground">No miss-filters detected</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border p-4 transition-colors ${
                item.isFlagged ? 'border-blue-500/30 bg-blue-500/5' : 'border-border bg-card'
              }`}
              data-testid={`miss-filter-item-${item.id}`}
            >
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedItems.has(item.id)}
                  onChange={() => handleSelectItem(item.id)}
                  className="mt-1 h-4 w-4 rounded border-border"
                />

                {/* Content */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{item.cveId}</span>
                    <SeverityBadge severity={item.severity} />
                    {item.isRecent && <Tag color="blue">Recent</Tag>}
                    {item.hasKnownExploit && <Tag color="red">Exploit</Tag>}
                    {item.isFlagged && <Tag color="yellow">Flagged</Tag>}
                  </div>

                  <p className="text-sm">
                    <span className="font-medium">{item.componentName}</span>
                    <span className="text-muted-foreground"> v{item.componentVersion}</span>
                  </p>

                  <p className="text-sm text-muted-foreground">{item.detectionReason}</p>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Original action: <span className="font-medium">{item.originalAction}</span>
                    </span>
                    <span>Detection confidence:</span>
                    <ConfidenceBar confidence={item.detectionConfidence} />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-1">
                  {onViewDetails && (
                    <button
                      onClick={() => onViewDetails(item.id)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => (item.isFlagged ? onUnflag(item.id) : onFlag(item.id))}
                    className={`rounded p-1.5 ${
                      item.isFlagged
                        ? 'text-blue-500 hover:bg-blue-500/10'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    title={item.isFlagged ? 'Unflag' : 'Flag for review'}
                  >
                    <Flag className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onRestore(item.id)}
                    className="rounded p-1.5 text-green-500 hover:bg-green-500/10"
                    title="Restore item"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onDismiss(item.id)}
                    className="rounded p-1.5 text-red-500 hover:bg-red-500/10"
                    title="Dismiss"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => onLlmAnalysis(item.id)}
                    disabled={llmLoadingIds.includes(item.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    title="Run LLM analysis"
                  >
                    <Sparkles className={`h-4 w-4 ${llmLoadingIds.includes(item.id) ? 'animate-pulse' : ''}`} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default MissFilterPanel
