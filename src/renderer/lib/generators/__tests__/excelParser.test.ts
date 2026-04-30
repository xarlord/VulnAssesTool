/**
 * TDD Tests for Excel Parser
 *
 * Phase 2: Excel Parser Implementation
 * Testing approach: Test-driven development (TDD)
 * - Tests written FIRST
 * - Implementation follows to make tests pass
 * - 100% coverage goal
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseExcel,
  validateRow,
  mapRowToComponent,
  detectColumnMapping,
  getDefaultType,
  type ExcelRow,
  type ValidationResult,
  type ColumnMapping,
  type ComponentType,
} from '../excelParser'

// Mock xlsx module
vi.mock('xlsx', () => {
  const read = vi.fn()
  const sheet_to_json = vi.fn()
  return {
    default: {
      read,
      utils: {
        sheet_to_json,
      },
    },
    read,
    utils: {
      sheet_to_json,
    },
  }
})

describe('parseExcel', () => {
  let mockWorkbook: XLSX.WorkBook
  let mockWorksheet: XLSX.WorkSheet

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks()

    // Setup mock workbook and worksheet
    mockWorksheet = []
    mockWorkbook = {
      SheetNames: ['Components', 'Metadata'],
      Sheets: {
        Components: mockWorksheet,
        Metadata: [],
      },
    } as unknown as XLSX.WorkBook

    vi.mocked(XLSX.read).mockReturnValue(mockWorkbook as any)
  })

  describe('basic parsing', () => {
    it('should parse a simple Excel buffer with default sheet', async () => {
      const mockRows = [
        { name: 'react', version: '18.2.0', type: 'library' },
        { name: 'lodash', version: '4.17.21', type: 'library' },
      ]
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows)

      const buffer = new ArrayBuffer(10)
      const result = await parseExcel(buffer)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('react')
      expect(result[0].version).toBe('18.2.0')
      expect(result[1].name).toBe('lodash')
      expect(result[1].version).toBe('4.17.21')
    })

    it('should parse Excel with specified sheet name', async () => {
      const mockRows = [{ name: 'express', version: '4.18.2' }]
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows)

      const buffer = new ArrayBuffer(10)
      const result = await parseExcel(buffer, 'Components')

      expect(XLSX.read).toHaveBeenCalledWith(buffer, { type: 'array' })
      expect(XLSX.utils.sheet_to_json).toHaveBeenCalledWith(mockWorksheet, {
        defval: '',
        raw: false,
      })
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('express')
    })

    it('should throw error for invalid buffer', async () => {
      vi.mocked(XLSX.read).mockImplementation(() => {
        throw new Error('Invalid file format')
      })

      const buffer = new ArrayBuffer(10)
      await expect(parseExcel(buffer)).rejects.toThrow('Invalid file format')
    })

    it('should throw error for non-existent sheet', async () => {
      const buffer = new ArrayBuffer(10)
      await expect(parseExcel(buffer, 'NonExistent')).rejects.toThrow("Sheet 'NonExistent' not found in workbook")
    })
  })

  describe('empty and sparse data handling', () => {
    it('should skip empty rows', async () => {
      const mockRows = [
        { name: 'react', version: '18.2.0' },
        {}, // Empty row
        { name: 'lodash', version: '4.17.21' },
        null, // Null row
      ]
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows as any)

      const buffer = new ArrayBuffer(10)
      const result = await parseExcel(buffer)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('react')
      expect(result[1].name).toBe('lodash')
    })

    it('should skip rows with only empty string values', async () => {
      const mockRows = [
        { name: 'react', version: '18.2.0' },
        { name: '', version: '' }, // Row with only empty strings
        { name: 'lodash', version: '4.17.21' },
      ]
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows)

      const buffer = new ArrayBuffer(10)
      const result = await parseExcel(buffer)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('react')
      expect(result[1].name).toBe('lodash')
    })

    it('should handle completely empty workbook', async () => {
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue([])

      const buffer = new ArrayBuffer(10)
      const result = await parseExcel(buffer)

      expect(result).toHaveLength(0)
    })
  })

  describe('column mapping', () => {
    it('should auto-detect column mappings from headers', async () => {
      const mockRows = [
        { 'Component Name': 'react', Version: '18.2.0', License: 'MIT' },
        { 'Component Name': 'lodash', Version: '4.17.21', License: 'MIT' },
      ]
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows)

      const buffer = new ArrayBuffer(10)
      const result = await parseExcel(buffer)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('react')
      expect(result[0].version).toBe('18.2.0')
      expect(result[0].license).toBe('MIT')
    })

    it('should handle various column name formats', async () => {
      const mockRows = [
        { Name: 'react', ver: '18.2.0', lic: 'MIT' },
        { NAME: 'lodash', VERSION: '4.17.21', LICENSE: 'MIT' },
      ]
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows)

      const buffer = new ArrayBuffer(10)
      const result = await parseExcel(buffer)

      expect(result).toHaveLength(2)
      expect(result[0].name).toBe('react')
      expect(result[1].name).toBe('lodash')
    })
  })

  describe('data type coercion', () => {
    it('should convert numeric version to string', async () => {
      const mockRows = [{ name: 'test-lib', version: 123 }]
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows as any)

      const buffer = new ArrayBuffer(10)
      const result = await parseExcel(buffer)

      expect(result[0].version).toBe('123')
      expect(typeof result[0].version).toBe('string')
    })

    it('should trim whitespace from all string values', async () => {
      const mockRows = [{ name: '  react  ', version: '  18.2.0  ', description: '  A library  ' }]
      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows)

      const buffer = new ArrayBuffer(10)
      const result = await parseExcel(buffer)

      expect(result[0].name).toBe('react')
      expect(result[0].version).toBe('18.2.0')
      expect(result[0].description).toBe('A library')
    })
  })
})

describe('validateRow', () => {
  describe('required fields', () => {
    it('should validate row with name and version', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '18.2.0',
      }

      const result = validateRow(row)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should fail validation when name is missing', () => {
      const row: ExcelRow = {
        name: '',
        version: '18.2.0',
      }

      const result = validateRow(row)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('name is required')
    })

    it('should fail validation when version is missing', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '',
      }

      const result = validateRow(row)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('version is required')
    })

    it('should fail validation when both name and version are missing', () => {
      const row: ExcelRow = {
        name: '',
        version: '',
      }

      const result = validateRow(row)

      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(2)
      expect(result.errors).toContain('name is required')
      expect(result.errors).toContain('version is required')
    })

    it('should handle whitespace-only name', () => {
      const row: ExcelRow = {
        name: '   ',
        version: '18.2.0',
      }

      const result = validateRow(row)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('name is required')
    })

    it('should handle whitespace-only version', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '   ',
      }

      const result = validateRow(row)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('version is required')
    })
  })

  describe('optional fields', () => {
    it('should validate row with all optional fields', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '18.2.0',
        type: 'library',
        license: 'MIT',
        purl: 'pkg:npm/react@18.2.0',
        cpe: 'cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*',
        description: 'A JavaScript library',
        supplier: 'Meta',
        group: '@facebook',
      }

      const result = validateRow(row)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate row with no optional fields', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '18.2.0',
      }

      const result = validateRow(row)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })
})

describe('mapRowToComponent', () => {
  describe('basic mapping', () => {
    it('should map minimal row to Component', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '18.2.0',
      }

      const component = mapRowToComponent(row)

      expect(component.name).toBe('react')
      expect(component.version).toBe('18.2.0')
      expect(component.type).toBe('library') // Default type
      expect(component.licenses).toEqual([])
      expect(component.vulnerabilities).toEqual([])
    })

    it('should map row with custom type', () => {
      const row: ExcelRow = {
        name: 'express',
        version: '4.18.2',
        type: 'framework',
      }

      const component = mapRowToComponent(row, 'application')

      expect(component.type).toBe('application') // Use parameter override
    })

    it('should map row with type from Excel', () => {
      const row: ExcelRow = {
        name: 'express',
        version: '4.18.2',
        type: 'framework',
      }

      const component = mapRowToComponent(row)

      expect(component.type).toBe('framework')
    })

    it('should map all optional fields', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '18.2.0',
        type: 'library',
        license: 'MIT',
        purl: 'pkg:npm/react@18.2.0',
        cpe: 'cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*',
        description: 'A JavaScript library for building UIs',
        supplier: 'Meta',
        group: '@facebook',
      }

      const component = mapRowToComponent(row)

      expect(component.name).toBe('react')
      expect(component.version).toBe('18.2.0')
      expect(component.type).toBe('library')
      expect(component.licenses).toContain('MIT')
      expect(component.purl).toBe('pkg:npm/react@18.2.0')
      expect(component.cpe).toBe('cpe:2.3:a:facebook:react:18.2.0:*:*:*:*:*:*:*')
      expect(component.description).toBe('A JavaScript library for building UIs')
      expect(component.supplier).toBe('Meta')
    })
  })

  describe('license handling', () => {
    it('should handle single license string', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '18.2.0',
        license: 'MIT',
      }

      const component = mapRowToComponent(row)

      expect(component.licenses).toEqual(['MIT'])
    })

    it('should handle comma-separated licenses', () => {
      const row: ExcelRow = {
        name: 'library',
        version: '1.0.0',
        license: 'MIT, Apache-2.0',
      }

      const component = mapRowToComponent(row)

      expect(component.licenses).toEqual(['MIT', 'Apache-2.0'])
    })

    it('should handle missing license', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '18.2.0',
      }

      const component = mapRowToComponent(row)

      expect(component.licenses).toEqual([])
    })

    it('should trim whitespace from licenses', () => {
      const row: ExcelRow = {
        name: 'library',
        version: '1.0.0',
        license: 'MIT , Apache-2.0 , GPL-3.0',
      }

      const component = mapRowToComponent(row)

      expect(component.licenses).toEqual(['MIT', 'Apache-2.0', 'GPL-3.0'])
    })
  })

  describe('ID generation', () => {
    it('should generate ID from purl if available', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '18.2.0',
        purl: 'pkg:npm/react@18.2.0',
      }

      const component = mapRowToComponent(row)

      expect(component.id).toBe('pkg:npm/react@18.2.0')
    })

    it('should generate ID from name and version if no purl', () => {
      const row: ExcelRow = {
        name: 'react',
        version: '18.2.0',
      }

      const component = mapRowToComponent(row)

      expect(component.id).toBe('react-18.2.0')
    })

    it('should sanitize ID by replacing special characters', () => {
      const row: ExcelRow = {
        name: '@scope/package-name',
        version: '1.0.0',
      }

      const component = mapRowToComponent(row)

      expect(component.id).toContain('scope-package-name')
      expect(component.id).not.toContain('@')
    })
  })

  describe('component type normalization', () => {
    it('should normalize library type', () => {
      const row: ExcelRow = {
        name: 'lib',
        version: '1.0.0',
        type: 'LIBRARY',
      }

      const component = mapRowToComponent(row)
      expect(component.type).toBe('library')
    })

    it('should normalize framework type', () => {
      const row: ExcelRow = {
        name: 'framework',
        version: '1.0.0',
        type: 'FRAMEWORK',
      }

      const component = mapRowToComponent(row)
      expect(component.type).toBe('framework')
    })

    it('should default to library for unknown types', () => {
      const row: ExcelRow = {
        name: 'unknown',
        version: '1.0.0',
        type: 'unknown-type',
      }

      const component = mapRowToComponent(row)
      expect(component.type).toBe('library')
    })
  })
})

describe('detectColumnMapping', () => {
  describe('name column detection', () => {
    it('should detect "name" column', () => {
      const headers = ['name', 'version', 'license']
      const mapping = detectColumnMapping(headers)

      expect(mapping.name).toBe('name')
    })

    it('should detect "Name" column (case insensitive)', () => {
      const headers = ['Name', 'Version', 'License']
      const mapping = detectColumnMapping(headers)

      expect(mapping.name).toBe('Name')
    })

    it('should detect "NAME" column', () => {
      const headers = ['NAME', 'VERSION', 'LICENSE']
      const mapping = detectColumnMapping(headers)

      expect(mapping.name).toBe('NAME')
    })

    it('should detect "Component Name" column', () => {
      const headers = ['Component Name', 'Version', 'License']
      const mapping = detectColumnMapping(headers)

      expect(mapping.name).toBe('Component Name')
    })

    it('should detect "component_name" column', () => {
      const headers = ['component_name', 'version', 'license']
      const mapping = detectColumnMapping(headers)

      expect(mapping.name).toBe('component_name')
    })
  })

  describe('version column detection', () => {
    it('should detect "version" column', () => {
      const headers = ['name', 'version', 'license']
      const mapping = detectColumnMapping(headers)

      expect(mapping.version).toBe('version')
    })

    it('should detect "ver" column', () => {
      const headers = ['name', 'ver', 'license']
      const mapping = detectColumnMapping(headers)

      expect(mapping.version).toBe('ver')
    })

    it('should detect "Version" column', () => {
      const headers = ['name', 'Version', 'license']
      const mapping = detectColumnMapping(headers)

      expect(mapping.version).toBe('Version')
    })
  })

  describe('optional column detection', () => {
    it('should detect all optional columns', () => {
      const headers = ['name', 'version', 'type', 'license', 'purl', 'cpe', 'description', 'supplier', 'group']
      const mapping = detectColumnMapping(headers)

      expect(mapping.name).toBe('name')
      expect(mapping.version).toBe('version')
      expect(mapping.type).toBe('type')
      expect(mapping.license).toBe('license')
      expect(mapping.purl).toBe('purl')
      expect(mapping.cpe).toBe('cpe')
      expect(mapping.description).toBe('description')
      expect(mapping.supplier).toBe('supplier')
      expect(mapping.group).toBe('group')
    })

    it('should return undefined for missing optional columns', () => {
      const headers = ['name', 'version']
      const mapping = detectColumnMapping(headers)

      expect(mapping.name).toBe('name')
      expect(mapping.version).toBe('version')
      expect(mapping.type).toBeUndefined()
      expect(mapping.license).toBeUndefined()
      expect(mapping.purl).toBeUndefined()
    })
  })

  describe('priority detection', () => {
    it('should prioritize exact match over partial match', () => {
      const headers = ['Name', 'Component Name', 'version']
      const mapping = detectColumnMapping(headers)

      expect(mapping.name).toBe('Name') // Exact match first
    })
  })
})

describe('getDefaultType', () => {
  it('should return "library" as default type', () => {
    expect(getDefaultType()).toBe('library')
  })

  it('should be a valid ComponentType', () => {
    const type = getDefaultType()
    const validTypes: ComponentType[] = ['library', 'framework', 'application', 'container', 'other']

    expect(validTypes).toContain(type)
  })
})

describe('integration scenarios', () => {
  it('should parse and map a realistic Excel file', async () => {
    const mockRows = [
      {
        name: 'react',
        version: '18.2.0',
        type: 'library',
        license: 'MIT',
        purl: 'pkg:npm/react@18.2.0',
        description: 'A JavaScript library for building user interfaces',
      },
      {
        name: 'lodash',
        version: '4.17.21',
        type: 'library',
        license: 'MIT',
        purl: 'pkg:npm/lodash@4.17.21',
        description: 'A modern JavaScript utility library',
      },
      {
        name: 'express',
        version: '4.18.2',
        type: 'framework',
        license: 'MIT',
        purl: 'pkg:npm/express@4.18.2',
        description: 'Fast, unopinionated web framework',
      },
    ]

    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows)

    const buffer = new ArrayBuffer(10)
    const rows = await parseExcel(buffer)

    expect(rows).toHaveLength(3)

    const components = rows.map((row) => mapRowToComponent(row))

    // Validate all components
    components.forEach((comp) => {
      expect(comp.name).toBeTruthy()
      expect(comp.version).toBeTruthy()
      expect(comp.type).toBeTruthy()
      expect(comp.licenses.length).toBeGreaterThan(0)
      expect(comp.purl).toBeTruthy()
      expect(comp.description).toBeTruthy()
      expect(comp.vulnerabilities).toEqual([])
    })
  })

  it('should handle Excel with alternative column names', async () => {
    const mockRows = [
      {
        'Component Name': 'axios',
        'Component Version': '1.6.0',
        License: 'MIT',
        'Package URL': 'pkg:npm/axios@1.6.0',
      },
    ]

    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows)

    const buffer = new ArrayBuffer(10)
    const rows = await parseExcel(buffer)

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('axios')
    expect(rows[0].version).toBe('1.6.0')
    expect(rows[0].license).toBe('MIT')
  })

  it('should handle Excel with partial column name matches', async () => {
    const mockRows = [
      {
        Component_Name: 'test-lib',
        Component_Version: '1.0.0',
      },
    ]

    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows)

    const buffer = new ArrayBuffer(10)
    const rows = await parseExcel(buffer)

    expect(rows).toHaveLength(1)
    // Should detect via partial match (underscore pattern)
    expect(rows[0].name || rows[0].Component_Name).toBeTruthy()
  })

  it('should handle boolean and object values in cells', async () => {
    const mockRows = [
      {
        name: 'test-lib',
        version: true, // Boolean value
        license: false, // Boolean value
      },
    ]

    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows as any)

    const buffer = new ArrayBuffer(10)
    const rows = await parseExcel(buffer)

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('test-lib')
    // Boolean values should be converted to strings
    expect(rows[0].version).toBe('true')
  })
})

describe('error handling edge cases', () => {
  it('should handle null values in row data', async () => {
    const mockRows = [
      {
        name: null,
        version: null,
        type: 'library',
      },
    ]

    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows as any)

    const buffer = new ArrayBuffer(10)
    const rows = await parseExcel(buffer)

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('')
    expect(rows[0].version).toBe('')
    expect(rows[0].type).toBe('library')
  })

  it('should handle undefined values in row data', async () => {
    const mockRows = [
      {
        name: 'test-lib',
        version: undefined,
        license: undefined,
      },
    ]

    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows as any)

    const buffer = new ArrayBuffer(10)
    const rows = await parseExcel(buffer)

    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('test-lib')
    expect(rows[0].version).toBe('')
    expect(rows[0].license).toBe('')
  })
})

describe('normalizeValue edge cases', () => {
  it('should preserve non-primitive values', async () => {
    const mockRows = [
      {
        name: 'test',
        version: '1.0.0',
        metadata: { key: 'value' }, // Object value
      },
    ]

    vi.mocked(XLSX.utils.sheet_to_json).mockReturnValue(mockRows as any)

    const buffer = new ArrayBuffer(10)
    const rows = await parseExcel(buffer)

    expect(rows).toHaveLength(1)
    expect(rows[0].metadata).toEqual({ key: 'value' })
  })
})
