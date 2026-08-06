import { describe, it, expect } from 'vitest'
import { parseCvssVector, getSeverityFromScore } from './parser'

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

describe('getSeverityFromScore configurable thresholds (FR-10.5)', () => {
  it('uses the default 9/7/4/0.1 cutoffs when no thresholds are supplied', () => {
    // Backward-compat: every existing caller (ingestion providers included) omits
    // the arg and must keep the exact spec buckets.
    expect(getSeverityFromScore(9.5)).toBe('critical')
    expect(getSeverityFromScore(8.5)).toBe('high')
    expect(getSeverityFromScore(5.0)).toBe('medium')
    expect(getSeverityFromScore(2.0)).toBe('low')
    expect(getSeverityFromScore(0)).toBe('none')
  })

  it('consults custom thresholds so the same score can land in a different bucket', () => {
    // WHY: proves the param is actually read, not accepted-and-ignored. 8.5 is 'high'
    // under the defaults but 'critical' once the critical cutoff drops to 8.0.
    expect(getSeverityFromScore(8.5, { critical: 8.0, high: 7.0, medium: 4.0, low: 0.1 })).toBe('critical')
    expect(getSeverityFromScore(8.5, { critical: 9.0, high: 7.0, medium: 4.0, low: 0.1 })).toBe('high')
  })
})

describe('parseCvssVector threshold threading (FR-10.5)', () => {
  it('reflects custom severity thresholds in breakdown.severity', () => {
    // base 9.8 -> 'critical' by default, but only 'high' once critical is raised to 10.0.
    const vector = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'
    expect(parseCvssVector(vector)?.severity).toBe('critical')
    expect(parseCvssVector(vector, { critical: 10.0, high: 7.0, medium: 4.0, low: 0.1 })?.severity).toBe('high')
  })
})

describe('parseCvssVector temporal metrics E/RL/RC (FR-04.3)', () => {
  const BASE = 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'

  it('leaves temporalMetrics undefined when the vector has no temporal metrics', () => {
    // WHY: a base-only vector must not fabricate temporal data — the UI keys the Temporal
    // Metrics block off this field being present, so a false object would render an empty section.
    expect(parseCvssVector(BASE)?.temporalMetrics).toBeUndefined()
  })

  it('parses all three temporal metrics to their full names', () => {
    const result = parseCvssVector(`${BASE}/E:F/RL:O/RC:C`)
    expect(result?.temporalMetrics).toEqual({
      exploitCodeMaturity: 'Functional',
      remediationLevel: 'Official Fix',
      reportConfidence: 'Confirmed',
    })
  })

  it('disambiguates the "U" code per metric (Unproven vs Unavailable vs Unknown)', () => {
    // WHY: 'U' is a different value in each temporal metric; a single shared table would
    // mislabel two of the three. This is the exact bug a naive implementation introduces.
    const result = parseCvssVector(`${BASE}/E:U/RL:U/RC:U`)
    expect(result?.temporalMetrics).toEqual({
      exploitCodeMaturity: 'Unproven',
      remediationLevel: 'Unavailable',
      reportConfidence: 'Unknown',
    })
  })

  it('includes only the temporal metrics actually present in the vector', () => {
    const result = parseCvssVector(`${BASE}/RL:W`)
    expect(result?.temporalMetrics).toEqual({ remediationLevel: 'Workaround' })
  })

  it('accepts an explicit X (Not Defined), distinct from an absent metric', () => {
    // E:X is a stated value, not the same as omitting E — the plan requires the two be distinguishable.
    expect(parseCvssVector(`${BASE}/E:X`)?.temporalMetrics).toEqual({ exploitCodeMaturity: 'Not Defined' })
  })

  it('returns null for an invalid temporal code (fail-loud parity with base metrics)', () => {
    // A malformed temporal code invalidates the whole vector, matching how an invalid base metric
    // (e.g. AV:Z) is handled — a bad vector is rejected, not silently downgraded.
    expect(parseCvssVector(`${BASE}/E:Q`)).toBeNull()
  })
})
