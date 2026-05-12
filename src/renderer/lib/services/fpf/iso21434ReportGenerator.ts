/**
 * ISO 21434 Report Generator
 *
 * Generates ISO 21434 compliant reports for False Positive Filter decisions.
 * Supports JSON and PDF export formats.
 *
 * @module iso21434ReportGenerator
 */

import type { jsPDF as jsPdfModule } from 'jspdf'
import type {
  FilterAuditEvent,
  ISO21434Report,
  VulnerabilitySummary,
  FilteredSummary,
  FilterDecision,
} from '@@/types/fpf'

/**
 * Report generation options
 */
export interface ReportOptions {
  /** Include LLM analysis data */
  includeLLMData?: boolean
  /** Include undone events */
  includeUndone?: boolean
  /** Custom report version */
  reportVersion?: string
}

/**
 * ISO 21434 Report Generator class
 */
export class ISO21434ReportGenerator {
  private reportVersion: string

  constructor(options?: ReportOptions) {
    this.reportVersion = options?.reportVersion || '1.0.0'
  }

  /**
   * Generate a unique report ID
   */
  private generateReportId(): string {
    const timestamp = Date.now().toString(36)
    const randomPart = Math.random().toString(36).substring(2, 8)
    return `iso21434-report-${timestamp}-${randomPart}`
  }

  /**
   * Compute hash of configuration for integrity
   */
  private async computeConfigHash(config: unknown): Promise<string> {
    const data = JSON.stringify(config)
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(data)
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
  }

  /**
   * Determine risk level based on kept vulnerabilities
   */
  private determineRiskLevel(criticalKept: number, highKept: number): 'unacceptable' | 'acceptable' | 'negligible' {
    if (criticalKept > 0 || highKept > 5) {
      return 'unacceptable'
    }
    if (highKept > 0) {
      return 'acceptable'
    }
    return 'negligible'
  }

  /**
   * Convert audit event to vulnerability summary
   */
  private eventToSummary(event: FilterAuditEvent): VulnerabilitySummary {
    return {
      cveId: event.vulnerability.cveId,
      severity: event.vulnerability.severity,
      cvssScore: event.vulnerability.cvssScore,
      componentName: event.vulnerability.component.name,
      componentVersion: event.vulnerability.component.version,
      description: `Filter decision: ${event.decision.reason}`,
      recommendation: this.getRecommendation(event.decision),
    }
  }

  /**
   * Get recommendation based on decision
   */
  private getRecommendation(decision: FilterDecision): string {
    switch (decision.action) {
      case 'filtered':
        return 'False positive - no action required'
      case 'kept':
        return 'Valid vulnerability - requires remediation'
      case 'escalated':
        return 'Requires manual review by security team'
      default:
        return 'No recommendation available'
    }
  }

  /**
   * Generate ISO 21434 compliance report
   */
  async generate(
    projectName: string,
    projectVersion: string,
    auditLog: FilterAuditEvent[],
    configSnapshot: unknown,
    options?: ReportOptions,
  ): Promise<ISO21434Report> {
    const reportId = this.generateReportId()
    const generatedAt = new Date().toISOString()

    // Filter events if needed
    const events = auditLog
    if (!options?.includeUndone) {
      // In a real implementation, we'd check the undone status
      // For now, we include all events
    }

    // Categorize events
    const keptEvents: FilterAuditEvent[] = []
    const filteredEvents: FilterAuditEvent[] = []
    const uncertainEvents: FilterAuditEvent[] = []

    for (const event of events) {
      switch (event.decision.action) {
        case 'kept':
          keptEvents.push(event)
          break
        case 'filtered':
          filteredEvents.push(event)
          break
        case 'escalated':
          uncertainEvents.push(event)
          break
      }
    }

    // Calculate severity breakdown
    let criticalKept = 0
    let highKept = 0

    for (const event of keptEvents) {
      if (event.vulnerability.severity === 'critical') criticalKept++
      if (event.vulnerability.severity === 'high') highKept++
    }

    // Build sections
    const keptSummaries: VulnerabilitySummary[] = keptEvents.map((e) => this.eventToSummary(e))

    const filteredSummaries: FilteredSummary[] = filteredEvents.map((e) => ({
      ...this.eventToSummary(e),
      filterReason: e.decision.reason,
      filterTier: e.decision.tier,
      confidence: e.decision.confidence,
      filterDate: e.timestamp,
    }))

    const uncertainSummaries: VulnerabilitySummary[] = uncertainEvents.map((e) => this.eventToSummary(e))

    // Calculate events by tier
    const eventsByTier: Record<number, number> = {}
    for (const event of events) {
      const tier = event.decision.tier
      eventsByTier[tier] = (eventsByTier[tier] || 0) + 1
    }

    // Check if LLM was used
    const llmUsed = events.some((e) => e.llmData !== undefined)

    // Get config hash
    const configHash = await this.computeConfigHash(configSnapshot)

    // Build audit summary
    const auditSummary: ISO21434Report['auditSummary'] = {
      totalEvents: events.length,
      eventsByTier,
      configChanges: [], // Would be populated from config change events
      userReviews: events
        .filter((e) => e.eventType === 'review' || e.eventType === 'override')
        .map((e) => ({
          timestamp: e.timestamp,
          cveId: e.vulnerability.cveId,
          decision: e.decision.action,
          user: e.user.name,
        })),
    }

    // Build the report
    const report: ISO21434Report = {
      reportId,
      generatedAt,
      projectName,
      projectVersion,
      reportVersion: options?.reportVersion || this.reportVersion,

      summary: {
        totalVulnerabilities: events.length,
        filteredCount: filteredEvents.length,
        reviewedCount: uncertainEvents.length,
        criticalKept,
        highKept,
        riskLevel: this.determineRiskLevel(criticalKept, highKept),
      },

      methodology: {
        filterApproach: 'Hybrid three-tier filtering with LLM analysis',
        tiersUsed: [1, 2, 3],
        llmUsed,
        configHash,
      },

      sections: {
        kept: keptSummaries,
        filtered: filteredSummaries,
        uncertain: uncertainSummaries,
      },

      auditSummary,

      evidence: {
        sbomHash: 'pending', // Would be computed from actual SBOM
        nvdDatabaseVersion: 'pending', // Would be from NVD metadata
        configSnapshot: JSON.stringify(configSnapshot),
      },

      signatures: {
        generated: generatedAt,
        reviewed: undefined,
        approved: undefined,
      },
    }

    return report
  }

  /**
   * Export report as JSON string
   */
  exportJSON(report: ISO21434Report): string {
    return JSON.stringify(report, null, 2)
  }

  /**
   * Export report as PDF using jsPDF
   */
  async exportPDF(report: ISO21434Report): Promise<jsPdfModule> {
    const { jsPDF } = await import('jspdf')
    const autoTable = (await import('jspdf-autotable')).default

    const doc = new jsPDF()

    // Header
    doc.setFontSize(18)
    doc.setTextColor(59, 130, 246) // Blue
    doc.text('ISO 21434 Compliance Report', 14, 20)

    // Report metadata
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.text(`Report ID: ${report.reportId}`, 14, 28)
    doc.text(`Generated: ${new Date(report.generatedAt).toLocaleString()}`, 14, 33)
    doc.text(`Project: ${report.projectName} v${report.projectVersion}`, 14, 38)
    doc.text(`Report Version: ${report.reportVersion}`, 14, 43)

    // Executive Summary
    doc.setFontSize(13)
    doc.setTextColor(0, 0, 0)
    doc.text('Executive Summary', 14, 55)

    const riskColor =
      report.summary.riskLevel === 'unacceptable'
        ? [220, 38, 38]
        : report.summary.riskLevel === 'acceptable'
          ? [234, 179, 8]
          : [34, 197, 94]

    doc.setFontSize(10)
    doc.text(`Risk Level: `, 14, 62)
    doc.setTextColor(riskColor[0], riskColor[1], riskColor[2])
    doc.text(report.summary.riskLevel.toUpperCase(), 42, 62)
    doc.setTextColor(0, 0, 0)

    autoTable(doc, {
      startY: 67,
      head: [['Metric', 'Count']],
      body: [
        ['Total Vulnerabilities', String(report.summary.totalVulnerabilities)],
        ['Filtered (False Positives)', String(report.summary.filteredCount)],
        ['Under Review', String(report.summary.reviewedCount)],
        ['Critical Kept', String(report.summary.criticalKept)],
        ['High Kept', String(report.summary.highKept)],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
    })

    // Methodology
    const methodologyY = doc.lastAutoTable?.finalY + 10
    doc.setFontSize(13)
    doc.text('Methodology', 14, methodologyY)
    doc.setFontSize(9)
    doc.text(`Filter Approach: ${report.methodology.filterApproach}`, 14, methodologyY + 7)
    doc.text(`Tiers Used: ${report.methodology.tiersUsed.join(', ')}`, 14, methodologyY + 12)
    doc.text(`LLM Used: ${report.methodology.llmUsed ? 'Yes' : 'No'}`, 14, methodologyY + 17)
    doc.text(`Config Hash: ${report.methodology.configHash}`, 14, methodologyY + 22)

    // Kept Vulnerabilities
    let currentY = methodologyY + 32
    if (report.sections.kept.length > 0) {
      if (currentY > 250) {
        doc.addPage()
        currentY = 20
      }

      doc.setFontSize(13)
      doc.setTextColor(220, 38, 38)
      doc.text('Kept Vulnerabilities (Require Action)', 14, currentY)
      doc.setTextColor(0, 0, 0)

      autoTable(doc, {
        startY: currentY + 5,
        head: [['CVE ID', 'Severity', 'Component', 'CVSS', 'Recommendation']],
        body: report.sections.kept.map((v) => [
          v.cveId,
          v.severity.toUpperCase(),
          `${v.componentName} ${v.componentVersion}`,
          String(v.cvssScore),
          v.recommendation,
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [220, 38, 38], textColor: 255 },
        columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 40 }, 4: { cellWidth: 55 } },
      })
      currentY = doc.lastAutoTable?.finalY + 10
    }

    // Filtered Vulnerabilities
    if (report.sections.filtered.length > 0) {
      if (currentY > 250) {
        doc.addPage()
        currentY = 20
      }

      doc.setFontSize(13)
      doc.setTextColor(34, 197, 94)
      doc.text('Filtered Vulnerabilities (False Positives)', 14, currentY)
      doc.setTextColor(0, 0, 0)

      autoTable(doc, {
        startY: currentY + 5,
        head: [['CVE ID', 'Severity', 'Reason', 'Tier', 'Confidence']],
        body: report.sections.filtered.map((v) => [
          v.cveId,
          v.severity.toUpperCase(),
          v.filterReason || '',
          String(v.filterTier || ''),
          `${v.confidence ?? 0}%`,
        ]),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [34, 197, 94], textColor: 255 },
        columnStyles: { 0: { cellWidth: 30 }, 2: { cellWidth: 60 } },
      })
      currentY = doc.lastAutoTable?.finalY + 10
    }

    // Audit Summary
    if (currentY > 250) {
      doc.addPage()
      currentY = 20
    }

    doc.setFontSize(13)
    doc.text('Audit Summary', 14, currentY)
    doc.setFontSize(9)
    doc.text(`Total Audit Events: ${report.auditSummary.totalEvents}`, 14, currentY + 7)

    // Signatures section
    currentY += 17
    if (currentY > 250) {
      doc.addPage()
      currentY = 20
    }

    doc.setFontSize(13)
    doc.text('Signatures', 14, currentY)
    doc.setFontSize(9)
    doc.text(`Generated: ${report.signatures.generated}`, 14, currentY + 7)
    doc.text(`Reviewed: ${report.signatures.reviewed || 'Pending'}`, 14, currentY + 12)
    doc.text(`Approved: ${report.signatures.approved || 'Pending'}`, 14, currentY + 17)

    // Footer on each page
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150, 150, 150)
      doc.text(`ISO 21434 Report - ${report.projectName} v${report.projectVersion}`, 14, 290)
      doc.text(`Page ${i} of ${pageCount}`, 190, 290, { align: 'right' })
    }

    return doc
  }

  /**
   * Download PDF report
   */
  async downloadPDF(report: ISO21434Report, filename?: string): Promise<void> {
    const doc = await this.exportPDF(report)
    const name = filename || `iso21434-report-${report.projectName}-${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(name)
  }

  /**
   * Generate summary statistics from audit log
   */
  generateStatistics(auditLog: FilterAuditEvent[]): {
    bySeverity: Record<string, number>
    byAction: Record<string, number>
    byTier: Record<string, number>
    averageConfidence: number
    llmUsageRate: number
  } {
    const bySeverity: Record<string, number> = {}
    const byAction: Record<string, number> = {}
    const byTier: Record<string, number> = {}
    let totalConfidence = 0
    let llmUsedCount = 0

    for (const event of auditLog) {
      // By severity
      const severity = event.vulnerability.severity
      bySeverity[severity] = (bySeverity[severity] || 0) + 1

      // By action
      const action = event.decision.action
      byAction[action] = (byAction[action] || 0) + 1

      // By tier
      const tier = event.decision.tier.toString()
      byTier[tier] = (byTier[tier] || 0) + 1

      // Confidence
      totalConfidence += event.decision.confidence

      // LLM usage
      if (event.llmData) {
        llmUsedCount++
      }
    }

    return {
      bySeverity,
      byAction,
      byTier,
      averageConfidence: auditLog.length > 0 ? totalConfidence / auditLog.length : 0,
      llmUsageRate: auditLog.length > 0 ? llmUsedCount / auditLog.length : 0,
    }
  }
}
