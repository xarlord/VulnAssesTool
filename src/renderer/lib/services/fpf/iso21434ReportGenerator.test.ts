/**
 * ISO 21434 Report Generator Tests (extended coverage)
 *
 * The original happy-path suite for this class lives in filterAuditLogger.test.ts
 * (`describe('ISO21434ReportGenerator', ...)`) — that file is untouched. This file adds
 * INTENT-focused tests for the gaps that suite leaves at ~65% branch coverage: risk
 * classification thresholds, kept/filtered/uncertain traceability fields, audit-summary
 * aggregation, empty-input handling, evidence/signature fields, report options, and PDF
 * rendering edge cases (empty sections, risk-color branches, LLM-usage text, pagination,
 * download filename fallback).
 *
 * @module fpf/iso21434ReportGenerator.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { jsPDF } from 'jspdf'
import { ISO21434ReportGenerator } from './iso21434ReportGenerator'
import type { FilterAuditEvent, VulnerabilityRef } from '@@/types/fpf'

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockVulnerabilityRef = (overrides: Partial<VulnerabilityRef> = {}): VulnerabilityRef => ({
  cveId: 'CVE-2024-00001',
  severity: 'high',
  cvssScore: 7.5,
  component: { name: 'comp-a', version: '1.0.0', cpe: 'cpe:2.3:a::comp-a:1.0.0' },
  ...overrides,
})

const createMockAuditEvent = (overrides: Partial<FilterAuditEvent> = {}): FilterAuditEvent => ({
  id: 'event-1',
  timestamp: '2024-01-01T10:00:00Z',
  eventType: 'filter_decision',
  vulnerability: createMockVulnerabilityRef(),
  decision: {
    action: 'filtered',
    tier: 1,
    filterType: 'disabled_interface',
    reason: 'Interface disabled',
    confidence: 85,
  },
  context: { projectId: 'proj-1', projectName: 'Test Project', configVersion: '1.0.0' },
  user: { id: 'user-1', name: 'Test User', role: 'analyst' },
  hash: 'hash-1',
  previousHash: '0'.repeat(64),
  ...overrides,
})

/** Decodes a jsPDF document's rendered content so assertions can check for real page text. */
function decodePdfText(doc: jsPDF): string {
  const dataUri = doc.output('datauristring')
  const base64 = dataUri.split(',')[1]
  return atob(base64)
}

describe('ISO21434ReportGenerator (extended coverage)', () => {
  let generator: ISO21434ReportGenerator

  beforeEach(() => {
    generator = new ISO21434ReportGenerator()
  })

  // --------------------------------------------------------------------------
  // Risk classification (determineRiskLevel thresholds)
  // --------------------------------------------------------------------------
  describe('risk classification', () => {
    it('classifies risk as unacceptable and counts criticalKept when a critical-severity vulnerability is kept', async () => {
      // WHY: criticalKept must count only critical-severity kept findings (not high) — this
      // is the primary unacceptable-risk trigger. Without it, a mutation that only ever
      // incremented highKept would still pass the "6 highs" test below.
      const keptCriticalEvent = createMockAuditEvent({
        vulnerability: createMockVulnerabilityRef({ severity: 'critical' }),
        decision: {
          action: 'kept',
          tier: 2,
          filterType: 'attack_path_blocked',
          reason: 'Valid finding',
          confidence: 95,
        },
      })

      const report = await generator.generate('Test Project', '1.0.0', [keptCriticalEvent], { config: 'test' })

      expect(report.summary.criticalKept).toBe(1)
      expect(report.summary.highKept).toBe(0)
      expect(report.summary.riskLevel).toBe('unacceptable')
    })

    it('classifies risk as acceptable when a high-severity vulnerability is kept but none are critical', async () => {
      // WHY: determineRiskLevel has three outcomes (unacceptable/acceptable/negligible).
      // The existing suite only exercises criticalKept>0 (unacceptable) and all-zero
      // (negligible) — the middle "acceptable" tier (1-5 high, zero critical) was untested,
      // so a regression collapsing acceptable into negligible or unacceptable would pass.
      const keptHighEvent = createMockAuditEvent({
        vulnerability: createMockVulnerabilityRef({ severity: 'high' }),
        decision: {
          action: 'kept',
          tier: 2,
          filterType: 'attack_path_blocked',
          reason: 'Valid finding',
          confidence: 90,
        },
      })

      const report = await generator.generate('Test Project', '1.0.0', [keptHighEvent], { config: 'test' })

      expect(report.summary.criticalKept).toBe(0)
      expect(report.summary.highKept).toBe(1)
      expect(report.summary.riskLevel).toBe('acceptable')
    })

    it('classifies risk as unacceptable when more than five high-severity vulnerabilities are kept, even with zero critical', async () => {
      // WHY: the risk gate is `criticalKept > 0 || highKept > 5` — a report with six kept
      // highs must escalate to unacceptable purely on volume, without any critical CVE.
      const sixHighKeptEvents = Array.from({ length: 6 }, (_, i) =>
        createMockAuditEvent({
          id: `event-high-${i}`,
          vulnerability: createMockVulnerabilityRef({ cveId: `CVE-2024-${i}`, severity: 'high' }),
          decision: {
            action: 'kept',
            tier: 2,
            filterType: 'attack_path_blocked',
            reason: 'Valid finding',
            confidence: 90,
          },
        }),
      )

      const report = await generator.generate('Test Project', '1.0.0', sixHighKeptEvents, { config: 'test' })

      expect(report.summary.criticalKept).toBe(0)
      expect(report.summary.highKept).toBe(6)
      expect(report.summary.riskLevel).toBe('unacceptable')
    })
  })

  // --------------------------------------------------------------------------
  // kept/filtered/uncertain grouping and traceability fields
  // --------------------------------------------------------------------------
  describe('kept/filtered/uncertain grouping', () => {
    it('maps each decision action to its ISO 21434 recommendation text', async () => {
      // WHY: downstream compliance tooling/humans read `recommendation` to decide next
      // steps — a mutation that scrambles the action->recommendation mapping must fail here,
      // not just "some string was produced".
      const events = [
        createMockAuditEvent({
          id: 'kept-1',
          decision: { action: 'kept', tier: 2, filterType: 'attack_path_blocked', reason: 'Valid', confidence: 95 },
        }),
        createMockAuditEvent({
          id: 'filtered-1',
          decision: {
            action: 'filtered',
            tier: 1,
            filterType: 'disabled_interface',
            reason: 'Disabled',
            confidence: 85,
          },
        }),
        createMockAuditEvent({
          id: 'escalated-1',
          eventType: 'review',
          decision: { action: 'escalated', tier: 3, filterType: 'llm_analysis', reason: 'Unclear', confidence: 60 },
        }),
      ]

      const report = await generator.generate('Test Project', '1.0.0', events, { config: 'test' })

      expect(report.sections.kept[0].recommendation).toBe('Valid vulnerability - requires remediation')
      expect(report.sections.filtered[0].recommendation).toBe('False positive - no action required')
      expect(report.sections.uncertain[0].recommendation).toBe('Requires manual review by security team')
    })

    it('threads filter reason/tier/confidence/date onto each filtered summary for audit traceability', async () => {
      // WHY: an ISO 21434 auditor must be able to see WHY something was filtered (reason,
      // tier, confidence, when) directly on the report row — losing this mapping would
      // silently break traceability while all "length" based assertions still pass.
      const filteredEvent = createMockAuditEvent({
        timestamp: '2024-03-15T09:30:00Z',
        decision: {
          action: 'filtered',
          tier: 3,
          filterType: 'suppression_rule',
          reason: 'Suppressed by rule R-12',
          confidence: 72,
        },
      })

      const report = await generator.generate('Test Project', '1.0.0', [filteredEvent], { config: 'test' })

      const [entry] = report.sections.filtered
      expect(entry.filterReason).toBe('Suppressed by rule R-12')
      expect(entry.filterTier).toBe(3)
      expect(entry.confidence).toBe(72)
      expect(entry.filterDate).toBe('2024-03-15T09:30:00Z')
    })
  })

  // --------------------------------------------------------------------------
  // Audit-summary aggregation
  // --------------------------------------------------------------------------
  describe('audit-summary aggregation', () => {
    it('accumulates eventsByTier counts across multiple events sharing the same tier', async () => {
      // WHY: `eventsByTier[tier] = (eventsByTier[tier] || 0) + 1` must accumulate, not just
      // record presence — a mutation to `= 1` would still pass a "tier key exists" check.
      const events = [
        createMockAuditEvent({ id: 'a', decision: { ...createMockAuditEvent().decision, tier: 1 } }),
        createMockAuditEvent({ id: 'b', decision: { ...createMockAuditEvent().decision, tier: 1 } }),
        createMockAuditEvent({ id: 'c', decision: { ...createMockAuditEvent().decision, tier: 2 } }),
      ]

      const report = await generator.generate('Test Project', '1.0.0', events, { config: 'test' })

      expect(report.auditSummary.eventsByTier[1]).toBe(2)
      expect(report.auditSummary.eventsByTier[2]).toBe(1)
    })

    it('captures override events, not just reviews, in the user-actions audit trail', async () => {
      // WHY: userReviews filters on `eventType === 'review' || eventType === 'override'` —
      // only 'review' is exercised elsewhere. A regression that drops the 'override' arm
      // would still pass every other test in the suite.
      const overrideEvent = createMockAuditEvent({
        id: 'override-1',
        eventType: 'override',
        vulnerability: createMockVulnerabilityRef({ cveId: 'CVE-2024-OVERRIDE' }),
        user: { id: 'user-2', name: 'Lead Analyst', role: 'lead' },
      })

      const report = await generator.generate('Test Project', '1.0.0', [overrideEvent], { config: 'test' })

      expect(report.auditSummary.userReviews).toHaveLength(1)
      expect(report.auditSummary.userReviews[0]).toMatchObject({
        cveId: 'CVE-2024-OVERRIDE',
        decision: 'filtered',
        user: 'Lead Analyst',
      })
    })
  })

  // --------------------------------------------------------------------------
  // Empty-input handling
  // --------------------------------------------------------------------------
  describe('empty-input handling', () => {
    it('produces a valid, negligible-risk report for an empty audit log instead of erroring', async () => {
      // WHY: a project with a clean scan (no audit events yet) must still produce a
      // well-formed report — zero counts and negligible risk, not a crash or NaN.
      const report = await generator.generate('Empty Project', '1.0.0', [], { config: 'test' })

      expect(report.summary.totalVulnerabilities).toBe(0)
      expect(report.summary.riskLevel).toBe('negligible')
      expect(report.methodology.llmUsed).toBe(false)
      expect(report.auditSummary.totalEvents).toBe(0)
      expect(report.auditSummary.userReviews).toHaveLength(0)
      expect(report.sections.kept).toHaveLength(0)
      expect(report.sections.filtered).toHaveLength(0)
      expect(report.sections.uncertain).toHaveLength(0)
    })
  })

  // --------------------------------------------------------------------------
  // Evidence and signature fields
  // --------------------------------------------------------------------------
  describe('evidence and signature fields', () => {
    it('carries the config snapshot into evidence and leaves review/approval pending at generation time', async () => {
      // WHY: evidence.configSnapshot is the tamper-evident record of what config produced
      // this report; signatures.reviewed/approved must stay unset until a human actually
      // signs off — a report that pre-fills these would be a false compliance claim.
      const configSnapshot = { filterSettings: { autoFilterConfidenceThreshold: 75 } }

      const report = await generator.generate('Test Project', '1.0.0', [createMockAuditEvent()], configSnapshot)

      expect(report.evidence.configSnapshot).toBe(JSON.stringify(configSnapshot))
      expect(report.signatures.generated).toBe(report.generatedAt)
      expect(report.signatures.reviewed).toBeUndefined()
      expect(report.signatures.approved).toBeUndefined()
    })
  })

  // --------------------------------------------------------------------------
  // exportJSON
  // --------------------------------------------------------------------------
  describe('exportJSON', () => {
    it('serializes the report to JSON that round-trips back to the same data', async () => {
      // WHY: exportJSON is the ISO 21434 deliverable handed to auditors — it must be valid,
      // parseable JSON that reproduces the report, not just "some string".
      const report = await generator.generate('Test Project', '1.0.0', [createMockAuditEvent()], { config: 'test' })

      const json = generator.exportJSON(report)
      const parsed = JSON.parse(json)

      expect(parsed).toEqual(report)
    })
  })

  // --------------------------------------------------------------------------
  // Report options
  // --------------------------------------------------------------------------
  describe('report options', () => {
    it('treats includeUndone:true the same as the default (all events) — filtering is not yet implemented', async () => {
      // WHY: the source documents that includeUndone has no effect yet ("For now, we
      // include all events"). This pins today's actual behavior so that whoever implements
      // real undone-filtering must deliberately update this test, instead of an incomplete
      // change silently shipping.
      const events = [createMockAuditEvent({ id: 'a' }), createMockAuditEvent({ id: 'b' })]

      const withDefault = await generator.generate('Test Project', '1.0.0', events, { config: 'test' })
      const withIncludeUndone = await generator.generate(
        'Test Project',
        '1.0.0',
        events,
        { config: 'test' },
        { includeUndone: true },
      )

      expect(withIncludeUndone.summary.totalVulnerabilities).toBe(withDefault.summary.totalVulnerabilities)
      expect(withIncludeUndone.summary.totalVulnerabilities).toBe(2)
    })

    it('uses a custom reportVersion from options over the constructor default', async () => {
      // WHY: options.reportVersion must win over the instance default — a project pinning
      // a specific report schema version for compliance would otherwise silently get the
      // wrong version stamped on the document.
      const report = await generator.generate(
        'Test Project',
        '1.0.0',
        [createMockAuditEvent()],
        { config: 'test' },
        {
          reportVersion: '2.3.1',
        },
      )

      expect(report.reportVersion).toBe('2.3.1')
    })
  })

  // --------------------------------------------------------------------------
  // PDF export edge cases
  // --------------------------------------------------------------------------
  describe('PDF export edge cases', () => {
    it('renders a blank cell rather than "undefined" when a filtered decision has no reason text', async () => {
      // WHY: the filtered-table row falls back with `v.filterReason || ''` — if a decision
      // was ever persisted with an empty reason, the PDF cell must stay blank, not show the
      // literal string "undefined" that map() would otherwise interpolate.
      const filteredNoReason = createMockAuditEvent({
        decision: { action: 'filtered', tier: 1, filterType: 'disabled_interface', reason: '', confidence: 85 },
      })
      const report = await generator.generate('Test Project', '1.0.0', [filteredNoReason], { config: 'test' })

      const doc = await generator.exportPDF(report)
      const text = decodePdfText(doc)

      expect(text).not.toContain('undefined')
    })

    it('renders "0%" rather than "undefined%" when a filtered decision is missing a confidence score', async () => {
      // WHY: `${v.confidence ?? 0}%` guards against a decision persisted without a
      // confidence value (e.g. an older schema/partial record) — the PDF must show a
      // meaningful 0%, not the literal text "undefined%".
      const filteredNoConfidence = createMockAuditEvent({
        decision: {
          action: 'filtered',
          tier: 1,
          filterType: 'disabled_interface',
          reason: 'Disabled',
          confidence: undefined as unknown as number,
        },
      })
      const report = await generator.generate('Test Project', '1.0.0', [filteredNoConfidence], { config: 'test' })

      const doc = await generator.exportPDF(report)
      const text = decodePdfText(doc)

      expect(text).toContain('0%')
      expect(text).not.toContain('undefined%')
    })

    it('omits the Kept/Filtered tables and renders the negligible risk color for an all-clear report', async () => {
      // WHY: `if (sections.kept.length > 0)` / `if (sections.filtered.length > 0)` guard the
      // PDF sections — an all-clear report (nothing kept or filtered) must not render empty
      // tables, and its risk color must fall through both ternary arms to negligible (green).
      const report = await generator.generate('Test Project', '1.0.0', [], { config: 'test' })

      const doc = await generator.exportPDF(report)
      const text = decodePdfText(doc)

      expect(text).not.toContain('Kept Vulnerabilities')
      expect(text).not.toContain('Filtered Vulnerabilities (False Positives)')
      expect(text).toContain('NEGLIGIBLE')
    })

    it('renders the acceptable risk color when high-severity findings are kept but none are critical', async () => {
      const keptHighEvent = createMockAuditEvent({
        vulnerability: createMockVulnerabilityRef({ severity: 'high' }),
        decision: {
          action: 'kept',
          tier: 2,
          filterType: 'attack_path_blocked',
          reason: 'Valid finding',
          confidence: 90,
        },
      })
      const report = await generator.generate('Test Project', '1.0.0', [keptHighEvent], { config: 'test' })

      const doc = await generator.exportPDF(report)
      const text = decodePdfText(doc)

      expect(text).toContain('ACCEPTABLE')
    })

    it('renders "LLM Used: Yes" in the methodology section when any event carries llmData', async () => {
      // WHY: the existing suite checks `methodology.llmUsed` on the JSON report but never
      // verifies the PDF's own ternary (`llmUsed ? 'Yes' : 'No'`) actually renders "Yes".
      const eventWithLlm = createMockAuditEvent({
        llmData: {
          model: 'llama-2-7b',
          prompt: 'Analyze CVE',
          response: 'Not exploitable',
          parsedResult: {
            isExploitable: false,
            confidence: 90,
            attackPath: null,
            blockedBy: ['disabled_interface'],
            reasoning: 'Interface disabled',
            recommendation: 'accept_risk',
            iso21434Notes: 'Blocked',
          },
        },
      })
      const report = await generator.generate('Test Project', '1.0.0', [eventWithLlm], { config: 'test' })

      const doc = await generator.exportPDF(report)
      const text = decodePdfText(doc)

      expect(text).toContain('LLM Used: Yes')
    })

    it('paginates instead of overlapping content when a report has many kept and filtered findings', async () => {
      // WHY: the PDF adds explicit page breaks (`if (currentY > 250) doc.addPage()`) before
      // each major section. A real ISO 21434 audit log for a mature project can easily have
      // dozens of decisions; this must span multiple pages, not silently overlap text on one.
      const manyEvents = [
        ...Array.from({ length: 25 }, (_, i) =>
          createMockAuditEvent({
            id: `kept-${i}`,
            vulnerability: createMockVulnerabilityRef({ cveId: `CVE-2024-K${i}`, severity: 'high' }),
            decision: {
              action: 'kept',
              tier: 2,
              filterType: 'attack_path_blocked',
              reason: 'Valid finding',
              confidence: 90,
            },
          }),
        ),
        ...Array.from({ length: 25 }, (_, i) =>
          createMockAuditEvent({
            id: `filtered-${i}`,
            vulnerability: createMockVulnerabilityRef({ cveId: `CVE-2024-F${i}` }),
            decision: {
              action: 'filtered',
              tier: 1,
              filterType: 'disabled_interface',
              reason: 'Disabled',
              confidence: 85,
            },
          }),
        ),
      ]
      const report = await generator.generate('Test Project', '1.0.0', manyEvents, { config: 'test' })

      const doc = await generator.exportPDF(report)

      expect(doc.getNumberOfPages()).toBeGreaterThan(1)
      // Footer must be stamped on every page produced, including the overflow pages.
      const text = decodePdfText(doc)
      expect(text).toContain(`Page ${doc.getNumberOfPages()} of ${doc.getNumberOfPages()}`)
    })

    // The counts below (12, and 12+1) are empirically calibrated against the current
    // jspdf-autotable row height, not arbitrary — and the calibration is narrow: 12 kept
    // rows exceeds the page-break threshold via this file's own `currentY > 250` guard, but
    // going up to 15 instead flips the *mechanism* entirely (autoTable's own internal
    // pagination kicks in first, giving the kept table a fresh page and a small finalY, so
    // this file's guard never fires even though the page count is still >1). Don't "round up
    // for safety" here — verify against coverage output if this ever needs to change. A
    // future jspdf/jspdf-autotable version bump could shift row metrics enough to need
    // recalibration — an accepted, disclosed tradeoff for exercising these checkpoints at all
    // (see final report for the two page-break checkpoints left undone).
    it('breaks to a new page before the Audit Summary when the kept table alone fills the page', async () => {
      const manyKeptEvents = Array.from({ length: 12 }, (_, i) =>
        createMockAuditEvent({
          id: `kept-${i}`,
          vulnerability: createMockVulnerabilityRef({ cveId: `CVE-2024-K${i}`, severity: 'high' }),
          decision: {
            action: 'kept',
            tier: 2,
            filterType: 'attack_path_blocked',
            reason: 'Valid finding',
            confidence: 90,
          },
        }),
      )
      const report = await generator.generate('Test Project', '1.0.0', manyKeptEvents, { config: 'test' })

      const doc = await generator.exportPDF(report)

      expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    })

    it('breaks to a new page before the Filtered table when the kept table alone fills the page', async () => {
      const events = [
        ...Array.from({ length: 12 }, (_, i) =>
          createMockAuditEvent({
            id: `kept-${i}`,
            vulnerability: createMockVulnerabilityRef({ cveId: `CVE-2024-K${i}`, severity: 'high' }),
            decision: {
              action: 'kept',
              tier: 2,
              filterType: 'attack_path_blocked',
              reason: 'Valid finding',
              confidence: 90,
            },
          }),
        ),
        ...Array.from({ length: 1 }, (_, i) =>
          createMockAuditEvent({
            id: `filtered-${i}`,
            vulnerability: createMockVulnerabilityRef({ cveId: `CVE-2024-F${i}` }),
            decision: {
              action: 'filtered',
              tier: 1,
              filterType: 'disabled_interface',
              reason: 'Disabled',
              confidence: 85,
            },
          }),
        ),
      ]
      const report = await generator.generate('Test Project', '1.0.0', events, { config: 'test' })

      const doc = await generator.exportPDF(report)

      expect(doc.getNumberOfPages()).toBeGreaterThan(1)
    })
  })

  // --------------------------------------------------------------------------
  // downloadPDF filename fallback
  // --------------------------------------------------------------------------
  describe('downloadPDF', () => {
    // jsPDF binds `save` as a per-instance own property (not on jsPDF.prototype), so it
    // can't be spied on before the instance exists. downloadPDF's own responsibility —
    // the `filename || <default>` fallback — is isolated here with a stub doc instead,
    // independent of exportPDF's real rendering (already covered elsewhere).
    const stubExportPDF = (): { fakeSave: ReturnType<typeof vi.fn> } => {
      const fakeSave = vi.fn()
      vi.spyOn(generator, 'exportPDF').mockResolvedValue({ save: fakeSave } as unknown as jsPDF)
      return { fakeSave }
    }

    it('generates a default filename from the project name and date when none is given', async () => {
      const report = await generator.generate('Acme Corp', '2.1.0', [createMockAuditEvent()], { config: 'test' })
      const { fakeSave } = stubExportPDF()

      await generator.downloadPDF(report)

      expect(fakeSave).toHaveBeenCalledTimes(1)
      const [usedName] = fakeSave.mock.calls[0] as [string]
      expect(usedName).toContain('Acme Corp')
      expect(usedName).toMatch(/\.pdf$/)
    })

    it('honors an explicit filename over the generated default', async () => {
      const report = await generator.generate('Acme Corp', '2.1.0', [createMockAuditEvent()], { config: 'test' })
      const { fakeSave } = stubExportPDF()

      await generator.downloadPDF(report, 'custom-name.pdf')

      expect(fakeSave).toHaveBeenCalledWith('custom-name.pdf')
    })
  })

  // --------------------------------------------------------------------------
  // generateStatistics edge cases
  // --------------------------------------------------------------------------
  describe('generateStatistics edge cases', () => {
    it('returns zero rates for an empty audit log instead of dividing by zero', () => {
      // WHY: averageConfidence/llmUsageRate divide by auditLog.length — an empty log must
      // short-circuit to 0, not produce NaN, so downstream dashboards don't render "NaN%".
      const stats = generator.generateStatistics([])

      expect(stats.averageConfidence).toBe(0)
      expect(stats.llmUsageRate).toBe(0)
      expect(stats.bySeverity).toEqual({})
      expect(stats.byAction).toEqual({})
    })

    it('counts llm usage only for events that actually carry llmData', () => {
      const events = [
        createMockAuditEvent({
          id: 'with-llm',
          llmData: {
            model: 'llama-2-7b',
            prompt: 'p',
            response: 'r',
            parsedResult: {
              isExploitable: false,
              confidence: 90,
              attackPath: null,
              blockedBy: [],
              reasoning: 'r',
              recommendation: 'accept_risk',
              iso21434Notes: 'n',
            },
          },
        }),
        createMockAuditEvent({ id: 'without-llm' }),
      ]

      const stats = generator.generateStatistics(events)

      expect(stats.llmUsageRate).toBe(0.5)
    })
  })
})
