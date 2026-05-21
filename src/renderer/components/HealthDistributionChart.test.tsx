/**
 * HealthDistributionChart Tests
 * Tests for the pie chart rendering and empty state
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthDistributionChart } from './HealthDistributionChart'

// Mock recharts to render simple testable output
vi.mock('recharts', () => ({
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie-chart">{children}</div>,
  Pie: ({
    data,
    label,
    dataKey,
    children,
  }: {
    data: Array<{ name: string; value: number; color: string }>
    label?: (entry: { name: string; value: number }) => string
    dataKey: string
    children?: React.ReactNode
  }) => (
    <div data-testid="pie" data-data-key={dataKey}>
      {data.map((entry) => (
        <div key={entry.name} data-testid={`pie-slice-${entry.name}`}>
          <span data-testid={`slice-name-${entry.name}`}>{entry.name}</span>
          <span data-testid={`slice-value-${entry.name}`}>{entry.value}</span>
          <span data-testid={`slice-color-${entry.name}`}>{entry.color}</span>
          {label && <span data-testid={`slice-label-${entry.name}`}>{label(entry)}</span>}
        </div>
      ))}
      {children}
    </div>
  ),
  Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  Legend: () => <div data-testid="legend" />,
  Tooltip: () => <div data-testid="tooltip" />,
}))

// Mock getHealthChartColor to return predictable values
vi.mock('@/lib/health', () => ({
  getHealthChartColor: (category: string) => {
    const colors: Record<string, string> = {
      excellent: '#22c55e',
      good: '#3b82f6',
      fair: '#eab308',
      poor: '#f97316',
      critical: '#ef4444',
    }
    return colors[category] || '#888888'
  },
}))

describe('HealthDistributionChart', () => {
  it('should render the chart with all health categories when data is provided', () => {
    const distribution = {
      excellent: 10,
      good: 20,
      fair: 15,
      poor: 5,
      critical: 2,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    expect(screen.getByTestId('tooltip')).toBeInTheDocument()
    expect(screen.getByTestId('legend')).toBeInTheDocument()
  })

  it('should render pie slices only for categories with values > 0', () => {
    const distribution = {
      excellent: 10,
      good: 0,
      fair: 5,
      poor: 0,
      critical: 0,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    // Only excellent and fair should have slices
    expect(screen.getByTestId('pie-slice-Excellent')).toBeInTheDocument()
    expect(screen.getByTestId('pie-slice-Fair')).toBeInTheDocument()
    expect(screen.queryByTestId('pie-slice-Good')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pie-slice-Poor')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pie-slice-Critical')).not.toBeInTheDocument()
  })

  it('should show empty state when all categories are 0', () => {
    const distribution = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      critical: 0,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    expect(screen.getByText('No health data available')).toBeInTheDocument()
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument()
  })

  it('should pass correct colors for each category', () => {
    const distribution = {
      excellent: 5,
      good: 3,
      fair: 2,
      poor: 1,
      critical: 1,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    expect(screen.getByTestId('slice-color-Excellent')).toHaveTextContent('#22c55e')
    expect(screen.getByTestId('slice-color-Good')).toHaveTextContent('#3b82f6')
    expect(screen.getByTestId('slice-color-Fair')).toHaveTextContent('#eab308')
    expect(screen.getByTestId('slice-color-Poor')).toHaveTextContent('#f97316')
    expect(screen.getByTestId('slice-color-Critical')).toHaveTextContent('#ef4444')
  })

  it('should pass correct values for each category', () => {
    const distribution = {
      excellent: 10,
      good: 20,
      fair: 0,
      poor: 0,
      critical: 5,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    expect(screen.getByTestId('slice-value-Excellent')).toHaveTextContent('10')
    expect(screen.getByTestId('slice-value-Good')).toHaveTextContent('20')
    expect(screen.getByTestId('slice-value-Critical')).toHaveTextContent('5')
  })

  it('should use "value" as dataKey for Pie', () => {
    const distribution = {
      excellent: 1,
      good: 0,
      fair: 0,
      poor: 0,
      critical: 0,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    expect(screen.getByTestId('pie')).toHaveAttribute('data-data-key', 'value')
  })

  it('should render labels with name and value', () => {
    const distribution = {
      excellent: 7,
      good: 0,
      fair: 0,
      poor: 0,
      critical: 0,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    expect(screen.getByTestId('slice-label-Excellent')).toHaveTextContent('Excellent: 7')
  })

  it('should render Cell components for each data entry with fill color', () => {
    const distribution = {
      excellent: 3,
      good: 2,
      fair: 0,
      poor: 0,
      critical: 0,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    const cells = screen.getAllByTestId('cell')
    expect(cells.length).toBe(2) // only excellent and fair have values > 0
    expect(cells[0]).toHaveAttribute('data-fill', '#22c55e')
    expect(cells[1]).toHaveAttribute('data-fill', '#3b82f6')
  })

  it('should render chart inside a container with correct height', () => {
    const distribution = {
      excellent: 1,
      good: 0,
      fair: 0,
      poor: 0,
      critical: 0,
    }

    const { container } = render(<HealthDistributionChart distribution={distribution} />)

    const chartContainer = container.firstElementChild
    expect(chartContainer).toHaveClass('h-64')
  })

  it('should render ResponsiveContainer', () => {
    const distribution = {
      excellent: 1,
      good: 0,
      fair: 0,
      poor: 0,
      critical: 0,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    expect(screen.getByTestId('responsive-container')).toBeInTheDocument()
  })

  it('should render only critical category when only critical has values', () => {
    const distribution = {
      excellent: 0,
      good: 0,
      fair: 0,
      poor: 0,
      critical: 8,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    expect(screen.getByTestId('pie-slice-Critical')).toBeInTheDocument()
    expect(screen.queryByTestId('pie-slice-Excellent')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pie-slice-Good')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pie-slice-Fair')).not.toBeInTheDocument()
    expect(screen.queryByTestId('pie-slice-Poor')).not.toBeInTheDocument()
    expect(screen.getByTestId('slice-value-Critical')).toHaveTextContent('8')
  })

  it('should render all five categories in correct order when all have values', () => {
    const distribution = {
      excellent: 3,
      good: 5,
      fair: 2,
      poor: 1,
      critical: 4,
    }

    render(<HealthDistributionChart distribution={distribution} />)

    const slices = ['Excellent', 'Good', 'Fair', 'Poor', 'Critical']
    slices.forEach((name) => {
      expect(screen.getByTestId(`pie-slice-${name}`)).toBeInTheDocument()
    })

    const cells = screen.getAllByTestId('cell')
    expect(cells).toHaveLength(5)
  })
})
