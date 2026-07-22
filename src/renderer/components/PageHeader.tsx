import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: ReactNode
  /** Optional one-line context under the title. */
  description?: ReactNode
  /** Right-aligned action buttons. */
  actions?: ReactNode
  className?: string
}

/**
 * The shared page header: slim title row rendered inside the AppShell content
 * area. Replaces the per-page hand-rolled <header> blocks — navigation (back,
 * breadcrumbs, global actions) lives in the shell, not here.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description !== undefined && description !== null && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions !== undefined && actions !== null && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
