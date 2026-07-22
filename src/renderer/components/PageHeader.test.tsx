import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from './PageHeader'

describe('PageHeader', () => {
  it('renders the title as the page h1 — one heading source per page', () => {
    render(<PageHeader title="Dashboard" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('renders description and actions when provided', () => {
    render(<PageHeader title="Projects" description="3 projects" actions={<button>New Project</button>} />)
    expect(screen.getByText('3 projects')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Project' })).toBeInTheDocument()
  })

  it('omits the description paragraph when not provided', () => {
    const { container } = render(<PageHeader title="Search" />)
    expect(container.querySelectorAll('p')).toHaveLength(0)
  })
})
