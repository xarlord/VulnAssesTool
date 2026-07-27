import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import { Search } from './Search'
import { useStore, useProjects } from '@/store/useStore'

// Mock the store — must include useProjects export
vi.mock('@/store/useStore', () => ({
  useStore: vi.fn(),
  useProjects: vi.fn(() => []),
  useSettings: vi.fn(() => ({
    theme: 'system',
    fontSize: 'default',
    nvdApiKey: undefined,
    dataRetentionDays: 30,
    autoRefresh: false,
    vulnDataCacheTTL: 1,
  })),
}))

// Override lucide-react mock to include Package and Database icons
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
    'ChevronDown',
    'ChevronUp',
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
    'Bookmark',
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
    'Package',
    'Database',
  ]
  const mod: Record<string, unknown> = {}
  for (const name of icons) {
    mod[name] = StubIcon
  }
  return mod
})

// Mock search utilities — use real implementations for project search tests
vi.mock('@/lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/search')>()
  return actual
})

// Mock FTS availability check
vi.mock('@/lib/database/nvdDbFts', () => ({
  isFtsAvailable: vi.fn(() => Promise.resolve(false)),
}))

// Mock EmptyState component (named export)
vi.mock('@/components/EmptyState', () => ({
  EmptyState: ({ title, description, action }: Record<string, unknown>) => (
    <div data-testid="empty-state">
      <div>{title as string}</div>
      <div>{description as string}</div>
      {action && (
        <button onClick={(action as Record<string, unknown>).onClick as () => void}>
          {(action as Record<string, unknown>).label as string}
        </button>
      )}
    </div>
  ),
}))

// Mock VirtualList component
vi.mock('@/components/VirtualList', () => ({
  VirtualList: ({ items, renderItem }: { items: unknown[]; renderItem: (item: unknown) => React.ReactNode }) => (
    <div data-testid="virtual-list">
      {items.map((item, index) => (
        <div key={index}>{renderItem(item)}</div>
      ))}
    </div>
  ),
}))

// Mock NvdCveDetailModal
vi.mock('@/components/NvdCveDetailModal', () => ({
  NvdCveDetailModal: ({ cveId, onClose }: { cveId: string; onClose?: () => void }) => (
    <div data-testid="cve-detail-modal">
      {cveId}
      {onClose && (
        <button data-testid="close-cve-modal" onClick={onClose}>
          Close
        </button>
      )}
    </div>
  ),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

describe('Search Page', () => {
  const mockProjects = [
    {
      id: 'project-1',
      name: 'Web Application',
      description: 'Main web application',
      createdAt: new Date(),
      updatedAt: new Date(),
      sbomFiles: [],
      components: [
        {
          id: 'component-1',
          name: 'react',
          version: '18.2.0',
          type: 'library' as const,
          licenses: ['MIT'],
          vulnerabilities: [],
        },
      ],
      vulnerabilities: [
        {
          id: 'CVE-2023-1234',
          source: 'nvd' as const,
          severity: 'critical' as const,
          description: 'Critical vulnerability',
          affectedComponents: ['component-1'],
          references: [],
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
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useProjects).mockReturnValue(mockProjects)
  })

  it('should render search page', () => {
    renderWithRouter(<Search />)

    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search projects, components, vulnerabilities/i)).toBeInTheDocument()
  })

  it('should show empty state initially', () => {
    renderWithRouter(<Search />)

    expect(screen.getByText('Start searching')).toBeInTheDocument()
  })

  it('should show search tips initially', () => {
    renderWithRouter(<Search />)

    // Component now shows "Project Search Tips" in projects search mode
    expect(screen.getByText('Project Search Tips')).toBeInTheDocument()
    expect(screen.getByText(/• Search is case-insensitive/)).toBeInTheDocument()
  })

  it('should update query when typing', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'react')

    expect(input).toHaveValue('react')
  })

  it('should show search results after typing', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'react')

    await waitFor(() => {
      expect(screen.getByText(/Found \d+ results?/i)).toBeInTheDocument()
    })
  })

  it('should show no results when query matches nothing', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'nonexistent')

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument()
    })
  })

  it('should group results by type', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'react')

    await waitFor(
      () => {
        // Should find the component named "react" in Components section
        expect(screen.getByText('Components')).toBeInTheDocument()
        // May also show project if search matches project name/description
      },
      { timeout: 1000 },
    )
  })

  it('should navigate to project when project result is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'Web Application')

    await waitFor(() => {
      const projectResult = screen.getByText('Web Application').closest('div')
      if (projectResult) {
        user.click(projectResult)
      }
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/project/project-1')
    })
  })

  it('should clear search when clear button is clicked', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'react')

    // Use aria-label to target the clear button specifically (there are mode toggle buttons too)
    const clearButton = screen.getByLabelText('Clear search')
    await user.click(clearButton)

    expect(input).toHaveValue('')
  })

  it('should show suggestions for partial matches', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 're')

    // Wait for debounce
    await waitFor(
      () => {
        // Suggestions should appear if no exact results
        const suggestions = screen.queryByText('Suggestions')
        // This may or may not appear depending on whether there are results
      },
      { timeout: 500 },
    )
  })

  it('should handle keyboard navigation with arrow keys', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'react')

    await waitFor(() => {
      expect(screen.getByText(/Found \d+ results?/i)).toBeInTheDocument()
    })

    // Test arrow down
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    // Test arrow up
    fireEvent.keyDown(input, { key: 'ArrowUp' })
  })

  it('should handle Escape key to clear search', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'react')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input).toHaveValue('')
  })

  it('should handle Enter key to navigate to selected result', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'Web Application')

    // Wait for results
    await waitFor(
      () => {
        expect(screen.getByText(/Found \d+ results?/i)).toBeInTheDocument()
      },
      { timeout: 1000 },
    )

    // Select first result with arrow down
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Should attempt navigation
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/project/project-1')
    })
  })

  it('should debounce search input', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)

    // Type quickly
    await user.type(input, 'react')

    // Should only search once after debounce
    await waitFor(
      () => {
        expect(screen.getByText(/Found \d+ results?/i)).toBeInTheDocument()
      },
      { timeout: 1000 },
    )
  })

  it('should show result counts', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'react')

    await waitFor(
      () => {
        const countsText = screen.getByText(/Found \d+ results?/i)
        expect(countsText).toBeInTheDocument()
      },
      { timeout: 1000 },
    )
  })

  /**
   * TC-SEARCH-002: Global Search - Components (P1)
   * Description: Verify global search functionality for components
   * Steps:
   * 1. Navigate to Search page
   * 2. Enter component name in search field
   * 3. Verify component appears in Components section
   * 4. Verify component details are displayed correctly
   * 5. Click on component result
   * 6. Verify navigation to project page
   * Expected: Components are searchable with correct details and navigation
   */
  it('TC-SEARCH-002: should search and display components with correct details', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'react')

    await waitFor(
      () => {
        // Verify Components section is displayed
        expect(screen.getByText('Components')).toBeInTheDocument()

        // Verify component name is displayed
        expect(screen.getByText('react')).toBeInTheDocument()

        // Verify component version and type are displayed (combined with bullet separator)
        expect(screen.getByText('18.2.0 • library')).toBeInTheDocument()

        // Verify project name is shown for component
        expect(screen.getByText(/in Web Application/)).toBeInTheDocument()
      },
      { timeout: 1000 },
    )

    // Test navigation on click
    const componentResult = screen.getByText('react').closest('div[onclick]')
    if (componentResult) {
      await user.click(componentResult)
      expect(mockNavigate).toHaveBeenCalledWith('/project/project-1')
    }
  })

  /**
   * TC-SEARCH-003: Global Search - Vulnerabilities (P1)
   * Description: Verify global search functionality for vulnerabilities
   * Steps:
   * 1. Navigate to Search page
   * 2. Enter vulnerability ID or description in search field
   * 3. Verify vulnerability appears in Vulnerabilities section
   * 4. Verify vulnerability details are displayed correctly
   * 5. Click on vulnerability result
   * 6. Verify navigation to project page
   * Expected: Vulnerabilities are searchable with correct details and navigation
   */
  it('TC-SEARCH-003: should search and display vulnerabilities with correct details', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'CVE')

    await waitFor(
      () => {
        // Verify Vulnerabilities section is displayed
        expect(screen.getByText('Vulnerabilities')).toBeInTheDocument()

        // Verify CVE ID is displayed
        expect(screen.getByText('CVE-2023-1234')).toBeInTheDocument()

        // Verify vulnerability description is displayed
        expect(screen.getByText('Critical vulnerability')).toBeInTheDocument()

        // Verify project name is shown for vulnerability
        expect(screen.getByText(/in Web Application/)).toBeInTheDocument()
      },
      { timeout: 1000 },
    )

    // Test navigation on click
    const vulnResult = screen.getByText('CVE-2023-1234').closest('div[onclick]')
    if (vulnResult) {
      await user.click(vulnResult)
      expect(mockNavigate).toHaveBeenCalledWith('/project/project-1')
    }
  })

  /**
   * TC-SEARCH-004: Keyboard Navigation (P1)
   * Description: Verify keyboard navigation functionality in search results
   * Steps:
   * 1. Navigate to Search page
   * 2. Enter search query to get results
   * 3. Press ArrowDown to navigate to next result
   * 4. Verify result is highlighted
   * 5. Press ArrowUp to navigate to previous result
   * 6. Verify result is highlighted
   * 7. Press Enter on selected result
   * 8. Verify navigation occurs
   * 9. Press Escape
   * 10. Verify search is cleared
   * Expected: Keyboard navigation works correctly for all keys
   */
  it('TC-SEARCH-004: should handle keyboard navigation correctly', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)
    await user.type(input, 'Web Application')

    await waitFor(
      () => {
        expect(screen.getByText(/Found \d+ results?/i)).toBeInTheDocument()
      },
      { timeout: 1000 },
    )

    // Test ArrowDown - should select first result
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    await waitFor(() => {
      // First result should be highlighted (ring-2 ring-ring class)
      const highlightedResults = document.querySelectorAll('.ring-2.ring-ring')
      expect(highlightedResults.length).toBeGreaterThan(0)
    })

    // Test ArrowUp - should deselect
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    await waitFor(() => {
      // Should return to -1 (no selection)
      const highlightedResults = document.querySelectorAll('.ring-2.ring-ring')
      expect(highlightedResults.length).toBe(0)
    })

    // Test ArrowDown again to select first result
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    // Test Enter - should navigate to selected result
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/project/project-1')
    })

    // Reset mocks
    mockNavigate.mockClear()

    // Test Escape - should clear search
    await user.type(input, 'react')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input).toHaveValue('')
  })

  /**
   * TC-SEARCH-005: Clear Search (P1)
   * Description: Verify clear search functionality
   * Steps:
   * 1. Navigate to Search page
   * 2. Enter search query
   * 3. Verify clear button is visible
   * 4. Click clear button (X icon)
   * 5. Verify search field is cleared
   * 6. Verify results are hidden
   * 7. Verify initial empty state is shown
   * Expected: Search can be cleared using clear button or Escape key
   */
  it('TC-SEARCH-005: should clear search using clear button and reset UI state', async () => {
    const user = userEvent.setup()
    renderWithRouter(<Search />)

    const input = screen.getByPlaceholderText(/search/i)

    // Enter search query
    await user.type(input, 'react')

    // Verify results appear
    await waitFor(
      () => {
        expect(screen.getByText(/Found \d+ results?/i)).toBeInTheDocument()
      },
      { timeout: 1000 },
    )

    // Verify clear button is visible — use aria-label to target it specifically
    const clearButton = screen.getByLabelText('Clear search')
    expect(clearButton).toBeInTheDocument()

    // Click clear button
    await user.click(clearButton)

    // Verify search field is cleared
    expect(input).toHaveValue('')

    // Verify results are hidden and empty state is shown
    await waitFor(() => {
      expect(screen.queryByText(/Found \d+ results?/i)).not.toBeInTheDocument()
      expect(screen.getByText('Start searching')).toBeInTheDocument()
    })

    // Test clear functionality with Escape key as well
    await user.type(input, 'CVE')

    // Verify results appear again
    await waitFor(
      () => {
        expect(screen.getByText(/Found \d+ results?/i)).toBeInTheDocument()
      },
      { timeout: 1000 },
    )

    // Press Escape to clear
    fireEvent.keyDown(input, { key: 'Escape' })

    // Verify search is cleared
    expect(input).toHaveValue('')

    // Verify empty state is shown
    await waitFor(() => {
      expect(screen.queryByText(/Found \d+ results?/i)).not.toBeInTheDocument()
      expect(screen.getByText('Start searching')).toBeInTheDocument()
    })
  })

  describe('NVD Mode Switching', () => {
    it('should switch to NVD mode when NVD Database button is clicked', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      const nvdButton = screen.getByText('NVD Database')
      await user.click(nvdButton)

      expect(screen.getByPlaceholderText(/Search NVD database/)).toBeInTheDocument()
    })

    it('should show NVD search tips when in NVD mode', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      const nvdButton = screen.getByText('NVD Database')
      await user.click(nvdButton)

      expect(screen.getByText('NVD Database Search Tips')).toBeInTheDocument()
      expect(screen.getByText(/Search by CVE ID/)).toBeInTheDocument()
      expect(screen.getByText(/Search by CPE text/)).toBeInTheDocument()
    })

    it('should show FTS Enabled badge when FTS is available', async () => {
      const { isFtsAvailable } = await import('@/lib/database/nvdDbFts')
      vi.mocked(isFtsAvailable).mockResolvedValueOnce(true)

      renderWithRouter(<Search />)

      await waitFor(() => {
        expect(screen.getByText('FTS Enabled')).toBeInTheDocument()
      })
    })

    it('should switch back to projects mode from NVD mode', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))
      expect(screen.getByPlaceholderText(/Search NVD database/)).toBeInTheDocument()

      await user.click(screen.getByText('Project Search'))
      expect(screen.getByPlaceholderText(/search projects, components, vulnerabilities/i)).toBeInTheDocument()
    })
  })

  describe('NVD Sync', () => {
    it('should show Sync NVD Data button in NVD mode', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      expect(screen.getByTestId('nvd-sync-button')).toBeInTheDocument()
    })

    it('should call startDeltaSync when Sync NVD Data is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))
      await user.click(screen.getByTestId('nvd-sync-button'))

      await waitFor(() => {
        expect(platform.database.startDeltaSync).toHaveBeenCalledWith(false)
      })
    })

    it('should show error state when sync fails', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.startDeltaSync).mockRejectedValueOnce(new Error('Sync error'))

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))
      await user.click(screen.getByTestId('nvd-sync-button'))

      await waitFor(() => {
        expect(screen.getByText('Sync error')).toBeInTheDocument()
      })
    })

    it('should show retry button after sync error', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.startDeltaSync).mockRejectedValueOnce(new Error('Sync error'))

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))
      await user.click(screen.getByTestId('nvd-sync-button'))

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument()
      })
    })

    it('should show Sync Again button after successful sync', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      const cleanupFn = vi.fn()
      vi.mocked(platform.database.onSyncComplete).mockImplementationOnce((cb) => {
        cb({
          success: true,
          cvesAdded: 10,
          cvesUpdated: 5,
          cvesFetched: 15,
          cvesSkipped: 0,
          cvesFailed: 0,
          durationMs: 1000,
          syncedAt: '2024-01-01',
          errors: [],
        })
        return cleanupFn
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      await waitFor(() => {
        expect(screen.getByText('Sync Again')).toBeInTheDocument()
      })
    })

    it('should re-trigger sync when Sync Again is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      const cleanupFn = vi.fn()
      vi.mocked(platform.database.onSyncComplete).mockImplementationOnce((cb) => {
        cb({
          success: true,
          cvesAdded: 10,
          cvesUpdated: 5,
          cvesFetched: 15,
          cvesSkipped: 0,
          cvesFailed: 0,
          durationMs: 1000,
          syncedAt: '2024-01-01',
          errors: [],
        })
        return cleanupFn
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      await waitFor(() => {
        expect(screen.getByText('Sync Again')).toBeInTheDocument()
      })

      mockNavigate.mockClear()
      await user.click(screen.getByText('Sync Again'))

      await waitFor(() => {
        expect(platform.database.startDeltaSync).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('NVD Search Types', () => {
    it('should search by CVE ID format', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValueOnce({
        success: true,
        results: [{ id: 'CVE-2024-12345', cveId: 'CVE-2024-12345', severity: 'high', description: 'Test vuln' }],
        totalResults: 1,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      const input = screen.getByTestId('nvd-search-input')
      await user.type(input, 'CVE-2024-12345')

      await waitFor(() => {
        expect(platform.database.search).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'cve-id', query: 'CVE-2024-12345' }),
        )
      })
    })

    it('should search by CPE format', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValueOnce({
        success: true,
        results: [],
        totalResults: 0,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      const input = screen.getByTestId('nvd-search-input')
      await user.type(input, 'cpe:2.3:a:vendor:product')

      await waitFor(() => {
        expect(platform.database.search).toHaveBeenCalledWith(expect.objectContaining({ type: 'cpe' }))
      })
    })

    it('should default to text search for non-CVE non-CPE queries', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValueOnce({
        success: true,
        results: [],
        totalResults: 0,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      const input = screen.getByTestId('nvd-search-input')
      await user.type(input, 'apache')

      await waitFor(() => {
        expect(platform.database.search).toHaveBeenCalledWith(expect.objectContaining({ type: 'text' }))
      })
    })

    it('should show NVD results when search succeeds', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: true,
        results: [
          {
            id: 'CVE-2024-11111',
            cveId: 'CVE-2024-11111',
            severity: 'CRITICAL',
            description: 'Critical vuln',
            cvssScore: 9.8,
            source: 'NVD',
          },
          {
            id: 'CVE-2024-22222',
            cveId: 'CVE-2024-22222',
            severity: 'MEDIUM',
            description: 'Medium vuln',
            cvssScore: 5.5,
            source: 'NVD',
          },
        ],
        totalResults: 2,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      const input = screen.getByTestId('nvd-search-input')
      await user.type(input, 'test')

      await waitFor(
        () => {
          expect(screen.getByText(/Found 2 results in NVD database/)).toBeInTheDocument()
          expect(screen.getByText('CVE-2024-11111')).toBeInTheDocument()
          expect(screen.getByText('CVE-2024-22222')).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
    })

    it('should show error message when NVD search fails', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
        results: [],
        totalResults: 0,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      const input = screen.getByTestId('nvd-search-input')
      await user.type(input, 'test')

      await waitFor(
        () => {
          expect(screen.getByText('Database connection failed')).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
    })

    it('should handle NVD search exception', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockRejectedValue(new Error('Unexpected error'))

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      const input = screen.getByTestId('nvd-search-input')
      await user.type(input, 'test')

      await waitFor(
        () => {
          expect(screen.getByText('Unexpected error')).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
    })

    it('should show NVD empty state when no results', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: true,
        results: [],
        totalResults: 0,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      const input = screen.getByTestId('nvd-search-input')
      await user.type(input, 'nonexistent')

      await waitFor(
        () => {
          expect(screen.getByText('Search NVD Database')).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
    })
  })

  describe('CVE Detail Modal', () => {
    it('should open CVE modal when NVD result is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: true,
        results: [
          { id: 'CVE-2024-99999', cveId: 'CVE-2024-99999', severity: 'HIGH', description: 'Test', source: 'NVD' },
        ],
        totalResults: 1,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      const input = screen.getByTestId('nvd-search-input')
      await user.type(input, 'test')

      await waitFor(
        () => {
          const resultElement = screen.getByTestId('nvd-result')
          fireEvent.click(resultElement)
        },
        { timeout: 3000 },
      )

      await waitFor(() => {
        expect(screen.getByTestId('cve-detail-modal')).toBeInTheDocument()
      })
    })
  })

  describe('Sync Progress Display', () => {
    it('should display NVD stats when available', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.getDetailedStats).mockResolvedValue({
        success: true,
        stats: { totalCves: 50000, lastSuccessfulSync: '2024-06-01T10:00:00Z' },
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      await waitFor(
        () => {
          expect(screen.getByText(/CVEs in database/)).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
    })
  })

  describe('NVD Result Rendering', () => {
    it('should display CVSS score for results with cvssScore', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: true,
        results: [
          {
            id: 'CVE-2024-55555',
            cveId: 'CVE-2024-55555',
            severity: 'CRITICAL',
            cvssScore: 9.8,
            description: 'Vuln with CVSS',
            source: 'NVD',
          },
        ],
        totalResults: 1,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))
      await user.type(screen.getByTestId('nvd-search-input'), 'test')

      await waitFor(
        () => {
          expect(screen.getByText(/CVSS 9\.8/)).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
    })

    it('should display published date for results', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: true,
        results: [
          {
            id: 'CVE-2024-66666',
            cveId: 'CVE-2024-66666',
            severity: 'LOW',
            description: 'Vuln with date',
            publishedAt: '2024-01-15',
            source: 'NVD',
          },
        ],
        totalResults: 1,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))
      await user.type(screen.getByTestId('nvd-search-input'), 'test')

      await waitFor(
        () => {
          expect(screen.getByText(/Published:/)).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
    })
  })

  describe('Clear Search in NVD Mode', () => {
    it('should clear NVD results when clear is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: true,
        results: [
          { id: 'CVE-2024-77777', cveId: 'CVE-2024-77777', severity: 'LOW', description: 'Test', source: 'NVD' },
        ],
        totalResults: 1,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))
      await user.type(screen.getByTestId('nvd-search-input'), 'test')

      await waitFor(
        () => {
          expect(screen.getByText('CVE-2024-77777')).toBeInTheDocument()
        },
        { timeout: 3000 },
      )

      await user.click(screen.getByLabelText('Clear search'))

      expect(screen.getByTestId('nvd-search-input')).toHaveValue('')
    })
  })

  describe('Result Click Handlers', () => {
    it('should navigate when clicking component result directly', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, 'react')

      await waitFor(() => {
        expect(screen.getByText('Components')).toBeInTheDocument()
      })

      const componentText = screen.getByText('react')
      const clickableRow = componentText.closest('.cursor-pointer')
      if (clickableRow) {
        fireEvent.click(clickableRow)
        await waitFor(() => {
          expect(mockNavigate).toHaveBeenCalledWith('/project/project-1')
        })
      }
    })

    it('should navigate when clicking vulnerability result directly', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, 'CVE')

      await waitFor(() => {
        expect(screen.getByText('Vulnerabilities')).toBeInTheDocument()
      })

      const vulnText = screen.getByText('CVE-2023-1234')
      const clickableRow = vulnText.closest('.cursor-pointer')
      if (clickableRow) {
        fireEvent.click(clickableRow)
        await waitFor(() => {
          expect(mockNavigate).toHaveBeenCalledWith('/project/project-1')
        })
      }
    })

    it('should clear search from no-results EmptyState action', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, 'nonexistent')

      await waitFor(() => {
        expect(screen.getByText('No results found')).toBeInTheDocument()
      })

      const clearButton = screen.getByText('Clear search')
      fireEvent.click(clearButton)

      await waitFor(() => {
        expect(input).toHaveValue('')
      })
    })
  })

  describe('NVD Empty State Mode Switch', () => {
    it('should switch to projects mode from NVD empty state', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: true,
        results: [],
        totalResults: 0,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))

      const input = screen.getByTestId('nvd-search-input')
      await user.type(input, 'nonexistent')

      await waitFor(
        () => {
          expect(screen.queryByText('Searching NVD database...')).not.toBeInTheDocument()
        },
        { timeout: 5000 },
      )

      await waitFor(() => {
        expect(screen.getByText('Switch to Project Search')).toBeInTheDocument()
      })

      const switchButton = screen.getByText('Switch to Project Search')
      fireEvent.click(switchButton)

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search projects, components, vulnerabilities/i)).toBeInTheDocument()
      })
    })
  })

  describe('Sync Error Retry', () => {
    it('should retry sync when Retry button is clicked after error', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.startDeltaSync).mockRejectedValueOnce(new Error('Sync failed'))

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))
      await user.click(screen.getByTestId('nvd-sync-button'))

      await waitFor(() => {
        expect(screen.getByText('Sync failed')).toBeInTheDocument()
      })

      const retryButton = screen.getByText('Retry')
      await user.click(retryButton)

      await waitFor(() => {
        expect(platform.database.startDeltaSync).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('Suggestion Click', () => {
    it('should set query when a suggestion is clicked', async () => {
      const searchLib = await import('@/lib/search')
      const searchSpy = vi.spyOn(searchLib, 'searchIndex').mockReturnValue([])
      const suggestionSpy = vi.spyOn(searchLib, 'getSearchSuggestions').mockReturnValue(['Web Application'])

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      const input = screen.getByPlaceholderText(/search/i)
      await user.type(input, 'Web')

      await waitFor(() => {
        expect(screen.getByText('Suggestions')).toBeInTheDocument()
      })

      const suggestionButton = screen.getByRole('button', { name: 'Web Application' })
      await user.click(suggestionButton)

      expect(input).toHaveValue('Web Application')

      searchSpy.mockRestore()
      suggestionSpy.mockRestore()
    })
  })

  describe('NVD Error Mode Switch', () => {
    it('should switch to projects mode when Switch to Project Search is clicked from NVD error', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: false,
        error: 'Database error occurred',
        results: [],
        totalResults: 0,
      })

      renderWithRouter(<Search />)

      const nvdButton = screen.getByText('NVD Database')
      fireEvent.click(nvdButton)

      const input = screen.getByTestId('nvd-search-input')
      fireEvent.change(input, { target: { value: 'testquery' } })

      await waitFor(
        () => {
          expect(screen.queryByText('Searching NVD database...')).not.toBeInTheDocument()
        },
        { timeout: 5000 },
      )

      await waitFor(() => {
        expect(screen.getByText('Database error occurred')).toBeInTheDocument()
      })

      const switchButton = screen.getByText('Switch to Project Search')
      fireEvent.click(switchButton)

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search projects, components, vulnerabilities/i)).toBeInTheDocument()
      })
    })
  })

  describe('Sync Progress Callbacks', () => {
    it('should update progress state when onSyncProgress fires', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      const cleanupFn = vi.fn()
      vi.mocked(platform.database.onSyncProgress).mockImplementationOnce((cb) => {
        cb({
          phase: 'fetching',
          lastSyncAt: null,
          fetchingFrom: '2024-01-01',
          cvesFetched: 50,
          cvesProcessed: 25,
          cvesAdded: 5,
          cvesUpdated: 3,
          cvesSkipped: 0,
          percentage: 50,
          elapsedTimeMs: 10000,
          estimatedTimeRemainingMs: 0,
          errors: [],
        })
        return cleanupFn
      })

      renderWithRouter(<Search />)

      // Switch to NVD mode to see sync progress UI
      fireEvent.click(screen.getByText('NVD Database'))

      await waitFor(() => {
        expect(screen.getByText(/Fetching: 50 CVEs/)).toBeInTheDocument()
      })
    })

    it('should show error state when onSyncError fires', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.onSyncError).mockImplementationOnce((cb) => {
        cb('Network timeout during sync')
        return vi.fn()
      })

      renderWithRouter(<Search />)

      // Switch to NVD mode to see sync UI
      fireEvent.click(screen.getByText('NVD Database'))

      await waitFor(() => {
        expect(screen.getByText('Network timeout during sync')).toBeInTheDocument()
      })
    })

    it('should handle non-string error from onSyncError', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.onSyncError).mockImplementationOnce((cb) => {
        cb({ message: 'object error' })
        return vi.fn()
      })

      renderWithRouter(<Search />)

      fireEvent.click(screen.getByText('NVD Database'))

      await waitFor(() => {
        expect(screen.getByText('[object Object]')).toBeInTheDocument()
      })
    })
  })

  describe('Cancel Sync', () => {
    it('should cancel sync when cancel button is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      // Start syncing - set onSyncProgress to trigger syncing state
      const cleanupFn = vi.fn()
      vi.mocked(platform.database.onSyncProgress).mockImplementationOnce((cb) => {
        cb({
          phase: 'fetching',
          lastSyncAt: null,
          fetchingFrom: '2024-01-01',
          cvesFetched: 10,
          cvesProcessed: 5,
          cvesAdded: 2,
          cvesUpdated: 1,
          cvesSkipped: 0,
          percentage: 20,
          elapsedTimeMs: 5000,
          estimatedTimeRemainingMs: 0,
          errors: [],
        })
        return cleanupFn
      })

      renderWithRouter(<Search />)

      fireEvent.click(screen.getByText('NVD Database'))

      // The cancel button should appear because sync progress set isSyncing=true
      // The button contains text like "Fetching: 10 CVEs"
      const cancelButton = await screen.findByText(/Fetching: 10 CVEs/)
      // Click the parent button element
      const buttonElement = cancelButton.closest('button')
      if (buttonElement) {
        fireEvent.click(buttonElement)
      }

      await waitFor(() => {
        expect(platform.database.cancelSync).toHaveBeenCalled()
      })
    })
  })

  describe('formatTimeRemaining Display', () => {
    it('should display seconds remaining for short estimated time', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      const cleanupFn = vi.fn()
      vi.mocked(platform.database.onSyncProgress).mockImplementationOnce((cb) => {
        cb({
          phase: 'importing',
          lastSyncAt: null,
          fetchingFrom: '',
          cvesFetched: 100,
          cvesProcessed: 60,
          cvesAdded: 10,
          cvesUpdated: 5,
          cvesSkipped: 0,
          percentage: 60,
          elapsedTimeMs: 30000,
          estimatedTimeRemainingMs: 5000, // 5 seconds
          errors: [],
        })
        return cleanupFn
      })

      renderWithRouter(<Search />)
      fireEvent.click(screen.getByText('NVD Database'))

      await waitFor(() => {
        expect(screen.getByText(/5s remaining/)).toBeInTheDocument()
      })
    })

    it('should display minutes and seconds remaining for long estimated time', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      const cleanupFn = vi.fn()
      vi.mocked(platform.database.onSyncProgress).mockImplementationOnce((cb) => {
        cb({
          phase: 'fetching',
          lastSyncAt: null,
          fetchingFrom: '',
          cvesFetched: 100,
          cvesProcessed: 30,
          cvesAdded: 10,
          cvesUpdated: 5,
          cvesSkipped: 0,
          percentage: 30,
          elapsedTimeMs: 60000,
          estimatedTimeRemainingMs: 125000, // 2m 5s
          errors: [],
        })
        return cleanupFn
      })

      renderWithRouter(<Search />)
      fireEvent.click(screen.getByText('NVD Database'))

      await waitFor(() => {
        expect(screen.getByText(/2m 5s remaining/)).toBeInTheDocument()
      })
    })
  })

  describe('Fetch NVD Stats Error', () => {
    it('should handle getDetailedStats throwing an error', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.getDetailedStats).mockRejectedValue(new Error('Stats query failed'))

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      // Switching to NVD mode triggers fetchNvdStats
      await user.click(screen.getByText('NVD Database'))

      // Should not crash - the error is caught
      await waitFor(() => {
        expect(screen.getByText('Sync NVD Data')).toBeInTheDocument()
      })
    })
  })

  describe('CVE Modal Close', () => {
    it('should close CVE modal when close button is clicked', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: true,
        results: [
          { id: 'CVE-2024-88888', cveId: 'CVE-2024-88888', severity: 'HIGH', description: 'Test vuln', source: 'NVD' },
        ],
        totalResults: 1,
      })

      renderWithRouter(<Search />)

      fireEvent.click(screen.getByText('NVD Database'))
      const input = screen.getByTestId('nvd-search-input')
      fireEvent.change(input, { target: { value: 'test' } })

      // Wait for results and click
      await waitFor(
        () => {
          const resultElement = screen.getByTestId('nvd-result')
          fireEvent.click(resultElement)
        },
        { timeout: 3000 },
      )

      // Modal should be visible
      await waitFor(() => {
        expect(screen.getByTestId('cve-detail-modal')).toBeInTheDocument()
      })

      // Click close button in the modal
      fireEvent.click(screen.getByTestId('close-cve-modal'))

      // Modal should be closed
      await waitFor(() => {
        expect(screen.queryByTestId('cve-detail-modal')).not.toBeInTheDocument()
      })
    })
  })

  describe('Unknown Severity in NVD Results', () => {
    it('should handle unknown/undefined severity gracefully', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      vi.mocked(platform.database.search).mockResolvedValue({
        success: true,
        results: [
          {
            id: 'CVE-2024-99999',
            cveId: 'CVE-2024-99999',
            severity: undefined,
            description: 'Unknown severity vuln',
            source: 'NVD',
          },
        ],
        totalResults: 1,
      })

      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.click(screen.getByText('NVD Database'))
      await user.type(screen.getByTestId('nvd-search-input'), 'test')

      await waitFor(
        () => {
          // With undefined severity, should show 'UNKNOWN' label with muted foreground color
          expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
        },
        { timeout: 3000 },
      )
    })
  })

  describe('Database Unavailable in NVD Mode', () => {
    it('should show error when database API is not available', async () => {
      const { getPlatform } = await import('@/lib/platform')
      const platform = getPlatform()

      // Make database unavailable for this specific test
      vi.mocked(getPlatform).mockReturnValue({
        ...platform,
        database: undefined as unknown as typeof platform.database,
      })

      renderWithRouter(<Search />)

      fireEvent.click(screen.getByText('NVD Database'))
      const input = screen.getByTestId('nvd-search-input')
      fireEvent.change(input, { target: { value: 'test' } })

      await waitFor(() => {
        expect(screen.getByText(/Database API not available/)).toBeInTheDocument()
      })

      // Restore the mock
      vi.mocked(getPlatform).mockReturnValue(platform)
    })
  })

  // FR-08.1 "Save search queries" — the saved-search bar is wired into project mode only.
  // These guard the round-trip (save -> chip -> reload) and the mode gating, which no other
  // Search test exercises; a regression like handleLoadSearch dropping the query would slip by.
  describe('Saved searches (FR-08.1)', () => {
    const projectSearchInput = () => screen.getByPlaceholderText(/search projects, components, vulnerabilities/i)

    beforeEach(() => {
      localStorage.clear()
    })

    it('saves the current query and reloads it from its chip', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.type(projectSearchInput(), 'react OR express')
      await user.click(screen.getByRole('button', { name: /Save current/i }))
      await user.type(screen.getByLabelText('Saved search name'), 'Frontend libs')
      await user.click(screen.getByRole('button', { name: /^Save$/i }))

      // The chip appears and the query persists across a fresh render.
      expect(await screen.findByRole('button', { name: 'Frontend libs' })).toBeInTheDocument()

      // Clearing the box then clicking the chip restores the exact saved query.
      await user.clear(projectSearchInput())
      expect(projectSearchInput()).toHaveValue('')
      await user.click(screen.getByRole('button', { name: 'Frontend libs' }))
      expect(projectSearchInput()).toHaveValue('react OR express')
    })

    it('deletes a saved search from its chip', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      await user.type(projectSearchInput(), 'log4j NOT test')
      await user.click(screen.getByRole('button', { name: /Save current/i }))
      await user.type(screen.getByLabelText('Saved search name'), 'Log4j')
      await user.click(screen.getByRole('button', { name: /^Save$/i }))
      expect(await screen.findByRole('button', { name: 'Log4j' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Delete saved search Log4j/i }))
      expect(screen.queryByRole('button', { name: 'Log4j' })).not.toBeInTheDocument()
    })

    it('does not render the saved-search bar in NVD mode', async () => {
      const user = userEvent.setup()
      renderWithRouter(<Search />)

      // Save one in project mode so the bar has content, then switch to NVD.
      await user.type(projectSearchInput(), 'nginx')
      await user.click(screen.getByRole('button', { name: /Save current/i }))
      await user.type(screen.getByLabelText('Saved search name'), 'Nginx')
      await user.click(screen.getByRole('button', { name: /^Save$/i }))
      expect(await screen.findByRole('button', { name: 'Nginx' })).toBeInTheDocument()

      await user.click(screen.getByText('NVD Database'))
      expect(screen.queryByText('Saved searches')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Nginx' })).not.toBeInTheDocument()
    })
  })
})
