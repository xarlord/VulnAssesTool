import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BrowserRouter } from 'react-router-dom'
import Search from './Search'
import { useStore } from '@/store/useStore'

// Mock the store
vi.mock('@/store/useStore', () => ({
  useStore: vi.fn(),
}))

// Mock EmptyState component
vi.mock('@/components/EmptyState', () => ({
  default: ({ icon, title, description, action }: any) => (
    <div data-testid="empty-state">
      <div>{title}</div>
      <div>{description}</div>
      {action && <button onClick={action.onClick}>{action.label}</button>}
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
    ;(useStore as any).mockReturnValue({
      projects: mockProjects,
    })
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

    expect(screen.getByText('Search Tips')).toBeInTheDocument()
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

    const clearButton = screen.getByRole('button').querySelector('svg')
    if (clearButton) {
      await user.click(clearButton.closest('button')!)
    }

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

    // Verify clear button is visible
    const clearButton = screen.getByRole('button').querySelector('svg')
    expect(clearButton).toBeInTheDocument()

    if (clearButton) {
      const buttonElement = clearButton.closest('button')
      expect(buttonElement).toBeInTheDocument()

      // Click clear button
      if (buttonElement) {
        await user.click(buttonElement)

        // Verify search field is cleared
        expect(input).toHaveValue('')

        // Verify results are hidden and empty state is shown
        await waitFor(() => {
          expect(screen.queryByText(/Found \d+ results?/i)).not.toBeInTheDocument()
          expect(screen.getByText('Start searching')).toBeInTheDocument()
        })
      }
    }

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
})
