/**
 * Audit & Compliance Library
 * Phase 3: Audit & Compliance Logging
 *
 * Provides comprehensive audit trail for all application state changes
 * Features:
 * - Append-only immutable log
 * - IndexedDB persistence
 * - Exportable for compliance (CSV, JSON, PDF)
 * - Full change history with before/after states
 * - ULID-based time-ordered event IDs
 * - Session-based grouping
 * - Rich filtering and querying
 */

// Export types
export * from './types'

// Export ULID utilities
export * from './ulid'

// Export store
export { useAuditStore } from './auditStore'
export type { AuditStatistics } from './auditStore'

// Export logger utilities
export {
  logProjectCreate,
  logProjectUpdate,
  logProjectDelete,
  logVulnerabilityScan,
  logVulnerabilityRefresh,
  logSbomUpload,
  logSbomRemove,
  logSettingsChange,
  logProfileEvent,
  logExport,
  logBulkOperation,
  logAuditEvent,
} from './auditLogger'

// Export utilities
export {
  exportAuditLogs,
  exportAllAuditLogsAsJson,
  exportAllAuditLogsAsCsv,
  exportAllAuditLogsAsPdf,
  exportAuditLogsLastDays,
  getAuditExportFilename,
} from './auditExporters'

// Export middleware
export { configureAuditMiddleware, createAuditMiddleware, withAuditLogging } from './auditMiddleware'
