/**
 * VEX Document Generator
 *
 * Generates CycloneDX VEX (Vulnerability Exploitability eXchange) documents
 * from FPF (False Positive Filter) decisions.
 *
 * @module services/vex
 * @see https://cyclonedx.org/capabilities/vex/
 */

import type { FilterAuditEvent, FilterAction, FilterContext } from '@@/shared/types/fpf'

// ============================================================================
// VEX TYPES (CycloneDX VEX 1.0)
// ============================================================================

/**
 * VEX analysis status
 */
export type VexAnalysisStatus = 'affected' | 'not_affected' | 'under_investigation' | 'resolved'

/**
 * VEX justification for not_affected status
 */
export type VexJustification =
  | 'component_not_present'
  | 'vulnerable_code_not_present'
  | 'vulnerable_code_not_in_execute_path'
  | 'vulnerable_code_cannot_be_controlled_by_adversary'
  | 'inline_mitigations_already_exist'

/**
 * VEX statement for a single vulnerability
 */
export interface VexStatement {
  /** Vulnerability identifier (CVE, OSV, etc.) */
  vulnerability: string

  /** Analysis of exploitability */
  analysis: {
    /** Current status */
    status: VexAnalysisStatus

    /** Justification if not_affected */
    justification?: VexJustification

    /** Detailed response/explanation */
    detail?: string

    /** Timestamp of analysis */
    timestamp: string
  }

  /** Affected components (bom-refs) */
  affects: string[]

  /** Timestamp when statement was created */
  timestamp: string

  /** Who made the statement */
  author?: string

  /** Reference to original analysis */
  references?: Array<{
    type: 'advisory' | 'fix' | 'review'
    url?: string
    id?: string
  }>
}

/**
 * VEX document metadata
 */
export interface VexMetadata {
  /** Timestamp of document creation */
  timestamp: string

  /** Tool that generated the VEX */
  tool: {
    name: string
    version: string
    vendor: string
  }

  /** Author of the VEX document */
  author: {
    name: string
    organization?: string
    email?: string
  }

  /** Lifecycle of the VEX document */
  lifecycle: 'draft' | 'review' | 'approved' | 'deprecated'
}

/**
 * Complete CycloneDX VEX document
 */
export interface VexDocument {
  /** Document format version */
  $schema: string

  /** BOM format */
  bomFormat: 'CycloneDX'

  /** VEX specification version */
  specVersion: '1.4' | '1.5'

  /** Serial number (URN UUID) */
  serialNumber: string

  /** Document version */
  version: 1

  /** Document metadata */
  metadata: VexMetadata

  /** VEX statements */
  statements: VexStatement[]
}

/**
 * Options for VEX generation
 */
export interface VexGeneratorOptions {
  /** Include detailed reasoning in statements */
  includeDetails?: boolean

  /** Author information */
  author?: {
    name: string
    organization?: string
    email?: string
  }

  /** Document lifecycle status */
  lifecycle?: 'draft' | 'review' | 'approved' | 'deprecated'

  /** SBOM bom-refs for component mapping */
  componentRefs?: Map<string, string>

  /** Filter by action type */
  filterActions?: FilterAction[]

  /** Include audit event references */
  includeAuditReferences?: boolean
}

/**
 * Result of VEX generation
 */
export interface VexGenerationResult {
  /** Generated VEX document */
  document: VexDocument

  /** Statistics about generation */
  stats: {
    totalEvents: number
    includedStatements: number
    affectedCount: number
    notAffectedCount: number
    underInvestigationCount: number
    resolvedCount: number
  }

  /** Any warnings during generation */
  warnings: string[]
}

// ============================================================================
// VEX GENERATOR CLASS
// ============================================================================

/**
 * Generates CycloneDX VEX documents from FPF audit events
 */
export class VexGenerator {
  private options: VexGeneratorOptions

  constructor(options: VexGeneratorOptions = {}) {
    this.options = {
      includeDetails: true,
      lifecycle: 'approved',
      includeAuditReferences: true,
      ...options,
    }
  }

  /**
   * Generate a VEX document from FPF audit events
   */
  generateFromAuditEvents(events: FilterAuditEvent[], _context: FilterContext): VexGenerationResult {
    const warnings: string[] = []
    const statements: VexStatement[] = []
    const stats = {
      totalEvents: events.length,
      includedStatements: 0,
      affectedCount: 0,
      notAffectedCount: 0,
      underInvestigationCount: 0,
      resolvedCount: 0,
    }

    // Filter events if needed
    const filteredEvents = this.options.filterActions
      ? events.filter((e) => this.options.filterActions!.includes(e.decision.action))
      : events

    // Group events by vulnerability
    const byVulnerability = this.groupByVulnerability(filteredEvents)

    for (const [vulnId, vulnEvents] of byVulnerability) {
      // Get the latest event for each vulnerability
      const latestEvent = vulnEvents.reduce((latest, current) =>
        new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest,
      )

      // Map filter action to VEX status
      const status = this.mapActionToStatus(latestEvent.decision.action)

      // Get component bom-refs
      const affects = this.getComponentRefs(latestEvent, this.options.componentRefs)

      // Build justification
      const justification = this.determineJustification(latestEvent)

      // Build statement
      const statement: VexStatement = {
        vulnerability: vulnId,
        analysis: {
          status,
          justification: status === 'not_affected' ? justification : undefined,
          detail: this.options.includeDetails ? latestEvent.decision.reason : undefined,
          timestamp: latestEvent.timestamp,
        },
        affects,
        timestamp: new Date().toISOString(),
        author: latestEvent.user.name,
        references: this.options.includeAuditReferences ? [{ type: 'review' as const, id: latestEvent.id }] : undefined,
      }

      statements.push(statement)
      stats.includedStatements++

      // Update stats
      switch (status) {
        case 'affected':
          stats.affectedCount++
          break
        case 'not_affected':
          stats.notAffectedCount++
          break
        case 'under_investigation':
          stats.underInvestigationCount++
          break
        case 'resolved':
          stats.resolvedCount++
          break
      }
    }

    // Build the document
    const document: VexDocument = {
      $schema: 'http://cyclonedx.org/schema/bom-1.5.schema.json',
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      serialNumber: `urn:uuid:${this.generateUUID()}`,
      version: 1,
      metadata: {
        timestamp: new Date().toISOString(),
        tool: {
          name: 'VulnAssesTool',
          version: '2.0.0',
          vendor: 'VulnAssesTool',
        },
        author: this.options.author || {
          name: 'FPF System',
        },
        lifecycle: this.options.lifecycle || 'approved',
      },
      statements,
    }

    return { document, stats, warnings }
  }

  /**
   * Export VEX document as JSON string
   */
  exportJson(document: VexDocument, pretty: boolean = true): string {
    return JSON.stringify(document, null, pretty ? 2 : 0)
  }

  /**
   * Export VEX document as XML string
   */
  exportXml(document: VexDocument): string {
    const indent = (n: number) => '  '.repeat(n)

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += `<bom xmlns="http://cyclonedx.org/schema/bom/${document.specVersion}" `
    xml += `serialNumber="${document.serialNumber}" version="${document.version}">\n`

    // Metadata
    xml += `${indent(1)}<metadata>\n`
    xml += `${indent(2)}<timestamp>${document.metadata.timestamp}</timestamp>\n`
    xml += `${indent(2)}<tool>\n`
    xml += `${indent(3)}<name>${this.escapeXml(document.metadata.tool.name)}</name>\n`
    xml += `${indent(3)}<version>${document.metadata.tool.version}</version>\n`
    xml += `${indent(3)}<vendor>${this.escapeXml(document.metadata.tool.vendor)}</vendor>\n`
    xml += `${indent(2)}</tool>\n`
    xml += `${indent(2)}<authors>\n`
    xml += `${indent(3)}<author>\n`
    xml += `${indent(4)}<name>${this.escapeXml(document.metadata.author.name)}</name>\n`
    if (document.metadata.author.organization) {
      xml += `${indent(4)}<organization>${this.escapeXml(document.metadata.author.organization)}</organization>\n`
    }
    xml += `${indent(3)}</author>\n`
    xml += `${indent(2)}</authors>\n`
    xml += `${indent(2)}<lifecycle>${document.metadata.lifecycle}</lifecycle>\n`
    xml += `${indent(1)}</metadata>\n`

    // Statements
    xml += `${indent(1)}<vulnerabilities>\n`
    for (const stmt of document.statements) {
      xml += `${indent(2)}<vulnerability>\n`
      xml += `${indent(3)}<id>${this.escapeXml(stmt.vulnerability)}</id>\n`
      xml += `${indent(3)}<analysis>\n`
      xml += `${indent(4)}<state>${stmt.analysis.status}</state>\n`
      if (stmt.analysis.justification) {
        xml += `${indent(4)}<justification>${stmt.analysis.justification}</justification>\n`
      }
      if (stmt.analysis.detail) {
        xml += `${indent(4)}<detail>${this.escapeXml(stmt.analysis.detail)}</detail>\n`
      }
      xml += `${indent(3)}</analysis>\n`
      xml += `${indent(3)}<affects>\n`
      for (const ref of stmt.affects) {
        xml += `${indent(4)}<ref>${this.escapeXml(ref)}</ref>\n`
      }
      xml += `${indent(3)}</affects>\n`
      xml += `${indent(2)}</vulnerability>\n`
    }
    xml += `${indent(1)}</vulnerabilities>\n`

    xml += '</bom>'
    return xml
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private groupByVulnerability(events: FilterAuditEvent[]): Map<string, FilterAuditEvent[]> {
    const grouped = new Map<string, FilterAuditEvent[]>()

    for (const event of events) {
      const vulnId = event.vulnerability.cveId
      if (!grouped.has(vulnId)) {
        grouped.set(vulnId, [])
      }
      grouped.get(vulnId)!.push(event)
    }

    return grouped
  }

  private mapActionToStatus(action: FilterAction): VexAnalysisStatus {
    switch (action) {
      case 'filtered':
        return 'not_affected'
      case 'kept':
        return 'affected'
      case 'escalated':
        return 'under_investigation'
      default:
        return 'under_investigation'
    }
  }

  private determineJustification(event: FilterAuditEvent): VexJustification {
    const { filterType, reason } = event.decision

    switch (filterType) {
      case 'disabled_interface':
      case 'feature_disabled':
        return 'vulnerable_code_not_in_execute_path'
      case 'version_mismatch':
        return 'vulnerable_code_not_present'
      case 'suppression_rule':
        return 'inline_mitigations_already_exist'
      case 'internal_only':
      case 'attack_path_blocked':
        return 'vulnerable_code_cannot_be_controlled_by_adversary'
      default:
        // Default based on reason analysis
        if (reason.toLowerCase().includes('not present')) {
          return 'vulnerable_code_not_present'
        }
        if (reason.toLowerCase().includes('not in path')) {
          return 'vulnerable_code_not_in_execute_path'
        }
        if (reason.toLowerCase().includes('mitigation')) {
          return 'inline_mitigations_already_exist'
        }
        return 'vulnerable_code_cannot_be_controlled_by_adversary'
    }
  }

  private getComponentRefs(event: FilterAuditEvent, componentRefs?: Map<string, string>): string[] {
    if (componentRefs) {
      const ref = componentRefs.get(event.vulnerability.component.cpe)
      return ref ? [ref] : [`urn:cdx:${event.componentId}`]
    }
    return [`urn:cdx:${event.componentId}`]
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Create a VEX generator with default options
 */
export function createVexGenerator(options?: VexGeneratorOptions): VexGenerator {
  return new VexGenerator(options)
}

/**
 * Generate VEX document from audit events (convenience function)
 */
export function generateVexDocument(
  events: FilterAuditEvent[],
  context: FilterContext,
  options?: VexGeneratorOptions,
): VexGenerationResult {
  const generator = new VexGenerator(options)
  return generator.generateFromAuditEvents(events, context)
}
