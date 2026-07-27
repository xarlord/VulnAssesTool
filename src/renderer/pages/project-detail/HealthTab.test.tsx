import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HealthTab } from './HealthTab'
import { getHealthHistory } from '@/lib/health/healthHistory'
import type { Project, ProjectHealthSummary } from '@@/types'

// FR-05.3: the Health tab must persist a score snapshot and drive the trend from real history.
// The dashboard, remediation queue, and (lazy) trend chart are mocked so these tests isolate
// HealthTab's own behavior: it records to history on render, and derives the trend badge shown
// on the dashboard from that history — not from the always-unknown per-component trend.
const capturedTrend = { value: '' as ProjectHealthSummary['trend'] }
const capturedHistoryLengths: number[] = []

vi.mock('@/components/HealthDashboard', () => ({
  HealthDashboard: ({ projectHealth }: { projectHealth: ProjectHealthSummary }) => {
    capturedTrend.value = projectHealth.trend
    return <div data-testid="health-dashboard" data-trend={projectHealth.trend} />
  },
}))
vi.mock('@/components/RemediationQueue', () => ({
  RemediationQueue: () => <div data-testid="remediation-queue" />,
}))
vi.mock('@/components/HealthTrendChart', () => ({
  HealthTrendChart: ({ history }: { history: unknown[] }) => {
    capturedHistoryLengths.push(history.length)
    return <div data-testid="trend-chart" data-points={history.length} />
  },
}))

const STORAGE_KEY = 'vuln-assess-health-history'

function makeProject(): Project {
  return {
    id: 'proj-health',
    name: 'Health Project',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    sbomFiles: [],
    components: [],
    vulnerabilities: [],
    statistics: {
      totalVulnerabilities: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalComponents: 0,
      vulnerableComponents: 0,
    },
  }
}

describe('HealthTab', () => {
  beforeEach(() => {
    localStorage.clear()
    capturedTrend.value = ''
    capturedHistoryLengths.length = 0
  })

  it('records a health snapshot for the project on render', async () => {
    render(<HealthTab project={makeProject()} onComponentClick={vi.fn()} onViewVulnerability={vi.fn()} />)

    // The effect writes today's snapshot to localStorage.
    const history = getHealthHistory('proj-health')
    expect(history).toHaveLength(1)
    // A project with no components scores 100 (nothing to penalize).
    expect(history[0].score).toBe(100)

    // The lazy trend chart eventually receives the recorded history.
    await screen.findByTestId('trend-chart')
    expect(capturedHistoryLengths.at(-1)).toBe(1)
  })

  it('derives the dashboard trend from persisted history (improving), not per-component trend', async () => {
    // Seed two earlier, lower-scoring days; today's perfect score is a clear improvement.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        'proj-health': [
          { date: '2000-01-01', score: 10 },
          { date: '2000-01-02', score: 10 },
        ],
      }),
    )

    render(<HealthTab project={makeProject()} onComponentClick={vi.fn()} onViewVulnerability={vi.fn()} />)
    await screen.findByTestId('trend-chart')

    // Without history the dashboard trend would be 'unknown'; history flips it to 'improving'.
    expect(capturedTrend.value).toBe('improving')
    expect(screen.getByTestId('health-dashboard')).toHaveAttribute('data-trend', 'improving')
  })
})
