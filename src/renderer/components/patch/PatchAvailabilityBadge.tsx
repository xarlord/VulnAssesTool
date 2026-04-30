import React from 'react'
import { CheckCircle, XCircle, AlertCircle, Clock, HelpCircle } from 'lucide-react'
import type { PatchAvailabilityStatus } from '@@/types'
import { PATCH_STATUS_COLORS, PATCH_STATUS_LABELS } from '@@/constants'

interface PatchAvailabilityBadgeProps {
  status: PatchAvailabilityStatus
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

/**
 * Patch Availability Badge Component
 * Shows the availability status of a security patch
 */
export function PatchAvailabilityBadge({ status, size = 'md', showIcon = true }: PatchAvailabilityBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-1 gap-1',
    md: 'text-sm px-3 py-1.5 gap-1.5',
    lg: 'text-base px-4 py-2 gap-2',
  }

  const iconSize = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  }

  const icons = {
    available: <CheckCircle className={iconSize[size]} />,
    partial: <AlertCircle className={iconSize[size]} />,
    upstream: <Clock className={iconSize[size]} />,
    investigating: <HelpCircle className={iconSize[size]} />,
    none: <XCircle className={iconSize[size]} />,
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${PATCH_STATUS_COLORS[status]} ${sizeClasses[size]}`}
    >
      {showIcon && icons[status]}
      <span>{PATCH_STATUS_LABELS[status]}</span>
    </span>
  )
}
