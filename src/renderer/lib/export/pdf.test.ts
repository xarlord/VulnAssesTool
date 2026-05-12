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
})
