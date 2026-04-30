import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import EmptyState from './EmptyState'

describe('EmptyState', () => {
  describe('Rendering - Projects Type', () => {
    it('should render projects empty state', () => {
      render(<EmptyState type="projects" />)

      expect(screen.getByText('No projects yet')).toBeInTheDocument()
      expect(screen.getByText('Create a new project to get started with vulnerability assessment')).toBeInTheDocument()
    })

    it('should render projects empty state with action button', () => {
      const mockAction = vi.fn()
      render(<EmptyState type="projects" action={{ label: 'Create Project', onClick: mockAction }} />)

      expect(screen.getByText('Create Project')).toBeInTheDocument()
    })

    it('should call action onClick when button is clicked', () => {
      const mockAction = vi.fn()
      render(<EmptyState type="projects" action={{ label: 'Create Project', onClick: mockAction }} />)

      const button = screen.getByText('Create Project')
      fireEvent.click(button)

      expect(mockAction).toHaveBeenCalled()
    })
  })

  describe('Rendering - Components Type', () => {
    it('should render components empty state', () => {
      render(<EmptyState type="components" />)

      expect(screen.getByText('No components found')).toBeInTheDocument()
      expect(screen.getByText('Upload an SBOM file to view and analyze components')).toBeInTheDocument()
    })
  })

  describe('Rendering - Vulnerabilities Type', () => {
    it('should render vulnerabilities empty state', () => {
      render(<EmptyState type="vulnerabilities" />)

      expect(screen.getByText('No vulnerabilities found')).toBeInTheDocument()
      expect(screen.getByText('Run a vulnerability scan to check for security issues')).toBeInTheDocument()
    })
  })

  describe('Rendering - SBOM Type', () => {
    it('should render sbom empty state', () => {
      render(<EmptyState type="sbom" />)

      expect(screen.getByText('No SBOM files uploaded')).toBeInTheDocument()
      expect(screen.getByText('Upload a CycloneDX or SPDX file to get started')).toBeInTheDocument()
    })
  })

  describe('Rendering - Search Type', () => {
    it('should render search empty state', () => {
      render(<EmptyState type="search" />)

      expect(screen.getByText('No results found')).toBeInTheDocument()
      expect(screen.getByText('Try adjusting your filters or search terms')).toBeInTheDocument()
    })
  })

  describe('Action Button', () => {
    it('should not render action button when not provided', () => {
      render(<EmptyState type="projects" />)

      expect(screen.queryByText('Create Project')).not.toBeInTheDocument()
    })

    it('should render action button with custom label', () => {
      render(<EmptyState type="projects" action={{ label: 'Custom Action Label', onClick: vi.fn() }} />)

      expect(screen.getByText('Custom Action Label')).toBeInTheDocument()
    })

    it('should call onClick handler when action button is clicked', () => {
      const mockAction = vi.fn()
      render(<EmptyState type="projects" action={{ label: 'Click Me', onClick: mockAction }} />)

      const button = screen.getByText('Click Me')
      fireEvent.click(button)

      expect(mockAction).toHaveBeenCalledTimes(1)
    })
  })

  describe('Visual Structure', () => {
    it('should render icon in circle container', () => {
      render(<EmptyState type="projects" />)

      const iconContainer = document.querySelector('.rounded-full.bg-muted')
      expect(iconContainer).toBeInTheDocument()
    })

    it('should render title with proper styling', () => {
      render(<EmptyState type="projects" />)

      const title = screen.getByText('No projects yet')
      expect(title.className).toContain('font-medium')
    })

    it('should render description with muted text', () => {
      render(<EmptyState type="projects" />)

      const description = screen.getByText('Create a new project to get started with vulnerability assessment')
      expect(description.className).toContain('text-muted-foreground')
    })
  })

  describe('All Types', () => {
    const types = ['projects', 'components', 'vulnerabilities', 'sbom', 'search'] as const

    types.forEach((type) => {
      it(`should render ${type} type correctly`, () => {
        render(<EmptyState type={type} />)

        const config = {
          projects: { title: 'No projects yet' },
          components: { title: 'No components found' },
          vulnerabilities: { title: 'No vulnerabilities found' },
          sbom: { title: 'No SBOM files uploaded' },
          search: { title: 'No results found' },
        }

        expect(screen.getByText(config[type].title)).toBeInTheDocument()
      })
    })
  })
})
