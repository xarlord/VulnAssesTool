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
