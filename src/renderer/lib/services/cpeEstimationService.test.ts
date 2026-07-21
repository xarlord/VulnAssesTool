import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CPEEstimationService,
  getCPEEstimationService,
  resetCPEEstimationService,
  toAmbiguousComponent,
  toAmbiguousComponents,
} from './cpeEstimationService'
import type { EstimationResult } from './cpeEstimationService'
import type { Component } from '@@/types'
import type { CPEMatchResult } from '../generators/excelParser'

// Mock cpeUtils
vi.mock('../utils/cpeUtils', () => ({
  suggestCPEs: vi.fn(() => []),
}))

// Reset singleton between tests
beforeEach(() => {
  resetCPEEstimationService()
})

const makeComponent = (overrides: Partial<Component> = {}): Component => ({
  id: 'comp-1',
  name: 'react',
  version: '18.0.0',
  type: 'library',
  licenses: [],
  vulnerabilities: [],
  ...overrides,
})

describe('CPEEstimationService', () => {
  describe('estimateCPEs', () => {
    it('returns empty array when componentName is empty', async () => {
      const service = new CPEEstimationService()
      const result = await service.estimateCPEs('', '1.0.0')
      expect(result).toEqual([])
    })

    it('returns empty array when version is empty', async () => {
      const service = new CPEEstimationService()
      const result = await service.estimateCPEs('react', '')
      expect(result).toEqual([])
    })

    it('returns empty array when both are empty', async () => {
      const service = new CPEEstimationService()
      const result = await service.estimateCPEs('', '')
      expect(result).toEqual([])
    })

    it('filters low confidence suggestions when includeLowConfidence is false', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:facebook:react:18.0.0:*:*:*:*:*:*:*',
          vendor: 'facebook',
          product: 'react',
          confidence: 'low',
          source: 'known_mapping',
        },
        {
          cpe: 'cpe:2.3:a:facebook:react:18.0.0:*:*:*:*:*:*:*',
          vendor: 'facebook',
          product: 'react',
          confidence: 'high',
          source: 'known_mapping',
        },
      ])

      const service = new CPEEstimationService({ includeLowConfidence: false })
      const result = await service.estimateCPEs('react', '18.0.0')

      expect(result).toHaveLength(1)
      expect(result[0].confidence).toBe('high')
    })

    it('includes low confidence suggestions when includeLowConfidence is true', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*',
          vendor: 'vendor',
          product: 'product',
          confidence: 'low',
          source: 'fallback',
        },
      ])

      const service = new CPEEstimationService({ includeLowConfidence: true })
      const result = await service.estimateCPEs('product', '1.0')

      expect(result).toHaveLength(1)
      expect(result[0].confidence).toBe('low')
    })

    it('converts confidence levels to match scores', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:v:p:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'p',
          confidence: 'high',
          source: 'known_mapping',
        },
        {
          cpe: 'cpe:2.3:a:v:p:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'p2',
          confidence: 'medium',
          source: 'inferred',
        },
        {
          cpe: 'cpe:2.3:a:v:p:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'p3',
          confidence: 'low',
          source: 'fallback',
        },
      ])

      const service = new CPEEstimationService({ includeLowConfidence: true })
      const result = await service.estimateCPEs('p', '1.0')

      expect(result.find((r) => r.product === 'p')?.matchScore).toBe(90)
      expect(result.find((r) => r.product === 'p2')?.matchScore).toBe(70)
      expect(result.find((r) => r.product === 'p3')?.matchScore).toBe(40)
    })

    it('uses external search function to verify and adjust confidence', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:known:product:1.0:*:*:*:*:*:*:*',
          vendor: 'known',
          product: 'product',
          confidence: 'high',
          source: 'known_mapping',
        },
      ])

      const externalFn = vi.fn().mockResolvedValue([
        {
          cpe: 'cpe:2.3:a:known:product:1.0:*:*:*:*:*:*:*',
          vendor: 'known',
          product: 'product',
          confidence: 'high' as const,
          matchScore: 90,
        },
        {
          cpe: 'cpe:2.3:a:other:product:2.0:*:*:*:*:*:*:*',
          vendor: 'other',
          product: 'product',
          confidence: 'medium' as const,
          matchScore: 70,
        },
      ])

      const service = new CPEEstimationService({ externalSearchFn: externalFn })
      const result = await service.estimateCPEs('product', '1.0')

      expect(result.length).toBeGreaterThanOrEqual(1)
      expect(externalFn).toHaveBeenCalledWith('product', 5)
      const knownMatch = result.find((r) => r.vendor === 'known')
      expect(knownMatch?.confidence).toBe('high')
      expect(knownMatch?.matchScore).toBe(90)
    })

    it('surfaces version-mismatched product CPEs as selectable partials when NVD has no exact version', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([]) // no heuristic mapping (e.g. jasper)

      // NVD has jasper 2.0.1 / 2.0.12 / 1.900.13 / version-agnostic — but no exact "2.0".
      const externalFn = vi.fn().mockResolvedValue(
        [
          'cpe:2.3:a:jasper_project:jasper:2.0.1:*:*:*:*:*:*:*',
          'cpe:2.3:a:jasper_project:jasper:2.0.12:*:*:*:*:*:*:*',
          'cpe:2.3:a:jasper_project:jasper:1.900.13:*:*:*:*:*:*:*',
          'cpe:2.3:a:jasper_project:jasper:*:*:*:*:*:*:*:*',
        ].map((cpe) => ({
          cpe,
          vendor: 'jasper_project',
          product: 'jasper',
          confidence: 'high' as const,
          matchScore: 90,
        })),
      )

      const service = new CPEEstimationService({ includeLowConfidence: true, externalSearchFn: externalFn })
      const result = await service.estimateCPEs('jasper', '2.0')

      // Each distinct version is offered (deduped by full CPE, not just product),
      // so the user can pick the closest one instead of one being silently chosen.
      expect(result.map((r) => r.cpe)).toEqual(
        expect.arrayContaining([
          'cpe:2.3:a:jasper_project:jasper:2.0.1:*:*:*:*:*:*:*',
          'cpe:2.3:a:jasper_project:jasper:2.0.12:*:*:*:*:*:*:*',
          'cpe:2.3:a:jasper_project:jasper:1.900.13:*:*:*:*:*:*:*',
        ]),
      )
      // No exact "2.0" CPE exists, so nothing may be auto-selected (>= 80) — the
      // matches must be shown for the user to choose from.
      expect(result.every((r) => r.matchScore < 80)).toBe(true)
      // Same-family versions (2.0.x) rank above the unrelated 1.900.x.
      const v2Score = result.find((r) => r.cpe.includes(':2.0.1:'))?.matchScore ?? 0
      const v1900Score = result.find((r) => r.cpe.includes(':1.900.13:'))?.matchScore ?? 0
      expect(v2Score).toBeGreaterThan(v1900Score)
    })

    it('gracefully handles external search failure', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([])

      const externalFn = vi.fn().mockRejectedValue(new Error('Network error'))

      const service = new CPEEstimationService({ externalSearchFn: externalFn })
      const result = await service.estimateCPEs('product', '1.0')

      // Should not throw, just returns what it has
      expect(result).toEqual([])
    })

    it('sorts results by matchScore descending', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:v:low:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'low',
          confidence: 'low',
          source: 'fallback',
        },
        {
          cpe: 'cpe:2.3:a:v:high:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'high',
          confidence: 'high',
          source: 'known_mapping',
        },
        {
          cpe: 'cpe:2.3:a:v:med:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'med',
          confidence: 'medium',
          source: 'inferred',
        },
      ])

      const service = new CPEEstimationService({ includeLowConfidence: true })
      const result = await service.estimateCPEs('p', '1.0')

      expect(result[0].matchScore).toBeGreaterThanOrEqual(result[1].matchScore)
      expect(result[1].matchScore).toBeGreaterThanOrEqual(result[2].matchScore)
    })

    it('limits results to maxResultsPerComponent', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:v:high:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'high',
          confidence: 'high',
          source: 'known_mapping',
        },
        {
          cpe: 'cpe:2.3:a:v:med:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'med',
          confidence: 'medium',
          source: 'inferred',
        },
        {
          cpe: 'cpe:2.3:a:v:low:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'low',
          confidence: 'low',
          source: 'fallback',
        },
      ])

      const service = new CPEEstimationService({ maxResultsPerComponent: 2, includeLowConfidence: true })
      const result = await service.estimateCPEs('p', '1.0')

      expect(result).toHaveLength(2)
    })
  })

  describe('estimateComponents', () => {
    it('skips components that already have a CPE', async () => {
      const service = new CPEEstimationService()
      const components = [
        makeComponent({ id: 'comp-1', cpe: 'cpe:2.3:a:v:p:1.0:*:*:*:*:*:*:*' }),
        makeComponent({ id: 'comp-2' }),
      ]

      const results = await service.estimateComponents(components)

      // Only comp-2 should be estimated (comp-1 has CPE)
      expect(results).toHaveLength(1)
      expect(results[0].componentId).toBe('comp-2')
    })

    it('skips components without a version', async () => {
      const service = new CPEEstimationService()
      const components = [makeComponent({ id: 'comp-1', version: '' })]

      const results = await service.estimateComponents(components)
      expect(results).toHaveLength(0)
    })

    it('auto-selects CPE when exactly one high-confidence match exists', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:facebook:react:18.0.0:*:*:*:*:*:*:*',
          vendor: 'facebook',
          product: 'react',
          confidence: 'high',
          source: 'known_mapping',
        },
      ])

      const service = new CPEEstimationService({ autoSelectThreshold: 80 })
      const results = await service.estimateComponents([makeComponent()])

      expect(results).toHaveLength(1)
      expect(results[0].autoSelected).toBe('cpe:2.3:a:facebook:react:18.0.0:*:*:*:*:*:*:*')
      expect(results[0].needsUserConfirmation).toBe(false)
    })

    it('requires user confirmation when no high-confidence match', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:v:p:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'p',
          confidence: 'medium',
          source: 'inferred',
        },
      ])

      const service = new CPEEstimationService({ autoSelectThreshold: 80 })
      const results = await service.estimateComponents([makeComponent()])

      expect(results).toHaveLength(1)
      expect(results[0].autoSelected).toBeUndefined()
      expect(results[0].needsUserConfirmation).toBe(true)
    })

    it('requires user confirmation when multiple high-confidence matches exist', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:v:p1:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'p1',
          confidence: 'high',
          source: 'known_mapping',
        },
        {
          cpe: 'cpe:2.3:a:v:p2:1.0:*:*:*:*:*:*:*',
          vendor: 'v',
          product: 'p2',
          confidence: 'high',
          source: 'known_mapping',
        },
      ])

      const service = new CPEEstimationService({ autoSelectThreshold: 80 })
      const results = await service.estimateComponents([makeComponent()])

      expect(results).toHaveLength(1)
      expect(results[0].autoSelected).toBeUndefined()
      expect(results[0].needsUserConfirmation).toBe(true)
    })
  })

  describe('assignCPEs', () => {
    it('assigns selected CPE to matching components', async () => {
      const service = new CPEEstimationService()
      const components = [makeComponent({ id: 'comp-1' }), makeComponent({ id: 'comp-2' })]

      const selections = new Map<string, string>()
      selections.set('comp-1', 'cpe:2.3:a:assigned:cpe:1.0:*:*:*:*:*:*:*')

      const result = await service.assignCPEs(components, selections)

      expect(result[0].cpe).toBe('cpe:2.3:a:assigned:cpe:1.0:*:*:*:*:*:*:*')
      expect(result[1].cpe).toBeUndefined()
    })

    it('returns unchanged components when no selections match', async () => {
      const service = new CPEEstimationService()
      const components = [makeComponent({ id: 'comp-1' })]

      const selections = new Map<string, string>()
      selections.set('comp-999', 'cpe:2.3:a:v:p:1.0:*:*:*:*:*:*:*')

      const result = await service.assignCPEs(components, selections)

      expect(result[0].cpe).toBeUndefined()
    })
  })

  describe('getBatchSummary', () => {
    it('calculates correct summary for mixed results', () => {
      const service = new CPEEstimationService()
      const results: EstimationResult[] = [
        {
          componentId: '1',
          componentName: 'a',
          componentVersion: '1.0',
          estimatedCPEs: [{ cpe: 'cpe1', vendor: 'v', product: 'p', confidence: 'high', matchScore: 90 }],
          autoSelected: 'cpe1',
          needsUserConfirmation: false,
        },
        {
          componentId: '2',
          componentName: 'b',
          componentVersion: '2.0',
          estimatedCPEs: [
            { cpe: 'cpe2', vendor: 'v', product: 'p', confidence: 'medium', matchScore: 70 },
            { cpe: 'cpe3', vendor: 'v', product: 'p', confidence: 'medium', matchScore: 65 },
          ],
          needsUserConfirmation: true,
        },
        {
          componentId: '3',
          componentName: 'c',
          componentVersion: '3.0',
          estimatedCPEs: [],
          needsUserConfirmation: true,
        },
      ]

      const summary = service.getBatchSummary(results)

      expect(summary.totalProcessed).toBe(3)
      expect(summary.autoSelectedCount).toBe(1)
      expect(summary.needsConfirmationCount).toBe(1) // only comp-2 has CPEs and needs confirmation
      expect(summary.noMatchCount).toBe(1) // comp-3 has no CPEs
    })

    it('returns all zeros for empty results', () => {
      const service = new CPEEstimationService()
      const summary = service.getBatchSummary([])

      expect(summary.totalProcessed).toBe(0)
      expect(summary.autoSelectedCount).toBe(0)
      expect(summary.needsConfirmationCount).toBe(0)
      expect(summary.noMatchCount).toBe(0)
    })
  })
})

describe('getCPEEstimationService / resetCPEEstimationService', () => {
  it('returns a singleton instance', () => {
    const a = getCPEEstimationService()
    const b = getCPEEstimationService()
    expect(a).toBe(b)
  })

  it('creates a new instance after reset', () => {
    const first = getCPEEstimationService()
    resetCPEEstimationService()
    const second = getCPEEstimationService()
    expect(first).not.toBe(second)
  })

  it('passes options to the first instance', () => {
    const service = getCPEEstimationService({ autoSelectThreshold: 95 })
    expect(service).toBeDefined()
    resetCPEEstimationService()
  })
})

describe('toAmbiguousComponent', () => {
  it('converts EstimationResult to AmbiguousComponent', () => {
    const result: EstimationResult = {
      componentId: 'c1',
      componentName: 'react',
      componentVersion: '18.0.0',
      estimatedCPEs: [{ cpe: 'cpe1', vendor: 'v', product: 'p', confidence: 'high', matchScore: 90 }],
      needsUserConfirmation: true,
    }

    const ambiguous = toAmbiguousComponent(result)

    expect(ambiguous.componentId).toBe('c1')
    expect(ambiguous.componentName).toBe('react')
    expect(ambiguous.componentVersion).toBe('18.0.0')
    expect(ambiguous.estimatedCPEs).toHaveLength(1)
    expect(ambiguous.needsUserConfirmation).toBe(true)
  })
})

describe('toAmbiguousComponents', () => {
  it('filters to only results needing user confirmation with CPEs', () => {
    const results: EstimationResult[] = [
      {
        componentId: '1',
        componentName: 'a',
        componentVersion: '1.0',
        estimatedCPEs: [{ cpe: 'cpe1', vendor: 'v', product: 'p', confidence: 'high', matchScore: 90 }],
        autoSelected: 'cpe1',
        needsUserConfirmation: false,
      },
      {
        componentId: '2',
        componentName: 'b',
        componentVersion: '2.0',
        estimatedCPEs: [{ cpe: 'cpe2', vendor: 'v', product: 'p', confidence: 'medium', matchScore: 70 }],
        needsUserConfirmation: true,
      },
      {
        componentId: '3',
        componentName: 'c',
        componentVersion: '3.0',
        estimatedCPEs: [],
        needsUserConfirmation: true,
      },
    ]

    const ambiguous = toAmbiguousComponents(results)

    // Only result #2 matches: needs confirmation AND has CPEs
    expect(ambiguous).toHaveLength(1)
    expect(ambiguous[0].componentId).toBe('2')
  })

  it('returns empty array when no results need confirmation', () => {
    const results: EstimationResult[] = []
    expect(toAmbiguousComponents(results)).toEqual([])
  })
})
