/**
 * Tests for KevBadge Component
 *
 * @requirement P2-005
 * @test-case TC-KEV-001
 * @coverage full
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KevBadge, KevBadgeWithTooltip } from './KevBadge'

describe('KevBadge', () => {
  describe('rendering', () => {
    it('should return null when isKev is false', () => {
      const { container } = render(<KevBadge isKev={false} />)
      expect(container.firstChild).toBeNull()
    })

    it('should render badge when isKev is true', () => {
      render(<KevBadge isKev={true} />)
      expect(screen.getByText('Exploited')).toBeInTheDocument()
    })

    it('should show ransomware text when knownRansomwareUse is true', () => {
      render(<KevBadge isKev={true} knownRansomwareUse={true} />)
      expect(screen.getByText('Ransomware')).toBeInTheDocument()
    })
  })

  describe('compact mode', () => {
    it('should render icon only in compact mode', () => {
      const { container } = render(<KevBadge isKev={true} compact />)
      const badge = container.firstChild as HTMLElement

      expect(badge).toHaveClass('w-5', 'h-5', 'rounded-full')
      expect(screen.queryByText('Exploited')).not.toBeInTheDocument()
    })

    it('should have title attribute in compact mode', () => {
      const { container } = render(<KevBadge isKev={true} compact />)
      const badge = container.firstChild as HTMLElement

      expect(badge).toHaveAttribute('title', 'Actively Exploited (CISA KEV)')
    })
  })

  describe('styling', () => {
    it('should have red background for exploited vulnerabilities', () => {
      const { container } = render(<KevBadge isKev={true} />)
      const badge = container.firstChild as HTMLElement

      expect(badge.className).toContain('bg-red-100')
      expect(badge.className).toContain('text-red-700')
    })

    it('should have pulse animation for ransomware', () => {
      const { container } = render(<KevBadge isKev={true} knownRansomwareUse={true} />)
      const badge = container.firstChild as HTMLElement

      expect(badge.className).toContain('animate-pulse')
      expect(badge.className).toContain('bg-red-500')
      expect(badge.className).toContain('text-white')
    })

    it('should apply custom className', () => {
      const { container } = render(<KevBadge isKev={true} className="custom-class" />)
      expect(container.firstChild).toHaveClass('custom-class')
    })
  })

  describe('accessibility', () => {
    it('should have title attribute for tooltip', () => {
      const { container } = render(<KevBadge isKev={true} />)
      const badge = container.firstChild as HTMLElement

      expect(badge).toHaveAttribute('title')
    })

    it('should indicate ransomware status in title', () => {
      const { container } = render(<KevBadge isKev={true} knownRansomwareUse={true} />)
      const badge = container.firstChild as HTMLElement

      expect(badge.getAttribute('title')).toContain('ransomware')
    })
  })
})

describe('KevBadgeWithTooltip', () => {
  it('should return null when isKev is false', () => {
    const { container } = render(<KevBadgeWithTooltip isKev={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('should render badge with tooltip wrapper', () => {
    const { container } = render(<KevBadgeWithTooltip isKev={true} />)
    expect(container.firstChild).toHaveClass('relative', 'group')
  })

  it('should contain tooltip element', () => {
    const { container } = render(<KevBadgeWithTooltip isKev={true} />)

    // Tooltip should exist (even if hidden)
    const tooltip = container.querySelector('.opacity-0')
    expect(tooltip).toBeInTheDocument()
  })

  it('should show CISA KEV text in tooltip', () => {
    const { container } = render(<KevBadgeWithTooltip isKev={true} />)

    expect(screen.getByText('CISA Known Exploited Vulnerability')).toBeInTheDocument()
  })

  it('should mention ransomware in tooltip when knownRansomwareUse is true', () => {
    render(<KevBadgeWithTooltip isKev={true} knownRansomwareUse={true} />)

    expect(screen.getByText(/ransomware campaigns/)).toBeInTheDocument()
  })

  it('should pass compact prop to inner badge', () => {
    const { container } = render(<KevBadgeWithTooltip isKev={true} compact />)

    // Compact badge should not have text
    expect(screen.queryByText('Exploited')).not.toBeInTheDocument()
  })
})
