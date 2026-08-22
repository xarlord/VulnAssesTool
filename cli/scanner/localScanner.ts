/**
 * CLI Local Scanner
 *
 * A real, headless (no Express server, no browser) vulnerability scanner for the
 * CLI. It reuses the server's better-sqlite3 NVD layer (server/database/nvdDb.ts)
 * as the single source of truth for component -> CVE matching, mirroring the
 * CPE-first ladder the app applies in src/renderer/lib/api/vulnMatcher.ts.
 *
 * This replaces the empty getHybridScanner() stub for CLI use via dependency
 * injection into scanCommand() — the stub stays in place for the browser build
 * and for tests.
 */

import * as fs from 'fs'
import type { Vulnerability, VulnerabilityReference, PatchInfo, MatchConfidence } from '../../src/shared/types.js'
import type {
  ScannerInstance,
  ScanComponentResult,
  ScannerStatistics,
} from '../../src/renderer/lib/database/hybridScanner.js'
import type { CVEWithDetails } from '../../server/database/types.js'
import { NvdDatabase } from '../../server/database/nvdDb.js'
import { config, initializePaths } from '../../server/config.js'
import { suggestCPEs } from '../../src/renderer/lib/utils/cpeUtils.js'

/** Max CVE rows to pull per search term. Mirrors the app's coarse product match. */
const SEARCH_LIMIT = 200

/** Tokens too short or too generic to search on their own (would over-match). */
const STOP_TOKENS = new Set(['core', 'api', 'lib', 'js', 'io', 'net', 'org', 'com', 'the'])

/** Raised when the NVD database is missing so the CLI can exit with a clear message. */
export class DatabaseUnavailableError extends Error {
  constructor(
    public readonly dbPath: string,
    message: string,
  ) {
    super(message)
    this.name = 'DatabaseUnavailableError'
  }
}

/** Resolve the NVD DB path: explicit override, else the app's canonical config path. */
function resolveDbPath(explicit?: string): string {
  if (explicit) return explicit
  if (!config.DB_PATH) initializePaths()
  return config.DB_PATH
}

/** CVSS base score -> severity band (matches getSeverityFromScore in the app). */
function severityFromScore(score: number | undefined): Vulnerability['severity'] {
  if (score === undefined || score <= 0) return 'none'
  if (score >= 9.0) return 'critical'
  if (score >= 7.0) return 'high'
  if (score >= 4.0) return 'medium'
  return 'low'
}

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium', 'low', 'none'])

function toSeverity(stored: string | undefined, score: number | undefined): Vulnerability['severity'] {
  const lowered = stored?.toLowerCase()
  if (lowered && VALID_SEVERITIES.has(lowered)) return lowered as Vulnerability['severity']
  return severityFromScore(score)
}

/** Parse a component identifier into a package name + version. */
export function parseComponentId(identifier: string): { name: string; version: string } {
  // purl: pkg:type/namespace/name@version?qualifiers#subpath
  // The version follows the '@' inside the LAST path segment, so a scoped npm
  // namespace ('.../@angular/core@1.2.3') is not mistaken for the version.
  if (identifier.startsWith('pkg:')) {
    const body = identifier.slice(4).split('#')[0].split('?')[0]
    const lastSlash = body.lastIndexOf('/')
    const tail = lastSlash >= 0 ? body.slice(lastSlash + 1) : body
    const at = tail.indexOf('@')
    const name = at >= 0 ? tail.slice(0, at) : tail
    const version = at >= 0 ? tail.slice(at + 1) : ''
    return { name, version }
  }
  // name@version (last @ separates version; scoped npm names keep their leading @)
  const at = identifier.lastIndexOf('@')
  if (at > 0) {
    return { name: identifier.slice(0, at), version: identifier.slice(at + 1) }
  }
  return { name: identifier, version: '' }
}

/**
 * Lowercase + strip CPE wildcards (*) so a term is specific for searchCVEsByCPE. A wildcard-only
 * term collapses to '' (dropped) rather than matching every CVE.
 *
 * This deliberately does NOT touch LIKE metacharacters. It used to delete `% _ \` as well, which
 * looked like SQL hygiene but was destroying real queries: the DB layer already escapes them
 * properly (`escapeLikePattern` + `ESCAPE '\'` in nvdDb/cpeSearch), so this was a second,
 * lossy layer on top of a correct one. Underscores are pervasive in NVD product names —
 * `spring_framework`, `commons_text`, `windows_10` — and 68.7% of the 161,533 distinct
 * `cpe_product` values in a real catalog contain one. Deleting them turned
 * `apache:commons_text` (1 hit, Text4Shell) into `apache:commonstext` (0 hits) and
 * `vmware:spring_framework` (43 hits) into `vmware:springframework` (0). Measured, not guessed —
 * see docs/reports/live-scan-defects (2026-08-22).
 */
function sanitizeTerm(term: string | undefined): string {
  if (!term) return ''
  return term.toLowerCase().replace(/\*/g, '').trim()
}

/** Split a package name into meaningful search tokens. */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3 && !STOP_TOKENS.has(t))
}

/**
 * A search tier: the terms to try, plus how confident a match from this tier is. A vendor:product
 * term is scoped enough to count as cpe-estimated; a bare product/name/token term is name-only
 * (the dominant noise source), matching the GUI's confidence vocabulary in vulnMatcher.ts.
 */
export interface SearchTier {
  terms: string[]
  confidence: MatchConfidence
}

/**
 * Build ordered search tiers for a component identifier, mirroring vulnMatcher's
 * ladder: explicit CPE -> suggested CPE vendor:product -> full name -> longest token.
 * Each tier is returned separately so scanning can stop at the first tier that hits.
 */
export function deriveSearchTiers(identifier: string, declaredCpe?: string): SearchTier[] {
  // A CPE the SBOM actually declares is the most authoritative identifier available — it is the
  // very key NVD indexes on — so its tiers go first, ahead of anything inferred from the purl.
  // Previously the caller passed `component.purl ?? component.cpe`, so a declared CPE was used
  // only when no purl existed, which for CycloneDX means essentially never. Measured cost of that
  // on struts2-core 2.5.10: 1 finding / 0 KEV / CVE-2017-5638 missed via the purl, against
  // 91 findings / 8 KEV / found via the declared CPE.
  if (declaredCpe && declaredCpe.startsWith('cpe:') && !identifier.startsWith('cpe:')) {
    return [...deriveSearchTiers(declaredCpe), ...deriveSearchTiers(identifier)]
  }

  if (identifier.startsWith('cpe:')) {
    // cpe:2.3:part:vendor:product:version:...
    const parts = identifier.split(':')
    const vendor = sanitizeTerm(parts[3])
    const product = sanitizeTerm(parts[4])
    const tiers: SearchTier[] = []
    // Specific tier first; the broad bare-product term is a lower tier reached
    // only if vendor:product finds nothing (avoids cross-vendor over-matching).
    if (vendor && product) tiers.push({ terms: [`${vendor}:${product}`], confidence: 'cpe-estimated' })
    if (product) tiers.push({ terms: [product], confidence: 'name-only' })
    return tiers
  }

  const { name, version } = parseComponentId(identifier)
  const tiers: SearchTier[] = []

  const cpeTerms = suggestCPEs(name, version || '0')
    .filter((s) => s.confidence !== 'low')
    .map((s) => sanitizeTerm(`${s.vendor}:${s.product}`))
    .filter(Boolean)
  if (cpeTerms.length) tiers.push({ terms: Array.from(new Set(cpeTerms)), confidence: 'cpe-estimated' })

  const fullName = sanitizeTerm(name)
  if (fullName) tiers.push({ terms: [fullName], confidence: 'name-only' })

  const tokens = nameTokens(name)
  if (tokens.length) {
    const longest = tokens.reduce((a, b) => (b.length > a.length ? b : a))
    if (longest !== fullName) tiers.push({ terms: [longest], confidence: 'name-only' })
  }

  return tiers
}

export interface CveMeta {
  isKev: boolean
  epssScore?: number
  epssPercentile?: number
}

/** cwes + references enrichment for a CVE (as returned by getCveListDetails). */
export interface CveDetail {
  cwes: string[]
  references: Array<{ url: string; source?: string; tags?: string[] }>
}

/**
 * Local scanner backed directly by the NVD SQLite database via better-sqlite3.
 * Implements ScannerInstance so it can be injected into scanCommand().
 */
export class LocalScanner implements ScannerInstance {
  private readonly db: NvdDatabase
  private ready = false

  constructor(private readonly dbPath: string) {
    this.db = new NvdDatabase(dbPath)
  }

  /** The resolved NVD database path this scanner opens. */
  getDbPath(): string {
    return this.dbPath
  }

  /** Open the DB. Fails loudly if the file is absent (rather than creating an empty one). */
  async initialize(): Promise<void> {
    if (this.ready) return
    if (!fs.existsSync(this.dbPath)) {
      throw new DatabaseUnavailableError(
        this.dbPath,
        `NVD database not found at ${this.dbPath}. Run a database sync first (start the app or set --db to a synced nvd-data.db).`,
      )
    }
    await this.db.initialize()
    // Mark ready as soon as the handle is open so close() always releases it,
    // even if the emptiness check below throws.
    this.ready = true
    if (this.db.getTotalCVECount() === 0) {
      throw new DatabaseUnavailableError(
        this.dbPath,
        `NVD database at ${this.dbPath} is empty. Sync CVE data before scanning.`,
      )
    }
    this.warnIfVersionBlind()
  }

  /**
   * Warn when the catalog carries no CPE version bounds at all.
   *
   * A `cpe:2.3:a:apache:log4j:*` row is only meaningful alongside its
   * versionStartIncluding/versionEndExcluding; without them it reads as "every version of log4j".
   * A real 3,017,128-row catalog was measured with **zero** rows carrying any bound, which is why
   * a patched log4j 2.17.2 came back flagged for Log4Shell and OpenSSL 3.0.0 for 2003-era CVEs.
   * The range matcher (`isVersionInRange`) is correct and simply has nothing to work with.
   *
   * Root cause is fixed in nvdDataImporter (it read the API 1.0 field name), but existing
   * databases stay version-blind until re-imported — so say so rather than presenting unfiltered
   * results as if they were filtered.
   */
  private warnIfVersionBlind(): void {
    try {
      if (!this.db.hasAnyCpeVersionBounds()) {
        console.warn(
          '[scan] WARNING: this NVD database contains no CPE version ranges, so findings are NOT ' +
            'filtered by component version — expect false positives on patched versions. ' +
            'Re-import the catalog to populate them.',
        )
      }
    } catch {
      // A schema without the bounds columns is old, not broken; scanning still works.
    }
  }

  async scanComponent(
    identifier: string,
    options?: { preferLocal?: boolean; declaredCpe?: string },
  ): Promise<ScanComponentResult> {
    const matched = new Map<string, CVEWithDetails>()
    let hitConfidence: MatchConfidence = 'name-only'

    // Walk the tiers; stop at the first tier that produces any match to limit
    // over-matching from broad name/token searches. A vendor:product term keeps the
    // cpe23_uri match (already scoped); a bare product/name/token uses the precise
    // cpe_product cascade instead of a blunt substring, cutting cross-product noise.
    const matchedTerms: string[] = []
    for (const tier of deriveSearchTiers(identifier, options?.declaredCpe)) {
      for (const term of tier.terms) {
        const cves = term.includes(':')
          ? this.db.searchCVEsByCPE(term, SEARCH_LIMIT)
          : this.db.searchCVEsByProduct(term, SEARCH_LIMIT)
        if (cves.length > 0) matchedTerms.push(term)
        for (const cve of cves) {
          matched.set(cve.id, cve)
        }
      }
      if (matched.size > 0) {
        hitConfidence = tier.confidence
        break
      }
    }

    if (matched.size === 0) {
      return { vulnerabilities: [], fromCache: 0, fromApi: 0, errors: [] }
    }

    const ids = Array.from(matched.keys())
    const details = this.db.getCveListDetails(ids)
    const meta = this.readMeta(ids)
    const fixed = this.readFixedVersions(ids, matchedTerms)

    const vulnerabilities: Vulnerability[] = []
    for (const cve of matched.values()) {
      vulnerabilities.push(
        cveToVulnerability(cve, identifier, details.get(cve.id), meta.get(cve.id), fixed.get(cve.id), hitConfidence),
      )
    }

    return { vulnerabilities, fromCache: vulnerabilities.length, fromApi: 0, errors: [] }
  }

  async scanComponents(identifiers: string[], options?: { preferLocal?: boolean }): Promise<ScanComponentResult[]> {
    const results: ScanComponentResult[] = []
    for (const id of identifiers) {
      results.push(await this.scanComponent(id, options))
    }
    return results
  }

  getStatistics(): ScannerStatistics {
    return { totalCves: this.ready ? this.db.getTotalCVECount() : 0 }
  }

  async close(): Promise<void> {
    if (this.ready) await this.db.close()
    this.ready = false
  }

  /** Batch-read is_kev / epss columns (absent from CVEWithDetails). */
  private readMeta(ids: string[]): Map<string, CveMeta> {
    const out = new Map<string, CveMeta>()
    const raw = this.db.getRawDb()
    if (!raw || ids.length === 0) return out
    const placeholders = ids.map(() => '?').join(',')
    const rows = raw
      .prepare(`SELECT id, is_kev, epss_score, epss_percentile FROM cves WHERE id IN (${placeholders})`)
      .all(...ids) as Array<{
      id: string
      is_kev: number | null
      epss_score: number | null
      epss_percentile: number | null
    }>
    for (const row of rows) {
      out.set(row.id, {
        isKev: row.is_kev === 1,
        epssScore: row.epss_score ?? undefined,
        epssPercentile: row.epss_percentile ?? undefined,
      })
    }
    return out
  }

  /** Batch-read first fixed version per CVE from cpe_matches version ranges, scoped to the product
   * that actually matched this component. */
  private readFixedVersions(ids: string[], matchedTerms: string[] = []): Map<string, string[]> {
    const out = new Map<string, string[]>()
    const raw = this.db.getRawDb()
    if (!raw || ids.length === 0) return out
    const placeholders = ids.map(() => '?').join(',')

    // Scope to the matched product(s). A CVE with several product configurations otherwise merges
    // every product's version_end_excluding into one list, yielding a bogus "upgrade to X". Terms
    // are pre-sanitized (no LIKE metacharacters) and appear literally in the matching cpe23_uri —
    // a bare product as ":log4j:" or a vendor:product as "apache:log4j" — so this substring match
    // re-selects the same rows the CVE search hit rather than every product on the CVE.
    const terms = matchedTerms.map((t) => t.toLowerCase()).filter(Boolean)
    const scopeClause = terms.length ? ` AND (${terms.map(() => 'cpe23_uri LIKE ?').join(' OR ')})` : ''
    const scopeParams = terms.map((t) => `%${t}%`)

    const rows = raw
      .prepare(
        `SELECT DISTINCT cve_id, version_end_excluding FROM cpe_matches
         WHERE cve_id IN (${placeholders}) AND version_end_excluding IS NOT NULL AND version_end_excluding <> ''${scopeClause}`,
      )
      .all(...ids, ...scopeParams) as Array<{ cve_id: string; version_end_excluding: string }>
    for (const row of rows) {
      const list = out.get(row.cve_id) ?? []
      if (!list.includes(row.version_end_excluding)) list.push(row.version_end_excluding)
      out.set(row.cve_id, list)
    }
    return out
  }
}

/**
 * Map an NVD CVE row (+ enrichment) to the shared Vulnerability shape. Exported
 * so the security-critical mapping can be unit-tested without a live database.
 */
export function cveToVulnerability(
  cve: CVEWithDetails,
  identifier: string,
  detail?: CveDetail,
  meta?: CveMeta,
  fixedVersions?: string[],
  matchConfidence?: MatchConfidence,
): Vulnerability {
  const references: VulnerabilityReference[] = (detail?.references ?? cve.references ?? []).map((ref) => {
    const rawTags = (ref as { tags?: string | string[] }).tags
    const tags = Array.isArray(rawTags)
      ? rawTags
      : typeof rawTags === 'string' && rawTags
        ? rawTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined
    return {
      source: (ref as { source?: string }).source || 'nvd',
      url: ref.url,
      tags: tags && tags.length > 0 ? tags : undefined,
    }
  })

  const patchInfo = buildPatchInfo(fixedVersions)

  return {
    id: cve.id,
    source: 'nvd',
    severity: toSeverity(cve.severity, cve.cvss_score),
    cvssScore: cve.cvss_score,
    cvssVector: cve.cvss_vector,
    cwes: detail?.cwes ?? [],
    description: cve.description,
    references,
    affectedComponents: [identifier],
    publishedAt: cve.published_at ? new Date(cve.published_at) : undefined,
    modifiedAt: cve.modified_at ? new Date(cve.modified_at) : undefined,
    patchInfo,
    patchedVersions: patchInfo?.fixedVersions,
    isKev: meta?.isKev ?? false,
    epssScore: meta?.epssScore,
    epssPercentile: meta?.epssPercentile,
    matchQuality: matchConfidence ? { [identifier]: matchConfidence } : undefined,
  }
}

/** Build a complete PatchInfo from fixed versions, or undefined when none are known. */
function buildPatchInfo(fixedVersions: string[] | undefined): PatchInfo | undefined {
  if (!fixedVersions || fixedVersions.length === 0) return undefined
  return {
    fixedVersions,
    patchLinks: [],
    remediationAdvice: {
      priority: 'high',
      category: 'upgrade',
      steps: [
        {
          step: 1,
          action: `Upgrade to ${fixedVersions[0]} or later`,
          description: 'Update the affected component to a fixed version.',
        },
      ],
    },
    affectedVersionRanges: [],
    patchAvailability: 'available',
  }
}

/**
 * Create a local scanner. The caller must await initialize() before scanning and
 * call close() when done. dbPath defaults to the app's canonical NVD DB path.
 */
export function createLocalScanner(dbPath?: string): LocalScanner {
  return new LocalScanner(resolveDbPath(dbPath))
}
