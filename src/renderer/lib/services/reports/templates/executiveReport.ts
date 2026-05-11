/**
 * Executive Report HTML Template
 *
 * Professional HTML template for executive vulnerability reports.
 * Self-contained with inline CSS for PDF generation.
 *
 * @module services/reports/templates/executiveReport
 */

import type { ReportOptions, ReportData, ExecutiveSummaryMetrics } from '../types'

/**
 * Severity color mapping
 */
const severityColors = {
  critical: { bg: '#DC2626', text: '#FFFFFF' },
  high: { bg: '#EA580C', text: '#FFFFFF' },
  medium: { bg: '#CA8A04', text: '#000000' },
  low: { bg: '#16A34A', text: '#FFFFFF' },
  none: { bg: '#6B7280', text: '#FFFFFF' },
}

/**
 * Risk level color mapping
 */
const riskLevelColors = {
  Critical: { bg: '#7F1D1D', text: '#FFFFFF', border: '#DC2626' },
  High: { bg: '#7C2D12', text: '#FFFFFF', border: '#EA580C' },
  Medium: { bg: '#713F12', text: '#FFFFFF', border: '#CA8A04' },
  Low: { bg: '#14532D', text: '#FFFFFF', border: '#16A34A' },
}

/**
 * Generate base CSS styles
 */
function generateBaseStyles(theme: 'light' | 'dark' = 'light'): string {
  const isDark = theme === 'dark'

  return `
    /* Reset & Base */
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: ${isDark ? '#F1F5F9' : '#0F172A'};
      background: ${isDark ? '#0F172A' : '#FFFFFF'};
    }

    /* Layout */
    .report-container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px;
    }

    .page-break {
      page-break-after: always;
    }

    /* Header */
    .report-header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid ${isDark ? '#334155' : '#E2E8F0'};
    }

    .company-logo {
      max-width: 200px;
      max-height: 60px;
      margin-bottom: 20px;
    }

    .report-title {
      font-size: 28px;
      font-weight: 700;
      color: ${isDark ? '#F1F5F9' : '#0F172A'};
      margin-bottom: 8px;
    }

    .report-subtitle {
      font-size: 16px;
      color: ${isDark ? '#94A3B8' : '#64748B'};
    }

    .report-meta {
      margin-top: 20px;
      font-size: 12px;
      color: ${isDark ? '#94A3B8' : '#64748B'};
    }

    /* Executive Summary */
    .executive-summary {
      background: ${isDark ? '#1E293B' : '#F8FAFC'};
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 32px;
    }

    .section-title {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 16px;
      color: ${isDark ? '#F1F5F9' : '#0F172A'};
    }

    .risk-badge {
      display: inline-flex;
      align-items: center;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    /* Statistics Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }

    .stat-card {
      background: ${isDark ? '#1E293B' : '#F8FAFC'};
      border: 1px solid ${isDark ? '#334155' : '#E2E8F0'};
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.2;
    }

    .stat-label {
      font-size: 12px;
      color: ${isDark ? '#94A3B8' : '#64748B'};
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }

    /* Vulnerability Table */
    .vuln-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }

    .vuln-table th {
      background: ${isDark ? '#1E293B' : '#F1F5F9'};
      padding: 12px;
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: ${isDark ? '#94A3B8' : '#64748B'};
      border-bottom: 2px solid ${isDark ? '#334155' : '#E2E8F0'};
    }

    .vuln-table td {
      padding: 12px;
      border-bottom: 1px solid ${isDark ? '#334155' : '#E2E8F0'};
    }

    .vuln-table tr:hover {
      background: ${isDark ? '#1E293B' : '#F8FAFC'};
    }

    /* Severity Badge */
    .severity-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    /* Charts */
    .chart-container {
      margin-bottom: 32px;
    }

    .chart-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
    }

    .bar-chart {
      display: flex;
      align-items: flex-end;
      height: 200px;
      gap: 8px;
      padding: 16px;
      background: ${isDark ? '#1E293B' : '#F8FAFC'};
      border-radius: 8px;
    }

    .bar {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .bar-fill {
      width: 100%;
      max-width: 60px;
      border-radius: 4px 4px 0 0;
      transition: height 0.3s ease;
    }

    .bar-label {
      margin-top: 8px;
      font-size: 12px;
      color: ${isDark ? '#94A3B8' : '#64748B'};
    }

    .bar-value {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    /* Recommendations */
    .recommendations {
      background: ${isDark ? '#1E293B' : '#F8FAFC'};
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 32px;
    }

    .recommendation-item {
      display: flex;
      gap: 12px;
      padding: 12px 0;
      border-bottom: 1px solid ${isDark ? '#334155' : '#E2E8F0'};
    }

    .recommendation-item:last-child {
      border-bottom: none;
    }

    .recommendation-number {
      width: 24px;
      height: 24px;
      background: #3B82F6;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 600;
      flex-shrink: 0;
    }

    /* Footer */
    .report-footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid ${isDark ? '#334155' : '#E2E8F0'};
      text-align: center;
      font-size: 12px;
      color: ${isDark ? '#94A3B8' : '#64748B'};
    }

    /* Key Findings */
    .key-findings {
      margin-bottom: 24px;
    }

    .finding-item {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px 0;
    }

    .finding-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    /* Top Components */
    .top-components {
      margin-bottom: 24px;
    }

    .component-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      background: ${isDark ? '#1E293B' : '#FFFFFF'};
      border: 1px solid ${isDark ? '#334155' : '#E2E8F0'};
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .component-name {
      font-weight: 500;
    }

    .component-vulns {
      font-size: 12px;
      color: ${isDark ? '#94A3B8' : '#64748B'};
    }

    /* Print styles */
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .page-break { page-break-after: always; }
    }
  `
}

/**
 * Generate severity distribution chart HTML
 */
function generateSeverityChart(statistics: {
  critical: number
  high: number
  medium: number
  low: number
  none: number
}): string {
  const max = Math.max(statistics.critical, statistics.high, statistics.medium, statistics.low, statistics.none, 1)
  const data = [
    { label: 'Critical', value: statistics.critical, color: severityColors.critical.bg },
    { label: 'High', value: statistics.high, color: severityColors.high.bg },
    { label: 'Medium', value: statistics.medium, color: severityColors.medium.bg },
    { label: 'Low', value: statistics.low, color: severityColors.low.bg },
  ]

  return `
    <div class="chart-container">
      <div class="chart-title">Vulnerability Distribution by Severity</div>
      <div class="bar-chart">
        ${data
          .map(
            (item) => `
          <div class="bar">
            <div class="bar-value">${item.value}</div>
            <div class="bar-fill" style="height: ${(item.value / max) * 160}px; background-color: ${item.color};"></div>
            <div class="bar-label">${item.label}</div>
          </div>
        `,
          )
          .join('')}
      </div>
    </div>
  `
}

/**
 * Generate executive summary section
 */
function generateExecutiveSummary(metrics: ExecutiveSummaryMetrics): string {
  const riskColors = riskLevelColors[metrics.riskLevel] || riskLevelColors.Medium

  return `
    <div class="executive-summary">
      <h2 class="section-title">Executive Summary</h2>

      <div class="risk-badge" style="background-color: ${riskColors.bg}; color: ${riskColors.text}; border: 2px solid ${riskColors.border};">
        Overall Risk: ${metrics.riskLevel} (${metrics.overallRiskScore}/100)
      </div>

      <div class="key-findings">
        <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Key Findings</h3>
        ${metrics.keyFindings
          .map(
            (finding) => `
          <div class="finding-item">
            <svg class="finding-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>${finding}</span>
          </div>
        `,
          )
          .join('')}
      </div>

      ${
        metrics.topVulnerableComponents.length > 0
          ? `
        <div class="top-components">
          <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Top Vulnerable Components</h3>
          ${metrics.topVulnerableComponents
            .slice(0, 5)
            .map(
              (comp) => `
            <div class="component-item">
              <div>
                <div class="component-name">${comp.name}@${comp.version}</div>
                <div class="component-vulns">${comp.vulnerabilityCount} vulnerabilities</div>
              </div>
              <span class="severity-badge" style="background-color: ${severityColors[comp.highestSeverity as keyof typeof severityColors]?.bg || '#6B7280'}; color: ${severityColors[comp.highestSeverity as keyof typeof severityColors]?.text || '#FFFFFF'};">
                ${comp.highestSeverity}
              </span>
            </div>
          `,
            )
            .join('')}
        </div>
      `
          : ''
      }
    </div>
  `
}

/**
 * Generate recommendations section
 */
function generateRecommendations(actions: string[]): string {
  return `
    <div class="recommendations">
      <h2 class="section-title">Recommended Actions</h2>
      ${actions
        .map(
          (action, index) => `
        <div class="recommendation-item">
          <div class="recommendation-number">${index + 1}</div>
          <div>${action}</div>
        </div>
      `,
        )
        .join('')}
    </div>
  `
}

/**
 * Generate vulnerability table
 */
function generateVulnerabilityTable(
  vulnerabilities: Array<{
    id: string
    severity: string
    description: string
    cvssScore?: number
  }>,
): string {
  return `
    <table class="vuln-table">
      <thead>
        <tr>
          <th>CVE ID</th>
          <th>Severity</th>
          <th>CVSS</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${vulnerabilities
          .slice(0, 50)
          .map(
            (vuln) => `
          <tr>
            <td><code style="font-size: 12px;">${vuln.id}</code></td>
            <td>
              <span class="severity-badge" style="background-color: ${severityColors[vuln.severity as keyof typeof severityColors]?.bg || '#6B7280'}; color: ${severityColors[vuln.severity as keyof typeof severityColors]?.text || '#FFFFFF'};">
                ${vuln.severity}
              </span>
            </td>
            <td>${vuln.cvssScore?.toFixed(1) || 'N/A'}</td>
            <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">${vuln.description?.substring(0, 100) || 'No description'}${vuln.description && vuln.description.length > 100 ? '...' : ''}</td>
          </tr>
        `,
          )
          .join('')}
      </tbody>
    </table>
    ${vulnerabilities.length > 50 ? `<p style="text-align: center; color: #64748B; font-size: 12px;">Showing 50 of ${vulnerabilities.length} vulnerabilities</p>` : ''}
  `
}

/**
 * Generate complete HTML report
 */
export function generateExecutiveReportHTML(
  data: ReportData,
  options: ReportOptions,
  metrics: ExecutiveSummaryMetrics,
): string {
  const theme = options.theme || 'light'

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
  <style>${generateBaseStyles(theme)}</style>
</head>
<body>
  <div class="report-container">
    <!-- Header -->
    <header class="report-header">
      ${options.companyLogo ? `<img src="${options.companyLogo}" alt="Company Logo" class="company-logo" />` : ''}
      <h1 class="report-title">${options.title}</h1>
      <p class="report-subtitle">${options.projectName}</p>
      <div class="report-meta">
        <p>Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        ${options.generatedBy ? `<p>By: ${options.generatedBy}</p>` : ''}
      </div>
    </header>

    <!-- Statistics -->
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" style="color: ${severityColors.critical.bg}">${data.statistics.criticalCount}</div>
        <div class="stat-label">Critical</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: ${severityColors.high.bg}">${data.statistics.highCount}</div>
        <div class="stat-label">High</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: ${severityColors.medium.bg}">${data.statistics.mediumCount}</div>
        <div class="stat-label">Medium</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: ${severityColors.low.bg}">${data.statistics.lowCount}</div>
        <div class="stat-label">Low</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${data.statistics.totalVulnerabilities}</div>
        <div class="stat-label">Total</div>
      </div>
    </div>

    ${options.includeExecutiveSummary ? generateExecutiveSummary(metrics) : ''}

    ${
      options.includeCharts
        ? generateSeverityChart({
            critical: data.statistics.criticalCount,
            high: data.statistics.highCount,
            medium: data.statistics.mediumCount,
            low: data.statistics.lowCount,
            none: data.statistics.noneCount,
          })
        : ''
    }

    <!-- Vulnerability Details -->
    <section>
      <h2 class="section-title">Vulnerability Details</h2>
      ${generateVulnerabilityTable(
        data.vulnerabilities.map((v) => ({
          id: v.id,
          severity: v.severity,
          description: v.description || '',
          cvssScore: v.cvssScore,
        })),
      )}
    </section>

    ${options.includeRecommendations ? generateRecommendations(metrics.recommendedActions) : ''}

    <!-- Footer -->
    <footer class="report-footer">
      ${options.companyName ? `<p>${options.companyName}</p>` : ''}
      <p>Generated by VulnAssessTool</p>
      <p>Report ID: ${Date.now().toString(36).toUpperCase()}</p>
    </footer>
  </div>
</body>
</html>
  `
}
