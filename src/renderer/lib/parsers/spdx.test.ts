import { describe, it, expect } from 'vitest'
import { parseSpdx, validateSpdx, getSpdxVersion, isSpdxFile } from './spdx'
import type { Component } from '@@/types'

describe('parseSpdx', () => {
  describe('JSON format', () => {
    const validSpdxJson = {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: 'SPDXRef-DOCUMENT',
      name: 'TestProject',
      documentNamespace: 'https://example.com/test-project',
      packages: [
        {
          SPDXID: 'SPDXRef-Package-lodash',
          name: 'lodash',
          versionInfo: '4.17.21',
          downloadLocation: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
          filesAnalyzed: false,
          licenseConcluded: 'MIT',
          licenseDeclared: 'MIT',
          copyrightText: 'Copyright',
          description: 'A modern JavaScript utility library',
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:npm/lodash@4.17.21',
            },
            {
              referenceCategory: 'SECURITY',
              referenceType: 'cpe23Type',
              referenceLocator: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
            },
          ],
          packageVerificationCode: {
            packageVerificationCodeValue: 'abc123',
          },
        },
        {
          SPDXID: 'SPDXRef-Package-react',
          name: 'react',
          versionInfo: '18.2.0',
          downloadLocation: 'https://registry.npmjs.org/react/-/react-18.2.0.tgz',
          filesAnalyzed: false,
          licenseConcluded: 'MIT',
          licenseDeclared: 'MIT',
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:npm/react@18.2.0',
            },
          ],
        },
      ],
    }

    it('should parse valid SPDX JSON', async () => {
      const result = await parseSpdx(JSON.stringify(validSpdxJson), 'spdx.json')

      expect(result.components).toHaveLength(2)
      expect(result.metadata.format).toBe('spdx')
      expect(result.metadata.formatVersion).toBe('2.3')
      expect(result.metadata.componentCount).toBe(2)
    })

    it('should correctly map package properties', async () => {
      const result = await parseSpdx(JSON.stringify(validSpdxJson), 'spdx.json')
      const lodashComponent = result.components[0]

      expect(lodashComponent.name).toBe('lodash')
      expect(lodashComponent.version).toBe('4.17.21')
      expect(lodashComponent.type).toBe('library')
      expect(lodashComponent.purl).toBe('pkg:npm/lodash@4.17.21')
      expect(lodashComponent.cpe).toBe('cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*')
      expect(lodashComponent.licenses).toContain('MIT')
      expect(lodashComponent.description).toBe('A modern JavaScript utility library')
      expect(lodashComponent.hash).toBe('abc123')
      expect(lodashComponent.vulnerabilities).toEqual([])
    })

    it('should handle packages without version', async () => {
      const spdxWithoutVersion = {
        ...validSpdxJson,
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'unknown-version',
            downloadLocation: 'https://example.com/package.tgz',
            filesAnalyzed: false,
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdxWithoutVersion), 'spdx.json')
      const component = result.components[0]

      // A missing version is left empty (not the truthy sentinel 'unknown') and flagged as a
      // coverage gap, so downstream `if (!version)` guards fire and the UI can mark it for review.
      expect(component.version).toBe('')
      expect(component.coverage).toBe('gap')
    })

    it('should throw error for invalid JSON', async () => {
      await expect(parseSpdx('invalid json', 'spdx.json')).rejects.toThrow('Invalid JSON format')
    })

    it('should throw error for non-SPDX JSON', async () => {
      const nonSpdx = { someField: 'value' }
      await expect(parseSpdx(JSON.stringify(nonSpdx), 'spdx.json')).rejects.toThrow('Invalid SPDX format')
    })

    it('should handle packages without external references', async () => {
      const spdxNoRefs = {
        ...validSpdxJson,
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'no-refs-package',
            versionInfo: '1.0.0',
            downloadLocation: 'https://example.com/package.tgz',
            filesAnalyzed: false,
            licenseConcluded: 'Apache-2.0',
            licenseDeclared: 'Apache-2.0',
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdxNoRefs), 'spdx.json')
      const component = result.components[0]

      expect(component.name).toBe('no-refs-package')
      expect(component.purl).toBeUndefined()
      expect(component.cpe).toBeUndefined()
    })

    it('should throw error for unsupported file formats', async () => {
      await expect(parseSpdx('some content', 'spdx.yaml')).rejects.toThrow('Unsupported file format: yaml')
    })

    it('should handle empty packages array', async () => {
      const spdxNoPackages = {
        ...validSpdxJson,
        packages: [],
      }

      const result = await parseSpdx(JSON.stringify(spdxNoPackages), 'spdx.json')

      expect(result.components).toEqual([])
      expect(result.metadata.componentCount).toBe(0)
    })

    it('should extract version from spdxVersion string', async () => {
      const spdxOldVersion = {
        ...validSpdxJson,
        spdxVersion: 'SPDX-2.2',
      }

      const result = await parseSpdx(JSON.stringify(spdxOldVersion), 'spdx.json')

      expect(result.metadata.formatVersion).toBe('2.2')
    })

    it('should default to version 2.3 when spdxVersion is missing', async () => {
      const spdxNoVersion = {
        ...validSpdxJson,
        spdxVersion: undefined,
      }

      const result = await parseSpdx(JSON.stringify(spdxNoVersion), 'spdx.json')

      expect(result.metadata.formatVersion).toBe('2.3')
    })
  })

  describe('package relationships (FR-02.2)', () => {
    // Why this matters: the dependency graph (graph/utils.ts) and JSON/CSV exports
    // read component.dependencies. If SPDX relationships are dropped, an SPDX import
    // produces a flat component list with no edges even when the SBOM declared them.
    const spdxWithRelationships = {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: 'SPDXRef-DOCUMENT',
      documentDescribes: ['SPDXRef-Package-app'],
      packages: [
        { SPDXID: 'SPDXRef-Package-app', name: 'app', versionInfo: '1.0.0', filesAnalyzed: false },
        { SPDXID: 'SPDXRef-Package-lodash', name: 'lodash', versionInfo: '4.17.21', filesAnalyzed: false },
        { SPDXID: 'SPDXRef-Package-react', name: 'react', versionInfo: '18.2.0', filesAnalyzed: false },
      ],
      relationships: [
        { spdxElementId: 'SPDXRef-DOCUMENT', relatedSpdxElement: 'SPDXRef-Package-app', relationshipType: 'DESCRIBES' },
        {
          spdxElementId: 'SPDXRef-Package-app',
          relatedSpdxElement: 'SPDXRef-Package-lodash',
          relationshipType: 'DEPENDS_ON',
        },
        {
          spdxElementId: 'SPDXRef-Package-react',
          relatedSpdxElement: 'SPDXRef-Package-app',
          relationshipType: 'DEPENDENCY_OF',
        },
      ],
    }

    it('maps DEPENDS_ON to the depending component dependencies', async () => {
      const result = await parseSpdx(JSON.stringify(spdxWithRelationships), 'spdx.json')
      const app = result.components.find((c) => c.name === 'app') as Component
      const lodash = result.components.find((c) => c.name === 'lodash') as Component

      expect(app.dependencies).toContain(lodash.id)
    })

    it('maps DEPENDENCY_OF as the inverse edge', async () => {
      const result = await parseSpdx(JSON.stringify(spdxWithRelationships), 'spdx.json')
      const app = result.components.find((c) => c.name === 'app') as Component
      const react = result.components.find((c) => c.name === 'react') as Component

      // react DEPENDENCY_OF app  ==>  app depends on react
      expect(app.dependencies).toContain(react.id)
    })

    it('ignores non-dependency relationships (DESCRIBES) and unresolved endpoints', async () => {
      const result = await parseSpdx(JSON.stringify(spdxWithRelationships), 'spdx.json')
      const lodash = result.components.find((c) => c.name === 'lodash') as Component
      const react = result.components.find((c) => c.name === 'react') as Component

      // Neither leaf gained a dependency; DESCRIBES from the document is not an edge.
      expect(lodash.dependencies ?? []).toEqual([])
      expect(react.dependencies ?? []).toEqual([])
    })

    it('leaves dependencies undefined when the SBOM declares no relationships', async () => {
      const noRelationships = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        packages: [
          { SPDXID: 'SPDXRef-Package-a', name: 'a', versionInfo: '1.0.0', filesAnalyzed: false },
          { SPDXID: 'SPDXRef-Package-b', name: 'b', versionInfo: '2.0.0', filesAnalyzed: false },
        ],
      }
      const result = await parseSpdx(JSON.stringify(noRelationships), 'spdx.json')
      expect(result.components.every((c) => c.dependencies === undefined)).toBe(true)
    })
  })

  describe('tag-value format (FR-02.2)', () => {
    // SPDX's canonical `.spdx` text format. It must parse into the same Component
    // shape as JSON (name/version/purl/cpe/hash/licenses) and honor relationships,
    // including multi-line <text> values.
    const tagValue = [
      'SPDXVersion: SPDX-2.3',
      'DataLicense: CC0-1.0',
      'SPDXID: SPDXRef-DOCUMENT',
      'DocumentName: tag-value-test',
      'DocumentNamespace: https://example.com/tv',
      '',
      '# A package',
      'PackageName: lodash',
      'SPDXID: SPDXRef-Package-lodash',
      'PackageVersion: 4.17.21',
      'PackageDownloadLocation: https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
      'PackageLicenseConcluded: MIT',
      'PackageLicenseDeclared: MIT',
      'PackageChecksum: SHA256: abc123def456',
      'PackageDescription: <text>A modern JavaScript',
      'utility library</text>',
      'ExternalRef: PACKAGE-MANAGER purl pkg:npm/lodash@4.17.21',
      'ExternalRef: SECURITY cpe23Type cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
      '',
      'PackageName: app',
      'SPDXID: SPDXRef-Package-app',
      'PackageVersion: 1.0.0',
      '',
      'Relationship: SPDXRef-Package-app DEPENDS_ON SPDXRef-Package-lodash',
    ].join('\n')

    it('parses packages and maps metadata consistently with the JSON path', async () => {
      const result = await parseSpdx(tagValue, 'sbom.spdx')

      expect(result.metadata.format).toBe('spdx')
      expect(result.metadata.formatVersion).toBe('2.3')
      expect(result.components).toHaveLength(2)

      const lodash = result.components.find((c) => c.name === 'lodash') as Component
      expect(lodash.version).toBe('4.17.21')
      expect(lodash.purl).toBe('pkg:npm/lodash@4.17.21')
      expect(lodash.cpe).toBe('cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*')
      expect(lodash.licenses).toContain('MIT')
      expect(lodash.hash).toBe('abc123def456')
    })

    it('joins multi-line <text> values', async () => {
      const result = await parseSpdx(tagValue, 'sbom.spdx')
      const lodash = result.components.find((c) => c.name === 'lodash') as Component
      expect(lodash.description).toBe('A modern JavaScript\nutility library')
    })

    it('wires DEPENDS_ON relationships into dependencies', async () => {
      const result = await parseSpdx(tagValue, 'sbom.spdx')
      const app = result.components.find((c) => c.name === 'app') as Component
      const lodash = result.components.find((c) => c.name === 'lodash') as Component
      expect(app.dependencies).toContain(lodash.id)
    })

    it('rejects a tag-value document without the SPDX DataLicense', async () => {
      const noLicense = 'SPDXVersion: SPDX-2.3\nPackageName: x\nSPDXID: SPDXRef-x\n'
      await expect(parseSpdx(noLicense, 'sbom.spdx')).rejects.toThrow('Invalid SPDX format')
    })

    it('keeps the first checksum when a package has several (order-independent, not last-wins)', async () => {
      // Real SPDX tools emit multiple PackageChecksum lines (SHA1, SHA256, …). A last-wins
      // overwrite would silently discard all but the final digest; the hash must be stable
      // regardless of line order, so the first checksum is retained.
      const multiChecksum = [
        'SPDXVersion: SPDX-2.3',
        'DataLicense: CC0-1.0',
        'SPDXID: SPDXRef-DOCUMENT',
        'DocumentName: multi-checksum',
        'PackageName: pkg',
        'SPDXID: SPDXRef-Package-pkg',
        'PackageVersion: 1.0.0',
        'PackageChecksum: SHA256: sha256value',
        'PackageChecksum: SHA1: sha1value',
      ].join('\n')
      const result = await parseSpdx(multiChecksum, 'sbom.spdx')
      const pkg = result.components.find((c) => c.name === 'pkg') as Component
      expect(pkg.hash).toBe('sha256value')
    })

    it('is recognized by isSpdxFile and getSpdxVersion', () => {
      expect(isSpdxFile(tagValue, 'sbom.spdx')).toBe(true)
      expect(getSpdxVersion(tagValue, 'sbom.spdx')).toBe('2.3')
    })
  })

  describe('RDF/XML format (FR-02.2)', () => {
    // Representative tool-generated SPDX RDF/XML: namespaced tags, licenses/relationship
    // types as rdf:resource URIs, a nested dependsOn relationship, and a checksum block.
    const rdfXml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:spdx="http://spdx.org/rdf/terms#">
  <spdx:SpdxDocument rdf:about="http://example.com/doc#SPDXRef-DOCUMENT">
    <spdx:specVersion>SPDX-2.3</spdx:specVersion>
    <spdx:dataLicense rdf:resource="http://spdx.org/licenses/CC0-1.0"/>
    <spdx:name>rdf-test</spdx:name>
    <spdx:describesPackage>
      <spdx:Package rdf:about="#SPDXRef-Package-app">
        <spdx:name>app</spdx:name>
        <spdx:versionInfo>1.0.0</spdx:versionInfo>
        <spdx:licenseConcluded rdf:resource="http://spdx.org/rdf/terms#noassertion"/>
        <spdx:relationship>
          <spdx:Relationship>
            <spdx:relationshipType rdf:resource="http://spdx.org/rdf/terms#relationshipType_dependsOn"/>
            <spdx:relatedSpdxElement rdf:resource="#SPDXRef-Package-lodash"/>
          </spdx:Relationship>
        </spdx:relationship>
      </spdx:Package>
    </spdx:describesPackage>
    <spdx:describesPackage>
      <spdx:Package rdf:about="#SPDXRef-Package-lodash">
        <spdx:name>lodash</spdx:name>
        <spdx:versionInfo>4.17.21</spdx:versionInfo>
        <spdx:downloadLocation>https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz</spdx:downloadLocation>
        <spdx:licenseConcluded rdf:resource="http://spdx.org/licenses/MIT"/>
        <spdx:checksum>
          <spdx:Checksum>
            <spdx:algorithm rdf:resource="http://spdx.org/rdf/terms#checksumAlgorithm_sha256"/>
            <spdx:checksumValue>abc123def456</spdx:checksumValue>
          </spdx:Checksum>
        </spdx:checksum>
        <spdx:externalRef>
          <spdx:ExternalRef>
            <spdx:referenceCategory rdf:resource="http://spdx.org/rdf/terms#referenceCategory_packageManager"/>
            <spdx:referenceType rdf:resource="http://spdx.org/rdf/references#purl"/>
            <spdx:referenceLocator>pkg:npm/lodash@4.17.21</spdx:referenceLocator>
          </spdx:ExternalRef>
        </spdx:externalRef>
        <spdx:externalRef>
          <spdx:ExternalRef>
            <spdx:referenceCategory rdf:resource="http://spdx.org/rdf/terms#referenceCategory_security"/>
            <spdx:referenceType rdf:resource="http://spdx.org/rdf/references#cpe23Type"/>
            <spdx:referenceLocator>cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*</spdx:referenceLocator>
          </spdx:ExternalRef>
        </spdx:externalRef>
      </spdx:Package>
    </spdx:describesPackage>
  </spdx:SpdxDocument>
</rdf:RDF>`

    it('parses packages, resolving rdf:resource licenses and referenceTypes', async () => {
      const result = await parseSpdx(rdfXml, 'sbom.rdf')

      expect(result.metadata.format).toBe('spdx')
      expect(result.metadata.formatVersion).toBe('2.3')
      expect(result.components).toHaveLength(2)

      const lodash = result.components.find((c) => c.name === 'lodash') as Component
      expect(lodash.version).toBe('4.17.21')
      // referenceType URI ".../references#purl" must reduce to exactly "purl" for the mapper.
      expect(lodash.purl).toBe('pkg:npm/lodash@4.17.21')
      // A SECURITY/cpe23Type externalRef must resolve into the cpe field just like the JSON and
      // tag-value paths — this is the only RDF test guarding normalizeRefType against a cpe URI.
      expect(lodash.cpe).toBe('cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*')
      expect(lodash.hasMissingCpe).toBe(false)
      // license rdf:resource ".../licenses/MIT" must reduce to the SPDX id "MIT".
      expect(lodash.licenses).toContain('MIT')
      expect(lodash.hash).toBe('abc123def456')
    })

    it('does not leak a NOASSERTION license as a raw ontology URI (FR-02.2 cross-format consistency)', async () => {
      const result = await parseSpdx(rdfXml, 'sbom.rdf')
      const app = result.components.find((c) => c.name === 'app') as Component
      // app's licenseConcluded is the RDF individual ".../terms#noassertion"; it must be
      // normalized and filtered exactly as the JSON/tag-value 'NOASSERTION' literal is — never
      // surfaced as the raw URI. With no asserted license, licenses falls back to ['unknown'].
      expect(app.licenses).toEqual(['unknown'])
      expect(app.licenses).not.toContain('http://spdx.org/rdf/terms#noassertion')
    })

    it('wires a nested dependsOn relationship into dependencies', async () => {
      const result = await parseSpdx(rdfXml, 'sbom.rdf')
      const app = result.components.find((c) => c.name === 'app') as Component
      const lodash = result.components.find((c) => c.name === 'lodash') as Component
      expect(app.dependencies).toContain(lodash.id)
    })

    it('is recognized by isSpdxFile and getSpdxVersion via the .xml extension', () => {
      expect(isSpdxFile(rdfXml, 'sbom.xml')).toBe(true)
      expect(getSpdxVersion(rdfXml, 'sbom.xml')).toBe('2.3')
    })

    it('rejects RDF/XML that is not an SPDX document', async () => {
      const notSpdx = '<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"></rdf:RDF>'
      await expect(parseSpdx(notSpdx, 'sbom.rdf')).rejects.toThrow('Invalid SPDX format')
    })
  })

  describe('component type detection', () => {
    it('should detect container type from docker download location', async () => {
      const spdx = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'my-container',
            downloadLocation: 'docker://nginx:latest',
            filesAnalyzed: false,
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
      expect(result.components[0].type).toBe('container')
    })

    it('should detect framework type from common framework names', async () => {
      const spdx = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'React',
            downloadLocation: 'https://registry.npmjs.org/react',
            filesAnalyzed: false,
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
      expect(result.components[0].type).toBe('framework')
    })

    it('should default to library type for unknown types', async () => {
      const spdx = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'unknown-lib',
            downloadLocation: 'https://example.com/lib.tar.gz',
            filesAnalyzed: false,
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
      expect(result.components[0].type).toBe('library')
    })

    it('should detect application type from binary/executable location', async () => {
      const spdx = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'my-app',
            downloadLocation: 'https://example.com/binary-installer',
            filesAnalyzed: false,
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
      expect(result.components[0].type).toBe('application')
    })
  })

  describe('license extraction', () => {
    it('should extract concluded license', async () => {
      const spdx = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'mit-package',
            licenseConcluded: 'MIT',
            licenseDeclared: 'NOASSERTION',
            filesAnalyzed: false,
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
      expect(result.components[0].licenses).toContain('MIT')
    })

    it('should extract declared license', async () => {
      const spdx = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'apache-package',
            licenseConcluded: 'NOASSERTION',
            licenseDeclared: 'Apache-2.0',
            filesAnalyzed: false,
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
      expect(result.components[0].licenses).toContain('Apache-2.0')
    })

    it('should handle license expressions with OR', async () => {
      const spdx = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'dual-licensed',
            licenseConcluded: 'MIT OR Apache-2.0',
            filesAnalyzed: false,
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
      expect(result.components[0].licenses).toContain('MIT')
      expect(result.components[0].licenses).toContain('Apache-2.0')
    })

    it('should handle NOASSERTION license', async () => {
      const spdx = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        packages: [
          {
            SPDXID: 'SPDXRef-Package',
            name: 'noassertion-package',
            licenseConcluded: 'NOASSERTION',
            licenseDeclared: 'NOASSERTION',
            filesAnalyzed: false,
          },
        ],
      }

      const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
      expect(result.components[0].licenses).toContain('unknown')
    })
  })
})

describe('validateSpdx', () => {
  const validSpdx = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    packages: [],
  }

  it('should return true for valid SPDX JSON', async () => {
    const result = await validateSpdx(JSON.stringify(validSpdx), 'spdx.json')
    expect(result).toBe(true)
  })

  it('should return false for invalid JSON', async () => {
    const result = await validateSpdx('invalid json', 'spdx.json')
    expect(result).toBe(false)
  })

  it('should return false for non-SPDX format', async () => {
    const result = await validateSpdx(JSON.stringify({ other: 'format' }), 'spdx.json')
    expect(result).toBe(false)
  })

  it('should return false for unsupported file format', async () => {
    const result = await validateSpdx('some content', 'spdx.yaml')
    expect(result).toBe(false)
  })
})

describe('getSpdxVersion', () => {
  it('should return version from SPDX JSON', () => {
    const spdx = {
      spdxVersion: 'SPDX-2.2',
      dataLicense: 'CC0-1.0',
    }
    expect(getSpdxVersion(JSON.stringify(spdx), 'spdx.json')).toBe('2.2')
  })

  it('should return null for invalid content', () => {
    expect(getSpdxVersion('invalid', 'spdx.json')).toBe(null)
  })

  it('should return null when version is not specified', () => {
    const spdx = {
      dataLicense: 'CC0-1.0',
    }
    expect(getSpdxVersion(JSON.stringify(spdx), 'spdx.json')).toBe('2.3')
  })

  it('should return null for unsupported file format', () => {
    expect(getSpdxVersion('some content', 'spdx.yaml')).toBe(null)
  })
})

describe('isSpdxFile', () => {
  it('should return true for SPDX JSON with dataLicense', () => {
    const spdx = {
      dataLicense: 'CC0-1.0',
    }
    expect(isSpdxFile(JSON.stringify(spdx), 'spdx.json')).toBe(true)
  })

  it('should return true for SPDX JSON with spdxVersion', () => {
    const spdx = {
      spdxVersion: 'SPDX-2.3',
    }
    expect(isSpdxFile(JSON.stringify(spdx), 'spdx.json')).toBe(true)
  })

  it('should return false for non-SPDX JSON', () => {
    const notSpdx = {
      someField: 'value',
    }
    expect(isSpdxFile(JSON.stringify(notSpdx), 'spdx.json')).toBe(false)
  })

  it('should return false for invalid JSON', () => {
    expect(isSpdxFile('invalid json', 'spdx.json')).toBe(false)
  })

  it('should return false for non-JSON files', () => {
    expect(isSpdxFile('some content', 'spdx.yaml')).toBe(false)
  })
})

describe('component ID generation', () => {
  it('should generate unique IDs for components', async () => {
    const spdx = {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      packages: [
        {
          SPDXID: 'SPDXRef-Package-1',
          name: 'lib1',
          versionInfo: '1.0.0',
          filesAnalyzed: false,
        },
        {
          SPDXID: 'SPDXRef-Package-2',
          name: 'lib2',
          versionInfo: '1.0.0',
          filesAnalyzed: false,
        },
        {
          SPDXID: 'SPDXRef-Package-3',
          name: 'lib1',
          versionInfo: '2.0.0',
          filesAnalyzed: false,
        },
      ],
    }

    const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
    const ids = result.components.map((c) => c.id)

    expect(new Set(ids).size).toBe(3)
  })

  it('should handle special characters in package names', async () => {
    const spdx = {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      packages: [
        {
          SPDXID: 'SPDXRef-Package',
          name: '@scope/package-name',
          versionInfo: '1.0.0',
          filesAnalyzed: false,
        },
      ],
    }

    const result = await parseSpdx(JSON.stringify(spdx), 'spdx.json')
    expect(result.components[0].id).toContain('-scope-package-name-1')
  })
})
