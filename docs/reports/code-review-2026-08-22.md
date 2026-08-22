# Code and Security Review — 2026-08-22

**Scope:** full codebase + security review, run against `docs/requirements-gap-closure` (3 commits
ahead of `master`) with the working tree clean.

**Method:** three passes — a documentation/consistency review of the branch, a security sweep of the
request→subprocess paths in `server/`, and a claim-by-claim check of the retro-specified
requirements (FR-12 … FR-24) against the code they claim to describe. **Every finding below was
re-verified directly before being recorded**; three claims that did not survive that check are
listed at the end under [Not reproduced](#not-reproduced) rather than dropped.

Findings are grouped by kind and ordered by severity within each group.

---

## Resolution status

Updated as fixes landed on `fix/review-findings`. Every fix ships with the test that would have
caught the defect, and each of those tests was mutation-checked — reverting the fix turns exactly
the new assertions red. Nothing here is marked fixed on the strength of a passing suite alone.

| ID             | Status        | How it was verified                                                                                                                                                           |
| -------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-1          | **Fixed**     | `assertRegistryImageRef` rejects filesystem schemes and leading `-`. Re-ran both original exploits against the rebuilt server: `dir:<host path>` and `--help` are now refused |
| SEC-2          | **Fixed**     | Empty and implausibly-shrunk catalogs refused. Mutation-checked: disabling the guards turns the two new assertions red                                                        |
| SEC-3          | Open (LOW)    | Defence-in-depth only; not reproducible as a file write with GNU tar 1.35 or bsdtar                                                                                           |
| PROD-1         | **Fixed**     | `restoreBackup` verifies the file and requires `valid`. Two tests that encoded the defect were rewritten                                                                      |
| PROD-2         | Open (HIGH)   | Needs a decision, not a patch — wire the offline queue into the mutating paths, or delete it. See below                                                                       |
| PROD-3         | **Fixed**     | Badge chain now distinguishes a declared CPE from an auto-selected estimate; mutation-checked                                                                                 |
| PROD-4         | Open (MEDIUM) | Same decision as PROD-2: `IncrementalScanService` has no caller and no vuln-DB change trigger                                                                                 |
| PROD-5         | Open (MEDIUM) | Unknown reachability still reported as `reachable: false`; downstream confidence gate keeps the safety outcome correct today                                                  |
| PROD-6         | **Fixed**     | CSAF and OpenVEX are refused explicitly instead of parsing to an empty statement list; 4 mutation-checked tests                                                               |
| PROD-7         | **Fixed**     | Critical/High protection moved from configuration into a code invariant; mutation-checked                                                                                     |
| PROD-8         | Open (LOW)    | `--max-gaps` remains opt-in; needs a product call on the default                                                                                                              |
| PROD-9         | Open (LOW)    | Android-image detection still only on the `localPath` branch                                                                                                                  |
| PROD-10        | **Fixed**     | Requirement corrected, not the code — FR-17 said "most restrictive" where SPDX `OR` means least                                                                               |
| DOC-1 … DOC-12 | **Fixed**     | All twelve; DOC-10/DOC-12 resolved as one defect (the FR-23 row, not the summary count)                                                                                       |

### The live-catalog matching defects

Recorded separately from the numbered findings because they came from scanning a real 2.9 GB NVD
database rather than from reading code. Three of four are fixed:

| Defect                                                 | Status                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Sanitizer stripped `_`, killing 68.7% of CPE products  | **Fixed** — the DB layer already escaped LIKE metacharacters; the CLI layer was lossy on top of a correct one |
| Declared CPE discarded whenever a purl existed         | **Fixed** — both are passed, CPE leading the ladder                                                           |
| Importer read `cpe23Uri`; NVD API 2.0 sends `criteria` | **Fixed** — reads `criteria` with a 1.0 fallback, and skips rather than writing a NULL-URI row                |
| Version ranges never applied                           | **Not fixed** — see below                                                                                     |

Measured effect of the first two together, same SBOM against the same catalog:

|                             | before                                     | after                         |
| --------------------------- | ------------------------------------------ | ----------------------------- |
| struts2-core 2.5.10         | 1 finding, 0 KEV, CVE-2017-5638 **missed** | 91 findings, 8 KEV, **found** |
| CVE-2022-42889 (Text4Shell) | missed                                     | found                         |
| total findings / KEV        | 413 / 8                                    | 349 / 12                      |
| scan duration               | 75s                                        | 10s                           |

More true positives and less name-matching noise at the same time, which is the shape you want:
the extra findings came from the authoritative identifier, the removed ones were product-name
collisions.

**Version ranges are deliberately still open.** The catalog in use has zero bounds across all
3,017,128 rows, so a wildcard CPE reads as "every version" and log4j 2.17.2 is still flagged for
Log4Shell. `isVersionInRange` is correct and simply has nothing to test against. Fixing the
importer stops _new_ imports losing the bounds, but existing databases stay version-blind until
re-imported. A heuristic that guessed at exclusion from concrete-version rows would introduce
false negatives on CVEs that genuinely affect all versions — worse than the false positives it
would remove. So the scanner now says so on stderr instead:

```
[scan] WARNING: this NVD database contains no CPE version ranges, so findings are NOT filtered
by component version — expect false positives on patched versions. Re-import the catalog to
populate them.
```

### What is left, and why it is left

**PROD-2 and PROD-4 are decisions, not patches.** `OfflineQueue` (670 lines) and
`IncrementalScanService` (323 lines) are both fully implemented, fully tested, and called by
nothing. Wiring either one changes runtime behaviour across the app and deserves its own change;
deleting either is equally defensible. What is not defensible is leaving tested code that nothing
calls while a requirement claims the behaviour ships — FR-20 and FR-18.2 should move to PARTIAL in
the traceability matrix until one or the other happens.

**PROD-5** is a correctness bug whose safety consequence is currently masked: unknown reachability
reports `reachable: false`, but the confidence gate downstream stops that becoming an
auto-suppression. It is one refactor away from mattering.

---

## Security

### SEC-1 — `imageRef` bypasses the local-scan containment control (HIGH, reproduced)

**Where:** [server/routes/sbom.ts:115](../../server/routes/sbom.ts#L115),
[server/services/SyftService.ts:93](../../server/services/SyftService.ts#L93)

`POST /api/sbom/generate` accepts three mutually exclusive sources. The `localPath` branch is
carefully confined — opt-in behind `SBOM_LOCAL_SCAN_ROOT`, `path.resolve`, and a two-clause prefix
guard that even rejects a sibling sharing the root as a string prefix. The `imageRef` branch beside
it has **no validation at all**:

```ts
} else if (imageRef) {
  source = { kind: 'image', value: imageRef }
}
```

`SyftService.generateSbom` prefixes `dir:` / `file:` only for its own `dir`/`file` kinds; for
`image` it passes the value through verbatim as Syft's target. Syft accepts explicit source
schemes, so `imageRef` is not restricted to registry references.

**Reproduced** against the real `SyftService` and the provisioned Syft v1.44.0:

| Input                             | Result                                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| `imageRef: "dir:<any host path>"` | Syft scans that host directory; the absolute path is echoed back in the returned BOM                |
| `imageRef: "--help"`              | Syft's help text is returned — the value is parsed as a **flag**, not a target (argument injection) |

The first defeats the exact control `SBOM_LOCAL_SCAN_ROOT` exists to enforce, and works even when
that variable is unset. The same parameter also reaches Syft's registry client, so
`registry:169.254.169.254/x` or an internal host makes the server issue outbound requests on the
caller's behalf.

**Mitigating context, stated so severity is not overstated:** the server binds `127.0.0.1`, CORS is
`origin: false` in production, and the route is behind bearer-token `authMiddleware`. This is a
single-operator localhost app, so this is a control bypass rather than a remotely exploitable hole.
It should still be fixed — a security control that a sibling parameter walks around is not a
control.

**Fix:** reject an `imageRef` containing `:` before the first `/` that matches a known Syft scheme
(`dir:`, `file:`, `registry:`, `docker-archive:`, `oci-dir:`, …), and reject any value starting
with `-`. Both checks belong next to the existing `localPath` guard.

### SEC-2 — An HTTP-200 empty KEV catalog wipes every KEV flag (MEDIUM, verified by inspection)

**Where:** [server/services/intelligence/KevService.ts:293-317](../../server/services/intelligence/KevService.ts#L293)

`syncFromCisa` treats any `response.ok` as a good catalog. It computes
`delisted = currentIds \ newIds` and calls `removeKevEntries(delisted)`. If the fetched JSON parses
but carries an empty or truncated `vulnerabilities` array — a captive portal returning JSON, a
partial CDN response, an upstream publishing error — `delisted` is **every CVE currently flagged**,
and the catalog is emptied. `isKev()` then returns `false` for everything.

There is no sanity floor on the incoming catalog size. This is the precise outcome FR-14.1 was
written to forbid ("a failed or never-run sync must degrade to the baseline, never to _not
exploited_"): the failure mode it guards is a _failed_ sync, and this one succeeds.

**Fix:** refuse to apply a catalog that is empty, or that is smaller than the current one by more
than a set fraction, and surface it as a sync error.

### SEC-3 — Layer extraction relies entirely on the external `tar` (LOW, defence-in-depth)

**Where:** [server/services/ContainerService.ts:443](../../server/services/ContainerService.ts#L443)

`extractTar` runs `tar -xf` over attacker-supplied image layers with no member-path validation of
its own, and layer extraction passes `tolerateErrors: true`, which downgrades a non-zero tar exit to
a `console.warn`.

**Not reproducible as a file write** — see [Not reproduced](#not-reproduced). GNU tar 1.35 refuses
the traversal outright. The finding that stands is narrower: the safety of this path is entirely
delegated to whichever `tar` happens to be installed, and `tolerateErrors` means a hostile layer's
rejected traversal attempt is **swallowed rather than surfaced**. Worth an explicit
`--no-absolute-filenames` plus logging traversal refusals distinctly from the expected symlink
noise.

---

## Product correctness

These came from checking the retro-specified requirements against the code they claim to describe.
That the check found this much is itself the finding: FR-12 … FR-24 were written from module
headers and signatures, which described intent accurately and behaviour only approximately.

### PROD-1 — `restoreBackup` never verifies integrity; the refusal is dead code (HIGH)

**Where:** [server/services/BackupService.ts:209](../../server/services/BackupService.ts#L209),
[:262](../../server/services/BackupService.ts#L262)

`listBackups()` hardcodes `integrity: 'unknown'` for every backup (comment: _"Will be verified on
demand"_). `restoreBackup()` sources its record from `listBackups()` and refuses only
`if (backup.integrity === 'invalid')`. That branch is therefore **unreachable**, and
`verifyBackupIntegrity()` is never called on the restore path. A corrupt backup overwrites the live
database with no check.

Directly contradicts FR-21 ("refuse to restore a backup that fails verification"). This is the
worst of the set: it destroys data, and it looks safe in review because the guard is right there.

### PROD-2 — The offline queue has no production callers (HIGH)

**Where:** [src/renderer/lib/services/OfflineQueue.ts](../../src/renderer/lib/services/OfflineQueue.ts)

`enqueue()` and `registerHandler()` are called from **nothing outside the module and its own test**
(verified by a repo-wide grep of `src/`, `server/`, `cli/`). `OfflineIndicator` and
`useSyncNotifications` only subscribe to events to render status.

So 670 lines of tested, persisted, exponential-backoff queue exist and no request ever enters them.
FR-20's core bullet — "queue mutating requests made while offline and replay on reconnect" — is
unimplemented in practice. The UI shows an offline indicator over a queue that is always empty.

Same shape as the dead OSV path found on 2026-08-19: a well-tested module wired to nothing.

### PROD-3 — An estimated CPE is displayed as a verified one (MEDIUM)

**Where:** [src/renderer/lib/services/cpeEstimationPipeline.ts:113](../../src/renderer/lib/services/cpeEstimationPipeline.ts#L113),
[src/renderer/pages/project-detail/ComponentsTab.tsx:322](../../src/renderer/pages/project-detail/ComponentsTab.tsx#L322)

Auto-selection sets `cpe: result.autoSelected` **and** `hasMissingCpe: false`. The badge is an
if/else-if chain whose first arm is `component.cpe && !component.hasMissingCpe` → green
_"cpeVerified"_. An auto-selected guess therefore matches the first arm and the yellow
_"cpeEstimated"_ arm is never reached.

FR-19 requires distinguishing an estimated CPE from a declared one _everywhere it is used_. A user
cannot tell a guess from ground truth — and per the live-scan review the same day, CPE matching is
already the weakest link.

### PROD-4 — `IncrementalScanService` is unreachable and has no data-change trigger (MEDIUM)

**Where:** [src/renderer/lib/services/IncrementalScanService.ts:105](../../src/renderer/lib/services/IncrementalScanService.ts#L105)

`needsFullRescan` keys purely off SBOM component-diff percentage. Nothing anywhere references a
vulnerability-database version or change signal, so FR-18.2's "a change in vulnerability data must
be able to force a full re-scan" has no implementation. Compounding it, the service has no callers
outside its test and the barrel export — like PROD-2, built and not wired.

**This one is a correctness hazard, not just dead code:** if it were wired as written, new CVEs
published against unchanged components would never be found.

### PROD-5 — Unknown reachability is reported as "not reachable" (MEDIUM)

**Where:** [src/renderer/lib/services/fpf/attackGraph.ts:261](../../src/renderer/lib/services/fpf/attackGraph.ts#L261)

A component absent from the graph returns `{ reachable: false, confidence: 0 }`. The code's own
comment concedes the point — _"that is 'unknown', NOT 'proven unreachable'"_ — and sets
`reachable: false` anyway. `tier2AttackGraphFilter.ts:59` then renders the reason as _"is not
reachable from any external entry point."_

FR-15.3 requires treating unknown reachability as reachable. The downstream confidence gate
prevents auto-suppression today, so the safety-relevant outcome is currently correct — but any
consumer reading `reachable` directly is told a falsehood, and the guard is one refactor from
mattering.

### PROD-6 — CSAF and OpenVEX parse silently instead of being rejected (MEDIUM)

**Where:** [src/renderer/lib/services/vex/vexParser.ts:153-169](../../src/renderer/lib/services/vex/vexParser.ts#L153)

Dispatch is duck-typed on `Array.isArray(json.statements)` / `Array.isArray(json.vulnerabilities)`
with no format signature check. An OpenVEX document (top-level `statements`, but `vulnerability` is
an object) or a CSAF one (top-level `vulnerabilities`, entries keyed `cve` not `id`) matches
structurally, then drops every entry to a warning and returns an **empty statement list**.

FR-16.2 requires an explicit rejection. A user supplying a CSAF file to `--vex` in CI gets a
successful run in which nothing is suppressed and no error is raised — the failure is invisible.

### PROD-7 — `neverAutoFilter` can be emptied, and the validator only warns (LOW)

**Where:** [src/renderer/lib/services/fpf/falsePositiveFilter.ts:130](../../src/renderer/lib/services/fpf/falsePositiveFilter.ts#L130),
[configService.ts:264](../../src/renderer/lib/services/fpf/configService.ts#L264)

The Critical/High protection is `settings.neverAutoFilter || DEFAULT_FILTER_SETTINGS.neverAutoFilter`.
An explicit `neverAutoFilter: []` is truthy, so it does **not** fall back to the default and the
protection is off. `validateConfig` only pushes a _warning_ (non-blocking) and checks only
`'critical'`, never `'high'`.

FR-15.1 and FR-30 both state this as an invariant. It should be enforced in code, not left to
configuration.

### PROD-8 — The coverage-gap gate is opt-in (LOW)

**Where:** [cli/index.ts:198](../../cli/index.ts#L198)

`gapGateExit` is `0` unless `--max-gaps` is passed, so a scan whose components mostly failed to
match exits `0`. FR-22 says unmatched coverage "cannot pass as clean". Either default `--max-gaps`
to something, or soften the requirement — but the two disagree today.

### PROD-9 — Android-image detection covers only one of two input paths (LOW)

**Where:** [server/routes/sbom.ts:95](../../server/routes/sbom.ts#L95)

`isAndroidImageDir` guards the opt-in `localPath` branch only. A directly uploaded `super.img` goes
straight to Syft and yields the near-empty SBOM that FR-12.2 exists to prevent.

### PROD-10 — FR-17's wording is wrong, not the code (documentation defect)

**Where:** [src/renderer/lib/services/license/licenseScanner.ts:82](../../src/renderer/lib/services/license/licenseScanner.ts#L82)

`operator === 'OR' ? Math.min(...) : Math.max(...)` picks the _least_ restrictive category for an
`OR` expression. That is the correct SPDX semantic — `MIT OR GPL-3.0` lets you choose MIT. My FR-17
bullet says "resolve multi-licence expressions to the most restrictive applicable category", which
is wrong for `OR`. **Fix the requirement, not the scanner.**

### Previously recorded, same day

The live-scan review found four further defects in the matching path — version ranges never applied
(Log4Shell reported against patched log4j 2.17.2), declared CPEs discarded when a purl exists, the
`_`-stripping sanitizer killing 68.7% of CPE products, and the v2 importer reading `cpe23Uri` when
the API sends `criteria`. Not repeated here; they are the highest-value fixes in the codebase.

---

## Documentation defects in this branch

> **All twelve are fixed on this branch.** Kept in the record rather than deleted — the point of
> the table is that the branch shipped them in the first place.

All of these are mine, introduced by the requirements work in PR #41. Recording them in full: the
branch's premise is that claims should be checkable, so its own unchecked claims are exactly the
thing it argues against.

| #      | Where                                            | Defect                                                                                                                                                                                                                                                    |
| ------ | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOC-1  | `spec-traceability-matrix.md:144`                | SR-01.2 / SR-04 rows appended after a blank line with **no table header** — GFM renders them as literal text, so the summary's 5 SR rows show as 3                                                                                                        |
| DOC-2  | `spec-traceability-matrix.md:157`                | CR-04 row sits after the `---` rule, under "Remaining gaps" instead of Compliance, also headerless                                                                                                                                                        |
| DOC-3  | `spec-traceability-matrix.md:114`                | FR-21 cites `server/services/backupSchedule.ts` — **the file does not exist**; only `backupSchedule.test.ts`, which imports from `BackupService`                                                                                                          |
| DOC-4  | `requirements-gap-analysis…md:92`, `PRD.md:1391` | BDD figures "147 / 108 / 32" — the total is wrong and the parts don't sum. Verified by running the suite: **149 defined, 108 executing, 41 excluded** (`not @ui and not @wip`)                                                                            |
| DOC-5  | `docs/README.md:57`                              | Still says "20 shipped capabilities"; corrected to 21 everywhere else                                                                                                                                                                                     |
| DOC-6  | `PRD.md:1606`                                    | Change history says "~7,900 lines"; the verified de-duplicated total is ~8,500                                                                                                                                                                            |
| DOC-7  | `PRD.md:1400`                                    | Recommends a 90% branch floor while measuring **89.90%** — adopting it reds CI immediately                                                                                                                                                                |
| DOC-8  | `PRD.md:4`                                       | Header still reads `Version 1.1 / 2026-08-07` while the branch adds a `1.1 / 2026-08-22` history row — two documents claiming v1.1                                                                                                                        |
| DOC-9  | `PRD.md:1352`                                    | CR-03 says CycloneDX v1.0–v1.5; the parser accepts **1.6** and says so in its own comment. The branch edited this exact bullet list without fixing it                                                                                                     |
| DOC-10 | `PRD.md:908`                                     | FR-23 requires "all user-facing strings" and is traced DONE, but the evidence is 78 of 82 files — should be PARTIAL, or the requirement scoped                                                                                                            |
| DOC-11 | `requirements-gap-analysis…md:97`                | "What changed" omits SR-01.2, which the other three documents list                                                                                                                                                                                        |
| DOC-12 | `spec-traceability-matrix.md:42`                 | Summary claims 3 PARTIAL FR rows while only **2** rows say PARTIAL. Resolved together with DOC-10 rather than by editing the count: marking FR-23 PARTIAL makes three, and the original 56/3 (total 68/8) correct. **The row was wrong, not the summary** |

---

## Not reproduced

Recorded because a review that only lists confirmations is not a review.

- **"Tar-slip → arbitrary file write" (raised as MEDIUM).** Built a tarball with a `../../escaped.txt`
  member and extracted it with the `tar` on this machine: **GNU tar 1.35 refuses it** — _"Member name
  contains '..'"_, non-zero exit, nothing written outside the destination. bsdtar (Windows' bundled
  `tar.exe`) applies the same protection. Downgraded to SEC-3 as a defence-in-depth gap.
- **"BDD actual is 149 / 105 executing / 44 excluded"** (offered as the correction to DOC-4). Running
  the suite reports **108 passing**, not 105. The correct triple is 149 / 108 / 41. The original
  figure was wrong and so was the proposed replacement.
- ~~"The matrix says CycloneDX 1.0–1.6"~~ — **I was wrong to reject this.** The matrix CR-03 row does
  read `CycloneDX 1.0-1.6`, contradicting the PRD's 1.0–1.5. Caught while fixing DOC-9. Left in the
  record rather than quietly deleted: mis-rejecting a true finding is the same failure as accepting a
  false one, and only one of the two usually gets written down.

---

## Verified as correct

Recorded so the confirmations carry the same weight as the findings: the 21 line-count claims in the
gap analysis match `wc -l` exactly; the 13-term keyword probe returns 0 on master's PRD for all 13
terms; the 982-line PRD figure is right; matrix row counts (59/8/5/4 = 76) match its summary;
coverage floors 95/89/95/96 match `vitest.config.ts`; every relative link across the five documents
resolves; CLI exit codes 0/1/2/3 match FR-22; SR-01.2's AES-256-GCM claim matches `secureStorage.ts`;
FR-15.4's hash chain is genuine SHA-256 via `crypto.subtle`, awaited at both write and verify, with
`verifyIntegrity()` returning the first tampered index; and SR-04's "never through a shell" holds —
`SyftService`, `syftProvision`, `ContainerService` and `AndroidImageService` all use `execFile`/
`spawn` with argv arrays, with `ALLOWED_RUNTIMES` allowlisting the runtime binary. No SQL injection
path was found: all queries bind `?` placeholders, and the FTS5 `MATCH` expression is tokenised to
quoted alphanumerics and still bound as a parameter.

---

## Suggested order of work

1. **PROD-1** — restore without verification destroys data.
2. **The four live-scan matching defects** — the tool's core function is wrong before these.
3. **SEC-1**, **SEC-2** — a bypassed containment control and a catalog that can silently empty.
4. **DOC-1 … DOC-12** — cheap, and they are in an open PR whose subject is accuracy.
5. **PROD-2, PROD-4** — decide whether to wire the offline queue and incremental scan or delete
   them. Either is defensible; leaving tested code that nothing calls is not.
6. The rest.
