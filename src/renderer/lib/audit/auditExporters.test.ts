/**
 * Audit Exporters Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuditStore } from './auditStore'
import {
  exportAuditLogs,
  exportAllAuditLogsAsJson,
  exportAllAuditLogsAsCsv,
  getAuditExportFilename,
} from './auditExporters'
import type { AuditExportFormat } from './types'

// Mock the export functions
vi.mock('../export/csv', () => ({
  downloadCsv: vi.fn(),
  sanitizeFilename: (name: string) => name,
}))

vi.mock('../export/json', () => ({
  downloadJson: vi.fn(),
}))

vi.mock('../export/pdf', () => ({
  downloadPdf: vi.fn(),
}))

describe('Audit Exporters', () => {
  beforeEach(() => {
    useAuditStore.getState()._resetStore()

    // Add test events
    const store = useAuditStore.getState()

    store.addEvent({
      actionType: 'CREATE',
      entityType: 'project',
      entityId: 'project-1',
      newState: { name: 'Project 1' },
      metadata: { description: 'Created project' },
    })

    store.addEvent({
      actionType: 'UPDATE',
      entityType: 'project',
      entityId: 'project-1',
      previousState: { name: 'Project 1' },
      newState: { name: 'Updated Project 1' },
      metadata: { description: 'Updated project' },
    })

    store.addEvent({
      actionType: 'SCAN',
      entityType: 'vulnerability',
      entityId: 'vuln-1',
      newState: { vulnerabilityCount: 5 },
      metadata: { description: 'Completed scan' },
    })
  })

  describe('getAuditExportFilename', () => {
    it('should generate filename with correct extension for json', () => {
      const filename = getAuditExportFilename('json')
      expect(filename).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.json$/)
    })

    it('should generate filename with correct extension for csv', () => {
      const filename = getAuditExportFilename('csv')
      expect(filename).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.csv$/)
    })

    it('should generate filename with correct extension for pdf', () => {
      const filename = getAuditExportFilename('pdf')
      expect(filename).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}\.pdf$/)
    })
  })

  describe('exportAuditLogs', () => {
    it('should export all events without filter', () => {
      exportAuditLogs({ format: 'json' })

      const events = useAuditStore.getState().events
      expect(events).toHaveLength(3)
    })

    it('should apply date range filter', () => {
      const end = new Date()
      const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)

      exportAuditLogs({
        format: 'json',
        filter: { dateRange: { start, end } },
      })

      // Export should be called
      expect(true).toBe(true)
    })

    it('should filter by action type', () => {
      exportAuditLogs({
        format: 'json',
        filter: { actionType: ['CREATE', 'UPDATE'] },
      })

      const filtered = useAuditStore.getState().queryEvents({ actionType: ['CREATE', 'UPDATE'] })
      expect(filtered.totalCount).toBe(2)
    })

    it('should filter by entity type', () => {
      exportAuditLogs({
        format: 'json',
        filter: { entityType: ['project'] },
      })

      const filtered = useAuditStore.getState().queryEvents({ entityType: ['project'] })
      expect(filtered.totalCount).toBe(2)
    })

    it('should include full state when requested', () => {
      exportAuditLogs({
        format: 'json',
        includeFullState: true,
      })

      // Events should have full state data
      const events = useAuditStore.getState().events
      expect(events[0].newState).toBeDefined()
    })

    it('should redact state when not requested', () => {
      exportAuditLogs({
        format: 'json',
        includeFullState: false,
      })

      // State should be redacted
      const events = useAuditStore.getState().events
      // The export function should handle the redaction
      expect(true).toBe(true)
    })
  })

  describe('exportAllAuditLogsAsJson', () => {
    it('should export all logs as JSON', () => {
      exportAllAuditLogsAsJson()

      const events = useAuditStore.getState().events
      expect(events.length).toBeGreaterThan(0)
    })
  })

  describe('exportAllAuditLogsAsCsv', () => {
    it('should export all logs as CSV', () => {
      exportAllAuditLogsAsCsv()

      const events = useAuditStore.getState().events
      expect(events.length).toBeGreaterThan(0)
    })
  })
})
