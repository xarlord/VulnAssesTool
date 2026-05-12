import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  exportVulnerabilitiesToCsv,
  exportComponentsToCsv,
  downloadCsv,
  sanitizeFilename,
  generateFilename,
  getVulnerabilityCsvHeader,
  getComponentCsvHeader,
  vulnerabilityToCsvRow,
  componentToCsvRow,
  vulnerabilityToCsvLine,
  componentToCsvLine,
  buildComponentMap,
} from './csv'
import type { Vulnerability, Component } from '@@/types'

// Mock document methods for testing
const mockClick = vi.fn()
const mockLinkElement = {
  href: '',
  download: '',
  click: mockClick,
}
const mockCreateElement = vi.fn(() => mockLinkElement)
const mockAppendChild = vi.fn()
const mockRemoveChild = vi.fn()
const mockCreateObjectURL = vi.fn((blob: Blob) => 'mock-url')
const mockRevokeObjectURL = vi.fn()

Object.defineProperty(global, 'document', {
  value: {
    createElement: mockCreateElement,
    body: {
      appendChild: mockAppendChild,
      removeChild: mockRemoveChild,
    },
  },
  writable: true,
})

Object.defineProperty(global, 'URL', {
  value: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
  writable: true,
})

describe('CSV Export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('CSV Row Generation', () => {
    it('should convert vulnerability to CSV row', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1234',
        source: 'nvd',
        severity: 'critical',
        cvssScore: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        description: 'Test vulnerability',
        references: [{ source: 'NVD', url: 'https://nvd.nist.gov/vuln/detail/CVE-2024-1234' }],
        affectedComponents: ['comp-1'],
        cwes: ['CWE-79'],
      }

      const row = vulnerabilityToCsvRow(vuln, 'Component 1')

      expect(row.id).toBe('CVE-2024-1234')
      expect(row.severity).toBe('critical')
      expect(row.cvssScore).toBe('9.8')
      expect(row.component).toBe('Component 1')
      expect(row.patchAvailable).toBe('Unknown')
      expect(row.cwes).toBe('CWE-79')
    })

    it('should handle vulnerability with patch info', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1234',
        source: 'osv',
        severity: 'high',
        cvssScore: 8.5,
        description: 'Test with patch',
        references: [],
        affectedComponents: [],
        patchedVersions: ['1.2.0'],
        patchInfo: {
          fixedVersions: ['1.2.0'],
          patchAvailability: 'available',
          patchLinks: [],
          remediationAdvice: { text: 'Update to 1.2.0' },
          affectedVersionRanges: [],
        },
      }

      const row = vulnerabilityToCsvRow(vuln)

      expect(row.patchAvailable).toBe('Available')
    })

    it('should convert component to CSV row', () => {
      const comp: Component = {
        id: 'comp-1',
        name: 'lodash',
        version: '4.17.21',
        type: 'library',
        purl: 'pkg:npm/lodash@4.17.21',
        licenses: ['MIT'],
        vulnerabilities: ['CVE-2021-23337'],
        dependencies: ['dep-1', 'dep-2'],
        patchInfo: {
          hasFixAvailable: true,
          recommendedVersion: '4.17.22',
          fixedVersions: ['4.17.22'],
          vulnerableVersions: ['4.17.21'],
        },
      }

      const row = componentToCsvRow(comp)

      expect(row.id).toBe('comp-1')
      expect(row.name).toBe('lodash')
      expect(row.licenses).toBe('MIT') // Array formatted as semicolon-separated
      expect(row.vulnerabilityCount).toBe(1)
      expect(row.patchAvailable).toBe('Available')
      expect(row.recommendedVersion).toBe('4.17.22')
      expect(row.dependenciesCount).toBe(2)
    })
  })

  describe('CSV Line Generation', () => {
    it('should generate vulnerability CSV line', () => {
      const vuln: Vulnerability = {
        id: 'CVE-2024-1234',
        source: 'nvd',
        severity: 'critical',
        cvssScore: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        description: 'Test, with comma',
        references: [],
        affectedComponents: [],
      }

      const line = vulnerabilityToCsvLine(vuln)

      expect(line).toContain('CVE-2024-1234')
      expect(line).toContain('"Test, with comma"') // Should be quoted
      expect(line).toMatch(/^CVE-2024-1234,critical/) // CSV format with first fields unquoted
    })

    it('should generate component CSV line', () => {
      const comp: Component = {
        id: 'comp-1',
        name: 'Test Component',
        version: '1.0.0',
        type: 'library',
        licenses: ['MIT', 'Apache-2.0'],
        vulnerabilities: [],
        dependencies: [],
      }

      const line = componentToCsvLine(comp)

      expect(line).toContain('comp-1')
      expect(line).toContain('MIT; Apache-2.0') // Licenses as semicolon-separated
    })
  })

  describe('CSV Export Functions', () => {
    it('should export vulnerabilities to CSV with header', () => {
      const vulnerabilities: Vulnerability[] = [
        {
          id: 'CVE-2024-0001',
          source: 'nvd',
          severity: 'critical',
          cvssScore: 9.8,
          description: 'Vuln 1',
          references: [],
          affectedComponents: [],
        },
        {
          id: 'CVE-2024-0002',
          source: 'osv',
          severity: 'high',
          cvssScore: 8.5,
          description: 'Vuln 2',
          references: [],
          affectedComponents: [],
        },
      ]

      const csv = exportVulnerabilitiesToCsv(vulnerabilities)

      expect(csv).toContain('ID,Severity')
      expect(csv).toContain('CVE-2024-0001')
      expect(csv).toContain('CVE-2024-0002')
      expect(csv).toContain('\r\n')
    })

    it('should export components to CSV with header', () => {
      const components: Component[] = [
        {
          id: 'comp-1',
          name: 'lodash',
          version: '4.17.21',
          type: 'library',
          licenses: ['MIT'],
          vulnerabilities: [],
          dependencies: [],
        },
      ]

      const csv = exportComponentsToCsv(components)

      expect(csv).toContain('ID,Name')
      expect(csv).toContain('lodash')
      expect(csv).toContain('\r\n')
    })

    it('should handle empty arrays', () => {
      const vulnCsv = exportVulnerabilitiesToCsv([])
      const compCsv = exportComponentsToCsv([])

      expect(vulnCsv).toContain('ID,Severity')
      expect(vulnCsv.split('\r\n').length).toBe(2) // Header + empty line

      expect(compCsv).toContain('ID,Name')
      expect(compCsv.split('\r\n').length).toBe(2)
    })
  })

  describe('CSV Headers', () => {
    it('should return vulnerability CSV header', () => {
      const header = getVulnerabilityCsvHeader()

      expect(header).toBe(
        'ID,Severity,CVSS Score,CVSS Vector,Component,Description,Source,References,Patch Available,CWEs,Published Date,Modified Date',
      )
    })

    it('should return component CSV header', () => {
      const header = getComponentCsvHeader()

      expect(header).toBe(
        'ID,Name,Version,Type,Licenses,PURL,Vulnerability Count,Patch Available,Recommended Version,Dependencies Count',
      )
    })
  })

  describe('File Download', () => {
    it('should trigger CSV file download', () => {
      const csvContent = 'ID,Name\nCVE-2024-1234,Test'
      const filename = 'test.csv'

      downloadCsv(csvContent, filename)

      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(mockCreateElement).toHaveBeenCalledWith('a')
      expect(mockAppendChild).toHaveBeenCalled()
      expect(mockRemoveChild).toHaveBeenCalled()
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('mock-url')
    })

    it('should create blob with correct MIME type', () => {
      const csvContent = 'test data'
      const filename = 'test.csv'

      downloadCsv(csvContent, filename)

      // Verify createObjectURL was called
      expect(mockCreateObjectURL).toHaveBeenCalled()
      // The first argument should be a Blob
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    })
  })

  describe('Filename Generation', () => {
    it('should sanitize filenames by removing special characters', () => {
      expect(sanitizeFilename('Test Project<>')).toBe('test-project--')
      expect(sanitizeFilename('Project/Name\\Test')).toBe('project-name-test')
      expect(sanitizeFilename('Test   Project')).toBe('test-project')
    })

    it('should generate filename for project export', () => {
      const filename = generateFilename('My Project', 'csv', 'project')
      const date = new Date().toISOString().split('T')[0]

      expect(filename).toContain('my-project')
      expect(filename).toContain(date)
      expect(filename).toContain('.csv')
    })

    it('should generate filename for vulnerabilities export', () => {
      const filename = generateFilename('My Project', 'csv', 'vulnerabilities')

      expect(filename).toContain('my-project')
      expect(filename).toContain('vulnerabilities')
      expect(filename).toContain('.csv')
      expect(filename).toMatch(/^my-project-vulnerabilities-.*\.csv$/)
    })

    it('should generate filename for all projects export', () => {
      const filename = generateFilename('', 'csv', 'all-projects')
      const date = new Date().toISOString().split('T')[0]

      expect(filename).toBe(`all-projects-${date}.csv`)
    })
  })

  describe('Component Map Building', () => {
    it('should build component name map from vulnerabilities', () => {
      const vulnerabilities: Vulnerability[] = [
        {
          id: 'CVE-2024-0001',
          source: 'nvd',
          severity: 'critical',
          description: 'Vuln 1',
          references: [],
          affectedComponents: ['comp-1', 'comp-2'],
        },
      ]

      const map = buildComponentMap(vulnerabilities)

      expect(map.has('comp-1')).toBe(true)
      expect(map.has('comp-2')).toBe(true)
    })

    it('should return empty map for no vulnerabilities', () => {
      const map = buildComponentMap([])

      expect(map.size).toBe(0)
    })
  })
})
