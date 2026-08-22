# VulnAssessTool - Product Requirements Document (PRD)

**Version:** 1.2
**Last Updated:** 2026-08-22
**Product Owner:** VulnAssessTool Development Team
**Status:** Active — reflects the shipped v2.0 architecture. VulnAssessTool was migrated from an
Electron desktop app to a self-hosted **Express (Node) + React** web application (commit `acd0518`);
this PRD has been updated to that reality.

---

## Executive Summary

VulnAssessTool is a web-based vulnerability assessment application designed for security teams, DevOps engineers, and compliance officers to analyze Software Bill of Materials (SBOM) for security vulnerabilities. The application provides comprehensive vulnerability scanning, health monitoring, audit logging, and reporting capabilities through an intuitive browser interface backed by an Express (Node) server and a React frontend.

### Product Vision

To become the industry-standard open-source web application for SBOM vulnerability assessment, enabling organizations to proactively manage supply chain security through comprehensive scanning, monitoring, and reporting capabilities.

---

## Table of Contents

1. [Product Overview](#product-overview)
2. [Target Users & Use Cases](#target-users--use-cases)
3. [Functional Requirements](#functional-requirements) — FR-01 … FR-24 (implemented)
4. [Non-Functional Requirements](#non-functional-requirements)
5. [Planned Functional Requirements](#planned-functional-requirements) — FR-25 … FR-38, NFR-09 (**not implemented**)
6. [Security & Compliance](#security--compliance)
7. [Success Criteria & Metrics](#success-criteria--metrics)
8. [Deployment Requirements](#deployment-requirements)
9. [Roadmap & Future Enhancements](#roadmap--future-enhancements)

---

## Product Overview

### Problem Statement

Modern software development relies heavily on open-source and third-party components, creating an expanded attack surface through the software supply chain. Organizations face challenges in:

1. **Visibility:** Tracking all components across their software portfolio
2. **Vulnerability Management:** Identifying and prioritizing vulnerabilities in a timely manner
3. **Compliance:** Meeting regulatory requirements for supply chain transparency
4. **Remediation:** Understanding fix availability and remediation steps
5. **Audit Trail:** Maintaining comprehensive records of security assessments

### Solution

VulnAssessTool provides a self-hosted, offline-capable web application that:

- Imports and parses standard SBOM formats (CycloneDX, SPDX)
- Matches components against local NVD database for fast vulnerability lookup
- Provides comprehensive vulnerability details including CVSS scores, CWEs, and patch information
- Offers health scoring and analytics for portfolio management
- Maintains full audit logs for compliance
- Generates exportable reports in multiple formats

### Technology Stack

| Layer              | Technology              | Version |
| ------------------ | ----------------------- | ------- |
| Backend Framework  | Express (Node)          | 5.2.1   |
| Frontend Framework | React                   | 19.2.0  |
| Language           | TypeScript              | ~5.9.3  |
| Build Tool         | Vite                    | 7.2.4   |
| State Management   | Zustand                 | 5.0.11  |
| Styling            | Tailwind CSS            | 3.4.19  |
| Database (Local)   | SQLite (better-sqlite3) | 12.6.2  |
| Database (Browser) | sql.js                  | 1.12.0  |
| Testing (Unit)     | Vitest                  | 4.0.18  |
| Testing (E2E)      | Playwright              | 1.58.1  |
| Testing (BDD)      | Cucumber.js             | 12.6.0  |
| PDF Generation     | jsPDF                   | 4.1.0   |
| Charts             | Recharts                | 3.7.0   |

---

## Target Users & Use Cases

### Primary Users

| User Type               | Role                                                    | Goals                                                                                                          | Pain Points                                                              |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Security Analyst**    | Conducts vulnerability assessments and security reviews | Needs fast, accurate vulnerability data; requires detailed CVE information; manages remediation prioritization | Slow API-based tools; information overload; poor prioritization guidance |
| **DevOps Engineer**     | Integrates security into CI/CD pipelines                | Needs automated scanning; quick status indicators; patch availability information                              | Manual processes; lack of automation; unclear remediation paths          |
| **Compliance Officer**  | Ensures regulatory and policy compliance                | Requires audit trails; needs reporting; must demonstrate due diligence                                         | Incomplete records; manual report generation; missing audit evidence     |
| **Engineering Manager** | Oversees security posture across projects               | Needs portfolio visibility; trend analysis; resource allocation insights                                       | Lack of visibility; inability to compare projects; no trending data      |
| **Software Developer**  | Uses secure components in development                   | Wants quick vulnerability checks; needs clear fix guidance; prefers offline operation                          | API rate limits; unclear fix instructions; network dependency issues     |

### Secondary Users

- **IT Auditors:** Review security practices and compliance documentation
- **CISO/Chief Information Security Officer:** Requires executive-level dashboards and risk metrics
- **Open Source Maintainers:** Validates package security before releases

### User Personas

#### Persona 1: Sarah - Security Analyst

- **Role:** Senior Security Analyst at a mid-sized fintech company
- **Experience:** 7 years in application security, familiar with OWASP standards
- **Goals:**
  - Assess 50+ software projects weekly
  - Prioritize critical vulnerabilities for immediate remediation
  - Generate compliance reports for auditors
- **Frustrations:**
  - Current tools are slow and web-based
  - Difficult to demonstrate compliance during audits
  - Limited offline capability

#### Persona 2: Marcus - DevOps Engineer

- **Role:** DevOps Lead at a SaaS company
- **Experience:** 5 years in DevOps, responsible for CI/CD pipelines
- **Goals:**
  - Integrate vulnerability scanning into build pipeline
  - Get quick pass/fail indicators for releases
  - Understand patch availability before deployments
- **Frustrations:**
  - API rate limiting from cloud-based scanners
  - Lack of actionable remediation information
  - No support for offline environments

#### Persona 3: Elena - Compliance Officer

- **Role:** IT Compliance Manager at a healthcare organization
- **Experience:** 10 years in compliance, HIPAA and SOC 2 expertise
- **Goals:**
  - Maintain audit trails for all security assessments
  - Generate reports for regulators
  - Demonstrate due diligence in supply chain security
- **Frustrations:**
  - Incomplete audit records in current tools
  - Manual report generation process
  - Difficulty proving when vulnerabilities were identified

### Use Case Scenarios

#### UC-01: Initial Vulnerability Assessment

**Actor:** Security Analyst
**Preconditions:** SBOM file available from development team
**Steps:**

1. Create new project in VulnAssessTool
2. Import CycloneDX JSON SBOM file
3. Application automatically parses components and scans vulnerabilities
4. Review vulnerability summary showing 12 critical, 8 high severity issues
5. Filter to show only critical vulnerabilities
6. Export vulnerability report as PDF for management review

#### UC-02: Ongoing Monitoring

**Actor:** DevOps Engineer
**Preconditions:** Project exists with previous scan results
**Steps:**

1. Open VulnAssessTool and select project
2. Click "Refresh Vulnerability Data" to check for new CVEs
3. Application queries local NVD database for updates
4. Review 3 new critical vulnerabilities discovered
5. Check patch availability for affected components
6. Generate upgrade recommendations for development team

#### UC-03: Audit Preparation

**Actor:** Compliance Officer
**Preconditions:** Annual SOC 2 audit scheduled
**Steps:**

1. Access audit log panel in VulnAssessTool
2. Export audit trail covering the audit period
3. Filter events to show all vulnerability scans and assessments
4. Generate compliance report including:
   - All vulnerability assessments performed
   - Timeline of when vulnerabilities were identified
   - Evidence of remediation actions taken
5. Provide complete audit package to external auditors

#### UC-04: Executive Dashboard Review

**Actor:** Engineering Manager
**Preconditions:** Multiple projects under active development
**Steps:**

1. Open VulnAssessTool executive dashboard
2. Review aggregate health score across all projects (85/100)
3. Identify two projects in "critical" health state
4. Drill down to view vulnerability trend over past 6 months
5. Compare team productivity metrics (scans completed, remediation rate)
6. Allocate additional resources to at-risk projects

---

## Functional Requirements

### FR-01: Project Management

#### FR-01.1: Project Creation

- **Priority:** High (Must Have)
- **Description:** Users must be able to create new projects to organize vulnerability assessments
- **Requirements:**
  - Create project with unique name and optional description
  - Each project must have a unique identifier (ULID-based)
  - Projects must track creation and last update timestamps
  - Support minimum 1000 concurrent projects
  - Project data must persist across application restarts

#### FR-01.2: Project Editing and Deletion

- **Priority:** Medium (Should Have)
- **Description:** Users must be able to modify and remove projects
- **Requirements:**
  - Edit project name and description
  - Delete individual projects with confirmation
  - Bulk delete multiple projects
  - Deletion must cascade to associated scan results and vulnerabilities

### FR-02: SBOM Import and Parsing

#### FR-02.1: CycloneDX Support

- **Priority:** High (Must Have)
- **Description:** Application must import and parse CycloneDX format SBOMs
- **Requirements:**
  - Support CycloneDX JSON format (v1.0 - v1.5)
  - Support CycloneDX XML format (v1.0 - v1.5)
  - Extract all component metadata (name, version, purl, cpe, licenses, hash)
  - Handle nested component structures
  - Extract vulnerability data if present in SBOM
  - Validate file format before parsing
  - Provide clear error messages for invalid files

#### FR-02.2: SPDX Support

- **Priority:** High (Must Have)
- **Description:** Application must import and parse SPDX format SBOMs
- **Requirements:**
  - Support SPDX 2.2 and 2.3 formats
  - Extract component metadata consistent with CycloneDX output
  - Handle package relationships and dependencies
  - Validate SPDX documents
  - Support both tag-value and RDF formats

#### FR-02.3: Multiple SBOM Files per Project

- **Priority:** Medium (Should Have)
- **Description:** Projects must support multiple SBOM file uploads
- **Requirements:**
  - Upload unlimited SBOM files to a single project
  - Merge components from multiple files (deduplicate by purl)
  - Track each SBOM file's metadata (format, version, upload date)
  - Remove individual SBOM files from projects

### FR-03: Vulnerability Scanning and Detection

#### FR-03.1: Local Database Scanning

- **Priority:** High (Must Have)
- **Description:** Application must scan components against local NVD database
- **Requirements:**
  - Use local SQLite database containing NVD CVE data
  - Match components by CPE identifier
  - Match components by package URL (purl)
  - Support fuzzy matching for version ranges
  - Return complete vulnerability records (CVSS, CWEs, descriptions, references)
  - Handle 100,000+ components in database without performance degradation

#### FR-03.2: NVD API Integration

- **Priority:** High (Must Have)
- **Description:** Application must query NVD API for latest vulnerability data
- **Requirements:**
  - Support NVD API v2.0
  - Allow optional NVD API key configuration
  - Respect API rate limits (5 requests/30 seconds rolling window without key)
  - Cache API responses with configurable TTL (default: 24 hours)
  - Handle API errors gracefully with retry logic
  - Support offline mode when API unavailable

#### FR-03.3: OSV Integration

- **Priority:** High (Must Have)
- **Description:** Application must integrate with OSV (Open Source Vulnerabilities) database
- **Requirements:**
  - Query OSV API by package URL
  - Support multiple ecosystem types (npm, PyPI, Maven, Go, etc.)
  - Merge OSV results with NVD data
  - Handle OSV-specific vulnerability IDs
  - Cache OSV responses

#### FR-03.4: Hybrid Scanning

- **Priority:** Medium (Should Have)
- **Description:** Application must combine local and API-based scanning
- **Requirements:**
  - Query local database first for speed
  - Fall back to API for missing or stale data
  - Merge results from multiple sources
  - Prioritize data by source reliability
  - Display source attribution for each vulnerability

#### FR-03.5: Manual Refresh

- **Priority:** High (Must Have)
- **Description:** Users must be able to manually trigger vulnerability data refresh
- **Requirements:**
  - Refresh button on project detail view
  - Refresh option on main dashboard
  - Show refresh progress with component scan count
  - Cache-busting option to force fresh API queries
  - Notification when refresh completes

#### FR-03.6: Automatic Refresh

- **Priority:** Medium (Should Have)
- **Description:** Application must support scheduled vulnerability data refresh
- **Requirements:**
  - Configurable refresh intervals (hourly, daily, weekly)
  - Background refresh without UI blocking
  - Notifications when new critical vulnerabilities found
  - Pause on battery option for laptops

### FR-04: Vulnerability Details and Presentation

#### FR-04.1: Vulnerability Listing

- **Priority:** High (Must Have)
- **Description:** Users must be able to view all vulnerabilities for a project
- **Requirements:**
  - Sort by severity, CVSS score, publication date
  - Filter by severity level, source, CVSS range
  - Search by CVE ID, keyword
  - Pagination for large result sets (>1000 vulnerabilities)
  - Bulk select for operations

#### FR-04.2: Vulnerability Detail View

- **Priority:** High (Must Have)
- **Description:** Users must access complete vulnerability information
- **Requirements:**
  - Display CVE ID and source
  - Show CVSS score with color-coded severity
  - Display CVSS vector string and breakdown
  - Show vulnerability description
  - List affected components
  - Provide CWE identifiers
  - Link to external references (NVD, OSV, vendor advisories)
  - Show publication and modification dates
  - Display exploit status if known

#### FR-04.3: CVSS Breakdown

- **Priority:** Medium (Should Have)
- **Description:** Application must explain CVSS scores in detail
- **Requirements:**
  - Visual breakdown of CVSS v3.1 metrics
  - Explanation of each metric component (AV, AC, PR, UI, S, C, I, A)
  - Qualitative descriptions for metric values
  - Temporal metrics if available (E, X, RL, RC, CR)

#### FR-04.4: Patch Information

- **Priority:** High (Must Have)
- **Description:** Application must provide patch availability information
- **Requirements:**
  - Display patch availability status (Available, Partial, None, Unknown)
  - Show fixed version ranges
  - Link to patch commits and releases
  - Provide remediation advice with steps
  - Estimate remediation effort (Low, Medium, High)
  - Highlight components with available fixes

### FR-05: Health Dashboard

#### FR-05.1: Health Score Calculation

- **Priority:** High (Must Have)
- **Description:** Application must calculate health scores for projects
- **Requirements:**
  - Generate score from 0-100 for each component
  - Calculate project-level average health score
  - Weight factors: vulnerability severity (40%), age (20%), patch availability (20%), version currency (20%)
  - Update scores in real-time as vulnerabilities are added/resolved
  - Show score trends (improving, stable, degrading)

#### FR-05.2: Health Categories

- **Priority:** High (Must Have)
- **Description:** Health scores must map to descriptive categories
- **Requirements:**
  - Excellent (90-100): No critical/high, all patches available
  - Good (75-89): Low severity issues, patches available
  - Fair (60-74): Medium issues, some patches missing
  - Poor (40-59): High severity, limited patches
  - Critical (0-39): Critical vulnerabilities present

#### FR-05.3: Health Dashboard Visualization

- **Priority:** High (Must Have)
- **Description:** Users must visualize health metrics
- **Requirements:**
  - Color-coded health score cards
  - Distribution chart showing components by health category
  - Trend line for score changes over time
  - Drill-down to view component-level health details
  - Comparison view for multiple projects

### FR-06: Executive Dashboard

#### FR-06.1: Aggregate Metrics

- **Priority:** Medium (Should Have)
- **Description:** Dashboard must show portfolio-level metrics
- **Requirements:**
  - Total projects and components tracked
  - Aggregate vulnerability counts by severity
  - Average health score across portfolio
  - Exploited vulnerability count
  - Fixable vulnerability percentage

#### FR-06.2: Executive Widgets

- **Priority:** Medium (Should Have)
- **Description:** Configurable widgets for executive dashboard
- **Requirements:**
  - Risk gauge showing overall risk level
  - Vulnerability trend chart (last 6 months)
  - Compliance status indicator
  - Project health comparison
  - Team productivity metrics
  - Top 10 critical vulnerabilities

#### FR-06.3: Dashboard Customization

- **Priority:** Low (Nice to Have)
- **Description:** Users must customize their dashboard layout
- **Requirements:**
  - Add/remove/reorder widgets
  - Resize widgets
  - Save dashboard configurations
  - Multiple dashboard profiles

### FR-07: Audit and Compliance

#### FR-07.1: Audit Logging

- **Priority:** High (Must Have)
- **Description:** Application must log all state changes for compliance
- **Requirements:**
  - Record CREATE, UPDATE, DELETE operations
  - Log SCAN and EXPORT events
  - Track SETTINGS changes
  - Capture user/session context
  - Store before/after state for changes
  - Use time-ordered ULIDs for event IDs
  - Immutable log entries (no modifications allowed)

#### FR-07.2: Audit Log Viewing

- **Priority:** High (Must Have)
- **Description:** Users must be able to review audit logs
- **Requirements:**
  - Filter by event type, date range, entity
  - Search within audit log
  - View event details with state diffs
  - Export audit log as CSV/JSON
  - Pagination for large logs

#### FR-07.3: Audit Export

- **Priority:** Medium (Should Have)
- **Description:** Users must export audit logs for compliance reporting
- **Requirements:**
  - Export as CSV with all fields
  - Export as JSON for integration
  - Generate PDF reports for auditors
  - Include metadata (export date, system version)
  - Support date range filtering

### FR-08: Search and Filtering

#### FR-08.1: Global Search

- **Priority:** High (Must Have)
- **Description:** Application must provide search across all projects
- **Requirements:**
  - Search by component name, version
  - Search by CVE ID
  - Search within vulnerability descriptions
  - Rank results by relevance
  - Support advanced search syntax (AND, OR, NOT)
  - Save search queries

#### FR-08.2: Component Filtering

- **Priority:** High (Must Have)
- **Description:** Users must filter components by various criteria
- **Requirements:**
  - Filter by component type (library, framework, application)
  - Filter by license type
  - Filter by vulnerability presence
  - Filter by patch availability
  - Combine multiple filters
  - Save filter presets

#### FR-08.3: Vulnerability Filtering

- **Priority:** High (Must Have)
- **Description:** Users must filter vulnerabilities by severity and attributes
- **Requirements:**
  - Filter by severity level (Critical, High, Medium, Low, None)
  - Filter by CVSS score range
  - Filter by source (NVD, OSV, Both)
  - Filter by patch availability
  - Filter by exploit status
  - Save filter presets

### FR-09: Export and Reporting

#### FR-09.1: Data Export

- **Priority:** High (Must Have)
- **Description:** Users must export project data in multiple formats
- **Requirements:**
  - Export to CSV format
  - Export to JSON format
  - Export to PDF with formatting
  - Include selected data (vulnerabilities, components, statistics)
  - Support bulk export of multiple projects

#### FR-09.2: Vulnerability Reports

- **Priority:** High (Must Have)
- **Description:** Application must generate formatted vulnerability reports
- **Requirements:**
  - Include executive summary with key metrics
  - List vulnerabilities sorted by severity
  - Show CVSS scores and vectors
  - Include remediation recommendations
  - Add charts and visualizations
  - Company logo and branding
  - Save/export as PDF

#### FR-09.3: Compliance Reports

- **Priority:** Medium (Should Have)
- **Description:** Application must generate compliance-focused reports
- **Requirements:**
  - Framework-specific templates (SOC 2, ISO 27001, HIPAA)
  - Include required audit trail information
  - Demonstrate due diligence
  - Highlight unremediated critical findings
  - Executive summary for non-technical stakeholders

### FR-10: Settings and Configuration

#### FR-10.1: Theme and Appearance

- **Priority:** Medium (Should Have)
- **Description:** Users must customize application appearance
- **Requirements:**
  - Light/Dark theme selection
  - System theme detection
  - Font size options (Small, Default, Large)
  - Persist preferences across sessions

#### FR-10.2: Settings Profiles

- **Priority:** Medium (Should Have)
- **Description:** Users must manage multiple configuration profiles
- **Requirements:**
  - Create named settings profiles
  - Switch between profiles
  - Set default profile
  - Import/export profiles
  - Profile descriptions

#### FR-10.3: Database Configuration

- **Priority:** High (Must Have)
- **Description:** Users must configure vulnerability database settings
- **Requirements:**
  - NVD API key configuration
  - Local database update schedule
  - Bandwidth limiting for updates
  - Storage location for database
  - Data retention policies
  - Manual database update trigger

#### FR-10.4: Notification Preferences

- **Priority:** Medium (Should Have)
- **Description:** Users must configure notification behavior
- **Requirements:**
  - Enable/disable notifications
  - Desktop notifications toggle
  - Category preferences (critical vuln, scan complete, update available, system)
  - Notification center for viewing history

#### FR-10.5: CVSS Configuration

- **Priority:** Low (Nice to Have)
- **Description:** Users must configure CVSS settings
- **Requirements:**
  - Select CVSS version (3.0, 3.1)
  - Toggle CVSS breakdown display
  - Configure severity thresholds

### FR-11: Dependency Graph Visualization

#### FR-11.1: Graph Generation

- **Priority:** Low (Nice to Have)
- **Description:** Application must generate dependency graphs
- **Requirements:**
  - Build directed acyclic graph from dependencies
  - Handle circular dependencies
  - Limit graph size for performance
  - Highlight vulnerable components
  - Show transitive dependencies

#### FR-11.2: Graph Visualization

- **Priority:** Low (Nice to Have)
- **Description:** Users must visualize dependency relationships
- **Requirements:**
  - Interactive graph with zoom/pan
  - Node selection for details
  - Path highlighting between components
  - Export as image
  - Filter by vulnerability status

### FR-12: SBOM Generation from Binaries, Images and Source

> Requirements FR-12 through FR-24 were added on 2026-08-22 by
> [reports/requirements-gap-analysis-2026-08-22.md](docs/reports/requirements-gap-analysis-2026-08-22.md).
> They describe capabilities that were **already shipped** and had no requirement covering them;
> each is written from the implementation, not from intent. They are requirements, not release
> notes: they state what the product must do, and the code happens to already do it.

#### FR-12.1: Artifact Cataloging

- **Priority:** High (Must Have)
- **Description:** Users must be able to produce an SBOM from an artifact they hold, not only from
  an SBOM someone else produced
- **Requirements:**
  - Accept an uploaded binary or archive, a local path, or a container image reference
  - Select the cataloging mode from the target (`dir` for a source tree, `file` for an artifact,
    image reference otherwise) without asking the user to classify it
  - Emit CycloneDX JSON consumable by the FR-02.1 importer with no format-specific handling
  - Report engine availability separately from generation, so a missing engine is a clear
    precondition failure rather than a generation error
  - Never invoke the cataloging engine through a shell; bound both execution time and output size

#### FR-12.2: Cataloging Guidance for Composite Artifacts

- **Priority:** Medium (Should Have)
- **Description:** Artifacts that are containers of filesystems (Android images, Yocto builds,
  MCU/RTOS firmware, AUTOSAR packages) must not silently produce an empty or misleading SBOM
- **Requirements:**
  - Document a per-artifact-class playbook covering what to unpack before cataloging
  - Detect and reject inputs that require unpacking with an actionable message rather than
    returning a near-empty component list

### FR-13: Container Image Scanning

- **Priority:** High (Must Have)
- **Description:** Users must be able to assess a container image without first exporting an SBOM
  from it by hand
- **Requirements:**
  - Detect an available container runtime (Docker or Podman) and report which one is in use
  - Pull an image by reference, read its manifest, and inspect its configuration
  - Extract the image filesystem and catalog installed packages into the FR-02 component model
  - Scan the resulting components through the same pipeline as an imported SBOM (FR-03)
  - Surface runtime-absent, image-not-found and authentication failures distinctly
  - Execute runtime commands without a shell, with bounded timeout and output size

### FR-14: Threat Intelligence Enrichment

#### FR-14.1: Known Exploited Vulnerabilities (CISA KEV)

- **Priority:** High (Must Have)
- **Description:** Vulnerabilities under active exploitation must be distinguishable from those
  that are merely severe, because severity alone does not indicate urgency
- **Requirements:**
  - Ship an embedded KEV baseline so KEV status resolves with no network access on first run
  - Synchronise from the CISA catalog on a configurable interval (default 24 hours), replacing the
    baseline without losing KEV status if the sync fails
  - Answer KEV membership for a single CVE and for a batch in one call
  - Expose the KEV entry's vendor, product, required action, due date and ransomware-campaign flag
  - Support querying KEV additions within a date range, and report catalog totals and last-sync time
  - A failed or never-run sync must degrade to the baseline, never to "not exploited"

#### FR-14.2: Exploit Prediction Scoring (EPSS)

- **Priority:** Medium (Should Have)
- **Description:** Users must be able to prioritise by likelihood of exploitation, not only by
  severity and known-exploited status
- **Requirements:**
  - Fetch EPSS probability and percentile for a CVE on demand from the EPSS API
  - Cache scores with a configurable TTL (default 24 hours) and serve from cache while fresh
  - Batch requests (default maximum 100 CVEs per call) and respect a request rate limit
  - Support explicit refresh of a single score and cleanup of expired cache entries
  - Absent or stale EPSS data must not block scanning or prioritisation

#### FR-14.3: Composite Risk Score

- **Priority:** Medium (Should Have)
- **Description:** KEV status, EPSS and severity must combine into one comparable number so a
  worklist can be ordered
- **Requirements:**
  - Produce a 0–100 score from KEV status, EPSS percentile and CVSS severity
  - Weight known-exploited status decisively above predicted exploitability
  - Remain defined when EPSS is unavailable, degrading to severity and KEV status
  - Expose the contributing terms, not only the total, so a ranking can be explained

### FR-15: False Positive Filtering (FPF)

#### FR-15.1: Filter Orchestration

- **Priority:** High (Must Have)
- **Description:** A raw scan of an embedded or automotive system reports vulnerabilities in code
  that is not present, not enabled, or not reachable; these must be filterable without hiding real
  findings
- **Requirements:**
  - Apply filter tiers in ascending cost order and stop at the first tier that decides
  - Never auto-suppress a Critical or High finding; the highest available action for those is to
    flag for review
  - Record every decision — suppressed, downgraded, flagged, retained — with the tier and rule that
    produced it
  - Produce per-vulnerability results and a batch summary in a single pass
  - Operate against a declared system configuration (interfaces, services, enabled features)

#### FR-15.2: Tier 1 — Deterministic Quick Filters

- **Priority:** High (Must Have)
- **Description:** The majority of false positives are decidable from configuration alone and must
  not require graph analysis
- **Requirements:**
  - Support at minimum: disabled hardware interface, version mismatch, explicit CPE suppression
    rule, disabled software feature, and not-externally-exposed component
  - Be deterministic: the same input and configuration must always yield the same decision
  - Attach the matched rule and the evidence for it to every decision

#### FR-15.3: Tier 2 — Attack Path Reachability

- **Priority:** Medium (Should Have)
- **Description:** A vulnerability in a component that cannot be reached from any external entry
  point carries different risk from one that can
- **Requirements:**
  - Build a directed attack graph of interfaces, services and components from the system
    configuration, typed by edge kind and exposure level
  - Determine reachability of each affected component from declared external entry points
  - Return the shortest attack path when a component is reachable, and the reason when it is not
  - Treat unknown reachability as reachable, never as unreachable

#### FR-15.4: Tamper-Evident Audit Trail

- **Priority:** High (Must Have)
- **Description:** Filter decisions remove findings from a safety-relevant report, so the record of
  them must be verifiable, not merely present
- **Requirements:**
  - Append every decision to a hash-chained log where each entry commits to its predecessor
  - Use a cryptographic digest (SHA-256); a non-cryptographic or truncated hash does not satisfy
    this requirement
  - Provide chain verification that identifies the first broken link
  - Record the decision, its context, and the acting user reference for each event
  - The log must be exportable independently of the report that cites it

#### FR-15.5: ISO 21434 Report Generation

- **Priority:** Medium (Should Have)
- **Description:** Filter activity must be presentable as evidence for a cybersecurity case
- **Requirements:**
  - Generate a report covering the vulnerability population, the filtered subset, and each
    decision with its justification
  - Export as JSON and PDF
  - State the filtering approach and whether any non-deterministic tier contributed
  - Include the audit-chain verification result, so a report from a broken chain is self-evident

### FR-16: VEX (Vulnerability Exploitability eXchange)

#### FR-16.1: VEX Generation

- **Priority:** Medium (Should Have)
- **Description:** Triage decisions must be publishable to downstream consumers in a standard
  format rather than staying inside this tool
- **Requirements:**
  - Generate CycloneDX VEX documents from recorded filter decisions (FR-15.4)
  - Map each decision to a VEX analysis status (`affected`, `not_affected`,
    `under_investigation`, `resolved`) and a standard justification
  - Reference affected components so a statement is scoped, not blanket
  - Export as JSON and XML
  - Carry document metadata: author, timestamp, and a unique document identifier

#### FR-16.2: VEX Import and Suppression

- **Priority:** Medium (Should Have)
- **Description:** A previously published triage must suppress the same findings on a later scan,
  including in CI, without re-triage
- **Requirements:**
  - Parse standard CycloneDX VEX and this tool's own generated shape
  - Suppress findings whose statement status is `not_affected` or `resolved`
  - Match statements to findings by vulnerability identifier and affected component reference
  - Report unparseable or unmatched statements as warnings rather than failing the scan
  - CSAF and OpenVEX are out of scope; an input in those formats must be rejected explicitly

### FR-17: License Compliance Scanning

- **Priority:** Medium (Should Have)
- **Description:** SBOM component licences must be assessable against a policy, since licence risk
  and vulnerability risk are gathered from the same inventory
- **Requirements:**
  - Classify each licence by risk category: public-domain, permissive, weak-copyleft,
    strong-copyleft, network-copyleft, proprietary, unknown
  - Resolve categories from SPDX identifiers via a catalog
  - Evaluate against a policy yielding `allowed`, `review` or `denied` per component
  - Support explicit allow and deny lists that override category rules, with deny winning
  - Resolve multi-licence expressions to the most restrictive applicable category
  - Treat an unrecognised licence as `unknown` and surface it, never as `allowed`
  - Summarise findings by category and verdict across the project

### FR-18: SBOM Diff and Incremental Scanning

#### FR-18.1: SBOM Diff

- **Priority:** Medium (Should Have)
- **Description:** Users must be able to see what changed between two SBOMs
- **Requirements:**
  - Classify components as added, removed, changed or unchanged between two SBOMs
  - Identify a component across versions by a stable identity, and detect a change by content
  - Report per-class counts alongside the component lists
  - Be available both in the application and from the CLI (FR-22)

#### FR-18.2: Incremental Scanning

- **Priority:** Medium (Should Have)
- **Description:** Re-scanning an unchanged component wastes the scan budget that large SBOMs need
- **Requirements:**
  - Scan only components added or changed since the last scan of the same project
  - Carry forward prior results for unchanged components
  - Report how many components were skipped, so the saving is visible and auditable
  - Fall back to a full scan when no prior baseline exists or the baseline cannot be trusted
  - A change in vulnerability data, not only in the SBOM, must be able to force a full re-scan

### FR-19: CPE Estimation and Matching

- **Priority:** High (Must Have)
- **Description:** Components frequently arrive without a CPE, and NVD matching is CPE-based; an
  unmatched component is a silent coverage hole
- **Requirements:**
  - Estimate candidate CPEs for a component lacking one, using known vendor/product mappings,
    a database search, and pattern inference
  - Return candidates ranked by confidence, never a single unqualified guess
  - Distinguish an estimated CPE from a declared one everywhere it is used
  - Match a component to CVE entries by CPE 2.3 semantics including version ranges
  - Report components that could not be matched as coverage gaps rather than as clean

### FR-20: Offline Operation

- **Priority:** High (Must Have)
- **Description:** The product's stated advantage is working in disconnected and air-gapped
  environments; offline must be a supported state, not a failure state
- **Requirements:**
  - Detect connectivity transitions and reflect the current state in the UI
  - Queue mutating requests made while offline and persist the queue across a reload
  - Replay the queue automatically on reconnect, in order, with progress reported
  - Retry failures with exponential backoff and a bounded attempt count
  - All local-database functionality (FR-03.1, FR-08) must remain fully available while offline

### FR-21: Backup and Recovery

- **Priority:** Medium (Should Have)
- **Description:** The local database holds project data that is not recoverable from anywhere else
- **Requirements:**
  - Create backups on a configurable schedule (daily, weekly, or manual only) and on demand
  - Retain a configurable number of backups and rotate older ones out
  - Verify backup integrity, and refuse to restore a backup that fails verification
  - Restore to a chosen point in time, and list available backups with size and timestamp
  - Report backup statistics; a failed scheduled backup must be surfaced, not logged silently

### FR-22: Command-Line Interface and CI/CD Integration

- **Priority:** High (Must Have)
- **Description:** Vulnerability assessment must be enforceable in a pipeline, not only performed
  interactively
- **Requirements:**
  - Provide a CLI that scans an SBOM file and diffs two SBOM files
  - Emit console, JSON, SARIF 2.1.0 and JUnit XML output; write to stdout or a named file
  - Keep diagnostics on stderr so a redirected machine-readable format stays valid
  - Gate the build on a configurable severity threshold, EPSS floor, or KEV-only filter
  - Gate on unversioned "gap" components, so unmatched coverage cannot pass as clean (FR-19)
  - Apply a VEX document supplied on the command line (FR-16.2)
  - Use documented, stable exit codes: `0` clean, `1` findings at or above the threshold,
    `2` execution error, `3` invalid input
  - A missing, empty or unreadable vulnerability database must exit as an error, never as a clean
    scan
  - Ship first-party pipeline integrations for at least GitHub Actions and GitLab CI

### FR-23: Internationalization

- **Priority:** Medium (Should Have)
- **Description:** UI strings must be translatable without code changes
- **Requirements:**
  - Resolve all user-facing strings through a translation runtime with namespaced keys
  - Bundle translation resources so the first render is already translated — no untranslated flash
  - Fall back to English for any missing key rather than rendering the raw key
  - Enforce the absence of hardcoded user-facing strings in the application shell by an automated
    check
  - Adding a locale must require only registering a resource bundle

### FR-24: Navigation and Discoverability

- **Priority:** Low (Nice to Have)
- **Description:** Users must be able to reach any feature without learning the navigation tree
- **Requirements:**
  - Provide a keyboard-invoked command palette covering navigation, actions and search
  - Provide a first-run onboarding tour of the primary workflow, skippable and re-runnable
  - Every command must be reachable by keyboard alone

> **Explicitly excluded — AI-related.** FPF Tier 3 (LLM-assisted analysis) and AI-powered
> vulnerability prioritisation are **not specified** and are out of scope. The FPF audit schema and
> the ISO 21434 report retain `llmData` / `llmUsed` fields, and `isLLMAvailable()` returns a
> constant `false`; these are a reserved seam, not dead code, and must not be removed on the
> assumption that they are.

---

## Non-Functional Requirements

### NFR-01: Performance

| Metric                               | Requirement                                 | Measurement Method               |
| ------------------------------------ | ------------------------------------------- | -------------------------------- |
| Application Startup                  | < 3 seconds on typical hardware             | Time from launch to usable UI    |
| SBOM Import (1000 components)        | < 5 seconds                                 | File read to data stored         |
| Vulnerability Scan (1000 components) | < 10 seconds (local DB), < 60 seconds (API) | Scan completion time             |
| Dashboard Load                       | < 2 seconds                                 | Time to render with 100 projects |
| Search Response                      | < 1 second for 10,000+ components           | Query execution time             |
| UI Responsiveness                    | < 100ms for all interactions                | Interaction to feedback          |

### NFR-02: Scalability

| Dimension              | Requirement                                            |
| ---------------------- | ------------------------------------------------------ |
| Projects               | Support 1,000+ projects                                |
| Components per Project | Support 50,000+ components                             |
| Vulnerabilities        | Handle 1,000,000+ vulnerability records                |
| Concurrent Users       | Single-instance self-hosted (future: multi-user cloud) |
| Database Size          | Handle 10GB+ NVD database                              |

### NFR-03: Reliability

| Metric                 | Requirement                          |
| ---------------------- | ------------------------------------ |
| Application Crash Rate | < 0.1% of sessions                   |
| Data Loss              | Zero data loss in normal operation   |
| Auto-recovery          | Graceful recovery from crashes       |
| Backup                 | Automatic data backup before updates |

### NFR-04: Usability

| Metric             | Requirement                           |
| ------------------ | ------------------------------------- |
| Learning Curve     | New user productive within 15 minutes |
| Help Accessibility | Context-sensitive help available      |
| Error Messages     | Clear, actionable error messages      |
| Keyboard Shortcuts | All actions accessible via keyboard   |
| Accessibility      | WCAG 2.1 Level AA compliance          |

### NFR-05: Compatibility

VulnAssessTool is a self-hosted web application: a Node/Express server that serves the React
frontend, accessed through a modern browser.

| Surface          | Requirement                                | Support Level |
| ---------------- | ------------------------------------------ | ------------- |
| Browser (client) | Chrome/Edge 110+, Firefox 110+, Safari 16+ | Full support  |
| Server runtime   | Node.js 20+ on Windows, macOS, Linux       | Full support  |
| Architecture     | x64, ARM64                                 | Full support  |

### NFR-06: Security

| Requirement     | Description                                               |
| --------------- | --------------------------------------------------------- |
| Data at Rest    | Encrypt sensitive configuration data                      |
| Data in Transit | HTTPS/TLS 1.3 for API calls                               |
| Local Storage   | No plaintext storage of API keys                          |
| Updates         | Integrity-checked CVE data + dependency updates           |
| Hardening       | CSP headers, server-side input validation + rate limiting |

### NFR-07: Maintainability

| Metric        | Requirement                    |
| ------------- | ------------------------------ |
| Code Coverage | 95% minimum for unit tests     |
| Code Quality  | ESLint with zero warnings      |
| Documentation | All APIs documented with JSDoc |
| Build Time    | < 5 minutes for full build     |

### NFR-08: Testability

| Type              | Coverage                                |
| ----------------- | --------------------------------------- |
| Unit Tests        | 95% coverage requirement                |
| Integration Tests | All API endpoints covered               |
| E2E Tests         | Critical user paths covered             |
| BDD Tests         | All major features defined with Gherkin |

## Planned Functional Requirements

> **Status of this whole section: PLANNED — none of FR-25 … FR-38 or NFR-09 is implemented.**
>
> Added 2026-08-22. Before this, the roadmap carried these as one-line bullets ("Plugin system",
> "Team collaboration features") with no requirement behind them — not enough to build against, and
> not enough to reject on merit either. Each is now specified to the point where it can be
> estimated, implemented, or explicitly dropped. **Dependencies are stated because several of these
> are ordered: FR-35 without FR-34 is meaningless, and FR-33/FR-36 both assume FR-32.**
>
> Specifying a requirement here is not a commitment to build it. Rows are ordered roughly by
> dependency, not by priority.

### FR-25: Scheduled and Recurring Reports

- **Priority:** Medium (Should Have) · **Status:** Planned · **Depends on:** FR-09
- **Description:** Reporting today is pull-only — a user must open the app and export. Recurring
  assurance reporting is a scheduled activity, not an ad-hoc one
- **Requirements:**
  - Define a schedule (daily, weekly, monthly) per project or across all projects
  - Select report type and format from those FR-09 already produces; no new report content
  - Deliver to a configured filesystem destination; delivery by email is out of scope until a mail
    transport is a supported dependency
  - Record each run in the audit log (FR-07.1) with its outcome
  - A failed scheduled run must raise a notification (FR-27), never fail silently
  - Schedules must survive a server restart
- **Acceptance:** a configured weekly report produces a file at the destination without user
  interaction, and a forced failure produces both an audit entry and a notification

### FR-26: Charts in Exported Reports

- **Priority:** Low (Nice to Have) · **Status:** Planned · **Depends on:** FR-09.2
- **Description:** PDF export renders tables only; the severity and trend visualisations that make
  the dashboard readable are absent from the artifact that actually gets circulated
- **Requirements:**
  - Render severity distribution and trend-over-time charts into PDF exports
  - Charts must be generated server-side or headlessly — not by screenshotting the DOM, which would
    make export dependent on a rendered viewport
  - Charts must degrade to the existing tables when data is insufficient, not render empty axes
  - Text alternatives must be present in the document for accessibility
- **Acceptance:** an exported PDF for a project with findings contains a severity chart whose
  category totals equal the table's

### FR-27: Notification Types and Delivery

- **Priority:** Medium (Should Have) · **Status:** Planned · **Depends on:** FR-10.4
- **Description:** The notification service exists with info/success/warning/error levels, but the
  roadmap row "additional notification types" has never said which. This requirement settles it
- **Requirements:**
  - Support event-triggered notifications for: a new KEV-listed vulnerability affecting a tracked
    project, a scan completing, a scheduled report or backup failing, and a database sync failing
  - Support a threshold trigger: notify when a project's count of findings at or above a chosen
    severity increases
  - Support digest delivery, collapsing a period's events into one notification
  - Every type must be individually enable-able in settings, and default to the current behaviour
  - Notifications must be persisted and readable after a reload, not transient toasts only
- **Acceptance:** enabling the KEV trigger and syncing a catalog that newly lists an affected CVE
  produces exactly one notification that survives a reload

### FR-28: Multi-Provider Vulnerability Scanning

- **Priority:** Medium (Should Have) · **Status:** Planned · **Depends on:** FR-03
- **Description:** NVD and OSV are two views of the ecosystem; commercial and curated feeds find
  what they miss
- **Requirements:**
  - Support at least one additional provider behind the existing scanner interface
  - Providers must be individually enable-able and require no provider-specific call sites in the
    scanning pipeline
  - Credentials must be stored per SR-01.2
  - Findings from multiple providers must be deduplicated by CVE identifier and aliases, with the
    contributing providers recorded on the merged finding
  - A provider that is unavailable, rate-limited or unauthenticated must degrade the scan to the
    remaining providers with a visible warning, never fail the scan
  - Offline operation (FR-20) must remain fully functional with all remote providers disabled
- **Acceptance:** disabling every remote provider yields the same local-database results as today;
  enabling two providers that both report one CVE yields one finding citing both

### FR-29: Container Registry Scanning

- **Priority:** Medium (Should Have) · **Status:** Planned · **Depends on:** FR-13
- **Description:** FR-13 scans an image once it is local. Fleet assessment starts from a registry
- **Requirements:**
  - Enumerate repositories and tags from a configured registry
  - Support at minimum an OCI-compliant registry; ECR, ACR and GCR are the named targets
  - Authenticate using the registry's standard mechanism, with credentials stored per SR-01.2
  - Scan a selected image by reference through the FR-13 pipeline without a manual pull
  - Support scanning by tag pattern, bounded by an explicit maximum, so a broad pattern cannot
    launch an unbounded job
  - Report per-image progress and continue past an individual image failure
- **Acceptance:** a tag pattern matching three images produces three scan results, and an
  unauthorised fourth image is reported as failed without aborting the run

### FR-30: Custom Vulnerability Rules Engine

- **Priority:** Medium (Should Have) · **Status:** Planned · **Depends on:** FR-15
- **Description:** FPF rules (FR-15.2) are built in. Organisations need their own suppression,
  escalation and tagging rules without a code change
- **Requirements:**
  - Define rules in a declarative, version-controllable format that can live in a repository
  - A rule must be able to match on component identity, CPE/PURL pattern, licence, severity, KEV
    status and EPSS score
  - A rule must be able to suppress, downgrade, escalate or tag a finding
  - The FR-15.1 prohibition holds: a custom rule must not auto-suppress a Critical or High finding;
    the strongest available action is to flag for review
  - Every custom-rule decision must enter the FR-15.4 audit chain, identifying the rule and its
    version
  - Rules must be validated on load, with a clear error naming the offending rule; an invalid
    ruleset must not partially apply
- **Acceptance:** a ruleset suppressing a Medium finding is reflected in results and the audit
  chain; the same rule targeting a Critical finding flags rather than suppresses

### FR-31: Plugin System

- **Priority:** Low (Nice to Have) · **Status:** Planned · **Depends on:** FR-28, FR-32
- **Description:** Extend providers and exporters without forking. The roadmap names custom
  vulnerability providers specifically
- **Requirements:**
  - Define a stable, versioned plugin contract for at least vulnerability providers and exporters
  - Discover plugins from a configured directory; loading must be opt-in per plugin
  - A plugin must declare the contract version it targets; a mismatch must refuse to load with a
    clear message
  - A plugin failure must be contained: it disables that plugin and continues, and never takes down
    a scan
  - Plugin load and failure events must be recorded in the audit log (FR-07.1)
  - **Security:** plugins execute as trusted code in the server process. This must be stated
    explicitly in the documentation, and plugin loading must be disabled by default
- **Acceptance:** a sample provider plugin contributes findings to a scan; a plugin that throws on
  every call is disabled after its failure with the scan still completing

### FR-32: Third-Party Integration API

- **Priority:** Medium (Should Have) · **Status:** Planned · **Depends on:** FR-34
- **Description:** `/api/*` exists for this application's own client and assumes a trusted caller.
  A third-party-facing API is a different contract with different guarantees
- **Requirements:**
  - Expose a versioned, documented REST surface for projects, scans, findings and reports
  - Authenticate with revocable API tokens, scoped to read or write, stored hashed
  - Version the surface so a change cannot break an existing consumer silently
  - Enforce per-token rate limiting and record API access in the audit log (FR-07.1)
  - Publish a machine-readable schema (OpenAPI) generated from the implementation, not maintained
    by hand
- **Acceptance:** a read-scoped token can list findings and is refused on a write; a revoked token
  is refused immediately

### FR-33: Issue Tracker Integration

- **Priority:** Low (Nice to Have) · **Status:** Planned · **Depends on:** FR-32
- **Description:** Remediation happens in an issue tracker; today the hand-off is manual copying
- **Requirements:**
  - Create an issue in a configured tracker from a finding, carrying identifier, severity,
    affected component and remediation guidance
  - Support at minimum one tracker; Jira and GitHub Issues are the named targets
  - Record the link between finding and issue, and surface issue state on the finding
  - Creating an issue twice for the same finding must update the existing link rather than
    duplicate it
  - Tracker credentials stored per SR-01.2; tracker unavailability must not fail the scan
- **Acceptance:** creating an issue from a finding twice yields one issue and one link

### FR-34: Authentication and Identity

- **Priority:** High (Must Have, if multi-user is pursued) · **Status:** Planned
- **Description:** The application currently assumes a single trusted operator. Every multi-user
  requirement below depends on this one, and it must land first — retrofitting identity under an
  existing authorisation model is the harder order
- **Requirements:**
  - Authenticate users against a local credential store and against an external identity provider
  - Support OIDC; SAML and LDAP are named targets
  - Manage sessions with expiry, explicit sign-out, and invalidation on credential change
  - Record authentication events — success, failure, sign-out — in the audit log (FR-07.1)
  - **Single-user deployments must remain usable with authentication disabled**, which must be the
    default, so this requirement cannot regress the existing self-hosted single-operator use case
  - Where authentication is enabled, every entry point including the API (FR-32) and the WebSocket
    channel must be covered — an unauthenticated side door defeats the requirement
- **Acceptance:** with authentication enabled, no `/api/*` route or WebSocket upgrade succeeds
  unauthenticated; with it disabled, behaviour is identical to today

### FR-35: Role-Based Access Control

- **Priority:** Medium (Should Have) · **Status:** Planned · **Depends on:** FR-34
- **Description:** Not every authenticated user should be able to suppress findings or delete
  projects
- **Requirements:**
  - Provide at minimum the roles Viewer (read), Analyst (scan and triage) and Administrator
    (configure and manage users)
  - Enforce authorisation server-side on every route; client-side hiding is presentation, not
    enforcement
  - Restrict finding suppression and FPF configuration (FR-15, FR-30) to Analyst and above
  - Record the acting user and their role on every audited action
  - Deny by default: an action with no explicit grant must be refused
- **Acceptance:** a Viewer token is refused on suppression and project deletion, with the refusals
  audited

### FR-36: Team Collaboration

- **Priority:** Medium (Should Have) · **Status:** Planned · **Depends on:** FR-34, FR-35
- **Description:** Triage is a shared activity; today a project has no notion of who is doing what
- **Requirements:**
  - Share a project with named users or a team, governed by FR-35 roles
  - Assign a finding to a user and track its triage state
  - Comment on a finding, with an immutable comment history
  - Notify assignment and comment events through FR-27
  - Represent concurrent edits so one user's triage cannot silently overwrite another's
- **Acceptance:** two users triaging the same finding concurrently produce a detectable conflict
  rather than a lost update

### FR-37: Configuration and Data Sync

- **Priority:** Low (Nice to Have) · **Status:** Planned · **Depends on:** FR-34
- **Description:** Settings and profiles are per-installation. Users on more than one workstation
  reconfigure by hand. **Self-hosted only** — the product's offline, no-telemetry positioning
  (SR-01) rules out a vendor-hosted sync service
- **Requirements:**
  - Synchronise settings and settings profiles (FR-10.2) between installations against a
    user-operated endpoint
  - Sync must be opt-in and disabled by default
  - Resolve conflicts explicitly, presenting both versions; last-write-wins is not acceptable for
    settings a user has deliberately set
  - Vulnerability and project data are out of scope for this requirement — the local database
    remains authoritative
  - Encrypt data in transit and at rest at the endpoint
- **Acceptance:** two installations converge on a changed setting; a setting changed on both
  independently raises a conflict rather than silently discarding one

### FR-38: Compliance Report Templates

- **Priority:** Medium (Should Have) · **Status:** Planned · **Depends on:** FR-09.3
- **Description:** FR-09.3 produces this tool's report shapes. Audits require particular ones
- **Requirements:**
  - Provide selectable templates for the CR-01/CR-02 frameworks the product already claims to
    support (NTIA minimum elements, OWASP SCVS, ISO 27001 evidence, SOC 2 evidence)
  - Support organisation branding and a custom cover page
  - A template must declare the data it requires, and a report must state plainly when a required
    input is absent rather than emitting an empty section
  - Templates must be versioned, and a generated report must record which template version produced
    it
- **Acceptance:** generating an NTIA-minimum-elements report over an SBOM missing supplier data
  names the gap rather than rendering a blank field

### NFR-09: Foreground Responsiveness During Large Processing

- **Priority:** Medium (Should Have) · **Status:** Planned · **Relates to:** NFR-01, NFR-02
- **Description:** NFR-02 sets scale targets and the UI meets them through virtualisation, but
  parsing, diffing and filtering large SBOMs still occupy the main thread. The roadmap's "Web
  Workers for large dataset processing" is the implementation; this is the requirement
- **Requirements:**
  - No user-initiated processing may block the main thread for longer than 50 ms at a time
  - Long-running client-side work — SBOM parsing, diffing (FR-18.1), FPF evaluation (FR-15) — must
    run off the main thread
  - Progress must be reported and the operation must be cancellable
  - The behaviour must degrade gracefully where the off-thread mechanism is unavailable
- **Acceptance:** parsing a 10,000-component SBOM keeps the UI interactive and reports progress
  throughout

### Explicitly not specified

These roadmap rows are deliberately **not** given requirements. Listing them is the point: silence
would read as an oversight.

| Row                                     | Why not                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI-powered vulnerability prioritisation | AI-related — out of scope by instruction                                                                                                                                                    |
| FPF Tier 3 (LLM analysis)               | AI-related — out of scope by instruction. See the note under FR-24                                                                                                                          |
| Mobile companion app                    | A separate client product, not a feature of this one. It cannot be specified before FR-32 exists, since the API is what it would consume. Revisit after FR-32                               |
| On-premises deployment option           | **Obsolete row.** The product is already a self-hosted web application (see Deployment Requirements); there is no hosted version for this to be an alternative to. Removed from the roadmap |
| Premium support options                 | A commercial decision, not a product requirement. Belongs in the Open Questions table, where it already appears                                                                             |

---

## Security & Compliance

### Security Requirements

#### SR-01: Data Protection

**SR-01.1: General**

- Secure handling of sensitive vulnerability data
- No telemetry without explicit consent
- Sanitize all user inputs before processing

**SR-01.2: Credential Storage** — API keys and integration credentials must be unreadable at rest,
including to a reader of the application's own data directory:

- Encrypt credentials at rest with an authenticated cipher (AES-256-GCM); an unauthenticated cipher
  does not satisfy this requirement, because a tampered credential file must fail to decrypt rather
  than decrypt to something else
- Derive the encryption key from machine-local material via a key-derivation function; never store
  the key alongside the ciphertext
- Never write a credential to the client bundle, to a log, or to an exported report
- A credential that cannot be decrypted must be reported as unavailable, never silently treated as
  absent — the two have different remedies

#### SR-02: Code Security

- Regular dependency updates for known vulnerabilities
- Static analysis before releases (ESLint, CodeQL)
- Security review of all database operations
- Content Security Policy and strict server-side input sanitization

#### SR-03: Update Security

- Code signing for all releases
- Verified update sources
- Checksum validation for downloads
- Rollback capability for failed updates

#### SR-04: External Tool Supply Chain

The product shells out to third-party binaries (Syft for cataloging, Docker/Podman for container
work). Those binaries are part of its attack surface.

- Pin every downloaded tool to an explicit version; never resolve a mutable tag such as `latest`
- Verify a downloaded tool against its publisher-published checksum **before** it is executed, and
  discard it on mismatch
- Prefer an operator-supplied path or an already-provisioned copy over downloading
- Invoke external tools directly with an argument vector, never through a shell, and bound both
  execution time and captured output
- A tool that fails verification must produce a clear failure; falling back to an unverified copy is
  not acceptable

> Rationale: this is the concrete lesson of the March 2026 Trivy supply-chain compromise — pin and
> verify. It is recorded as a requirement rather than a code comment so it survives a rewrite.

### Compliance Requirements

#### CR-01: Supply Chain Compliance

- **CISA CISA:** Support SBOM requirements per CISA guidelines
- **NTIA:** Minimum elements for SBOM (SPDX/CycloneDX)
- **EO 14028:** Support for software artifact attestation

#### CR-02: Industry Standards

- **OWASP:** Align with OWASP Software Component Verification Standard (SCVS)
- **ISO 27001:** Audit trail and access control requirements
- **SOC 2:** Evidence generation for security assessments

#### CR-03: Data Formats

- **CycloneDX:** Support v1.0 - v1.6 (JSON/XML) — 1.6 is required because the Syft SBOM-from-binary
  feature (FR-12) emits it and its output must round-trip through the FR-02.1 importer
- **CycloneDX VEX:** Generate and consume VEX 1.0 (see FR-16)
- **SPDX:** Support v2.2 - v2.3
- **CVSS:** Support v3.0 and v3.1
- **CPE:** Support CPE 2.3 format
- **SARIF:** Emit SARIF 2.1.0 for CI/CD consumption (see FR-22)
- **JUnit XML:** Emit JUnit XML for CI/CD test reporting (see FR-22)

#### CR-04: Automotive Cybersecurity (ISO/SAE 21434)

The false-positive filter (FR-15) exists to support a cybersecurity case, so its evidence must meet
the standard's expectations:

- **Traceability:** every filter decision traceable to the rule and system configuration that
  produced it (FR-15.1)
- **Integrity:** the decision record must be tamper-evident, not merely retained (FR-15.4)
- **Justification:** each suppression must carry a justification a reviewer can assess (FR-15.2)
- **Reportability:** the decision record must be exportable as review evidence (FR-15.5)

---

## Success Criteria & Metrics

### Product Success Metrics

| Metric            | Target                     | Timeframe            |
| ----------------- | -------------------------- | -------------------- |
| Active Users      | 1,000 monthly active users | 6 months post-launch |
| User Satisfaction | 4.5/5 average rating       | 6 months post-launch |
| GitHub Stars      | 500 stars                  | 3 months post-launch |
| Bug Reports       | < 10 critical bugs/month   | Ongoing              |
| Feature Requests  | < 20 open requests         | Ongoing              |

### Quality Metrics

| Metric                   | Target                          | Status                                                                                                |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Unit Test Coverage       | 95%                             | **95.61 stmts / 95.31 func / 96.44 lines — met.** Branches 89.90 against a 95% target: see note below |
| E2E Test Coverage        | 100% of critical paths          | 419 passing across 6 Playwright projects; 123 documented skips                                        |
| BDD Scenarios            | 100% of features                | 149 defined, 108 executing, 41 excluded (`not @ui and not @wip`)                                      |
| Linting Issues           | 0 errors/warnings               | 0 errors, 0 warnings — enforced as a CI gate                                                          |
| Security Vulnerabilities | 0 critical/high in dependencies | Ongoing monitoring                                                                                    |

> **Branch coverage — the 95% target is not achievable and should be renegotiated.** Measured
> 2026-08-22: 1,097 branches are uncovered, of which 476 are `if` guards, 358 are `||`/`??`
> fallbacks, 240 are `error instanceof Error ? …` expressions and 23 are `switch` defaults. The
> residual is dominated by defensive paths no user input can reach; closing it would mean writing
> tests that assert against impossible states. Statements, functions and lines all meet 95% and are
> enforced by CI floors (95/89/95/96). Recommendation: replace the 95% branch target with 90%, and hold the enforced CI floor at its
> current 89 until measured branch coverage clears 90 — setting the floor to 90 today would fail the
> build at 89.90.

### Adoption Metrics

| Metric                    | Target                 | Measurement          |
| ------------------------- | ---------------------- | -------------------- |
| Download Count            | 5,000 downloads        | Release tracking     |
| Installation Success Rate | 98%                    | Error reporting      |
| Daily Active Usage        | 30% of downloads       | Telemetry (optional) |
| Feature Usage             | All core features used | Feature analytics    |

---

## Deployment Requirements

### Build and Release

#### DR-01: Build Process

- Automated builds via CI/CD (GitHub Actions)
- Client bundle (Vite) + server compile (tsc) via `npm run build:all`
- Automated testing (unit + E2E) before release
- Reproducible builds from a tagged commit

#### DR-02: Release Channels

| Channel | Frequency | Purpose                    |
| ------- | --------- | -------------------------- |
| Stable  | Monthly   | Production-ready releases  |
| Beta    | Bi-weekly | Pre-release testing        |
| Nightly | Daily     | Latest features (unstable) |

#### DR-03: Distribution

- GitHub Releases (source + build instructions) for all versions
- Optional container image for self-hosting
- In-app update notifications (checks the GitHub Releases API)

### System Requirements

These describe the **host running the server**. The client needs only a modern browser (see
NFR-05) — there is nothing to install on the client.

#### Minimum Requirements

| Component | Minimum                            |
| --------- | ---------------------------------- |
| OS        | Windows 10, macOS 11, Ubuntu 20.04 |
| RAM       | 4 GB                               |
| Storage   | 500 MB + database size             |
| CPU       | Dual-core 1.5 GHz                  |

#### Recommended Requirements

| Component | Recommended                          |
| --------- | ------------------------------------ |
| OS        | Windows 11, macOS 13+, Ubuntu 22.04+ |
| RAM       | 8 GB                                 |
| Storage   | 2 GB + database size                 |
| CPU       | Quad-core 2.0 GHz                    |

### Installation

#### DR-04: Deployment Methods

- From source: `npm ci && npm run build:all && npm start` (Node.js 20+); default port 3001
- Optional container image for self-hosting
- Reverse proxy (nginx/Caddy) recommended for network exposure and TLS termination
- See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full guide

#### DR-05: First-Run Experience

- Welcome wizard for configuration
- Optional NVD database download
- Settings profile selection
- Sample project import

---

## Roadmap & Future Enhancements

### Phase 1: Core Foundation (Current - MVP Complete)

**Status:** ✅ Complete

- [x] Express (Node) + React application structure (migrated from Electron, commit `acd0518`)
- [x] CycloneDX and SPDX SBOM parsing
- [x] Local NVD database integration
- [x] Basic vulnerability scanning
- [x] Dashboard with project management
- [x] Unit testing framework

### Phase 2: Enhanced Features (Complete)

**Status:** ✅ Complete

- [x] Health dashboard with scoring
- [x] Audit logging system
- [x] Executive dashboard
- [x] Advanced filtering and search
- [x] Export functionality (CSV, JSON, PDF)
- [x] Settings profiles
- [x] BDD testing framework
- [x] E2E testing with Playwright

### Phase 3: Polish & Optimization (Current Focus)

**Status:** ✅ Complete — re-verified against code 2026-08-22. The i18n row below was recorded as
"not started" long after it shipped; corrected here.

- [x] Performance optimization for large datasets — `VirtualList` (react-virtuoso) windowing; FTS5 + `EXPLAIN QUERY PLAN`; 50k / 1M-row / 1,000-project perf tests
- [x] Enhanced CVSS breakdown visualization — `components/cvss/` (`CvssScoreGauge` radar, `CvssMetricsGrid`, `CvssVectorString`), incl. temporal metrics
- [x] Dependency graph visualization — `DependencyGraphPage` + `components/graph/DependencyGraph` (Cytoscape.js force-directed, severity colours, path highlight)
- [x] Offline mode improvements — `OfflineQueue` (navigator.onLine + persisted retry queue), `OfflineIndicator`, sync-on-reconnect
- [x] Internationalization (i18n) — specified as FR-23. Runtime, namespace layout and string
      extraction shipped (78 of 82 files migrated, PR #27), with an enforced shell guardrail against
      new hardcoded strings. `lib/i18n/index.ts` registers one locale (`en`); adding another is a
      translation task, not an engineering one
- [x] Accessibility audit and improvements — axe-core WCAG 2.1 AA gate (`e2e/a11y/accessibility.spec.ts`), audit report under `docs/ui-reviews/`
- [x] Code refactoring for maintainability — eslint `no-explicit-any` / `no-non-null-assertion` / default-export ban at `error`; shared `components/ui/` primitives; PR3–PR5 remediation

### Phase 4: Advanced Features (Planned)

**Status:** 📋 Planned — every row now has a requirement behind it. Until 2026-08-22 these were
one-line bullets that could be neither built nor rejected on merit; see
[Planned Functional Requirements](#planned-functional-requirements).

| Row                                             | Requirement   | Depends on         |
| ----------------------------------------------- | ------------- | ------------------ |
| Multi-provider vulnerability scanning           | FR-28         | FR-03              |
| Container registry scanning (ECR/ACR/GCR)       | FR-29         | FR-13              |
| Custom vulnerability rules engine               | FR-30         | FR-15              |
| Plugin system for custom providers              | FR-31         | FR-28, FR-32       |
| API for third-party integrations                | FR-32         | FR-34              |
| Issue tracker integration (Jira, GitHub Issues) | FR-33         | FR-32              |
| Team collaboration features                     | FR-36         | FR-34, FR-35       |
| Cloud sync with self-hosted option              | FR-37         | FR-34              |
| Scheduled reports                               | FR-25         | FR-09              |
| Charts in exported reports                      | FR-26         | FR-09.2            |
| Notification types                              | FR-27         | FR-10.4            |
| Off-main-thread processing (Web Workers)        | NFR-09        | —                  |
| CI/CD integration plugins                       | **shipped**   | delivered as FR-22 |
| Mobile companion app                            | not specified | needs FR-32 first  |

### Phase 5: Enterprise Features (Future)

**Status:** 🔮 Future

| Row                                     | Requirement       | Note                                                                                                                      |
| --------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Multi-user support with authentication  | FR-34             | Must land before FR-35/36/37 — identity is hard to retrofit under an authorisation model                                  |
| Role-based access control               | FR-35             | Depends on FR-34                                                                                                          |
| SAML/LDAP integration                   | FR-34             | Named targets within FR-34; OIDC is the baseline                                                                          |
| Advanced compliance reporting templates | FR-38             | Depends on FR-09.3                                                                                                        |
| On-premises deployment option           | **removed**       | Obsolete — the product already _is_ a self-hosted deployment; there is no hosted version for this to be an alternative to |
| Premium support options                 | not a requirement | A commercial decision; it is already in the Open Questions table                                                          |

**Excluded — AI-related:** AI-powered vulnerability prioritisation and FPF Tier 3 (LLM analysis)
are deliberately unspecified. See the exclusion note at the end of the Functional Requirements
section.

---

## Open Questions

| Question                                                                      | Impact | Priority | Owner       |
| ----------------------------------------------------------------------------- | ------ | -------- | ----------- |
| Should we implement cloud sync for vulnerability data across devices?         | High   | Medium   | Product     |
| What is the go-to-market strategy for open-source project?                    | High   | High     | Product     |
| Should we offer a paid enterprise version with advanced features?             | High   | High     | Business    |
| What is the long-term maintenance plan for NVD database?                      | Medium | High     | Engineering |
| Should we support custom vulnerability databases for air-gapped environments? | Medium | Medium   | Engineering |

---

## Appendix

### Terminology

| Term | Definition                                                            |
| ---- | --------------------------------------------------------------------- |
| SBOM | Software Bill of Materials - inventory of software components         |
| CVE  | Common Vulnerabilities and Exposures - standardized vulnerability IDs |
| CVSS | Common Vulnerability Scoring System - vulnerability severity scoring  |
| CWE  | Common Weakness Enumeration - vulnerability type classification       |
| CPE  | Common Platform Enumeration - system/software identifier              |
| PURL | Package URL - standard package identifier                             |
| NVD  | National Vulnerability Database - US government CVE repository        |
| OSV  | Open Source Vulnerabilities - Google-hosted vulnerability database    |

### References

- [CycloneDX Specification](https://cyclonedx.org/)
- [SPDX Specification](https://spdx.dev/)
- [NIST NVD API v2.0](https://nvd.nist.gov/developers/vulnerabilities)
- [OSV API](https://osv.dev/docs/)
- [CVSS Calculator](https://www.first.org/cvss/calculator/3.1)
- [CISA SBOM Requirements](https://www.cisa.gov/sbom)

---

**Document Change History**

| Version | Date       | Author             | Changes                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0     | 2026-02-12 | Project Lead Agent | Initial PRD creation based on existing codebase analysis                                                                                                                                                                                                                                                                                                     |
| 1.2     | 2026-08-22 | Engineering        | Closed the requirements gap found by reverse traceability ([gap analysis](docs/reports/requirements-gap-analysis-2026-08-22.md)): added FR-12 … FR-24, SR-01.2, SR-04 and CR-04 for ~8,500 lines of shipped-but-unspecified code; added FR-25 … FR-38 and NFR-09 for roadmap rows that had no requirement; corrected stale Phase 3 and quality-metric claims |

---

**Approval Sign-Off**

| Role             | Name | Signature | Date |
| ---------------- | ---- | --------- | ---- |
| Product Owner    | TBD  |           |      |
| Engineering Lead | TBD  |           |      |
| Security Lead    | TBD  |           |      |
