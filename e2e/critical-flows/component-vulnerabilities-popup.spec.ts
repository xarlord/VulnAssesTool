import { test, expect, resetAppState } from '../test-helper'
import {
  createTestProject,
  uploadSbomFile,
  navigateToComponentsTab,
  navigateToVulnerabilitiesTab,
  E2E_SELECTOR_TIMEOUT,
} from '../shared-helpers'
import path from 'node:path'

/**
 * Component Vulnerabilities Popup — content contracts
 *
 * The previous version of this spec never opened the real popup: it gated every
 * assertion behind `if ((await x.count()) > 0)` against ad-hoc selectors ("Generate SBOM",
 * `[data-testid*="popup"]`) that don't exist in this app, so the tests passed whether or
 * not Escape-key handling worked. The popup IS reachable deterministically — every
 * component row in ComponentsTab is clickable and opens it, with or without a scan — so
 * these tests drive the real component and assert its designed content instead. Grounding:
 *   - components/ComponentVulnerabilitiesPopup.tsx:94 `data-testid="vulnerabilities-popup"`
 *     on the DialogContent; :104 DialogTitle renders `{component.name}` (Radix's
 *     Dialog.Title is a plain `<h2>`, so it's addressable via role=heading); :125-126
 *     renders "{N} Vulnerability|Vulnerabilities Found"; :164-167 empty state "No
 *     vulnerabilities found" + "This component appears to be secure"; :181 the primary
 *     vuln id (e.g. "CVE-2021-44228") renders verbatim; :188-192 the per-item severity
 *     badge renders the exact label "Critical" (as the ONLY text in that span — unlike
 *     the aggregate "{N} Critical" counter at :128-134, which always has a numeric
 *     prefix, so an exact-text match can't collide with it); :91 `<Dialog open={open}
 *     onOpenChange={(next) => !next && onClose()}>` — Escape is Radix's built-in Dialog
 *     behavior, wired to the real onClose.
 *   - pages/project-detail/ComponentsTab.tsx:199-210 — each component row is a
 *     `role="button"` div with `onClick={() => onComponentClick(component)}`.
 *   - pages/ProjectDetail.tsx:136-138 `handleComponentClick` sets the selected component and
 *     opens the popup; :241-248 "Scan for Vulnerabilities" button; :410-426 the popup is
 *     rendered with `getVulnerabilitiesForComponent(project, selectedComponent.id)`.
 *   - e2e/workflows/sbom-vulnerability-scan.spec.ts's real-scan test establishes that
 *     uploading `sbom-with-vulns.json` and scanning resolves log4j@2.14.1 to the Log4Shell
 *     CVE (CVE-2021-44228, Critical) against the seeded offline NVD database.
 */

const SAMPLE_SBOM = path.join(import.meta.dirname, '..', 'fixtures', 'sbom', 'sample-cyclonedx.json')
const VULN_SBOM = path.join(import.meta.dirname, '..', 'fixtures', 'sbom-with-vulns.json')

test.describe('Component Vulnerabilities Popup', () => {
  test.beforeEach(async ({ page }) => {
    await resetAppState(page)
    await expect(page.getByRole('button', { name: 'New Project' })).toBeVisible({ timeout: 10000 })
  })

  test('should show component details and the no-vulnerabilities empty state for an unscanned component', async ({
    page,
  }) => {
    await createTestProject(page, 'Popup Content Test')
    await uploadSbomFile(page, SAMPLE_SBOM)
    await navigateToComponentsTab(page)

    const main = page.locator('#main-content')
    await main.getByRole('button').filter({ hasText: 'lodash' }).first().click()

    // No scan has run, so this component's popup has nothing to show.
    const popup = page.getByTestId('vulnerabilities-popup')
    await expect(popup).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    // Scoped to the <h2> DialogTitle: a plain getByText('lodash') would also match the
    // purl text "pkg:npm/lodash@4.17.15" rendered in the DialogDescription right below it
    // (strict-mode violation), since both are separate leaf text nodes containing "lodash".
    await expect(popup.getByRole('heading', { name: 'lodash' })).toBeVisible()
    await expect(popup.getByText('0 Vulnerabilities Found')).toBeVisible()
    await expect(popup.getByText('No vulnerabilities found')).toBeVisible()
    await expect(popup.getByText('This component appears to be secure')).toBeVisible()
  })

  test('should close the popup on Escape key press', async ({ page }) => {
    await createTestProject(page, 'Popup Escape Test')
    await uploadSbomFile(page, SAMPLE_SBOM)
    await navigateToComponentsTab(page)

    const main = page.locator('#main-content')
    await main.getByRole('button').filter({ hasText: 'axios' }).first().click()

    const popup = page.getByTestId('vulnerabilities-popup')
    await expect(popup).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })

    await page.keyboard.press('Escape')
    await expect(popup).not.toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
  })

  test('should show the real scanned CVE and severity for the log4j component popup', async ({ page }) => {
    // A real scan over the local NVD database can take ~60-90s — beyond the default 60s
    // test timeout (mirrors e2e/workflows/sbom-vulnerability-scan.spec.ts).
    test.setTimeout(150_000)

    await createTestProject(page, 'Popup Scan Test')
    await uploadSbomFile(page, VULN_SBOM)

    const scanButton = page.getByRole('button', { name: /scan for vulnerabilities/i })
    await expect(scanButton).toBeEnabled({ timeout: 10000 })
    await scanButton.click()

    // Confirm the scan resolved log4j -> Log4Shell before opening the popup, so the
    // component's matched vulnerability is guaranteed to be in the store already.
    await navigateToVulnerabilitiesTab(page)
    await expect(page.getByText('CVE-2021-44228').first()).toBeVisible({ timeout: 120_000 })

    await navigateToComponentsTab(page)
    const main = page.locator('#main-content')
    await main.getByRole('button').filter({ hasText: 'log4j' }).first().click()

    const popup = page.getByTestId('vulnerabilities-popup')
    await expect(popup).toBeVisible({ timeout: E2E_SELECTOR_TIMEOUT })
    await expect(popup.getByText('CVE-2021-44228')).toBeVisible()
    // Per-vulnerability severity badge (distinct from the aggregate "N Critical" counter).
    await expect(popup.getByText('Critical', { exact: true })).toBeVisible()
  })
})
