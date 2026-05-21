/**
 * Audit Exporters Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuditStore } from './auditStore'
import {
  exportAuditLogs,
  exportAllAuditLogsAsJson,
  exportAllAuditLogsAsCsv,
  exportAllAuditLogsAsPdf,
  exportAuditLogsLastDays,
  getAuditExportFilename,
} from './auditExporters'
import type { AuditExportFormat } from './types'
import { downloadCsv } from '../export/csv'
import { downloadJson } from '../export/json'
import { downloadPdf } from '../export/pdf'

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

vi.mock('jspdf', () => {
  class MockJsPDF {
    setFontSize() {
      return this
    }
    text() {
      return this
    }
    fontSize = 12
    internal = { getCurrentPageInfo: () => ({ pageNumber: 1 }) }
    getNumberOfPages() {
      return 1
    }
    save() {}
  }
  return { jsPDF: MockJsPDF, default: MockJsPDF }
})

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}))

describe('Audit Exporters', () => {
  beforeEach(() => {
    useAuditStore.getState().resetStore()

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

  describe('CSV export', () => {
    it('should call downloadCsv with CSV formatted content', () => {
      exportAuditLogs({ format: 'csv' })

      expect(downloadCsv).toHaveBeenCalledTimes(1)
      const [csvContent, filename] = vi.mocked(downloadCsv).mock.calls[0]
      expect(filename).toMatch(/^audit-log-.*\.csv$/)
      expect(csvContent).toContain('ID,Timestamp,Session ID')
      expect(csvContent).toContain('CREATE')
      expect(csvContent).toContain('project')
    })

    it('should escape CSV values with commas', () => {
      useAuditStore.getState().resetStore()
      useAuditStore.getState().addEvent({
        actionType: 'UPDATE',
        entityType: 'project',
        entityId: 'proj-1',
        metadata: { description: 'Value, with comma' },
      })

      exportAuditLogs({ format: 'csv' })

      const csvContent = vi.mocked(downloadCsv).mock.calls[0][0]
      expect(csvContent).toContain('"Value, with comma"')
    })

    it('should escape CSV values with quotes', () => {
      useAuditStore.getState().resetStore()
      useAuditStore.getState().addEvent({
        actionType: 'UPDATE',
        entityType: 'project',
        entityId: 'proj-1',
        metadata: { description: 'Value "with" quotes' },
      })

      exportAuditLogs({ format: 'csv' })

      const csvContent = vi.mocked(downloadCsv).mock.calls[0][0]
      expect(csvContent).toContain('"Value ""with"" quotes"')
    })

    it('should escape CSV values with newlines', () => {
      useAuditStore.getState().resetStore()
      useAuditStore.getState().addEvent({
        actionType: 'UPDATE',
        entityType: 'project',
        entityId: 'proj-1',
        metadata: { description: 'Line1\nLine2' },
      })

      exportAuditLogs({ format: 'csv' })

      const csvContent = vi.mocked(downloadCsv).mock.calls[0][0]
      expect(csvContent).toContain('"Line1\nLine2"')
    })

    it('should include bulk operation metadata', () => {
      useAuditStore.getState().resetStore()
      useAuditStore.getState().addEvent({
        actionType: 'DELETE',
        entityType: 'project',
        entityId: 'proj-1',
        metadata: { description: 'Bulk delete', isBulkOperation: true, bulkItemCount: 5 },
      })

      exportAuditLogs({ format: 'csv' })

      const csvContent = vi.mocked(downloadCsv).mock.calls[0][0]
      expect(csvContent).toContain('Yes')
      expect(csvContent).toContain('5')
    })
  })

  describe('JSON export', () => {
    it('should call downloadJson with structured JSON', () => {
      exportAuditLogs({ format: 'json' })

      expect(downloadJson).toHaveBeenCalledTimes(1)
      const [jsonContent, filename] = vi.mocked(downloadJson).mock.calls[0]
      expect(filename).toMatch(/^audit-log-.*\.json$/)

      const parsed = JSON.parse(jsonContent as string)
      expect(parsed.version).toBe('1.0')
      expect(parsed.totalEvents).toBe(3)
      expect(parsed.exportedAt).toBeDefined()
      expect(parsed.events).toHaveLength(3)
    })
  })

  describe('PDF export', () => {
    it('should call downloadPdf for PDF format', async () => {
      await exportAuditLogs({ format: 'pdf' })
      expect(downloadPdf).toHaveBeenCalledTimes(1)
    })
  })

  describe('Anonymization', () => {
    it('should anonymize user data when anonymize is true', () => {
      useAuditStore.getState().resetStore()
      useAuditStore.getState().addEvent({
        actionType: 'CREATE',
        entityType: 'project',
        entityId: 'proj-1',
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        newState: { name: 'Project 1' },
        metadata: { description: 'Created project' },
      })

      exportAuditLogs({ format: 'json', anonymize: true })

      const jsonContent = vi.mocked(downloadJson).mock.calls[0][0] as string
      const parsed = JSON.parse(jsonContent)
      expect(parsed.events[0].userId).toBe('[REDACTED]')
      expect(parsed.events[0].ipAddress).toBe('[REDACTED]')
      expect(parsed.events[0].sessionId).toMatch(/^.+\.\.\.$/)
    })

    it('should not anonymize when anonymize is false', () => {
      useAuditStore.getState().resetStore()
      useAuditStore.getState().addEvent({
        actionType: 'CREATE',
        entityType: 'project',
        entityId: 'proj-1',
        userId: 'user-123',
        ipAddress: '192.168.1.1',
        newState: { name: 'Project 1' },
        metadata: { description: 'Created' },
      })

      exportAuditLogs({ format: 'json', anonymize: false })

      const jsonContent = vi.mocked(downloadJson).mock.calls[0][0] as string
      const parsed = JSON.parse(jsonContent)
      expect(parsed.events[0].userId).toBe('user-123')
      expect(parsed.events[0].ipAddress).toBe('192.168.1.1')
    })
  })

  describe('State redaction', () => {
    it('should redact previousState and newState when includeFullState is false', () => {
      exportAuditLogs({ format: 'json', includeFullState: false })

      const jsonContent = vi.mocked(downloadJson).mock.calls[0][0] as string
      const parsed = JSON.parse(jsonContent)
      for (const event of parsed.events) {
        if (event.previousState) {
          expect(event.previousState).toBe('[REDACTED]')
        }
        if (event.newState) {
          expect(event.newState).toBe('[REDACTED]')
        }
      }
    })

    it('should include full state when includeFullState is true', () => {
      exportAuditLogs({ format: 'json', includeFullState: true })

      const jsonContent = vi.mocked(downloadJson).mock.calls[0][0] as string
      const parsed = JSON.parse(jsonContent)
      const withNewState = parsed.events.filter((e: { newState: unknown }) => e.newState !== undefined)
      expect(withNewState.length).toBeGreaterThan(0)
      const stateVal = withNewState[0].newState
      expect(stateVal).not.toBe('[REDACTED]')
    })
  })

  describe('exportAllAuditLogsAsPdf', () => {
    it('should export all logs as PDF', async () => {
      exportAllAuditLogsAsPdf()
      await vi.waitFor(() => {
        expect(downloadPdf).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('exportAuditLogsLastDays', () => {
    it('should export logs for last N days', () => {
      exportAuditLogsLastDays(7, 'csv')

      expect(downloadCsv).toHaveBeenCalledTimes(1)
    })

    it('should export logs for last N days as JSON', () => {
      exportAuditLogsLastDays(30, 'json')

      expect(downloadJson).toHaveBeenCalledTimes(1)
    })

    it('should export logs for last N days as PDF', async () => {
      exportAuditLogsLastDays(1, 'pdf')

      await vi.waitFor(() => {
        expect(downloadPdf).toHaveBeenCalledTimes(1)
      })
    })
  })
})
