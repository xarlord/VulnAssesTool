# VEX Round-Trip with Full FPF Reconciliation — Design (Workstream A / Phase 3)

**Date:** 2026-07-22
**Branch:** feat/phase0-perf-a11y
**Status:** Design approved; implementation pending (built after Workstream B / CPE near-match)

## Goal

Let a user **import an existing VEX document in the GUI** and have its triage decisions
**merge into the FPF (False Positive Filter) state** as first-class, auditable decisions —
so suppressed findings reflect in the app _and_ can be re-exported. Completes the round-trip:
FPF decisions → **export** VEX (exists) → edit externally → **import** VEX → apply (this work).

## Current state (grounded in code)

- **VEX logic already exists and is tested.** [vexParser.ts](../../src/renderer/lib/services/vex/vexParser.ts)
  (`parseVexDocument`, `applyVexSuppression`) accepts CycloneDX VEX JSON — this tool's native
  `statements` shape and the standard `vulnerabilities` shape. CSAF/OpenVEX are out of scope.
  The **CLI already uses it** (`--vex <file>` → suppress `not_affected`/`resolved`).
- **VEX export reads FPF audit events.** [vexGenerator.ts](../../src/renderer/lib/services/vex/vexGenerator.ts)
  `generateFromAuditEvents` groups `FilterAuditEvent[]` by vulnerability, takes the **latest event**,
  and maps `decision.action` (`filtered`/`kept`/`escalated`) → VEX status.
- **FPF is a hash-chained audit-event log** ([fpf.ts](../../src/shared/types/fpf.ts) `FilterAuditEvent`
  with `hash`/`previousHash`, ISO 21434), persisted per-project in the DB
  ([filterAuditLogger.ts](../../src/renderer/lib/services/fpf/filterAuditLogger.ts) —
  `getProjectAuditLog(projectId)`). Current triage = newest event per vulnerability.
- **The main findings view does NOT consult FPF.** [ProjectDetail.tsx](../../src/renderer/pages/ProjectDetail.tsx)
  hides only by `matchQuality` (name-only noise) and links out to a separate FPF page
  (`/project/:id/fpf`). So merging VEX into FPF alone changes nothing in the main view — hence A-1.

## Decisions

- **A-1 — Visibility scope: FPF source-of-truth + main view becomes triage-aware.** VEX → appended
  FPF audit events (re-exportable, ISO-report-consistent) **and** ProjectDetail learns to read
  FPF-derived triage so `not_affected`/`resolved` findings are badged + hidden-by-default where
  users look. (Not: FPF-only, which would appear to "do nothing"; not a lightweight display filter,
  which was rejected as not-true-round-trip.)
- **A-2 — Conflict policy: auto-apply new, surface conflicts.** VEX statements for **untriaged**
  findings apply directly; where a VEX would **change an existing decision** (especially suppressing
  something previously `kept`), the user accepts/rejects each before any event is written. Nothing
  that changes a human decision is written silently.

## Design

### 1. Data model & flow

Pipeline: upload → `parseVexDocument` → `ParsedVexStatement[]` → map to findings → reconcile →
append `FilterAuditEvent`s.

- **Match** statements to findings by vuln **id/alias** (reuse `idMatches`) and `affects` → component
  (a small resolver maps bom-ref / purl / cpe refs to project component ids); a statement with **no
  `affects`** applies document-wide (matches parser semantics).
- **Map** to a proposed `FilterAuditEvent`:
  - `decision.action`: `not_affected`/`resolved` → `filtered`; `affected` → `kept`;
    `under_investigation` → `escalated` (inverse of `vexGenerator.mapActionToStatus` → symmetric).
  - `eventType: 'override'`; new `filterType: 'imported_vex'` (honest provenance; alternative is
    reusing `'suppression_rule'`); `reason` = VEX `detail`/justification + source filename;
    `user` = VEX author metadata or a system "Imported VEX" identity; `confidence: 100`.
  - Events extend the existing **hash chain**.
- **Derived-state granularity:** latest event per vulnerability (scoped by component where `affects`
  present) — same grouping `vexGenerator` uses, to stay export-symmetric.

### 2. Reconciliation UX

Classify each statement against current FPF-derived state:

- **New** — no prior decision → auto-apply.
- **Unchanged** — VEX matches current → skip (no redundant event).
- **Conflict** — VEX would change an existing decision → held for review.

**Reconciliation dialog** (Radix Dialog, per `08977b9`):

- Summary: _"VEX: N new, N unchanged, N conflicts, N unmatched."_
- Conflicts listed (current vs VEX-proposed) with accept/reject + accept-all/reject-all;
  suppressing-a-`kept`-finding flagged as risky.
- **Unmatched** statements surfaced as warnings (never silently dropped), with parser `warnings`.
- On confirm: write events for **new + accepted conflicts** only.
- Feedback: toast + persisted summary.

Rationale: per A-2, no human decision is overwritten without an explicit reviewer choice (ISO 21434
audit integrity); the common case (fresh VEX over untriaged findings) is still one click.

### 3. Main findings view becomes triage-aware

- **Triage selector/hook:** load the project's newest-wins decision per vuln/component (from
  `getProjectAuditLog`, the same derivation `vexGenerator` uses) into a memoized
  `Map<findingKey, {status, source, reason}>`.
- **Display (mirrors the existing low-confidence convention):** `not_affected`/`resolved` findings
  get a **"Not affected (VEX)"** / **"Resolved"** badge and are **hidden-by-default under a toggle**
  (like `hideNameOnlyMatches`).
- **Never hide high-risk silently:** reuse `isHighRiskVuln` + the "surface what the toggle
  suppressed" banner (ProjectDetail ~1195-1203) so a suppressed KEV/critical still shows, flagged.
- Suppressed finding shows its **reason on hover/expand**. Severity stat tiles get a "(N suppressed)"
  note; suppressed count feeds the existing hidden-count surfacing.
- **YAGNI:** no triage _editing_ in ProjectDetail — editing stays in the FPF page. The main view only
  _reflects_ triage + offers the Import VEX entry.

### 4. Entry points, provenance, round-trip

- **Entry points:** primary on the **FPF page** (beside VEX export); secondary on **ProjectDetail**
  toolbar. Both open the same parse → reconcile dialog.
- **File handling:** `.json` CycloneDX VEX; reuse existing upload affordance + size cap; parser throws
  clear messages on bad input — surfaced inline, fail fast, write nothing.
- **Provenance:** events carry `filterType: 'imported_vex'`, source filename + VEX timestamp in
  `reason`, VEX author as `user`; hash chain extended; ISO-21434 report shows imported decisions
  distinctly.
- **Round-trip:** events are exactly what `vexGenerator` consumes → export→edit→import→export
  reproduces the decisions. Asserted in test 5.
- **Determinism:** keep the import/mapping path free of `Math.random()`/`Date.now()` nondeterminism
  so reconciliation is reproducible.

### 5. Testing strategy (TDD, RED→GREEN)

1. **Status mapping (pure)** + **symmetry** invariant with `vexGenerator.mapActionToStatus`.
2. **Statement→finding matching:** id and alias; `affects` ref → component id; document-wide (no
   `affects`) → all; unmatched → warning, never dropped.
3. **Reconciliation classification:** new / unchanged / conflict correct; accept writes an event,
   reject/unchanged write none.
4. **Conflict safety (key intent test):** `kept` finding + VEX `not_affected` → classified conflict
   and **held**, not suppressed until explicitly accepted (_fails if silent auto-suppression creeps in_).
5. **Round-trip:** seed FPF events → export VEX → import into a fresh project → derived triage
   identical (idempotent).
6. **Main-view awareness:** `filtered` findings badged + hidden under toggle; high-risk/KEV never
   silently hidden; suppressed count surfaces.
7. **Audit/provenance:** written events carry `filterType: 'imported_vex'` + source filename; hash
   chain stays valid.

## Out of scope

- CSAF / OpenVEX import (parser is CycloneDX-only).
- Triage editing in the main findings view (stays in the FPF page).
- Any change to the CLI `--vex` behavior (already shipped).
