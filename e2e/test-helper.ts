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

/**
 * Delete every server-side project so a test starts from a genuinely empty app.
 *
 * Required as of the boot-time project hydration in App.tsx: the app now lists
 * `GET /api/projects` on startup, so clearing localStorage alone leaves every earlier spec's
 * projects visible. Two contracts these specs encode depend on this — exact dashboard counts
 * (navigation.spec.ts asserts 2 cards, and an empty state with none) and FR-01.1's
 * duplicate-name guard, which correctly refuses a fixture name another spec already used
 * ('Export Test' and 'FPF Test' each appear in two workflows specs).
 *
 * Authenticates the way the client does. `.env.e2e` sets NODE_ENV=production, so authMiddleware
 * is active and an unauthenticated request gets a 401 — `/handshake` is one of its two exempt
 * paths and issues the single server token (server/middleware/auth.ts). Reading the token from
 * the page would be fragile here, since resetAppState is about to clear the localStorage copy.
 *
 * Deleting globally is safe only because this suite runs serially (`workers: 1`,
 * `fullyParallel: false` in playwright.config.ts) — no other test owns a project meanwhile.
 * Revisit if the suite is ever parallelized.
 *
 * Throws rather than returning quietly: a reset that silently no-ops reappears as unrelated
 * count assertions failing several specs later, which is exactly how the 401 above went
 * unnoticed until CI. Called outside resetAppState's catch so it stays loud.
 */
export async function clearServerProjects(page: Page): Promise<void> {
  const handshake = await page.request.get('/api/handshake')
  if (!handshake.ok()) {
    throw new Error(`e2e reset: handshake failed with ${handshake.status()}`)
  }
  const token = ((await handshake.json()) as { token?: unknown }).token
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('e2e reset: handshake returned no token')
  }
  const headers = { Authorization: `Bearer ${token}` }

  const list = await page.request.get('/api/projects?summary=1', { headers })
  if (!list.ok()) {
    throw new Error(`e2e reset: listing projects failed with ${list.status()}`)
  }
  const projects = ((await list.json()) as { data?: unknown }).data
  if (!Array.isArray(projects)) {
    throw new Error('e2e reset: project list response had no data array')
  }

  for (const entry of projects) {
    const id = typeof entry === 'object' && entry !== null ? (entry as { id?: unknown }).id : undefined
    if (typeof id !== 'string' || id.length === 0) continue
    const deleted = await page.request.delete(`/api/projects/${id}`, { headers })
    if (!deleted.ok()) {
      throw new Error(`e2e reset: deleting project ${id} failed with ${deleted.status()}`)
    }
  }
}

export async function resetAppState(page: Page) {
  await clearServerProjects(page)

  try {
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
      window.dispatchEvent(new Event('storage'))
    })

    await page.waitForTimeout(100)

    await page.goto('/dashboard', { timeout: 15000, waitUntil: 'domcontentloaded' })

    await page.waitForTimeout(300)

    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
  } catch (error) {
    console.log('Warning: Error resetting app state:', error)
    _page = null
  }
}

export { expect }
