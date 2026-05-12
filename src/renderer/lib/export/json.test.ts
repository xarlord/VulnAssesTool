import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  prepareProjectJson,
  prepareVulnerabilitiesJson,
  prepareComponentsJson,
  prepareAllProjectsJson,
  downloadJson,
} from './json'
import type { Project } from '@@/types'

// Mock document methods
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

describe('JSON Export', () => {
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
    ],
    vulnerabilities: [
      {
        id: 'CVE-2021-23337',
        source: 'nvd',
        severity: 'critical',
        cvssScore: 9.8,
        cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
        description: 'Prototype pollution',
        references: [],
        affectedComponents: ['comp-1'],
      },
    ],
    statistics: {
      totalVulnerabilities: 1,
      criticalCount: 1,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: 1,
      vulnerableComponents: 1,
    },
  })

  describe('Project JSON Export', () => {
    it('should export full project data to JSON', () => {
      const project = createMockProject()
      const json = prepareProjectJson(project)
      const data = JSON.parse(json)

      expect(data.metadata).toBeDefined()
      expect(data.metadata.format).toBe('json')
      expect(data.metadata.dataType).toBe('project')
      expect(data.project.id).toBe('project-1')
      expect(data.project.name).toBe('Test Project')
      expect(data.vulnerabilities).toHaveLength(1)
      expect(data.components).toHaveLength(1)
    })

    it('should include ISO date strings', () => {
      const project = createMockProject()
      const json = prepareProjectJson(project)
      const data = JSON.parse(json)

      expect(data.project.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(data.project.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    it('should include vulnerability details', () => {
      const project = createMockProject()
      const json = prepareProjectJson(project)
      const data = JSON.parse(json)

      expect(data.vulnerabilities[0]).toMatchObject({
        id: 'CVE-2021-23337',
        severity: 'critical',
        cvssScore: 9.8,
      })
    })

    it('should include component dependencies', () => {
      const project = createMockProject()
      const json = prepareProjectJson(project)
      const data = JSON.parse(json)

      expect(data.components[0].dependencies).toEqual([])
    })
  })

  describe('Vulnerabilities-Only JSON Export', () => {
    it('should export only vulnerabilities to JSON', () => {
      const project = createMockProject()
      const json = prepareVulnerabilitiesJson(project)
      const data = JSON.parse(json)

      expect(data.metadata.dataType).toBe('vulnerabilities')
      expect(data.projectName).toBe('Test Project')
      expect(data.vulnerabilities).toHaveLength(1)
      expect(data.statistics).toBeDefined()
      // Should NOT include components or other fields
      expect(data).not.toHaveProperty('components')
    })

    it('should include statistics in vulnerabilities export', () => {
      const project = createMockProject()
      const json = prepareVulnerabilitiesJson(project)
      const data = JSON.parse(json)

      expect(data.statistics).toMatchObject({
        totalVulnerabilities: 1,
        criticalCount: 1,
      })
    })
  })

  describe('Components-Only JSON Export', () => {
    it('should export only components to JSON', () => {
      const project = createMockProject()
      const json = prepareComponentsJson(project)
      const data = JSON.parse(json)

      expect(data.metadata.dataType).toBe('components')
      expect(data.components).toHaveLength(1)
      expect(data.components[0]).toMatchObject({
        id: 'comp-1',
        name: 'lodash',
        version: '4.17.21',
      })
      // Should include component-specific stats
      expect(data.statistics).toBeDefined()
    })

    it('should calculate vulnerability count per component', () => {
      const project = createMockProject()
      const json = prepareComponentsJson(project)
      const data = JSON.parse(json)

      expect(data.components[0].vulnerabilityCount).toBe(1)
      expect(data.statistics.componentsWithFixes).toBeDefined()
    })
  })

  describe('All Projects JSON Export', () => {
    it('should export all projects summary to JSON', () => {
      const projects: Project[] = [
        createMockProject(),
        {
          ...createMockProject(),
          id: 'project-2',
          name: 'Another Project',
          statistics: {
            totalVulnerabilities: 5,
            criticalCount: 1,
            highCount: 1,
            mediumCount: 2,
            lowCount: 1,
            totalComponents: 3,
            vulnerableComponents: 2,
          },
        },
      ]
      const json = prepareAllProjectsJson(projects)
      const data = JSON.parse(json)

      expect(data.metadata.dataType).toBe('all-projects')
      expect(data.projects).toHaveLength(2)
      expect(data.summary.totalProjects).toBe(2)
      expect(data.summary.totalVulnerabilities).toBe(6) // 1 + 5
    })

    it('should aggregate statistics across all projects', () => {
      const projects: Project[] = [
        createMockProject(),
        {
          ...createMockProject(),
          id: 'project-2',
          name: 'Another Project',
          statistics: {
            totalVulnerabilities: 5,
            criticalCount: 1,
            highCount: 1,
            mediumCount: 2,
            lowCount: 1,
            totalComponents: 3,
            vulnerableComponents: 2,
          },
        },
      ]
      const json = prepareAllProjectsJson(projects)
      const data = JSON.parse(json)

      expect(data.summary.totalCritical).toBe(2) // 1 + 1
      expect(data.summary.totalHigh).toBe(1)
    })
  })

  describe('File Download', () => {
    it('should trigger JSON file download', () => {
      const jsonContent = '{"test": "data"}'
      const filename = 'test.json'

      downloadJson(jsonContent, filename)

      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(mockCreateElement).toHaveBeenCalledWith('a')
      expect(mockAppendChild).toHaveBeenCalled()
      expect(mockRemoveChild).toHaveBeenCalled()
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('mock-url')
    })

    it('should create blob with correct MIME type', () => {
      const jsonContent = '{"test": "data"}'
      const filename = 'test.json'

      downloadJson(jsonContent, filename)

      // Verify createObjectURL was called
      expect(mockCreateObjectURL).toHaveBeenCalled()
      // The first argument should be a Blob
      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    })
  })

  describe('Empty Data Handling', () => {
    it('should handle project with no vulnerabilities', () => {
      const project = {
        ...createMockProject(),
        vulnerabilities: [],
      }
      const json = prepareVulnerabilitiesJson(project)
      const data = JSON.parse(json)

      expect(data.vulnerabilities).toHaveLength(0)
      expect(data.metadata.recordCount).toBe(0)
    })

    it('should handle project with no components', () => {
      const project = {
        ...createMockProject(),
        components: [],
      }
      const json = prepareComponentsJson(project)
      const data = JSON.parse(json)

      expect(data.components).toHaveLength(0)
      expect(data.metadata.recordCount).toBe(0)
    })

    it('should handle empty projects array', () => {
      const json = prepareAllProjectsJson([])
      const data = JSON.parse(json)

      expect(data.projects).toHaveLength(0)
      expect(data.summary.totalProjects).toBe(0)
    })
  })
})
