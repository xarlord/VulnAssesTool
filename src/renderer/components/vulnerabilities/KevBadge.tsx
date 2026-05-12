/**
 * KevBadge Component
 *
 * Displays a badge indicating that a CVE is in the CISA Known Exploited
 * Vulnerabilities catalog (actively exploited in the wild).
 *
 * @module KevBadge
 */

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface KevBadgeProps {
  /** Whether the CVE is in KEV catalog */
  isKev: boolean
  /** Whether it's known to be used in ransomware campaigns */
  knownRansomwareUse?: boolean
  /** Compact mode (icon only) */
  compact?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Badge component for CISA KEV status
 */
export function KevBadge({
  isKev,
  knownRansomwareUse = false,
  compact = false,
  className,
}: KevBadgeProps): React.ReactElement | null {
  if (!isKev) {
    return null
  }

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center',
          'w-5 h-5 rounded-full',
          'bg-red-500 text-white',
          'cursor-help',
          className,
        )}
        title="Actively Exploited (CISA KEV)"
      >
        <AlertTriangle className="w-3 h-3" />
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold',
        knownRansomwareUse
          ? 'bg-red-500 text-white animate-pulse'
          : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
        'border border-red-300 dark:border-red-700',
        className,
      )}
      title={
        knownRansomwareUse ? 'Actively exploited and used in ransomware campaigns' : 'Actively exploited (CISA KEV)'
      }
    >
      <AlertTriangle className="w-3 h-3" />
      {knownRansomwareUse ? 'Ransomware' : 'Exploited'}
    </span>
  )
}

/**
 * KEV badge with tooltip
 */
export function KevBadgeWithTooltip({
  isKev,
  knownRansomwareUse = false,
  compact = false,
  className,
}: KevBadgeProps): React.ReactElement | null {
  if (!isKev) {
    return null
  }

  return (
    <div className={cn('relative group', className)}>
      <KevBadge isKev={isKev} knownRansomwareUse={knownRansomwareUse} compact={compact} />

      {/* Tooltip */}
      <div
        className={cn(
          'absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2',
          'px-3 py-2 rounded-lg shadow-lg',
          'bg-gray-900 text-white text-xs',
          'opacity-0 invisible group-hover:opacity-100 group-hover:visible',
          'transition-opacity duration-200',
          'whitespace-nowrap',
          'pointer-events-none',
        )}
      >
        <div className="font-semibold mb-1">CISA Known Exploited Vulnerability</div>
        <div className="text-gray-300">
          {knownRansomwareUse
            ? 'This vulnerability is actively exploited in ransomware campaigns.'
            : 'This vulnerability has been actively exploited in the wild.'}
        </div>
        {/* Arrow */}
        <div
          className={cn('absolute top-full left-1/2 -translate-x-1/2', 'border-4 border-transparent border-t-gray-900')}
        />
      </div>
    </div>
  )
}
