# BDD Testing - Quick Start Guide

**For VulnAssessTool Developers**

---

## Quick Reference

### Run BDD Tests

```bash
# Run all BDD tests
npm test -- tests/bdd

# Run specific feature
npm test -- tests/bdd/features/database/

# Watch mode
npm test -- --watch tests/bdd

# Coverage
npm run test:coverage -- tests/bdd
```

### Create New Scenario

1. **Create/Update Feature File** (`tests/bdd/features/<domain>/<feature>.feature`)

```gherkin
Feature: Your Feature Name
  As a role
  I want feature
  So that benefit

  Scenario: Your scenario name
    Given precondition
    When action
    Then expected outcome
```

2. **Add Step Definitions** (`tests/bdd/step-definitions/<domain>.steps.ts`)

```typescript
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'vitest';

Given('precondition', async function() {
  // Setup code
});

When('action', async function() {
  // Action code
});

Then('expected outcome', function() {
  expect(this.result).toBe(true);
});
```

3. **Run Tests**
```bash
npm test -- tests/bdd/features/<domain>/<feature>.feature
```

---

## Project Structure

```
tests/bdd/
├── features/
│   ├── analytics/          # Metrics calculator tests
│   ├── audit/             # Audit logging tests
│   ├── database/          # Database operations tests
│   ├── export/            # Export format tests
│   └── parsers/           # SBOM parser tests
├── step-definitions/       # Step implementation files
└── support/                # Test utilities (hooks, helpers)
```

---

## Common Patterns

### Pattern 1: Database Test

```gherkin
Scenario: Insert and retrieve data
  Given the database is initialized
  And I have a CVE with ID "CVE-2024-1234"
  When I insert the CVE into database
  Then the CVE should be stored successfully
```

```typescript
Given('the database is initialized', async function() {
  this.db = new NvdDatabase(':memory:');
  await this.db.initialize();
});

When('I insert the CVE into database', async function() {
  this.result = await this.db.insertCVE(this.cve);
});
```

### Pattern 2: Audit Logging Test

```gherkin
Scenario: Log state change
  Given a project exists
  When the project is updated
  Then an audit event should be created
  And the event should contain previous and new state
```

### Pattern 3: Data Tables

```gherkin
Scenario: Bulk insert
  Given the database is initialized
  When I insert the following CVEs:
    | ID            | Severity |
    | CVE-2024-0001 | HIGH     |
    | CVE-2024-0002 | MEDIUM   |
  Then all CVEs should be stored
```

```typescript
When('I insert the following CVEs:', async function(dataTable) {
  const cves = dataTable.hashes();
  for (const cve of cves) {
    await this.db.insertCVE(cve);
  }
});
```

### Pattern 4: Parameters

```gherkin
Scenario: Query with filters
  Given the database contains CVEs
  When I query CVEs with severity "HIGH" and limit 10
  Then up to 10 results should be returned
```

```typescript
When('I query CVEs with severity {string} and limit {int}',
  async function(severity, limit) {
    this.result = await this.db.query({ severity, limit });
  });
```

---

## Gherkin Syntax

| Keyword | Usage |
|---------|-------|
| `Feature` | Top-level description |
| `Scenario` | Individual test case |
| `Given` | Preconditions (setup) |
| `When` | Action being tested |
| `Then` | Expected outcome (assertion) |
| `And` | Additional Given/When/Then |
| `But` | Negative condition |
| `Background` | Shared setup for all scenarios |

---

## Parameter Types

```gherkin
# String (in quotes)
Given a CVE with ID "CVE-2024-1234"

# Integer (numbers)
When I query with limit 10

# Float (decimal numbers)
When I query with CVSS score 7.5

# Tables
When I insert the following data:
  | Column1 | Column2 |
  | Value1  | Value2  |
```

---

## Step Definition Tips

### Use async/await

```typescript
// Good
Given('database is initialized', async function() {
  await this.db.initialize();
});

// Bad
Given('database is initialized', function() {
  this.db.initialize(); // Returns promise, not awaited!
});
```

### Use function() not =>

```typescript
// Good - has access to `this`
Given('database is initialized', async function() {
  this.db = new Database();
});

// Bad - no `this` context
Given('database is initialized', async () => {
  this.db = new Database(); // Error!
});
```

### Clean up in After hooks

```typescript
import { After } from '@cucumber/cucumber';

After(async function() {
  if (this.db) {
    this.db.close();
  }
});
```

---

## Testing Checklist

When writing BDD scenarios, ensure:

- [ ] Each scenario is independent (can run alone)
- [ ] Scenario names are descriptive
- [ ] Steps use domain language (not technical terms)
- [ ] Background section for common setup
- [ ] Proper cleanup in After hooks
- [ ] Error cases are tested
- [ ] Edge cases are covered
- [ ] All steps have implementations
- [ ] Tests run in isolation (no order dependency)

---

## Troubleshooting

### "Step implementation missing"

→ Create step definition in `tests/bdd/step-definitions/`

### "Cannot read property of undefined"

→ Use `function()` not arrow function `() =>`

### "Database locked"

→ Close database in After hook or use `:memory:`

### "Test timeout"

→ Add `async` and `await` to step definitions

### Tests fail when run together

→ Ensure scenarios clean up after themselves

---

## Examples from VulnAssessTool

### Database Operations

```gherkin
Feature: NVD Database Operations
  As a vulnerability assessor
  I want to store and query CVE data locally
  So that I can scan components offline and get fast results

  Scenario: Initialize database with default path
    Given no database exists at the default location
    When I initialize the NVD database
    Then a new database file should be created
    And the database schema should be applied
```

### Audit Logging

```gherkin
Feature: Audit Logging
  As a compliance officer
  I want all state changes to be logged with full context
  So that I can track who did what and when for compliance audits

  Scenario: Log project creation
    Given a new project "My Project" is created
    When the project creation is logged
    Then an audit event should be created with action "CREATE"
    And entity type should be "project"
    And new state should contain project details
```

### Metrics Calculator

```gherkin
Feature: Executive Metrics Calculator
  As an executive
  I want aggregated metrics across all projects
  So that I can understand the security posture at a glance

  Scenario: Calculate overall metrics from multiple projects
    Given I have 5 projects with various vulnerability counts
    When I calculate overall metrics
    Then total projects should be 5
    And total vulnerabilities should be summed
    And severity counts should be aggregated
```

---

## Test Data Helpers

```typescript
// In-memory database (fastest)
const db = new NvdDatabase(':memory:');

// Test database file
const db = new NvdDatabase('./test.db');

// Test CVE factory
function createTestCVE(id, severity = 'HIGH') {
  return {
    id,
    severity,
    cvssScore: getCVSSForSeverity(severity),
    description: `Test CVE ${id}`,
  };
}

// ULID generator for audit tests
import { generateULID } from '@/lib/audit/ulid';
const eventId = generateULID();
```

---

## Coverage Goals

Current BDD Test Coverage:
- **Total Scenarios:** 120
- **Features:** 7
- **Domains:** Analytics, Audit, Database, Export, Parsers

Target Coverage:
- Statements: 100%
- Branches: 100%
- Functions: 100%
- Lines: 100%

---

## Getting Help

- **Full Guide:** `BDD_TEST_GUIDE.md` (project root)
- **Cucumber Docs:** https://cucumber.io/docs/
- **Vitest Docs:** https://vitest.dev/
- **Test Design:** `bdd-test-design.md`

---

## Quick Commands Reference

```bash
# Run all BDD tests
npm test -- tests/bdd

# Run specific domain
npm test -- tests/bdd/features/database/

# Run with coverage
npm run test:coverage -- tests/bdd

# Watch mode for development
npm test -- --watch tests/bdd

# Run specific scenario by name
npm test -- --grep "database initialization"

# Verbose output
npm test -- tests/bdd --reporter=verbose

# Generate HTML report
npm test -- tests/bdd --format html:tests/bdd/reports/report.html
```

---

**Remember:** BDD tests are living documentation. Keep them readable and maintainable!
