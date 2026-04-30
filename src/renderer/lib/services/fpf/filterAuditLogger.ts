/**
 * Filter Audit Logger
 *
 * ISO 21434 compliant audit logger for False Positive Filter decisions.
 * Implements hash chain for tamper detection and integrity verification.
 *
 * @module filterAuditLogger
 */

import type { Database } from 'sql.js'
import type {
  FilterAuditEvent,
  AuditEventType,
  FilterDecision,
  FilterContext,
  UserRef,
  VulnerabilityRef,
  LLMAnalysisResult,
} from '@@/types/fpf'

/**
 * Event input for logging (without generated fields)
 */
export interface AuditEventInput {
  eventType: AuditEventType
  vulnerability: VulnerabilityRef
  decision: FilterDecision
  context: FilterContext
  user: UserRef
  llmData?: {
    model: string
    prompt: string
    response: string
    parsedResult: LLMAnalysisResult
  }
}

/**
 * Integrity verification result
 */
export interface IntegrityVerificationResult {
  valid: boolean
  tamperedEvents: string[]
  firstTamperedIndex?: number
}

/**
 * Undo record
 */
interface UndoRecord {
  id: string
  timestamp: string
  user: UserRef
}

/**
 * Raw database row for audit event
 */
interface AuditEventRow {
  id: string
  timestamp: string
  event_type: string
  project_id: string
  vulnerability_id: string
  vulnerability_json: string
  decision_json: string
  context_json: string
  user_json: string
  hash: string
  previous_hash: string
  llm_data_json: string | null
  undone: number
  undone_by_json: string | null
  undone_at: string | null
  created_at: string
}

/**
 * Filter Audit Logger class
 * Provides ISO 21434 compliant audit trail for filter decisions
 */
export class FilterAuditLogger {
  private db: Database | null
  private hashCache: Map<string, string> = new Map()

  constructor(db?: Database) {
    this.db = db ?? null
    if (this.db) {
      this.initializeSchema()
    }
  }

  /**
   * Initialize the audit schema if not exists
   */
  private initializeSchema(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS fpf_audit_events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        project_id TEXT NOT NULL,
        vulnerability_id TEXT NOT NULL,
        vulnerability_json TEXT NOT NULL,
        decision_json TEXT NOT NULL,
        context_json TEXT NOT NULL,
        user_json TEXT NOT NULL,
        hash TEXT NOT NULL,
        previous_hash TEXT NOT NULL,
        llm_data_json TEXT,
        undone INTEGER DEFAULT 0,
        undone_by_json TEXT,
        undone_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `

    const indexSQLs = [
      'CREATE INDEX IF NOT EXISTS idx_fpf_audit_project ON fpf_audit_events(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_fpf_audit_vuln ON fpf_audit_events(vulnerability_id)',
      'CREATE INDEX IF NOT EXISTS idx_fpf_audit_timestamp ON fpf_audit_events(timestamp)',
      'CREATE INDEX IF NOT EXISTS idx_fpf_audit_event_type ON fpf_audit_events(event_type)',
      'CREATE INDEX IF NOT EXISTS idx_fpf_audit_created ON fpf_audit_events(created_at DESC)',
    ]

    this.db.run(createTableSQL)
    for (const sql of indexSQLs) {
      this.db.run(sql)
    }
  }

  /**
   * Generate a unique event ID using timestamp and random components
   */
  private generateEventId(): string {
    const timestamp = Date.now().toString(36)
    const randomPart = Math.random().toString(36).substring(2, 10)
    return `fpf-audit-${timestamp}-${randomPart}`
  }

  /**
   * Compute SHA-256 hash of data
   */
  private async sha256(data: string): Promise<string> {
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)

    // Use SubtleCrypto API for hashing
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Get the hash of the last event in the chain
   */
  private async getLastEventHash(): Promise<string> {
    if (!this.db) return '0'.repeat(64)
    const result = this.db.exec('SELECT hash FROM fpf_audit_events ORDER BY created_at DESC LIMIT 1')

    if (result.length === 0 || result[0].values.length === 0) {
      // Genesis hash for first event
      return '0'.repeat(64)
    }

    return result[0].values[0][0] as string
  }

  /**
   * Serialize event data for hashing
   */
  private serializeForHash(
    id: string,
    timestamp: string,
    eventType: AuditEventType,
    vulnerabilityId: string,
    decision: FilterDecision,
    previousHash: string,
  ): string {
    return JSON.stringify({
      id,
      timestamp,
      eventType,
      vulnerabilityId,
      decision: {
        action: decision.action,
        tier: decision.tier,
        filterType: decision.filterType,
        reason: decision.reason,
        confidence: decision.confidence,
      },
      previousHash,
    })
  }

  /**
   * Convert database row to FilterAuditEvent
   */
  private rowToEvent(row: AuditEventRow): FilterAuditEvent {
    const event: FilterAuditEvent = {
      id: row.id,
      timestamp: row.timestamp,
      eventType: row.event_type as AuditEventType,
      vulnerability: JSON.parse(row.vulnerability_json) as VulnerabilityRef,
      decision: JSON.parse(row.decision_json) as FilterDecision,
      context: JSON.parse(row.context_json) as FilterContext,
      user: JSON.parse(row.user_json) as UserRef,
      hash: row.hash,
      previousHash: row.previous_hash,
    }

    if (row.llm_data_json) {
      event.llmData = JSON.parse(row.llm_data_json)
    }

    return event
  }

  /**
   * Log a filter audit event with hash chain integrity
   */
  async logEvent(event: AuditEventInput): Promise<void> {
    if (!this.db) return
    const id = this.generateEventId()
    const timestamp = new Date().toISOString()
    const previousHash = await this.getLastEventHash()

    // Create hash of this event
    const hashData = this.serializeForHash(
      id,
      timestamp,
      event.eventType,
      event.vulnerability.cveId,
      event.decision,
      previousHash,
    )
    const hash = await this.sha256(hashData)

    // Store in hash cache for quick verification
    this.hashCache.set(id, hash)

    // Insert event into database
    const insertSQL = `
      INSERT INTO fpf_audit_events (
        id, timestamp, event_type, project_id, vulnerability_id, vulnerability_json,
        decision_json, context_json, user_json, hash, previous_hash, llm_data_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    this.db.run(insertSQL, [
      id,
      timestamp,
      event.eventType,
      event.context.projectId,
      event.vulnerability.cveId,
      JSON.stringify(event.vulnerability),
      JSON.stringify(event.decision),
      JSON.stringify(event.context),
      JSON.stringify(event.user),
      hash,
      previousHash,
      event.llmData ? JSON.stringify(event.llmData) : null,
    ])
  }

  /**
   * Get all audit events for a project
   */
  async getProjectAuditLog(projectId: string): Promise<FilterAuditEvent[]> {
    if (!this.db) return []
    const result = this.db.exec(
      `SELECT * FROM fpf_audit_events
       WHERE project_id = ?
       ORDER BY created_at ASC`,
      [projectId],
    )

    if (result.length === 0) {
      return []
    }

    const columns = result[0].columns
    return result[0].values.map((row) => {
      const rowObj: Record<string, unknown> = {}
      columns.forEach((col, i) => {
        rowObj[col] = row[i]
      })
      return this.rowToEvent(rowObj as unknown as AuditEventRow)
    })
  }

  /**
   * Get all decisions for a specific CVE
   */
  async getCVEDecisions(cveId: string): Promise<FilterAuditEvent[]> {
    const result = this.db.exec(
      `SELECT * FROM fpf_audit_events
       WHERE vulnerability_id = ?
       ORDER BY created_at ASC`,
      [cveId],
    )

    if (result.length === 0) {
      return []
    }

    const columns = result[0].columns
    return result[0].values.map((row) => {
      const rowObj: Record<string, unknown> = {}
      columns.forEach((col, i) => {
        rowObj[col] = row[i]
      })
      return this.rowToEvent(rowObj as unknown as AuditEventRow)
    })
  }

  /**
   * Get decisions with confidence below threshold (for review)
   */
  async getLowConfidenceDecisions(threshold: number): Promise<FilterAuditEvent[]> {
    const result = this.db.exec(
      `SELECT * FROM fpf_audit_events
       WHERE undone = 0
       ORDER BY created_at ASC`,
    )

    if (result.length === 0) {
      return []
    }

    const columns = result[0].columns
    const events: FilterAuditEvent[] = []

    for (const row of result[0].values) {
      const rowObj: Record<string, unknown> = {}
      columns.forEach((col, i) => {
        rowObj[col] = row[i]
      })
      const event = this.rowToEvent(rowObj as unknown as AuditEventRow)

      // Filter by confidence threshold
      if (event.decision.confidence < threshold) {
        events.push(event)
      }
    }

    return events
  }

  /**
   * Verify the integrity of the audit log hash chain
   */
  async verifyIntegrity(): Promise<IntegrityVerificationResult> {
    const result = this.db.exec('SELECT * FROM fpf_audit_events ORDER BY created_at ASC')

    if (result.length === 0) {
      return { valid: true, tamperedEvents: [] }
    }

    const columns = result[0].columns
    const tamperedEvents: string[] = []
    let previousHash = '0'.repeat(64) // Genesis hash
    let firstTamperedIndex: number | undefined

    for (let i = 0; i < result[0].values.length; i++) {
      const row = result[0].values[i]
      const rowObj: Record<string, unknown> = {}
      columns.forEach((col, j) => {
        rowObj[col] = row[j]
      })
      const event = rowObj as unknown as AuditEventRow

      // Verify previous hash chain
      if (event.previous_hash !== previousHash) {
        tamperedEvents.push(event.id)
        if (firstTamperedIndex === undefined) {
          firstTamperedIndex = i
        }
      } else {
        // Verify event hash
        const hashData = this.serializeForHash(
          event.id,
          event.timestamp,
          event.event_type as AuditEventType,
          event.vulnerability_id,
          JSON.parse(event.decision_json) as FilterDecision,
          event.previous_hash,
        )
        const computedHash = await this.sha256(hashData)

        if (computedHash !== event.hash) {
          tamperedEvents.push(event.id)
          if (firstTamperedIndex === undefined) {
            firstTamperedIndex = i
          }
        }
      }

      previousHash = event.hash
    }

    return {
      valid: tamperedEvents.length === 0,
      tamperedEvents,
      firstTamperedIndex,
    }
  }

  /**
   * Undo a previous decision
   * This does not delete the event but marks it as undone
   */
  async undoDecision(eventId: string, user: UserRef): Promise<void> {
    const timestamp = new Date().toISOString()
    const undoRecord: UndoRecord = {
      id: this.generateEventId(),
      timestamp,
      user,
    }

    this.db.run(
      `UPDATE fpf_audit_events
       SET undone = 1,
           undone_by_json = ?,
           undone_at = ?
       WHERE id = ?`,
      [JSON.stringify(undoRecord), timestamp, eventId],
    )
  }

  /**
   * Get undone status for an event
   */
  async getUndoStatus(eventId: string): Promise<{ undone: boolean; undoneBy?: UndoRecord } | null> {
    const result = this.db.exec('SELECT undone, undone_by_json FROM fpf_audit_events WHERE id = ?', [eventId])

    if (result.length === 0 || result[0].values.length === 0) {
      return null
    }

    const row = result[0].values[0]
    const undone = row[0] === 1

    if (undone && row[1]) {
      return {
        undone: true,
        undoneBy: JSON.parse(row[1] as string) as UndoRecord,
      }
    }

    return { undone: false }
  }

  /**
   * Export audit log for a project as JSON
   */
  async exportProjectAuditLog(projectId: string): Promise<string> {
    const events = await this.getProjectAuditLog(projectId)
    return JSON.stringify(events, null, 2)
  }

  /**
   * Get statistics for a project's audit log
   */
  async getProjectStats(projectId: string): Promise<{
    totalEvents: number
    eventsByType: Record<string, number>
    eventsByTier: Record<number, number>
    averageConfidence: number
    undoneCount: number
  }> {
    const events = await this.getProjectAuditLog(projectId)

    const eventsByType: Record<string, number> = {}
    const eventsByTier: Record<number, number> = {}
    let totalConfidence = 0
    let undoneCount = 0

    for (const event of events) {
      // Count by type
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1

      // Count by tier
      eventsByTier[event.decision.tier] = (eventsByTier[event.decision.tier] || 0) + 1

      // Sum confidence
      totalConfidence += event.decision.confidence

      // Check undone status
      const undoStatus = await this.getUndoStatus(event.id)
      if (undoStatus?.undone) {
        undoneCount++
      }
    }

    return {
      totalEvents: events.length,
      eventsByType,
      eventsByTier,
      averageConfidence: events.length > 0 ? totalConfidence / events.length : 0,
      undoneCount,
    }
  }
}

export default FilterAuditLogger
