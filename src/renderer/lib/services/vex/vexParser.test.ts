import { describe, it, expect } from 'vitest'
import { parseVexDocument, applyVexSuppression, type ParsedVexStatement } from './vexParser'
import type { Vulnerability } from '@@/types'

function vuln(p: Partial<Vulnerability> & { id: string }): Vulnerability {
  return {
    source: 'nvd',
    severity: 'high',
    description: '',
    references: [],
    affectedComponents: [],
    ...p,
  }
}

function statement(
  p: Partial<ParsedVexStatement> & { vulnerability: string; status: ParsedVexStatement['status'] },
): ParsedVexStatement {
  return { affects: [], ...p }
}

describe('parseVexDocument', () => {
  it("parses this tool's own generated shape (statements + analysis.status)", () => {
    const content = JSON.stringify({
      statements: [
        {
          vulnerability: 'CVE-2021-44228',
          analysis: { status: 'not_affected', justification: 'component_not_present', detail: 'not in path' },
          affects: ['urn:cdx:pkg:maven/log4j'],
        },
      ],
    })
    const { statements, warnings } = parseVexDocument(content)
    expect(warnings).toEqual([])
    expect(statements).toHaveLength(1)
    expect(statements[0]).toMatchObject({
      vulnerability: 'CVE-2021-44228',
      status: 'not_affected',
      justification: 'component_not_present',
      detail: 'not in path',
      affects: ['urn:cdx:pkg:maven/log4j'],
    })
  })

  it('parses standard CycloneDX VEX (vulnerabilities + analysis.state + affects[].ref)', () => {
    const content = JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2020-1234',
          analysis: { state: 'not_affected', justification: 'code_not_reachable' },
          affects: [{ ref: 'pkg:npm/lodash@4.17.21' }, { ref: 'bom-ref-2' }],
        },
      ],
    })
    const { statements } = parseVexDocument(content)
    expect(statements[0]).toMatchObject({
      vulnerability: 'CVE-2020-1234',
      status: 'not_affected',
      affects: ['pkg:npm/lodash@4.17.21', 'bom-ref-2'],
    })
  })

  it('normalizes CycloneDX state values to internal statuses', () => {
    const states: Array<[string, ParsedVexStatement['status']]> = [
      ['not_affected', 'not_affected'],
      ['false_positive', 'not_affected'],
      ['resolved', 'resolved'],
      ['resolved_with_pedigree', 'resolved'],
      ['exploitable', 'affected'],
      ['affected', 'affected'],
      ['in_triage', 'under_investigation'],
    ]
    for (const [state, expected] of states) {
      const { statements } = parseVexDocument(
        JSON.stringify({ vulnerabilities: [{ id: 'CVE-X', analysis: { state } }] }),
      )
      expect(statements[0].status).toBe(expected)
    }
  })

  it('treats an unknown status as under_investigation and warns (never silently suppresses)', () => {
    const { statements, warnings } = parseVexDocument(
      JSON.stringify({ vulnerabilities: [{ id: 'CVE-X', analysis: { state: 'made_up' } }] }),
    )
    expect(statements[0].status).toBe('under_investigation')
    expect(warnings.join(' ')).toContain('Unrecognized VEX status')
  })

  it('skips entries without an id and records a warning rather than throwing', () => {
    const { statements, warnings } = parseVexDocument(
      JSON.stringify({
        vulnerabilities: [
          { analysis: { state: 'not_affected' } },
          { id: 'CVE-OK', analysis: { state: 'not_affected' } },
        ],
      }),
    )
    expect(statements.map((s) => s.vulnerability)).toEqual(['CVE-OK'])
    expect(warnings).toHaveLength(1)
  })

  it('throws on non-JSON, non-object, and documents with no recognizable array', () => {
    expect(() => parseVexDocument('not json')).toThrow(/not valid JSON/)
    expect(() => parseVexDocument('[]')).toThrow(/must be a JSON object/)
    expect(() => parseVexDocument('{"foo":1}')).toThrow(/neither a "statements" nor a "vulnerabilities"/)
  })
})

describe('applyVexSuppression', () => {
  const log4shell = vuln({ id: 'CVE-2021-44228', affectedComponents: ['pkg:maven/log4j@2.14.0'] })
  const other = vuln({ id: 'CVE-2020-1234', affectedComponents: ['pkg:npm/lodash@4.17.21'] })

  it('suppresses a not_affected finding matched by id', () => {
    const { kept, suppressed } = applyVexSuppression(
      [log4shell, other],
      [statement({ vulnerability: 'CVE-2021-44228', status: 'not_affected' })],
    )
    expect(kept.map((v) => v.id)).toEqual(['CVE-2020-1234'])
    expect(suppressed.map((s) => s.vulnerability.id)).toEqual(['CVE-2021-44228'])
  })

  it('matches by alias (case-insensitive) as well as primary id', () => {
    const withAlias = vuln({ id: 'GHSA-jfh8-c2jp-5v3q', aliases: ['CVE-2021-44228'] })
    const { suppressed } = applyVexSuppression(
      [withAlias],
      [statement({ vulnerability: 'cve-2021-44228', status: 'resolved' })],
    )
    expect(suppressed).toHaveLength(1)
  })

  it('never suppresses affected or under_investigation statements', () => {
    const { kept } = applyVexSuppression(
      [log4shell],
      [
        statement({ vulnerability: 'CVE-2021-44228', status: 'affected' }),
        statement({ vulnerability: 'CVE-2021-44228', status: 'under_investigation' }),
      ],
    )
    expect(kept).toHaveLength(1)
  })

  it('scopes suppression to matching components (does not over-suppress the same CVE elsewhere)', () => {
    const a = vuln({ id: 'CVE-9', affectedComponents: ['pkg:npm/a@1'] })
    const b = vuln({ id: 'CVE-9', affectedComponents: ['pkg:npm/b@1'] })
    const { kept, suppressed } = applyVexSuppression(
      [a, b],
      [statement({ vulnerability: 'CVE-9', status: 'not_affected', affects: ['urn:cdx:pkg:npm/a@1'] })],
    )
    expect(suppressed.map((s) => s.vulnerability.affectedComponents)).toEqual([['pkg:npm/a@1']])
    expect(kept.map((v) => v.affectedComponents)).toEqual([['pkg:npm/b@1']])
  })

  it('applies document-wide when a statement lists no affects', () => {
    const a = vuln({ id: 'CVE-9', affectedComponents: ['pkg:npm/a@1'] })
    const b = vuln({ id: 'CVE-9', affectedComponents: ['pkg:npm/b@1'] })
    const { kept } = applyVexSuppression(
      [a, b],
      [statement({ vulnerability: 'CVE-9', status: 'not_affected', affects: [] })],
    )
    expect(kept).toHaveLength(0)
  })
})

// PROD-6 (docs/reports/code-review-2026-08-22.md). FR-16.2 says CSAF and OpenVEX must be rejected
// explicitly. They were not: dispatch duck-typed on a `statements` or `vulnerabilities` array and
// both formats have one, so each parsed "successfully" to an EMPTY statement list. Supplied to
// `vulnshield scan --vex` in CI that is the worst possible failure shape — the run is green,
// nothing is suppressed, and no error is raised to notice.
describe('parseVexDocument rejects unsupported VEX formats (FR-16.2)', () => {
  it('rejects OpenVEX identified by its @context', () => {
    const openVex = JSON.stringify({
      '@context': 'https://openvex.dev/ns/v0.2.0',
      '@id': 'https://example.com/vex/abc',
      statements: [
        { vulnerability: { name: 'CVE-2021-44228' }, products: [{ '@id': 'pkg:maven/x/y@1' }], status: 'not_affected' },
      ],
    })
    expect(() => parseVexDocument(openVex)).toThrow(/OpenVEX.*not supported/i)
  })

  it('rejects OpenVEX with no @context, on its object-shaped vulnerability', () => {
    const openVex = JSON.stringify({
      statements: [{ vulnerability: { name: 'CVE-2021-44228' }, status: 'not_affected' }],
    })
    expect(() => parseVexDocument(openVex)).toThrow(/not supported/i)
  })

  it('rejects CSAF identified by its document header', () => {
    const csaf = JSON.stringify({
      document: { category: 'csaf_vex', csaf_version: '2.0', title: 'Example' },
      vulnerabilities: [{ cve: 'CVE-2021-44228', product_status: { known_not_affected: ['PRODUCT-1'] } }],
    })
    expect(() => parseVexDocument(csaf)).toThrow(/CSAF.*not supported/i)
  })

  it('rejects a CSAF-shaped vulnerabilities array even without the document header', () => {
    const csaf = JSON.stringify({
      vulnerabilities: [{ cve: 'CVE-2021-44228', product_status: { known_not_affected: ['PRODUCT-1'] } }],
    })
    expect(() => parseVexDocument(csaf)).toThrow(/CSAF.*not supported/i)
  })

  // The guard is worthless if it also rejects the formats this tool produces and consumes.
  it('still accepts this tool\u2019s own generated shape', () => {
    const native = JSON.stringify({
      statements: [
        { vulnerability: 'CVE-2021-44228', analysis: { status: 'not_affected' }, affects: ['pkg:maven/x/y@1'] },
      ],
    })
    expect(() => parseVexDocument(native)).not.toThrow()
    expect(parseVexDocument(native).statements).toHaveLength(1)
  })

  it('still accepts standard CycloneDX VEX', () => {
    const cdx = JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        { id: 'CVE-2021-44228', analysis: { state: 'not_affected' }, affects: [{ ref: 'pkg:maven/x/y@1' }] },
      ],
    })
    expect(() => parseVexDocument(cdx)).not.toThrow()
    expect(parseVexDocument(cdx).statements).toHaveLength(1)
  })
})
