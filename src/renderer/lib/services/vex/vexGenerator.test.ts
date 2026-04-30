/**
 * Tests for VEX Document Generator
 *
 * @requirement P2-010
 * @test-case TC-VEX-001
 * @coverage full
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  VexGenerator,
  createVexGenerator,
  generateVexDocument,
  type VexGeneratorOptions,
  type VexDocument,
  type VexStatement,
} from './vexGenerator'
import type { FilterAuditEvent, FilterContext, FilterAction, FilterType } from '@@/shared/types/fpf'

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockAuditEvent = (
  overrides: Partial<FilterAuditEvent> & {
    componentId?: string
    action?: FilterAction
    filterType?: FilterType
  } = {},
): FilterAuditEvent & { componentId: string } => {
  const action = overrides.action ?? 'filtered'
  const filterType = overrides.filterType ?? 'disabled_interface'

  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    eventType: 'filter_decision',
    vulnerability: {
      cveId: 'CVE-2024-12345',
      severity: 'high',
      cvssScore: 7.5,
      component: {
        name: 'test-component',
        version: '1.0.0',
        cpe: 'cpe:2.3:a:test:test-component:1.0.0:*:*:*:*:*:*:*',
      },
    },
    decision: {
      action,
      tier: 1,
      filterType,
      reason: 'Test filter reason',
      confidence: 85,
    },
    context: {
      projectId: 'proj-001',
      projectName: 'Test Project',
      configVersion: '1.0.0',
    },
    user: {
      id: 'user-001',
      name: 'Test User',
      role: 'analyst',
    },
    hash: 'abc123',
    previousHash: 'def456',
    componentId: 'comp-001',
    ...overrides,
  }
}

const createMockContext = (): FilterContext => ({
  projectId: 'proj-001',
  projectName: 'Test Project',
  configVersion: '1.0.0',
})

// ============================================================================
// TESTS
// ============================================================================

describe('VexGenerator', () => {
  let generator: VexGenerator
  let context: FilterContext

  beforeEach(() => {
    generator = new VexGenerator()
    context = createMockContext()
  })

  describe('Constructor', () => {
    it('should create generator with default options', () => {
      const gen = new VexGenerator()
      expect(gen).toBeInstanceOf(VexGenerator)
    })

    it('should accept custom options', () => {
      const options: VexGeneratorOptions = {
        includeDetails: false,
        lifecycle: 'draft',
        author: {
          name: 'Custom Author',
          organization: 'Test Org',
        },
      }
      const gen = new VexGenerator(options)
      expect(gen).toBeInstanceOf(VexGenerator)
    })
  })

  describe('generateFromAuditEvents', () => {
    it('should generate VEX document from audit events', () => {
      const events = [createMockAuditEvent()]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document).toBeDefined()
      expect(result.document.bomFormat).toBe('CycloneDX')
      expect(result.document.specVersion).toBe('1.5')
      expect(result.document.statements).toHaveLength(1)
    })

    it('should include statistics', () => {
      const events = [
        createMockAuditEvent({ action: 'filtered' }),
        createMockAuditEvent({
          vulnerability: {
            cveId: 'CVE-2024-54321',
            severity: 'critical',
            cvssScore: 9.8,
            component: { name: 'comp2', version: '2.0.0', cpe: 'cpe:2.3:a:comp2' },
          },
          action: 'kept',
          componentId: 'comp-002',
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.stats.totalEvents).toBe(2)
      expect(result.stats.includedStatements).toBe(2)
      expect(result.stats.notAffectedCount).toBe(1)
      expect(result.stats.affectedCount).toBe(1)
    })

    it('should group events by vulnerability', () => {
      const events = [
        createMockAuditEvent({ id: 'evt-1', timestamp: '2024-01-01T10:00:00Z' }),
        createMockAuditEvent({
          id: 'evt-2',
          timestamp: '2024-01-02T10:00:00Z',
          decision: {
            action: 'kept',
            tier: 2,
            filterType: 'llm_analysis',
            reason: 'Later decision',
            confidence: 90,
          },
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      // Should only have one statement since both events are for the same CVE
      expect(result.document.statements).toHaveLength(1)
      // Should use the latest event's decision (kept = affected)
      expect(result.stats.affectedCount).toBe(1)
    })

    it('should use the latest event for each vulnerability', () => {
      const events = [
        createMockAuditEvent({
          id: 'evt-1',
          timestamp: '2024-01-01T10:00:00Z',
          decision: { action: 'filtered', tier: 1, filterType: 'disabled_interface', reason: 'Old', confidence: 80 },
        }),
        createMockAuditEvent({
          id: 'evt-2',
          timestamp: '2024-01-02T10:00:00Z',
          decision: { action: 'kept', tier: 2, filterType: 'llm_analysis', reason: 'New', confidence: 90 },
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      // Latest event is 'kept' which maps to 'affected'
      expect(result.document.statements[0].analysis.status).toBe('affected')
    })
  })

  describe('Action to Status Mapping', () => {
    it('should map filtered to not_affected', () => {
      const events = [createMockAuditEvent({ action: 'filtered' })]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.status).toBe('not_affected')
      expect(result.stats.notAffectedCount).toBe(1)
    })

    it('should map kept to affected', () => {
      const events = [createMockAuditEvent({ action: 'kept' })]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.status).toBe('affected')
      expect(result.stats.affectedCount).toBe(1)
    })

    it('should map escalated to under_investigation', () => {
      const events = [createMockAuditEvent({ action: 'escalated' })]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.status).toBe('under_investigation')
      expect(result.stats.underInvestigationCount).toBe(1)
    })
  })

  describe('Justification Determination', () => {
    it('should set justification for not_affected status', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'disabled_interface',
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBe('vulnerable_code_not_in_execute_path')
    })

    it('should map version_mismatch to vulnerable_code_not_present', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'version_mismatch',
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBe('vulnerable_code_not_present')
    })

    it('should map suppression_rule to inline_mitigations_already_exist', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'suppression_rule',
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBe('inline_mitigations_already_exist')
    })

    it('should map internal_only to vulnerable_code_cannot_be_controlled_by_adversary', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'internal_only',
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBe(
        'vulnerable_code_cannot_be_controlled_by_adversary',
      )
    })

    it('should map attack_path_blocked to vulnerable_code_cannot_be_controlled_by_adversary', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'attack_path_blocked',
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBe(
        'vulnerable_code_cannot_be_controlled_by_adversary',
      )
    })

    it('should not set justification for affected status', () => {
      const events = [createMockAuditEvent({ action: 'kept' })]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBeUndefined()
    })
  })

  describe('Options', () => {
    it('should respect includeDetails option', () => {
      const events = [createMockAuditEvent()]
      const genWithDetails = new VexGenerator({ includeDetails: true })
      const genWithoutDetails = new VexGenerator({ includeDetails: false })

      const withDetails = genWithDetails.generateFromAuditEvents(events, context)
      const withoutDetails = genWithoutDetails.generateFromAuditEvents(events, context)

      expect(withDetails.document.statements[0].analysis.detail).toBeDefined()
      expect(withoutDetails.document.statements[0].analysis.detail).toBeUndefined()
    })

    it('should respect author option', () => {
      const author = { name: 'Test Author', organization: 'Test Org', email: 'test@example.com' }
      const gen = new VexGenerator({ author })
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)

      expect(result.document.metadata.author).toEqual(author)
    })

    it('should respect lifecycle option', () => {
      const gen = new VexGenerator({ lifecycle: 'draft' })
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)

      expect(result.document.metadata.lifecycle).toBe('draft')
    })

    it('should respect filterActions option', () => {
      const events = [
        createMockAuditEvent({ action: 'filtered' }),
        createMockAuditEvent({
          vulnerability: {
            cveId: 'CVE-2024-99999',
            severity: 'critical',
            cvssScore: 9.8,
            component: { name: 'comp2', version: '2.0.0', cpe: 'cpe:2.3:a:comp2' },
          },
          action: 'kept',
          componentId: 'comp-002',
        }),
      ]
      const gen = new VexGenerator({ filterActions: ['filtered'] })
      const result = gen.generateFromAuditEvents(events, context)

      expect(result.document.statements).toHaveLength(1)
      expect(result.document.statements[0].vulnerability).toBe('CVE-2024-12345')
    })

    it('should respect includeAuditReferences option', () => {
      const events = [createMockAuditEvent()]
      const genWithRefs = new VexGenerator({ includeAuditReferences: true })
      const genWithoutRefs = new VexGenerator({ includeAuditReferences: false })

      const withRefs = genWithRefs.generateFromAuditEvents(events, context)
      const withoutRefs = genWithoutRefs.generateFromAuditEvents(events, context)

      expect(withRefs.document.statements[0].references).toBeDefined()
      expect(withoutRefs.document.statements[0].references).toBeUndefined()
    })

    it('should respect componentRefs option', () => {
      const componentRefs = new Map<string, string>()
      componentRefs.set('cpe:2.3:a:test:test-component:1.0.0:*:*:*:*:*:*:*', 'urn:cdx:test-bom-ref')

      const gen = new VexGenerator({ componentRefs })
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)

      expect(result.document.statements[0].affects).toContain('urn:cdx:test-bom-ref')
    })
  })

  describe('Export Functions', () => {
    it('should export as JSON', () => {
      const events = [createMockAuditEvent()]
      const result = generator.generateFromAuditEvents(events, context)
      const json = generator.exportJson(result.document)

      expect(json).toContain('"bomFormat": "CycloneDX"')
      expect(json).toContain('"specVersion": "1.5"')
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it('should export as compact JSON when pretty=false', () => {
      const events = [createMockAuditEvent()]
      const result = generator.generateFromAuditEvents(events, context)
      const json = generator.exportJson(result.document, false)

      expect(json).not.toContain('\n  ')
    })

    it('should export as XML', () => {
      const events = [createMockAuditEvent()]
      const result = generator.generateFromAuditEvents(events, context)
      const xml = generator.exportXml(result.document)

      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
      expect(xml).toContain('<bom xmlns="http://cyclonedx.org/schema/bom/')
      expect(xml).toContain('<id>CVE-2024-12345</id>')
      expect(xml).toContain('<state>not_affected</state>')
    })

    it('should escape XML special characters', () => {
      const events = [
        createMockAuditEvent({
          decision: {
            action: 'filtered',
            tier: 1,
            filterType: 'disabled_interface',
            reason: 'Test & "reason" with <special> chars',
            confidence: 85,
          },
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)
      const xml = generator.exportXml(result.document)

      expect(xml).toContain('&amp;')
      expect(xml).toContain('&lt;')
      expect(xml).toContain('&gt;')
      expect(xml).toContain('&quot;')
    })
  })

  describe('Document Structure', () => {
    it('should have correct document metadata', () => {
      const events = [createMockAuditEvent()]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.$schema).toBe('http://cyclonedx.org/schema/bom-1.5.schema.json')
      expect(result.document.bomFormat).toBe('CycloneDX')
      expect(result.document.specVersion).toBe('1.5')
      expect(result.document.serialNumber).toMatch(/^urn:uuid:/)
      expect(result.document.version).toBe(1)
    })

    it('should have tool metadata', () => {
      const events = [createMockAuditEvent()]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.metadata.tool.name).toBe('VulnAssesTool')
      expect(result.document.metadata.tool.version).toBe('2.0.0')
      expect(result.document.metadata.tool.vendor).toBe('VulnAssesTool')
    })

    it('should generate unique serial numbers', () => {
      const events = [createMockAuditEvent()]
      const result1 = generator.generateFromAuditEvents(events, context)
      const result2 = generator.generateFromAuditEvents(events, context)

      expect(result1.document.serialNumber).not.toBe(result2.document.serialNumber)
    })
  })

  describe('Statement Structure', () => {
    it('should have correct statement structure', () => {
      const events = [createMockAuditEvent()]
      const result = generator.generateFromAuditEvents(events, context)
      const statement = result.document.statements[0]

      expect(statement.vulnerability).toBe('CVE-2024-12345')
      expect(statement.analysis.status).toBe('not_affected')
      expect(statement.analysis.timestamp).toBeDefined()
      expect(statement.affects).toBeInstanceOf(Array)
      expect(statement.timestamp).toBeDefined()
    })

    it('should include author from event user', () => {
      const events = [createMockAuditEvent()]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].author).toBe('Test User')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty events array', () => {
      const result = generator.generateFromAuditEvents([], context)

      expect(result.document.statements).toHaveLength(0)
      expect(result.stats.totalEvents).toBe(0)
      expect(result.stats.includedStatements).toBe(0)
    })

    it('should handle events with same CVE but different components', () => {
      const events = [
        createMockAuditEvent({ componentId: 'comp-001' }),
        createMockAuditEvent({
          componentId: 'comp-002',
          vulnerability: {
            cveId: 'CVE-2024-12345',
            severity: 'high',
            cvssScore: 7.5,
            component: { name: 'other-component', version: '2.0.0', cpe: 'cpe:2.3:a:other' },
          },
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      // Should still group by vulnerability, resulting in one statement
      expect(result.document.statements).toHaveLength(1)
    })
  })
})

describe('Convenience Functions', () => {
  describe('createVexGenerator', () => {
    it('should create VexGenerator instance', () => {
      const gen = createVexGenerator()
      expect(gen).toBeInstanceOf(VexGenerator)
    })

    it('should pass options to VexGenerator', () => {
      const gen = createVexGenerator({ lifecycle: 'review' })
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], createMockContext())

      expect(result.document.metadata.lifecycle).toBe('review')
    })
  })

  describe('generateVexDocument', () => {
    it('should generate VEX document directly', () => {
      const events = [createMockAuditEvent()]
      const context = createMockContext()
      const result = generateVexDocument(events, context)

      expect(result.document).toBeDefined()
      expect(result.document.bomFormat).toBe('CycloneDX')
    })

    it('should accept options', () => {
      const events = [createMockAuditEvent()]
      const context = createMockContext()
      const result = generateVexDocument(events, context, { lifecycle: 'draft' })

      expect(result.document.metadata.lifecycle).toBe('draft')
    })
  })
})

describe('VEX Type Exports', () => {
  it('should export VexAnalysisStatus type', () => {
    const status: VexAnalysisStatus = 'not_affected'
    expect(['affected', 'not_affected', 'under_investigation', 'resolved']).toContain(status)
  })

  it('should export VexJustification type', () => {
    const justification: VexJustification = 'vulnerable_code_not_present'
    expect([
      'component_not_present',
      'vulnerable_code_not_present',
      'vulnerable_code_not_in_execute_path',
      'vulnerable_code_cannot_be_controlled_by_adversary',
      'inline_mitigations_already_exist',
    ]).toContain(justification)
  })
})
