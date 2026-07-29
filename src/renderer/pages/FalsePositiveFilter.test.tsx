import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Project } from '@@/types'

// Stub the heavy FPF sub-components so these tests isolate the *page's* own
// orchestration — the routing guard, tab switching, and the empty-review state —
// from the sub-components' internals (which have their own concerns/coverage).
vi.mock('@/components/FPF/FilterDashboard', () => ({
  FilterDashboard: () => <div>FilterDashboard stub</div>,
}))
vi.mock('@/components/FPF/FilteredItemsReview', () => ({
  FilteredItemsReview: () => <div>FilteredItemsReview stub</div>,
}))
vi.mock('@/components/FPF/ConfigWizard', () => ({
  ConfigWizard: () => <div>ConfigWizard stub</div>,
}))
vi.mock('@/components/FPF/MissFilterPanel', () => ({
  MissFilterPanel: () => <div>MissFilterPanel stub</div>,
}))

import { FalsePositiveFilterPage } from './FalsePositiveFilter'
import { useStore } from '@/store/useStore'

const mockProject = {
  id: 'proj-1',
  name: 'Alpha Firmware',
  description: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  components: [],
  vulnerabilities: [],
  sbomFiles: [],
} as unknown as Project

function renderFpf(projectId: string) {
  return render(
    <MemoryRouter initialEntries={[`/project/${projectId}/fpf`]}>
      <Routes>
        <Route path="/project/:projectId/fpf" element={<FalsePositiveFilterPage />} />
        <Route path="/dashboard" element={<div>Dashboard page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('FalsePositiveFilterPage', () => {
  beforeEach(() => {
    useStore.getState().resetStore()
    useStore.setState({ projects: [mockProject] })
  })

  it('guards a missing project with an empty state instead of crashing', () => {
    // A stale/bad :projectId must not render the filter against `undefined` — it
    // shows a recoverable "No Project Selected" state with a way back.
    renderFpf('does-not-exist')
    expect(screen.getByRole('heading', { name: /No Project Selected/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Go to Dashboard/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('renders the four filter tabs and defaults to the dashboard for a valid project', () => {
    renderFpf('proj-1')
    expect(screen.getByText(/Project: Alpha Firmware/)).toBeInTheDocument()
    for (const name of ['Dashboard', 'Review Filtered', 'Configuration', 'Miss-Filter Detection']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument()
    }
    // Dashboard is the default tab.
    expect(screen.getByText('FilterDashboard stub')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
  })

  it('switches to the Configuration tab on click', async () => {
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('tab', { name: 'Configuration' }))
    expect(screen.getByText('ConfigWizard stub')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Configuration' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows the empty "No Filter Results" state on the Review tab before any filter runs', async () => {
    renderFpf('proj-1')
    await userEvent.click(screen.getByRole('tab', { name: 'Review Filtered' }))
    // No batch result yet, so the page (not a sub-component) renders the empty state.
    expect(screen.getByRole('heading', { name: /No Filter Results/i })).toBeInTheDocument()
    expect(screen.queryByText('FilteredItemsReview stub')).not.toBeInTheDocument()
  })
})
