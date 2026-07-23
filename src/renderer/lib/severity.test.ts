import { describe, it, expect } from 'vitest'
import { getSeverityClass, getSeverityTextClass, getSeverityLabel, SEVERITY_ORDER, type Severity } from './severity'

describe('severity utility', () => {
  it('maps every severity to its token class (never a raw palette class)', () => {
    // Token classes resolve to WCAG-AA fg/bg pairs in globals.css for BOTH
    // themes; a raw class like text-red-600 would reintroduce the light-mode
    // contrast failures this module exists to fix.
    const expected: Record<Severity, string> = {
      critical: 'severity-critical',
      high: 'severity-high',
      medium: 'severity-medium',
      low: 'severity-low',
      none: 'severity-none',
    }
    for (const severity of SEVERITY_ORDER) {
      expect(getSeverityClass(severity)).toBe(expected[severity])
    }
  })

  it('maps every severity to its text-only token class (no background)', () => {
    // These back colored counts/labels. They must be token classes (backed by
    // per-theme --severity-*-text vars that stay WCAG-AA on the page), never a
    // raw dual-mode palette string like 'text-orange-700 dark:text-orange-400'.
    const expected: Record<Severity, string> = {
      critical: 'severity-text-critical',
      high: 'severity-text-high',
      medium: 'severity-text-medium',
      low: 'severity-text-low',
      none: 'severity-text-none',
    }
    for (const severity of SEVERITY_ORDER) {
      expect(getSeverityTextClass(severity)).toBe(expected[severity])
    }
  })

  it('orders severities most-severe first for display grouping', () => {
    expect(SEVERITY_ORDER).toEqual(['critical', 'high', 'medium', 'low', 'none'])
  })

  it('capitalizes labels for display', () => {
    expect(getSeverityLabel('critical')).toBe('Critical')
    expect(getSeverityLabel('none')).toBe('None')
  })
})
