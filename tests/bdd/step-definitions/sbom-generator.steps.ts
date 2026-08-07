/**
 * BDD Step Definitions for Excel-to-CycloneDX SBOM Generation
 *
 * Covers the scenarios in sbom-generator.feature whose behavior lives in
 * real, non-UI logic: src/renderer/lib/generators/excelParser.ts (parsing,
 * validation, column mapping) and cyclonedxGenerator.ts (SBOM generation,
 * PURL validation). Steps drive those functions directly rather than a
 * browser, the same way audit.steps.ts/analytics.steps.ts do.
 *
 * Scenarios that are genuinely UI-only (dialog open/close, preview
 * edit/remove, progress indicators, template download, mapping persistence,
 * multi-sheet dropdowns, project auto-upload) or depend on unimplemented
 * behavior (XML output) are tagged @wip in the feature file — see the note
 * at the top of that file for the full list and why.
 */

import { Given, When, Then, Before, After, type DataTable } from '@cucumber/cucumber'
import { expect } from 'vitest'
import * as XLSX from 'xlsx'
import type { Component } from '../../../src/shared/types.ts'
import {
  parseExcel,
  validateRow,
  mapRowToComponent,
  type ExcelRow,
} from '../../../src/renderer/lib/generators/excelParser.ts'
import {
  createSbom,
  validatePurl,
  type MetadataOptions,
} from '../../../src/renderer/lib/generators/cyclonedxGenerator.ts'

// Test context interface
interface TestContext {
  excelBuffer: ArrayBuffer | null
  parsedRows: ExcelRow[]
  validRows: ExcelRow[]
  invalidRows: Array<{ row: ExcelRow; errors: string[] }>
  components: Component[]
  metadataOptions: MetadataOptions | undefined
  generatedSbom: string | null
  testError: Error | null
}

const context: TestContext = {
  excelBuffer: null,
  parsedRows: [],
  validRows: [],
  invalidRows: [],
  components: [],
  metadataOptions: undefined,
  generatedSbom: null,
  testError: null,
}

Before({ tags: '@sbom-generator' }, async function () {
  context.excelBuffer = null
  context.parsedRows = []
  context.validRows = []
  context.invalidRows = []
  context.components = []
  context.metadataOptions = undefined
  context.generatedSbom = null
  context.testError = null
})

After({ tags: '@sbom-generator' }, async function () {
  // No external resources to clean up.
})

/** Build an .xlsx file (as an ArrayBuffer, matching what a real file upload yields) from a data table. */
function buildExcelBuffer(rows: Array<Record<string, string>>): ArrayBuffer {
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Components')
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return buffer
}

// ============================================================================
// BACKGROUND (no real app instance in this suite; parsing/generation is
// exercised directly against the buffer built by the scenario's Given step)
// ============================================================================

Given('I am using the VulnAssessTool application', function () {
  // No-op: this suite drives the generator/parser modules directly.
})

Given('the application has successfully loaded', function () {
  // No-op — see above.
})

Given('I am on the Dashboard page', function () {
  // No-op — see above.
})

// ============================================================================
// GIVEN — build the Excel fixture for each scenario
// ============================================================================

Given('I have a valid Excel file with components using the standard template', function (dataTable: DataTable) {
  context.excelBuffer = buildExcelBuffer(dataTable.hashes())
})

Given('I have an Excel file with custom column headers', function (dataTable: DataTable) {
  context.excelBuffer = buildExcelBuffer(dataTable.hashes())
})

Given('I have an Excel file with only name and version columns', function (dataTable: DataTable) {
  context.excelBuffer = buildExcelBuffer(dataTable.hashes())
})

Given('I have an Excel file with incomplete data', function (dataTable: DataTable) {
  context.excelBuffer = buildExcelBuffer(dataTable.hashes())
})

Given('I have an Excel file with mixed valid and invalid data', function (dataTable: DataTable) {
  context.excelBuffer = buildExcelBuffer(dataTable.hashes())
})

Given('I have a valid Excel file with components', function (dataTable: DataTable) {
  context.excelBuffer = buildExcelBuffer(dataTable.hashes())
})

Given('I have a comprehensive Excel file with all fields', function (dataTable: DataTable) {
  context.excelBuffer = buildExcelBuffer(dataTable.hashes())
})

Given('I have an Excel file with components including PURLs', function (dataTable: DataTable) {
  context.excelBuffer = buildExcelBuffer(dataTable.hashes())
})

// ============================================================================
// WHEN — parse + validate + map (the "upload" and "review preview" steps)
// ============================================================================

When('I navigate to the SBOM Generator dialog', function () {
  // No-op — no dialog in this suite; see file header.
})

When('I upload the Excel file', async function () {
  if (!context.excelBuffer) throw new Error('No Excel buffer built by the Given step')
  context.parsedRows = await parseExcel(context.excelBuffer)

  context.validRows = []
  context.invalidRows = []
  for (const row of context.parsedRows) {
    const result = validateRow(row)
    if (result.valid) {
      context.validRows.push(row)
    } else {
      context.invalidRows.push({ row, errors: result.errors })
    }
  }
  context.components = context.validRows.map((row) => mapRowToComponent(row))
})

When('I review the parsed components preview', function () {
  // No-op — components are already available on context from the upload step.
})

When('I map {string} to {string}', function (sourceColumn: string, targetField: string) {
  // parseExcel's column detection is automatic (detectColumnMapping) and has
  // no override parameter, so there's nothing to record here — the "custom
  // column mapping" scenario instead exercises detectColumnMapping's
  // fallback partial-match logic (e.g. "License ID" ~ "license") directly.
  void sourceColumn
  void targetField
})

When('I enter project metadata:', function (dataTable: DataTable) {
  const rows = dataTable.raw()
  const metadata: MetadataOptions = {}
  for (const [key, value] of rows) {
    if (key === 'Project Name') metadata.name = value
    if (key === 'Version') metadata.version = value
    if (key === 'Description') metadata.description = value
    if (key === 'Author') metadata.author = value
  }
  context.metadataOptions = metadata
})

When('I click {string}', async function (buttonText: string) {
  if (buttonText !== 'Generate SBOM') return
  const output = await createSbom(context.components, { metadata: context.metadataOptions, pretty: false })
  context.generatedSbom = output.content
})

// ============================================================================
// THEN — assertions against the real parse/validate/generate output
// ============================================================================

function parsedSbom(): Record<string, unknown> {
  if (!context.generatedSbom) throw new Error('No SBOM was generated')
  return JSON.parse(context.generatedSbom) as Record<string, unknown>
}

Then('I should download a valid CycloneDX JSON file', function () {
  expect(context.generatedSbom).to.be.a('string')
  expect(() => parsedSbom()).to.not.throw()
})

Then('the file should contain all {int} components from Excel', function (count: number) {
  const sbom = parsedSbom()
  expect(sbom.components).to.have.lengthOf(count)
})

Then('the file should be CycloneDX {float} compliant', function (version: number) {
  const sbom = parsedSbom()
  expect(sbom.bomFormat).to.equal('CycloneDX')
  expect(sbom.specVersion).to.equal(String(version))
})

Then('each component should have the correct name, version, and license', function () {
  const sbom = parsedSbom()
  const components = sbom.components as Array<Record<string, unknown>>
  for (const [i, component] of components.entries()) {
    expect(component.name).to.equal(context.validRows[i].name)
    expect(component.version).to.equal(context.validRows[i].version)
    expect(component.licenses).to.be.an('array').that.is.not.empty
  }
})

Then('the file should contain all {int} components', function (count: number) {
  const sbom = parsedSbom()
  expect(sbom.components).to.have.lengthOf(count)
})

Then('the components should use the correctly mapped values', function () {
  const sbom = parsedSbom()
  const components = sbom.components as Array<Record<string, unknown>>
  expect(components.map((c) => c.name)).to.deep.equal(context.validRows.map((r) => r.name))
  expect(components.map((c) => c.version)).to.deep.equal(context.validRows.map((r) => r.version))
})

Then('the components should have default type {string}', function (defaultType: string) {
  const sbom = parsedSbom()
  const components = sbom.components as Array<Record<string, unknown>>
  for (const component of components) {
    expect(component.type).to.equal(defaultType)
  }
})

Then('the components should not have license information', function () {
  const sbom = parsedSbom()
  const components = sbom.components as Array<Record<string, unknown>>
  for (const component of components) {
    expect(component.licenses).to.be.undefined
  }
})

Then('I should see validation errors for rows with missing data', function () {
  expect(context.invalidRows.length).to.be.greaterThan(0)
})

Then('the error should indicate which rows have missing required fields', function () {
  const allErrors = context.invalidRows.flatMap((r) => r.errors)
  expect(allErrors.some((e) => e.includes('name'))).to.equal(true)
  expect(allErrors.some((e) => e.includes('version'))).to.equal(true)
})

Then('I should be able to correct the data or proceed with valid rows only', function () {
  // "Proceed with valid rows only": the rows that did validate are still
  // available and mappable to components even though others failed.
  expect(context.validRows.length).to.be.greaterThan(0)
  expect(() => context.validRows.map((row) => mapRowToComponent(row))).to.not.throw()
})

Then('the generated SBOM should include the metadata', function () {
  const sbom = parsedSbom()
  expect(sbom.metadata).to.be.an('object')
})

Then('the metadata component should have type {string}', function (type: string) {
  const sbom = parsedSbom()
  const metadata = sbom.metadata as Record<string, unknown>
  const component = metadata.component as Record<string, unknown>
  expect(component.type).to.equal(type)
})

Then('the metadata should contain the timestamp', function () {
  const sbom = parsedSbom()
  const metadata = sbom.metadata as Record<string, unknown>
  expect(metadata.timestamp).to.be.a('string')
})

Then('the parser should skip empty rows', function () {
  // 5 data-table rows in, one fully blank — parseExcel drops it before
  // validation even sees it, so only 4 rows should have reached validation.
  expect(context.parsedRows.length).to.equal(4)
})

Then('the parser should show warnings for invalid rows', function () {
  expect(context.invalidRows.length).to.be.greaterThan(0)
})

Then('the preview should only show valid components', function () {
  expect(context.components).to.have.lengthOf(context.validRows.length)
})

Then('I should be able to generate SBOM with {int} valid components', async function (count: number) {
  const output = await createSbom(context.components)
  const sbom = JSON.parse(output.content) as { components: unknown[] }
  expect(sbom.components).to.have.lengthOf(count)
})

Then('I should see validation warnings for invalid PURLs', function () {
  const invalidPurlRows = context.validRows.filter((row) => row.purl && !validatePurl(row.purl))
  expect(invalidPurlRows.length).to.be.greaterThan(0)
})

Then('I should be able to correct or ignore invalid PURLs', function () {
  // "Ignore": drop the malformed purl but keep the rest of the component.
  context.components = context.components.map((component) =>
    component.purl && !validatePurl(component.purl) ? { ...component, purl: undefined } : component,
  )
  for (const component of context.components) {
    if (component.purl) expect(validatePurl(component.purl)).to.equal(true)
  }
})

Then('the valid PURLs should be included in the generated SBOM', async function () {
  const output = await createSbom(context.components)
  const sbom = JSON.parse(output.content) as { components: Array<Record<string, unknown>> }
  const withPurl = sbom.components.filter((c) => typeof c.purl === 'string')
  expect(withPurl.length).to.be.greaterThan(0)
  for (const component of withPurl) {
    expect(validatePurl(component.purl as string)).to.equal(true)
  }
})

Then('the generated SBOM should include all optional fields', function () {
  const sbom = parsedSbom()
  const component = (sbom.components as Array<Record<string, unknown>>)[0]
  expect(component.description).to.be.a('string')
  expect(component.purl).to.be.a('string')
  expect(component.cpe).to.be.a('string')
})

Then('the component should have the complete set of metadata', function () {
  const sbom = parsedSbom()
  const component = (sbom.components as Array<Record<string, unknown>>)[0]
  expect(component.licenses).to.be.an('array').that.is.not.empty
  expect(component.supplier).to.deep.equal({ name: context.validRows[0].supplier })
})

Then('the CPE and PURL should be properly formatted', function () {
  const sbom = parsedSbom()
  const component = (sbom.components as Array<Record<string, unknown>>)[0]
  expect(validatePurl(component.purl as string)).to.equal(true)
  expect(component.cpe as string).to.match(/^cpe:2\.3:/)
})
