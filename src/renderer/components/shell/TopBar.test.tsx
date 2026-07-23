import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { TopBar } from './TopBar'
import { useStore } from '@/store/useStore'
import type { Project } from '@@/types'

const noop = () => {}

function renderTopBar(path = '/dashboard', onOpenCommandPalette = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <TopBar onToggleSidebar={noop} onOpenMobileNav={noop} onOpenCommandPalette={onOpenCommandPalette} />
    </MemoryRouter>,
  )
  return { onOpenCommandPalette }
}

describe('TopBar', () => {
  beforeEach(() => {
    useStore.getState().resetStore()
  })

  it('renders the page breadcrumb', () => {
    renderTopBar('/dashboard')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('Dashboard')
  })

  it('builds project breadcrumbs with the project name and sub-page', () => {
    useStore.setState({
      projects: [{ id: 'p1', name: 'Alpha Firmware' } as unknown as Project],
    })
    renderTopBar('/project/p1/fpf')
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(breadcrumb).toHaveTextContent('Dashboard')
    expect(breadcrumb).toHaveTextContent('Alpha Firmware')
    expect(breadcrumb).toHaveTextContent('False Positives')
    // Ancestors are links; the current page is not.
    expect(screen.getByRole('link', { name: 'Alpha Firmware' })).toHaveAttribute('href', '/project/p1')
  })

  it('opens the command palette from the visible Ctrl+K button', async () => {
    const { onOpenCommandPalette } = renderTopBar()
    await userEvent.click(screen.getByRole('button', { name: 'Open command palette' }))
    expect(onOpenCommandPalette).toHaveBeenCalledTimes(1)
  })

  it('hosts the global notification center — previously reachable only from the Dashboard header', () => {
    renderTopBar('/settings')
    // NotificationCenter renders its bell trigger; the exact label comes from
    // that component, so assert the region exists via its button role.
    expect(screen.getByRole('button', { name: /notification/i })).toBeInTheDocument()
  })

  it('changes the theme from anywhere via the dropdown — no trip to Settings required', async () => {
    renderTopBar('/search')
    await userEvent.click(screen.getByRole('button', { name: 'Change theme' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Light' }))
    expect(useStore.getState().settings.theme).toBe('light')
  })
})
