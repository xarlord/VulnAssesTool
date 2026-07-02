import { test, expect, resetAppState } from '../test-helper'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Result } from 'axe-core'

/**
 * Automated accessibility gate (axe-core, WCAG 2.1 A/AA).
 *
 * Asserts zero *critical*-impact violations on the core pages — the baseline
 * safety net called out in the improvement plan. Serious/moderate violations
 * are attached to the report for triage but do not fail the run yet; tighten
 * this threshold as the Phase-1 chart/graph and modal a11y work lands.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const CORE_PAGES: Array<{ name: string; path: string }> = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'search', path: '/search' },
  { name: 'settings', path: '/settings' },
  { name: 'executive', path: '/executive' },
]

async function analyzePage(page: Page): Promise<Result[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return results.violations
}

function summarize(violations: Result[]): string {
  return violations
    .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`)
    .join('\n')
}

test.describe('Accessibility — axe-core (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
  })

  for (const target of CORE_PAGES) {
    test(`${target.name} page has no critical accessibility violations`, async ({ page }, testInfo) => {
      await page.goto(target.path, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('#root:not(:empty)', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(500)

      const violations = await analyzePage(page)

      // Attach every violation (all impacts) so non-critical findings are
      // visible in the HTML report for follow-up without failing the gate.
      await testInfo.attach(`axe-${target.name}.json`, {
        body: JSON.stringify(violations, null, 2),
        contentType: 'application/json',
      })

      const critical = violations.filter((v) => v.impact === 'critical')
      expect(critical, `Critical a11y violations on ${target.path}:\n${summarize(critical)}`).toEqual([])
    })
  }
})
