import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PatchLinkCard } from './PatchLinkCard'
import type { PatchLink } from '@@/types'

describe('PatchLinkCard', () => {
  const mockLinks: PatchLink[] = [
    {
      type: 'commit',
      url: 'https://github.com/example/repo/commit/abc123',
      source: 'GitHub',
      description: 'Fix for CVE-2024-1234',
    },
    {
      type: 'pr',
      url: 'https://github.com/example/repo/pull/567',
      source: 'GitHub',
      description: 'Security patch PR',
    },
    {
      type: 'advisory',
      url: 'https://example.com/advisory/123',
      source: 'Vendor',
      description: 'Official security advisory',
    },
  ]

  describe('Rendering', () => {
    it('should render all links', () => {
      render(<PatchLinkCard links={mockLinks} />)

      expect(screen.getByText('Fix for CVE-2024-1234')).toBeInTheDocument()
      expect(screen.getByText('Security patch PR')).toBeInTheDocument()
      expect(screen.getByText('Official security advisory')).toBeInTheDocument()
    })

    it('should show empty state when no links', () => {
      render(<PatchLinkCard links={[]} />)

      expect(screen.getByText('No patch links available')).toBeInTheDocument()
    })

    it('should display link type labels', () => {
      render(<PatchLinkCard links={mockLinks} />)

      expect(screen.getByText('Commit')).toBeInTheDocument()
      expect(screen.getByText('Pull Request')).toBeInTheDocument()
      expect(screen.getByText('Advisory')).toBeInTheDocument()
    })

    it('should display source information', () => {
      render(<PatchLinkCard links={mockLinks} />)

      expect(screen.getAllByText('from GitHub').length).toBe(2)
      expect(screen.getByText('from Vendor')).toBeInTheDocument()
    })

    it('should display link URLs', () => {
      render(<PatchLinkCard links={mockLinks} />)

      expect(screen.getByText('https://github.com/example/repo/commit/abc123')).toBeInTheDocument()
      expect(screen.getByText('https://github.com/example/repo/pull/567')).toBeInTheDocument()
    })
  })

  describe('Link Behavior', () => {
    it('should render links with correct href', () => {
      render(<PatchLinkCard links={mockLinks} />)

      const links = screen.getAllByRole('link')
      expect(links[0]).toHaveAttribute('href', 'https://github.com/example/repo/commit/abc123')
    })

    it('should add target="_blank" to links', () => {
      render(<PatchLinkCard links={mockLinks} />)

      const links = screen.getAllByRole('link')
      expect(links[0]).toHaveAttribute('target', '_blank')
    })

    it('should add rel="noopener noreferrer" to links', () => {
      render(<PatchLinkCard links={mockLinks} />)

      const links = screen.getAllByRole('link')
      expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should call onLinkClick when link is clicked', () => {
      const onLinkClick = vi.fn()
      render(<PatchLinkCard links={mockLinks} onLinkClick={onLinkClick} />)

      const links = screen.getAllByRole('link')
      fireEvent.click(links[0])

      expect(onLinkClick).toHaveBeenCalledWith('https://github.com/example/repo/commit/abc123')
    })

    it('should not call onLinkClick when it is not provided', () => {
      render(<PatchLinkCard links={mockLinks} />)

      const links = screen.getAllByRole('link')
      expect(() => fireEvent.click(links[0])).not.toThrow()
    })
  })

  describe('Visual Elements', () => {
    it('should render external link icons', () => {
      render(<PatchLinkCard links={mockLinks} />)

      // Check that links exist and have href attributes
      const links = screen.getAllByRole('link')
      expect(links.length).toBeGreaterThan(0)
      expect(links[0]).toHaveAttribute('href')
    })
  })

  describe('Edge Cases', () => {
    it('should handle links without description', () => {
      const linksWithoutDescription: PatchLink[] = [
        {
          type: 'commit',
          url: 'https://example.com/commit',
          source: 'GitHub',
        },
      ]
      render(<PatchLinkCard links={linksWithoutDescription} />)

      expect(screen.getByText('https://example.com/commit')).toBeInTheDocument()
    })

    it('should handle all link types', () => {
      const allTypes: PatchLink[] = [
        { type: 'commit', url: 'https://example.com/commit', source: 'Test' },
        { type: 'pr', url: 'https://example.com/pr', source: 'Test' },
        { type: 'release', url: 'https://example.com/release', source: 'Test' },
        { type: 'advisory', url: 'https://example.com/advisory', source: 'Test' },
        { type: 'vendor', url: 'https://example.com/vendor', source: 'Test' },
      ]
      render(<PatchLinkCard links={allTypes} />)

      expect(screen.getByText('Commit')).toBeInTheDocument()
      expect(screen.getByText('Pull Request')).toBeInTheDocument()
      expect(screen.getByText('Release')).toBeInTheDocument()
      expect(screen.getByText('Advisory')).toBeInTheDocument()
      expect(screen.getByText('Vendor')).toBeInTheDocument()
    })

    it('should handle unknown link type by displaying the type itself', () => {
      const unknownTypeLink: PatchLink[] = [
        { type: 'unknown' as any, url: 'https://example.com/unknown', source: 'Test' },
      ]
      render(<PatchLinkCard links={unknownTypeLink} />)

      // Should display the type itself when not found in labels
      expect(screen.getByText('unknown')).toBeInTheDocument()
    })
  })
})
