/**
 * Audit Export Functions
 * Export audit logs to CSV, JSON, and PDF formats
 */

import type { AuditEvent, AuditExportOptions, AuditExportFormat } from './types'
import { downloadCsv, sanitizeFilename } from '../export/csv'
import { downloadJson } from '../export/json'
import { downloadPdf } from '../export/pdf'
import { useAuditStore } from './auditStore'

/**
 * Export audit logs with specified options
 */
export function exportAuditLogs(options: AuditExportOptions): void {
  const { format, filter, includeFullState = false, anonymize = false } = options

  // Query events with filter
  const result = useAuditStore.getState().queryEvents(filter, {
    field: 'timestamp',
    direction: 'desc',
  })

  let events = result.events

  // Anonymize if requested
  if (anonymize) {
    events = events.map((e) => anonymizeEvent(e))
  }

  // Filter out full state if not requested
  if (!includeFullState) {
    events = events.map((e) => ({
      ...e,
      previousState: e.previousState ? '[REDACTED]' : undefined,
      newState: e.newState ? '[REDACTED]' : undefined,
    }))
  }

  const timestamp = new Date().toISOString().split('T')[0]
  const filename = sanitizeFilename(`audit-log-${timestamp}`)

  if (format === 'csv') {
    const csv = exportAuditToCsv(events)
    downloadCsv(csv, `${filename}.csv`)
  } else if (format === 'json') {
    const json = exportAuditToJson(events)
    downloadJson(json, `${filename}.json`)
  } else if (format === 'pdf') {
    const pdfDoc = exportAuditToPdf(events, result.totalCount)
    downloadPdf(pdfDoc, `${filename}.pdf`)
  }
}

/**
 * Export audit events to CSV
 */
function exportAuditToCsv(events: AuditEvent[]): string {
  const headers = [
    'ID',
    'Timestamp',
    'Session ID',
    'Action Type',
    'Entity Type',
    'Entity ID',
    'Description',
    'User ID',
    'IP Address',
    'Is Bulk Operation',
    'Bulk Item Count',
  ]

  const rows = events.map((event) => [
    event.id,
    new Date(event.timestamp).toISOString(),
    event.sessionId,
    event.actionType,
    event.entityType,
    event.entityId,
    escapeCsv(event.metadata?.description || ''),
    event.userId || '',
    event.ipAddress || '',
    event.metadata?.isBulkOperation ? 'Yes' : 'No',
    event.metadata?.bulkItemCount?.toString() || '',
  ])

  return [headers, ...rows].map((row) => row.join(',')).join('\n')
}

/**
 * Escape CSV values
 */
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Export audit events to JSON
 */
function exportAuditToJson(events: AuditEvent[]): string {
  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    totalEvents: events.length,
    events,
  }

  return JSON.stringify(exportData, null, 2)
}

/**
 * Export audit events to PDF
 */
function exportAuditToPdf(events: AuditEvent[], totalCount: number) {
  const { jsPDF } = require('jspdf')
  const autoTable = require('jspdf-autotable')

  const doc = new jsPDF()

  // Title
  doc.setFontSize(18)
  doc.text('Audit Log Report', 14, 20)

  // Metadata
  doc.setFontSize(10)
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28)
  doc.text(`Total Events: ${totalCount}`, 14, 34)
  doc.text(`Exported Events: ${events.length}`, 14, 40)

  // Statistics
  const stats = useAuditStore.getState().getStatistics()
  doc.text(`Total Events in Log: ${stats.totalEvents}`, 14, 46)

  // Table data
  const tableData = events.map((event) => [
    event.id.substring(0, 8) + '...',
    new Date(event.timestamp).toLocaleString(),
    event.actionType,
    event.entityType,
    event.entityId.substring(0, 20) + '...',
    (event.metadata?.description || '').substring(0, 50) + '...',
  ])

  // Add table
  autoTable(doc, {
    startY: 55,
    head: [['ID', 'Timestamp', 'Action', 'Entity Type', 'Entity ID', 'Description']],
    body: tableData,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 35 },
      2: { cellWidth: 20 },
      3: { cellWidth: 25 },
      4: { cellWidth: 30 },
      5: { cellWidth: 55 },
    },
    headStyles: {
      fillColor: [66, 139, 202],
      textColor: 255,
      fontStyle: 'bold',
    },
  })

  return doc
}

/**
 * Anonymize an audit event
 */
function anonymizeEvent(event: AuditEvent): AuditEvent {
  return {
    ...event,
    userId: event.userId ? '[REDACTED]' : undefined,
    ipAddress: event.ipAddress ? '[REDACTED]' : undefined,
    sessionId: event.sessionId.substring(0, 8) + '...',
  }
}

/**
 * Get export filename based on format
 */
export function getAuditExportFilename(format: AuditExportFormat): string {
  const timestamp = new Date().toISOString().split('T')[0]
  return `audit-log-${timestamp}.${format}`
}

/**
 * Quick export helpers
 */
export function exportAllAuditLogsAsJson(): void {
  exportAuditLogs({ format: 'json' })
}

export function exportAllAuditLogsAsCsv(): void {
  exportAuditLogs({ format: 'csv' })
}

export function exportAllAuditLogsAsPdf(): void {
  exportAuditLogs({ format: 'pdf' })
}

export function exportAuditLogsLastDays(days: number, format: AuditExportFormat): void {
  const end = new Date()
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)

  exportAuditLogs({
    format,
    filter: { dateRange: { start, end } },
  })
}
