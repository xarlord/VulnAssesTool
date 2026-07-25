import { describe, it, expect } from 'vitest'
import type { Vulnerability } from '@@/types'
import { hasAvailablePatch, isExploitedVuln } from './helpers'

function makeVuln(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: 'CVE-2024-0001',
    source: 'nvd',
    severity: 'high',
    description: 'test vuln',
    references: [],
    affectedComponents: ['comp-1'],
    ...overrides,
  }
}

describe('hasAvailablePatch', () => {
  // FR-08.3 requires a patch-availability filter that hides unpatched vulns. If this predicate
  // treated any patchInfo as "patched" it would hide vulns that are merely under investigation.
  it('returns true when patchInfo.patchAvailability is "available"', () => {
    expect(hasAvailablePatch(makeVuln({ patchInfo: { patchAvailability: 'available' } }))).toBe(true)
  })

  it('returns true when patchedVersions has at least one entry, even without patchInfo', () => {
    expect(hasAvailablePatch(makeVuln({ patchedVersions: ['1.2.3'] }))).toBe(true)
  })

  it.each(['partial', 'upstream', 'investigating', 'none'] as const)(
    'returns false for patchAvailability "%s" — not a usable fix yet',
    (status) => {
      expect(hasAvailablePatch(makeVuln({ patchInfo: { patchAvailability: status } }))).toBe(false)
    },
  )

  it('returns false when there is no patchInfo and no patchedVersions', () => {
    expect(hasAvailablePatch(makeVuln())).toBe(false)
  })

  it('returns false when patchedVersions is present but empty', () => {
    expect(hasAvailablePatch(makeVuln({ patchedVersions: [] }))).toBe(false)
  })
})

describe('isExploitedVuln', () => {
  // FR-08.3's exploit-status filter must key off the CISA KEV catalog / exploitStatus fields —
  // not an incidental "exploit" reference tag — so "Exploited" only ever surfaces known-exploited
  // vulnerabilities.
  it('returns true when isKev is true', () => {
    expect(isExploitedVuln(makeVuln({ isKev: true }))).toBe(true)
  })

  it('returns true when exploitStatus is "exploited"', () => {
    expect(isExploitedVuln(makeVuln({ exploitStatus: 'exploited' }))).toBe(true)
  })

  it('returns false when exploitStatus is "publicly-disclosed" and isKev is not set', () => {
    expect(isExploitedVuln(makeVuln({ exploitStatus: 'publicly-disclosed' }))).toBe(false)
  })

  it('returns false when isKev is false and exploitStatus is unset', () => {
    expect(isExploitedVuln(makeVuln({ isKev: false }))).toBe(false)
  })

  it('returns false for a vuln with no exploit signals at all', () => {
    expect(isExploitedVuln(makeVuln())).toBe(false)
  })
})
