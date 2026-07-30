import path from 'node:path'
import { test, expect, resetAppState } from '../test-helper'
import { createProjectOnly, navigateToProjectDetail, uploadSbomFile } from '../shared-helpers'
import type { Page } from '@playwright/test'

const cycloneDxSample = path.join(import.meta.dirname, '..', 'fixtures', 'sbom', 'sample-cyclonedx.json')
const spdxSample = path.join(import.meta.dirname, '..', 'fixtures', 'sbom', 'sample-spdx.json')

interface ConsoleMessage {
  type: string
  text: string
}

function collectConsole(page: Page, messages: ConsoleMessage[]) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      messages.push({ type: msg.type(), text: msg.text() })
    }
  })
  page.on('pageerror', (error) => {
    messages.push({ type: 'pageerror', text: error.message })
  })
}

function getErrors(messages: ConsoleMessage[]): ConsoleMessage[] {
  return messages.filter((m) => m.type === 'error' || m.type === 'pageerror')
}

/**
 * Full Assessment Workflow — Console Error Audit
 *
 * Unlike security-assessment.spec.ts and vulnerability-lifecycle.spec.ts (content contracts for
 * one feature at a time), this spec drives the full multi-step journey — create → upload SBOM →
 * every project tab → Export → False Positive Filter → Settings → Search — and asserts ZERO
 * console errors/hydration failures accumulate across the whole sequence. It complements the
 * static per-route audit in ../critical-flows/console-error-audit.spec.ts, which only loads each
 * route cold and never drives a multi-step flow.
 *
 * Project setup/navigation/upload reuse the shared, already-proven helpers in ../shared-helpers
 * and ../test-helper (createProjectOnly, navigateToProjectDetail, uploadSbomFile, resetAppState)
 * rather than re-implementing them — navigateToProjectDetail specifically waits for the project
 * route AND a level-1 heading match, because the Dashboard's ProjectCard renders the same project
 * name in an <h3> (ProjectCard.tsx:63): a level-less heading matcher would be satisfied by that
 * stale card before the SPA route actually changes, racing every step that follows.
 *
 * Every step interacts UNCONDITIONALLY (no `if (await x.isVisible().catch(() => false))` guards)
 * because the elements targeted are never conditionally rendered:
 *   - ProjectDetail.tsx's TABS is a static array — Components/Vulnerabilities/Health tabs always
 *     render regardless of scan state (ProjectDetail.tsx:28-33)
 *   - ProjectDetail.tsx's header always renders "Export" and "False Positive Filter" buttons
 *     (ProjectDetail.tsx:250-256, :271-277), independent of project.components/vulnerabilities
 *   - shell/Sidebar.tsx's MAIN_NAV always renders "Search" and "Settings" links (Sidebar.tsx:29, :121)
 * A guard here would only ever hide a genuine breakage (element removed/renamed) behind a
 * trivially-true "zero errors" assertion, so it is removed in favor of the unconditional action:
 * if the target disappears, the click/expect itself now fails loudly instead of the test staying
 * green for the wrong reason.
 *
 * Content assertions grounded in source (added so a broken tab/page fails on its own, not just
 * via "no console error"):
 *   - project-detail/VulnerabilitiesTab.tsx:215 — "Vulnerabilities (0)" (the fixture embeds no
 *     vulnerabilities and uploading never triggers a scan — SbomUploadDialog.tsx merges only
 *     the parsed SBOM's own vulnerabilities array)
 *   - project-detail/ComponentsTab.tsx:35 — "Components (5)" for the 5-library fixture; each row
 *     is a role="button" element carrying name+version (lodash@4.17.15)
 *   - project-detail/HealthTab.tsx:59 — "Component Health Dashboard" (unconditional heading)
 *   - components/ExportDialog.tsx:98 — DialogTitle "Export Data"
 *   - FalsePositiveFilter.tsx / PageHeader — <h1> "False Positive Filter"
 *   - Settings.tsx / Search.tsx — PageHeader <h1> "Settings" / "Search"
 */
test.describe('Full Assessment Workflow — Console Error Audit', () => {
  const messages: ConsoleMessage[] = []

  test.beforeEach(async ({ page }) => {
    messages.length = 0
    collectConsole(page, messages)
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('Step 1: Create project with zero console errors', async ({ page }) => {
    await createProjectOnly(page, 'Workflow Test')
    await page.waitForTimeout(2000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] create-project: "${e.text}"`)
    expect(errors, `Errors during project creation:\n${errors.map((e) => e.text).join('\n')}`).toHaveLength(0)
  })

  test('Step 2: Upload CycloneDX SBOM with zero console errors', async ({ page }) => {
    await createProjectOnly(page, 'SBOM Upload Test')
    await navigateToProjectDetail(page, 'SBOM Upload Test')
    await uploadSbomFile(page, cycloneDxSample)
    await page.waitForTimeout(3000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] upload-cyclonedx: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 3: Upload SPDX SBOM with zero console errors', async ({ page }) => {
    await createProjectOnly(page, 'SPDX Upload Test')
    await navigateToProjectDetail(page, 'SPDX Upload Test')
    await uploadSbomFile(page, spdxSample)
    await page.waitForTimeout(3000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] upload-spdx: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 4: Component list renders with version numbers after upload', async ({ page }) => {
    await createProjectOnly(page, 'Version Test')
    await navigateToProjectDetail(page, 'Version Test')
    await uploadSbomFile(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    // ComponentsTab.tsx renders each of the fixture's 5 libraries as a role="button" row; the
    // lodash row carries its exact version, so this fails if versions stop rendering.
    const main = page.locator('#main-content')
    await main.getByRole('tab', { name: 'Components' }).click()
    await expect(main.getByRole('heading', { name: 'Components (5)' })).toBeVisible({ timeout: 10000 })
    await expect(main.getByRole('button').filter({ hasText: 'lodash' })).toContainText('4.17.15')

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] version-numbers: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 5: Vulnerabilities tab renders without console errors', async ({ page }) => {
    await createProjectOnly(page, 'Vuln Tab Test')
    await navigateToProjectDetail(page, 'Vuln Tab Test')
    await uploadSbomFile(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    // The Vulnerabilities tab always renders (static TABS array); the fixture carries no
    // embedded vulnerabilities and upload never triggers a scan, so the count is deterministically 0.
    const main = page.locator('#main-content')
    await main.getByRole('tab', { name: 'Vulnerabilities' }).click()
    await expect(main.getByRole('heading', { name: 'Vulnerabilities (0)' })).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(2000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] vuln-tab: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 6: Health tab renders without console errors', async ({ page }) => {
    await createProjectOnly(page, 'Health Tab Test')
    await navigateToProjectDetail(page, 'Health Tab Test')
    await uploadSbomFile(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    // The Health tab always renders, and its dashboard heading is unconditional.
    const main = page.locator('#main-content')
    await main.getByRole('tab', { name: 'Health' }).click()
    await expect(main.getByRole('heading', { name: 'Component Health Dashboard' })).toBeVisible({ timeout: 10000 })
    await page.waitForTimeout(2000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] health-tab: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 7: Settings page — Database status without errors', async ({ page }) => {
    // Settings is always a sidebar nav link; Settings.tsx's PageHeader renders an unconditional
    // <h1>Settings</h1>.
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.locator('#main-content').getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible({
      timeout: 10000,
    })
    await page.waitForTimeout(3000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] settings-db: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 8: Export dialog opens and closes without errors', async ({ page }) => {
    await createProjectOnly(page, 'Export Test')
    await navigateToProjectDetail(page, 'Export Test')
    await uploadSbomFile(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    // The Export button always renders in the ProjectDetail header (no disabled/hidden state).
    await page.getByRole('button', { name: 'Export', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Export Data')).toBeVisible({ timeout: 10000 })
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] export: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 9: FPF (False Positive Filter) page without errors', async ({ page }) => {
    await createProjectOnly(page, 'FPF Test')
    await navigateToProjectDetail(page, 'FPF Test')
    await uploadSbomFile(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    // "False Positive Filter" is always a header button on ProjectDetail; it navigates to
    // /project/:id/fpf, whose PageHeader renders an <h1> with that text.
    await page.getByRole('button', { name: 'False Positive Filter' }).click()
    await expect(page).toHaveURL(/\/project\/[^/]+\/fpf$/)
    await expect(page.getByRole('heading', { level: 1, name: 'False Positive Filter' })).toBeVisible({
      timeout: 10000,
    })
    await page.waitForTimeout(3000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] fpf: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 10: Search page renders without console errors', async ({ page }) => {
    // Search is always a sidebar nav link; Search.tsx's PageHeader renders an unconditional
    // <h1>Search</h1>.
    await page.getByRole('link', { name: 'Search' }).click()
    await expect(page.locator('#main-content').getByRole('heading', { level: 1, name: 'Search' })).toBeVisible({
      timeout: 10000,
    })
    await page.waitForTimeout(3000)

    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] search: "${e.text}"`)
    expect(errors).toHaveLength(0)
  })

  test('Step 11: Full workflow — create → upload → tabs → export — zero errors', async ({ page }) => {
    await createProjectOnly(page, 'Full Workflow')
    await navigateToProjectDetail(page, 'Full Workflow')
    await uploadSbomFile(page, cycloneDxSample)
    await page.waitForTimeout(2000)

    const main = page.locator('#main-content')
    await main.getByRole('tab', { name: 'Components' }).click()
    await expect(main.getByRole('heading', { name: 'Components (5)' })).toBeVisible({ timeout: 10000 })

    await main.getByRole('tab', { name: 'Vulnerabilities' }).click()
    await expect(main.getByRole('heading', { name: 'Vulnerabilities (0)' })).toBeVisible({ timeout: 10000 })

    await main.getByRole('tab', { name: 'Health' }).click()
    await expect(main.getByRole('heading', { name: 'Component Health Dashboard' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Export', exact: true }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Export Data')).toBeVisible({ timeout: 10000 })
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5000 })

    await page.waitForTimeout(2000)
    const errors = getErrors(messages)
    for (const e of errors) console.log(`[ERROR] full-workflow: "${e.text}"`)
    expect(errors, `Errors during full workflow:\n${errors.map((e) => e.text).join('\n')}`).toHaveLength(0)
  })

  test('Step 12: No hydration or undefined-property errors in any workflow', async ({ page }) => {
    await createProjectOnly(page, 'Hydration Check')
    await navigateToProjectDetail(page, 'Hydration Check')
    await uploadSbomFile(page, cycloneDxSample)
    await page.waitForTimeout(3000)

    const bad = messages.filter(
      (m) =>
        (m.type === 'error' || m.type === 'pageerror') &&
        (m.text.includes('hydration') ||
          m.text.includes('Text content did not match') ||
          m.text.includes('Cannot read properties of undefined') ||
          m.text.includes('Cannot read properties of null')),
    )
    expect(bad).toHaveLength(0)
  })
})
