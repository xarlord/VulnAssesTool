import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ExecutiveDashboard } from './ExecutiveDashboard'
import type { ExecutiveMetrics, ExecutiveSummary } from '@/lib/analytics'

// ---------------------------------------------------------------------------
// Hoisted mock data shared across vi.mock() factories
// ---------------------------------------------------------------------------
const { mockNavigate, mockStoreState, mockCalculateMetrics, mockGenerateSummary } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockStoreState: {
    projects: [] as any[],
  },
  mockCalculateMetrics: vi.fn(),
  mockGenerateSummary: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock: react-router-dom
// ---------------------------------------------------------------------------
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ---------------------------------------------------------------------------
// Mock: Zustand store – supports both useStore(selector) and named exports
// ---------------------------------------------------------------------------
vi.mock('@/store/useStore', () => {
  // Simple store that tracks mockStoreState
  const storeState = () => mockStoreState

  // useStore(selector) – call selector with state; useStore.getState() returns state
  const useStore: any = (selector?: any) => {
    if (selector) return selector(mockStoreState)
    return mockStoreState
  }
  useStore.getState = storeState
  useStore.setState = vi.fn((partial: any) => {
    Object.assign(mockStoreState, partial)
  })

  // Named selector exports
  const useProjects = () => mockStoreState.projects

  return { useStore, useProjects }
})

// ---------------------------------------------------------------------------
// Mock: analytics functions
// ---------------------------------------------------------------------------
vi.mock('@/lib/analytics', () => ({
  calculateExecutiveMetrics: (...args: any[]) => mockCalculateMetrics(...args),
  generateExecutiveSummary: (...args: any[]) => mockGenerateSummary(...args),
  buildExecutiveReport: vi.fn(() => ({})),
  downloadExecutiveReport: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mock: child widget components (they have complex deps / charts)
// ---------------------------------------------------------------------------
vi.mock('./widgets/RiskGauge', () => ({
  RiskGauge: ({ metrics }: { metrics: any }) => <div data-testid="risk-gauge">RiskGauge: {metrics?.riskLevel}</div>,
}))

vi.mock('./widgets/ProjectHealthComparison', () => ({
  ProjectHealthComparison: ({ projectMetrics }: { projectMetrics: any[] }) => (
    <div data-testid="project-health-comparison">Projects: {projectMetrics?.length ?? 0}</div>
  ),
}))

vi.mock('./widgets/VulnerabilityTrendChart', () => ({
  VulnerabilityTrendChart: ({ trends }: { trends: any }) => (
    <div data-testid="vulnerability-trend-chart">TrendChart</div>
  ),
}))

vi.mock('./widgets/TeamProductivity', () => ({
  TeamProductivity: ({ productivity }: { productivity: any }) => (
    <div data-testid="team-productivity">Productivity</div>
  ),
}))

vi.mock('./widgets/ComplianceStatus', () => ({
  ComplianceStatus: ({ compliance }: { compliance: any }) => <div data-testid="compliance-status">Compliance</div>,
}))

vi.mock('./widgets/ActionItems', () => ({
  ActionItems: ({
    recommendations,
    topRisks,
    onProjectClick,
  }: {
    recommendations: any[]
    topRisks: any[]
    onProjectClick: (id: string) => void
  }) => (
    <div data-testid="action-items">
      <button onClick={() => onProjectClick('proj-1')}>Click Project</button>
    </div>
  ),
}))

vi.mock('./widgets/DashboardConfig', () => ({
  DashboardConfig: (props: any) => <div data-testid="dashboard-config">Config</div>,
}))

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
function createMockProject(overrides?: Record<string, any>) {
  return {
    id: 'proj-1',
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
      highCount: 2,
      mediumCount: 1,
      lowCount: 1,
      none: 0,
      totalComponents: 10,
      vulnerableComponents: 3,
    },
    ...overrides,
  }
}

function createMockMetrics(overrides?: Partial<ExecutiveMetrics>): ExecutiveMetrics {
  return {
    overall: {
      totalProjects: 1,
      totalComponents: 10,
      totalVulnerabilities: 5,
      criticalCount: 1,
      highCount: 2,
      mediumCount: 1,
      lowCount: 1,
      averageHealthScore: 72,
      riskLevel: 'medium',
      vulnerableComponentPercentage: 30,
    },
    byProject: [
      {
        projectId: 'proj-1',
        projectName: 'Test Project',
        healthScore: 72,
        vulnerabilityCount: 5,
        criticalCount: 1,
        highCount: 2,
        mediumCount: 1,
        lowCount: 1,
        componentCount: 10,
        vulnerableComponents: 3,
        fixableCount: 2,
        lastScanDate: new Date(),
        riskScore: 65,
      },
    ],
    trends: {
      vulnerabilityTrend: 'stable' as const,
      healthTrend: 'stable' as const,
      scanFrequency: 2,
      averageResolutionTime: 5,
      periods: [],
    },
    compliance: {
      slaCompliance: { slaCritical: 80, slaHigh: 75, slaOverall: 78 },
      scanCoverage: 90,
      dataFreshness: 85,
      remediationRate: 70,
    },
    productivity: {
      totalScans: 10,
      sbomsProcessed: 5,
      componentsAnalyzed: 100,
      vulnerabilitiesAssessed: 50,
      averageScanTime: 3,
      scansThisWeek: 2,
      scansThisMonth: 8,
    },
    ...overrides,
  }
}

function createMockSummary(overrides?: Partial<ExecutiveSummary>): ExecutiveSummary {
  return {
    overallStatus: 'good',
    headline: 'Overall security posture is acceptable.',
    keyPoints: [
      '1 critical vulnerability detected',
      '72 average health score',
      '90% scan coverage',
      '78% SLA compliance',
    ],
    insights: [],
    topRisks: [],
    topRecommendations: [],
    reportPeriod: 'Last 30 days',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ExecutiveDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState.projects = []
    mockCalculateMetrics.mockReturnValue(createMockMetrics())
    mockGenerateSummary.mockReturnValue(createMockSummary())
  })

  const renderDashboard = (projects: any[] = []) => {
    mockStoreState.projects = projects
    return render(
      <MemoryRouter>
        <ExecutiveDashboard />
      </MemoryRouter>,
    )
  }

  // -----------------------------------------------------------------------
  describe('Layout & Header', () => {
    it('should render the executive dashboard heading', () => {
      renderDashboard()

      expect(screen.getByText('Executive Dashboard')).toBeInTheDocument()
    })

    it('should render the subtitle text', () => {
      renderDashboard()

      expect(screen.getByText('High-level security overview and compliance metrics')).toBeInTheDocument()
    })

    it('should render a back button that navigates to /', () => {
      renderDashboard()

      const backButton = screen.getByText('Back to Dashboard')
      fireEvent.click(backButton)

      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    it('should render the Export Report button', () => {
      renderDashboard()

      expect(screen.getByText('Export Report')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  describe('Widget Sections', () => {
    it('should show the risk gauge widget', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByTestId('risk-gauge')).toBeInTheDocument()
    })

    it('should show the vulnerability trend chart section', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByTestId('vulnerability-trend-chart')).toBeInTheDocument()
    })

    it('should show the project health comparison section', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByTestId('project-health-comparison')).toBeInTheDocument()
    })

    it('should show the compliance status widget', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByTestId('compliance-status')).toBeInTheDocument()
    })

    it('should show the team productivity widget', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByTestId('team-productivity')).toBeInTheDocument()
    })

    it('should show the action items widget', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByTestId('action-items')).toBeInTheDocument()
    })

    it('should show the dashboard config widget', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByTestId('dashboard-config')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  describe('Executive Summary Banner', () => {
    it('should render the executive summary section', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByText('Executive Summary')).toBeInTheDocument()
    })

    it('should display the headline from the summary', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByText('Overall security posture is acceptable.')).toBeInTheDocument()
    })

    it('should display the overall status badge', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByText(/Status: GOOD/)).toBeInTheDocument()
    })

    it('should display key points from the summary', () => {
      renderDashboard([createMockProject()])

      expect(screen.getByText(/1 critical vulnerability detected/)).toBeInTheDocument()
    })

    it('should display critical status badge when status is critical', () => {
      mockGenerateSummary.mockReturnValue(createMockSummary({ overallStatus: 'critical' }))
      renderDashboard([createMockProject()])

      expect(screen.getByText(/Status: CRITICAL/)).toBeInTheDocument()
    })

    it('should display warning status badge when status is warning', () => {
      mockGenerateSummary.mockReturnValue(createMockSummary({ overallStatus: 'warning' }))
      renderDashboard([createMockProject()])

      expect(screen.getByText(/Status: WARNING/)).toBeInTheDocument()
    })

    it('should display excellent status badge when status is excellent', () => {
      mockGenerateSummary.mockReturnValue(createMockSummary({ overallStatus: 'excellent' }))
      renderDashboard([createMockProject()])

      expect(screen.getByText(/Status: EXCELLENT/)).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  describe('Empty Projects State', () => {
    it('should show "No Data Available" when no projects exist', () => {
      renderDashboard([])

      expect(screen.getByText('No Data Available')).toBeInTheDocument()
    })

    it('should prompt the user to create projects when the list is empty', () => {
      renderDashboard([])

      expect(screen.getByText('Create projects and upload SBOMs to see executive dashboard data.')).toBeInTheDocument()
    })

    it('should show a "Go to Dashboard" button when there are no projects at all', () => {
      renderDashboard([])

      expect(screen.getByText('Go to Dashboard')).toBeInTheDocument()
    })

    it('should navigate to / when "Go to Dashboard" is clicked', () => {
      renderDashboard([])

      fireEvent.click(screen.getByText('Go to Dashboard'))
      expect(mockNavigate).toHaveBeenCalledWith('/')
    })

    it('should show date-range message when projects exist but none match the filter', () => {
      // Project updated long ago — outside the default 30-day window
      const oldProject = createMockProject({
        updatedAt: new Date('2020-01-01'),
      })
      // The store has projects, but the filtered list will be empty
      mockStoreState.projects = [oldProject]

      render(
        <MemoryRouter>
          <ExecutiveDashboard />
        </MemoryRouter>,
      )

      expect(
        screen.getByText('No projects match the selected date range. Adjust the filters or add new projects.'),
      ).toBeInTheDocument()
    })

    it('should not render widget sections when projects are empty', () => {
      renderDashboard([])

      expect(screen.queryByTestId('risk-gauge')).not.toBeInTheDocument()
      expect(screen.queryByTestId('project-health-comparison')).not.toBeInTheDocument()
      expect(screen.queryByTestId('vulnerability-trend-chart')).not.toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  describe('Navigation', () => {
    it('should navigate to project detail when ActionItems calls onProjectClick', () => {
      renderDashboard([createMockProject()])

      fireEvent.click(screen.getByText('Click Project'))

      expect(mockNavigate).toHaveBeenCalledWith('/project/proj-1')
    })
  })

  // -----------------------------------------------------------------------
  describe('Export Report', () => {
    it('should disable the export button when no projects match the filter', () => {
      renderDashboard([])

      const exportButton = screen.getByText('Export Report').closest('button')!
      expect(exportButton).toBeDisabled()
    })

    it('should enable the export button when projects are available', () => {
      renderDashboard([createMockProject()])

      const exportButton = screen.getByText('Export Report').closest('button')!
      expect(exportButton).not.toBeDisabled()
    })
  })
})
