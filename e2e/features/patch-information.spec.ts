import { test } from '../test-helper'

/**
 * Patch Information Display — content contracts
 *
 * This suite targets patch-availability badges, patch link cards, remediation steps, and
 * fixed-version display. All of that content comes from vulnerability enrichment
 * (`Vulnerability.patchInfo` / `patchedVersions`, src/shared/types.ts:180,224-230) that is
 * populated by `NvdProvider.extractPatchInfo` (src/renderer/lib/api/providers/nvdProvider.ts:92-176),
 * a client-side path used only for LIVE NVD API queries. The e2e suite's only offline-real
 * vulnerability comes from scanning `e2e/fixtures/sbom-with-vulns.json` against the seeded local
 * NVD SQLite database (see workflows/sbom-vulnerability-scan.spec.ts and
 * critical-flows/vulnerability-details.spec.ts for that scan → CVE-2021-44228 pipeline) — a scan
 * driven entirely by `server/database/nvdDb.ts` (grep for "patchInfo"/"patchedVersions" under
 * server/ finds zero matches) and the seed fixture `scripts/seed-test-db.js:229-243`, which gives
 * CVE-2021-44228 only id/description/cvss/severity/dates — no `references` row at all. So a
 * scanned vulnerability offline has core NVD fields but never `patchInfo`/`patchedVersions`.
 *
 * Consequences for what actually renders, without any network/enrichment:
 *   - VulnerabilityDetailModal.tsx:95,341-345 — the entire "Remediation" section (which is the
 *     ONLY place PatchAvailabilityBadge, PatchLinkCard and RemediationSteps are rendered, at
 *     lines 349, 374 and 379) is gated on `vulnerability.patchInfo` and simply does not render
 *     when it's undefined. There is no "No patch information available" / "No fixed version"
 *     fallback string — the block is entirely absent, not an empty state.
 *   - VulnerabilitiesTab.tsx:474-476,538-547 — the row-level "Patch"/"Mitigation"/"Exploit" tag
 *     badges require `vuln.references` entries tagged "Patch"/"Vendor Advisory"/"Mitigation";
 *     the seeded CVE-2021-44228 has no references, so none of those badges ever fire either.
 *   - The three patch subcomponents (components/patch/PatchAvailabilityBadge.tsx,
 *     PatchLinkCard.tsx, RemediationSteps.tsx) are unit-tested directly in their own
 *     `*.test.tsx` files, and `hasAvailablePatch()` (pages/project-detail/helpers.ts:47-52) is
 *     unit-tested in helpers.test.tsx:40-65 — that is where this logic's correctness is verified.
 *
 * The original file used broad regex-OR text locators (e.g. `text=/Affected|Version|<|>=/`,
 * `text=/Published|Updated/`, `text=/Critical|High Priority|.../`) that would coincidentally
 * match unrelated, always-present modal content (the "Affected Components" heading, the Timeline
 * "Published" date, the severity badge, the CVE-ID copy button, the generic footer "View on NVD"
 * link) even though none of the actual patch/remediation features they claim to test exist
 * offline. Keeping those as "passing" would be a false-positive that can never fail when the
 * real patch/remediation code changes (Rule 9), so every test below is an honest `test.skip`
 * with the concrete reason, preserving each original test name 1:1.
 */

test.describe('Patch Information Display', () => {
  test.describe('Patch Availability Badge', () => {
    test.skip('should show patch available badge for fixable vulnerabilities', async () => {
      // hasAvailablePatch() (helpers.ts:50-52) — unit-tested in helpers.test.tsx:43-49 — never
      // sees a truthy patchInfo/patchedVersions from an offline scan, and there is no row-level
      // "Patch Available"/"Fixable" badge in VulnerabilitiesTab.tsx at all.
    })

    test.skip('should show fixed version number in badge', async () => {
      // Fixed-version display is `patchInfo.fixedVersions` (VulnerabilityDetailModal.tsx:354-368),
      // rendered only inside the patchInfo-gated Remediation section — never true offline.
    })

    test.skip('should show no patch badge when no fix available', async () => {
      // There is no "no patch"/"unfixed" empty-state badge: PatchAvailabilityBadge only renders
      // inside the Remediation block (VulnerabilityDetailModal.tsx:95,341-349), which is entirely
      // absent (not an empty state) when patchInfo is undefined, which is always true offline.
    })

    test.skip('should show patch confidence indicator', async () => {
      // No "Official/Vendor/Community/Verified" confidence indicator exists anywhere in the
      // codebase; PatchAvailabilityBadge only renders patchInfo.patchAvailability
      // (components/patch/PatchAvailabilityBadge.tsx:28-34), which never populates offline.
    })
  })

  test.describe('Patch Link Card', () => {
    test.skip('should display patch link card in vulnerability detail', async () => {
      // PatchLinkCard only renders inside the patchInfo-gated Remediation section
      // (VulnerabilityDetailModal.tsx:371-376), never reached by an offline scan; its own
      // rendering is unit-tested directly in components/patch/PatchLinkCard.test.tsx.
    })

    test.skip('should show patch source link', async () => {
      // No patchInfo.patchLinks render offline. The `a[href*="nvd.nist.gov"]` locator would only
      // coincidentally match the modal's unrelated, always-present footer "View on NVD" CVE-page
      // link (VulnerabilityDetailModal.tsx:518-526) — not an actual patch link.
    })

    test.skip('should show affected version range', async () => {
      // patchInfo.affectedVersionRanges is never populated (nvdProvider.ts:173: "NVD doesn't
      // provide version ranges in references") and isn't rendered anywhere. The broad
      // `Affected|Version|<|>=` regex would only coincidentally match the unrelated "Affected
      // Components" heading (VulnerabilityDetailModal.tsx:443), not real version-range data.
    })

    test.skip('should show patch date if available', async () => {
      // Neither PatchInfo nor PatchLink (src/shared/types.ts:224-250) has any date field. The
      // `Published|Updated` regex would only coincidentally match the Timeline section's
      // unrelated CVE "Published" date (VulnerabilityDetailModal.tsx:462-467).
    })
  })

  test.describe('Remediation Steps', () => {
    test.skip('should display remediation steps', async () => {
      // RemediationSteps only renders inside the patchInfo-gated Remediation section
      // (VulnerabilityDetailModal.tsx:379), never reached offline; its content is unit-tested
      // directly in components/patch/RemediationSteps.test.tsx.
    })

    test.skip('should show upgrade command if applicable', async () => {
      // RemediationSteps.tsx:133-145 does render a `step.command` code block when present, but
      // NvdProvider.generateRemediationAdvice (nvdProvider.ts:221-294) never sets `command` on any
      // step, and the whole section never renders offline regardless (patchInfo is undefined).
    })

    test.skip('should show workaround if no patch available', async () => {
      // RemediationSteps.tsx:78-90 does render a "Temporary Workarounds" list when
      // `advice.workarounds` is set, but NvdProvider.generateRemediationAdvice never populates
      // `workarounds`, and the whole section never renders offline regardless.
    })

    test.skip('should show severity of remediation action', async () => {
      // No remediation-priority indicator renders anywhere offline. The broad
      // `Critical|High Priority|Immediate|Urgent` regex would only coincidentally match the
      // unrelated, always-present severity badge (VulnerabilityDetailModal.tsx:128-132).
    })
  })

  test.describe('Copy to Clipboard', () => {
    test.skip('should have copy button for fixed version', async () => {
      // There is no "copy fixed version" control. The modal's only copy button copies the CVE ID
      // (VulnerabilityDetailModal.tsx:111-127, aria-label `Copy {id} to clipboard`) — an unrelated
      // feature that happens to match the same `button:has-text("Copy")` selector.
    })

    test.skip('should copy version to clipboard', async () => {
      // Same gap as above: the modal's only copy button copies the CVE ID and shows "Copied ...
      // to clipboard" (VulnerabilityDetailModal.tsx:30-40) — there is no fixed version to copy.
    })
  })

  test.describe('Multiple Patches', () => {
    test.skip('should show all available patches', async () => {
      // `[data-testid="patch-entry"]`, `.patch-card`, `.remediation-item` do not exist anywhere in
      // the codebase (grep found zero matches) — this UI was never built, and multiple-patch
      // entries would need patchInfo.patchLinks/fixedVersions regardless, never populated offline.
    })

    test.skip('should indicate recommended patch', async () => {
      // No "Recommended/Preferred/Latest patch" indicator exists anywhere in the codebase; patch
      // data itself never populates from an offline scan regardless.
    })
  })

  test.describe('Accessibility', () => {
    test.skip('should have accessible patch information', async () => {
      // The original assertion (heading count > 0) is not patch-specific: Description/Timeline/
      // CWE headings render in the detail modal regardless of patchInfo, so it can never fail when
      // patch-accessibility markup changes. The modal's real heading contract (CVE id as an <h2>)
      // is already asserted in critical-flows/vulnerability-details.spec.ts.
    })

    test.skip('should have keyboard accessible patch links', async () => {
      // Same gap as "should show patch source link": no patchInfo.patchLinks render offline, so
      // there are no patch links to tab through — only the unrelated footer "View on NVD" link
      // exists, which this test cannot meaningfully attribute to patch information.
    })
  })
})
