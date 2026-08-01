/**
 * ProjectHealthComparison tests (FR-05.3).
 *
 * The comparison bars must be colored by the canonical FR-05.2 health category
 * boundaries (getHealthCategory -> getHealthChartColor), NOT by the widget's own
 * ad hoc thresholds. `@/lib/health` is intentionally NOT mocked so these tests
 * enforce real FR-05.2 conformance rather than an assumed mapping.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProjectHealthComparison } from './ProjectHealthComparison'
import { getHealthChartColor } from '@/lib/health'
import type { ProjectMetrics } from '@/lib/analytics'

vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({ children }: { children: React.ReactNode }) => <div data-testid="bar">{children}</div>,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Cell: ({ fill }: { fill: string }) => <div data-testid="cell" data-fill={fill} />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
}))

function makeMetric(overrides: Partial<ProjectMetrics>): ProjectMetrics {
  return {
    projectId: 'p',
    projectName: 'Project',
    healthScore: 100,
    vulnerabilityCount: 0,
    criticalCount: 0,
    highCount: 0,
    mediumCount: 0,
    lowCount: 0,
    componentCount: 0,
    vulnerableComponents: 0,
    fixableCount: 0,
    riskScore: 0,
    ...overrides,
  }
}

describe('ProjectHealthComparison (FR-05.3)', () => {
  it('colors bars by the FR-05.2 health category, not the widgets own ad hoc thresholds', () => {
    // 70 is "fair" (60-74) under FR-05.2 but the old local map colored >=70 light-green;
    // 35 is "critical" (<40) but the old local map colored >=30 orange. Both diverge, so
    // this fails against the pre-fix widget and only passes once it uses getHealthChartColor.
    const metrics = [
      makeMetric({ projectId: 'p1', projectName: 'Alpha', healthScore: 95 }),
      makeMetric({ projectId: 'p2', projectName: 'Beta', healthScore: 70 }),
      makeMetric({ projectId: 'p3', projectName: 'Gamma', healthScore: 35 }),
    ]

    render(<ProjectHealthComparison projectMetrics={metrics} />)

    const cells = screen.getAllByTestId('cell')
    expect(cells[1].getAttribute('data-fill')).toBe(getHealthChartColor('fair'))
    expect(cells[2].getAttribute('data-fill')).toBe(getHealthChartColor('critical'))
  })

  it('renders at most the top 8 projects', () => {
    const metrics = Array.from({ length: 10 }, (_unused, i) =>
      makeMetric({ projectId: `p${i}`, projectName: `Project ${i}`, healthScore: 50 }),
    )

    render(<ProjectHealthComparison projectMetrics={metrics} />)

    expect(screen.getAllByTestId('cell')).toHaveLength(8)
  })

  it('renders the empty state when there is no project data', () => {
    render(<ProjectHealthComparison projectMetrics={[]} />)

    expect(screen.getByText('No project data available')).toBeInTheDocument()
    expect(screen.queryAllByTestId('cell')).toHaveLength(0)
  })
})
