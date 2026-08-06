import { test } from '../test-helper'

/**
 * Onboarding Tour — content contracts
 *
 * OnboardingTour (src/renderer/components/onboarding/OnboardingTour.tsx) renders nothing itself
 * (`return null`, line 247) — every visible artifact of the tour is painted by driver.js outside
 * React's tree: `.driver-popover` / `.driver-popover-title` / `.driver-popover-description` /
 * `.driver-popover-progress-text` (lines 27, 35, 42, 48), `.driver-active-element` /
 * `.driver-highlighted-element` (lines 93, 98), and the `nextBtnText: 'Next'` /
 * `prevBtnText: 'Previous'` / `doneBtnText: 'Finish'` buttons (lines 177-179). That paint step
 * never completes in this suite's headless Chromium engine — which is why every test in the
 * original file already carried `test.skip(browserName === 'chromium', ...)`. playwright.config.ts
 * defines five projects (critical-flows/features/workflows/visual/a11y) and none of them set a
 * non-chromium browser, so `browserName` is unconditionally `'chromium'` here: the guard always
 * fired, and every test body beneath it — full of `if ((await x.count()) > 0)`,
 * `.isVisible().catch(() => false)`, `.waitFor(...).catch(() => {})`, and
 * `expect([true, false]).toContain(...)` — was dead code that would silently turn into false-green
 * assertions the moment a firefox/webkit project was ever added.
 *
 * There is no way to ground a real assertion about tour content in this environment, so every
 * test below is now an explicit `test.skip` with the concrete reason it can't run. Two are doubly
 * infeasible even setting rendering aside: the driver.js config never defines a "Skip"/"Close"
 * text button (OnboardingTour.tsx:177-179 only sets Next/Previous/Finish), and Settings.tsx has
 * no tour/tutorial/onboarding restart control at all (grep found zero matches).
 */

test.describe('Onboarding Tour', () => {
  test.describe('First Launch', () => {
    test.skip('should show tour on first launch', async () => {
      // App.tsx:74-83 auto-opens the tour 500ms after first launch, but its driver.js popover
      // (`.driver-popover`) never paints in this suite's headless Chromium engine.
    })

    test.skip('should display welcome message', async () => {
      // Same driver.js / headless-Chromium rendering gap as above — see file header.
    })

    test.skip('should show step indicator', async () => {
      // `.driver-popover-progress-text` (OnboardingTour.tsx:48) is configured but unrenderable headless.
    })

    test.skip('should highlight dashboard elements', async () => {
      // `.driver-active-element` / `.driver-highlighted-element` (OnboardingTour.tsx:93,98) never paint headless.
    })
  })

  test.describe('Navigation', () => {
    test.skip('should progress to next step with Next button', async () => {
      // nextBtnText: 'Next' (OnboardingTour.tsx:177) is configured but the popover never paints headless.
    })

    test.skip('should go back with Previous button', async () => {
      // prevBtnText: 'Previous' (OnboardingTour.tsx:178) is configured but the popover never paints headless.
    })

    test.skip('should skip tour with Skip button', async () => {
      // Doubly infeasible: the driver.js config only sets Next/Previous/Finish button text
      // (OnboardingTour.tsx:177-179) — there is no "Skip"/"Close" text button to click at all.
    })

    test.skip('should complete tour with Finish button', async () => {
      // doneBtnText: 'Finish' (OnboardingTour.tsx:179) is configured but the popover never paints headless.
    })

    test.skip('should close tour with Escape key', async () => {
      // The tour never paints headless, so there is nothing for Escape to visibly dismiss.
    })
  })

  test.describe('Content', () => {
    test.skip('should show step descriptions', async () => {
      // `.driver-popover-description` (OnboardingTour.tsx:42) is configured but unrenderable headless.
    })

    test.skip('should show step titles', async () => {
      // `.driver-popover-title` (OnboardingTour.tsx:35) is configured but unrenderable headless.
    })

    test.skip('should highlight correct elements per step', async () => {
      // Per-step targets come from tourSteps.ts, but `.driver-highlighted-element` never paints headless.
    })
  })

  test.describe('Persistence', () => {
    test.skip('should not show tour on subsequent visits after completion', async () => {
      // hasLaunchedBefore persists to localStorage (tourStore.ts:159-176) and gates App.tsx's
      // first-launch auto-show (App.tsx:74-83), but the popover never paints headless on a fresh
      // launch either, so "not visible after reload" can't be distinguished from "never renders here".
    })

    test.skip('should remember current step if interrupted', async () => {
      // tourStore.ts persists `currentStep` per tour (lines 53,73,84,91,176) across reloads, but
      // advancing it requires clicking driver.js's Next button, which never paints headless.
    })
  })

  test.describe('Manual Trigger', () => {
    test.skip('should be able to restart tour from menu', async () => {
      // App.tsx:87-94 really does wire `menu-show-tour` to reopen the tour, but the resulting
      // popover never paints in this suite's headless Chromium engine.
    })

    test.skip('should be able to restart tour from settings', async () => {
      // Settings.tsx has no tour/tutorial/onboarding restart control — this feature does not exist.
    })
  })

  test.describe('Responsive Design', () => {
    test.skip('should display tour on tablet', async () => {
      // Same driver.js / headless-Chromium rendering gap as above, independent of viewport.
    })

    test.skip('should be navigable on tablet', async () => {
      // Same driver.js / headless-Chromium rendering gap as above, independent of viewport.
    })
  })
})
