/**
 * Report Builder for Executive Dashboard
 * Generates PDF reports for executive summaries
 */

import type { ExecutiveSummary, Insight, RiskItem, Recommendation } from './insightsGenerator'
import type { ExecutiveMetrics } from './metricsCalculator'
import type { Project } from '@@/types'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/**
 * Build executive summary PDF report
 */
export function buildExecutiveReport(
  summary: ExecutiveSummary,
  metrics: ExecutiveMetrics,
  _projects: Project[],
): jsPDF {
  const doc = new jsPDF()

  // Title page
  addTitlePage(doc, summary)
  doc.addPage()

  // Executive Summary
  yPosition = addExecutiveSummary(doc, summary, yPosition)
  doc.addPage()

  // Overall Metrics
  yPosition = addOverallMetrics(doc, metrics.overall, yPosition)
  doc.addPage()

  // Risk Analysis
  yPosition = addRiskAnalysis(doc, summary.topRisks, yPosition)
  doc.addPage()

  // Compliance Status
  yPosition = addComplianceStatus(doc, metrics.compliance, yPosition)
  doc.addPage()

  // Trends
  yPosition = addTrendsSection(doc, metrics.trends, yPosition)
  doc.addPage()

  // Action Items
  yPosition = addActionItems(doc, summary.topRecommendations, yPosition)
  doc.addPage()

  // Detailed Insights
  addDetailedInsights(doc, summary.insights)

  // Add footer with page numbers
  const totalPages = doc.internal.pages.length - 1
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    addFooter(doc, i, totalPages)
  }

  return doc
}

/**
 * Add title page
 */
function addTitlePage(doc: jsPDF, summary: ExecutiveSummary): void {
  // Logo/Title
  doc.setFontSize(28)
  doc.setTextColor(59, 130, 246) // Blue
  doc.text('Executive Security Report', 105, 80, { align: 'center' })

  // Subtitle
  doc.setFontSize(16)
  doc.setTextColor(71, 85, 105) // Gray
  doc.text(`Vulnerability Assessment Summary`, 105, 95, { align: 'center' })

  // Period
  doc.setFontSize(14)
  doc.setTextColor(107, 114, 128) // Light gray
  doc.text(summary.reportPeriod, 105, 110, { align: 'center' })

  // Status badge
  const statusColor = getStatusColor(summary.overallStatus)
  doc.setFillColor(statusColor.r, statusColor.g, statusColor.b)
  doc.roundedRect(55, 130, 100, 25, 3, 3, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(`Status: ${summary.overallStatus.toUpperCase()}`, 105, 147, { align: 'center' })

  // Date generated
  doc.setFontSize(10)
  doc.setTextColor(156, 163, 175)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generated on ${new Date().toLocaleString()}`, 105, 180, { align: 'center' })

  // Page number
  doc.setTextColor(200, 200, 200)
  doc.text('Page 1', 105, 280, { align: 'center' })
}

/**
 * Add executive summary section
 */
function addExecutiveSummary(doc: jsPDF, summary: ExecutiveSummary, startY: number): number {
  let y = startY

  // Header
  doc.setFontSize(18)
  doc.setTextColor(31, 41, 55)
  doc.setFont('helvetica', 'bold')
  doc.text('Executive Summary', 14, y)
  y += 15

  // Headline
  doc.setFontSize(12)
  doc.setTextColor(59, 130, 246)
  doc.text(summary.headline, 14, y)
  y += 12

  // Key points
  doc.setFontSize(11)
  doc.setTextColor(55, 65, 81)
  doc.setFont('helvetica', 'normal')

  for (const point of summary.keyPoints) {
    // Bullet point
    doc.setFillColor(59, 130, 246)
    doc.circle(18, y - 2, 1.5, 'F')
    doc.text(point, 25, y, { maxWidth: 170 })
    y += 8
  }

  y += 10

  // Quick stats table
  const statsData = [
    ['Report Period', summary.reportPeriod],
    ['Overall Status', summary.overallStatus.toUpperCase()],
    ['Key Insights Count', summary.insights.length.toString()],
    ['Top Risks Identified', summary.topRisks.length.toString()],
    ['Recommendations', summary.topRecommendations.length.toString()],
  ]

  autoTable(doc, {
    startY: y,
    body: statsData,
    theme: 'plain',
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { cellWidth: 'auto' },
    },
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
  })

  y = doc.lastAutoTable?.finalY + 15

  return y
}

/**
 * Add overall metrics section
 */
function addOverallMetrics(doc: jsPDF, metrics: ExecutiveMetrics['overall'], startY: number): number {
  let y = startY

  // Header
  doc.setFontSize(18)
  doc.setTextColor(31, 41, 55)
  doc.setFont('helvetica', 'bold')
  doc.text('Overall Security Metrics', 14, y)
  y += 15

  // Metrics in table format
  const metricsData = [
    ['Total Projects', metrics.totalProjects.toString()],
    ['Total Components', metrics.totalComponents.toString()],
    ['Total Vulnerabilities', metrics.totalVulnerabilities.toString()],
    ['Critical', metrics.criticalCount.toString()],
    ['High', metrics.highCount.toString()],
    ['Medium', metrics.mediumCount.toString()],
    ['Low', metrics.lowCount.toString()],
    ['Average Health Score', `${metrics.averageHealthScore}/100`],
    ['Risk Level', metrics.riskLevel.toUpperCase()],
    ['Vulnerable Components', `${metrics.vulnerableComponentPercentage}%`],
  ]

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Value']],
    body: metricsData,
    theme: 'grid',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { cellWidth: 40, halign: 'right' },
    },
    styles: {
      fontSize: 10,
      cellPadding: 4,
    },
    didParseCell: (data) => {
      // Color code severity values
      if (data.column.index === 1 && data.section === 'body') {
        const value = data.cell.raw as string
        if (value.includes('Critical')) {
          data.cell.styles.textColor = [220, 38, 38]
          data.cell.styles.fontStyle = 'bold'
        } else if (value.includes('High')) {
          data.cell.styles.textColor = [234, 88, 12]
        } else if (value.includes('/100')) {
          const score = parseInt(value)
          if (score >= 90) {
            data.cell.styles.textColor = [34, 197, 94]
          } else if (score < 60) {
            data.cell.styles.textColor = [220, 38, 38]
          }
        }
      }
    },
  })

  return doc.lastAutoTable?.finalY + 15
}

/**
 * Add risk analysis section
 */
function addRiskAnalysis(doc: jsPDF, risks: RiskItem[], startY: number): number {
  let y = startY

  // Header
  doc.setFontSize(18)
  doc.setTextColor(31, 41, 55)
  doc.setFont('helvetica', 'bold')
  doc.text('Top Risk Items', 14, y)
  y += 15

  // Risks table
  const risksData = risks.map((risk) => [risk.projectName, risk.risk, risk.severity.toUpperCase(), risk.description])

  autoTable(doc, {
    startY: y,
    head: [['Project', 'Risk Score', 'Severity', 'Description']],
    body: risksData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { cellWidth: 25, halign: 'right' },
      2: { cellWidth: 25 },
      3: { cellWidth: 'auto' },
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    didParseCell: (data) => {
      // Color code severity
      if (data.column.index === 2 && data.section === 'body') {
        const severity = data.cell.raw as string
        const color = getSeverityColor(severity.toLowerCase())
        data.cell.styles.textColor = color
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  return doc.lastAutoTable?.finalY + 15
}

/**
 * Add compliance status section
 */
function addComplianceStatus(doc: jsPDF, compliance: ExecutiveMetrics['compliance'], startY: number): number {
  let y = startY

  // Header
  doc.setFontSize(18)
  doc.setTextColor(31, 41, 55)
  doc.setFont('helvetica', 'bold')
  doc.text('Compliance Status', 14, y)
  y += 15

  // Compliance metrics
  const complianceData = [
    [
      'SLA Compliance (Overall)',
      `${compliance.slaCompliance.slaOverall}%`,
      getComplianceBar(compliance.slaCompliance.slaOverall),
    ],
    [
      'SLA Compliance (Critical)',
      `${compliance.slaCompliance.slaCritical}%`,
      getComplianceBar(compliance.slaCompliance.slaCritical),
    ],
    [
      'SLA Compliance (High)',
      `${compliance.slaCompliance.slaHigh}%`,
      getComplianceBar(compliance.slaCompliance.slaHigh),
    ],
    ['Scan Coverage (30d)', `${compliance.scanCoverage}%`, getComplianceBar(compliance.scanCoverage)],
    ['Data Freshness (7d)', `${compliance.dataFreshness}%`, getComplianceBar(compliance.dataFreshness)],
    ['Remediation Rate', `${compliance.remediationRate}%`, getComplianceBar(compliance.remediationRate)],
  ]

  autoTable(doc, {
    startY: y,
    head: [['Metric', 'Score', 'Status']],
    body: complianceData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 25, halign: 'right' },
      2: { cellWidth: 'auto' },
    },
    styles: {
      fontSize: 10,
      cellPadding: 4,
    },
  })

  return doc.lastAutoTable?.finalY + 15
}

/**
 * Add trends section
 */
function addTrendsSection(doc: jsPDF, trends: ExecutiveMetrics['trends'], startY: number): number {
  let y = startY

  // Header
  doc.setFontSize(18)
  doc.setTextColor(31, 41, 55)
  doc.setFont('helvetica', 'bold')
  doc.text('Trend Analysis', 14, y)
  y += 15

  // Trend indicators
  const trendData = [
    ['Vulnerability Trend', trends.vulnerabilityTrend.toUpperCase(), getTrendIndicator(trends.vulnerabilityTrend)],
    ['Health Trend', trends.healthTrend.toUpperCase(), getTrendIndicator(trends.healthTrend)],
    ['Scan Frequency', `${trends.scanFrequency} scans/week`, ''],
  ]

  autoTable(doc, {
    startY: y,
    head: [['Trend', 'Status', 'Indicator']],
    body: trendData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 50 },
      2: { cellWidth: 'auto' },
    },
    styles: {
      fontSize: 10,
      cellPadding: 4,
    },
  })

  y = doc.lastAutoTable?.finalY + 12

  // Weekly trend data
  if (trends.periods.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Weekly Breakdown', 14, y)
    y += 8

    const periodData = trends.periods
      .slice(-8)
      .map((p) => [
        p.period,
        p.vulnerabilityCount.toString(),
        p.criticalCount.toString(),
        `${p.healthScore}/100`,
        p.scansCompleted.toString(),
      ])

    autoTable(doc, {
      startY: y,
      head: [['Period', 'Vulns', 'Critical', 'Health', 'Scans']],
      body: periodData,
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 25, halign: 'right' },
        2: { cellWidth: 25, halign: 'right' },
        3: { cellWidth: 25 },
        4: { cellWidth: 20, halign: 'right' },
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
      },
    })

    return doc.lastAutoTable?.finalY + 15
  }

  return y
}

/**
 * Add action items section
 */
function addActionItems(doc: jsPDF, recommendations: Recommendation[], startY: number): number {
  let y = startY

  // Header
  doc.setFontSize(18)
  doc.setTextColor(31, 41, 55)
  doc.setFont('helvetica', 'bold')
  doc.text('Recommendations & Action Items', 14, y)
  y += 15

  // Recommendations table
  const recData = recommendations.map((rec) => [rec.priority.toUpperCase(), rec.title, rec.effort.toUpperCase()])

  autoTable(doc, {
    startY: y,
    head: [['Priority', 'Recommendation', 'Effort']],
    body: recData,
    theme: 'striped',
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 120 },
      2: { cellWidth: 25 },
    },
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    didParseCell: (data) => {
      // Color code priority
      if (data.column.index === 0 && data.section === 'body') {
        const priority = data.cell.raw as string
        const color = getPriorityColor(priority.toLowerCase())
        data.cell.styles.textColor = color
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })

  y = doc.lastAutoTable?.finalY + 12

  // Detailed recommendations
  for (const rec of recommendations) {
    if (y > 250) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(31, 41, 55)
    doc.text(`${rec.priority.toUpperCase()}: ${rec.title}`, 14, y)
    y += 7

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(71, 85, 105)
    doc.text(rec.description, 14, y, { maxWidth: 180 })
    y += 5

    doc.setTextColor(107, 114, 128)
    doc.text(`Expected Outcome: ${rec.expectedOutcome}`, 14, y)
    y += 10
  }

  return y
}

/**
 * Add detailed insights section
 */
function addDetailedInsights(doc: jsPDF, insights: Insight[]): void {
  // Header
  doc.setFontSize(18)
  doc.setTextColor(31, 41, 55)
  doc.setFont('helvetica', 'bold')
  doc.text('Detailed Insights', 14, 20)

  let y = 35

  for (const insight of insights) {
    if (y > 260) {
      doc.addPage()
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Detailed Insights (continued)', 14, 20)
      y = 35
    }

    // Insight type badge
    const typeColor = getInsightTypeColor(insight.type)
    doc.setFillColor(typeColor.r, typeColor.g, typeColor.b)
    doc.roundedRect(14, y - 4, 60, 8, 1, 1, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.text(`${insight.type.toUpperCase()} - ${insight.category.toUpperCase()}`, 17, y + 1)
    y += 10

    // Title
    doc.setTextColor(31, 41, 55)
    doc.setFontSize(11)
    doc.text(insight.title, 14, y)
    y += 6

    // Description
    doc.setTextColor(71, 85, 105)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const descriptionLines = doc.splitTextToSize(insight.description, 180)
    doc.text(descriptionLines, 14, y)
    y += descriptionLines.length * 4 + 4

    // Recommendation if present
    if (insight.recommendation) {
      doc.setTextColor(55, 65, 81)
      doc.setFont('helvetica', 'italic')
      doc.text(`Recommendation: ${insight.recommendation}`, 14, y, { maxWidth: 180 })
      y += 8
    }

    // Action items if present
    if (insight.actionItems && insight.actionItems.length > 0) {
      doc.setFont('helvetica', 'bold')
      doc.text('Action Items:', 14, y)
      y += 4

      doc.setFont('helvetica', 'normal')
      for (const item of insight.actionItems) {
        doc.text(`  • ${item}`, 14, y)
        y += 4
      }
      y += 2
    }

    // Separator
    doc.setDrawColor(229, 231, 235)
    doc.setLineWidth(0.5)
    doc.line(14, y, 196, y)
    y += 8
  }
}

/**
 * Add footer with page numbers
 */
function addFooter(doc: jsPDF, pageNumber: number, totalPages: number): void {
  const pageSize = doc.internal.pageSize
  const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight()

  doc.setFontSize(9)
  doc.setTextColor(156, 163, 175)
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageSize.width ? pageSize.width - 14 : 196 - 14, pageHeight - 10, {
    align: 'right',
  })
}

/**
 * Helper functions
 */

function getStatusColor(status: string): { r: number; g: number; b: number } {
  switch (status) {
    case 'critical':
      return { r: 220, g: 38, b: 38 }
    case 'warning':
      return { r: 234, g: 88, b: 12 }
    case 'good':
      return { r: 34, g: 197, b: 94 }
    case 'excellent':
      return { r: 16, g: 185, b: 129 }
    default:
      return { r: 107, g: 114, b: 128 }
  }
}

function getSeverityColor(severity: string): number[] {
  switch (severity.toLowerCase()) {
    case 'critical':
      return [220, 38, 38]
    case 'high':
      return [234, 88, 12]
    case 'medium':
      return [202, 138, 4]
    case 'low':
      return [34, 197, 94]
    default:
      return [107, 114, 128]
  }
}

function getPriorityColor(priority: string): number[] {
  switch (priority) {
    case 'immediate':
      return [220, 38, 38]
    case 'high':
      return [234, 88, 12]
    case 'medium':
      return [202, 138, 4]
    case 'low':
      return [107, 114, 128]
    default:
      return [107, 114, 128]
  }
}

function getInsightTypeColor(type: string): { r: number; g: number; b: number } {
  switch (type) {
    case 'critical':
      return { r: 220, g: 38, b: 38 }
    case 'warning':
      return { r: 234, g: 88, b: 12 }
    case 'info':
      return { r: 59, g: 130, b: 246 }
    case 'success':
      return { r: 34, g: 197, b: 94 }
    default:
      return { r: 107, g: 114, b: 128 }
  }
}

function getComplianceBar(score: number): string {
  const bars = Math.floor(score / 10)
  const filled = '█'.repeat(bars)
  const empty = '░'.repeat(10 - bars)
  return `${filled}${empty}`
}

function getTrendIndicator(trend: string): string {
  switch (trend) {
    case 'increasing':
    case 'degrading':
      return '▼'
    case 'decreasing':
    case 'improving':
      return '▲'
    default:
      return '▬'
  }
}

/**
 * Download executive report
 */
export function downloadExecutiveReport(doc: jsPDF): void {
  const filename = `executive-report-${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(filename)
}
