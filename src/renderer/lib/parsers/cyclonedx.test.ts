import { describe, it, expect } from 'vitest'
import { parseCycloneDX, validateCycloneDX, getCycloneDXVersion } from './cyclonedx'
import type { Component } from '@@/types'

// fast-xml-parser is intentionally NOT mocked: these tests feed real XML strings through the real
// parser so the XML path is exercised end-to-end (FR-02.1). The former mock pre-flattened the
// parser output, which hid the real container-shape bugs — see cyclonedx.xml.test.ts.

describe('parseCycloneDX', () => {
  describe('JSON format', () => {
    const validJsonBom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      metadata: {
        timestamp: '2024-01-01T00:00:00Z',
        component: {
          type: 'application',
          name: 'TestApp',
          version: '1.0.0',
        },
      },
      components: [
        {
          type: 'library',
          'bom-ref': 'pkg:npm/lodash@4.17.21',
          name: 'lodash',
          version: '4.17.21',
          purl: 'pkg:npm/lodash@4.17.21',
          licenses: [
            {
              license: {
                id: 'MIT',
              },
            },
          ],
          cpe: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
          description: 'A modern JavaScript utility library',
        },
        {
          type: 'framework',
          name: 'React',
          version: '18.2.0',
          purl: 'pkg:npm/react@18.2.0',
          licenses: [
            {
              expression: 'MIT',
            },
          ],
        },
      ],
    }

    it('should parse valid CycloneDX JSON', async () => {
      const result = await parseCycloneDX(JSON.stringify(validJsonBom), 'bom.json')

      expect(result.components).toHaveLength(2)
      expect(result.metadata.format).toBe('cyclonedx')
      expect(result.metadata.formatVersion).toBe('1.5')
      expect(result.metadata.componentCount).toBe(2)
    })

    it('should correctly map component properties', async () => {
      const result = await parseCycloneDX(JSON.stringify(validJsonBom), 'bom.json')
      const lodashComponent = result.components[0]

      expect(lodashComponent.name).toBe('lodash')
      expect(lodashComponent.version).toBe('4.17.21')
      expect(lodashComponent.type).toBe('library')
      expect(lodashComponent.purl).toBe('pkg:npm/lodash@4.17.21')
      expect(lodashComponent.cpe).toBe('cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*')
      expect(lodashComponent.licenses).toContain('MIT')
      expect(lodashComponent.description).toBe('A modern JavaScript utility library')
      expect(lodashComponent.vulnerabilities).toEqual([])
    })

    it('should handle components with license expressions', async () => {
      const result = await parseCycloneDX(JSON.stringify(validJsonBom), 'bom.json')
      const reactComponent = result.components[1]

      expect(reactComponent.licenses).toContain('MIT')
    })

    it('should throw error for invalid JSON', async () => {
      await expect(parseCycloneDX('invalid json', 'bom.json')).rejects.toThrow('Invalid JSON format')
    })

    it('should throw error for non-CycloneDX JSON', async () => {
      const nonCycloneDX = { someField: 'value' }
      await expect(parseCycloneDX(JSON.stringify(nonCycloneDX), 'bom.json')).rejects.toThrow(
        'Invalid CycloneDX format: missing bomFormat',
      )
    })

    it('should handle components without optional fields', async () => {
      const minimalBom = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [
          {
            type: 'library',
            name: 'minimal-lib',
            version: '1.0.0',
          },
        ],
      }

      const result = await parseCycloneDX(JSON.stringify(minimalBom), 'bom.json')
      const component = result.components[0]

      expect(component.name).toBe('minimal-lib')
      expect(component.purl).toBeUndefined()
      expect(component.cpe).toBeUndefined()
      expect(component.licenses).toEqual([])
      expect(component.description).toBeUndefined()
    })
  })

  describe('XML format', () => {
    const validXmlBom = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5" version="1">
  <metadata>
    <timestamp>2024-01-01T00:00:00Z</timestamp>
  </metadata>
  <components>
    <component type="library">
      <name>lodash</name>
      <version>4.17.21</version>
      <purl>pkg:npm/lodash@4.17.21</purl>
      <cpe>cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*</cpe>
      <description>A modern JavaScript utility library</description>
      <licenses>
        <license>
          <id>MIT</id>
        </license>
      </licenses>
    </component>
    <component type="framework">
      <name>React</name>
      <version>18.2.0</version>
      <purl>pkg:npm/react@18.2.0</purl>
      <licenses>
        <expression>MIT</expression>
      </licenses>
    </component>
  </components>
</bom>`

    it('should parse valid CycloneDX XML', async () => {
      const result = await parseCycloneDX(validXmlBom, 'bom.xml')

      expect(result.components).toHaveLength(2)
      expect(result.metadata.format).toBe('cyclonedx')
      expect(result.metadata.formatVersion).toBe('1.5')
      expect(result.metadata.componentCount).toBe(2)
    })

    it('should correctly map XML component properties', async () => {
      const result = await parseCycloneDX(validXmlBom, 'bom.xml')
      const lodashComponent = result.components[0]

      expect(lodashComponent.name).toBe('lodash')
      expect(lodashComponent.version).toBe('4.17.21')
      expect(lodashComponent.type).toBe('library')
      expect(lodashComponent.purl).toBe('pkg:npm/lodash@4.17.21')
      expect(lodashComponent.cpe).toBe('cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*')
      expect(lodashComponent.licenses).toContain('MIT')
      expect(lodashComponent.description).toBe('A modern JavaScript utility library')
    })

    it('should throw error for invalid XML', async () => {
      await expect(parseCycloneDX('invalid xml', 'bom.xml')).rejects.toThrow()
    })

    it('should throw error for unsupported file format', async () => {
      await expect(parseCycloneDX('some content', 'bom.txt')).rejects.toThrow('Unsupported file format: txt')
    })

    it('should handle simple XML with single component', async () => {
      const simpleXml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components>
    <component type="library">
      <name>test-lib</name>
      <version>1.0.0</version>
    </component>
  </components>
</bom>`

      const result = await parseCycloneDX(simpleXml, 'bom.xml')
      expect(result.components).toHaveLength(1)
      expect(result.components[0].name).toBe('test-lib')
    })
  })

  describe('nested components', () => {
    it('should extract nested components from JSON', async () => {
      const bomWithNested = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [
          {
            type: 'application',
            name: 'ParentApp',
            version: '1.0.0',
            components: [
              {
                type: 'library',
                name: 'ChildLib',
                version: '2.0.0',
              },
            ],
          },
        ],
      }

      const result = await parseCycloneDX(JSON.stringify(bomWithNested), 'bom.json')

      expect(result.components).toHaveLength(2)
      expect(result.components[0].name).toBe('ParentApp')
      expect(result.components[1].name).toBe('ChildLib')
      expect(result.components[1].id).toContain(result.components[0].id)
    })
  })

  describe('component type mapping', () => {
    it('should map all CycloneDX component types correctly', async () => {
      const typeMappings: Record<string, Component['type']> = {
        library: 'library',
        framework: 'framework',
        application: 'application',
        container: 'container',
        platform: 'other',
        device: 'other',
        firmware: 'other',
        file: 'other',
      }

      for (const [inputType, expectedType] of Object.entries(typeMappings)) {
        const bom = {
          bomFormat: 'CycloneDX',
          specVersion: '1.5',
          components: [
            {
              type: inputType,
              name: `test-${inputType}`,
              version: '1.0.0',
            },
          ],
        }

        const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
        expect(result.components[0].type).toBe(expectedType)
      }
    })
  })
})

describe('validateCycloneDX', () => {
  const validBom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    components: [],
  }

  it('should return true for valid CycloneDX JSON', async () => {
    const result = await validateCycloneDX(JSON.stringify(validBom), 'bom.json')
    expect(result).toBe(true)
  })

  it('should return false for invalid JSON', async () => {
    const result = await validateCycloneDX('invalid json', 'bom.json')
    expect(result).toBe(false)
  })

  it('should return false for non-CycloneDX format', async () => {
    const result = await validateCycloneDX(JSON.stringify({ other: 'format' }), 'bom.json')
    expect(result).toBe(false)
  })

  it('should return true for valid CycloneDX XML', async () => {
    const validXml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components>
    <component type="library">
      <name>test</name>
      <version>1.0.0</version>
    </component>
  </components>
</bom>`
    const result = await validateCycloneDX(validXml, 'bom.xml')
    expect(result).toBe(true)
  })

  it('should return false for invalid XML', async () => {
    const result = await validateCycloneDX('invalid xml', 'bom.xml')
    expect(result).toBe(false)
  })
})

describe('getCycloneDXVersion', () => {
  it('should return version from JSON', () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.4',
      components: [],
    }
    expect(getCycloneDXVersion(JSON.stringify(bom), 'bom.json')).toBe('1.4')
  })

  it('should return version from XML', () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5" version="1.4">
  <components></components>
</bom>`
    expect(getCycloneDXVersion(xml, 'bom.xml')).toBe('1.4')
  })

  it('should return null for invalid content', () => {
    expect(getCycloneDXVersion('invalid', 'bom.json')).toBe(null)
  })

  it('should return null when version is not specified', () => {
    const bom = {
      bomFormat: 'CycloneDX',
      components: [],
    }
    expect(getCycloneDXVersion(JSON.stringify(bom), 'bom.json')).toBe(null)
  })
})

describe('component ID generation', () => {
  it('should generate unique IDs for components', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [
        { type: 'library', name: 'lib1', version: '1.0.0' },
        { type: 'library', name: 'lib2', version: '1.0.0' },
        { type: 'library', name: 'lib1', version: '2.0.0' },
      ],
    }

    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    const ids = result.components.map((c) => c.id)

    expect(new Set(ids).size).toBe(3)
  })

  it('should handle special characters in component names', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [{ type: 'library', name: '@scope/package-name', version: '1.0.0' }],
    }

    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.components[0].id).toContain('-scope-package-name-1')
  })
})

describe('getCycloneDXVersion edge cases', () => {
  it('should return null when XML bom element has no version attribute', () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components></components>
</bom>`
    expect(getCycloneDXVersion(xml, 'bom.xml')).toBe(null)
  })

  it('should return null when XML parsing fails', () => {
    const invalidXml = '<?xml version="1.0"?><unclosed>'
    expect(getCycloneDXVersion(invalidXml, 'bom.xml')).toBe(null)
  })

  it('should return null for unknown file extension', () => {
    const content = JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.4' })
    expect(getCycloneDXVersion(content, 'bom.txt')).toBe(null)
  })

  it('should return null when JSON parse throws error', () => {
    const badJson = '{ invalid json }'
    expect(getCycloneDXVersion(badJson, 'bom.json')).toBe(null)
  })
})

describe('parseCycloneDX nested components', () => {
  it('should handle components with nested components (XML format)', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components>
    <component type="library">
      <name>parent-lib</name>
      <version>1.0.0</version>
      <components>
        <component type="library">
          <name>child-lib</name>
          <version>2.0.0</version>
        </component>
      </components>
    </component>
  </components>
</bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.components.length).toBeGreaterThanOrEqual(1)
    expect(result.components[0].name).toBe('parent-lib')
  })

  it('should handle XML with vulnerabilities', async () => {
    const xmlWithVulns = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components>
    <component type="library">
      <name>test-lib</name>
      <version>1.0.0</version>
    </component>
  </components>
  <vulnerabilities>
    <vulnerability>
      <id>CVE-2024-1234</id>
      <source>
        <name>NVD</name>
      </source>
      <ratings>
        <rating>
          <severity>high</severity>
          <score>7.5</score>
          <method>CVSSv31</method>
        </rating>
      </ratings>
      <description>A test vulnerability</description>
      <advisories>
        <advisory>
          <url>https://nvd.nist.gov/vuln/detail/CVE-2024-1234</url>
        </advisory>
      </advisories>
    </vulnerability>
  </vulnerabilities>
</bom>`

    const result = await parseCycloneDX(xmlWithVulns, 'bom.xml')
    expect(result.vulnerabilities).toHaveLength(1)
    expect(result.vulnerabilities[0].id).toBe('CVE-2024-1234')
    expect(result.vulnerabilities[0].severity).toBe('high')
  })

  it('should handle XML with hash values', async () => {
    const xmlWithHash = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components>
    <component type="library">
      <name>hashed-lib</name>
      <version>1.0.0</version>
      <hashes>
        <hash alg="SHA-256">abc123def456</hash>
      </hashes>
    </component>
  </components>
</bom>`

    const result = await parseCycloneDX(xmlWithHash, 'bom.xml')
    expect(result.components[0].hash).toBe('abc123def456')
  })

  it('should handle deeply nested component structures (JSON format)', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [
        {
          type: 'library',
          name: 'parent',
          version: '1.0.0',
          components: [
            {
              type: 'library',
              name: 'child',
              version: '2.0.0',
              components: [
                {
                  type: 'library',
                  name: 'grandchild',
                  version: '3.0.0',
                },
              ],
            },
          ],
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.components.length).toBeGreaterThan(0)
  })
})

describe('Vulnerability Parsing - Severity Coverage', () => {
  it('should parse JSON vulnerability with MEDIUM severity', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-MEDIUM',
          source: { name: 'NVD' },
          ratings: [{ severity: 'medium', score: 5.5, vector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:L/A:N' }],
          description: 'Medium vuln',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].severity).toBe('medium')
    expect(result.vulnerabilities[0].cvssScore).toBe(5.5)
  })

  it('should parse JSON vulnerability with LOW severity', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-LOW',
          source: { name: 'NVD' },
          ratings: [{ severity: 'low', score: 2.1 }],
          description: 'Low vuln',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].severity).toBe('low')
  })

  it('should parse JSON vulnerability with NONE severity', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-NONE',
          source: { name: 'NVD' },
          ratings: [{ severity: 'none' }],
          description: 'None vuln',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].severity).toBe('none')
  })

  it('should map an unknown/unrated severity string to none', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-UNKNOWN',
          source: { name: 'NVD' },
          ratings: [{ severity: 'informational' }],
          description: 'Unknown severity vuln',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].severity).toBe('none')
  })

  it('should parse JSON vulnerability with OSV source', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'OSV-2024-001',
          source: { name: 'OSV' },
          ratings: [{ severity: 'high', score: 7.5 }],
          description: 'OSV vuln',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].source).toBe('osv')
    expect(result.vulnerabilities[0].references[0].url).toContain('osv.dev')
    expect(result.vulnerabilities[0].references[0].source).toBe('OSV')
  })

  it('should parse JSON vulnerability with affected components', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-AFFECTS',
          source: { name: 'NVD' },
          ratings: [{ severity: 'high' }],
          description: 'Vuln with affects',
          affects: [{ ref: 'pkg:npm/lodash@4.17.21' }, { ref: 'pkg:npm/express@4.18.0' }],
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].affectedComponents).toEqual(['pkg:npm/lodash@4.17.21', 'pkg:npm/express@4.18.0'])
  })

  it('should add source URL when no advisories present', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-NO-ADVISORY',
          source: { name: 'NVD' },
          ratings: [{ severity: 'high' }],
          description: 'Vuln without advisories',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].references).toHaveLength(1)
    expect(result.vulnerabilities[0].references[0].url).toBe('https://nvd.nist.gov/vuln/detail/CVE-2024-NO-ADVISORY')
    expect(result.vulnerabilities[0].references[0].tags).toContain('official')
  })

  it('should not duplicate source URL when advisory already contains it', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-DUP',
          source: { name: 'NVD' },
          ratings: [{ severity: 'high' }],
          description: 'Vuln with duplicate advisory',
          advisories: [{ url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-DUP' }],
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    const urls = result.vulnerabilities[0].references.map((r) => r.url)
    const nvdUrlCount = urls.filter((u) => u === 'https://nvd.nist.gov/vuln/detail/CVE-2024-DUP').length
    expect(nvdUrlCount).toBe(1)
  })

  it('should filter out empty affected component refs', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-EMPTY-REF',
          source: { name: 'NVD' },
          ratings: [{ severity: 'high' }],
          description: 'Vuln with empty refs',
          affects: [{ ref: 'pkg:npm/valid@1.0' }, { ref: '' }, { ref: undefined }],
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].affectedComponents).toEqual(['pkg:npm/valid@1.0'])
  })

  it('should parse vulnerability with published and modified dates', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-DATES',
          source: { name: 'NVD' },
          ratings: [{ severity: 'high' }],
          description: 'Vuln with dates',
          published: '2024-01-15T10:00:00Z',
          modified: '2024-02-20T12:30:00Z',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].publishedAt).toEqual(new Date('2024-01-15T10:00:00Z'))
    expect(result.vulnerabilities[0].modifiedAt).toEqual(new Date('2024-02-20T12:30:00Z'))
  })

  it('should parse vulnerability with no description', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-NODESC',
          source: { name: 'NVD' },
          ratings: [{ severity: 'low' }],
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].description).toBe('')
  })

  it('should handle unknown vulnerability source gracefully', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'VULN-UNKNOWN-SRC',
          source: { name: 'unknown-source' },
          ratings: [{ severity: 'medium' }],
          description: 'Vuln from unknown source',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].source).toBe('nvd')
  })

  it('should default to NVD when no source provided', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-NOSRC',
          ratings: [{ severity: 'high' }],
          description: 'No source',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].source).toBe('nvd')
    expect(result.vulnerabilities[0].references[0].source).toBe('NVD')
  })
})

describe('parseCycloneDX coverage/provenance', () => {
  it('reads vat:coverage/source/note properties emitted by the binary catalogers', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [
        {
          type: 'library',
          name: 'libcrypto',
          properties: [
            { name: 'vat:coverage', value: 'gap' },
            { name: 'vat:source', value: 'elf-inventory,probe' },
            { name: 'vat:note', value: 'present; version not in binary' },
          ],
        },
      ],
    }
    const { components } = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(components[0].coverage).toBe('gap')
    expect(components[0].provenanceSources).toEqual(['elf-inventory', 'probe'])
    expect(components[0].coverageNote).toBe('present; version not in binary')
  })

  it('leaves version empty and derives coverage=gap for a versionless component', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [{ type: 'library', name: 'toybox' }],
    }
    const { components } = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    // Not the truthy sentinel 'unknown' — downstream `if (!version)` guards must fire.
    expect(components[0].version).toBe('')
    expect(components[0].coverage).toBe('gap')
  })

  it('derives coverage=identified when a version is present and no property overrides it', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [{ type: 'library', name: 'sqlite', version: '3.44.3' }],
    }
    const { components } = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(components[0].coverage).toBe('identified')
  })

  it('keeps a stable name-unknown id for a purl-less versionless component', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [{ type: 'library', name: 'toybox' }],
    }
    const { components } = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    // ID retains the 'unknown' placeholder (VEX affects-refs key off it) even though version is ''.
    expect(components[0].id).toBe('toybox-unknown')
  })
})

describe('component hash extraction (regression: hash must not come from purl)', () => {
  it('reads hash from the JSON hashes[] array, not the purl version', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [
        {
          type: 'library',
          name: 'lodash',
          version: '4.17.21',
          purl: 'pkg:npm/lodash@4.17.21',
          hashes: [{ alg: 'SHA-256', content: 'deadbeefcafe' }],
        },
      ],
    }
    const { components } = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    // Before the fix this evaluated to '4.17.21' (the purl version) instead of a real hash.
    expect(components[0].hash).toBe('deadbeefcafe')
    expect(components[0].hash).not.toBe(components[0].version)
  })

  it('leaves hash undefined when no hashes are present (JSON)', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [
        {
          type: 'library',
          name: 'lodash',
          version: '4.17.21',
          purl: 'pkg:npm/lodash@4.17.21',
        },
      ],
    }
    const { components } = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(components[0].hash).toBeUndefined()
  })

  it('reads hash from the XML hashes/hash element, not the purl version', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components>
    <component type="library">
      <name>lodash</name>
      <version>4.17.21</version>
      <purl>pkg:npm/lodash@4.17.21</purl>
      <hashes>
        <hash alg="SHA-256">deadbeefcafe</hash>
      </hashes>
    </component>
  </components>
</bom>`
    const { components } = await parseCycloneDX(xml, 'bom.xml')
    expect(components[0].hash).toBe('deadbeefcafe')
    expect(components[0].hash).not.toBe(components[0].version)
  })

  it('leaves hash undefined when no hashes are present (XML)', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components>
    <component type="library">
      <name>lodash</name>
      <version>4.17.21</version>
      <purl>pkg:npm/lodash@4.17.21</purl>
    </component>
  </components>
</bom>`
    const { components } = await parseCycloneDX(xml, 'bom.xml')
    expect(components[0].hash).toBeUndefined()
  })
})

describe('CycloneDX specVersion support 1.0-1.5 (CR-03.1)', () => {
  it.each(['1.0', '1.3', '1.5'])('parses JSON components under specVersion %s', async (specVersion) => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion,
      components: [
        {
          type: 'library',
          name: 'lodash',
          version: '4.17.21',
          purl: 'pkg:npm/lodash@4.17.21',
          licenses: [{ license: { id: 'MIT' } }],
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.metadata.formatVersion).toBe(specVersion)
    expect(result.components[0].name).toBe('lodash')
    expect(result.components[0].version).toBe('4.17.21')
    expect(result.components[0].licenses).toContain('MIT')
  })

  it.each(['1.0', '1.3', '1.5'])('parses XML components under specVersion %s (from xmlns)', async (specVersion) => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/${specVersion}">
  <components>
    <component type="library">
      <name>lodash</name>
      <version>4.17.21</version>
      <purl>pkg:npm/lodash@4.17.21</purl>
    </component>
  </components>
</bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    // Regression: formatVersion used to read the `version` attribute on <bom> (the document
    // revision counter, e.g. "1"), which is a different field from the specVersion namespace.
    expect(result.metadata.formatVersion).toBe(specVersion)
    expect(result.components[0].name).toBe('lodash')
  })

  it('rejects a JSON document declaring an unsupported specVersion', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '99.9',
      components: [{ type: 'library', name: 'lodash', version: '4.17.21' }],
    }
    await expect(parseCycloneDX(JSON.stringify(bom), 'bom.json')).rejects.toThrow(/Unsupported CycloneDX specVersion/)
  })

  it('rejects an XML document declaring an unsupported specVersion', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/99.9">
  <components>
    <component type="library">
      <name>lodash</name>
      <version>4.17.21</version>
    </component>
  </components>
</bom>`
    await expect(parseCycloneDX(xml, 'bom.xml')).rejects.toThrow(/Unsupported CycloneDX specVersion/)
  })
})

/**
 * Build a CycloneDX 1.5 JSON BOM with `count` distinct library components, each carrying the
 * fields the mapper actually reads (name/version/purl/cpe/licenses/description) so the parse does
 * representative per-component work, not a trivial pass over near-empty objects.
 */
function buildLargeCycloneDXJson(count: number): string {
  return JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      timestamp: '2024-01-01T00:00:00Z',
      component: { type: 'application', name: 'large-app', version: '1.0.0' },
    },
    components: Array.from({ length: count }, (_, i) => ({
      type: 'library',
      'bom-ref': `pkg:npm/lib-${i}@1.0.0`,
      name: `lib-${i}`,
      version: '1.0.0',
      purl: `pkg:npm/lib-${i}@1.0.0`,
      cpe: `cpe:2.3:a:vendor:lib-${i}:1.0.0:*:*:*:*:*:*:*`,
      licenses: [{ license: { id: 'MIT' } }],
      description: `Component number ${i}`,
    })),
  })
}

/**
 * NFR-01.2 — SBOM import of 1000 components must complete in under 5 seconds.
 *
 * WHY this exists (Rule 9): parseCycloneDX maps every component independently, so a 1000-component
 * import should be linear and finish in milliseconds. This guard fails if per-component mapping
 * regresses to O(n^2) (e.g. an accidental nested scan over all components per item) — the 5s ceiling
 * is the PRD SLA, deliberately generous so normal CI jitter never trips it; only an algorithmic
 * regression would. The length assertion guarantees the timing reflects real work and not an early
 * bail-out that returns an empty result quickly.
 */
describe('NFR-01.2 performance', () => {
  it('parses a 1000-component CycloneDX SBOM in under 5 seconds', async () => {
    const json = buildLargeCycloneDXJson(1000)

    const start = performance.now()
    const result = await parseCycloneDX(json, 'large-sbom.json')
    const elapsedMs = performance.now() - start

    // Sanity: all 1000 components were actually produced, so the timing isn't from an early bail-out.
    expect(result.components).toHaveLength(1000)
    expect(elapsedMs).toBeLessThan(5000)
  })
})

describe('parseCycloneDX formatVersion fallback when unspecified', () => {
  it('defaults formatVersion to 1.5 when a JSON bom omits specVersion', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      components: [],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.metadata.formatVersion).toBe('1.5')
  })

  it('defaults formatVersion to 1.5 when an XML bom has no /bom/X.Y pattern in xmlns', async () => {
    // No xmlns attribute at all on <bom> — extractXmlSpecVersion can't match a version, so it
    // must fall back rather than propagate `undefined`/throw.
    const xml = `<?xml version="1.0"?>
<bom>
<components>
  <component type="library">
    <name>lodash</name>
    <version>4.17.21</version>
  </component>
</components>
</bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.metadata.formatVersion).toBe('1.5')
  })
})

describe('parseCycloneDX XML syntax errors', () => {
  it('rejects XML with an unterminated attribute value as "Invalid XML format"', async () => {
    // Unlike the generic "should throw error for invalid XML" case above (which fails the later
    // missing-bom-element check), an unterminated attribute value makes fast-xml-parser itself
    // throw, exercising the parser's own try/catch.
    const xml = '<bom attr="unterminated></bom>'
    await expect(parseCycloneDX(xml, 'bom.xml')).rejects.toThrow('Invalid XML format')
  })
})

describe('parseCycloneDX XML malformed <components> container shapes', () => {
  it('returns zero components when the XML bom has no <components> element at all', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <metadata><timestamp>2024-01-01T00:00:00Z</timestamp></metadata>
</bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.components).toEqual([])
    expect(result.metadata.componentCount).toBe(0)
  })

  it('returns zero components when <components> holds text instead of <component> children', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5"><components>oops</components></bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.components).toEqual([])
  })

  it('returns zero components when <components> holds an unrecognized child instead of <component>', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5"><components><bogus>x</bogus></components></bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.components).toEqual([])
  })

  it('rejects a bom with duplicate sibling <components> containers instead of importing corrupted entries', async () => {
    // Two sibling <components> blocks are invalid per the CycloneDX schema (at most one is
    // allowed). fast-xml-parser then promotes the container itself to an array, so each "component"
    // the mapper sees is really the wrapper object — it must fail loudly rather than silently
    // import components with no name/type.
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components><component type="library"><name>a</name></component></components>
  <components><component type="library"><name>b</name></component></components>
</bom>`
    await expect(parseCycloneDX(xml, 'bom.xml')).rejects.toThrow()
  })
})

describe('parseCycloneDX XML malformed <vulnerabilities> container shape', () => {
  it('returns zero vulnerabilities when <vulnerabilities> holds no <vulnerability> children', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5"><vulnerabilities><note>nothing here</note></vulnerabilities></bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.vulnerabilities).toEqual([])
  })
})

describe('parseCycloneDX component field fallbacks for missing name/version/purl', () => {
  it('falls back to "unknown" name for a JSON component with no name field', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [{ type: 'library', version: '1.0.0' }],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.components[0].name).toBe('unknown')
  })

  it('falls back to "unknown" name for an XML component with no <name> element', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5"><components><component type="library"><version>1.0.0</version></component></components></bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.components[0].name).toBe('unknown')
  })

  it('derives empty version, gap coverage, and a stable id for an XML component with no <version>/<purl>', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5"><components><component type="library"><name>toybox</name></component></components></bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    // Mirrors the JSON-side "leaves version empty..." test above — the XML mapper must derive the
    // same gap/unknown-id contract, not just the JSON one.
    expect(result.components[0].version).toBe('')
    expect(result.components[0].coverage).toBe('gap')
    expect(result.components[0].id).toBe('toybox-unknown')
  })
})

describe('mapComponentType fallback for unrecognized types', () => {
  it('maps an unrecognized component type to "other"', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [{ type: 'widget', name: 'gizmo', version: '1.0.0' }],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.components[0].type).toBe('other')
  })
})

describe('license extraction edge cases', () => {
  it('falls back to license.name when license.id is absent, and to "unknown" when both are absent (JSON)', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [
        {
          type: 'library',
          name: 'x',
          version: '1.0.0',
          licenses: [{ license: { name: 'Apache License 2.0' } }, { license: {} }],
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.components[0].licenses).toEqual(['Apache License 2.0', 'unknown'])
  })

  it('skips a license entry that has neither an expression nor a license object (JSON)', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      components: [
        {
          type: 'library',
          name: 'x',
          version: '1.0.0',
          licenses: [{ expression: 'MIT' }, {}],
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.components[0].licenses).toEqual(['MIT'])
  })

  it('flattens duplicate sibling <licenses> containers on one XML component', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components><component type="library"><name>x</name>
    <licenses><license><id>MIT</id></license></licenses>
    <licenses><license><id>Apache-2.0</id></license></licenses>
  </component></components>
</bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.components[0].licenses).toEqual(['MIT', 'Apache-2.0'])
  })

  it.each(['oops', '<foo>1</foo>'])(
    'yields no licenses when XML <licenses> contains %s instead of <license>/<expression>',
    async (licensesInner) => {
      const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5"><components><component type="library"><name>x</name><licenses>${licensesInner}</licenses></component></components></bom>`
      const result = await parseCycloneDX(xml, 'bom.xml')
      expect(result.components[0].licenses).toEqual([])
    },
  )
})

describe('XML hash and properties normalization edge cases', () => {
  it('uses the first hash content when an XML component has multiple <hash> entries', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components><component type="library"><name>x</name>
    <hashes><hash alg="SHA-256">aaa</hash><hash alg="SHA-1">bbb</hash></hashes>
  </component></components>
</bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.components[0].hash).toBe('aaa')
  })

  it('reads vat:coverage/vat:note from XML component properties, tolerating malformed property entries', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <components>
    <component type="library"><name>libcrypto</name>
      <properties>
        <property name="vat:coverage">gap</property>
        <property name="vat:note"/>
        <property/>
      </properties>
    </component>
    <component type="library"><name>sqlite</name>
      <properties><property name="vat:coverage">identified</property></properties>
    </component>
  </components>
</bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    const byName = Object.fromEntries(result.components.map((c) => [c.name, c]))
    // libcrypto: a nameless, valueless <property/> must be dropped rather than crashing the parse,
    // and a named-but-empty <property name="vat:note"/> must normalize to '' (not undefined).
    expect(byName['libcrypto'].coverage).toBe('gap')
    expect(byName['libcrypto'].coverageNote).toBe('')
    // sqlite: exactly one <property> (not auto-promoted to an array by the XML parser) must be
    // handled the same way as the multi-property case above.
    expect(byName['sqlite'].coverage).toBe('identified')
  })
})

describe('vulnerability rating selection picks the highest score, not first or last', () => {
  it('JSON: picks the highest-scoring rating among three, regardless of position', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-MULTI-RATING',
          ratings: [{ severity: 'high' }, { severity: 'critical', score: 9.8 }, { severity: 'medium' }],
          description: 'x',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].severity).toBe('critical')
    expect(result.vulnerabilities[0].cvssScore).toBe(9.8)
  })

  it('XML: normalizes multiple <rating> siblings under one <ratings> and picks the higher-scoring one', async () => {
    const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <vulnerabilities>
    <vulnerability>
      <id>CVE-2024-XML-MULTI-RATING</id>
      <ratings>
        <rating><severity>medium</severity><score>5.0</score></rating>
        <rating><severity>critical</severity><score>9.8</score></rating>
      </ratings>
      <description>x</description>
    </vulnerability>
  </vulnerabilities>
</bom>`
    const result = await parseCycloneDX(xml, 'bom.xml')
    expect(result.vulnerabilities[0].severity).toBe('critical')
    expect(result.vulnerabilities[0].cvssScore).toBe(9.8)
  })

  it.each(['none', '<foo>1</foo>'])(
    'XML: yields no ratings when <ratings> contains %s instead of <rating> elements',
    async (ratingsInner) => {
      const xml = `<?xml version="1.0"?>
<bom xmlns="http://cyclonedx.org/schema/bom/1.5">
  <vulnerabilities>
    <vulnerability>
      <id>CVE-2024-XML-BAD-RATINGS</id>
      <ratings>${ratingsInner}</ratings>
      <description>x</description>
    </vulnerability>
  </vulnerabilities>
</bom>`
      const result = await parseCycloneDX(xml, 'bom.xml')
      expect(result.vulnerabilities[0].severity).toBe('none')
      expect(result.vulnerabilities[0].cvssScore).toBeUndefined()
    },
  )
})

describe('vulnerability reference edge cases', () => {
  it('links a GHSA-prefixed vulnerability id to its GitHub advisory URL even though source defaults to nvd', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'GHSA-xxxx-yyyy-zzzz',
          ratings: [{ severity: 'high' }],
          description: 'x',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    const officialRef = result.vulnerabilities[0].references.find((r) => r.tags?.includes('official'))
    expect(officialRef).toEqual({
      url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
      source: 'GitHub',
      tags: ['official'],
    })
  })

  it('drops an advisory missing a url and falls back to NVD as its source when vuln.source is absent', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-ADV-EDGE',
          ratings: [{ severity: 'high' }],
          description: 'Vuln with a sourceless, partially-broken advisory list',
          advisories: [{ url: 'https://example.com/advisory' }, {}],
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    const advisoryRefs = result.vulnerabilities[0].references.filter((r) => r.tags?.includes('advisory'))
    expect(advisoryRefs).toEqual([{ url: 'https://example.com/advisory', source: 'NVD', tags: ['advisory'] }])
  })
})

describe('parseCycloneDX vulnerability severity (critical rating)', () => {
  it('parses a JSON vulnerability with CRITICAL severity', async () => {
    const bom = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      vulnerabilities: [
        {
          id: 'CVE-2024-CRIT',
          source: { name: 'NVD' },
          ratings: [{ severity: 'critical', score: 9.8 }],
          description: 'Critical vuln',
        },
      ],
    }
    const result = await parseCycloneDX(JSON.stringify(bom), 'bom.json')
    expect(result.vulnerabilities[0].severity).toBe('critical')
  })
})
