/**
 * Tour types for onboarding walkthrough
 */

export interface TourStep {
  /** Unique identifier for the step */
  id: string
  /** CSS selector for the target element */
  element: string
  /** Title shown in the popover */
  title: string
  /** Description text */
  description: string
  /** Position of the popover relative to element */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Whether to highlight the element */
  highlight?: boolean
  /** Action to perform when step is shown */
  onShow?: () => void
  /** Action to perform when step is completed */
  onNext?: () => void
}

export interface TourConfig {
  /** Tour identifier */
  id: string
  /** Display name */
  name: string
  /** Description of what the tour covers */
  description: string
  /** Ordered list of steps */
  steps: TourStep[]
  /** Whether this tour should show on first launch */
  showOnFirstLaunch?: boolean
  /** Whether the tour can be replayed */
  allowReplay?: boolean
}

export interface TourProgress {
  /** Tour ID */
  tourId: string
  /** Whether the tour has been completed */
  completed: boolean
  /** Current step index (0-based) */
  currentStep: number
  /** When the tour was started */
  startedAt?: Date
  /** When the tour was completed */
  completedAt?: Date
  /** Whether the tour was skipped */
  skipped: boolean
}

export type TourStatus = 'idle' | 'active' | 'completed' | 'skipped'
