import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton, SkeletonCard, SkeletonStats, SkeletonList, SkeletonTable } from './ui/skeleton'

describe('Skeleton', () => {
  describe('Base Skeleton Component', () => {
    it('should render without crashing', () => {
      const { container } = render(<Skeleton />)
      expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('should render with custom className', () => {
      const { container } = render(<Skeleton className="h-10 w-20" />)
      const div = container.querySelector('div')
      expect(div).toHaveClass('h-10')
      expect(div).toHaveClass('w-20')
    })

    it('should pass through additional props', () => {
      const { container } = render(<Skeleton data-testid="test-skeleton" />)
      const div = container.querySelector('div')
      expect(div).toHaveAttribute('data-testid', 'test-skeleton')
    })
  })

  describe('SkeletonCard', () => {
    it('should render card skeleton without crashing', () => {
      const { container } = render(<SkeletonCard />)
      expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('should contain animated skeleton elements', () => {
      const { container } = render(<SkeletonCard />)
      const skeletons = container.querySelectorAll('.skeleton')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('SkeletonStats', () => {
    it('should render without crashing', () => {
      const { container } = render(<SkeletonStats />)
      expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('should render stat card skeletons', () => {
      const { container } = render(<SkeletonStats count={4} />)
      const cards = container.querySelectorAll('.rounded-lg')
      expect(cards.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('SkeletonList', () => {
    it('should render without crashing', () => {
      const { container } = render(<SkeletonList />)
      expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('should render multiple row skeletons', () => {
      const { container } = render(<SkeletonList items={5} />)
      const skeletons = container.querySelectorAll('.skeleton')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('SkeletonTable', () => {
    it('should render without crashing', () => {
      const { container } = render(<SkeletonTable />)
      expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('should render row skeletons', () => {
      const { container } = render(<SkeletonTable rows={5} />)
      const skeletons = container.querySelectorAll('.skeleton')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('Exported Components', () => {
    it('should export all skeleton variants', () => {
      expect(Skeleton).toBeDefined()
      expect(SkeletonCard).toBeDefined()
      expect(SkeletonStats).toBeDefined()
      expect(SkeletonList).toBeDefined()
      expect(SkeletonTable).toBeDefined()
    })
  })
})
