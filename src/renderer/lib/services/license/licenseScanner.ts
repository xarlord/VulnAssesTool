import { lookupSpdxCategory } from './licenseCatalog'
import type {
  LicenseCategory,
  LicensePolicy,
  LicenseVerdict,
  LicenseAssessment,
  ComponentLicenseFinding,
  LicenseScanInput,
  LicenseScanResult,
  LicenseScanSummary,
} from './types'

/** Severity ranking used to combine multi-license expressions. */
const SEVERITY: Record<Exclude<LicenseCategory, 'unknown'>, number> = {
  'public-domain': 0,
  permissive: 1,
  'weak-copyleft': 2,
  'strong-copyleft': 3,
  'network-copyleft': 4,
  proprietary: 5,
}

const VERDICT_RANK: Record<LicenseVerdict, number> = { allowed: 0, review: 1, denied: 2 }

/** A sensible default: permissive/public-domain pass; everything else is flagged for review. */
export function createDefaultLicensePolicy(): LicensePolicy {
  return {
    allowedLicenses: [],
    deniedLicenses: [],
    categoryVerdicts: {
      'public-domain': 'allowed',
      permissive: 'allowed',
      'weak-copyleft': 'review',
      'strong-copyleft': 'review',
      'network-copyleft': 'review',
      proprietary: 'review',
      unknown: 'review',
    },
  }
}

/** Classify a single SPDX id; 'unknown' if it is not in the offline catalog. */
export function categorizeSpdxId(id: string): LicenseCategory {
  return lookupSpdxCategory(id) ?? 'unknown'
}

/** Return the base license id without any `WITH <exception>` suffix. */
function stripException(atom: string): string {
  const idx = atom.toLowerCase().indexOf(' with ')
  return (idx >= 0 ? atom.slice(0, idx) : atom).trim()
}

/** Parse an SPDX expression into base license ids plus the top-level operator. */
function parseExpression(raw: string): { ids: string[]; operator: 'OR' | 'AND' | 'SINGLE' } {
  const cleaned = raw.replace(/[()]/g, ' ').trim()
  if (!cleaned) return { ids: [], operator: 'SINGLE' }

  // Match only whitespace-delimited operators so ids like `GPL-2.0-or-later`
  // (which contain the substring "or") are not mistaken for an expression.
  if (/\s+or\s+/i.test(cleaned)) {
    return { ids: cleaned.split(/\s+or\s+/i).map(stripException).filter(Boolean), operator: 'OR' }
  }
  if (/\s+and\s+/i.test(cleaned)) {
    return { ids: cleaned.split(/\s+and\s+/i).map(stripException).filter(Boolean), operator: 'AND' }
  }
  return { ids: [stripException(cleaned)], operator: 'SINGLE' }
}

/**
 * Combine the categories of an expression's atoms:
 * OR = least restrictive (you may choose the most permissive option),
 * AND/SINGLE = most restrictive (all obligations apply). Unrecognized atoms are
 * ignored when a recognized one exists; all-unknown yields 'unknown'.
 */
function combineCategories(ids: string[], operator: 'OR' | 'AND' | 'SINGLE'): LicenseCategory {
  const known = ids
    .map(categorizeSpdxId)
    .filter((category): category is Exclude<LicenseCategory, 'unknown'> => category !== 'unknown')

  if (known.length === 0) return 'unknown'

  const target = operator === 'OR' ? Math.min(...known.map((c) => SEVERITY[c])) : Math.max(...known.map((c) => SEVERITY[c]))
  const match = (Object.keys(SEVERITY) as Array<Exclude<LicenseCategory, 'unknown'>>).find((c) => SEVERITY[c] === target)
  return match ?? 'unknown'
}

function decideVerdict(
  ids: string[],
  category: LicenseCategory,
  policy: LicensePolicy,
): { verdict: LicenseVerdict; reason: string } {
  const denied = policy.deniedLicenses.map((s) => s.toLowerCase())
  const allowed = policy.allowedLicenses.map((s) => s.toLowerCase())

  // Deny wins over allow: any denied license in the expression flags the component.
  const deniedHit = ids.find((id) => denied.includes(id.toLowerCase()))
  if (deniedHit) return { verdict: 'denied', reason: `License '${deniedHit}' is on the deny list` }

  const allowedHit = ids.find((id) => allowed.includes(id.toLowerCase()))
  if (allowedHit) return { verdict: 'allowed', reason: `License '${allowedHit}' is on the allow list` }

  return {
    verdict: policy.categoryVerdicts[category],
    reason:
      category === 'unknown' ? 'No recognized SPDX license — manual review needed' : `Recognized as ${category}`,
  }
}

/** Assess one raw license string against a policy. */
export function assessLicenseExpression(raw: string, policy: LicensePolicy): LicenseAssessment {
  const { ids, operator } = parseExpression(raw)

  if (ids.length === 0) {
    return { raw, spdxIds: [], category: 'unknown', verdict: policy.categoryVerdicts.unknown, reason: 'No license declared' }
  }

  const category = combineCategories(ids, operator)
  const { verdict, reason } = decideVerdict(ids, category, policy)
  return { raw, spdxIds: ids, category, verdict, reason }
}

function emptyByVerdict(): Record<LicenseVerdict, number> {
  return { allowed: 0, review: 0, denied: 0 }
}

function emptyByCategory(): Record<LicenseCategory, number> {
  return {
    'public-domain': 0,
    permissive: 0,
    'weak-copyleft': 0,
    'strong-copyleft': 0,
    'network-copyleft': 0,
    proprietary: 0,
    unknown: 0,
  }
}

/** Scan a set of components against a license policy, returning findings + a summary. */
export function scanComponentLicenses(
  components: ReadonlyArray<LicenseScanInput>,
  policy: LicensePolicy,
): LicenseScanResult {
  const summary: LicenseScanSummary = {
    totalComponents: components.length,
    componentsWithoutLicense: 0,
    byVerdict: emptyByVerdict(),
    byCategory: emptyByCategory(),
  }

  const findings: ComponentLicenseFinding[] = components.map((component) => {
    const declared = component.licenses.filter((license) => license.trim().length > 0)

    let assessments: LicenseAssessment[]
    if (declared.length === 0) {
      summary.componentsWithoutLicense++
      assessments = [
        {
          raw: '',
          spdxIds: [],
          category: 'unknown',
          verdict: policy.categoryVerdicts.unknown,
          reason: 'No license declared',
        },
      ]
    } else {
      assessments = declared.map((license) => assessLicenseExpression(license, policy))
    }

    for (const assessment of assessments) summary.byCategory[assessment.category]++

    const worstVerdict = assessments.reduce<LicenseVerdict>(
      (worst, assessment) => (VERDICT_RANK[assessment.verdict] > VERDICT_RANK[worst] ? assessment.verdict : worst),
      'allowed',
    )
    summary.byVerdict[worstVerdict]++

    return {
      componentId: component.id,
      componentName: component.name,
      componentVersion: component.version,
      assessments,
      worstVerdict,
    }
  })

  return { findings, summary }
}
