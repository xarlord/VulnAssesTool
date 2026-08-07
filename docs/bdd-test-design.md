# BDD Test Design Document

## Overview

This document describes the comprehensive BDD (Behavior Driven Development) test suite for the Vulnerability Assessment Tool. The tests are designed to verify the behavior of the system from a user perspective using Gherkin syntax.

## Test Architecture

### Test Framework Stack

| Component        | Technology         | Purpose                                                       |
| ---------------- | ------------------ | ------------------------------------------------------------- |
| BDD Framework    | @cucumber/cucumber | Gherkin feature file execution, run via `cucumber-js`         |
| TS transpilation | tsx                | Runs the TypeScript step-definition/support files under ESM   |
| Assertions       | Vitest expect      | Assertion library (also supports the chai `.to.` interface)   |
| Browser Testing  | Playwright         | Only for the few scenarios tagged `@ui` (excluded by default) |

Note: there is no `tests/bdd-simple.test.ts` / Vitest-based BDD runner — `npm run test:bdd` runs
`cucumber-js` directly. See `tests/bdd/README.md` for the exact invocation and the current list
of excluded scenarios.

### Directory Structure

```
tests/
├── bdd/
│   ├── features/              # Gherkin feature files
│   │   ├── database/          # Database-related features
│   │   │   ├── nvd-database.feature
│   │   │   ├── hybrid-scanner.feature
│   │   │   └── update-scheduler.feature
│   │   ├── audit/             # Audit logging features
│   │   │   └── audit-logging.feature
│   │   ├── analytics/         # Metrics and analytics features
│   │   │   └── metrics-calculator.feature
│   │   ├── parsers/           # SBOM parser features
│   │   │   ├── spdx-parser.feature
│   │   │   └── cyclonedx-parser.feature
│   │   ├── export/            # Export format features
│   │   │   └── export-formats.feature
│   │   └── sbom-generator/    # SBOM generation features
│   │       └── sbom-generator.feature
│   ├── step-definitions/      # Step implementation files
│   │   ├── audit.steps.ts
│   │   ├── analytics.steps.ts
│   │   ├── parsers.steps.ts
│   │   ├── export.steps.ts
│   │   ├── example.steps.ts
│   │   └── sbom-generator.steps.ts
│   └── support/               # Test support utilities
│       ├── world.ts           # Custom World implementation
│       └── hooks.ts           # Before/After hooks
```

No `database.steps.ts` / `hybrid-scanner.steps.ts` / `update-scheduler.steps.ts` exist — the
three `database/*.feature` files are tagged `@wip` and excluded from the default run (see
"Feature Coverage Summary" and `tests/bdd/README.md`).

## Feature Coverage Summary

| Feature Area                                       | Scenarios           | Status                                                                        | Priority |
| -------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------- | -------- |
| NVD Database Operations                            | 25                  | ❌ Excluded (`@wip`) — no step defs; described API doesn't exist (see README) | High     |
| Hybrid Scanner                                     | 15                  | ❌ Excluded (`@wip`) — `hybridScanner.ts` is a stub                           | High     |
| Update Scheduler                                   | 10                  | ❌ Excluded (`@wip`) — real scheduler is interval-check, not cron-style       | Medium   |
| Audit Logging                                      | 20                  | ✅ Passing                                                                    | High     |
| Metrics Calculator                                 | 20                  | ✅ Passing                                                                    | Medium   |
| SPDX Parser                                        | 15                  | ✅ Passing                                                                    | High     |
| CycloneDX Parser                                   | 4                   | ✅ Passing                                                                    | High     |
| Export Formats                                     | 14 + 1 `@wip` (PDF) | ✅ Passing (PDF export excluded, see README)                                  | Medium   |
| SBOM Generator                                     | 8 + 10 `@wip`       | ✅ Passing (10 UI-only scenarios excluded, see README)                        | High     |
| **Total (in the default `npm run test:bdd` gate)** | **82**              | **✅ All passing**                                                            |          |

## Module Coverage

### 1. NVD Database Operations (`src/renderer/lib/database/`)

**Files Tested:**

- `nvdDb.ts` - SQLite database operations
- `nvdQueryBuilder.ts` - Query construction
- `nvdDbFts.ts` - Full-text search
- `nvdSyncService.ts` - Data synchronization

**Scenarios (25):**

```gherkin
Feature: NVD Database Operations

  Scenario: Initialize database with default path
  Scenario: Initialize database with custom path
  Scenario: Insert a new CVE record
  Scenario: Update an existing CVE record
  Scenario: Insert CPE matches for a CVE
  Scenario: Insert references for a CVE
  Scenario: Retrieve CVE by ID with all details
  Scenario: Retrieve non-existent CVE returns null
  Scenario: Search CVEs by CPE text
  Scenario: Search CVEs by CPE with limit
  Scenario: Get CVEs filtered by severity
  Scenario: Get CVEs by multiple severities
  Scenario: Get CVEs within CVSS score range
  Scenario: Get CVEs published after a date
  Scenario: Get CVEs within date range
  Scenario: Query with multiple filters combined
  Scenario: Get database metadata
  Scenario: Update metadata key-value
  Scenario: Begin transaction
  Scenario: Commit transaction
  Scenario: Rollback transaction
  Scenario: Clear all data from database
  Scenario: Close database connection
  Scenario: Reopen closed database
  Scenario: Handle database initialization failure
```

**Key Test Points:**

- WAL mode and foreign key constraints
- CRUD operations for CVEs, CPEs, References
- Full-text search functionality
- Transaction support (begin/commit/rollback)
- Error handling for invalid paths

### 2. Hybrid Scanner (`src/renderer/lib/database/hybridScanner.ts`)

**Scenarios (15):**

```gherkin
Feature: Hybrid Scanner

  Scenario: Scan component found in local database
  Scenario: Scan component not in local database
  Scenario: Scan with minimum severity filter
  Scenario: Scan with max results limit
  Scenario: Scan multiple components
  Scenario: Get CVE by ID from local database
  Scenario: Get CVE by ID falls back to API
  Scenario: Get CVE by ID that doesn't exist anywhere
  Scenario: Query vulnerabilities with filters
  Scenario: Get recent vulnerabilities
  Scenario: Get top vulnerabilities by severity
  Scenario: Get vulnerability statistics
  Scenario: Convert database CVE to vulnerability format
  Scenario: Handle API error during scan
  Scenario: Cache vulnerabilities from API results
```

**Key Test Points:**

- Local cache vs API fallback
- Severity filtering
- Result limiting and ordering
- Error handling for API failures
- Caching behavior

### 3. Update Scheduler (`src/renderer/lib/database/updateScheduler.ts`)

**Scenarios (10):**

```gherkin
Feature: Update Scheduler

  Scenario: Schedule daily updates
  Scenario: Schedule weekly updates
  Scenario: Schedule monthly updates
  Scenario: Calculate next daily schedule
  Scenario: Calculate next weekly schedule
  Scenario: Format schedule for display
  Scenario: Pause scheduled update
  Scenario: Resume scheduled update
  Scenario: Handle missed schedule
  Scenario: Calculate schedule with timezone
```

**Key Test Points:**

- Schedule calculation (daily/weekly/monthly)
- Schedule formatting
- Pause/resume functionality
- Timezone handling

### 4. Audit Logging (`src/main/services/auditLogger.ts`)

**Scenarios (20):**

```gherkin
Feature: Audit Logging

  Scenario: Log user action
  Scenario: Log scan operation
  Scenario: Log export operation
  Scenario: Log database operation
  Scenario: Query audit logs by date range
  Scenario: Query audit logs by action type
  Scenario: Query audit logs by user
  Scenario: Get audit log statistics
  Scenario: Export audit logs to CSV
  Scenario: Clear old audit logs
  Scenario: Verify audit log integrity
  Scenario: Log authentication events
  Scenario: Log configuration changes
  Scenario: Log error events
  Scenario: Search audit logs
  Scenario: Paginate audit log results
  Scenario: Filter by severity level
  Scenario: Correlate related events
  Scenario: Audit log retention policy
  Scenario: Audit log backup
```

### 5. Metrics Calculator (`src/renderer/lib/analytics/metricsCalculator.ts`)

**Scenarios (20):**

```gherkin
Feature: Metrics Calculator

  Scenario: Calculate vulnerability severity distribution
  Scenario: Calculate vulnerability trend over time
  Scenario: Calculate average time to remediation
  Scenario: Calculate scan coverage percentage
  Scenario: Calculate component risk score
  Scenario: Generate summary statistics
  Scenario: Calculate CVSS score distribution
  Scenario: Track false positive rate
  Scenario: Calculate exploitability metrics
  Scenario: Generate trend analysis
  Scenario: Calculate remediation priority
  Scenario: Aggregate metrics by component
  Scenario: Calculate security posture score
  Scenario: Track KEV coverage
  Scenario: Calculate EPSS statistics
  Scenario: Generate comparison reports
  Scenario: Export metrics to JSON
  Scenario: Calculate risk assessment
  Scenario: Track vulnerability age
  Scenario: Generate executive summary
```

### 6. SBOM Parsers

#### SPDX Parser (`src/renderer/lib/parsers/spdxParser.ts`)

**Scenarios (8):**

```gherkin
Feature: SPDX Parser

  Scenario: Parse valid SPDX JSON file
  Scenario: Parse SPDX with multiple packages
  Scenario: Handle invalid SPDX format
  Scenario: Extract package information
  Scenario: Parse SPDX relationships
  Scenario: Handle external references
  Scenario: Parse SPDX with licenses
  Scenario: Handle large SPDX files
```

#### CycloneDX Parser (`src/renderer/lib/parsers/cyclonedxParser.ts`)

**Scenarios (7):**

```gherkin
Feature: CycloneDX Parser

  Scenario: Parse valid CycloneDX JSON file
  Scenario: Parse CycloneDX with components
  Scenario: Handle invalid CycloneDX format
  Scenario: Extract component information
  Scenario: Parse CycloneDX dependencies
  Scenario: Handle CycloneDX with vulnerabilities
  Scenario: Parse CycloneDX with licenses
```

### 7. Export Formats (`src/renderer/lib/export/`)

**Scenarios (15):**

```gherkin
Feature: Export Formats

  Scenario: Export to JSON format
  Scenario: Export to CSV format
  Scenario: Export to PDF format
  Scenario: Export to Excel format
  Scenario: Export filtered results
  Scenario: Export with custom columns
  Scenario: Export vulnerability details
  Scenario: Export scan summary
  Scenario: Export with metadata
  Scenario: Handle large export datasets
  Scenario: Export with formatting options
  Scenario: Export audit logs
  Scenario: Export metrics report
  Scenario: Export comparison report
  Scenario: Export executive summary
```

### 8. SBOM Generator (`src/renderer/lib/sbom/`)

**Scenarios (10):**

```gherkin
Feature: SBOM Generator

  Scenario: Generate SPDX SBOM from scan results
  Scenario: Generate CycloneDX SBOM from scan results
  Scenario: Include vulnerability data in SBOM
  Scenario: Generate SBOM with custom metadata
  Scenario: Generate SBOM for filtered components
  Scenario: Include license information
  Scenario: Include dependency relationships
  Scenario: Generate SBOM from Excel import
  Scenario: Validate generated SBOM
  Scenario: Export SBOM to file
```

## Running Tests

### Run All BDD Tests

```bash
npm run test:bdd
```

### Run a specific feature or tag

```bash
cross-env TSX_TSCONFIG_PATH=tests/bdd/tsconfig.json NODE_OPTIONS="--import tsx" cucumber-js --tags "@audit"
```

(Cucumber's `paths` is fixed by `cucumber.mjs` to `tests/bdd/features/**/*.feature`, so
filtering by `--tags` rather than passing a file path is the reliable way to scope a run.)

### Run with Coverage

```bash
npm run test:coverage
```

## Test Data Management

### Test Database Files

The test suite uses temporary database files that are automatically cleaned up:

- `test-hybrid-scanner.db`
- `test-nvd-data.db`
- `test-query-builder.db`

### Mock Data

API calls are mocked using Vitest's `vi.fn()` and `vi.mock()`:

```typescript
// Mock NVD API
vi.mock('../../../src/renderer/lib/api/nvd.ts', () => ({
  searchCvesByCpe: vi.fn(),
  getCveById: vi.fn(),
}))
```

## Best Practices

### 1. Feature File Guidelines

- Use clear, business-readable language
- One feature per file
- Keep scenarios focused and atomic
- Use tags for categorization (`@database`, `@api`, `@slow`)

### 2. Step Definition Guidelines

- Reuse steps across features
- Keep step implementations simple
- Use the World context for state
- Clean up resources in After hooks

### 3. Test Isolation

- Each scenario runs in isolation
- Database is cleaned before each scenario
- Mock state is reset between tests

## Continuous Integration

### GitHub Actions Configuration

```yaml
name: BDD Tests
on: [push, pull_request]

jobs:
  bdd-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm run test:bdd
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

## Test Metrics

| Metric             | Target | Current |
| ------------------ | ------ | ------- |
| Line Coverage      | 80%    | TBD     |
| Branch Coverage    | 75%    | TBD     |
| Function Coverage  | 85%    | TBD     |
| Scenario Pass Rate | 100%   | TBD     |

## Future Enhancements

1. **Performance Testing**: Add scenarios for load testing
2. **Security Testing**: Add security-focused scenarios
3. **Accessibility Testing**: Add a11y compliance scenarios
4. **Internationalization**: Add i18n test scenarios
5. **Visual Regression**: Add screenshot comparison tests

## Maintenance

### Adding New Scenarios

1. Create or update feature file in `tests/bdd/features/`
2. Implement step definitions in corresponding `*.steps.ts` file
3. Run tests to verify implementation
4. Update this document with new scenarios

### Updating Existing Scenarios

1. Modify feature file as needed
2. Update step definitions if step text changes
3. Verify all related tests still pass
4. Update documentation

## Troubleshooting

### Common Issues

1. **Database Lock Errors**: Ensure proper cleanup in After hooks
2. **Timer Issues**: Use `vi.useFakeTimers()` for time-dependent tests
3. **API Mock Issues**: Verify mock is set up before test runs
4. **Import Errors**: Check path aliases in tsconfig.json

### Debug Mode

```bash
# Run a single scenario/feature by tag
cross-env TSX_TSCONFIG_PATH=tests/bdd/tsconfig.json NODE_OPTIONS="--import tsx" cucumber-js --tags "@audit"
```

## References

- [Cucumber Documentation](https://cucumber.io/docs/cucumber/)
- [Vitest Documentation](https://vitest.dev/)
- [Gherkin Syntax Reference](https://cucumber.io/docs/gherkin/reference/)
- [Playwright Documentation](https://playwright.dev/)
