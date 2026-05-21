import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  CPEEstimationPipeline,
  getCPEEstimationPipeline,
  resetCPEEstimationPipeline,
  estimateCpesForComponents,
} from './cpeEstimationPipeline'
import type { PipelineResult } from './cpeEstimationPipeline'
import type { Component } from '@@/types'

// Mock cpeUtils (dependency of cpeEstimationService)
vi.mock('../utils/cpeUtils', () => ({
  suggestCPEs: vi.fn(() => []),
}))

// Reset singletons between tests
beforeEach(() => {
  resetCPEEstimationPipeline()
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

const highConfidenceMatch = {
  cpe: 'cpe:2.3:a:facebook:react:18.0.0:*:*:*:*:*:*:*',
  vendor: 'facebook',
  product: 'react',
  confidence: 'high' as const,
  matchScore: 90,
}

const mediumConfidenceMatch = {
  cpe: 'cpe:2.3:a:some:react:18.0.0:*:*:*:*:*:*:*',
  vendor: 'some',
  product: 'react',
  confidence: 'medium' as const,
  matchScore: 70,
}

describe('CPEEstimationPipeline', () => {
  describe('run', () => {
    it('separates components with and without CPEs', async () => {
      const pipeline = new CPEEstimationPipeline()
      const components = [
        makeComponent({ id: 'c1', cpe: 'cpe:2.3:a:existing:cpe:1.0:*:*:*:*:*:*:*' }),
        makeComponent({ id: 'c2' }),
      ]

      // Mock suggestCPEs to return nothing for simplicity
      const result = await pipeline.run(components)

      expect(result.summary.alreadyHadCpe).toBe(1)
      expect(result.estimationResults).toHaveLength(1)
      expect(result.estimationResults[0].componentId).toBe('c2')
    })

    it('auto-selects CPE for single high-confidence match', async () => {
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

      const pipeline = new CPEEstimationPipeline()
      const result = await pipeline.run([makeComponent()])

      const updatedComp = result.components.find((c) => c.id === 'comp-1')
      expect(updatedComp?.cpe).toBe('cpe:2.3:a:facebook:react:18.0.0:*:*:*:*:*:*:*')
      expect(updatedComp?.hasMissingCpe).toBe(false)
      expect(result.summary.autoSelected).toBe(1)
    })

    it('flags component as ambiguous when multiple matches but no auto-select', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([
        {
          cpe: 'cpe:2.3:a:a:react:18.0:*:*:*:*:*:*:*',
          vendor: 'a',
          product: 'react',
          confidence: 'medium',
          source: 'inferred',
        },
        {
          cpe: 'cpe:2.3:a:b:react:18.0:*:*:*:*:*:*:*',
          vendor: 'b',
          product: 'react',
          confidence: 'medium',
          source: 'inferred',
        },
      ])

      const pipeline = new CPEEstimationPipeline()
      const result = await pipeline.run([makeComponent()])

      const updatedComp = result.components.find((c) => c.id === 'comp-1')
      expect(updatedComp?.cpe).toBeUndefined()
      expect(updatedComp?.hasMissingCpe).toBe(true)
      expect(updatedComp?.suggestedCpes).toHaveLength(2)
      expect(result.ambiguousComponents).toHaveLength(1)
      expect(result.summary.needsConfirmation).toBe(1)
    })

    it('handles no match found case', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      vi.mocked(suggestCPEs).mockReturnValueOnce([])

      const pipeline = new CPEEstimationPipeline()
      const result = await pipeline.run([makeComponent()])

      const updatedComp = result.components.find((c) => c.id === 'comp-1')
      expect(updatedComp?.cpe).toBeUndefined()
      expect(updatedComp?.hasMissingCpe).toBe(true)
      expect(updatedComp?.suggestedCpes).toBeUndefined()
      expect(result.ambiguousComponents).toHaveLength(0)
      expect(result.summary.noMatchFound).toBe(1)
    })

    it('preserves correct summary counts', async () => {
      const { suggestCPEs } = await import('../utils/cpeUtils')
      // First call: comp-2 (auto-select)
      vi.mocked(suggestCPEs)
        .mockReturnValueOnce([
          {
            cpe: 'cpe:2.3:a:facebook:react:18:*:*:*:*:*:*:*',
            vendor: 'facebook',
            product: 'react',
            confidence: 'high',
            source: 'known_mapping',
          },
        ])
        // Second call: comp-3 (no match)
        .mockReturnValueOnce([])

      const pipeline = new CPEEstimationPipeline()
      const components = [
        makeComponent({ id: 'c1', cpe: 'cpe:2.3:a:v:p:1:*:*:*:*:*:*:*' }),
        makeComponent({ id: 'c2' }),
        makeComponent({ id: 'c3', name: 'unknown-lib' }),
      ]

      const result = await pipeline.run(components)

      expect(result.summary.totalProcessed).toBe(3)
      expect(result.summary.alreadyHadCpe).toBe(1)
      expect(result.summary.autoSelected).toBe(1)
      expect(result.summary.noMatchFound).toBe(1)
    })
  })

  describe('applyUserSelections', () => {
    it('assigns selected CPEs to components', () => {
      const pipeline = new CPEEstimationPipeline()
      const components = [makeComponent({ id: 'c1' }), makeComponent({ id: 'c2' })]

      const selections = new Map<string, string>()
      selections.set('c1', 'cpe:2.3:a:chosen:cpe:1.0:*:*:*:*:*:*:*')

      const result = pipeline.applyUserSelections(components, selections)

      expect(result[0].cpe).toBe('cpe:2.3:a:chosen:cpe:1.0:*:*:*:*:*:*:*')
      expect(result[0].hasMissingCpe).toBe(false)
      expect(result[1].cpe).toBeUndefined()
    })

    it('returns unchanged components when no selections match', () => {
      const pipeline = new CPEEstimationPipeline()
      const components = [makeComponent()]

      const selections = new Map<string, string>()
      selections.set('nonexistent', 'cpe:2.3:a:v:p:1.0:*:*:*:*:*:*:*')

      const result = pipeline.applyUserSelections(components, selections)

      expect(result[0]).toEqual(components[0])
    })
  })

  describe('static methods', () => {
    describe('countMissingCpes', () => {
      it('counts components without CPEs', () => {
        const components = [
          makeComponent({ id: 'c1', cpe: 'cpe:2.3:a:v:p:1:*:*:*:*:*:*:*' }),
          makeComponent({ id: 'c2' }),
          makeComponent({ id: 'c3' }),
        ]

        expect(CPEEstimationPipeline.countMissingCpes(components)).toBe(2)
      })

      it('returns 0 when all components have CPEs', () => {
        const components = [makeComponent({ id: 'c1', cpe: 'cpe:2.3:a:v:p:1:*:*:*:*:*:*:*' })]

        expect(CPEEstimationPipeline.countMissingCpes(components)).toBe(0)
      })

      it('returns length for components with no CPEs', () => {
        const components = [makeComponent(), makeComponent()]
        expect(CPEEstimationPipeline.countMissingCpes(components)).toBe(2)
      })
    })

    describe('needsEstimation', () => {
      it('returns true when components are missing CPEs and have versions', () => {
        const components = [makeComponent()]
        expect(CPEEstimationPipeline.needsEstimation(components)).toBe(true)
      })

      it('returns false when all components have CPEs', () => {
        const components = [makeComponent({ cpe: 'cpe:2.3:a:v:p:1:*:*:*:*:*:*:*' })]
        expect(CPEEstimationPipeline.needsEstimation(components)).toBe(false)
      })

      it('returns false when components have no version', () => {
        const components = [makeComponent({ cpe: undefined, version: '' })]
        expect(CPEEstimationPipeline.needsEstimation(components)).toBe(false)
      })

      it('returns false for empty array', () => {
        expect(CPEEstimationPipeline.needsEstimation([])).toBe(false)
      })
    })

    describe('getPendingConfirmations', () => {
      it('returns components with suggested CPEs but no final CPE', () => {
        const components = [
          makeComponent({
            id: 'c1',
            suggestedCpes: [
              { cpe: 'cpe1', vendor: 'v', product: 'p', confidence: 'high', source: 'inferred' as const },
            ],
          }),
          makeComponent({ id: 'c2' }),
        ]

        const pending = CPEEstimationPipeline.getPendingConfirmations(components)
        expect(pending).toHaveLength(1)
        expect(pending[0].id).toBe('c1')
      })

      it('excludes components with empty suggestedCpes', () => {
        const components = [makeComponent({ id: 'c1', suggestedCpes: [] })]
        expect(CPEEstimationPipeline.getPendingConfirmations(components)).toHaveLength(0)
      })

      it('excludes components that already have a CPE', () => {
        const components = [
          makeComponent({
            id: 'c1',
            cpe: 'cpe:2.3:a:v:p:1:*:*:*:*:*:*:*',
            suggestedCpes: [
              { cpe: 'cpe1', vendor: 'v', product: 'p', confidence: 'high', source: 'inferred' as const },
            ],
          }),
        ]
        expect(CPEEstimationPipeline.getPendingConfirmations(components)).toHaveLength(0)
      })

      it('returns empty array when no components have suggestions', () => {
        expect(CPEEstimationPipeline.getPendingConfirmations([])).toEqual([])
      })
    })
  })
})

describe('getCPEEstimationPipeline / resetCPEEstimationPipeline', () => {
  it('returns a singleton instance', () => {
    const a = getCPEEstimationPipeline()
    const b = getCPEEstimationPipeline()
    expect(a).toBe(b)
  })

  it('creates new instance after reset', () => {
    const first = getCPEEstimationPipeline()
    resetCPEEstimationPipeline()
    const second = getCPEEstimationPipeline()
    expect(first).not.toBe(second)
  })
})

describe('estimateCpesForComponents', () => {
  it('runs pipeline and returns result', async () => {
    const { suggestCPEs } = await import('../utils/cpeUtils')
    vi.mocked(suggestCPEs).mockReturnValueOnce([])

    const result = await estimateCpesForComponents([makeComponent()])

    expect(result).toBeDefined()
    expect(result.summary.totalProcessed).toBe(1)
    expect(result.components).toHaveLength(1)
  })
})
