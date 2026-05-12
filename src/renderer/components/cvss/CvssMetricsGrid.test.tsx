import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CvssMetricsGrid } from './CvssMetricsGrid'
import type { CvssBreakdown } from '@@/types'

// Mock CVSS utilities
vi.mock('@/lib/cvss', () => ({
  getSeverityColorClass: vi.fn((severity: string) => {
    const classes: Record<string, string> = {
      critical: 'text-critical',
      high: 'text-high',
      medium: 'text-medium',
      low: 'text-low',
      none: 'text-none',
    }
    return classes[severity] || 'text-none'
  }),
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
  explanations: [
    {
      metric: 'Attack Vector (AV)',
      value: 'Network',
      description: 'This vulnerability is exploitable over the network',
      implications: 'More accessible to attackers',
      example: 'Remote code execution via network',
    },
    {
      metric: 'Attack Complexity (AC)',
      value: 'Low',
      description: 'Specialized access conditions or extenuating circumstances do not exist',
      implications: 'Easier to exploit',
      example: 'No authentication required',
    },
  ],
  ...overrides,
})

describe('CvssMetricsGrid', () => {
  it('should render header', () => {
    const breakdown = createMockBreakdown()
    render(<CvssMetricsGrid breakdown={breakdown} />)

    expect(screen.getByText('CVSS Metrics')).toBeInTheDocument()
  })

  it('should show Show button when collapsed', () => {
    const breakdown = createMockBreakdown()
    render(<CvssMetricsGrid breakdown={breakdown} expanded={false} />)

    expect(screen.getByText('Show')).toBeInTheDocument()
  })

  it('should show Hide button when expanded', () => {
    const breakdown = createMockBreakdown()
    render(<CvssMetricsGrid breakdown={breakdown} expanded={true} />)

    expect(screen.getByText('Hide')).toBeInTheDocument()
  })

  it('should not show explanations when collapsed', () => {
    const breakdown = createMockBreakdown()
    render(<CvssMetricsGrid breakdown={breakdown} expanded={false} />)

    expect(screen.queryByText('Attack Vector (AV)')).not.toBeInTheDocument()
    expect(screen.queryByText('Attack Complexity (AC)')).not.toBeInTheDocument()
  })

  it('should show explanations when expanded', () => {
    const breakdown = createMockBreakdown()
    render(<CvssMetricsGrid breakdown={breakdown} expanded={true} />)

    expect(screen.getByText('Attack Vector (AV)')).toBeInTheDocument()
    expect(screen.getByText('Attack Complexity (AC)')).toBeInTheDocument()
  })

  it('should toggle expanded state on button click', () => {
    const breakdown = createMockBreakdown()
    render(<CvssMetricsGrid breakdown={breakdown} expanded={false} />)

    const showButton = screen.getByText('Show')
    fireEvent.click(showButton)

    expect(screen.getByText('Hide')).toBeInTheDocument()
    expect(screen.getByText('Attack Vector (AV)')).toBeInTheDocument()
  })

  it('should call onToggle callback when toggled', () => {
    const breakdown = createMockBreakdown()
    const onToggle = vi.fn()
    render(<CvssMetricsGrid breakdown={breakdown} expanded={false} onToggle={onToggle} />)

    const showButton = screen.getByText('Show')
    fireEvent.click(showButton)

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('should display metric cards with correct data', () => {
    const breakdown = createMockBreakdown()
    render(<CvssMetricsGrid breakdown={breakdown} expanded={true} />)

    expect(screen.getByText('Network')).toBeInTheDocument()
    expect(screen.getByText('Low')).toBeInTheDocument()
    expect(screen.getByText('This vulnerability is exploitable over the network')).toBeInTheDocument()
    expect(screen.getByText('More accessible to attackers')).toBeInTheDocument()
  })

  it('should display impact and example sections', () => {
    const breakdown = createMockBreakdown()
    render(<CvssMetricsGrid breakdown={breakdown} expanded={true} />)

    // Use getAllByText since "Impact:" appears multiple times (once per metric)
    expect(screen.getAllByText('Impact:').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Example:').length).toBeGreaterThan(0)
    expect(screen.getByText('Remote code execution via network')).toBeInTheDocument()
  })

  it('should render multiple explanation cards', () => {
    const breakdown = createMockBreakdown()
    render(<CvssMetricsGrid breakdown={breakdown} expanded={true} />)

    expect(screen.getByText('Attack Vector (AV)')).toBeInTheDocument()
    expect(screen.getByText('Attack Complexity (AC)')).toBeInTheDocument()
  })

  it('should handle empty explanations', () => {
    const breakdown = createMockBreakdown({ explanations: [] })
    render(<CvssMetricsGrid breakdown={breakdown} expanded={true} />)

    // Should render without crashing, but no metric cards
    expect(screen.queryByText('Attack Vector (AV)')).not.toBeInTheDocument()
  })

  it('should display green color for lower risk values', () => {
    const breakdown = createMockBreakdown({
      explanations: [
        {
          metric: 'Attack Vector (AV)',
          value: 'Local',
          description: 'Requires local access',
          implications: 'Less accessible to attackers',
          example: 'Local code execution',
        },
      ],
    })
    const { container } = render(<CvssMetricsGrid breakdown={breakdown} expanded={true} />)

    // Local is not in highRiskValues, so it gets green color
    const greenElements = container.querySelectorAll('.text-green-600')
    expect(greenElements.length).toBeGreaterThan(0)
  })
})
