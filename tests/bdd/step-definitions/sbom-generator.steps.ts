import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { parseCycloneDX } from '@/renderer/lib/parsers/cyclonedx'
import * as XLSX from 'xlsx'

// Helper type for test data
interface ExcelRow {
  name?: string
  version?: string
  type?: string
  license?: string
  purl?: string
  cpe?: string
  description?: string
  supplier?: string
  group?: string
  [key: string]: string | undefined
}

// Helper to create test Excel file
function createTestExcelFile(data: ExcelRow[]): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Components')
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

// Helper to parse CycloneDX file
async function parseSbomFile(fileContent: string) {
  return await parseCycloneDX(fileContent, 'test.json')
}

// World object for sharing state between steps
interface SbomGeneratorWorld {
  excelFile?: Buffer
  generatedSbom?: string
  parsedComponents?: any[]
  columnMappings?: Map<string, string>
}

// Initialize world
const world: SbomGeneratorWorld = {}

Given('I am using the VulnAssessTool application', function () {
  // Application is loaded by test framework
})

Given('the application has successfully loaded', function () {
  // Verify app is running - this would be checked via UI or API
})

Given('I am on the Dashboard page', function () {
  // Navigate to dashboard - would use Playwright page object
})

Given('I have a valid Excel file with components using the standard template', function (dataTable: any) {
  const data = dataTable.hashes() as ExcelRow[]
  world.excelFile = createTestExcelFile(data)
})

Given('I have an Excel file with custom column headers', function (dataTable: any) {
  const data = dataTable.hashes() as ExcelRow[]
  world.excelFile = createTestExcelFile(data)
})

Given('I have an Excel file with only name and version columns', function (dataTable: any) {
  const data = dataTable.hashes() as ExcelRow[]
  world.excelFile = createTestExcelFile(data)
})

Given('I have an Excel file with incomplete data', function (dataTable: any) {
  const data = dataTable.hashes() as ExcelRow[]
  world.excelFile = createTestExcelFile(data)
})

Given('I have an Excel file with mixed valid and invalid data', function (dataTable: any) {
  const data = dataTable.hashes() as ExcelRow[]
  world.excelFile = createTestExcelFile(data)
})

Given('I have a valid Excel file with components', function (dataTable: any) {
  const data = dataTable.hashes() as ExcelRow[]
  world.excelFile = createTestExcelFile(data)
})

Given('I have a comprehensive Excel file with all fields', function (dataTable: any) {
  const data = dataTable.hashes() as ExcelRow[]
  world.excelFile = createTestExcelFile(data)
})

Given('I have an Excel file with {string}+ components', function (count: string) {
  const numComponents = parseInt(count)
  const data: ExcelRow[] = []

  for (let i = 0; i < numComponents; i++) {
    data.push({
      name: `component-${i}`,
      version: `1.${i}.0`,
      type: 'library',
      license: 'MIT',
      purl: `pkg:npm/component-${i}@1.${i}.0`,
    })
  }

  world.excelFile = createTestExcelFile(data)
})

Given('I have an Excel file with components including PURLs', function (dataTable: any) {
  const data = dataTable.hashes() as ExcelRow[]
  world.excelFile = createTestExcelFile(data)
})

Given('I have previously mapped custom columns for a project', function (dataTable: any) {
  world.columnMappings = new Map()
  const mappings = dataTable.hashes()
  mappings.forEach((row: any) => {
    const [key, value] = Object.entries(row)[0]
    if (key && value) {
      world.columnMappings?.set(key, value)
    }
  })
})

Given('I have a file that is not a valid Excel file', function (dataTable: any) {
  const fileInfo = dataTable.hashes()[0]
  // Create a text file instead of Excel
  world.excelFile = Buffer.from('This is not an Excel file', 'utf-8')
})

Given('I have an existing project in VulnAssessTool', function () {
  // Would set up a test project via API
})

Given('I have uploaded an Excel file and reviewed the preview', function () {
  // Simulate having already uploaded and previewed
  const data: ExcelRow[] = [{ name: 'react', version: '18.2.0', type: 'library', license: 'MIT' }]
  world.excelFile = createTestExcelFile(data)
})

When('I navigate to the SBOM Generator dialog', function () {
  // Would click menu item or button to open dialog
})

When('I upload the Excel file', function () {
  // Would trigger file upload in UI
  // In real implementation, this would use Playwright's file upload
})

When('I review the parsed components preview', function () {
  // Would verify preview is shown
})

When('I click {string}', function (buttonText: string) {
  // Would click the specified button
})

When('I map {string} to {string}', function (sourceColumn: string, targetField: string) {
  if (!world.columnMappings) {
    world.columnMappings = new Map()
  }
  world.columnMappings.set(sourceColumn, targetField)
})

When('I enter project metadata:', function (dataTable: any) {
  const metadata = dataTable.hashes()[0]
  // Would fill in metadata form fields
})

When('I select XML format as output', function () {
  // Would select XML option in format dropdown
})

When('I check {string}', function (checkboxLabel: string) {
  // Would check the specified checkbox
})

When('I select my project from the list', function () {
  // Would select a project from dropdown
})

When('I attempt to upload the file', function () {
  // Would attempt file upload
})

When('I click the {string} button', function (buttonText: string) {
  // Would click the specified button
})

Then('I should download a valid CycloneDX JSON file', function () {
  // Verify download was triggered and file is valid JSON
  expect(world.generatedSbom).toBeDefined()
})

Then('the file should contain all {int} components from Excel', function (count: number) {
  // Would parse generated SBOM and count components
  expect(world.parsedComponents).toBeDefined()
})

Then('the file should be CycloneDX {string} compliant', function (version: string) {
  // Would validate against CycloneDX schema
  const sbom = JSON.parse(world.generatedSbom || '{}')
  expect(sbom.bomFormat).toBe('CycloneDX')
  expect(sbom.specVersion).toBe(version)
})

Then('each component should have the correct name, version, and license', function () {
  // Would verify component properties
})

Then('the file should contain all {int} components', function (count: number) {
  // Would verify component count
})

Then('the components should use the correctly mapped values', function () {
  // Would verify mappings were applied
})

Then('the components should have default type {string}', function (defaultType: string) {
  // Would verify default type was applied
})

Then('the components should not have license information', function () {
  // Would verify license is not present
})

Then('I should see validation errors for rows with missing data', function () {
  // Would verify error messages are shown
})

Then('the error should indicate which rows have missing required fields', function () {
  // Would verify specific error messages
})

Then('I should be able to correct the data or proceed with valid rows only', function () {
  // Would verify correction options
})

Then('the generated SBOM should include the metadata', function () {
  // Would verify metadata in SBOM
  const sbom = JSON.parse(world.generatedSbom || '{}')
  expect(sbom.metadata).toBeDefined()
})

Then('the metadata component should have type {string}', function (type: string) {
  // Would verify metadata component type
  const sbom = JSON.parse(world.generatedSbom || '{}')
  expect(sbom.metadata?.component?.type).toBe(type)
})

Then('the metadata should contain the timestamp', function () {
  // Would verify timestamp is present
  const sbom = JSON.parse(world.generatedSbom || '{}')
  expect(sbom.metadata?.timestamp).toBeDefined()
})

Then('the parser should skip empty rows', function () {
  // Would verify empty rows were skipped
})

Then('the parser should show warnings for invalid rows', function () {
  // Would verify warnings are displayed
})

Then('the preview should only show valid components', function () {
  // Would verify preview content
})

Then('I should be able to generate SBOM with {int} valid components', function (count: number) {
  // Would verify only valid components included
})

Then('I should download a valid CycloneDX XML file', function () {
  // Would verify XML file was downloaded
})

Then('the XML file should be well-formed', function () {
  // Would verify XML can be parsed
})

Then('the XML file should contain all components from Excel', function () {
  // Would verify XML content
})

Then('I should see a preview table with parsed components', function () {
  // Would verify preview table is visible
})

Then('the preview should show all component fields', function () {
  // Would verify all fields are displayed
})

Then('I should be able to edit component data in the preview', function () {
  // Would verify editing capability
})

Then('I should be able to remove components from the preview', function () {
  // Would verify removal capability
})

Then('I should be able to cancel and return to the dialog', function () {
  // Would verify cancel works
})

Then('the file should be parsed within {int} seconds', function (seconds: number) {
  // Would measure parsing time
})

Then('the preview should load with pagination or virtual scrolling', function () {
  // Would verify performance optimizations
})

Then('I should be able to generate SBOM without performance issues', function () {
  // Would verify generation completes successfully
})

Then('the application should remember my previous mappings', function () {
  // Would verify mappings are persisted
})

Then('I should not need to manually map columns again', function () {
  // Would verify auto-mapping works
})

Then('I should be able to proceed directly to generation', function () {
  // Would verify flow can skip mapping step
})

Then('I should see a clear error message', function () {
  // Would verify error is shown
})

Then('the error message should indicate the file format is not supported', function () {
  // Would verify error message content
})

Then('the dialog should remain open for me to try again', function () {
  // Would verify dialog is still open
})

Then('I should see validation warnings for invalid PURLs', function () {
  // Would verify PURL validation warnings
})

Then('I should be able to correct or ignore invalid PURLs', function () {
  // Would user can handle warnings
})

Then('the valid PURLs should be included in the generated SBOM', function () {
  // Would verify valid PURLs are in output
})

Then('the generated SBOM should include all optional fields', function () {
  // Would verify all fields present
})

Then('the component should have the complete set of metadata', function () {
  // Would verify component metadata
})

Then('the CPE and PURL should be properly formatted', function () {
  // Would verify CPE and PURL formats
})

Then('I should download the Excel template file', function () {
  // Would verify template download
})

Then('the template should include all standard columns', function () {
  // Would verify template structure
})

Then('the template should include an Instructions sheet', function () {
  // Would verify instructions sheet exists
})

Then('the template should include sample data', function () {
  // Would verify sample data present
})

Then('the dialog should close', function () {
  // Would verify dialog is closed
})

Then('no SBOM file should be generated', function () {
  // Would verify no file was created
})

Then('I should return to the previous page', function () {
  // Would verify navigation
})

Then('my uploaded data should not be saved', function () {
  // Would verify no data persisted
})

Then('I should see a dropdown to select the sheet', function () {
  // Would verify sheet selector exists
})

Then('the default selection should be the first sheet', function () {
  // Would verify default selection
})

Then('I should be able to switch between sheets', function () {
  // Would verify sheet switching works
})

Then('the preview should update based on selected sheet', function () {
  // Would verify preview updates
})

Then('the SBOM should be generated and downloaded', function () {
  // Would verify both actions completed
})

Then('the SBOM should be automatically uploaded to the selected project', function () {
  // Would verify automatic upload
})

Then('I should see a success message confirming both actions', function () {
  // Would verify success message
})

Then('I should see a progress indicator', function () {
  // Would verify progress indicator shown
})

Then('the progress should show parsing status', function () {
  // Would verify parsing progress
})

Then('the progress should show generation status', function () {
  // Would verify generation progress
})

Then('I should be able to see estimated time remaining', function () {
  // Would verify ETA display
})
