import { test as base, expect, Page } from '@playwright/test'

let _page: Page | null = null

export async function injectMockCves(page: Page, cves: Array<Record<string, unknown>>): Promise<void> {
  await page.evaluate((data) => {
    ;(window as unknown as Record<string, unknown>).__mockCves = data
  }, cves)
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.goto('/', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    })

    await page.waitForSelector('#root:not(:empty)', { timeout: 15000 }).catch(() => {
      console.log('Warning: #root may be empty')
    })

    await page.waitForTimeout(500)

    _page = page
    await use(page)
  },
})

export async function resetAppState(page: Page) {
  try {
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
      window.dispatchEvent(new Event('storage'))
    })

    await page.waitForTimeout(100)

    await page.goto('/', { timeout: 15000, waitUntil: 'domcontentloaded' })

    await page.waitForTimeout(300)

    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  } catch (error) {
    console.log('Warning: Error resetting app state:', error)
    _page = null
  }
}

export { expect }
