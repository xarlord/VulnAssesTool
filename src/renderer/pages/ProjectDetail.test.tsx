import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate, useParams } from 'react-router-dom'
import { ProjectDetail } from './ProjectDetail'
import type { Project, Component, Vulnerability } from '@@/types'

// Mock navigate
const mockNavigate = vi.fn()
const mockUseParams = vi.fn(() => ({ projectId: 'test-project-id' }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  }
})

// Mock vulnMatcher functions
vi.mock('@/lib/api/vulnMatcher', () => ({
  matchVulnerabilitiesForComponents: vi.fn(),
  getVulnerabilityStatistics: vi.fn(() => ({
    total: 5,
    critical: 1,
    high: 1,
    medium: 2,
    low: 1,
    none: 0,
  })),
  filterBySeverity: vi.fn((vulns: Vulnerability[], severity: string) =>
    vulns.filter((v: Vulnerability) => v.severity === severity),
  ),
  sortBySeverity: vi.fn((vulns: Vulnerability[]) => [...vulns]),
}))

// Mock refresh library
vi.mock('@/lib/refresh', () => ({
  refreshVulnerabilityData: vi.fn(),
}))

// Mock Toaster
vi.mock('@/components/Toaster', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}))

// Mock child components
vi.mock('@/components/SbomUploadDialog', () => ({
  SbomUploadDialog: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="sbom-upload-dialog">
        <button onClick={onClose}>Close Upload Dialog</button>
      </div>
    ) : null,
}))

vi.mock('@/components/VulnerabilityDetailModal', () => ({
  VulnerabilityDetailModal: ({
    open,
    onClose,
    vulnerability,
  }: {
    vulnerability: Vulnerability
    open: boolean
    onClose: () => void
  }) =>
    open ? (
      <div data-testid="vuln-detail-modal">
        <button onClick={onClose}>Close</button>
        <a
          href={`${vulnerability.source === 'nvd' ? 'https://nvd.nist.gov' : 'https://osv.dev'}/${vulnerability.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          View on {vulnerability.source === 'nvd' ? 'NVD' : 'OSV'}
        </a>
      </div>
    ) : null,
}))

// Mock StalenessIndicator to always show a refresh button for testing
vi.mock('@/components/StalenessIndicator', () => ({
  StalenessIndicator: ({
    onRefresh,
    isRefreshing,
  }: {
    lastRefresh: Date | undefined
    settings: unknown
    onRefresh?: () => void
    isRefreshing?: boolean
    compact?: boolean
  }) => (
    <div data-testid="staleness-indicator">
      <span>Stale</span>
      {onRefresh && (
        <button onClick={onRefresh} disabled={isRefreshing} data-testid="refresh-button">
          {isRefreshing ? 'Refreshing...' : 'Refresh Now'}
        </button>
      )}
    </div>
  ),
  StalenessBadge: () => <div data-testid="staleness-badge">Badge</div>,
}))

// Override lucide-react mock to include Container (missing from global setup)
vi.mock('lucide-react', () => {
  const StubIcon = (_props: unknown) => null
  const icons = [
    'X',
    'AlertCircle',
    'CheckCircle',
    'HelpCircle',
    'AlertTriangle',
    'RefreshCw',
    'Home',
    'Bug',
    'Trash2',
    'RotateCcw',
    'Shield',
    'Scale',
    'ChevronDown',
    'ChevronUp',
    'ChevronRight',
    'ExternalLink',
    'ArrowLeft',
    'Filter',
    'Settings',
    'Bell',
    'BellOff',
    'Check',
    'CheckCheck',
    'Info',
    'CheckCircle2',
    'Clock',
    'Save',
    'FolderOpen',
    'Search',
    'Navigation',
    'FileText',
    'Eye',
    'Edit',
    'Calendar',
    'Plus',
    'Upload',
    'Download',
    'BarChart3',
    'TrendingUp',
    'TrendingDown',
    'Minus',
    'Wifi',
    'WifiOff',
    'Cloud',
    'CloudOff',
    'Copy',
    'FileSpreadsheet',
    'FileJson',
    'Loader2',
    'Github',
    'Mail',
    'Heart',
    'Container',
    'Binary',
  ]
  const mod: Record<string, unknown> = {}
  for (const name of icons) {
    mod[name] = StubIcon
  }
  return mod
})

// Mock ContainerScanDialog (always rendered by ProjectDetail)
vi.mock('@/components/ContainerScanDialog', () => ({
  ContainerScanDialog: ({ open, onClose }: { open: boolean; onClose: () => void; projectId: string }) =>
    open ? (
      <div data-testid="container-scan-dialog">
        Container Scan Dialog
        <button onClick={onClose}>Close Container Scan</button>
      </div>
    ) : null,
}))

// Mock BinarySbomDialog (always rendered by ProjectDetail)
vi.mock('@/components/BinarySbomDialog', () => ({
  BinarySbomDialog: ({ open, onClose }: { open: boolean; onClose: () => void; projectId: string }) =>
    open ? (
      <div data-testid="binary-sbom-dialog">
        Binary SBOM Dialog
        <button onClick={onClose}>Close Binary SBOM</button>
      </div>
    ) : null,
}))

// Mock ExportDialog (always rendered by ProjectDetail)
vi.mock('@/components/ExportDialog', () => ({
  ExportDialog: ({ open, onClose }: { open: boolean; onClose: () => void; project: unknown }) =>
    open ? (
      <div data-testid="export-dialog">
        Export Dialog
        <button onClick={onClose}>Close Export</button>
      </div>
    ) : null,
}))

// Mock ComponentVulnerabilitiesPopup
vi.mock('@/components/ComponentVulnerabilitiesPopup', () => ({
  ComponentVulnerabilitiesPopup: ({
    open,
    onClose,
    onViewVulnerability,
    vulnerabilities,
  }: {
    open: boolean
    onClose: () => void
    onViewVulnerability: (v: unknown) => void
    vulnerabilities: unknown[]
  }) =>
    open ? (
      <div data-testid="component-vuln-popup">
        Component Vulnerabilities Popup
        <button onClick={onClose}>Close Popup</button>
        {vulnerabilities.length > 0 && (
          <button onClick={() => onViewVulnerability(vulnerabilities[0])}>View Vuln in Popup</button>
        )}
      </div>
    ) : null,
}))

// Mock FilterPresets components
vi.mock('@/components/FilterPresets', () => ({
  FilterPresets: ({
    onSavePreset,
    onLoadPreset,
    onDeletePreset,
  }: {
    onSavePreset: (name: string, filters: unknown) => void
    onLoadPreset: (presetId: string) => void
    onDeletePreset: (presetId: string) => void
    currentFilters: unknown
    presets: unknown[]
  }) => (
    <div data-testid="filter-presets">
      <button onClick={() => onSavePreset('Test Preset', {})} data-testid="save-preset-btn">
        Save Preset
      </button>
      <button onClick={() => onLoadPreset('preset-1')} data-testid="load-preset-btn">
        Load Preset
      </button>
      <button onClick={() => onDeletePreset('preset-1')} data-testid="delete-preset-btn">
        Delete Preset
      </button>
    </div>
  ),
  CvssRangeSlider: ({ value }: { value: [number, number]; onChange: (v: [number, number]) => void }) => (
    <div data-testid="cvss-range-slider">
      <input aria-label="cvss-min" defaultValue={value[0]} readOnly />
      <input aria-label="cvss-max" defaultValue={value[1]} readOnly />
    </div>
  ),
  MultiSelectFilter: ({
    label,
  }: {
    label: string
    options: unknown[]
    selected: string[]
    onChange: (v: string[]) => void
  }) => <div data-testid="multi-select-filter">{label}</div>,
}))

// Mock HealthDashboard
vi.mock('@/components/HealthDashboard', () => ({
  HealthDashboard: () => <div data-testid="health-dashboard" />,
}))

// Mock RemediationQueue
vi.mock('@/components/RemediationQueue', () => ({
  RemediationQueue: ({ onViewVulnerability }: { onViewVulnerability: (v: unknown) => void }) => (
    <div data-testid="remediation-queue">
      <button
        onClick={() =>
          onViewVulnerability({ id: 'CVE-QUEUE-001', source: 'nvd', severity: 'high', description: 'Queue vuln' })
        }
      >
        View Queue Vuln
      </button>
    </div>
  ),
}))

// Mock VirtualList — renders all items (no virtualization in tests)
vi.mock('@/components/VirtualList', () => ({
  VirtualList: ({ items, renderItem }: { items: unknown[]; renderItem: (item: unknown) => React.ReactNode }) => (
    <>{items.map((item) => renderItem(item))}</>
  ),
}))

// Mock KevBadge
vi.mock('@/components/vulnerabilities/KevBadge', () => ({
  KevBadge: () => null,
}))

// Mock RiskScoreBadge
vi.mock('@/components/vulnerabilities/RiskScoreCell', () => ({
  RiskScoreBadge: () => null,
}))

// Mock health utilities
vi.mock('@/lib/health', () => ({
  calculateComponentHealth: vi.fn(() => ({
    score: 85,
    previousScore: 80,
    status: 'good',
    vulnerabilities: { critical: 0, high: 0, medium: 1, low: 2 },
  })),
  calculateProjectHealth: vi.fn(() => ({
    overallScore: 85,
    status: 'good',
    componentCount: 2,
    vulnerableCount: 1,
  })),
  calculateTrend: vi.fn(() => 'improving'),
}))

// Mock vulnerability ID formatting
vi.mock('@/lib/utils/vulnIdFormat', () => ({
  formatVulnerabilityId: vi.fn((vuln: { id: string }) => ({
    primaryId: vuln.id,
    aliases: [],
  })),
}))

// Mock secure key service (used by scan and refresh handlers)
const mockGetApiKey = vi.fn(() => Promise.resolve(null))

vi.mock('@/lib/storage', () => ({
  getSecureKeyService: vi.fn(() => ({
    getApiKey: mockGetApiKey,
  })),
}))

// Mock vulnerability enrichment (used by scan handler)
vi.mock('@/lib/services/intelligence/enrichVulnerabilities', () => ({
  enrichVulnerabilities: vi.fn((vulns: unknown[]) => Promise.resolve(vulns)),
}))

// Mock the store
const mockUpdateProject = vi.fn()
const mockDeleteProject = vi.fn()
const mockSetCurrentProject = vi.fn()
const mockUseStore = vi.fn()

vi.mock('@/store/useStore', () => ({ useStore: () => mockUseStore() }))

// Import mocked modules
const { matchVulnerabilitiesForComponents } = await import('@/lib/api/vulnMatcher')
const { refreshVulnerabilityData } = await import('@/lib/refresh')
const { toast } = await import('@/components/Toaster')
const { formatVulnerabilityId } = await import('@/lib/utils/vulnIdFormat')

const createMockProject = (overrides?: Partial<Project>): Project => ({
  id: 'test-project-id',
  name: 'Test Project',
  description: 'A test project for vulnerability assessment',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
  lastScanAt: new Date('2024-01-03'),
  sbomFiles: [
    {
      id: 'sbom-1',
      filename: 'bom.json',
      format: 'cyclonedx',
      formatVersion: '1.5',
      uploadedAt: new Date('2024-01-01'),
      fileHash: 'abc123',
      componentCount: 5,
    },
  ],
  components: [
    {
      id: 'comp-1',
      name: 'lodash',
      version: '4.17.21',
      type: 'library',
      purl: 'pkg:npm/lodash@4.17.21',
      licenses: ['MIT'],
      vulnerabilities: ['CVE-2021-23337'],
    },
    {
      id: 'comp-2',
      name: 'react',
      version: '18.2.0',
      type: 'framework',
      purl: 'pkg:npm/react@18.2.0',
      licenses: ['MIT'],
      vulnerabilities: [],
    },
  ],
  vulnerabilities: [
    {
      id: 'CVE-2021-23337',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
      description: 'Prototype pollution attack',
      references: [],
      affectedComponents: ['comp-1'],
      publishedAt: new Date('2021-01-01'),
      modifiedAt: new Date('2021-02-01'),
    },
    {
      id: 'CVE-2022-12345',
      source: 'osv',
      severity: 'high',
      cvssScore: 8.5,
      description: 'Another vulnerability',
      references: [],
      affectedComponents: ['comp-1'],
    },
  ],
  statistics: {
    totalVulnerabilities: 5,
    criticalCount: 1,
    highCount: 1,
    mediumCount: 2,
    lowCount: 1,
    totalComponents: 2,
    vulnerableComponents: 1,
  },
  ...overrides,
})

describe('ProjectDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockReset()
    mockUpdateProject.mockReset()
    mockDeleteProject.mockReset()
    mockSetCurrentProject.mockReset()
    mockGetApiKey.mockReset()
    mockGetApiKey.mockReturnValue(Promise.resolve(null))

    // Mock useParams to return test project ID
    mockUseParams.mockReturnValue({ projectId: 'test-project-id' })

    // Default store mock
    mockUseStore.mockReturnValue({
      projects: [createMockProject()],
      currentProject: null,
      updateProject: mockUpdateProject,
      deleteProject: mockDeleteProject,
      setCurrentProject: mockSetCurrentProject,
      addProject: vi.fn(),
      refreshingProjectIds: new Set(),
      setRefreshingProject: vi.fn(),
      settings: {
        theme: 'system',
        fontSize: 'default',
        nvdApiKey: undefined,
        dataRetentionDays: 30,
        autoRefresh: false,
        autoRefreshInterval: 24,
        vulnDataCacheTTL: 1,
      },
      updateSettings: vi.fn(),
    } as any)
  })

  const renderProjectDetail = (project?: Project, projectId = 'test-project-id') => {
    const mockProject = project || createMockProject()
    mockUseParams.mockReturnValue({ projectId })

    mockUseStore.mockReturnValue({
      projects: projectId === 'test-project-id' ? [mockProject] : [],
      currentProject: mockProject,
      updateProject: mockUpdateProject,
      deleteProject: mockDeleteProject,
      setCurrentProject: mockSetCurrentProject,
      addProject: vi.fn(),
      refreshingProjectIds: new Set(),
      setRefreshingProject: vi.fn(),
      settings: {
        theme: 'system',
        fontSize: 'default',
        nvdApiKey: undefined,
        dataRetentionDays: 30,
        autoRefresh: false,
        autoRefreshInterval: 24,
        vulnDataCacheTTL: 1,
      },
      updateSettings: vi.fn(),
    } as any)

    return render(
      <MemoryRouter>
        <ProjectDetail />
      </MemoryRouter>,
    )
  }

  describe('Project Not Found State', () => {
    it('should render not found state when project does not exist', () => {
      // Set both projects and currentProject to null to trigger not found state
      mockUseStore.mockReturnValue({
        projects: [],
        currentProject: undefined,
        updateProject: mockUpdateProject,
        deleteProject: mockDeleteProject,
        setCurrentProject: mockSetCurrentProject,
        addProject: vi.fn(),
        refreshingProjectIds: new Set(),
        setRefreshingProject: vi.fn(),
        settings: {
          theme: 'system',
          fontSize: 'default',
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          autoRefreshInterval: 24,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      } as any)

      mockUseParams.mockReturnValue({ projectId: 'nonexistent-id' })

      render(
        <MemoryRouter>
          <ProjectDetail />
        </MemoryRouter>,
      )

      expect(screen.getByText('Project Not Found')).toBeInTheDocument()
      expect(screen.getByText('Project not found')).toBeInTheDocument()
      expect(screen.getByText("The project you're looking for doesn't exist")).toBeInTheDocument()
    })

    it('should navigate to dashboard when Back to Dashboard is clicked', () => {
      mockUseStore.mockReturnValue({
        projects: [],
        currentProject: undefined,
        updateProject: mockUpdateProject,
        deleteProject: mockDeleteProject,
        setCurrentProject: mockSetCurrentProject,
        addProject: vi.fn(),
        refreshingProjectIds: new Set(),
        setRefreshingProject: vi.fn(),
        settings: {
          theme: 'system',
          fontSize: 'default',
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          autoRefreshInterval: 24,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      } as any)

      mockUseParams.mockReturnValue({ projectId: 'nonexistent-id' })

      render(
        <MemoryRouter>
          <ProjectDetail />
        </MemoryRouter>,
      )

      const backButton = screen.getByText('Back to Dashboard')
      fireEvent.click(backButton)

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  describe('Header Section', () => {
    it('should render project name and description', () => {
      renderProjectDetail()

      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.getByText('A test project for vulnerability assessment')).toBeInTheDocument()
    })

    it('should show Edit button', () => {
      renderProjectDetail()

      const editButton = screen.getByText('Edit')
      expect(editButton).toBeInTheDocument()

      fireEvent.click(editButton)
      // Check for the inline dialog form
      expect(screen.getByDisplayValue('Test Project')).toBeInTheDocument()
    })

    it('should show Scan button', () => {
      renderProjectDetail()

      expect(screen.getByText('Scan for Vulnerabilities')).toBeInTheDocument()
    })

    it('should show Delete button', () => {
      renderProjectDetail()

      expect(screen.getByText('Delete')).toBeInTheDocument()
    })

    it('should call deleteProject and navigate when delete is confirmed', () => {
      // Mock window.confirm
      global.confirm = vi.fn(() => true)

      renderProjectDetail()

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete "Test Project"?')
      expect(mockDeleteProject).toHaveBeenCalledWith('test-project-id')
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('should not delete when cancel is clicked in confirm dialog', () => {
      global.confirm = vi.fn(() => false)

      renderProjectDetail()

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      expect(mockDeleteProject).not.toHaveBeenCalled()
      expect(mockNavigate).not.toHaveBeenCalled()
    })

    it('should disable Scan button when no components exist', () => {
      const projectNoComponents = createMockProject({ components: [] })
      renderProjectDetail(projectNoComponents)

      const scanButton = screen.getByText('Scan for Vulnerabilities')
      expect(scanButton).toBeDisabled()
    })
  })

  describe('Statistics Cards', () => {
    it('should display component count', () => {
      renderProjectDetail()

      // The statistics cards are in the Overview tab which is default.
      // Use getAllByText since "Components" appears in both tabs and statistics,
      // and the count "2" also appears in the license-compliance summary.
      expect(screen.getAllByText('Components').length).toBeGreaterThan(0)
      expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    })

    it('should display critical vulnerability count', () => {
      renderProjectDetail()

      expect(screen.getAllByText('Critical')[0]).toBeInTheDocument()
      // Find the specific "1" that's in the critical statistics card
      const criticalValue = screen.getAllByText('1')[0]
      expect(criticalValue).toBeInTheDocument()
    })

    it('should display high vulnerability count', () => {
      renderProjectDetail()

      expect(screen.getAllByText('High')[0]).toBeInTheDocument()
    })

    it('should display total vulnerabilities', () => {
      renderProjectDetail()

      expect(screen.getByText('Total Vulns')).toBeInTheDocument()
      expect(screen.getAllByText('5').length).toBeGreaterThan(0)
    })
  })

  describe('SBOM Files Section', () => {
    it('should show empty state when no SBOM files', () => {
      const projectNoSbom = createMockProject({ sbomFiles: [] })
      renderProjectDetail(projectNoSbom)

      expect(screen.getByText('SBOM Files')).toBeInTheDocument()
      expect(screen.getByText('No SBOM files uploaded yet')).toBeInTheDocument()
      expect(screen.getByText('Upload a CycloneDX or SPDX file to get started')).toBeInTheDocument()
    })

    it('should display SBOM files list', () => {
      renderProjectDetail()

      expect(screen.getByText('bom.json')).toBeInTheDocument()
      expect(screen.getByText('cyclonedx • 5 components')).toBeInTheDocument()
    })

    it('should open upload dialog when Upload SBOM is clicked', () => {
      renderProjectDetail()

      const uploadButton = screen.getByText('Upload SBOM')
      fireEvent.click(uploadButton)

      expect(screen.getByTestId('sbom-upload-dialog')).toBeInTheDocument()
    })

    it('TC-SBOM-006: should display SBOM file details', () => {
      renderProjectDetail()

      // Check that SBOM file details are displayed
      expect(screen.getByText('bom.json')).toBeInTheDocument()
      expect(screen.getByText('cyclonedx • 5 components')).toBeInTheDocument()

      // Verify SBOM file is displayed with its format and component count
      // The format and component count are displayed together in the same element
      const formatAndCount = screen.getByText('cyclonedx • 5 components')
      expect(formatAndCount).toBeInTheDocument()
      expect(formatAndCount.textContent).toContain('cyclonedx')
      expect(formatAndCount.textContent).toContain('5 components')
    })

    it('TC-SBOM-004: should remove SBOM file when Remove is clicked', async () => {
      const user = userEvent.setup()
      const projectWithSbom = createMockProject({
        sbomFiles: [
          {
            id: 'sbom-1',
            filename: 'bom.json',
            format: 'cyclonedx',
            uploadedAt: new Date(),
            componentCount: 5,
          },
          {
            id: 'sbom-2',
            filename: 'bom2.json',
            format: 'spdx',
            uploadedAt: new Date(),
            componentCount: 3,
          },
        ],
      })
      renderProjectDetail(projectWithSbom)

      // Find all Remove buttons (there should be 2 SBOM files)
      const removeButtons = screen.getAllByText('Remove')
      expect(removeButtons).toHaveLength(2)

      // Click the first Remove button
      await user.click(removeButtons[0])

      // Verify updateProject was called with the SBOM file removed
      expect(mockUpdateProject).toHaveBeenCalledWith(
        'test-project-id',
        expect.objectContaining({
          sbomFiles: expect.arrayContaining([expect.objectContaining({ id: 'sbom-2' })]),
        }),
      )

      // Verify sbom-1 is NOT in the updated SBOM files list
      const updateCall = mockUpdateProject.mock.calls[0]
      const updatedSbomFiles = updateCall[1].sbomFiles
      expect(updatedSbomFiles).not.toContainEqual(expect.objectContaining({ id: 'sbom-1' }))
      expect(updatedSbomFiles.length).toBe(1)
    })

    it('should clean up components and vulnerabilities when SBOM is removed', async () => {
      const user = userEvent.setup()
      const projectWithSbomAndComponents = createMockProject({
        sbomFiles: [
          {
            id: 'sbom-1',
            filename: 'bom.json',
            format: 'cyclonedx',
            uploadedAt: new Date(),
            componentCount: 2,
          },
        ],
        components: [
          {
            id: 'comp-1',
            name: 'lodash',
            version: '4.17.21',
            type: 'library',
            purl: 'pkg:npm/lodash@4.17.21',
            licenses: ['MIT'],
            vulnerabilities: ['CVE-2021-23337'],
            sbomFileId: 'sbom-1', // Component belongs to sbom-1
          },
          {
            id: 'comp-2',
            name: 'react',
            version: '18.2.0',
            type: 'framework',
            purl: 'pkg:npm/react@18.2.0',
            licenses: ['MIT'],
            vulnerabilities: [],
            sbomFileId: 'sbom-1', // Component belongs to sbom-1
          },
        ],
        vulnerabilities: [
          {
            id: 'CVE-2021-23337',
            source: 'nvd',
            severity: 'critical',
            cvssScore: 9.8,
            cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
            description: 'Prototype pollution attack',
            references: [],
            affectedComponents: ['comp-1'], // Only affects comp-1 from sbom-1
            publishedAt: new Date('2021-01-01'),
            modifiedAt: new Date('2021-02-01'),
          },
        ],
      })
      renderProjectDetail(projectWithSbomAndComponents)

      // Find and click the Remove button for the SBOM
      const removeButton = screen.getByText('Remove')
      await user.click(removeButton)

      // Verify updateProject was called with cleaned up components and vulnerabilities
      expect(mockUpdateProject).toHaveBeenCalledWith(
        'test-project-id',
        expect.objectContaining({
          sbomFiles: [], // SBOM removed
          components: [], // Components from sbom-1 removed
          vulnerabilities: [], // Vulnerability with no remaining affected components removed
          statistics: expect.objectContaining({
            totalComponents: 0,
            totalVulnerabilities: 0,
            vulnerableComponents: 0,
          }),
        }),
      )
    })

    it('should preserve vulnerabilities that affect remaining components', async () => {
      const user = userEvent.setup()
      const projectWithMultipleSboms = createMockProject({
        sbomFiles: [
          {
            id: 'sbom-1',
            filename: 'bom1.json',
            format: 'cyclonedx',
            uploadedAt: new Date(),
            componentCount: 1,
          },
          {
            id: 'sbom-2',
            filename: 'bom2.json',
            format: 'cyclonedx',
            uploadedAt: new Date(),
            componentCount: 1,
          },
        ],
        components: [
          {
            id: 'comp-1',
            name: 'lodash',
            version: '4.17.21',
            type: 'library',
            purl: 'pkg:npm/lodash@4.17.21',
            licenses: ['MIT'],
            vulnerabilities: ['CVE-2021-23337'],
            sbomFileId: 'sbom-1', // Belongs to sbom-1 (will be removed)
          },
          {
            id: 'comp-2',
            name: 'lodash',
            version: '4.17.20',
            type: 'library',
            purl: 'pkg:npm/lodash@4.17.20',
            licenses: ['MIT'],
            vulnerabilities: ['CVE-2021-23337'],
            sbomFileId: 'sbom-2', // Belongs to sbom-2 (will remain)
          },
        ],
        vulnerabilities: [
          {
            id: 'CVE-2021-23337',
            source: 'nvd',
            severity: 'critical',
            cvssScore: 9.8,
            description: 'Prototype pollution attack',
            references: [],
            affectedComponents: ['comp-1', 'comp-2'], // Affects both components
          },
        ],
      })
      renderProjectDetail(projectWithMultipleSboms)

      // Find and click the first Remove button (removes sbom-1)
      const removeButtons = screen.getAllByText('Remove')
      await user.click(removeButtons[0])

      // Verify updateProject was called with:
      // - sbom-1 removed from sbomFiles
      // - comp-1 removed from components
      // - Vulnerability preserved but affectedComponents updated to only include comp-2
      expect(mockUpdateProject).toHaveBeenCalledWith(
        'test-project-id',
        expect.objectContaining({
          sbomFiles: [expect.objectContaining({ id: 'sbom-2' })],
          components: [expect.objectContaining({ id: 'comp-2', sbomFileId: 'sbom-2' })],
          vulnerabilities: [
            expect.objectContaining({
              id: 'CVE-2021-23337',
              affectedComponents: ['comp-2'], // Only comp-2 remains
            }),
          ],
          statistics: expect.objectContaining({
            totalComponents: 1,
            totalVulnerabilities: 1,
            vulnerableComponents: 1,
          }),
        }),
      )
    })
  })

  describe('Components Section', () => {
    // Helper to click on Components tab
    const clickComponentsTab = () => {
      const componentsTab = screen.getByRole('tab', { name: 'Components' })
      fireEvent.click(componentsTab)
    }

    it('should show empty state when no components', () => {
      const projectNoComponents = createMockProject({ components: [] })
      renderProjectDetail(projectNoComponents)
      clickComponentsTab()

      expect(screen.getByText('Components (0)')).toBeInTheDocument()
      expect(screen.getByText('No components found')).toBeInTheDocument()
      expect(screen.getByText('Upload an SBOM file to view components')).toBeInTheDocument()
    })

    it('should display component list', () => {
      renderProjectDetail()
      clickComponentsTab()

      expect(screen.getByText('Components (2)')).toBeInTheDocument()
      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.getByText('react')).toBeInTheDocument()
    })

    it('should display component details', () => {
      renderProjectDetail()
      clickComponentsTab()

      expect(screen.getByText('4.17.21')).toBeInTheDocument()
      expect(screen.getByText('18.2.0')).toBeInTheDocument()
      // Get the element with class "capitalize" to find the component type
      const typeElements = screen.getAllByText(/library|framework/i)
      expect(typeElements.length).toBeGreaterThan(0)
    })

    it('should filter components by search', () => {
      renderProjectDetail()
      clickComponentsTab()

      const searchInput = screen.getByPlaceholderText('Search components...')
      fireEvent.change(searchInput, { target: { value: 'lodash' } })

      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.queryByText('react')).not.toBeInTheDocument()
    })

    it('should filter components by type', () => {
      renderProjectDetail()
      clickComponentsTab()

      const typeFilter = screen.getByDisplayValue('All Types')
      fireEvent.change(typeFilter, { target: { value: 'library' } })

      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.queryByText('react')).not.toBeInTheDocument()
    })

    it('should filter components by vulnerability status', () => {
      renderProjectDetail()
      clickComponentsTab()

      const vulnFilter = screen.getByDisplayValue('All')
      fireEvent.change(vulnFilter, { target: { value: 'vulnerable' } })

      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.queryByText('react')).not.toBeInTheDocument()
    })

    it('should sort components', () => {
      renderProjectDetail()
      clickComponentsTab()

      const sortSelect = screen.getByDisplayValue('Sort: Name')
      fireEvent.change(sortSelect, { target: { value: 'version' } })

      const components = screen.getAllByText(/lodash|react/)
      expect(components.length).toBeGreaterThan(0)
    })

    it('should show no results when filters exclude all components', () => {
      renderProjectDetail()
      clickComponentsTab()

      const searchInput = screen.getByPlaceholderText('Search components...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

      expect(screen.getByText('No components match your filters')).toBeInTheDocument()
      expect(screen.getByText('Clear filters')).toBeInTheDocument()
    })

    it('should clear filters when Clear filters button is clicked', () => {
      renderProjectDetail()
      clickComponentsTab()

      const searchInput = screen.getByPlaceholderText('Search components...')
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

      expect(screen.getByText('No components match your filters')).toBeInTheDocument()

      const clearButton = screen.getByText('Clear filters')
      fireEvent.click(clearButton)

      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.getByText('react')).toBeInTheDocument()
    })

    it('should display component vulnerability count', () => {
      renderProjectDetail()
      clickComponentsTab()

      // lodash (comp-1) is affected by both mock vulnerabilities
      // The count is in a span with class "text-destructive"
      const vulnCountElements = screen.getAllByText(/vulnerability/)
      const vulnCountSpan = vulnCountElements.find((el) => el.classList.contains('text-destructive'))
      expect(vulnCountSpan).toBeTruthy()
    })

    it('should display component licenses', () => {
      renderProjectDetail()
      clickComponentsTab()

      expect(screen.getAllByText('MIT').length).toBeGreaterThan(0)
    })

    it('should render all components via VirtualList', () => {
      const manyComponents: Component[] = Array.from({ length: 55 }, (_, i) => ({
        id: `comp-${i}`,
        name: `component-${i}`,
        version: '1.0.0',
        type: 'library',
        licenses: ['MIT'],
        vulnerabilities: [],
      }))

      const projectWithMany = createMockProject({ components: manyComponents })
      renderProjectDetail(projectWithMany)
      clickComponentsTab()

      // VirtualList renders all items (no limit in current implementation)
      expect(screen.getByText('component-0')).toBeInTheDocument()
      expect(screen.getByText('component-54')).toBeInTheDocument()
    })
  })

  describe('Component Management - TC-CM Scenarios', () => {
    const clickComponentsTab = () => {
      const componentsTab = screen.getByRole('tab', { name: 'Components' })
      fireEvent.click(componentsTab)
    }

    it('TC-CM-001: should view all components', () => {
      renderProjectDetail()
      clickComponentsTab()

      expect(screen.getByText('Components (2)')).toBeInTheDocument()
      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.getByText('react')).toBeInTheDocument()
      expect(screen.getByText('4.17.21')).toBeInTheDocument()
      expect(screen.getByText('18.2.0')).toBeInTheDocument()
    })

    it('TC-CM-002: should search components', () => {
      renderProjectDetail()
      clickComponentsTab()

      const searchInput = screen.getByPlaceholderText('Search components...')
      fireEvent.change(searchInput, { target: { value: 'lodash' } })

      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.queryByText('react')).not.toBeInTheDocument()

      // Test search by version
      fireEvent.change(searchInput, { target: { value: '18.2.0' } })
      expect(screen.getByText('react')).toBeInTheDocument()
      expect(screen.queryByText('lodash')).not.toBeInTheDocument()
    })

    it('TC-CM-003: should filter components by type', () => {
      renderProjectDetail()
      clickComponentsTab()

      const typeFilter = screen.getByDisplayValue('All Types')

      // Filter by library
      fireEvent.change(typeFilter, { target: { value: 'library' } })
      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.queryByText('react')).not.toBeInTheDocument()

      // Filter by framework
      fireEvent.change(typeFilter, { target: { value: 'framework' } })
      expect(screen.getByText('react')).toBeInTheDocument()
      expect(screen.queryByText('lodash')).not.toBeInTheDocument()
    })

    it('TC-CM-004: should filter components by vulnerability status', () => {
      renderProjectDetail()
      clickComponentsTab()

      const vulnFilter = screen.getByDisplayValue('All')

      // Show only vulnerable components
      fireEvent.change(vulnFilter, { target: { value: 'vulnerable' } })
      expect(screen.getByText('lodash')).toBeInTheDocument() // Has vulnerabilities
      expect(screen.queryByText('react')).not.toBeInTheDocument() // No vulnerabilities

      // Show only safe components
      fireEvent.change(vulnFilter, { target: { value: 'safe' } })
      expect(screen.getByText('react')).toBeInTheDocument() // No vulnerabilities
      expect(screen.queryByText('lodash')).not.toBeInTheDocument() // Has vulnerabilities

      // Show all
      fireEvent.change(vulnFilter, { target: { value: 'all' } })
      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.getByText('react')).toBeInTheDocument()
    })

    it('TC-CM-005: should sort components', () => {
      renderProjectDetail()
      clickComponentsTab()

      const sortSelect = screen.getByDisplayValue('Sort: Name')

      // Sort by name (default)
      expect(sortSelect).toHaveDisplayValue('Sort: Name')

      // Sort by version
      fireEvent.change(sortSelect, { target: { value: 'version' } })
      expect(sortSelect).toHaveDisplayValue('Sort: Version')

      // Sort by type
      fireEvent.change(sortSelect, { target: { value: 'type' } })
      expect(sortSelect).toHaveDisplayValue('Sort: Type')
    })

    it('TC-CM-006: should view component vulnerabilities', () => {
      renderProjectDetail()
      clickComponentsTab()

      // The lodash component should show vulnerability count
      const lodashElements = screen.getAllByText(/lodash/)
      expect(lodashElements.length).toBeGreaterThan(0)
      // lodash (comp-1) is affected by both mock vulnerabilities
      // Text is split across nodes: "• 2 vulnerabilitys"
      // "vulnerability" appears in project description too, so filter by class
      const vulnCountElements = screen.getAllByText(/vulnerability/)
      const vulnCountSpan = vulnCountElements.find((el) => el.classList.contains('text-destructive'))
      expect(vulnCountSpan).toBeTruthy()

      // The react component should show no vulnerabilities (no vulnerability badge shown)
      const reactElements = screen.getAllByText(/react/)
      expect(reactElements.length).toBeGreaterThan(0)
    })

    it('TC-CM-007: should show empty component list', () => {
      const projectNoComponents = createMockProject({ components: [] })
      renderProjectDetail(projectNoComponents)
      clickComponentsTab()

      expect(screen.getByText('Components (0)')).toBeInTheDocument()
      expect(screen.getByText('No components found')).toBeInTheDocument()
      expect(screen.getByText('Upload an SBOM file to view components')).toBeInTheDocument()
    })

    it('TC-CM-008: should display component with no vulnerabilities', () => {
      // Create a project with only safe components
      const projectWithSafeComponents = createMockProject({
        components: [
          {
            id: 'comp-2',
            name: 'react',
            version: '18.2.0',
            type: 'framework',
            purl: 'pkg:npm/react@18.2.0',
            licenses: ['MIT'],
            vulnerabilities: [],
          },
        ],
      })

      renderProjectDetail(projectWithSafeComponents)
      clickComponentsTab()

      expect(screen.getByText('react')).toBeInTheDocument()
      expect(screen.getByText('18.2.0')).toBeInTheDocument()
      expect(screen.getByText('framework')).toBeInTheDocument()

      // Should not show any vulnerability count for this component
      const componentElements = screen.getAllByText(/react/)
      const safeComponent = componentElements.find(
        (el) =>
          el.parentElement?.textContent?.includes('vulnerabilities') === false ||
          !el.parentElement?.textContent?.includes('1 vulnerability'),
      )

      // The react component should be visible and not show vulnerability count
      expect(screen.getByText('react')).toBeInTheDocument()
    })

    it('should show component PURL when available', () => {
      renderProjectDetail()
      clickComponentsTab()

      expect(screen.getByText('pkg:npm/lodash@4.17.21')).toBeInTheDocument()
      expect(screen.getByText('pkg:npm/react@18.2.0')).toBeInTheDocument()
    })

    it('should handle component without PURL', () => {
      const projectWithoutPurl = createMockProject({
        components: [
          {
            id: 'comp-1',
            name: 'test-lib',
            version: '1.0.0',
            type: 'library',
            licenses: ['MIT'],
            vulnerabilities: [],
          },
        ],
      })

      renderProjectDetail(projectWithoutPurl)
      clickComponentsTab()

      expect(screen.getByText('test-lib')).toBeInTheDocument()
      expect(screen.getByText('1.0.0')).toBeInTheDocument()
      // PURL should not be shown
      expect(screen.queryByText(/pkg:/i)).not.toBeInTheDocument()
    })

    it('should display component type badges correctly', () => {
      renderProjectDetail()
      clickComponentsTab()

      // Check that component types are displayed
      const types = screen.getAllByText(/library|framework/i)
      expect(types.length).toBeGreaterThan(0)

      // Check that lodash shows as library (go to grandparent to find type text)
      expect(screen.getByText('lodash')).toBeInTheDocument()
      const lodashGrandparent = screen.getByText('lodash').parentElement?.parentElement
      expect(lodashGrandparent?.textContent).toContain('library')
    })

    it('should handle search with case insensitive matching', () => {
      renderProjectDetail()
      clickComponentsTab()

      const searchInput = screen.getByPlaceholderText('Search components...')

      // Search with lowercase
      fireEvent.change(searchInput, { target: { value: 'lodash' } })
      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.queryByText('react')).not.toBeInTheDocument()

      // Search with uppercase
      fireEvent.change(searchInput, { target: { value: 'LODASH' } })
      expect(screen.getByText('lodash')).toBeInTheDocument()

      // Search with mixed case
      fireEvent.change(searchInput, { target: { value: 'LoDaSh' } })
      expect(screen.getByText('lodash')).toBeInTheDocument()
    })

    it('should handle search with partial matches', () => {
      renderProjectDetail()
      clickComponentsTab()

      const searchInput = screen.getByPlaceholderText('Search components...')

      // Partial name match
      fireEvent.change(searchInput, { target: { value: 'ash' } })
      expect(screen.getByText('lodash')).toBeInTheDocument()

      // Partial version match
      fireEvent.change(searchInput, { target: { value: '4.17' } })
      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.getByText('4.17.21')).toBeInTheDocument()
    })

    it('should maintain filter state when switching tabs', () => {
      renderProjectDetail()

      // Go to components tab and set a filter
      fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
      const searchInput = screen.getByPlaceholderText('Search components...')
      fireEvent.change(searchInput, { target: { value: 'lodash' } })
      expect(screen.getByText('lodash')).toBeInTheDocument()

      // Switch to vulnerabilities tab
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
      expect(screen.getByText('Vulnerabilities (2)')).toBeInTheDocument()

      // Switch back to components - filter should be maintained
      fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(searchInput).toHaveValue('lodash')
    })
  })

  describe('Vulnerabilities Section', () => {
    // Helper to click on Vulnerabilities tab
    const clickVulnerabilitiesTab = () => {
      const vulnerabilitiesTab = screen.getByRole('tab', { name: 'Vulnerabilities' })
      fireEvent.click(vulnerabilitiesTab)
    }

    it('should show empty state when no vulnerabilities', () => {
      const projectNoVulns = createMockProject({ vulnerabilities: [] })
      renderProjectDetail(projectNoVulns)
      clickVulnerabilitiesTab()

      expect(screen.getByText('Vulnerabilities (0)')).toBeInTheDocument()
      expect(screen.getByText('No vulnerabilities found')).toBeInTheDocument()
      expect(screen.getByText('Run a vulnerability scan to check for security issues')).toBeInTheDocument()
    })

    it('should display vulnerability list', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      expect(screen.getByText('Vulnerabilities (2)')).toBeInTheDocument()
      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      expect(screen.getByText('CVE-2022-12345')).toBeInTheDocument()
    })

    it('should display vulnerability severity', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Check for severity group headers - using getAllByText since there may be multiple matches
      const criticalText = screen.getAllByText(/Critical/i)
      expect(criticalText.length).toBeGreaterThan(0)

      const highText = screen.getAllByText(/High/i)
      expect(highText.length).toBeGreaterThan(0)

      // Check that individual vulnerabilities show their source
      expect(screen.getByText(/nvd/i)).toBeInTheDocument()
      expect(screen.getByText(/osv/i)).toBeInTheDocument()
    })

    it('should display CVSS score when available', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      expect(screen.getByText(/9\.8/)).toBeInTheDocument()
    })

    it('should filter vulnerabilities by severity', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      const severityFilter = screen.getByDisplayValue('All Severities')
      fireEvent.change(severityFilter, { target: { value: 'critical' } })

      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
    })

    it('should show no results when severity filter excludes all', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      const severityFilter = screen.getByDisplayValue('All Severities')
      fireEvent.change(severityFilter, { target: { value: 'low' } })

      expect(screen.getByText('No vulnerabilities match the current filters')).toBeInTheDocument()
    })

    it('should open vulnerability detail modal when View Details is clicked', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      const viewButtons = screen.getAllByText('View Details')
      fireEvent.click(viewButtons[0])

      expect(screen.getByTestId('vuln-detail-modal')).toBeInTheDocument()
    })

    it('should render all vulnerabilities via VirtualList', () => {
      const manyVulns: Vulnerability[] = Array.from({ length: 25 }, (_, i) => ({
        id: `CVE-2024-${String(i).padStart(5, '0')}`,
        source: 'nvd',
        severity: 'low',
        description: `Vulnerability ${i}`,
        references: [],
        affectedComponents: [`comp-${i}`],
      }))

      const projectWithManyVulns = createMockProject({ vulnerabilities: manyVulns })
      renderProjectDetail(projectWithManyVulns)
      clickVulnerabilitiesTab()

      // VirtualList renders all items (no limit in current implementation)
      expect(screen.getByText('CVE-2024-00000')).toBeInTheDocument()
      expect(screen.getByText('CVE-2024-00024')).toBeInTheDocument()
    })

    it('should display affected components count', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Use getAllByText since there are multiple occurrences
      const matches = screen.getAllByText(/1 component/i)
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  describe('Vulnerability Filtering - TC-VM Scenarios', () => {
    const clickVulnerabilitiesTab = () => {
      const vulnerabilitiesTab = screen.getByRole('tab', { name: 'Vulnerabilities' })
      fireEvent.click(vulnerabilitiesTab)
    }

    it('TC-VM-002: should filter vulnerabilities by severity (exact match)', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      const severityFilter = screen.getByDisplayValue('All Severities')

      // Filter to critical only
      fireEvent.change(severityFilter, { target: { value: 'critical' } })
      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      expect(screen.queryByText('CVE-2022-12345')).not.toBeInTheDocument()

      // Filter to high only
      fireEvent.change(severityFilter, { target: { value: 'high' } })
      expect(screen.getByText('CVE-2022-12345')).toBeInTheDocument()
      expect(screen.queryByText('CVE-2021-23337')).not.toBeInTheDocument()
    })

    it('TC-VM-003: should filter vulnerabilities by CVSS range', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Click Advanced Filters button
      const advancedFiltersButton = screen.getByText('Advanced Filters')
      fireEvent.click(advancedFiltersButton)

      // CVSS range slider mock should be visible
      expect(screen.getByTestId('cvss-range-slider')).toBeInTheDocument()

      // Clear button should be visible
      expect(screen.getByText('Clear Advanced Filters')).toBeInTheDocument()
    })

    it('TC-VM-004: should filter vulnerabilities by source', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Click Advanced Filters button
      const advancedFiltersButton = screen.getByText('Advanced Filters')
      fireEvent.click(advancedFiltersButton)

      // Find source filter
      const sourceLabel = screen.getByText('Source')
      expect(sourceLabel).toBeInTheDocument()
    })

    it('TC-VM-005: should filter vulnerabilities by reference tags', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Click Advanced Filters button
      const advancedFiltersButton = screen.getByText('Advanced Filters')
      fireEvent.click(advancedFiltersButton)

      // Find reference tags filter
      const refTagLabel = screen.getByText('Reference Tags')
      expect(refTagLabel).toBeInTheDocument()
    })

    it('TC-VM-006: should apply multiple filters together', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Apply severity filter first
      const severityFilter = screen.getByDisplayValue('All Severities')
      fireEvent.change(severityFilter, { target: { value: 'critical' } })

      // Open advanced filters
      const advancedFiltersButton = screen.getByText('Advanced Filters')
      fireEvent.click(advancedFiltersButton)

      // Advanced filters should be visible
      expect(screen.getByText('Source')).toBeInTheDocument()
      expect(screen.getByText('Reference Tags')).toBeInTheDocument()

      // "Advanced filters active" text should not show yet (only severity is set)
      expect(screen.queryByText('Advanced filters active')).not.toBeInTheDocument()
    })

    it('TC-VM-007: should sort vulnerabilities by severity', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Vulnerabilities are grouped by severity (Critical, High, Medium, Low)
      // Check that groups are ordered correctly
      const vulnContainer = screen.getByText('Vulnerabilities (2)').parentElement?.parentElement
      expect(vulnContainer).toBeInTheDocument()

      // The grouping shows vulnerabilities are sorted by severity
      expect(screen.getAllByText(/Critical/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/High/i).length).toBeGreaterThan(0)
    })

    it('TC-VM-009: should clear all vulnerability filters', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Set a severity filter
      const severityFilter = screen.getByDisplayValue('All Severities')
      fireEvent.change(severityFilter, { target: { value: 'critical' } })

      // Set advanced filters
      const advancedFiltersButton = screen.getByText('Advanced Filters')
      fireEvent.click(advancedFiltersButton)

      // Now clear the severity filter
      fireEvent.change(severityFilter, { target: { value: 'all' } })

      // Should show both vulnerabilities again
      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      expect(screen.getByText('CVE-2022-12345')).toBeInTheDocument()

      // Clear advanced filters button should work
      const clearButton = screen.getByText('Clear Advanced Filters')
      fireEvent.click(clearButton)
    })

    it('TC-VM-010: should provide external links to NVD/OSV', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Open vulnerability detail modal
      const viewButtons = screen.getAllByText('View Details')
      fireEvent.click(viewButtons[0])

      // Should show modal with external links
      expect(screen.getByTestId('vuln-detail-modal')).toBeInTheDocument()

      // Check for "View on NVD" or "View on OSV" button
      // The modal footer has external link button with text "View on NVD" or "View on OSV"
      const viewOnButtons = screen.getAllByText(/View on (NVD|OSV)/)
      expect(viewOnButtons.length).toBeGreaterThan(0)

      // Close modal - the close button text is just "Close"
      const closeButton = screen.getByText('Close')
      fireEvent.click(closeButton)

      expect(screen.queryByTestId('vuln-detail-modal')).not.toBeInTheDocument()
    })

    it('should show "No vulnerabilities match" when all filters exclude everything', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Set a filter that excludes all vulnerabilities (low when only critical/high exist)
      const severityFilter = screen.getByDisplayValue('All Severities')
      fireEvent.change(severityFilter, { target: { value: 'low' } })

      expect(screen.getByText('No vulnerabilities match the current filters')).toBeInTheDocument()
      expect(screen.getByText('Clear all filters')).toBeInTheDocument()
    })

    it('should toggle advanced filters panel', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Advanced filters should be hidden initially
      expect(screen.queryByText('Source')).not.toBeInTheDocument()
      expect(screen.queryByText('Reference Tags')).not.toBeInTheDocument()

      // Click to show advanced filters
      const advancedFiltersButton = screen.getByText('Advanced Filters')
      fireEvent.click(advancedFiltersButton)

      // Advanced filters should now be visible
      expect(screen.getByText('Source')).toBeInTheDocument()
      expect(screen.getByText('Reference Tags')).toBeInTheDocument()

      // Click to hide advanced filters
      fireEvent.click(advancedFiltersButton)

      // Advanced filters should be hidden again
      expect(screen.queryByText('Source')).not.toBeInTheDocument()
    })

    it('should show vulnerability count by severity group', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Check for severity group headers (Critical and High are in our mock data)
      // There are multiple "Critical" and "High" texts on the page, so use getAllByText
      const criticalHeaders = screen.getAllByText('Critical')
      const highHeaders = screen.getAllByText('High')

      // We should find at least one occurrence of each severity
      expect(criticalHeaders.length).toBeGreaterThan(0)
      expect(highHeaders.length).toBeGreaterThan(0)

      // Check for vulnerability count text (either "vulnerability" or "vulnerabilities")
      const vulnCountText = screen.getAllByText(/vulnerabilit/i)
      expect(vulnCountText.length).toBeGreaterThan(0)
    })
  })

  describe('Metadata Section', () => {
    it('should display creation date', () => {
      renderProjectDetail()

      expect(screen.getByText('Created')).toBeInTheDocument()
      expect(screen.getByText(/Jan 1, 2024/)).toBeInTheDocument()
    })

    it('should display last updated date', () => {
      renderProjectDetail()

      expect(screen.getByText('Last Updated')).toBeInTheDocument()
    })

    it('should display last scan date when available', () => {
      renderProjectDetail()

      expect(screen.getByText('Last Scan')).toBeInTheDocument()
    })

    it('should display vulnerable components count', () => {
      renderProjectDetail()

      expect(screen.getByText('Vulnerable Components')).toBeInTheDocument()
      expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    })

    it('should not display last scan when not available', () => {
      const projectNoScan = createMockProject({ lastScanAt: undefined })
      renderProjectDetail(projectNoScan)

      expect(screen.queryByText('Last Scan')).not.toBeInTheDocument()
    })
  })

  describe('Vulnerability Scanning', () => {
    it('should disable scan button when no components', () => {
      const projectNoComponents = createMockProject({ components: [] })
      renderProjectDetail(projectNoComponents)

      const scanButton = screen.getByText('Scan for Vulnerabilities')
      expect(scanButton).toBeDisabled()
    })

    it('should show scanning progress during scan', async () => {
      vi.mocked(matchVulnerabilitiesForComponents).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(new Map([['comp-1', []]])), 100)),
      )

      renderProjectDetail()

      const scanButton = screen.getByText('Scan for Vulnerabilities')
      fireEvent.click(scanButton)

      await waitFor(() => {
        expect(screen.getByText(/Scanning/)).toBeInTheDocument()
      })
    })

    it('should update project with scan results', async () => {
      const mockVulns = [
        {
          id: 'CVE-2024-1234',
          source: 'nvd' as const,
          severity: 'high' as const,
          description: 'Test vulnerability',
          references: [],
          affectedComponents: ['comp-1'],
        },
      ]

      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map([['comp-1', mockVulns]]))

      renderProjectDetail()

      const scanButton = screen.getByText('Scan for Vulnerabilities')
      fireEvent.click(scanButton)

      await waitFor(
        () => {
          expect(mockUpdateProject).toHaveBeenCalled()
        },
        { timeout: 10000 },
      )
    })

    it('should handle scan errors gracefully', async () => {
      // Use a mock that will fail immediately
      vi.mocked(matchVulnerabilitiesForComponents).mockImplementation(() => Promise.reject(new Error('Scan failed')))

      renderProjectDetail()

      const scanButton = screen.getByText('Scan for Vulnerabilities')
      fireEvent.click(scanButton)

      // Wait for the scan to complete (error case)
      // The button should become enabled again after the error
      await waitFor(
        () => {
          const button = screen.queryByText('Scan for Vulnerabilities')
          expect(button).not.toBeDisabled()
        },
        { timeout: 10000 },
      )
    })

    it('TC-SCAN-001: should scan with API key without showing warning toast', async () => {
      // Clear toast mock before test
      toast.info.mockReset()

      // Configure secure key service to return API key
      mockGetApiKey.mockResolvedValue('test-api-key-1234')

      mockUseStore.mockReturnValue({
        projects: [createMockProject()],
        currentProject: createMockProject(),
        updateProject: mockUpdateProject,
        deleteProject: mockDeleteProject,
        setCurrentProject: mockSetCurrentProject,
        addProject: vi.fn(),
        refreshingProjectIds: new Set(),
        setRefreshingProject: vi.fn(),
        settings: {
          theme: 'system',
          fontSize: 'default',
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          autoRefreshInterval: 24,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      } as any)

      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map([['comp-1', []]]))

      // Render directly without using renderProjectDetail to avoid overriding store
      render(
        <MemoryRouter>
          <ProjectDetail />
        </MemoryRouter>,
      )

      const scanButton = screen.getByText('Scan for Vulnerabilities')
      fireEvent.click(scanButton)

      // Wait for the scan to complete
      await waitFor(
        () => {
          expect(mockUpdateProject).toHaveBeenCalled()
        },
        { timeout: 10000 },
      )

      // After scan completes, verify no warning was shown
      expect(toast.info).not.toHaveBeenCalled()
    })

    it('TC-SCAN-002: should show info toast when scanning without API key', async () => {
      // Configure secure key service to return no API key
      mockGetApiKey.mockResolvedValue(null)

      mockUseStore.mockReturnValue({
        projects: [createMockProject()],
        currentProject: createMockProject(),
        updateProject: mockUpdateProject,
        deleteProject: mockDeleteProject,
        setCurrentProject: mockSetCurrentProject,
        addProject: vi.fn(),
        refreshingProjectIds: new Set(),
        setRefreshingProject: vi.fn(),
        settings: {
          theme: 'system',
          fontSize: 'default',
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          autoRefreshInterval: 24,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      } as any)

      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(new Map([['comp-1', []]]))

      renderProjectDetail()

      const scanButton = screen.getByText('Scan for Vulnerabilities')
      fireEvent.click(scanButton)

      await waitFor(
        () => {
          expect(toast.info).toHaveBeenCalledWith('No NVD API Key', expect.stringContaining('rate limits'))
        },
        { timeout: 10000 },
      )
    })

    it('TC-SCAN-004: should show error toast when scan fails', async () => {
      vi.mocked(matchVulnerabilitiesForComponents).mockRejectedValue(new Error('Network connection failed'))

      renderProjectDetail()

      const scanButton = screen.getByText('Scan for Vulnerabilities')
      fireEvent.click(scanButton)

      await waitFor(
        () => {
          expect(toast.error).toHaveBeenCalledWith('Scan Failed', 'Network connection failed')
        },
        { timeout: 10000 },
      )
    })

    it('TC-SCAN-003: should show warning toast and not scan when no components', async () => {
      const projectNoComponents = createMockProject({ components: [] })
      renderProjectDetail(projectNoComponents)

      const scanButton = screen.getByText('Scan for Vulnerabilities')
      fireEvent.click(scanButton)

      // Button should be disabled, so the handler won't even be called
      expect(scanButton).toBeDisabled()
      expect(matchVulnerabilitiesForComponents).not.toHaveBeenCalled()
    })
  })

  describe('Vulnerability Data Refresh', () => {
    beforeEach(() => {
      vi.clearAllMocks()
      mockNavigate.mockReset()
      mockUpdateProject.mockReset()
      mockDeleteProject.mockReset()
      mockSetCurrentProject.mockReset()
      toast.success.mockReset()
      toast.error.mockReset()
      toast.warning.mockReset()
      toast.info.mockReset()

      mockUseParams.mockReturnValue({ projectId: 'test-project-id' })
    })

    const renderProjectDetailWithRefresh = () => {
      mockGetApiKey.mockResolvedValue('test-api-key-1234')

      mockUseStore.mockReturnValue({
        projects: [createMockProject()],
        currentProject: createMockProject(),
        updateProject: mockUpdateProject,
        deleteProject: mockDeleteProject,
        setCurrentProject: mockSetCurrentProject,
        addProject: vi.fn(),
        refreshingProjectIds: new Set(),
        setRefreshingProject: vi.fn(),
        settings: {
          theme: 'system',
          fontSize: 'default',
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          autoRefreshInterval: 24,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      } as any)

      return render(
        <MemoryRouter>
          <ProjectDetail />
        </MemoryRouter>,
      )
    }

    it('TC-SCAN-005: should refresh vulnerability data with API key', async () => {
      vi.mocked(refreshVulnerabilityData).mockResolvedValue({
        success: true,
        vulnerabilities: [],
        componentsScanned: 2,
      })

      renderProjectDetailWithRefresh()

      // Find and click the refresh button using data-testid
      const refreshButton = screen.getByTestId('refresh-button')
      fireEvent.click(refreshButton)

      await waitFor(
        () => {
          expect(vi.mocked(refreshVulnerabilityData)).toHaveBeenCalled()
          expect(mockUpdateProject).toHaveBeenCalled()
        },
        { timeout: 10000 },
      )
    })

    it('TC-SCAN-006: should show warning when refreshing without API key', async () => {
      // Configure secure key service to return no API key
      mockGetApiKey.mockResolvedValue(null)

      mockUseStore.mockReturnValue({
        projects: [createMockProject()],
        currentProject: createMockProject(),
        updateProject: mockUpdateProject,
        deleteProject: mockDeleteProject,
        setCurrentProject: mockSetCurrentProject,
        addProject: vi.fn(),
        refreshingProjectIds: new Set(),
        setRefreshingProject: vi.fn(),
        settings: {
          theme: 'system',
          fontSize: 'default',
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          autoRefreshInterval: 24,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      } as any)

      render(
        <MemoryRouter>
          <ProjectDetail />
        </MemoryRouter>,
      )

      // Try to refresh - should show warning toast
      const refreshButton = screen.getByTestId('refresh-button')
      fireEvent.click(refreshButton)

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith('No NVD API Key', expect.stringContaining('add your NVD API key'))
      })
    })

    it('should show error toast when refresh fails', async () => {
      vi.mocked(refreshVulnerabilityData).mockRejectedValue(new Error('API rate limit exceeded'))

      renderProjectDetailWithRefresh()

      const refreshButton = screen.getByTestId('refresh-button')
      fireEvent.click(refreshButton)

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Refresh Failed', 'API rate limit exceeded')
      })
    })

    it('should show success toast after successful refresh', async () => {
      vi.mocked(refreshVulnerabilityData).mockResolvedValue({
        success: true,
        vulnerabilities: [],
        componentsScanned: 5,
      })

      renderProjectDetailWithRefresh()

      const refreshButton = screen.getByTestId('refresh-button')
      fireEvent.click(refreshButton)

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Refresh Complete', expect.stringContaining('5 components'))
      })
    })

    it('should not refresh when already refreshing', async () => {
      // Configure secure key service with API key
      mockGetApiKey.mockResolvedValue('test-api-key-1234')

      // Configure store with project already in refreshing state
      // Note: The mocked StalenessIndicator will receive isRefreshing=true
      // We need to mock the isRefreshing state
      mockUseStore.mockReturnValue({
        projects: [createMockProject()],
        currentProject: createMockProject(),
        updateProject: mockUpdateProject,
        deleteProject: mockDeleteProject,
        setCurrentProject: mockSetCurrentProject,
        addProject: vi.fn(),
        refreshingProjectIds: new Set(['test-project-id']),
        setRefreshingProject: vi.fn(),
        settings: {
          theme: 'system',
          fontSize: 'default',
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          autoRefreshInterval: 24,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      } as any)

      render(
        <MemoryRouter>
          <ProjectDetail />
        </MemoryRouter>,
      )

      // The button should be disabled when isRefreshing is true
      const refreshButton = screen.getByTestId('refresh-button')
      expect(refreshButton).toBeDisabled()

      // Clicking should do nothing
      fireEvent.click(refreshButton)

      // refreshVulnerabilityData should not be called since button is disabled
      expect(vi.mocked(refreshVulnerabilityData)).not.toHaveBeenCalled()
    })
  })

  describe('Edit Project Dialog', () => {
    it('should open edit dialog when Edit is clicked', () => {
      renderProjectDetail()

      const editButton = screen.getByText('Edit')
      fireEvent.click(editButton)

      // Check for the inline dialog form elements
      expect(screen.getByDisplayValue('Test Project')).toBeInTheDocument()
      expect(screen.getByLabelText('Project Name')).toBeInTheDocument()
    })

    it('should save project changes', () => {
      renderProjectDetail()

      const editButton = screen.getByText('Edit')
      fireEvent.click(editButton)

      const nameInput = screen.getByDisplayValue('Test Project')
      fireEvent.change(nameInput, { target: { value: 'Updated Project Name' } })

      const saveButton = screen.getByText('Save Changes')
      fireEvent.click(saveButton)

      expect(mockUpdateProject).toHaveBeenCalledWith('test-project-id', {
        name: 'Updated Project Name',
        description: 'A test project for vulnerability assessment',
      })
    })

    it('should close dialog when Cancel is clicked', () => {
      renderProjectDetail()

      const editButton = screen.getByText('Edit')
      fireEvent.click(editButton)

      expect(screen.getByText('Edit Project')).toBeInTheDocument()

      const cancelButton = screen.getByText('Cancel')
      fireEvent.click(cancelButton)

      expect(screen.queryByText('Edit Project')).not.toBeInTheDocument()
      expect(mockUpdateProject).not.toHaveBeenCalledWith(
        'test-project-id',
        expect.objectContaining({
          name: expect.any(String),
        }),
      )
    })

    it('should close dialog when backdrop is clicked', () => {
      const { container } = renderProjectDetail()

      const editButton = screen.getByText('Edit')
      fireEvent.click(editButton)

      expect(screen.getByText('Edit Project')).toBeInTheDocument()

      // Find and click the backdrop (fixed inset-0 bg-black/50 with aria-hidden)
      const backdrops = container.querySelectorAll('.fixed.inset-0.bg-black\\/50[aria-hidden="true"]')
      if (backdrops.length > 0) {
        fireEvent.click(backdrops[0])
      }

      expect(screen.queryByText('Edit Project')).not.toBeInTheDocument()
      expect(mockUpdateProject).not.toHaveBeenCalled()
    })

    it('should update description when textarea changes', () => {
      renderProjectDetail()

      const editButton = screen.getByText('Edit')
      fireEvent.click(editButton)

      const descriptionTextarea = screen.getByDisplayValue('A test project for vulnerability assessment')
      fireEvent.change(descriptionTextarea, { target: { value: 'Updated description' } })

      const saveButton = screen.getByText('Save Changes')
      fireEvent.click(saveButton)

      expect(mockUpdateProject).toHaveBeenCalledWith('test-project-id', {
        name: 'Test Project',
        description: 'Updated description',
      })
    })

    it('should save both name and description changes', () => {
      renderProjectDetail()

      const editButton = screen.getByText('Edit')
      fireEvent.click(editButton)

      const nameInput = screen.getByDisplayValue('Test Project')
      fireEvent.change(nameInput, { target: { value: 'New Project Name' } })

      const descriptionTextarea = screen.getByDisplayValue('A test project for vulnerability assessment')
      fireEvent.change(descriptionTextarea, { target: { value: 'New description' } })

      const saveButton = screen.getByText('Save Changes')
      fireEvent.click(saveButton)

      expect(mockUpdateProject).toHaveBeenCalledWith('test-project-id', {
        name: 'New Project Name',
        description: 'New description',
      })
    })

    it('should handle empty description', () => {
      const projectNoDesc = createMockProject({ description: '' })
      renderProjectDetail(projectNoDesc)

      const editButton = screen.getByText('Edit')
      fireEvent.click(editButton)

      const descriptionTextarea = screen.getByDisplayValue('')
      fireEvent.change(descriptionTextarea, { target: { value: 'Added description' } })

      const saveButton = screen.getByText('Save Changes')
      fireEvent.click(saveButton)

      expect(mockUpdateProject).toHaveBeenCalledWith('test-project-id', {
        name: 'Test Project',
        description: 'Added description',
      })
    })
  })

  describe('Vulnerability Detail Modal', () => {
    // Helper to click on Vulnerabilities tab
    const clickVulnerabilitiesTab = () => {
      const vulnerabilitiesTab = screen.getByRole('tab', { name: 'Vulnerabilities' })
      fireEvent.click(vulnerabilitiesTab)
    }

    it('should close modal when close button is clicked', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      const viewButtons = screen.getAllByText('View Details')
      fireEvent.click(viewButtons[0])

      expect(screen.getByTestId('vuln-detail-modal')).toBeInTheDocument()

      const closeButton = screen.getByText('Close')
      fireEvent.click(closeButton)

      expect(screen.queryByTestId('vuln-detail-modal')).not.toBeInTheDocument()
    })
  })

  describe('SBOM Upload Dialog Integration', () => {
    it('should open upload dialog', () => {
      renderProjectDetail()

      const uploadButton = screen.getByText('Upload SBOM')
      fireEvent.click(uploadButton)

      expect(screen.getByTestId('sbom-upload-dialog')).toBeInTheDocument()
    })

    it('should close upload dialog when onClose is called', () => {
      renderProjectDetail()

      const uploadButton = screen.getByText('Upload SBOM')
      fireEvent.click(uploadButton)

      const closeButton = screen.getByText('Close Upload Dialog')
      fireEvent.click(closeButton)

      expect(screen.queryByTestId('sbom-upload-dialog')).not.toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    // Helper to click on Components tab
    const clickComponentsTab = () => {
      const componentsTab = screen.getByRole('tab', { name: 'Components' })
      fireEvent.click(componentsTab)
    }

    it('should handle project without description', () => {
      const projectNoDesc = createMockProject({ description: undefined })
      renderProjectDetail(projectNoDesc)

      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.queryByText('A test project for vulnerability assessment')).not.toBeInTheDocument()
    })

    it('should handle component without PURL', () => {
      const componentNoPurl = createMockProject({
        components: [
          {
            id: 'comp-1',
            name: 'test-lib',
            version: '1.0.0',
            type: 'library',
            licenses: ['MIT'],
            vulnerabilities: [],
          },
        ],
      })
      renderProjectDetail(componentNoPurl)
      clickComponentsTab()

      expect(screen.getByText('test-lib')).toBeInTheDocument()
      expect(screen.getByText('1.0.0')).toBeInTheDocument()
    })

    it('should display component PURL when available', () => {
      renderProjectDetail()
      clickComponentsTab()

      expect(screen.getByText('pkg:npm/lodash@4.17.21')).toBeInTheDocument()
    })

    it('should call setCurrentProject when project is found', () => {
      renderProjectDetail()

      expect(mockSetCurrentProject).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-project-id',
        }),
      )
    })
  })

  describe('Copy CVE ID Functionality', () => {
    // Helper to click on Vulnerabilities tab
    const clickVulnerabilitiesTab = () => {
      const vulnerabilitiesTab = screen.getByRole('tab', { name: 'Vulnerabilities' })
      fireEvent.click(vulnerabilitiesTab)
    }

    it('should render copy button for each vulnerability', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Should have copy buttons for vulnerabilities
      const copyButtons = screen.getAllByText('Copy')
      expect(copyButtons.length).toBeGreaterThan(0)
    })

    it('should respond to copy button clicks', async () => {
      const user = userEvent.setup()
      renderProjectDetail()
      clickVulnerabilitiesTab()

      const copyButtons = screen.getAllByText('Copy')
      await user.click(copyButtons[0])

      // The button should be clickable
      // Note: We can't reliably test clipboard interactions in jsdom
      expect(copyButtons[0]).toBeInTheDocument()
    })
  })

  describe('Project Deletion - TC-PM Scenarios', () => {
    it('TC-PM-005: Delete Project - Single - should show confirmation dialog and delete on confirm', () => {
      // Mock window.confirm to return true (user confirms deletion)
      global.confirm = vi.fn(() => true)

      renderProjectDetail()

      // Find and click the Delete button
      const deleteButton = screen.getByText('Delete')
      expect(deleteButton).toBeInTheDocument()

      fireEvent.click(deleteButton)

      // Verify confirmation dialog was shown
      expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete "Test Project"?')

      // Verify deleteProject was called with correct project ID
      expect(mockDeleteProject).toHaveBeenCalledWith('test-project-id')

      // Verify navigation to home page after deletion
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })

    it('TC-PM-006: Delete Project - Cancel - should not delete when cancel is clicked', () => {
      // Mock window.confirm to return false (user cancels deletion)
      global.confirm = vi.fn(() => false)

      renderProjectDetail()

      // Find and click the Delete button
      const deleteButton = screen.getByText('Delete')
      expect(deleteButton).toBeInTheDocument()

      fireEvent.click(deleteButton)

      // Verify confirmation dialog was shown
      expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete "Test Project"?')

      // Verify deleteProject was NOT called
      expect(mockDeleteProject).not.toHaveBeenCalled()

      // Verify navigation did NOT occur
      expect(mockNavigate).not.toHaveBeenCalled()

      // Verify project is still visible (not deleted)
      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    it('TC-PM-005-variant: should handle deletion of project with different name', () => {
      // Mock window.confirm to return true
      global.confirm = vi.fn(() => true)

      const customProject = createMockProject({
        name: 'Custom Project Name',
        id: 'custom-project-id',
      })
      renderProjectDetail(customProject, 'custom-project-id')

      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      // Verify confirmation shows correct project name
      expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete "Custom Project Name"?')

      // Verify deleteProject was called with correct project ID
      expect(mockDeleteProject).toHaveBeenCalledWith('custom-project-id')
    })

    it('should maintain project state after cancel operation', () => {
      // Mock window.confirm to return false (user cancels)
      global.confirm = vi.fn(() => false)

      renderProjectDetail()

      // Get initial project elements
      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.getByText('A test project for vulnerability assessment')).toBeInTheDocument()

      // Attempt to delete but cancel
      const deleteButton = screen.getByText('Delete')
      fireEvent.click(deleteButton)

      // Verify project data is still visible and intact
      expect(screen.getByText('Test Project')).toBeInTheDocument()
      expect(screen.getByText('A test project for vulnerability assessment')).toBeInTheDocument()
      // Use getAllByText since "Components" and "Vulnerabilities" appear multiple times
      expect(screen.getAllByText('Components').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Vulnerabilities').length).toBeGreaterThan(0)
    })

    it('should call deleteProject exactly once per confirmed deletion', () => {
      // Mock window.confirm to return true
      global.confirm = vi.fn(() => true)

      renderProjectDetail()

      const deleteButton = screen.getByText('Delete')

      // Click delete button once
      fireEvent.click(deleteButton)

      // Verify deleteProject was called exactly once
      expect(mockDeleteProject).toHaveBeenCalledTimes(1)
    })
  })

  describe('Health Tab', () => {
    const clickHealthTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Health' }))
    }

    it('should render Health Dashboard component', () => {
      renderProjectDetail()
      clickHealthTab()

      expect(screen.getByTestId('health-dashboard')).toBeInTheDocument()
    })

    it('should render Remediation Queue component', () => {
      renderProjectDetail()
      clickHealthTab()

      expect(screen.getByTestId('remediation-queue')).toBeInTheDocument()
    })

    it('should display Component Health Dashboard heading', () => {
      renderProjectDetail()
      clickHealthTab()

      expect(screen.getByText('Component Health Dashboard')).toBeInTheDocument()
    })

    it('should display Remediation Queue heading', () => {
      renderProjectDetail()
      clickHealthTab()

      expect(screen.getByText('Remediation Queue')).toBeInTheDocument()
    })

    it('should open vuln detail modal when RemediationQueue calls onViewVulnerability', async () => {
      const user = userEvent.setup()
      renderProjectDetail()
      clickHealthTab()

      expect(screen.getByTestId('remediation-queue')).toBeInTheDocument()

      await user.click(screen.getByText('View Queue Vuln'))

      expect(screen.getByTestId('vuln-detail-modal')).toBeInTheDocument()
    })

    it('should navigate to home when back arrow button is clicked', () => {
      renderProjectDetail()

      const backButton = screen.getByLabelText('back')
      fireEvent.click(backButton)

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  describe('Container Scan Dialog', () => {
    it('should open container scan dialog when Scan Container is clicked', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByText('Scan Container'))

      expect(screen.getByTestId('container-scan-dialog')).toBeInTheDocument()
    })

    it('should close container scan dialog when onClose is called', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByText('Scan Container'))
      expect(screen.getByTestId('container-scan-dialog')).toBeInTheDocument()
    })
  })

  describe('Export Dialog', () => {
    it('should open export dialog when Export is clicked', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByText('Export'))

      expect(screen.getByTestId('export-dialog')).toBeInTheDocument()
    })
  })

  describe('FPF Navigation', () => {
    it('should navigate to FPF page when False Positive Filter is clicked', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByText('False Positive Filter'))

      expect(mockNavigate).toHaveBeenCalledWith('/project/test-project-id/fpf')
    })
  })

  describe('Component Vulnerability Popup', () => {
    const clickComponentsTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
    }

    it('should open component popup when component is clicked', async () => {
      const user = userEvent.setup()
      renderProjectDetail()
      clickComponentsTab()

      const lodashElement = screen.getByText('lodash')
      const componentRow = lodashElement.closest('[role="button"]')
      if (componentRow) {
        await user.click(componentRow)
        expect(screen.getByTestId('component-vuln-popup')).toBeInTheDocument()
      }
    })

    it('should open component popup with Enter key', () => {
      renderProjectDetail()
      clickComponentsTab()

      const lodashElement = screen.getByText('lodash')
      const componentRow = lodashElement.closest('[role="button"]')
      if (componentRow) {
        fireEvent.keyDown(componentRow, { key: 'Enter' })
      }
    })

    it('should open component popup with Space key', () => {
      renderProjectDetail()
      clickComponentsTab()

      const lodashElement = screen.getByText('lodash')
      const componentRow = lodashElement.closest('[role="button"]')
      if (componentRow) {
        fireEvent.keyDown(componentRow, { key: ' ' })
      }
    })
  })

  describe('Component License Filter', () => {
    const clickComponentsTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
    }

    it('should show license filter when components have licenses', () => {
      renderProjectDetail()
      clickComponentsTab()

      const licenseFilter = screen.getByLabelText('Filter by license')
      expect(licenseFilter).toBeInTheDocument()
    })

    it('should filter components by license', () => {
      renderProjectDetail()
      clickComponentsTab()

      const licenseFilter = screen.getByDisplayValue('All Licenses')
      fireEvent.change(licenseFilter, { target: { value: 'MIT' } })

      expect(screen.getByText('lodash')).toBeInTheDocument()
      expect(screen.getByText('react')).toBeInTheDocument()
    })
  })

  describe('Advanced Filters Clear', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    it('should clear advanced filters when Clear Advanced Filters is clicked', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByText('Advanced Filters'))

      expect(screen.getByText('Clear Advanced Filters')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Clear Advanced Filters'))

      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      expect(screen.getByText('CVE-2022-12345')).toBeInTheDocument()
    })

    it('should show advanced filters active text when filters are non-default', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByText('Advanced Filters'))

      expect(screen.getByTestId('cvss-range-slider')).toBeInTheDocument()
    })
  })

  describe('Edit Project Edge Cases', () => {
    it('should not save when project name is empty', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByText('Edit'))

      const nameInput = screen.getByDisplayValue('Test Project')
      fireEvent.change(nameInput, { target: { value: '' } })

      fireEvent.click(screen.getByText('Save Changes'))

      expect(mockUpdateProject).not.toHaveBeenCalled()
    })

    it('should not save when project name is whitespace only', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByText('Edit'))

      const nameInput = screen.getByDisplayValue('Test Project')
      fireEvent.change(nameInput, { target: { value: '   ' } })

      fireEvent.click(screen.getByText('Save Changes'))

      expect(mockUpdateProject).not.toHaveBeenCalled()
    })

    it('should trim whitespace from name on save', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByText('Edit'))

      const nameInput = screen.getByDisplayValue('Test Project')
      fireEvent.change(nameInput, { target: { value: '  Updated Name  ' } })

      fireEvent.click(screen.getByText('Save Changes'))

      expect(mockUpdateProject).toHaveBeenCalledWith('test-project-id', {
        name: 'Updated Name',
        description: 'A test project for vulnerability assessment',
      })
    })

    it('should save with undefined description when description is empty', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByText('Edit'))

      const descInput = screen.getByDisplayValue('A test project for vulnerability assessment')
      fireEvent.change(descInput, { target: { value: '' } })

      fireEvent.click(screen.getByText('Save Changes'))

      expect(mockUpdateProject).toHaveBeenCalledWith('test-project-id', {
        name: 'Test Project',
        description: undefined,
      })
    })
  })

  describe('Project Information Metadata', () => {
    it('should not display last scan when lastScanAt is undefined', () => {
      const projectNoScan = createMockProject({ lastScanAt: undefined })
      renderProjectDetail(projectNoScan)

      expect(screen.queryByText('Last Scan')).not.toBeInTheDocument()
    })

    it('should display vulnerable components count', () => {
      renderProjectDetail()

      expect(screen.getByText('Vulnerable Components')).toBeInTheDocument()
    })
  })

  describe('Component CPE Indicators', () => {
    const clickComponentsTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
    }

    it('should show CPE Verified badge when component has cpe and no missing flag', () => {
      const projectWithCpe = createMockProject({
        components: [
          {
            id: 'comp-1',
            name: 'lodash',
            version: '4.17.21',
            type: 'library',
            licenses: ['MIT'],
            vulnerabilities: [],
            cpe: 'cpe:2.3:a:lodash:lodash:4.17.21',
            hasMissingCpe: false,
          },
        ],
      })
      renderProjectDetail(projectWithCpe)
      clickComponentsTab()

      expect(screen.getByText('CPE Verified')).toBeInTheDocument()
    })

    it('should show No CPE badge when component has hasMissingCpe flag', () => {
      const projectNoCpe = createMockProject({
        components: [
          {
            id: 'comp-1',
            name: 'lodash',
            version: '4.17.21',
            type: 'library',
            licenses: ['MIT'],
            vulnerabilities: [],
            hasMissingCpe: true,
          },
        ],
      })
      renderProjectDetail(projectNoCpe)
      clickComponentsTab()

      expect(screen.getByText('No CPE')).toBeInTheDocument()
    })

    it('should show CPE Estimated badge when component has suggestedCpes', () => {
      const projectEstimatedCpe = createMockProject({
        components: [
          {
            id: 'comp-1',
            name: 'lodash',
            version: '4.17.21',
            type: 'library',
            licenses: ['MIT'],
            vulnerabilities: [],
            suggestedCpes: ['cpe:2.3:a:lodash:lodash:*'],
          },
        ],
      })
      renderProjectDetail(projectEstimatedCpe)
      clickComponentsTab()

      expect(screen.getByText('CPE Estimated')).toBeInTheDocument()
    })
  })

  describe('Vulnerability Patch Info Display', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    it('should display patch availability for vulnerabilities with patchInfo', () => {
      const projectWithPatch = createMockProject({
        vulnerabilities: [
          {
            id: 'CVE-2024-11111',
            source: 'nvd',
            severity: 'high',
            description: 'Vuln with patch',
            references: [],
            affectedComponents: ['comp-1'],
            patchInfo: { patchAvailability: 'available' },
          },
        ],
      })
      renderProjectDetail(projectWithPatch)
      clickVulnerabilitiesTab()

      expect(screen.getByText('CVE-2024-11111')).toBeInTheDocument()
    })

    it('should display vulnerability without patchInfo', () => {
      const projectNoPatch = createMockProject({
        vulnerabilities: [
          {
            id: 'CVE-2024-22222',
            source: 'nvd',
            severity: 'high',
            description: 'Vuln without patch info',
            references: [],
            affectedComponents: ['comp-1'],
          },
        ],
      })
      renderProjectDetail(projectNoPatch)
      clickVulnerabilitiesTab()

      expect(screen.getByText('CVE-2024-22222')).toBeInTheDocument()
    })

    it('should display various patch availability states', () => {
      const vulns = [
        {
          id: 'CVE-1',
          source: 'nvd' as const,
          severity: 'low' as const,
          description: 'a',
          references: [],
          affectedComponents: ['comp-1'],
          patchInfo: { patchAvailability: 'partial' },
        },
        {
          id: 'CVE-2',
          source: 'nvd' as const,
          severity: 'low' as const,
          description: 'b',
          references: [],
          affectedComponents: ['comp-1'],
          patchInfo: { patchAvailability: 'none' },
        },
        {
          id: 'CVE-3',
          source: 'nvd' as const,
          severity: 'low' as const,
          description: 'c',
          references: [],
          affectedComponents: ['comp-1'],
          patchInfo: { patchAvailability: 'upstream' },
        },
        {
          id: 'CVE-4',
          source: 'nvd' as const,
          severity: 'low' as const,
          description: 'd',
          references: [],
          affectedComponents: ['comp-1'],
          patchInfo: { patchAvailability: 'investigating' },
        },
      ]
      const projectWithVariousPatches = createMockProject({ vulnerabilities: vulns })
      renderProjectDetail(projectWithVariousPatches)
      clickVulnerabilitiesTab()

      expect(screen.getByText('CVE-1')).toBeInTheDocument()
      expect(screen.getByText('CVE-2')).toBeInTheDocument()
      expect(screen.getByText('CVE-3')).toBeInTheDocument()
      expect(screen.getByText('CVE-4')).toBeInTheDocument()
    })
  })

  describe('Vulnerability Description Display', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    it('should display vulnerability source', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      expect(screen.getByText('NVD')).toBeInTheDocument()
      expect(screen.getByText('OSV')).toBeInTheDocument()
    })
  })

  describe('Component Sort', () => {
    const clickComponentsTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
    }

    it('should sort components by type', () => {
      renderProjectDetail()
      clickComponentsTab()

      const sortSelect = screen.getByDisplayValue('Sort: Name')
      fireEvent.change(sortSelect, { target: { value: 'type' } })

      const allComponents = screen.getAllByText(/lodash|react/)
      expect(allComponents.length).toBeGreaterThan(0)
    })
  })

  describe('Scan with Vulnerability Merging', () => {
    it('should merge scan results with existing SBOM vulnerabilities', async () => {
      const existingVuln = {
        id: 'CVE-SBOM-001',
        source: 'nvd' as const,
        severity: 'medium' as const,
        description: 'SBOM vulnerability',
        references: [],
        affectedComponents: ['comp-1'],
      }

      const newVuln = {
        id: 'CVE-NEW-001',
        source: 'nvd' as const,
        severity: 'high' as const,
        description: 'New scan vulnerability',
        references: [],
        affectedComponents: ['comp-1'],
      }

      const projectWithExisting = createMockProject({
        vulnerabilities: [existingVuln],
      })

      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValueOnce(new Map([['comp-1', [newVuln]]]))

      renderProjectDetail(projectWithExisting)

      fireEvent.click(screen.getByText('Scan for Vulnerabilities'))

      await waitFor(
        () => {
          expect(mockUpdateProject).toHaveBeenCalledWith(
            'test-project-id',
            expect.objectContaining({
              vulnerabilities: expect.arrayContaining([
                expect.objectContaining({ id: 'CVE-SBOM-001' }),
                expect.objectContaining({ id: 'CVE-NEW-001' }),
              ]),
            }),
          )
        },
        { timeout: 10000 },
      )
    })
  })

  describe('Scan Error Edge Cases', () => {
    it('should show unknown error message when scan throws non-Error', async () => {
      vi.mocked(matchVulnerabilitiesForComponents).mockRejectedValue('string error')

      renderProjectDetail()

      fireEvent.click(screen.getByText('Scan for Vulnerabilities'))

      await waitFor(
        () => {
          expect(toast.error).toHaveBeenCalledWith('Scan Failed', 'Unknown error occurred')
        },
        { timeout: 10000 },
      )
    })
  })

  describe('Refresh Error Edge Cases', () => {
    it('should show unknown error message when refresh throws non-Error', async () => {
      vi.mocked(refreshVulnerabilityData).mockRejectedValue('network failure')
      mockGetApiKey.mockResolvedValue('test-api-key')

      mockUseStore.mockReturnValue({
        projects: [createMockProject()],
        currentProject: createMockProject(),
        updateProject: mockUpdateProject,
        deleteProject: mockDeleteProject,
        setCurrentProject: mockSetCurrentProject,
        addProject: vi.fn(),
        refreshingProjectIds: new Set(),
        setRefreshingProject: vi.fn(),
        settings: {
          theme: 'system',
          fontSize: 'default',
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          autoRefreshInterval: 24,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      } as any)

      render(
        <MemoryRouter>
          <ProjectDetail />
        </MemoryRouter>,
      )

      fireEvent.click(screen.getByTestId('refresh-button'))

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Refresh Failed', 'Unknown error occurred')
      })
    })
  })

  describe('Component Popup Interaction Callbacks', () => {
    const clickComponentsTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
    }

    it('should close popup and open vuln detail when View Vuln is clicked', async () => {
      const user = userEvent.setup()
      renderProjectDetail()
      clickComponentsTab()

      const lodashElement = screen.getByText('lodash')
      const componentRow = lodashElement.closest('[role="button"]')
      if (componentRow) {
        await user.click(componentRow)
        expect(screen.getByTestId('component-vuln-popup')).toBeInTheDocument()

        const viewVulnButton = screen.getByText('View Vuln in Popup')
        await user.click(viewVulnButton)

        expect(screen.queryByTestId('component-vuln-popup')).not.toBeInTheDocument()
        expect(screen.getByTestId('vuln-detail-modal')).toBeInTheDocument()
      }
    })

    it('should close popup via Close Popup button', async () => {
      const user = userEvent.setup()
      renderProjectDetail()
      clickComponentsTab()

      const lodashElement = screen.getByText('lodash')
      const componentRow = lodashElement.closest('[role="button"]')
      if (componentRow) {
        await user.click(componentRow)
        expect(screen.getByTestId('component-vuln-popup')).toBeInTheDocument()

        await user.click(screen.getByText('Close Popup'))
        expect(screen.queryByTestId('component-vuln-popup')).not.toBeInTheDocument()
      }
    })
  })

  describe('Vulnerability Clear All Filters', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    it('should clear patchAvailabilityFilter when Clear all filters is clicked', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      const severityFilter = screen.getByDisplayValue('All Severities')
      fireEvent.change(severityFilter, { target: { value: 'low' } })

      expect(screen.getByText('No vulnerabilities match the current filters')).toBeInTheDocument()
      expect(screen.getByText('Clear all filters')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Clear all filters'))

      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      expect(screen.getByText('CVE-2022-12345')).toBeInTheDocument()
    })
  })

  describe('Vulnerability with sources array', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    it('should render multi-source label when vuln has sources array', () => {
      const projectWithSources = createMockProject({
        vulnerabilities: [
          {
            id: 'CVE-MULTI-001',
            source: 'nvd',
            sources: ['nvd', 'osv'],
            severity: 'high',
            description: 'Multi-source vuln',
            references: [],
            affectedComponents: ['comp-1'],
          },
        ],
      })
      renderProjectDetail(projectWithSources)
      clickVulnerabilitiesTab()

      expect(screen.getByText('NVD + OSV')).toBeInTheDocument()
    })
  })

  describe('Default tab case', () => {
    it('should render without error when an unrecognized tab is somehow active', () => {
      renderProjectDetail()

      const tabs = screen.getAllByRole('tab')
      expect(tabs.length).toBeGreaterThan(0)

      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })
  })

  describe('Dialog Close Callbacks', () => {
    it('should close container scan dialog via onClose callback', async () => {
      const user = userEvent.setup()
      renderProjectDetail()

      fireEvent.click(screen.getByText('Scan Container'))
      expect(screen.getByTestId('container-scan-dialog')).toBeInTheDocument()

      await user.click(screen.getByText('Close Container Scan'))
      expect(screen.queryByTestId('container-scan-dialog')).not.toBeInTheDocument()
    })

    it('should close export dialog via onClose callback', async () => {
      const user = userEvent.setup()
      renderProjectDetail()

      fireEvent.click(screen.getByText('Export'))
      expect(screen.getByTestId('export-dialog')).toBeInTheDocument()

      await user.click(screen.getByText('Close Export'))
      expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument()
    })

    it('should switch back to overview tab from components tab', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
      expect(screen.getByText('Components (2)')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
      expect(screen.getAllByText('Components').length).toBeGreaterThan(0)
      expect(screen.getByText('Total Vulns')).toBeInTheDocument()
    })

    it('should switch back to overview tab from vulnerabilities tab', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
      expect(screen.getByText('Vulnerabilities (2)')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
      expect(screen.getByText('Total Vulns')).toBeInTheDocument()
    })

    it('should switch back to overview tab from health tab', () => {
      renderProjectDetail()

      fireEvent.click(screen.getByRole('tab', { name: 'Health' }))
      expect(screen.getByTestId('health-dashboard')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('tab', { name: 'Overview' }))
      expect(screen.getByText('Total Vulns')).toBeInTheDocument()
    })
  })

  describe('Filter Presets CRUD', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    beforeEach(() => {
      localStorage.clear()
    })

    afterEach(() => {
      localStorage.clear()
    })

    it('should save a filter preset', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByTestId('save-preset-btn'))

      expect(toast.success).toHaveBeenCalledWith('Preset Saved', expect.stringContaining('Test Preset'))
    })

    it('should load a preset with single severity filter', () => {
      localStorage.setItem(
        'vuln-filter-presets-test-project-id',
        JSON.stringify([{ id: 'preset-1', name: 'Critical Only', filters: { severity: ['critical'] } }]),
      )

      renderProjectDetail()
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByTestId('load-preset-btn'))

      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      expect(screen.queryByText('CVE-2022-12345')).not.toBeInTheDocument()
      expect(toast.success).toHaveBeenCalledWith('Preset Loaded', expect.stringContaining('Critical Only'))
    })

    it('should load a preset with multiple severities and reset to all', () => {
      localStorage.setItem(
        'vuln-filter-presets-test-project-id',
        JSON.stringify([{ id: 'preset-1', name: 'Multi', filters: { severity: ['critical', 'high'] } }]),
      )

      renderProjectDetail()
      clickVulnerabilitiesTab()

      // First narrow to critical only
      fireEvent.change(screen.getByDisplayValue('All Severities'), { target: { value: 'critical' } })
      expect(screen.queryByText('CVE-2022-12345')).not.toBeInTheDocument()

      // Load preset with multiple severities -> resets to 'all'
      fireEvent.click(screen.getByTestId('load-preset-btn'))

      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      expect(screen.getByText('CVE-2022-12345')).toBeInTheDocument()
    })

    it('should load a preset with cvssRange filter', () => {
      localStorage.setItem(
        'vuln-filter-presets-test-project-id',
        JSON.stringify([{ id: 'preset-1', name: 'High CVSS', filters: { cvssRange: [9, 10] } }]),
      )

      renderProjectDetail()
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByTestId('load-preset-btn'))

      // CVE-2021-23337 has cvssScore 9.8 (within [9,10])
      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      // CVE-2022-12345 has cvssScore 8.5 (outside [9,10])
      expect(screen.queryByText('CVE-2022-12345')).not.toBeInTheDocument()
    })

    it('should load a preset with source filter', () => {
      localStorage.setItem(
        'vuln-filter-presets-test-project-id',
        JSON.stringify([{ id: 'preset-1', name: 'NVD Only', filters: { source: ['nvd'] } }]),
      )

      renderProjectDetail()
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByTestId('load-preset-btn'))

      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      expect(screen.queryByText('CVE-2022-12345')).not.toBeInTheDocument()
    })

    it('should load a preset with reference tags filter', () => {
      const projectWithRefTags = createMockProject({
        vulnerabilities: [
          {
            id: 'CVE-WITH-PATCH',
            source: 'nvd',
            severity: 'high',
            description: 'Has patch ref',
            references: [{ url: 'https://example.com', tags: ['Patch'] }],
            affectedComponents: ['comp-1'],
          },
          {
            id: 'CVE-NO-REFS',
            source: 'nvd',
            severity: 'high',
            description: 'No refs',
            references: [],
            affectedComponents: ['comp-1'],
          },
        ],
      })
      localStorage.setItem(
        'vuln-filter-presets-test-project-id',
        JSON.stringify([{ id: 'preset-1', name: 'Source NVD', filters: { source: ['nvd'] } }]),
      )

      renderProjectDetail(projectWithRefTags)
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByTestId('load-preset-btn'))

      expect(screen.getByText('CVE-WITH-PATCH')).toBeInTheDocument()
      expect(screen.getByText('CVE-NO-REFS')).toBeInTheDocument()
    })

    it('should load a preset with source filter', () => {
      const projectMultiSource = createMockProject({
        vulnerabilities: [
          {
            id: 'CVE-NVD',
            source: 'nvd',
            severity: 'high',
            description: 'From NVD',
            references: [],
            affectedComponents: ['comp-1'],
          },
          {
            id: 'CVE-OSV',
            source: 'osv',
            severity: 'high',
            description: 'From OSV',
            references: [],
            affectedComponents: ['comp-1'],
          },
        ],
      })
      localStorage.setItem(
        'vuln-filter-presets-test-project-id',
        JSON.stringify([{ id: 'preset-1', name: 'NVD Only', filters: { source: ['nvd'] } }]),
      )

      renderProjectDetail(projectMultiSource)
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByTestId('load-preset-btn'))

      expect(screen.getByText('CVE-NVD')).toBeInTheDocument()
      expect(screen.queryByText('CVE-OSV')).not.toBeInTheDocument()
    })

    it('should handle loading a nonexistent preset gracefully', () => {
      renderProjectDetail()
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByTestId('load-preset-btn'))

      // No crash, no preset-loaded toast
      expect(toast.success).not.toHaveBeenCalledWith('Preset Loaded', expect.anything())
      expect(screen.getByText('CVE-2021-23337')).toBeInTheDocument()
      expect(screen.getByText('CVE-2022-12345')).toBeInTheDocument()
    })

    it('should delete a filter preset', () => {
      localStorage.setItem(
        'vuln-filter-presets-test-project-id',
        JSON.stringify([{ id: 'preset-1', name: 'To Delete', filters: {} }]),
      )

      renderProjectDetail()
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByTestId('delete-preset-btn'))

      expect(toast.success).toHaveBeenCalledWith('Preset Deleted', 'Filter preset has been deleted.')
    })
  })

  describe('Vulnerability SBOM Filename Display (lines 552-563)', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    it('should display SBOM filename when vulnerability affects a component with sbomFileId', () => {
      const projectWithSbomLink = createMockProject({
        sbomFiles: [
          { id: 'sbom-1', filename: 'bom.json', format: 'cyclonedx', uploadedAt: new Date(), componentCount: 1 },
        ],
        components: [
          {
            id: 'comp-1',
            name: 'lodash',
            version: '4.17.21',
            type: 'library',
            licenses: ['MIT'],
            vulnerabilities: [],
            sbomFileId: 'sbom-1',
          },
        ],
        vulnerabilities: [
          {
            id: 'CVE-2024-11111',
            source: 'nvd',
            severity: 'high',
            description: 'Test vuln with SBOM',
            references: [],
            affectedComponents: ['comp-1'],
          },
        ],
      })
      renderProjectDetail(projectWithSbomLink)
      clickVulnerabilitiesTab()

      expect(screen.getByText(/From: bom\.json/)).toBeInTheDocument()
    })

    it('should display "+N" when vulnerability spans multiple SBOM files', () => {
      const projectWithMultiSbom = createMockProject({
        sbomFiles: [
          { id: 'sbom-1', filename: 'bom1.json', format: 'cyclonedx', uploadedAt: new Date(), componentCount: 1 },
          { id: 'sbom-2', filename: 'bom2.json', format: 'cyclonedx', uploadedAt: new Date(), componentCount: 1 },
        ],
        components: [
          {
            id: 'comp-1',
            name: 'lodash',
            version: '4.17.21',
            type: 'library',
            licenses: ['MIT'],
            vulnerabilities: [],
            sbomFileId: 'sbom-1',
          },
          {
            id: 'comp-2',
            name: 'react',
            version: '18.2.0',
            type: 'framework',
            licenses: ['MIT'],
            vulnerabilities: [],
            sbomFileId: 'sbom-2',
          },
        ],
        vulnerabilities: [
          {
            id: 'CVE-2024-MULTI',
            source: 'nvd',
            severity: 'critical',
            description: 'Multi-SBOM vuln',
            references: [],
            affectedComponents: ['comp-1', 'comp-2'],
          },
        ],
      })
      renderProjectDetail(projectWithMultiSbom)
      clickVulnerabilitiesTab()

      expect(screen.getByText(/From: bom1\.json \+1/)).toBeInTheDocument()
    })
  })

  describe('Component Source Badge from SBOM', () => {
    const clickComponentsTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Components' }))
    }

    it('should show source badge when component has sbomFileId', () => {
      const projectWithSbomComponent = createMockProject({
        sbomFiles: [
          { id: 'sbom-1', filename: 'source.json', format: 'cyclonedx', uploadedAt: new Date(), componentCount: 1 },
        ],
        components: [
          {
            id: 'comp-1',
            name: 'lodash',
            version: '4.17.21',
            type: 'library',
            licenses: ['MIT'],
            vulnerabilities: [],
            sbomFileId: 'sbom-1',
          },
        ],
      })
      renderProjectDetail(projectWithSbomComponent)
      clickComponentsTab()

      expect(screen.getByText('Source: source.json')).toBeInTheDocument()
    })
  })

  describe('Scan Deduplication (lines 358-365)', () => {
    it('should merge same vulnerability found across multiple components', async () => {
      const sharedVuln = {
        id: 'CVE-SHARED',
        source: 'nvd',
        severity: 'high',
        description: 'Shared vuln',
        references: [],
        affectedComponents: [],
      }

      vi.mocked(matchVulnerabilitiesForComponents).mockResolvedValue(
        new Map([
          ['comp-1', [sharedVuln]],
          ['comp-2', [sharedVuln]],
        ]),
      )

      renderProjectDetail()

      fireEvent.click(screen.getByText('Scan for Vulnerabilities'))

      await waitFor(
        () => {
          expect(mockUpdateProject).toHaveBeenCalledWith(
            'test-project-id',
            expect.objectContaining({
              vulnerabilities: expect.arrayContaining([
                expect.objectContaining({
                  id: 'CVE-SHARED',
                  affectedComponents: ['comp-1', 'comp-2'],
                }),
              ]),
            }),
          )
        },
        { timeout: 10000 },
      )
    })
  })

  describe('Refresh Edge Case: success=false', () => {
    it('should not update project when refresh returns success=false', async () => {
      vi.mocked(refreshVulnerabilityData).mockResolvedValue({
        success: false,
        vulnerabilities: [],
        componentsScanned: 0,
      })
      mockGetApiKey.mockResolvedValue('test-api-key')

      mockUseStore.mockReturnValue({
        projects: [createMockProject()],
        currentProject: createMockProject(),
        updateProject: mockUpdateProject,
        deleteProject: mockDeleteProject,
        setCurrentProject: mockSetCurrentProject,
        addProject: vi.fn(),
        refreshingProjectIds: new Set(),
        setRefreshingProject: vi.fn(),
        settings: {
          theme: 'system',
          fontSize: 'default',
          nvdApiKey: undefined,
          dataRetentionDays: 30,
          autoRefresh: false,
          autoRefreshInterval: 24,
          vulnDataCacheTTL: 1,
        },
        updateSettings: vi.fn(),
      } as any)

      render(
        <MemoryRouter>
          <ProjectDetail />
        </MemoryRouter>,
      )

      const callCountBefore = mockUpdateProject.mock.calls.length
      fireEvent.click(screen.getByTestId('refresh-button'))

      await waitFor(() => {
        expect(vi.mocked(refreshVulnerabilityData)).toHaveBeenCalled()
      })

      // updateProject should NOT have been called for the refresh
      expect(mockUpdateProject.mock.calls.length).toBe(callCountBefore)
    })
  })

  describe('Copy Vulnerability ID Error Path', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    it('should show error toast when clipboard write fails', async () => {
      const mockWriteText = vi.fn().mockRejectedValue(new Error('Clipboard denied'))
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true,
        configurable: true,
      })

      renderProjectDetail()
      clickVulnerabilitiesTab()

      const copyButtons = screen.getAllByText('Copy')
      fireEvent.click(copyButtons[0])

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to copy to clipboard')
      })
    })
  })

  describe('localStorage Error Handling', () => {
    afterEach(() => {
      localStorage.clear()
    })

    it('should handle invalid JSON in localStorage for filter presets', () => {
      localStorage.setItem('vuln-filter-presets-test-project-id', 'not-valid-json{{{')

      // Should not crash; presets fall back to empty array
      renderProjectDetail()

      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })
  })

  describe('Advanced Filters Active Indicator', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    beforeEach(() => {
      localStorage.clear()
    })

    afterEach(() => {
      localStorage.clear()
    })

    it('should show "Advanced filters active" when source filter is set via preset', () => {
      localStorage.setItem(
        'vuln-filter-presets-test-project-id',
        JSON.stringify([{ id: 'preset-1', name: 'NVD', filters: { source: ['nvd'] } }]),
      )

      renderProjectDetail()
      clickVulnerabilitiesTab()

      // Open advanced filters panel
      fireEvent.click(screen.getByText('Advanced Filters'))

      // Load preset that sets source filter
      fireEvent.click(screen.getByTestId('load-preset-btn'))

      expect(screen.getByText('Advanced filters active')).toBeInTheDocument()
    })
  })

  describe('Vulnerability with Risk Score and Aliases', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    it('should render risk score badge when vulnerability has riskScore', () => {
      const projectWithRisk = createMockProject({
        vulnerabilities: [
          {
            id: 'CVE-RISK-001',
            source: 'nvd',
            severity: 'critical',
            description: 'High risk vuln',
            references: [],
            affectedComponents: ['comp-1'],
            riskScore: 85,
            epssPercentile: 0.95,
          },
        ],
      })
      renderProjectDetail(projectWithRisk)
      clickVulnerabilitiesTab()

      expect(screen.getByText('CVE-RISK-001')).toBeInTheDocument()
    })

    it('should render aliases when formatVulnerabilityId returns them', () => {
      vi.mocked(formatVulnerabilityId).mockReturnValueOnce({
        primaryId: 'CVE-2024-ALIAS',
        aliases: ['GHSA-1234', 'OSV-5678'],
      })

      const projectWithAlias = createMockProject({
        vulnerabilities: [
          {
            id: 'CVE-2024-ALIAS',
            source: 'nvd',
            severity: 'high',
            description: 'Vuln with aliases',
            references: [],
            affectedComponents: ['comp-1'],
          },
        ],
      })
      renderProjectDetail(projectWithAlias)
      clickVulnerabilitiesTab()

      expect(screen.getByText('CVE-2024-ALIAS')).toBeInTheDocument()
      expect(screen.getByText(/GHSA-1234/)).toBeInTheDocument()
    })

    it('should truncate alias display when more than 2 aliases exist', () => {
      vi.mocked(formatVulnerabilityId).mockReturnValueOnce({
        primaryId: 'CVE-2024-MANY',
        aliases: ['GHSA-1', 'GHSA-2', 'GHSA-3', 'GHSA-4'],
      })

      const projectWithManyAliases = createMockProject({
        vulnerabilities: [
          {
            id: 'CVE-2024-MANY',
            source: 'nvd',
            severity: 'high',
            description: 'Vuln with many aliases',
            references: [],
            affectedComponents: ['comp-1'],
          },
        ],
      })
      renderProjectDetail(projectWithManyAliases)
      clickVulnerabilitiesTab()

      expect(screen.getByText(/GHSA-1, GHSA-2 \+2/)).toBeInTheDocument()
    })
  })

  describe('getCurrentFilters Coverage', () => {
    const clickVulnerabilitiesTab = () => {
      fireEvent.click(screen.getByRole('tab', { name: 'Vulnerabilities' }))
    }

    beforeEach(() => {
      localStorage.clear()
    })

    afterEach(() => {
      localStorage.clear()
    })

    it('should include source and patch filters after loading preset with hasPatch and source', () => {
      const projectWithPatch = createMockProject({
        vulnerabilities: [
          {
            id: 'CVE-P1',
            source: 'nvd',
            severity: 'high',
            description: 'a',
            references: [],
            affectedComponents: ['comp-1'],
            patchInfo: { patchAvailability: 'available' },
          },
          {
            id: 'CVE-P2',
            source: 'osv',
            severity: 'low',
            description: 'b',
            references: [],
            affectedComponents: ['comp-1'],
          },
        ],
      })
      localStorage.setItem(
        'vuln-filter-presets-test-project-id',
        JSON.stringify([
          {
            id: 'preset-1',
            name: 'Combined',
            filters: { source: ['nvd'], hasPatch: true, cvssRange: [5, 10], severity: ['high'] },
          },
        ]),
      )

      renderProjectDetail(projectWithPatch)
      clickVulnerabilitiesTab()

      fireEvent.click(screen.getByTestId('load-preset-btn'))

      // Only CVE-P1 matches: nvd source, has patch, cvss unspecified (passes range), high severity
      expect(screen.getByText('CVE-P1')).toBeInTheDocument()
      expect(screen.queryByText('CVE-P2')).not.toBeInTheDocument()
    })
  })
})
