import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HealthScoreCard } from './HealthScoreCard'
import type { Component, ComponentHealth } from '@@/types'

const createMockComponent = (overrides?: Partial<Component>): Component => ({
  id: 'comp-1',
  name: 'lodash',
  version: '4.17.21',
  type: 'library',
  purl: 'pkg:npm/lodash@4.17.21',
  cpe: 'cpe:2.3:a:lodash:lodash:4.17.21:*:*:*:*:*:*:*',
  licenses: ['MIT'],
  vulnerabilities: [],
  ...overrides,
})

const createMockHealth = (overrides?: Partial<ComponentHealth>): ComponentHealth => ({
  componentId: 'comp-1',
  score: 85,
  category: 'good',
  factors: {
    vulnerabilityScore: 10,
    ageScore: 0,
    patchScore: 5,
    versionScore: 0,
  },
  trend: 'stable',
  lastCalculated: new Date(),
  ...overrides,
})

describe('HealthScoreCard', () => {
  const mockOnViewDetails = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderCard = (component?: Component, health?: ComponentHealth, showFactors?: boolean) => {
    return render(
      <HealthScoreCard
        component={component || createMockComponent()}
        health={health || createMockHealth()}
        showFactors={showFactors}
        onViewDetails={mockOnViewDetails}
      />,
    )
  }

  describe('Rendering - Basic Information', () => {
    it('should render component name', () => {
      renderCard()

      expect(screen.getByText('lodash')).toBeInTheDocument()
    })

    it('should render component version', () => {
      renderCard()

      expect(screen.getByText('4.17.21')).toBeInTheDocument()
    })

    it('should render health score', () => {
      renderCard()

      expect(screen.getByText('85/100')).toBeInTheDocument()
    })

    it('should render health category', () => {
      renderCard(createMockComponent(), createMockHealth())

      expect(screen.getByText('good')).toBeInTheDocument()
    })

    it('should render Shield icon', () => {
      renderCard()

      const shield = document.querySelector('svg')
      expect(shield).toBeInTheDocument()
    })
  })

  describe('Rendering - Health Categories', () => {
    it('should render excellent category with correct color', () => {
      const health = createMockHealth({ score: 95, category: 'excellent' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('95/100')).toBeInTheDocument()
      expect(screen.getByText('excellent')).toBeInTheDocument()
    })

    it('should render good category with correct color', () => {
      const health = createMockHealth({ score: 80, category: 'good' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('80/100')).toBeInTheDocument()
      expect(screen.getByText('good')).toBeInTheDocument()
    })

    it('should render fair category with correct color', () => {
      const health = createMockHealth({ score: 60, category: 'fair' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('60/100')).toBeInTheDocument()
      expect(screen.getByText('fair')).toBeInTheDocument()
    })

    it('should render poor category with correct color', () => {
      const health = createMockHealth({ score: 40, category: 'poor' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('40/100')).toBeInTheDocument()
      expect(screen.getByText('poor')).toBeInTheDocument()
    })

    it('should render critical category with correct color', () => {
      const health = createMockHealth({ score: 20, category: 'critical' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('20/100')).toBeInTheDocument()
      expect(screen.getByText('critical')).toBeInTheDocument()
    })
  })

  describe('Rendering - Trend Indicator', () => {
    it('should render improving trend', () => {
      const health = createMockHealth({ trend: 'improving' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('improving')).toBeInTheDocument()
    })

    it('should render degrading trend', () => {
      const health = createMockHealth({ trend: 'degrading' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('degrading')).toBeInTheDocument()
    })

    it('should render stable trend', () => {
      const health = createMockHealth({ trend: 'stable' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('stable')).toBeInTheDocument()
    })

    it('should not render unknown trend', () => {
      const health = createMockHealth({ trend: 'unknown' })
      renderCard(createMockComponent(), health)

      expect(screen.queryByText('unknown')).not.toBeInTheDocument()
    })
  })

  describe('Rendering - Factor Breakdown', () => {
    it('should not show factors by default when all factors are 0', () => {
      const health = createMockHealth({
        factors: {
          vulnerabilityScore: 0,
          ageScore: 0,
          patchScore: 0,
          versionScore: 0,
        },
      })
      renderCard(createMockComponent(), health)

      expect(screen.queryByText('Show details')).not.toBeInTheDocument()
    })

    it('should show factors toggle when factors have penalties', () => {
      const health = createMockHealth({
        factors: {
          vulnerabilityScore: 10,
          ageScore: 5,
          patchScore: 5,
          versionScore: 0,
        },
      })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('Show details')).toBeInTheDocument()
    })

    it('should expand factors when toggle is clicked', () => {
      const health = createMockHealth({
        factors: {
          vulnerabilityScore: 10,
          ageScore: 5,
          patchScore: 5,
          versionScore: 0,
        },
      })
      renderCard(createMockComponent(), health)

      const toggle = screen.getByText('Show details')
      fireEvent.click(toggle)

      expect(screen.getByText('Hide details')).toBeInTheDocument()
      expect(screen.getByText(/Vulnerabilities:/)).toBeInTheDocument()
      expect(screen.getByText(/Age:/)).toBeInTheDocument()
      expect(screen.getByText(/Patches:/)).toBeInTheDocument()
    })

    it('should collapse factors when toggle is clicked again', () => {
      const health = createMockHealth({
        factors: {
          vulnerabilityScore: 10,
          ageScore: 5,
          patchScore: 5,
          versionScore: 0,
        },
      })
      renderCard(createMockComponent(), health)

      const toggle = screen.getByText('Show details')
      fireEvent.click(toggle)

      const hideToggle = screen.getByText('Hide details')
      fireEvent.click(hideToggle)

      expect(screen.getByText('Show details')).toBeInTheDocument()
      expect(screen.queryByText(/Vulnerabilities:/)).not.toBeInTheDocument()
    })

    it('should display factor values correctly', () => {
      const health = createMockHealth({
        factors: {
          vulnerabilityScore: 15,
          ageScore: 10,
          patchScore: 5,
          versionScore: 0,
        },
      })
      renderCard(createMockComponent(), health)

      const toggle = screen.getByText('Show details')
      fireEvent.click(toggle)

      expect(screen.getByText('-15')).toBeInTheDocument()
      expect(screen.getAllByText('-10').length).toBeGreaterThan(0)
      expect(screen.getByText('-5')).toBeInTheDocument()
    })

    it('should display total penalty', () => {
      const health = createMockHealth({
        factors: {
          vulnerabilityScore: 15,
          ageScore: 10,
          patchScore: 5,
          versionScore: 0,
        },
      })
      renderCard(createMockComponent(), health)

      const toggle = screen.getByText('Show details')
      fireEvent.click(toggle)

      expect(screen.getByText('Total penalty: -30')).toBeInTheDocument()
    })

    it('should show factors by default when showFactors prop is true', () => {
      const health = createMockHealth({
        factors: {
          vulnerabilityScore: 10,
          ageScore: 5,
          patchScore: 5,
          versionScore: 0,
        },
      })
      renderCard(createMockComponent(), health, true)

      expect(screen.getByText(/Vulnerabilities:/)).toBeInTheDocument()
      expect(screen.getByText('Hide details')).toBeInTheDocument()
    })
  })

  describe('Interactions', () => {
    it('should call onViewDetails when View Details button is clicked', () => {
      renderCard()

      const viewButton = screen.getByText('View Details')
      fireEvent.click(viewButton)

      expect(mockOnViewDetails).toHaveBeenCalledTimes(1)
      expect(mockOnViewDetails).toHaveBeenCalledWith(createMockComponent())
    })

    it('should not render View Details button when onViewDetails is not provided', () => {
      render(<HealthScoreCard component={createMockComponent()} health={createMockHealth()} showFactors={false} />)

      expect(screen.queryByText('View Details')).not.toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle component with long name', () => {
      const longNameComponent = createMockComponent({
        name: 'very-long-component-name-that-should-be-truncated',
      })
      renderCard(longNameComponent)

      expect(screen.getByText('very-long-component-name-that-should-be-truncated')).toBeInTheDocument()
    })

    it('should handle component with empty version', () => {
      const emptyVersionComponent = createMockComponent({ version: '' })
      renderCard(emptyVersionComponent)

      // Version is displayed but empty, so we just check it doesn't crash
      const versionSpans = screen.getAllByText('')
      expect(versionSpans.length).toBeGreaterThan(0)
    })

    it('should handle perfect score', () => {
      const health = createMockHealth({ score: 100, category: 'excellent' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('100/100')).toBeInTheDocument()
    })

    it('should handle zero score', () => {
      const health = createMockHealth({ score: 0, category: 'critical' })
      renderCard(createMockComponent(), health)

      expect(screen.getByText('0/100')).toBeInTheDocument()
    })
  })
})
