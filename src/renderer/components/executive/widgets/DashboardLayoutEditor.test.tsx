/**
 * Tests for DashboardLayoutEditor (FR-06.3).
 *
 * Exercises the editor against the real zustand store: toggling visibility,
 * reordering and resizing a widget must be written back to the active profile on
 * Save, and "Save as new profile" must create a second profile.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DashboardLayoutEditor } from './DashboardLayoutEditor'
import { useStore } from '@/store/useStore'

vi.mock('@/lib/refresh', () => ({ refreshVulnerabilityData: vi.fn() }))
vi.mock('@/lib/api/projectPersistence', () => ({
  saveProjectToServer: vi.fn(),
  loadProjectFromServer: vi.fn(),
  deleteProjectFromServer: vi.fn(),
}))

function activeWidgets() {
  const state = useStore.getState()
  const profile = state.dashboardLayoutProfiles.find((p) => p.id === state.activeDashboardLayoutProfileId)
  if (!profile) throw new Error('no active profile')
  return profile.widgets
}

describe('DashboardLayoutEditor (FR-06.3)', () => {
  beforeEach(() => {
    useStore.getState().resetStore()
  })

  it('unchecking a widget and saving persists visible:false for it', () => {
    render(<DashboardLayoutEditor open onClose={vi.fn()} />)

    fireEvent.click(screen.getByLabelText('Show Overall Risk Level'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const riskGauge = activeWidgets().find((w) => w.id === 'risk-gauge')
    expect(riskGauge?.visible).toBe(false)
  })

  it('moving a widget down reorders it in the saved payload', () => {
    render(<DashboardLayoutEditor open onClose={vi.fn()} />)

    // risk-gauge is first by default; moving it down swaps it with compliance-status.
    fireEvent.click(screen.getByRole('button', { name: 'Move Overall Risk Level down' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const widgets = activeWidgets()
    expect(widgets[0].id).toBe('compliance-status')
    expect(widgets[1].id).toBe('risk-gauge')
  })

  it('changing a size preset is reflected in the saved payload', () => {
    render(<DashboardLayoutEditor open onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Size for Overall Risk Level'), { target: { value: 'large' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    const riskGauge = activeWidgets().find((w) => w.id === 'risk-gauge')
    expect(riskGauge?.size).toBe('large')
  })

  it('creating a profile from the name input adds a new profile', () => {
    render(<DashboardLayoutEditor open onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('New profile name'), { target: { value: 'My View' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save as new profile' }))

    const profiles = useStore.getState().dashboardLayoutProfiles
    expect(profiles).toHaveLength(2)
    expect(profiles.some((p) => p.name === 'My View')).toBe(true)
  })
})
