/**
 * Metrics Calculator for Executive Dashboard
 * Aggregates and calculates high-level metrics from project data
 */

import type { Project, Vulnerability } from '@@/types'
import { aggregateProjectStats } from '@/lib/stats/projectAggregates'

export interface ExecutiveMetrics {
  overall: OverallMetrics
  byProject: ProjectMetrics[]
  trends: TrendMetrics
  compliance: ComplianceMetrics
  productivity: ProductivityMetrics
  topCriticalVulnerabilities: TopVulnerabilityItem[]
}

/** A single CVE-level entry for the "Top critical vulnerabilities" widget (FR-06.2). */
export interface TopVulnerabilityItem {
  id: string
  severity: Vulnerability['severity']
  cvssScore?: number
  projectId: string
  projectName: string
  affectedComponentCount: number
}

export interface OverallMetrics {
  totalProjects: number
  totalComponents: number
  totalVulnerabilities: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  averageHealthScore: number
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'excellent'
  vulnerableComponentPercentage: number
  /** Count of vulnerabilities in the CISA KEV catalog (isKev) — actively exploited. */
  exploitedCount: number
}

export interface ProjectMetrics {
  projectId: string
  projectName: string
  healthScore: number
  vulnerabilityCount: number
  criticalCount: number
  highCount: number
  mediumCount: number
  lowCount: number
  componentCount: number
  vulnerableComponents: number
  fixableCount: number
  lastScanDate?: Date
  riskScore: number // 0-100
}

export interface TrendMetrics {
  vulnerabilityTrend: 'increasing' | 'decreasing' | 'stable'
  healthTrend: 'improving' | 'degrading' | 'stable'
  scanFrequency: number // scans per week
  averageResolutionTime: number // days
  periods: TrendPeriod[]
}

export interface TrendPeriod {
  period: string // e.g., "2024-W01"
  vulnerabilityCount: number
  criticalCount: number
  healthScore: number
  scansCompleted: number
}

export interface ComplianceMetrics {
  slaCompliance: {
    slaCritical: number // % of critical vulns resolved within SLA
    slaHigh: number // % of high vulns resolved within SLA
    slaOverall: number
  }
  scanCoverage: number // % of projects scanned in last 30 days
  dataFreshness: number // % of projects with data refreshed in last 7 days
  remediationRate: number // % of vulnerabilities with available patches applied
}

export interface ProductivityMetrics {
  totalScans: number
  sbomsProcessed: number
  componentsAnalyzed: number
  vulnerabilitiesAssessed: number
  averageScanTime: number // minutes
  scansThisWeek: number
  scansThisMonth: number
}

/**
 * Calculate overall metrics from all projects
 */
export function calculateOverallMetrics(projects: Project[]): OverallMetrics {
  // Shared roll-up so the Dashboard stat row and these metrics never drift.
  const {
    totalProjects,
    totalComponents,
    totalVulnerabilities,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    vulnerableComponents,
  } = aggregateProjectStats(projects)

  const vulnerableComponentPercentage = totalComponents > 0 ? (vulnerableComponents / totalComponents) * 100 : 0

  // Calculate weighted health score
  let totalHealthScore = 0
  let projectsWithHealth = 0
  for (const project of projects) {
    const healthScore = calculateProjectHealthScore(project)
    if (healthScore !== null) {
      totalHealthScore += healthScore
      projectsWithHealth++
    }
  }
  const averageHealthScore = projectsWithHealth > 0 ? totalHealthScore / projectsWithHealth : 100

  // Count actively-exploited vulnerabilities (present in the CISA KEV catalog),
  // independent of severity — a KEV medium is still exploited-in-the-wild.
  let exploitedCount = 0
  for (const project of projects) {
    for (const vuln of project.vulnerabilities) {
      if (vuln.isKev) exploitedCount++
    }
  }

  // Determine risk level based on multiple factors
  const riskLevel = calculateRiskLevel({
    criticalCount,
    highCount,
    mediumCount,
    averageHealthScore,
    vulnerableComponentPercentage,
  })

  return {
    totalProjects,
    totalComponents,
    totalVulnerabilities,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    averageHealthScore: Math.round(averageHealthScore),
    riskLevel,
    vulnerableComponentPercentage: Math.round(vulnerableComponentPercentage),
    exploitedCount,
  }
}

/**
 * Calculate metrics for each project
 */
export function calculateProjectMetrics(projects: Project[]): ProjectMetrics[] {
  return projects
    .map((project) => {
      const healthScore = calculateProjectHealthScore(project) ?? 100
      const riskScore = calculateProjectRiskScore(project)

      return {
        projectId: project.id,
        projectName: project.name,
        healthScore: Math.round(healthScore),
        vulnerabilityCount: project.statistics.totalVulnerabilities,
        criticalCount: project.statistics.criticalCount,
        highCount: project.statistics.highCount,
        mediumCount: project.statistics.mediumCount,
        lowCount: project.statistics.lowCount,
        componentCount: project.statistics.totalComponents,
        vulnerableComponents: project.statistics.vulnerableComponents,
        fixableCount: project.statistics.fixableCount ?? 0,
        lastScanDate: project.lastScanAt,
        riskScore: Math.round(riskScore),
      }
    })
    .sort((a, b) => b.riskScore - a.riskScore) // Sort by risk score (highest first)
}

/**
 * Calculate trend metrics over time
 */
export function calculateTrendMetrics(projects: Project[]): TrendMetrics {
  const now = new Date()
  const periods: TrendPeriod[] = []
  const weeksToInclude = 26 // Show last 26 weeks (~6 months) per FR-06.2

  // Generate weekly periods
  for (let i = weeksToInclude - 1; i >= 0; i--) {
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - i * 7 - now.getDay())
    weekStart.setHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const periodLabel = `${weekStart.getFullYear()}-W${getWeekNumber(weekStart)}`

    // Count scans completed in this period
    const scansCompleted = projects.filter((p) => {
      if (!p.lastScanAt) return false
      const scanDate = new Date(p.lastScanAt)
      return scanDate >= weekStart && scanDate < weekEnd
    }).length

    // Calculate vulnerability count for this period
    // (using current count as historical data isn't stored)
    const periodProjects = projects.filter((p) => {
      if (!p.updatedAt) return false
      const updateDate = new Date(p.updatedAt)
      return updateDate >= weekStart && updateDate < weekEnd
    })

    const vulnerabilityCount = periodProjects.reduce((sum, p) => sum + p.statistics.totalVulnerabilities, 0)
    const criticalCount = periodProjects.reduce((sum, p) => sum + p.statistics.criticalCount, 0)

    // Calculate average health score for this period
    const healthScores = periodProjects
      .map((p) => calculateProjectHealthScore(p))
      .filter((score): score is number => score !== null)

    const healthScore =
      healthScores.length > 0 ? healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length : 100

    if (scansCompleted > 0 || periodProjects.length > 0) {
      periods.push({
        period: periodLabel,
        vulnerabilityCount,
        criticalCount,
        healthScore: Math.round(healthScore),
        scansCompleted,
      })
    }
  }

  // Determine trends
  const recentPeriods = periods.slice(-4) // Last 4 weeks
  const olderPeriods = periods.slice(-8, -4) // Previous 4 weeks

  let vulnerabilityTrend: 'increasing' | 'decreasing' | 'stable' = 'stable'
  if (recentPeriods.length > 0 && olderPeriods.length > 0) {
    const recentAvg = recentPeriods.reduce((sum, p) => sum + p.vulnerabilityCount, 0) / recentPeriods.length
    const olderAvg = olderPeriods.reduce((sum, p) => sum + p.vulnerabilityCount, 0) / olderPeriods.length

    if (recentAvg > olderAvg * 1.1) vulnerabilityTrend = 'increasing'
    else if (recentAvg < olderAvg * 0.9) vulnerabilityTrend = 'decreasing'
  }

  let healthTrend: 'improving' | 'degrading' | 'stable' = 'stable'
  if (recentPeriods.length > 0 && olderPeriods.length > 0) {
    const recentHealth = recentPeriods.reduce((sum, p) => sum + p.healthScore, 0) / recentPeriods.length
    const olderHealth = olderPeriods.reduce((sum, p) => sum + p.healthScore, 0) / olderPeriods.length

    if (recentHealth > olderHealth + 5) healthTrend = 'improving'
    else if (recentHealth < olderHealth - 5) healthTrend = 'degrading'
  }

  // Calculate scan frequency
  const scansThisWeek = projects.filter((p) => {
    if (!p.lastScanAt) return false
    const daysSinceScan = (now.getTime() - new Date(p.lastScanAt).getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceScan <= 7
  }).length

  const scanFrequency = scansThisWeek

  return {
    vulnerabilityTrend,
    healthTrend,
    scanFrequency,
    averageResolutionTime: 0, // Would need historical data
    periods,
  }
}

/**
 * Calculate compliance metrics
 */
export function calculateComplianceMetrics(projects: Project[]): ComplianceMetrics {
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // SLA compliance (simplified - assumes 30 day SLA for critical, 60 for high)
  const totalCritical = projects.reduce((sum, p) => sum + p.statistics.criticalCount, 0)
  const totalHigh = projects.reduce((sum, p) => sum + p.statistics.highCount, 0)

  // Calculate based on vulnerability age (published date)
  let oldCritical = 0
  let oldHigh = 0

  for (const project of projects) {
    for (const vuln of project.vulnerabilities) {
      if (!vuln.publishedAt) continue
      const vulnAge = (now.getTime() - new Date(vuln.publishedAt).getTime()) / (1000 * 60 * 60 * 24)

      if (vuln.severity === 'critical' && vulnAge > 30) oldCritical++
      if (vuln.severity === 'high' && vulnAge > 60) oldHigh++
    }
  }

  const slaCritical = totalCritical > 0 ? ((totalCritical - oldCritical) / totalCritical) * 100 : 100
  const slaHigh = totalHigh > 0 ? ((totalHigh - oldHigh) / totalHigh) * 100 : 100
  const slaOverall = slaCritical * 0.6 + slaHigh * 0.4 // Weighted average

  // Scan coverage
  const projectsScanned = projects.filter((p) => p.lastScanAt && p.lastScanAt >= thirtyDaysAgo).length
  const scanCoverage = projects.length > 0 ? (projectsScanned / projects.length) * 100 : 100

  // Data freshness
  const projectsFresh = projects.filter((p) => p.lastVulnDataRefresh && p.lastVulnDataRefresh >= sevenDaysAgo).length
  const dataFreshness = projects.length > 0 ? (projectsFresh / projects.length) * 100 : 100

  // Remediation rate: percentage of ALL vulnerabilities that are fixable (a patch
  // is available). The PRD asks for "% of all vulns fixable", so the denominator is
  // every vulnerability, not only those that happen to carry patch metadata.
  let totalVulnerabilitiesCounted = 0
  let totalFixable = 0

  for (const project of projects) {
    for (const vuln of project.vulnerabilities) {
      totalVulnerabilitiesCounted++
      if (vuln.patchInfo?.patchAvailability === 'available') {
        totalFixable++
      }
    }
  }

  const remediationRate = totalVulnerabilitiesCounted > 0 ? (totalFixable / totalVulnerabilitiesCounted) * 100 : 100

  return {
    slaCompliance: {
      slaCritical: Math.round(slaCritical),
      slaHigh: Math.round(slaHigh),
      slaOverall: Math.round(slaOverall),
    },
    scanCoverage: Math.round(scanCoverage),
    dataFreshness: Math.round(dataFreshness),
    remediationRate: Math.round(remediationRate),
  }
}

/**
 * Calculate productivity metrics
 */
export function calculateProductivityMetrics(projects: Project[]): ProductivityMetrics {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const totalScans = projects.filter((p) => p.lastScanAt).length
  const sbomsProcessed = projects.reduce((sum, p) => sum + p.sbomFiles.length, 0)
  const componentsAnalyzed = projects.reduce((sum, p) => sum + p.statistics.totalComponents, 0)
  const vulnerabilitiesAssessed = projects.reduce((sum, p) => sum + p.statistics.totalVulnerabilities, 0)

  const scansThisWeek = projects.filter((p) => p.lastScanAt && p.lastScanAt >= weekAgo).length
  const scansThisMonth = projects.filter((p) => p.lastScanAt && p.lastScanAt >= monthAgo).length

  // Average scan time would need to be tracked during scanning
  // For now, estimate based on component count
  const averageScanTime =
    componentsAnalyzed > 0
      ? (componentsAnalyzed * 0.5) / 60 // Estimate 0.5 seconds per component
      : 0

  return {
    totalScans,
    sbomsProcessed,
    componentsAnalyzed,
    vulnerabilitiesAssessed,
    averageScanTime: Math.round(averageScanTime),
    scansThisWeek,
    scansThisMonth,
  }
}

/**
 * Calculate all executive metrics
 */
export function calculateExecutiveMetrics(projects: Project[]): ExecutiveMetrics {
  return {
    overall: calculateOverallMetrics(projects),
    byProject: calculateProjectMetrics(projects),
    trends: calculateTrendMetrics(projects),
    compliance: calculateComplianceMetrics(projects),
    productivity: calculateProductivityMetrics(projects),
    topCriticalVulnerabilities: calculateTopCriticalVulnerabilities(projects),
  }
}

/**
 * The most severe individual CVEs across all projects (FR-06.2).
 *
 * Flattens every project's critical-severity vulnerabilities, deduplicates by CVE
 * id (a CVE can affect multiple projects — the highest-CVSS occurrence is kept),
 * sorts by CVSS descending (unscored entries last), and caps at `limit`.
 */
export function calculateTopCriticalVulnerabilities(projects: Project[], limit = 10): TopVulnerabilityItem[] {
  const byId = new Map<string, TopVulnerabilityItem>()

  for (const project of projects) {
    for (const vuln of project.vulnerabilities) {
      if (vuln.severity !== 'critical') continue

      const candidate: TopVulnerabilityItem = {
        id: vuln.id,
        severity: vuln.severity,
        cvssScore: vuln.cvssScore,
        projectId: project.id,
        projectName: project.name,
        affectedComponentCount: vuln.affectedComponents?.length ?? 0,
      }

      const existing = byId.get(vuln.id)
      if (!existing || (candidate.cvssScore ?? 0) > (existing.cvssScore ?? 0)) {
        byId.set(vuln.id, candidate)
      }
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => (b.cvssScore ?? -1) - (a.cvssScore ?? -1))
    .slice(0, limit)
}

/**
 * Helper: Calculate project health score
 */
function calculateProjectHealthScore(project: Project): number | null {
  if (project.statistics.totalComponents === 0) return null

  // Base score starts at 100
  let score = 100

  // Deduct for vulnerabilities
  const vulnRatio = project.statistics.totalVulnerabilities / project.statistics.totalComponents
  score -= vulnRatio * 10

  // Extra penalty for critical vulnerabilities
  score -= project.statistics.criticalCount * 5
  score -= project.statistics.highCount * 2

  // Bonus for good patch coverage
  if (project.statistics.fixableCount !== undefined) {
    const patchRatio = project.statistics.fixableCount / Math.max(1, project.statistics.totalVulnerabilities)
    score += patchRatio * 5
  }

  return Math.max(0, Math.min(100, score))
}

/**
 * Helper: Calculate project risk score (0-100, higher is riskier)
 */
function calculateProjectRiskScore(project: Project): number {
  let riskScore = 0

  // Vulnerability score (0-50)
  const vulnRatio =
    project.statistics.totalComponents > 0
      ? project.statistics.totalVulnerabilities / project.statistics.totalComponents
      : 0
  riskScore += Math.min(50, vulnRatio * 25)

  // Severity penalties (0-30)
  riskScore += project.statistics.criticalCount * 10
  riskScore += project.statistics.highCount * 5
  riskScore += Math.min(30, project.statistics.mediumCount * 1)

  // Staleness penalty (0-20)
  if (project.lastScanAt) {
    const daysSinceScan = (Date.now() - new Date(project.lastScanAt).getTime()) / (1000 * 60 * 60 * 24)
    riskScore += Math.min(20, daysSinceScan * 0.5)
  } else {
    riskScore += 20 // Never scanned
  }

  return Math.min(100, Math.max(0, riskScore))
}

/**
 * Helper: Calculate risk level from metrics
 */
function calculateRiskLevel(metrics: {
  criticalCount: number
  highCount: number
  mediumCount: number
  averageHealthScore: number
  vulnerableComponentPercentage: number
}): 'critical' | 'high' | 'medium' | 'low' | 'excellent' {
  if (metrics.criticalCount > 0 || metrics.averageHealthScore < 40) return 'critical'
  if (metrics.highCount > 5 || metrics.averageHealthScore < 60) return 'high'
  if (metrics.mediumCount > 10 || metrics.vulnerableComponentPercentage > 30) return 'medium'
  if (metrics.vulnerableComponentPercentage > 10) return 'low'
  return 'excellent'
}

/**
 * Helper: Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
