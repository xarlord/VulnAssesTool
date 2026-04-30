/**
 * Report Generator Service
 *
 * Generates professional PDF and HTML vulnerability reports.
 *
 * @module services/reports/reportGenerator
 */

import { getPlatform } from '@/lib/platform'

import type { ReportOptions, ReportData, GeneratedReport, ExecutiveSummaryMetrics } from './types'
import { generateExecutiveReportHTML } from './templates/executiveReport'

/**
 * Default report options
 */
const DEFAULT_OPTIONS: Partial<ReportOptions> = {
  title: 'Vulnerability Assessment Report',
  includeExecutiveSummary: true,
  includeCharts: true,
  includeRecommendations: true,
  theme: 'light',
}

/**
 * Calculate executive summary metrics from report data
 */
function calculateMetrics(data: ReportData): ExecutiveSummaryMetrics {
  const { vulnerabilities, statistics, components, riskScores } = data

  // Calculate overall risk score
  let totalRiskScore = 0
  if (riskScores && riskScores.size > 0) {
    let sum = 0
    for (const score of riskScores.values()) {
      sum += score.score
    }
    totalRiskScore = Math.round(sum / riskScores.size)
  } else {
    // Fallback calculation based on severity distribution
    const weights = { critical: 40, high: 25, medium: 15, low: 5, none: 0 }
    const total = statistics.totalVulnerabilities || 1
    totalRiskScore = Math.round(
      (statistics.criticalCount * weights.critical +
        statistics.highCount * weights.high +
        statistics.mediumCount * weights.medium +
        statistics.lowCount * weights.low) /
        total,
    )
  }

  // Determine risk level
  let riskLevel: ExecutiveSummaryMetrics['riskLevel']
  if (totalRiskScore >= 70 || statistics.criticalCount > 0) {
    riskLevel = 'Critical'
  } else if (totalRiskScore >= 50 || statistics.highCount > 3) {
    riskLevel = 'High'
  } else if (totalRiskScore >= 25 || statistics.mediumCount > 5) {
    riskLevel = 'Medium'
  } else {
    riskLevel = 'Low'
  }

  // Generate key findings
  const keyFindings: string[] = []
  if (statistics.criticalCount > 0) {
    keyFindings.push(`${statistics.criticalCount} critical vulnerabilities require immediate attention`)
  }
  if (statistics.kevCount > 0) {
    keyFindings.push(
      `${statistics.kevCount} vulnerabilities are in the CISA Known Exploited Vulnerabilities (KEV) catalog`,
    )
  }
  if (statistics.avgEpssScore > 0.5) {
    keyFindings.push(
      `High average EPSS score (${(statistics.avgEpssScore * 100).toFixed(0)}%) indicates elevated exploitation risk`,
    )
  }
  const vulnerablePercent = ((statistics.vulnerableComponents / statistics.totalComponents) * 100).toFixed(0)
  keyFindings.push(
    `${vulnerablePercent}% of components (${statistics.vulnerableComponents}/${statistics.totalComponents}) have known vulnerabilities`,
  )

  // Find top vulnerable components
  const componentVulnMap = new Map<string, { count: number; highestSeverity: string }>()
  for (const vuln of vulnerabilities) {
    for (const compId of vuln.affectedComponents || []) {
      const existing = componentVulnMap.get(compId) || { count: 0, highestSeverity: 'low' }
      existing.count++
      const severityOrder = ['critical', 'high', 'medium', 'low', 'none']
      if (severityOrder.indexOf(vuln.severity) < severityOrder.indexOf(existing.highestSeverity)) {
        existing.highestSeverity = vuln.severity
      }
      componentVulnMap.set(compId, existing)
    }
  }

  const topVulnerableComponents = Array.from(componentVulnMap.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([compId, data]) => {
      const comp = components.find((c) => c.id === compId)
      return {
        name: comp?.name || compId,
        version: comp?.version || 'unknown',
        vulnerabilityCount: data.count,
        highestSeverity: data.highestSeverity,
      }
    })

  // Generate recommended actions
  const recommendedActions: string[] = []
  if (statistics.criticalCount > 0) {
    recommendedActions.push('Address all critical vulnerabilities immediately - these represent active security risks')
  }
  if (statistics.kevCount > 0) {
    recommendedActions.push(
      'Prioritize remediation of KEV-listed vulnerabilities as they are actively exploited in the wild',
    )
  }
  if (statistics.highCount > 0) {
    recommendedActions.push('Schedule remediation for high-severity vulnerabilities within the next sprint')
  }
  recommendedActions.push('Implement automated dependency scanning in CI/CD pipeline')
  recommendedActions.push('Review and update software composition analysis process')

  return {
    overallRiskScore: totalRiskScore,
    riskLevel,
    trend: 'stable', // Would need historical data for actual trend
    keyFindings,
    topVulnerableComponents,
    recommendedActions,
  }
}

/**
 * Generate HTML report
 */
export async function generateHTML(data: ReportData, options: ReportOptions): Promise<GeneratedReport> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options }
  const metrics = calculateMetrics(data)

  const html = generateExecutiveReportHTML(data, mergedOptions, metrics)

  return {
    content: html,
    contentType: 'text/html',
    filename: `${options.projectName.replace(/[^a-z0-9]/gi, '_')}_report_${formatDate()}.html`,
    size: new Blob([html]).size,
  }
}

/**
 * Generate PDF report using Electron's printToPDF
 */
export async function generatePDF(data: ReportData, options: ReportOptions): Promise<GeneratedReport> {
  // First generate HTML
  const htmlReport = await generateHTML(data, options)

  // In Electron environment, use webContents.printToPDF
  // This is a placeholder that returns the HTML for now
  // The actual PDF generation should be done via IPC to main process
  if (getPlatform()?.generatePDF) {
    const pdfBlob = await getPlatform().generatePDF(htmlReport.content as string)
    return {
      content: pdfBlob,
      contentType: 'application/pdf',
      filename: `${options.projectName.replace(/[^a-z0-9]/gi, '_')}_report_${formatDate()}.pdf`,
      size: pdfBlob.size,
    }
  }

  // Fallback: return HTML with PDF filename
  // Caller can use browser print functionality
  console.warn('[ReportGenerator] Electron API not available, returning HTML instead of PDF')
  return {
    ...htmlReport,
    filename: htmlReport.filename.replace('.html', '.pdf'),
  }
}

/**
 * Preview HTML report (returns HTML string for iframe or new window)
 */
export function previewHTML(data: ReportData, options: ReportOptions): string {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options }
  const metrics = calculateMetrics(data)
  return generateExecutiveReportHTML(data, mergedOptions, metrics)
}

/**
 * Download a generated report
 */
export function downloadReport(report: GeneratedReport): void {
  let blob: Blob
  if (report.content instanceof Blob) {
    blob = report.content
  } else {
    blob = new Blob([report.content], { type: report.contentType })
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = report.filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Format date for filename
 */
function formatDate(): string {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Report generator service object
 */
export const ReportGenerator = {
  generateHTML,
  generatePDF,
  previewHTML,
  downloadReport,
  calculateMetrics,
}

export default ReportGenerator
