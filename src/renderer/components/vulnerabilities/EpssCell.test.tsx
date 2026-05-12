/**
 * Tests for EpssCell Component
 *
 * @requirement P2-008
 * @test-case TC-EPSS-001
 * @coverage full
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EpssCell, EpssBadge, EpssProgressBar } from './EpssCell'

describe('EpssCell', () => {
  describe('rendering', () => {
    it('should render N/A when percentile is null', () => {
      render(<EpssCell percentile={null} />)
      expect(screen.getByText('N/A')).toBeInTheDocument()
    })

    it('should render N/A when percentile is undefined', () => {
      render(<EpssCell percentile={undefined} />)
      expect(screen.getByText('N/A')).toBeInTheDocument()
    })

    it('should render percentile as percentage', () => {
      render(<EpssCell percentile={0.75} />)
      expect(screen.getByText('75%')).toBeInTheDocument()
    })

    it('should round percentile correctly', () => {
      render(<EpssCell percentile={0.756} />)
      expect(screen.getByText('76%')).toBeInTheDocument()
    })
  })

  describe('detailed view', () => {
    it('should show score when provided', () => {
      render(<EpssCell percentile={0.5} score={0.025} detailed />)

      expect(screen.getByText('50%')).toBeInTheDocument()
      expect(screen.getByText(/Score: 2.500%/)).toBeInTheDocument()
    })

    it('should show progress bar when showBar is true', () => {
      const { container } = render(<EpssCell percentile={0.6} detailed showBar />)

      // Should have progress bar element
      const progressBar = container.querySelector('.h-1\\.5')
      expect(progressBar).toBeInTheDocument()
    })
  })

  describe('color coding', () => {
    it('should use green for low percentile (<50%)', () => {
      render(<EpssCell percentile={0.3} />)
      const text = screen.getByText('30%')

      // Should have green color class
      expect(text.className).toContain('green')
    })

    it('should use yellow for medium percentile (50-79%)', () => {
      render(<EpssCell percentile={0.65} />)
      const text = screen.getByText('65%')

      expect(text.className).toContain('yellow')
    })

    it('should use red for high percentile (>=80%)', () => {
      render(<EpssCell percentile={0.85} />)
      const text = screen.getByText('85%')

      expect(text.className).toContain('red')
    })

    it('should use muted color for null', () => {
      render(<EpssCell percentile={null} />)
      const text = screen.getByText('N/A')

      expect(text.className).toContain('muted')
    })
  })

  describe('tooltip/title', () => {
    it('should have title with score when available', () => {
      const { container } = render(<EpssCell percentile={0.5} score={0.025} />)

      const element = container.firstChild as HTMLElement
      expect(element).toHaveAttribute('title', 'EPSS Score: 2.500%')
    })
  })

  describe('custom className', () => {
    it('should apply custom className', () => {
      const { container } = render(<EpssCell percentile={0.5} className="custom-class" />)

      expect(container.firstChild).toHaveClass('custom-class')
    })
  })
})

describe('EpssBadge', () => {
  it('should return null when percentile is null', () => {
    const { container } = render(<EpssBadge percentile={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('should return null when percentile is undefined', () => {
    const { container } = render(<EpssBadge percentile={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render badge with EPSS prefix', () => {
    render(<EpssBadge percentile={0.75} />)
    expect(screen.getByText(/EPSS 75%/)).toBeInTheDocument()
  })

  it('should have correct green styling for low percentile', () => {
    const { container } = render(<EpssBadge percentile={0.3} />)
    const badge = container.firstChild as HTMLElement

    expect(badge.className).toContain('bg-green-100')
    expect(badge.className).toContain('text-green-700')
  })

  it('should have correct yellow styling for medium percentile', () => {
    const { container } = render(<EpssBadge percentile={0.6} />)
    const badge = container.firstChild as HTMLElement

    expect(badge.className).toContain('bg-yellow-100')
    expect(badge.className).toContain('text-yellow-700')
  })

  it('should have correct red styling for high percentile', () => {
    const { container } = render(<EpssBadge percentile={0.9} />)
    const badge = container.firstChild as HTMLElement

    expect(badge.className).toContain('bg-red-100')
    expect(badge.className).toContain('text-red-700')
  })

  it('should apply custom className', () => {
    const { container } = render(<EpssBadge percentile={0.5} className="custom-class" />)

    expect(container.firstChild).toHaveClass('custom-class')
  })
})

describe('EpssProgressBar', () => {
  it('should return null when percentile is null', () => {
    const { container } = render(<EpssProgressBar percentile={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('should return null when percentile is undefined', () => {
    const { container } = render(<EpssProgressBar percentile={undefined} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render progress bar with correct width', () => {
    const { container } = render(<EpssProgressBar percentile={0.75} />)

    // Find the inner progress bar
    const innerBar = container.querySelector('.h-full')
    expect(innerBar).toHaveStyle({ width: '75%' })
  })

  it('should show percentage text', () => {
    render(<EpssProgressBar percentile={0.8} />)
    expect(screen.getByText('80%')).toBeInTheDocument()
  })

  it('should use green for low percentile', () => {
    const { container } = render(<EpssProgressBar percentile={0.3} />)

    const innerBar = container.querySelector('.bg-green-500')
    expect(innerBar).toBeInTheDocument()
  })

  it('should use yellow for medium percentile', () => {
    const { container } = render(<EpssProgressBar percentile={0.6} />)

    const innerBar = container.querySelector('.bg-yellow-500')
    expect(innerBar).toBeInTheDocument()
  })

  it('should use red for high percentile', () => {
    const { container } = render(<EpssProgressBar percentile={0.9} />)

    const innerBar = container.querySelector('.bg-red-500')
    expect(innerBar).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<EpssProgressBar percentile={0.5} className="custom-class" />)

    expect(container.firstChild).toHaveClass('custom-class')
  })
})

describe('Edge cases', () => {
  it('should handle 0 percentile', () => {
    render(<EpssCell percentile={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('should handle 100th percentile', () => {
    render(<EpssCell percentile={1} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('should handle very small percentile values', () => {
    render(<EpssCell percentile={0.001} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('should handle very small score values in detailed view', () => {
    render(<EpssCell percentile={0.5} score={0.00001} detailed />)

    expect(screen.getByText(/Score: 0.001%/)).toBeInTheDocument()
  })
})
