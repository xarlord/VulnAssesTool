import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('renders label and value', () => {
    render(<StatCard label="Total Projects" value={12} />)
    expect(screen.getByText('Total Projects')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('applies the value accent class so severity counts can carry token colors', () => {
    render(<StatCard label="Critical" value={3} valueClassName="text-destructive" />)
    expect(screen.getByText('3').className).toContain('text-destructive')
  })
})
