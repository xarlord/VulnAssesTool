/**
 * Tests for DiffEngine Service
 * Tests SBOM diffing functionality for incremental scanning
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  DiffEngine,
  createDiffEngine,
  computeComponentDiff,
  getChangedComponents,
  type DiffOptions,
  type DiffResult,
} from './DiffEngine'
import type { Component } from '../../../shared/types'

// Helper to create mock components
const createMockComponent = (overrides: Partial<Component> & { name: string; version: string }): Component => ({
  id: `${overrides.name}-${overrides.version}`,
  type: 'library',
  licenses: [],
  vulnerabilities: [],
  ...overrides,
})

// Simple hash function for testing
const simpleHash = (data: string): string => {
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16)
}

describe('DiffEngine', () => {
  describe('constructor', () => {
    it('should create instance with default options', () => {
      const engine = new DiffEngine()
      expect(engine).toBeInstanceOf(DiffEngine)
    })

    it('should accept custom hash fields', () => {
      const engine = new DiffEngine({
        hashFields: ['name', 'version'],
      })
      expect(engine).toBeInstanceOf(DiffEngine)
    })

    it('should accept custom hash function', () => {
      const engine = new DiffEngine({
        hashFunction: simpleHash,
      })
      expect(engine).toBeInstanceOf(DiffEngine)
    })
  })

  describe('computeComponentHash', () => {
    it('should compute consistent hash for same component', () => {
      const engine = new DiffEngine({ hashFunction: simpleHash })
      const component = createMockComponent({ name: 'lodash', version: '4.17.21' })

      const hash1 = engine.computeComponentHash(component)
      const hash2 = engine.computeComponentHash(component)

      expect(hash1).toBe(hash2)
    })

    it('should compute different hash for different components', () => {
      const engine = new DiffEngine({ hashFunction: simpleHash })
      const component1 = createMockComponent({ name: 'lodash', version: '4.17.21' })
      const component2 = createMockComponent({ name: 'lodash', version: '4.17.22' })

      const hash1 = engine.computeComponentHash(component1)
      const hash2 = engine.computeComponentHash(component2)

      expect(hash1).not.toBe(hash2)
    })

    it('should include specified fields in hash', () => {
      const engine = new DiffEngine({
        hashFields: ['name', 'version', 'cpe'],
        hashFunction: simpleHash,
      })

      const component1 = createMockComponent({
        name: 'lodash',
        version: '4.17.21',
        cpe: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
      })
      const component2 = createMockComponent({
        name: 'lodash',
        version: '4.17.21',
        cpe: 'cpe:2.3:a:lodash:lodash:4.17.22:*:*:*:*:*:*:*',
      })

      const hash1 = engine.computeComponentHash(component1)
      const hash2 = engine.computeComponentHash(component2)

      expect(hash1).not.toBe(hash2)
    })

    it('should not include vulnerabilities by default', () => {
      const engine = new DiffEngine({ hashFunction: simpleHash })

      const component1 = createMockComponent({
        name: 'lodash',
        version: '4.17.21',
        vulnerabilities: [],
      })
      const component2 = createMockComponent({
        name: 'lodash',
        version: '4.17.21',
        vulnerabilities: ['CVE-2021-23337'],
      })

      const hash1 = engine.computeComponentHash(component1)
      const hash2 = engine.computeComponentHash(component2)

      expect(hash1).toBe(hash2)
    })

    it('should include vulnerabilities when option is set', () => {
      const engine = new DiffEngine({
        hashFunction: simpleHash,
        includeVulnerabilities: true,
      })

      const component1 = createMockComponent({
        name: 'lodash',
        version: '4.17.21',
        vulnerabilities: [],
      })
      const component2 = createMockComponent({
        name: 'lodash',
        version: '4.17.21',
        vulnerabilities: ['CVE-2021-23337'],
      })

      const hash1 = engine.computeComponentHash(component1)
      const hash2 = engine.computeComponentHash(component2)

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('computeDiff', () => {
    let engine: DiffEngine

    beforeEach(() => {
      engine = new DiffEngine({ hashFunction: simpleHash })
    })

    it('should return empty diff for empty inputs', () => {
      const result = engine.computeDiff([], [])

      expect(result.added).toEqual([])
      expect(result.removed).toEqual([])
      expect(result.modified).toEqual([])
      expect(result.unchanged).toEqual([])
      expect(result.stats.oldTotal).toBe(0)
      expect(result.stats.newTotal).toBe(0)
    })

    it('should detect added components', () => {
      const oldComponents = [createMockComponent({ name: 'react', version: '18.0.0' })]
      const newComponents = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
      ]

      const result = engine.computeDiff(oldComponents, newComponents)

      expect(result.added).toHaveLength(1)
      expect(result.added[0].name).toBe('lodash')
      expect(result.stats.addedCount).toBe(1)
    })

    it('should detect removed components', () => {
      const oldComponents = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
      ]
      const newComponents = [createMockComponent({ name: 'react', version: '18.0.0' })]

      const result = engine.computeDiff(oldComponents, newComponents)

      expect(result.removed).toHaveLength(1)
      expect(result.removed[0].name).toBe('lodash')
      expect(result.stats.removedCount).toBe(1)
    })

    it('should detect modified components (version change)', () => {
      const oldComponents = [createMockComponent({ name: 'react', version: '18.0.0' })]
      const newComponents = [createMockComponent({ name: 'react', version: '18.2.0' })]

      const result = engine.computeDiff(oldComponents, newComponents)

      expect(result.modified).toHaveLength(1)
      expect(result.modified[0].old.version).toBe('18.0.0')
      expect(result.modified[0].new.version).toBe('18.2.0')
      expect(result.modified[0].changes).toContain('version')
      expect(result.stats.modifiedCount).toBe(1)
    })

    it('should detect modified components (license change)', () => {
      const oldComponents = [createMockComponent({ name: 'react', version: '18.0.0', licenses: ['MIT'] })]
      const newComponents = [createMockComponent({ name: 'react', version: '18.0.0', licenses: ['Apache-2.0'] })]

      const result = engine.computeDiff(oldComponents, newComponents)

      expect(result.modified).toHaveLength(1)
      expect(result.modified[0].changes).toContain('licenses')
    })

    it('should detect unchanged components', () => {
      const oldComponents = [createMockComponent({ name: 'react', version: '18.0.0' })]
      const newComponents = [createMockComponent({ name: 'react', version: '18.0.0' })]

      const result = engine.computeDiff(oldComponents, newComponents)

      expect(result.unchanged).toHaveLength(1)
      expect(result.stats.unchangedCount).toBe(1)
    })

    it('should use purl for component matching when available', () => {
      const oldComponents = [
        createMockComponent({
          name: 'react',
          version: '18.0.0',
          purl: 'pkg:npm/react@18.0.0',
        }),
      ]
      const newComponents = [
        createMockComponent({
          name: 'react',
          version: '18.2.0',
          purl: 'pkg:npm/react@18.2.0',
        }),
      ]

      const result = engine.computeDiff(oldComponents, newComponents)

      // Should recognize as modified, not removed + added
      expect(result.modified).toHaveLength(1)
      expect(result.removed).toHaveLength(0)
      expect(result.added).toHaveLength(0)
    })

    it('should use cpe for component matching when purl not available', () => {
      const oldComponents = [
        createMockComponent({
          name: 'log4j',
          version: '2.14.1',
          cpe: 'cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*',
        }),
      ]
      const newComponents = [
        createMockComponent({
          name: 'log4j',
          version: '2.17.0',
          cpe: 'cpe:2.3:a:apache:log4j:2.17.0:*:*:*:*:*:*:*',
        }),
      ]

      const result = engine.computeDiff(oldComponents, newComponents)

      expect(result.modified).toHaveLength(1)
      expect(result.removed).toHaveLength(0)
      expect(result.added).toHaveLength(0)
    })

    it('should calculate correct change percentage', () => {
      const oldComponents = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
        createMockComponent({ name: 'axios', version: '0.21.0' }),
        createMockComponent({ name: 'express', version: '4.17.0' }),
      ]
      const newComponents = [
        createMockComponent({ name: 'react', version: '18.2.0' }), // modified
        createMockComponent({ name: 'lodash', version: '4.17.21' }), // unchanged
        createMockComponent({ name: 'axios', version: '0.21.0' }), // unchanged
        createMockComponent({ name: 'uuid', version: '9.0.0' }), // added
        // express removed
      ]

      const result = engine.computeDiff(oldComponents, newComponents)

      // 1 modified + 1 added + 1 removed = 3 changes out of 4 = 75%
      expect(result.stats.changePercent).toBe(75)
    })

    it('should handle 0% change (identical SBOMs)', () => {
      const components = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
      ]

      const result = engine.computeDiff(components, components)

      expect(result.stats.changePercent).toBe(0)
      expect(result.unchanged).toHaveLength(2)
    })

    it('should include compute time in stats', () => {
      const result = engine.computeDiff(
        [createMockComponent({ name: 'react', version: '18.0.0' })],
        [createMockComponent({ name: 'react', version: '18.2.0' })],
      )

      expect(result.stats.computeTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should handle large number of components efficiently', () => {
      // Create 1000 components
      const oldComponents = Array.from({ length: 1000 }, (_, i) =>
        createMockComponent({ name: `lib${i}`, version: '1.0.0' }),
      )

      // Modify 10% of them
      const newComponents = oldComponents.map((c, i) =>
        i < 100 ? createMockComponent({ name: c.name, version: '2.0.0' }) : c,
      )

      const startTime = performance.now()
      const result = engine.computeDiff(oldComponents, newComponents)
      const endTime = performance.now()

      expect(result.modified).toHaveLength(100)
      expect(result.unchanged).toHaveLength(900)
      expect(endTime - startTime).toBeLessThan(1000) // Should complete in < 1 second
    })
  })

  describe('getComponentsToScan', () => {
    let engine: DiffEngine

    beforeEach(() => {
      engine = new DiffEngine({ hashFunction: simpleHash })
    })

    it('should return only added and modified components', () => {
      const oldComponents = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
      ]
      const newComponents = [
        createMockComponent({ name: 'react', version: '18.2.0' }), // modified
        createMockComponent({ name: 'lodash', version: '4.17.21' }), // unchanged
        createMockComponent({ name: 'axios', version: '0.21.0' }), // added
      ]

      const toScan = engine.getComponentsToScan(oldComponents, newComponents)

      expect(toScan).toHaveLength(2)
      expect(toScan.map((c) => c.name)).toContain('react')
      expect(toScan.map((c) => c.name)).toContain('axios')
      expect(toScan.map((c) => c.name)).not.toContain('lodash')
    })

    it('should return all components for empty old SBOM', () => {
      const newComponents = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
      ]

      const toScan = engine.getComponentsToScan([], newComponents)

      expect(toScan).toHaveLength(2)
    })
  })

  describe('needsRescan', () => {
    let engine: DiffEngine

    beforeEach(() => {
      engine = new DiffEngine({ hashFunction: simpleHash })
    })

    it('should return true for empty old SBOM', () => {
      const newComponents = [createMockComponent({ name: 'react', version: '18.0.0' })]
      expect(engine.needsRescan([], newComponents)).toBe(true)
    })

    it('should return false for small changes below threshold', () => {
      const oldComponents = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
        createMockComponent({ name: 'axios', version: '0.21.0' }),
        createMockComponent({ name: 'express', version: '4.17.0' }),
      ]
      // Only 1 change out of 4 = 25%
      const newComponents = [
        createMockComponent({ name: 'react', version: '18.2.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
        createMockComponent({ name: 'axios', version: '0.21.0' }),
        createMockComponent({ name: 'express', version: '4.17.0' }),
      ]

      expect(engine.needsRescan(oldComponents, newComponents, 50)).toBe(false)
    })

    it('should return true for large changes above threshold', () => {
      const oldComponents = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
      ]
      // 100% change (all different)
      const newComponents = [
        createMockComponent({ name: 'vue', version: '3.0.0' }),
        createMockComponent({ name: 'underscore', version: '1.13.0' }),
      ]

      expect(engine.needsRescan(oldComponents, newComponents, 50)).toBe(true)
    })

    it('should use default threshold of 50%', () => {
      const oldComponents = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
      ]
      // 50% change = at threshold
      const newComponents = [
        createMockComponent({ name: 'react', version: '18.2.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
      ]

      // At threshold should return true (>=)
      expect(engine.needsRescan(oldComponents, newComponents)).toBe(true)
    })
  })

  describe('generateSummary', () => {
    let engine: DiffEngine

    beforeEach(() => {
      engine = new DiffEngine({ hashFunction: simpleHash })
    })

    it('should generate readable summary', () => {
      const oldComponents = [
        createMockComponent({ name: 'react', version: '18.0.0' }),
        createMockComponent({ name: 'lodash', version: '4.17.21' }),
      ]
      const newComponents = [
        createMockComponent({ name: 'react', version: '18.2.0' }),
        createMockComponent({ name: 'axios', version: '0.21.0' }),
      ]

      const summary = engine.generateSummary(oldComponents, newComponents)

      expect(summary).toContain('SBOM Diff Summary')
      expect(summary).toContain('Old SBOM: 2 components')
      expect(summary).toContain('New SBOM: 2 components')
      expect(summary).toContain('1 added')
      expect(summary).toContain('1 removed')
      expect(summary).toContain('1 modified')
    })

    it('should include modified component details for small diffs', () => {
      const oldComponents = [createMockComponent({ name: 'react', version: '18.0.0' })]
      const newComponents = [createMockComponent({ name: 'react', version: '18.2.0' })]

      const summary = engine.generateSummary(oldComponents, newComponents)

      expect(summary).toContain('react')
      expect(summary).toContain('18.0.0 → 18.2.0')
    })

    it('should not list all modified for large diffs', () => {
      const oldComponents = Array.from({ length: 10 }, (_, i) =>
        createMockComponent({ name: `lib${i}`, version: '1.0.0' }),
      )
      const newComponents = oldComponents.map((c) => createMockComponent({ name: c.name, version: '2.0.0' }))

      const summary = engine.generateSummary(oldComponents, newComponents)

      // Should not list all 10 modified components
      expect(summary).not.toContain('lib0')
    })
  })
})

describe('createDiffEngine', () => {
  it('should create DiffEngine instance', () => {
    const engine = createDiffEngine()
    expect(engine).toBeInstanceOf(DiffEngine)
  })

  it('should pass options to constructor', () => {
    const engine = createDiffEngine({ hashFunction: simpleHash })
    const component = createMockComponent({ name: 'test', version: '1.0.0' })
    const hash = engine.computeComponentHash(component)
    expect(hash).toBeDefined()
  })
})

describe('computeComponentDiff', () => {
  it('should compute diff without creating engine instance', () => {
    const oldComponents = [createMockComponent({ name: 'react', version: '18.0.0' })]
    const newComponents = [createMockComponent({ name: 'react', version: '18.2.0' })]

    const result = computeComponentDiff(oldComponents, newComponents)

    expect(result.modified).toHaveLength(1)
    expect(result.stats.oldTotal).toBe(1)
    expect(result.stats.newTotal).toBe(1)
  })

  it('should accept options', () => {
    const oldComponents = [createMockComponent({ name: 'react', version: '18.0.0', licenses: ['MIT'] })]
    const newComponents = [createMockComponent({ name: 'react', version: '18.0.0', licenses: ['Apache-2.0'] })]

    const result = computeComponentDiff(oldComponents, newComponents, {
      hashFunction: simpleHash,
    })

    expect(result.modified).toHaveLength(1)
  })
})

describe('getChangedComponents', () => {
  it('should return only changed components', () => {
    const oldComponents = [
      createMockComponent({ name: 'react', version: '18.0.0' }),
      createMockComponent({ name: 'lodash', version: '4.17.21' }),
    ]
    const newComponents = [
      createMockComponent({ name: 'react', version: '18.2.0' }),
      createMockComponent({ name: 'lodash', version: '4.17.21' }),
      createMockComponent({ name: 'axios', version: '0.21.0' }),
    ]

    const changed = getChangedComponents(oldComponents, newComponents)

    expect(changed).toHaveLength(2)
    expect(changed.map((c) => c.name)).toContain('react')
    expect(changed.map((c) => c.name)).toContain('axios')
  })
})

describe('Edge Cases', () => {
  let engine: DiffEngine

  beforeEach(() => {
    engine = new DiffEngine({ hashFunction: simpleHash })
  })

  it('should treat components with same name but different types as different components', () => {
    // When type changes, it's a different component (key = name:type)
    const oldComponents = [createMockComponent({ name: 'utils', version: '1.0.0', type: 'library' })]
    const newComponents = [createMockComponent({ name: 'utils', version: '1.0.0', type: 'framework' })]

    const result = engine.computeDiff(oldComponents, newComponents)

    // Different type = different component key = removed + added, not modified
    expect(result.removed).toHaveLength(1)
    expect(result.added).toHaveLength(1)
    expect(result.removed[0].type).toBe('library')
    expect(result.added[0].type).toBe('framework')
  })

  it('should handle components with dependencies', () => {
    const oldComponents = [
      createMockComponent({
        name: 'react',
        version: '18.0.0',
        dependencies: ['react-dom'],
      }),
    ]
    const newComponents = [
      createMockComponent({
        name: 'react',
        version: '18.0.0',
        dependencies: ['react-dom', 'scheduler'],
      }),
    ]

    const result = engine.computeDiff(oldComponents, newComponents)

    expect(result.modified).toHaveLength(1)
    expect(result.modified[0].changes).toContain('dependencies')
  })

  it('should handle undefined vs empty array', () => {
    const oldComponents = [createMockComponent({ name: 'react', version: '18.0.0', licenses: [] })]
    const newComponents = [
      createMockComponent({ name: 'react', version: '18.0.0' }), // licenses defaults to []
    ]

    const result = engine.computeDiff(oldComponents, newComponents)

    // Both should be treated as equivalent
    expect(result.unchanged).toHaveLength(1)
  })

  it('should handle null vs undefined fields', () => {
    const component1 = createMockComponent({ name: 'react', version: '18.0.0' })
    const component2 = createMockComponent({ name: 'react', version: '18.0.0' })

    // @ts-expect-error Testing null value
    component1.description = null
    component2.description = undefined

    const result = engine.computeDiff([component1], [component2])

    expect(result.unchanged).toHaveLength(1)
  })
})
