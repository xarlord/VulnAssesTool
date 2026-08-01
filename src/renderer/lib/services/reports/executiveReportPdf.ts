/**
 * Executive Report PDF Builder (FR-09.2)
 *
 * Renders the executive vulnerability report directly with jsPDF + jspdf-autotable
 * (the same pair used by lib/export/pdf.ts and prepareCompliancePdf), producing a
 * real document — embedded logo image, a vector severity bar chart, and a
 * severity-sorted table with the CVSS vector — instead of the old text-flattened
 * output. html2canvas was deliberately not used, to keep a single PDF-rendering
 * technique across the codebase.
 */

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { getSeverityColor, addFooter } from '@/lib/export/pdf'
import { compareBySeverity, type Severity } from '@/lib/severity'
import type { ReportData, ReportOptions, ExecutiveSummaryMetrics } from './types'

const PAGE_MARGIN = 14

/** Derive the jsPDF image format from a data-URL MIME, or null for unsupported types. */
function logoFormat(dataUrl: string): 'PNG' | 'JPEG' | null {
  if (dataUrl.startsWith('data:image/png')) return 'PNG'
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG'
  return null
}

/**
 * Build the executive report as a jsPDF document.
 *
 * @param data - report data (statistics + vulnerabilities)
 * @param options - report options (title, company name/logo)
 * @param metrics - executive summary metrics (risk level, findings, actions)
 */
export function buildExecutiveReportPdf(
  data: ReportData,
  options: ReportOptions,
  metrics: ExecutiveSummaryMetrics,
): jsPDF {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 18

  // --- Header + optional company logo -------------------------------------
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(options.title || 'Executive Report', PAGE_MARGIN, y)

  if (options.companyLogo) {
    const format = logoFormat(options.companyLogo)
    if (format) {
      try {
        doc.addImage(options.companyLogo, format, pageWidth - PAGE_MARGIN - 30, y - 12, 30, 15)
      } catch (error) {
        // A malformed image must not abort the whole report.
        console.warn('[executiveReportPdf] Failed to embed company logo:', error)
      }
    } else {
      // SVG (and other non-raster formats) are not embeddable by jsPDF — skip,
      // documented limitation rather than a crash.
      console.warn('[executiveReportPdf] Unsupported logo format, skipping image embed')
    }
  }

  y += 8
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text(`${options.projectName} • ${new Date().toLocaleDateString()}`, PAGE_MARGIN, y)
  doc.setTextColor(0, 0, 0)
  y += 12

  // --- Executive summary risk badge ---------------------------------------
  if (options.includeExecutiveSummary) {
    const [r, g, b] = getSeverityColor(metrics.riskLevel)
    doc.setFillColor(r, g, b)
    doc.rect(PAGE_MARGIN, y - 5, 70, 10, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Risk: ${metrics.riskLevel} (${metrics.overallRiskScore}/100)`, PAGE_MARGIN + 3, y + 1.5)
    doc.setTextColor(0, 0, 0)
    y += 14

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    for (const finding of metrics.keyFindings.slice(0, 6)) {
      doc.text(`• ${finding}`, PAGE_MARGIN, y)
      y += 6
    }
    y += 4
  }

  // --- Severity bar chart (real vector rects) -----------------------------
  if (options.includeCharts) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Severity Distribution', PAGE_MARGIN, y)
    y += 6

    const buckets: Array<{ severity: Severity; count: number }> = [
      { severity: 'critical', count: data.statistics.criticalCount },
      { severity: 'high', count: data.statistics.highCount },
      { severity: 'medium', count: data.statistics.mediumCount },
      { severity: 'low', count: data.statistics.lowCount },
    ]
    const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count))
    const maxBarWidth = 120

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    for (const bucket of buckets) {
      const [r, g, b] = getSeverityColor(bucket.severity)
      const barWidth = (bucket.count / maxCount) * maxBarWidth
      doc.setFillColor(r, g, b)
      doc.rect(PAGE_MARGIN + 24, y - 3.5, Math.max(0.5, barWidth), 5, 'F')
      doc.setTextColor(0, 0, 0)
      doc.text(bucket.severity, PAGE_MARGIN, y)
      doc.text(String(bucket.count), PAGE_MARGIN + 24 + Math.max(0.5, barWidth) + 3, y)
      y += 8
    }
    y += 6
  }

  // --- Vulnerability table (sorted, with CVSS vector) ---------------------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Vulnerability Details', PAGE_MARGIN, y)
  y += 4

  const sorted = [...data.vulnerabilities].sort(
    (a, b) => compareBySeverity(a.severity, b.severity) || (b.cvssScore ?? 0) - (a.cvssScore ?? 0),
  )

  const body = sorted.map((vuln) => [
    vuln.id,
    vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1),
    vuln.cvssScore?.toFixed(1) ?? 'N/A',
    vuln.cvssVector ?? 'N/A',
    String(vuln.affectedComponents.length),
    (vuln.description ?? '').substring(0, 80) + ((vuln.description ?? '').length > 80 ? '...' : ''),
  ])

  autoTable(doc, {
    startY: y,
    head: [['CVE ID', 'Severity', 'CVSS', 'CVSS Vector', 'Components', 'Description']],
    body,
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 18 },
      2: { cellWidth: 14, halign: 'right' },
      3: { cellWidth: 46 },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 'auto' },
    },
    didParseCell: (cell) => {
      // Color-code the severity column, matching lib/export/pdf.ts's convention.
      if (cell.column.index === 1 && cell.section === 'body') {
        cell.cell.styles.textColor = getSeverityColor(String(cell.cell.raw))
        cell.cell.styles.fontStyle = 'bold'
      }
    },
    pageBreak: 'auto',
  })

  // --- Recommendations ----------------------------------------------------
  if (options.includeRecommendations && metrics.recommendedActions.length > 0) {
    let recY = (doc.lastAutoTable?.finalY ?? y) + 12
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Recommended Actions', PAGE_MARGIN, recY)
    recY += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    metrics.recommendedActions.slice(0, 10).forEach((action, index) => {
      doc.text(`${index + 1}. ${action}`, PAGE_MARGIN, recY)
      recY += 6
    })
  }

  // --- Footer with page numbers -------------------------------------------
  const totalPages = doc.internal.pages.length - 1
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page)
    addFooter(doc, page, totalPages)
  }

  return doc
}
