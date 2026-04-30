import React from 'react'
import { Clock, RefreshCw } from 'lucide-react'
import { isVulnDataStale, getStalenessText } from '@/lib/cache'
import type { AppSettings } from '@@/types'

interface StalenessIndicatorProps {
  lastRefresh: Date | undefined
  settings: AppSettings
  onRefresh?: () => void
  isRefreshing?: boolean
  compact?: boolean
}

export function StalenessIndicator({
  lastRefresh,
  settings,
  onRefresh,
  isRefreshing = false,
  compact = false,
}: StalenessIndicatorProps) {
  const isStale = isVulnDataStale(lastRefresh, settings.vulnDataCacheTTL)
  const stalenessText = getStalenessText(lastRefresh, settings.vulnDataCacheTTL)

  if (compact) {
    return (
      <div
        className={`flex items-center gap-1.5 text-xs ${isStale ? 'text-orange-600' : 'text-gray-500'}`}
        title={`Last refreshed: ${stalenessText}`}
      >
        <Clock className="h-3 w-3" />
        <span>{stalenessText}</span>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
        isStale
          ? 'bg-orange-50 text-orange-700 border border-orange-200'
          : 'bg-gray-50 text-gray-600 border border-gray-200'
      }`}
    >
      <Clock className="h-4 w-4" />
      <span>
        Last refreshed: <strong>{stalenessText}</strong>
      </span>
      {isStale && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="ml-1 flex items-center gap-1 rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 hover:bg-orange-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
        </button>
      )}
    </div>
  )
}

/**
 * Smaller badge-style staleness indicator
 */
export function StalenessBadge({ lastRefresh, settings }: Pick<StalenessIndicatorProps, 'lastRefresh' | 'settings'>) {
  const isStale = isVulnDataStale(lastRefresh, settings.vulnDataCacheTTL)
  const stalenessText = getStalenessText(lastRefresh, settings.vulnDataCacheTTL)

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isStale ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
      }`}
      title={`Last refreshed: ${stalenessText}`}
    >
      <Clock className="h-3 w-3" />
      <span>{stalenessText}</span>
    </div>
  )
}
