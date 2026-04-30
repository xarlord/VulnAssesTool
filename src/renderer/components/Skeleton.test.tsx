import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  Skeleton,
  CardSkeleton,
  ProjectStatsSkeleton,
  ComponentListSkeleton,
  VulnerabilityListSkeleton,
} from './Skeleton'

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

  describe('CardSkeleton', () => {
    it('should render card skeleton without crashing', () => {
      const { container } = render(<CardSkeleton />)
      expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('should contain animated skeleton elements', () => {
      const { container } = render(<CardSkeleton />)
      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('ProjectStatsSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<ProjectStatsSkeleton />)
      expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('should render 4 stat card skeletons', () => {
      const { container } = render(<ProjectStatsSkeleton />)
      const cards = container.querySelectorAll('.rounded-lg')
      expect(cards.length).toBeGreaterThanOrEqual(4)
    })
  })

  describe('ComponentListSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<ComponentListSkeleton />)
      expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('should render multiple row skeletons', () => {
      const { container } = render(<ComponentListSkeleton />)
      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('VulnerabilityListSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<VulnerabilityListSkeleton />)
      expect(container.querySelector('div')).toBeInTheDocument()
    })

    it('should render multiple row skeletons', () => {
      const { container } = render(<VulnerabilityListSkeleton />)
      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  describe('Exported Components', () => {
    it('should export all skeleton variants', () => {
      expect(Skeleton).toBeDefined()
      expect(CardSkeleton).toBeDefined()
      expect(ProjectStatsSkeleton).toBeDefined()
      expect(ComponentListSkeleton).toBeDefined()
      expect(VulnerabilityListSkeleton).toBeDefined()
    })
  })
})
