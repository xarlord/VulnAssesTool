/**
 * Empty State Component
 *
 * Displays a helpful illustration and message when there's no content.
 * Provides clear guidance on how to get started.
 *
 * @module components/ui/EmptyState
 */

import React from 'react'
import { cn } from '@/lib/utils'
import { FolderOpen, Search, Shield, AlertTriangle, FileText, Database, Filter, Inbox, LucideIcon } from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

export type EmptyStateVariant =
  | 'projects'
  | 'components'
  | 'vulnerabilities'
  | 'search'
  | 'filtered'
  | 'reports'
  | 'database'
  | 'generic'

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Predefined variant for common use cases */
  variant?: EmptyStateVariant
  /** Custom icon */
  icon?: LucideIcon
  /** Title text */
  title?: string
  /** Description text */
  description?: string
  /** Action button */
  action?: React.ReactNode
  /** Secondary action button */
  secondaryAction?: React.ReactNode
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Illustration URL or component */
  illustration?: React.ReactNode
}

// ============================================================================
// VARIANT CONFIGURATIONS
// ============================================================================

const variantConfigs: Record<EmptyStateVariant, { icon: LucideIcon; title: string; description: string }> = {
  projects: {
    icon: FolderOpen,
    title: 'No Projects Yet',
    description: 'Create your first project to start tracking vulnerabilities in your software.',
  },
  components: {
    icon: Shield,
    title: 'No Components',
    description: 'Upload an SBOM to see your software components here.',
  },
  vulnerabilities: {
    icon: AlertTriangle,
    title: 'No Vulnerabilities Found',
    description: "Great news! We didn't find any known vulnerabilities in your components.",
  },
  search: {
    icon: Search,
    title: 'No Results Found',
    description: 'Try adjusting your search terms or filters to find what you need.',
  },
  filtered: {
    icon: Filter,
    title: 'All Items Filtered',
    description: 'No items match your current filters. Try adjusting your filter criteria.',
  },
  reports: {
    icon: FileText,
    title: 'No Reports Generated',
    description: 'Generate your first vulnerability report to share with your team.',
  },
  database: {
    icon: Database,
    title: 'Database Empty',
    description: 'Sync the NVD database to get the latest vulnerability information.',
  },
  generic: {
    icon: Inbox,
    title: 'No Items',
    description: 'There are no items to display at this time.',
  },
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * EmptyState component for displaying helpful guidance when no content exists
 */
export function EmptyState({
  variant = 'generic',
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  illustration,
  className,
  children,
  ...props
}: EmptyStateProps) {
  const config = variantConfigs[variant]
  const Icon = icon || config.icon
  const displayTitle = title || config.title
  const displayDescription = description || config.description

  const sizeClasses = {
    sm: {
      container: 'py-6',
      icon: 'h-10 w-10',
      title: 'text-base',
      description: 'text-sm',
    },
    md: {
      container: 'py-12',
      icon: 'h-12 w-12',
      title: 'text-lg',
      description: 'text-sm',
    },
    lg: {
      container: 'py-16',
      icon: 'h-16 w-16',
      title: 'text-xl',
      description: 'text-base',
    },
  }

  const sizes = sizeClasses[size]

  return (
    <div className={cn('flex flex-col items-center justify-center text-center', sizes.container, className)} {...props}>
      {/* Illustration or Icon */}
      {illustration || (
        <div className="rounded-full bg-muted p-4 mb-4">
          <Icon className={cn(sizes.icon, 'text-muted-foreground')} />
        </div>
      )}

      {/* Title */}
      <h3 className={cn('font-semibold text-foreground mb-2', sizes.title)}>{displayTitle}</h3>

      {/* Description */}
      <p className={cn('text-muted-foreground max-w-md mb-6', sizes.description)}>{displayDescription}</p>

      {/* Actions */}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action}
          {secondaryAction}
        </div>
      )}

      {/* Additional Content */}
      {children}
    </div>
  )
}

// ============================================================================
// SPECIALIZED EMPTY STATES
// ============================================================================

interface NoProjectsProps extends Omit<EmptyStateProps, 'variant'> {
  onCreateProject?: () => void
}

/**
 * Empty state for when there are no projects
 */
export function NoProjects({ onCreateProject, ...props }: NoProjectsProps) {
  return (
    <EmptyState
      variant="projects"
      action={
        onCreateProject && (
          <button
            onClick={onCreateProject}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Create Project
          </button>
        )
      }
      {...props}
    />
  )
}

interface NoSearchResultsProps extends Omit<EmptyStateProps, 'variant'> {
  query?: string
  onClearFilters?: () => void
}

/**
 * Empty state for search with no results
 */
export function NoSearchResults({ query, onClearFilters, ...props }: NoSearchResultsProps) {
  return (
    <EmptyState
      variant="search"
      description={
        query
          ? `No results found for "${query}". Try different keywords or check your spelling.`
          : 'Enter a search term to find projects, components, or vulnerabilities.'
      }
      action={
        onClearFilters && (
          <button
            onClick={onClearFilters}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Clear Filters
          </button>
        )
      }
      {...props}
    />
  )
}

interface NoVulnerabilitiesProps extends Omit<EmptyStateProps, 'variant'> {
  filtered?: boolean
  onClearFilters?: () => void
}

/**
 * Empty state for vulnerability lists
 */
export function NoVulnerabilities({ filtered, onClearFilters, ...props }: NoVulnerabilitiesProps) {
  if (filtered) {
    return (
      <EmptyState
        variant="filtered"
        action={
          onClearFilters && (
            <button
              onClick={onClearFilters}
              className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              Clear Filters
            </button>
          )
        }
        {...props}
      />
    )
  }

  return (
    <EmptyState
      variant="vulnerabilities"
      illustration={
        <div className="flex items-center gap-2 text-green-600 bg-green-500/10 rounded-full px-4 py-2 mb-4">
          <Shield className="h-5 w-5" />
          <span className="text-sm font-medium">All Clear</span>
        </div>
      }
      {...props}
    />
  )
}

interface NoComponentsProps extends Omit<EmptyStateProps, 'variant'> {
  onUploadSbom?: () => void
}

/**
 * Empty state for component lists
 */
export function NoComponents({ onUploadSbom, ...props }: NoComponentsProps) {
  return (
    <EmptyState
      variant="components"
      action={
        onUploadSbom && (
          <button
            onClick={onUploadSbom}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Upload SBOM
          </button>
        )
      }
      {...props}
    />
  )
}
