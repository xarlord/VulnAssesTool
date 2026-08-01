import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ProjectCard } from './ProjectCard'
import type { Project } from '@@/types'

vi.mock('@/store/useStore', () => ({
  useSettings: () => ({
    autoRefresh: false,
    autoRefreshInterval: 60,
  }),
  useRefreshingProjectIds: () => new Set<string>(),
}))

vi.mock('@/components/StalenessIndicator', () => ({
  StalenessBadge: () => <span data-testid="staleness-badge" />,
}))

vi.mock('@/lib/refresh', () => ({
  formatTimeUntilRefresh: vi.fn(() => 'in 5 minutes'),
  getNextRefreshTime: vi.fn(() => new Date()),
}))

const createMockProject = (overrides?: Partial<Project>): Project => ({
  id: 'test-project-id',
  name: 'Test Project',
  description: 'A test project for vulnerability assessment',
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
      purl: 'pkg:npm/lodash@4.17.21',
      licenses: ['MIT'],
      vulnerabilities: [],
    },
  ],
  vulnerabilities: [],
  statistics: {
    totalVulnerabilities: 5,
    criticalCount: 1,
    highCount: 1,
    mediumCount: 2,
    lowCount: 1,
    totalComponents: 1,
    vulnerableComponents: 1,
  },
  ...overrides,
})

describe('ProjectCard', () => {
  const mockOnView = vi.fn()
  const mockOnDelete = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderCard = (project?: Project) => {
    return render(<ProjectCard project={project || createMockProject()} onView={mockOnView} onDelete={mockOnDelete} />)
  }

  describe('Rendering', () => {
    it('should render project name', () => {
      renderCard()

      expect(screen.getByText('Test Project')).toBeInTheDocument()
    })

    it('should render project description', () => {
      renderCard()

      expect(screen.getByText('A test project for vulnerability assessment')).toBeInTheDocument()
    })

    it('should not render description when not provided', () => {
      const projectNoDesc = createMockProject({ description: undefined })
      renderCard(projectNoDesc)

      expect(screen.queryByText('A test project for vulnerability assessment')).not.toBeInTheDocument()
    })

    it('should render Shield icon', () => {
      renderCard()

      const shield = document.querySelector('.text-primary')
      expect(shield).toBeInTheDocument()
    })
  })

  describe('Statistics Display', () => {
    it('should display components count', () => {
      renderCard()

      expect(screen.getByText(/1 components/)).toBeInTheDocument()
    })

    it('should display vulnerabilities count', () => {
      renderCard()

      expect(screen.getByText(/5 vulnerabilities/)).toBeInTheDocument()
    })

    it('should display last updated date', () => {
      renderCard()

      expect(screen.getByText(/Updated/)).toBeInTheDocument()
    })

    it('should format date correctly', () => {
      const project = createMockProject({ updatedAt: new Date('2024-03-15T10:30:00') })
      renderCard(project)

      expect(screen.getByText(/Updated/)).toBeInTheDocument()
    })
  })

  describe('Severity Badges', () => {
    it('should not show badges when no vulnerabilities', () => {
      const projectNoVulns = createMockProject({
        statistics: {
          totalVulnerabilities: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          totalComponents: 1,
          vulnerableComponents: 0,
        },
      })
      renderCard(projectNoVulns)

      expect(screen.queryByText(/Critical/)).not.toBeInTheDocument()
      expect(screen.queryByText(/High/)).not.toBeInTheDocument()
      expect(screen.queryByText(/Medium/)).not.toBeInTheDocument()
    })

    it('should show Critical badge when critical vulnerabilities exist', () => {
      renderCard()

      expect(screen.getByText(/1 Critical/)).toBeInTheDocument()
    })

    it('should show High badge when high vulnerabilities exist', () => {
      renderCard()

      expect(screen.getByText(/1 High/)).toBeInTheDocument()
    })

    it('should show Medium badge when medium vulnerabilities exist', () => {
      renderCard()

      expect(screen.getByText(/2 Medium/)).toBeInTheDocument()
    })

    it('should show badge with correct styling', () => {
      renderCard()

      const criticalBadge = screen.getByText(/1 Critical/)
      expect(criticalBadge.className).toContain('severity-critical')
    })
  })

  describe('Severity Color Logic', () => {
    it('should return muted color for zero critical count', () => {
      const projectNoVulns = createMockProject({
        statistics: {
          totalVulnerabilities: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          totalComponents: 0,
          vulnerableComponents: 0,
        },
      })
      renderCard(projectNoVulns)

      const alertIcon = document.querySelector('.text-muted-foreground')
      expect(alertIcon).toBeInTheDocument()
    })
  })

  describe('Click Interactions', () => {
    it('should call onView when card is clicked', () => {
      const project = createMockProject()
      renderCard(project)

      const card = screen.getByText('Test Project').closest('.group')
      if (card) {
        fireEvent.click(card)
        expect(mockOnView).toHaveBeenCalledWith(project)
      }
    })

    it('should call onView when View button is clicked', () => {
      renderCard()

      const viewButton = screen.getByText('View')
      fireEvent.click(viewButton)

      expect(mockOnView).toHaveBeenCalled()
    })

    it('should stop propagation on View button click', () => {
      renderCard()

      const viewButton = screen.getByText('View')
      fireEvent.click(viewButton)

      // Should be called once, not twice (card click shouldn't trigger)
      expect(mockOnView).toHaveBeenCalledTimes(1)
    })
  })

  describe('Delete Interaction', () => {
    it('should show delete button on hover', () => {
      renderCard()

      const deleteButton = screen.getByRole('button', { name: 'Delete project' })
      expect(deleteButton).toBeInTheDocument()
    })

    it('should open a confirmation dialog when delete button is clicked', async () => {
      renderCard()

      fireEvent.click(screen.getByRole('button', { name: 'Delete project' }))

      // Native confirm() replaced by an accessible ConfirmDialog.
      const dialog = await screen.findByRole('dialog')
      expect(within(dialog).getByText('Delete project')).toBeInTheDocument()
    })

    it('should call onDelete when deletion is confirmed', async () => {
      const project = createMockProject()
      renderCard(project)

      fireEvent.click(screen.getByRole('button', { name: 'Delete project' }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

      expect(mockOnDelete).toHaveBeenCalledWith('test-project-id')
    })

    it('should not call onDelete when deletion is cancelled', async () => {
      renderCard()

      fireEvent.click(screen.getByRole('button', { name: /delete project/i }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      expect(mockOnDelete).not.toHaveBeenCalled()
    })

    it('should stop propagation on delete button click', () => {
      renderCard()

      fireEvent.click(screen.getByRole('button', { name: 'Delete project' }))

      // Opening the confirm dialog must not also trigger the card's onView.
      expect(mockOnView).not.toHaveBeenCalled()
    })
  })

  describe('Visual Structure', () => {
    it('should render with correct card styling', () => {
      renderCard()

      const card = document.querySelector('.group.rounded-lg.border')
      expect(card).toBeInTheDocument()
    })

    it('should have hover state on card', () => {
      renderCard()

      const card = document.querySelector('.group')
      // The className contains hover:bg-muted/50 (with forward slash)
      expect(card?.className).toContain('hover:bg-muted')
      expect(card?.className).toContain('/50')
    })

    it('should show actions on hover with opacity transition', () => {
      renderCard()

      const actionsDiv = document.querySelector('.opacity-0')
      expect(actionsDiv).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle project with very long name', () => {
      const longName = 'A'.repeat(200)
      const project = createMockProject({ name: longName })
      renderCard(project)

      expect(screen.getByText(longName)).toBeInTheDocument()
    })

    it('should handle project with very long description', () => {
      const longDesc = 'B'.repeat(500)
      const project = createMockProject({ description: longDesc })
      renderCard(project)

      expect(screen.getByText(longDesc)).toBeInTheDocument()
    })

    it('should handle project with zero components', () => {
      const project = createMockProject({
        statistics: {
          totalVulnerabilities: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          totalComponents: 0,
          vulnerableComponents: 0,
        },
      })
      renderCard(project)

      expect(screen.getByText(/0 components/)).toBeInTheDocument()
    })

    it('should handle project with many vulnerabilities', () => {
      const project = createMockProject({
        statistics: {
          totalVulnerabilities: 9999,
          criticalCount: 100,
          highCount: 200,
          mediumCount: 300,
          lowCount: 400,
          totalComponents: 50,
          vulnerableComponents: 45,
        },
      })
      renderCard(project)

      expect(screen.getByText(/9999 vulnerabilities/)).toBeInTheDocument()
      expect(screen.getByText(/100 Critical/)).toBeInTheDocument()
      expect(screen.getByText(/200 High/)).toBeInTheDocument()
      expect(screen.getByText(/300 Medium/)).toBeInTheDocument()
    })
  })

  describe('Keyboard Navigation', () => {
    it('should call onView when Enter key is pressed', () => {
      const project = createMockProject()
      renderCard(project)

      const card = screen.getByRole('button', { name: /View project Test Project/ })
      fireEvent.keyDown(card, { key: 'Enter' })

      expect(mockOnView).toHaveBeenCalledWith(project)
    })

    it('should call onView when Space key is pressed', () => {
      const project = createMockProject()
      renderCard(project)

      const card = screen.getByRole('button', { name: /View project Test Project/ })
      fireEvent.keyDown(card, { key: ' ' })

      expect(mockOnView).toHaveBeenCalledWith(project)
    })

    it('should not call onView for other keys', () => {
      renderCard()

      const card = screen.getByRole('button', { name: /View project Test Project/ })
      fireEvent.keyDown(card, { key: 'Tab' })

      expect(mockOnView).not.toHaveBeenCalled()
    })
  })

  describe('Optional Callbacks', () => {
    it('should render refresh button when onRefresh is provided', () => {
      const mockOnRefresh = vi.fn()
      render(
        <ProjectCard
          project={createMockProject()}
          onView={mockOnView}
          onDelete={mockOnDelete}
          onRefresh={mockOnRefresh}
        />,
      )

      const refreshButton = screen.getByLabelText('Refresh vulnerability data')
      expect(refreshButton).toBeInTheDocument()
    })

    it('should not render refresh button when onRefresh is not provided', () => {
      renderCard()

      expect(screen.queryByLabelText('Refresh vulnerability data')).not.toBeInTheDocument()
    })

    it('should call onRefresh when refresh button is clicked', () => {
      const mockOnRefresh = vi.fn()
      render(
        <ProjectCard
          project={createMockProject()}
          onView={mockOnView}
          onDelete={mockOnDelete}
          onRefresh={mockOnRefresh}
        />,
      )

      const refreshButton = screen.getByLabelText('Refresh vulnerability data')
      fireEvent.click(refreshButton)

      expect(mockOnRefresh).toHaveBeenCalledWith('test-project-id')
    })

    it('calls onRefresh with force=true when the force-refresh button is clicked (FR-03.5)', () => {
      const mockOnRefresh = vi.fn()
      render(
        <ProjectCard
          project={createMockProject()}
          onView={mockOnView}
          onDelete={mockOnDelete}
          onRefresh={mockOnRefresh}
        />,
      )

      // Distinct from the normal refresh click above, which passes only the id (cached path).
      fireEvent.click(screen.getByLabelText('Force refresh vulnerability data (bypass cache)'))

      expect(mockOnRefresh).toHaveBeenCalledWith('test-project-id', true)
    })

    it('should stop propagation on refresh button click', () => {
      const mockOnRefresh = vi.fn()
      render(
        <ProjectCard
          project={createMockProject()}
          onView={mockOnView}
          onDelete={mockOnDelete}
          onRefresh={mockOnRefresh}
        />,
      )

      const refreshButton = screen.getByLabelText('Refresh vulnerability data')
      fireEvent.click(refreshButton)

      expect(mockOnView).not.toHaveBeenCalled()
    })

    it('should render FPF button when onFpf is provided', () => {
      const mockOnFpf = vi.fn()
      render(
        <ProjectCard project={createMockProject()} onView={mockOnView} onDelete={mockOnDelete} onFpf={mockOnFpf} />,
      )

      expect(screen.getByText('FPF')).toBeInTheDocument()
    })

    it('should not render FPF button when onFpf is not provided', () => {
      renderCard()

      expect(screen.queryByText('FPF')).not.toBeInTheDocument()
    })

    it('should call onFpf when FPF button is clicked', () => {
      const mockOnFpf = vi.fn()
      render(
        <ProjectCard project={createMockProject()} onView={mockOnView} onDelete={mockOnDelete} onFpf={mockOnFpf} />,
      )

      const fpfButton = screen.getByText('FPF')
      fireEvent.click(fpfButton)

      expect(mockOnFpf).toHaveBeenCalledWith('test-project-id')
      expect(mockOnView).not.toHaveBeenCalled()
    })
  })

  describe('Refreshing State', () => {
    it('should render refresh button as not disabled when not refreshing', () => {
      const mockOnRefresh = vi.fn()
      render(
        <ProjectCard
          project={createMockProject()}
          onView={mockOnView}
          onDelete={mockOnDelete}
          onRefresh={mockOnRefresh}
        />,
      )

      const refreshButton = screen.getByLabelText('Refresh vulnerability data')
      expect(refreshButton).not.toBeDisabled()
    })
  })
})
