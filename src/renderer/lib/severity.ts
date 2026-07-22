import type { Vulnerability } from '@@/types'

export type Severity = Vulnerability['severity']

/** Ordered most-severe first — the canonical display order for grouping/sorting. */
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'high', 'medium', 'low', 'none'] as const

/**
 * The single source of severity → color mapping. Returns the token-backed
 * utility class from globals.css (`.severity-*`), which resolves to
 * WCAG-AA-compliant fg/bg pairs in both light and dark themes.
 *
 * Use this (or <SeverityBadge>) instead of hand-rolling `text-red-600` /
 * `bg-yellow-100` per file — those raw-palette variants are the source of the
 * light-mode contrast failures this replaces.
 */
export function getSeverityClass(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'severity-critical'
    case 'high':
      return 'severity-high'
    case 'medium':
      return 'severity-medium'
    case 'low':
      return 'severity-low'
    case 'none':
      return 'severity-none'
  }
}

/** Display label, capitalized ("critical" → "Critical"). */
export function getSeverityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}
