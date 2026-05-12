import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { Dashboard } from './Dashboard'
import { useStore } from '@/store/useStore'

// Mock the store
vi.mock('@/store/useStore')

// Mock navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock child components to simplify testing
vi.mock('@/components/CreateProjectDialog', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="create-project-dialog">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

vi.mock('@/components/SbomUploadDialog', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="sbom-upload-dialog">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

vi.mock('@/components/ProjectCard', () => ({
  default: ({
    project,
    onView,
    onDelete,
  }: {
    project: { id: string; name: string }
    onView: (p: any) => void
    onDelete: (id: string) => void
  }) => (
    <div data-testid={`project-card-${project.id}`}>
      <span>{project.name}</span>
      <button onClick={() => onView(project)}>View</button>
      <button onClick={() => onDelete(project.id)}>Delete</button>
    </div>
  ),
}))

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockReset()
    // Mock useStore
    vi.mocked(useStore).mockReturnValue({
      projects: [],
      addProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      setCurrentProject: vi.fn(),
      currentProject: null,
      settings: {
        theme: 'system',
        fontSize: 'default',
        nvdApiKey: undefined,
        dataRetentionDays: 30,
        autoRefresh: false,
      },
      updateSettings: vi.fn(),
    } as any)
  })

  const renderDashboard = (projects: any[] = []) => {
    vi.mocked(useStore).mockReturnValue({
      projects,
      addProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      setCurrentProject: vi.fn(),
      currentProject: null,
      settings: {
        theme: 'system',
        fontSize: 'default',
        nvdApiKey: undefined,
        dataRetentionDays: 30,
        autoRefresh: false,
      },
      updateSettings: vi.fn(),
    } as any)

    return render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )
  }

  describe('Rendering', () => {
    it('should render the header with app name', () => {
      renderDashboard()

      expect(screen.getByText('VulnAssessTool')).toBeInTheDocument()
    })

    it('should render Settings button', () => {
      renderDashboard()

      expect(screen.getByText('Settings')).toBeInTheDocument()
    })

    it('should render quick action buttons', () => {
      renderDashboard()

      expect(screen.getByText('New Project')).toBeInTheDocument()
      expect(screen.getByText('Import SBOM')).toBeInTheDocument()
    })

    it('should render statistics cards', () => {
      renderDashboard()

      expect(screen.getByText('Projects')).toBeInTheDocument()
      expect(screen.getByText('Critical')).toBeInTheDocument()
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('Total Vulnerabilities')).toBeInTheDocument()
    })

    it('should show empty state when no projects exist', () => {
      renderDashboard([])

      expect(screen.getByText('No projects yet')).toBeInTheDocument()
      expect(screen.getByText('Create a new project to get started with vulnerability assessment')).toBeInTheDocument()
      expect(screen.getByText('Create Your First Project')).toBeInTheDocument()
    })
  })

  describe('Statistics Calculation', () => {
    it('should display zero statistics when no projects exist', () => {
      renderDashboard([])

      const zeroElements = screen.getAllByText('0')
      expect(zeroElements.length).toBeGreaterThan(0)
      expect(zeroElements[0]).toBeInTheDocument()
    })

    it('should aggregate statistics across multiple projects', () => {
      const mockProjects = [
        {
          id: '1',
          name: 'Project 1',
          description: 'Test project 1',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 10,
            criticalCount: 2,
            highCount: 3,
            mediumCount: 3,
            lowCount: 2,
            none: 0,
            totalComponents: 5,
            vulnerableComponents: 3,
          },
        },
        {
          id: '2',
          name: 'Project 2',
          description: 'Test project 2',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 20,
            criticalCount: 5,
            highCount: 5,
            mediumCount: 5,
            lowCount: 5,
            none: 0,
            totalComponents: 10,
            vulnerableComponents: 8,
          },
        },
      ]

      renderDashboard(mockProjects)

      // Total projects: 2
      const projectCountElements = screen.getAllByText('2')
      expect(projectCountElements[0]).toBeInTheDocument()

      // Critical: 2 + 5 = 7
      expect(screen.getByText('7')).toBeInTheDocument()

      // High: 3 + 5 = 8
      expect(screen.getByText('8')).toBeInTheDocument()

      // Total vulnerabilities: 10 + 20 = 30
      expect(screen.getByText('30')).toBeInTheDocument()
    })
  })

  describe('Project List', () => {
    it('should render project cards when projects exist', () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Test Project',
          description: 'A test project',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 5,
            criticalCount: 1,
            highCount: 1,
            mediumCount: 1,
            lowCount: 2,
            none: 0,
            totalComponents: 3,
            vulnerableComponents: 2,
          },
        },
      ]

      renderDashboard(mockProjects)

      expect(screen.getByTestId('project-card-project-1')).toBeInTheDocument()
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    it('should display project count in section header', () => {
      const mockProjects = [
        {
          id: '1',
          name: 'Project 1',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            none: 0,
            totalComponents: 0,
            vulnerableComponents: 0,
          },
        },
        {
          id: '2',
          name: 'Project 2',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            none: 0,
            totalComponents: 0,
            vulnerableComponents: 0,
          },
        },
      ]

      renderDashboard(mockProjects)

      expect(screen.getByText(/Recent Projects \(2\)/)).toBeInTheDocument()
    })

    it('should not display count when no projects exist', () => {
      renderDashboard([])

      expect(screen.getByText('Recent Projects')).toBeInTheDocument()
      expect(screen.queryByText(/Recent Projects \(/)).not.toBeInTheDocument()
    })

    it('should sort projects by update date (most recent first)', () => {
      const olderDate = new Date('2024-01-01')
      const newerDate = new Date('2024-02-01')

      const mockProjects = [
        {
          id: 'older-project',
          name: 'Older Project',
          createdAt: olderDate,
          updatedAt: olderDate,
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            none: 0,
            totalComponents: 0,
            vulnerableComponents: 0,
          },
        },
        {
          id: 'newer-project',
          name: 'Newer Project',
          createdAt: newerDate,
          updatedAt: newerDate,
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            none: 0,
            totalComponents: 0,
            vulnerableComponents: 0,
          },
        },
      ]

      renderDashboard(mockProjects)

      const projectCards = screen.getAllByTestId(/project-card-/)
      expect(projectCards[0]).toHaveTextContent('Newer Project')
      expect(projectCards[1]).toHaveTextContent('Older Project')
    })
  })

  describe('User Interactions', () => {
    it('should open Create Project dialog when New Project button is clicked', () => {
      renderDashboard([])

      const newProjectButton = screen.getByText('New Project')
      fireEvent.click(newProjectButton)

      expect(screen.getByTestId('create-project-dialog')).toBeInTheDocument()
    })

    it('should close Create Project dialog when close button is clicked', () => {
      renderDashboard([])

      // Open the dialog
      fireEvent.click(screen.getByText('New Project'))
      expect(screen.getByTestId('create-project-dialog')).toBeInTheDocument()

      // Close the dialog
      fireEvent.click(screen.getByText('Close'))
      expect(screen.queryByTestId('create-project-dialog')).not.toBeInTheDocument()
    })

    it('should open Create Project dialog when "Create Your First Project" button is clicked', () => {
      renderDashboard([])

      const createFirstButton = screen.getByText('Create Your First Project')
      fireEvent.click(createFirstButton)

      expect(screen.getByTestId('create-project-dialog')).toBeInTheDocument()
    })

    it('should open SBOM Upload dialog when Import SBOM button is clicked', () => {
      const mockProjects = [
        {
          id: '1',
          name: 'Test Project',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            none: 0,
            totalComponents: 0,
            vulnerableComponents: 0,
          },
        },
      ]

      renderDashboard(mockProjects)

      const importButton = screen.getByText('Import SBOM')
      fireEvent.click(importButton)

      expect(screen.getByTestId('sbom-upload-dialog')).toBeInTheDocument()
    })

    it('should disable Import SBOM button when no projects exist', () => {
      renderDashboard([])

      const importButton = screen.getByText('Import SBOM')
      expect(importButton).toBeDisabled()
    })

    it('should enable Import SBOM button when projects exist', () => {
      const mockProjects = [
        {
          id: '1',
          name: 'Test Project',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            none: 0,
            totalComponents: 0,
            vulnerableComponents: 0,
          },
        },
      ]

      renderDashboard(mockProjects)

      const importButton = screen.getByText('Import SBOM')
      expect(importButton).not.toBeDisabled()
    })
  })

  describe('Empty State', () => {
    it('should display appropriate empty state message', () => {
      renderDashboard([])

      expect(screen.getByText('No projects yet')).toBeInTheDocument()
      expect(screen.getByText('Create a new project to get started with vulnerability assessment')).toBeInTheDocument()
    })

    it('should show icon in empty state', () => {
      renderDashboard([])

      const icon = screen.getByText('No projects yet').closest('div')?.querySelector('svg')
      expect(icon).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('should navigate to settings when Settings button is clicked', () => {
      renderDashboard()

      const settingsButton = screen.getByText('Settings')
      fireEvent.click(settingsButton)

      expect(mockNavigate).toHaveBeenCalledWith('/settings')
    })

    it('should navigate to project detail when project card View button is clicked', () => {
      const mockProjects = [
        {
          id: 'test-project-id',
          name: 'Test Project',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            none: 0,
            totalComponents: 0,
            vulnerableComponents: 0,
          },
        },
      ]

      renderDashboard(mockProjects)

      const viewButton = screen.getByText('View')
      fireEvent.click(viewButton)

      expect(mockNavigate).toHaveBeenCalledWith('/project/test-project-id')
    })

    it('should call handleViewProject with correct project', () => {
      const mockProjects = [
        {
          id: 'project-123',
          name: 'Test Project',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            none: 0,
            totalComponents: 0,
            vulnerableComponents: 0,
          },
        },
      ]

      renderDashboard(mockProjects)

      const viewButton = screen.getByText('View')
      fireEvent.click(viewButton)

      expect(mockNavigate).toHaveBeenCalledWith('/project/project-123')
    })
  })

  describe('Dialog Close Handlers', () => {
    it('should close SBOM Upload dialog when close button is clicked', () => {
      const mockProjects = [
        {
          id: '1',
          name: 'Test Project',
          createdAt: new Date(),
          updatedAt: new Date(),
          sbomFiles: [],
          components: [],
          vulnerabilities: [],
          statistics: {
            totalVulnerabilities: 0,
            criticalCount: 0,
            highCount: 0,
            mediumCount: 0,
            lowCount: 0,
            none: 0,
            totalComponents: 0,
            vulnerableComponents: 0,
          },
        },
      ]

      renderDashboard(mockProjects)

      // Open the dialog
      fireEvent.click(screen.getByText('Import SBOM'))
      expect(screen.getByTestId('sbom-upload-dialog')).toBeInTheDocument()

      // Close the dialog
      fireEvent.click(screen.getByText('Close'))
      expect(screen.queryByTestId('sbom-upload-dialog')).not.toBeInTheDocument()
    })
  })
})
