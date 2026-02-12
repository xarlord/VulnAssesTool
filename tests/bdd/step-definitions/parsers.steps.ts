/**
 * BDD Step Definitions for SBOM Parsers
 * Tests the CycloneDX and SPDX parsers using actual implementation
 * Following Red-Green-Refactor TDD cycle
 */

import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import {
  parseCycloneDX,
  validateCycloneDX,
  getCycloneDXVersion,
} from '../../../vuln-assess-tool/src/renderer/lib/parsers/cyclonedx'
import {
  parseSpdx,
  validateSpdx,
  getSpdxVersion,
  isSpdxFile,
} from '../../../vuln-assess-tool/src/renderer/lib/parsers/spdx'
import type { Component, Vulnerability } from '@@/types'

// Test context to store state between steps
interface TestContext {
  fileContent: string
  filename: string
  components?: Component[]
  vulnerabilities?: Vulnerability[]
  metadata?: {
    format: string
    formatVersion: string
    componentCount: number
  }
  error?: Error
  validationResult?: boolean
  version?: string | null
  isSpdx?: boolean
}

const context: TestContext = {
  fileContent: '',
  filename: '',
}

// ============================================================================
// GIVEN STEPS - SBOM File Content Setup
// ============================================================================

Given('a valid CycloneDX JSON file {string}', (filename: string) => {
  context.filename = filename
  context.fileContent = JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: '2024-01-15T10:00:00Z',
      component: {
        type: 'application',
        'bom-ref': 'pkg:npm/my-app@1.0.0',
        name: 'my-app',
        version: '1.0.0',
      },
    },
    components: [
      {
        type: 'library',
        'bom-ref': 'pkg:npm/express@4.18.0',
        name: 'express',
        version: '4.18.0',
        licenses: [{ expression: 'MIT' }],
        purl: 'pkg:npm/express@4.18.0',
      },
      {
        type: 'library',
        'bom-ref': 'pkg:npm/lodash@4.17.21',
        name: 'lodash',
        version: '4.17.21',
        licenses: [{ license: { id: 'MIT' } }],
        purl: 'pkg:npm/lodash@4.17.21',
      },
    ],
  }, null, 2)
})

Given('a CycloneDX file with component dependencies', () => {
  context.filename = 'bom-with-deps.json'
  context.fileContent = JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    components: [
      {
        type: 'application',
        'bom-ref': 'pkg:npm/my-app@1.0.0',
        name: 'my-app',
        version: '1.0.0',
        components: [
          {
            type: 'library',
            'bom-ref': 'pkg:npm/express@4.18.0',
            name: 'express',
            version: '4.18.0',
            purl: 'pkg:npm/express@4.18.0',
          },
          {
            type: 'library',
            'bom-ref': 'pkg:npm/lodash@4.17.21',
            name: 'lodash',
            version: '4.17.21',
            purl: 'pkg:npm/lodash@4.17.21',
          },
        ],
      },
    ],
  }, null, 2)
})

Given('a CycloneDX file with vulnerability information', () => {
  context.filename = 'bom-with-vulns.json'
  context.fileContent = JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    components: [
      {
        type: 'library',
        'bom-ref': 'pkg:npm/express@4.18.0',
        name: 'express',
        version: '4.18.0',
        purl: 'pkg:npm/express@4.18.0',
      },
    ],
    vulnerabilities: [
      {
        id: 'CVE-2023-12345',
        source: {
          name: 'NVD',
          url: 'https://nvd.nist.gov/vuln/detail/CVE-2023-12345',
        },
        ratings: [
          {
            severity: 'HIGH',
            score: 7.5,
            method: 'CVSSv31',
            vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N',
          },
        ],
        description: 'A vulnerability in express',
        affects: [{ ref: 'pkg:npm/express@4.18.0' }],
        published: '2023-01-15T10:00:00Z',
        modified: '2023-01-20T10:00:00Z',
      },
    ],
  }, null, 2)
})

Given('a CycloneDX component with SHA-256 hash', () => {
  context.filename = 'bom-with-hash.json'
  context.fileContent = JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    components: [
      {
        type: 'library',
        'bom-ref': 'pkg:npm/express@4.18.0',
        name: 'express',
        version: '4.18.0',
        purl: 'pkg:npm/express@4.18.0?hash=sha256%3Aabc123def456',
        hash: [
          {
            alg: 'SHA-256',
            content: 'abc123def4567890123456789012345678901234567890123456789012345678',
          },
        ],
      },
    ],
  }, null, 2)
})

Given('a valid SPDX JSON file {string}', (filename: string) => {
  context.filename = filename
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'my-project',
    documentNamespace: 'https://example.com/my-project',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name: 'express',
        versionInfo: '4.18.0',
        downloadLocation: 'https://registry.npmjs.org/express',
        filesAnalyzed: false,
        licenseConcluded: 'MIT',
        licenseDeclared: 'MIT',
        externalRefs: [
          {
            referenceCategory: 'PACKAGE_MANAGER',
            referenceType: 'purl',
            referenceLocator: 'pkg:npm/express@4.18.0',
          },
        ],
      },
    ],
  }, null, 2)
})

Given('an SPDX file with {int} packages', (packageCount: number) => {
  context.filename = `bom-${packageCount}-packages.spdx.json`

  const packages = Array.from({ length: packageCount }, (_, i) => ({
    SPDXID: `SPDXRef-Package-${i}`,
    name: `package-${i}`,
    versionInfo: `${i + 1}.0.0`,
    downloadLocation: 'https://example.com',
    filesAnalyzed: false,
    licenseConcluded: 'MIT',
  }))

  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'multi-package-project',
    documentNamespace: 'https://example.com/test',
    packages,
  }, null, 2)
})

Given('an SPDX package with version {string}', (version: string) => {
  context.filename = 'bom-version.spdx.json'
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name: 'my-package',
        versionInfo: version,
        downloadLocation: 'https://example.com',
        filesAnalyzed: false,
        licenseConcluded: 'MIT',
      },
    ],
  }, null, 2)
})

Given('an SPDX package with license {string}', (license: string) => {
  context.filename = 'bom-license.spdx.json'
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name: 'my-package',
        versionInfo: '1.0.0',
        downloadLocation: 'https://example.com',
        filesAnalyzed: false,
        licenseConcluded: license,
        licenseDeclared: license,
      },
    ],
  }, null, 2)
})

Given('an SPDX package with license {string}', (licenseExpression: string) => {
  context.filename = 'bom-license-expression.spdx.json'
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name: 'my-package',
        versionInfo: '1.0.0',
        downloadLocation: 'https://example.com',
        filesAnalyzed: false,
        licenseConcluded: licenseExpression,
        licenseDeclared: licenseExpression,
      },
    ],
  }, null, 2)
})

Given('an SPDX package with purl {string}', (purl: string) => {
  context.filename = 'bom-purl.spdx.json'
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name: 'express',
        versionInfo: '4.18.0',
        downloadLocation: 'https://registry.npmjs.org/express',
        filesAnalyzed: false,
        licenseConcluded: 'MIT',
        externalRefs: [
          {
            referenceCategory: 'PACKAGE_MANAGER',
            referenceType: 'purl',
            referenceLocator: purl,
          },
        ],
      },
    ],
  }, null, 2)
})

Given('an SPDX package with CPE {string}', (cpe: string) => {
  context.filename = 'bom-cpe.spdx.json'
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name: 'nginx',
        versionInfo: '1.18.0',
        downloadLocation: 'https://nginx.org',
        filesAnalyzed: false,
        licenseConcluded: 'BSD-2-Clause',
        externalRefs: [
          {
            referenceCategory: 'SECURITY',
            referenceType: 'cpe23Type',
            referenceLocator: cpe,
          },
        ],
      },
    ],
  }, null, 2)
})

Given('an SPDX package with description {string}', (description: string) => {
  context.filename = 'bom-description.spdx.json'
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name: 'nginx',
        versionInfo: '1.18.0',
        downloadLocation: 'https://nginx.org',
        filesAnalyzed: false,
        licenseConcluded: 'BSD-2-Clause',
        description,
      },
    ],
  }, null, 2)
})

Given('an SPDX package with download location {string}', (location: string) => {
  context.filename = 'bom-download.spdx.json'
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name: 'express',
        versionInfo: '4.18.0',
        downloadLocation: location,
        filesAnalyzed: false,
        licenseConcluded: 'MIT',
      },
    ],
  }, null, 2)
})

Given('an SPDX file with invalid JSON', () => {
  context.filename = 'invalid.spdx.json'
  context.fileContent = '{ this is not valid json }'
})

Given('a file with dataLicense {string}', (license: string) => {
  context.filename = 'test.spdx.json'
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: license,
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [],
  }, null, 2)
})

Given('an SPDX file with spdxVersion {string}', (version: string) => {
  context.filename = 'version-test.spdx.json'
  context.fileContent = JSON.stringify({
    spdxVersion: version,
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name: 'test-package',
        versionInfo: '1.0.0',
        downloadLocation: 'https://example.com',
        filesAnalyzed: false,
        licenseConcluded: 'MIT',
      },
    ],
  }, null, 2)
})

Given('package name {string} and version {string}', (name: string, version: string) => {
  // Store for use in component ID generation test
  context.filename = `${name}-${version}.spdx.json`
  context.fileContent = JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'test-project',
    documentNamespace: 'https://example.com/test',
    packages: [
      {
        SPDXID: 'SPDXRef-Package-1',
        name,
        versionInfo: version,
        downloadLocation: 'https://example.com',
        filesAnalyzed: false,
        licenseConcluded: 'MIT',
      },
    ],
  }, null, 2)
})

// ============================================================================
// WHEN STEPS - Parsing Operations
// ============================================================================

When('I parse the file', async () => {
  try {
    if (context.filename.endsWith('.json') && context.fileContent.includes('CycloneDX')) {
      const result = await parseCycloneDX(context.fileContent, context.filename)
      context.components = result.components
      context.vulnerabilities = result.vulnerabilities
      context.metadata = result.metadata
    } else if (context.filename.endsWith('.json')) {
      const result = await parseSpdx(context.fileContent, context.filename)
      context.components = result.components
      context.vulnerabilities = result.vulnerabilities
      context.metadata = result.metadata
    } else if (context.filename.endsWith('.xml')) {
      const result = await parseCycloneDX(context.fileContent, context.filename)
      context.components = result.components
      context.vulnerabilities = result.vulnerabilities
      context.metadata = result.metadata
    }
  } catch (error) {
    context.error = error as Error
  }
})

When('I attempt to parse', async () => {
  try {
    if (context.filename.includes('spdx')) {
      await parseSpdx(context.fileContent, context.filename)
    } else {
      await parseCycloneDX(context.fileContent, context.filename)
    }
  } catch (error) {
    context.error = error as Error
  }
})

When('I validate the file', async () => {
  if (context.filename.includes('cyclonedx') || context.fileContent.includes('CycloneDX')) {
    context.validationResult = await validateCycloneDX(context.fileContent, context.filename)
  } else if (context.filename.includes('spdx')) {
    context.validationResult = await validateSpdx(context.fileContent, context.filename)
  }
})

When('I check if it\'s an SPDX file', () => {
  context.isSpdx = isSpdxFile(context.fileContent, context.filename)
})

When('I get the version', () => {
  if (context.filename.includes('spdx') || context.fileContent.includes('SPDX')) {
    context.version = getSpdxVersion(context.fileContent, context.filename)
  } else {
    context.version = getCycloneDXVersion(context.fileContent, context.filename)
  }
})

When('generating component ID', async () => {
  // Parse to get the component with generated ID
  if (context.filename.includes('spdx')) {
    const result = await parseSpdx(context.fileContent, context.filename)
    context.components = result.components
  } else {
    const result = await parseCycloneDX(context.fileContent, context.filename)
    context.components = result.components
  }
})

// ============================================================================
// THEN STEPS - Verify Extracted Components
// ============================================================================

Then('components should be extracted', () => {
  expect(context.components).toBeDefined()
  expect(context.components?.length).toBeGreaterThan(0)
})

Then('format should be {string}', (expectedFormat: string) => {
  expect(context.metadata?.format).toBe(expectedFormat)
})

Then('format should be {string}', (expectedFormat: string) => {
  expect(context.metadata?.format).toBe(expectedFormat)
})

Then('all components should be extracted', () => {
  expect(context.components?.length).toBeGreaterThan(0)
})

Then('dependencies should be tracked', () => {
  // Check if nested components are extracted
  const hasNestedComponents = context.components?.some(c =>
    c.name === 'express' || c.name === 'lodash'
  )
  expect(hasNestedComponents).toBe(true)
})

Then('vulnerabilities should be extracted', () => {
  expect(context.vulnerabilities).toBeDefined()
  expect(context.vulnerabilities?.length).toBeGreaterThan(0)
})

Then('component-vulnerability links should be established', () => {
  const vuln = context.vulnerabilities?.[0]
  expect(vuln?.affectedComponents).toBeDefined()
  expect(vuln?.affectedComponents.length).toBeGreaterThan(0)
})

Then('component hash should be extracted', () => {
  const component = context.components?.find(c => c.name === 'express')
  expect(component?.hash).toBeDefined()
  expect(component?.hash?.length).toBeGreaterThan(0)
})

Then('{int} components should be extracted', (expectedCount: number) => {
  expect(context.components?.length).toBe(expectedCount)
})

Then('component count should be {int}', (expectedCount: number) => {
  expect(context.metadata?.componentCount).toBe(expectedCount)
})

Then('component version should be {string}', (expectedVersion: string) => {
  const component = context.components?.[0]
  expect(component?.version).toBe(expectedVersion)
})

Then('component licenses should include {string}', (expectedLicense: string) => {
  const component = context.components?.[0]
  expect(component?.licenses).toContain(expectedLicense)
})

Then('both {string} and {string} should be extracted', (license1: string, license2: string) => {
  const component = context.components?.[0]
  expect(component?.licenses).toContain(license1)
  expect(component?.licenses).toContain(license2)
})

Then('component purl should be {string}', (expectedPurl: string) => {
  const component = context.components?.[0]
  expect(component?.purl).toBe(expectedPurl)
})

Then('component CPE should be set', () => {
  const component = context.components?.[0]
  expect(component?.cpe).toBeDefined()
  expect(component?.cpe?.length).toBeGreaterThan(0)
})

Then('component description should be {string}', (expectedDescription: string) => {
  const component = context.components?.[0]
  expect(component?.description).toBe(expectedDescription)
})

Then('component type should be {string}', (expectedType: string) => {
  const component = context.components?.[0]
  expect(component?.type).toBe(expectedType)
})

Then('ID should be {string}', (expectedId: string) => {
  const component = context.components?.[0]
  expect(component?.id).toBe(expectedId)
})

Then('an error should be thrown', () => {
  expect(context.error).toBeDefined()
})

Then('error should indicate invalid JSON', () => {
  expect(context.error?.message).toMatch(/invalid|json/i)
})

Then('validation should succeed', () => {
  expect(context.validationResult).toBe(true)
})

Then('result should be {string}', (expectedResult: string) => {
  expect(context.isSpdx).toBe(expectedResult === 'true')
})

Then('version should be {string}', (expectedVersion: string) => {
  expect(context.version).toBe(expectedVersion)
})

Then('format version should be detected', () => {
  expect(context.metadata?.formatVersion).toBeDefined()
  expect(context.metadata?.formatVersion.length).toBeGreaterThan(0)
})
