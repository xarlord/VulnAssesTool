/**
 * OnboardingTour Component
 * Interactive guided tour using Driver.js
 */

import { useEffect, useCallback, useRef } from 'react'
import { driver } from 'driver.js'
import type { DriveStep, Config } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useTourStore } from '@/lib/tour/tourStore'
import { mainTourConfig, projectTourConfig } from '@/lib/tour/tourSteps'
import type { TourConfig, TourStep } from '@/lib/tour/types'

interface OnboardingTourProps {
  /** Tour ID to run */
  tourId?: string
  /** Whether to start the tour immediately */
  startImmediately?: boolean
  /** Callback when tour completes */
  onComplete?: () => void
  /** Callback when tour is skipped */
  onSkip?: () => void
}

// Custom styles for the tour popovers
const tourStyles = `
  .driver-popover {
    background-color: hsl(var(--popover));
    border: 1px solid hsl(var(--border));
    border-radius: 0.75rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    max-width: 360px;
  }

  .driver-popover-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: hsl(var(--popover-foreground));
    margin-bottom: 0.5rem;
  }

  .driver-popover-description {
    font-size: 0.875rem;
    color: hsl(var(--muted-foreground));
    line-height: 1.5;
  }

  .driver-popover-progress-text {
    color: hsl(var(--muted-foreground));
    font-size: 0.75rem;
  }

  .driver-popover-navigation-btns {
    gap: 0.5rem;
  }

  .driver-popover-navigation-btns button {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .driver-popover-navigation-btns button:first-child {
    background: transparent;
    color: hsl(var(--muted-foreground));
    border: 1px solid hsl(var(--border));
  }

  .driver-popover-navigation-btns button:first-child:hover {
    background: hsl(var(--muted));
  }

  .driver-popover-navigation-btns button:last-child {
    background: hsl(var(--primary));
    color: hsl(var(--primary-foreground));
    border: none;
  }

  .driver-popover-navigation-btns button:last-child:hover {
    background: hsl(var(--primary) / 0.9);
  }

  .driver-popover-close-btn {
    color: hsl(var(--muted-foreground));
  }

  .driver-popover-close-btn:hover {
    color: hsl(var(--foreground));
  }

  .driver-active-element {
    border-radius: 0.5rem;
    box-shadow: 0 0 0 4px hsl(var(--primary) / 0.3);
  }

  .driver-highlighted-element {
    border-radius: 0.5rem;
  }

  /* Dark mode adjustments */
  .dark .driver-popover {
    background-color: hsl(var(--popover));
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  }
`

/**
 * Convert tour step to Driver.js format
 */
function toDriverStep(step: TourStep): DriveStep {
  return {
    element: step.element || undefined,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side || 'bottom',
    },
  }
}

/**
 * Get tour configuration by ID
 */
function getTourConfig(tourId: string): TourConfig | undefined {
  switch (tourId) {
    case 'main-onboarding':
      return mainTourConfig
    case 'project-detail':
      return projectTourConfig
    default:
      return undefined
  }
}

export function OnboardingTour({
  tourId = 'main-onboarding',
  startImmediately = false,
  onComplete: _onComplete,
  onSkip: _onSkip,
}: OnboardingTourProps) {
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)
  const {
    startTour,
    nextStep: _nextStep,
    prevStep: _prevStep,
    skipTour: _skipTour,
    completeTour: _completeTour,
    activeTourId,
  } = useTourStore()

  const tourConfig = getTourConfig(tourId)

  const handleDestroy = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy()
      driverRef.current = null
    }
  }, [])

  const startDriver = useCallback(() => {
    if (!tourConfig) return

    handleDestroy()

    // Convert steps to Driver.js format
    const driverSteps = tourConfig.steps.map(toDriverStep)

    const driverConfig: Config = {
      showProgress: true,
      animate: true,
      overlayColor: 'rgba(0, 0, 0, 0.5)',
      stagePadding: 8,
      stageRadius: 8,
      popoverClass: 'tour-popover',
      nextBtnText: 'Next',
      prevBtnText: 'Previous',
      doneBtnText: 'Finish',
      steps: driverSteps,
      onDestroyStarted: () => {
        // Called when user clicks close or finishes
        handleDestroy()
      },
      onHighlightStarted: (element, step, opts) => {
        // Update store with current step
        const stepIndex = opts?.stepIndex ?? 0
        const tourStep = tourConfig.steps[stepIndex]
        if (tourStep?.onShow) {
          tourStep.onShow()
        }
      },
      onHighlighted: (element, step, opts) => {
        // Called after element is highlighted
        const stepIndex = opts?.stepIndex ?? 0
        const tourStep = tourConfig.steps[stepIndex]
        if (tourStep?.onNext) {
          // Store callback for when user moves to next step
        }
      },
    }

    const driverObj = driver(driverConfig)
    driverRef.current = driverObj

    // Start the tour
    startTour(tourId)
    driverObj.drive()
  }, [tourConfig, tourId, startTour, handleDestroy])

  // Handle completion
  useEffect(() => {
    if (!activeTourId) {
      // Tour was ended
      handleDestroy()
    }
  }, [activeTourId, handleDestroy])

  // Start tour if requested
  useEffect(() => {
    if (startImmediately) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(startDriver, 100)
      return () => clearTimeout(timer)
    }
  }, [startImmediately, startDriver])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handleDestroy()
    }
  }, [handleDestroy])

  // Inject custom styles
  useEffect(() => {
    const styleElement = document.createElement('style')
    styleElement.textContent = tourStyles
    document.head.appendChild(styleElement)

    return () => {
      document.head.removeChild(styleElement)
    }
  }, [])

  // This component doesn't render anything visible
  return null
}

/**
 * Hook to programmatically control tours
 */
export function useOnboardingTour() {
  const { startTour, skipTour, completeTour, shouldShowTour, getTourStatus, markAsLaunched, hasLaunchedBefore } =
    useTourStore()

  const startMainTour = useCallback(() => {
    startTour('main-onboarding')
  }, [startTour])

  const startProjectTour = useCallback(() => {
    startTour('project-detail')
  }, [startTour])

  return {
    startMainTour,
    startProjectTour,
    skipTour,
    completeTour,
    shouldShowTour,
    getTourStatus,
    markAsLaunched,
    hasLaunchedBefore,
  }
}
