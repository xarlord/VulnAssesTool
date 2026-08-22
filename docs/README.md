# VulnAssesTool Documentation Index

**Last Updated:** 2026-08-22

VulnAssesTool is an **Express (backend) + React/Vite (frontend) + TypeScript** web application
for vulnerability assessment. (It was migrated off Electron — see commit `acd0518`; any older doc
that still describes a desktop/Electron app has been moved to [archive/](archive/).)

## Getting Started

| Document                              | Description                                         |
| ------------------------------------- | --------------------------------------------------- |
| [README.md](../README.md)             | Project overview, features, installation, and usage |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution guidelines and branch conventions      |
| [LICENSE](../LICENSE)                 | MIT License                                         |

## API & Technical Reference

| Document                                       | Description                                          |
| ---------------------------------------------- | ---------------------------------------------------- |
| [API.md](API.md)                               | REST API (`/api/*`), WebSocket channel, and modules  |
| [AUDIT_LOG.md](AUDIT_LOG.md)                   | Audit logging system and export formats              |
| [DASHBOARD.md](DASHBOARD.md)                   | Dashboard and Executive Dashboard architecture       |
| [CONTAINER_SCANNING.md](CONTAINER_SCANNING.md) | Container image scanning (Docker/Podman) usage guide |

## Setup & Deployment

| Document                                         | Description                              |
| ------------------------------------------------ | ---------------------------------------- |
| [DEPLOYMENT.md](DEPLOYMENT.md)                   | Build and run the server/client for prod |
| [DATABASE_SETUP.md](DATABASE_SETUP.md)           | Database setup and sync configuration    |
| [DATABASE_USER_GUIDE.md](DATABASE_USER_GUIDE.md) | CVE database user guide                  |
| [UPDATE_SCHEDULING.md](UPDATE_SCHEDULING.md)     | CVE data refresh scheduling              |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md)         | Common issues and solutions              |

## Guides

| Document                                                                   | Description                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------- |
| [sbom-generator-guide.md](sbom-generator-guide.md)                         | SBOM generation user guide                              |
| [sbom-cataloging-guidelines.md](sbom-cataloging-guidelines.md)             | Per-artifact SBOM/scan playbooks (Android, Yocto, MCU…) |
| [excel-sbom-template-instructions.md](excel-sbom-template-instructions.md) | Excel SBOM template instructions                        |
| [bdd-test-design.md](bdd-test-design.md)                                   | BDD test design and step definitions                    |

## Design Plans (active)

| Document                                                                               | Description                                        |
| -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| [plans/2026-07-22-cpe-near-match-design.md](plans/2026-07-22-cpe-near-match-design.md) | CPE near-match search design (impl pending)        |
| [plans/2026-07-22-vex-round-trip-design.md](plans/2026-07-22-vex-round-trip-design.md) | VEX round-trip import/export design (impl pending) |

## Status & Reports

| Document                                                                                           | Description                                                           |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [reports/prd-remediation-plan.md](reports/prd-remediation-plan.md)                                 | **Canonical** PRD requirement remediation status                      |
| [reports/requirements-gap-analysis-2026-08-22.md](reports/requirements-gap-analysis-2026-08-22.md) | Reverse traceability: 20 shipped capabilities that had no requirement |
| [reports/requirement-validation-2026-07-25.md](reports/requirement-validation-2026-07-25.md)       | Requirement validation snapshot (superseded by the plan above)        |
| [reports/bug-hunt-fixes-2026-08-02.md](reports/bug-hunt-fixes-2026-08-02.md)                       | Bug hunt #1 findings and fixes (resolved)                             |
| [reports/bug-hunt-2026-08-03.md](reports/bug-hunt-2026-08-03.md)                                   | Bug hunt #2 findings and fixes (resolved)                             |

## UI Reviews (historical)

| Document                                                                                               | Description                           |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| [ui-reviews/2026-03-19-complete-review.md](ui-reviews/2026-03-19-complete-review.md)                   | Initial UI review                     |
| [ui-reviews/2026-03-19-follow-up-review.md](ui-reviews/2026-03-19-follow-up-review.md)                 | Follow-up UI review (post-fixes)      |
| [ui-reviews/visual-test-report-2026-03-19.md](ui-reviews/visual-test-report-2026-03-19.md)             | Visual test report                    |
| [ui-reviews/2026-03-20-accessibility-audit.md](ui-reviews/2026-03-20-accessibility-audit.md)           | Accessibility audit (92/100 baseline) |
| [ui-reviews/2026-03-23-accessibility-fixes.md](ui-reviews/2026-03-23-accessibility-fixes.md)           | Accessibility fixes applied           |
| [ui-reviews/2026-03-23-visual-consistency-audit.md](ui-reviews/2026-03-23-visual-consistency-audit.md) | Visual consistency audit (9/10)       |

## Testing

| Document                                                                                                      | Description                           |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| [tests/bdd/README.md](../tests/bdd/README.md)                                                                 | BDD test framework and usage          |
| [tests/bdd/step-definitions/AUDIT_STEPS_REFERENCE.md](../tests/bdd/step-definitions/AUDIT_STEPS_REFERENCE.md) | Audit step definitions reference      |
| [e2e/README.md](../e2e/README.md)                                                                             | Playwright E2E test setup and running |

## Archive

Historical documents from completed phases and the pre-migration (Electron-era) codebase are stored
in [archive/](archive/). These are point-in-time records and are **not** maintained.
