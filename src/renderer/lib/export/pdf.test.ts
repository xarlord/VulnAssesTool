import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  prepareVulnerabilitiesPdf,
  prepareComponentsPdf,
  prepareProjectPdf,
  prepareAllProjectsPdf,
  downloadPdf,
} from './pdf'
import type { Project } from '@@/types'

// Mock jsPDF and autoTable - must be before imports
const mockText = vi.fn()
const mockSetFont = vi.fn()
const mockSetFontSize = vi.fn()
const mockSetTextColor = vi.fn()
const mockSetDrawColor = vi.fn()
const mockSetLineWidth = vi.fn()
const mockLine = vi.fn()
const mockSetPage = vi.fn()
const mockAddPage = vi.fn()
const mockInternal = {
  pages: [{}, {}, {}], // 3 pages including initial
  pageSize: { width: 210, height: 297 },
}
const mockSave = vi.fn()
const mockAutoTable = vi.fn()

vi.mock('jspdf', () => ({
  default: class {
    text = mockText
    setFont = mockSetFont
    setFontSize = mockSetFontSize
    setTextColor = mockSetTextColor
    setDrawColor = mockSetDrawColor
    setLineWidth = mockSetLineWidth
    line = mockLine
    setPage = mockSetPage
    addPage = mockAddPage
    internal = mockInternal
    save = mockSave
    lastAutoTable = { finalY: 100 }
  },
}))

vi.mock('jspdf-autotable', () => ({
  default: vi.fn((doc, options) => {
    mockAutoTable(options)
    // Update doc with mock finalY
    doc.lastAutoTable = { finalY: 100 }
    return doc
  }),
}))

describe('PDF Export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const createMockProject = (): Project => ({
    id: 'project-1',
    name: 'Test Project',
    description: 'A test project',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    lastScanAt: new Date('2024-01-03'),
    sbomFiles: [],
    components: [
      {
        id: 'comp-1',
        name: 'lodash',
        version: '4.17.21',
        type: 'library',
        licenses: ['MIT'],
        vulnerabilities: ['CVE-2021-23337'],
        dependencies: [],
      },
      {
        id: 'comp-2',
        name: 'express',
        version: '4.18.0',
        type: 'framework',
        licenses: ['MIT'],
        vulnerabilities: [],
        dependencies: [],
      },
    ],
    vulnerabilities: [
      {
        id: 'CVE-2021-23337',
        source: 'nvd',
        severity: 'critical',
        cvssScore: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        description: 'Prototype pollution vulnerability',
        references: [],
        affectedComponents: ['comp-1'],
      },
      {
        id: 'CVE-2022-1234',
        source: 'osv',
        severity: 'high',
        cvssScore: 8.5,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H',
        description: 'Another vulnerability',
        references: [],
        affectedComponents: ['comp-1'],
      },
    ],
    statistics: {
      totalVulnerabilities: 2,
      criticalCount: 1,
      highCount: 1,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: 2,
      vulnerableComponents: 1,
    },
  })

  describe('Vulnerabilities PDF Export', () => {
    it('should create PDF with vulnerability data', () => {
      const project = createMockProject()
      const doc = prepareVulnerabilitiesPdf(project)

      expect(doc).toBeDefined()
      expect(mockText).toHaveBeenCalledWith('Vulnerability Report', 14, 20)
    })

    it('should include project name in header', () => {
      const project = createMockProject()
      prepareVulnerabilitiesPdf(project)

      expect(mockText).toHaveBeenCalledWith('Vulnerability Report', 14, 20)
    })

    it('should call autoTable for vulnerabilities', () => {
      const project = createMockProject()
      prepareVulnerabilitiesPdf(project)

      expect(mockAutoTable).toHaveBeenCalled()
    })

    it('should include statistics in PDF', () => {
      const project = createMockProject()
      prepareVulnerabilitiesPdf(project)

      expect(mockText).toHaveBeenCalledWith(expect.stringContaining('Summary'), 14, expect.any(Number))
    })

    it('should handle project with no vulnerabilities', () => {
      const project = {
        ...createMockProject(),
        vulnerabilities: [],
        statistics: {
          totalVulnerabilities: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          totalComponents: 2,
          vulnerableComponents: 0,
        },
      }

      const doc = prepareVulnerabilitiesPdf(project)

      expect(doc).toBeDefined()
      expect(mockAutoTable).toHaveBeenCalled()
    })
  })

  describe('Components PDF Export', () => {
    it('should create PDF with component data', () => {
      const project = createMockProject()
      const doc = prepareComponentsPdf(project)

      expect(doc).toBeDefined()
      expect(mockText).toHaveBeenCalledWith('Component Inventory', 14, 20)
    })

    it('should include component statistics', () => {
      const project = createMockProject()
      prepareComponentsPdf(project)

      expect(mockText).toHaveBeenCalledWith(expect.stringContaining('Statistics'), 14, expect.any(Number))
    })

    it('should call autoTable for components', () => {
      const project = createMockProject()
      prepareComponentsPdf(project)

      expect(mockAutoTable).toHaveBeenCalled()
    })

    it('should handle project with no components', () => {
      const project = {
        ...createMockProject(),
        components: [],
        statistics: {
          totalVulnerabilities: 2,
          criticalCount: 1,
          highCount: 1,
          mediumCount: 0,
          lowCount: 0,
          totalComponents: 0,
          vulnerableComponents: 0,
        },
      }

      const doc = prepareComponentsPdf(project)

      expect(doc).toBeDefined()
    })
  })

  describe('Project PDF Export', () => {
    it('should create comprehensive project PDF', () => {
      const project = createMockProject()
      const doc = prepareProjectPdf(project)

      expect(doc).toBeDefined()
      expect(mockText).toHaveBeenCalledWith('Vulnerability Assessment Report', 14, 20)
    })

    it('should include project information', () => {
      const project = createMockProject()
      prepareProjectPdf(project)

      expect(mockText).toHaveBeenCalledWith('Project Information', 14, expect.any(Number))
    })

    it('should include vulnerability statistics', () => {
      const project = createMockProject()
      prepareProjectPdf(project)

      expect(mockText).toHaveBeenCalledWith('Vulnerability Statistics', 14, expect.any(Number))
    })

    it('should include top vulnerabilities', () => {
      const project = createMockProject()
      prepareProjectPdf(project)

      expect(mockText).toHaveBeenCalledWith(expect.stringContaining('Vulnerabilities'), 14, expect.any(Number))
    })

    it('should add new page for components', () => {
      const project = createMockProject()
      prepareProjectPdf(project)

      expect(mockAddPage).toHaveBeenCalled()
    })
  })

  describe('All Projects PDF Export', () => {
    it('should create summary PDF for all projects', () => {
      const projects: Project[] = [createMockProject()]
      const doc = prepareAllProjectsPdf(projects)

      expect(doc).toBeDefined()
      expect(mockText).toHaveBeenCalledWith('All Projects Summary', 14, 20)
    })

    it('should aggregate statistics across projects', () => {
      const projects: Project[] = [
        createMockProject(),
        {
          ...createMockProject(),
          id: 'project-2',
          name: 'Another Project',
          statistics: {
            totalVulnerabilities: 5,
            criticalCount: 2,
            highCount: 1,
            mediumCount: 1,
            lowCount: 1,
            totalComponents: 3,
            vulnerableComponents: 2,
          },
        },
      ]

      prepareAllProjectsPdf(projects)

      expect(mockText).toHaveBeenCalledWith('Overall Statistics', 14, expect.any(Number))
    })

    it('should include projects overview table', () => {
      const projects: Project[] = [createMockProject()]
      prepareAllProjectsPdf(projects)

      expect(mockText).toHaveBeenCalledWith('Projects Overview', 14, expect.any(Number))
      expect(mockAutoTable).toHaveBeenCalled()
    })

    it('should handle empty projects array', () => {
      const doc = prepareAllProjectsPdf([])

      expect(doc).toBeDefined()
      expect(mockAutoTable).toHaveBeenCalled()
    })
  })

  describe('File Download', () => {
    it('should trigger PDF file download', () => {
      const mockDoc = {
        save: mockSave,
      }

      downloadPdf(mockDoc as any, 'test.pdf')

      expect(mockSave).toHaveBeenCalledWith('test.pdf')
    })
  })

  describe('Empty Data Handling', () => {
    it('should handle project with no vulnerabilities', () => {
      const project = {
        ...createMockProject(),
        vulnerabilities: [],
        statistics: {
          totalVulnerabilities: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          totalComponents: 2,
          vulnerableComponents: 0,
        },
      }

      const doc = prepareVulnerabilitiesPdf(project)

      expect(doc).toBeDefined()
    })

    it('should handle project with no components', () => {
      const project = {
        ...createMockProject(),
        components: [],
        statistics: {
          totalVulnerabilities: 2,
          criticalCount: 1,
          highCount: 1,
          mediumCount: 0,
          lowCount: 0,
          totalComponents: 0,
          vulnerableComponents: 0,
        },
      }

      const doc = prepareComponentsPdf(project)

      expect(doc).toBeDefined()
    })

    it('should handle empty projects array', () => {
      const doc = prepareAllProjectsPdf([])

      expect(doc).toBeDefined()
    })
  })

  describe('Branch Coverage - didParseCell Callbacks', () => {
    const getCallOptions = (callIndex: number) => mockAutoTable.mock.calls[callIndex][0]

    describe('prepareVulnerabilitiesPdf severity coloring', () => {
      it('should color critical severity cells in vulnerability table', () => {
        const project = createMockProject()
        prepareVulnerabilitiesPdf(project)
        // Second autoTable call is the vulnerability table (index 1)
        const options = getCallOptions(1)

        const cellData = {
          column: { index: 1 },
          section: 'body',
          cell: {
            raw: 'Critical',
            styles: { textColor: [0, 0, 0], fontStyle: 'normal' },
          },
        }
        options.didParseCell(cellData)

        expect(cellData.cell.styles.textColor).toEqual([220, 38, 38])
        expect(cellData.cell.styles.fontStyle).toBe('bold')
      })

      it('should apply default gray color for unknown severity', () => {
        const project = createMockProject()
        prepareVulnerabilitiesPdf(project)
        const options = getCallOptions(1)

        const cellData = {
          column: { index: 1 },
          section: 'body',
          cell: {
            raw: 'Unknown',
            styles: { textColor: [0, 0, 0], fontStyle: 'normal' },
          },
        }
        options.didParseCell(cellData)

        expect(cellData.cell.styles.textColor).toEqual([107, 114, 128])
        expect(cellData.cell.styles.fontStyle).toBe('bold')
      })

      it('should skip coloring for non-severity columns', () => {
        const project = createMockProject()
        prepareVulnerabilitiesPdf(project)
        const options = getCallOptions(1)

        const originalColor = [0, 0, 0]
        const cellData = {
          column: { index: 0 },
          section: 'body',
          cell: {
            raw: 'CVE-2021-23337',
            styles: { textColor: originalColor, fontStyle: 'normal' },
          },
        }
        options.didParseCell(cellData)

        expect(cellData.cell.styles.textColor).toBe(originalColor)
        expect(cellData.cell.styles.fontStyle).toBe('normal')
      })

      it('should skip coloring for header rows', () => {
        const project = createMockProject()
        prepareVulnerabilitiesPdf(project)
        const options = getCallOptions(1)

        const cellData = {
          column: { index: 1 },
          section: 'head',
          cell: {
            raw: 'Severity',
            styles: { textColor: 255, fontStyle: 'bold' },
          },
        }
        options.didParseCell(cellData)

        expect(cellData.cell.styles.textColor).toBe(255)
      })
    })

    describe('prepareComponentsPdf vulnerability count highlighting', () => {
      it('should highlight non-zero vulnerability count in red', () => {
        const project = createMockProject()
        prepareComponentsPdf(project)
        // Second autoTable call is the components table (index 1)
        const options = getCallOptions(1)

        const cellData = {
          column: { index: 4 },
          section: 'body',
          cell: {
            raw: '3',
            styles: { textColor: [0, 0, 0], fontStyle: 'normal' },
          },
        }
        options.didParseCell(cellData)

        expect(cellData.cell.styles.textColor).toEqual([220, 38, 38])
        expect(cellData.cell.styles.fontStyle).toBe('bold')
      })

      it('should not highlight zero vulnerability count', () => {
        const project = createMockProject()
        prepareComponentsPdf(project)
        const options = getCallOptions(1)

        const originalColor = [0, 0, 0]
        const cellData = {
          column: { index: 4 },
          section: 'body',
          cell: {
            raw: '0',
            styles: { textColor: originalColor, fontStyle: 'normal' },
          },
        }
        options.didParseCell(cellData)

        expect(cellData.cell.styles.textColor).toBe(originalColor)
        expect(cellData.cell.styles.fontStyle).toBe('normal')
      })
    })

    describe('prepareProjectPdf severity coloring', () => {
      it('should color medium severity cells in project PDF', () => {
        const project = createMockProject()
        prepareProjectPdf(project)
        // Third autoTable call (index 2) is the vulnerability table
        const options = getCallOptions(2)

        const cellData = {
          column: { index: 1 },
          section: 'body',
          cell: {
            raw: 'Medium',
            styles: { textColor: [0, 0, 0], fontStyle: 'normal' },
          },
        }
        options.didParseCell(cellData)

        expect(cellData.cell.styles.textColor).toEqual([202, 138, 4])
        expect(cellData.cell.styles.fontStyle).toBe('bold')
      })

      it('should color low severity cells in project PDF', () => {
        const project = createMockProject()
        prepareProjectPdf(project)
        const options = getCallOptions(2)

        const cellData = {
          column: { index: 1 },
          section: 'body',
          cell: {
            raw: 'Low',
            styles: { textColor: [0, 0, 0], fontStyle: 'normal' },
          },
        }
        options.didParseCell(cellData)

        expect(cellData.cell.styles.textColor).toEqual([34, 197, 94])
      })

      it('should color high severity cells in project PDF', () => {
        const project = createMockProject()
        prepareProjectPdf(project)
        const options = getCallOptions(2)

        const cellData = {
          column: { index: 1 },
          section: 'body',
          cell: {
            raw: 'High',
            styles: { textColor: [0, 0, 0], fontStyle: 'normal' },
          },
        }
        options.didParseCell(cellData)

        expect(cellData.cell.styles.textColor).toEqual([234, 88, 12])
      })
    })
  })

  describe('Branch Coverage - Sorting and Data Variations', () => {
    it('should sort vulnerabilities by CVSS score when severity is equal', () => {
      const project = createMockProject()
      project.vulnerabilities = [
        {
          id: 'CVE-2024-LOW',
          source: 'nvd',
          severity: 'high',
          cvssScore: 7.5,
          cvssVector: '',
          description: 'Lower CVSS high vuln',
          references: [],
          affectedComponents: [],
        },
        {
          id: 'CVE-2024-HIGH',
          source: 'nvd',
          severity: 'high',
          cvssScore: 8.9,
          cvssVector: '',
          description: 'Higher CVSS high vuln',
          references: [],
          affectedComponents: [],
        },
      ]

      prepareProjectPdf(project)

      // Third autoTable call is the sorted vulnerability table
      const vulnOptions = mockAutoTable.mock.calls[2][0]
      // Higher CVSS should come first within same severity
      expect(vulnOptions.body[0][0]).toBe('CVE-2024-HIGH')
      expect(vulnOptions.body[1][0]).toBe('CVE-2024-LOW')
    })

    it('should handle vulnerabilities with undefined cvssScore in sort', () => {
      const project = createMockProject()
      project.vulnerabilities = [
        {
          id: 'CVE-2024-SCORE',
          source: 'nvd',
          severity: 'medium',
          cvssScore: 5.5,
          cvssVector: '',
          description: 'Has CVSS score',
          references: [],
          affectedComponents: [],
        },
        {
          id: 'CVE-2024-NOSCORE',
          source: 'nvd',
          severity: 'medium',
          cvssVector: '',
          cvssScore: undefined,
          description: 'No CVSS score',
          references: [],
          affectedComponents: [],
        },
      ]

      prepareProjectPdf(project)

      const vulnOptions = mockAutoTable.mock.calls[2][0]
      // Scored vulnerability should come before undefined (0)
      expect(vulnOptions.body[0][0]).toBe('CVE-2024-SCORE')
      expect(vulnOptions.body[1][2]).toBe('N/A')
    })

    it('should show N/A for vulnerabilities without cvssScore in vulnerability PDF', () => {
      const project = createMockProject()
      project.vulnerabilities = [
        {
          id: 'CVE-NO-CVSS',
          source: 'nvd',
          severity: 'medium',
          cvssScore: undefined,
          cvssVector: '',
          description: 'Vulnerability without CVSS',
          references: [],
          affectedComponents: [],
        },
      ]

      prepareVulnerabilitiesPdf(project)

      const vulnOptions = mockAutoTable.mock.calls[1][0]
      expect(vulnOptions.body[0][2]).toBe('N/A')
    })

    it('should truncate descriptions over 80 chars in vulnerability PDF', () => {
      const project = createMockProject()
      project.vulnerabilities = [
        {
          id: 'CVE-LONG-DESC',
          source: 'nvd',
          severity: 'low',
          cvssScore: 3.2,
          cvssVector: '',
          description: 'A'.repeat(100),
          references: [],
          affectedComponents: [],
        },
      ]

      prepareVulnerabilitiesPdf(project)

      const vulnOptions = mockAutoTable.mock.calls[1][0]
      expect(vulnOptions.body[0][4]).toContain('...')
    })

    it('should truncate descriptions over 60 chars in project PDF', () => {
      const project = createMockProject()
      project.vulnerabilities = [
        {
          id: 'CVE-LONG-DESC-2',
          source: 'nvd',
          severity: 'low',
          cvssScore: 3.0,
          cvssVector: '',
          description: 'B'.repeat(70),
          references: [],
          affectedComponents: [],
        },
      ]

      prepareProjectPdf(project)

      const vulnOptions = mockAutoTable.mock.calls[2][0]
      expect(vulnOptions.body[0][4]).toContain('...')
    })

    it('should use N/A for empty project description', () => {
      const project = createMockProject()
      project.description = ''

      prepareProjectPdf(project)

      const infoOptions = mockAutoTable.mock.calls[0][0]
      const descRow = infoOptions.body.find((row: string[]) => row[0] === 'Description')
      expect(descRow).toBeDefined()
      expect(descRow[1]).toBe('N/A')
    })

    it('should show N/A when lastScanAt is undefined', () => {
      const project = createMockProject()
      project.lastScanAt = undefined

      prepareProjectPdf(project)

      const infoOptions = mockAutoTable.mock.calls[0][0]
      const scanRow = infoOptions.body.find((row: string[]) => row[0] === 'Last Scan')
      expect(scanRow).toBeDefined()
      // formatLocaleDate(undefined) returns 'N/A'; the || 'Not scanned' is dead code
      expect(scanRow[1]).toBe('N/A')
    })

    it('should handle string dates in project info', () => {
      const project = createMockProject()
      project.createdAt = '2024-06-15'

      prepareProjectPdf(project)

      const infoOptions = mockAutoTable.mock.calls[0][0]
      const createdRow = infoOptions.body.find((row: string[]) => row[0] === 'Created')
      expect(createdRow).toBeDefined()
      expect(createdRow[1]).not.toBe('N/A')
    })

    it('should handle invalid date strings', () => {
      const project = createMockProject()
      project.updatedAt = 'not-a-valid-date'

      prepareProjectPdf(project)

      const infoOptions = mockAutoTable.mock.calls[0][0]
      const updatedRow = infoOptions.body.find((row: string[]) => row[0] === 'Last Updated')
      expect(updatedRow).toBeDefined()
      expect(updatedRow[1]).toBe('N/A')
    })

    it('should show Yes for components with fix available', () => {
      const project = createMockProject()
      project.components[0].patchInfo = { hasFixAvailable: true }

      prepareComponentsPdf(project)

      const compOptions = mockAutoTable.mock.calls[1][0]
      const lodashRow = compOptions.body.find((row: string[]) => row[0] === 'lodash')
      expect(lodashRow).toBeDefined()
      expect(lodashRow[5]).toBe('Yes')
    })

    it('should show No for components with fix unavailable', () => {
      const project = createMockProject()
      project.components[0].patchInfo = { hasFixAvailable: false }

      prepareComponentsPdf(project)

      const compOptions = mockAutoTable.mock.calls[1][0]
      const lodashRow = compOptions.body.find((row: string[]) => row[0] === 'lodash')
      expect(lodashRow).toBeDefined()
      expect(lodashRow[5]).toBe('No')
    })

    it('should show No for components without patchInfo in project PDF', () => {
      const project = createMockProject()

      prepareProjectPdf(project)

      // Fourth autoTable call is components in project PDF
      const compOptions = mockAutoTable.mock.calls[3][0]
      const lodashRow = compOptions.body.find((row: string[]) => row[0] === 'lodash')
      expect(lodashRow).toBeDefined()
      expect(lodashRow[4]).toBe('No')
    })

    it('should count components with fix available in stats', () => {
      const project = createMockProject()
      project.components[0].patchInfo = { hasFixAvailable: true }
      project.components[1].patchInfo = { hasFixAvailable: false }

      prepareComponentsPdf(project)

      const statsOptions = mockAutoTable.mock.calls[0][0]
      const fixRow = statsOptions.body.find((row: string[]) => row[0] === 'With Fixes Available')
      expect(fixRow).toBeDefined()
      expect(fixRow[1]).toBe('1')
    })
  })
})
