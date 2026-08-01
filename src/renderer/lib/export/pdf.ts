/**
 * PDF Export Utilities
 * Handles exporting project data to PDF format using jsPDF and autoTable
 */

import type { AuditEvent, Project } from '@@/types'
import type { ComplianceFramework, ExportMetadata } from './types'
import { COMPLIANCE_FRAMEWORK_META } from './types'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Helper to safely format date to locale string
 * Handles both Date objects and string dates (from JSON serialization)
 */
function formatLocaleDate(date: Date | string | undefined): string {
  if (!date) return 'N/A'
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (isNaN(dateObj.getTime())) return 'N/A'
  return dateObj.toLocaleDateString()
}

/**
 * Like formatLocaleDate but keeps the time — audit-trail rows need it to stay ordered/legible
 * when several events land on the same day.
 */
function formatLocaleDateTime(date: Date | string | undefined): string {
  if (!date) return 'N/A'
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (isNaN(dateObj.getTime())) return 'N/A'
  return dateObj.toLocaleString()
}

/**
 * Export metadata for PDF exports
 */
function createMetadata(
  dataType: 'project' | 'vulnerabilities' | 'components' | 'all-projects',
  projectName?: string,
): ExportMetadata {
  return {
    exportDate: new Date(),
    projectName,
    format: 'pdf',
    dataType,
    recordCount: 0,
  }
}

/**
 * Add PDF header with title and metadata
 */
function addHeader(doc: jsPDF, title: string, subtitle?: string): void {
  // Title
  doc.setFontSize(20)
  doc.setTextColor(59, 130, 246) // Blue-500
  doc.text(title, 14, 20)

  // Subtitle if provided
  if (subtitle) {
    doc.setFontSize(11)
    doc.setTextColor(107, 114, 128) // Gray-500
    doc.text(subtitle, 14, 28)
  }

  // Separator line
  doc.setDrawColor(229, 231, 235) // Gray-200
  doc.setLineWidth(0.5)
  doc.line(14, 35, 196, 35)

  // Reset color
  doc.setTextColor(0, 0, 0)
}

/**
 * Add PDF footer with page numbers
 */
export function addFooter(doc: jsPDF, pageNumber: number, totalPages: number): void {
  const pageSize = doc.internal.pageSize
  const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight()

  doc.setFontSize(9)
  doc.setTextColor(156, 163, 175) // Gray-400
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageSize.width ? pageSize.width - 14 : 196 - 14, pageHeight - 10, {
    align: 'right',
  })

  // Reset color
  doc.setTextColor(0, 0, 0)
}

/**
 * Get severity color for PDF
 */
export function getSeverityColor(severity: string): [number, number, number] {
  switch (severity.toLowerCase()) {
    case 'critical':
      return [220, 38, 38] // Red-600
    case 'high':
      return [234, 88, 12] // Orange-600
    case 'medium':
      return [202, 138, 4] // Yellow-600
    case 'low':
      return [34, 197, 94] // Green-500
    default:
      return [107, 114, 128] // Gray-500
  }
}

/**
 * Generate vulnerabilities PDF
 */
export function prepareVulnerabilitiesPdf(project: Project): jsPDF {
  const doc = new jsPDF()
  const metadata = createMetadata('vulnerabilities', project.name)
  metadata.recordCount = project.vulnerabilities.length

  let yPosition = 45

  // Header
  addHeader(doc, 'Vulnerability Report', `${project.name} • ${metadata.exportDate.toLocaleDateString()}`)

  // Statistics cards
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Summary Statistics', 14, yPosition)
  yPosition += 8

  // Statistics table
  const statsData = [
    ['Total Vulnerabilities', project.statistics.totalVulnerabilities.toString()],
    ['Critical', project.statistics.criticalCount.toString()],
    ['High', project.statistics.highCount.toString()],
    ['Medium', project.statistics.mediumCount.toString()],
    ['Low', project.statistics.lowCount.toString()],
  ]

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Count']],
    body: statsData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246], // Blue-500
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 30, halign: 'right' },
    },
  })

  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 15

  // Vulnerabilities section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Vulnerability Details', 14, yPosition)
  yPosition += 5

  // Prepare vulnerability data
  const vulnData = project.vulnerabilities.map((vuln) => [
    vuln.id,
    vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1),
    vuln.cvssScore?.toFixed(1) || 'N/A',
    vuln.affectedComponents.length.toString(),
    vuln.description.substring(0, 80) + (vuln.description.length > 80 ? '...' : ''),
  ])

  autoTable(doc, {
    startY: yPosition,
    head: [['ID', 'Severity', 'CVSS', 'Components', 'Description']],
    body: vulnData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 20 },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 'auto' },
    },
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    didParseCell: (data) => {
      // Color code severity column
      if (data.column.index === 1 && data.section === 'body') {
        const severity = data.cell.raw as string
        const color = getSeverityColor(severity)
        data.cell.styles.textColor = color
        data.cell.styles.fontStyle = 'bold'
      }
    },
    pageBreak: 'auto',
  })

  // Add footer with page numbers
  const totalPages = doc.internal.pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addFooter(doc, i, totalPages)
  }

  return doc
}

/**
 * Generate components PDF
 */
export function prepareComponentsPdf(project: Project): jsPDF {
  const doc = new jsPDF()
  const metadata = createMetadata('components', project.name)
  metadata.recordCount = project.components.length

  let yPosition = 45

  // Header
  addHeader(doc, 'Component Inventory', `${project.name} • ${metadata.exportDate.toLocaleDateString()}`)

  // Statistics
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Summary Statistics', 14, yPosition)
  yPosition += 8

  const statsData = [
    ['Total Components', project.statistics.totalComponents.toString()],
    ['Vulnerable Components', project.statistics.vulnerableComponents.toString()],
    ['With Fixes Available', project.components.filter((c) => c.patchInfo?.hasFixAvailable).length.toString()],
  ]

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Count']],
    body: statsData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 30, halign: 'right' },
    },
  })

  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 15

  // Components section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Component Details', 14, yPosition)
  yPosition += 5

  const compData = project.components.map((comp) => [
    comp.name,
    comp.version,
    comp.type,
    comp.licenses.join(', '),
    comp.vulnerabilities.length.toString(),
    comp.patchInfo?.hasFixAvailable ? 'Yes' : 'No',
  ])

  autoTable(doc, {
    startY: yPosition,
    head: [['Name', 'Version', 'Type', 'Licenses', 'Vulns', 'Fix Available']],
    body: compData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 25 },
      2: { cellWidth: 25 },
      3: { cellWidth: 35 },
      4: { cellWidth: 15, halign: 'right' },
      5: { cellWidth: 25, halign: 'center' },
    },
    styles: {
      fontSize: 8,
      cellPadding: 3,
    },
    didParseCell: (data) => {
      // Highlight vulnerable components
      if (data.column.index === 4 && data.section === 'body') {
        const vulnCount = parseInt(data.cell.raw as string)
        if (vulnCount > 0) {
          data.cell.styles.textColor = [220, 38, 38] // Red-600
          data.cell.styles.fontStyle = 'bold'
        }
      }
    },
    pageBreak: 'auto',
  })

  // Add footer with page numbers
  const totalPages = doc.internal.pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addFooter(doc, i, totalPages)
  }

  return doc
}

/**
 * Generate full project PDF
 */
export function prepareProjectPdf(project: Project): jsPDF {
  const doc = new jsPDF()
  const metadata = createMetadata('project', project.name)
  metadata.recordCount = project.vulnerabilities.length

  let yPosition = 45

  // Header
  addHeader(doc, 'Vulnerability Assessment Report', `${project.name} • ${metadata.exportDate.toLocaleDateString()}`)

  // Project information
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Project Information', 14, yPosition)
  yPosition += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')

  const projectInfo = [
    ['Project Name', project.name],
    ['Description', project.description || 'N/A'],
    ['Created', formatLocaleDate(project.createdAt)],
    ['Last Updated', formatLocaleDate(project.updatedAt)],
    ['Last Scan', formatLocaleDate(project.lastScanAt) || 'Not scanned'],
  ]

  autoTable(doc, {
    startY: yPosition,
    body: projectInfo,
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 40 },
      1: { cellWidth: 'auto' },
    },
    styles: {
      fontSize: 10,
      cellPadding: 2,
    },
  })

  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 12

  // Statistics section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Vulnerability Statistics', 14, yPosition)
  yPosition += 8

  const statsData = [
    ['Total Vulnerabilities', project.statistics.totalVulnerabilities.toString()],
    ['Critical', project.statistics.criticalCount.toString()],
    ['High', project.statistics.highCount.toString()],
    ['Medium', project.statistics.mediumCount.toString()],
    ['Low', project.statistics.lowCount.toString()],
    ['Total Components', project.statistics.totalComponents.toString()],
    ['Vulnerable Components', project.statistics.vulnerableComponents.toString()],
  ]

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Count']],
    body: statsData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 30, halign: 'right' },
    },
  })

  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 12

  // All vulnerabilities section
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('All Vulnerabilities', 14, yPosition)
  yPosition += 5

  // Sort vulnerabilities by severity (critical first) then by CVSS score
  const sortedVulns = [...project.vulnerabilities].sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, none: 0 }
    const severityDiff = severityOrder[b.severity] - severityOrder[a.severity]
    if (severityDiff !== 0) return severityDiff
    return (b.cvssScore || 0) - (a.cvssScore || 0)
  })

  const vulnData = sortedVulns.map((vuln) => [
    vuln.id,
    vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1),
    vuln.cvssScore?.toFixed(1) || 'N/A',
    vuln.affectedComponents.length.toString(),
    vuln.description.substring(0, 60) + (vuln.description.length > 60 ? '...' : ''),
  ])

  autoTable(doc, {
    startY: yPosition,
    head: [['ID', 'Severity', 'CVSS', 'Components', 'Description']],
    body: vulnData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 25 },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 'auto' },
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    didParseCell: (data) => {
      if (data.column.index === 1 && data.section === 'body') {
        const severity = data.cell.raw as string
        const color = getSeverityColor(severity)
        data.cell.styles.textColor = color
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 12

  // Components summary section
  doc.addPage()
  addHeader(doc, 'Component Inventory', `${project.name} • Continued`)

  yPosition = 45

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('All Components', 14, yPosition)
  yPosition += 5

  const compData = project.components.map((comp) => [
    comp.name,
    comp.version,
    comp.type,
    comp.vulnerabilities.length.toString(),
    comp.patchInfo?.hasFixAvailable ? 'Yes' : 'No',
  ])

  autoTable(doc, {
    startY: yPosition,
    head: [['Name', 'Version', 'Type', 'Vulnerabilities', 'Fix Available']],
    body: compData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 30 },
      2: { cellWidth: 25 },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'center' },
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
  })

  // Add footer with page numbers
  const totalPages = doc.internal.pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addFooter(doc, i, totalPages)
  }

  return doc
}

/**
 * Generate all projects summary PDF
 */
export function prepareAllProjectsPdf(projects: Project[]): jsPDF {
  const doc = new jsPDF()
  const metadata = createMetadata('all-projects')
  metadata.recordCount = projects.length

  let yPosition = 45

  // Header
  addHeader(doc, 'All Projects Summary', `Generated on ${metadata.exportDate.toLocaleDateString()}`)

  // Overall statistics
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Overall Statistics', 14, yPosition)
  yPosition += 8

  const summaryData = [
    ['Total Projects', projects.length.toString()],
    ['Total Vulnerabilities', projects.reduce((sum, p) => sum + p.statistics.totalVulnerabilities, 0).toString()],
    ['Total Critical', projects.reduce((sum, p) => sum + p.statistics.criticalCount, 0).toString()],
    ['Total High', projects.reduce((sum, p) => sum + p.statistics.highCount, 0).toString()],
    ['Total Medium', projects.reduce((sum, p) => sum + p.statistics.mediumCount, 0).toString()],
    ['Total Low', projects.reduce((sum, p) => sum + p.statistics.lowCount, 0).toString()],
    ['Total Components', projects.reduce((sum, p) => sum + p.statistics.totalComponents, 0).toString()],
  ]

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Count']],
    body: summaryData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 30, halign: 'right' },
    },
  })

  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 12

  // Projects list
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Projects Overview', 14, yPosition)
  yPosition += 5

  const projectData = projects.map((project) => [
    project.name,
    project.statistics.totalVulnerabilities.toString(),
    project.statistics.criticalCount.toString(),
    project.statistics.highCount.toString(),
    project.updatedAt.toLocaleDateString(),
  ])

  autoTable(doc, {
    startY: yPosition,
    head: [['Project', 'Total Vulns', 'Critical', 'High', 'Last Updated']],
    body: projectData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 25, halign: 'right' },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 15, halign: 'right' },
      4: { cellWidth: 35 },
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    pageBreak: 'auto',
  })

  // Add footer with page numbers
  const totalPages = doc.internal.pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addFooter(doc, i, totalPages)
  }

  return doc
}

/** Cap on audit-trail rows rendered into a compliance PDF, so a long-lived project with a large
 * audit history can't produce an oversized document or a long synchronous autoTable render. */
const AUDIT_TRAIL_MAX_ROWS = 250

/**
 * Generate a framework-specific compliance report (FR-09.3), implemented sections-only.
 *
 * The report contains a framework header, report metadata, an executive summary, a due-diligence
 * statement, the project's audit trail, and an unremediated-critical-findings table. It deliberately
 * does NOT map findings to (or claim satisfaction of) individual SOC 2 / ISO 27001 / HIPAA controls —
 * inventing control-satisfaction claims would be misleading. The due-diligence statement says so
 * explicitly.
 *
 * "Unremediated critical findings" are simply the critical-severity vulnerabilities still present in
 * the project: the domain model stores no remediation/triage status, so a finding's continued
 * presence in the latest scan is what "unremediated" means here (a fixed component drops off the next
 * scan). The report text states this assumption.
 *
 * @param project - The assessed project
 * @param framework - Which compliance framework to template the report for
 * @param auditEvents - The project's audit-trail events (already queried/sorted by the caller)
 */
export function prepareCompliancePdf(
  project: Project,
  framework: ComplianceFramework,
  auditEvents: AuditEvent[],
): jsPDF {
  const doc = new jsPDF()
  const meta = COMPLIANCE_FRAMEWORK_META[framework]
  const generatedAt = new Date()

  const headStyles = {
    fillColor: [59, 130, 246] as [number, number, number],
    textColor: 255,
    fontStyle: 'bold' as const,
  }

  addHeader(doc, `${meta.label} Compliance Report`, `${project.name} • ${generatedAt.toLocaleDateString()}`)

  let yPosition = 45

  // Report information
  autoTable(doc, {
    startY: yPosition,
    body: [
      ['Framework', meta.label],
      ['Standard', meta.standard],
      ['Project', project.name],
      ['Generated', formatLocaleDateTime(generatedAt)],
      ['Tool', 'VulnAssessTool'],
    ],
    theme: 'plain',
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 }, 1: { cellWidth: 'auto' } },
    styles: { fontSize: 10, cellPadding: 2 },
  })
  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 12

  // Executive summary (plain-language counts for non-technical stakeholders)
  const criticalFindings = project.vulnerabilities.filter((vuln) => vuln.severity === 'critical')
  const kevCount = project.vulnerabilities.filter((vuln) => vuln.isKev).length

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Executive Summary', 14, yPosition)
  yPosition += 6

  autoTable(doc, {
    startY: yPosition,
    head: [['Metric', 'Value']],
    body: [
      ['Total components', project.statistics.totalComponents.toString()],
      ['Total vulnerabilities', project.statistics.totalVulnerabilities.toString()],
      ['Critical', project.statistics.criticalCount.toString()],
      ['High', project.statistics.highCount.toString()],
      ['Unremediated critical findings', criticalFindings.length.toString()],
      ['Known exploited (CISA KEV)', kevCount.toString()],
    ],
    theme: 'grid',
    headStyles,
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 30, halign: 'right' } },
  })
  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 12

  // Due-diligence statement — documents the activities performed, explicitly disclaims any
  // control-satisfaction claim.
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Due Diligence Statement', 14, yPosition)
  yPosition += 6

  const dueDiligence =
    `This report documents the software-composition and known-vulnerability assessment activities ` +
    `performed for "${project.name}" as of ${generatedAt.toLocaleDateString()}. Components were ` +
    `inventoried from the project's SBOM and evaluated against the NVD, OSV, CISA KEV, and EPSS data ` +
    `sources. It is provided as evidence of ongoing due diligence in identifying, tracking, and ` +
    `prioritizing known vulnerabilities. This report documents assessment activities only; it does ` +
    `not assert that any specific ${meta.label} control has been satisfied — control attestation ` +
    `remains the responsibility of the organization and its auditors.`

  autoTable(doc, {
    startY: yPosition,
    body: [[dueDiligence]],
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
  })
  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 12

  // Audit trail — required audit-trail information for the assessed project.
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Audit Trail', 14, yPosition)
  yPosition += 5

  // Most-recent-first, then capped: the caller may hand us the project's entire audit history.
  const sortedEvents = [...auditEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )
  const shownEvents = sortedEvents.slice(0, AUDIT_TRAIL_MAX_ROWS)
  const auditBody =
    shownEvents.length > 0
      ? shownEvents.map((event) => [
          formatLocaleDateTime(event.timestamp),
          event.actionType,
          event.entityType,
          event.metadata?.description ?? event.entityId,
        ])
      : [['—', 'No audit events recorded for this project.', '', '']]
  if (sortedEvents.length > AUDIT_TRAIL_MAX_ROWS) {
    auditBody.push(['—', `Showing the ${AUDIT_TRAIL_MAX_ROWS} most recent of ${sortedEvents.length} events.`, '', ''])
  }

  autoTable(doc, {
    startY: yPosition,
    head: [['Timestamp', 'Action', 'Entity', 'Details']],
    body: auditBody,
    theme: 'striped',
    headStyles,
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 32 }, 2: { cellWidth: 28 }, 3: { cellWidth: 'auto' } },
    pageBreak: 'auto',
  })
  yPosition = (doc.lastAutoTable?.finalY ?? yPosition) + 12

  // Unremediated critical findings
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Unremediated Critical Findings', 14, yPosition)
  yPosition += 5

  const criticalBody =
    criticalFindings.length > 0
      ? criticalFindings.map((vuln) => [
          vuln.id,
          vuln.cvssScore?.toFixed(1) ?? 'N/A',
          vuln.affectedComponents.length.toString(),
          vuln.patchInfo?.patchAvailability ?? 'unknown',
          vuln.isKev ? 'Yes' : 'No',
        ])
      : [['—', 'No unremediated critical findings.', '', '', '']]

  autoTable(doc, {
    startY: yPosition,
    head: [['CVE', 'CVSS', 'Components', 'Patch', 'KEV']],
    body: criticalBody,
    theme: 'striped',
    headStyles,
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 20, halign: 'right' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 30 },
      4: { cellWidth: 18, halign: 'center' },
    },
    pageBreak: 'auto',
  })

  // Add footer with page numbers
  const totalPages = doc.internal.pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addFooter(doc, i, totalPages)
  }

  return doc
}

/**
 * Download PDF as file
 */
export function downloadPdf(doc: jsPDF, filename: string): void {
  doc.save(filename)
}
