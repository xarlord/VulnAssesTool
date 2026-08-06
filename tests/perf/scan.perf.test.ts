import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Mock } from 'vitest'
import { matchVulnerabilitiesForComponents } from '@/lib/api/vulnMatcher'
import { getPlatform } from '@/lib/platform'
import type { Component, CveResult } from '@@/types'

// OSV is a real network call (proxied through /api/osv) in production. Stub it so the scan is
// fully deterministic and offline; the components below carry no PURL, so this is belt-and-braces.
vi.mock('@/lib/api/osv', () => ({
  queryByPurls: vi.fn(() => Promise.resolve(new Map())),
}))

// NFR-01 (PRD.md): "Vulnerability Scan (1000 components) — < 10 seconds (local DB)".
//
// SCOPE / honesty: the local-DB lookup is STUBBED here (see the search mock below), so this test
// does NOT measure database query latency — that lives behind the platform boundary and belongs to
// an integration/E2E measurement. What it DOES guard is the client-side scan orchestration in
// matchVulnerabilitiesForComponents, which is the part this codebase owns: per-component search
// dispatch, CveResult -> Vulnerability conversion, and the cross-component dedup/merge that builds
// the result map (a nested loop over components x unique vulnerabilities). Each component resolves to
// CVEs drawn from a bounded pool, so that assembly loop runs at a realistic size; a superlinear
// regression there — or any accidental blocking work per component — pushes the client cost past the
// 10s budget and fails this test. The stubbed budget is intentionally the full PRD ceiling: the
// client orchestration alone must never consume the whole scan budget.

const COMPONENT_COUNT = 1_000 // the exact N the PRD row is specified against
const CVE_POOL = 400 // unique CVEs shared across the scan -> realistic dedup/merge pressure
const CVES_PER_COMPONENT = 8

function makeComponents(count: number): Component[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `component-${i}`,
    name: `package-${i}`,
    version: '1.0.0',
    type: 'library',
    licenses: ['MIT'],
    vulnerabilities: [],
    // A valid CPE routes each component down PRIORITY 1 -> exactly one local-DB search per component.
    cpe: `cpe:2.3:a:vendor:product-${i}:1.0.0:*:*:*:*:*:*:*`,
  }))
}

// Deterministic spread of the search query onto the CVE pool (no Math.random -> runs are comparable).
function seedFromQuery(query: string): number {
  let seed = 0
  for (let i = 0; i < query.length; i++) seed = (seed + query.charCodeAt(i)) % CVE_POOL
  return seed
}

function cveResultsFor(query: string): CveResult[] {
  const seed = seedFromQuery(query)
  return Array.from({ length: CVES_PER_COMPONENT }, (_, k) => {
    const n = (seed + k) % CVE_POOL
    return {
      cveId: `CVE-2024-${20_000 + n}`,
      description: `Vulnerability ${n} in product`,
      severity: 'HIGH' as const,
      cvssScore: 7.5,
      source: 'NVD',
      references: [{ url: `https://nvd.nist.gov/vuln/detail/CVE-2024-${20_000 + n}` }],
    }
  })
}

let logSpy: ReturnType<typeof vi.spyOn>

beforeAll(() => {
  // getPlatform() returns a stable singleton mock (tests/setup.ts); reconfigure its search to
  // return a realistic CVE payload instead of the default empty result.
  const search = getPlatform().database.search as unknown as Mock
  search.mockImplementation((req: { query: string }) =>
    Promise.resolve({ success: true, results: cveResultsFor(req.query), totalResults: CVES_PER_COMPONENT }),
  )
  // The scan logs one line per matched component; silence it so 1000 lines of stdout flushing
  // neither pollutes output nor distorts the timing (stdout I/O is not part of the real hot path).
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterAll(() => {
  logSpy.mockRestore()
})

describe('NFR-01 scan performance', () => {
  it('scans 1000 components against the (stubbed) local DB in under 10 seconds', async () => {
    const components = makeComponents(COMPONENT_COUNT)

    const start = performance.now()
    const result = await matchVulnerabilitiesForComponents(components)
    const elapsed = performance.now() - start

    // Sanity: every component was processed and matched, so the timing reflects real work
    // rather than an early bail-out.
    expect(result.size).toBe(COMPONENT_COUNT)
    expect(result.get('component-0')?.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(10_000)
  })
})
