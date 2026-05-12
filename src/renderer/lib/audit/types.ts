/**
 * Audit & Compliance System Types
 * Phase 3: Audit & Compliance Logging
 */

// Re-export core types from shared types
export type { AuditEvent, AuditActionType, AuditEntityType, AuditEventMetadata } from '@@/types'

/**
 * Filter options for querying audit logs
 */
export interface AuditEventFilter {
  /** Filter by action type */
  actionType?: AuditActionType[]
  /** Filter by entity type */
  entityType?: AuditEntityType[]
  /** Filter by entity ID */
  entityId?: string
  /** Filter by date range */
  dateRange?: {
    start: Date
    end: Date
  }
  /** Filter by session ID */
  sessionId?: string
  /** Filter by user ID */
  userId?: string
  /** Search in metadata */
  searchQuery?: string
}

/**
 * Sort options for audit logs
 */
export interface AuditEventSort {
  /** Field to sort by */
  field: 'timestamp' | 'entityType' | 'actionType'
  /** Sort direction */
  direction: 'asc' | 'desc'
}

/**
 * Pagination options
 */
export interface AuditEventPagination {
  /** Number of items per page */
  pageSize: number
  /** Page number (1-indexed) */
  page: number
}

/**
 * Query result for audit events
 */
export interface AuditEventQueryResult {
  /** Matching events */
  events: AuditEvent[]
  /** Total number of matching events */
  totalCount: number
  /** Current page */
  currentPage: number
  /** Total pages */
  totalPages: number
  /** Whether there's a next page */
  hasNextPage: boolean
  /** Whether there's a previous page */
  hasPreviousPage: boolean
}

/**
 * Export format for audit logs
 */
export type AuditExportFormat = 'json' | 'csv' | 'pdf'

/**
 * Export options
 */
export interface AuditExportOptions {
  /** Export format */
  format: AuditExportFormat
  /** Filter to apply before export */
  filter?: AuditEventFilter
  /** Include full state data (can be large) */
  includeFullState?: boolean
  /** Anonymize sensitive data */
  anonymize?: boolean
}
