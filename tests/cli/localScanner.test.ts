import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  parseComponentId,
  deriveSearchTiers,
  cveToVulnerability,
  createLocalScanner,
} from '../../cli/scanner/localScanner.js'
import { runMigrations } from '../../server/database/migrations/v2SchemaMigration.js'
import type { CVEWithDetails } from '../../server/database/types.js'

describe('parseComponentId', () => {
  it('parses an npm purl into name + version', () => {
    expect(parseComponentId('pkg:npm/lodash@4.17.15')).toEqual({ name: 'lodash', version: '4.17.15' })
  })

  it('uses the artifact segment as the name for a maven purl with a namespace', () => {
    expect(parseComponentId('pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1')).toEqual({
      name: 'log4j-core',
      version: '2.14.1',
    })
  })

  it('parses a plain name@version identifier', () => {
    expect(parseComponentId('express@4.17.1')).toEqual({ name: 'express', version: '4.17.1' })
  })

  it('handles a bare name with no version', () => {
    expect(parseComponentId('express')).toEqual({ name: 'express', version: '' })
  })

  it('strips purl qualifiers from the version', () => {
    expect(parseComponentId('pkg:npm/foo@1.2.3?type=module')).toEqual({ name: 'foo', version: '1.2.3' })
  })

  it('parses a scoped npm purl (literal @) without corrupting the name', () => {
    expect(parseComponentId('pkg:npm/@angular/core@11.0.0')).toEqual({ name: 'core', version: '11.0.0' })
  })

  it('parses a scoped npm purl that has no version', () => {
    expect(parseComponentId('pkg:npm/@angular/core')).toEqual({ name: 'core', version: '' })
  })
})

describe('deriveSearchTiers', () => {
  it('derives vendor:product (tier 1) then bare product (tier 2) from a CPE identifier', () => {
    expect(deriveSearchTiers('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*')).toEqual([
      { terms: ['apache:log4j'], confidence: 'cpe-estimated' },
      { terms: ['log4j'], confidence: 'name-only' },
    ])
  })

  it('tags the vendor:product tier cpe-estimated and the bare-product tier name-only', () => {
    const tiers = deriveSearchTiers('cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*')
    expect(tiers[0].confidence).toBe('cpe-estimated')
    expect(tiers[1].confidence).toBe('name-only')
  })

  it('yields no tiers for a CPE whose product is a wildcard (would match everything)', () => {
    expect(deriveSearchTiers('cpe:2.3:a:apache:*:*:*:*:*:*:*:*:*')).toEqual([])
  })

  it('does not crash on a truncated CPE with no product segment', () => {
    expect(deriveSearchTiers('cpe:2.3:a:openssl')).toEqual([])
  })

  it('includes the (lowercased) package name as a search term for a purl', () => {
    const terms = deriveSearchTiers('pkg:npm/lodash@4.17.15').flatMap((t) => t.terms)
    expect(terms).toContain('lodash')
  })

  it('lowercases the full name and surfaces a meaningful token from a hyphenated name', () => {
    const terms = deriveSearchTiers('Log4j-Core@2.14.1').flatMap((t) => t.terms)
    expect(terms).toContain('log4j-core') // full-name tier, lowercased
    expect(terms).toContain('log4j') // token tier drops the generic "core" suffix
  })

  it('returns no tiers for an empty identifier', () => {
    expect(deriveSearchTiers('')).toEqual([])
  })
})

describe('cveToVulnerability', () => {
  const baseCve: CVEWithDetails = {
    id: 'CVE-2021-44228',
    description: 'Log4Shell',
    cvss_score: 10.0,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
    severity: 'CRITICAL',
    published_at: '2021-12-10T00:00:00Z',
    modified_at: '2021-12-14T00:00:00Z',
    source: 'NVD',
    references: [
      { cve_id: 'CVE-2021-44228', url: 'https://nvd.nist.gov/x', source: 'nvd', tags: 'Patch,Vendor Advisory' },
    ],
  }

  it('lowercases severity, sets source=nvd, and populates BOTH patch fields identically', () => {
    const v = cveToVulnerability(
      baseCve,
      'pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1',
      { cwes: ['CWE-502'], references: [] },
      { isKev: true, epssScore: 0.97 },
      ['2.15.0'],
    )
    expect(v.id).toBe('CVE-2021-44228')
    expect(v.source).toBe('nvd')
    expect(v.severity).toBe('critical')
    expect(v.isKev).toBe(true)
    expect(v.epssScore).toBe(0.97)
    expect(v.cwes).toEqual(['CWE-502'])
    expect(v.affectedComponents).toEqual(['pkg:maven/org.apache.logging.log4j/log4j-core@2.14.1'])
    // SARIF reads patchedVersions, JUnit reads patchInfo.fixedVersions — must agree.
    expect(v.patchedVersions).toEqual(['2.15.0'])
    expect(v.patchInfo?.fixedVersions).toEqual(['2.15.0'])
  })

  it('derives severity from the CVSS score when the stored severity is missing', () => {
    const v = cveToVulnerability({ ...baseCve, severity: undefined, cvss_score: 5.5 }, 'x@1')
    expect(v.severity).toBe('medium')
    expect(v.isKev).toBe(false)
    expect(v.patchInfo).toBeUndefined()
    expect(v.patchedVersions).toBeUndefined()
  })

  it('normalizes comma-separated reference tags from a raw CVE row into an array', () => {
    // No detail arg -> falls back to cve.references, whose tags are a CSV string.
    const v = cveToVulnerability(baseCve, 'x@1')
    expect(v.references[0].source).toBe('nvd')
    expect(v.references[0].tags).toEqual(['Patch', 'Vendor Advisory'])
  })

  it('records match confidence keyed by the component identifier (GUI/CLI parity)', () => {
    const v = cveToVulnerability(baseCve, 'lodash@4.17.15', undefined, undefined, undefined, 'name-only')
    expect(v.matchQuality).toEqual({ 'lodash@4.17.15': 'name-only' })
  })

  it('omits matchQuality when no confidence is supplied', () => {
    const v = cveToVulnerability(baseCve, 'x@1')
    expect(v.matchQuality).toBeUndefined()
  })
})

describe('LocalScanner fixed-version scoping (H19)', () => {
  it('scopes fixed versions to the matched product, not every product on the CVE', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-h19-'))
    const dbPath = path.join(dir, 'nvd-data.db')
    const seed = new Database(dbPath)
    seed.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    runMigrations(seed, 0)
    // One CVE that lists two unrelated products with different fixed versions.
    seed
      .prepare(
        `INSERT INTO cves (id, description, cvss_score, severity, published_at, modified_at, source)
         VALUES (?, ?, ?, ?, ?, ?, 'NVD')`,
      )
      .run('CVE-2099-0001', 'multi-product advisory', 9.8, 'CRITICAL', '2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z')
    const insCpe = seed.prepare(
      'INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable, version_end_excluding) VALUES (?, ?, 1, ?)',
    )
    insCpe.run('CVE-2099-0001', 'cpe:2.3:a:vendora:producta:*:*:*:*:*:*:*:*', '2.15.0')
    insCpe.run('CVE-2099-0001', 'cpe:2.3:a:vendorb:productb:*:*:*:*:*:*:*:*', '9.9.9')
    seed.close()

    const scanner = createLocalScanner(dbPath)
    try {
      await scanner.initialize()
      const result = await scanner.scanComponent('producta@1.0.0')
      const vuln = result.vulnerabilities.find((v) => v.id === 'CVE-2099-0001')
      expect(vuln).toBeDefined()
      // WHY: before scoping, readFixedVersions merged BOTH products' version_end_excluding
      // (['2.15.0','9.9.9']) into producta's advice — a bogus "upgrade to 9.9.9".
      expect(vuln?.patchedVersions).toEqual(['2.15.0'])
    } finally {
      await scanner.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('cveToVulnerability additional branch coverage', () => {
  // Local copy of the fixture from the 'cveToVulnerability' describe block above (that one
  // is scoped to its own callback), kept in sync in shape so these tests share the same base.
  const baseCve: CVEWithDetails = {
    id: 'CVE-2021-44228',
    description: 'Log4Shell',
    cvss_score: 10.0,
    cvss_vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H',
    severity: 'CRITICAL',
    published_at: '2021-12-10T00:00:00Z',
    modified_at: '2021-12-14T00:00:00Z',
    source: 'NVD',
    references: [
      { cve_id: 'CVE-2021-44228', url: 'https://nvd.nist.gov/x', source: 'nvd', tags: 'Patch,Vendor Advisory' },
    ],
  }

  it('derives "none" severity when there is no stored severity and no CVSS score', () => {
    // WHY: a CVE with neither a stored band nor a score must read as "we don't know" (none),
    // not silently collapse into "low" — CLI exit-code/threshold logic keys off this band.
    const v = cveToVulnerability({ ...baseCve, severity: undefined, cvss_score: undefined }, 'x@1')
    expect(v.severity).toBe('none')
  })

  it('derives "critical" from a 9.0+ score when no severity string is stored', () => {
    const v = cveToVulnerability({ ...baseCve, severity: undefined, cvss_score: 9.5 }, 'x@1')
    expect(v.severity).toBe('critical')
  })

  it('derives "high" from a 7.0-8.9 score when no severity string is stored', () => {
    const v = cveToVulnerability({ ...baseCve, severity: undefined, cvss_score: 8.0 }, 'x@1')
    expect(v.severity).toBe('high')
  })

  it('derives "low" from a positive sub-4.0 score when no severity string is stored', () => {
    const v = cveToVulnerability({ ...baseCve, severity: undefined, cvss_score: 2.0 }, 'x@1')
    expect(v.severity).toBe('low')
  })

  it('defaults references to an empty array when neither detail nor the raw CVE row provide any', () => {
    const cveNoReferences: CVEWithDetails = {
      id: 'CVE-2099-0201',
      description: 'no references at all',
      cvss_score: 5.0,
      published_at: '2099-01-01T00:00:00Z',
      modified_at: '2099-01-02T00:00:00Z',
      source: 'NVD',
    }
    const v = cveToVulnerability(cveNoReferences, 'x@1')
    expect(v.references).toEqual([])
  })

  it('preserves reference tags that are already an array instead of a CSV string', () => {
    // WHY: CveDetail.references (from getCveListDetails) already types tags as string[] —
    // re-splitting it as if it were a CSV string would corrupt multi-word tags.
    const v = cveToVulnerability(baseCve, 'x@1', {
      cwes: [],
      references: [{ url: 'https://example.com/advisory', source: 'ghsa', tags: ['Patch', 'Third Party Advisory'] }],
    })
    expect(v.references).toEqual([
      { source: 'ghsa', url: 'https://example.com/advisory', tags: ['Patch', 'Third Party Advisory'] },
    ])
  })

  it('defaults a bare reference (no tags, no source) to source "nvd" with tags left undefined', () => {
    const v = cveToVulnerability(baseCve, 'x@1', {
      cwes: [],
      references: [{ url: 'https://example.com/bare' }],
    })
    expect(v.references).toEqual([{ source: 'nvd', url: 'https://example.com/bare', tags: undefined }])
  })

  it('treats an empty fixedVersions array the same as "no patch known"', () => {
    // WHY: distinct code path from "fixedVersions omitted" (already covered) -- an empty
    // but defined array must not produce a hollow PatchInfo (e.g. "upgrade to undefined").
    const v = cveToVulnerability(baseCve, 'x@1', undefined, undefined, [])
    expect(v.patchInfo).toBeUndefined()
    expect(v.patchedVersions).toBeUndefined()
  })

  it('leaves publishedAt/modifiedAt undefined when the CVE row has empty date strings', () => {
    const v = cveToVulnerability({ ...baseCve, published_at: '', modified_at: '' }, 'x@1')
    expect(v.publishedAt).toBeUndefined()
    expect(v.modifiedAt).toBeUndefined()
  })
})

describe('deriveSearchTiers additional branch coverage', () => {
  it('falls back to the bare-product tier when the CPE vendor segment is a wildcard', () => {
    // WHY: mirrors the existing "wildcard product" test but for the other segment -- a
    // wildcard vendor must not suppress the (still specific enough) bare-product tier.
    expect(deriveSearchTiers('cpe:2.3:a:*:log4j:2.14.1:*:*:*:*:*:*:*')).toEqual([
      { terms: ['log4j'], confidence: 'name-only' },
    ])
  })
})

describe('LocalScanner lifecycle branch coverage', () => {
  /** Seed a fresh sqlite file with one matchable CVE so initialize() succeeds (count > 0). */
  function seedOneCveDb(dbPath: string, cpe23Uri: string, cveId = 'CVE-2099-0100'): void {
    const seed = new Database(dbPath)
    seed.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    runMigrations(seed, 0)
    seed
      .prepare(
        `INSERT INTO cves (id, description, cvss_score, severity, published_at, modified_at, source)
         VALUES (?, ?, ?, ?, ?, ?, 'NVD')`,
      )
      .run(cveId, 'branch-coverage seed CVE', 9.8, 'CRITICAL', '2099-01-01T00:00:00Z', '2099-01-02T00:00:00Z')
    seed.prepare('INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable) VALUES (?, ?, 1)').run(cveId, cpe23Uri)
    seed.close()
  }

  it('throws DatabaseUnavailableError naming the missing path when the db file does not exist', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-missing-'))
    const dbPath = path.join(dir, 'does-not-exist.db')
    const scanner = createLocalScanner(dbPath)
    try {
      const initPromise = scanner.initialize()
      await expect(initPromise).rejects.toThrow('not found')
      await expect(initPromise).rejects.toThrow(dbPath)
    } finally {
      await scanner.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws DatabaseUnavailableError when the db file exists but has zero CVE rows, yet still lets close() release the handle', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-empty-'))
    const dbPath = path.join(dir, 'nvd-data.db')
    fs.writeFileSync(dbPath, '')
    const scanner = createLocalScanner(dbPath)
    try {
      const initPromise = scanner.initialize()
      await expect(initPromise).rejects.toThrow('empty')
      await expect(initPromise).rejects.toThrow(dbPath)
      // WHY (see "Mark ready as soon as the handle is open" in initialize()): the DB handle
      // is opened before the emptiness check runs, so close() must still release it even
      // though initialize() itself rejected -- otherwise the file handle would leak.
      await expect(scanner.close()).resolves.toBeUndefined()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gates getStatistics/initialize through a full ready lifecycle: 0 before init, real count while ready, idempotent re-init, 0 again after close', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-lifecycle-'))
    const dbPath = path.join(dir, 'nvd-data.db')
    seedOneCveDb(dbPath, 'cpe:2.3:a:acmecorp:widgetmaker:*:*:*:*:*:*:*:*')
    const scanner = createLocalScanner(dbPath)
    try {
      // WHY: statistics must not reach into a handle that scanComponent hasn't opened yet.
      expect(scanner.getStatistics()).toEqual({ totalCves: 0 })

      await scanner.initialize()
      expect(scanner.getStatistics()).toEqual({ totalCves: 1 })

      // WHY: a second initialize() must be a no-op, not a re-open (which could throw or
      // register duplicate process-exit handlers on the underlying NvdDatabase).
      await scanner.initialize()
      expect(scanner.getStatistics()).toEqual({ totalCves: 1 })

      await scanner.close()
      expect(scanner.getStatistics()).toEqual({ totalCves: 0 })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('resolves close() safely even when initialize() was never called', async () => {
    const scanner = createLocalScanner(path.join(os.tmpdir(), 'vs-never-initialized.db'))
    await expect(scanner.close()).resolves.toBeUndefined()
  })

  it('scanComponents returns one result per identifier, matching some and leaving others empty (not erroring)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-plural-'))
    const dbPath = path.join(dir, 'nvd-data.db')
    seedOneCveDb(dbPath, 'cpe:2.3:a:acmecorp:widgetmaker:*:*:*:*:*:*:*:*')
    const scanner = createLocalScanner(dbPath)
    try {
      await scanner.initialize()
      const results = await scanner.scanComponents(['widgetmaker@1.0.0', 'zzz-totally-unmatched-widget@1.0.0'])
      expect(results).toHaveLength(2)
      expect(results[0].vulnerabilities.map((v) => v.id)).toEqual(['CVE-2099-0100'])
      expect(results[1]).toEqual({ vulnerabilities: [], fromCache: 0, fromApi: 0, errors: [] })
    } finally {
      await scanner.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads is_kev/epss_score/epss_percentile from the database row through to the vulnerability', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-kev-epss-'))
    const dbPath = path.join(dir, 'nvd-data.db')
    const seed = new Database(dbPath)
    seed.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
    runMigrations(seed, 0)
    seed
      .prepare(
        `INSERT INTO cves
           (id, description, cvss_score, severity, published_at, modified_at, source, is_kev, epss_score, epss_percentile)
         VALUES (?, ?, ?, ?, ?, ?, 'NVD', ?, ?, ?)`,
      )
      .run(
        'CVE-2099-0300',
        'kev+epss seed',
        9.1,
        'CRITICAL',
        '2099-01-01T00:00:00Z',
        '2099-01-02T00:00:00Z',
        1,
        0.93,
        0.88,
      )
    seed
      .prepare('INSERT INTO cpe_matches (cve_id, cpe23_uri, vulnerable) VALUES (?, ?, 1)')
      .run('CVE-2099-0300', 'cpe:2.3:a:acmecorp:kevwidget:*:*:*:*:*:*:*:*')
    seed.close()

    const scanner = createLocalScanner(dbPath)
    try {
      await scanner.initialize()
      const result = await scanner.scanComponent('kevwidget@1.0.0')
      const vuln = result.vulnerabilities.find((v) => v.id === 'CVE-2099-0300')
      expect(vuln?.isKev).toBe(true)
      expect(vuln?.epssScore).toBe(0.93)
      expect(vuln?.epssPercentile).toBe(0.88)
    } finally {
      await scanner.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

// Two matching defects found by scanning a real 2.9 GB NVD catalog rather than fixtures — fixtures
// hid them because their CPEs and purls were chosen to match. See
// docs/reports/code-review-2026-08-22.md and the live-scan record of 2026-08-22.
describe('CPE search terms survive the sanitizer (live-scan defect)', () => {
  // The sanitizer used to delete LIKE metacharacters as if that were SQL hygiene. The DB layer
  // already escapes them (escapeLikePattern + ESCAPE '\'), so this only destroyed queries:
  // 68.7% of distinct cpe_product values in a real catalog contain an underscore. Probed against
  // the real DB: `apache:commons_text` -> 1 hit incl. Text4Shell; `apache:commonstext` -> 0.
  it('keeps underscores in vendor:product terms', () => {
    const tiers = deriveSearchTiers('cpe:2.3:a:apache:commons_text:1.9:*:*:*:*:*:*:*')
    expect(tiers[0].terms).toEqual(['apache:commons_text'])
    expect(tiers[1].terms).toEqual(['commons_text'])
  })

  it('keeps underscores for multi-word NVD product names', () => {
    expect(deriveSearchTiers('cpe:2.3:a:vmware:spring_framework:5.3.17:*:*:*:*:*:*:*')[0].terms).toEqual([
      'vmware:spring_framework',
    ])
    expect(deriveSearchTiers('cpe:2.3:o:microsoft:windows_10:1909:*:*:*:*:*:*:*')[0].terms).toEqual([
      'microsoft:windows_10',
    ])
  })

  it('still drops CPE wildcards so a wildcard-only term cannot match everything', () => {
    expect(deriveSearchTiers('cpe:2.3:a:apache:*:*:*:*:*:*:*:*:*')).toEqual([])
  })
})

describe('a declared CPE leads the ladder (live-scan defect)', () => {
  // The caller passed `component.purl ?? component.cpe`, so a declared CPE was consulted only when
  // no purl existed — for CycloneDX, essentially never. Measured on struts2-core 2.5.10 against
  // the real catalog: 1 finding / 0 KEV / CVE-2017-5638 (KEV, Equifax) MISSED via the purl, vs
  // 91 findings / 8 KEV / found via the declared CPE.
  const PURL = 'pkg:maven/org.apache.struts/struts2-core@2.5.10'
  const CPE = 'cpe:2.3:a:apache:struts:2.5.10:*:*:*:*:*:*:*'

  it('puts the declared CPE tiers ahead of anything inferred from the purl', () => {
    const tiers = deriveSearchTiers(PURL, CPE)
    expect(tiers[0].terms).toEqual(['apache:struts'])
    // The purl-derived tiers are still present as fallbacks, not discarded.
    const allTerms = tiers.flatMap((t) => t.terms)
    expect(allTerms).toContain('struts2-core')
  })

  it('is unchanged when no CPE is declared', () => {
    expect(deriveSearchTiers(PURL, undefined)).toEqual(deriveSearchTiers(PURL))
  })

  it('does not double up when the identifier already is the CPE', () => {
    expect(deriveSearchTiers(CPE, CPE)).toEqual(deriveSearchTiers(CPE))
  })

  it('ignores a declared value that is not a CPE', () => {
    expect(deriveSearchTiers(PURL, 'not-a-cpe')).toEqual(deriveSearchTiers(PURL))
  })
})
