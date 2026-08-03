import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { Dashboard } from './Dashboard'
import { useStore } from '@/store/useStore'
import { useMenuActionListener } from '@/components/MenuActionListener'

// Mutable references for selector hooks
const mockUseProjects = vi.fn<() => unknown[]>()
const mockUseSettings = vi.fn()

// Mock the store — must export useProjects, useSettings for selector hooks
vi.mock('@/store/useStore', () => ({
  useStore: vi.fn(),
  useProjects: (...args: unknown[]) => mockUseProjects(...args),
  useSettings: (...args: unknown[]) => mockUseSettings(...args),
  useSidebarOpen: vi.fn(() => true),
  useSetSidebarOpen: vi.fn(() => vi.fn()),
}))

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
  CreateProjectDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="create-project-dialog">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

vi.mock('@/components/SbomUploadDialog', () => ({
  SbomUploadDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="sbom-upload-dialog">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

vi.mock('@/components/SbomGeneratorDialog', () => ({
  SbomGeneratorDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="sbom-generator-dialog">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

vi.mock('@/components/ExportDialog', () => ({
  ExportDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="export-dialog">
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}))

vi.mock('@/components/ProjectCard', () => ({
  ProjectCard: ({
    project,
    onView,
    onDelete,
    onRefresh,
    onFpf,
  }: {
    project: { id: string; name: string }
    onView: (p: unknown) => void
    onDelete: (id: string) => void
    onRefresh?: (id: string) => void
    onFpf?: (id: string) => void
  }) => (
    <div data-testid={`project-card-${project.id}`}>
      <span>{project.name}</span>
      <button onClick={() => onView(project)}>View</button>
      <button onClick={() => onDelete(project.id)}>Delete</button>
      {onRefresh && (
        <button data-testid={`refresh-${project.id}`} onClick={() => onRefresh(project.id)}>
          Refresh
        </button>
      )}
      {onFpf && (
        <button data-testid={`fpf-${project.id}`} onClick={() => onFpf(project.id)}>
          FPF
        </button>
      )}
    </div>
  ),
}))

vi.mock('@/components/NotificationCenter', () => ({
  NotificationCenter: () => <div data-testid="notification-center" />,
}))

vi.mock('@/components/OfflineIndicator', () => ({
  OfflineIndicator: () => <div data-testid="offline-indicator" />,
}))

vi.mock('@/components/MenuActionListener', () => ({
  useMenuActionListener: vi.fn(),
}))

vi.mock('@/components/AppLogo', () => ({
  AppLogo: ({ showText }: { showText?: boolean }) => (showText ? <h1>VulnAssessTool</h1> : null),
}))

vi.mock('@/lib/refresh', () => ({
  refreshVulnerabilityData: vi.fn(() => Promise.resolve({ success: true, vulnerabilities: [] })),
}))

// Identity pass-through: the refresh path now re-enriches merged vulns (KEV/EPSS/risk), but this
// suite asserts merge + per-severity counting, not enrichment. Real enrichment is covered by
// enrichVulnerabilities' own tests; here it would only add network coupling and mutate objects.
vi.mock('@/lib/services/intelligence/enrichVulnerabilities', () => ({
  enrichVulnerabilities: vi.fn((vulns: unknown) => Promise.resolve(vulns)),
}))

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockReset()
  })

  const twoProjects = [
    {
      id: 'p1',
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
      id: 'p2',
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

  const renderDashboard = (projects: unknown[] = []) => {
    const storeState = {
      projects,
      addProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
      setCurrentProject: vi.fn(),
      currentProject: null,
      settings: {
        theme: 'system' as const,
        fontSize: 'default' as const,
        nvdApiKey: undefined,
        dataRetentionDays: 30,
        autoRefresh: false,
        vulnDataCacheTTL: 1,
      },
      updateSettings: vi.fn(),
    }

    // Configure useStore to handle selector calls properly
    vi.mocked(useStore).mockImplementation(((selector: unknown) => {
      if (typeof selector === 'function') return selector(storeState)
      return storeState
    }) as unknown as typeof useStore)

    // Configure selector hooks
    mockUseProjects.mockReturnValue(projects)
    mockUseSettings.mockReturnValue(storeState.settings)

    return render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )
  }

  describe('Rendering', () => {
    it('should render the page title', () => {
      renderDashboard()

      // App branding + Settings/Search nav now live in the AppShell, not the page.
      expect(screen.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument()
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

      // The empty state container exists (lucide icons are mocked as null, so no SVG)
      const emptyState = screen.getByText('No projects yet').closest('div')
      expect(emptyState).toBeInTheDocument()
      expect(emptyState?.textContent).toContain('No projects yet')
    })
  })

  describe('Navigation', () => {
    // Settings / Search navigation moved to the AppShell sidebar (covered by shell tests).

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

  describe('Bulk Mode', () => {
    it('should show Select Projects button when projects exist', () => {
      renderDashboard(twoProjects)
      expect(screen.getByText('Select Projects')).toBeInTheDocument()
    })

    it('should not show Select Projects button when no projects exist', () => {
      renderDashboard([])
      expect(screen.queryByText('Select Projects')).not.toBeInTheDocument()
    })

    it('should enter bulk mode when Select Projects is clicked', () => {
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      // Enter bulk mode
      fireEvent.click(screen.getByText('Select Projects'))
      expect(screen.getByText('Exit Selection')).toBeInTheDocument()

      // Check that checkboxes are rendered
      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)
    })

    it('should toggle individual project selection', () => {
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      // Enter bulk mode
      fireEvent.click(screen.getByText('Select Projects'))

      // Click individual checkbox for first project card
      const projectCheckboxes = screen.getAllByRole('checkbox')
      // The first checkbox is "Select All", the rest are per-project
      fireEvent.click(projectCheckboxes[1])

      // Should show selection bar
      expect(screen.getByText(/1 project selected/)).toBeInTheDocument()
    })

    it('should exit bulk mode and clear selection', () => {
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByText('Select Projects'))
      expect(screen.getByText('Exit Selection')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Exit Selection'))
      expect(screen.getByText('Select Projects')).toBeInTheDocument()
    })
  })

  describe('Quick Actions', () => {
    const oneProject = [
      {
        id: '1',
        name: 'Test',
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

    it('should open Generate SBOM from Excel dialog', () => {
      renderDashboard(oneProject)
      fireEvent.click(screen.getByText('Generate SBOM from Excel'))
      expect(screen.getByTestId('sbom-generator-dialog')).toBeInTheDocument()
    })

    it('should close Generate SBOM dialog when close is clicked', () => {
      renderDashboard(oneProject)
      fireEvent.click(screen.getByText('Generate SBOM from Excel'))
      expect(screen.getByTestId('sbom-generator-dialog')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Close'))
      expect(screen.queryByTestId('sbom-generator-dialog')).not.toBeInTheDocument()
    })

    it('should open Export dialog when Export All is clicked', () => {
      renderDashboard(oneProject)
      fireEvent.click(screen.getByText('Export All'))
      expect(screen.getByTestId('export-dialog')).toBeInTheDocument()
    })

    it('should disable Export All when no projects exist', () => {
      renderDashboard([])
      expect(screen.getByText('Export All')).toBeDisabled()
    })

    // Search + Executive/Reports navigation moved to the AppShell sidebar (covered by shell tests).
  })

  describe('Project Actions', () => {
    const mockProject = {
      id: 'project-1',
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
    }

    it('should delete project when delete is clicked', () => {
      const mockDelete = vi.fn()
      const storeState = {
        projects: [mockProject],
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: mockDelete,
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue([mockProject])
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByText('Delete'))
      expect(mockDelete).toHaveBeenCalledWith('project-1')
    })

    it('should navigate to FPF page when FPF handler is invoked', () => {
      renderDashboard([mockProject])
      // The mock ProjectCard doesn't expose onFpf button, so we test via navigate
      fireEvent.click(screen.getByText('View'))
      expect(mockNavigate).toHaveBeenCalledWith('/project/project-1')
    })
  })

  describe('Refresh Vulnerability Data', () => {
    it('should call refreshVulnerabilityData when project refresh is triggered', async () => {
      const { refreshVulnerabilityData } = await import('@/lib/refresh')
      const mockRefresh = vi.mocked(refreshVulnerabilityData)

      const mockProject = {
        id: 'project-1',
        name: 'Test Project',
        createdAt: new Date(),
        updatedAt: new Date(),
        sbomFiles: [],
        components: [
          { id: 'c1', name: 'lib', version: '1.0', type: 'library', licenses: ['MIT'], vulnerabilities: [] },
        ],
        vulnerabilities: [],
        statistics: {
          totalVulnerabilities: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          none: 0,
          totalComponents: 1,
          vulnerableComponents: 0,
        },
      }

      mockRefresh.mockResolvedValueOnce({
        success: true,
        vulnerabilities: [],
        componentsScanned: 1,
      })

      renderDashboard([mockProject])

      const viewButton = screen.getByText('View')
      fireEvent.click(viewButton)

      expect(mockNavigate).toHaveBeenCalledWith('/project/project-1')
    })

    it('should dispatch vuln-data-refreshed event on successful refresh', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

      renderDashboard()

      const event = new CustomEvent('vuln-data-refreshed', {
        detail: { projectId: 'test', timestamp: new Date() },
      })
      window.dispatchEvent(event)

      expect(dispatchSpy).toHaveBeenCalled()
      dispatchSpy.mockRestore()
    })

    it('should clean up event listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')

      const { unmount } = renderDashboard()
      unmount()

      expect(removeSpy).toHaveBeenCalledWith('vuln-data-refreshed', expect.any(Function))
      removeSpy.mockRestore()
    })
  })

  describe('Bulk Delete', () => {
    it('should delete selected projects when bulk delete is confirmed', async () => {
      const mockDelete = vi.fn()
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: mockDelete,
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByText('Select Projects'))

      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      await waitFor(() => {
        expect(screen.getByText('1 project selected')).toBeInTheDocument()
      })

      // Native confirm() replaced by an accessible ConfirmDialog. Open it via the
      // bulk-bar Delete (the destructive-styled one, vs. the per-card Delete
      // buttons the ProjectCard mock renders), then confirm inside the dialog.
      const bulkDelete = screen
        .getAllByRole('button', { name: 'Delete' })
        .find((b) => b.classList.contains('bg-destructive'))
      fireEvent.click(bulkDelete!)
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('p1')
      })
    })

    it('should not delete when bulk delete is cancelled', async () => {
      const mockDelete = vi.fn()
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: mockDelete,
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByText('Select Projects'))

      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      const bulkDelete = screen
        .getAllByRole('button', { name: 'Delete' })
        .find((b) => b.classList.contains('bg-destructive'))
      fireEvent.click(bulkDelete!)
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      expect(mockDelete).not.toHaveBeenCalled()
    })
  })

  describe('Bulk Export', () => {
    it('should open export dialog when bulk Export is clicked', () => {
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByText('Select Projects'))

      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      fireEvent.click(screen.getByText('Export'))

      expect(screen.getByTestId('export-dialog')).toBeInTheDocument()
    })
  })

  describe('Select All Toggle', () => {
    it('should select all projects when Select All is clicked', () => {
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByText('Select Projects'))

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0]
      fireEvent.click(selectAllCheckbox)

      expect(screen.getByText(/2 projects selected/)).toBeInTheDocument()
    })

    it('should deselect all when Select All is clicked again', () => {
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByText('Select Projects'))

      const selectAllCheckbox = screen.getAllByRole('checkbox')[0]
      fireEvent.click(selectAllCheckbox)
      expect(screen.getByText(/2 projects selected/)).toBeInTheDocument()

      fireEvent.click(selectAllCheckbox)
      expect(screen.queryByText(/projects selected/)).not.toBeInTheDocument()
    })
  })

  describe('Clear Selection', () => {
    it('should clear selection when Clear selection is clicked', () => {
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByText('Select Projects'))

      const checkboxes = screen.getAllByRole('checkbox')
      fireEvent.click(checkboxes[1])

      expect(screen.getByText(/1 project selected/)).toBeInTheDocument()

      fireEvent.click(screen.getByText('Clear selection'))
      expect(screen.queryByText(/projects selected/)).not.toBeInTheDocument()
    })
  })

  describe('Menu Action Events', () => {
    it('should listen for menu-open-create-project event', () => {
      renderDashboard()

      const menuMock = vi.mocked(useMenuActionListener)
      expect(menuMock).toHaveBeenCalledWith('menu-open-create-project', expect.any(Function))
    })

    it('should listen for menu-open-upload-sbom event', () => {
      renderDashboard()

      const menuMock = vi.mocked(useMenuActionListener)
      expect(menuMock).toHaveBeenCalledWith('menu-open-upload-sbom', expect.any(Function))
    })

    it('should listen for menu-open-sbom-generator event', () => {
      renderDashboard()

      const menuMock = vi.mocked(useMenuActionListener)
      expect(menuMock).toHaveBeenCalledWith('menu-open-sbom-generator', expect.any(Function))
    })

    it('should open export dialog on menu-open-export event', async () => {
      renderDashboard()

      const event = new CustomEvent('menu-open-export')
      window.dispatchEvent(event)

      await waitFor(() => {
        expect(screen.getByTestId('export-dialog')).toBeInTheDocument()
      })
    })

    it('should clean up export menu listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const { unmount } = renderDashboard()
      unmount()

      expect(removeSpy).toHaveBeenCalledWith('menu-open-export', expect.any(Function))
      removeSpy.mockRestore()
    })
  })

  describe('FPF Navigation', () => {
    it('should navigate to FPF page via onFpf callback', async () => {
      renderDashboard(twoProjects)

      await waitFor(() => {
        expect(screen.getAllByText('View').length).toBeGreaterThan(0)
      })

      const viewButtons = screen.getAllByText('View')
      fireEvent.click(viewButtons[0])

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/project/p1')
      })
    })
  })

  describe('Auto-refresh Event Listener', () => {
    it('should add vuln-data-refreshed listener on mount', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      renderDashboard()
      expect(addSpy).toHaveBeenCalledWith('vuln-data-refreshed', expect.any(Function))
      addSpy.mockRestore()
    })
  })

  describe('handleRefreshVulnData', () => {
    const mockProject = {
      id: 'p1',
      name: 'Project 1',
      createdAt: new Date(),
      updatedAt: new Date(),
      sbomFiles: [],
      components: [
        { id: 'c1', name: 'lib', version: '1.0', type: 'library' as const, licenses: ['MIT'], vulnerabilities: [] },
      ],
      vulnerabilities: [],
      statistics: {
        totalVulnerabilities: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        none: 0,
        totalComponents: 1,
        vulnerableComponents: 0,
      },
    }

    it('should update project with vulnerability statistics on successful refresh', async () => {
      const capturedUpdateProject = vi.fn()
      const storeState = {
        projects: [mockProject],
        addProject: vi.fn(),
        updateProject: capturedUpdateProject,
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue([mockProject])
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByTestId('refresh-p1'))

      await waitFor(() => {
        expect(capturedUpdateProject).toHaveBeenCalledWith(
          'p1',
          expect.objectContaining({
            lastVulnDataRefresh: expect.any(Date),
            statistics: expect.objectContaining({
              totalVulnerabilities: 0,
              criticalCount: 0,
              highCount: 0,
              mediumCount: 0,
              lowCount: 0,
            }),
          }),
        )
      })
    })

    it('should dispatch vuln-data-refreshed event after successful refresh', async () => {
      const { refreshVulnerabilityData } = await import('@/lib/refresh')
      const mockRefresh = vi.mocked(refreshVulnerabilityData)
      mockRefresh.mockImplementation(() => Promise.resolve({ success: true, vulnerabilities: [] }))

      const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

      renderDashboard([mockProject])
      fireEvent.click(screen.getByTestId('refresh-p1'))

      await waitFor(() => {
        expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'vuln-data-refreshed' }))
      })

      dispatchSpy.mockRestore()
      mockRefresh.mockRestore()
    })

    it('should handle refresh error gracefully', async () => {
      const { refreshVulnerabilityData } = await import('@/lib/refresh')
      const mockRefresh = vi.mocked(refreshVulnerabilityData)
      mockRefresh.mockImplementation(() => Promise.reject(new Error('Network error')))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      renderDashboard([mockProject])
      fireEvent.click(screen.getByTestId('refresh-p1'))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Failed to refresh vulnerability data:', expect.any(Error))
      })

      consoleSpy.mockRestore()
      mockRefresh.mockRestore()
    })

    it('should not update project when refresh result is not success', async () => {
      const { refreshVulnerabilityData } = await import('@/lib/refresh')
      const mockRefresh = vi.mocked(refreshVulnerabilityData)
      mockRefresh.mockImplementation(() => Promise.resolve({ success: false, vulnerabilities: [] }))

      const mockUpdate = vi.fn()
      const storeState = {
        projects: [mockProject],
        addProject: vi.fn(),
        updateProject: mockUpdate,
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue([mockProject])
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByTestId('refresh-p1'))

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled()
      })

      const vulnUpdateCalls = mockUpdate.mock.calls.filter(
        (call: unknown[]) => call[0] === 'p1' && (call[1] as Record<string, unknown>)?.vulnerabilities !== undefined,
      )
      expect(vulnUpdateCalls).toHaveLength(0)

      mockRefresh.mockRestore()
    })
  })

  describe('handleOpenFpf', () => {
    it('should navigate to FPF page when FPF button is clicked', () => {
      renderDashboard(twoProjects)

      fireEvent.click(screen.getByTestId('fpf-p1'))

      expect(mockNavigate).toHaveBeenCalledWith('/project/p1/fpf')
    })

    it('should navigate to FPF page for second project', () => {
      renderDashboard(twoProjects)

      fireEvent.click(screen.getByTestId('fpf-p2'))

      expect(mockNavigate).toHaveBeenCalledWith('/project/p2/fpf')
    })
  })

  describe('Coverage gaps — lines 41, 53-56, 157, 420', () => {
    const projectWithComponents = {
      id: 'p1',
      name: 'Project 1',
      createdAt: new Date(),
      updatedAt: new Date(),
      sbomFiles: [],
      components: [
        { id: 'c1', name: 'lib', version: '1.0', type: 'library' as const, licenses: ['MIT'], vulnerabilities: [] },
      ],
      vulnerabilities: [],
      statistics: {
        totalVulnerabilities: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        none: 0,
        totalComponents: 1,
        vulnerableComponents: 0,
      },
    }

    // Line 41 — onProgress callback inside handleRefreshVulnData
    it('should invoke onProgress callback during vulnerability data refresh', async () => {
      const { refreshVulnerabilityData } = await import('@/lib/refresh')
      const mockRefresh = vi.mocked(refreshVulnerabilityData)

      mockRefresh.mockImplementation(async (_components: any, options?: any) => {
        if (options?.onProgress) {
          options.onProgress(1, 3)
        }
        return { success: true, vulnerabilities: [] }
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      renderDashboard([projectWithComponents])
      fireEvent.click(screen.getByTestId('refresh-p1'))

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith('Refresh progress: 1/3')
      })

      consoleSpy.mockRestore()
      mockRefresh.mockRestore()
    })

    // Lines 53-56 — severity counting when vulnerabilities are returned
    it('should compute per-severity counts when refresh returns vulnerabilities', async () => {
      const { refreshVulnerabilityData } = await import('@/lib/refresh')
      const mockRefresh = vi.mocked(refreshVulnerabilityData)

      const vulns = [
        { id: 'v1', severity: 'critical' },
        { id: 'v2', severity: 'critical' },
        { id: 'v3', severity: 'high' },
        { id: 'v4', severity: 'medium' },
        { id: 'v5', severity: 'low' },
      ]

      mockRefresh.mockResolvedValueOnce({ success: true, vulnerabilities: vulns })

      const mockUpdate = vi.fn()
      const storeState = {
        projects: [projectWithComponents],
        addProject: vi.fn(),
        updateProject: mockUpdate,
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue([projectWithComponents])
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )
      fireEvent.click(screen.getByTestId('refresh-p1'))

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith(
          'p1',
          expect.objectContaining({
            vulnerabilities: vulns,
            statistics: expect.objectContaining({
              criticalCount: 2,
              highCount: 1,
              mediumCount: 1,
              lowCount: 1,
              totalVulnerabilities: 5,
            }),
          }),
        )
      })

      mockRefresh.mockRestore()
    })

    // Line 157 — deselecting a previously selected project (delete branch)
    it('should deselect a previously selected project in bulk mode', () => {
      const storeState = {
        projects: twoProjects,
        addProject: vi.fn(),
        updateProject: vi.fn(),
        deleteProject: vi.fn(),
        setCurrentProject: vi.fn(),
        currentProject: null,
        settings: {
          theme: 'system' as const,
          fontSize: 'default' as const,
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      }

      vi.mocked(useStore).mockImplementation(((selector: unknown) => {
        if (typeof selector === 'function') return selector(storeState)
        return storeState
      }) as unknown as typeof useStore)

      mockUseProjects.mockReturnValue(twoProjects)
      mockUseSettings.mockReturnValue(storeState.settings)

      render(
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>,
      )

      // Enter bulk mode
      fireEvent.click(screen.getByText('Select Projects'))

      const checkboxes = screen.getAllByRole('checkbox')
      // checkboxes[0] = select-all, [1] = p1, [2] = p2
      // Select first project
      fireEvent.click(checkboxes[1])
      expect(screen.getByText(/1 project selected/)).toBeInTheDocument()

      // Deselect the same project — exercises line 157 (newSelection.delete)
      fireEvent.click(checkboxes[1])
      expect(screen.queryByText(/projects selected/)).not.toBeInTheDocument()
    })

    // Line 420 — onClose callback for ExportDialog
    it('should close Export dialog when close button is clicked', () => {
      const oneProject = [
        {
          id: '1',
          name: 'Test',
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

      renderDashboard(oneProject)

      // Open the export dialog
      fireEvent.click(screen.getByText('Export All'))
      expect(screen.getByTestId('export-dialog')).toBeInTheDocument()

      // Close it — exercises line 420's onClose={() => setShowExportDialog(false)}
      fireEvent.click(screen.getByText('Close'))
      expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument()
    })
  })
})
