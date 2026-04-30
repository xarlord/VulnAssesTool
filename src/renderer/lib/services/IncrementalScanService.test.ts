/**
 * Tests for IncrementalScanService
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  IncrementalScanService,
  createIncrementalScanService,
  getComponentsNeedingScan,
} from './IncrementalScanService'
import type { Component } from '../../../shared/types'

const createComponent = (name: string, version: string, overrides: Partial<Component> = {}): Component => ({
  id: `${name}-${version}`,
  name,
  version,
  type: 'library',
  licenses: [],
  vulnerabilities: [],
  ...overrides,
})

describe('IncrementalScanService', () => {
  let service: IncrementalScanService

  beforeEach(() => {
    service = new IncrementalScanService()
  })

  describe('prepareIncrementalScan', () => {
    it('should recommend full rescan for empty old components', () => {
      const newComponents = [createComponent('react', '18.0.0'), createComponent('lodash', '4.17.21')]

      const result = service.prepareIncrementalScan('project-1', [], newComponents)

      expect(result.needsFullRescan).toBe(true)
      expect(result.componentsToScan).toHaveLength(2)
      expect(result.summary).toContain('First scan')
    })

    it('should recommend incremental scan for small changes', () => {
      const oldComponents = [
        createComponent('react', '18.0.0'),
        createComponent('lodash', '4.17.21'),
        createComponent('axios', '0.21.0'),
        createComponent('express', '4.17.0'),
      ]

      const newComponents = [
        createComponent('react', '18.2.0'), // modified
        createComponent('lodash', '4.17.21'), // unchanged
        createComponent('axios', '0.21.0'), // unchanged
        createComponent('express', '4.17.0'), // unchanged
      ]

      const result = service.prepareIncrementalScan('project-1', oldComponents, newComponents)

      expect(result.needsFullRescan).toBe(false)
      expect(result.componentsToScan).toHaveLength(1)
      expect(result.componentsToScan[0].version).toBe('18.2.0')
      expect(result.summary).toContain('Incremental scan')
    })

    it('should recommend full rescan when change exceeds threshold', () => {
      const oldComponents = [createComponent('react', '18.0.0'), createComponent('lodash', '4.17.21')]

      // 100% change - all components different
      const newComponents = [createComponent('vue', '3.0.0'), createComponent('underscore', '1.13.0')]

      const result = service.prepareIncrementalScan('project-1', oldComponents, newComponents)

      expect(result.needsFullRescan).toBe(true)
    })

    it('should include added components in scan list', () => {
      // Use 4 old components so adding 1 is only 25% change (below 50% threshold)
      const oldComponents = [
        createComponent('react', '18.0.0'),
        createComponent('lodash', '4.17.21'),
        createComponent('express', '4.17.0'),
        createComponent('axios', '0.21.0'),
      ]

      const newComponents = [
        createComponent('react', '18.0.0'), // unchanged
        createComponent('lodash', '4.17.21'), // unchanged
        createComponent('express', '4.17.0'), // unchanged
        createComponent('axios', '0.21.0'), // unchanged
        createComponent('vue', '3.0.0'), // added
      ]

      const result = service.prepareIncrementalScan('project-1', oldComponents, newComponents)

      expect(result.needsFullRescan).toBe(false)
      expect(result.componentsToScan).toHaveLength(1)
      expect(result.componentsToScan[0].name).toBe('vue')
    })

    it('should track scan history', () => {
      // Use multiple components so modifying 1 is below threshold
      const oldComponents = [
        createComponent('react', '18.0.0'),
        createComponent('lodash', '4.17.21'),
        createComponent('express', '4.17.0'),
      ]
      const newComponents = [
        createComponent('react', '18.2.0'),
        createComponent('lodash', '4.17.21'),
        createComponent('express', '4.17.0'),
      ]

      service.prepareIncrementalScan('project-1', oldComponents, newComponents)

      const history = service.getScanHistory('project-1')
      expect(history).toHaveLength(1)
      expect(history[0].scanType).toBe('incremental')
    })

    it('should provide scan statistics', () => {
      const components = [
        createComponent('react', '18.0.0'),
        createComponent('lodash', '4.17.21'),
        createComponent('express', '4.17.0'),
      ]

      // First scan (full)
      service.prepareIncrementalScan('project-1', [], components)

      // Second scan (incremental) - modify only 1 of 3 components (33% change)
      service.prepareIncrementalScan('project-1', components, [
        createComponent('react', '18.0.0'),
        createComponent('lodash', '4.17.22'),
        createComponent('express', '4.17.0'),
      ])

      const stats = service.getScanStatistics('project-1')

      expect(stats.totalScans).toBe(2)
      expect(stats.incrementalScans).toBe(1)
      expect(stats.fullScans).toBe(1)
    })
  })

  describe('getComponentsToScan', () => {
    it('should return only changed components', () => {
      const oldComponents = [createComponent('react', '18.0.0'), createComponent('lodash', '4.17.21')]

      const newComponents = [
        createComponent('react', '18.2.0'), // modified
        createComponent('lodash', '4.17.21'), // unchanged
        createComponent('axios', '0.21.0'), // added
      ]

      const toScan = service.getComponentsToScan(oldComponents, newComponents)

      expect(toScan).toHaveLength(2)
      expect(toScan.map((c) => c.name)).toContain('react')
      expect(toScan.map((c) => c.name)).toContain('axios')
      expect(toScan.map((c) => c.name)).not.toContain('lodash')
    })
  })

  describe('needsFullRescan', () => {
    it('should return true for empty old components', () => {
      const newComponents = [createComponent('react', '18.0.0')]
      expect(service.needsFullRescan([], newComponents)).toBe(true)
    })

    it('should return false for small changes', () => {
      const oldComponents = [
        createComponent('react', '18.0.0'),
        createComponent('lodash', '4.17.21'),
        createComponent('axios', '0.21.0'),
        createComponent('express', '4.17.0'),
      ]

      const newComponents = [
        createComponent('react', '18.2.0'), // 25% change
        createComponent('lodash', '4.17.21'),
        createComponent('axios', '0.21.0'),
        createComponent('express', '4.17.0'),
      ]

      expect(service.needsFullRescan(oldComponents, newComponents)).toBe(false)
    })
  })

  describe('updateComponentHashes', () => {
    it('should add componentHash to all components', () => {
      const components = [createComponent('react', '18.0.0'), createComponent('lodash', '4.17.21')]

      const updated = service.updateComponentHashes(components)

      expect(updated[0].componentHash).toBeDefined()
      expect(updated[1].componentHash).toBeDefined()
      expect(updated[0].componentHash).not.toBe(updated[1].componentHash)
    })
  })

  describe('clearScanHistory', () => {
    it('should clear scan history for a project', () => {
      const components = [createComponent('react', '18.0.0')]
      service.prepareIncrementalScan('project-1', [], components)

      service.clearScanHistory('project-1')

      expect(service.getScanHistory('project-1')).toHaveLength(0)
    })
  })
})

describe('createIncrementalScanService', () => {
  it('should create service with default options', () => {
    const service = createIncrementalScanService()
    expect(service).toBeInstanceOf(IncrementalScanService)
  })

  it('should create service with custom threshold', () => {
    const service = createIncrementalScanService({ fullRescanThreshold: 30 })
    expect(service).toBeInstanceOf(IncrementalScanService)
  })
})

describe('getComponentsNeedingScan', () => {
  it('should return components and rescan flag', () => {
    // Use 5 old components so 2 changes (40%) is below 50% threshold
    const oldComponents = [
      createComponent('react', '18.0.0'),
      createComponent('lodash', '4.17.21'),
      createComponent('express', '4.17.0'),
      createComponent('vue', '3.0.0'),
      createComponent('webpack', '5.0.0'),
    ]

    const newComponents = [
      createComponent('react', '18.2.0'), // modified
      createComponent('lodash', '4.17.21'), // unchanged
      createComponent('express', '4.17.0'), // unchanged
      createComponent('vue', '3.0.0'), // unchanged
      createComponent('webpack', '5.0.0'), // unchanged
      createComponent('axios', '0.21.0'), // added
    ]

    const result = getComponentsNeedingScan(oldComponents, newComponents)

    // 2 changes out of 5 old components = 40%, which is below 50% threshold
    expect(result.components).toHaveLength(2) // react modified + axios added
    expect(result.needsFullRescan).toBe(false)
  })

  it('should recommend full rescan when change percentage exceeds threshold', () => {
    const oldComponents = [createComponent('react', '18.0.0'), createComponent('lodash', '4.17.21')]

    const newComponents = [
      createComponent('react', '18.2.0'), // modified
      createComponent('lodash', '4.17.21'), // unchanged
      createComponent('axios', '0.21.0'), // added
    ]

    const result = getComponentsNeedingScan(oldComponents, newComponents)

    // 2 changes out of 2 old components = 100% >= 50% threshold
    expect(result.needsFullRescan).toBe(true)
    expect(result.components).toHaveLength(3) // all new components
  })
})
