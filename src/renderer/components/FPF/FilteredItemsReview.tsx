/**
 * FilteredItemsReview - Review and manage filtered vulnerabilities
 *
 * Provides a table view of filtered vulnerabilities with tabs for different
 * categories, undo functionality, LLM analysis, and export capabilities.
 */

import React, { useState, useMemo } from 'react'
import {
  Undo2,
  Sparkles,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import type { FilterAction } from '@@/types/fpf'

// ============================================================================
// Types
// ============================================================================

export type ReviewTab = 'all' | 'filtered' | 'review_queue' | 'miss_filtered'

export interface FilteredVulnerability {
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

  /** What filtered this vulnerability */
  filteredBy: string

  /** Confidence score (0-100) */
  confidence: number

  /** Action taken */
  action: FilterAction

  /** Filter tier */
  tier: 1 | 2 | 3

  /** Whether this is flagged for miss-filter */
  isMissFilter?: boolean

  /** Whether LLM analysis is available */
  hasLlmAnalysis?: boolean
}

export interface FilteredItemsReviewProps {
  /** List of vulnerabilities to review */
  items?: FilteredVulnerability[]

  /** Callback when undo is clicked */
  onUndo: (vulnerabilityId: string) => void

  /** Callback when LLM analysis is requested */
  onLlmAnalysis: (vulnerabilityId: string) => void

  /** Callback when export is requested */
  onExport: (items: FilteredVulnerability[]) => void

  /** Callback when viewing details */
  onViewDetails?: (vulnerabilityId: string) => void

  /** Loading states */
  isLoading?: boolean
  llmLoadingIds?: string[]

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
      data-testid={`severity-badge-${severity}`}
    >
      {severity.toUpperCase()}
    </span>
  )
}

function ConfidenceIndicator({ confidence }: { confidence: number }) {
  const getColor = (conf: number) => {
    if (conf >= 90) return 'text-green-500'
    if (conf >= 70) return 'text-yellow-500'
    return 'text-red-500'
  }

  return (
    <div className="flex items-center gap-1">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${getColor(confidence)} bg-current`} style={{ width: `${confidence}%` }} />
      </div>
      <span className={`text-xs ${getColor(confidence)}`}>{confidence}%</span>
    </div>
  )
}

function ActionBadge({ action }: { action: FilterAction }) {
  const config = {
    filtered: {
      icon: <CheckCircle className="h-3 w-3" />,
      text: 'Filtered',
      color: 'bg-green-500/10 text-green-500',
    },
    kept: {
      icon: <AlertTriangle className="h-3 w-3" />,
      text: 'Kept',
      color: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
    },
    escalated: {
      icon: <AlertCircle className="h-3 w-3" />,
      text: 'Escalated',
      color: 'bg-yellow-500/10 text-amber-700 dark:text-amber-400',
    },
  }

  const { icon, text, color } = config[action]

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {icon}
      {text}
    </span>
  )
}

function TabButton({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
      data-testid={`tab-${children?.toString().toLowerCase().replace(' ', '-')}`}
    >
      {children}
      {count !== undefined && (
        <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FilteredItemsReview({
  items,
  onUndo,
  onLlmAnalysis,
  onExport,
  onViewDetails,
  isLoading = false,
  llmLoadingIds = [],
  className = '',
}: FilteredItemsReviewProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Filter items based on tab and search
  const filteredItems = useMemo(() => {
    let result = items || []

    // Filter by tab
    switch (activeTab) {
      case 'filtered':
        result = result.filter((item) => item.action === 'filtered')
        break
      case 'review_queue':
        result = result.filter((item) => item.action === 'escalated')
        break
      case 'miss_filtered':
        result = result.filter((item) => item.isMissFilter)
        break
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (item) =>
          item.cveId.toLowerCase().includes(query) ||
          item.componentName.toLowerCase().includes(query) ||
          item.filteredBy.toLowerCase().includes(query),
      )
    }

    return result
  }, [items, activeTab, searchQuery])

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  // Tab counts
  const tabCounts = useMemo(
    () => ({
      all: items?.length ?? 0,
      filtered: items?.filter((i) => i.action === 'filtered').length ?? 0,
      review_queue: items?.filter((i) => i.action === 'escalated').length ?? 0,
      miss_filtered: items?.filter((i) => i.isMissFilter).length ?? 0,
    }),
    [items],
  )

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedItems.size === filteredItems.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(filteredItems.map((i) => i.vulnerabilityId)))
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

  const handleExportSelected = () => {
    const selected = (items || []).filter((i) => selectedItems.has(i.vulnerabilityId))
    onExport(selected)
  }

  return (
    <div className={`space-y-4 ${className}`} data-testid="filtered-items-review">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Filtered Items Review</h3>
        <button
          onClick={() => onExport(filteredItems)}
          disabled={filteredItems.length === 0 || isLoading}
          className="flex items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="export-all-button"
        >
          <Download className="h-4 w-4" />
          Export All
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted/30 p-1">
        <TabButton
          active={activeTab === 'all'}
          onClick={() => {
            setActiveTab('all')
            setCurrentPage(1)
          }}
          count={tabCounts.all}
        >
          All
        </TabButton>
        <TabButton
          active={activeTab === 'filtered'}
          onClick={() => {
            setActiveTab('filtered')
            setCurrentPage(1)
          }}
          count={tabCounts.filtered}
        >
          Filtered
        </TabButton>
        <TabButton
          active={activeTab === 'review_queue'}
          onClick={() => {
            setActiveTab('review_queue')
            setCurrentPage(1)
          }}
          count={tabCounts.review_queue}
        >
          Review Queue
        </TabButton>
        <TabButton
          active={activeTab === 'miss_filtered'}
          onClick={() => {
            setActiveTab('miss_filtered')
            setCurrentPage(1)
          }}
          count={tabCounts.miss_filtered}
        >
          Miss-Filtered
        </TabButton>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by CVE ID, component, or filter reason..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value)
            setCurrentPage(1)
          }}
          aria-label="Search filtered items"
          className="w-full rounded-md border border-border bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="search-input"
        />
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
              onClick={handleExportSelected}
              className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-3 w-3" />
              Export Selected
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full" data-testid="filtered-items-table">
          <thead className="border-b border-border bg-muted/30">
            <tr>
              <th className="w-8 px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={filteredItems.length > 0 && selectedItems.size === filteredItems.length}
                  onChange={handleSelectAll}
                  aria-label="Select all items"
                  className="h-4 w-4 rounded border-border"
                />
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium">CVE ID</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Severity</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Component</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Filtered By</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Confidence</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Action</th>
              <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-sm text-muted-foreground">Loading...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  <div className="text-muted-foreground">
                    <AlertCircle className="mx-auto h-8 w-8 opacity-50" />
                    <p className="mt-2 text-sm">No items to display</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => (
                <tr
                  key={item.vulnerabilityId}
                  className="hover:bg-muted/30"
                  data-testid={`row-${item.vulnerabilityId}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedItems.has(item.vulnerabilityId)}
                      onChange={() => handleSelectItem(item.vulnerabilityId)}
                      className="h-4 w-4 rounded border-border"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{item.cveId}</span>
                      {item.isMissFilter && (
                        <span
                          className="rounded bg-yellow-500/20 px-1 text-xs text-yellow-600"
                          title="Potential miss-filter"
                        >
                          MF
                        </span>
                      )}
                      <a
                        href={`https://nvd.nist.gov/vuln/detail/${item.cveId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={item.severity} />
                    <span className="ml-2 text-xs text-muted-foreground">{item.cvssScore.toFixed(1)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{item.componentName}</p>
                      <p className="text-xs text-muted-foreground">v{item.componentVersion}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm">{item.filteredBy}</p>
                      <p className="text-xs text-muted-foreground">Tier {item.tier}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceIndicator confidence={item.confidence} />
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={item.action} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {onViewDetails && (
                        <button
                          onClick={() => onViewDetails(item.vulnerabilityId)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="View details"
                          data-testid={`view-details-${item.vulnerabilityId}`}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => onUndo(item.vulnerabilityId)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        title="Undo filter decision"
                        data-testid={`undo-${item.vulnerabilityId}`}
                      >
                        <Undo2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onLlmAnalysis(item.vulnerabilityId)}
                        disabled={llmLoadingIds.includes(item.vulnerabilityId)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        title="Run LLM analysis"
                        data-testid={`llm-analysis-${item.vulnerabilityId}`}
                      >
                        <Sparkles
                          className={`h-4 w-4 ${llmLoadingIds.includes(item.vulnerabilityId) ? 'animate-pulse' : ''}`}
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(currentPage - 1) * itemsPerPage + 1} -{' '}
            {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-md border border-border p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-md border border-border p-2 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default FilteredItemsReview
