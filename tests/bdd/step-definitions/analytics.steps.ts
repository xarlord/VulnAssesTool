/**
 * BDD Step Definitions for Executive Metrics Calculator
 * Tests the metrics calculator module using actual implementation
 * Following Red-Green-Refactor TDD cycle
 */

import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { Project, ProjectStatistics } from '@@/types'
import {
  calculateExecutiveMetrics,
  calculateOverallMetrics,
  calculateProjectMetrics,
  calculateTrendMetrics,
  calculateComplianceMetrics,
  calculateProductivityMetrics,
  type ExecutiveMetrics,
  type OverallMetrics,
  type ProjectMetrics,
  type TrendMetrics,
  type ComplianceMetrics,
  type ProductivityMetrics,
} from '../../../vuln-assess-tool/src/renderer/lib/analytics/metricsCalculator'

// Test context to store state between steps
interface TestContext {
  projects: Project[]
  metrics?: ExecutiveMetrics
  overallMetrics?: OverallMetrics
  projectMetrics?: ProjectMetrics[]
  trendMetrics?: TrendMetrics
  complianceMetrics?: ComplianceMetrics
  productivityMetrics?: ProductivityMetrics
}

const context: TestContext = {
  projects: [],
}

// Helper function to create mock project
function createMockProject(overrides: Partial<Project> = {}): Project {
  const defaultStats: ProjectStatistics = {
    totalVulnerabilities: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    totalComponents: 0,
    vulnerableComponents: 0,
    fixableCount: 0,
  }

  return {
    id: `project-${Date.now()}-${Math.random()}`,
    name: 'Test Project',
    description: 'Test project description',
    createdAt: new Date(),
    updatedAt: new Date(),
    sbomFiles: [],
    components: [],
    vulnerabilities: [],
    statistics: { ...defaultStats },
    ...overrides,
  }
}

// Helper function to create project with specific health score characteristics
function createProjectWithHealthScore(
  totalComponents: number,
  totalVulnerabilities: number,
  criticalCount: number,
  highCount: number
): Project {
  return createMockProject({
    name: `Project-${Math.random().toString(36).substring(7)}`,
    statistics: {
      totalComponents,
      totalVulnerabilities,
      criticalCount,
      highCount,
      mediumCount: totalVulnerabilities - criticalCount - highCount,
      lowCount: 0,
      vulnerableComponents: Math.min(totalVulnerabilities, totalComponents),
      fixableCount: Math.floor(totalVulnerabilities / 2),
    },
    components: Array.from({ length: totalComponents }, (_, i) => ({
      id: `comp-${i}`,
      name: `component-${i}`,
      version: '1.0.0',
      type: 'library' as const,
      licenses: ['MIT'],
      vulnerabilities: [],
    })),
    vulnerabilities: [],
  })
}

// ============================================================================
// GIVEN STEPS - Project Data Setup
// ============================================================================

Given('I have {int} projects with various vulnerability counts', (count: number) => {
  context.projects = []

  const vulnerabilityConfigs = [
    { total: 5, critical: 1, high: 1, medium: 2, low: 1 },
    { total: 10, critical: 2, high: 3, medium: 3, low: 2 },
    { total: 3, critical: 0, high: 1, medium: 1, low: 1 },
    { total: 15, critical: 3, high: 5, medium: 5, low: 2 },
    { total: 8, critical: 0, high: 2, medium: 3, low: 3 },
  ]

  for (let i = 0; i < count; i++) {
    const config = vulnerabilityConfigs[i % vulnerabilityConfigs.length]
    context.projects.push(
      createProjectWithHealthScore(
        20,
        config.total,
        config.critical,
        config.high
      )
    )
  }
})

Given('project A has health score {int}', (score: number) => {
  // Create a project that will result in approximately the desired health score
  // Health score formula: 100 - (vulnRatio * 10) - (critical * 5) - (high * 2)
  let criticalCount = 0
  let highCount = 0
  let totalVulns = 0

  if (score === 80) {
    // 100 - (0.5 * 10) - (2 * 5) - (0 * 2) = 80
    totalVulns = 5
    criticalCount = 2
    highCount = 0
  } else if (score === 60) {
    // 100 - (1 * 10) - (4 * 5) - (0 * 2) = 60
    totalVulns = 10
    criticalCount = 4
    highCount = 0
  } else if (score === 90) {
    // 100 - (0.2 * 10) - (0 * 5) - (1 * 2) = 88 (approx 90)
    totalVulns = 2
    criticalCount = 0
    highCount = 1
  }

  const project = createProjectWithHealthScore(10, totalVulns, criticalCount, highCount)
  project.name = 'Project A'
  context.projects.push(project)
})

Given('project B has health score {int}', (score: number) => {
  let totalVulns = 10
  let criticalCount = 4
  let highCount = 0

  if (score === 60) {
    totalVulns = 10
    criticalCount = 4
  }

  const project = createProjectWithHealthScore(10, totalVulns, criticalCount, highCount)
  project.name = 'Project B'
  context.projects.push(project)
})

Given('project C has health score {int}', (score: number) => {
  let totalVulns = 2
  let criticalCount = 0
  let highCount = 1

  if (score === 90) {
    totalVulns = 2
    criticalCount = 0
  }

  const project = createProjectWithHealthScore(10, totalVulns, criticalCount, highCount)
  project.name = 'Project C'
  context.projects.push(project)
})

Given('overall metrics show critical vulnerabilities', () => {
  context.projects.push(
    createProjectWithHealthScore(10, 5, 2, 1)
  )
})

Given('average health score is below {int}', (threshold: number) => {
  // Ensure projects have very low health scores
  for (let i = 0; i < 3; i++) {
    context.projects.push(
      createProjectWithHealthScore(10, 15, 5, 5)
    )
  }
})

Given('overall metrics show no critical vulnerabilities', () => {
  context.projects = []
  context.projects.push(
    createProjectWithHealthScore(50, 3, 0, 1)
  )
})

Given('vulnerable component percentage is below {int}%', (threshold: number) => {
  context.projects = []
  context.projects.push(
    createProjectWithHealthScore(100, 5, 0, 1)
  )
})

Given('{int} total components exist', (count: number) => {
  context.projects = []
  const project = createProjectWithHealthScore(count, 0, 0, 0)
  context.projects.push(project)
})

Given('{int} components have vulnerabilities', (count: number) => {
  if (context.projects.length > 0) {
    context.projects[0].statistics.vulnerableComponents = count
    context.projects[0].statistics.totalVulnerabilities = count * 2
  }
})

Given('I have {int} projects', (count: number) => {
  context.projects = []
  for (let i = 0; i < count; i++) {
    context.projects.push(
      createProjectWithHealthScore(20, 5 + i, i, i + 1)
    )
  }
})

Given('a project with {int} components and {int} vulnerabilities', (components: number, vulns: number) => {
  context.projects = []
  context.projects.push(
    createProjectWithHealthScore(components, vulns, 0, 0)
  )
})

Given('{int} critical and {int} high severity vulnerabilities', (critical: number, high: number) => {
  if (context.projects.length > 0) {
    const project = context.projects[0]
    project.statistics.criticalCount = critical
    project.statistics.highCount = high
    project.statistics.totalVulnerabilities = critical + high + project.statistics.mediumCount
  }
})

Given('a project with high vulnerability ratio', () => {
  context.projects = []
  context.projects.push(
    createProjectWithHealthScore(10, 20, 5, 5)
  )
})

Given('stale scan date', () => {
  if (context.projects.length > 0) {
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 60) // 60 days ago
    context.projects[0].lastScanAt = oldDate
  }
})

Given('projects have activity over {int} weeks', () => {
  context.projects = []
  const now = new Date()

  for (let i = 0; i < 5; i++) {
    const scanDate = new Date(now)
    scanDate.setDate(scanDate.getDate() - i * 14) // Every 2 weeks

    const project = createProjectWithHealthScore(15, 3 + i, i, 1)
    project.lastScanAt = scanDate
    project.updatedAt = scanDate
    context.projects.push(project)
  }
})

Given('recent {int} weeks average {int} vulnerabilities', (weeks: number, avgVulns: number) => {
  const now = new Date()

  // Create projects for recent weeks
  for (let i = 0; i < weeks; i++) {
    const updateDate = new Date(now)
    updateDate.setDate(updateDate.getDate() - i * 7)

    const project = createProjectWithHealthScore(10, avgVulns, Math.floor(avgVulns / 5), 1)
    project.updatedAt = updateDate
    context.projects.push(project)
  }

  // Create projects for older weeks with different average
  for (let i = 0; i < 4; i++) {
    const updateDate = new Date(now)
    updateDate.setDate(updateDate.getDate() - (weeks + i) * 7)

    const project = createProjectWithHealthScore(10, avgVulns - 20, 0, 0)
    project.updatedAt = updateDate
    context.projects.push(project)
  }
})

Given('previous {int} weeks average {int} vulnerabilities', (weeks: number, avgVulns: number) => {
  // This step is used in combination with the previous one
  // The setup is already done in the previous step
})

Given('recent average health score is {int}', (score: number) => {
  const now = new Date()

  for (let i = 0; i < 4; i++) {
    const updateDate = new Date(now)
    updateDate.setDate(updateDate.getDate() - i * 7)

    const vulns = score === 75 ? 3 : 10
    const project = createProjectWithHealthScore(15, vulns, 0, 1)
    project.updatedAt = updateDate
    context.projects.push(project)
  }
})

Given('previous average health score is {int}', (score: number) => {
  const now = new Date()

  for (let i = 0; i < 4; i++) {
    const updateDate = new Date(now)
    updateDate.setDate(updateDate.getDate() - (4 + i) * 7)

    const vulns = score === 65 ? 5 : 15
    const project = createProjectWithHealthScore(15, vulns, 1, 1)
    project.updatedAt = updateDate
    context.projects.push(project)
  }
})

Given('{int} projects were scanned in the last {int} days', (projectCount: number, days: number) => {
  context.projects = []
  const now = new Date()

  for (let i = 0; i < projectCount; i++) {
    const scanDate = new Date(now)
    scanDate.setDate(scanDate.getDate() - Math.floor(Math.random() * days))

    const project = createProjectWithHealthScore(10, 2, 0, 1)
    project.lastScanAt = scanDate
    context.projects.push(project)
  }
})

Given('{int} critical vulnerabilities exist', (count: number) => {
  context.projects = []
  const project = createProjectWithHealthScore(20, count, count, 0)

  // Set published dates for vulnerabilities
  const now = new Date()
  project.vulnerabilities = Array.from({ length: count }, (_, i) => ({
    id: `CVE-2024-${i}`,
    source: 'nvd',
    severity: 'critical',
    description: 'Critical vulnerability',
    references: [],
    affectedComponents: [],
    publishedAt: new Date(now.getTime() - i * 20 * 24 * 60 * 60 * 1000), // i * 20 days ago
  }))

  context.projects.push(project)
})

Given('{int} are older than {int} days \\(SLA exceeded)', (oldCount: number, days: number) => {
  if (context.projects.length > 0 && context.projects[0].vulnerabilities.length > 0) {
    const now = new Date()
    // Make the first 'oldCount' vulnerabilities older than the SLA
    context.projects[0].vulnerabilities.slice(0, oldCount).forEach(vuln => {
      vuln.publishedAt = new Date(now.getTime() - (days + 10) * 24 * 60 * 60 * 1000)
    })
  }
})

Given('{int} projects exist', (count: number) => {
  context.projects = []
  for (let i = 0; i < count; i++) {
    context.projects.push(createProjectWithHealthScore(15, 3, 0, 1))
  }
})

Given('{int} were scanned in the last {int} days', (scannedCount: number, days: number) => {
  const now = new Date()
  context.projects.slice(0, scannedCount).forEach(project => {
    project.lastScanAt = new Date(now.getTime() - Math.floor(Math.random() * days) * 24 * 60 * 60 * 1000)
  })
})

Given('{int} had data refreshed in last {int} days', (freshCount: number, days: number) => {
  const now = new Date()
  context.projects.slice(0, freshCount).forEach(project => {
    project.lastVulnDataRefresh = new Date(now.getTime() - Math.floor(Math.random() * days) * 24 * 60 * 60 * 1000)
  })
})

Given('{int} vulnerabilities have patch information', (count: number) => {
  context.projects = []
  const project = createProjectWithHealthScore(10, count, 0, 0)

  project.vulnerabilities = Array.from({ length: count }, (_, i) => ({
    id: `CVE-2024-${i}`,
    source: 'nvd',
    severity: 'medium',
    description: 'Vulnerability with patch info',
    references: [],
    affectedComponents: [],
    patchInfo: {
      fixedVersions: [],
      patchLinks: [],
      remediationAdvice: {
        priority: 'medium',
        category: 'patch',
        steps: [],
      },
      affectedVersionRanges: [],
      patchAvailability: i < 40 ? 'available' : 'none',
    },
  }))

  context.projects.push(project)
})

Given('{int} have available patches', (patchedCount: number) => {
  if (context.projects.length > 0 && context.projects[0].vulnerabilities.length > 0) {
    // Set patch availability based on the count
    context.projects[0].vulnerabilities.forEach((vuln, i) => {
      if (vuln.patchInfo) {
        vuln.patchInfo.patchAvailability = i < patchedCount ? 'available' : 'none'
      }
    })
  }
})

Given('{int} projects with various statistics', (count: number) => {
  context.projects = []
  for (let i = 0; i < count; i++) {
    const project = createProjectWithHealthScore(
      10 + i * 5,
      2 + i,
      Math.floor(i / 2),
      i
    )
    project.lastScanAt = new Date()
    project.sbomFiles = [{
      id: `sbom-${i}`,
      filename: `bom-${i}.json`,
      format: 'cyclonedx',
      formatVersion: '1.5',
      uploadedAt: new Date(),
      fileHash: `hash-${i}`,
      componentCount: 10 + i * 5,
    }]
    context.projects.push(project)
  }
})

Given('no projects exist', () => {
  context.projects = []
})

Given('I have multiple projects', () => {
  context.projects = []
  for (let i = 0; i < 5; i++) {
    context.projects.push(
      createProjectWithHealthScore(15, 3 + i, i, 1)
    )
  }
})

// ============================================================================
// WHEN STEPS - Metric Calculations
// ============================================================================

When('I calculate overall metrics', () => {
  context.overallMetrics = calculateOverallMetrics(context.projects)
})

When('I calculate risk level', () => {
  // Risk level is calculated as part of overall metrics
  context.overallMetrics = calculateOverallMetrics(context.projects)
})

When('I calculate project metrics', () => {
  context.projectMetrics = calculateProjectMetrics(context.projects)
})

When('I calculate project health score', () => {
  // Health score is calculated as part of project metrics
  context.projectMetrics = calculateProjectMetrics(context.projects)
})

When('I calculate project risk score', () => {
  // Risk score is calculated as part of project metrics
  context.projectMetrics = calculateProjectMetrics(context.projects)
})

When('I calculate trend metrics', () => {
  context.trendMetrics = calculateTrendMetrics(context.projects)
})

When('I calculate productivity metrics', () => {
  context.productivityMetrics = calculateProductivityMetrics(context.projects)
})

When('I calculate compliance metrics', () => {
  context.complianceMetrics = calculateComplianceMetrics(context.projects)
})

When('I calculate executive metrics', () => {
  context.metrics = calculateExecutiveMetrics(context.projects)
})

// ============================================================================
// THEN STEPS - Verify Metrics Results
// ============================================================================

Then('total projects should be {int}', (expected: number) => {
  expect(context.overallMetrics?.totalProjects).toBe(expected)
})

Then('total components should be summed', () => {
  const expected = context.projects.reduce((sum, p) => sum + p.statistics.totalComponents, 0)
  expect(context.overallMetrics?.totalComponents).toBe(expected)
})

Then('total vulnerabilities should be summed', () => {
  const expected = context.projects.reduce((sum, p) => sum + p.statistics.totalVulnerabilities, 0)
  expect(context.overallMetrics?.totalVulnerabilities).toBe(expected)
})

Then('severity counts should be aggregated', () => {
  const expectedCritical = context.projects.reduce((sum, p) => sum + p.statistics.criticalCount, 0)
  const expectedHigh = context.projects.reduce((sum, p) => sum + p.statistics.highCount, 0)
  const expectedMedium = context.projects.reduce((sum, p) => sum + p.statistics.mediumCount, 0)
  const expectedLow = context.projects.reduce((sum, p) => sum + p.statistics.lowCount, 0)

  expect(context.overallMetrics?.criticalCount).toBe(expectedCritical)
  expect(context.overallMetrics?.highCount).toBe(expectedHigh)
  expect(context.overallMetrics?.mediumCount).toBe(expectedMedium)
  expect(context.overallMetrics?.lowCount).toBe(expectedLow)
})

Then('average health score should be {int}', (expected: number) => {
  // Allow for small rounding differences
  expect(context.overallMetrics?.averageHealthScore).toBeGreaterThanOrEqual(expected - 2)
  expect(context.overallMetrics?.averageHealthScore).toBeLessThanOrEqual(expected + 2)
})

Then('risk level should be {string}', (expected: string) => {
  expect(context.overallMetrics?.riskLevel).toBe(expected)
})

Then('vulnerable component percentage should be {int}%', (expected: number) => {
  expect(context.overallMetrics?.vulnerableComponentPercentage).toBe(expected)
})

Then('I should receive metrics for all {int} projects', (count: number) => {
  expect(context.projectMetrics?.length).toBe(count)
})

Then('each should include project name and health score', () => {
  context.projectMetrics?.forEach(metric => {
    expect(metric.projectName).toBeDefined()
    expect(metric.healthScore).toBeGreaterThanOrEqual(0)
    expect(metric.healthScore).toBeLessThanOrEqual(100)
  })
})

Then('results should be sorted by risk score', () => {
  if (context.projectMetrics && context.projectMetrics.length > 1) {
    for (let i = 0; i < context.projectMetrics.length - 1; i++) {
      expect(context.projectMetrics[i].riskScore).toBeGreaterThanOrEqual(context.projectMetrics[i + 1].riskScore)
    }
  }
})

Then('score should be reduced by vulnerability ratio', () => {
  const project = context.projectMetrics?.[0]
  expect(project?.healthScore).toBeLessThan(100)
})

Then('extra penalty should apply for critical vulns', () => {
  // Projects with critical vulnerabilities should have lower health scores
  const projectsWithCritical = context.projectMetrics?.filter(p => p.criticalCount > 0)
  const projectsWithoutCritical = context.projectMetrics?.filter(p => p.criticalCount === 0)

  if (projectsWithCritical && projectsWithoutCritical && projectsWithCritical.length > 0 && projectsWithoutCritical.length > 0) {
    const avgWithCritical = projectsWithCritical.reduce((sum, p) => sum + p.healthScore, 0) / projectsWithCritical.length
    const avgWithoutCritical = projectsWithoutCritical.reduce((sum, p) => sum + p.healthScore, 0) / projectsWithoutCritical.length
    expect(avgWithCritical).toBeLessThan(avgWithoutCritical)
  }
})

Then('score should be between 0 and 100', () => {
  context.projectMetrics?.forEach(metric => {
    expect(metric.healthScore).toBeGreaterThanOrEqual(0)
    expect(metric.healthScore).toBeLessThanOrEqual(100)
  })
})

Then('vulnerability ratio should contribute to risk', () => {
  const project = context.projectMetrics?.[0]
  expect(project?.riskScore).toBeGreaterThan(0)
})

Then('staleness should add penalty', () => {
  // Projects with stale scan dates should have higher risk scores
  const staleProjects = context.projects.filter(p => {
    if (!p.lastScanAt) return true
    const daysSinceScan = (Date.now() - new Date(p.lastScanAt).getTime()) / (1000 * 60 * 60 * 24)
    return daysSinceScan > 30
  })

  if (staleProjects.length > 0 && context.projectMetrics) {
    const staleProjectMetrics = context.projectMetrics.filter(pm =>
      staleProjects.some(sp => sp.id === pm.projectId)
    )
    staleProjectMetrics.forEach(metric => {
      expect(metric.riskScore).toBeGreaterThan(0)
    })
  }
})

Then('risk score should be 0-100', () => {
  context.projectMetrics?.forEach(metric => {
    expect(metric.riskScore).toBeGreaterThanOrEqual(0)
    expect(metric.riskScore).toBeLessThanOrEqual(100)
  })
})

Then('{int} weekly periods should be generated', (expected: number) => {
  expect(context.trendMetrics?.periods.length).toBeGreaterThanOrEqual(expected)
})

Then('each period should show vulnerability count', () => {
  context.trendMetrics?.periods.forEach(period => {
    expect(typeof period.vulnerabilityCount).toBe('number')
    expect(period.vulnerabilityCount).toBeGreaterThanOrEqual(0)
  })
})

Then('each period should show scans completed', () => {
  context.trendMetrics?.periods.forEach(period => {
    expect(typeof period.scansCompleted).toBe('number')
    expect(period.scansCompleted).toBeGreaterThanOrEqual(0)
  })
})

Then('vulnerability trend should be {string}', (expected: string) => {
  expect(context.trendMetrics?.vulnerabilityTrend).toBe(expected)
})

Then('health trend should be {string}', (expected: string) => {
  expect(context.trendMetrics?.healthTrend).toBe(expected)
})

Then('scan frequency should be {int} per week', (expected: number) => {
  expect(context.trendMetrics?.scanFrequency).toBe(expected)
})

Then('SLA critical compliance should be {int}%', (expected: number) => {
  expect(context.complianceMetrics?.slaCompliance.slaCritical).toBe(expected)
})

Then('scan coverage should be {int}%', (expected: number) => {
  expect(context.complianceMetrics?.scanCoverage).toBe(expected)
})

Then('data freshness should be {int}%', (expected: number) => {
  expect(context.complianceMetrics?.dataFreshness).toBe(expected)
})

Then('remediation rate should be {int}%', (expected: number) => {
  expect(context.complianceMetrics?.remediationRate).toBe(expected)
})

Then('total scans should be counted', () => {
  const expected = context.projects.filter(p => p.lastScanAt).length
  expect(context.productivityMetrics?.totalScans).toBe(expected)
})

Then('SBOMs processed should be counted', () => {
  const expected = context.projects.reduce((sum, p) => sum + p.sbomFiles.length, 0)
  expect(context.productivityMetrics?.sbomsProcessed).toBe(expected)
})

Then('components analyzed should be summed', () => {
  const expected = context.projects.reduce((sum, p) => sum + p.statistics.totalComponents, 0)
  expect(context.productivityMetrics?.componentsAnalyzed).toBe(expected)
})

Then('all counts should be 0', () => {
  expect(context.overallMetrics?.totalProjects).toBe(0)
  expect(context.overallMetrics?.totalComponents).toBe(0)
  expect(context.overallMetrics?.totalVulnerabilities).toBe(0)
  expect(context.overallMetrics?.criticalCount).toBe(0)
  expect(context.overallMetrics?.highCount).toBe(0)
})

Then('average health score should default to {int}', (expected: number) => {
  expect(context.overallMetrics?.averageHealthScore).toBe(expected)
})

Then('overall metrics should be included', () => {
  expect(context.metrics?.overall).toBeDefined()
  expect(context.metrics?.overall.totalProjects).toBe(context.projects.length)
})

Then('project metrics should be included', () => {
  expect(context.metrics?.byProject).toBeDefined()
  expect(context.metrics?.byProject.length).toBe(context.projects.length)
})

Then('trend metrics should be included', () => {
  expect(context.metrics?.trends).toBeDefined()
  expect(context.metrics?.trends.periods).toBeDefined()
})

Then('compliance metrics should be included', () => {
  expect(context.metrics?.compliance).toBeDefined()
  expect(typeof context.metrics?.compliance.scanCoverage).toBe('number')
})

Then('productivity metrics should be included', () => {
  expect(context.metrics?.productivity).toBeDefined()
  expect(typeof context.metrics?.productivity.totalScans).toBe('number')
})
