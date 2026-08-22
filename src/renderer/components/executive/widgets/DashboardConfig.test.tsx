import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardConfig } from './DashboardConfig'
import type { Project } from '@@/types'

function proj(id: string, name: string): Project {
  return { id, name } as Project
}

// H4: the "Selected Projects" scope kept its chosen ids in local component state that was
// never propagated, so selecting projects had no effect on the dashboard. The picker must
// report the selection up to the parent, which owns the id list.
describe('DashboardConfig — selected-project plumbing (H4)', () => {
  const baseProps = {
    open: true,
    onClose: vi.fn(),
    dateRange: { start: new Date('2026-01-01'), end: new Date('2026-02-01') },
    projects: [proj('p1', 'Alpha'), proj('p2', 'Beta')],
    onDateRangeChange: vi.fn(),
    onProjectScopeChange: vi.fn(),
    onExportReport: vi.fn(),
    onRefresh: vi.fn(),
  }

  it('reports the toggled project to the parent when scope is "selected"', () => {
    const onSelectedProjectsChange = vi.fn()
    render(
      <DashboardConfig
        {...baseProps}
        projectScope="selected"
        selectedProjectIds={[]}
        onSelectedProjectsChange={onSelectedProjectsChange}
      />,
    )

    fireEvent.click(screen.getAllByRole('checkbox')[0])

    expect(onSelectedProjectsChange).toHaveBeenCalledWith(['p1'])
  })

  it('removes an already-selected project when toggled off', () => {
    const onSelectedProjectsChange = vi.fn()
    render(
      <DashboardConfig
        {...baseProps}
        projectScope="selected"
        selectedProjectIds={['p1']}
        onSelectedProjectsChange={onSelectedProjectsChange}
      />,
    )

    fireEvent.click(screen.getAllByRole('checkbox')[0])

    expect(onSelectedProjectsChange).toHaveBeenCalledWith([])
  })

  it('reflects the parent-owned selection in the checkbox state', () => {
    render(
      <DashboardConfig
        {...baseProps}
        projectScope="selected"
        selectedProjectIds={['p2']}
        onSelectedProjectsChange={vi.fn()}
      />,
    )

    const [alpha, beta] = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(alpha.checked).toBe(false)
    expect(beta.checked).toBe(true)
  })
})

/**
 * The rest of the dialog's behaviour.
 *
 * Only the project-picker path (H4 above) had coverage; every other control was rendered but
 * never clicked, and the uncontrolled mode — where the component owns its own open state via
 * the trigger button — was never rendered at all. These are the dashboard's filter controls,
 * so a handler wired to the wrong callback silently changes nothing the user can see.
 */
describe('DashboardConfig controls', () => {
  const baseProps = {
    open: true,
    onClose: vi.fn(),
    dateRange: { start: new Date('2026-01-01'), end: new Date('2026-02-01') },
    projects: [proj('p1', 'Alpha'), proj('p2', 'Beta')],
    selectedProjectIds: [],
    onSelectedProjectsChange: vi.fn(),
    onDateRangeChange: vi.fn(),
    onProjectScopeChange: vi.fn(),
    onExportReport: vi.fn(),
    onRefresh: vi.fn(),
    projectScope: 'all' as const,
  }

  it('turns a date-range preset into a start/end pair spanning that many days', () => {
    const onDateRangeChange = vi.fn()
    render(<DashboardConfig {...baseProps} onDateRangeChange={onDateRangeChange} />)

    // The 7-day preset is the first of the four.
    fireEvent.click(screen.getByText('Last 7 days'))

    expect(onDateRangeChange).toHaveBeenCalledTimes(1)
    const { start, end } = onDateRangeChange.mock.calls[0][0]
    const spanDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    expect(spanDays).toBe(7)
    expect(end.getTime()).toBeGreaterThan(start.getTime())
  })

  it('reports each project-scope choice to the parent', () => {
    const onProjectScopeChange = vi.fn()
    render(<DashboardConfig {...baseProps} onProjectScopeChange={onProjectScopeChange} />)

    fireEvent.click(screen.getByText('Selected Projects'))
    expect(onProjectScopeChange).toHaveBeenCalledWith('selected')

    fireEvent.click(screen.getByText('All Projects'))
    expect(onProjectScopeChange).toHaveBeenCalledWith('all')
  })

  it('exports and then closes, so the dialog does not sit over the download', () => {
    const onExportReport = vi.fn()
    const onClose = vi.fn()
    render(<DashboardConfig {...baseProps} onExportReport={onExportReport} onClose={onClose} />)

    fireEvent.click(screen.getByText('Export Report'))

    expect(onExportReport).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('refreshes on demand, and refuses to while a refresh is already running', () => {
    const onRefresh = vi.fn()
    const { rerender } = render(<DashboardConfig {...baseProps} onRefresh={onRefresh} />)

    fireEvent.click(screen.getByText('Refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)

    // Guards against queuing a second scan on top of the first.
    rerender(<DashboardConfig {...baseProps} onRefresh={onRefresh} isRefreshing />)
    fireEvent.click(screen.getByText('Refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows an empty-state instead of a blank picker when there are no projects', () => {
    render(<DashboardConfig {...baseProps} projectScope="selected" projects={[]} />)

    expect(screen.getByText('No projects available')).toBeInTheDocument()
  })
})

describe('DashboardConfig uncontrolled mode', () => {
  const uncontrolledProps = {
    dateRange: { start: new Date('2026-01-01'), end: new Date('2026-02-01') },
    projects: [proj('p1', 'Alpha')],
    selectedProjectIds: [],
    onSelectedProjectsChange: vi.fn(),
    onDateRangeChange: vi.fn(),
    onProjectScopeChange: vi.fn(),
    onExportReport: vi.fn(),
    onRefresh: vi.fn(),
    projectScope: 'all' as const,
  }

  it('renders only the trigger until it is clicked', () => {
    // With no `open` prop the component owns its own state, and this whole branch — the
    // early return that renders nothing but the trigger — was previously never rendered.
    render(<DashboardConfig {...uncontrolledProps} />)

    expect(screen.getByText('Dashboard Settings')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard Configuration')).not.toBeInTheDocument()
  })

  it('opens the dialog from the trigger', () => {
    render(<DashboardConfig {...uncontrolledProps} />)

    fireEvent.click(screen.getByText('Dashboard Settings'))

    expect(screen.getByText('Dashboard Configuration')).toBeInTheDocument()
  })
})
