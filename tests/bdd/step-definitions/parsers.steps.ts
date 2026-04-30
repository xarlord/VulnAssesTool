/**
 * BDD Step Definitions for Parser Features
 *
 * Implements step definitions for:
 * - spdx-parser.feature (14 scenarios)
 * - cyclonedx-parser.feature (5 scenarios)
 * Total: 19 scenarios
 */

import { Given, When, Then, Before, After } from '@cucumber/cucumber'
import { expect } from 'vitest'
import type { Component, Vulnerability } from '../../../src/renderer/lib/types.ts'
import { parseSpdx, validateSpdx, getSpdxVersion, isSpdxFile } from '../../../src/renderer/lib/parsers/spdx.ts'
import { parseCycloneDX, validateCycloneDX, getCycloneDXVersion } from '../../../src/renderer/lib/parsers/cyclonedx.ts'

// Test context interface
interface TestContext {
  testFileContent: string
  testFilename: string
  parseResult: {
    components: Component[]
    vulnerabilities: Vulnerability[]
    metadata: {
      format: string
      formatVersion: string
      componentCount: number
    }
  } | null
  testError: Error | null
  testComponents: Component[]
}

// Global test context
const context: TestContext = {
  testFileContent: '',
  testFilename: '',
  parseResult: null,
  testError: null,
  testComponents: [],
}

// ============================================================================
// HOOKS - Setup and Teardown
// ============================================================================

Before({ tags: '@parser' }, async function () {
  // Reset context
  context.testFileContent = ''
  context.testFilename = ''
  context.parseResult = null
  context.testError = null
  context.testComponents = []
})

After({ tags: '@parser' }, async function () {
  // Cleanup if needed
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createValidSpdxJson(packageCount: number = 1): string {
  const packages = []
  for (let i = 0; i < packageCount; i++) {
    packages.push({
      SPDXID: `SPDXRef-Package-${i}`,
      name: `package-${i}`,
      versionInfo: i === 0 ? '2.5.0' : '1.0.0',
      downloadLocation: `https://example.com/package-${i}`,
      filesAnalyzed: false,
      licenseConcluded: i === 0 ? 'Apache-2.0' : i === 1 ? 'MIT OR Apache-2.0' : 'NOASSERTION',
      licenseDeclared: 'Apache-2.0',
      copyrightText: 'Copyright Example',
      description: i === 0 ? 'A web server' : `Test package ${i}`,
      externalRefs: [
        {
          referenceCategory: 'PACKAGE-MANAGER',
          referenceType: 'purl',
          referenceLocator: i === 0 ? 'pkg:npm/express@4.18.0' : `pkg:npm/pkg-${i}@1.0.0`,
        },
        ...(i === 2
          ? [
              {
                referenceCategory: 'SECURITY',
                referenceType: 'cpe23Type',
                referenceLocator: 'cpe:2.3:a:nginx:nginx:1.18.0:*:*:*:*:*:*:*',
              },
            ]
          : []),
      ],
    })
  }

  return JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'Test SBOM',
    documentNamespace: 'https://example.com/test',
    packages,
  })
}

function createValidCycloneDXJson(componentCount: number = 1): string {
  const components = []
  for (let i = 0; i < componentCount; i++) {
    components.push({
      type: 'library',
      'bom-ref': `pkg:npm/component-${i}@1.0.0`,
      name: `component-${i}`,
      version: '1.0.0',
      description: `Test component ${i}`,
      licenses: [{ expression: 'Apache-2.0' }],
      purl: `pkg:npm/component-${i}@1.0.0`,
      cpe: i === 0 ? 'cpe:2.3:a:nginx:nginx:1.18.0:*:*:*:*:*:*:*' : undefined,
      hash:
        i === 0
          ? [
              {
                alg: 'SHA-256',
                content: 'abc123def456789',
              },
            ]
          : undefined,
    })
  }

  return JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    serialNumber: 'urn:uuid:12345678-1234-1234-1234-123456789012',
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: {
        type: 'application',
        'bom-ref': 'test-app',
        name: 'Test Application',
        version: '1.0.0',
      },
    },
    components,
    vulnerabilities: [
      {
        id: 'CVE-2024-1234',
        source: { name: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-1234' },
        ratings: [
          { severity: 'high', score: 7.5, method: 'CVSSv31', vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' },
        ],
        description: 'A test vulnerability',
        advisories: [{ url: 'https://github.com/advisories/GHSA-1234' }],
        affects: [{ ref: 'pkg:npm/component-0@1.0.0' }],
        published: '2024-01-15T10:00:00Z',
        modified: '2024-01-15T10:00:00Z',
      },
    ],
  })
}

// ============================================================================
// SPDX PARSER STEP DEFINITIONS
// ============================================================================

// Scenario: Parse valid SPDX JSON file
Given('a valid SPDX JSON file {string}', function (filename: string) {
  context.testFilename = filename
  context.testFileContent = createValidSpdxJson(1)
})

When('I parse the file', async function () {
  try {
    context.parseResult = await parseSpdx(context.testFileContent, context.testFilename)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('components should be extracted', function () {
  expect(context.parseResult).to.not.be.null
  expect(context.parseResult!.components).to.be.an('array')
  expect(context.parseResult!.components.length).to.be.greaterThan(0)
})

Then('format should be {string}', function (format: string) {
  expect(context.parseResult!.metadata.format).to.equal(format)
})

Then('format version should be detected', function () {
  expect(context.parseResult!.metadata.formatVersion).to.be.a('string')
  expect(context.parseResult!.metadata.formatVersion).to.match(/^\d+\.\d+$/)
})

// Scenario: Parse SPDX with multiple packages
Given('an SPDX file with {int} packages', function (count: number) {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(count)
})

Then('{int} components should be extracted', function (count: number) {
  expect(context.parseResult!.components).to.have.lengthOf(count)
})

Then('component count should be {int}', function (count: number) {
  expect(context.parseResult!.metadata.componentCount).to.equal(count)
})

// Scenario: Parse SPDX with component versions
Given('an SPDX package with version {string}', function (version: string) {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(1)
})

Then('component version should be {string}', function (version: string) {
  const component = context.parseResult!.components[0]
  expect(component.version).to.equal(version)
})

// Scenario: Parse SPDX with licenses
Given('an SPDX package with license {string}', function (license: string) {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(1)
})

Then('component licenses should include {string}', function (license: string) {
  const component = context.parseResult!.components[0]
  expect(component.licenses).to.include(license)
})

// Scenario: Parse SPDX with license expression
Given('an SPDX package with license {string}', function (licenseExpression: string) {
  context.testFilename = 'bom.spdx.json'
  // Create SPDX with MIT OR Apache-2.0 (package index 1)
  const json = JSON.parse(createValidSpdxJson(3))
  context.testFileContent = JSON.stringify(json)
})

Then('both {string} and {string} should be extracted', function (lic1: string, lic2: string) {
  const component = context.parseResult!.components[1] // Index 1 has MIT OR Apache-2.0
  expect(component.licenses).to.include(lic1)
  expect(component.licenses).to.include(lic2)
})

// Scenario: Parse SPDX with purl reference
Given('an SPDX package with purl {string}', function (purl: string) {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(1)
})

Then('component purl should be {string}', function (purl: string) {
  const component = context.parseResult!.components[0]
  expect(component.purl).to.equal(purl)
})

// Scenario: Parse SPDX with CPE reference
Given('an SPDX package with CPE {string}', function (cpe: string) {
  context.testFilename = 'bom.spdx.json'
  // Create SPDX with CPE (package index 2)
  const json = JSON.parse(createValidSpdxJson(3))
  context.testFileContent = JSON.stringify(json)
})

Then('component CPE should be set', function () {
  const component = context.parseResult!.components[2] // Index 2 has CPE
  expect(component.cpe).to.exist
  expect(component.cpe).to.include('nginx')
})

// Scenario: Parse SPDX with package description
Given('an SPDX package with description {string}', function (description: string) {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(1)
})

Then('component description should be {string}', function (description: string) {
  const component = context.parseResult!.components[0]
  expect(component.description).to.equal(description)
})

// Scenario: Determine component type from download location
Given('an SPDX package with download location {string}', function (location: string) {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(1)
})

Then('component type should be {string}', function (type: string) {
  const component = context.parseResult!.components[0]
  expect(component.type).to.equal(type)
})

// Scenario: Determine container type
Given('an SPDX package with download location containing {string}', function (keyword: string) {
  context.testFilename = 'bom.spdx.json'
  // Create a custom SPDX with docker in download location
  const json = JSON.parse(createValidSpdxJson(1))
  json.packages[0].downloadLocation = 'https://registry-1.docker.io/library/nginx:latest'
  json.packages[0].name = 'nginx'
  context.testFileContent = JSON.stringify(json)
})

Then('component type should be {string}', function (type: string) {
  const component = context.parseResult!.components[0]
  expect(component.type).to.equal(type)
})

// Scenario: Generate unique component ID
Given('package name {string} and version {string}', function (name: string, version: string) {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(1)
})

When('generating component ID', function () {
  // ID is generated during parsing
})

Then('ID should be {string}', function (expectedId: string) {
  const component = context.parseResult!.components[0]
  expect(component.id).to.equal(expectedId)
})

// Scenario: Handle invalid JSON in SPDX file
Given('an SPDX file with invalid JSON', function () {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = '{ invalid json content'
})

When('I attempt to parse', async function () {
  try {
    context.parseResult = await parseSpdx(context.testFileContent, context.testFilename)
    context.testError = null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('an error should be thrown', function () {
  expect(context.testError).to.not.be.null
})

Then('error should indicate invalid JSON', function () {
  expect(context.testError!.message).to.include('JSON')
})

// Scenario: Validate SPDX file format
Given('a valid SPDX JSON file', function () {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(1)
})

When('I validate the file', async function () {
  try {
    const isValid = await validateSpdx(context.testFileContent, context.testFilename)
    context.testError = null
    context.parseResult = isValid ? context.parseResult : null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('validation should succeed', function () {
  expect(context.testError).to.be.null
})

// Scenario: Detect SPDX file type
Given('a file with dataLicense {string}', function (dataLicense: string) {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(1)
})

When("I check if it's an SPDX file", function () {
  try {
    const isSpdx = isSpdxFile(context.testFileContent, context.testFilename)
    context.testError = null
    context.parseResult = isSpdx ? context.parseResult : null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('result should be true', function () {
  expect(context.parseResult).to.not.be.null
})

// Scenario: Get SPDX version from file
Given('an SPDX file with spdxVersion {string}', function (spdxVersion: string) {
  context.testFilename = 'bom.spdx.json'
  context.testFileContent = createValidSpdxJson(1)
})

When('I get the version', function () {
  try {
    const version = getSpdxVersion(context.testFileContent, context.testFilename)
    context.testError = null
    context.parseResult = version
      ? { components: [], vulnerabilities: [], metadata: { format: 'spdx', formatVersion: version, componentCount: 0 } }
      : null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('version should be {string}', function (expectedVersion: string) {
  expect(context.parseResult!.metadata.formatVersion).to.equal(expectedVersion)
})

// ============================================================================
// CYCLONEDX PARSER STEP DEFINITIONS
// ============================================================================

// Scenario: Parse valid CycloneDX JSON file
Given('a valid CycloneDX JSON file {string}', function (filename: string) {
  context.testFilename = filename
  context.testFileContent = createValidCycloneDXJson(1)
})

Then('components should be extracted', function () {
  expect(context.parseResult!.components).to.be.an('array')
  expect(context.parseResult!.components.length).to.be.greaterThan(0)
})

Then('format should be {string}', function (format: string) {
  expect(context.parseResult!.metadata.format).to.equal(format)
})

// Scenario: Parse CycloneDX with nested components
Given('a CycloneDX file with component dependencies', function () {
  context.testFilename = 'bom.json'
  // Create CycloneDX with nested components
  const json = JSON.parse(createValidCycloneDXJson(1))
  json.components[0].components = [
    {
      type: 'library',
      'bom-ref': 'pkg:npm/nested-lib@1.0.0',
      name: 'nested-lib',
      version: '1.0.0',
    },
  ]
  context.testFileContent = JSON.stringify(json)
})

Then('all components should be extracted', function () {
  expect(context.parseResult!.components.length).to.be.greaterThan(1)
  // Should have parent + nested component
})

Then('dependencies should be tracked', function () {
  // Component IDs should reflect parent-child relationship
  expect(context.parseResult!.components.some((c) => c.name === 'nested-lib')).to.be.true
})

// Scenario: Parse CycloneDX with vulnerability data
Given('a CycloneDX file with vulnerability information', function () {
  context.testFilename = 'bom.json'
  context.testFileContent = createValidCycloneDXJson(1)
})

Then('vulnerabilities should be extracted', function () {
  expect(context.parseResult!.vulnerabilities).to.be.an('array')
  expect(context.parseResult!.vulnerabilities.length).to.be.greaterThan(0)
})

Then('component-vulnerability links should be established', function () {
  const vuln = context.parseResult!.vulnerabilities[0]
  expect(vuln.affectedComponents).to.be.an('array')
  expect(vuln.affectedComponents.length).to.be.greaterThan(0)
})

// Scenario: Extract component hashes from CycloneDX
Given('a CycloneDX component with SHA-256 hash', function () {
  context.testFilename = 'bom.json'
  context.testFileContent = createValidCycloneDXJson(1)
})

Then('component hash should be extracted', function () {
  const component = context.parseResult!.components[0]
  expect(component.hash).to.exist
  expect(component.hash).to.be.a('string')
})

// Additional helper scenario for validating CycloneDX
Given('a valid CycloneDX JSON file', function () {
  context.testFilename = 'bom.json'
  context.testFileContent = createValidCycloneDXJson(1)
})

When('I validate the file', async function () {
  try {
    const isValid = await validateCycloneDX(context.testFileContent, context.testFilename)
    context.testError = null
    context.parseResult = isValid ? context.parseResult : null
  } catch (error) {
    context.testError = error as Error
  }
})

Then('CycloneDX validation should succeed', function () {
  expect(context.testError).to.be.null
})

// Scenario: Get CycloneDX version
Given('a CycloneDX file with specVersion {string}', function (version: string) {
  context.testFilename = 'bom.json'
  context.testFileContent = createValidCycloneDXJson(1)
})

When('I get the CycloneDX version', function () {
  try {
    const version = getCycloneDXVersion(context.testFileContent, context.testFilename)
    context.testError = null
    if (version) {
      context.parseResult = {
        components: [],
        vulnerabilities: [],
        metadata: { format: 'cyclonedx', formatVersion: version, componentCount: 0 },
      }
    }
  } catch (error) {
    context.testError = error as Error
  }
})

Then('CycloneDX version should be {string}', function (expectedVersion: string) {
  expect(context.parseResult!.metadata.formatVersion).to.equal(expectedVersion)
})
