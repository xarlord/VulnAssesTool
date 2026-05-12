import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CvssVectorString } from './CvssVectorString'
import type { CvssBreakdown } from '@@/types'

// Mock CVSS utilities
vi.mock('@/lib/cvss', () => ({
  formatCvssVector: vi.fn((vectorString: string) => {
    return [
      { abbreviation: 'AV', value: 'N', label: 'Attack Vector', fullLabel: 'Network' },
      { abbreviation: 'AC', value: 'L', label: 'Attack Complexity', fullLabel: 'Low' },
      { abbreviation: 'PR', value: 'N', label: 'Privileges Required', fullLabel: 'None' },
      { abbreviation: 'UI', value: 'N', label: 'User Interaction', fullLabel: 'None' },
      { abbreviation: 'S', value: 'U', label: 'Scope', fullLabel: 'Unchanged' },
      { abbreviation: 'C', value: 'H', label: 'Confidentiality', fullLabel: 'High' },
      { abbreviation: 'I', value: 'H', label: 'Integrity', fullLabel: 'High' },
      { abbreviation: 'A', value: 'H', label: 'Availability', fullLabel: 'High' },
    ]
  }),
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

describe('CvssVectorString', () => {
  it('should render CVSS version badge', () => {
    const breakdown = createMockBreakdown()
    render(<CvssVectorString breakdown={breakdown} />)

    expect(screen.getByText('CVSS:3.1')).toBeInTheDocument()
  })

  it('should display the base score prominently', () => {
    const breakdown = createMockBreakdown({
      scores: { baseScore: 9.8, impactSubScore: 5.9, exploitabilitySubScore: 3.9 },
    })
    render(<CvssVectorString breakdown={breakdown} />)

    expect(screen.getByText('9.8')).toBeInTheDocument()
    expect(screen.getByText('CVSS Score')).toBeInTheDocument()
  })

  it('should display severity badge', () => {
    const breakdown = createMockBreakdown({ severity: 'critical' })
    render(<CvssVectorString breakdown={breakdown} />)

    expect(screen.getByText(/critical/i)).toBeInTheDocument()
  })

  it('should display impact and exploitability sub-scores by default', () => {
    const breakdown = createMockBreakdown({
      scores: { baseScore: 9.8, impactSubScore: 5.9, exploitabilitySubScore: 3.9 },
    })
    render(<CvssVectorString breakdown={breakdown} showSubScores={true} />)

    expect(screen.getByText('Impact Score')).toBeInTheDocument()
    expect(screen.getByText('Exploitability Score')).toBeInTheDocument()
    expect(screen.getByText('5.9')).toBeInTheDocument()
    expect(screen.getByText('3.9')).toBeInTheDocument()
  })

  it('should hide sub-scores when showSubScores is false', () => {
    const breakdown = createMockBreakdown()
    render(<CvssVectorString breakdown={breakdown} showSubScores={false} />)

    expect(screen.queryByText('Impact Score')).not.toBeInTheDocument()
    expect(screen.queryByText('Exploitability Score')).not.toBeInTheDocument()
  })

  it('should render vector metrics with abbreviations', () => {
    const breakdown = createMockBreakdown()
    render(<CvssVectorString breakdown={breakdown} />)

    // Check that the vector badges are rendered with abbreviation:value format
    // Use getAllByText since these appear multiple times (in vector and legend)
    expect(screen.getAllByText('AV:N').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AC:L').length).toBeGreaterThan(0)
  })

  it('should show legend with full labels when showLegend is true', () => {
    const breakdown = createMockBreakdown()
    render(<CvssVectorString breakdown={breakdown} showLegend={true} />)

    expect(screen.getByText('Vector Details')).toBeInTheDocument()
    expect(screen.getByText('Attack Vector:')).toBeInTheDocument()
    expect(screen.getByText('Network')).toBeInTheDocument()
  })

  it('should not show legend when showLegend is false', () => {
    const breakdown = createMockBreakdown()
    render(<CvssVectorString breakdown={breakdown} showLegend={false} />)

    expect(screen.queryByText('Vector Details')).not.toBeInTheDocument()
  })

  it('should display version correctly', () => {
    const breakdown = createMockBreakdown({ version: '3.0' })
    render(<CvssVectorString breakdown={breakdown} />)

    expect(screen.getByText('CVSS:3.0')).toBeInTheDocument()
  })

  it('should render vector string badges with proper spacing', () => {
    const breakdown = createMockBreakdown()
    const { container } = render(<CvssVectorString breakdown={breakdown} />)

    // Check that badges are rendered
    const badges = container.querySelectorAll('.rounded')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('should handle CVSS 3.0 breakdown', () => {
    const breakdown = createMockBreakdown({
      version: '3.0',
      vectorString: 'CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
    })
    render(<CvssVectorString breakdown={breakdown} />)

    expect(screen.getByText('CVSS:3.0')).toBeInTheDocument()
  })

  it('should display high risk values with red styling', () => {
    const breakdown = createMockBreakdown()
    const { container } = render(<CvssVectorString breakdown={breakdown} />)

    // Check that badges are rendered with color classes
    const redBadges = container.querySelectorAll('.bg-red-100')
    expect(redBadges.length).toBeGreaterThan(0)
  })

  it('should display description for CIA impacts', () => {
    const breakdown = createMockBreakdown()
    render(<CvssVectorString breakdown={breakdown} showSubScores={true} />)

    expect(screen.getByText(/Confidentiality, Integrity, Availability/i)).toBeInTheDocument()
  })
})
