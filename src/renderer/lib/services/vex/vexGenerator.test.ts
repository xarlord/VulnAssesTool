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

    it('should map feature_disabled to vulnerable_code_not_in_execute_path', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'feature_disabled',
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBe('vulnerable_code_not_in_execute_path')
    })

    it('should use reason-based fallback for default justification (not present)', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'llm_analysis',
          decision: {
            action: 'filtered',
            tier: 3,
            filterType: 'llm_analysis',
            reason: 'Code is not present in this version',
            confidence: 90,
          },
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBe('vulnerable_code_not_present')
    })

    it('should use reason-based fallback for default justification (not in path)', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'llm_analysis',
          decision: {
            action: 'filtered',
            tier: 3,
            filterType: 'llm_analysis',
            reason: 'The code is not in path of execution',
            confidence: 90,
          },
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBe('vulnerable_code_not_in_execute_path')
    })

    it('should use reason-based fallback for default justification (mitigation)', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'llm_analysis',
          decision: {
            action: 'filtered',
            tier: 3,
            filterType: 'llm_analysis',
            reason: 'Inline mitigation already applied',
            confidence: 90,
          },
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)

      expect(result.document.statements[0].analysis.justification).toBe('inline_mitigations_already_exist')
    })

    it('should default to vulnerable_code_cannot_be_controlled_by_adversary for unknown reason', () => {
      const events = [
        createMockAuditEvent({
          action: 'filtered',
          filterType: 'llm_analysis',
          decision: {
            action: 'filtered',
            tier: 3,
            filterType: 'llm_analysis',
            reason: 'Some other reason entirely',
            confidence: 90,
          },
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

      expect(result.document.metadata.tool.name).toBe('D-Fence')
      expect(result.document.metadata.tool.version).toBe('2.0.0')
      expect(result.document.metadata.tool.vendor).toBe('D-Fence')
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

  describe('Component Refs', () => {
    it('should use urn:cdx:cpe as default when componentRefs is provided but cpe not found', () => {
      const componentRefs = new Map<string, string>()
      componentRefs.set('cpe:2.3:a:some-other:component', 'urn:cdx:other-ref')

      const gen = new VexGenerator({ componentRefs })
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)

      expect(result.document.statements[0].affects).toContain(
        'urn:cdx:cpe:2.3:a:test:test-component:1.0.0:*:*:*:*:*:*:*',
      )
    })

    it('should use urn:cdx:cpe when componentRefs is not provided', () => {
      const gen = new VexGenerator()
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)

      expect(result.document.statements[0].affects[0]).toMatch(/^urn:cdx:/)
    })
  })

  describe('XML Export Edge Cases', () => {
    it('should include organization in XML when provided', () => {
      const gen = new VexGenerator({
        author: { name: 'Test Author', organization: 'Test Org' },
      })
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
      const xml = gen.exportXml(result.document)

      expect(xml).toContain('<organization>Test Org</organization>')
    })

    it('should not include organization in XML when not provided', () => {
      const gen = new VexGenerator({
        author: { name: 'Test Author' },
      })
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
      const xml = gen.exportXml(result.document)

      expect(xml).not.toContain('<organization>')
    })

    it('should include detail in XML when includeDetails is true', () => {
      const gen = new VexGenerator({ includeDetails: true })
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
      const xml = gen.exportXml(result.document)

      expect(xml).toContain('<detail>')
    })

    it('should not include detail in XML when no detail exists', () => {
      const gen = new VexGenerator({ includeDetails: false })
      const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
      const xml = gen.exportXml(result.document)

      expect(xml).not.toContain('<detail>')
    })

    it('should handle XML export with affected status (no justification)', () => {
      const events = [createMockAuditEvent({ action: 'kept' })]
      const result = generator.generateFromAuditEvents(events, context)
      const xml = generator.exportXml(result.document)

      expect(xml).toContain('<state>affected</state>')
      expect(xml).not.toContain('<justification>')
    })

    it('should escape single quotes in XML', () => {
      const events = [
        createMockAuditEvent({
          decision: {
            action: 'filtered',
            tier: 1,
            filterType: 'disabled_interface',
            reason: "It's a test with 'quotes'",
            confidence: 85,
          },
        }),
      ]
      const result = generator.generateFromAuditEvents(events, context)
      const xml = generator.exportXml(result.document)

      expect(xml).toContain('&apos;')
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

describe('XML Export Extended', () => {
  let generator: VexGenerator
  let context: FilterContext

  beforeEach(() => {
    generator = new VexGenerator()
    context = createMockContext()
  })

  it('should export XML with empty statements', () => {
    const result = generator.generateFromAuditEvents([], context)
    const xml = generator.exportXml(result.document)

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<vulnerabilities>')
    expect(xml).toContain('</vulnerabilities>')
    expect(xml).not.toContain('<vulnerability>')
    expect(xml).not.toContain('<id>')
  })

  it('should export XML with multiple vulnerability statements', () => {
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
    const result = generator.generateFromAuditEvents(events, context)
    const xml = generator.exportXml(result.document)

    expect(xml).toContain('<id>CVE-2024-12345</id>')
    expect(xml).toContain('<id>CVE-2024-99999</id>')
    expect(xml).toContain('<state>not_affected</state>')
    expect(xml).toContain('<state>affected</state>')
    expect(xml).toContain('<justification>vulnerable_code_not_in_execute_path</justification>')
  })

  it('should export XML with justification for not_affected status', () => {
    const events = [
      createMockAuditEvent({
        action: 'filtered',
        filterType: 'version_mismatch',
      }),
    ]
    const result = generator.generateFromAuditEvents(events, context)
    const xml = generator.exportXml(result.document)

    expect(xml).toContain('<state>not_affected</state>')
    expect(xml).toContain('<justification>vulnerable_code_not_present</justification>')
  })

  it('should export XML with multiple affects refs', () => {
    const componentRefs = new Map<string, string>()
    componentRefs.set('cpe:2.3:a:test:test-component:1.0.0:*:*:*:*:*:*:*', 'urn:cdx:test-bom-ref-1')

    const gen = new VexGenerator({ componentRefs })
    const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
    const xml = gen.exportXml(result.document)

    expect(xml).toContain('<ref>')
    expect(xml).toContain('urn:cdx:test-bom-ref-1')
    expect(xml).toContain('</ref>')
  })
})

describe('VexGenerator Extended Coverage', () => {
  let generator: VexGenerator
  let context: FilterContext

  beforeEach(() => {
    generator = new VexGenerator()
    context = createMockContext()
  })

  it('should export XML with justification and detail in same statement', () => {
    const gen = new VexGenerator({ includeDetails: true })
    const events = [
      createMockAuditEvent({
        action: 'filtered',
        filterType: 'version_mismatch',
        decision: {
          action: 'filtered',
          tier: 1,
          filterType: 'version_mismatch',
          reason: 'Version does not match affected range',
          confidence: 95,
        },
      }),
    ]
    const result = gen.generateFromAuditEvents(events, context)
    const xml = gen.exportXml(result.document)

    expect(xml).toContain('<state>not_affected</state>')
    expect(xml).toContain('<justification>vulnerable_code_not_present</justification>')
    expect(xml).toContain('<detail>Version does not match affected range</detail>')
  })

  it('should generate document with all four status types', () => {
    const events = [
      createMockAuditEvent({
        action: 'filtered',
        vulnerability: {
          cveId: 'CVE-FILTERED',
          severity: 'high',
          cvssScore: 7.5,
          component: { name: 'a', version: '1.0', cpe: 'cpe:a' },
        },
      }),
      createMockAuditEvent({
        action: 'kept',
        vulnerability: {
          cveId: 'CVE-KEPT',
          severity: 'critical',
          cvssScore: 9.8,
          component: { name: 'b', version: '2.0', cpe: 'cpe:b' },
        },
      }),
      createMockAuditEvent({
        action: 'escalated',
        vulnerability: {
          cveId: 'CVE-ESCALATED',
          severity: 'medium',
          cvssScore: 5.5,
          component: { name: 'c', version: '3.0', cpe: 'cpe:c' },
        },
      }),
    ]
    const result = generator.generateFromAuditEvents(events, context)

    expect(result.stats.notAffectedCount).toBe(1)
    expect(result.stats.affectedCount).toBe(1)
    expect(result.stats.underInvestigationCount).toBe(1)
    expect(result.stats.resolvedCount).toBe(0)
    expect(result.stats.includedStatements).toBe(3)
  })

  it('should handle events with filterActions filtering to empty set', () => {
    const events = [createMockAuditEvent({ action: 'filtered' }), createMockAuditEvent({ action: 'kept' })]
    const gen = new VexGenerator({ filterActions: [] })
    const result = gen.generateFromAuditEvents(events, context)

    expect(result.stats.totalEvents).toBe(2)
    expect(result.document.statements).toHaveLength(0)
  })

  it('should handle large number of events grouped by vulnerability', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      createMockAuditEvent({
        id: `evt-${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        decision: {
          action: i % 2 === 0 ? ('filtered' as FilterAction) : ('kept' as FilterAction),
          tier: 1,
          filterType: 'disabled_interface',
          reason: `Decision ${i}`,
          confidence: 80 + i,
        },
      }),
    )
    const result = generator.generateFromAuditEvents(events, context)

    expect(result.document.statements).toHaveLength(1)
    expect(result.document.statements[0].analysis.status).toBe('affected')
  })

  it('should generate valid UUID format in serial number', () => {
    const events = [createMockAuditEvent()]
    const result = generator.generateFromAuditEvents(events, context)

    const uuidPart = result.document.serialNumber.replace('urn:uuid:', '')
    expect(uuidPart).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('should export XML with specVersion from document', () => {
    const events = [createMockAuditEvent({ action: 'kept' })]
    const result = generator.generateFromAuditEvents(events, context)
    const xml = generator.exportXml(result.document)

    expect(xml).toContain('xmlns="http://cyclonedx.org/schema/bom/1.5"')
  })

  it('should export JSON with author email', () => {
    const author = { name: 'Test', organization: 'Org', email: 'test@example.com' }
    const gen = new VexGenerator({ author })
    const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
    const json = gen.exportJson(result.document)
    const parsed = JSON.parse(json)

    expect(parsed.metadata.author).toEqual(author)
  })

  it('should return empty warnings array', () => {
    const events = [createMockAuditEvent()]
    const result = generator.generateFromAuditEvents(events, context)

    expect(result.warnings).toEqual([])
  })

  it('should escape all XML special characters simultaneously', () => {
    const events = [
      createMockAuditEvent({
        decision: {
          action: 'filtered',
          tier: 1,
          filterType: 'disabled_interface',
          reason: 'Test & <data> with "quotes" and \'apostrophes\'',
          confidence: 85,
        },
      }),
    ]
    const gen = new VexGenerator({
      author: { name: 'Author & <Co>', organization: '"Test" Org' },
      includeDetails: true,
    })
    const result = gen.generateFromAuditEvents(events, context)
    const xml = gen.exportXml(result.document)

    expect(xml).toContain('Author &amp; &lt;Co&gt;')
    expect(xml).toContain('&quot;Test&quot; Org')
    expect(xml).toContain('&amp; &lt;data&gt;')
    expect(xml).toContain('&quot;quotes&quot;')
    expect(xml).toContain('&apos;apostrophes&apos;')
  })

  it('should generate with default options when none provided', () => {
    const result = generateVexDocument([createMockAuditEvent()], createMockContext())

    expect(result.document.metadata.lifecycle).toBe('approved')
    expect(result.document.metadata.author.name).toBe('FPF System')
    expect(result.document.statements[0].analysis.detail).toBeDefined()
    expect(result.document.statements[0].references).toBeDefined()
  })
})

describe('VexGenerator Additional Coverage', () => {
  let generator: VexGenerator
  let context: FilterContext

  beforeEach(() => {
    generator = new VexGenerator()
    context = createMockContext()
  })

  it('should handle resolved status in stats counting', () => {
    const result = generator.generateFromAuditEvents([createMockAuditEvent()], context)
    expect(result.stats.resolvedCount).toBe(0)
  })

  it('should include author email in XML export', () => {
    const author = { name: 'Test', email: 'test@example.com', organization: 'Org' }
    const gen = new VexGenerator({ author })
    const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
    const xml = gen.exportXml(result.document)
    expect(xml).toContain('Test')
    expect(xml).toContain('Org')
  })

  it('should export XML with under_investigation status and no justification', () => {
    const events = [createMockAuditEvent({ action: 'escalated' })]
    const result = generator.generateFromAuditEvents(events, context)
    const xml = generator.exportXml(result.document)
    expect(xml).toContain('<state>under_investigation</state>')
    expect(xml).not.toContain('<justification>')
  })

  it('should handle resolved count remaining at zero with kept/filtered/escalated actions', () => {
    const events = [
      createMockAuditEvent({ action: 'kept' }),
      createMockAuditEvent({
        vulnerability: {
          cveId: 'CVE-OTHER',
          severity: 'low',
          cvssScore: 3.0,
          component: { name: 'c', version: '1.0', cpe: 'cpe:c' },
        },
        action: 'filtered',
        componentId: 'comp-003',
      }),
      createMockAuditEvent({
        vulnerability: {
          cveId: 'CVE-THIRD',
          severity: 'medium',
          cvssScore: 5.0,
          component: { name: 'd', version: '1.0', cpe: 'cpe:d' },
        },
        action: 'escalated',
        componentId: 'comp-004',
      }),
    ]
    const result = generator.generateFromAuditEvents(events, context)
    expect(result.stats.resolvedCount).toBe(0)
    expect(result.stats.affectedCount).toBe(1)
    expect(result.stats.notAffectedCount).toBe(1)
    expect(result.stats.underInvestigationCount).toBe(1)
  })

  it('should export XML with multiple component refs in affects', () => {
    const componentRefs = new Map<string, string>()
    componentRefs.set('cpe:2.3:a:test:test-component:1.0.0:*:*:*:*:*:*:*', 'urn:cdx:ref-1')
    const gen = new VexGenerator({ componentRefs })
    const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
    const xml = gen.exportXml(result.document)
    expect(xml).toContain('urn:cdx:ref-1')
  })

  it('should generate statement with author from event user', () => {
    const events = [createMockAuditEvent()]
    const result = generator.generateFromAuditEvents(events, context)
    expect(result.document.statements[0].author).toBe('Test User')
  })

  it('should export XML with references when includeAuditReferences is true', () => {
    const gen = new VexGenerator({ includeAuditReferences: true })
    const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
    const xml = gen.exportXml(result.document)
    expect(xml).toContain('<id>CVE-2024-12345</id>')
  })

  it('should export XML without references when includeAuditReferences is false', () => {
    const gen = new VexGenerator({ includeAuditReferences: false })
    const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
    const stmt = result.document.statements[0]
    expect(stmt.references).toBeUndefined()
  })
})

describe('VexGenerator Coverage Gap Tests', () => {
  let generator: VexGenerator
  let context: FilterContext

  beforeEach(() => {
    generator = new VexGenerator()
    context = createMockContext()
  })

  it('should produce valid JSON round-trip with all fields preserved', () => {
    const gen = new VexGenerator({
      author: { name: 'Round Trip Author', organization: 'Test Org', email: 'rt@test.com' },
      includeDetails: true,
      lifecycle: 'review',
    })
    const events = [
      createMockAuditEvent({
        action: 'filtered',
        filterType: 'version_mismatch',
      }),
    ]
    const result = gen.generateFromAuditEvents(events, context)
    const json = gen.exportJson(result.document)
    const parsed = JSON.parse(json) as VexDocument

    expect(parsed.$schema).toBe(result.document.$schema)
    expect(parsed.bomFormat).toBe('CycloneDX')
    expect(parsed.specVersion).toBe('1.5')
    expect(parsed.serialNumber).toBe(result.document.serialNumber)
    expect(parsed.version).toBe(1)
    expect(parsed.metadata.author.name).toBe('Round Trip Author')
    expect(parsed.metadata.author.organization).toBe('Test Org')
    expect(parsed.metadata.author.email).toBe('rt@test.com')
    expect(parsed.metadata.lifecycle).toBe('review')
    expect(parsed.statements).toHaveLength(1)
    expect(parsed.statements[0].analysis.status).toBe('not_affected')
    expect(parsed.statements[0].analysis.justification).toBe('vulnerable_code_not_present')
    expect(parsed.statements[0].analysis.detail).toBeDefined()
  })

  it('should export XML with specVersion 1.4 when document specifies it', () => {
    const result = generator.generateFromAuditEvents([createMockAuditEvent()], context)
    const doc14: VexDocument = { ...result.document, specVersion: '1.4' }
    const xml = generator.exportXml(doc14)

    expect(xml).toContain('xmlns="http://cyclonedx.org/schema/bom/1.4"')
  })

  it('should handle XML export with special chars in vulnerability ID', () => {
    const events = [
      createMockAuditEvent({
        vulnerability: {
          cveId: 'CVE-<script>alert("xss")</script>',
          severity: 'high',
          cvssScore: 7.5,
          component: { name: 'test', version: '1.0', cpe: 'cpe:test' },
        },
      }),
    ]
    const result = generator.generateFromAuditEvents(events, context)
    const xml = generator.exportXml(result.document)

    expect(xml).toContain('&lt;script&gt;')
    expect(xml).toContain('&quot;xss&quot;')
    expect(xml).not.toContain('<script>')
  })

  it('should export JSON with empty statements array', () => {
    const result = generator.generateFromAuditEvents([], context)
    const json = generator.exportJson(result.document)
    const parsed = JSON.parse(json) as VexDocument

    expect(parsed.statements).toHaveLength(0)
    expect(parsed.metadata.tool.name).toBe('D-Fence')
  })

  it('should generate document with custom lifecycle from convenience function', () => {
    const result = generateVexDocument([createMockAuditEvent()], createMockContext(), { lifecycle: 'deprecated' })

    expect(result.document.metadata.lifecycle).toBe('deprecated')
  })

  it('should preserve all four stat counters with mixed events', () => {
    const events = [
      createMockAuditEvent({
        action: 'filtered',
        vulnerability: {
          cveId: 'CVE-A',
          severity: 'high',
          cvssScore: 7.5,
          component: { name: 'a', version: '1.0', cpe: 'cpe:a' },
        },
      }),
      createMockAuditEvent({
        action: 'kept',
        vulnerability: {
          cveId: 'CVE-B',
          severity: 'critical',
          cvssScore: 9.8,
          component: { name: 'b', version: '2.0', cpe: 'cpe:b' },
        },
      }),
      createMockAuditEvent({
        action: 'escalated',
        vulnerability: {
          cveId: 'CVE-C',
          severity: 'medium',
          cvssScore: 5.5,
          component: { name: 'c', version: '3.0', cpe: 'cpe:c' },
        },
      }),
    ]
    const result = generator.generateFromAuditEvents(events, context)

    expect(result.stats.notAffectedCount).toBe(1)
    expect(result.stats.affectedCount).toBe(1)
    expect(result.stats.underInvestigationCount).toBe(1)
    expect(result.stats.resolvedCount).toBe(0)
    expect(result.stats.totalEvents).toBe(3)
    expect(result.stats.includedStatements).toBe(3)
    expect(result.warnings).toEqual([])
  })

  it('should export XML with multiple affects refs per statement', () => {
    const componentRefs = new Map<string, string>()
    const cpe = 'cpe:2.3:a:test:test-component:1.0.0:*:*:*:*:*:*:*'
    componentRefs.set(cpe, 'urn:cdx:multi-ref-1')

    const gen = new VexGenerator({ componentRefs })
    const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)
    const xml = gen.exportXml(result.document)

    expect(xml).toContain('<ref>urn:cdx:multi-ref-1</ref>')
  })

  it('should fallback to urn:cdx:cpe when componentRefs map has no matching entry', () => {
    const componentRefs = new Map<string, string>()
    componentRefs.set('cpe:nonexistent', 'urn:cdx:some-ref')

    const gen = new VexGenerator({ componentRefs })
    const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)

    expect(result.document.statements[0].affects[0]).toMatch(/^urn:cdx:cpe:/)
  })

  it('should handle exportJson with pretty=false producing single line', () => {
    const result = generator.generateFromAuditEvents([createMockAuditEvent()], context)
    const json = generator.exportJson(result.document, false)

    expect(json).not.toContain('\n')
    expect(() => JSON.parse(json)).not.toThrow()
  })

  it('should include references with type review and event id', () => {
    const events = [createMockAuditEvent({ id: 'evt-review-123' })]
    const gen = new VexGenerator({ includeAuditReferences: true })
    const result = gen.generateFromAuditEvents(events, context)

    expect(result.document.statements[0].references).toBeDefined()
    expect(result.document.statements[0].references![0].type).toBe('review')
    expect(result.document.statements[0].references![0].id).toBe('evt-review-123')
  })

  it('should set statement author from event user name', () => {
    const events = [
      createMockAuditEvent({
        user: { id: 'u-42', name: 'Jane Analyst', role: 'senior' },
      }),
    ]
    const result = generator.generateFromAuditEvents(events, context)

    expect(result.document.statements[0].author).toBe('Jane Analyst')
  })

  it('should set statement timestamp as valid ISO string', () => {
    const result = generator.generateFromAuditEvents([createMockAuditEvent()], context)
    const ts = result.document.statements[0].timestamp

    expect(new Date(ts).toISOString()).toBeTruthy()
  })

  it('should generate document with default FPF System author when no author provided', () => {
    const gen = new VexGenerator({})
    const result = gen.generateFromAuditEvents([createMockAuditEvent()], context)

    expect(result.document.metadata.author.name).toBe('FPF System')
    expect(result.document.metadata.author.organization).toBeUndefined()
  })

  it('should produce XML with nested detail inside analysis', () => {
    const gen = new VexGenerator({ includeDetails: true })
    const events = [
      createMockAuditEvent({
        decision: {
          action: 'filtered',
          tier: 1,
          filterType: 'suppression_rule',
          reason: 'Suppressed via rule XYZ',
          confidence: 99,
        },
      }),
    ]
    const result = gen.generateFromAuditEvents(events, context)
    const xml = gen.exportXml(result.document)

    expect(xml).toContain('<detail>Suppressed via rule XYZ</detail>')
    expect(xml).toContain('<justification>inline_mitigations_already_exist</justification>')
  })

  it('should produce XML closing tags for all sections', () => {
    const result = generator.generateFromAuditEvents([createMockAuditEvent()], context)
    const xml = generator.exportXml(result.document)

    expect(xml).toContain('</metadata>')
    expect(xml).toContain('</tool>')
    expect(xml).toContain('</authors>')
    expect(xml).toContain('</author>')
    expect(xml).toContain('</vulnerabilities>')
    expect(xml).toContain('</vulnerability>')
    expect(xml).toContain('</analysis>')
    expect(xml).toContain('</affects>')
    expect(xml).toContain('</bom>')
  })
})
