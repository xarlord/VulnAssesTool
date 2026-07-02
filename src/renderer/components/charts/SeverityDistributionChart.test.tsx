import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { cloneElement, isValidElement } from 'react'
import { SeverityDistributionChart, calculateSeverityDistribution } from './SeverityDistributionChart'
import type { Vulnerability } from '@@/types'

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children, height }: { children: any; height: number }) => (
    <div data-testid="responsive-container" data-height={height}>
      {children}
    </div>
  ),
  PieChart: ({ children }: { children: any }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({ children, label, data }: { children: any; label?: any; data?: any[] }) => (
    <div data-testid="pie">
      {data &&
        typeof label === 'function' &&
        data.map((entry: any, i: number) => {
          const total = data.reduce((sum: number, d: any) => sum + d.value, 0)
          const percent = total > 0 ? entry.value / total : 0
          return (
            <div key={i} data-testid={`pie-label-${i}`}>
              {label({ cx: 150, cy: 150, midAngle: i * 72, innerRadius: 50, outerRadius: 80, percent })}
            </div>
          )
        })}
      {children}
    </div>
  ),
  Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
  Tooltip: ({ content }: { content: any }) => {
    if (isValidElement(content)) {
      return (
        <div data-testid="tooltip">
          <div data-testid="tooltip-active">
            {cloneElement(content, { active: true, payload: [{ payload: { name: 'Critical', value: 1 } }] })}
          </div>
          <div data-testid="tooltip-inactive">{cloneElement(content, { active: false, payload: [] })}</div>
        </div>
      )
    }
    return <div data-testid="tooltip" />
  },
  Legend: ({ formatter }: { formatter?: (value: string, entry: any) => any }) => {
    const mockPayload = [
      { value: 'Critical', payload: { value: 1 } },
      { value: 'High', payload: { value: 1 } },
    ]
    return (
      <div data-testid="legend">
        {formatter
          ? mockPayload.map((entry, i) => (
              <div key={i} data-testid={`legend-entry-${i}`}>
                {formatter(entry.value, entry)}
              </div>
            ))
          : null}
      </div>
    )
  },
}))

// Mock constants
vi.mock('@@/constants', () => ({
  SEVERITY_COLORS: {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#16a34a',
    none: '#6b7280',
  },
}))

const createMockVulnerabilities = (overrides?: Partial<Vulnerability>[]): Vulnerability[] => {
  const defaults: Vulnerability[] = [
    {
      id: 'CVE-2024-0001',
      source: 'nvd',
      severity: 'critical',
      cvssScore: 9.8,
      description: 'Critical vulnerability',
      references: [],
      affectedComponents: [],
    },
    {
      id: 'CVE-2024-0002',
      source: 'nvd',
      severity: 'high',
      cvssScore: 8.5,
      description: 'High vulnerability',
      references: [],
      affectedComponents: [],
    },
    {
      id: 'CVE-2024-0003',
      source: 'nvd',
      severity: 'medium',
      cvssScore: 6.5,
      description: 'Medium vulnerability',
      references: [],
      affectedComponents: [],
    },
    {
      id: 'CVE-2024-0004',
      source: 'nvd',
      severity: 'low',
      cvssScore: 3.5,
      description: 'Low vulnerability',
      references: [],
      affectedComponents: [],
    },
  ]
  return overrides || defaults
}

describe('SeverityDistributionChart', () => {
  describe('Rendering', () => {
    it('should render pie chart when vulnerabilities exist', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
      expect(screen.getByTestId('pie')).toBeInTheDocument()
    })

    it('should render empty state when no vulnerabilities', () => {
      render(<SeverityDistributionChart vulnerabilities={[]} />)

      expect(screen.getByText('No vulnerabilities found')).toBeInTheDocument()
      expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument()
    })

    it('exposes the chart as a labelled image summarizing the distribution', () => {
      render(<SeverityDistributionChart vulnerabilities={createMockVulnerabilities()} />)

      const label = screen.getByRole('img').getAttribute('aria-label') ?? ''
      expect(label).toMatch(/severity distribution/i)
      expect(label).toMatch(/Critical: \d/)
    })

    it('should render legend when showLegend is true', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} showLegend={true} />)

      expect(screen.getByTestId('legend')).toBeInTheDocument()
    })

    it('should not render legend when showLegend is false', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} showLegend={false} />)

      expect(screen.queryByTestId('legend')).not.toBeInTheDocument()
    })

    it('should render cells for each severity level', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      const cells = screen.getAllByTestId('cell')
      expect(cells.length).toBe(4) // critical, high, medium, low
    })

    it('should use custom height when provided', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} height={400} />)

      const container = screen.getByTestId('responsive-container')
      expect(container).toHaveAttribute('data-height', '400')
    })

    it('should use default height when not provided', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      const container = screen.getByTestId('responsive-container')
      expect(container).toHaveAttribute('data-height', '300')
    })
  })

  describe('Data Calculation', () => {
    it('should correctly count vulnerabilities by severity', () => {
      const vulnerabilities: Vulnerability[] = [...createMockVulnerabilities(), ...createMockVulnerabilities()]
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      const cells = screen.getAllByTestId('cell')
      expect(cells.length).toBe(4)
    })

    it('should filter out zero-count severities', () => {
      const vulnerabilities: Vulnerability[] = [
        {
          id: 'CVE-2024-0001',
          source: 'nvd',
          severity: 'critical',
          cvssScore: 9.8,
          description: 'Critical vulnerability',
          references: [],
          affectedComponents: [],
        },
      ]
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      const cells = screen.getAllByTestId('cell')
      expect(cells.length).toBe(1) // Only critical
    })

    it('should handle vulnerabilities without CVSS scores', () => {
      const vulnerabilities: Vulnerability[] = [
        {
          id: 'CVE-2024-0001',
          source: 'nvd',
          severity: 'none',
          description: 'Vulnerability without score',
          references: [],
          affectedComponents: [],
        },
      ]
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      const cells = screen.getAllByTestId('cell')
      expect(cells.length).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle single vulnerability', () => {
      const vulnerabilities: Vulnerability[] = [
        {
          id: 'CVE-2024-0001',
          source: 'nvd',
          severity: 'critical',
          cvssScore: 9.8,
          description: 'Critical vulnerability',
          references: [],
          affectedComponents: [],
        },
      ]
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    })

    it('should handle vulnerabilities with all severities', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      const cells = screen.getAllByTestId('cell')
      expect(cells.length).toBe(4)
    })

    it('should handle large number of vulnerabilities', () => {
      const vulnerabilities: Vulnerability[] = Array.from({ length: 100 }, (_, i) => ({
        id: `CVE-2024-${String(i).padStart(4, '0')}`,
        source: 'nvd',
        severity: 'low',
        cvssScore: 3.0,
        description: `Vulnerability ${i}`,
        references: [],
        affectedComponents: [],
      }))
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    })
  })

  describe('Utility Functions', () => {
    describe('calculateSeverityDistribution', () => {
      it('should calculate distribution for all severities', () => {
        const vulnerabilities = createMockVulnerabilities()
        const distribution = calculateSeverityDistribution(vulnerabilities)

        expect(distribution).toHaveLength(4) // critical, high, medium, low
        expect(distribution.find((d) => d.name === 'Critical')?.value).toBe(1)
        expect(distribution.find((d) => d.name === 'High')?.value).toBe(1)
        expect(distribution.find((d) => d.name === 'Medium')?.value).toBe(1)
        expect(distribution.find((d) => d.name === 'Low')?.value).toBe(1)
      })

      it('should filter out severities with zero count', () => {
        const vulnerabilities: Vulnerability[] = [
          {
            id: 'CVE-2024-0001',
            source: 'nvd',
            severity: 'critical',
            cvssScore: 9.8,
            description: 'Critical vulnerability',
            references: [],
            affectedComponents: [],
          },
        ]
        const distribution = calculateSeverityDistribution(vulnerabilities)

        expect(distribution).toHaveLength(1)
        expect(distribution[0].name).toBe('Critical')
        expect(distribution[0].value).toBe(1)
      })

      it('should return empty array for no vulnerabilities', () => {
        const distribution = calculateSeverityDistribution([])
        expect(distribution).toEqual([])
      })

      it('should include "none" severity when present', () => {
        const vulnerabilities: Vulnerability[] = [
          {
            id: 'CVE-2024-0001',
            source: 'nvd',
            severity: 'none',
            description: 'No severity',
            references: [],
            affectedComponents: [],
          },
        ]
        const distribution = calculateSeverityDistribution(vulnerabilities)

        expect(distribution).toHaveLength(1)
        expect(distribution[0].name).toBe('None')
      })

      it('should count multiple vulnerabilities of same severity', () => {
        const vulnerabilities: Vulnerability[] = [
          {
            id: 'CVE-2024-0001',
            source: 'nvd',
            severity: 'critical',
            cvssScore: 9.8,
            description: 'Critical 1',
            references: [],
            affectedComponents: [],
          },
          {
            id: 'CVE-2024-0002',
            source: 'nvd',
            severity: 'critical',
            cvssScore: 9.5,
            description: 'Critical 2',
            references: [],
            affectedComponents: [],
          },
          {
            id: 'CVE-2024-0003',
            source: 'nvd',
            severity: 'critical',
            cvssScore: 9.0,
            description: 'Critical 3',
            references: [],
            affectedComponents: [],
          },
        ]
        const distribution = calculateSeverityDistribution(vulnerabilities)

        expect(distribution).toHaveLength(1)
        expect(distribution[0].value).toBe(3)
      })

      it('should include correct color for each severity', () => {
        const vulnerabilities = createMockVulnerabilities()
        const distribution = calculateSeverityDistribution(vulnerabilities)

        expect(distribution.find((d) => d.name === 'Critical')?.color).toBe('#dc2626')
        expect(distribution.find((d) => d.name === 'High')?.color).toBe('#ea580c')
        expect(distribution.find((d) => d.name === 'Medium')?.color).toBe('#ca8a04')
        expect(distribution.find((d) => d.name === 'Low')?.color).toBe('#16a34a')
      })
    })
  })

  describe('Component Props', () => {
    it('should pass showLabels=false to CustomLabel', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} showLabels={false} />)

      expect(screen.getByTestId('pie')).toBeInTheDocument()
    })

    it('should pass showLabels=true to CustomLabel', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} showLabels={true} />)

      expect(screen.getByTestId('pie')).toBeInTheDocument()
    })

    it('should use default height of 300', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      const container = screen.getByTestId('responsive-container')
      expect(container).toHaveAttribute('data-height', '300')
    })

    it('should use custom height', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} height={500} />)

      const container = screen.getByTestId('responsive-container')
      expect(container).toHaveAttribute('data-height', '500')
    })
  })

  describe('Memoization', () => {
    it('should re-render when vulnerabilities change', () => {
      const vulnerabilities1 = createMockVulnerabilities()
      const { rerender } = render(<SeverityDistributionChart vulnerabilities={vulnerabilities1} />)

      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()

      const vulnerabilities2: Vulnerability[] = [
        {
          id: 'CVE-2024-0099',
          source: 'nvd',
          severity: 'critical',
          cvssScore: 10.0,
          description: 'New critical vuln',
          references: [],
          affectedComponents: [],
        },
      ]

      rerender(<SeverityDistributionChart vulnerabilities={vulnerabilities2} />)

      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    })
  })

  describe('CustomTooltip Callbacks', () => {
    it('should render tooltip content with active payload', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      const tooltipActive = screen.getByTestId('tooltip-active')
      expect(tooltipActive).toHaveTextContent('Critical')
      expect(tooltipActive).toHaveTextContent('1 vulnerabilities')
      expect(tooltipActive).toHaveTextContent('%')
    })

    it('should render empty tooltip when inactive', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} />)

      const tooltipInactive = screen.getByTestId('tooltip-inactive')
      expect(tooltipInactive).toBeEmptyDOMElement()
    })
  })

  describe('CustomLabel Callbacks', () => {
    it('should render percentage labels when showLabels is true', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} showLabels={true} />)

      const label0 = screen.getByTestId('pie-label-0')
      expect(label0).toHaveTextContent('25%')
    })

    it('should return null labels when showLabels is false', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} showLabels={false} />)

      const label0 = screen.getByTestId('pie-label-0')
      expect(label0).toBeEmptyDOMElement()
    })
  })

  describe('Legend Formatter', () => {
    it('should render legend entries with value counts', () => {
      const vulnerabilities = createMockVulnerabilities()
      render(<SeverityDistributionChart vulnerabilities={vulnerabilities} showLegend={true} />)

      const entry0 = screen.getByTestId('legend-entry-0')
      expect(entry0).toHaveTextContent('Critical: 1')

      const entry1 = screen.getByTestId('legend-entry-1')
      expect(entry1).toHaveTextContent('High: 1')
    })
  })
})
