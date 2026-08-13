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

  it('falls back to version 3.1 when the minor-version digit is not 0 or 1', () => {
    // WHY: the version regex only captures '0' or '1'. A vector claiming an unrecognized
    // 3.x minor version (e.g. "3.2") must still parse (startsWith('CVSS:3.') passed) and
    // default to '3.1' rather than leaving `version` undefined or throwing.
    const result = parseCvssVector('CVSS:3.2/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H')
    expect(result).not.toBeNull()
    expect(result?.version).toBe('3.1')
  })

  it('returns null when a 9-segment vector substitutes an unknown prefix for a required metric', () => {
    // WHY: the length check (parts.length < 9) only guards segment COUNT, not which
    // metrics are present. A 9-segment vector missing e.g. the Availability metric
    // (replaced by a bogus "XX:H" segment) must still fail loudly via the per-metric
    // "Missing metric" throw, not silently produce a breakdown with a bad field.
    expect(parseCvssVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/XX:H')).toBeNull()
  })

  it('scores an all-None impact vector as 0 (impact sub-score <= 0 short-circuits exploitability)', () => {
    // WHY: when C/I/A are all None, the impact sub-score is 0, and the spec defines the
    // base score as 0 regardless of exploitability -- this guards that short-circuit
    // branch, distinct from the normal "impact + exploitability" formula paths below.
    const result = parseCvssVector('CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N')
    expect(result?.scores.baseScore).toBe(0)
    expect(result?.severity).toBe('none')
  })

  it('computes the reference score for AV:Physical/AC:High/PR:High/Low-impact metrics (Unchanged scope)', () => {
    // WHY: exercises the branches otherwise untouched by the two "real-world" vectors above --
    // Physical attack vector, High attack complexity, High privileges required under an
    // Unchanged scope, and Low confidentiality/integrity/availability impact.
    const result = parseCvssVector('CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:L/A:L')
    expect(result?.metrics).toEqual({
      attackVector: 'Physical',
      attackComplexity: 'High',
      privilegesRequired: 'High',
      userInteraction: 'Required',
      scope: 'Unchanged',
      confidentialityImpact: 'Low',
      integrityImpact: 'Low',
      availabilityImpact: 'Low',
    })
    expect(result?.scores.baseScore).toBe(3.5)
    expect(result?.severity).toBe('low')
  })

  it('computes the reference score for AV:Adjacent/PR:Low (Unchanged scope) with mixed None/High impact', () => {
    // WHY: covers the Adjacent attack-vector branch and the Low-privileges-required-under-
    // Unchanged-scope branch, neither exercised by the other fixtures in this file.
    const result = parseCvssVector('CVSS:3.1/AV:A/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H')
    expect(result?.metrics.attackVector).toBe('Adjacent')
    expect(result?.metrics.privilegesRequired).toBe('Low')
    expect(result?.scores.baseScore).toBe(5.7)
    expect(result?.severity).toBe('medium')
  })

  it('computes the reference score for AV:Local/PR:High under Changed scope', () => {
    // WHY: PR:High is valued differently depending on scope (0.5 when Changed vs. 0.27 when
    // Unchanged) -- this covers that Changed-scope branch, plus the Local attack-vector branch.
    const result = parseCvssVector('CVSS:3.1/AV:L/AC:H/PR:H/UI:R/S:C/C:H/I:N/A:L')
    expect(result?.metrics.attackVector).toBe('Local')
    expect(result?.metrics.scope).toBe('Changed')
    expect(result?.scores.baseScore).toBe(5.8)
    expect(result?.severity).toBe('medium')
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
