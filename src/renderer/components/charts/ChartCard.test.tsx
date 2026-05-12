import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ChartCard } from './ChartCard'

describe('ChartCard', () => {
  const mockChildren = <div data-testid="mock-chart">Chart Content</div>

  describe('Rendering', () => {
    it('should render title', () => {
      render(<ChartCard title="Test Chart">{mockChildren}</ChartCard>)

      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('should render children', () => {
      render(<ChartCard title="Test Chart">{mockChildren}</ChartCard>)

      expect(screen.getByTestId('mock-chart')).toBeInTheDocument()
    })

    it('should render card container with default styling', () => {
      const { container } = render(<ChartCard title="Test Chart">{mockChildren}</ChartCard>)

      const card = container.querySelector('.rounded-lg')
      expect(card).toBeInTheDocument()
      expect(card).toHaveClass('border')
      expect(card).toHaveClass('bg-card')
    })

    it('should render description when provided', () => {
      render(
        <ChartCard title="Test Chart" description="Test description">
          {mockChildren}
        </ChartCard>,
      )

      expect(screen.getByText('Test description')).toBeInTheDocument()
    })

    it('should not render description when not provided', () => {
      render(<ChartCard title="Test Chart">{mockChildren}</ChartCard>)

      expect(screen.queryByText('Test description')).not.toBeInTheDocument()
    })

    it('should render actions when provided', () => {
      const actions = <button data-testid="test-action">Action</button>
      render(
        <ChartCard title="Test Chart" actions={actions}>
          {mockChildren}
        </ChartCard>,
      )

      expect(screen.getByTestId('test-action')).toBeInTheDocument()
    })

    it('should not render actions when not provided', () => {
      render(<ChartCard title="Test Chart">{mockChildren}</ChartCard>)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('Layout', () => {
    it('should render header section', () => {
      render(<ChartCard title="Test Chart">{mockChildren}</ChartCard>)

      const title = screen.getByText('Test Chart')
      // Check that title is within a flex container
      expect(title.parentElement?.parentElement).toHaveClass('flex')
    })

    it('should render title with correct styling', () => {
      render(<ChartCard title="Test Chart">{mockChildren}</ChartCard>)

      const title = screen.getByText('Test Chart')
      expect(title).toHaveClass('text-lg')
      expect(title).toHaveClass('font-semibold')
    })

    it('should render description with correct styling', () => {
      render(
        <ChartCard title="Test Chart" description="Test description">
          {mockChildren}
        </ChartCard>,
      )

      const description = screen.getByText('Test description')
      expect(description).toHaveClass('text-sm')
      expect(description).toHaveClass('text-muted-foreground')
    })
  })

  describe('Custom Class Name', () => {
    it('should apply custom className when provided', () => {
      const { container } = render(
        <ChartCard title="Test Chart" className="custom-class">
          {mockChildren}
        </ChartCard>,
      )

      const card = container.querySelector('.custom-class')
      expect(card).toBeInTheDocument()
    })

    it('should not add extra class when className is not provided', () => {
      const { container } = render(<ChartCard title="Test Chart">{mockChildren}</ChartCard>)

      const card = container.querySelector('.rounded-lg')
      // Check that default classes are applied but no custom class
      expect(card).not.toHaveClass('custom-class')
    })
  })

  describe('Actions Section', () => {
    it('should render multiple actions', () => {
      const actions = (
        <>
          <button data-testid="action-1">Action 1</button>
          <button data-testid="action-2">Action 2</button>
        </>
      )
      render(
        <ChartCard title="Test Chart" actions={actions}>
          {mockChildren}
        </ChartCard>,
      )

      expect(screen.getByTestId('action-1')).toBeInTheDocument()
      expect(screen.getByTestId('action-2')).toBeInTheDocument()
    })

    it('should render actions in correct container', () => {
      const actions = <button data-testid="test-action">Action</button>
      const { container } = render(
        <ChartCard title="Test Chart" actions={actions}>
          {mockChildren}
        </ChartCard>,
      )

      const actionsContainer = container.querySelector('.flex.items-center.gap-2')
      expect(actionsContainer).toBeInTheDocument()
      expect(screen.getByTestId('test-action').parentElement).toBe(actionsContainer)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty title', () => {
      render(<ChartCard title="">{mockChildren}</ChartCard>)

      // Should still render without crashing
      const { container } = render(<ChartCard title="">{mockChildren}</ChartCard>)
      expect(container.querySelector('.rounded-lg')).toBeInTheDocument()
    })

    it('should handle null children', () => {
      render(<ChartCard title="Test Chart">{null}</ChartCard>)

      const title = screen.getByText('Test Chart')
      expect(title).toBeInTheDocument()
    })

    it('should handle undefined children', () => {
      render(<ChartCard title="Test Chart">{undefined}</ChartCard>)

      const title = screen.getByText('Test Chart')
      expect(title).toBeInTheDocument()
    })

    it('should handle empty actions array', () => {
      render(
        <ChartCard title="Test Chart" actions={[]}>
          {mockChildren}
        </ChartCard>,
      )

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('HTML Structure', () => {
    it('should have proper semantic structure', () => {
      const { container } = render(<ChartCard title="Test Chart">{mockChildren}</ChartCard>)

      const title = screen.getByRole('heading', { level: 3 })
      expect(title).toBeInTheDocument()
    })

    it('should render p element for description', () => {
      render(
        <ChartCard title="Test Chart" description="Test description">
          {mockChildren}
        </ChartCard>,
      )

      const description = screen.getByText('Test description')
      expect(description.tagName).toBe('P')
    })
  })
})
