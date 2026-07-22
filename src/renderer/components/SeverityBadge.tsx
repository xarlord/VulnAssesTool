import { cn } from '@/lib/utils'
import { getSeverityClass, getSeverityLabel, type Severity } from '@/lib/severity'

interface SeverityBadgeProps {
  severity: Severity
  /** Optional count suffix, e.g. "Critical · 3". */
  count?: number
  className?: string
}

/**
 * The one severity badge. Colors come from the `.severity-*` token classes so
 * every surface renders severity identically and stays WCAG-AA in both themes.
 */
export function SeverityBadge({ severity, count, className }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold',
        getSeverityClass(severity),
        className,
      )}
    >
      {getSeverityLabel(severity)}
      {count !== undefined && <span aria-label={`${count} findings`}>· {count}</span>}
    </span>
  )
}
