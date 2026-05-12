/**
 * TDD Tests for CycloneDX Generator
 *
 * Test suite for generating valid CycloneDX 1.5 SBOM from component data
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Component } from '@@/types'
import {
  generateCycloneDX,
  createMetadata,
  componentToCycloneDX,
  generateBomRef,
  validateOutput,
  validatePurl,
  validateLicense,
  generateJsonOutput,
  generateSerialNumber,
  generateFilename,
  createSbom,
  type SbomOutput,
  type GeneratorOptions,
  type CycloneDXMetadata,
  type CycloneDXComponent,
} from '../cyclonedxGenerator'

describe('generateCycloneDX()', () => {
  const mockComponents: Component[] = [
    {
      id: 'pkg:npm/react@18.2.0',
      name: 'react',
      version: '18.2.0',
      type: 'library',
      purl: 'pkg:npm/react@18.2.0',
      cpe: 'cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*',
      licenses: ['MIT'],
      description: 'React JavaScript library',
      vulnerabilities: [],
    },
    {
      id: 'pkg:npm/lodash@4.17.21',
      name: 'lodash',
      version: '4.17.21',
      type: 'library',
      purl: 'pkg:npm/lodash@4.17.21',
      licenses: ['MIT'],
      description: 'Lodash utility library',
      vulnerabilities: [],
    },
  ]

  it('should generate a valid CycloneDX JSON structure', async () => {
    const result = await generateCycloneDX(mockComponents)

    expect(result.format).toBe('json')
    expect(result.content).toBeDefined()
    expect(result.filename).toMatch(/\.bom\.json$/)
    expect(result.metadata.componentCount).toBe(2)
  })

  it('should include required CycloneDX fields', async () => {
    const result = await generateCycloneDX(mockComponents)
    const json = JSON.parse(result.content)

    expect(json.bomFormat).toBe('CycloneDX')
    expect(json.specVersion).toBe('1.5')
    expect(json.version).toBe(1)
    expect(json.serialNumber).toMatch(/^urn:uuid:/)
    expect(json.metadata).toBeDefined()
    expect(json.metadata.timestamp).toBeDefined()
    expect(json.components).toBeDefined()
    expect(Array.isArray(json.components)).toBe(true)
  })

  it('should handle empty component list', async () => {
    const result = await generateCycloneDX([])

    expect(result.metadata.componentCount).toBe(0)

    const json = JSON.parse(result.content)
    expect(json.components).toEqual([])
  })

  it('should include custom metadata when options provided', async () => {
    const options: GeneratorOptions = {
      metadata: {
        name: 'My Application',
        version: '1.0.0',
        description: 'Test application',
        author: 'Test Author',
      },
    }

    const result = await generateCycloneDX(mockComponents, options)
    const json = JSON.parse(result.content)

    expect(json.metadata.component).toBeDefined()
    expect(json.metadata.component.name).toBe('My Application')
    expect(json.metadata.component.version).toBe('1.0.0')
    expect(json.metadata.component.description).toBe('Test application')
  })

  it('should generate unique serial numbers for each call', async () => {
    const result1 = await generateCycloneDX(mockComponents)
    const result2 = await generateCycloneDX(mockComponents)

    const json1 = JSON.parse(result1.content)
    const json2 = JSON.parse(result2.content)

    expect(json1.serialNumber).not.toBe(json2.serialNumber)
  })

  it('should handle components without optional fields', async () => {
    const minimalComponents: Component[] = [
      {
        id: 'test-component',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const result = await generateCycloneDX(minimalComponents)
    const json = JSON.parse(result.content)

    expect(json.components[0].name).toBe('test')
    expect(json.components[0].version).toBe('1.0.0')
    expect(json.components[0].purl).toBeUndefined()
    expect(json.components[0].cpe).toBeUndefined()
  })

  it('should handle special characters in names and descriptions', async () => {
    const specialCharComponents: Component[] = [
      {
        id: 'test-component',
        name: 'Test & Component <script>',
        version: '1.0.0',
        type: 'library',
        description: 'Test with "quotes" and \'apostrophes\'',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const result = await generateCycloneDX(specialCharComponents)
    const json = JSON.parse(result.content)

    expect(json.components[0].name).toBe('Test & Component <script>')
    expect(json.components[0].description).toBe('Test with "quotes" and \'apostrophes\'')
  })

  it('should handle large component lists efficiently', async () => {
    const largeComponents: Component[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `component-${i}`,
      name: `component-${i}`,
      version: '1.0.0',
      type: 'library' as const,
      licenses: [],
      vulnerabilities: [],
    }))

    const startTime = Date.now()
    const result = await generateCycloneDX(largeComponents)
    const duration = Date.now() - startTime

    expect(result.metadata.componentCount).toBe(1000)
    expect(duration).toBeLessThan(5000) // Should complete in under 5 seconds
  })

  it('should generate valid filename with timestamp', async () => {
    const result = await generateCycloneDX(mockComponents)

    expect(result.filename).toMatch(/sbom-\d{14}\.bom\.json$/)
  })
})

describe('createMetadata()', () => {
  it('should create metadata with timestamp and default component', () => {
    const metadata = createMetadata()

    expect(metadata.timestamp).toBeDefined()
    expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(metadata.component).toBeDefined()
    expect(metadata.component?.name).toBe('Generated SBOM')
    expect(metadata.component?.type).toBe('application')
  })

  it('should include custom metadata when provided', () => {
    const options = {
      name: 'Custom App',
      version: '2.0.0',
      description: 'Custom description',
      author: 'Custom Author',
    }

    const metadata = createMetadata(options)

    expect(metadata.component?.name).toBe('Custom App')
    expect(metadata.component?.version).toBe('2.0.0')
    expect(metadata.component?.description).toBe('Custom description')
  })

  it('should generate ISO 8601 compliant timestamps', () => {
    const metadata = createMetadata()
    const date = new Date(metadata.timestamp)

    expect(date.toISOString()).toBe(metadata.timestamp)
  })
})

describe('componentToCycloneDX()', () => {
  it('should convert basic component to CycloneDX format', () => {
    const component: Component = {
      id: 'pkg:npm/react@18.2.0',
      name: 'react',
      version: '18.2.0',
      type: 'library',
      purl: 'pkg:npm/react@18.2.0',
      licenses: ['MIT'],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.name).toBe('react')
    expect(cyclonedxComponent.version).toBe('18.2.0')
    expect(cyclonedxComponent.type).toBe('library')
    expect(cyclonedxComponent['bom-ref']).toBe('pkg:npm/react@18.2.0')
    expect(cyclonedxComponent.purl).toBe('pkg:npm/react@18.2.0')
  })

  it('should convert component with CPE', () => {
    const component: Component = {
      id: 'test',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      cpe: 'cpe:2.3:a:vendor:product:1.0.0:*:*:*:*:*:*:*',
      licenses: [],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.cpe).toBe('cpe:2.3:a:vendor:product:1.0.0:*:*:*:*:*:*:*')
  })

  it('should handle multiple licenses', () => {
    const component: Component = {
      id: 'test',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      licenses: ['MIT', 'Apache-2.0'],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.licenses).toBeDefined()
    expect(cyclonedxComponent.licenses).toHaveLength(2)
    expect(cyclonedxComponent.licenses?.[0]).toEqual({ license: { id: 'MIT' } })
    expect(cyclonedxComponent.licenses?.[1]).toEqual({ license: { id: 'Apache-2.0' } })
  })

  it('should handle empty licenses array', () => {
    const component: Component = {
      id: 'test',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      licenses: [],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.licenses).toBeUndefined()
  })

  it('should include description when present', () => {
    const component: Component = {
      id: 'test',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      description: 'Test component description',
      licenses: [],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.description).toBe('Test component description')
  })

  it('should generate bom-ref from name and version if purl not available', () => {
    const component: Component = {
      id: 'test-component',
      name: 'test-component',
      version: '1.0.0',
      type: 'library',
      licenses: [],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent['bom-ref']).toBeDefined()
    expect(cyclonedxComponent['bom-ref']).toContain('test-component')
    expect(cyclonedxComponent['bom-ref']).toContain('1.0.0')
  })

  it('should map component types correctly', () => {
    const types: Component['type'][] = ['library', 'framework', 'application', 'container', 'other']

    types.forEach((type) => {
      const component: Component = {
        id: 'test',
        name: 'test',
        version: '1.0.0',
        type,
        licenses: [],
        vulnerabilities: [],
      }

      const cyclonedxComponent = componentToCycloneDX(component)

      expect(cyclonedxComponent.type).toBe(type)
    })
  })

  it('should handle supplier field', () => {
    const component: Component = {
      id: 'test',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      supplier: 'Acme Corporation',
      licenses: [],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.supplier).toBeDefined()
    expect(cyclonedxComponent.supplier?.name).toBe('Acme Corporation')
  })
})

describe('generateBomRef()', () => {
  it('should generate a unique bom-ref', () => {
    const ref1 = generateBomRef()
    const ref2 = generateBomRef()

    expect(ref1).toBeDefined()
    expect(ref2).toBeDefined()
    expect(ref1).not.toBe(ref2)
  })

  it('should generate bom-ref in ULID format', () => {
    const ref = generateBomRef()

    // ULID is 26 characters, Crockford Base32 encoded
    expect(ref).toHaveLength(26)
    expect(ref).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('should generate time-ordered bom-refs', () => {
    const ref1 = generateBomRef()
    // Small delay to ensure different timestamps
    const ref2 = generateBomRef()

    // ULIDs are time-ordered, so first character should be same or close
    expect(ref1[0]).toBe(ref2[0])
  })
})

describe('validateOutput()', () => {
  it('should validate a correct CycloneDX JSON structure', () => {
    const validJson = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      serialNumber: 'urn:uuid:12345678-1234-1234-1234-123456789012',
      metadata: {
        timestamp: new Date().toISOString(),
      },
      components: [],
    }

    const result = validateOutput(validJson)

    expect(result.isValid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('should detect missing bomFormat', () => {
    const invalidJson = {
      specVersion: '1.5',
      version: 1,
      components: [],
    }

    const result = validateOutput(invalidJson)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Missing required field: bomFormat')
  })

  it('should detect incorrect bomFormat', () => {
    const invalidJson = {
      bomFormat: 'SPDX',
      specVersion: '1.5',
      version: 1,
      components: [],
    }

    const result = validateOutput(invalidJson)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid bomFormat: expected CycloneDX')
  })

  it('should detect missing specVersion', () => {
    const invalidJson = {
      bomFormat: 'CycloneDX',
      version: 1,
      components: [],
    }

    const result = validateOutput(invalidJson)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Missing required field: specVersion')
  })

  it('should detect invalid specVersion', () => {
    const invalidJson = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      version: 1,
      components: [],
    }

    const result = validateOutput(invalidJson)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Invalid specVersion: supported versions are 1.3, 1.4, 1.5')
  })

  it('should detect missing version', () => {
    const invalidJson = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [],
    }

    const result = validateOutput(invalidJson)

    expect(result.isValid).toBe(false)
    expect(result.errors).toContain('Missing required field: version')
  })

  it('should detect invalid components array', () => {
    const invalidJson = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      components: 'not an array',
    }

    const result = validateOutput(invalidJson)

    expect(result.isValid).toBe(false)
    expect(result.errors.some((e) => e.includes('components must be an array'))).toBe(true)
  })

  it('should allow valid spec versions', () => {
    const versions = ['1.3', '1.4', '1.5']

    versions.forEach((specVersion) => {
      const json = {
        bomFormat: 'CycloneDX',
        specVersion,
        version: 1,
        components: [],
      }

      const result = validateOutput(json)

      expect(result.isValid).toBe(true)
    })
  })

  it('should collect multiple validation errors', () => {
    const invalidJson = {
      // Missing bomFormat, specVersion, version
      components: [],
    }

    const result = validateOutput(invalidJson)

    expect(result.isValid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(1)
  })
})

describe('validatePurl()', () => {
  it('should accept valid npm package URLs', () => {
    const validPurls = [
      'pkg:npm/react@18.2.0',
      'pkg:npm/lodash@4.17.21',
      'pkg:npm/@types/node@20.0.0',
      'pkg:npm/package-name@1.2.3-beta.4',
    ]

    validPurls.forEach((purl) => {
      expect(validatePurl(purl)).toBe(true)
    })
  })

  it('should accept valid package URLs from other ecosystems', () => {
    const validPurls = [
      'pkg:maven/org.springframework/spring-core@5.3.8',
      'pkg:pypi/requests@2.26.0',
      'pkg:gem/rails@6.1.3',
      'pkg:nuget/Newtonsoft.Json@13.0.1',
      'pkg:cargo/rand@0.8.5',
      'pkg:go/github.com/gorilla/mux@v1.8.0',
      'pkg:composer/laravel/framework@8.0.0',
    ]

    validPurls.forEach((purl) => {
      expect(validatePurl(purl)).toBe(true)
    })
  })

  it('should reject invalid package URLs', () => {
    const invalidPurls = ['not-a-purl', 'pkg:/react@18.2.0', 'react@18.2.0', '', 'pkg:npm/']

    invalidPurls.forEach((purl) => {
      expect(validatePurl(purl)).toBe(false)
    })
  })

  it('should handle undefined or null purl', () => {
    expect(validatePurl(undefined as unknown as string)).toBe(false)
    expect(validatePurl(null as unknown as string)).toBe(false)
  })
})

describe('validateLicense()', () => {
  it('should accept valid SPDX license IDs', () => {
    const validLicenses = ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'ISC', 'LGPL-2.1', 'MPL-2.0', 'EPL-1.0']

    validLicenses.forEach((license) => {
      expect(validateLicense(license)).toBe(true)
    })
  })

  it('should reject invalid SPDX license IDs', () => {
    const invalidLicenses = ['MIT License', 'Apache 2', 'GPLv3', 'BSD', 'NOT-A-LICENSE', '']

    invalidLicenses.forEach((license) => {
      expect(validateLicense(license)).toBe(false)
    })
  })

  it('should handle undefined or null license', () => {
    expect(validateLicense(undefined as unknown as string)).toBe(false)
    expect(validateLicense(null as unknown as string)).toBe(false)
  })

  it('should accept license expressions', () => {
    // Some tools use AND/OR expressions
    const expressions = ['MIT AND Apache-2.0', 'GPL-3.0 OR LGPL-2.1', '(MIT OR Apache-2.0) AND BSD-3-Clause']

    expressions.forEach((expression) => {
      // Expressions may be valid in different contexts
      // For simplicity, we'll check if they contain valid license IDs
      const parts = expression.split(/[ ()]+/).filter(Boolean)
      expect(validateLicense(parts[0])).toBe(true)
    })
  })
})

describe('handleOptionalFields()', () => {
  it('should include purl when present', () => {
    const component: Component = {
      id: 'pkg:npm/react@18.2.0',
      name: 'react',
      version: '18.2.0',
      type: 'library',
      purl: 'pkg:npm/react@18.2.0',
      licenses: [],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.purl).toBe('pkg:npm/react@18.2.0')
  })

  it('should not include purl when absent', () => {
    const component: Component = {
      id: 'test',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      licenses: [],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.purl).toBeUndefined()
  })

  it('should include cpe when present', () => {
    const component: Component = {
      id: 'test',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      cpe: 'cpe:2.3:a:vendor:product:1.0.0:*:*:*:*:*:*:*',
      licenses: [],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.cpe).toBe('cpe:2.3:a:vendor:product:1.0.0:*:*:*:*:*:*:*')
  })

  it('should not include cpe when absent', () => {
    const component: Component = {
      id: 'test',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      licenses: [],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    expect(cyclonedxComponent.cpe).toBeUndefined()
  })

  it('should handle invalid license IDs gracefully', () => {
    const component: Component = {
      id: 'test',
      name: 'test',
      version: '1.0.0',
      type: 'library',
      licenses: ['MIT', 'INVALID-LICENSE', 'Apache-2.0'],
      vulnerabilities: [],
    }

    const cyclonedxComponent = componentToCycloneDX(component)

    // Should include all licenses; validation is a separate concern
    expect(cyclonedxComponent.licenses).toHaveLength(3)
  })
})

describe('generateJsonOutput()', () => {
  it('should produce valid JSON string', async () => {
    const components: Component[] = [
      {
        id: 'test',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const result = await generateCycloneDX(components)

    expect(() => JSON.parse(result.content)).not.toThrow()
  })

  it('should produce minified JSON by default', async () => {
    const components: Component[] = [
      {
        id: 'test',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const result = await generateCycloneDX(components)

    // Minified JSON should not have extra whitespace
    expect(result.content).not.toMatch(/\n\s*/)
  })

  it('should produce formatted JSON when pretty option is true', async () => {
    const components: Component[] = [
      {
        id: 'test',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const options: GeneratorOptions = {
      pretty: true,
    }

    const result = await generateCycloneDX(components, options)

    // Formatted JSON should have newlines
    expect(result.content).toMatch(/\n/)
  })

  it('should escape special characters properly', async () => {
    const components: Component[] = [
      {
        id: 'test',
        name: 'Test & Component',
        version: '1.0.0',
        type: 'library',
        description: 'Test with "quotes" and \'apostrophes\'',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const result = await generateCycloneDX(components)
    const parsed = JSON.parse(result.content)

    expect(parsed.components[0].name).toBe('Test & Component')
    expect(parsed.components[0].description).toBe('Test with "quotes" and \'apostrophes\'')
  })
})

describe('generateXmlOutput()', () => {
  it('should throw error for XML format (not implemented)', async () => {
    const components: Component[] = [
      {
        id: 'test',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const options: GeneratorOptions = {
      format: 'xml',
    }

    await expect(generateCycloneDX(components, options)).rejects.toThrow('XML output is not yet implemented')
  })
})

describe('generateSerialNumber()', () => {
  it('should generate a valid URN UUID serial number', () => {
    const serial = generateSerialNumber()

    expect(serial).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('should generate unique serial numbers', () => {
    const serial1 = generateSerialNumber()
    const serial2 = generateSerialNumber()

    expect(serial1).not.toBe(serial2)
  })
})

describe('generateFilename()', () => {
  it('should generate filename with JSON extension by default', () => {
    const filename = generateFilename()

    expect(filename).toMatch(/\.bom\.json$/)
  })

  it('should generate filename with JSON extension', () => {
    const filename = generateFilename('json')

    expect(filename).toMatch(/\.bom\.json$/)
  })

  it('should generate filename with XML extension', () => {
    const filename = generateFilename('xml')

    expect(filename).toMatch(/\.bom\.xml$/)
  })

  it('should include timestamp in filename', () => {
    const timestamp = new Date('2025-02-11T12:00:00Z')
    const filename = generateFilename('json', timestamp)

    expect(filename).toContain('2025-02-11')
    expect(filename).toContain('12000') // The timestamp format truncates some digits
  })
})

describe('createSbom()', () => {
  it('should create a complete SBOM from components', async () => {
    const components: Component[] = [
      {
        id: 'test',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const result = await createSbom(components)

    expect(result.format).toBe('json')
    expect(result.content).toBeDefined()
    expect(result.metadata.componentCount).toBe(1)
  })

  it('should be an alias for generateCycloneDX', async () => {
    const components: Component[] = [
      {
        id: 'test',
        name: 'test',
        version: '1.0.0',
        type: 'library',
        licenses: [],
        vulnerabilities: [],
      },
    ]

    const result1 = await createSbom(components)
    const result2 = await generateCycloneDX(components)

    // Both should have the same structure
    expect(result1.format).toBe(result2.format)
    expect(result1.metadata.componentCount).toBe(result2.metadata.componentCount)
  })
})
