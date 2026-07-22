import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SeverityBadge } from './SeverityBadge'

describe('SeverityBadge', () => {
  it('renders the capitalized severity label with its token class', () => {
    render(<SeverityBadge severity="critical" />)
    const badge = screen.getByText('Critical')
    // Token class (not a raw text-red-* class) keeps contrast AA in both themes.
    expect(badge.className).toContain('severity-critical')
  })

  it('renders a count suffix when provided', () => {
    render(<SeverityBadge severity="high" count={7} />)
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(screen.getByLabelText('7 findings')).toBeInTheDocument()
  })

  it('omits the count suffix when not provided', () => {
    render(<SeverityBadge severity="low" />)
    expect(screen.queryByLabelText(/findings/)).not.toBeInTheDocument()
  })
})
