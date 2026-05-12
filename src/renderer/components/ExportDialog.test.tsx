import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportDialog } from './ExportDialog'
import type { Project } from '@@/types'

// Mock the export functions
vi.mock('@/lib/export', () => ({
  exportProjectData: vi.fn(),
  exportAllProjects: vi.fn(),
}))

const { exportProjectData, exportAllProjects } = await import('@/lib/export')

describe('ExportDialog', () => {
  const mockProject: Project = {
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
  }

  const mockProjects: Project[] = [mockProject]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Single Project Export', () => {
    it('should render dialog with title and description', () => {
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      expect(screen.getByText('Export Data')).toBeInTheDocument()
      expect(screen.getByText(/choose the export format/i)).toBeInTheDocument()
    })

    it('should render format selection buttons', () => {
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      expect(screen.getByText('CSV')).toBeInTheDocument()
      expect(screen.getByText('JSON')).toBeInTheDocument()
      expect(screen.getByText('PDF')).toBeInTheDocument()
    })

    it('should render data type selection for single project', () => {
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      expect(screen.getByText('Full Project Report')).toBeInTheDocument()
      expect(screen.getByText('Vulnerabilities Only')).toBeInTheDocument()
      expect(screen.getByText('Components Only')).toBeInTheDocument()
    })

    it('should select CSV format by default', () => {
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      const csvButton = screen.getByText('CSV').closest('button')
      expect(csvButton?.className).toContain('border-primary')
    })

    it('should change format when clicking format buttons', async () => {
      const user = userEvent.setup()
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      const pdfButton = screen.getByText('PDF')
      await user.click(pdfButton)

      expect(screen.getByText(/as PDF/)).toBeInTheDocument()
    })

    it('should call exportProjectData with correct parameters', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(<ExportDialog open={true} onClose={onClose} project={mockProject} />)

      const exportButton = screen.getByRole('button', { name: /^Export$/ })
      await user.click(exportButton)

      expect(exportProjectData).toHaveBeenCalledWith(mockProject, 'csv', 'vulnerabilities')
      expect(onClose).toHaveBeenCalled()
    })

    it('should show exporting state while exporting', async () => {
      const user = userEvent.setup()
      // Mock to keep export pending
      let exportResolver: () => void
      const exportPromise = new Promise<void>((resolve) => {
        exportResolver = resolve
      })
      ;(exportProjectData as any).mockImplementation(() => exportPromise)

      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      const exportButton = screen.getByRole('button', { name: /^Export$/ })
      await user.click(exportButton)

      // Should show exporting state
      expect(await screen.findByText('Exporting...')).toBeInTheDocument()

      // Resolve export
      exportResolver!()
    })

    it('should close dialog when clicking cancel', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(<ExportDialog open={true} onClose={onClose} project={mockProject} />)

      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('should not render when open is false', () => {
      const { container } = render(<ExportDialog open={false} onClose={vi.fn()} project={mockProject} />)

      expect(container.firstChild).toBeNull()
    })
  })

  describe('All Projects Export', () => {
    it('should render data type selection for all projects', () => {
      render(<ExportDialog open={true} onClose={vi.fn()} projects={mockProjects} />)

      expect(screen.getByText('All Projects Summary')).toBeInTheDocument()
      expect(screen.queryByText('Full Project Report')).not.toBeInTheDocument()
      expect(screen.queryByText('Vulnerabilities Only')).not.toBeInTheDocument()
    })

    it('should call exportAllProjects with correct parameters', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(<ExportDialog open={true} onClose={onClose} projects={mockProjects} />)

      const exportButton = screen.getByRole('button', { name: /^Export$/ })
      await user.click(exportButton)

      expect(exportAllProjects).toHaveBeenCalledWith(mockProjects, 'csv')
      expect(onClose).toHaveBeenCalled()
    })

    it('should show correct preview for all projects', () => {
      render(<ExportDialog open={true} onClose={vi.fn()} projects={mockProjects} />)

      expect(screen.getByText(/Exporting 1 projects as CSV/)).toBeInTheDocument()
    })

    /**
     * TC-EXP-004: Export All Projects (JSON) (P1)
     * Description: Verify exporting all projects as JSON format
     * Steps:
     * 1. Open Export dialog with multiple projects
     * 2. Select JSON format
     * 3. Verify preview shows correct format
     * 4. Click Export button
     * 5. Verify exportAllProjects is called with correct parameters
     * Expected: All projects exported as JSON file
     */
    it('TC-EXP-004: should export all projects as JSON format', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const multipleProjects = [
        mockProject,
        {
          ...mockProject,
          id: 'project-2',
          name: 'Second Project',
        },
      ]

      render(<ExportDialog open={true} onClose={onClose} projects={multipleProjects} />)

      // Verify initial state (CSV is default)
      expect(screen.getByText(/Exporting 2 projects as CSV/)).toBeInTheDocument()

      // Click JSON format button
      const jsonButton = screen.getByText('JSON')
      await user.click(jsonButton)

      // Verify preview updated to JSON
      expect(screen.getByText(/Exporting 2 projects as JSON/)).toBeInTheDocument()

      // Click Export button
      const exportButton = screen.getByRole('button', { name: /^Export$/ })
      await user.click(exportButton)

      // Verify exportAllProjects was called with JSON format
      expect(exportAllProjects).toHaveBeenCalledWith(multipleProjects, 'json')
      expect(exportAllProjects).toHaveBeenCalledTimes(1)
      expect(onClose).toHaveBeenCalled()
    })

    it('TC-EXP-004: should export all projects as JSON when single project is provided', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(<ExportDialog open={true} onClose={onClose} projects={mockProjects} />)

      // Select JSON format
      const jsonButton = screen.getByText('JSON')
      await user.click(jsonButton)

      // Verify preview shows JSON format
      expect(screen.getByText(/Exporting 1 projects as JSON/)).toBeInTheDocument()

      // Click Export button
      const exportButton = screen.getByRole('button', { name: /^Export$/ })
      await user.click(exportButton)

      // Verify export was called with JSON
      expect(exportAllProjects).toHaveBeenCalledWith(mockProjects, 'json')
    })
  })

  describe('Export Preview', () => {
    it('should update preview when format changes', async () => {
      const user = userEvent.setup()
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      const pdfButton = screen.getByText('PDF')
      await user.click(pdfButton)

      expect(screen.getByText(/as PDF/)).toBeInTheDocument()
    })

    it('should update preview when data type changes', async () => {
      const user = userEvent.setup()
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      const componentsButton = screen.getByText('Components Only')
      await user.click(componentsButton)

      expect(screen.getByText(/Components Only as CSV/)).toBeInTheDocument()
    })
  })

  describe('Format Selection', () => {
    it('should highlight selected format', () => {
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      const csvButton = screen.getByText('CSV').closest('button')
      const jsonButton = screen.getByText('JSON').closest('button')

      expect(csvButton?.className).toContain('border-primary')
      expect(jsonButton?.className).not.toContain('border-primary')
    })

    it('should update format selection on click', async () => {
      const user = userEvent.setup()
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      const jsonButton = screen.getByText('JSON')
      await user.click(jsonButton)

      const jsonButtonElement = jsonButton.closest('button')
      expect(jsonButtonElement?.className).toContain('border-primary')

      const csvButton = screen.getByText('CSV').closest('button')
      expect(csvButton?.className).not.toContain('border-primary')
    })
  })

  describe('Data Type Selection', () => {
    it('should highlight selected data type', () => {
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      const vulnButton = screen.getByText('Vulnerabilities Only').closest('button')
      expect(vulnButton?.className).toContain('border-primary')
    })

    it('should update data type selection on click', async () => {
      const user = userEvent.setup()
      render(<ExportDialog open={true} onClose={vi.fn()} project={mockProject} />)

      const componentsButton = screen.getByText('Components Only')
      await user.click(componentsButton)

      const componentsButtonElement = componentsButton.closest('button')
      expect(componentsButtonElement?.className).toContain('border-primary')
    })
  })

  describe('Close Button', () => {
    it('should close dialog when clicking X button', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(<ExportDialog open={true} onClose={onClose} project={mockProject} />)

      const closeButton = screen.getByLabelText('Close dialog')
      await user.click(closeButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('should close dialog when clicking backdrop', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      render(<ExportDialog open={true} onClose={onClose} project={mockProject} />)

      const backdrop = screen
        .getByText(/choose the export format/i)
        .parentElement?.parentElement?.querySelector('.fixed.inset-0.bg-black\\/50')
      if (backdrop) {
        await user.click(backdrop)
        expect(onClose).toHaveBeenCalled()
      }
    })
  })
})
