# BDD Testing Guide for VulnAssessTool

**Version:** 1.0.0
**Last Updated:** February 10, 2026
**Framework:** Vitest + Cucumber.js (Gherkin Syntax)

---

## Table of Contents

1. [Overview](#overview)
2. [Framework Setup](#framework-setup)
3. [Running Tests](#running-tests)
4. [Writing Scenarios](#writing-scenarios)
5. [Step Definitions](#step-definitions)
6. [Test Structure](#test-structure)
7. [CI/CD Integration](#cicd-integration)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)
10. [Examples](#examples)

---

## 1. Overview

### What is BDD?

Behavior-Driven Development (BDD) is a software development methodology that bridges the gap between technical and non-technical stakeholders. It uses natural language descriptions of software behavior to enable collaboration and create testable specifications.

**Key Concepts:**

- **Gherkin Syntax:** Plain language format for describing behavior
- **Scenarios:** Concrete examples of system behavior
- **Step Definitions:** Code that maps Gherkin steps to test implementations
- **Features:** Collections of related scenarios

### Why BDD Matters for VulnAssessTool

VulnAssessTool is a security vulnerability assessment tool where:

1. **Compliance Requirements:** Audit logging and compliance features require clear, testable specifications
2. **Complex Business Logic:** Health scoring, vulnerability scanning, and metrics calculation have intricate rules
3. **Stakeholder Communication:** Security teams, developers, and compliance officers need shared understanding
4. **Documentation:** BDD scenarios serve as living documentation of system behavior
5. **Test Coverage:** 120+ behavioral scenarios provide comprehensive backend coverage

**Benefits for VulnAssessTool:**

- ✅ Clear specification of vulnerability scanning behavior
- ✅ Testable compliance requirements
- ✅ Reusable test scenarios for regression testing
- ✅ Living documentation of business rules
- ✅ Improved code quality through TDD workflow

---

## 2. Framework Setup

### Technology Stack

```json
{
  "testFramework": "Vitest",
  "bddFramework": "Cucumber.js (@cucumber/cucumber)",
  "language": "TypeScript",
  "syntax": "Gherkin",
  "coverage": "@vitest/coverage-v8"
}
```

### Installation

VulnAssessTool uses Vitest as its primary testing framework. To run BDD tests with Cucumber.js, you need to install the Cucumber package:

```bash
# Navigate to the project directory
cd vuln-assess-tool

# Install Cucumber.js for BDD testing
npm install --save-dev @cucumber/cucumber

# Install TypeScript support for Cucumber
npm install --save-dev @cucumber/cucumber-tsflow
```

### Configuration

#### vitest.config.ts

The BDD test configuration is integrated into the main Vitest configuration:

```typescript
// vite.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/renderer/tests/setup.ts'],
    // BDD test configuration
    testMatch: [
      '**/*.spec.ts',      // Regular unit tests
      '**/*.test.ts',      // Regular unit tests
      '**/bdd/**/*.feature' // BDD feature files
    ],
    exclude: [
      '**/e2e/**',
      '**/dist/**',
      '**/node_modules/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
```

#### cucumber.js (Optional)

Create a `cucumber.js` configuration file in the project root:

```javascript
// cucumber.js
module.exports = {
  default: {
    'paths': ['tests/bdd/features/**/*.feature'],
    'require': ['tests/bdd/step-definitions/**/*.ts'],
    'requireModule': ['ts-node/register'],
    'format': [
      'progress',
      'html:tests/bdd/reports/cucumber-report.html'
    ],
    'publishQuiet': true
  }
}
```

### Environment Setup

The test environment is configured in `src/renderer/tests/setup.ts`:

```typescript
// src/renderer/tests/setup.ts
import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers)

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock browser APIs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })),
})

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})
```

---

## 3. Running Tests

### Basic Test Commands

```bash
# Run all tests (unit + BDD)
npm test

# Run only BDD tests
npm test -- tests/bdd

# Run a specific feature file
npm test -- tests/bdd/features/database/nvd-database.feature

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage
```

### Running Specific Scenarios

```bash
# Run scenarios by name
npm test -- --grep "Initialize database"

# Run scenarios by tag (when implemented)
npm test -- --tags "@database"

# Run scenarios by line number
npm test -- tests/bdd/features/database/nvd-database.feature:6
```

### Test Output

```bash
# Verbose output
npm test -- --reporter=verbose

# Dot output (minimal)
npm test -- --reporter=dot

# Tap output
npm test -- --reporter=tap
```

### Watch Mode

Watch mode automatically re-runs tests when files change:

```bash
# Start watch mode
npm test -- --watch

# Watch specific feature
npm test -- --watch tests/bdd/features/audit/

# Watch with file pattern matching
npm test -- --watch --testNamePattern="audit"
```

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/index.html

# Generate coverage for BDD tests only
npm test -- tests/bdd --coverage
```

**Expected Coverage Thresholds:**

- Statements: 100%
- Branches: 100%
- Functions: 100%
- Lines: 100%

---

## 4. Writing Scenarios

### Gherkin Syntax Basics

Gherkin uses a simple, readable syntax with three main parts:

```gherkin
Feature: Feature Name
  As a <role>
  I want <feature>
  So that <benefit>

  Scenario: Scenario name
    Given <precondition>
    When <action>
    Then <outcome>
    And <additional outcome>
    But <exception>
```

### Scenario Writing Guidelines

#### 1. Use Clear, Descriptive Names

**Good:**
```gherkin
Scenario: Initialize database with default path
```

**Bad:**
```gherkin
Scenario: Test 1
```

#### 2. Follow Given-When-Then Pattern

```gherkin
Scenario: Retrieve CVE by ID with all details
  Given the database is initialized
  And CVE "CVE-2024-1234" exists with CPE matches and references
  When I retrieve the CVE by ID
  Then I should receive the CVE with all CPE matches
  And I should receive all references
  And the vulnerable flag should be a boolean
```

#### 3. Use Business Language

**Good:**
```gherkin
When I scan component "nginx:1.18.0" preferring local
Then vulnerabilities should be returned from local cache
```

**Bad:**
```gherkin
When I call scanComponent("nginx:1.18.0", {preferLocal: true})
Then return value should have fromCache > 0
```

#### 4. Keep Scenarios Independent

Each scenario should be able to run independently:

```gherkin
Scenario: Insert a new CVE record
  Given the database is initialized
  And I have a CVE record with ID "CVE-2024-1234"
  When I insert the CVE into the database
  Then the CVE should be stored successfully
  And I should be able to retrieve it by ID
```

#### 5. Use Tables for Data-Driven Scenarios

```gherkin
Scenario: Insert CVEs with various severities
  Given the database is initialized
  When I insert the following CVEs:
    | ID              | Severity | CVSS  |
    | CVE-2024-0001   | CRITICAL | 9.8   |
    | CVE-2024-0002   | HIGH     | 7.5   |
    | CVE-2024-0003   | MEDIUM   | 5.3   |
  Then all CVEs should be stored
```

### Feature File Structure

```gherkin
Feature: Feature Name
  As a <role>
  I want <feature>
  So that <benefit>

  Background:
    Given common precondition
    And another common precondition

  Scenario: First scenario
    When I do something
    Then something happens

  Scenario: Second scenario
    When I do something else
    Then something else happens
```

### Real Example from VulnAssessTool

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
    And WAL mode should be enabled
    And foreign keys should be enabled

  Scenario: Insert a new CVE record
    Given the database is initialized
    And I have a CVE record with ID "CVE-2024-1234"
    When I insert the CVE into the database
    Then the CVE should be stored successfully
    And I should be able to retrieve it by ID

  Scenario: Search CVEs by CPE text
    Given the database is initialized
    And 10 CVEs exist with CPE matches for "nginx:1.18.0"
    When I search CVEs using CPE text "nginx"
    Then I should receive results containing CVEs with nginx CPE matches
    And results should be ordered by CVSS score descending
```

---

## 5. Step Definitions

### Creating Step Definitions

Step definitions are the glue between Gherkin scenarios and test code:

```typescript
// tests/bdd/step-definitions/database.steps.ts
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'vitest';
import { NvdDatabase } from '@/lib/database/nvdDb';

let db: NvdDatabase;
let result: any;

Given('the database is initialized', async function () {
  db = new NvdDatabase('./test.db');
  await db.initialize();
});

Given('I have a CVE record with ID {string}', function (cveId: string) {
  this.cve = {
    id: cveId,
    description: 'Test vulnerability',
    severity: 'HIGH',
    cvssScore: 7.5,
  };
});

When('I insert the CVE into the database', async function () {
  result = await db.insertCVE(this.cve);
});

Then('the CVE should be stored successfully', function () {
  expect(result.success).toBe(true);
});

Then('I should be able to retrieve it by ID', async function () {
  const retrieved = await db.getCVEById(this.cve.id);
  expect(retrieved).toBeDefined();
  expect(retrieved.id).toBe(this.cve.id);
});
```

### Parameterized Steps

Use parameters for reusable steps:

```typescript
// Basic parameter
Given('CVE {string} exists in the database', async function (cveId: string) {
  await db.insertTestCVE(cveId);
});

// Multiple parameters
When('I query CVEs with severity filter {string} and CVSS range {float} to {float}',
  async function (severity: string, minScore: number, maxScore: number) {
    result = await db.queryCVEs({ severity, minScore, maxScore });
  });

// Number parameters
Then('I should receive exactly {int} results', function (count: number) {
  expect(result.length).toBe(count);
});
```

### Table Parameters

```typescript
When('I insert the following CVEs:', async function (dataTable) {
  const cves = dataTable.hashes();
  for (const cve of cves) {
    await db.insertCVE({
      id: cve.ID,
      severity: cve.Severity,
      cvssScore: parseFloat(cve.CVSS),
    });
  }
});
```

### Regular Expression Matching

For more complex step matching:

```typescript
When(/I search CVEs using CPE text "([^"]*)"/, async function (cpeText: string) {
  result = await db.searchByCPE(cpeText);
});

Then(/results should be ordered by (.*) (ascending|descending)/,
  function (field: string, order: string) {
    const isDescending = order === 'descending';
    // Verify ordering
  });
```

### Shared Context (World)

Use a shared context object to pass data between steps:

```typescript
// tests/bdd/support/world.ts
export class TestWorld {
  database: NvdDatabase | null = null;
  cveRecords: any[] = [];
  scanResult: any;
  auditEvents: any[] = [];
}

// tests/bdd/support/hooks.ts
import { setWorldConstructor, Before, After } from '@cucumber/cucumber';
import { TestWorld } from './world';

setWorldConstructor(TestWorld);

Before(async function(this: TestWorld) {
  // Setup before each scenario
  this.database = new NvdDatabase(':memory:');
  await this.database.initialize();
});

After(async function(this: TestWorld) {
  // Cleanup after each scenario
  if (this.database) {
    this.database.close();
  }
});
```

### Async/Await Support

All step definitions support async operations:

```typescript
Given('the database is initialized', async function () {
  this.db = new NvdDatabase(':memory:');
  await this.db.initialize();
});

When('I fetch CVE data', async function () {
  this.result = await this.db.getCVEById('CVE-2024-1234');
});

Then('the data should be loaded', async function () {
  expect(await this.result).toBeDefined();
});
```

### Example: Database Step Definitions

```typescript
// tests/bdd/step-definitions/database.steps.ts
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'vitest';
import { NvdDatabase } from '@/lib/database/nvdDb';
import { promises as fs } from 'fs';

const TEST_DB_PATH = './test-bdd.db';

// Clean up database before each scenario
Given('no database exists at the default location', async function () {
  try {
    await fs.unlink(TEST_DB_PATH);
  } catch {
    // File doesn't exist, that's fine
  }
});

Given('the database is initialized', async function () {
  this.db = new NvdDatabase(TEST_DB_PATH);
  await this.db.initialize();
});

When('I initialize the NVD database', async function () {
  this.db = new NvdDatabase(TEST_DB_PATH);
  this.result = await this.db.initialize();
});

Then('a new database file should be created', async function () {
  const exists = await fs.access(TEST_DB_PATH).then(() => true).catch(() => false);
  expect(exists).toBe(true);
});

Then('the database schema should be applied', function () {
  const tables = this.db.getTables();
  expect(tables).toContain('cves');
  expect(tables).toContain('cpe_matches');
  expect(tables).toContain('references');
  expect(tables).toContain('metadata');
});
```

---

## 6. Test Structure

### Directory Layout

```
VulnAssesTool/
├── tests/
│   └── bdd/
│       ├── features/              # Gherkin feature files
│       │   ├── analytics/
│       │   │   └── metrics-calculator.feature
│       │   ├── audit/
│       │   │   └── audit-logging.feature
│       │   ├── database/
│       │   │   ├── nvd-database.feature
│       │   │   ├── hybrid-scanner.feature
│       │   │   └── update-scheduler.feature
│       │   ├── export/
│       │   │   └── export-formats.feature
│       │   └── parsers/
│       │       ├── spdx-parser.feature
│       │       └── cyclonedx-parser.feature
│       ├── step-definitions/      # Step definition implementations
│       │   ├── database.steps.ts
│       │   ├── audit.steps.ts
│       │   ├── analytics.steps.ts
│       │   ├── parsers.steps.ts
│       │   └── export.steps.ts
│       ├── support/               # Test utilities and hooks
│       │   ├── world.ts           # Shared test context
│       │   ├── hooks.ts           # Setup/teardown hooks
│       │   └── helpers.ts         # Helper functions
│       └── reports/               # Test reports
│           └── cucumber-report.html
└── vuln-assess-tool/
    └── src/
        └── renderer/
            └── lib/
                ├── database/      # Database implementation
                ├── audit/         # Audit implementation
                ├── analytics/     # Analytics implementation
                └── parsers/       # Parser implementation
```

### Feature File Organization

Features are organized by domain:

```
features/
├── analytics/          # Metrics and health scoring
├── audit/             # Audit logging and compliance
├── database/          # Database operations and scanning
├── export/            # Data export functionality
└── parsers/           # SBOM parsing
```

### Step Definition Organization

Step definitions mirror the feature structure:

```
step-definitions/
├── database.steps.ts    # Steps for database features
├── audit.steps.ts       # Steps for audit features
├── analytics.steps.ts   # Steps for analytics features
├── parsers.steps.ts     # Steps for parser features
└── export.steps.ts      # Steps for export features
```

### Naming Conventions

**Feature Files:**
- Use lowercase with hyphens: `nvd-database.feature`
- Name after the feature being tested
- Group in domain directories

**Step Definition Files:**
- Use camelCase: `database.steps.ts`
- Match the feature domain
- Export all step definitions

**Scenario Names:**
- Use sentence case: `Initialize database with default path`
- Describe what is being tested, not how
- Keep them unique within a feature

**Step Definitions:**
- Use descriptive names: `Given the database is initialized`
- Match the exact Gherkin wording
- Use parameters for reusability

---

## 7. CI/CD Integration

### GitHub Actions Workflow

Create `.github/workflows/bdd-tests.yml`:

```yaml
name: BDD Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  bdd-tests:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Setup Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci
      working-directory: ./vuln-assess-tool

    - name: Run BDD tests
      run: npm test -- tests/bdd
      working-directory: ./vuln-assess-tool

    - name: Generate coverage report
      run: npm run test:coverage -- tests/bdd
      working-directory: ./vuln-assess-tool

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        files: ./vuln-assess-tool/coverage/coverage-final.json
        flags: bdd
        name: bdd-coverage

    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: bdd-test-results-node-${{ matrix.node-version }}
        path: |
          vuln-assess-tool/coverage/
          vuln-assess-tool/tests/bdd/reports/
```

### Pre-commit Hooks

Configure pre-commit hooks to run BDD tests before pushing:

```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test -- tests/bdd --reporter=verbose",
      "pre-push": "npm run test:coverage -- tests/bdd"
    }
  }
}
```

### Docker Integration

```dockerfile
# Dockerfile for BDD testing
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY vuln-assess-tool/package*.json ./vuln-assess-tool/
RUN cd vuln-assess-tool && npm ci

# Copy source code
COPY . .

# Run BDD tests
WORKDIR /app/vuln-assess-tool
CMD ["npm", "test", "--", "tests/bdd"]
```

### Test Reports

Generate HTML reports for CI/CD pipelines:

```bash
# Generate Cucumber HTML report
npm test -- tests/bdd --format html:tests/bdd/reports/cucumber-report.html

# Generate JSON report for processing
npm test -- tests/bdd --format json:tests/bdd/reports/cucumber-report.json
```

### Coverage Badges

Add coverage badges to README:

```markdown
![BDD Tests](https://img.shields.io/badge/BDD-120%20scenarios-brightgreen)
![BDD Coverage](https://img.shields.io/badge/BDD%20coverage-100%25-brightgreen)
```

---

## 8. Troubleshooting

### Common Issues and Solutions

#### Issue 1: Step Definitions Not Found

**Problem:**
```
Error: Step implementation missing for: Given the database is initialized
```

**Solution:**
1. Verify step definition file exists in `tests/bdd/step-definitions/`
2. Check that step is exported: `export function Given(...)`
3. Ensure step definition file is imported in test configuration
4. Verify exact wording matches (case-sensitive)

```typescript
// Make sure to export step definitions
import { Given, When, Then } from '@cucumber/cucumber';

export function Given(pattern: string, handler: Function) {
  // Implementation
}
```

#### Issue 2: Database File Lock

**Problem:**
```
Error: Database is locked
```

**Solution:**
```typescript
// Clean up database in After hook
After(async function() {
  if (this.db) {
    this.db.close();
  }
  // Remove test database file
  await fs.unlink(TEST_DB_PATH).catch(() => {});
});
```

#### Issue 3: Async/Await Issues

**Problem:**
```
Error: Test timeout - async operation not awaited
```

**Solution:**
```typescript
// Always use async/await
Given('the database is initialized', async function () {
  await this.db.initialize();  // Don't forget await!
});

// Return promises if not using async
When('I query the database', function () {
  return this.db.query();  // Return the promise
});
```

#### Issue 4: Context/World Undefined

**Problem:**
```
TypeError: Cannot read property 'db' of undefined
```

**Solution:**
```typescript
// Make sure to use function() not arrow functions
Given('the database is initialized', async function () {  // ✓ function
  this.db = new NvdDatabase();
});

// NOT
Given('the database is initialized', async () => {  // ✗ arrow function
  this.db = new NvdDatabase();
});
```

#### Issue 5: Import Path Issues

**Problem:**
```
Error: Cannot find module '@/lib/database/nvdDb'
```

**Solution:**
```typescript
// Use relative imports in step definitions
import { NvdDatabase } from '../../../vuln-assess-tool/src/renderer/lib/database/nvdDb';

// Or configure path aliases in tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./vuln-assess-tool/src/renderer/*"]
    }
  }
}
```

#### Issue 6: Test Environment Issues

**Problem:**
```
ReferenceError: localStorage is not defined
```

**Solution:**
Ensure test setup file is configured:

```typescript
// src/renderer/tests/setup.ts
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});
```

#### Issue 7: Flaky Tests

**Problem:**
Tests pass sometimes but fail other times.

**Solution:**
```typescript
// Use proper cleanup
Before(async function() {
  // Clean database
  await this.db.clear();
  // Reset mocks
  vi.clearAllMocks();
});

// Avoid hard-coded delays
// BAD: await new Promise(r => setTimeout(r, 1000));
// GOOD: await waitFor(() => expect(result).toBeDefined());

// Use deterministic test data
Given('CVE {string} exists', async function (id: string) {
  const testCVE = createTestCVE(id); // Use helper for consistency
  await this.db.insert(testCVE);
});
```

#### Issue 8: Coverage Not Generated

**Problem:**
Coverage report shows 0% for BDD tests.

**Solution:**
```bash
# Run coverage with correct path
npm run test:coverage -- tests/bdd

# Check vite.config.ts coverage excludes
coverage: {
  exclude: [
    'tests/',  // Make sure test files are excluded from coverage
  ],
}
```

### Debugging Tips

1. **Use verbose output:**
   ```bash
   npm test -- tests/bdd --reporter=verbose
   ```

2. **Run specific scenarios:**
   ```bash
   npm test -- --grep "database initialization"
   ```

3. **Add logging:**
   ```typescript
   When('I initialize the database', async function () {
     console.log('Initializing database...');
     await this.db.initialize();
     console.log('Database initialized:', this.db);
   });
   ```

4. **Use debugger:**
   ```typescript
   When('I query the database', async function () {
     debugger; // Execution will pause here
     const result = await this.db.query();
   });
   ```

5. **Check test state:**
   ```typescript
   Then('the result should be valid', function () {
     console.log('Current state:', this);
     console.log('Result:', this.result);
     expect(this.result).toBeDefined();
   });
   ```

---

## 9. Best Practices

### Writing Scenarios

1. **Use the Three-Rule Pattern:**
   - One behavior per scenario
   - One assertion per Then step
   - One concept per step

2. **Keep Scenarios Short:**
   - Aim for 3-8 steps per scenario
   - Break complex scenarios into multiple smaller ones
   - Use Background for common setup

3. **Use Domain Language:**
   - Match the language used by stakeholders
   - Avoid technical implementation details
   - Focus on "what" not "how"

4. **Make Scenarios Independent:**
   - Each scenario should set up its own data
   - Don't rely on execution order
   - Clean up after each scenario

### Writing Step Definitions

1. **Reuse Step Definitions:**
   ```typescript
   // Good - reusable
   Given('the database is initialized', async function () {
     this.db = await createTestDatabase();
   });

   // Bad - duplicated
   Given('the NVD database is set up and ready', async function () {
     this.db = await createTestDatabase();
   });
   ```

2. **Use Descriptive Names:**
   ```typescript
   // Good - clear
   Then('I should receive results ordered by CVSS score descending')

   // Bad - vague
   Then('the results should be good')
   ```

3. **Handle Errors Gracefully:**
   ```typescript
   Then('an error should be thrown', function () {
     expect(this.error).toBeDefined();
     expect(this.error.message).toContain('database');
   });
   ```

4. **Use Helper Functions:**
   ```typescript
   // tests/bdd/support/helpers.ts
   export async function createTestDatabase(): Promise<NvdDatabase> {
     const db = new NvdDatabase(':memory:');
     await db.initialize();
     return db;
   }

   export function createTestCVE(id: string, severity: string) {
     return {
       id,
       severity,
       cvssScore: getCVSSForSeverity(severity),
       description: `Test CVE ${id}`,
     };
   }

   // In step definitions
   Given('the database is initialized', async function () {
     this.db = await createTestDatabase();
   });
   ```

### Test Data Management

1. **Use Factories for Test Data:**
   ```typescript
   // tests/bdd/support/factories.ts
   export class CVEFactory {
     static create(overrides: Partial<CVE> = {}): CVE {
       return {
         id: 'CVE-2024-1234',
         severity: 'HIGH',
         cvssScore: 7.5,
         description: 'Test vulnerability',
         ...overrides,
       };
     }
   }
   ```

2. **Use In-Memory Databases:**
   ```typescript
   // Faster and no cleanup needed
   const db = new NvdDatabase(':memory:');
   ```

3. **Clean Up Between Tests:**
   ```typescript
   Before(async function() {
     this.testData = [];
   });

   After(async function() {
     if (this.db) {
       await this.db.clear();
     }
   });
   ```

### Performance Optimization

1. **Use Parallel Execution:**
   ```bash
   npm test -- --parallel
   ```

2. **Share Setup Between Scenarios:**
   ```typescript
   // Use Background for common setup
   Background:
     Given the application is running
     And the user is authenticated
   ```

3. **Avoid Unnecessary Delays:**
   ```typescript
   // Use waitFor instead of fixed delays
   await waitFor(() => expect(element).toBeVisible());
   ```

### Documentation

1. **Document Complex Scenarios:**
   ```gherkin
   # This test verifies that the hybrid scanner correctly prioritizes
   # local database results over API results when preferLocal is true
   Scenario: Scan component found in local database
     Given the local database contains vulnerabilities for "nginx:1.18.0"
     When I scan component "nginx:1.18.0" preferring local
     Then vulnerabilities should be returned from local cache
   ```

2. **Add Descriptions to Features:**
   ```gherkin
   Feature: Audit Logging
     As a compliance officer
     I want all state changes to be logged with full context
     So that I can track who did what and when for compliance audits

     Background:
       Given the audit system is configured
       And audit logging is enabled
   ```

3. **Keep README Updated:**
   - Document new scenarios as they're added
   - Update test counts and coverage
   - Note any special setup requirements

---

## 10. Examples

### Example 1: Database Operations

**Feature File:**
```gherkin
Feature: NVD Database Operations
  As a vulnerability assessor
  I want to store and query CVE data locally
  So that I can scan components offline and get fast results

  Scenario: Insert and retrieve CVE
    Given the database is initialized
    And I have a CVE record with ID "CVE-2024-1234"
    When I insert the CVE into the database
    Then the CVE should be stored successfully
    And I should be able to retrieve it by ID
    And the retrieved CVE should match the original
```

**Step Definitions:**
```typescript
// tests/bdd/step-definitions/database.steps.ts
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'vitest';
import { NvdDatabase } from '@/lib/database/nvdDb';
import type { CVE } from '@/lib/database/types';

Given('the database is initialized', async function () {
  this.db = new NvdDatabase(':memory:');
  await this.db.initialize();
});

Given('I have a CVE record with ID {string}', function (cveId: string) {
  this.cve = {
    id: cveId,
    description: 'Test vulnerability',
    severity: 'HIGH',
    cvssScore: 7.5,
    publishedDate: '2024-01-15',
    lastModified: '2024-01-15',
  };
});

When('I insert the CVE into the database', async function () {
  this.result = await this.db.insertCVE(this.cve);
});

Then('the CVE should be stored successfully', function () {
  expect(this.result.success).toBe(true);
});

Then('I should be able to retrieve it by ID', async function () {
  this.retrieved = await this.db.getCVEById(this.cve.id);
  expect(this.retrieved).toBeDefined();
});

Then('the retrieved CVE should match the original', function () {
  expect(this.retrieved.id).toBe(this.cve.id);
  expect(this.retrieved.description).toBe(this.cve.description);
  expect(this.retrieved.severity).toBe(this.cve.severity);
});
```

### Example 2: Audit Logging

**Feature File:**
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
    And event should have a ULID timestamp
```

**Step Definitions:**
```typescript
// tests/bdd/step-definitions/audit.steps.ts
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'vitest';
import { AuditLogger } from '@/lib/audit/auditLogger';
import { generateULID } from '@/lib/audit/ulid';

Given('a new project {string} is created', function (projectName: string) {
  this.project = {
    id: generateULID(),
    name: projectName,
    description: 'Test project',
    createdAt: new Date().toISOString(),
  };
});

When('the project creation is logged', async function () {
  this.auditLogger = new AuditLogger();
  this.event = await this.auditLogger.logProjectCreate(this.project);
});

Then('an audit event should be created with action {string}', function (action: string) {
  expect(this.event.action).toBe(action);
});

Then('entity type should be {string}', function (entityType: string) {
  expect(this.event.entityType).toBe(entityType);
});

Then('new state should contain project details', function () {
  expect(this.event.newState).toBeDefined();
  expect(this.event.newState.name).toBe(this.project.name);
  expect(this.event.newState.id).toBe(this.project.id);
});

Then('event should have a ULID timestamp', function () {
  expect(this.event.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(this.event.timestamp).toBeDefined();
});
```

### Example 3: Data Tables

**Feature File:**
```gherkin
Scenario: Insert multiple CVEs with various severities
  Given the database is initialized
  When I insert the following CVEs:
    | ID            | Severity | CVSS |
    | CVE-2024-0001 | CRITICAL | 9.8  |
    | CVE-2024-0002 | HIGH     | 7.5  |
    | CVE-2024-0003 | MEDIUM   | 5.3  |
    | CVE-2024-0004 | LOW      | 2.1  |
  Then all CVEs should be stored
  And I should be able to query them by severity
```

**Step Definitions:**
```typescript
When('I insert the following CVEs:', async function (dataTable) {
  const cves = dataTable.hashes();
  this.insertedCVEs = [];

  for (const row of cves) {
    const cve = {
      id: row.ID,
      severity: row.Severity,
      cvssScore: parseFloat(row.CVSS),
      description: `Test vulnerability ${row.ID}`,
      publishedDate: '2024-01-15',
      lastModified: '2024-01-15',
    };

    await this.db.insertCVE(cve);
    this.insertedCVEs.push(cve);
  }
});

Then('all CVEs should be stored', async function () {
  for (const cve of this.insertedCVEs) {
    const retrieved = await this.db.getCVEById(cve.id);
    expect(retrieved).toBeDefined();
    expect(retrieved.severity).toBe(cve.severity);
  }
});

Then('I should be able to query them by severity', async function () {
  const criticalCVEs = await this.db.queryCVEs({ severity: 'CRITICAL' });
  expect(criticalCVEs.length).toBeGreaterThan(0);
  expect(criticalCVEs[0].severity).toBe('CRITICAL');
});
```

### Example 4: Background and Cleanup

**Feature File:**
```gherkin
Feature: Vulnerability Scanning
  As a security analyst
  I want to scan components for vulnerabilities
  So that I can identify security risks

  Background:
    Given the hybrid scanner is initialized
    And the local database contains test data
    And the NVD API is mocked

  Scenario: Scan component with vulnerabilities
    When I scan component "nginx:1.18.0"
    Then vulnerabilities should be found
    And fromCache should be greater than 0
    And results should include severity information

  Scenario: Scan component without vulnerabilities
    When I scan component "safe-lib:1.0.0"
    Then no vulnerabilities should be found
    And fromCache should be 0
```

**Step Definitions:**
```typescript
// tests/bdd/step-definitions/scanning.steps.ts
import { Given, When, Then, Before } from '@cucumber/cucumber';
import { HybridScanner } from '@/lib/database/hybridScanner';

Before(async function () {
  // Clean up before each scenario
  this.scanResults = null;
  this.scanner = null;
});

Given('the hybrid scanner is initialized', async function () {
  this.scanner = new HybridScanner(':memory:');
  await this.scanner.initialize();
});

Given('the local database contains test data', async function () {
  await this.scanner.db.insertTestCVEs([
    { id: 'CVE-2024-1001', cpe: 'nginx:1.18.0', severity: 'HIGH' },
    { id: 'CVE-2024-1002', cpe: 'nginx:1.18.0', severity: 'MEDIUM' },
  ]);
});

Given('the NVD API is mocked', function () {
  this.nvdMock = {
    searchByCPE: vi.fn().mockResolvedValue([]),
  };
});

When('I scan component {string}', async function (component: string) {
  this.scanResults = await this.scanner.scanComponent(component, {
    preferLocal: true,
  });
});

Then('vulnerabilities should be found', function () {
  expect(this.scanResults.vulnerabilities.length).toBeGreaterThan(0);
});

Then('fromCache should be greater than 0', function () {
  expect(this.scanResults.fromCache).toBeGreaterThan(0);
});

Then('results should include severity information', function () {
  const vuln = this.scanResults.vulnerabilities[0];
  expect(vuln.severity).toBeDefined();
  expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(vuln.severity);
});
```

---

## Quick Reference

### Gherkin Keywords

| Keyword | Purpose | Example |
|---------|---------|---------|
| `Feature` | Describes the feature being tested | `Feature: Database Operations` |
| `Scenario` | Describes a specific test case | `Scenario: Insert CVE record` |
| `Given` | Sets up preconditions | `Given the database is initialized` |
| `When` | Describes the action | `When I insert the CVE` |
| `Then` | Describes the expected outcome | `Then the CVE should be stored` |
| `And` | Adds to previous step | `And the result should be valid` |
| `But` | Adds negative condition | `But the error should be handled` |
| `Background` | Common setup for all scenarios | `Background: Given user is logged in` |

### Test Commands

```bash
# Run all tests
npm test

# Run BDD tests only
npm test -- tests/bdd

# Run specific feature
npm test -- tests/bdd/features/database/nvd-database.feature

# Watch mode
npm test -- --watch

# Coverage
npm run test:coverage -- tests/bdd

# Verbose output
npm test -- --reporter=verbose

# Run by pattern
npm test -- --grep "database"
```

### File Locations

```
Feature files:      tests/bdd/features/**/*.feature
Step definitions:   tests/bdd/step-definitions/*.ts
Support files:      tests/bdd/support/*.ts
Test reports:       tests/bdd/reports/
```

---

## Appendix

### A. Feature File Template

```gherkin
Feature: [Feature Name]
  As a [role]
  I want [feature]
  So that [benefit]

  Background:
    Given [common precondition 1]
    And [common precondition 2]

  Scenario: [Scenario name]
    Given [precondition]
    When [action]
    Then [expected outcome]
    And [additional outcome]

  Scenario: [Another scenario name]
    Given [different precondition]
    When [different action]
    Then [different outcome]
```

### B. Step Definition Template

```typescript
// tests/bdd/step-definitions/[domain].steps.ts
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'vitest';

// Given steps
Given('the {string} is initialized', async function (resource: string) {
  // Implementation
});

// When steps
When('I {action} {string}', async function (action: string, target: string) {
  // Implementation
});

// Then steps
Then('the result should be {string}', function (expected: string) {
  expect(this.result).toBe(expected);
});
```

### C. Useful Resources

- **Cucumber Documentation:** https://cucumber.io/docs/
- **Gherkin Reference:** https://cucumber.io/docs/gherkin/
- **Vitest Documentation:** https://vitest.dev/
- **Better-SQLite3:** https://github.com/WiseLibs/better-sqlite3

---

**Document Version:** 1.0.0
**Last Updated:** February 10, 2026
**Maintained By:** VulnAssessTool Development Team

For questions or issues, please open an issue on the VulnAssessTool GitHub repository.
