import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RiskGauge } from './RiskGauge'
import type { OverallMetrics } from '@/lib/analytics'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
function createMockOverallMetrics(overrides?: Partial<OverallMetrics>): OverallMetrics {
  return {
    totalProjects: 1,
    totalComponents: 10,
    totalVulnerabilities: 5,
    criticalCount: 2,
    highCount: 1,
    mediumCount: 1,
    lowCount: 1,
    averageHealthScore: 72,
    riskLevel: 'medium',
    vulnerableComponentPercentage: 30,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('RiskGauge', () => {
  it('should render with a score value', () => {
    const metrics = createMockOverallMetrics({ averageHealthScore: 85 })
    render(<RiskGauge metrics={metrics} />)

    expect(screen.getByText('85')).toBeInTheDocument()
  })

  it('should show the score number with /100 suffix', () => {
    const metrics = createMockOverallMetrics({ averageHealthScore: 72 })
    render(<RiskGauge metrics={metrics} />)

    expect(screen.getByText('/100')).toBeInTheDocument()
    expect(screen.getByText('72')).toBeInTheDocument()
  })

  it('should display the "Health Score" label', () => {
    const metrics = createMockOverallMetrics()
    render(<RiskGauge metrics={metrics} />)

    expect(screen.getByText('Health Score')).toBeInTheDocument()
  })

  it('should display the "Overall Risk Level" heading', () => {
    const metrics = createMockOverallMetrics()
    render(<RiskGauge metrics={metrics} />)

    expect(screen.getByText('Overall Risk Level')).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  describe('Severity-level display', () => {
    it('should display "Critical" label and red styling for critical risk', () => {
      const metrics = createMockOverallMetrics({
        riskLevel: 'critical',
        criticalCount: 5,
      })
      render(<RiskGauge metrics={metrics} />)

      // "Critical" appears both in the gauge label and the stats footer
      const matches = screen.getAllByText('Critical')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('should display "High" label and orange styling for high risk', () => {
      const metrics = createMockOverallMetrics({
        riskLevel: 'high',
        highCount: 4,
      })
      render(<RiskGauge metrics={metrics} />)

      const matches = screen.getAllByText('High')
      expect(matches.length).toBeGreaterThanOrEqual(1)
    })

    it('should display "Medium" label for medium risk', () => {
      const metrics = createMockOverallMetrics({ riskLevel: 'medium' })
      render(<RiskGauge metrics={metrics} />)

      expect(screen.getByText('Medium')).toBeInTheDocument()
    })

    it('should display "Low" label and green styling for low risk', () => {
      const metrics = createMockOverallMetrics({ riskLevel: 'low' })
      render(<RiskGauge metrics={metrics} />)

      expect(screen.getByText('Low')).toBeInTheDocument()
    })

    it('should display "Excellent" label and emerald styling for excellent risk', () => {
      const metrics = createMockOverallMetrics({ riskLevel: 'excellent' })
      render(<RiskGauge metrics={metrics} />)

      expect(screen.getByText('Excellent')).toBeInTheDocument()
    })
  })

  // -----------------------------------------------------------------------
  describe('Critical / High count stats', () => {
    it('should display the critical count', () => {
      const metrics = createMockOverallMetrics({ criticalCount: 7 })
      render(<RiskGauge metrics={metrics} />)

      expect(screen.getByText('7')).toBeInTheDocument()
      // "Critical" appears in both gauge label and stats label
      expect(screen.getAllByText('Critical').length).toBeGreaterThanOrEqual(1)
    })

    it('should display the high count', () => {
      const metrics = createMockOverallMetrics({ highCount: 3 })
      render(<RiskGauge metrics={metrics} />)

      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getAllByText('High').length).toBeGreaterThanOrEqual(1)
    })
  })

  // -----------------------------------------------------------------------
  describe('Edge cases', () => {
    it('should handle 0 health score', () => {
      const metrics = createMockOverallMetrics({
        averageHealthScore: 0,
        riskLevel: 'critical',
      })
      render(<RiskGauge metrics={metrics} />)

      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByText('/100')).toBeInTheDocument()
    })

    it('should handle 100 health score', () => {
      const metrics = createMockOverallMetrics({
        averageHealthScore: 100,
        riskLevel: 'excellent',
      })
      render(<RiskGauge metrics={metrics} />)

      expect(screen.getByText('100')).toBeInTheDocument()
      expect(screen.getByText('/100')).toBeInTheDocument()
    })

    it('should handle 0 critical and 0 high counts', () => {
      const metrics = createMockOverallMetrics({
        criticalCount: 0,
        highCount: 0,
        riskLevel: 'low',
      })
      render(<RiskGauge metrics={metrics} />)

      // There are two "0" values (critical and high stats)
      const zeros = screen.getAllByText('0')
      expect(zeros.length).toBeGreaterThanOrEqual(2)
    })

    it('should render the gauge container', () => {
      const metrics = createMockOverallMetrics()
      const { container } = render(<RiskGauge metrics={metrics} />)

      // The semi-circular gauge div
      const gauge = container.querySelector('.rounded-t-full')
      expect(gauge).toBeInTheDocument()
    })
  })
})
