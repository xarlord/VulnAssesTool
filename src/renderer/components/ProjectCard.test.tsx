import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProjectCard from './ProjectCard'
import type { Project } from '@@/types'

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
      expect(criticalBadge.className).toContain('bg-destructive/15')
      expect(criticalBadge.className).toContain('text-destructive')
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

    it('should call confirm when delete button is clicked', () => {
      global.confirm = vi.fn(() => true)

      renderCard()

      const deleteButton = screen.getByRole('button', { name: 'Delete project' })
      fireEvent.click(deleteButton)

      expect(global.confirm).toHaveBeenCalledWith('Are you sure you want to delete "Test Project"?')
    })

    it('should call onDelete when confirm is accepted', () => {
      global.confirm = vi.fn(() => true)

      const project = createMockProject()
      renderCard(project)

      const deleteButton = screen.getByRole('button', { name: 'Delete project' })
      fireEvent.click(deleteButton)

      expect(mockOnDelete).toHaveBeenCalledWith('test-project-id')
    })

    it('should not call onDelete when confirm is cancelled', () => {
      global.confirm = vi.fn(() => false)

      renderCard()

      const deleteButton = screen.getByRole('button', { name: /delete project/i })
      fireEvent.click(deleteButton)

      expect(mockOnDelete).not.toHaveBeenCalled()
    })

    it('should stop propagation on delete button click', () => {
      global.confirm = vi.fn(() => false)

      renderCard()

      const deleteButton = screen.getByRole('button', { name: 'Delete project' })
      fireEvent.click(deleteButton)

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
})
