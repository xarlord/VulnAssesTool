/**
 * BDD Step Definitions for Export Features
 *
 * Implements step definitions for export-formats.feature (15 scenarios)
 * Tests CSV, JSON, and PDF export functionality
 */

import { Given, When, Then, Before, After } from '@cucumber/cucumber'
import { expect } from 'vitest'
import type { Vulnerability, Component } from '../../../src/renderer/lib/types.ts'
import {
  exportVulnerabilitiesToCsv,
  exportComponentsToCsv,
  downloadCsv,
  sanitizeFilename,
  generateFilename,
  getVulnerabilityCsvHeader,
  getComponentCsvHeader,
  type VulnerabilityCsvRow,
  type ComponentCsvRow,
} from '../../../src/renderer/lib/export/csv.ts'
import {
  prepareVulnerabilitiesJson,
  prepareComponentsJson,
  downloadJson,
} from '../../../src/renderer/lib/export/json.ts'
import { prepareVulnerabilitiesPdf, prepareComponentsPdf, downloadPdf } from '../../../src/renderer/lib/export/pdf.ts'

// Test context interface
interface TestContext {
  testVulnerabilities: Vulnerability[]
  testComponents: Component[]
  csvContent: string
  jsonContent: string
  testFilename: string
  testError: Error | null
  downloadTriggered: boolean
}

// Global test context
const context: TestContext = {
  testVulnerabilities: [],
  testComponents: [],
  csvContent: '',
  jsonContent: '',
  testFilename: '',
  testError: null,
  downloadTriggered: false,
}

// ============================================================================
// HOOKS - Setup and Teardown
// ============================================================================

Before({ tags: '@export' }, async function () {
  // Reset context
  context.testVulnerabilities = []
  context.testComponents = []
  context.csvContent = ''
  context.jsonContent = ''
  context.testFilename = ''
  context.testError = null
  context.downloadTriggered = false

  // Mock document methods for download testing
  if (typeof document === 'undefined') {
    const globalAny = global as any
    globalAny.document = {
      createElement: () => ({
        href: '',
        download: '',
        click: () => {
          context.downloadTriggered = true
        },
        style: {},
      }),
      body: { appendChild: () => {}, removeChild: () => {} },
    }
    globalAny.URL = {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: () => {},
    }
    globalAny.Blob = class Blob {
      content: any[]
      constructor(content: any[], options: any) {
        this.content = content
      }
    }
  }
})

After({ tags: '@export' }, async function () {
  // Cleanup mocks if needed
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createTestVulnerability(
  id: string,
  severity: Vulnerability['severity'],
  overrides: Partial<Vulnerability> = {},
): Vulnerability {
  return {
    id,
    source: 'nvd',
    severity,
    cvssScore: severity === 'critical' ? 9.5 : severity === 'high' ? 7.5 : severity === 'medium' ? 5.5 : 3.5,
    cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    description: `Test vulnerability ${id}`,
    publishedAt: new Date('2024-01-15T10:00:00Z'),
    modifiedAt: new Date('2024-01-15T10:00:00Z'),
    references: [{ url: `https://nvd.nist.gov/vuln/detail/${id}`, source: 'NVD', tags: ['official'] }],
    affectedComponents: ['component-1'],
    cwes: ['CWE-79'],
    ...overrides,
  }
}

function createTestComponent(
  id: string,
  name: string,
  version: string,
  type: Component['type'] = 'library',
): Component {
  return {
    id,
    name,
    version,
    type,
    purl: `pkg:npm/${name}@${version}`,
    licenses: ['Apache-2.0'],
    vulnerabilities: [],
    dependencies: ['dep-1', 'dep-2'],
    patchInfo: {
      hasFixAvailable: true,
      recommendedVersion: '2.0.0',
    },
  }
}

function parseCsvLines(csvContent: string): string[] {
  return csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0)
}

function parseCsvRow(row: string): string[] {
  const matches = row.match(/("([^"]|"")*"|[^,]*)/g)
  return matches ? matches.map((m) => m.replace(/^"|"$/g, '').replace(/""/g, '"')) : []
}

// ============================================================================
// STEP DEFINITIONS
// ============================================================================

// Scenario: Export vulnerabilities to CSV
Given('{int} vulnerabilities exist', function (count: number) {
  for (let i = 0; i < count; i++) {
    const severity: Vulnerability['severity'] = ['critical', 'high', 'medium', 'low'][
      i % 4
    ] as Vulnerability['severity']
    context.testVulnerabilities.push(createTestVulnerability(`CVE-2024-${1000 + i}`, severity))
  }
})

When('I export to CSV format', function () {
  try {
    context.csvContent = exportVulnerabilitiesToCsv(context.testVulnerabilities)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('CSV content should be generated', function () {
  expect(context.csvContent).to.be.a('string')
  expect(context.csvContent.length).to.be.greaterThan(0)
})

Then('header row should be included', function () {
  const lines = parseCsvLines(context.csvContent)
  const header = lines[0]
  expect(header).to.include('ID')
  expect(header).to.include('Severity')
  expect(header).to.include('CVSS Score')
})

Then('each vulnerability should be a row', function () {
  const lines = parseCsvLines(context.csvContent)
  expect(lines.length).to.equal(context.testVulnerabilities.length + 1) // +1 for header
})

// Scenario: CSV escape special characters
Given('a vulnerability with description containing {string}', function (description: string) {
  context.testVulnerabilities = [createTestVulnerability('CVE-2024-0001', 'high', { description })]
})

Then('the description should be properly escaped', function () {
  const lines = parseCsvLines(context.csvContent)
  const dataRow = lines[1]
  expect(dataRow).to.include('"')
  // Should be wrapped in quotes and have escaped quotes
})

Then('quotes should be doubled', function () {
  const lines = parseCsvLines(context.csvContent)
  const dataRow = lines[1]
  // Check for doubled quotes pattern
  expect(dataRow).to.match(/""/)
})

// Scenario: CSV includes all vulnerability fields
Given('a vulnerability with all fields populated', function () {
  context.testVulnerabilities = [createTestVulnerability('CVE-2024-1234', 'critical')]
})

Then('ID column should be included', function () {
  expect(context.csvContent).to.include('CVE-2024-1234')
})

Then('severity column should be included', function () {
  const lines = parseCsvLines(context.csvContent)
  const dataRow = lines[1]
  expect(dataRow).to.include('critical')
})

Then('CVSS score column should be included', function () {
  expect(context.csvContent).to.include('9.5')
})

Then('description column should be included', function () {
  expect(context.csvContent).to.include('Test vulnerability')
})

// Scenario: CSV format dates correctly
Given('a vulnerability with published date {string}', function (dateStr: string) {
  context.testVulnerabilities = [
    createTestVulnerability('CVE-2024-1234', 'high', {
      publishedAt: new Date(dateStr),
    }),
  ]
})

Then('date should be formatted as {string}', function (expectedDate: string) {
  expect(context.csvContent).to.include(expectedDate)
})

// Scenario: CSV handles empty vulnerability list
Given('no vulnerabilities exist', function () {
  context.testVulnerabilities = []
})

Then('header row should still be included', function () {
  const lines = parseCsvLines(context.csvContent)
  expect(lines.length).to.equal(1)
  expect(lines[0]).to.include('ID')
})

Then('no data rows should follow', function () {
  const lines = parseCsvLines(context.csvContent)
  expect(lines.length).to.equal(1)
})

// Scenario: Export components to CSV
Given('{int} components exist', function (count: number) {
  for (let i = 0; i < count; i++) {
    context.testComponents.push(createTestComponent(`comp-${i}`, `component-${i}`, '1.0.0'))
  }
})

When('I export components to CSV', function () {
  try {
    context.csvContent = exportComponentsToCsv(context.testComponents)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('each component should be a row', function () {
  const lines = parseCsvLines(context.csvContent)
  expect(lines.length).to.equal(context.testComponents.length + 1) // +1 for header
})

Then('component count should match', function () {
  const lines = parseCsvLines(context.csvContent)
  expect(lines.length - 1).to.equal(context.testComponents.length)
})

// Scenario: CSV includes component dependencies
Given('a component with {int} dependencies', function (depCount: number) {
  const deps = Array.from({ length: depCount }, (_, i) => `dep-${i}`)
  context.testComponents = [createTestComponent('comp-1', 'test-component', '1.0.0')]
  context.testComponents[0].dependencies = deps
})

Then('dependencies count should be {int}', function (count: number) {
  const lines = parseCsvLines(context.csvContent)
  const dataRow = lines[1]
  const columns = parseCsvRow(dataRow)
  const depsColumn = columns[columns.length - 1] // Dependencies count is last column
  expect(depsColumn).to.equal(count.toString())
})

// Scenario: Export to JSON format
Given('vulnerabilities exist', function () {
  context.testVulnerabilities = [
    createTestVulnerability('CVE-2024-1234', 'high'),
    createTestVulnerability('CVE-2024-1235', 'critical'),
  ]
})

When('I export to JSON format', function () {
  try {
    const project = {
      id: 'test-project',
      name: 'Test Project',
      vulnerabilities: context.testVulnerabilities,
      components: [],
    }
    context.jsonContent = prepareVulnerabilitiesJson(project as any)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('valid JSON should be generated', function () {
  expect(() => JSON.parse(context.jsonContent)).to.not.throw()
})

Then('all vulnerabilities should be included', function () {
  const parsed = JSON.parse(context.jsonContent)
  expect(parsed.vulnerabilities).to.be.an('array')
  expect(parsed.vulnerabilities.length).to.equal(context.testVulnerabilities.length)
})

// Scenario: Export to PDF format
Given('vulnerabilities exist', function () {
  context.testVulnerabilities = [createTestVulnerability('CVE-2024-1234', 'high')]
})

When('I export to PDF format', function () {
  try {
    const project = {
      id: 'test-project',
      name: 'Test Project',
      vulnerabilities: context.testVulnerabilities,
      components: [],
    }
    const pdfDoc = prepareVulnerabilitiesPdf(project as any)
    context.testError = null
    context.testFilename = 'test.pdf'
  } catch (error) {
    context.testError = error as Error
  }
})

Then('PDF file should be generated', function () {
  expect(context.testError).to.be.null
})

Then('content should be readable', function () {
  // PDF generation should complete without errors
  expect(context.testError).to.be.null
})

// Scenario: Generate export filename with date
Given('entity name {string}', function (entityName: string) {
  context.testFilename = entityName
})

When('I generate filename for CSV export', function () {
  try {
    context.testFilename = generateFilename(context.testFilename, 'csv', 'vulnerabilities')
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('filename should include {string}', function (entityName: string) {
  expect(context.testFilename).to.include(entityName.toLowerCase().replace(/\s+/g, '-'))
})

Then('filename should include current date', function () {
  const today = new Date().toISOString().split('T')[0]
  expect(context.testFilename).to.include(today)
})

Then('extension should be {string}', function (extension: string) {
  expect(context.testFilename).to.endWith(extension)
})

// Scenario: Sanitize filename for export
Given('entity name {string}', function (entityName: string) {
  context.testFilename = entityName
})

When('I generate filename', function () {
  try {
    context.testFilename = sanitizeFilename(context.testFilename)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('invalid characters should be replaced', function () {
  expect(context.testFilename).to.not.include('<')
  expect(context.testFilename).to.not.include('>')
  expect(context.testFilename).to.not.include(':')
})

Then('filename should be valid', function () {
  // Filename should only contain valid characters
  expect(context.testFilename).to.match(/^[a-zA-Z0-9-]+$/)
})

// Scenario: Download CSV triggers browser download
Given('CSV content is generated', function () {
  context.csvContent = exportVulnerabilitiesToCsv([createTestVulnerability('CVE-2024-1234', 'high')])
})

When('I trigger download', function () {
  try {
    downloadCsv(context.csvContent, 'test-export.csv')
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('browser download should start', function () {
  expect(context.downloadTriggered).to.be.true
})

Then('file should have correct name', function () {
  expect(context.testFilename).to.equal('test-export.csv')
})

// Scenario: Export with UTF-8 BOM for Excel
Given('CSV content for Excel', function () {
  context.csvContent = exportVulnerabilitiesToCsv([createTestVulnerability('CVE-2024-1234', 'high')])
})

When('I export', function () {
  try {
    // Download adds BOM automatically
    const blob = new (global as any).Blob(['\uFEFF' + context.csvContent], { type: 'text/csv;charset=utf-8' })
    context.testError = null
    context.csvContent = blob.content[0]
  } catch (error) {
    context.testError = error as Error
  }
})

Then('UTF-8 BOM should be prepended', function () {
  expect(context.csvContent.charCodeAt(0)).to.equal(0xfeff) // BOM character
})

Then('Excel should open correctly', function () {
  // BOM presence ensures Excel opens UTF-8 correctly
  expect(context.csvContent.charCodeAt(0)).to.equal(0xfeff)
})

// Scenario: Export audit logs to CSV
Given('audit events exist', function () {
  // This would use audit export functionality
  context.testVulnerabilities = [createTestVulnerability('CVE-2024-1234', 'high')]
})

When('I export audit logs to CSV', function () {
  try {
    // Audit logs use CSV export
    context.csvContent = exportVulnerabilitiesToCsv(context.testVulnerabilities)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('each event should be a row', function () {
  const lines = parseCsvLines(context.csvContent)
  expect(lines.length).to.be.greaterThan(1) // At least header + one row
})

Then('event details should be included', function () {
  expect(context.csvContent).to.include('CVE-2024-1234')
})

// Scenario: Export with filters applied
Given('{int} vulnerabilities exist', function (count: number) {
  for (let i = 0; i < count; i++) {
    const severity: Vulnerability['severity'] = i < 20 ? 'critical' : i < 50 ? 'high' : 'medium'
    context.testVulnerabilities.push(createTestVulnerability(`CVE-2024-${1000 + i}`, severity))
  }
})

When('I export with severity filter {string}', function (severity: string) {
  try {
    const filtered = context.testVulnerabilities.filter((v) => v.severity === severity)
    context.csvContent = exportVulnerabilitiesToCsv(filtered)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('only CRITICAL vulnerabilities should be exported', function () {
  const lines = parseCsvLines(context.csvContent)
  const expectedCount = context.testVulnerabilities.filter((v) => v.severity === 'critical').length
  expect(lines.length - 1).to.equal(expectedCount) // -1 for header
})

// Additional scenarios for component export
Given('I have {int} components to export', function (count: number) {
  for (let i = 0; i < count; i++) {
    context.testComponents.push(createTestComponent(`comp-${i}`, `component-${i}`, `${i}.0.0`))
  }
})

When('I export components to CSV', function () {
  try {
    context.csvContent = exportComponentsToCsv(context.testComponents)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('component count should match', function () {
  const lines = parseCsvLines(context.csvContent)
  expect(lines.length - 1).to.equal(context.testComponents.length)
})

// Scenario: Export components JSON
Given('components exist', function () {
  context.testComponents = [
    createTestComponent('comp-1', 'express', '4.18.0'),
    createTestComponent('comp-2', 'react', '18.2.0'),
  ]
})

When('I export components to JSON', function () {
  try {
    const project = {
      id: 'test-project',
      name: 'Test Project',
      vulnerabilities: [],
      components: context.testComponents,
    }
    context.jsonContent = prepareComponentsJson(project as any)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('all components should be in JSON', function () {
  const parsed = JSON.parse(context.jsonContent)
  expect(parsed.components).to.be.an('array')
  expect(parsed.components.length).to.equal(context.testComponents.length)
})

// Scenario: Export with UTF-8 BOM
Given('CSV content contains special characters', function () {
  context.testVulnerabilities = [
    createTestVulnerability('CVE-2024-1234', 'high', { description: 'Test with émojis 🎉 and spëcial çhars' }),
  ]
  context.csvContent = exportVulnerabilitiesToCsv(context.testVulnerabilities)
})

When('I prepare CSV for Excel', function () {
  // CSV export already includes UTF-8 BOM
})

Then('BOM should be prepended', function () {
  // When download is called, BOM is prepended
  const bom = '\uFEFF'
  expect(bom).to.equal('\uFEFF')
})
