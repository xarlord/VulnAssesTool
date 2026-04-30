/**
 * EpssCell Component
 *
 * Displays EPSS (Exploit Prediction Scoring System) percentile with
 * color-coded risk visualization.
 *
 * @module EpssCell
 */

import React from 'react'
import { TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getEpssColorClass } from '@/lib/services/riskScore'

export interface EpssCellProps {
  /** EPSS score (0.0 to 1.0 probability) */
  score?: number | null
  /** EPSS percentile (0.0 to 1.0 rank) */
  percentile?: number | null
  /** Show detailed view with score and percentile */
  detailed?: boolean
  /** Show mini bar chart */
  showBar?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Cell component for displaying EPSS information
 */
export function EpssCell({
  score,
  percentile,
  detailed = false,
  showBar = false,
  className,
}: EpssCellProps): React.ReactElement {
  const hasData = percentile !== null && percentile !== undefined

  if (!hasData) {
    return <span className={cn('text-muted-foreground text-sm', className)}>N/A</span>
  }

  const percentileDisplay = Math.round(percentile * 100)
  const colorClass = getEpssColorClass(percentile)

  if (detailed) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <div className="flex items-center gap-1.5">
          <TrendingUp className={cn('w-4 h-4', colorClass)} />
          <span className={cn('font-medium', colorClass)}>{percentileDisplay}%</span>
        </div>
        {score !== null && score !== undefined && (
          <span className="text-xs text-muted-foreground">Score: {(score * 100).toFixed(3)}%</span>
        )}
        {showBar && (
          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mt-1">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                percentileDisplay >= 80 ? 'bg-red-500' : percentileDisplay >= 50 ? 'bg-yellow-500' : 'bg-green-500',
              )}
              style={{ width: `${percentileDisplay}%` }}
            />
          </div>
        )}
      </div>
    )
  }

  // Simple view
  return (
    <span
      className={cn('inline-flex items-center gap-1', 'font-medium', colorClass, className)}
      title={score !== undefined ? `EPSS Score: ${(score * 100).toFixed(3)}%` : undefined}
    >
      <TrendingUp className="w-3.5 h-3.5" />
      {percentileDisplay}%
    </span>
  )
}

/**
 * EPSS badge with risk indicator
 */
export function EpssBadge({
  percentile,
  className,
}: Pick<EpssCellProps, 'percentile' | 'className'>): React.ReactElement | null {
  if (percentile === null || percentile === undefined) {
    return null
  }

  const percentileDisplay = Math.round(percentile * 100)

  let bgColor: string
  let textColor: string

  if (percentileDisplay >= 80) {
    bgColor = 'bg-red-100 dark:bg-red-900/50'
    textColor = 'text-red-700 dark:text-red-300'
  } else if (percentileDisplay >= 50) {
    bgColor = 'bg-yellow-100 dark:bg-yellow-900/50'
    textColor = 'text-yellow-700 dark:text-yellow-300'
  } else {
    bgColor = 'bg-green-100 dark:bg-green-900/50'
    textColor = 'text-green-700 dark:text-green-300'
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
        bgColor,
        textColor,
        className,
      )}
    >
      <TrendingUp className="w-3 h-3" />
      EPSS {percentileDisplay}%
    </span>
  )
}

/**
 * EPSS progress bar
 */
export function EpssProgressBar({
  percentile,
  className,
}: Pick<EpssCellProps, 'percentile' | 'className'>): React.ReactElement | null {
  if (percentile === null || percentile === undefined) {
    return null
  }

  const percentileDisplay = Math.round(percentile * 100)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            percentileDisplay >= 80 ? 'bg-red-500' : percentileDisplay >= 50 ? 'bg-yellow-500' : 'bg-green-500',
          )}
          style={{ width: `${percentileDisplay}%` }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground min-w-[3rem] text-right">{percentileDisplay}%</span>
    </div>
  )
}

export default EpssCell
