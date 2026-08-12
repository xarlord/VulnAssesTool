/**
 * Tests for FalsePositiveFilter — the FPF orchestrator.
 *
 * WHY these tests matter: this class encodes the safety contract of the whole false-positive
 * pipeline — "reduce noise, but NEVER auto-suppress a Critical/High finding." That single
 * property is the difference between a helpful filter and one that hides an exploitable CVE.
 * The tests below pin the decision matrix (force-escalate, tier-1 auto-filter, the
 * always-escalate safety net, and the plain "kept" fall-through) so a change that let a
 * critical slip through as 'filtered' fails loudly. They also cover batch aggregation,
 * statistics, tier-2 wiring, and graceful degradation when no audit backend is configured.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FalsePositiveFilter } from './falsePositiveFilter'
import type { SystemConfig, FilterResult, FilterContext } from '@@/types/fpf'
import type { Vulnerability, Component } from '@@/types'

// ---------------------------------------------------------------------------
// Fixtures (mirroring tier1QuickFilter.test.ts so behaviour is consistent)
// ---------------------------------------------------------------------------

/**
 * Base config. Defaults match the shipped DEFAULT_FILTER_SETTINGS intent: criticals AND
 * highs are both never-auto-filtered and always-escalated. A disabled `ethernet` interface
 * is the lever we use to make Tier 1 confidently "filter" a finding.
 */
function makeConfig(overrides: Partial<SystemConfig> = {}): SystemConfig {
  return {
    project: { name: 'Test IVI', version: '1.0.0', tier: 'production' },
    cybersecurity: { attackSurface: 'intermediate', safetyRelated: true, asilLevel: 'B' },
    interfaces: { ethernet: { enabled: false, reason: 'No ethernet port', confidence: 90 } },
    services: {},
    features: {},
    suppressionRules: [],
    filterSettings: {
      autoFilterConfidenceThreshold: 75,
      neverAutoFilter: ['critical', 'high'],
      alwaysEscalateToReview: ['critical', 'high'],
      missFilterDetection: { enabled: true, lowConfidenceThreshold: 70, recentCveDays: 30, flagKnownExploits: true },
      audit: { logAllDecisions: true, logLlmResponses: true, retentionDays: 365 },
    },
    ...overrides,
  }
}

function makeVuln(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: 'CVE-2024-0001',
    source: 'nvd',
    severity: 'medium',
    cvssScore: 5.5,
    description: 'A vulnerability in a networking component',
    references: [],
    affectedComponents: ['comp-1'],
    ...overrides,
  }
}

// A component whose name matches the disabled ethernet interface, so Tier 1 will filter it.
function makeComponent(overrides: Partial<Component> = {}): Component {
  return {
    id: 'comp-1',
    name: 'Ethernet PHY Driver',
    version: '1.0.0',
    type: 'library',
    licenses: ['MIT'],
    vulnerabilities: [],
    ...overrides,
  }
}

// A component matching no configured interface, so Tier 1 keeps it.
function genericComponent(overrides: Partial<Component> = {}): Component {
  return makeComponent({ id: 'comp-2', name: 'Generic UI Toolkit', ...overrides })
}

const context: FilterContext = {
  projectId: 'proj-1',
  projectName: 'Alpha',
  configVersion: '1.0.0',
}

// Suppress the "no audit backend" warning the logger emits when logAllDecisions is on but
// no db is wired — it is expected in these unit tests and would only add noise.
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('filterVulnerability — decision matrix', () => {
  it('force-escalates immediately, before consulting any tier', async () => {
    const fpf = new FalsePositiveFilter(makeConfig())

    const result = await fpf.filterVulnerability(makeVuln(), makeComponent(), context, { forceEscalate: true })

    expect(result.action).toBe('escalated')
    expect(result.reason).toMatch(/forced escalation/i)
    expect(result.confidence).toBe(0)
  })

  it('auto-filters a MEDIUM finding when a disabled interface matches at high confidence', async () => {
    // The core noise-reduction win: a component that cannot be reached (its interface is
    // physically absent) is a genuine false positive and may be suppressed automatically.
    const fpf = new FalsePositiveFilter(makeConfig())

    const result = await fpf.filterVulnerability(makeVuln({ severity: 'medium' }), makeComponent(), context)

    expect(result.action).toBe('filtered')
    expect(result.tier).toBe(1)
  })

  it('auto-filters a LOW finding the same way', async () => {
    const fpf = new FalsePositiveFilter(makeConfig())

    const result = await fpf.filterVulnerability(makeVuln({ severity: 'low' }), makeComponent(), context)

    expect(result.action).toBe('filtered')
  })

  it('NEVER auto-filters a CRITICAL — it escalates for review even with a matching quick filter', async () => {
    // The zero-tolerance rule. Same disabled-interface evidence that suppresses a medium
    // must only ever *escalate* a critical, so a human sees it.
    const fpf = new FalsePositiveFilter(makeConfig())

    const result = await fpf.filterVulnerability(makeVuln({ severity: 'critical' }), makeComponent(), context)

    expect(result.action).toBe('escalated')
    expect(result.action).not.toBe('filtered')
  })

  it('NEVER auto-filters a HIGH — it escalates for review', async () => {
    const fpf = new FalsePositiveFilter(makeConfig())

    const result = await fpf.filterVulnerability(makeVuln({ severity: 'high' }), makeComponent(), context)

    expect(result.action).toBe('escalated')
    expect(result.action).not.toBe('filtered')
  })

  it('keeps a finding when no evidence supports filtering and its severity is not escalate-listed', async () => {
    // A low-severity finding on a component that matches no disabled interface: nothing
    // justifies suppression and it is not on the always-escalate list, so it is kept.
    const fpf = new FalsePositiveFilter(makeConfig())

    const result = await fpf.filterVulnerability(makeVuln({ severity: 'low' }), genericComponent(), context)

    expect(result.action).toBe('kept')
    expect(result.confidence).toBe(0)
  })

  it('escalates a CRITICAL that survived every tier via the always-escalate safety net', async () => {
    // With both tiers skipped there is no filtering evidence at all, yet a critical must
    // still be surfaced — this is the tier-2 attack_path_blocked escalation fallback.
    const fpf = new FalsePositiveFilter(makeConfig())

    const result = await fpf.filterVulnerability(makeVuln({ severity: 'critical' }), genericComponent(), context, {
      skipTier1: true,
      skipTier2: true,
    })

    expect(result.action).toBe('escalated')
    expect(result.tier).toBe(2)
    expect(result.reason).toMatch(/requires manual review/i)
    expect(result.confidence).toBe(50)
  })

  it('keeps a "none" severity finding (never bucketed into the escalate/never lists)', async () => {
    const fpf = new FalsePositiveFilter(makeConfig())

    const result = await fpf.filterVulnerability(makeVuln({ severity: 'none' }), genericComponent(), context)

    expect(result.action).toBe('kept')
  })

  it('honours skipTier1 so a medium that Tier 1 would filter is instead kept', async () => {
    // Skipping Tier 1 removes the only filtering evidence; a medium is not escalate-listed,
    // so it falls through to "kept". Proves the skip flag actually bypasses the tier.
    const fpf = new FalsePositiveFilter(makeConfig())

    const result = await fpf.filterVulnerability(makeVuln({ severity: 'medium' }), makeComponent(), context, {
      skipTier1: true,
    })

    expect(result.action).toBe('kept')
  })

  it('still logs (no throw) when logAllDecisions is enabled but no audit backend is wired', async () => {
    const fpf = new FalsePositiveFilter(makeConfig())
    await fpf.filterVulnerability(makeVuln(), makeComponent(), context)
    // The logger warns exactly once about the missing backend rather than crashing the decision.
    expect(console.warn).toHaveBeenCalled()
  })

  it('does not attempt to log when logAllDecisions is disabled', async () => {
    const config = makeConfig()
    const settings = config.filterSettings
    if (!settings) throw new Error('fixture must define filterSettings')
    settings.audit.logAllDecisions = false
    const fpf = new FalsePositiveFilter(config)

    const result = await fpf.filterVulnerability(makeVuln(), makeComponent(), context)

    expect(result.action).toBe('filtered')
    expect(console.warn).not.toHaveBeenCalled()
  })
})

describe('tier-2 wiring', () => {
  it('builds the attack-graph tier only when interfaces/services are configured', async () => {
    // With interfaces present, construction must wire Tier 2 and still produce a valid result.
    const withGraph = new FalsePositiveFilter(
      makeConfig({ services: { tls: { enabled: true, externalAccess: false, confidence: 90 } } }),
    )
    const a = await withGraph.filterVulnerability(makeVuln({ severity: 'medium' }), genericComponent(), context)
    expect(['filtered', 'kept', 'escalated']).toContain(a.action)

    // With no interfaces AND no services, Tier 2 is absent; a critical still escalates via the net.
    const noGraph = new FalsePositiveFilter(makeConfig({ interfaces: {}, services: {} }))
    const b = await noGraph.filterVulnerability(makeVuln({ severity: 'critical' }), genericComponent(), context)
    expect(b.action).toBe('escalated')
  })

  it('updateConfig rebuilds the tiers, dropping Tier 2 when the new config has no interfaces/services', async () => {
    const fpf = new FalsePositiveFilter(makeConfig())
    fpf.updateConfig(makeConfig({ interfaces: {}, services: {} }))

    // Ethernet interface is gone, so a medium is no longer filterable and is kept.
    const result = await fpf.filterVulnerability(makeVuln({ severity: 'medium' }), makeComponent(), context)
    expect(result.action).toBe('kept')
  })
})

describe('filterBatch', () => {
  it('aggregates totals and per-severity buckets across a mixed batch', async () => {
    const fpf = new FalsePositiveFilter(makeConfig())
    const items = [
      { vulnerability: makeVuln({ id: 'c1', severity: 'critical' }), component: makeComponent() },
      { vulnerability: makeVuln({ id: 'h1', severity: 'high' }), component: makeComponent() },
      { vulnerability: makeVuln({ id: 'm1', severity: 'medium' }), component: makeComponent() },
      { vulnerability: makeVuln({ id: 'l1', severity: 'low' }), component: makeComponent() },
      { vulnerability: makeVuln({ id: 'n1', severity: 'none' }), component: genericComponent() },
    ]

    const batch = await fpf.filterBatch(items, context)

    expect(batch.total).toBe(5)
    expect(batch.results).toHaveLength(5)
    // medium + low suppressed; critical + high escalated; none kept.
    expect(batch.filtered).toBe(2)
    expect(batch.escalated).toBe(2)
    expect(batch.kept).toBe(1)
    // Per-severity buckets: 'none' is intentionally not tracked.
    expect(batch.bySeverity.critical.escalated).toBe(1)
    expect(batch.bySeverity.high.escalated).toBe(1)
    expect(batch.bySeverity.medium.filtered).toBe(1)
    expect(batch.bySeverity.low.filtered).toBe(1)
    expect(batch.processingTimeMs).toBeGreaterThanOrEqual(0)
  })

  it('returns an all-zero result for an empty batch', async () => {
    const fpf = new FalsePositiveFilter(makeConfig())
    const batch = await fpf.filterBatch([], context)
    expect(batch).toMatchObject({ total: 0, filtered: 0, kept: 0, escalated: 0 })
    expect(batch.results).toHaveLength(0)
  })
})

describe('getStatistics', () => {
  it('counts processed/filtered per tier plus escalated and kept totals', () => {
    const fpf = new FalsePositiveFilter(makeConfig())
    const base: Omit<FilterResult, 'tier' | 'action'> = {
      vulnerabilityId: 'v',
      componentId: 'c',
      filterType: 'disabled_interface',
      reason: 'r',
      confidence: 90,
      timestamp: '2026-01-01T00:00:00Z',
    }
    const results: FilterResult[] = [
      { ...base, tier: 1, action: 'filtered' },
      { ...base, tier: 1, action: 'kept' },
      { ...base, tier: 2, action: 'filtered' },
      { ...base, tier: 2, action: 'escalated' },
    ]

    const stats = fpf.getStatistics(results)

    expect(stats.tier1Processed).toBe(2)
    expect(stats.tier1Filtered).toBe(1)
    expect(stats.tier2Processed).toBe(2)
    expect(stats.tier2Filtered).toBe(1)
    expect(stats.escalated).toBe(1)
    expect(stats.kept).toBe(1)
    expect(stats.totalProcessed).toBe(4)
  })
})

describe('audit delegation without a persistence backend', () => {
  // The class accepts an optional db; when absent the audit queries must degrade safely
  // (empty trail, integrity reported as intact-but-empty) rather than throw. Real persistence
  // behaviour is covered by filterAuditLogger.test.ts.
  it('reports an empty, still-valid audit trail and does not throw on any audit query', async () => {
    const fpf = new FalsePositiveFilter(makeConfig())

    await expect(fpf.getAuditLog('proj-1')).resolves.toEqual([])
    await expect(fpf.getLowConfidenceDecisions(70)).resolves.toEqual([])
    await expect(fpf.undoDecision('nonexistent', { id: 'u', name: 'U', role: 'admin' })).resolves.toBeUndefined()

    const integrity = await fpf.verifyIntegrity()
    expect(integrity.valid).toBe(true)
    expect(integrity.tamperedEvents).toEqual([])
  })
})

describe('isLLMAvailable', () => {
  it('reports the LLM tier as unavailable (opt-in, off by default)', () => {
    const fpf = new FalsePositiveFilter(makeConfig())
    expect(fpf.isLLMAvailable()).toBe(false)
  })
})
