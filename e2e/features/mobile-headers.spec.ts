import type { Page } from '@playwright/test'
import { test, expect, resetAppState } from '../test-helper'
import { createTestProject, spaNavigate, E2E_UI_DELAY } from '../shared-helpers'

/**
 * Regression guard for responsive page headers (mobile nav).
 *
 * Every page renders its own <header> with the logo/back control on one side
 * and an action-button cluster on the other. Before the responsive fix these
 * rows did not wrap, so on a phone the action cluster overflowed and forced the
 * whole page to scroll sideways. The responsive classes (flex-wrap + reduced
 * mobile padding) exist specifically to prevent that. These tests fail if those
 * classes are removed — the header would overflow its own box again.
 */

const MOBILE_VIEWPORT = { width: 375, height: 667 }

// A header whose content overflows horizontally reports scrollWidth > clientWidth.
async function headerMetrics(page: Page): Promise<{ found: boolean; scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => {
    const header = document.querySelector('header')
    if (!header) return { found: false, scrollWidth: 0, clientWidth: 0 }
    return { found: true, scrollWidth: header.scrollWidth, clientWidth: header.clientWidth }
  })
}

async function documentMetrics(page: Page): Promise<{ scrollWidth: number; clientWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

test.describe('Mobile responsive headers', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // The marketing HomePage was removed — '/' redirects to the Dashboard,
  // whose header is covered by the test below.
  test('Dashboard header fits within a 375px phone viewport', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
    await spaNavigate(page, '/dashboard')
    await page.waitForSelector('header')

    const header = await headerMetrics(page)
    expect(header.found).toBe(true)
    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth + 1)

    const doc = await documentMetrics(page)
    expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth + 1)
  })

  test('ProjectDetail header (most action buttons) fits within a 375px phone viewport', async ({ page }) => {
    // Create at desktop width for reliable dialog interaction, then shrink.
    await createTestProject(page, `Mobile Nav ${Date.now()}`)
    await page.setViewportSize(MOBILE_VIEWPORT)
    await page.waitForTimeout(E2E_UI_DELAY)
    await page.waitForSelector('header')

    const header = await headerMetrics(page)
    expect(header.found).toBe(true)
    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth + 1)
  })
})
