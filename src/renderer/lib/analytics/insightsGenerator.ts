/**
 * Insights Generator for Executive Dashboard
 * Generates narrative insights and recommendations from metrics
 */

import type {
  ExecutiveMetrics,
  ProjectMetrics,
  OverallMetrics,
  ComplianceMetrics,
  TrendMetrics,
} from './metricsCalculator'
import type { Project } from '@@/types'

export interface Insight {
  id: string
  type: 'critical' | 'warning' | 'info' | 'success'
  category: 'security' | 'compliance' | 'productivity' | 'trend'
  title: string
  description: string
  recommendation?: string
  impact?: 'high' | 'medium' | 'low'
  actionItems?: string[]
  affectedProjects?: string[]
  generatedAt: Date
}

export interface ExecutiveSummary {
  overallStatus: 'critical' | 'warning' | 'good' | 'excellent'
  headline: string
  keyPoints: string[]
  insights: Insight[]
  topRisks: RiskItem[]
  topRecommendations: Recommendation[]
  reportPeriod: string
}

export interface RiskItem {
  projectId: string
  projectName: string
  risk: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
}

export interface Recommendation {
  priority: 'immediate' | 'high' | 'medium' | 'low'
  title: string
  description: string
  expectedOutcome: string
  effort: 'low' | 'medium' | 'high'
}

/**
 * Generate executive summary from metrics
 */
export function generateExecutiveSummary(metrics: ExecutiveMetrics, projects: Project[]): ExecutiveSummary {
  const insights = generateInsights(metrics, projects)
  const topRisks = identifyTopRisks(metrics.byProject, insights)
  const topRecommendations = generateRecommendations(metrics, insights)

  // Determine overall status
  const overallStatus = determineOverallStatus(metrics)

  // Generate headline
  const headline = generateHeadline(metrics, overallStatus)

  // Generate key points
  const keyPoints = generateKeyPoints(metrics)

  return {
    overallStatus,
    headline,
    keyPoints,
    insights,
    topRisks,
    topRecommendations,
    reportPeriod: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

/**
 * Generate all insights from metrics
 */
export function generateInsights(metrics: ExecutiveMetrics, projects: Project[]): Insight[] {
  const insights: Insight[] = []

  // Overall security insights
  insights.push(...generateSecurityInsights(metrics.overall, projects))

  // Compliance insights
  insights.push(...generateComplianceInsights(metrics.compliance))

  // Trend insights
  insights.push(...generateTrendInsights(metrics.trends, metrics.byProject))

  // Productivity insights
  insights.push(...generateProductivityInsights(metrics.productivity))

  // Project-specific insights
  insights.push(...generateProjectSpecificInsights(metrics.byProject))

  // Sort by severity and relevance
  insights.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 }
    return severityOrder[a.type] - severityOrder[b.type]
  })

  return insights.slice(0, 20) // Limit to top 20 insights
}

/**
 * Generate security-related insights
 */
function generateSecurityInsights(overall: OverallMetrics, projects: Project[]): Insight[] {
  const insights: Insight[] = []

  // Critical vulnerabilities alert
  if (overall.criticalCount > 0) {
    const affectedProjects = projects.filter((p) => p.statistics.criticalCount > 0).map((p) => p.id)

    insights.push({
      id: 'critical-vulns-detected',
      type: 'critical',
      category: 'security',
      title: `${overall.criticalCount} Critical Vulnerabilities Detected`,
      description: `You have ${overall.criticalCount} critical vulnerabilities across ${affectedProjects.length} project(s). These should be addressed immediately.`,
      recommendation:
        'Prioritize patching critical vulnerabilities. Consider taking affected systems offline if exploits exist.',
      impact: 'high',
      actionItems: [
        'Review all critical vulnerabilities',
        'Check for known exploits',
        'Schedule immediate patching',
        'Implement temporary mitigations if patches unavailable',
      ],
      affectedProjects,
      generatedAt: new Date(),
    })
  }

  // Risk level insight
  if (overall.riskLevel === 'critical' || overall.riskLevel === 'high') {
    insights.push({
      id: 'elevated-risk-level',
      type: overall.riskLevel === 'critical' ? 'critical' : 'warning',
      category: 'security',
      title: `Overall Security Risk: ${overall.riskLevel.toUpperCase()}`,
      description: `Your overall security risk level is ${overall.riskLevel}. Average health score is ${overall.averageHealthScore}/100.`,
      recommendation:
        overall.riskLevel === 'critical'
          ? 'Immediate action required. Focus on reducing critical vulnerabilities.'
          : 'Elevated risk detected. Review and address high-priority vulnerabilities.',
      impact: 'high',
      generatedAt: new Date(),
    })
  }

  // Health score insight
  if (overall.averageHealthScore < 70) {
    insights.push({
      id: 'low-health-score',
      type: 'warning',
      category: 'security',
      title: 'Low Average Health Score Detected',
      description: `Your average project health score is ${overall.averageHealthScore}/100. This indicates multiple security issues.`,
      recommendation: 'Focus on improving health scores by addressing vulnerabilities across all projects.',
      impact: 'medium',
      generatedAt: new Date(),
    })
  }

  // Success insight - good health
  if (overall.averageHealthScore >= 90 && overall.criticalCount === 0) {
    insights.push({
      id: 'good-health-score',
      type: 'success',
      category: 'security',
      title: 'Excellent Security Posture',
      description: `Your average health score is ${overall.averageHealthScore}/100 with no critical vulnerabilities. Great work maintaining security!`,
      impact: 'low',
      generatedAt: new Date(),
    })
  }

  return insights
}

/**
 * Generate compliance-related insights
 */
function generateComplianceInsights(compliance: ComplianceMetrics): Insight[] {
  const insights: Insight[] = []

  // SLA compliance
  if (compliance.slaCompliance.slaOverall < 80) {
    insights.push({
      id: 'sla-compliance-low',
      type: 'warning',
      category: 'compliance',
      title: 'SLA Compliance Below Target',
      description: `Overall SLA compliance is at ${compliance.slaCompliance.slaOverall}%. Target is 80%+. Critical SLA: ${compliance.slaCompliance.slaCritical}%, High SLA: ${compliance.slaCompliance.slaHigh}%.`,
      recommendation:
        'Review vulnerability remediation processes. Prioritize older vulnerabilities to improve SLA compliance.',
      impact: 'medium',
      actionItems: [
        'Audit vulnerabilities older than SLA thresholds',
        'Implement automated remediation workflows',
        'Schedule regular vulnerability review cycles',
      ],
      generatedAt: new Date(),
    })
  }

  // Scan coverage
  if (compliance.scanCoverage < 80) {
    insights.push({
      id: 'low-scan-coverage',
      type: 'warning',
      category: 'compliance',
      title: 'Low Scan Coverage Detected',
      description: `Only ${compliance.scanCoverage}% of projects have been scanned in the last 30 days.`,
      recommendation: 'Schedule regular scans for all projects to maintain visibility into security posture.',
      impact: 'medium',
      generatedAt: new Date(),
    })
  }

  // Data freshness
  if (compliance.dataFreshness < 70) {
    insights.push({
      id: 'stale-data-detected',
      type: 'info',
      category: 'compliance',
      title: 'Vulnerability Data Needs Refresh',
      description: `${compliance.dataFreshness}% of projects have fresh vulnerability data (refreshed within 7 days).`,
      recommendation:
        'Refresh vulnerability data from NVD/OSV to ensure you have the latest vulnerability information.',
      impact: 'low',
      generatedAt: new Date(),
    })
  }

  return insights
}

/**
 * Generate trend-related insights
 */
function generateTrendInsights(trends: TrendMetrics, _projectMetrics: ProjectMetrics[]): Insight[] {
  const insights: Insight[] = []

  // Vulnerability trend
  if (trends.vulnerabilityTrend === 'increasing') {
    insights.push({
      id: 'vulns-increasing',
      type: 'warning',
      category: 'trend',
      title: 'Vulnerabilities Increasing',
      description: 'The number of vulnerabilities has been increasing over the past few weeks.',
      recommendation: 'Review new vulnerabilities promptly. Investigate root cause of the increase.',
      impact: 'medium',
      generatedAt: new Date(),
    })
  } else if (trends.vulnerabilityTrend === 'decreasing') {
    insights.push({
      id: 'vulns-decreasing',
      type: 'success',
      category: 'trend',
      title: 'Vulnerabilities Decreasing',
      description: 'Good news! The number of vulnerabilities has been decreasing over recent weeks.',
      impact: 'low',
      generatedAt: new Date(),
    })
  }

  // Health trend
  if (trends.healthTrend === 'improving') {
    insights.push({
      id: 'health-improving',
      type: 'success',
      category: 'trend',
      title: 'Security Posture Improving',
      description: 'Average health scores have been improving. Keep up the good work!',
      impact: 'low',
      generatedAt: new Date(),
    })
  } else if (trends.healthTrend === 'degrading') {
    insights.push({
      id: 'health-degrading',
      type: 'warning',
      category: 'trend',
      title: 'Security Posture Degrading',
      description: 'Average health scores have been declining. Review recent changes and vulnerability trends.',
      recommendation: 'Investigate which projects are contributing to the decline and address them.',
      impact: 'medium',
      generatedAt: new Date(),
    })
  }

  // Scan frequency
  if (trends.scanFrequency === 0) {
    insights.push({
      id: 'no-recent-scans',
      type: 'warning',
      category: 'productivity',
      title: 'No Scans in Past Week',
      description: 'No projects have been scanned in the past 7 days.',
      recommendation: 'Schedule regular scans to maintain up-to-date vulnerability information.',
      impact: 'medium',
      generatedAt: new Date(),
    })
  }

  return insights
}

/**
 * Generate productivity insights
 */
function generateProductivityInsights(
  productivity: ReturnType<typeof import('./metricsCalculator').calculateProductivityMetrics>,
): Insight[] {
  const insights: Insight[] = []

  if (productivity.totalScans === 0) {
    insights.push({
      id: 'no-scans-performed',
      type: 'info',
      category: 'productivity',
      title: 'No Scans Performed Yet',
      description: 'No vulnerability scans have been performed. Start by scanning your projects.',
      recommendation: 'Upload SBOMs and run scans to begin tracking vulnerabilities.',
      impact: 'low',
      generatedAt: new Date(),
    })
  }

  return insights
}

/**
 * Generate project-specific insights
 */
function generateProjectSpecificInsights(projectMetrics: ProjectMetrics[]): Insight[] {
  const insights: Insight[] = []

  // Identify high-risk projects
  const highRiskProjects = projectMetrics.filter((p) => p.riskScore >= 70)

  if (highRiskProjects.length > 0) {
    for (const project of highRiskProjects) {
      insights.push({
        id: `high-risk-${project.projectId}`,
        type: project.riskScore >= 85 ? 'critical' : 'warning',
        category: 'security',
        title: `High Risk Project: ${project.projectName}`,
        description: `Project "${project.projectName}" has a risk score of ${project.riskScore}/100 with ${project.criticalCount} critical and ${project.highCount} high vulnerabilities.`,
        recommendation: `Prioritize remediation for ${project.projectName}. Focus on critical vulnerabilities first.`,
        impact: 'high',
        affectedProjects: [project.projectId],
        generatedAt: new Date(),
      })
    }
  }

  // Identify projects with no recent scans
  const staleProjects = projectMetrics.filter((p) => {
    if (!p.lastScanDate) return true
    const daysSinceScan = (Date.now() - new Date(p.lastScanDate).getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceScan > 30
  })

  if (staleProjects.length > 0) {
    insights.push({
      id: 'stale-projects-detected',
      type: 'info',
      category: 'compliance',
      title: `${staleProjects.length} Project(s) Need Scanning`,
      description: `${staleProjects.length} project(s) haven't been scanned in over 30 days.`,
      recommendation: 'Schedule scans for these projects to ensure vulnerability data is current.',
      impact: 'low',
      affectedProjects: staleProjects.map((p) => p.projectId),
      generatedAt: new Date(),
    })
  }

  return insights
}

/**
 * Identify top risks from project metrics
 */
function identifyTopRisks(projectMetrics: ProjectMetrics[], _insights: Insight[]): RiskItem[] {
  const risks: RiskItem[] = []

  // Get top 5 highest risk projects
  const topRiskProjects = projectMetrics.sort((a, b) => b.riskScore - a.riskScore).slice(0, 5)

  for (const project of topRiskProjects) {
    let severity: 'critical' | 'high' | 'medium' | 'low' = 'low'
    if (project.riskScore >= 85) severity = 'critical'
    else if (project.riskScore >= 70) severity = 'high'
    else if (project.riskScore >= 50) severity = 'medium'

    const riskDescriptions: string[] = []
    if (project.criticalCount > 0) {
      riskDescriptions.push(`${project.criticalCount} critical vulnerabilities`)
    }
    if (project.highCount > 0) {
      riskDescriptions.push(`${project.highCount} high vulnerabilities`)
    }
    if (!project.lastScanDate) {
      riskDescriptions.push('never scanned')
    }

    risks.push({
      projectId: project.projectId,
      projectName: project.projectName,
      risk: `${project.riskScore}/100`,
      severity,
      description: riskDescriptions.length > 0 ? riskDescriptions.join(', ') : 'Elevated vulnerability count',
    })
  }

  return risks
}

/**
 * Generate recommendations from insights
 */
function generateRecommendations(metrics: ExecutiveMetrics, _insights: Insight[]): Recommendation[] {
  const recommendations: Recommendation[] = []

  // Critical vulnerabilities
  if (metrics.overall.criticalCount > 0) {
    recommendations.push({
      priority: 'immediate',
      title: 'Address Critical Vulnerabilities',
      description: `Patch or mitigate ${metrics.overall.criticalCount} critical vulnerabilities across your projects.`,
      expectedOutcome: 'Significant reduction in security risk and compliance exposure.',
      effort: 'medium',
    })
  }

  // Scan stale projects
  const staleProjects = metrics.byProject.filter((p) => {
    if (!p.lastScanDate) return true
    const daysSinceScan = (Date.now() - new Date(p.lastScanDate).getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceScan > 30
  })

  if (staleProjects.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Scan Stale Projects',
      description: `Run vulnerability scans on ${staleProjects.length} project(s) that haven't been scanned in 30+ days.`,
      expectedOutcome: 'Current visibility into security posture for all projects.',
      effort: 'low',
    })
  }

  // Improve SLA compliance
  if (metrics.compliance.slaCompliance.slaOverall < 80) {
    recommendations.push({
      priority: 'high',
      title: 'Improve SLA Compliance',
      description: 'Implement processes to remediate vulnerabilities within SLA thresholds.',
      expectedOutcome: `${metrics.compliance.slaCompliance.slaOverall}% → 80%+ SLA compliance`,
      effort: 'medium',
    })
  }

  // Refresh vulnerability data
  if (metrics.compliance.dataFreshness < 80) {
    recommendations.push({
      priority: 'medium',
      title: 'Refresh Vulnerability Data',
      description: 'Update vulnerability information from NVD/OSV databases.',
      expectedOutcome: 'Access to latest vulnerability data and patches.',
      effort: 'low',
    })
  }

  // Establish regular scanning schedule
  if (metrics.trends.scanFrequency < 3) {
    recommendations.push({
      priority: 'medium',
      title: 'Establish Regular Scanning Schedule',
      description: 'Set up automated or scheduled weekly scans for all projects.',
      expectedOutcome: 'Consistent visibility with at least 3 scans per week.',
      effort: 'low',
    })
  }

  // High-risk project remediation
  const highRiskProjects = metrics.byProject.filter((p) => p.riskScore >= 70)
  if (highRiskProjects.length > 0) {
    recommendations.push({
      priority: 'high',
      title: 'Remediate High-Risk Projects',
      description: `Focus remediation efforts on ${highRiskProjects.length} high-risk project(s).`,
      expectedOutcome: 'Reduced overall security risk and improved health scores.',
      effort: 'high',
    })
  }

  return recommendations.slice(0, 10) // Limit to top 10 recommendations
}

/**
 * Determine overall status from metrics
 */
function determineOverallStatus(metrics: ExecutiveMetrics): 'critical' | 'warning' | 'good' | 'excellent' {
  const { overall, compliance, trends } = metrics

  // Critical conditions
  if (overall.criticalCount > 0 || overall.riskLevel === 'critical') {
    return 'critical'
  }

  // Warning conditions
  if (overall.riskLevel === 'high' || compliance.slaCompliance.slaOverall < 70 || trends.healthTrend === 'degrading') {
    return 'warning'
  }

  // Excellent conditions
  if (
    overall.riskLevel === 'excellent' &&
    compliance.slaCompliance.slaOverall >= 90 &&
    trends.healthTrend === 'improving'
  ) {
    return 'excellent'
  }

  return 'good'
}

/**
 * Generate headline
 */
function generateHeadline(metrics: ExecutiveMetrics, status: string): string {
  const { overall, trends } = metrics

  if (status === 'critical') {
    return `Critical: ${overall.criticalCount} critical vulnerabilities require immediate attention`
  }

  if (status === 'warning') {
    if (trends.vulnerabilityTrend === 'increasing') {
      return 'Warning: Vulnerabilities increasing - action required'
    }
    if (overall.highCount > 0) {
      return `Attention: ${overall.highCount} high-priority vulnerabilities detected`
    }
    return 'Attention: Review security posture and compliance metrics'
  }

  if (status === 'excellent') {
    return 'Excellent: Security posture is strong with no critical issues'
  }

  return `Security posture is good with ${overall.totalVulnerabilities} total vulnerabilities`
}

/**
 * Generate key points
 */
function generateKeyPoints(metrics: ExecutiveMetrics): string[] {
  const points: string[] = []
  const { overall, compliance, productivity } = metrics

  points.push(`${overall.totalProjects} project(s) monitored with ${overall.totalComponents} total components`)
  points.push(
    `${overall.totalVulnerabilities} total vulnerabilities: ${overall.criticalCount} critical, ${overall.highCount} high`,
  )
  points.push(`Average health score: ${overall.averageHealthScore}/100 (${overall.riskLevel} risk level)`)
  points.push(`${compliance.slaCompliance.slaOverall}% SLA compliance, ${compliance.scanCoverage}% scan coverage`)
  points.push(`${productivity.scansThisWeek} scans completed this week`)

  if (metrics.trends.vulnerabilityTrend !== 'stable') {
    points.push(`Vulnerability trend: ${metrics.trends.vulnerabilityTrend}`)
  }

  if (metrics.trends.healthTrend !== 'stable') {
    points.push(`Health trend: ${metrics.trends.healthTrend}`)
  }

  return points
}
