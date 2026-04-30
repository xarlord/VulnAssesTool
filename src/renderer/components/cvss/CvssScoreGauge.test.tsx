import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CvssScoreGauge } from './CvssScoreGauge'
import type { CvssBreakdown } from '@@/types'

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children, width, height }: { children: any; width: number; height: number }) => (
    <div style={{ width, height }} data-testid="responsive-container">
      {children}
    </div>
  ),
  RadarChart: ({ children, data }: { children: any; data: any[] }) => (
    <div data-testid="radar-chart" data-length={data.length}>
      {children}
    </div>
  ),
  PolarGrid: () => <div data-testid="polar-grid" />,
  PolarAngleAxis: () => <div data-testid="polar-angle-axis" />,
  PolarRadiusAxis: () => <div data-testid="polar-radius-axis" />,
  Radar: ({ name, dataKey }: { name: string; dataKey: string }) => (
    <div data-testid="radar" data-name={name} data-key={dataKey} />
  ),
}))

// Mock CVSS utilities
vi.mock('@/lib/cvss', () => ({
  getSeverityColorHex: vi.fn((severity: string) => {
    const colors: Record<string, string> = {
      critical: '#dc2626',
      high: '#ea580c',
      medium: '#ca8a04',
      low: '#16a34a',
      none: '#6b7280',
    }
    return colors[severity] || '#6b7280'
  }),
  getRadarChartData: vi.fn((breakdown: CvssBreakdown) => [
    { metric: 'AV', value: 0.85 },
    { metric: 'AC', value: 0.77 },
    { metric: 'PR', value: 0.85 },
    { metric: 'UI', value: 0.85 },
    { metric: 'S', value: 1 },
    { metric: 'C', value: 0.56 },
    { metric: 'I', value: 0.56 },
    { metric: 'A', value: 0.56 },
  ]),
}))

const createMockBreakdown = (overrides?: Partial<CvssBreakdown>): CvssBreakdown => ({
  vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
  version: '3.1',
  metrics: {
    attackVector: 'Network',
    attackComplexity: 'Low',
    privilegesRequired: 'None',
    userInteraction: 'None',
    scope: 'Unchanged',
    confidentialityImpact: 'High',
    integrityImpact: 'High',
    availabilityImpact: 'High',
  },
  scores: {
    baseScore: 9.8,
    impactSubScore: 5.9,
    exploitabilitySubScore: 3.9,
  },
  severity: 'critical',
  explanations: [],
  ...overrides,
})

describe('CvssScoreGauge', () => {
  it('should render radar chart', () => {
    const breakdown = createMockBreakdown()
    render(<CvssScoreGauge breakdown={breakdown} />)

    expect(screen.getByTestId('radar-chart')).toBeInTheDocument()
    expect(screen.getByTestId('polar-grid')).toBeInTheDocument()
    expect(screen.getByTestId('radar')).toBeInTheDocument()
  })

  it('should display base score when showLabel is true', () => {
    const breakdown = createMockBreakdown({
      scores: { baseScore: 9.8, impactSubScore: 5.9, exploitabilitySubScore: 3.9 },
    })
    render(<CvssScoreGauge breakdown={breakdown} showLabel={true} />)

    expect(screen.getByText('9.8')).toBeInTheDocument()
  })

  it('should not display score label when showLabel is false', () => {
    const breakdown = createMockBreakdown({
      scores: { baseScore: 9.8, impactSubScore: 5.9, exploitabilitySubScore: 3.9 },
    })
    render(<CvssScoreGauge breakdown={breakdown} showLabel={false} />)

    expect(screen.queryByText('9.8')).not.toBeInTheDocument()
  })

  it('should display severity text', () => {
    const breakdown = createMockBreakdown({ severity: 'critical' })
    render(<CvssScoreGauge breakdown={breakdown} showLabel={true} />)

    expect(screen.getByText('critical')).toBeInTheDocument()
  })

  it('should use custom size when provided', () => {
    const breakdown = createMockBreakdown()
    render(<CvssScoreGauge breakdown={breakdown} size={150} />)

    const container = screen.getByTestId('responsive-container')
    expect(container).toHaveAttribute('style')
    expect(container?.getAttribute('style')).toContain('150')
  })

  it('should use default size when not provided', () => {
    const breakdown = createMockBreakdown()
    render(<CvssScoreGauge breakdown={breakdown} />)

    const container = screen.getByTestId('responsive-container')
    expect(container).toHaveAttribute('style')
    expect(container?.getAttribute('style')).toContain('200')
  })

  it('should display impact sub-score by default', () => {
    const breakdown = createMockBreakdown({
      scores: { baseScore: 9.8, impactSubScore: 5.9, exploitabilitySubScore: 3.9 },
    })
    render(<CvssScoreGauge breakdown={breakdown} showSubScores={true} />)

    expect(screen.getByText('5.9')).toBeInTheDocument()
    expect(screen.getByText('Impact')).toBeInTheDocument()
  })

  it('should display exploitability sub-score by default', () => {
    const breakdown = createMockBreakdown({
      scores: { baseScore: 9.8, impactSubScore: 5.9, exploitabilitySubScore: 3.9 },
    })
    render(<CvssScoreGauge breakdown={breakdown} showSubScores={true} />)

    expect(screen.getByText('3.9')).toBeInTheDocument()
    expect(screen.getByText('Exploitability')).toBeInTheDocument()
  })

  it('should hide sub-scores when showSubScores is false', () => {
    const breakdown = createMockBreakdown({
      scores: { baseScore: 9.8, impactSubScore: 5.9, exploitabilitySubScore: 3.9 },
    })
    render(<CvssScoreGauge breakdown={breakdown} showSubScores={false} />)

    expect(screen.queryByText('Impact')).not.toBeInTheDocument()
    expect(screen.queryByText('Exploitability')).not.toBeInTheDocument()
  })

  it('should display "out of 10.0" label', () => {
    const breakdown = createMockBreakdown()
    render(<CvssScoreGauge breakdown={breakdown} showLabel={true} />)

    expect(screen.getByText(/out of 10.0/i)).toBeInTheDocument()
  })
})
