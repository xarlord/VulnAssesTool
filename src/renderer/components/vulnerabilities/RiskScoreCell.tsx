/**
 * RiskScoreCell Component
 *
 * Displays composite risk score with visual indicator and breakdown tooltip.
 * Score range: 0-100 combining KEV, EPSS, and Severity.
 *
 * @module RiskScoreCell
 */

import React from 'react'
import { Shield, AlertTriangle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  calculateRiskScore,
  getRiskLevelColor,
  getRiskLevelClasses,
  type RiskScoreInput,
  type RiskLevel,
} from '@/lib/services/riskScore'

export interface RiskScoreCellProps extends RiskScoreInput {
  /** Show detailed breakdown */
  detailed?: boolean
  /** Show progress bar */
  showBar?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Additional CSS classes */
  className?: string
}

/**
 * Cell component for displaying composite risk score
 */
export function RiskScoreCell({
  isKev,
  epssPercentile,
  severity,
  detailed = false,
  showBar = true,
  size = 'md',
  className,
}: RiskScoreCellProps): React.ReactElement {
  const result = calculateRiskScore({ isKev, epssPercentile, severity })
  const levelClasses = getRiskLevelClasses(result.level)

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  }

  const iconSize = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  // Get icon based on risk level
  const getIcon = () => {
    if (isKev) {
      return <AlertTriangle className={cn(iconSize[size], 'animate-pulse')} />
    }
    if (result.level === 'critical' || result.level === 'high') {
      return <AlertCircle className={iconSize[size]} />
    }
    return <Shield className={iconSize[size]} />
  }

  return (
    <div className={cn('relative group', className)}>
      <div
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg font-semibold',
          'border',
          levelClasses.bg,
          levelClasses.text,
          levelClasses.border,
          sizeClasses[size],
        )}
      >
        {getIcon()}
        <span>{result.score}</span>
      </div>

      {/* Progress bar */}
      {showBar && (
        <div className="mt-1 w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${result.score}%`,
              backgroundColor: getRiskLevelColor(result.level),
            }}
          />
        </div>
      )}

      {/* Detailed breakdown tooltip */}
      {detailed && (
        <div
          className={cn(
            'absolute z-50 bottom-full left-0 mb-2',
            'min-w-[200px] p-3 rounded-lg shadow-lg',
            'bg-gray-900 text-white text-xs',
            'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
            'transition-opacity duration-200',
            'pointer-events-none',
          )}
        >
          <div className="font-semibold mb-2 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Risk Score Breakdown
          </div>
          <div className="space-y-1.5">
            {/* KEV factor */}
            <div className="flex items-center justify-between">
              <span className="text-gray-400">KEV Status:</span>
              <span className={cn(result.factors.kev > 0 ? 'text-red-400' : 'text-gray-500')}>
                {result.factors.kev > 0 ? `+${result.factors.kev}` : '0'}
              </span>
            </div>
            {/* EPSS factor */}
            <div className="flex items-center justify-between">
              <span className="text-gray-400">EPSS Percentile:</span>
              <span className={cn(result.factors.epss > 0 ? 'text-yellow-400' : 'text-gray-500')}>
                +{result.factors.epss}
              </span>
            </div>
            {/* Severity factor */}
            <div className="flex items-center justify-between">
              <span className="text-gray-400">Severity ({severity}):</span>
              <span className="text-blue-400">+{result.factors.severity}</span>
            </div>
            {/* Divider */}
            <div className="border-t border-gray-700 my-1.5" />
            {/* Total */}
            <div className="flex items-center justify-between font-semibold">
              <span>Total Score:</span>
              <span style={{ color: getRiskLevelColor(result.level) }}>{result.score}/100</span>
            </div>
          </div>
          {/* Arrow */}
          <div className={cn('absolute top-full left-4', 'border-4 border-transparent border-t-gray-900')} />
        </div>
      )}
    </div>
  )
}

/**
 * Compact risk score badge
 */
export function RiskScoreBadge({
  isKev,
  epssPercentile,
  severity,
  className,
}: Omit<RiskScoreCellProps, 'detailed' | 'showBar' | 'size'>): React.ReactElement {
  const result = calculateRiskScore({ isKev, epssPercentile, severity })
  const levelClasses = getRiskLevelClasses(result.level)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold',
        'border',
        levelClasses.bg,
        levelClasses.text,
        levelClasses.border,
        isKev && 'animate-pulse',
        className,
      )}
    >
      {isKev && <AlertTriangle className="w-3 h-3" />}
      {result.score}
    </span>
  )
}

/**
 * Risk score legend component
 */
export function RiskScoreLegend({ className }: { className?: string }): React.ReactElement {
  const levels: Array<{ level: RiskLevel; label: string; range: string }> = [
    { level: 'critical', label: 'Critical', range: '70-100' },
    { level: 'high', label: 'High', range: '50-69' },
    { level: 'medium', label: 'Medium', range: '30-49' },
    { level: 'low', label: 'Low', range: '0-29' },
  ]

  return (
    <div className={cn('flex flex-wrap gap-3 text-xs', className)}>
      {levels.map(({ level, label, range }) => (
        <div key={level} className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getRiskLevelColor(level) }} />
          <span className="text-muted-foreground">
            {label} ({range})
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Risk score sorting indicator
 */
export function RiskScoreSortIndicator({
  direction,
  className,
}: {
  direction: 'asc' | 'desc' | null
  className?: string
}): React.ReactElement | null {
  if (!direction) return null

  return <span className={cn('text-muted-foreground', className)}>{direction === 'desc' ? '↓' : '↑'}</span>
}

export default RiskScoreCell
