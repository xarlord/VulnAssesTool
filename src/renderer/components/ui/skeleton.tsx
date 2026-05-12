/**
 * Skeleton Loader Components
 *
 * Provides loading placeholder components for better perceived performance.
 * Uses shimmer animation to indicate loading state.
 *
 * @module components/ui/skeleton
 */

import React from 'react'
import { cn } from '@/lib/utils'

// ============================================================================
// BASE SKELETON COMPONENT
// ============================================================================

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Animation variant */
  variant?: 'shimmer' | 'pulse' | 'none'
  /** Width of the skeleton */
  width?: string | number
  /** Height of the skeleton */
  height?: string | number
  /** Whether to show rounded corners */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
}

/**
 * Base skeleton component with shimmer animation
 */
export function Skeleton({
  className,
  variant = 'shimmer',
  width,
  height,
  rounded = 'md',
  style,
  ...props
}: SkeletonProps) {
  const roundedClasses = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  }

  const variantClasses = {
    shimmer: 'animate-shimmer bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:200%_100%]',
    pulse: 'animate-pulse bg-muted',
    none: 'bg-muted',
  }

  return (
    <div
      className={cn('skeleton', variantClasses[variant], roundedClasses[rounded], className)}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  )
}

// ============================================================================
// SKELETON CARD
// ============================================================================

interface SkeletonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of lines in the card body */
  lines?: number
  /** Show image placeholder */
  showImage?: boolean
  /** Show avatar placeholder */
  showAvatar?: boolean
}

/**
 * Skeleton for card components (e.g., ProjectCard)
 */
export function SkeletonCard({
  className,
  lines = 2,
  showImage = false,
  showAvatar = false,
  ...props
}: SkeletonCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4 space-y-4', className)} {...props}>
      {/* Header */}
      <div className="flex items-center gap-3">
        {showAvatar && <Skeleton width={40} height={40} rounded="full" />}
        <div className="flex-1 space-y-2">
          <Skeleton width="60%" height={20} />
          <Skeleton width="40%" height={14} />
        </div>
      </div>

      {/* Image placeholder */}
      {showImage && <Skeleton width="100%" height={120} rounded="lg" />}

      {/* Body lines */}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} width={i === lines - 1 ? '70%' : '100%'} height={14} />
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 pt-2">
        <Skeleton width={80} height={24} rounded="md" />
        <Skeleton width={80} height={24} rounded="md" />
      </div>
    </div>
  )
}

// ============================================================================
// SKELETON TABLE
// ============================================================================

interface SkeletonTableProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of rows */
  rows?: number
  /** Number of columns */
  columns?: number
  /** Show checkbox column */
  showCheckbox?: boolean
}

/**
 * Skeleton for table components
 */
export function SkeletonTable({
  className,
  rows = 5,
  columns = 4,
  showCheckbox = false,
  ...props
}: SkeletonTableProps) {
  return (
    <div className={cn('rounded-lg border border-border', className)} {...props}>
      {/* Table Header */}
      <div className="flex items-center gap-4 border-b border-border bg-muted/30 px-4 py-3">
        {showCheckbox && <Skeleton width={16} height={16} rounded="sm" />}
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex-1">
            <Skeleton width={i === 0 ? '40%' : '60%'} height={16} />
          </div>
        ))}
      </div>

      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 border-b border-border last:border-0 px-4 py-3">
          {showCheckbox && <Skeleton width={16} height={16} rounded="sm" />}
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div key={colIndex} className="flex-1">
              <Skeleton width={colIndex === 0 ? '80%' : '60%'} height={14} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// SKELETON LIST
// ============================================================================

interface SkeletonListProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of items */
  items?: number
  /** Show avatar for each item */
  showAvatar?: boolean
  /** Show action buttons */
  showActions?: boolean
}

/**
 * Skeleton for list components
 */
export function SkeletonList({
  className,
  items = 5,
  showAvatar = true,
  showActions = false,
  ...props
}: SkeletonListProps) {
  return (
    <div className={cn('space-y-3', className)} {...props}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          {showAvatar && <Skeleton width={40} height={40} rounded="full" />}
          <div className="flex-1 space-y-2">
            <Skeleton width="50%" height={16} />
            <Skeleton width="70%" height={12} />
          </div>
          {showActions && (
            <div className="flex gap-2">
              <Skeleton width={60} height={28} rounded="md" />
              <Skeleton width={28} height={28} rounded="md" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// SKELETON STATS
// ============================================================================

interface SkeletonStatsProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of stat cards */
  count?: number
}

/**
 * Skeleton for statistics cards (e.g., dashboard stats)
 */
export function SkeletonStats({ className, count = 4, ...props }: SkeletonStatsProps) {
  return (
    <div className={cn('grid gap-4 grid-cols-2 md:grid-cols-4', className)} {...props}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
          <Skeleton width="40%" height={12} />
          <Skeleton width="60%" height={28} />
          <Skeleton width="80%" height={14} />
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// SKELETON CHART
// ============================================================================

interface SkeletonChartProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Chart height */
  height?: number
}

/**
 * Skeleton for chart components
 */
export function SkeletonChart({ className, height = 200, ...props }: SkeletonChartProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)} {...props}>
      {/* Chart Header */}
      <div className="flex items-center justify-between mb-4">
        <Skeleton width={120} height={20} />
        <Skeleton width={80} height={28} rounded="md" />
      </div>

      {/* Chart Area */}
      <Skeleton width="100%" height={height} rounded="lg" />

      {/* Chart Legend */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <Skeleton width={60} height={12} />
        <Skeleton width={60} height={12} />
        <Skeleton width={60} height={12} />
      </div>
    </div>
  )
}

// ============================================================================
// SKELETON FORM
// ============================================================================

interface SkeletonFormProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of form fields */
  fields?: number
  /** Show submit button */
  showSubmit?: boolean
}

/**
 * Skeleton for form components
 */
export function SkeletonForm({ className, fields = 4, showSubmit = true, ...props }: SkeletonFormProps) {
  return (
    <div className={cn('space-y-4', className)} {...props}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton width={80 + (i % 3) * 40} height={14} />
          <Skeleton width="100%" height={40} rounded="md" />
        </div>
      ))}

      {showSubmit && (
        <div className="flex justify-end gap-2 pt-4">
          <Skeleton width={80} height={36} rounded="md" />
          <Skeleton width={100} height={36} rounded="md" />
        </div>
      )}
    </div>
  )
}
