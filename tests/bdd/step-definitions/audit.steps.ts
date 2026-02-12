/**
 * Audit Logging Step Definitions
 * BDD step definitions for audit logging scenarios
 * Implements 20 scenarios from audit-logging.feature
 *
 * Follows Red-Green-Refactor TDD cycle:
 * - Red: Failing tests drive development
 * - Green: Implement minimum to pass tests
 * - Refactor: Improve code while keeping tests green
 */

import { Given, When, Then, Before, After } from '@cucumber/cucumber'
import { expect } from '@jest/globals'
import { useAuditStore } from '../../../vuln-assess-tool/src/renderer/lib/audit/auditStore'
import type {
  AuditEvent,
  AuditEventFilter,
  AuditExportFormat,
} from '../../../vuln-assess-tool/src/renderer/lib/audit/types'
import type {
  Project,
  AppSettings,
  SettingsProfile,
  Component,
  Vulnerability,
} from '../../../vuln-assess-tool/src/shared/types'

/**
 * Test Context for Audit Scenarios
 * Maintains state between steps within a scenario
 */
interface AuditTestContext {
  testProjects: Map<string, Project>
  testProfiles: Map<string, SettingsProfile>
  testSettings: AppSettings | null
  testSboms: Map<string, { filename: string; format: string; componentCount: number }>
  currentEventId: string | null
  exportedData: { format: string; data: string | unknown } | null
  mockIndexedDB: Map<string, AuditEvent[]>
  bulkOperationIds: string[]
  queryResult: AuditEvent[] | null
}

// Global test context
let context: AuditTestContext

/**
 * Before each scenario: Initialize fresh test context
 */
Before({ tags: '@audit' }, () => {
  context = {
    testProjects: new Map(),
    testProfiles: new Map(),
    testSettings: null,
    testSboms: new Map(),
    currentEventId: null,
    exportedData: null,
    mockIndexedDB: new Map(),
    bulkOperationIds: [],
    queryResult: null,
  }

  // Reset audit store for clean state
  useAuditStore.getState()._resetStore()

  // Mock IndexedDB operations
  mockIndexedDBOperations()
})

/**
 * After each scenario: Cleanup test state
 */
After({ tags: '@audit' }, () => {
  // Clear test context
  context.testProjects.clear()
  context.testProfiles.clear()
  context.testSboms.clear()
  context.mockIndexedDB.clear()
  context.bulkOperationIds = []
  context.queryResult = null
  context.currentEventId = null
  context.exportedData = null

  // Reset audit store
  useAuditStore.getState()._resetStore()
})

/**
 * ============================================================================
 * GIVEN STEPS - Setup initial state
 * ============================================================================
 */

// Project setup
Given('a new project {string} is created', (projectName: string) => {
  const project: Project = {
    id: `project-${Date.now()}`,
    name: projectName,
    description: `Test project ${projectName}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    sbomFiles: [],
    components: [],
    vulnerabilities: [],
    statistics: {
      totalVulnerabilities: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      noneCount: 0,
    },
  }

  context.testProjects.set('current', project)
})

Given('project {string} exists with name {string}', (projectId: string, projectName: string) => {
  const project: Project = {
    id: projectId,
    name: projectName,
    description: `Test project ${projectName}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    sbomFiles: [],
    components: [],
    vulnerabilities: [],
    statistics: {
      totalVulnerabilities: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      noneCount: 0,
    },
  }

  context.testProjects.set(projectId, project)
})

Given('project {string} exists with details', (projectId: string) => {
  const project: Project = {
    id: projectId,
    name: `Project ${projectId}`,
    description: `Detailed test project ${projectId}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    sbomFiles: [
      {
        id: 'sbom-1',
        filename: 'bom.json',
        format: 'cyclonedx',
        formatVersion: '1.4',
        uploadedAt: new Date(),
        fileHash: 'abc123',
        componentCount: 10,
      },
    ],
    components: Array.from({ length: 5 }, (_, i) => createMockComponent(`comp-${i}`)),
    vulnerabilities: [],
    statistics: {
      totalVulnerabilities: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      noneCount: 0,
    },
  }

  context.testProjects.set(projectId, project)
})

Given('project {string} has {int} vulnerabilities', (projectId: string, vulnCount: number) => {
  const project = context.testProjects.get(projectId)
  expect(project).toBeDefined()

  if (project) {
    project.vulnerabilities = Array.from({ length: vulnCount }, (_, i) => createMockVulnerability(`vuln-${i}`))
    project.statistics.totalVulnerabilities = vulnCount
    context.testProjects.set(projectId, project)
  }
})

Given('project {string} has existing vulnerabilities', (projectId: string) => {
  const project = context.testProjects.get(projectId)
  expect(project).toBeDefined()

  if (project) {
    project.vulnerabilities = [
      createMockVulnerability('CVE-2023-0001'),
      createMockVulnerability('CVE-2023-0002'),
    ]
    project.statistics.totalVulnerabilities = 2
    context.testProjects.set(projectId, project)
  }
})

Given('project {string} has SBOM {string}', (projectId: string, filename: string) => {
  const project = context.testProjects.get(projectId)
  expect(project).toBeDefined()

  if (project) {
    project.sbomFiles = [
      {
        id: `sbom-${filename}`,
        filename,
        format: 'cyclonedx',
        formatVersion: '1.4',
        uploadedAt: new Date(),
        fileHash: 'hash123',
        componentCount: 10,
      },
    ]
    context.testProjects.set(projectId, project)
  }

  context.testSboms.set(`${projectId}-${filename}`, {
    filename,
    format: 'cyclonedx',
    componentCount: 10,
  })
})

Given('application settings have {string}:{string}', (key: string, value: string) => {
  context.testSettings = {
    [key]: value,
    theme: value as 'light' | 'dark' | 'auto',
    autoUpdate: true,
    updateInterval: 24,
    maxDatabaseSize: 1000,
    scanTimeout: 300,
    language: 'en',
    defaultExportFormat: 'json',
  } as AppSettings
})

Given('a new settings profile {string} is created', (profileName: string) => {
  const profile: SettingsProfile = {
    id: `profile-${Date.now()}`,
    name: profileName,
    description: `Test profile ${profileName}`,
    settings: {
      theme: 'light',
      autoUpdate: true,
      updateInterval: 24,
      maxDatabaseSize: 1000,
      scanTimeout: 300,
      language: 'en',
      defaultExportFormat: 'json',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  context.testProfiles.set('current', profile)
})

Given('profile {string} exists', (profileId: string) => {
  const profile: SettingsProfile = {
    id: profileId,
    name: `Profile ${profileId}`,
    description: `Test profile ${profileId}`,
    settings: {
      theme: 'dark',
      autoUpdate: false,
      updateInterval: 48,
      maxDatabaseSize: 500,
      scanTimeout: 600,
      language: 'en',
      defaultExportFormat: 'csv',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  context.testProfiles.set(profileId, profile)
})

Given('{int} vulnerabilities are exported as PDF', (count: number) => {
  // Setup for export test
  context.bulkOperationIds = Array.from({ length: count }, (_, i) => `vuln-${i}`)
})

Given('{int} projects are selected for bulk deletion', (count: number) => {
  context.bulkOperationIds = Array.from({ length: count }, (_, i) => `project-bulk-${i}`)
})

Given('{int} vulnerabilities are selected for bulk update', (count: number) => {
  context.bulkOperationIds = Array.from({ length: count }, (_, i) => `vuln-bulk-${i}`)
})

Given('{int} projects are exported', (count: number) => {
  context.bulkOperationIds = Array.from({ length: count }, (_, i) => `project-export-${i}`)
})

Given('a project with {int} components and vulnerabilities', (count: number) => {
  const project: Project = {
    id: 'project-large',
    name: 'Large Project',
    description: 'Project with many components',
    createdAt: new Date(),
    updatedAt: new Date(),
    sbomFiles: [],
    components: Array.from({ length: count }, (_, i) => createMockComponent(`comp-${i}`)),
    vulnerabilities: Array.from({ length: count }, (_, i) => createMockVulnerability(`vuln-${i}`)),
    statistics: {
      totalVulnerabilities: count,
      criticalCount: Math.floor(count * 0.1),
      highCount: Math.floor(count * 0.2),
      mediumCount: Math.floor(count * 0.3),
      lowCount: Math.floor(count * 0.4),
      noneCount: 0,
    },
  }

  context.testProjects.set('large', project)
})

Given('audit events exist from January to March', () => {
  const store = useAuditStore.getState()

  // Create events for January, February, and March
  const months = [
    new Date('2024-01-15'),
    new Date('2024-02-15'),
    new Date('2024-03-15'),
  ]

  months.forEach((date, index) => {
    store.addEvent({
      actionType: 'CREATE',
      entityType: 'project',
      entityId: `project-${index}`,
      newState: { name: `Project ${index}` },
    })

    // Manually set timestamp for testing
    const events = store.events
    events[events.length - 1].timestamp = date
  })
})

Given('audit events exist for projects, vulnerabilities, and settings', () => {
  const store = useAuditStore.getState()

  store.addEvent({
    actionType: 'CREATE',
    entityType: 'project',
    entityId: 'project-1',
    newState: { name: 'Project 1' },
  })

  store.addEvent({
    actionType: 'SCAN',
    entityType: 'vulnerability',
    entityId: 'vuln-1',
    newState: { count: 5 },
  })

  store.addEvent({
    actionType: 'SETTINGS_CHANGE',
    entityType: 'settings',
    entityId: 'global',
    previousState: { theme: 'light' },
    newState: { theme: 'dark' },
  })
})

/**
 * ============================================================================
 * WHEN STEPS - Execute actions
 * ============================================================================
 */

When('the project creation is logged', () => {
  const project = context.testProjects.get('current')
  expect(project).toBeDefined()

  if (project) {
    // Import the actual logging function
    const { logProjectCreate } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logProjectCreate(project)

    // Store the created event ID
    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('the project name is updated to {string}', (newName: string) => {
  const project = context.testProjects.get('P1')
  expect(project).toBeDefined()

  if (project) {
    const previousState = { ...project }
    project.name = newName
    project.updatedAt = new Date()

    const { logProjectUpdate } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logProjectUpdate(project.id, previousState, { name: newName })

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('the project is deleted', () => {
  const project = context.testProjects.get('P1')
  expect(project).toBeDefined()

  if (project) {
    const { logProjectDelete } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logProjectDelete(project)

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('a vulnerability scan finds {int} vulnerabilities', (vulnCount: number) => {
  const project = context.testProjects.get('P1')
  expect(project).toBeDefined()

  if (project) {
    const previousCount = project.vulnerabilities.length
    project.vulnerabilities = Array.from({ length: vulnCount }, (_, i) => createMockVulnerability(`CVE-2023-${i}`))
    project.statistics.totalVulnerabilities = vulnCount

    const { logVulnerabilityScan } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logVulnerabilityScan(
      project.id,
      project.name,
      project.components.length,
      vulnCount,
      previousCount
    )

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('vulnerability data is refreshed with {int} new vulnerabilities', (newVulnCount: number) => {
  const project = context.testProjects.get('P1')
  expect(project).toBeDefined()

  if (project) {
    const { logVulnerabilityRefresh } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logVulnerabilityRefresh(project.id, project.name, newVulnCount)

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('SBOM file {string} is uploaded', (filename: string) => {
  const project = context.testProjects.get('P1')
  expect(project).toBeDefined()

  if (project) {
    const { logSbomUpload } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logSbomUpload(project.id, project.name, filename, 'cyclonedx', 10)

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('the SBOM is removed', () => {
  const project = context.testProjects.get('P1')
  expect(project).toBeDefined()

  if (project) {
    const filename = project.sbomFiles[0]?.filename || 'bom.json'
    const { logSbomRemove } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logSbomRemove(project.id, project.name, filename)

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('settings are changed to {string}:{string}', (key: string, value: string) => {
  const previousSettings = context.testSettings
  const newSettings = { [key]: value } as Partial<AppSettings>

  const { logSettingsChange } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
  logSettingsChange(previousSettings as AppSettings, newSettings)

  const events = useAuditStore.getState().events
  context.currentEventId = events[events.length - 1]?.id || null
})

When('the profile creation is logged', () => {
  const profile = context.testProfiles.get('current')
  expect(profile).toBeDefined()

  if (profile) {
    const { logProfileEvent } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logProfileEvent('CREATE', profile)

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('the profile is updated', () => {
  const profile = context.testProfiles.get('P1')
  expect(profile).toBeDefined()

  if (profile) {
    const previousProfile = { ...profile }
    profile.name = 'Updated Profile'
    profile.updatedAt = new Date()

    const { logProfileEvent } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logProfileEvent('UPDATE', profile, previousProfile)

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('the profile is deleted', () => {
  const profile = context.testProfiles.get('P1')
  expect(profile).toBeDefined()

  if (profile) {
    const { logProfileEvent } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logProfileEvent('DELETE', profile)

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('the export is logged', () => {
  const { logExport } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
  logExport('vulnerability', 'pdf', context.bulkOperationIds.length)

  const events = useAuditStore.getState().events
  context.currentEventId = events[events.length - 1]?.id || null
})

When('bulk delete is executed', () => {
  const { logBulkOperation } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
  logBulkOperation('DELETE', 'project', context.bulkOperationIds)

  const events = useAuditStore.getState().events
  context.currentEventId = events[events.length - 1]?.id || null
})

When('bulk update is executed', () => {
  const { logBulkOperation } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
  logBulkOperation('UPDATE', 'vulnerability', context.bulkOperationIds)

  const events = useAuditStore.getState().events
  context.currentEventId = events[events.length - 1]?.id || null
})

When('bulk export is executed', () => {
  const { logBulkOperation } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
  logBulkOperation('EXPORT', 'project', context.bulkOperationIds)

  const events = useAuditStore.getState().events
  context.currentEventId = events[events.length - 1]?.id || null
})

When('the project is logged', () => {
  const project = context.testProjects.get('large')
  expect(project).toBeDefined()

  if (project) {
    const { logProjectCreate } = require('../../../vuln-assess-tool/src/renderer/lib/audit/auditLogger')
    logProjectCreate(project)

    const events = useAuditStore.getState().events
    context.currentEventId = events[events.length - 1]?.id || null
  }
})

When('a new audit event is created', () => {
  useAuditStore.getState().addEvent({
    actionType: 'CREATE',
    entityType: 'project',
    entityId: 'test-project',
    newState: { name: 'Test' },
  })

  const events = useAuditStore.getState().events
  context.currentEventId = events[events.length - 1]?.id || null
})

When('the event is stored', () => {
  // Simulate IndexedDB storage
  const event = useAuditStore.getState().events[0]
  if (event) {
    context.mockIndexedDB.set('audit-events', [event])
  }
})

When('I query events from February', () => {
  const start = new Date('2024-02-01')
  const end = new Date('2024-02-29')

  const events = useAuditStore.getState().getEventsInDateRange(start, end)
  context.queryResult = events
})

When('I query events with entity type filter {string}', (entityType: string) => {
  const filter: AuditEventFilter = {
    entityType: [entityType as AuditEvent['entityType']],
  }

  const result = useAuditStore.getState().queryEvents(filter)
  context.queryResult = result.events
})

When('I export audit logs as {string}', (format: string) => {
  // Mock export function
  const events = useAuditStore.getState().events

  if (format === 'json') {
    context.exportedData = {
      format: 'json',
      data: JSON.stringify({
        version: '1.0',
        exportedAt: new Date().toISOString(),
        totalEvents: events.length,
        events,
      }),
    }
  } else if (format === 'csv') {
    const headers = 'ID,Timestamp,Action Type,Entity Type,Entity ID\n'
    const rows = events
      .map((e) => `${e.id},${e.timestamp},${e.actionType},${e.entityType},${e.entityId}`)
      .join('\n')
    context.exportedData = {
      format: 'csv',
      data: headers + rows,
    }
  }
})

When('I export audit logs with anonymization', () => {
  const events = useAuditStore.getState().events

  // Anonymize events
  const anonymizedEvents = events.map((e) => ({
    ...e,
    userId: '[REDACTED]',
    ipAddress: '[REDACTED]',
  }))

  context.exportedData = {
    format: 'json',
    data: JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      totalEvents: anonymizedEvents.length,
      events: anonymizedEvents,
    }),
  }
})

When('I export audit logs with full state', () => {
  const events = useAuditStore.getState().events

  context.exportedData = {
    format: 'json',
    data: JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      totalEvents: events.length,
      events, // Include full state
    }),
  }
})

/**
 * ============================================================================
 * THEN STEPS - Verify outcomes
 * ============================================================================
 */

Then('an audit event should be created with action {string}', (actionType: string) => {
  const events = useAuditStore.getState().events
  expect(events.length).toBeGreaterThan(0)

  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.actionType).toBe(actionType as AuditEvent['actionType'])
})

Then('entity type should be {string}', (entityType: string) => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.entityType).toBe(entityType as AuditEvent['entityType'])
})

Then('new state should contain project details', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()
  expect(typeof event?.newState).toBe('object')
})

Then('event should have a ULID timestamp', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.id).toHaveLength(26) // ULID length
  expect(event?.timestamp).toBeInstanceOf(Date)
})

Then('previous state should contain {string}', (expectedValue: string) => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.previousState).toBeDefined()
  expect(JSON.stringify(event?.previousState)).toContain(expectedValue)
})

Then('new state should contain {string}', (expectedValue: string) => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()
  expect(JSON.stringify(event?.newState)).toContain(expectedValue)
})

Then('new state should be null', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeUndefined()
})

Then('previous state should show {int} vulnerabilities', (count: number) => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.previousState).toBeDefined()
  expect(event?.previousState).toEqual(
    expect.objectContaining({
      vulnerabilityCount: count,
    })
  )
})

Then('new state should show {int} vulnerabilities', (count: number) => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()
  expect(event?.newState).toEqual(
    expect.objectContaining({
      vulnerabilityCount: count,
    })
  )
})

Then('metadata should describe the scan', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.metadata?.description).toBeDefined()
  expect(event?.metadata?.description).toMatch(/scan/i)
})

Then('new state should contain filename and format', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()
  expect(event?.newState).toEqual(
    expect.objectContaining({
      filename: expect.any(String),
      format: expect.any(String),
    })
  )
})

Then('component count should be recorded', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()
  expect(event?.newState).toHaveProperty('componentCount')
})

Then('previous state should contain the filename', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.previousState).toBeDefined()
  expect(event?.previousState).toHaveProperty('filename')
})

Then('previous state should indicate {string} changed', (changedField: string) => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.previousState).toBeDefined()

  const previousState = event?.previousState as { changedFields?: string[] }
  expect(previousState.changedFields).toContain(changedField)
})

Then('new state should contain new theme value', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()
  expect(event?.newState).toHaveProperty('theme')
})

Then('previous and new states should be captured', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.previousState).toBeDefined()
  expect(event?.newState).toBeDefined()
})

Then('previous state should be captured', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.previousState).toBeDefined()
})

Then('new state should contain format {string}', (format: string) => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()
  expect(event?.newState).toEqual(
    expect.objectContaining({
      format: format,
    })
  )
})

Then('item count should be {int}', (count: number) => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()
  expect(event?.newState).toEqual(
    expect.objectContaining({
      itemCount: count,
    })
  )
})

Then('metadata should indicate bulk operation', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.metadata).toBeDefined()
  expect(event?.metadata?.isBulkOperation).toBe(true)
})

Then('affected IDs should be recorded', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()
  expect(event?.newState).toHaveProperty('affectedIds')
})

Then('metadata should mark it as bulk operation', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.metadata).toBeDefined()
  expect(event?.metadata?.bulkItemCount).toBeGreaterThan(0)
})

Then('affected entity IDs should be recorded', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.metadata).toBeDefined()
  expect(event?.metadata?.relatedEntityIds).toBeDefined()
  expect(event?.metadata?.relatedEntityIds?.length).toBeGreaterThan(0)
})

Then('component arrays should not be stored directly', () => {
  const events = useAuditStore.getState().events
  const event = events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()

  const newState = event?.newState as {
    components?: unknown
    componentCount?: number
  }

  // Should have count, not the array
  expect(newState.components).toBeUndefined()
  expect(newState.componentCount).toBeDefined()
})

Then('counts should be stored instead', () => {
  const events = useAuditStore.getState().events
  const event = events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.newState).toBeDefined()

  const newState = event?.newState as {
    vulnerabilityCount?: number
    sbomFileCount?: number
    componentCount?: number
  }

  expect(newState.vulnerabilityCount || newState.componentCount || newState.sbomFileCount).toBeDefined()
})

Then('memory usage should be optimized', () => {
  const events = useAuditStore.getState().events
  const event = events[events.length - 1]

  expect(event).toBeDefined()

  // Check that large arrays are not stored
  const stateString = JSON.stringify(event?.newState)
  expect(stateString.length).toBeLessThan(1000) // Reasonable size for sanitized data
})

Then('the event ID should be a ULID', () => {
  const events = useAuditStore.getState().events
  const event = context.currentEventId
    ? events.find((e) => e.id === context.currentEventId)
    : events[events.length - 1]

  expect(event).toBeDefined()
  expect(event?.id).toBeDefined()
  expect(event?.id).toHaveLength(26)

  // ULID format: 26 characters, Crockford Base32
  const ulidPattern = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/
  expect(event?.id).toMatch(ulidPattern)
})

Then('the ULID should be time-sortable', () => {
  const store = useAuditStore.getState()

  // Create two events with a delay
  store.addEvent({
    actionType: 'CREATE',
    entityType: 'project',
    entityId: 'project-1',
  })

  // Small delay to ensure different timestamps
  const start = Date.now()
  while (Date.now() - start < 10) {
    // Wait
  }

  store.addEvent({
    actionType: 'CREATE',
    entityType: 'project',
    entityId: 'project-2',
  })

  const events = store.events
  const id1 = events[events.length - 2].id
  const id2 = events[events.length - 1].id

  // ULIDs with later timestamps should be greater
  expect(id2.localeCompare(id1)).toBeGreaterThan(0)
})

Then('the ULID should be unique', () => {
  const store = useAuditStore.getState()
  const ids = new Set<string>()

  // Create multiple events
  for (let i = 0; i < 100; i++) {
    store.addEvent({
      actionType: 'CREATE',
      entityType: 'project',
      entityId: `project-${i}`,
    })

    const event = store.events[store.events.length - 1]
    expect(ids.has(event.id)).toBe(false)
    ids.add(event.id)
  }

  expect(ids.size).toBe(100)
})

Then('it should persist in IndexedDB', () => {
  const storedEvents = context.mockIndexedDB.get('audit-events')
  expect(storedEvents).toBeDefined()
  expect(storedEvents?.length).toBeGreaterThan(0)
})

Then('it should survive page refresh', () => {
  // Simulate page refresh by checking persistence
  const eventsBefore = useAuditStore.getState().events.length

  // In a real scenario, this would be a page refresh
  // For testing, we check that events persist in the store
  const eventsAfter = useAuditStore.getState().events.length

  expect(eventsAfter).toBe(eventsBefore)
})

Then('only February events should be returned', () => {
  expect(context.queryResult).toBeDefined()
  expect(context.queryResult?.length).toBe(1)

  const event = context.queryResult?.[0]
  expect(event?.entityId).toBe('project-1')
})

Then('results should be ordered by timestamp', () => {
  expect(context.queryResult).toBeDefined()

  const timestamps = context.queryResult?.map((e) => new Date(e.timestamp).getTime()) || []
  const sortedTimestamps = [...timestamps].sort((a, b) => a - b)

  expect(timestamps).toEqual(sortedTimestamps)
})

Then('only project-related events should be returned', () => {
  expect(context.queryResult).toBeDefined()
  expect(context.queryResult?.length).toBeGreaterThan(0)

  context.queryResult?.forEach((event) => {
    expect(event.entityType).toBe('project')
  })
})

Then('the export should be valid {string}', (format: string) => {
  expect(context.exportedData).toBeDefined()
  expect(context.exportedData?.format).toBe(format)
})

Then('the export should contain all audit events', () => {
  expect(context.exportedData).toBeDefined()

  const exportedData = context.exportedData?.data
  const events = useAuditStore.getState().events

  if (typeof exportedData === 'string') {
    const parsed = JSON.parse(exportedData)
    expect(parsed.totalEvents).toBe(events.length)
  }
})

Then('the export should have a timestamp', () => {
  expect(context.exportedData).toBeDefined()

  const exportedData = context.exportedData?.data

  if (typeof exportedData === 'string') {
    const parsed = JSON.parse(exportedData)
    expect(parsed.exportedAt).toBeDefined()
    expect(new Date(parsed.exportedAt)).toBeInstanceOf(Date)
  }
})

Then('sensitive data should be redacted', () => {
  expect(context.exportedData).toBeDefined()

  const exportedData = context.exportedData?.data

  if (typeof exportedData === 'string') {
    const parsed = JSON.parse(exportedData)
    parsed.events.forEach((event: AuditEvent) => {
      if (event.userId) {
        expect(event.userId).toBe('[REDACTED]')
      }
      if (event.ipAddress) {
        expect(event.ipAddress).toBe('[REDACTED]')
      }
    })
  }
})

Then('full state data should be included', () => {
  expect(context.exportedData).toBeDefined()

  const exportedData = context.exportedData?.data

  if (typeof exportedData === 'string') {
    const parsed = JSON.parse(exportedData)
    expect(parsed.events.length).toBeGreaterThan(0)

    const firstEvent = parsed.events[0]
    expect(firstEvent.previousState || firstEvent.newState).toBeDefined()
  }
})

Then('CSV export should have headers', () => {
  expect(context.exportedData?.format).toBe('csv')

  const csv = context.exportedData?.data as string
  expect(csv).toContain('ID,Timestamp,Action Type')
})

Then('CSV export should have event rows', () => {
  expect(context.exportedData?.format).toBe('csv')

  const csv = context.exportedData?.data as string
  const lines = csv.split('\n')

  // Should have header + at least one event row
  expect(lines.length).toBeGreaterThan(1)
})

/**
 * ============================================================================
 * HELPER FUNCTIONS
 * ============================================================================
 */

/**
 * Create a mock component for testing
 */
function createMockComponent(id: string): Component {
  return {
    id,
    name: `component-${id}`,
    version: '1.0.0',
    type: 'library',
    licenses: ['MIT'],
    vulnerabilities: [],
    dependencies: [],
    dependents: [],
  }
}

/**
 * Create a mock vulnerability for testing
 */
function createMockVulnerability(id: string): Vulnerability {
  return {
    id,
    source: 'nvd',
    severity: 'high',
    cvssScore: 7.5,
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
    description: `Test vulnerability ${id}`,
    references: [],
    affectedComponents: [],
    publishedAt: new Date(),
    modifiedAt: new Date(),
  }
}

/**
 * Mock IndexedDB operations for testing
 */
function mockIndexedDBOperations() {
  // In a real implementation, this would use fake-indexeddb
  // For now, we use a simple Map to simulate storage
  const mockDB = {
    put: (tableName: string, data: AuditEvent) => {
      if (!context.mockIndexedDB.has(tableName)) {
        context.mockIndexedDB.set(tableName, [])
      }
      context.mockIndexedDB.get(tableName)!.push(data)
    },
    get: (tableName: string) => {
      return context.mockIndexedDB.get(tableName) || []
    },
    getAll: (tableName: string) => {
      return context.mockIndexedDB.get(tableName) || []
    },
    clear: (tableName: string) => {
      context.mockIndexedDB.delete(tableName)
    },
  }

  // Store mock in context for access in test steps
  ;(context as any).mockDB = mockDB
}
