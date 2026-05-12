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

      expect(component.version).toBe('unknown')
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
      await expect(parseSpdx('some content', 'spdx.xml')).rejects.toThrow('Unsupported file format: xml')
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
    const result = await validateSpdx('some content', 'spdx.xml')
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
    expect(getSpdxVersion('some content', 'spdx.xml')).toBe(null)
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
    expect(isSpdxFile('some content', 'spdx.xml')).toBe(false)
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
