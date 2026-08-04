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
