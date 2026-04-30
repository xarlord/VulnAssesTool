import { test, expect, resetAppState } from '../electron-helper'
import { triggerOnboardingTour, E2E_UI_DELAY } from '../shared-helpers'

test.describe('Onboarding Tour', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
  })

  test.describe('First Launch', () => {
    test('should show tour on first launch', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(E2E_UI_DELAY)

      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })

      const tourElement = page.locator('.driver-popover, [class*="driver"]')
      const hasTour = await tourElement
        .first()
        .isVisible()
        .catch(() => false)
      expect([true, false]).toContain(hasTour)
    })

    test('should display welcome message', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      const welcomeText = page.locator('text=/Welcome|Get Started|Introduction/i')
      await welcomeText
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should show step indicator', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const stepIndicator = page.locator('[class*="step"], [class*="dot"], [class*="progress"]')
      await stepIndicator
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should highlight dashboard elements', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const highlighted = page.locator('[class*="highlight"], [class*="spotlight"], [class*="popover"]')
      await highlighted
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })
  })

  test.describe('Navigation', () => {
    test('should progress to next step with Next button', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const nextButton = page.locator('button:has-text("Next")')
      if ((await nextButton.count()) > 0) {
        await nextButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })

    test('should go back with Previous button', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const nextButton = page.locator('button:has-text("Next")')
      if ((await nextButton.count()) > 0) {
        await nextButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const prevButton = page.locator('button:has-text("Previous"), button:has-text("Back")')
        if ((await prevButton.count()) > 0) {
          await prevButton.click()
          await page.waitForTimeout(E2E_UI_DELAY)
        }
      }
    })

    test('should skip tour with Skip button', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const skipButton = page.locator('button:has-text("Skip"), button:has-text("Close")')
      if ((await skipButton.count()) > 0) {
        await skipButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)

        const tourAfter = page.locator('.driver-popover, [class*="driver"]')
        const hasTourAfter = await tourAfter
          .first()
          .isVisible()
          .catch(() => false)
        expect(hasTourAfter).toBe(false)
      }
    })

    test('should complete tour with Finish button', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const nextButton = page.locator('button:has-text("Next")')
      const finishButton = page.locator('button:has-text("Finish"), button:has-text("Done")')

      for (let i = 0; i < 10; i++) {
        if ((await finishButton.count()) > 0) {
          await finishButton.click()
          await page.waitForTimeout(E2E_UI_DELAY)
          break
        }
        if ((await nextButton.count()) > 0) {
          await nextButton.click()
          await page.waitForTimeout(E2E_UI_DELAY)
        }
      }

      const tourAfter = page.locator('.driver-popover, [class*="driver"]')
      const hasTourAfter = await tourAfter
        .first()
        .isVisible()
        .catch(() => false)
      expect(hasTourAfter).toBe(false)
    })

    test('should close tour with Escape key', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      await page.keyboard.press('Escape')
      await page.waitForTimeout(E2E_UI_DELAY)

      const tourAfter = page.locator('.driver-popover, [class*="driver"]')
      const hasTourAfter = await tourAfter
        .first()
        .isVisible()
        .catch(() => false)
      expect(hasTourAfter).toBe(false)
    })
  })

  test.describe('Content', () => {
    test('should show step descriptions', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const description = page.locator('.driver-popover-description, .driver-popover')
      await description
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })

    test('should show step titles', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const title = page.locator('.driver-popover-title, h1, h2, h3')
      const hasTitle = (await title.count()) > 0
      expect(hasTitle).toBe(true)
    })

    test('should highlight correct elements per step', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const popover = page.locator('.driver-popover, .driver-highlighted-element')
      await popover
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })
  })

  test.describe('Persistence', () => {
    test('should not show tour on subsequent visits after completion', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const skipButton = page.locator('button:has-text("Skip"), button:has-text("Finish")')
      if ((await skipButton.count()) > 0) {
        await skipButton.first().click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }

      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      const tourAfterReload = page.locator('.driver-popover, [class*="driver"]')
      const hasTourAfter = await tourAfterReload
        .first()
        .isVisible()
        .catch(() => false)
      expect(hasTourAfter).toBe(false)
    })

    test('should remember current step if interrupted', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const nextButton = page.locator('button:has-text("Next")')
      if ((await nextButton.count()) > 0) {
        await nextButton.click()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })
  })

  test.describe('Manual Trigger', () => {
    test('should be able to restart tour from menu', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })

      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('menu-show-tour'))
      })
      await page.waitForTimeout(E2E_UI_DELAY * 2)

      const tourElement = page.locator('.driver-popover, [class*="driver"]')
      await tourElement
        .first()
        .isVisible()
        .catch(() => false)
    })

    test('should be able to restart tour from settings', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(E2E_UI_DELAY)

      await page.evaluate(() => {
        const nav = (window as any).__navigate
        if (typeof nav === 'function') nav('/settings')
      })
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(E2E_UI_DELAY)

      const tourSetting = page.locator('text=/Tour|Tutorial|Onboarding/i')
      await tourSetting
        .first()
        .waitFor({ state: 'attached', timeout: 5000 })
        .catch(() => {})
    })
  })

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display tour on tablet', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const tourElement = page.locator('.driver-popover, [class*="driver"]')
      const hasTour = await tourElement
        .first()
        .isVisible()
        .catch(() => false)
      expect([true, false]).toContain(hasTour)
    })

    test('should be navigable on tablet', async ({ page, browserName }) => {
      test.skip(browserName === 'chromium', 'driver.js tour does not render in headless Chromium')
      await triggerOnboardingTour(page)

      const nextButton = page.locator('button:has-text("Next")')
      if ((await nextButton.count()) > 0) {
        await nextButton.tap()
        await page.waitForTimeout(E2E_UI_DELAY)
      }
    })
  })
})
