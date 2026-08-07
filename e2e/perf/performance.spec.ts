import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * User-facing performance budgets (NFR-01.1 / NFR-01.4 / NFR-01.6), run against the
 * built app served by the Playwright webServer (same as every other e2e project —
 * NOT the Vite dev server, which would make the numbers meaningless).
 *
 * Deliberately its own Playwright project (see playwright.config.ts's `perf` entry)
 * and NOT part of the CI e2e matrix (.github/workflows/ci.yml's `project:` list),
 * so a noisy CI runner can't flake the required gate. Run manually via:
 *   npm run test:e2e:perf
 *
 * Thresholds are intentionally set with headroom above the PRD targets (documented
 * per test, with an observed baseline) rather than pinned to the exact target — the
 * point is to catch a real regression (e.g. a render-blocking fetch, an O(n^2) render
 * loop, a debounce added to a hot handler), not to chase CI-runner-variance-driven
 * flakiness on a number a few hundred ms off the literal PRD text.
 */

/** Uses each test's own fresh browser context (Playwright's default), so this is a
 * genuinely cold navigation — no seeded localStorage, no prior page in this context. */
test.describe('NFR-01.1 — Application startup < 3s (budget: 4s)', () => {
  test('reaches a usable dashboard within budget on a cold navigation', async ({ page }) => {
    const start = Date.now()
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    // "New Project" (shell chrome + Dashboard's own quick action) is the first
    // real, interactive content marker — not a generic DOM-ready event, which
    // could pass even if the app never finished mounting/hydrating.
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
    const elapsedMs = Date.now() - start

    console.log(`[perf] NFR-01.1 cold navigation -> usable dashboard: ${elapsedMs}ms`)
    // PRD target is 3000ms; observed baseline on this dev machine was ~780ms. Budget
    // set above the PRD target (not at the observed baseline) for CI/runner-variance
    // headroom, while staying meaningfully tighter than an arbitrary large number.
    expect(elapsedMs).toBeLessThan(4000)
  })
})

/** Builds N minimal-but-schema-valid Project objects and seeds them directly into the
 * zustand persist storage key, bypassing the UI (creating 100 projects by clicking
 * through the New Project dialog would itself take far longer than the 2s budget this
 * test measures, and would contaminate the measurement). Mirrors the real persisted
 * shape (src/renderer/store/useStore.ts's `partialize`); dates are ISO strings because
 * that's what JSON.stringify produces for the real store's localStorage writes too —
 * Dashboard.tsx's own sort (`new Date(b.updatedAt)`) already handles that defensively. */
function buildSyntheticProjects(count: number): unknown[] {
  const now = Date.now()
  return Array.from({ length: count }, (_, i) => ({
    id: `perf-project-${i}`,
    name: `Perf Project ${i}`,
    createdAt: new Date(now - i * 1000).toISOString(),
    updatedAt: new Date(now - i * 1000).toISOString(),
    sbomFiles: [],
    components: [],
    vulnerabilities: [],
    statistics: {
      totalVulnerabilities: i % 5,
      criticalCount: i % 7 === 0 ? 1 : 0,
      highCount: i % 4 === 0 ? 1 : 0,
      mediumCount: i % 3 === 0 ? 1 : 0,
      lowCount: i % 2 === 0 ? 1 : 0,
      totalComponents: 10,
      vulnerableComponents: i % 5,
    },
  }))
}

async function seedProjects(page: Page, count: number): Promise<void> {
  // localStorage requires a same-origin document to already be loaded.
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate((projects) => {
    // Matches zustand persist's on-disk format (name: 'vuln-assess-storage', no
    // `version` option configured => default version 0). Only `projects` is set;
    // every other top-level key is intentionally omitted so the store's real
    // defaults (settings, profiles, etc.) apply on rehydration.
    localStorage.setItem('vuln-assess-storage', JSON.stringify({ state: { projects }, version: 0 }))
  }, buildSyntheticProjects(count))
}

test.describe('NFR-01.4 — Dashboard load < 2s with 100 projects (budget: 3s)', () => {
  test('renders the full 100-project list within budget', async ({ page }) => {
    await seedProjects(page, 100)

    const start = Date.now()
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    // "Recent Projects (100)" is driven directly by projects.length (Dashboard.tsx) —
    // a real content signal, not a fixed wait. The card-count assertion below then
    // proves every one of the 100 ProjectCards actually painted (Dashboard.tsx maps
    // the full list with no virtualization), not just that the count computed.
    await expect(page.getByText('Recent Projects (100)')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.group.rounded-lg.border')).toHaveCount(100, { timeout: 10000 })
    const elapsedMs = Date.now() - start

    console.log(`[perf] NFR-01.4 dashboard render (100 projects): ${elapsedMs}ms`)
    // PRD target is 2000ms; observed baseline on this dev machine was ~610ms. Budget
    // set above the PRD target for CI/runner-variance headroom, same convention as
    // NFR-01.1 above.
    expect(elapsedMs).toBeLessThan(3000)
  })
})

test.describe('NFR-01.6 — Interaction latency < 100ms median (budget: 250ms)', () => {
  test('opens the command palette within budget (median of 7 Ctrl+K presses)', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })

    const SAMPLES = 7
    const durationsMs: number[] = []
    const palette = page.getByRole('dialog', { name: 'Command palette' })

    for (let i = 0; i < SAMPLES; i++) {
      const start = Date.now()
      await page.keyboard.press('Control+k')
      await expect(palette).toBeVisible()
      durationsMs.push(Date.now() - start)

      await page.keyboard.press('Escape')
      await expect(palette).not.toBeVisible()
    }

    durationsMs.sort((a, b) => a - b)
    const median = durationsMs[Math.floor(durationsMs.length / 2)]

    console.log(
      `[perf] NFR-01.6 command palette open latency samples (ms): ${durationsMs.join(', ')} — median ${median}ms`,
    )
    // PRD target is 100ms — the plan doc itself flags this as an aggressive budget for
    // browser-automation-measured latency (keyboard event dispatch + Playwright's own
    // round trip aren't free). Median of several samples (not one) avoids a single GC
    // pause/CI hiccup failing the gate — the observed baseline on this dev machine was
    // a 35ms median even though one of the 7 raw samples spiked to 103ms, which is
    // exactly the single-sample flakiness this median approach is meant to avoid.
    // 250ms budget still fails on a real regression (e.g. a debounce or animation
    // delay added before the dialog opens).
    expect(median).toBeLessThan(250)
  })
})
