import { describe, it, expect } from 'vitest'
import { categorizeSpdxId, assessLicenseExpression, scanComponentLicenses, createDefaultLicensePolicy } from './licenseScanner'
import type { LicensePolicy } from './types'

describe('categorizeSpdxId', () => {
  it('classifies MIT as permissive', () => {
    expect(categorizeSpdxId('MIT')).toBe('permissive')
  })

  it('classifies Apache-2.0 as permissive', () => {
    expect(categorizeSpdxId('Apache-2.0')).toBe('permissive')
  })

  it('classifies GPL-3.0-only as strong-copyleft', () => {
    expect(categorizeSpdxId('GPL-3.0-only')).toBe('strong-copyleft')
  })

  it('classifies AGPL-3.0-only as network-copyleft', () => {
    expect(categorizeSpdxId('AGPL-3.0-only')).toBe('network-copyleft')
  })

  it('classifies LGPL-2.1-or-later as weak-copyleft', () => {
    expect(categorizeSpdxId('LGPL-2.1-or-later')).toBe('weak-copyleft')
  })

  it('classifies CC0-1.0 as public-domain', () => {
    expect(categorizeSpdxId('CC0-1.0')).toBe('public-domain')
  })

  it('matches SPDX ids case-insensitively', () => {
    expect(categorizeSpdxId('mit')).toBe('permissive')
    expect(categorizeSpdxId('apache-2.0')).toBe('permissive')
  })

  it('returns unknown for unrecognized ids', () => {
    expect(categorizeSpdxId('Totally-Made-Up-1.0')).toBe('unknown')
  })
})

describe('assessLicenseExpression', () => {
  const policy = createDefaultLicensePolicy()

  it('allows a single permissive license', () => {
    const result = assessLicenseExpression('MIT', policy)
    expect(result.category).toBe('permissive')
    expect(result.verdict).toBe('allowed')
    expect(result.spdxIds).toEqual(['MIT'])
  })

  it('flags a strong-copyleft license for review by default', () => {
    const result = assessLicenseExpression('GPL-3.0-only', policy)
    expect(result.category).toBe('strong-copyleft')
    expect(result.verdict).toBe('review')
  })

  it('treats an OR expression as the least restrictive option', () => {
    // You may comply under MIT, so the effective risk is permissive.
    const result = assessLicenseExpression('GPL-2.0-only OR MIT', policy)
    expect(result.category).toBe('permissive')
    expect(result.verdict).toBe('allowed')
    expect(result.spdxIds).toContain('MIT')
    expect(result.spdxIds).toContain('GPL-2.0-only')
  })

  it('treats an AND expression as the most restrictive option', () => {
    // All obligations apply, so the effective risk is strong-copyleft.
    const result = assessLicenseExpression('MIT AND GPL-3.0-only', policy)
    expect(result.category).toBe('strong-copyleft')
    expect(result.verdict).toBe('review')
  })

  it('ignores WITH exceptions and categorizes the base license', () => {
    const result = assessLicenseExpression('GPL-2.0-or-later WITH Classpath-exception-2.0', policy)
    expect(result.category).toBe('strong-copyleft')
    expect(result.spdxIds).toEqual(['GPL-2.0-or-later'])
  })

  it('marks unrecognized free-text licenses as unknown/review', () => {
    const result = assessLicenseExpression('My Custom Corporate License', policy)
    expect(result.category).toBe('unknown')
    expect(result.verdict).toBe('review')
  })

  it('marks an empty license string as unknown/review', () => {
    const result = assessLicenseExpression('', policy)
    expect(result.category).toBe('unknown')
    expect(result.verdict).toBe('review')
  })
})

describe('assessLicenseExpression with policy overrides', () => {
  it('denies a license on the deny list regardless of category', () => {
    const policy: LicensePolicy = { ...createDefaultLicensePolicy(), deniedLicenses: ['AGPL-3.0-only'] }
    const result = assessLicenseExpression('AGPL-3.0-only', policy)
    expect(result.verdict).toBe('denied')
  })

  it('allows a license on the allow list even if its category would be reviewed', () => {
    const policy: LicensePolicy = { ...createDefaultLicensePolicy(), allowedLicenses: ['GPL-3.0-only'] }
    const result = assessLicenseExpression('GPL-3.0-only', policy)
    expect(result.verdict).toBe('allowed')
  })

  it('lets the deny list win when a license is on both lists', () => {
    const policy: LicensePolicy = {
      ...createDefaultLicensePolicy(),
      allowedLicenses: ['GPL-3.0-only'],
      deniedLicenses: ['GPL-3.0-only'],
    }
    expect(assessLicenseExpression('GPL-3.0-only', policy).verdict).toBe('denied')
  })
})

describe('scanComponentLicenses', () => {
  const policy = createDefaultLicensePolicy()

  it('produces one finding per component with the worst verdict across its licenses', () => {
    const result = scanComponentLicenses(
      [
        { id: 'a', name: 'lib-a', version: '1.0.0', licenses: ['MIT'] },
        { id: 'b', name: 'lib-b', version: '2.0.0', licenses: ['MIT', 'GPL-3.0-only'] },
      ],
      policy,
    )

    expect(result.findings).toHaveLength(2)
    const libB = result.findings.find((f) => f.componentId === 'b')
    expect(libB?.assessments).toHaveLength(2)
    expect(libB?.worstVerdict).toBe('review')
  })

  it('flags components with no declared license', () => {
    const result = scanComponentLicenses([{ id: 'c', name: 'lib-c', version: '1.0.0', licenses: [] }], policy)

    expect(result.summary.componentsWithoutLicense).toBe(1)
    expect(result.findings[0].worstVerdict).toBe('review')
    expect(result.findings[0].assessments[0].category).toBe('unknown')
  })

  it('summarizes component verdicts and assessment categories', () => {
    const result = scanComponentLicenses(
      [
        { id: 'a', name: 'lib-a', version: '1.0.0', licenses: ['MIT'] },
        { id: 'b', name: 'lib-b', version: '2.0.0', licenses: ['AGPL-3.0-only'] },
        { id: 'd', name: 'lib-d', version: '3.0.0', licenses: ['Apache-2.0'] },
      ],
      { ...policy, deniedLicenses: ['AGPL-3.0-only'] },
    )

    expect(result.summary.totalComponents).toBe(3)
    expect(result.summary.byVerdict.allowed).toBe(2)
    expect(result.summary.byVerdict.denied).toBe(1)
    expect(result.summary.byCategory.permissive).toBe(2)
    expect(result.summary.byCategory['network-copyleft']).toBe(1)
  })
})
