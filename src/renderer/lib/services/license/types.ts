/**
 * Offline license-compliance types.
 *
 * A component's `licenses: string[]` (from SBOM parsing) holds SPDX ids,
 * SPDX expressions (`"MIT OR Apache-2.0"`), or free-text names. The scanner
 * classifies each into a risk category and applies an org policy — all offline.
 */

export type LicenseCategory =
  | 'public-domain'
  | 'permissive'
  | 'weak-copyleft'
  | 'strong-copyleft'
  | 'network-copyleft'
  | 'proprietary'
  | 'unknown'

export type LicenseVerdict = 'allowed' | 'review' | 'denied'

export interface LicensePolicy {
  /** SPDX ids explicitly allowed (overrides category rules). */
  allowedLicenses: string[]
  /** SPDX ids explicitly denied (overrides everything → 'denied'). */
  deniedLicenses: string[]
  /** Verdict for each risk category unless overridden by the allow/deny lists. */
  categoryVerdicts: Record<LicenseCategory, LicenseVerdict>
}

export interface LicenseAssessment {
  /** Raw license string as declared on the component. */
  raw: string
  /** Base SPDX ids parsed from the expression (WITH-exceptions stripped). */
  spdxIds: string[]
  /** Effective risk category for the whole expression. */
  category: LicenseCategory
  verdict: LicenseVerdict
  reason: string
}

export interface ComponentLicenseFinding {
  componentId: string
  componentName: string
  componentVersion: string
  assessments: LicenseAssessment[]
  /** Worst verdict across the component's licenses (denied > review > allowed). */
  worstVerdict: LicenseVerdict
}

export interface LicenseScanSummary {
  totalComponents: number
  componentsWithoutLicense: number
  /** Component counts keyed by worst verdict. */
  byVerdict: Record<LicenseVerdict, number>
  /** Assessment counts keyed by category. */
  byCategory: Record<LicenseCategory, number>
}

export interface LicenseScanResult {
  findings: ComponentLicenseFinding[]
  summary: LicenseScanSummary
}

/** Minimal component shape the scanner needs (subset of the domain `Component`). */
export interface LicenseScanInput {
  id: string
  name: string
  version: string
  licenses: string[]
}
