import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook } from '@testing-library/react'
import { OnboardingTour, useOnboardingTour } from './OnboardingTour'

// Hoisted mock functions so they are available inside vi.mock factories
const {
  mockStartTour,
  mockNextStep,
  mockPrevStep,
  mockSkipTour,
  mockCompleteTour,
  mockShouldShowTour,
  mockGetTourStatus,
  mockMarkAsLaunched,
  mockHasLaunchedBefore,
} = vi.hoisted(() => ({
  mockStartTour: vi.fn(),
  mockNextStep: vi.fn(),
  mockPrevStep: vi.fn(),
  mockSkipTour: vi.fn(),
  mockCompleteTour: vi.fn(),
  mockShouldShowTour: vi.fn(() => true),
  mockGetTourStatus: vi.fn(() => 'idle'),
  mockMarkAsLaunched: vi.fn(),
  mockHasLaunchedBefore: vi.fn(() => false),
}))

// Build mock store state for the tour store
const mockTourState = {
  startTour: mockStartTour,
  nextStep: mockNextStep,
  prevStep: mockPrevStep,
  skipTour: mockSkipTour,
  completeTour: mockCompleteTour,
  shouldShowTour: mockShouldShowTour,
  getTourStatus: mockGetTourStatus,
  markAsLaunched: mockMarkAsLaunched,
  hasLaunchedBefore: false,
  activeTourId: null as string | null,
  toursProgress: {},
}

vi.mock('@/lib/tour/tourStore', () => ({
  useTourStore: (selector?: (state: typeof mockTourState) => unknown) => {
    if (selector) return selector(mockTourState)
    return mockTourState
  },
}))

// Mock driver.js to avoid real DOM side effects
const mockDrive = vi.fn()
const mockDestroy = vi.fn()

vi.mock('driver.js', () => ({
  driver: vi.fn(() => ({
    drive: mockDrive,
    destroy: mockDestroy,
  })),
}))

// Mock the CSS import (driver.js/dist/driver.css)
vi.mock('driver.js/dist/driver.css', () => ({}))

describe('OnboardingTour', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTourState.activeTourId = null
    mockTourState.toursProgress = {}
    mockTourState.hasLaunchedBefore = false
  })

  describe('Rendering', () => {
    it('should render without crashing', () => {
      const { container } = render(<OnboardingTour />)
      // The component returns null, so the container should be empty
      expect(container.innerHTML).toBe('')
    })

    it('should render without crashing when isOpen=true via startImmediately', () => {
      const { container } = render(<OnboardingTour startImmediately={true} />)
      expect(container.innerHTML).toBe('')
    })

    it('should render as null (invisible component)', () => {
      const { container } = render(<OnboardingTour tourId="main-onboarding" onComplete={vi.fn()} onSkip={vi.fn()} />)
      // OnboardingTour renders null - it is a non-visual orchestrator
      expect(container.firstChild).toBeNull()
    })
  })

  describe('Tour Lifecycle', () => {
    it('should start the driver tour when startImmediately is true', async () => {
      render(<OnboardingTour startImmediately={true} tourId="main-onboarding" />)

      // Wait for the setTimeout(100ms) inside the component
      await vi.waitFor(() => {
        expect(mockStartTour).toHaveBeenCalledWith('main-onboarding')
      })
    })

    it('should not start the tour automatically when startImmediately is false', () => {
      render(<OnboardingTour startImmediately={false} tourId="main-onboarding" />)

      expect(mockStartTour).not.toHaveBeenCalled()
    })

    it('should not start the tour for unknown tour IDs', async () => {
      render(<OnboardingTour startImmediately={true} tourId="unknown-tour" />)

      // Wait a bit to ensure any async effects complete
      await new Promise((r) => setTimeout(r, 200))

      // driver() should not be called for unknown tour IDs
      expect(mockDrive).not.toHaveBeenCalled()
    })

    it('should default to main-onboarding tour ID', async () => {
      render(<OnboardingTour startImmediately={true} />)

      // Should use 'main-onboarding' as default (async due to setTimeout 100ms)
      await vi.waitFor(() => {
        expect(mockStartTour).toHaveBeenCalledWith('main-onboarding')
      })
    })

    it('should call startTour with project-detail tour ID', async () => {
      render(<OnboardingTour startImmediately={true} tourId="project-detail" />)

      await vi.waitFor(() => {
        expect(mockStartTour).toHaveBeenCalledWith('project-detail')
      })
    })
  })

  describe('Tour Completion and Skip', () => {
    it('should accept onComplete callback prop', () => {
      const onComplete = vi.fn()
      render(<OnboardingTour onComplete={onComplete} />)

      // Component should mount without error
      expect(onComplete).not.toHaveBeenCalled()
    })

    it('should accept onSkip callback prop', () => {
      const onSkip = vi.fn()
      render(<OnboardingTour onSkip={onSkip} />)

      // Component should mount without error
      expect(onSkip).not.toHaveBeenCalled()
    })

    it('should accept both onComplete and onSkip callbacks', () => {
      const onComplete = vi.fn()
      const onSkip = vi.fn()
      render(<OnboardingTour onComplete={onComplete} onSkip={onSkip} />)

      expect(onComplete).not.toHaveBeenCalled()
      expect(onSkip).not.toHaveBeenCalled()
    })

    it('should destroy driver when activeTourId becomes null', async () => {
      // Start with an active tour so the driver gets created
      mockTourState.activeTourId = 'main-onboarding'
      const { rerender } = render(<OnboardingTour startImmediately={true} tourId="main-onboarding" />)

      await vi.waitFor(() => {
        expect(mockStartTour).toHaveBeenCalled()
      })

      // Now simulate the tour being completed/skipped (activeTourId becomes null)
      mockTourState.activeTourId = null
      rerender(<OnboardingTour tourId="main-onboarding" />)

      // The component should react to the state change and call destroy
      expect(mockDestroy).toHaveBeenCalled()
    })
  })

  describe('Style Injection', () => {
    it('should inject custom tour styles into document head on mount', () => {
      const initialStyleCount = document.head.querySelectorAll('style').length

      render(<OnboardingTour />)

      const styles = document.head.querySelectorAll('style')
      // At least one new style element should be added
      expect(styles.length).toBeGreaterThan(initialStyleCount)
    })

    it('should remove custom tour styles from document head on unmount', () => {
      const initialStyleCount = document.head.querySelectorAll('style').length

      const { unmount } = render(<OnboardingTour />)

      // Verify style was added
      const stylesDuringMount = document.head.querySelectorAll('style')
      expect(stylesDuringMount.length).toBeGreaterThan(initialStyleCount)

      // Unmount and verify cleanup
      unmount()
      const stylesAfterUnmount = document.head.querySelectorAll('style')
      expect(stylesAfterUnmount.length).toBe(initialStyleCount)
    })
  })

  describe('useOnboardingTour Hook', () => {
    it('should expose startMainTour function', () => {
      const { result } = renderHook(() => useOnboardingTour())
      expect(typeof result.current.startMainTour).toBe('function')
    })

    it('should expose startProjectTour function', () => {
      const { result } = renderHook(() => useOnboardingTour())
      expect(typeof result.current.startProjectTour).toBe('function')
    })

    it('should expose skipTour function', () => {
      const { result } = renderHook(() => useOnboardingTour())
      expect(typeof result.current.skipTour).toBe('function')
    })

    it('should expose completeTour function', () => {
      const { result } = renderHook(() => useOnboardingTour())
      expect(typeof result.current.completeTour).toBe('function')
    })

    it('should expose shouldShowTour function', () => {
      const { result } = renderHook(() => useOnboardingTour())
      expect(typeof result.current.shouldShowTour).toBe('function')
    })

    it('should expose getTourStatus function', () => {
      const { result } = renderHook(() => useOnboardingTour())
      expect(typeof result.current.getTourStatus).toBe('function')
    })

    it('should expose markAsLaunched function', () => {
      const { result } = renderHook(() => useOnboardingTour())
      expect(typeof result.current.markAsLaunched).toBe('function')
    })

    it('should expose hasLaunchedBefore boolean', () => {
      const { result } = renderHook(() => useOnboardingTour())
      expect(typeof result.current.hasLaunchedBefore).toBe('boolean')
    })

    it('should call startTour with main-onboarding when startMainTour is called', () => {
      const { result } = renderHook(() => useOnboardingTour())
      result.current.startMainTour()
      expect(mockStartTour).toHaveBeenCalledWith('main-onboarding')
    })

    it('should call startTour with project-detail when startProjectTour is called', () => {
      const { result } = renderHook(() => useOnboardingTour())
      result.current.startProjectTour()
      expect(mockStartTour).toHaveBeenCalledWith('project-detail')
    })
  })

  describe('Cleanup', () => {
    it('should destroy driver instance on unmount', async () => {
      const { unmount } = render(<OnboardingTour startImmediately={true} tourId="main-onboarding" />)

      await vi.waitFor(() => {
        expect(mockStartTour).toHaveBeenCalled()
      })

      unmount()

      expect(mockDestroy).toHaveBeenCalled()
    })
  })
})
