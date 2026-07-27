import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SavedSearches } from './SavedSearches'
import type { SavedSearch } from '@/lib/search/savedSearches'

// FR-08.1 "Save search queries" UI. These assert the three user actions the bar exists to
// provide — save the current query, load a saved one back into the box, delete one — plus the
// guard that you cannot save an empty query (the button gates on currentQuery, not just name).
function makeSearch(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return { id: 's1', name: 'Critical KEV', query: 'critical AND kev', createdAt: '2026-01-01', ...overrides }
}

describe('SavedSearches', () => {
  it('renders nothing when there is nothing saved and no query to save', () => {
    const { container } = render(
      <SavedSearches searches={[]} currentQuery="" onSave={vi.fn()} onLoad={vi.fn()} onDelete={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('disables "Save current" when the query is blank', () => {
    render(
      <SavedSearches
        searches={[makeSearch()]}
        currentQuery="   "
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Save current/i })).toBeDisabled()
  })

  it('saves the current query under a typed name', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <SavedSearches
        searches={[]}
        currentQuery="react OR express"
        onSave={onSave}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Save current/i }))
    await user.type(screen.getByLabelText('Saved search name'), 'Frontend libs')
    await user.click(screen.getByRole('button', { name: /^Save$/i }))

    expect(onSave).toHaveBeenCalledWith('Frontend libs')
  })

  it('loads a saved query when its chip is clicked', async () => {
    const user = userEvent.setup()
    const onLoad = vi.fn()
    render(
      <SavedSearches searches={[makeSearch()]} currentQuery="" onSave={vi.fn()} onLoad={onLoad} onDelete={vi.fn()} />,
    )
    await user.click(screen.getByRole('button', { name: 'Critical KEV' }))
    expect(onLoad).toHaveBeenCalledWith('critical AND kev')
  })

  it('deletes a saved query via its delete control', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <SavedSearches searches={[makeSearch()]} currentQuery="" onSave={vi.fn()} onLoad={vi.fn()} onDelete={onDelete} />,
    )
    await user.click(screen.getByRole('button', { name: /Delete saved search Critical KEV/i }))
    expect(onDelete).toHaveBeenCalledWith('s1')
  })
})
