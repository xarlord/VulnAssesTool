import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  path?: string
}

export interface AppHeaderProps {
  title: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: React.ReactNode
}

export function AppHeader({ title, breadcrumbs, actions }: AppHeaderProps) {
  const navigate = useNavigate()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-2">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav className="flex items-center gap-1 text-sm">
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="text-muted-foreground">/</span>}
                {crumb.path ? (
                  <button
                    onClick={() => navigate(crumb.path as string)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span
                    className={cn(
                      i === breadcrumbs.length - 1 ? 'font-medium text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </nav>
        ) : (
          <h1 className="text-base font-semibold">{title}</h1>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function BackButton({ label, path }: { label: string; path: string }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(path)}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  )
}
