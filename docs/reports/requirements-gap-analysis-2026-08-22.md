# Requirements Gap Analysis — 2026-08-22

**Method:** reverse traceability. The existing
[spec-traceability-matrix.md](spec-traceability-matrix.md) walks **requirement → code**, and on that
direction it reports `GAP: 0`. That is true and it is also not the whole picture: a matrix built
that way can only ever find requirements with no code. It is structurally blind to the opposite
failure — **code with no requirement** — because unspecified subsystems have no row to be missing
from.

This sweep walks the other way. Every server route, service module, renderer service and CLI
command in the tree was listed, then matched against a requirement ID in `PRD.md`. Where no
requirement covered it, the subsystem is recorded below with its file and size, so the finding is
checkable rather than asserted.

## Result

**21 shipped capabilities — ~8,500 lines of product code — had no requirement of any kind.**

A keyword probe of `PRD.md` before this analysis makes the scale plain — these are counts of how
many times each shipped capability is mentioned **anywhere** in the 982-line PRD, including prose:

| Term in `PRD.md`  | Occurrences |
| ----------------- | ----------- |
| `Syft`            | 0           |
| `KEV`             | 0           |
| `EPSS`            | 0           |
| `VEX`             | 0           |
| `SARIF`           | 0           |
| `FPF`             | 0           |
| `21434`           | 0           |
| `attack graph`    | 0           |
| `false positive`  | 0           |
| `command palette` | 0           |
| `onboarding`      | 0           |
| `threat intel`    | 0           |
| `WebSocket`       | 0           |

## The unspecified subsystems

| Shipped capability                 | Evidence (primary module)                                  | Lines | New requirement |
| ---------------------------------- | ---------------------------------------------------------- | ----- | --------------- |
| SBOM generation from binary/image  | `server/services/SyftService.ts` + `syftProvision.ts`      | 347   | FR-12           |
| Container image scanning           | `server/services/ContainerService.ts`                      | 722   | FR-13           |
| CISA KEV catalog                   | `server/services/intelligence/KevService.ts`               | 884   | FR-14.1         |
| EPSS scoring                       | `server/services/intelligence/EpssService.ts`              | 410   | FR-14.2         |
| Composite risk score               | `src/renderer/lib/services/riskScore.ts`                   | 293   | FR-14.3         |
| False-positive filtering (2 tiers) | `src/renderer/lib/services/fpf/falsePositiveFilter.ts`     | 376   | FR-15.1–15.3    |
| Attack-path reachability graph     | `src/renderer/lib/services/fpf/attackGraph.ts`             | 622   | FR-15.3         |
| ISO 21434 audit trail (hash chain) | `src/renderer/lib/services/fpf/filterAuditLogger.ts`       | 522   | FR-15.4         |
| ISO 21434 report generation        | `src/renderer/lib/services/fpf/iso21434ReportGenerator.ts` | 465   | FR-15.5         |
| VEX generation                     | `src/renderer/lib/services/vex/vexGenerator.ts`            | 458   | FR-16.1         |
| VEX import / suppression           | `src/renderer/lib/services/vex/vexParser.ts`               | 222   | FR-16.2         |
| License compliance scanning        | `src/renderer/lib/services/license/licenseScanner.ts`      | 187   | FR-17           |
| SBOM diff                          | `src/renderer/lib/services/DiffEngine.ts`                  | 408   | FR-18.1         |
| Incremental scanning               | `src/renderer/lib/services/IncrementalScanService.ts`      | 323   | FR-18.2         |
| CPE estimation / matching          | `src/renderer/lib/services/cpeEstimationService.ts`        | 392   | FR-19           |
| Offline request queue              | `src/renderer/lib/services/OfflineQueue.ts`                | 670   | FR-20           |
| Backup and point-in-time recovery  | `server/services/BackupService.ts`                         | 479   | FR-21           |
| CLI + CI/CD integration            | `cli/index.ts` (+ `exporters/`, `action.yml`)              | 382   | FR-22           |
| Internationalization runtime       | `src/renderer/lib/i18n/index.ts`                           | 52    | FR-23           |
| Encrypted credential storage       | `server/services/storage/secureStorage.ts`                 | 267   | SR-01.2         |
| Pinned + checksum-verified tooling | `server/services/syftProvision.ts`                         | 194   | SR-04           |

Two capabilities were found unspecified and are **deliberately left unspecified** rather than
retro-fitted:

- **FPF Tier 3 (LLM analysis)** — `falsePositiveFilter.ts:371` `isLLMAvailable()` returns a hard
  `false` with the comment "LLM is opt-in only, return false for now". The audit schema and the
  ISO 21434 report already carry `llmData` / `llmUsed` fields for it. It is AI-related and
  therefore out of scope by explicit instruction. Recorded in the PRD as a named exclusion so the
  dangling fields are not mistaken for dead code.
- **Command palette and onboarding tour** — real UI, but they are affordances over requirements
  that already exist (FR-08 search, FR-01 projects) rather than capabilities of their own. Covered
  by one requirement (FR-24) instead of a group, to avoid inflating the count.

## Why this happened

The PRD was written on 2026-02-12 "based on existing codebase analysis" (its own change history,
v1.0 — the only entry). Everything after that date was built against plans, bug hunts and
remediation waves, none of which fed back into the PRD. The traceability matrix was regenerated
several times over that period and never caught it, because it only ever asked the question the
PRD could answer.

## Second-order finding: the PRD's own status claims had drifted

Facts asserted in `PRD.md` that were false at the time of this analysis:

| Claim                                                                | Actual                                                                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 3 i18n "**not started**; all UI strings are hardcoded English" | Runtime, namespaces and extraction shipped; 78 of 82 files migrated (PR #27). One locale registered — a translation job, not an engineering one |
| Unit test coverage "Existing: ~70% (Need improvement)"               | 95.61 stmts / 89.90 branch / 95.31 func / 96.44 lines, enforced by CI floors 95/89/95/96                                                        |
| BDD "Existing: 124 scenarios"                                        | 147 scenarios in the feature files, of which 108 execute and 32 carry `@wip` with itemised reasons                                              |
| Linting "Current: Needs verification"                                | `npx eslint .` — 0 errors, 0 warnings; enforced as a CI gate                                                                                    |

## What changed as a result

- `PRD.md` gained **FR-12 … FR-24**, **SR-04** and **CR-04** covering the shipped-but-unspecified
  work above, each written from the code rather than from intent.
- `PRD.md` gained a **Planned Functional Requirements** section (**FR-25 … FR-38**, plus **NFR-09**) giving the
  roadmap bullets enough specification to be built or rejected on merit. AI-related rows are
  listed as explicit exclusions.
- The stale status claims above were corrected in place.
- [spec-traceability-matrix.md](spec-traceability-matrix.md) now runs in **both** directions, so a
  future subsystem landing without a requirement shows up as a row rather than as nothing at all.
