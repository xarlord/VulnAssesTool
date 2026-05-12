/**
 * FPF Services Index
 *
 * Exports all FPF service modules for the False Positive Filter system.
 */

// Re-export types for convenience
export * from '@@/shared/types/fpf'

// Configuration Service
export { ConfigService, configService } from './configService'

// Main Orchestrator
export { FalsePositiveFilter } from './falsePositiveFilter'
export type { FilterOptions, FilterStatistics } from './falsePositiveFilter'

// Tier 1 Quick Filters
export { Tier1QuickFilter, createTier1QuickFilter } from './tier1QuickFilter'

// Tier 2 Attack Graph Filter
export { AttackGraph } from './attackGraph'
export type { GraphTemplate } from './attackGraph'
export { Tier2AttackGraphFilter } from './tier2AttackGraphFilter'

// Default Suppression Rules
export {
  DEFAULT_SUPPRESSION_RULES,
  matchSuppressionRule,
  matchCPEPattern,
  getMatchingDefaultRules,
  validateSuppressionRule,
  createSuppressionRule,
} from './defaultRules'

// Audit Logger (ISO 21434)
export { FilterAuditLogger } from './filterAuditLogger'
export type { AuditEventInput, IntegrityVerificationResult } from './filterAuditLogger'

// ISO 21434 Report Generator
export { ISO21434ReportGenerator } from './iso21434ReportGenerator'
export type { ReportOptions } from './iso21434ReportGenerator'
