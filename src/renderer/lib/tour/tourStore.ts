/**
 * Tour Store - Zustand store for managing onboarding tour progress
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { TourProgress, TourStatus } from './types'

interface TourState {
  /** Progress for each tour by ID */
  toursProgress: Record<string, TourProgress>
  /** Currently active tour ID */
  activeTourId: string | null
  /** Whether the app has been launched before */
  hasLaunchedBefore: boolean

  // Actions
  /** Start a tour */
  startTour: (tourId: string) => void
  /** Complete the current step and move to next */
  nextStep: () => void
  /** Go back to previous step */
  prevStep: () => void
  /** Skip the current tour */
  skipTour: () => void
  /** Complete the current tour */
  completeTour: () => void
  /** Check if a tour should show on first launch */
  shouldShowTour: (tourId: string) => boolean
  /** Get tour status */
  getTourStatus: (tourId: string) => TourStatus
  /** Mark app as launched */
  markAsLaunched: () => void
  /** Reset tour progress (for testing) */
  _resetStore: () => void
}

export const useTourStore = create<TourState>()(
  persist(
    (set, get) => ({
      toursProgress: {},
      activeTourId: null,
      hasLaunchedBefore: false,

      startTour: (tourId: string) => {
        set((state) => ({
          activeTourId: tourId,
          toursProgress: {
            ...state.toursProgress,
            [tourId]: {
              tourId,
              completed: false,
              currentStep: 0,
              startedAt: new Date(),
              skipped: false,
            },
          },
        }))
      },

      nextStep: () => {
        const { activeTourId, toursProgress } = get()
        if (!activeTourId) return

        const progress = toursProgress[activeTourId]
        if (!progress) return

        set((state) => ({
          toursProgress: {
            ...state.toursProgress,
            [activeTourId]: {
              ...progress,
              currentStep: progress.currentStep + 1,
            },
          },
        }))
      },

      prevStep: () => {
        const { activeTourId, toursProgress } = get()
        if (!activeTourId) return

        const progress = toursProgress[activeTourId]
        if (!progress || progress.currentStep <= 0) return

        set((state) => ({
          toursProgress: {
            ...state.toursProgress,
            [activeTourId]: {
              ...progress,
              currentStep: progress.currentStep - 1,
            },
          },
        }))
      },

      skipTour: () => {
        const { activeTourId, toursProgress } = get()
        if (!activeTourId) return

        const progress = toursProgress[activeTourId]
        if (!progress) return

        set((state) => ({
          activeTourId: null,
          toursProgress: {
            ...state.toursProgress,
            [activeTourId]: {
              ...progress,
              skipped: true,
              completedAt: new Date(),
            },
          },
        }))
      },

      completeTour: () => {
        const { activeTourId, toursProgress } = get()
        if (!activeTourId) return

        const progress = toursProgress[activeTourId]
        if (!progress) return

        set((state) => ({
          activeTourId: null,
          toursProgress: {
            ...state.toursProgress,
            [activeTourId]: {
              ...progress,
              completed: true,
              completedAt: new Date(),
            },
          },
        }))
      },

      shouldShowTour: (tourId: string) => {
        const { toursProgress, hasLaunchedBefore } = get()
        const progress = toursProgress[tourId]

        // Show on first launch if never completed or skipped
        if (!hasLaunchedBefore) {
          return !progress?.completed && !progress?.skipped
        }

        return false
      },

      getTourStatus: (tourId: string): TourStatus => {
        const { activeTourId, toursProgress } = get()
        const progress = toursProgress[tourId]

        if (activeTourId === tourId) return 'active'
        if (progress?.skipped) return 'skipped'
        if (progress?.completed) return 'completed'
        return 'idle'
      },

      markAsLaunched: () => {
        set({ hasLaunchedBefore: true })
      },

      _resetStore: () =>
        set({
          toursProgress: {},
          activeTourId: null,
          hasLaunchedBefore: false,
        }),
    }),
    {
      name: 'vuln-assess-tour-storage',
      partialize: (state) => ({
        toursProgress: state.toursProgress,
        hasLaunchedBefore: state.hasLaunchedBefore,
      }),
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
