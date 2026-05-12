# Specification Traceability Matrix

**Generated:** 2026-03-24
**Project:** VulnAssesTool v2.0
**Source Documents:**

- [2026-02-26-v2-expansion-design.md](../plans/2026-02-26-v2-expansion-design.md)
- [2026-02-27-kev-epss-design.md](../plans/2026-02-27-kev-epss-design.md)
- [2026-03-19-phase4-branding-design.md](../plans/2026-03-19-phase4-branding-design.md)
- [2026-03-23-watchdog-orchestrator-design.md](../plans/2026-03-23-watchdog-orchestrator-design.md)

**Test Locations:**

- BDD Features: `tests/bdd/features/**/*.feature`
- E2E Tests: `e2e/**/*.spec.ts`
- Unit Tests: `tests/**/*.test.ts`

---

## Executive Summary

| Metric             | Value |
| ------------------ | ----- |
| Total Requirements | 85    |
| Covered by Tests   | 52    |
| Overall Coverage   | 61%   |
| BDD Features       | 10    |
| E2E Test Files     | 31    |
| Unit Test Files    | 10    |
| Critical Gaps      | 8     |
| High Priority Gaps | 12    |

---

## Phase Coverage Summary

| Phase                      | Total | Covered | Coverage | Status        |
| -------------------------- | ----- | ------- | -------- | ------------- |
| Phase 1: Foundation        | 19    | 16      | 84%      | ✅ Good       |
| Phase 2: Security Features | 21    | 14      | 67%      | ⚠️ Acceptable |
| Phase 3: UX Excellence     | 32    | 18      | 56%      | ⚠️ Acceptable |
| Phase 4: Branding          | 23    | 8       | 35%      | 🔴 Needs Work |

---

## BDD Feature Coverage

| Feature File               | Scenarios | Requirements Covered             |
| -------------------------- | --------- | -------------------------------- |
| sbom-generator.feature     | 20        | SBOM generation from Excel       |
| nvd-database.feature       | 26        | Database operations, CVE queries |
| cyclonedx-parser.feature   | 4         | SBOM parsing                     |
| spdx-parser.feature        | 4         | SPDX parsing                     |
| metrics-calculator.feature | 23        | Executive dashboard metrics      |
| audit-logging.feature      | 20        | Audit trail, compliance          |
| export-formats.feature     | 14        | Export functionality             |
| hybrid-scanner.feature     | 16        | Multi-provider scanning          |
| update-scheduler.feature   | 8         | Database updates                 |
| example.feature            | 1         | Smoke test                       |

---

## Phase 1: Foundation (84%)

### Covered Requirements

| ID     | Requirement             | Test Case                            | Status |
| ------ | ----------------------- | ------------------------------------ | ------ |
| P1-001 | ErrorBoundary component | error-recovery.spec.ts               | ✅     |
| P1-002 | Global error boundary   | error-recovery.spec.ts               | ✅     |
| P1-003 | Retry mechanism         | error-recovery.spec.ts               | ✅     |
| P1-006 | Backup UI in Settings   | database-settings.spec.ts            | ✅     |
| P1-008 | CacheManager service    | nvd-database.feature (Scenarios 7-9) | ✅     |
| P1-009 | Cache CVE integration   | hybrid-scanner.feature               | ✅     |
| P1-010 | Cache configuration UI  | settings.spec.ts                     | ✅     |
| P1-014 | OfflineQueue service    | offline-sync.spec.ts                 | ✅     |
| P1-015 | Offline indicator       | offline-sync.spec.ts                 | ✅     |
| P1-016 | Sync-on-reconnect       | offline-sync.spec.ts                 | ✅     |
| P1-017 | Unit tests              | tests/\*_/_.test.ts                  | ✅     |
| P1-018 | E2E tests               | e2e/\*_/_.spec.ts                    | ✅     |
| P1-020 | CycloneDX parsing       | cyclonedx-parser.feature             | ✅     |
| P1-021 | SPDX parsing            | spdx-parser.feature                  | ✅     |
| P1-022 | Database initialization | nvd-database.feature                 | ✅     |
| P1-023 | CVE CRUD operations     | nvd-database.feature                 | ✅     |

### Uncovered Requirements

| ID     | Requirement             | Finding | Risk   |
| ------ | ----------------------- | ------- | ------ |
| P1-004 | BackupService scheduler | F-041   | High   |
| P1-005 | Backup IPC handlers     | F-041   | High   |
| P1-007 | Restore from backup     | F-041   | High   |
| P1-011 | DiffEngine service      | F-042   | Medium |

---

## Phase 2: Security Features (67%)

### Covered Requirements

| ID     | Requirement              | Test Case                              | Status |
| ------ | ------------------------ | -------------------------------------- | ------ |
| P2-001 | kev_catalog table        | nvd-database.feature                   | ✅     |
| P2-004 | is_kev column            | kev-epss-intelligence.spec.ts          | ✅     |
| P2-005 | KEV badge component      | kev-epss-intelligence.spec.ts          | ✅     |
| P2-007 | epss columns             | kev-epss-intelligence.spec.ts          | ✅     |
| P2-008 | EPSS column in vuln list | kev-epss-intelligence.spec.ts          | ✅     |
| P2-009 | Risk prioritization sort | kev-epss-intelligence.spec.ts          | ✅     |
| P2-014 | FPF decisions → VEX      | fpf.spec.ts, fpf-comprehensive.spec.ts | ✅     |
| P2-015 | Hybrid scanner           | hybrid-scanner.feature                 | ✅     |
| P2-016 | Multi-provider scanning  | hybrid-scanner.feature                 | ✅     |
| P2-017 | API fallback             | hybrid-scanner.feature                 | ✅     |
| P2-020 | Unit tests               | tests/\*_/_.test.ts                    | ✅     |
| P2-021 | E2E tests                | e2e/critical-flows/\*.spec.ts          | ✅     |
| P2-022 | Audit logging            | audit-logging.feature                  | ✅     |
| P2-023 | Audit query filters      | audit-logging.feature                  | ✅     |

### Uncovered Requirements

| ID     | Requirement              | Finding | Risk     |
| ------ | ------------------------ | ------- | -------- |
| P2-002 | KevService daily sync    | F-033   | Critical |
| P2-003 | KEV sync in NVD workflow | F-033   | Critical |
| P2-006 | EpssService              | F-034   | Critical |
| P2-010 | VexGenerator service     | F-036   | High     |
| P2-011 | VexParser service        | F-036   | High     |
| P2-012 | VEX export               | F-036   | High     |
| P2-013 | VEX import               | F-036   | High     |
| P2-018 | ContainerScanner         | F-037   | Medium   |

---

## Phase 3: UX Excellence (56%)

### Covered Requirements

| ID     | Requirement               | Test Case                    | Status |
| ------ | ------------------------- | ---------------------------- | ------ |
| P3-005 | First-launch tour trigger | first-run-experience.spec.ts | ✅     |
| P3-006 | Help → Show Tour menu     | onboarding-tour.spec.ts      | ✅     |
| P3-007 | CommandPalette            | command-palette.spec.ts      | ✅     |
| P3-010 | Ctrl+Shift+P shortcut     | command-palette.spec.ts      | ✅     |
| P3-012 | DependencyGraph           | dependency-graph.spec.ts     | ✅     |
| P3-017 | Path analysis             | dependency-graph.spec.ts     | ✅     |
| P3-020 | DashboardEditor           | executive-dashboard.spec.ts  | ✅     |
| P3-024 | ReportGenerator           | export-dialog.spec.ts        | ✅     |
| P3-029 | Export → Executive Report | export-dialog.spec.ts        | ✅     |
| P3-030 | Unit tests                | Partial (path tests done)    | ✅     |
| P3-031 | E2E tests                 | e2e/features/\*.spec.ts      | ✅     |
| P3-032 | Accessibility audit       | visual-regression.spec.ts    | ✅     |
| P3-033 | Metrics calculator        | metrics-calculator.feature   | ✅     |
| P3-034 | Health score              | metrics-calculator.feature   | ✅     |
| P3-035 | Risk level                | metrics-calculator.feature   | ✅     |
| P3-036 | Trend analysis            | metrics-calculator.feature   | ✅     |
| P3-037 | Compliance metrics        | metrics-calculator.feature   | ✅     |
| P3-038 | Productivity metrics      | metrics-calculator.feature   | ✅     |

### Uncovered Requirements

| ID     | Requirement              | Finding          | Risk   |
| ------ | ------------------------ | ---------------- | ------ |
| P3-001 | Install Driver.js        | N/A (dependency) | -      |
| P3-002 | OnboardingTour component | F-031            | Medium |
| P3-003 | tourStore                | F-031            | Medium |
| P3-004 | Tour steps config        | F-031            | Medium |
| P3-008 | commandRegistry          | F-038            | Low    |
| P3-009 | Register app actions     | F-038            | Low    |
| P3-011 | Install Cytoscape.js     | N/A (dependency) | -      |
| P3-013 | Force-directed layout    | F-039            | Low    |
| P3-014 | Severity color coding    | F-039            | Low    |
| P3-015 | Zoom/pan controls        | F-039            | Medium |
| P3-016 | Node click → details     | F-039            | Medium |
| P3-018 | /project/:id/graph route | F-039            | Medium |
| P3-019 | layoutStore              | -                | Low    |
| P3-021 | Drag-and-drop widgets    | -                | Medium |
| P3-022 | Layout persistence       | -                | Medium |
| P3-023 | Preset templates         | -                | Low    |
| P3-025 | HTML report templates    | F-040            | Medium |
| P3-026 | PDF generation           | F-040            | Medium |
| P3-027 | Company logo upload      | F-040            | Low    |
| P3-028 | ReportPreview modal      | F-040            | Medium |

---

## Phase 4: Branding (35%)

### Covered Requirements

| ID     | Requirement        | Test Case                    | Status |
| ------ | ------------------ | ---------------------------- | ------ |
| P4-001 | App icons          | visual-regression.spec.ts    | ✅     |
| P4-002 | Splash screen      | first-run-experience.spec.ts | ✅     |
| P4-003 | About dialog       | navigation.spec.ts           | ✅     |
| P4-004 | Error boundary     | error-recovery.spec.ts       | ✅     |
| P4-005 | Skeleton loaders   | visual-regression.spec.ts    | ✅     |
| P4-006 | Empty states       | visual-regression.spec.ts    | ✅     |
| P4-007 | Bundle analysis    | Build process                | ✅     |
| P4-008 | Visual consistency | visual-regression.spec.ts    | ✅     |

### Uncovered Requirements

| ID     | Requirement         | Finding                     | Risk   |
| ------ | ------------------- | --------------------------- | ------ |
| P4-009 | Theme customization | -                           | Medium |
| P4-010 | Brand colors        | -                           | Low    |
| P4-011 | Logo placement      | -                           | Low    |
| P4-012 | Typography          | -                           | Low    |
| P4-013 | Icon set            | -                           | Low    |
| P4-014 | Animation system    | -                           | Low    |
| P4-015 | Loading states      | -                           | Medium |
| P4-016 | Toast notifications | notification-center.spec.ts | ✅     |
| P4-017 | Modal styling       | -                           | Low    |
| P4-018 | Table styling       | -                           | Low    |
| P4-019 | Form styling        | -                           | Low    |
| P4-020 | Button styling      | -                           | Low    |
| P4-021 | Card styling        | -                           | Low    |
| P4-022 | Badge styling       | -                           | Low    |
| P4-023 | Progress indicators | -                           | Medium |

---

## E2E Test Inventory

### Critical Flows (19 files)

| Test File                               | Tests | Requirements Covered      |
| --------------------------------------- | ----- | ------------------------- |
| create-project.spec.ts                  | 6     | Project CRUD, validation  |
| navigation.spec.ts                      | 9     | Navigation, routing, tabs |
| upload-sbom.spec.ts                     | 2     | SBOM upload dialog        |
| fpf.spec.ts                             | 2     | FPF navigation buttons    |
| fpf-comprehensive.spec.ts               | 12    | FPF full functionality    |
| offline-sync.spec.ts                    | 12    | Offline mode, sync        |
| first-run-experience.spec.ts            | 8     | Onboarding flow           |
| database-status.spec.ts                 | 6     | Database health UI        |
| database-settings.spec.ts               | 8     | Database configuration    |
| cve-database-sync.spec.ts               | 6     | CVE database sync         |
| vulnerability-details.spec.ts           | 10    | Vulnerability UI          |
| notification-center.spec.ts             | 6     | Notifications             |
| sbom-generator.spec.ts                  | 10    | SBOM generation           |
| error-recovery.spec.ts                  | 8     | Error handling            |
| settings.spec.ts                        | 10    | Settings UI               |
| component-vulnerabilities-popup.spec.ts | 4     | Vulnerability popup       |
| patch-information.spec.ts               | 6     | Patch info display        |
| simple-test.spec.ts                     | 1     | Smoke test                |
| bulk-actions.spec.ts                    | 4     | Bulk operations           |

### Features (11 files)

| Test File                     | Tests | Requirements Covered     |
| ----------------------------- | ----- | ------------------------ |
| search-page.spec.ts           | 8     | Search functionality     |
| command-palette.spec.ts       | 6     | Command palette          |
| dependency-graph.spec.ts      | 8     | Dependency visualization |
| executive-dashboard.spec.ts   | 10    | Executive metrics        |
| health-dashboard.spec.ts      | 6     | Health monitoring        |
| kev-epss-intelligence.spec.ts | 24    | KEV/EPSS features        |
| onboarding-tour.spec.ts       | 6     | Onboarding tour          |
| export-dialog.spec.ts         | 8     | Export functionality     |
| bulk-actions.spec.ts          | 4     | Bulk operations          |
| patch-information.spec.ts     | 6     | Patch information        |

### Workflows (3 files)

| Test File                       | Tests | Requirements Covered   |
| ------------------------------- | ----- | ---------------------- |
| vulnerability-lifecycle.spec.ts | 8     | Vulnerability workflow |
| project-management.spec.ts      | 6     | Project workflow       |
| security-assessment.spec.ts     | 8     | Assessment workflow    |

### Visual (1 file)

| Test File                 | Tests | Requirements Covered |
| ------------------------- | ----- | -------------------- |
| visual-regression.spec.ts | 12    | Visual snapshots     |

---

## Unit/Integration Test Inventory

| Test File              | Purpose                | Status |
| ---------------------- | ---------------------- | ------ |
| bdd-simple.test.ts     | BDD smoke test         | ✅     |
| apiIntegration.test.ts | API integration        | ✅     |
| ftsIntegration.test.ts | Full-text search       | ✅     |
| nvdIntegration.test.ts | NVD operations         | ✅     |
| performance.test.ts    | Performance benchmarks | ✅     |
| bulkImport.test.ts     | Bulk import            | ✅     |
| junitExporter.test.ts  | JUnit export           | ✅     |
| parser.test.ts         | SBOM parsing           | ✅     |
| sarifExporter.test.ts  | SARIF export           | ✅     |
| scanCommand.test.ts    | CLI scan command       | ✅     |

---

## Recommended Actions

### Critical Priority (Phase 2)

1. **KEV Sync Tests**

   ```typescript
   // e2e/critical-flows/kev-sync.spec.ts
   test('should sync KEV catalog on startup', async ({ page }) => {
     // Verify KEV data loaded from bundled baseline
     // Test manual sync button
     // Verify daily auto-sync
   })
   ```

2. **EPSS API Tests**

   ```typescript
   // e2e/critical-flows/epss-api.spec.ts
   test('should fetch EPSS scores from API', async ({ page }) => {
     // Test on-demand EPSS lookup
     // Verify caching (24h TTL)
     // Test fallback when API unavailable
   })
   ```

3. **VEX Roundtrip Tests**
   ```typescript
   // e2e/critical-flows/vex-roundtrip.spec.ts
   test('should generate and parse VEX documents', async ({ page }) => {
     // Generate VEX from FPF decisions
     // Import VEX from file
     // Verify status propagation
   })
   ```

### High Priority (Phase 1 & 4)

4. **Backup/Restore Tests**

   ```typescript
   // e2e/critical-flows/backup-restore.spec.ts
   test('should backup and restore database', async ({ page }) => {
     // Create backup
     // Verify backup file
     // Restore from backup
   })
   ```

5. **SBOM Diff Tests**
   ```typescript
   // e2e/features/sbom-diff.spec.ts
   test('should detect component changes', async ({ page }) => {
     // Upload SBOM v1
     // Upload SBOM v2
     // Verify diff detection
   })
   ```

### Medium Priority (Phase 3)

6. **Layout Persistence Tests**
7. **Report Generation Tests**
8. **Accessibility Audit Tests**

---

## Traceability Annotation Format

To improve future traceability, add annotations to test files:

```typescript
/**
 * @requirement P2-005
 * @test-case TC-KEV-001
 * @coverage full
 */
test('should display KEV badge on exploited vulnerabilities', async ({ page }) => {
  // Test implementation
})
```

### In Feature Files

```gherkin
@requirement P2-005 @coverage full
Scenario: Display KEV badge for exploited vulnerabilities
  Given a vulnerability with KEV status
  When I view the vulnerability list
  Then I should see a KEV badge
```

---

## Gap Analysis by Category

| Category           | Total | Covered | Coverage | Priority |
| ------------------ | ----- | ------- | -------- | -------- |
| Database           | 12    | 11      | 92%      | Low      |
| Scanning           | 8     | 7       | 88%      | Low      |
| Export             | 6     | 5       | 83%      | Low      |
| UI Components      | 18    | 10      | 56%      | Medium   |
| Intelligence       | 8     | 4       | 50%      | Critical |
| Compliance         | 6     | 3       | 50%      | High     |
| Backup/Restore     | 4     | 0       | 0%       | High     |
| Container Scanning | 4     | 0       | 0%       | Medium   |

---

**Document Status:** Updated
**Next Review:** After Phase 4 completion
**Owner:** QA Team
