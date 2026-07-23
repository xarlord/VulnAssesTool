import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { useStore } from '@/store/useStore'
import type { Project } from '@@/types'

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

function renderShell(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell onOpenCommandPalette={vi.fn()} />}>
          <Route path="/dashboard" element={<div>Dashboard page body</div>} />
          <Route path="/search" element={<div>Search page body</div>} />
          <Route path="/project/:projectId" element={<div>Project page body</div>} />
          <Route path="/project/:projectId/fpf" element={<div>FPF page body</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  beforeEach(() => {
    useStore.getState().resetStore()
  })

  it('wraps page content with persistent navigation — pages no longer own their nav', () => {
    renderShell('/dashboard')
    expect(screen.getByText('Dashboard page body')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/dashboard')
    expect(screen.getByRole('link', { name: /Search/ })).toHaveAttribute('href', '/search')
    expect(screen.getByRole('link', { name: /Reports/ })).toHaveAttribute('href', '/executive')
    expect(screen.getByRole('link', { name: /Settings/ })).toHaveAttribute('href', '/settings')
  })

  it('provides the skip-link target that was missing app-wide', () => {
    const { container } = renderShell()
    // The App-level "Skip to main content" link points at #main-content; before
    // the shell existed this id was rendered by nothing, so the link was dead.
    expect(container.querySelector('#main-content')).not.toBeNull()
  })

  it('shows a contextual project group on project routes — replacing per-page back buttons', () => {
    useStore.setState({ projects: [mockProject] })
    renderShell('/project/proj-1/fpf')
    // The name appears in both the sidebar group label and the breadcrumb.
    expect(screen.getAllByText('Alpha Firmware').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute('href', '/project/proj-1')
    expect(screen.getByRole('link', { name: /False Positives/ })).toHaveAttribute('href', '/project/proj-1/fpf')
    expect(screen.getByRole('link', { name: /Dependency Graph/ })).toHaveAttribute('href', '/project/proj-1/graph')
  })

  it('hides the project group outside project routes — no dead nav', () => {
    renderShell('/dashboard')
    expect(screen.queryByRole('link', { name: /Overview/ })).not.toBeInTheDocument()
  })

  it('toggle collapses the sidebar via the store flag Ctrl+Shift+S already writes', async () => {
    renderShell()
    expect(useStore.getState().sidebarOpen).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }))
    expect(useStore.getState().sidebarOpen).toBe(false)
  })
})
