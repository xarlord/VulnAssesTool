/**
 * Tests for RiskScoreCell Component
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RiskScoreCell, RiskScoreBadge, RiskScoreLegend, RiskScoreSortIndicator } from './RiskScoreCell'

describe('RiskScoreCell', () => {
  describe('progress bar', () => {
    it('renders a bar whose width mirrors the computed score by default', () => {
      const { container } = render(<RiskScoreCell isKev={false} epssPercentile={null} severity="LOW" />)

      const bar = container.querySelector('.overflow-hidden')
      expect(bar).toBeInTheDocument()
      const fill = (bar as HTMLElement).firstChild as HTMLElement
      expect(fill).toHaveStyle({ width: '5%' })
    })

    it('hides the progress bar when showBar is disabled, e.g. for dense table cells', () => {
      const { container } = render(<RiskScoreCell isKev={false} epssPercentile={null} severity="LOW" showBar={false} />)

      expect(container.querySelector('.overflow-hidden')).not.toBeInTheDocument()
    })
  })

  describe('detailed breakdown tooltip', () => {
    it('stays hidden by default so table cells are not cluttered', () => {
      render(<RiskScoreCell isKev={false} epssPercentile={null} severity="MEDIUM" />)

      expect(screen.queryByText('Risk Score Breakdown')).not.toBeInTheDocument()
    })

    it('shows neutral (gray) factors when neither KEV nor EPSS data is driving the score', () => {
      render(<RiskScoreCell isKev={false} epssPercentile={null} severity="LOW" detailed />)

      expect(screen.getByText('Risk Score Breakdown')).toBeInTheDocument()
      expect(screen.getByText('0')).toHaveClass('text-gray-500') // KEV: not exploited
      expect(screen.getByText('+0')).toHaveClass('text-gray-500') // EPSS: no data available
      expect(screen.getByText('+5')).toHaveClass('text-blue-400') // Severity contribution is always shown
      expect(screen.getByText(/Severity \(LOW\)/)).toBeInTheDocument()
    })

    it('highlights KEV and EPSS factors in warning colors when they are actively raising the score', () => {
      render(<RiskScoreCell isKev={true} epssPercentile={0.9} severity="LOW" detailed />)

      expect(screen.getByText('+50')).toHaveClass('text-red-400') // KEV: actively exploited
      expect(screen.getByText('+27')).toHaveClass('text-yellow-400') // EPSS: 90th percentile
      expect(screen.getByText('82/100')).toBeInTheDocument() // 50 (KEV) + 27 (EPSS) + 5 (LOW)
    })
  })

  describe('actively exploited (KEV) visual emphasis', () => {
    it('pulses the risk icon for actively exploited (KEV) vulnerabilities to draw the eye', () => {
      const { container } = render(<RiskScoreCell isKev={true} epssPercentile={null} severity="LOW" />)

      const icon = container.querySelector('[data-testid="lucide-icon"]')
      expect(icon).toHaveClass('animate-pulse')
    })

    it('does not pulse the icon for a non-KEV vulnerability, even at critical severity', () => {
      const { container } = render(<RiskScoreCell isKev={false} epssPercentile={null} severity="CRITICAL" />)

      const icon = container.querySelector('[data-testid="lucide-icon"]')
      expect(icon).not.toHaveClass('animate-pulse')
    })
  })

  describe('risk level color coding', () => {
    it('applies high-risk (orange) styling once a non-KEV score reaches the high threshold', () => {
      const { container } = render(<RiskScoreCell isKev={false} epssPercentile={1.0} severity="CRITICAL" />)

      const badge = (container.firstChild as HTMLElement).firstChild as HTMLElement
      expect(badge.className).toContain('bg-orange-100')
      expect(screen.getByText('50')).toBeInTheDocument() // 30 (EPSS) + 20 (CRITICAL)
    })

    it('applies low-risk (green) styling for a benign vulnerability with no EPSS data', () => {
      const { container } = render(<RiskScoreCell isKev={false} epssPercentile={null} severity="NONE" />)

      const badge = (container.firstChild as HTMLElement).firstChild as HTMLElement
      expect(badge.className).toContain('bg-green-100')
      expect(screen.getByText('0')).toBeInTheDocument()
    })
  })

  describe('size variants', () => {
    it('scales the badge text classes for the sm and lg size props', () => {
      const small = render(<RiskScoreCell isKev={false} epssPercentile={null} severity="LOW" size="sm" />)
      const smallBadge = (small.container.firstChild as HTMLElement).firstChild as HTMLElement
      expect(smallBadge.className).toContain('text-xs')

      const large = render(<RiskScoreCell isKev={false} epssPercentile={null} severity="LOW" size="lg" />)
      const largeBadge = (large.container.firstChild as HTMLElement).firstChild as HTMLElement
      expect(largeBadge.className).toContain('text-base')
    })
  })
})

describe('RiskScoreBadge', () => {
  it('renders only the numeric score, with no pulse icon, for a non-KEV vulnerability', () => {
    const { container } = render(<RiskScoreBadge isKev={false} epssPercentile={null} severity="LOW" />)

    const badge = container.firstChild as HTMLElement
    expect(badge).not.toHaveClass('animate-pulse')
    expect(screen.queryByTestId('lucide-icon')).not.toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders a pulsing alert icon alongside the score for an actively exploited (KEV) vulnerability', () => {
    const { container } = render(<RiskScoreBadge isKev={true} epssPercentile={null} severity="LOW" />)

    const badge = container.firstChild as HTMLElement
    expect(badge).toHaveClass('animate-pulse')
    expect(screen.getByTestId('lucide-icon')).toBeInTheDocument()
    expect(screen.getByText('55')).toBeInTheDocument()
  })
})

describe('RiskScoreLegend', () => {
  it('lists every risk level with its score range so users can read the color coding', () => {
    render(<RiskScoreLegend />)

    expect(screen.getByText(/Critical \(70-100\)/)).toBeInTheDocument()
    expect(screen.getByText(/High \(50-69\)/)).toBeInTheDocument()
    expect(screen.getByText(/Medium \(30-49\)/)).toBeInTheDocument()
    expect(screen.getByText(/Low \(0-29\)/)).toBeInTheDocument()
  })
})

describe('RiskScoreSortIndicator', () => {
  it('renders nothing when no sort direction is active, so the header stays uncluttered', () => {
    const { container } = render(<RiskScoreSortIndicator direction={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows a down arrow when the column is sorted descending', () => {
    render(<RiskScoreSortIndicator direction="desc" />)
    expect(screen.getByText('↓')).toBeInTheDocument()
  })

  it('shows an up arrow when the column is sorted ascending', () => {
    render(<RiskScoreSortIndicator direction="asc" />)
    expect(screen.getByText('↑')).toBeInTheDocument()
  })
})
