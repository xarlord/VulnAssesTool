/**
 * FilterDashboard - Main dashboard for False Positive Filter feature
 *
 * Shows summary statistics, filter effectiveness metrics, configuration status,
 * and provides quick actions (Run Filter, Configure, Export Report).
 */

import React from 'react'
import {
  Play,
  Settings,
  FileDown,
  AlertTriangle,
  CheckCircle,
  Filter,
  TrendingUp,
  Clock,
  Shield,
  AlertCircle,
} from 'lucide-react'
import type { FilterBatchResult, SystemConfig, FPFState } from '@@/types/fpf'

// ============================================================================
// Types
// ============================================================================

export interface FilterDashboardProps {
  /** Current FPF state (alternative to individual props) */
  fpfState?: FPFState

  /** Individual props (alternative to fpfState) */
  config?: SystemConfig | null
  filterResult?: FilterBatchResult | null
  configLoading?: boolean

  /** Callback to run the filter */
  onRunFilter: () => void

  /** Callback to open configuration wizard */
  onConfigure: () => void

  /** Callback to export report */
  onExportReport: () => void

  /** Whether filter is currently running */
  isFiltering?: boolean

  /** Additional class name */
  className?: string
}

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple'
  trend?: {
    value: number
    direction: 'up' | 'down' | 'stable'
  }
}

// ============================================================================
// Helper Components
// ============================================================================

function StatCard({ label, value, icon, color, trend }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    green: 'bg-green-500/10 text-green-500 border-green-500/20',
    yellow: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    red: 'bg-red-500/10 text-red-500 border-red-500/20',
    purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {trend && (
            <div className="mt-1 flex items-center gap-1 text-xs">
              {trend.direction === 'up' && <TrendingUp className="h-3 w-3 text-green-500" />}
              {trend.direction === 'down' && <TrendingUp className="h-3 w-3 rotate-180 text-red-500" />}
              {trend.direction === 'stable' && <span className="text-muted-foreground">--</span>}
              <span
                className={
                  trend.direction === 'up'
                    ? 'text-green-500'
                    : trend.direction === 'down'
                      ? 'text-red-500'
                      : 'text-muted-foreground'
                }
              >
                {trend.value}%
              </span>
            </div>
          )}
        </div>
        <div className={`rounded-lg border p-2 ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  )
}

function ConfigurationStatus({ config }: { config: SystemConfig | null }) {
  if (!config) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3"
        data-testid="config-status-missing"
      >
        <AlertCircle className="h-5 w-5 text-yellow-500" />
        <div>
          <p className="text-sm font-medium">Configuration Required</p>
          <p className="text-xs text-muted-foreground">Set up your project configuration to enable filtering</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 p-3"
      data-testid="config-status-valid"
    >
      <CheckCircle className="h-5 w-5 text-green-500" />
      <div>
        <p className="text-sm font-medium">Configuration Active</p>
        <p className="text-xs text-muted-foreground">
          {config.project.name} v{config.project.version} - Tier: {config.project.tier}
        </p>
      </div>
    </div>
  )
}

function EffectivenessMetrics({ result }: { result: FilterBatchResult | null }) {
  if (!result) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-6 text-center" data-testid="no-filter-results">
        <Filter className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          No filter results yet. Run the filter to see effectiveness metrics.
        </p>
      </div>
    )
  }

  const filterRate = ((result.filtered / result.total) * 100).toFixed(1)
  const escalationRate = ((result.escalated / result.total) * 100).toFixed(1)

  return (
    <div data-testid="effectiveness-metrics" className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Filter Rate</p>
          <p className="text-xl font-bold text-green-500">{filterRate}%</p>
          <p className="text-xs text-muted-foreground">
            {result.filtered} of {result.total} filtered
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Escalation Rate</p>
          <p className="text-xl font-bold text-yellow-500">{escalationRate}%</p>
          <p className="text-xs text-muted-foreground">{result.escalated} need review</p>
        </div>
      </div>

      {/* Severity breakdown */}
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Results by Severity</p>
        <div className="space-y-2">
          {(['critical', 'high', 'medium', 'low'] as const).map((severity) => {
            const data = result.bySeverity[severity]
            const total = data.filtered + data.kept + data.escalated
            if (total === 0) return null

            const colorClasses = {
              critical: 'bg-red-500',
              high: 'bg-orange-500',
              medium: 'bg-yellow-500',
              low: 'bg-blue-500',
            }

            return (
              <div key={severity} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize">{severity}</span>
                  <span className="text-muted-foreground">
                    {data.kept} kept / {data.filtered} filtered / {data.escalated} escalated
                  </span>
                </div>
                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`${colorClasses[severity]} opacity-80`}
                    style={{
                      width: `${(data.kept / total) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-green-500 opacity-60"
                    style={{
                      width: `${(data.filtered / total) * 100}%`,
                    }}
                  />
                  <div
                    className="bg-yellow-500 opacity-60"
                    style={{
                      width: `${(data.escalated / total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Processing time */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        <span>Processed in {(result.processingTimeMs / 1000).toFixed(2)}s</span>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function FilterDashboard({
  fpfState,
  config: propConfig,
  filterResult: propFilterResult,
  configLoading: propConfigLoading,
  onRunFilter,
  onConfigure,
  onExportReport,
  isFiltering = false,
  className = '',
}: FilterDashboardProps) {
  // Support both fpfState object and individual props
  const config = fpfState?.config ?? propConfig ?? null
  const lastFilterResult = fpfState?.lastFilterResult ?? propFilterResult ?? null
  const configLoading = fpfState?.configLoading ?? propConfigLoading ?? false

  const stats = lastFilterResult
    ? {
        total: lastFilterResult.total,
        filtered: lastFilterResult.filtered,
        kept: lastFilterResult.kept,
        escalated: lastFilterResult.escalated,
      }
    : {
        total: 0,
        filtered: 0,
        kept: 0,
        escalated: 0,
      }

  return (
    <div className={`space-y-6 ${className}`} data-testid="filter-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">False Positive Filter</h2>
          <p className="text-sm text-muted-foreground">ISO 21434 compliant vulnerability filtering</p>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">3-Tier Hybrid Filter</span>
        </div>
      </div>

      {/* Configuration Status */}
      <ConfigurationStatus config={config} />

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onRunFilter}
          disabled={isFiltering || !config || configLoading}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="run-filter-button"
        >
          <Play className={`h-4 w-4 ${isFiltering ? 'animate-spin' : ''}`} />
          {isFiltering ? 'Filtering...' : 'Run Filter'}
        </button>
        <button
          onClick={onConfigure}
          disabled={configLoading}
          className="flex items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="configure-button"
        >
          <Settings className="h-4 w-4" />
          Configure
        </button>
        <button
          onClick={onExportReport}
          disabled={!lastFilterResult}
          className="flex items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="export-report-button"
        >
          <FileDown className="h-4 w-4" />
          Export Report
        </button>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Vulnerabilities"
          value={stats.total}
          icon={<AlertTriangle className="h-5 w-5" />}
          color="blue"
        />
        <StatCard label="Filtered (FP)" value={stats.filtered} icon={<Filter className="h-5 w-5" />} color="green" />
        <StatCard label="Kept (Real)" value={stats.kept} icon={<CheckCircle className="h-5 w-5" />} color="purple" />
        <StatCard label="Escalated" value={stats.escalated} icon={<AlertCircle className="h-5 w-5" />} color="yellow" />
      </div>

      {/* Effectiveness Metrics */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="mb-4 text-lg font-medium">Filter Effectiveness</h3>
        <EffectivenessMetrics result={lastFilterResult} />
      </div>
    </div>
  )
}
