import type { Locator, Page } from '@playwright/test'
import { test, expect, resetAppState } from '../test-helper'
import { createTestProject, uploadSbomFile, navigateToVulnerabilitiesTab } from '../shared-helpers'
import path from 'node:path'

/**
 * KEV/EPSS Intelligence — content contracts
 *
 * This suite runs offline against a seeded NVD DB, and CISA's live feed is unreachable here
 * (confirmed: KevService's background sync logs "HTTP 403"). But KEV status is NOT purely a
 * live-network feature: KevService ships a hardcoded fallback catalog (`EMBEDDED_KEV_ENTRIES`,
 * server/services/intelligence/KevService.ts:577-821) that's loaded into the local `kev_catalog`
 * table whenever it's empty (KevService.ts:110-121, `initialize` -> `loadBaseline` ->
 * `loadEmbeddedBaseline`, both fully synchronous/local — no network involved). That embedded
 * list includes `CVE-2021-44228` (Log4Shell) at KevService.ts:773-784, exactly the CVE
 * `sbom-with-vulns.json` scans to. `useProjectScan.ts:119` unconditionally awaits
 * `enrichVulnerabilities()` (which calls the local, network-free `kevService.isKev()` /
 * `getKevDetails()` via server/routes/intelligence.ts:19-49) BEFORE the enriched vulnerabilities
 * are ever written to project state — so every vulnerability the UI ever shows is already
 * KEV-checked. Verified directly against the checked-in e2e fixture DB (`.e2e-data/nvd-data.db`):
 * `kev_catalog` already has a `CVE-2021-44228` row whose `notes` field
 * ("Also known as Log4Shell; extremely widespread impact") is a verbatim match for the embedded
 * baseline literal, proving it came from that fallback path, not a lucky live sync. So KEV
 * badge/detail content for Log4Shell is a genuine, reliable, offline content contract, and the
 * "KEV Badge" / relevant "Filtering" / "Vulnerability Detail" tests below are real, not skips.
 *
 * EPSS is different: `EpssService` (server/services/intelligence/EpssService.ts) has no bundled
 * baseline at all — `getEpssScore(s)` only ever calls the live `api.first.org` API (L84-99,
 * L247-309) or reads a previously-cached successful fetch. With no offline fallback and the
 * network genuinely unavailable in the target CI, `epssScore`/`epssPercentile` stay `undefined`,
 * so any EPSS-specific UI (VulnerabilityDetailModal.tsx:241, gated on
 * `epssScore !== undefined`) never renders — those tests stay honest skips.
 *
 * Composite risk score is a middle case: `enrichVulnerabilities.ts:67-75` unconditionally
 * computes `riskScore` for every vulnerability (no network needed for the calculation itself —
 * `calculateRiskScore`, src/renderer/lib/services/riskScore.ts:82-111 — is pure local math), so
 * the risk-score UI DOES render offline. But its exact numeric value mixes in the EPSS
 * component (0-30 pts, riskScore.ts:87), which is only non-zero when the (unreliable) EPSS
 * fetch succeeds — so the precise number is not safely assertable. What IS safe: Log4Shell's
 * KEV(+50) and CRITICAL severity(+20) alone floor its score at 70 regardless of EPSS
 * (riskScore.ts:58-64,69,84,93), which is >= the modal's "High risk" threshold
 * (VulnerabilityDetailModal.tsx:257), so that classification text is asserted as a real,
 * EPSS-independent contract; the exact row-level badge NUMBER is not.
 *
 * Not duplicated here: cve-database-sync.spec.ts covers the Settings "KEV Entries: 0" card;
 * security-assessment.spec.ts covers the vulnerabilities empty-state; vulnerability-details.spec.ts
 * covers the detail modal's title/severity/source/close-button content contracts (not
 * Threat-Intelligence content, which is unique to this file).
 */

const SBOM_WITH_VULNS = path.join(import.meta.dirname, '..', 'fixtures', 'sbom-with-vulns.json')

/**
 * Create a project, upload the log4j/express SBOM fixture, and run a real scan against the
 * seeded offline NVD DB. Every vulnerability that reaches the UI is already KEV/risk-enriched
 * (useProjectScan.ts:119 awaits enrichVulnerabilities before writing project state), so no
 * extra wait is needed beyond the "Vulnerabilities (4)" heading.
 */
async function scanLog4jProject(page: Page, projectName: string): Promise<void> {
  await createTestProject(page, projectName)
  await uploadSbomFile(page, SBOM_WITH_VULNS)

  const scanButton = page.getByRole('button', { name: 'Scan for Vulnerabilities' })
  await expect(scanButton).toBeEnabled({ timeout: 10000 })
  await scanButton.click()

  await navigateToVulnerabilitiesTab(page)
  await expect(page.locator('#main-content').getByRole('heading', { name: 'Vulnerabilities (4)' })).toBeVisible({
    timeout: 120_000,
  })
}

/**
 * Isolate Log4Shell via the exact-severity filter (the only way to get a single unambiguous
 * "View Details" button — matches critical-flows/vulnerability-details.spec.ts's pattern) and
 * open its detail modal.
 */
async function openLog4jDetailModal(page: Page): Promise<Locator> {
  const main = page.locator('#main-content')
  await main.locator('select').selectOption('critical')
  await expect(main.getByText('CVE-2021-44228').first()).toBeVisible()

  await main.getByRole('button', { name: 'View Details' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'CVE-2021-44228' })).toBeVisible()
  return dialog
}

test.describe('KEV/EPSS Intelligence', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  // ==========================================================================
  // KEV Badge Tests
  // ==========================================================================

  test.describe('KEV Badge', () => {
    test('should display KEV badge for known exploited vulnerabilities', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `KEV Badge Test ${Date.now()}`)

      // Log4Shell is in KevService's bundled fallback KEV catalog (KevService.ts:773-784),
      // so KevBadge (KevBadge.tsx:34-53) renders its compact "Actively Exploited" badge.
      const main = page.locator('#main-content')
      await expect(main.locator('[title="Actively Exploited (CISA KEV)"]')).toBeVisible()
    })

    test('should show KEV icon', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `KEV Icon Test ${Date.now()}`)

      // KevBadge.tsx:50 renders an AlertTriangle svg inside the compact badge.
      const main = page.locator('#main-content')
      const kevBadge = main.locator('[title="Actively Exploited (CISA KEV)"]')
      await expect(kevBadge.locator('svg')).toBeVisible()
    })

    test('should show KEV tooltip on hover', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `KEV Tooltip Test ${Date.now()}`)

      // The compact badge's info-on-hover is a native `title` attribute (KevBadge.tsx:48), not
      // a custom [role="tooltip"] widget — hovering exposes exactly this text via the browser.
      const main = page.locator('#main-content')
      const kevBadge = main.locator('[title="Actively Exploited (CISA KEV)"]')
      await kevBadge.hover()
      await expect(kevBadge).toHaveAttribute('title', 'Actively Exploited (CISA KEV)')
    })

    test('should highlight KEV vulnerabilities prominently', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `KEV Highlight Test ${Date.now()}`)
      const main = page.locator('#main-content')

      // Log4Shell (a real KEV catalog entry) gets the badge...
      await expect(main.locator('[title="Actively Exploited (CISA KEV)"]')).toBeVisible()

      // ...but express's CVE-2022-24999 is NOT in the KEV catalog, so filtering down to just
      // that finding (severity=high) proves the badge is per-CVE, not shown for every finding.
      await main.locator('select').selectOption('high')
      await expect(main.getByText('CVE-2022-24999').first()).toBeVisible()
      await expect(main.locator('[title="Actively Exploited (CISA KEV)"]')).not.toBeVisible()
    })

    test('should show CISA reference link', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `CISA Link Test ${Date.now()}`)
      const dialog = await openLog4jDetailModal(page)

      // VulnerabilityDetailModal.tsx:176-184: the KEV callout links straight to CISA's catalog.
      const cisaLink = dialog.getByRole('link', { name: 'CISA Known Exploited Vulnerabilities (KEV) Catalog' })
      await expect(cisaLink).toHaveAttribute('href', 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog')
    })
  })

  // ==========================================================================
  // EPSS Score Tests
  // ==========================================================================

  test.describe('EPSS Score', () => {
    test.skip('should display EPSS percentile', async () => {
      // EpssService has no bundled fallback (unlike KEV) — it only ever calls the live
      // api.first.org API (EpssService.ts:84-99,247-309). Unreachable offline, so
      // epssScore/epssPercentile stay undefined and no EPSS cell ever renders.
    })

    test.skip('should show EPSS icon', async () => {
      // Same gate as above — no EPSS UI renders at all without a successful live fetch.
    })

    test.skip('should show N/A when no EPSS data', async () => {
      // Not offline-unreachable but simply not wired up: `formatEpssPercentile` (riskScore.ts:270)
      // does return 'N/A' for a null percentile, but it is never called from any rendered
      // component (grep confirmed its only caller is its own unit test) — no "N/A" fallback
      // state exists in the actual UI.
    })

    test.skip('should color code by EPSS percentile', async () => {
      // Same story as the N/A case: `getEpssColorClass` (riskScore.ts:280) exists but is only
      // referenced from its own unit test — no component applies it.
    })

    test.skip('should show EPSS score in tooltip', async () => {
      // No EPSS tooltip UI exists in source; the only EPSS content anywhere is the
      // Threat-Intelligence "EPSS Probability" card, itself gated on epssScore !== undefined.
    })

    test.skip('should display EPSS bar chart if available', async () => {
      // No EPSS bar chart exists anywhere in source.
    })
  })

  // ==========================================================================
  // Risk Score Tests
  // ==========================================================================

  test.describe('Risk Score', () => {
    test.skip('should display combined risk score', async () => {
      // The row-level RiskScoreBadge does render offline (riskScore is unconditionally computed
      // by enrichVulnerabilities.ts:67-75), but its displayed NUMBER mixes in the EPSS
      // percentile component (riskScore.ts:87), which varies with EPSS network reachability —
      // there's no content-stable (non-value) selector that safely distinguishes it from the
      // row's other numeric text (CVSS score, ref/component counts) without asserting that
      // volatile number. The EPSS-independent floor is instead asserted via the modal's stable
      // "High risk" classification text (see "should show risk calculation breakdown").
    })

    test.skip('should calculate risk from CVSS + EPSS + KEV', async () => {
      // Same volatility as above: the composite score is real, but its exact value depends on
      // EPSS reachability, which this offline suite cannot assert deterministically.
    })

    test.skip('should sort by risk score', async () => {
      // The vulnerabilities list is a VirtualList/div layout, not a <table> — there is no
      // "Risk" <th> header anywhere in VulnerabilitiesTab.tsx to sort by.
    })

    test.skip('should highlight high-risk vulnerabilities', async () => {
      // No `[class*="high-risk"]`/`[class*="critical"]` styling exists (severity classes use
      // "destructive" naming, not the literal word "critical"). The real per-CVE highlighting
      // is the KEV badge, already covered by "should highlight KEV vulnerabilities prominently";
      // the severity grouping heading ("Critical") is already asserted in
      // workflows/sbom-vulnerability-scan.spec.ts.
    })

    test('should show risk breakdown in details', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `Risk Breakdown Test ${Date.now()}`)
      const dialog = await openLog4jDetailModal(page)

      // VulnerabilityDetailModal.tsx:252-255: the Composite Risk Score card always renders
      // once riskScore is defined (true for every enriched vuln) — assert its label and the
      // "<score>/100" format without hardcoding the EPSS-dependent number.
      await expect(dialog.getByText('Composite Risk Score')).toBeVisible()
      await expect(dialog.getByText(/^\d{1,3}\/100$/)).toBeVisible()
    })
  })

  // ==========================================================================
  // Filtering Tests
  // ==========================================================================

  test.describe('Filtering', () => {
    test('should filter by KEV status', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `KEV Filter Test ${Date.now()}`)
      const main = page.locator('#main-content')

      // The "Exploit Status" advanced filter (VulnerabilitiesTab.tsx:303-317,
      // id="exploit-status-filter") checks isExploitedVuln (project-detail/helpers.ts:58-60),
      // which is true for Log4Shell (KEV) and false for express's CVE-2022-24999 (not KEV).
      await main.getByRole('button', { name: 'Advanced Filters' }).click()
      await main.locator('#exploit-status-filter').selectOption('exploited')
      await expect(main.getByText('CVE-2021-44228').first()).toBeVisible()
      await expect(main.getByText('CVE-2022-24999')).not.toBeVisible()

      // Flip it: "Not Exploited" shows express and hides Log4Shell.
      await main.locator('#exploit-status-filter').selectOption('not-exploited')
      await expect(main.getByText('CVE-2022-24999').first()).toBeVisible()
      await expect(main.getByText('CVE-2021-44228')).not.toBeVisible()
    })

    test.skip('should filter by EPSS threshold', async () => {
      // No EPSS filter control exists anywhere in source (grepped VulnerabilitiesTab.tsx and
      // FilterPresets.tsx for "EPSS" — only CVSS range, Source, Reference Tags, Patch
      // Availability, and Exploit Status filters exist).
    })

    test.skip('should filter by high risk', async () => {
      // No risk-score filter control exists anywhere in source (same grep as above).
    })

    test.skip('should combine multiple intelligence filters', async () => {
      // No `[data-testid*="filter"]` elements exist in VulnerabilitiesTab.tsx/FilterPresets.tsx
      // (grep confirmed) — there is no dedicated KEV/EPSS/risk filter set to combine.
    })
  })

  // ==========================================================================
  // Vulnerability Detail Tests
  // ==========================================================================

  test.describe('Vulnerability Detail', () => {
    test('should show KEV section in detail modal', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `KEV Section Test ${Date.now()}`)
      const dialog = await openLog4jDetailModal(page)

      // VulnerabilityDetailModal.tsx:166-223: the KEV callout with its badges and the
      // embedded-baseline's own field values (vendorProject/product), all sourced from the
      // local, network-free kevService.getKevDetails() lookup. exact: true on "KNOWN EXPLOIT"
      // avoids a strict-mode clash with the nearby CISA link's "Known Exploited" substring.
      await expect(dialog.getByText('KNOWN EXPLOIT', { exact: true })).toBeVisible()
      await expect(dialog.getByText('RANSOMWARE')).toBeVisible()
      await expect(dialog.getByText('Vendor/Project:')).toBeVisible()
      await expect(dialog.getByText('Product:')).toBeVisible()
    })

    test.skip('should show EPSS section in detail modal', async () => {
      // The "EPSS Probability" card (VulnerabilityDetailModal.tsx:241-251) is gated on
      // `epssScore !== undefined`, which requires the live api.first.org fetch to have
      // succeeded — unreachable in this offline suite, with no bundled fallback (unlike KEV).
    })

    test('should show risk calculation breakdown', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `Risk Calc Test ${Date.now()}`)
      const dialog = await openLog4jDetailModal(page)

      // Log4Shell's KEV(+50) and CRITICAL severity(+20) alone floor its risk score at 70
      // (riskScore.ts:58-64,69,84,93) regardless of the EPSS component, which is >= the
      // modal's "High risk" threshold (VulnerabilityDetailModal.tsx:257-258) — so this
      // classification text is a stable, EPSS-independent contract.
      await expect(dialog.getByText('High risk — prioritize remediation')).toBeVisible()
    })

    test.skip('should close detail modal', async () => {
      // Already a real content contract in critical-flows/vulnerability-details.spec.ts (opens
      // the log4j detail modal and closes it via the footer "Close" button, asserting
      // `dialog).not.toBeVisible()`) — not duplicated here.
    })
  })

  // ==========================================================================
  // Responsive Design Tests
  // ==========================================================================

  test.describe('Responsive Design', () => {
    test.use({ viewport: { width: 768, height: 1024 } })

    test('should display KEV badges on tablet', async ({ page }) => {
      test.setTimeout(150_000)
      await scanLog4jProject(page, `KEV Tablet Test ${Date.now()}`)

      // Same fact as "should display KEV badge...": isKev is a local/offline fact independent
      // of viewport size.
      const main = page.locator('#main-content')
      await expect(main.locator('[title="Actively Exploited (CISA KEV)"]')).toBeVisible()
    })

    test.skip('should display EPSS scores on tablet', async () => {
      // Same as "should display EPSS percentile": no EPSS UI renders offline regardless of
      // viewport (VulnerabilityDetailModal.tsx:241).
    })
  })
})
