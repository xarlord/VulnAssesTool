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

  /**
   * WCAG AA contrast, measured from composited colors rather than via axe.
   *
   * axe cannot judge the NVD CVE modal: its surface uses a background gradient, so
   * `color-contrast` returns 21 nodes as *incomplete* ("background color could not be
   * determined due to a background gradient") instead of as violations — including the very
   * element that was broken. An axe assertion here would be a gate that can never fail, so
   * the ratio is computed directly from `getComputedStyle` instead.
   */
  function relativeLuminance(color: string): number {
    const match = color.match(/rgba?\(([^)]+)\)/)
    if (!match) throw new Error(`Unparseable computed color: ${color}`)
    const [r, g, b] = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
    const channel = (value: number): number => {
      const s = value / 255
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }

  function contrastRatio(foreground: string, background: string): number {
    const a = relativeLuminance(foreground)
    const b = relativeLuminance(background)
    const [lighter, darker] = a >= b ? [a, b] : [b, a]
    return (lighter + 0.05) / (darker + 0.05)
  }

  // The CPE configuration cards in the NVD CVE modal paired hardcoded light-mode surfaces
  // (bg-red-50 / bg-green-50) with theme-aware text tokens (text-foreground /
  // text-muted-foreground). In dark mode — the default theme — that rendered the product
  // name near-white on near-white: measured 1.04:1 where WCAG AA requires 4.5:1, making the
  // affected package name effectively invisible. This asserts the composited ratio so the
  // pairing cannot regress; the modal is unreachable from CORE_PAGES (it needs a search
  // result click), which is why no existing scan caught it.
  test('NVD CVE modal CPE cards meet WCAG AA contrast in dark mode', async ({ page }) => {
    await page.goto('/search', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#root:not(:empty)', { timeout: 15000 }).catch(() => {})
    await page.click('button:has-text("NVD Database")')

    // CVE-2024-3094 is seeded with exactly 2 vulnerable CPE matches (scripts/seed-test-db.js),
    // so the "Affected Software" cards genuinely render. A full id is used because a bare
    // year prefix relies on description cross-references the seed fixture lacks.
    await page.fill('input[placeholder*="CVE ID"]', 'CVE-2024-3094')
    await page.locator('[data-testid="nvd-result"]').first().click()
    await expect(page.getByRole('heading', { name: 'Affected Software (2 configurations)' })).toBeVisible({
      timeout: 15000,
    })

    const theme = await page.evaluate(() => document.documentElement.className)
    expect(theme, 'this test is specifically about the dark theme').toContain('dark')

    const measured = await page.evaluate(() => {
      const product = Array.from(document.querySelectorAll('span.font-bold')).find(
        (span) => (span.textContent ?? '').trim() === 'xz',
      )
      if (!product) return null
      const card = product.closest('div.rounded-lg')
      return {
        color: getComputedStyle(product).color,
        background: card ? getComputedStyle(card).backgroundColor : '',
      }
    })

    expect(measured, 'the affected-product name should render inside a CPE card').not.toBeNull()
    if (!measured) throw new Error('CPE product name not found')

    const ratio = contrastRatio(measured.color, measured.background)
    expect(
      ratio,
      `CPE product name contrast was ${ratio.toFixed(2)}:1 (color ${measured.color} on ${measured.background}); WCAG AA requires >= 4.5:1`,
    ).toBeGreaterThanOrEqual(4.5)
  })

  // Severity pills inside the NVD CVE modal DO have solid backgrounds, so — unlike the
  // gradient-backed body text, which axe can only report as `incomplete` — axe can compute
  // their contrast and this is a gate that can genuinely fail. It caught 5 real violations:
  // the `--severity-critical-text` token at 3.86:1, and `bg-red-100 text-red-600` pills at
  // 3.95:1. The modal is unreachable from CORE_PAGES (it needs a search-result click) and
  // /search is scanned WITHOUT searching, so no result badge is ever in an existing scan.
  test('NVD CVE modal has no critical or serious accessibility violations', async ({ page }, testInfo) => {
    await page.goto('/search', { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#root:not(:empty)', { timeout: 15000 }).catch(() => {})
    await page.click('button:has-text("NVD Database")')
    await page.fill('input[placeholder*="CVE ID"]', 'CVE-2024-3094')
    await page.locator('[data-testid="nvd-result"]').first().click()
    await expect(page.getByRole('heading', { name: 'Affected Software (2 configurations)' })).toBeVisible({
      timeout: 15000,
    })

    const violations = await analyzePage(page)
    await testInfo.attach('axe-nvd-cve-modal.json', {
      body: JSON.stringify(violations, null, 2),
      contentType: 'application/json',
    })

    const blocking = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(blocking, `Critical/serious a11y violations in the NVD CVE modal:\n${summarize(blocking)}`).toEqual([])
  })

  /**
   * The CORE_PAGES scan of /executive is not enough on its own: with no projects the dashboard
   * renders its "No Data Available" empty state (ExecutiveDashboard.tsx:234-238) and every
   * widget is lazy-loaded, so RiskGauge / ComplianceStatus / TeamProductivity /
   * VulnerabilityTrendChart / ActionItems were never in an axe snapshot at all. Those widgets
   * hand-rolled raw palette pairs that fail AA (text-X-600 on bg-X-100 measures 2.74-4.24:1,
   * and a dark:text-X-400 variant over a light bg-X-100 measures as low as 1.55:1), which is
   * exactly the class of defect this gate exists to catch. Seeding a real project makes the
   * widgets render so they are actually scanned.
   */
  test('executive dashboard with real data has no critical or serious accessibility violations', async ({
    page,
  }, testInfo) => {
    // A real scan against the local NVD database can take up to ~90s.
    test.setTimeout(150_000)

    await createProjectWithMultipleVulnerabilities(page, `A11y Exec Test ${Date.now()}`)

    await page.evaluate(() => {
      const nav = (window as unknown as Record<string, unknown>).__navigate
      if (typeof nav === 'function') nav('/executive')
    })

    // Wait for the populated dashboard, not the empty state: the Executive Summary panel only
    // renders when metrics exist, and the widgets are lazy chunks that resolve after it.
    await expect(page.getByRole('heading', { name: 'Executive Summary' })).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'Overall Risk Level' })).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(1000)

    const violations = await analyzePage(page)
    await testInfo.attach('axe-executive-populated.json', {
      body: JSON.stringify(violations, null, 2),
      contentType: 'application/json',
    })

    const blocking = violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(blocking, `Critical/serious a11y violations on a populated /executive:\n${summarize(blocking)}`).toEqual([])

    /**
     * axe alone is NOT sufficient for this class of defect — measured: it reported zero
     * violations on this very page while `text-amber-400` on `bg-yellow-100` was rendering at
     * 1.55:1 and `text-orange-600` on `bg-orange-100` at 3.11:1. So every element carrying a
     * raw palette text class is measured directly against its own effective background, using
     * WCAG's two thresholds: 3:1 for large text (>=24px, or >=18.66px when bold) and 4.5:1
     * otherwise. Elements with no text are skipped — an icon's contrast is SC 1.4.11
     * (non-text), a different criterion from the 1.4.3 one this asserts.
     */
    const lowContrast = await page.evaluate(() => {
      const luminance = (color: string): number | null => {
        const match = color.match(/rgba?\(([^)]+)\)/)
        if (!match) return null
        const [r, g, b] = match[1].split(',').map((part) => Number.parseFloat(part.trim()))
        const channel = (value: number): number => {
          const s = value / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }
      // Walk up for the first painted background: a transparent element shows its ancestor's.
      const effectiveBackground = (element: Element): string => {
        let current: Element | null = element
        while (current) {
          const bg = getComputedStyle(current).backgroundColor
          if (bg && !bg.includes('rgba(0, 0, 0, 0)') && bg !== 'transparent') return bg
          current = current.parentElement
        }
        return 'rgb(255, 255, 255)'
      }
      const failures: string[] = []
      for (const element of Array.from(document.querySelectorAll('*'))) {
        const className = typeof element.className === 'string' ? element.className : ''
        if (!/(text)-(red|orange|amber|yellow|green|blue|gray)-\d{2,3}/.test(className)) continue
        const ownText = Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent ?? '')
          .join('')
          .trim()
        if (!ownText) continue
        const styles = getComputedStyle(element)
        const foreground = luminance(styles.color)
        const background = luminance(effectiveBackground(element))
        if (foreground === null || background === null) continue
        const [lighter, darker] = foreground >= background ? [foreground, background] : [background, foreground]
        const ratio = (lighter + 0.05) / (darker + 0.05)
        const fontSize = Number.parseFloat(styles.fontSize)
        const weight = Number.parseInt(styles.fontWeight, 10) || 400
        const isLarge = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700)
        const required = isLarge ? 3 : 4.5
        if (ratio < required) {
          failures.push(
            `"${ownText.slice(0, 30)}" ${ratio.toFixed(2)}:1 (needs ${required}:1, ${fontSize}px/${weight}) [${className.slice(0, 60)}]`,
          )
        }
      }
      return failures
    })

    expect(lowContrast, `Raw-palette text below its WCAG AA threshold:\n${lowContrast.join('\n')}`).toEqual([])
  })

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
