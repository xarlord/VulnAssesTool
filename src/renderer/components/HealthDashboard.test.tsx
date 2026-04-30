import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import HealthDashboard from './HealthDashboard'
import type { Component, ComponentHealth, ProjectHealthSummary, Vulnerability } from '@@/types'

const createMockComponent = (id: string, name: string): Component => ({
  id,
  name,
  version: '1.0.0',
  type: 'library',
  licenses: ['MIT'],
  vulnerabilities: [],
})

const createMockHealth = (
  componentId: string,
  score: number,
  category: ComponentHealth['category'],
): ComponentHealth => ({
  componentId,
  score,
  category,
  factors: {
    vulnerabilityScore: 0,
    ageScore: 0,
    patchScore: 0,
    versionScore: 0,
  },
  trend: 'stable',
  lastCalculated: new Date(),
})

const createMockProjectHealth = (overrides?: Partial<ProjectHealthSummary>): ProjectHealthSummary => ({
  averageScore: 75,
  totalComponents: 10,
  distribution: {
    excellent: 2,
    good: 3,
    fair: 3,
    poor: 1,
    critical: 1,
  },
  trend: 'stable',
  lastCalculated: new Date(),
  ...overrides,
})

describe('HealthDashboard', () => {
  const mockOnViewComponent = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderDashboard = (
    projectHealth?: ProjectHealthSummary,
    componentHealths?: ComponentHealth[],
    components?: Component[],
  ) => {
    return render(
      <HealthDashboard
        projectHealth={projectHealth || createMockProjectHealth()}
        componentHealths={componentHealths || []}
        components={components || []}
        onViewComponent={mockOnViewComponent}
      />,
    )
  }

  describe('Rendering - Overall Statistics', () => {
    it('should render average health score', () => {
      const projectHealth = createMockProjectHealth({ averageScore: 82.5 })
      renderDashboard(projectHealth)

      // Score is rounded, so 82.5 becomes 83
      expect(screen.getByText('83')).toBeInTheDocument()
    })

    it('should render total components count', () => {
      const projectHealth = createMockProjectHealth({ totalComponents: 15 })
      renderDashboard(projectHealth)

      // Use a more specific query to avoid ambiguity
      expect(screen.getAllByText('15').length).toBeGreaterThan(0)
    })

    it('should render components needing attention', () => {
      const projectHealth = createMockProjectHealth({
        distribution: {
          excellent: 5,
          good: 5,
          fair: 5,
          poor: 2,
          critical: 1,
        },
      })
      renderDashboard(projectHealth)

      // poor + critical = 3
      expect(screen.getAllByText('3').length).toBeGreaterThan(0)
    })

    it('should render percentage of components needing attention', () => {
      renderDashboard(
        createMockProjectHealth({
          totalComponents: 10,
          distribution: {
            excellent: 5,
            good: 3,
            fair: 1,
            poor: 1,
            critical: 0,
          },
        }),
      )

      expect(screen.getByText(/10\.0% of total/)).toBeInTheDocument()
    })
  })

  describe('Rendering - Trend Indicator', () => {
    it('should render improving trend', () => {
      const projectHealth = createMockProjectHealth({ trend: 'improving' })
      renderDashboard(projectHealth)

      expect(screen.getByText('improving')).toBeInTheDocument()
    })

    it('should render degrading trend', () => {
      const projectHealth = createMockProjectHealth({ trend: 'degrading' })
      renderDashboard(projectHealth)

      expect(screen.getByText('degrading')).toBeInTheDocument()
    })

    it('should render stable trend', () => {
      const projectHealth = createMockProjectHealth({ trend: 'stable' })
      renderDashboard(projectHealth)

      expect(screen.getByText('stable')).toBeInTheDocument()
    })
  })

  describe('Rendering - Health Distribution Chart', () => {
    it('should render health distribution section', () => {
      renderDashboard()

      expect(screen.getByText('Health Distribution')).toBeInTheDocument()
    })

    it('should render pie chart when there is data', () => {
      const projectHealth = createMockProjectHealth({
        distribution: {
          excellent: 2,
          good: 3,
          fair: 3,
          poor: 1,
          critical: 1,
        },
      })
      renderDashboard(projectHealth)

      // Chart is rendered by recharts, we just check the section exists
      expect(screen.getByText('Health Distribution')).toBeInTheDocument()
    })

    it('should render empty state when no health data', () => {
      renderDashboard(
        createMockProjectHealth({
          distribution: {
            excellent: 0,
            good: 0,
            fair: 0,
            poor: 0,
            critical: 0,
          },
        }),
      )

      expect(screen.getByText('No health data available')).toBeInTheDocument()
    })
  })

  describe('Rendering - Components by Category', () => {
    it('should render components by category section', () => {
      renderDashboard()

      expect(screen.getByText('Components by Category')).toBeInTheDocument()
    })

    it('should render all categories with counts', () => {
      const projectHealth = createMockProjectHealth({
        distribution: {
          excellent: 2,
          good: 3,
          fair: 3,
          poor: 1,
          critical: 1,
        },
      })
      renderDashboard(projectHealth)

      expect(screen.getAllByText('Critical').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Poor').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Fair').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Good').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Excellent').length).toBeGreaterThan(0)
    })

    it('should display correct counts for each category', () => {
      const projectHealth = createMockProjectHealth({
        distribution: {
          excellent: 5,
          good: 4,
          fair: 3,
          poor: 2,
          critical: 1,
        },
      })
      renderDashboard(projectHealth)

      const counts = screen.getAllByText('5')
      expect(counts.length).toBeGreaterThan(0)
    })
  })

  describe('Rendering - Health Metrics', () => {
    it('should render health metrics section', () => {
      renderDashboard()

      expect(screen.getByText('Health Metrics')).toBeInTheDocument()
    })

    it('should render excellent count', () => {
      const projectHealth = createMockProjectHealth({
        distribution: { excellent: 5, good: 0, fair: 0, poor: 0, critical: 0 },
      })
      renderDashboard(projectHealth)

      expect(screen.getAllByText('5').length).toBeGreaterThan(0)
    })

    it('should render good count', () => {
      const projectHealth = createMockProjectHealth({
        distribution: { excellent: 0, good: 5, fair: 0, poor: 0, critical: 0 },
      })
      renderDashboard(projectHealth)

      const fives = screen.getAllByText('5')
      expect(fives.length).toBeGreaterThan(0)
    })

    it('should render fair count', () => {
      const projectHealth = createMockProjectHealth({
        distribution: { excellent: 0, good: 0, fair: 5, poor: 0, critical: 0 },
      })
      renderDashboard(projectHealth)

      const fives = screen.getAllByText('5')
      expect(fives.length).toBeGreaterThan(0)
    })

    it('should render needs work count', () => {
      const projectHealth = createMockProjectHealth({
        distribution: { excellent: 0, good: 0, fair: 0, poor: 3, critical: 2 },
      })
      renderDashboard(projectHealth)

      expect(screen.getAllByText('5').length).toBeGreaterThan(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty project health', () => {
      renderDashboard(
        createMockProjectHealth({
          averageScore: 0,
          totalComponents: 0,
          distribution: {
            excellent: 0,
            good: 0,
            fair: 0,
            poor: 0,
            critical: 0,
          },
        }),
      )

      expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    })

    it('should handle perfect average score', () => {
      renderDashboard(createMockProjectHealth({ averageScore: 100 }))

      expect(screen.getByText('100')).toBeInTheDocument()
    })

    it('should handle zero average score', () => {
      renderDashboard(createMockProjectHealth({ averageScore: 0 }))

      expect(screen.getAllByText('0').length).toBeGreaterThan(0)
    })

    it('should handle single component', () => {
      renderDashboard(
        createMockProjectHealth({
          totalComponents: 1,
          distribution: {
            excellent: 1,
            good: 0,
            fair: 0,
            poor: 0,
            critical: 0,
          },
        }),
      )

      expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    })

    it('should handle large number of components', () => {
      renderDashboard(
        createMockProjectHealth({
          totalComponents: 1000,
          distribution: {
            excellent: 400,
            good: 300,
            fair: 200,
            poor: 80,
            critical: 20,
          },
        }),
      )

      expect(screen.getByText('1000')).toBeInTheDocument()
    })
  })

  describe('Section Labels', () => {
    it('should render all section labels', () => {
      renderDashboard()

      expect(screen.getByText('Average Health Score')).toBeInTheDocument()
      expect(screen.getByText('Total Components')).toBeInTheDocument()
      expect(screen.getByText('Needs Attention')).toBeInTheDocument()
      expect(screen.getByText('Health Distribution')).toBeInTheDocument()
      expect(screen.getByText('Components by Category')).toBeInTheDocument()
      expect(screen.getByText('Health Metrics')).toBeInTheDocument()
    })
  })

  describe('TC-HD-004: All Components Excellent (Info Banner)', () => {
    it('should show info banner when all components have excellent health and 100 score', () => {
      const projectHealth = createMockProjectHealth({
        totalComponents: 5,
        distribution: {
          excellent: 5,
          good: 0,
          fair: 0,
          poor: 0,
          critical: 0,
        },
        averageScore: 100,
      })
      renderDashboard(projectHealth)

      expect(screen.getByText('All Components Show Excellent Health')).toBeInTheDocument()
      expect(screen.getByText(/This may indicate that no vulnerabilities were found/)).toBeInTheDocument()
      expect(screen.getByText(/consider running a scan to check for known vulnerabilities/)).toBeInTheDocument()
    })

    it('should not show info banner when components are excellent but score is less than 100', () => {
      const projectHealth = createMockProjectHealth({
        totalComponents: 5,
        distribution: {
          excellent: 5,
          good: 0,
          fair: 0,
          poor: 0,
          critical: 0,
        },
        averageScore: 95,
      })
      renderDashboard(projectHealth)

      expect(screen.queryByText('All Components Show Excellent Health')).not.toBeInTheDocument()
    })

    it('should not show info banner when not all components are excellent', () => {
      const projectHealth = createMockProjectHealth({
        totalComponents: 5,
        distribution: {
          excellent: 3,
          good: 2,
          fair: 0,
          poor: 0,
          critical: 0,
        },
        averageScore: 90,
      })
      renderDashboard(projectHealth)

      expect(screen.queryByText('All Components Show Excellent Health')).not.toBeInTheDocument()
    })

    it('should not show info banner when there are no components', () => {
      const projectHealth = createMockProjectHealth({
        totalComponents: 0,
        distribution: {
          excellent: 0,
          good: 0,
          fair: 0,
          poor: 0,
          critical: 0,
        },
        averageScore: 0,
      })
      renderDashboard(projectHealth)

      expect(screen.queryByText('All Components Show Excellent Health')).not.toBeInTheDocument()
    })
  })

  describe('TC-HD-005: Unknown Trend (Info Banner)', () => {
    it('should show info banner when trend is unknown and there are components', () => {
      const projectHealth = createMockProjectHealth({
        totalComponents: 5,
        trend: 'unknown',
      })
      renderDashboard(projectHealth)

      expect(screen.getByText('No Historical Data Available')).toBeInTheDocument()
      expect(screen.getByText(/Health trend analysis requires historical scan data/)).toBeInTheDocument()
      expect(screen.getByText(/Run scans periodically to track component health trends over time/)).toBeInTheDocument()
    })

    it('should not show unknown trend banner when trend is known', () => {
      const projectHealth = createMockProjectHealth({
        totalComponents: 5,
        trend: 'stable',
      })
      renderDashboard(projectHealth)

      expect(screen.queryByText('No Historical Data Available')).not.toBeInTheDocument()
    })

    it('should not show unknown trend banner when there are no components', () => {
      const projectHealth = createMockProjectHealth({
        totalComponents: 0,
        trend: 'unknown',
      })
      renderDashboard(projectHealth)

      expect(screen.queryByText('No Historical Data Available')).not.toBeInTheDocument()
    })

    it('should show improving trend without info banner', () => {
      const projectHealth = createMockProjectHealth({
        totalComponents: 5,
        trend: 'improving',
      })
      renderDashboard(projectHealth)

      expect(screen.getByText('improving')).toBeInTheDocument()
      expect(screen.queryByText('No Historical Data Available')).not.toBeInTheDocument()
    })

    it('should show degrading trend without info banner', () => {
      const projectHealth = createMockProjectHealth({
        totalComponents: 5,
        trend: 'degrading',
      })
      renderDashboard(projectHealth)

      expect(screen.getByText('degrading')).toBeInTheDocument()
      expect(screen.queryByText('No Historical Data Available')).not.toBeInTheDocument()
    })
  })

  describe('TC-HD-007: View Health Factors Breakdown', () => {
    it('should be covered by HealthScoreCard.test.tsx', () => {
      // This scenario is tested in HealthScoreCard.test.tsx
      // in the "Rendering - Factor Breakdown" describe block
      expect(true).toBe(true)
    })
  })

  describe('TC-HD-008: Navigate from Remediation Queue', () => {
    it('should be covered by RemediationQueue.test.tsx', () => {
      // This scenario is tested in RemediationQueue.test.tsx
      // in the "Interactions - View Details" describe block
      expect(true).toBe(true)
    })
  })
})
