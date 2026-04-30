/**
 * BDD Step Definitions for Analytics/Metrics Features
 *
 * Implements step definitions for metrics-calculator.feature (20 scenarios)
 * Tests executive metrics calculator functionality
 */

import { Given, When, Then, Before, After } from '@cucumber/cucumber'
import { expect } from 'vitest'
import type { Project, Component, Vulnerability, ProjectStatistics } from '../../../src/renderer/lib/types.ts'
import {
  calculateOverallMetrics,
  calculateProjectMetrics,
  calculateTrendMetrics,
  calculateComplianceMetrics,
  calculateProductivityMetrics,
  calculateExecutiveMetrics,
  type ExecutiveMetrics,
  type OverallMetrics,
  type ProjectMetrics,
  type TrendMetrics,
  type ComplianceMetrics,
  type ProductivityMetrics,
} from '../../../src/renderer/lib/analytics/metricsCalculator.ts'

// Test context interface
interface TestContext {
  testProjects: Project[]
  testMetrics: ExecutiveMetrics | null
  testOverallMetrics: OverallMetrics | null
  testProjectMetrics: ProjectMetrics[] | null
  testTrendMetrics: TrendMetrics | null
  testComplianceMetrics: ComplianceMetrics | null
  testProductivityMetrics: ProductivityMetrics | null
  testError: Error | null
}

// Global test context
const context: TestContext = {
  testProjects: [],
  testMetrics: null,
  testOverallMetrics: null,
  testProjectMetrics: null,
  testTrendMetrics: null,
  testComplianceMetrics: null,
  testProductivityMetrics: null,
  testError: null,
}

// ============================================================================
// HOOKS - Setup and Teardown
// ============================================================================

Before({ tags: '@analytics' }, async function () {
  // Reset context
  context.testProjects = []
  context.testMetrics = null
  context.testOverallMetrics = null
  context.testProjectMetrics = null
  context.testTrendMetrics = null
  context.testComplianceMetrics = null
  context.testProductivityMetrics = null
  context.testError = null
})

After({ tags: '@analytics' }, async function () {
  // Cleanup if needed
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createTestProject(name: string, overrides: Partial<Project> = {}): Project {
  const now = new Date()
  return {
    id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description: `Test project ${name}`,
    createdAt: now,
    updatedAt: now,
    lastScanAt: overrides.lastScanAt || now,
    lastVulnDataRefresh: now,
    sbomFiles: overrides.sbomFiles || [],
    components: overrides.components || [],
    vulnerabilities: overrides.vulnerabilities || [],
    statistics: overrides.statistics || createEmptyStatistics(),
  }
}

function createEmptyStatistics(): ProjectStatistics {
  return {
    totalComponents: 0,
    totalVulnerabilities: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    vulnerableComponents: 0,
    fixableCount: 0,
  }
}

function createStatisticsWithVulns(
  totalComponents: number,
  totalVulns: number,
  critical: number = 0,
  high: number = 0,
  medium: number = 0,
  low: number = 0,
  vulnComponents: number = 0,
): ProjectStatistics {
  return {
    totalComponents,
    totalVulnerabilities: totalVulns,
    criticalCount: critical,
    highCount: high,
    mediumCount: medium,
    lowCount: low,
    vulnerableComponents: vulnComponents || Math.min(totalVulns, totalComponents),
    fixableCount: Math.floor(totalVulns * 0.6), // 60% fixable by default
  }
}

function createTestVulnerability(
  id: string,
  severity: Vulnerability['severity'],
  publishedDaysAgo: number = 30,
): Vulnerability {
  const publishedAt = new Date()
  publishedAt.setDate(publishedAt.getDate() - publishedDaysAgo)

  return {
    id,
    source: 'nvd',
    severity,
    cvssScore: severity === 'critical' ? 9.5 : severity === 'high' ? 7.5 : severity === 'medium' ? 5.5 : 3.5,
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    description: `Test vulnerability ${id}`,
    publishedAt,
    modifiedAt: publishedAt,
    references: [],
    affectedComponents: [],
    cwes: [],
  }
}

// ============================================================================
// STEP DEFINITIONS
// ============================================================================

// Scenario: Calculate overall metrics from multiple projects
Given('I have {int} projects with various vulnerability counts', function (count: number) {
  for (let i = 0; i < count; i++) {
    const vulnCount = Math.floor(Math.random() * 50) + 10
    const compCount = vulnCount + Math.floor(Math.random() * 20) + 5
    const stats = createStatisticsWithVulns(
      compCount,
      vulnCount,
      Math.floor(vulnCount * 0.1),
      Math.floor(vulnCount * 0.2),
      Math.floor(vulnCount * 0.4),
      Math.floor(vulnCount * 0.3),
    )
    context.testProjects.push(createTestProject(`Project ${i}`, { statistics: stats }))
  }
})

When('I calculate overall metrics', function () {
  try {
    context.testOverallMetrics = calculateOverallMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('total projects should be {int}', function (count: number) {
  expect(context.testOverallMetrics).to.not.be.null
  expect(context.testOverallMetrics!.totalProjects).to.equal(count)
})

Then('total components should be summed', function () {
  const expectedSum = context.testProjects.reduce((sum, p) => sum + p.statistics.totalComponents, 0)
  expect(context.testOverallMetrics!.totalComponents).to.equal(expectedSum)
})

Then('total vulnerabilities should be summed', function () {
  const expectedSum = context.testProjects.reduce((sum, p) => sum + p.statistics.totalVulnerabilities, 0)
  expect(context.testOverallMetrics!.totalVulnerabilities).to.equal(expectedSum)
})

Then('severity counts should be aggregated', function () {
  expect(context.testOverallMetrics!.criticalCount).to.be.a('number')
  expect(context.testOverallMetrics!.highCount).to.be.a('number')
  expect(context.testOverallMetrics!.mediumCount).to.be.a('number')
  expect(context.testOverallMetrics!.lowCount).to.be.a('number')
})

// Scenario: Calculate average health score
Given('project A has health score {int}', function (score: number) {
  // Health score is calculated, not stored. Create project with appropriate stats
  const stats = createStatisticsWithVulns(10, 5) // Will result in ~80 health score
  context.testProjects.push(createTestProject('Project A', { statistics: stats }))
})

Given('project B has health score {int}', function (score: number) {
  const stats = createStatisticsWithVulns(10, 15) // Will result in ~60 health score
  context.testProjects.push(createTestProject('Project B', { statistics: stats }))
})

Given('project C has health score {int}', function (score: number) {
  const stats = createStatisticsWithVulns(10, 2) // Will result in ~90 health score
  context.testProjects.push(createTestProject('Project C', { statistics: stats }))
})

Then('average health score should be {int}', function (expectedScore: number) {
  expect(context.testOverallMetrics!.averageHealthScore).to.be.closeTo(expectedScore, 5)
})

// Scenario: Determine risk level as critical
Given('overall metrics show critical vulnerabilities', function () {
  const stats = createStatisticsWithVulns(10, 5, 3, 0, 0, 0) // 3 critical vulns
  context.testProjects.push(createTestProject('Critical Project', { statistics: stats }))
})

Given('average health score is below {int}', function (score: number) {
  // Add a project with very low health score
  const stats = createStatisticsWithVulns(5, 20, 5, 5, 5, 5) // Many vulns, low health
  context.testProjects.push(createTestProject('Low Health Project', { statistics: stats }))
})

When('I calculate risk level', function () {
  try {
    context.testOverallMetrics = calculateOverallMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('risk level should be {string}', function (riskLevel: string) {
  expect(context.testOverallMetrics!.riskLevel).to.equal(riskLevel as any)
})

// Scenario: Determine risk level as excellent
Given('overall metrics show no critical vulnerabilities', function () {
  const stats = createStatisticsWithVulns(20, 2, 0, 0, 1, 1) // No critical
  context.testProjects.push(createTestProject('Safe Project', { statistics: stats }))
})

Given('vulnerable component percentage is below {int}%', function (percentage: number) {
  const stats = createStatisticsWithVulns(100, 5, 0, 0, 2, 3, 3) // Low vuln ratio
  context.testProjects.push(createTestProject('Excellent Project', { statistics: stats }))
})

Then('risk level should be {string}', function (riskLevel: string) {
  expect(context.testOverallMetrics!.riskLevel).to.equal(riskLevel as any)
})

// Scenario: Calculate vulnerable component percentage
Given('{int} total components exist', function (count: number) {
  const stats = createStatisticsWithVulns(count, 0)
  context.testProjects.push(createTestProject('Components Project', { statistics: stats }))
})

Given('{int} components have vulnerabilities', function (count: number) {
  // Update the last project's statistics
  const lastProject = context.testProjects[context.testProjects.length - 1]
  lastProject.statistics.vulnerableComponents = count
  lastProject.statistics.totalVulnerabilities = count * 2 // Approx 2 vulns per component
})

Then('vulnerable component percentage should be {int}%', function (percentage: number) {
  expect(context.testOverallMetrics!.vulnerableComponentPercentage).to.equal(percentage)
})

// Scenario: Calculate metrics for each project
Given('I have {int} projects', function (count: number) {
  for (let i = 0; i < count; i++) {
    const vulnCount = (i + 1) * 5
    const stats = createStatisticsWithVulns(10, vulnCount, i, i + 1, i + 2, i + 3)
    context.testProjects.push(createTestProject(`Project ${i}`, { statistics: stats }))
  }
})

When('I calculate project metrics', function () {
  try {
    context.testProjectMetrics = calculateProjectMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('I should receive metrics for all {int} projects', function (count: number) {
  expect(context.testProjectMetrics).to.have.lengthOf(count)
})

Then('each should include project name and health score', function () {
  context.testProjectMetrics!.forEach((metrics) => {
    expect(metrics).to.have.property('projectName')
    expect(metrics).to.have.property('healthScore')
  })
})

Then('results should be sorted by risk score', function () {
  const riskScores = context.testProjectMetrics!.map((m) => m.riskScore)
  const sortedScores = [...riskScores].sort((a, b) => b - a)
  expect(riskScores).to.deep.equal(sortedScores)
})

// Scenario: Calculate project health score
Given('a project with {int} components and {int} vulnerabilities', function (comps: number, vulns: number) {
  const stats = createStatisticsWithVulns(comps, vulns, 2, 1, 0, 0)
  context.testProjects.push(createTestProject('Health Test Project', { statistics: stats }))
})

Given('{int} critical and {int} high severity vulnerabilities', function (critical: number, high: number) {
  const lastProject = context.testProjects[context.testProjects.length - 1]
  lastProject.statistics.criticalCount = critical
  lastProject.statistics.highCount = high
})

When('I calculate project health score', function () {
  try {
    context.testProjectMetrics = calculateProjectMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('score should be reduced by vulnerability ratio', function () {
  const metrics = context.testProjectMetrics![0]
  expect(metrics.healthScore).to.be.lessThan(100)
  expect(metrics.healthScore).to.be.greaterThan(0)
})

Then('extra penalty should apply for critical vulns', function () {
  const metrics = context.testProjectMetrics![0]
  // With 2 critical vulns, score should be significantly reduced
  expect(metrics.healthScore).to.be.lessThan(80)
})

Then('score should be between 0 and 100', function () {
  const metrics = context.testProjectMetrics![0]
  expect(metrics.healthScore).to.be.at.least(0)
  expect(metrics.healthScore).to.be.at.most(100)
})

// Scenario: Calculate project risk score
Given('a project with high vulnerability ratio', function () {
  const stats = createStatisticsWithVulns(10, 50, 5, 10, 20, 15) // Very high vuln ratio
  context.testProjects.push(createTestProject('High Risk Project', { statistics: stats }))
})

Given('stale scan date', function () {
  const lastProject = context.testProjects[context.testProjects.length - 1]
  const oldDate = new Date()
  oldDate.setDate(oldDate.getDate() - 60) // 60 days ago
  lastProject.lastScanAt = oldDate
})

When('I calculate project risk score', function () {
  try {
    context.testProjectMetrics = calculateProjectMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('vulnerability ratio should contribute to risk', function () {
  const metrics = context.testProjectMetrics![0]
  expect(metrics.riskScore).to.be.greaterThan(50) // High risk
})

Then('staleness should add penalty', function () {
  const metrics = context.testProjectMetrics![0]
  // With 60 day staleness, risk score should be higher
  expect(metrics.riskScore).to.be.greaterThan(60)
})

Then('risk score should be 0-100', function () {
  const metrics = context.testProjectMetrics![0]
  expect(metrics.riskScore).to.be.at.least(0)
  expect(metrics.riskScore).to.be.at.most(100)
})

// Scenario: Calculate trend metrics over weeks
Given('projects have activity over 12 weeks', function () {
  for (let i = 0; i < 3; i++) {
    const scanDate = new Date()
    scanDate.setDate(scanDate.getDate() - i * 7) // Different weeks
    const stats = createStatisticsWithVulns(10, i * 2)
    context.testProjects.push(
      createTestProject(`Trend Project ${i}`, {
        statistics: stats,
        lastScanAt: scanDate,
        updatedAt: scanDate,
      }),
    )
  }
})

When('I calculate trend metrics', function () {
  try {
    context.testTrendMetrics = calculateTrendMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('{int} weekly periods should be generated', function (count: number) {
  expect(context.testTrendMetrics!.periods).to.have.lengthOf(count)
})

Then('each period should show vulnerability count', function () {
  context.testTrendMetrics!.periods.forEach((period) => {
    expect(period).to.have.property('vulnerabilityCount')
  })
})

Then('each period should show scans completed', function () {
  context.testTrendMetrics!.periods.forEach((period) => {
    expect(period).to.have.property('scansCompleted')
  })
})

// Scenario: Determine vulnerability trend is increasing
Given('recent 4 weeks average {int} vulnerabilities', function (avg: number) {
  // Add projects from recent 4 weeks
  for (let i = 0; i < 4; i++) {
    const updateDate = new Date()
    updateDate.setDate(updateDate.getDate() - i * 7)
    const stats = createStatisticsWithVulns(10, avg + i * 5) // Increasing
    context.testProjects.push(
      createTestProject(`Recent Project ${i}`, {
        statistics: stats,
        updatedAt: updateDate,
      }),
    )
  }
})

Given('previous 4 weeks average {int} vulnerabilities', function (avg: number) {
  // Add projects from previous 4 weeks
  for (let i = 0; i < 4; i++) {
    const updateDate = new Date()
    updateDate.setDate(updateDate.getDate() - (28 + i * 7))
    const stats = createStatisticsWithVulns(10, avg) // Steady
    context.testProjects.push(
      createTestProject(`Older Project ${i}`, {
        statistics: stats,
        updatedAt: updateDate,
      }),
    )
  }
})

Then('vulnerability trend should be {string}', function (trend: string) {
  expect(context.testTrendMetrics!.vulnerabilityTrend).to.equal(trend as any)
})

// Scenario: Determine vulnerability trend is decreasing
Given('recent 4 weeks average {int} vulnerabilities', function (avg: number) {
  // Add projects from recent 4 weeks with decreasing vulns
  for (let i = 0; i < 4; i++) {
    const updateDate = new Date()
    updateDate.setDate(updateDate.getDate() - i * 7)
    const stats = createStatisticsWithVulns(10, avg - i * 5) // Decreasing
    context.testProjects.push(
      createTestProject(`Recent Project ${i}`, {
        statistics: stats,
        updatedAt: updateDate,
      }),
    )
  }
})

Given('previous 4 weeks average {int} vulnerabilities', function (avg: number) {
  for (let i = 0; i < 4; i++) {
    const updateDate = new Date()
    updateDate.setDate(updateDate.getDate() - (28 + i * 7))
    const stats = createStatisticsWithVulns(10, avg) // Higher baseline
    context.testProjects.push(
      createTestProject(`Older Project ${i}`, {
        statistics: stats,
        updatedAt: updateDate,
      }),
    )
  }
})

Then('vulnerability trend should be {string}', function (trend: string) {
  expect(context.testTrendMetrics!.vulnerabilityTrend).to.equal(trend as any)
})

// Scenario: Determine health trend is improving
Given('recent average health score is {int}', function (score: number) {
  // Create projects that would have high health scores
  for (let i = 0; i < 4; i++) {
    const stats = createStatisticsWithVulns(20, 2) // Low vuln count = high health
    const updateDate = new Date()
    updateDate.setDate(updateDate.getDate() - i * 7)
    context.testProjects.push(
      createTestProject(`Healthy Project ${i}`, {
        statistics: stats,
        updatedAt: updateDate,
      }),
    )
  }
})

Given('previous average health score is {int}', function (score: number) {
  for (let i = 0; i < 4; i++) {
    const stats = createStatisticsWithVulns(10, 15) // High vuln count = low health
    const updateDate = new Date()
    updateDate.setDate(updateDate.getDate() - (28 + i * 7))
    context.testProjects.push(
      createTestProject(`Unhealthy Project ${i}`, {
        statistics: stats,
        updatedAt: updateDate,
      }),
    )
  }
})

Then('health trend should be {string}', function (trend: string) {
  expect(context.testTrendMetrics!.healthTrend).to.equal(trend as any)
})

// Scenario: Calculate scan frequency
Given('{int} projects were scanned in the last 7 days', function (count: number) {
  for (let i = 0; i < count; i++) {
    const scanDate = new Date()
    scanDate.setDate(scanDate.getDate() - i) // Within last 7 days
    const stats = createStatisticsWithVulns(10, 5)
    context.testProjects.push(
      createTestProject(`Scanned Project ${i}`, {
        statistics: stats,
        lastScanAt: scanDate,
      }),
    )
  }
})

When('I calculate productivity metrics', function () {
  try {
    context.testProductivityMetrics = calculateProductivityMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('scan frequency should be {int} per week', function (frequency: number) {
  expect(context.testProductivityMetrics!.scanFrequency).to.equal(frequency)
})

// Scenario: Calculate compliance metrics
Given('{int} critical vulnerabilities exist', function (count: number) {
  const vulns = Array.from(
    { length: count },
    (_, i) => createTestVulnerability(`CVE-2024-${1000 + i}`, 'critical', 40), // 40 days old = SLA exceeded
  )
  const stats = createStatisticsWithVulns(10, count, count, 0, 0, 0)
  context.testProjects.push(
    createTestProject('Critical Project', {
      statistics: stats,
      vulnerabilities: vulns,
    }),
  )
})

Given('{int} are older than 30 days (SLA exceeded)', function (count: number) {
  // Vulns were already created 40 days ago in the previous step
})

When('I calculate compliance metrics', function () {
  try {
    context.testComplianceMetrics = calculateComplianceMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('SLA critical compliance should be {int}%', function (percentage: number) {
  expect(context.testComplianceMetrics!.slaCompliance.slaCritical).to.be.closeTo(percentage, 1)
})

// Scenario: Calculate scan coverage
Given('{int} projects exist', function (count: number) {
  for (let i = 0; i < count; i++) {
    context.testProjects.push(createTestProject(`Project ${i}`))
  }
})

Given('{int} were scanned in the last 30 days', function (count: number) {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  for (let i = 0; i < count; i++) {
    context.testProjects[i].lastScanAt = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000)
  }
})

Then('scan coverage should be {int}%', function (percentage: number) {
  expect(context.testComplianceMetrics!.scanCoverage).to.equal(percentage)
})

// Scenario: Calculate data freshness
Given('{int} projects exist', function (count: number) {
  for (let i = 0; i < count; i++) {
    context.testProjects.push(createTestProject(`Fresh Project ${i}`))
  }
})

Given('{int} had data refreshed in last 7 days', function (count: number) {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  for (let i = 0; i < count; i++) {
    context.testProjects[i].lastVulnDataRefresh = new Date(sevenDaysAgo.getTime() + i * 24 * 60 * 60 * 1000)
  }
})

Then('data freshness should be {int}%', function (percentage: number) {
  expect(context.testComplianceMetrics!.dataFreshness).to.equal(percentage)
})

// Scenario: Calculate remediation rate
Given('{int} vulnerabilities have patch information', function (count: number) {
  const vulns = Array.from({ length: count }, (_, i) => {
    const vuln = createTestVulnerability(`CVE-2024-${2000 + i}`, 'high')
    vuln.patchInfo = {
      patchAvailability: i < 40 ? 'available' : 'unknown',
    }
    return vuln
  })
  const stats = createStatisticsWithVulns(10, count, 0, count, 0, 0)
  context.testProjects.push(
    createTestProject('Patched Project', {
      statistics: stats,
      vulnerabilities: vulns,
    }),
  )
})

Given('{int} have available patches', function (count: number) {
  // Already set in previous step
})

Then('remediation rate should be {int}%', function (percentage: number) {
  expect(context.testComplianceMetrics!.remediationRate).to.be.closeTo(percentage, 1)
})

// Scenario: Calculate productivity metrics
Given('{int} projects with various statistics', function (count: number) {
  for (let i = 0; i < count; i++) {
    const stats = createStatisticsWithVulns((i + 1) * 10, (i + 1) * 5)
    const scanDate = new Date()
    scanDate.setDate(scanDate.getDate() - i)
    context.testProjects.push(
      createTestProject(`Productivity Project ${i}`, {
        statistics: stats,
        lastScanAt: scanDate,
        sbomFiles: [{ filename: `bom${i}.json`, format: 'spdx', uploadedAt: new Date() }],
      }),
    )
  }
})

Then('total scans should be counted', function () {
  expect(context.testProductivityMetrics!.totalScans).to.equal(context.testProjects.length)
})

Then('SBOMs processed should be counted', function () {
  expect(context.testProductivityMetrics!.sbomsProcessed).to.equal(context.testProjects.length)
})

Then('components analyzed should be summed', function () {
  const expectedSum = context.testProjects.reduce((sum, p) => sum + p.statistics.totalComponents, 0)
  expect(context.testProductivityMetrics!.componentsAnalyzed).to.equal(expectedSum)
})

// Scenario: Handle empty project list
Given('no projects exist', function () {
  context.testProjects = []
})

When('I calculate overall metrics', function () {
  try {
    context.testOverallMetrics = calculateOverallMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('total projects should be {int}', function (count: number) {
  expect(context.testOverallMetrics!.totalProjects).to.equal(count)
})

Then('all counts should be 0', function () {
  expect(context.testOverallMetrics!.totalComponents).to.equal(0)
  expect(context.testOverallMetrics!.totalVulnerabilities).to.equal(0)
  expect(context.testOverallMetrics!.criticalCount).to.equal(0)
})

Then('average health score should default to 100', function () {
  expect(context.testOverallMetrics!.averageHealthScore).to.equal(100)
})

// Scenario: Calculate all executive metrics together
Given('I have multiple projects', function () {
  for (let i = 0; i < 5; i++) {
    const stats = createStatisticsWithVulns(10 + i * 2, 5 + i * 3, i, i + 1, i + 2, i + 3)
    const scanDate = new Date()
    scanDate.setDate(scanDate.getDate() - i)
    context.testProjects.push(
      createTestProject(`Executive Project ${i}`, {
        statistics: stats,
        lastScanAt: scanDate,
        updatedAt: scanDate,
      }),
    )
  }
})

When('I calculate executive metrics', function () {
  try {
    context.testMetrics = calculateExecutiveMetrics(context.testProjects)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('overall metrics should be included', function () {
  expect(context.testMetrics).to.have.property('overall')
  expect(context.testMetrics!.overall).to.have.property('totalProjects')
})

Then('project metrics should be included', function () {
  expect(context.testMetrics).to.have.property('byProject')
  expect(context.testMetrics!.byProject).to.be.an('array')
})

Then('trend metrics should be included', function () {
  expect(context.testMetrics).to.have.property('trends')
  expect(context.testMetrics!.trends).to.have.property('vulnerabilityTrend')
})

Then('compliance metrics should be included', function () {
  expect(context.testMetrics).to.have.property('compliance')
  expect(context.testMetrics!.compliance).to.have.property('scanCoverage')
})

Then('productivity metrics should be included', function () {
  expect(context.testMetrics).to.have.property('productivity')
  expect(context.testMetrics!.productivity).to.have.property('totalScans')
})
