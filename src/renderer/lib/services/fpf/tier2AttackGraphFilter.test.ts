/**
 * Tier 2 Attack Graph Filter Tests
 *
 * Unit tests for Tier2AttackGraphFilter covering:
 * - analyze: reachable / unreachable / blocked / escalated paths
 * - calculateConfidence: all branch paths (reachable with paths, short paths, long paths,
 *   unreachable with blockers, unreachable without blockers)
 * - getComponentIdentifier (via analyze): name, CPE, purl, and fallback-to-ID branches
 * - analyzeBatch: batch processing
 * - getSummary: summary statistics
 *
 * @module fpf/tier2AttackGraphFilter.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Tier2AttackGraphFilter } from './tier2AttackGraphFilter'
import type { ReachabilityResult } from '../../../../shared/types/fpf'
import type { Vulnerability, Component } from '../../../../shared/types'

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockVulnerability = (overrides: Partial<Vulnerability> = {}): Vulnerability => ({
  id: 'CVE-2024-12345',
  source: 'nvd',
  severity: 'medium',
  cvssScore: 5.5,
  description: 'A buffer overflow vulnerability',
  references: [],
  affectedComponents: ['comp-1'],
  ...overrides,
})

const createMockComponent = (overrides: Partial<Component> = {}): Component => ({
  id: 'comp-1',
  name: 'Audio Codec Library',
  version: '1.2.3',
  type: 'library',
  licenses: ['MIT'],
  vulnerabilities: [],
  ...overrides,
})

/**
 * Create a mock ReachabilityResult. Defaults to unreachable with no blockers.
 */
const createMockReachability = (overrides: Partial<ReachabilityResult> = {}): ReachabilityResult => ({
  reachable: false,
  paths: [],
  shortestPath: null,
  blockedBy: [],
  confidence: 80,
  ...overrides,
})

// We mock the AttackGraph module so isReachableFromExternal is controlled.
// The constructor accepts an AttackGraph instance; we use vi.fn() on the method.
const createMockGraph = () => ({
  isReachableFromExternal: vi.fn<() => ReachabilityResult>(),
})

// ============================================================================
// TESTS
// ============================================================================

describe('Tier2AttackGraphFilter', () => {
  let filter: Tier2AttackGraphFilter
  let mockGraph: ReturnType<typeof createMockGraph>

  beforeEach(() => {
    mockGraph = createMockGraph()
    filter = new Tier2AttackGraphFilter(mockGraph as never)
  })

  // ==========================================================================
  // CONSTRUCTOR
  // ==========================================================================

  describe('constructor', () => {
    it('should create an instance with the provided graph', () => {
      expect(filter).toBeInstanceOf(Tier2AttackGraphFilter)
    })
  })

  // ==========================================================================
  // ANALYZE — REACHABLE COMPONENT
  // ==========================================================================

  describe('analyze — reachable component', () => {
    it('should keep vulnerability when component is reachable with paths', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(
        createMockReachability({
          reachable: true,
          paths: [['entry:wifi', 'service:wpa', 'comp-1']],
          shortestPath: ['entry:wifi', 'service:wpa', 'comp-1'],
          confidence: 85,
        }),
      )

      const result = filter.analyze(createMockVulnerability(), createMockComponent())

      expect(result.action).toBe('kept')
      expect(result.tier).toBe(2)
      expect(result.filterType).toBe('attack_path_blocked')
      expect(result.reason).toContain('1 path(s)')
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should keep vulnerability when reachable via multiple paths', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(
        createMockReachability({
          reachable: true,
          paths: [
            ['a', 'b'],
            ['c', 'd'],
          ],
          shortestPath: ['a', 'b'],
          confidence: 70,
        }),
      )

      const result = filter.analyze(createMockVulnerability(), createMockComponent())

      expect(result.action).toBe('kept')
      expect(result.reason).toContain('2 path(s)')
    })
  })

  // ==========================================================================
  // ANALYZE — UNREACHABLE COMPONENT
  // ==========================================================================

  describe('analyze — unreachable component', () => {
    it('should filter as internal_only when not reachable and no blockers', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(
        createMockReachability({
          reachable: false,
          blockedBy: [],
          confidence: 90,
        }),
      )

      const vuln = createMockVulnerability({ severity: 'medium' })
      const component = createMockComponent({ name: 'Internal Lib' })
      const result = filter.analyze(vuln, component)

      expect(result.action).toBe('filtered')
      expect(result.filterType).toBe('internal_only')
      expect(result.reason).toContain('Internal Lib')
      expect(result.reason).toContain('not reachable')
      expect(result.attackPathsBlocked).toBeUndefined()
    })

    it('should filter as attack_path_blocked when blockedBy has entries', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(
        createMockReachability({
          reachable: false,
          blockedBy: ['firewall', 'disabled_service'],
          confidence: 85,
        }),
      )

      const result = filter.analyze(createMockVulnerability({ severity: 'low' }), createMockComponent())

      expect(result.action).toBe('filtered')
      expect(result.filterType).toBe('attack_path_blocked')
      expect(result.reason).toContain('firewall')
      expect(result.reason).toContain('disabled_service')
      expect(result.attackPathsBlocked).toEqual(['firewall', 'disabled_service'])
    })

    it('should omit attackPathsBlocked when blockedBy is empty', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(
        createMockReachability({
          reachable: false,
          blockedBy: [],
          confidence: 80,
        }),
      )

      const result = filter.analyze(createMockVulnerability({ severity: 'low' }), createMockComponent())

      expect(result.attackPathsBlocked).toBeUndefined()
    })
  })

  // ==========================================================================
  // ANALYZE — HIGH-SEVERITY ESCALATION
  // ==========================================================================

  describe('analyze — high-severity escalation', () => {
    it('should escalate critical severity even when unreachable', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(
        createMockReachability({
          reachable: false,
          blockedBy: [],
          confidence: 90,
        }),
      )

      const result = filter.analyze(createMockVulnerability({ severity: 'critical' }), createMockComponent())

      expect(result.action).toBe('escalated')
      expect(result.reason).toContain('High-severity')
      expect(result.reason).toContain('requires review')
    })

    it('should escalate high severity even when unreachable with blockers', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(
        createMockReachability({
          reachable: false,
          blockedBy: ['firewall'],
          confidence: 90,
        }),
      )

      const result = filter.analyze(createMockVulnerability({ severity: 'high' }), createMockComponent())

      expect(result.action).toBe('escalated')
      expect(result.reason).toContain('High-severity')
    })

    it('should not escalate medium severity when unreachable', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(
        createMockReachability({
          reachable: false,
          blockedBy: [],
          confidence: 80,
        }),
      )

      const result = filter.analyze(createMockVulnerability({ severity: 'medium' }), createMockComponent())

      expect(result.action).toBe('filtered')
    })

    it('should not escalate low severity when unreachable', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(
        createMockReachability({
          reachable: false,
          blockedBy: [],
          confidence: 80,
        }),
      )

      const result = filter.analyze(createMockVulnerability({ severity: 'low' }), createMockComponent())

      expect(result.action).toBe('filtered')
    })
  })

  // ==========================================================================
  // ANALYZE — RESULT SHAPE
  // ==========================================================================

  describe('analyze — result shape', () => {
    it('should return all required fields', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(createMockReachability({ reachable: false, confidence: 80 }))

      const result = filter.analyze(createMockVulnerability(), createMockComponent())

      expect(result).toHaveProperty('vulnerabilityId', 'CVE-2024-12345')
      expect(result).toHaveProperty('componentId', 'comp-1')
      expect(result).toHaveProperty('action')
      expect(result).toHaveProperty('tier', 2)
      expect(result).toHaveProperty('filterType')
      expect(result).toHaveProperty('reason')
      expect(result).toHaveProperty('confidence')
      expect(result).toHaveProperty('timestamp')
    })

    it('should use current timestamp', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(createMockReachability({ reachable: false }))

      const before = new Date().toISOString()
      const result = filter.analyze(createMockVulnerability(), createMockComponent())
      const after = new Date().toISOString()

      expect(result.timestamp >= before).toBe(true)
      expect(result.timestamp <= after).toBe(true)
    })
  })

  // ==========================================================================
  // CALCULATE CONFIDENCE — REACHABLE PATHS
  // ==========================================================================

  describe('calculateConfidence', () => {
    it('should boost confidence for reachable results with multiple paths', () => {
      const result = createMockReachability({
        reachable: true,
        paths: [
          ['a', 'b'],
          ['c', 'd'],
          ['e', 'f'],
        ],
        shortestPath: null,
        confidence: 70,
      })

      // 70 + (3 paths * 5) = 85
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(85)
    })

    it('should cap confidence at 100 when paths boost exceeds max', () => {
      const result = createMockReachability({
        reachable: true,
        paths: Array.from({ length: 10 }, (_, i) => [`path${i}`]),
        shortestPath: null,
        confidence: 90,
      })

      // 90 + (10 * 5) = 140 → capped at 100
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(100)
    })

    it('should add 10 for short path (length <= 2) when reachable', () => {
      // Line 113 coverage: pathLength <= 2 branch
      const result = createMockReachability({
        reachable: true,
        paths: [['a', 'b']],
        shortestPath: ['a', 'b'], // length 2 → triggers +10
        confidence: 70,
      })

      // 70 + (1 * 5) + 10 = 85
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(85)
    })

    it('should add 10 for shortest path of length 1', () => {
      const result = createMockReachability({
        reachable: true,
        paths: [['a']],
        shortestPath: ['a'], // length 1 → triggers +10
        confidence: 60,
      })

      // 60 + (1 * 5) + 10 = 75
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(75)
    })

    it('should reduce confidence for long paths (length > 5) when reachable', () => {
      const result = createMockReachability({
        reachable: true,
        paths: [['a', 'b', 'c', 'd', 'e', 'f', 'g']], // 7 items
        shortestPath: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], // length 7 → (7-5)*5 = 10 penalty
        confidence: 80,
      })

      // 80 + (1*5) - 10 = 75
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(75)
    })

    it('should not reduce confidence below 50 for very long paths', () => {
      const longPath = Array.from({ length: 20 }, (_, i) => `node${i}`)
      const result = createMockReachability({
        reachable: true,
        paths: [longPath],
        shortestPath: longPath, // length 20 → (20-5)*5 = 75 penalty
        confidence: 55,
      })

      // 55 + 5 - 75 = -15 → max(50, -15) = 50
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(50)
    })

    it('should not adjust confidence for medium path length (3-5) when reachable', () => {
      const result = createMockReachability({
        reachable: true,
        paths: [['a', 'b', 'c', 'd']], // 4 items
        shortestPath: ['a', 'b', 'c', 'd'], // length 4 → no bonus, no penalty
        confidence: 75,
      })

      // 75 + (1*5) = 80 (no short-path bonus, no long-path penalty)
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(80)
    })

    it('should handle reachable with no shortestPath', () => {
      const result = createMockReachability({
        reachable: true,
        paths: [['a', 'b']],
        shortestPath: null,
        confidence: 70,
      })

      // 70 + (1*5) = 75, no shortestPath bonus
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(75)
    })

    it('should handle reachable with empty shortestPath array', () => {
      const result = createMockReachability({
        reachable: true,
        paths: [],
        shortestPath: [], // empty array → length 0 → does not enter if block
        confidence: 70,
      })

      // 70 + 0 = 70 (no path bonus since paths is empty)
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(70)
    })

    // --- UNREACHABLE BRANCHES ---

    it('should boost confidence by 15 for unreachable with blockers', () => {
      const result = createMockReachability({
        reachable: false,
        blockedBy: ['firewall'],
        confidence: 75,
      })

      // 75 + 15 = 90
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(90)
    })

    it('should cap at 100 for unreachable with blockers and high base confidence', () => {
      const result = createMockReachability({
        reachable: false,
        blockedBy: ['firewall'],
        confidence: 95,
      })

      // 95 + 15 = 110 → capped at 100
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(100)
    })

    it('should not boost confidence for unreachable without blockers', () => {
      const result = createMockReachability({
        reachable: false,
        blockedBy: [],
        confidence: 70,
      })

      // No boost: 70
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(70)
    })

    it('should round confidence to integer', () => {
      const result = createMockReachability({
        reachable: false,
        confidence: 73.7,
      })

      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(74)
    })

    it('should clamp negative confidence to 0', () => {
      const result = createMockReachability({
        reachable: false,
        confidence: -10,
      })

      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(0)
    })

    it('should clamp confidence above 100 to 100', () => {
      const result = createMockReachability({
        reachable: false,
        blockedBy: ['x'],
        confidence: 200,
      })

      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBe(100)
    })
  })

  // ==========================================================================
  // GET COMPONENT IDENTIFIER (private, tested via analyze)
  // Lines 135-160: name → CPE → purl → fallback to ID
  // ==========================================================================

  describe('getComponentIdentifier (via analyze)', () => {
    beforeEach(() => {
      // Default mock: unreachable, no blockers
      mockGraph.isReachableFromExternal.mockReturnValue(createMockReachability({ reachable: false, confidence: 80 }))
    })

    it('should use component name when available', () => {
      const component = createMockComponent({ name: 'MyLib' })
      filter.analyze(createMockVulnerability(), component)

      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('MyLib')
    })

    it('should extract product from CPE when name is empty (lines 142-148)', () => {
      const component = createMockComponent({
        name: '',
        cpe: 'cpe:2.3:a:vendor:openssl:1.1.1:*:*:*:*:*:*:*',
      })
      filter.analyze(createMockVulnerability(), component)

      // cpeParts = ['cpe', '2.3', 'a', 'vendor', 'openssl', ...], index 4 = 'openssl'
      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('openssl')
    })

    it('should handle CPE with fewer than 5 parts by falling through to purl', () => {
      const component = createMockComponent({
        name: '',
        cpe: 'cpe:2.3', // Only 3 parts → doesn't have index 4
        purl: 'pkg:npm/lodash@4.17.21',
      })
      filter.analyze(createMockVulnerability(), component)

      // Falls through to purl parsing
      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('lodash')
    })

    it('should extract package name from purl when name and CPE fail (lines 150-157)', () => {
      const component = createMockComponent({
        name: '',
        cpe: undefined,
        purl: 'pkg:npm/express@4.18.2',
      })
      filter.analyze(createMockVulnerability(), component)

      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('express')
    })

    it('should extract package name from purl with namespace', () => {
      const component = createMockComponent({
        name: '',
        cpe: undefined,
        purl: 'pkg:maven/org.apache.commons/lang3@3.12.0',
      })
      filter.analyze(createMockVulnerability(), component)

      // Regex captures everything between first / after type and @: 'org.apache.commons/lang3'
      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('org.apache.commons/lang3')
    })

    it('should handle purl that does not match regex', () => {
      const component = createMockComponent({
        name: '',
        cpe: undefined,
        purl: 'invalid-purl-format',
      })
      filter.analyze(createMockVulnerability(), component)

      // Falls through to ID fallback
      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('comp-1')
    })

    it('should fall back to component ID when name, CPE, and purl all fail (lines 159-160)', () => {
      const component = createMockComponent({
        name: '',
        cpe: undefined,
        purl: undefined,
      })
      filter.analyze(createMockVulnerability(), component)

      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('comp-1')
    })

    it('should prefer name over CPE and purl', () => {
      const component = createMockComponent({
        name: 'PreferredName',
        cpe: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
        purl: 'pkg:npm/something@1.0.0',
      })
      filter.analyze(createMockVulnerability(), component)

      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('PreferredName')
    })

    it('should prefer CPE over purl when name is empty', () => {
      const component = createMockComponent({
        name: '',
        cpe: 'cpe:2.3:a:vendor:myproduct:1.0:*:*:*:*:*:*:*',
        purl: 'pkg:npm/something@1.0.0',
      })
      filter.analyze(createMockVulnerability(), component)

      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('myproduct')
    })
  })

  // ==========================================================================
  // ANALYZE BATCH
  // ==========================================================================

  describe('analyzeBatch', () => {
    it('should analyze multiple vulnerability/component pairs', () => {
      mockGraph.isReachableFromExternal
        .mockReturnValueOnce(createMockReachability({ reachable: false, confidence: 80 }))
        .mockReturnValueOnce(
          createMockReachability({ reachable: true, paths: [['a']], shortestPath: ['a'], confidence: 90 }),
        )

      const items = [
        { vulnerability: createMockVulnerability({ id: 'CVE-1' }), component: createMockComponent({ id: 'c1' }) },
        { vulnerability: createMockVulnerability({ id: 'CVE-2' }), component: createMockComponent({ id: 'c2' }) },
      ]

      const results = filter.analyzeBatch(items)

      expect(results).toHaveLength(2)
      expect(results[0].vulnerabilityId).toBe('CVE-1')
      expect(results[0].action).toBe('filtered')
      expect(results[1].vulnerabilityId).toBe('CVE-2')
      expect(results[1].action).toBe('kept')
    })

    it('should return empty array for empty input', () => {
      const results = filter.analyzeBatch([])

      expect(results).toEqual([])
    })
  })

  // ==========================================================================
  // GET SUMMARY
  // ==========================================================================

  describe('getSummary', () => {
    it('should compute summary statistics correctly', () => {
      mockGraph.isReachableFromExternal
        .mockReturnValueOnce(createMockReachability({ reachable: false, confidence: 80 }))
        .mockReturnValueOnce(
          createMockReachability({ reachable: true, paths: [['a']], shortestPath: ['a'], confidence: 90 }),
        )
        .mockReturnValueOnce(createMockReachability({ reachable: false, confidence: 70 }))

      const results = filter.analyzeBatch([
        {
          vulnerability: createMockVulnerability({ id: 'V1', severity: 'low' }),
          component: createMockComponent({ id: 'c1' }),
        },
        {
          vulnerability: createMockVulnerability({ id: 'V2', severity: 'medium' }),
          component: createMockComponent({ id: 'c2' }),
        },
        {
          vulnerability: createMockVulnerability({ id: 'V3', severity: 'critical' }),
          component: createMockComponent({ id: 'c3' }),
        },
      ])

      const summary = filter.getSummary(results)

      expect(summary.total).toBe(3)
      // V1: low severity, unreachable → filtered
      expect(summary.filtered).toBe(1)
      // V2: medium, reachable → kept
      expect(summary.kept).toBe(1)
      // V3: critical, unreachable → escalated
      expect(summary.escalated).toBe(1)
    })

    it('should return zero averages for empty results', () => {
      const summary = filter.getSummary([])

      expect(summary.total).toBe(0)
      expect(summary.filtered).toBe(0)
      expect(summary.kept).toBe(0)
      expect(summary.escalated).toBe(0)
      expect(summary.avgConfidence).toBe(0)
    })

    it('should compute average confidence rounded to 1 decimal', () => {
      mockGraph.isReachableFromExternal
        .mockReturnValueOnce(createMockReachability({ reachable: false, confidence: 80 }))
        .mockReturnValueOnce(createMockReachability({ reachable: false, confidence: 90 }))

      const results = filter.analyzeBatch([
        { vulnerability: createMockVulnerability({ severity: 'low' }), component: createMockComponent({ id: 'c1' }) },
        { vulnerability: createMockVulnerability({ severity: 'low' }), component: createMockComponent({ id: 'c2' }) },
      ])

      const summary = filter.getSummary(results)

      // Both filtered as low severity; confidence values after calculateConfidence
      expect(summary.avgConfidence).toBeGreaterThan(0)
      // Check it's rounded to 1 decimal place
      const decimalPart = summary.avgConfidence.toString().split('.')[1]
      if (decimalPart) {
        expect(decimalPart.length).toBeLessThanOrEqual(1)
      }
    })

    it('should count all actions correctly in mixed batch', () => {
      mockGraph.isReachableFromExternal
        .mockReturnValueOnce(createMockReachability({ reachable: false, confidence: 80 }))
        .mockReturnValueOnce(
          createMockReachability({ reachable: true, paths: [['a']], shortestPath: ['a'], confidence: 85 }),
        )
        .mockReturnValueOnce(createMockReachability({ reachable: false, confidence: 90 }))
        .mockReturnValueOnce(createMockReachability({ reachable: false, confidence: 85 }))

      const results = filter.analyzeBatch([
        {
          vulnerability: createMockVulnerability({ severity: 'low', id: 'V1' }),
          component: createMockComponent({ id: 'c1' }),
        },
        {
          vulnerability: createMockVulnerability({ severity: 'medium', id: 'V2' }),
          component: createMockComponent({ id: 'c2' }),
        },
        {
          vulnerability: createMockVulnerability({ severity: 'critical', id: 'V3' }),
          component: createMockComponent({ id: 'c3' }),
        },
        {
          vulnerability: createMockVulnerability({ severity: 'high', id: 'V4' }),
          component: createMockComponent({ id: 'c4' }),
        },
      ])

      const summary = filter.getSummary(results)

      expect(summary.total).toBe(4)
      expect(summary.filtered).toBe(1) // V1 low, unreachable
      expect(summary.kept).toBe(1) // V2 medium, reachable
      expect(summary.escalated).toBe(2) // V3 critical + V4 high, both unreachable
    })
  })

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle component with only CPE and no name or purl', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(createMockReachability({ reachable: false, confidence: 80 }))

      const component = createMockComponent({
        name: '',
        cpe: 'cpe:2.3:a:apache:tomcat:9.0.0:*:*:*:*:*:*:*',
        purl: undefined,
      })
      const result = filter.analyze(createMockVulnerability({ severity: 'low' }), component)

      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('tomcat')
      expect(result.action).toBe('filtered')
    })

    it('should handle component with empty strings for all identifiers', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(createMockReachability({ reachable: false, confidence: 80 }))

      const component = createMockComponent({
        name: '',
        cpe: '',
        purl: '',
        id: 'fallback-id',
      })
      filter.analyze(createMockVulnerability({ severity: 'low' }), component)

      // Empty name is falsy → tries CPE (empty string, split gives [''] → length 1 < 5)
      // → tries purl (empty string, no regex match) → falls back to id
      expect(mockGraph.isReachableFromExternal).toHaveBeenCalledWith('fallback-id')
    })

    it('should handle vulnerability with none severity', () => {
      mockGraph.isReachableFromExternal.mockReturnValue(createMockReachability({ reachable: false, confidence: 80 }))

      const result = filter.analyze(createMockVulnerability({ severity: 'none' }), createMockComponent())

      // 'none' is not 'critical' or 'high', so no escalation
      expect(result.action).toBe('filtered')
    })

    it('should handle zero-confidence reachability result', () => {
      const result = filter.calculateConfidence(createMockReachability({ reachable: false, confidence: 0 }))

      expect(result).toBe(0)
    })

    it('should handle very large confidence values', () => {
      const result = filter.calculateConfidence(
        createMockReachability({ reachable: true, paths: [], shortestPath: null, confidence: 150 }),
      )

      expect(result).toBe(100)
    })
  })
})
