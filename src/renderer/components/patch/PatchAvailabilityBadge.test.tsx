import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PatchAvailabilityBadge } from './PatchAvailabilityBadge'
import type { PatchAvailabilityStatus } from '@@/types'

// Mock constants
vi.mock('@@/constants', () => ({
  PATCH_STATUS_COLORS: {
    available: 'bg-green-100 text-green-800',
    partial: 'bg-yellow-100 text-yellow-800',
    upstream: 'bg-blue-100 text-blue-800',
    investigating: 'bg-purple-100 text-purple-800',
    none: 'bg-red-100 text-red-800',
  },
  PATCH_STATUS_LABELS: {
    available: 'Patch Available',
    partial: 'Partial Fix',
    upstream: 'Upstream Fix',
    investigating: 'Investigating',
    none: 'No Patch',
  },
}))

describe('PatchAvailabilityBadge', () => {
  const statuses: PatchAvailabilityStatus[] = ['available', 'partial', 'upstream', 'investigating', 'none']

  describe('Rendering', () => {
    it.each(statuses)('should render badge for %s status', (status) => {
      render(<PatchAvailabilityBadge status={status} />)

      const labelMap: Record<PatchAvailabilityStatus, string> = {
        available: 'Patch Available',
        partial: 'Partial Fix',
        upstream: 'Upstream Fix',
        investigating: 'Investigating',
        none: 'No Patch',
      }

      expect(screen.getByText(labelMap[status])).toBeInTheDocument()
    })

    it('should render with default medium size', () => {
      render(<PatchAvailabilityBadge status="available" />)

      const badge = screen.getByText('Patch Available')
      expect(badge.parentElement).toHaveClass('text-sm')
    })

    it('should render with small size', () => {
      render(<PatchAvailabilityBadge status="available" size="sm" />)

      const badge = screen.getByText('Patch Available')
      expect(badge.parentElement).toHaveClass('text-xs')
    })

    it('should render with large size', () => {
      render(<PatchAvailabilityBadge status="available" size="lg" />)

      const badge = screen.getByText('Patch Available')
      expect(badge.parentElement).toHaveClass('text-base')
    })
  })

  describe('Icons', () => {
    it('should show icon when showIcon is true', () => {
      render(<PatchAvailabilityBadge status="available" showIcon={true} />)

      const badge = screen.getByText('Patch Available')
      // Check for CheckCircle icon (svg)
      const svg = badge.parentElement?.querySelector('svg')
      expect(svg).toBeInTheDocument()
    })

    it('should not show icon when showIcon is false', () => {
      render(<PatchAvailabilityBadge status="available" showIcon={false} />)

      const badge = screen.getByText('Patch Available')
      const svg = badge.parentElement?.querySelector('svg')
      expect(svg).not.toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('should apply correct color class for available status', () => {
      render(<PatchAvailabilityBadge status="available" />)

      const badge = screen.getByText('Patch Available')
      expect(badge.parentElement).toHaveClass('bg-green-100', 'text-green-800')
    })

    it('should apply correct color class for none status', () => {
      render(<PatchAvailabilityBadge status="none" />)

      const badge = screen.getByText('No Patch')
      expect(badge.parentElement).toHaveClass('bg-red-100', 'text-red-800')
    })
  })

  describe('Accessibility', () => {
    it('should render as inline-flex element', () => {
      render(<PatchAvailabilityBadge status="available" />)

      const badge = screen.getByText('Patch Available')
      expect(badge.parentElement).toHaveClass('inline-flex')
    })

    it('should have rounded corners', () => {
      render(<PatchAvailabilityBadge status="available" />)

      const badge = screen.getByText('Patch Available')
      expect(badge.parentElement).toHaveClass('rounded-full')
    })
  })
})
