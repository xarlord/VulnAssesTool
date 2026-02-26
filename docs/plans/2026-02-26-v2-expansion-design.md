# VulnAssesTool v2.0 Expansion Plan - Design Document

**Created:** 2026-02-26
**Status:** Draft
**Author:** DevFlow Enforcer
**Target Release:** v2.0.0 (Q2 2026)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Performance & Scalability](#2-performance--scalability)
3. [New Cybersecurity Features](#3-new-cybersecurity-features)
4. [UI/UX Improvements](#4-uiux-improvements)
5. [Professional Branding & Naming](#5-professional-branding--naming)
6. [Application Stability](#6-application-stability)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Phase 1: Foundation Specification](#8-phase-1-foundation-specification)
9. [Phase 2: Security Features Specification](#9-phase-2-security-features-specification)
10. [Phase 3: UX Excellence Specification](#10-phase-3-ux-excellence-specification)
11. [Phase 4: Branding & Launch Specification](#11-phase-4-branding--launch-specification)
12. [Findings & Deviation Review](#12-findings--deviation-review)

---

## 1. Executive Summary

### Vision

Transform VulnAssesTool from a desktop vulnerability scanner into an enterprise-grade Software Supply Chain Security platform that competes with industry leaders like Snyk, Trivy, and Sonatype.

### Strategic Goals

1. **Performance at Scale** - Support 100,000+ components with sub-second search
2. **Industry-Leading Features** - VEX, Container Scanning, Exploit Intelligence
3. **Professional UX** - Intuitive interface matching modern SaaS tools
4. **Market-Ready Branding** - Memorable name, professional identity
5. **Enterprise Reliability** - 99.9% uptime, graceful degradation

### Success Metrics

| Metric | Target |
|--------|--------|
| Scan time (10K components) | <30s (currently ~2min) |
| User onboarding | <5min to first vulnerability report |
| Test coverage | 95%+ maintained |
| Crash rate | Zero data loss scenarios |
| Market positioning | Feature parity with top 3 open-source SBOM tools |

### Target Release

**v2.0.0 GA:** Q2 2026 (~5 months)

---

## 2. Performance & Scalability

### Current State

- SQLite handles ~2,000 CVEs adequately
- Struggles with large SBOMs (50,000+ components)
- Scan times average 2+ minutes for enterprise-scale projects

### Proposed Improvements

#### 2.1 Incremental SBOM Diffing

| Aspect | Detail |
|--------|--------|
| **Problem** | Full rescans on every SBOM update wastes time |
| **Solution** | Store component hash, only scan changed/added components |
| **Implementation** | Add `component_hash` column, implement diff algorithm |
| **Expected Impact** | 80% reduction in rescan time for minor updates |

#### 2.2 Smart CVE Caching Layer

| Aspect | Detail |
|--------|--------|
| **Problem** | Repeated API calls for same CVEs across projects |
| **Solution** | Global CVE cache with configurable TTL (default: 24h) |
| **Implementation** | LRU cache in SQLite with `last_accessed` timestamp |
| **Expected Impact** | 60% reduction in external API calls |

#### 2.3 Parallel Multi-Provider Scanning

| Aspect | Detail |
|--------|--------|
| **Problem** | Sequential NVD → OSV scanning is slow |
| **Solution** | Scan all providers concurrently, merge results |
| **Implementation** | Promise.all with rate-limited parallel execution |
| **Expected Impact** | 50% faster scans with 3+ providers |

#### 2.4 Background Job Queue

| Aspect | Detail |
|--------|--------|
| **Problem** | UI freezes during large scans |
| **Solution** | Move scanning to background workers with progress updates |
| **Implementation** | Electron worker threads with job queue |
| **Expected Impact** | Responsive UI during any scan operation |

---

## 3. New Cybersecurity Features

### Current State

- Basic CVE scanning with NVD/OSV
- No exploit intelligence
- No container support
- Limited risk prioritization

### Proposed Features

#### 3.1 Container Image Scanning

| Aspect | Detail |
|--------|--------|
| **Problem** | Organizations need to scan Docker images, not just SBOMs |
| **Solution** | Integrate container layer analysis with vulnerability matching |
| **Implementation** | Skopeo/containerd integration, parse container manifests |
| **Deliverable** | `Scan Container Image` button in project view |
| **Priority** | High |

#### 3.2 VEX (Vulnerability Exploitability eXchange)

| Aspect | Detail |
|--------|--------|
| **Problem** | No way to communicate "we're not affected" to stakeholders |
| **Solution** | Generate/consume CycloneDX VEX documents |
| **Implementation** | VEX generation from FPF decisions, VEX import for suppliers |
| **Deliverable** | Export → VEX Document, Import VEX in project |
| **Priority** | High |

#### 3.3 CISA KEV & EPSS Integration

| Aspect | Detail |
|--------|--------|
| **Problem** | All CVEs treated equally, no exploit context |
| **Solution** | Overlay CISA Known Exploited Vulnerabilities + EPSS scores |
| **Implementation** | Daily KEV catalog sync, EPSS API integration |
| **Deliverable** | KEV badge, EPSS percentage column |
| **Priority** | Critical |

#### 3.4 SBOM Attestation with Sigstore (Deferred to v2.1.0)

| Aspect | Detail |
|--------|--------|
| **Problem** | No proof of SBOM authenticity |
| **Solution** | Sign SBOMs with Sigstore/cosign for supply chain integrity |
| **Implementation** | cosign integration, keyless signing with OIDC |
| **Deliverable** | Sign/Verify buttons in SBOM management |
| **Priority** | Medium (deferred) |

---

## 4. UI/UX Improvements

### Current State

- Functional but utilitarian interface
- Limited visual hierarchy
- No customization
- Basic accessibility

### Proposed Improvements

#### 4.1 Interactive Dependency Graph

| Aspect | Detail |
|--------|--------|
| **Problem** | Flat list of components doesn't show relationships |
| **Solution** | Visual graph with zoom, pan, filter, and path highlighting |
| **Implementation** | Cytoscape.js force-directed graph, lazy-loaded |
| **Deliverable** | `/project/:id/graph` route |
| **Priority** | High |

#### 4.2 Command Palette (Ctrl+Shift+P)

| Aspect | Detail |
|--------|--------|
| **Problem** | Power users navigate slowly with mouse |
| **Solution** | Keyboard-first command palette for all actions |
| **Implementation** | Fuzzy search for projects, CVEs, actions, settings |
| **Deliverable** | Global command palette component |
| **Priority** | Medium |

#### 4.3 Customizable Dashboard

| Aspect | Detail |
|--------|--------|
| **Problem** | Fixed layout doesn't suit all workflows |
| **Solution** | Drag-and-drop widget system with persistence |
| **Implementation** | Widget library, LocalStorage persistence, preset templates |
| **Deliverable** | Edit mode toggle on Dashboard page |
| **Priority** | Medium |

#### 4.4 Guided Onboarding Tour

| Aspect | Detail |
|--------|--------|
| **Problem** | New users don't discover all features |
| **Solution** | Interactive walkthrough for first-time users |
| **Implementation** | Driver.js, 5-step tour, skip/replay options |
| **Deliverable** | First-launch tour, Help → Show Tour menu |
| **Priority** | High |

#### 4.5 Professional Report Export

| Aspect | Detail |
|--------|--------|
| **Problem** | Export options are basic, not stakeholder-ready |
| **Solution** | Branded PDF/HTML reports with executive summary |
| **Implementation** | Electron printToPDF, HTML templates, logo upload |
| **Deliverable** | Export → Executive Report (PDF/HTML) |
| **Priority** | High |

---

## 5. Professional Branding & Naming

### Current State

- "VulnAssesTool" is functional but not memorable
- No logo
- No marketing presence
- Documentation scattered

### Proposed Improvements

#### 5.1 Product Rename Options

| Option | Rationale | Recommendation |
|--------|-----------|----------------|
| **VulnShield** | Strong, protective imagery | Primary choice |
| SecureStack | Emphasizes full-stack security | Alternative |
| D-Fence SBOM Manager | Leverage existing brand | Backup |

#### 5.2 Visual Identity System

| Element | Specification |
|---------|---------------|
| **Logo** | Shield/lock icon with gradient (blue → purple → cyan) |
| **Typography** | Inter for UI, JetBrains Mono for code/IDs |
| **Primary Color** | #3B82F6 (Blue) |
| **Critical** | #DC2626 (Red) |
| **High** | #F97316 (Orange) |
| **Medium** | #EAB308 (Yellow) |
| **Low** | #22C55E (Green) |
| **Icon Set** | Lucide icons |

#### 5.3 Marketing Website

- **Platform:** Vercel + Next.js
- **Content:** Hero, Features, Comparison, Pricing, Docs link
- **SEO Target:** "SBOM vulnerability scanner", "CycloneDX scanner"

#### 5.4 Documentation Portal

- **Platform:** Docusaurus
- **Structure:** Getting Started, User Guide, API Reference, Integrations, Changelog
- **Search:** Algolia DocSearch

#### 5.5 CLI Tool (v2.1.0)

```
vulnshield <command> [options]

Commands:
  scan <file>           Scan SBOM file for vulnerabilities
  report <file>         Generate vulnerability report
  sync                  Sync CVE database with NVD/OSV
  config <key> [value]  Get/set configuration
  version               Show version information

Options:
  --format, -f    Output format (json, table, sarif)
  --severity, -s  Minimum severity to report
  --output, -o    Output file path
```

---

## 6. Application Stability

### Current State

- Good test coverage (95%)
- Limited error recovery
- No offline support
- Basic backup capabilities

### Proposed Improvements

#### 6.1 Error Boundary with Recovery

| Aspect | Detail |
|--------|--------|
| **Problem** | Single error can crash entire app, losing user work |
| **Solution** | React Error Boundaries with retry and state preservation |
| **Implementation** | Global + component-level boundaries, "Retry" button |
| **Priority** | Critical |

#### 6.2 Offline Mode Support

| Aspect | Detail |
|--------|--------|
| **Problem** | App unusable without internet (API calls fail) |
| **Solution** | Full offline functionality with sync-on-reconnect |
| **Implementation** | Queue API requests, show "Offline" indicator, auto-sync |
| **Priority** | High |

#### 6.3 Automatic Database Backups

| Aspect | Detail |
|--------|--------|
| **Problem** | Database corruption means total data loss |
| **Solution** | Scheduled backups with point-in-time recovery |
| **Implementation** | SQLite VACUUM INTO, configurable schedule, one-click restore |
| **Priority** | High |

#### 6.4 Health Check Dashboard

| Aspect | Detail |
|--------|--------|
| **Problem** | Users can't diagnose why things aren't working |
| **Solution** | Self-diagnostic page showing all system status |
| **Implementation** | DB integrity check, API connectivity test, disk space check |
| **Priority** | Medium |

#### 6.5 Telemetry & Crash Reporting (Opt-in)

| Aspect | Detail |
|--------|--------|
| **Problem** | No visibility into real-world issues |
| **Solution** | Optional anonymous usage analytics |
| **Implementation** | PostHog (privacy-focused), clear opt-in dialog |
| **Priority** | Low |

---

## 7. Implementation Roadmap

### Release Strategy

4 phases over 5 months, each delivering incremental value.

### Phase Overview

| Phase | Theme | Duration | Milestone |
|-------|-------|----------|-----------|
| 1 | Foundation | 4.5 weeks | v2.0.0-alpha |
| 2 | Security Features | 4.5 weeks | v2.0.0-beta |
| 3 | UX Excellence | 6 weeks | v2.0.0-rc1 |
| 4 | Branding & Launch | 4.5 weeks | v2.0.0 GA |

### Total Effort

| Phase | Days | Weeks |
|-------|------|-------|
| Phase 1 | 22 | 4.5 |
| Phase 2 | 22 | 4.5 |
| Phase 3 | 29 | 6 |
| Phase 4 | 21 | 4.5 |
| **Total** | **94** | **~19** |

---

## 8. Phase 1: Foundation Specification

### 8.1 Product Specification

| Aspect | Specification |
|--------|---------------|
| **Objective** | Eliminate crash scenarios and achieve 50% performance improvement |
| **Target User** | All users |
| **User Stories** | 1. Never lose work due to crashes <br> 2. Rescans complete in half the time <br> 3. Work offline without interruption |
| **Success Metrics** | Zero crash reports, <30s rescan time, 100% offline functionality |
| **Branch** | `feature/v2-phase1-foundation` |

### 8.2 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron Main Process                    │
├─────────────────┬─────────────────┬─────────────────────────┤
│  Error Recovery │  Backup Service │   Cache Manager         │
│  - Boundaries   │  - Scheduler    │   - LRU Cache           │
│  - State Snap   │  - Restore      │   - TTL Management      │
├─────────────────┴─────────────────┴─────────────────────────┤
│                     IPC Bridge                               │
├─────────────────────────────────────────────────────────────┤
│                   Renderer Process                           │
├─────────────────┬─────────────────┬─────────────────────────┤
│  ErrorBoundary  │  Offline Queue  │   Diff Engine           │
│  - Fallback UI  │  - Request Q    │   - Hash Compare        │
│  - Retry Logic  │  - Sync Manager │   - Delta Compute       │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### 8.3 New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ErrorBoundary.tsx` | `src/renderer/components/` | Global error handling |
| `BackupService.ts` | `electron/services/` | Scheduled backups |
| `CacheManager.ts` | `electron/services/` | CVE caching layer |
| `DiffEngine.ts` | `src/renderer/lib/services/` | SBOM diffing |
| `OfflineQueue.ts` | `src/renderer/lib/services/` | Request queuing |

### 8.4 Impact Analysis

| Area | Current | After Phase 1 | Impact |
|------|---------|---------------|--------|
| Crash Rate | ~2-3/month | 0 | Critical |
| Rescan Time (10K) | ~2 min | ~30 sec | High |
| Offline Capability | Partial | Full | High |
| Disk Usage | ~500MB | ~550MB | Low |
| Memory Usage | ~300MB | ~350MB | Low |

### 8.5 Testing Specification

| Test Type | Coverage | Key Tests |
|-----------|----------|-----------|
| Unit Tests | 95% | Cache TTL, Diff algorithm, Backup rotation |
| Integration | 80% | Error recovery, Offline → Online sync |
| E2E | 5 scenarios | Crash recovery, Offline scan, Backup restore |
| Performance | 3 benchmarks | 10K scan, 100K cache hit rate |

### 8.6 Atomic Task List

| ID | Task | Effort | Depends On |
|----|------|--------|------------|
| P1-001 | Create ErrorBoundary component with fallback UI | 0.5d | - |
| P1-002 | Add global error boundary to App.tsx | 0.5d | P1-001 |
| P1-003 | Implement retry mechanism in ErrorBoundary | 1d | P1-001 |
| P1-004 | Create BackupService with scheduler | 1d | - |
| P1-005 | Add backup IPC handlers | 0.5d | P1-004 |
| P1-006 | Create Backup UI in Settings | 1d | P1-005 |
| P1-007 | Implement restore from backup | 0.5d | P1-004 |
| P1-008 | Create CacheManager service | 1d | - |
| P1-009 | Integrate cache with CVE lookups | 1d | P1-008 |
| P1-010 | Add cache configuration UI | 0.5d | P1-009 |
| P1-011 | Create DiffEngine service | 2d | - |
| P1-012 | Add component_hash to database schema | 0.5d | - |
| P1-013 | Integrate diff into scan workflow | 2d | P1-011, P1-012 |
| P1-014 | Create OfflineQueue service | 2d | - |
| P1-015 | Add offline indicator to header | 0.5d | P1-014 |
| P1-016 | Implement sync-on-reconnect | 1d | P1-014 |
| P1-017 | Write unit tests (all components) | 2d | All |
| P1-018 | Write E2E tests | 1d | All |
| P1-019 | Performance benchmarking | 1d | All |

**Total: 18 days (+20% buffer = 22 days)**

---

## 9. Phase 2: Security Features Specification

### 9.1 Product Specification

| Aspect | Specification |
|--------|---------------|
| **Objective** | Add industry-standard security intelligence and compliance features |
| **Target User** | Security analysts, compliance officers, DevOps engineers |
| **User Stories** | 1. See which CVEs are actively exploited <br> 2. Generate VEX documents <br> 3. Scan container images |
| **Success Metrics** | KEV visible on 100% of matching CVEs, VEX export working |
| **Branch** | `feature/v2-phase2-security` |

### 9.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     External Integrations                        │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  CISA KEV API   │  EPSS API       │   Container Runtime         │
│  (Daily Sync)   │  (On-Demand)    │   (Docker/Podman)           │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Security Intelligence Layer                   │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  KEV Service    │  EPSS Service   │   Container Scanner         │
├─────────────────┴─────────────────┴─────────────────────────────┤
│                      VEX Engine                                  │
├─────────────────────────────────────────────────────────────────┤
│  VEX Generator          │  VEX Parser                           │
└─────────────────────────┴───────────────────────────────────────┘
```

### 9.3 New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `KevService.ts` | `electron/services/intelligence/` | CISA KEV sync |
| `EpssService.ts` | `electron/services/intelligence/` | EPSS scores |
| `ContainerScanner.ts` | `electron/services/scanner/` | Container analysis |
| `VexGenerator.ts` | `src/renderer/lib/services/vex/` | VEX generation |
| `VexParser.ts` | `src/renderer/lib/services/vex/` | VEX parsing |

### 9.4 Database Changes

| Table | New Columns |
|-------|-------------|
| `cves` | `is_kev BOOLEAN`, `epss_score REAL`, `epss_percentile REAL` |
| `projects` | `vex_document JSON` |
| NEW: `kev_catalog` | `cve_id, vendor, product, vuln_type, date_added` |

### 9.5 Atomic Task List

| ID | Task | Effort | Depends On |
|----|------|--------|------------|
| P2-001 | Create kev_catalog database table | 0.5d | - |
| P2-002 | Implement KevService with daily sync | 1d | P2-001 |
| P2-003 | Add KEV sync to NVD sync workflow | 0.5d | P2-002 |
| P2-004 | Add is_kev column to cves table | 0.5d | - |
| P2-005 | Create KEV badge component | 0.5d | P2-004 |
| P2-006 | Implement EpssService | 1d | - |
| P2-007 | Add epss columns to cves table | 0.5d | - |
| P2-008 | Create EPSS column in vulnerability list | 0.5d | P2-006, P2-007 |
| P2-009 | Implement risk prioritization sort | 0.5d | P2-005, P2-008 |
| P2-010 | Create VexGenerator service | 1.5d | - |
| P2-011 | Create VexParser service | 1d | - |
| P2-012 | Add VEX export to project actions | 0.5d | P2-010 |
| P2-013 | Add VEX import to project | 0.5d | P2-011 |
| P2-014 | Integrate FPF decisions into VEX | 1d | P2-010 |
| P2-015 | Create ContainerScanner service | 2d | - |
| P2-016 | Add container scan IPC handlers | 1d | P2-015 |
| P2-017 | Create container scan UI flow | 1d | P2-016 |
| P2-018 | Add Docker/Podman detection | 0.5d | P2-015 |
| P2-019 | Add API fallback/circuit breaker | 1d | - |
| P2-020 | Write unit tests | 2d | All |
| P2-021 | Write E2E tests | 1.5d | All |

**Total: 18 days (+20% buffer = 22 days)**

---

## 10. Phase 3: UX Excellence Specification

### 10.1 Product Specification

| Aspect | Specification |
|--------|---------------|
| **Objective** | Achieve best-in-class user experience |
| **Target User** | All users |
| **User Stories** | 1. Complete first scan in <5 minutes <br> 2. Navigate entirely with keyboard <br> 3. Receive professional PDF reports |
| **Success Metrics** | <5min onboarding, 90% keyboard task completion |
| **Branch** | `feature/v2-phase3-ux` |

### 10.2 New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `OnboardingTour.tsx` | `src/renderer/components/onboarding/` | Guided flow |
| `CommandPalette.tsx` | `src/renderer/components/` | Keyboard navigation |
| `DependencyGraph.tsx` | `src/renderer/components/graph/` | Visualization |
| `DashboardEditor.tsx` | `src/renderer/components/dashboard/` | Widget editor |
| `ReportGenerator.ts` | `src/renderer/lib/services/reports/` | PDF/HTML reports |

### 10.3 New Routes

| Route | Component | Purpose |
|-------|-----------|---------|
| `/project/:id/graph` | `DependencyGraph.tsx` | Interactive graph |
| `/reports` | `ReportsPage.tsx` | Report generation |

### 10.4 Atomic Task List

| ID | Task | Effort | Depends On |
|----|------|--------|------------|
| P3-001 | Install Driver.js dependency | 0.25d | - |
| P3-002 | Create OnboardingTour component | 1d | P3-001 |
| P3-003 | Define tour steps configuration | 0.5d | P3-002 |
| P3-004 | Add first-launch tour trigger | 0.25d | P3-002 |
| P3-005 | Create tourStore for progress | 0.5d | P3-002 |
| P3-006 | Add Help → Show Tour menu | 0.25d | P3-002 |
| P3-007 | Create CommandPalette component | 1.5d | - |
| P3-008 | Create commandRegistry service | 1d | - |
| P3-009 | Register all app actions | 1d | P3-008 |
| P3-010 | Add Ctrl+Shift+P global shortcut | 0.25d | P3-007 |
| P3-011 | Install Cytoscape.js | 0.25d | - |
| P3-012 | Create DependencyGraph component | 2d | P3-011 |
| P3-013 | Implement force-directed layout | 1d | P3-012 |
| P3-014 | Add severity color coding | 0.5d | P3-012 |
| P3-015 | Implement zoom/pan controls | 0.5d | P3-012 |
| P3-016 | Add node click → details | 0.5d | P3-012 |
| P3-017 | Add path analysis feature | 1d | P3-012 |
| P3-018 | Create /project/:id/graph route | 0.25d | P3-012 |
| P3-019 | Create layoutStore | 0.5d | - |
| P3-020 | Create DashboardEditor component | 2d | P3-019 |
| P3-021 | Implement drag-and-drop widgets | 1d | P3-020 |
| P3-022 | Add layout persistence | 0.5d | P3-020 |
| P3-023 | Create preset templates | 0.5d | P3-020 |
| P3-024 | Create ReportGenerator service | 1.5d | - |
| P3-025 | Design HTML report templates | 1d | - |
| P3-026 | Implement PDF generation | 1.5d | P3-024, P3-025 |
| P3-027 | Add company logo upload | 0.5d | P3-024 |
| P3-028 | Create ReportPreview modal | 1d | P3-024 |
| P3-029 | Add Export → Executive Report | 0.5d | P3-026 |
| P3-030 | Write unit tests | 2d | All |
| P3-031 | Write E2E tests | 1.5d | All |
| P3-032 | Accessibility audit | 1d | All |

**Total: 24 days (+20% buffer = 29 days)**

---

## 11. Phase 4: Branding & Launch Specification

### 11.1 Product Specification

| Aspect | Specification |
|--------|---------------|
| **Objective** | Transform into market-ready product |
| **Target User** | New users, enterprise evaluators |
| **User Stories** | 1. Understand product from website <br> 2. Find comprehensive documentation |
| **Success Metrics** | Website conversion >5%, docs satisfaction >4.5/5 |
| **Branch** | `feature/v2-phase4-branding` |

### 11.2 Scope (Revised)

**Included in v2.0.0:**
- Product rename & logo
- Documentation portal (Docusaurus)
- Marketing website
- Opt-in telemetry

**Deferred to v2.1.0:**
- CLI tool (vulnshield-cli)
- Sigstore attestation

### 11.3 Atomic Task List

| ID | Task | Effort | Depends On |
|----|------|--------|------------|
| **Branding** | | | |
| P4-001 | Finalize product name | 0.5d | - |
| P4-002 | Design logo | 1d | P4-001 |
| P4-003 | Create logo variants | 0.5d | P4-002 |
| P4-004 | Update app branding | 1d | P4-001, P4-002 |
| P4-005 | Update package.json | 0.25d | P4-001 |
| **Documentation** | | | |
| P4-006 | Create docs repo | 0.25d | P4-001 |
| P4-007 | Setup Docusaurus | 0.5d | P4-006 |
| P4-008 | Write Getting Started | 1d | P4-007 |
| P4-009 | Write User Guide | 2d | P4-007 |
| P4-010 | Write API Reference | 1d | P4-007 |
| P4-011 | Create integration guides | 1d | P4-007 |
| P4-012 | Add Algolia DocSearch | 0.5d | P4-007 |
| P4-013 | Deploy docs | 0.25d | P4-007 |
| **Website** | | | |
| P4-014 | Create website repo | 0.25d | P4-001 |
| P4-015 | Design landing page | 1d | P4-014 |
| P4-016 | Implement feature showcase | 1d | P4-015 |
| P4-017 | Create comparison table | 0.5d | P4-015 |
| P4-018 | Add download links | 0.25d | P4-015 |
| P4-019 | Deploy website | 0.25d | P4-015 |
| **Telemetry** | | | |
| P4-020 | Setup PostHog | 0.5d | - |
| P4-021 | Add opt-in dialog | 0.5d | P4-020 |
| P4-022 | Implement event tracking | 1d | P4-020 |
| P4-023 | Add privacy settings | 0.5d | P4-020 |

**Total: 17 days (+20% buffer = 21 days)**

---

## 12. Findings & Deviation Review

### 12.1 Vision Alignment

| Criteria | Assessment | Status |
|----------|------------|--------|
| Performance at Scale | Phases 1-2 address | ✅ Aligned |
| Industry Features | Phase 2 covers | ✅ Aligned |
| Professional UX | Phase 3 comprehensive | ✅ Aligned |
| Market-Ready Branding | Phase 4 complete | ✅ Aligned |
| Enterprise Reliability | Phase 1 foundation | ✅ Aligned |

### 12.2 Resolved Findings

| ID | Description | Resolution |
|----|-------------|------------|
| FINDING-002 | Cytoscape.js bundle size | Lazy-load graph component |
| FINDING-003 | Puppeteer PDF size | Use Electron printToPDF |
| FINDING-006 | Effort estimation | Add 20% buffer |
| FINDING-008 | Shortcut conflicts | Change to Ctrl+Shift+P |

### 12.3 Scope Changes

| Item | Original | Revised | Rationale |
|------|----------|---------|-----------|
| CLI Tool | Phase 4 | v2.1.0 | Focus desktop excellence |
| Sigstore | Phase 2 | v2.1.0 | Complexity underestimated |

### 12.4 Open Actions

| ID | Action | Owner | Due |
|----|--------|-------|-----|
| ACTION-001 | Approve revised timeline | Product | Before start |
| ACTION-002 | Confirm scope deferrals | Product | Before start |
| ACTION-003 | Reserve npm package name | DevOps | Before v2.1.0 |
| ACTION-004 | Register domain | DevOps | Before Phase 4 |

### 12.5 Final Timeline

| Phase | Days | Weeks | Target |
|-------|------|-------|--------|
| 1 | 22 | 4.5 | Month 1-2 |
| 2 | 22 | 4.5 | Month 2-3 |
| 3 | 29 | 6 | Month 3-5 |
| 4 | 21 | 4.5 | Month 5-6 |
| **v2.0.0 Total** | **94** | **~19** | **~5 months** |
| v2.1.0 (CLI + Sigstore) | 22 | 4.5 | Month 7 |

---

## Appendix A: CLI Command Reference (v2.1.0)

```
vulnshield <command> [options]

Commands:
  scan <file>           Scan SBOM file for vulnerabilities
  report <file>         Generate vulnerability report
  sync                  Sync CVE database with NVD/OSV
  config <key> [value]  Get/set configuration
  version               Show version information
  help                  Show help

Options:
  --format, -f    Output format (json, table, sarif)
  --severity, -s  Minimum severity to report (low, medium, high, critical)
  --output, -o    Output file path
  --quiet, -q     Suppress non-essential output
  --no-cache      Disable cache for this operation

Exit Codes:
  0 - No vulnerabilities found
  1 - Vulnerabilities found (above threshold)
  2 - Error during execution
  3 - Invalid input/file not found
```

---

## Appendix B: Branch Strategy

| Phase | Branch Name | Merge To |
|-------|-------------|----------|
| Phase 1 | `feature/v2-phase1-foundation` | `develop` |
| Phase 2 | `feature/v2-phase2-security` | `develop` |
| Phase 3 | `feature/v2-phase3-ux` | `develop` |
| Phase 4 | `feature/v2-phase4-branding` | `develop` |
| Release | `develop` | `master` → tag v2.0.0 |

Each phase requires:
- PR with code review
- All tests passing
- Documentation updated
- Findings resolved

---

**Document Status:** Complete
**Next Step:** Review & Approval
**Approval Required:** Product Owner
