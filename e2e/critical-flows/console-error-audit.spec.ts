import { test, expect, type Page } from '@playwright/test'

const ROUTES = ['/', '/search', '/settings']

interface ConsoleMessage {
  type: string
  text: string
  location: { url: string; lineNumber: number; columnNumber: number }
}

function collectConsoleMessages(page: Page, messages: ConsoleMessage[]) {
  page.on('console', (msg) => {
    messages.push({
      type: msg.type(),
      text: msg.text(),
      location: {
        url: msg.location().url,
        lineNumber: msg.location().lineNumber,
        columnNumber: msg.location().columnNumber,
      },
    })
  })

  page.on('pageerror', (error) => {
    messages.push({
      type: 'pageerror',
      text: error.message,
      location: {
        url: '',
        lineNumber: 0,
        columnNumber: 0,
      },
    })
  })
}

for (const route of ROUTES) {
  test.describe(`Console Error Audit: ${route}`, () => {
    const messages: ConsoleMessage[] = []

    test.beforeEach(({ page }) => {
      messages.length = 0
      collectConsoleMessages(page, messages)
    })

    test(`should have zero console errors on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)

      const errors = messages.filter((m) => m.type === 'error' || m.type === 'pageerror')

      for (const error of errors) {
        console.log(`[ERROR] ${route}: "${error.text}" at ${error.location.url}:${error.location.lineNumber}`)
      }

      expect(
        errors,
        `Found ${errors.length} console errors on ${route}:\n${errors.map((e) => `  - ${e.text}`).join('\n')}`,
      ).toHaveLength(0)
    })

    test(`should have fewer than 5 console warnings on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)

      const warnings = messages.filter((m) => m.type === 'warning')

      for (const warning of warnings) {
        console.log(`[WARN] ${route}: "${warning.text}" at ${warning.location.url}:${warning.location.lineNumber}`)
      }

      expect(
        warnings.length,
        `Found ${warnings.length} warnings on ${route} (max 5 allowed):\n${warnings.map((w) => `  - ${w.text}`).join('\n')}`,
      ).toBeLessThan(5)
    })

    test(`should have no hydration errors on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)

      const hydrationErrors = messages.filter(
        (m) =>
          (m.type === 'error' || m.type === 'pageerror') &&
          (m.text.includes('hydration') ||
            m.text.includes('Text content did not match') ||
            m.text.includes('There was an error while hydrating')),
      )

      expect(hydrationErrors).toHaveLength(0)
    })

    test(`should have no "Cannot read properties of undefined" errors on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(3000)

      const undefinedErrors = messages.filter(
        (m) => (m.type === 'error' || m.type === 'pageerror') && m.text.includes('Cannot read properties of undefined'),
      )

      expect(undefinedErrors).toHaveLength(0)
    })

    test(`should render content on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)

      const root = page.locator('#root')
      await expect(root).toBeAttached()

      const childCount = await root.evaluate((el) => el.childElementCount)
      expect(childCount, `#root has no children on ${route}`).toBeGreaterThan(0)
    })
  })
}
