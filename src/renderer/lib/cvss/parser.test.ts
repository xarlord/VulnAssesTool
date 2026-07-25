import { describe, it, expect } from 'vitest'
import { parseCvssVector } from './parser'

describe('parseCvssVector (FR-04.3 / CR-03.3)', () => {
  // Regression guard: parseMetricValue previously looked up CVSS_METRIC_VALUES
  // by the raw vector prefix (e.g. 'AV'), but that map is keyed by full metric
  // names ('attackVector'). Every real-world vector hit the mismatch, threw,
  // and parseCvssVector silently returned null for ALL valid CVSS strings --
  // breaking the entire CVSS breakdown feature (FR-04.3).

  it('parses a real CVSS 3.1 critical vector (scope Unchanged) with correct full metric names', () => {
    const result = parseCvssVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')

    expect(result).not.toBeNull()
    if (!result) throw new Error('unreachable')

    expect(result.version).toBe('3.1')
    expect(result.metrics).toEqual({
      attackVector: 'Network',
      attackComplexity: 'Low',
      privilegesRequired: 'None',
      userInteraction: 'None',
      scope: 'Unchanged',
      confidentialityImpact: 'High',
      integrityImpact: 'High',
      availabilityImpact: 'High',
    })

    // Known reference score for this exact vector (NVD calculator): 9.8 Critical.
    expect(result.scores.baseScore).toBe(9.8)
    expect(result.severity).toBe('critical')
  })

  it('parses a real CVSS 3.0 vector with scope Changed and computes a plausible base score', () => {
    // AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H -> known reference score 9.6 (Critical)
    const result = parseCvssVector('CVSS:3.0/AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:H/A:H')

    expect(result).not.toBeNull()
    if (!result) throw new Error('unreachable')

    expect(result.version).toBe('3.0')
    expect(result.metrics.scope).toBe('Changed')
    expect(result.metrics.userInteraction).toBe('Required')
    expect(result.scores.baseScore).toBeGreaterThan(0)
    expect(result.scores.baseScore).toBeLessThanOrEqual(10)
    expect(result.scores.baseScore).toBe(9.6)
    expect(result.severity).toBe('critical')
  })

  it('returns null for an empty string', () => {
    expect(parseCvssVector('')).toBeNull()
  })

  it('returns null for a malformed vector missing required metrics', () => {
    expect(parseCvssVector('CVSS:3.1/AV:N/AC:L')).toBeNull()
  })

  it('returns null for a vector with an unrecognized metric value', () => {
    // 'Z' is not a valid Attack Vector value; must fail loudly instead of
    // silently falling back to the raw letter as if it were a metric name.
    expect(parseCvssVector('CVSS:3.1/AV:Z/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')).toBeNull()
  })

  it('returns null for a non-CVSS string', () => {
    expect(parseCvssVector('not a vector')).toBeNull()
  })
})
