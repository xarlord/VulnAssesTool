import { describe, it, expect, beforeAll } from 'vitest'
import { buildSearchIndex, searchIndex, type SearchIndex } from '@/lib/search/searchIndex'
import type { Component, Project, Vulnerability } from '@@/types'

// NFR-01 (PRD.md): "Search Response — < 1 second for 10,000+ components — Query execution time".
//
// WHY this guards intent: global search is a synchronous, user-facing operation, so the whole
// point of the requirement is that it stays interactive at scale. This test builds a >10k-entry
// index ONCE (index construction is not the measured operation — "query execution time" is) and
// times only searchIndex(). Because searchIndex scans every indexed entry and re-ranks matches,
// any regression that makes matching/ranking superlinear (a per-entry regex, an O(n^2) sort or
// dedup, an accidental full re-index per query) blows past 1s on this dataset and fails here.
// The result-count assertions confirm the query actually did the heavy work rather than
// short-circuiting, so the timing measures a real worst-case load.

const COMPONENT_COUNT = 15_000 // comfortably over the PRD "10,000+ components" bar
const VULN_COUNT = 5_000

const SEVERITIES: Vulnerability['severity'][] = ['critical', 'high', 'medium', 'low', 'none']

function makeComponent(i: number): Component {
  return {
    id: `component-${i}`,
    // Every name contains "lib" and "package" so a broad query matches the entire component set.
    name: `lib-package-${i}`,
    version: `1.${i % 20}.0`,
    type: 'library',
    licenses: ['MIT'],
    vulnerabilities: [],
  }
}

function makeVulnerability(i: number): Vulnerability {
  return {
    id: `CVE-2024-${10_000 + i}`,
    source: 'nvd',
    severity: SEVERITIES[i % SEVERITIES.length],
    description: `Security issue affecting lib-package via vector ${i}`,
    references: [],
    affectedComponents: [`component-${i % COMPONENT_COUNT}`],
  }
}

let index: SearchIndex

beforeAll(() => {
  const project: Project = {
    id: 'perf-project',
    name: 'Performance Fixture',
    createdAt: new Date(),
    updatedAt: new Date(),
    sbomFiles: [],
    components: Array.from({ length: COMPONENT_COUNT }, (_, i) => makeComponent(i)),
    vulnerabilities: Array.from({ length: VULN_COUNT }, (_, i) => makeVulnerability(i)),
    statistics: {
      totalVulnerabilities: VULN_COUNT,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: COMPONENT_COUNT,
      vulnerableComponents: 0,
    },
  }
  index = buildSearchIndex([project])
})

describe('NFR-01 search performance', () => {
  it('runs a broad-match query over 15,000+ indexed entries in under 1 second', () => {
    // "lib" is a substring of every component name (and every vuln description), so the full
    // relevance-scoring + sort path runs across the entire index — the worst case.
    const start = performance.now()
    const results = searchIndex(index, 'lib')
    const elapsed = performance.now() - start

    // All components matched (plus the vulnerabilities whose descriptions mention "lib").
    expect(results.length).toBeGreaterThan(COMPONENT_COUNT)
    expect(elapsed).toBeLessThan(1000)
  })

  it('runs a boolean AND/NOT query over the same index in under 1 second', () => {
    // Exercises the parseSearchQuery + matchesParsedQuery boolean path (FR-08.1) at scale.
    const start = performance.now()
    const results = searchIndex(index, 'package AND lib NOT nonexistentterm')
    const elapsed = performance.now() - start

    expect(results.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(1000)
  })
})
