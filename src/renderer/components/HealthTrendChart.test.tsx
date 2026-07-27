import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthTrendChart } from './HealthTrendChart'
import type { HealthSnapshot } from '@/lib/health/healthHistory'

// FR-05.3 trend line. A single data point cannot show a trend, so the chart must explain
// itself rather than render a misleading flat/empty axis; with >= 2 points it must plot the
// score series and expose the data to assistive tech via aria-label.
vi.mock('recharts', () => ({
  LineChart: ({ data, children }: { data: HealthSnapshot[]; children: React.ReactNode }) => (
    <div data-testid="line-chart" data-points={data.length}>
      {children}
    </div>
  ),
  Line: ({ dataKey }: { dataKey: string }) => <div data-testid="line" data-key={dataKey} />,
  XAxis: ({ dataKey }: { dataKey: string }) => <div data-testid="x-axis" data-key={dataKey} />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

describe('HealthTrendChart', () => {
  it('shows a "not enough history" message for fewer than two points', () => {
    render(<HealthTrendChart history={[{ date: '2026-01-01', score: 80 }]} />)
    expect(screen.getByText(/Not enough history yet/i)).toBeInTheDocument()
    expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument()
  })

  it('renders a line of scores over time once two or more points exist', () => {
    const history: HealthSnapshot[] = [
      { date: '2026-01-01', score: 60 },
      { date: '2026-01-02', score: 75 },
    ]
    render(<HealthTrendChart history={history} />)

    expect(screen.getByTestId('line-chart')).toHaveAttribute('data-points', '2')
    expect(screen.getByTestId('line')).toHaveAttribute('data-key', 'score')
    expect(screen.getByTestId('x-axis')).toHaveAttribute('data-key', 'date')
  })

  it('exposes the data points to assistive tech via an aria-label', () => {
    const history: HealthSnapshot[] = [
      { date: '2026-01-01', score: 60 },
      { date: '2026-01-02', score: 75 },
    ]
    render(<HealthTrendChart history={history} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('aria-label', expect.stringContaining('2026-01-01: 60'))
    expect(img.getAttribute('aria-label')).toContain('2026-01-02: 75')
  })
})
