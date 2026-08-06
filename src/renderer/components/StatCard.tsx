import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: ReactNode
  /** Optional leading icon (pass a sized lucide icon element). */
  icon?: ReactNode
  /** Optional accent class for the value, e.g. a severity text color. */
  valueClassName?: string
  className?: string
}

/**
 * The shared stat tile used by dashboard/overview stat rows — replaces the
 * hand-rolled `rounded-lg border bg-card p-6` divs duplicated across pages.
 */
export function StatCard({ label, value, icon, valueClassName, className }: StatCardProps) {
  return (
    <Card className={cn('p-6', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={cn('mt-2 text-3xl font-semibold tracking-tight', valueClassName)}>{value}</p>
    </Card>
  )
}
