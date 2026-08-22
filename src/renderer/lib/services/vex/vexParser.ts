/**
 * VEX Document Parser (import side)
 *
 * Reads a CycloneDX VEX (Vulnerability Exploitability eXchange) document and
 * extracts its statements so previously-triaged findings can be suppressed
 * (e.g. in CI). Accepts two JSON shapes:
 *
 *   1. This tool's own generated document: `{ statements: [{ vulnerability,
 *      analysis: { status, justification, detail }, affects: string[] }] }`
 *      (see {@link ../vexGenerator}).
 *   2. Standard CycloneDX VEX: `{ vulnerabilities: [{ id, analysis: { state,
 *      justification, detail }, affects: [{ ref }] }] }`.
 *
 * Only CycloneDX VEX (JSON) is supported; CSAF and OpenVEX are out of scope.
 *
 * @module services/vex
 * @see https://cyclonedx.org/capabilities/vex/
 */

import type { Vulnerability } from '@@/types'
import type { VexAnalysisStatus } from './vexGenerator'

/** A single VEX statement, normalized across the accepted input shapes. */
export interface ParsedVexStatement {
  /** Vulnerability identifier (CVE, GHSA, OSV, ...). */
  vulnerability: string
  /** Normalized analysis status. */
  status: VexAnalysisStatus
  /** Raw justification string, if present (informational only). */
  justification?: string
  /** Free-text detail, if present. */
  detail?: string
  /** Component references the statement applies to (bom-refs / purls). */
  affects: string[]
}

/** Result of parsing a VEX document. */
export interface ParsedVex {
  statements: ParsedVexStatement[]
  /** Non-fatal issues (unknown status, skipped entries). */
  warnings: string[]
}

/** Outcome of applying VEX statements to a set of findings. */
export interface VexSuppressionResult {
  /** Findings that were NOT suppressed (feed these to the gate + report). */
  kept: Vulnerability[]
  /** Findings suppressed by a not_affected / resolved statement. */
  suppressed: Array<{ vulnerability: Vulnerability; statement: ParsedVexStatement }>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/**
 * Map a raw status/state to the internal status. Unknown values fall back to
 * `under_investigation` (never suppressed) so a malformed or novel state never
 * silently hides a finding.
 */
function normalizeStatus(raw: string | undefined, vulnId: string, warnings: string[]): VexAnalysisStatus {
  switch (raw?.toLowerCase().trim()) {
    case 'not_affected':
    case 'false_positive':
      return 'not_affected'
    case 'resolved':
    case 'resolved_with_pedigree':
      return 'resolved'
    case 'exploitable':
    case 'affected':
      return 'affected'
    case 'in_triage':
    case 'under_investigation':
      return 'under_investigation'
    default:
      warnings.push(
        `Unrecognized VEX status "${raw ?? '(none)'}" for ${vulnId}; treating as under_investigation (not suppressed)`,
      )
      return 'under_investigation'
  }
}

/** Parse one entry of this tool's own `statements` array. */
function parseNativeStatement(raw: unknown, warnings: string[]): ParsedVexStatement | undefined {
  if (!isRecord(raw)) return undefined
  const vulnerability = asString(raw.vulnerability)
  if (!vulnerability) {
    warnings.push('Skipped a VEX statement with no "vulnerability" id')
    return undefined
  }
  const analysis = isRecord(raw.analysis) ? raw.analysis : {}
  const affects = Array.isArray(raw.affects)
    ? raw.affects.filter((entry): entry is string => typeof entry === 'string')
    : []
  return {
    vulnerability,
    status: normalizeStatus(asString(analysis.status), vulnerability, warnings),
    justification: asString(analysis.justification),
    detail: asString(analysis.detail),
    affects,
  }
}

/** Parse one entry of a standard CycloneDX `vulnerabilities` array. */
function parseCycloneDxVuln(raw: unknown, warnings: string[]): ParsedVexStatement | undefined {
  if (!isRecord(raw)) return undefined
  const vulnerability = asString(raw.id)
  if (!vulnerability) {
    warnings.push('Skipped a CycloneDX vulnerability entry with no "id"')
    return undefined
  }
  const analysis = isRecord(raw.analysis) ? raw.analysis : {}
  const affects: string[] = []
  if (Array.isArray(raw.affects)) {
    for (const entry of raw.affects) {
      const ref = isRecord(entry) ? asString(entry.ref) : undefined
      if (ref) affects.push(ref)
    }
  }
  return {
    // CycloneDX uses "state" (not "status") inside analysis.
    vulnerability,
    status: normalizeStatus(asString(analysis.state), vulnerability, warnings),
    justification: asString(analysis.justification),
    detail: asString(analysis.detail),
    affects,
  }
}

/**
 * Parse a CycloneDX VEX document (JSON string). Throws on input that cannot be
 * a VEX document at all (not JSON, not an object, no statements/vulnerabilities
 * array); collects per-entry problems as `warnings` instead of throwing.
 */
/**
 * Reject CSAF and OpenVEX explicitly instead of half-parsing them.
 *
 * The dispatch below duck-types on the presence of a `statements` or `vulnerabilities` array, and
 * both unsupported formats happen to have one:
 *
 *  - **OpenVEX** has top-level `statements`, but each entry's `vulnerability` is an object rather
 *    than a string, so every entry fell out as a warning.
 *  - **CSAF** has top-level `vulnerabilities`, but entries key the id as `cve`, not `id` — same
 *    outcome.
 *
 * Either way the caller received a successful parse with an EMPTY statement list. In CI (`--vex`)
 * that means the run is green and nothing is suppressed, with no error to notice — the worst shape
 * a failure can take. FR-16.2 requires these to be refused; this is that refusal.
 */
function rejectUnsupportedVexFormat(json: Record<string, unknown>): void {
  // OpenVEX is unambiguous: a JSON-LD @context pointing at the openvex spec.
  const context = json['@context']
  if (typeof context === 'string' && context.toLowerCase().includes('openvex')) {
    throw new Error('OpenVEX documents are not supported — export the triage as CycloneDX VEX instead')
  }

  // CSAF carries a `document` object with a `csaf_version`, and/or a CSAF-shaped vulnerabilities
  // array whose entries use `cve` rather than `id`.
  const doc = json.document
  if (isRecord(doc) && ('csaf_version' in doc || 'category' in doc)) {
    throw new Error('CSAF documents are not supported — export the triage as CycloneDX VEX instead')
  }
  if (Array.isArray(json.vulnerabilities) && json.vulnerabilities.length > 0) {
    const everyEntryIsCsafShaped = json.vulnerabilities.every(
      (entry) => isRecord(entry) && !('id' in entry) && 'cve' in entry,
    )
    if (everyEntryIsCsafShaped) {
      throw new Error('CSAF documents are not supported — export the triage as CycloneDX VEX instead')
    }
  }

  // OpenVEX without an @context: `statements` present, but no entry carries a string vulnerability
  // id, which is the shape this parser requires.
  if (Array.isArray(json.statements) && json.statements.length > 0) {
    const noEntryHasStringVulnerability = json.statements.every(
      (entry) => isRecord(entry) && typeof entry.vulnerability !== 'string',
    )
    if (noEntryHasStringVulnerability) {
      throw new Error(
        'VEX document has no statement with a string "vulnerability" id — if this is OpenVEX, ' +
          'it is not supported; export the triage as CycloneDX VEX instead',
      )
    }
  }
}

export function parseVexDocument(content: string): ParsedVex {
  let json: unknown
  try {
    json = JSON.parse(content)
  } catch {
    throw new Error('VEX document is not valid JSON')
  }
  if (!isRecord(json)) {
    throw new Error('VEX document must be a JSON object')
  }

  rejectUnsupportedVexFormat(json)

  const warnings: string[] = []
  const statements: ParsedVexStatement[] = []

  if (Array.isArray(json.statements)) {
    for (const raw of json.statements) {
      const statement = parseNativeStatement(raw, warnings)
      if (statement) statements.push(statement)
    }
    return { statements, warnings }
  }

  if (Array.isArray(json.vulnerabilities)) {
    for (const raw of json.vulnerabilities) {
      const statement = parseCycloneDxVuln(raw, warnings)
      if (statement) statements.push(statement)
    }
    return { statements, warnings }
  }

  throw new Error('VEX document has neither a "statements" nor a "vulnerabilities" array')
}

/** Strip a `urn:cdx:` prefix and lowercase, so refs compare consistently. */
function normalizeRef(ref: string): string {
  return ref
    .replace(/^urn:cdx:/i, '')
    .toLowerCase()
    .trim()
}

/** A statement's vulnerability id matches a finding by id or alias (case-insensitive). */
function idMatches(statementVuln: string, vuln: Vulnerability): boolean {
  const target = statementVuln.toLowerCase()
  if (vuln.id.toLowerCase() === target) return true
  return (vuln.aliases ?? []).some((alias) => alias.toLowerCase() === target)
}

/**
 * A statement applies to a finding's components when it lists no `affects`
 * (document-wide) or one of its refs matches one of the finding's affected
 * components. When refs are present but none match, the statement does NOT
 * apply — suppression fails safe (toward keeping the finding).
 */
function affectsMatch(affects: string[], vuln: Vulnerability): boolean {
  if (affects.length === 0) return true
  const components = (vuln.affectedComponents ?? []).map(normalizeRef)
  if (components.length === 0) return false
  return affects.map(normalizeRef).some((ref) => components.includes(ref))
}

/**
 * Apply VEX statements to a set of findings. A finding is suppressed when a
 * statement with status `not_affected` or `resolved` matches it by id/alias and
 * (when scoped) by component. `affected` / `under_investigation` statements
 * never suppress.
 */
export function applyVexSuppression(vulns: Vulnerability[], statements: ParsedVexStatement[]): VexSuppressionResult {
  const suppressing = statements.filter((s) => s.status === 'not_affected' || s.status === 'resolved')

  const kept: Vulnerability[] = []
  const suppressed: VexSuppressionResult['suppressed'] = []

  for (const vuln of vulns) {
    const match = suppressing.find((s) => idMatches(s.vulnerability, vuln) && affectsMatch(s.affects, vuln))
    if (match) {
      suppressed.push({ vulnerability: vuln, statement: match })
    } else {
      kept.push(vuln)
    }
  }

  return { kept, suppressed }
}
