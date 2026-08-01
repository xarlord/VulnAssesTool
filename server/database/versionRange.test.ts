/**
 * Unit tests for NVD version-range matching (FR-03.1).
 *
 * NVD applicability data commonly expresses "vulnerable" as a version RANGE
 * (cpe23_uri version='*' plus version_start/end bound columns) rather than a
 * literal version. These helpers decide whether a concrete component version
 * falls inside such a range — the logic searchCVEsByCPE relies on to catch
 * in-range-but-not-literally-listed versions.
 *
 * Version comparison is deliberately best-effort (numeric-segment-aware), not a
 * full semver implementation — see compareVersions' contract.
 */

import { describe, it, expect } from 'vitest'
import { compareVersions, isVersionInRange } from './versionRange.js'

describe('compareVersions', () => {
  it('orders versions by numeric segment value, not lexically', () => {
    // Lexical comparison would wrongly rank '1.9' above '1.10'.
    expect(compareVersions('1.10', '1.9')).toBeGreaterThan(0)
    expect(compareVersions('1.9', '1.10')).toBeLessThan(0)
  })

  it('treats missing trailing segments as zero', () => {
    expect(compareVersions('2.0', '2.0.0')).toBe(0)
    expect(compareVersions('2.0.1', '2.0')).toBeGreaterThan(0)
  })

  it('returns 0 for identical versions', () => {
    expect(compareVersions('2.14.1', '2.14.1')).toBe(0)
  })

  it('orders a strictly-lower version below a higher one', () => {
    expect(compareVersions('2.14.1', '2.15.0')).toBeLessThan(0)
    expect(compareVersions('2.15.0', '2.14.1')).toBeGreaterThan(0)
  })
})

describe('isVersionInRange', () => {
  it('treats a range with no bounds as always-in-range (NVD "always vulnerable")', () => {
    expect(isVersionInRange('9.9.9', {})).toBe(true)
  })

  it('includes a version equal to versionStartIncluding (inclusive lower bound)', () => {
    expect(isVersionInRange('2.0', { versionStartIncluding: '2.0' })).toBe(true)
  })

  it('excludes a version equal to versionStartExcluding (exclusive lower bound)', () => {
    expect(isVersionInRange('2.0', { versionStartExcluding: '2.0' })).toBe(false)
    expect(isVersionInRange('2.0.1', { versionStartExcluding: '2.0' })).toBe(true)
  })

  it('includes a version equal to versionEndIncluding (inclusive upper bound)', () => {
    expect(isVersionInRange('2.15.0', { versionEndIncluding: '2.15.0' })).toBe(true)
  })

  it('excludes a version equal to versionEndExcluding (exclusive upper bound)', () => {
    // This is the log4j-shaped case: [2.0, 2.15.0) must NOT include 2.15.0.
    expect(isVersionInRange('2.15.0', { versionEndExcluding: '2.15.0' })).toBe(false)
    expect(isVersionInRange('2.14.1', { versionEndExcluding: '2.15.0' })).toBe(true)
  })

  it('includes a version strictly inside a two-sided range', () => {
    expect(isVersionInRange('2.14.1', { versionStartIncluding: '2.0', versionEndExcluding: '2.15.0' })).toBe(true)
  })

  it('excludes a version below the lower bound', () => {
    expect(isVersionInRange('1.9.0', { versionStartIncluding: '2.0', versionEndExcluding: '2.15.0' })).toBe(false)
  })

  it('excludes a version at or above the exclusive upper bound', () => {
    expect(isVersionInRange('2.15.0', { versionStartIncluding: '2.0', versionEndExcluding: '2.15.0' })).toBe(false)
  })
})
