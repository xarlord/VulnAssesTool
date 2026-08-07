import { test, expect, resetAppState } from '../test-helper'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Result } from 'axe-core'
import { createProjectWithMultipleVulnerabilities } from '../shared-helpers'

/**
 * Automated accessibility gate (axe-core, WCAG 2.1 A/AA).
 *
 * Asserts zero *critical* or *serious* violations on the core pages (NFR-04.5).
 * The gate was tightened from critical-only to critical+serious once the active
 * nav-item contrast violation (text-primary on bg-primary/15, 2.88:1) was fixed;
 * this pins the WCAG AA contrast floor so a regression reddens the gate. Moderate
 * and minor violations are still attached to the report for triage only.
 *
 * ProjectDetail and the dependency graph are dynamic routes (they need a real
 * project id), so they can't live in the static CORE_PAGES table below — they get
 * their own tests further down that seed a project via
 * createProjectWithMultipleVulnerabilities (real scan against the offline NVD
 * database) so the page is meaningfully populated rather than an empty shell.
 */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const CORE_PAGES: Array<{ name: string; path: string }> = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'search', path: '/search' },
  { name: 'settings', path: '/settings' },
  { name: 'executive', path: '/executive' },
]

/**
 * Freezes CSS animations/transitions before scanning. Without this, an element that
 * uses `animate-pulse` (opacity oscillating, e.g. KevBadge/RiskScoreBadge's KEV
 * indicator) can get axe-scanned mid-cycle at reduced opacity, producing a
 * color-contrast reading that doesn't reflect the element's steady-state rendered
 * color — a known axe/Playwright determinism gotcha, not a real per-frame WCAG
 * requirement. This makes the *measurement* deterministic; it does not touch impact
 * filtering or exclude any rule/page.
 */
async function freezeAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
  })
}

async function analyzePage(page: Page): Promise<Result[]> {
  await freezeAnimations(page)
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return results.violations
}

function summarize(violations: Result[]): string {
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s)`).join('\n')
}

test.describe('Accessibility — axe-core (WCAG 2.1 AA)', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
  })

  for (const target of CORE_PAGES) {
    test(`${target.name} page has no critical or serious accessibility violations`, async ({ page }, testInfo) => {
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

      const blocking = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
      expect(blocking, `Critical/serious a11y violations on ${target.path}:\n${summarize(blocking)}`).toEqual([])
    })
  }

  // ProjectDetail and the dependency graph are dynamic (/project/:id[...]) routes,
  // so — unlike CORE_PAGES — they need a real, meaningfully-populated project
  // rather than a static path. Seeded once via a real scan so the page renders its
  // actual severity badges/tabs/graph nodes, not an empty-state shell that would
  // trivially pass the gate without exercising the real content.
  test('project detail and dependency graph pages have no critical or serious accessibility violations', async ({
    page,
  }, testInfo) => {
    // A real scan against the local NVD database can take up to ~90s (see
    // shared-helpers.ts createProjectWithMultipleVulnerabilities).
    test.setTimeout(150_000)

    const projectName = `A11y Scan Test ${Date.now()}`
    await createProjectWithMultipleVulnerabilities(page, projectName)

    const projectId = page.url().match(/\/project\/([^/]+)/)?.[1]
    if (!projectId) throw new Error('Project id not found in current URL after seeding')

    // --- ProjectDetail (/project/:id) ---
    const detailViolations = await analyzePage(page)
    await testInfo.attach('axe-project-detail.json', {
      body: JSON.stringify(detailViolations, null, 2),
      contentType: 'application/json',
    })
    const detailBlocking = detailViolations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(
      detailBlocking,
      `Critical/serious a11y violations on /project/${projectId}:\n${summarize(detailBlocking)}`,
    ).toEqual([])

    // --- Dependency graph (/project/:id/graph) ---
    await page.evaluate((path) => {
      const nav = (window as unknown as Record<string, unknown>).__navigate
      if (typeof nav === 'function') nav(path)
    }, `/project/${projectId}/graph`)
    await expect(page.locator('h1:has-text("Dependency Graph")')).toBeVisible({ timeout: 15000 })
    // Let the cytoscape layout settle before scanning — axe evaluates a live DOM
    // snapshot, and the canvas/listbox pairing (DependencyGraph.tsx) is present
    // as soon as the container mounts, but give the fcose layout a beat anyway.
    await page.waitForTimeout(500)

    const graphViolations = await analyzePage(page)
    await testInfo.attach('axe-dependency-graph.json', {
      body: JSON.stringify(graphViolations, null, 2),
      contentType: 'application/json',
    })
    const graphBlocking = graphViolations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(
      graphBlocking,
      `Critical/serious a11y violations on /project/${projectId}/graph:\n${summarize(graphBlocking)}`,
    ).toEqual([])
  })
})
