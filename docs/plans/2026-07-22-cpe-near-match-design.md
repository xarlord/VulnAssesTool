# CPE Near-Match Approval — Design (Workstream B)

**Date:** 2026-07-22
**Branch:** feat/phase0-perf-a11y
**Status:** Design approved; implementation pending (built before Workstream A / Phase 3 VEX)

> **Status update — 2026-08-22 (re-verified against HEAD).** This document still says
> "implementation pending", which is no longer accurate. **B-1, version-range-aware matching,
> shipped** (FR-03.1, wave 3): `server/database/versionRange.ts` provides `compareVersions` /
> `isVersionInRange`, and `NvdDatabase.searchCVEsByCPE` calls it via
> `searchVersionRangeCandidates`, unioning range hits with the literal `cpe23_uri` matches. So
> "Root cause 4 — version-range matching is not implemented ... the range data is dormant" below
> is **false at HEAD** and is kept only as a record of what the design was reacting to.
>
> What has **not** shipped is the near-match _approval_ surface — there is no UI to confirm a
> product-identity match for a component whose exact version NVD does not list;
> `cpeEstimationService` still auto-assigns at >=80 and otherwise leaves the component at
> "No CPE". Read the rest of this document as a design for that remaining piece.

## Problem

A component whose product name is known to NVD but whose **exact version is not** in the
CPE dictionary silently ends up at **"No CPE"** and finds **zero vulnerabilities** — a
false negative in the core scan path.

Observed case: an imported `sbom.json` component `busybox 1.22.1` shows "No CPE" and 0 vulns,
even though `cpe:2.3:a:busybox:busybox` demonstrably exists in NVD (other busybox components in
the same project matched and reported 63 vulnerabilities each).

### Root cause (confirmed in code)

1. SBOM import **does** run CPE estimation — [SbomUploadDialog.tsx](../../src/renderer/components/SbomUploadDialog.tsx)
   calls `estimateCpesForComponents` with a DB-backed search, wrapped in a **time budget**
   (`raceWithTimeout(CPE_ESTIMATION_BUDGET_MS)`).
2. The scorer in [cpeEstimationService.ts](../../src/renderer/lib/services/cpeEstimationService.ts)
   grades DB candidates by version proximity: exact version → high (95, auto-assigns at ≥80);
   same family (`1.22` vs `1.22.x`) → medium (75); version-agnostic `*` → medium (65);
   **different version → low (45)**.
3. For `busybox 1.22.1`, NVD's busybox CPEs are newer (`1.36`/`1.37`) or `*`, so nothing hits the
   auto-assign bar. A far-version candidate either never surfaces (estimation timed out on a slow
   DB) or is easy to skip → the component lands at **"No CPE"**, and the scan's name-text fallback
   finds ~nothing.
4. **Version-range matching is not implemented.** The range columns
   (`version_start_including/excluding`, `version_end_including/excluding`) are **stored and
   hydrated per-CVE** ([nvdDb.ts](../../server/database/nvdDb.ts)) but **not used in any search
   `WHERE` clause**. Product search ([cpeSearch.ts](../../server/database/cpeSearch.ts)) matches
   `cpe_product` exact→prefix→`cpe23_uri` substring and returns product CPEs with no version
   filtering. The range data is dormant.

## Decisions

- **B-1 — Matching semantics: version-range aware.** Approving a near-match confirms **product
  identity** (`vendor:product`); the scan then returns CVEs whose affected-version **range covers**
  the component version, using the imported `versionStart/End` data. (Not: pick a specific
  near-version CPE, which would return the wrong version's CVEs.)
- **B-2 — Two touchpoints:** surface at **import time** _and_ offer a **post-import per-component
  action**, sharing one candidate-finding + approval core. (Import-only can't fix existing
  projects; post-import-only lets fresh imports keep silently zeroing out.)
- **B-3 — Ambiguous ranges: inclusive + tagged.** CVEs whose NVD range is version-agnostic (`*`) or
  unparseable are **included** but tagged a notch lower and shown distinctly. Missing a real vuln is
  worse than over-reporting; the existing match-confidence tagging keeps the noise honest.

## Design

### 1. Core matching model

- **Product-identity, not CPE-string.** Approval persists on the component: `cpe` set to the
  version-agnostic product CPE (e.g. `cpe:2.3:a:busybox:busybox:*:*:*:*:*:*:*:*`) plus a new
  `cpeApproved: true` flag (human-confirmed; do not re-prompt).
- **Version-range evaluator** — pure, shared, unit-tested (`lib/services/cpe/versionRange.ts`,
  placed so both the renderer and `cli/` import it — same pattern as `services/vex` and the license
  lib, to prevent GUI/CLI drift):
  - Input: component version + a `cpe_match` row's `{ cpe23Uri, versionStartIncluding/Excluding,
versionEndIncluding/Excluding }`.
  - Output: `'exact' | 'in-range' | 'ambiguous' | 'out'`.
  - Compare: dot-split numeric-with-suffix comparator (handles `1.22.1`, `1.36.1-r20`); non-numeric
    or unparseable bounds → `ambiguous`, **never `out`** (safety, per B-3).
- **Range-aware CVE search** (server): given `vendor:product` + version, fetch product-scoped
  `cpe_matches` _with range columns_, evaluate each in JS, return CVEs verdicted
  `exact`/`in-range`/`ambiguous`. `exact`/`in-range` → tag `cpe-exact`; `ambiguous` → `cpe-estimated`.

### 2. Import-time surfacing

- **Rule: a known product never silently becomes "No CPE".** When the DB product search returns
  hits for the name but none match the version, always emit **one product-identity candidate** —
  the version-agnostic `vendor:product:*` CPE — with a distinct `matchType: 'product'` and medium
  confidence, so it lands in `reviewableComponents`/`ambiguousComponents` instead of dropping to 0.
- **Dialog** ([CPEMatchDialog.tsx](../../src/renderer/components/CPEMatchDialog.tsx)): render the
  `'product'` match type with explicit copy — _"Name matches `busybox:busybox`; version `1.22.1`
  isn't in NVD. Approve to scan this product by version range."_ Existing exact/token/fuzzy rows
  unchanged.
- **Fail loud on timeout** (Rule 12): count components left unestimated when the time budget trips
  and show a banner — _"N components could not be CPE-matched in time — review them from the
  project."_ — routing to the post-import action. No silent gaps.
- **YAGNI:** no auto-approval of product-identity matches; a human always confirms (version-agnostic
  matching over-reports). Import can proceed with them unresolved as "No CPE (review)".

### 3. Post-import per-component action

- **Entry points** (both feed the shared core): a per-component **"Match CPE"** button on any
  "No CPE (review)" component in [ProjectDetail.tsx](../../src/renderer/pages/ProjectDetail.tsx),
  and a **bulk** entry from the import banner / a header action pre-loaded with all unresolved
  components.
- **Flow on approve:** set `component.cpe` + `cpeApproved: true`; persist via the existing project
  JSON-blob persistence; **re-scan just the approved component(s)** through the existing match path
  (now range-aware) and merge findings using the same merge/dedup the full scan uses, so counts,
  coverage, and match-quality stay consistent.
- **Feedback:** toast the delta — _"busybox 1.22.1: 47 vulnerabilities found by version-range
  match"_ — and flip the badge from "No CPE (review)" to "CPE (approved)".
- **Reversibility:** an approved match can be cleared (undo) — reverts `cpe`/`cpeApproved` and drops
  its range-matched findings.
- **Fallback:** if isolating a single-component re-scan proves awkward, fall back to a "re-scan
  project" prompt after approvals (confirmed during the range-matcher spike).

### 4. Tagging, display, persistence

- **Reuse existing `MatchConfidence`** (`cpe-exact` | `cpe-estimated` | `name-only`): precise
  (`exact`/`in-range`) → `cpe-exact`; ambiguous → `cpe-estimated`. No new tier — keeps Phase-2
  GUI/CLI/export parity intact. "Human approved" provenance rides on the component
  (`cpeApproved` → "CPE (approved)" badge), not the finding.
- **Display follows the existing low-confidence convention** (`03fcf44`): `cpe-estimated` findings
  are hidden-by-default-but-revealable; `cpe-exact` show normally. No new filter UI.
- **Persistence already covered:** `component.cpe` + `cpeApproved` persist in the project JSON blob;
  `matchQuality` already persists and is preserved on JSON export (`74e02f9`).
- **GUI/CLI drift guard:** the range evaluator is pure and shared, so CLI scans get identical range
  semantics. Interactive approval stays GUI-only; a `--approve-products` CLI flag is out of scope
  unless requested.

### 5. Testing strategy (TDD, RED→GREEN)

1. **Version-range evaluator (core):** `exact`; all four bound combos for `in-range`;
   `*`/unparseable → `ambiguous`; provably-outside → `out`. **Intent test:** `busybox 1.22.1`
   against realistic busybox ranges → matched, not zero (_fails if the false-negative returns_).
   Edge: `1.36.1-r20` suffixes, uneven segment counts, non-numeric → `ambiguous` (never `out`).
2. **Range-aware CVE search (server):** integration vs. E2E seed fixtures (like
   [scanContract.test.ts](../../server/database/scanContract.test.ts)) — a product whose version has
   no exact CPE still returns range-covering CVEs, tagged `cpe-exact` vs `cpe-estimated`.
3. **Estimation:** a known product with a far version emits a `'product'` identity candidate
   (never 0 candidates for a known product).
4. **Dialog:** `'product'` match type renders identity-approval copy; `onConfirm` yields the
   product CPE.
5. **Post-import action:** approve → `cpe`+`cpeApproved` set, persisted, findings merged, badge
   flips; undo reverts.
6. **Regression guard:** an exact-version component still matches precisely (`cpe-exact`) — Phase-2
   precision must not regress.

## Out of scope

- CSAF / OpenVEX (unrelated).
- CLI interactive approval and a `--approve-products` flag.
- Fuzzy product-name matching beyond the existing exact/prefix/substring product search.
