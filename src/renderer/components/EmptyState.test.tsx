import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from './ui/EmptyState'

describe('EmptyState', () => {
  describe('Rendering - Projects Variant', () => {
    it('should render projects empty state', () => {
      render(<EmptyState variant="projects" />)

      expect(screen.getByText('No Projects Yet')).toBeInTheDocument()
      expect(
        screen.getByText('Create your first project to start tracking vulnerabilities in your software.'),
      ).toBeInTheDocument()
    })

    it('should render projects empty state with action button', () => {
      const mockAction = vi.fn()
      render(<EmptyState variant="projects" action={<button onClick={mockAction}>Create Project</button>} />)

      expect(screen.getByText('Create Project')).toBeInTheDocument()
    })

    it('should call action onClick when button is clicked', () => {
      const mockAction = vi.fn()
      render(<EmptyState variant="projects" action={<button onClick={mockAction}>Create Project</button>} />)

      const button = screen.getByText('Create Project')
      fireEvent.click(button)

      expect(mockAction).toHaveBeenCalled()
    })
  })

  describe('Rendering - Components Variant', () => {
    it('should render components empty state', () => {
      render(<EmptyState variant="components" />)

      expect(screen.getByText('No Components')).toBeInTheDocument()
      expect(screen.getByText('Upload an SBOM to see your software components here.')).toBeInTheDocument()
    })
  })

  describe('Rendering - Vulnerabilities Variant', () => {
    it('should render vulnerabilities empty state', () => {
      render(<EmptyState variant="vulnerabilities" />)

      expect(screen.getByText('No Vulnerabilities Found')).toBeInTheDocument()
      expect(
        screen.getByText("Great news! We didn't find any known vulnerabilities in your components."),
      ).toBeInTheDocument()
    })
  })

  describe('Rendering - Database Variant', () => {
    it('should render database empty state', () => {
      render(<EmptyState variant="database" />)

      expect(screen.getByText('Database Empty')).toBeInTheDocument()
      expect(screen.getByText('Sync the NVD database to get the latest vulnerability information.')).toBeInTheDocument()
    })
  })

  describe('Rendering - Search Variant', () => {
    it('should render search empty state', () => {
      render(<EmptyState variant="search" />)

      expect(screen.getByText('No Results Found')).toBeInTheDocument()
      expect(screen.getByText('Try adjusting your search terms or filters to find what you need.')).toBeInTheDocument()
    })
  })

  describe('Action Button', () => {
    it('should not render action button when not provided', () => {
      render(<EmptyState variant="projects" />)

      expect(screen.queryByText('Create Project')).not.toBeInTheDocument()
    })

    it('should render action button with custom label', () => {
      render(<EmptyState variant="projects" action={<button>Custom Action Label</button>} />)

      expect(screen.getByText('Custom Action Label')).toBeInTheDocument()
    })

    it('should call onClick handler when action button is clicked', () => {
      const mockAction = vi.fn()
      render(<EmptyState variant="projects" action={<button onClick={mockAction}>Click Me</button>} />)

      const button = screen.getByText('Click Me')
      fireEvent.click(button)

      expect(mockAction).toHaveBeenCalledTimes(1)
    })
  })

  describe('Visual Structure', () => {
    it('should render icon in circle container', () => {
      render(<EmptyState variant="projects" />)

      const iconContainer = document.querySelector('.rounded-full.bg-muted')
      expect(iconContainer).toBeInTheDocument()
    })

    it('should render title with proper styling', () => {
      render(<EmptyState variant="projects" />)

      const title = screen.getByText('No Projects Yet')
      expect(title.className).toContain('font-semibold')
    })

    it('should render description with muted text', () => {
      render(<EmptyState variant="projects" />)

      const description = screen.getByText(
        'Create your first project to start tracking vulnerabilities in your software.',
      )
      expect(description.className).toContain('text-muted-foreground')
    })
  })

  describe('All Variants', () => {
    const variants = ['projects', 'components', 'vulnerabilities', 'search', 'database'] as const

    variants.forEach((variant) => {
      it(`should render ${variant} variant correctly`, () => {
        render(<EmptyState variant={variant} />)

        const config = {
          projects: { title: 'No Projects Yet' },
          components: { title: 'No Components' },
          vulnerabilities: { title: 'No Vulnerabilities Found' },
          search: { title: 'No Results Found' },
          database: { title: 'Database Empty' },
        }

        expect(screen.getByText(config[variant].title)).toBeInTheDocument()
      })
    })
  })
})
