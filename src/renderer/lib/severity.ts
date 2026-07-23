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

/**
 * Text-only severity color class (`.severity-text-*`), for colored counts and
 * labels that must NOT carry a background. Backed by per-theme `--severity-*-text`
 * tokens that stay WCAG-AA on the page background (the badge hue alone fails as
 * text in light mode). Use for a colored number/label; use {@link getSeverityClass}
 * or {@link SeverityBadge} when you want a filled badge pill.
 */
export function getSeverityTextClass(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return 'severity-text-critical'
    case 'high':
      return 'severity-text-high'
    case 'medium':
      return 'severity-text-medium'
    case 'low':
      return 'severity-text-low'
    case 'none':
      return 'severity-text-none'
  }
}

/** Display label, capitalized ("critical" → "Critical"). */
export function getSeverityLabel(severity: Severity): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1)
}
