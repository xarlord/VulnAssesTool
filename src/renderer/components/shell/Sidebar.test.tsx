import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SidebarContent } from './Sidebar'

// The sidebar reads projects only to build the contextual per-project group; force an
// empty list so the primary MAIN_NAV is the sole navigation under test, while keeping the
// store's other exports (e.g. useSettings, read by AppLogo) real.
vi.mock('@/store/useStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/useStore')>()
  return { ...actual, useProjects: () => [] }
})

describe('SidebarContent navigation', () => {
  it('renders an Audit Log link pointing at /audit', () => {
    // Why: the audit trail is compliance evidence — it must be reachable from the primary
    // nav, not only by typing the URL. This fails if the /audit nav entry is missing.
    render(
      <MemoryRouter>
        <SidebarContent collapsed={false} onNavigate={vi.fn()} />
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: /audit log/i })
    expect(link).toHaveAttribute('href', '/audit')
  })
})
