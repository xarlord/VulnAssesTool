/**
 * False Positive Filter - Main Orchestrator
 *
 * Coordinates all filter tiers (Quick Filters, Attack Path Graph, LLM)
 * to reduce false positives while maintaining zero tolerance for
 * missing Critical/High vulnerabilities.
 *
 * ISO 21434 compliant with full audit trail.
 *
 * @module falsePositiveFilter
 */

import { type Database } from 'sql.js'
import { type Vulnerability, type Component } from '@@/shared/types'
import {
  type SystemConfig,
  type FilterResult,
  type FilterBatchResult,
  type FilterAuditEvent,
  type UserRef,
  type FilterContext,
  DEFAULT_FILTER_SETTINGS,
} from '@@/shared/types/fpf'
import { Tier1QuickFilter } from './tier1QuickFilter'
import { Tier2AttackGraphFilter, AttackGraph } from './attackGraph'
import { FilterAuditLogger } from './filterAuditLogger'

/**
 * Filter options
 */
export interface FilterOptions {
  /** Skip Tier 1 filters */
  skipTier1?: boolean
  /** Skip Tier 2 filters */
  skipTier2?: boolean
  /** Force escalation to review */
  forceEscalate?: boolean
  /** Custom user for audit */
  user?: UserRef
}

/**
 * Statistics for filter session
 */
export interface FilterStatistics {
  tier1Processed: number
  tier1Filtered: number
  tier2Processed: number
  tier2Filtered: number
  escalated: number
  kept: number
  totalProcessed: number
  processingTimeMs: number
}

/**
 * False Positive Filter - Main orchestrator class
 */
export class FalsePositiveFilter {
  private config: SystemConfig
  private tier1Filter: Tier1QuickFilter
  private tier2Filter: Tier2AttackGraphFilter | null = null
  private auditLogger: FilterAuditLogger
  private defaultUser: UserRef

  constructor(config: SystemConfig, db: Database) {
    this.config = config
    this.tier1Filter = new Tier1QuickFilter(config)
    this.auditLogger = new FilterAuditLogger(db)
    this.defaultUser = {
      id: 'system',
      name: 'System',
      role: 'automated',
    }

    // Build attack graph if we have interface/service configuration
    if (Object.keys(config.interfaces).length > 0 || Object.keys(config.services).length > 0) {
      const graph = new AttackGraph(config)
      this.tier2Filter = new Tier2AttackGraphFilter(graph)
    }
  }

  /**
   * Update configuration (rebuilds filters)
   */
  updateConfig(config: SystemConfig): void {
    this.config = config
    this.tier1Filter = new Tier1QuickFilter(config)

    if (Object.keys(config.interfaces).length > 0 || Object.keys(config.services).length > 0) {
      const graph = new AttackGraph(config)
      this.tier2Filter = new Tier2AttackGraphFilter(graph)
    } else {
      this.tier2Filter = null
    }
  }

  /**
   * Filter a single vulnerability
   */
  async filterVulnerability(
    vulnerability: Vulnerability,
    component: Component,
    context: FilterContext,
    options: FilterOptions = {},
  ): Promise<FilterResult> {
    const user = options.user || this.defaultUser
    const settings = this.config.filterSettings || DEFAULT_FILTER_SETTINGS
    const _startTime = Date.now()

    // Force escalate if requested
    if (options.forceEscalate) {
      const result: FilterResult = {
        vulnerabilityId: vulnerability.id,
        componentId: component.id,
        action: 'escalated',
        tier: 1,
        filterType: 'suppression_rule',
        reason: 'Forced escalation by user request',
        confidence: 0,
        timestamp: new Date().toISOString(),
      }
      await this.logDecision(result, vulnerability, component, context, user)
      return result
    }

    // Check if we should never auto-filter this severity
    const severity = vulnerability.severity
    const neverAutoFilter = settings.neverAutoFilter || DEFAULT_FILTER_SETTINGS.neverAutoFilter

    // Tier 1: Quick Filters
    if (!options.skipTier1) {
      const tier1Result = this.tier1Filter.filter(vulnerability, component)

      // If high confidence and not in neverAutoFilter, we can filter
      if (
        tier1Result.action === 'filtered' &&
        tier1Result.confidence >= settings.autoFilterConfidenceThreshold &&
        !neverAutoFilter.includes(severity)
      ) {
        await this.logDecision(tier1Result, vulnerability, component, context, user)
        return tier1Result
      }

      // If Critical/High with high confidence, escalate for review instead of filtering
      if (
        tier1Result.action === 'filtered' &&
        (severity === 'critical' || severity === 'high') &&
        tier1Result.confidence < 95
      ) {
        tier1Result.action = 'escalated'
        tier1Result.reason = `${tier1Result.reason} (Escalated: ${severity} severity requires review)`
        await this.logDecision(tier1Result, vulnerability, component, context, user)
        return tier1Result
      }
    }

    // Tier 2: Attack Path Graph
    if (!options.skipTier2 && this.tier2Filter) {
      const tier2Result = this.tier2Filter.analyze(vulnerability, component)

      // If unreachable with high confidence and not in neverAutoFilter
      if (
        tier2Result.action === 'filtered' &&
        tier2Result.confidence >= settings.autoFilterConfidenceThreshold &&
        !neverAutoFilter.includes(severity)
      ) {
        await this.logDecision(tier2Result, vulnerability, component, context, user)
        return tier2Result
      }

      // If Critical/High unreachable, escalate for review
      if (
        tier2Result.action === 'filtered' &&
        (severity === 'critical' || severity === 'high') &&
        tier2Result.confidence < 95
      ) {
        tier2Result.action = 'escalated'
        tier2Result.reason = `${tier2Result.reason} (Escalated: ${severity} severity requires review)`
        await this.logDecision(tier2Result, vulnerability, component, context, user)
        return tier2Result
      }

      // If still uncertain, escalate
      if (tier2Result.action === 'escalated') {
        await this.logDecision(tier2Result, vulnerability, component, context, user)
        return tier2Result
      }
    }

    // Always escalate Critical/High for review if not filtered
    if (settings.alwaysEscalateToReview?.includes(severity)) {
      const result: FilterResult = {
        vulnerabilityId: vulnerability.id,
        componentId: component.id,
        action: 'escalated',
        tier: 2,
        filterType: 'attack_path_blocked',
        reason: `${severity.toUpperCase()} severity vulnerability requires manual review`,
        confidence: 50,
        timestamp: new Date().toISOString(),
      }
      await this.logDecision(result, vulnerability, component, context, user)
      return result
    }

    // Keep the vulnerability (real finding)
    const result: FilterResult = {
      vulnerabilityId: vulnerability.id,
      componentId: component.id,
      action: 'kept',
      tier: 2,
      filterType: 'attack_path_blocked',
      reason: 'No sufficient evidence to filter as false positive',
      confidence: 0,
      timestamp: new Date().toISOString(),
    }
    await this.logDecision(result, vulnerability, component, context, user)
    return result
  }

  /**
   * Filter multiple vulnerabilities in batch
   */
  async filterBatch(
    items: Array<{ vulnerability: Vulnerability; component: Component }>,
    context: FilterContext,
    options: FilterOptions = {},
  ): Promise<FilterBatchResult> {
    const startTime = Date.now()
    const results: FilterResult[] = []

    // Initialize severity counters
    const bySeverity = {
      critical: { filtered: 0, kept: 0, escalated: 0 },
      high: { filtered: 0, kept: 0, escalated: 0 },
      medium: { filtered: 0, kept: 0, escalated: 0 },
      low: { filtered: 0, kept: 0, escalated: 0 },
    }

    // Process each item
    for (const item of items) {
      const result = await this.filterVulnerability(item.vulnerability, item.component, context, options)
      results.push(result)

      // Update counters
      const severity = item.vulnerability.severity
      if (severity && bySeverity[severity]) {
        bySeverity[severity][result.action]++
      }
    }

    const processingTimeMs = Date.now() - startTime

    // Calculate totals
    const filtered = results.filter((r) => r.action === 'filtered').length
    const kept = results.filter((r) => r.action === 'kept').length
    const escalated = results.filter((r) => r.action === 'escalated').length

    return {
      total: items.length,
      filtered,
      kept,
      escalated,
      bySeverity,
      results,
      processingTimeMs,
    }
  }

  /**
   * Log filter decision to audit trail
   */
  private async logDecision(
    result: FilterResult,
    vulnerability: Vulnerability,
    component: Component,
    context: FilterContext,
    user: UserRef,
  ): Promise<void> {
    const settings = this.config.filterSettings?.audit || DEFAULT_FILTER_SETTINGS.audit

    if (!settings.logAllDecisions) {
      return
    }

    const event: Omit<FilterAuditEvent, 'id' | 'timestamp' | 'hash' | 'previousHash'> = {
      eventType: 'filter_decision',
      vulnerability: {
        cveId: vulnerability.id,
        severity: vulnerability.severity,
        cvssScore: vulnerability.cvssScore || 0,
        component: {
          name: component.name,
          version: component.version,
          cpe: component.cpe || '',
        },
      },
      decision: {
        action: result.action,
        tier: result.tier,
        filterType: result.filterType,
        reason: result.reason,
        ruleId: result.ruleId,
        confidence: result.confidence,
        attackPathsBlocked: result.attackPathsBlocked,
      },
      context,
      user,
    }

    await this.auditLogger.logEvent(event)
  }

  /**
   * Undo a filter decision
   */
  async undoDecision(eventId: string, user: UserRef): Promise<void> {
    await this.auditLogger.undoDecision(eventId, user)
  }

  /**
   * Get audit log for project
   */
  async getAuditLog(projectId: string): Promise<FilterAuditEvent[]> {
    return this.auditLogger.getProjectAuditLog(projectId)
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity(): Promise<{ valid: boolean; tamperedEvents: string[] }> {
    return this.auditLogger.verifyIntegrity()
  }

  /**
   * Get low confidence decisions for review
   */
  async getLowConfidenceDecisions(threshold: number = 70): Promise<FilterAuditEvent[]> {
    return this.auditLogger.getLowConfidenceDecisions(threshold)
  }

  /**
   * Get statistics from last filter batch
   */
  getStatistics(results: FilterResult[]): FilterStatistics {
    const tier1Processed = results.filter((r) => r.tier === 1).length
    const tier1Filtered = results.filter((r) => r.tier === 1 && r.action === 'filtered').length
    const tier2Processed = results.filter((r) => r.tier === 2).length
    const tier2Filtered = results.filter((r) => r.tier === 2 && r.action === 'filtered').length
    const escalated = results.filter((r) => r.action === 'escalated').length
    const kept = results.filter((r) => r.action === 'kept').length

    return {
      tier1Processed,
      tier1Filtered,
      tier2Processed,
      tier2Filtered,
      escalated,
      kept,
      totalProcessed: results.length,
      processingTimeMs: 0, // Would need to track this per batch
    }
  }

  /**
   * Check if LLM is available (Tier 3)
   */
  isLLMAvailable(): boolean {
    // LLM is opt-in only, return false for now
    // This would check if LLM config is set up
    return false
  }
}
