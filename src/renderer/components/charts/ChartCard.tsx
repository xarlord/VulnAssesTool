import React from 'react'

interface ChartCardProps {
  title: string
  description?: string
  children: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

/**
 * Chart Card Component
 * A reusable wrapper for chart components with consistent styling
 */
export function ChartCard({ title, description, children, actions, className = '' }: ChartCardProps) {
  return (
    <div className={`rounded-lg border border-border bg-card p-6 shadow-sm ${className}`}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
