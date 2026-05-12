# BDD Testing with Cucumber.js

This directory contains Behavior-Driven Development (BDD) tests using Cucumber.js.

## Directory Structure

```
tests/bdd/
├── features/              # Feature files (.feature)
│   └── example.feature
├── step-definitions/      # Step definition implementations
│   └── example.steps.ts
├── support/              # Support files
│   ├── world.ts         # Custom World class for test context
│   └── hooks.ts         # Before/After hooks
├── tsconfig.json        # TypeScript configuration for BDD tests
└── README.md           # This file
```

## Running Tests

### Run all BDD tests

```bash
npm run test:bdd
```

### Run tests in parallel

```bash
npm run test:bdd:parallel
```

### Run tests with HTML report

```bash
npm run test:bdd:html
```

### Run tests with pretty formatter

```bash
npm run test:bdd:pretty
```

### Run tests by tag

```bash
npm run test:bdd:tags "@smoke"
npm run test:bdd:tags "@smoke and @ui"
npm run test:bdd:tags "@smoke or @api"
```

## Writing Feature Files

Feature files use Gherkin syntax and are located in `tests/bdd/features/`:

```gherkin
Feature: Feature Name
  As a user role
  I want to perform an action
  So that I can achieve a goal

  @tag1 @tag2
  Scenario: Scenario description
    Given a precondition
    When I take an action
    Then I expect an outcome
    And another expectation
```

## Writing Step Definitions

Step definitions are implemented in TypeScript in `tests/bdd/step-definitions/`:

```typescript
import { Given, When, Then, And } from '@cucumber/cucumber'
import { CustomWorld } from '../support/world'

Given('a precondition', async function (this: CustomWorld) {
  // Implementation
})

When('I take an action', async function (this: CustomWorld) {
  // Implementation
})

Then('I expect an outcome', async function (this: CustomWorld) {
  // Assertions using @vitest/expect
  expect(result).toBe(expected)
})
```

## Tags

Use tags to organize and filter tests:

- `@smoke` - Critical smoke tests
- `@ui` - UI-based tests
- `@api` - API tests
- `@database` - Database tests
- `@slow` - Slow-running tests (60s timeout)
- `@very-slow` - Very slow tests (120s timeout)
- `@retry` - Tests that should be retried on failure

## World Context

The CustomWorld class provides:

### Browser/Page Management

- `initBrowser()` - Initialize browser and page
- `navigateTo(url)` - Navigate to URL
- `takeScreenshot(name)` - Capture screenshot

### Test Data Storage

- `set(key, value)` - Store test data
- `get(key)` - Retrieve test data
- `has(key)` - Check if key exists

### Scenario State

- `setState(key, value)` - Set scenario state
- `getState(key)` - Get scenario state

### Error Tracking

- `addError(error)` - Track errors
- `hasErrors()` - Check for errors
- `getErrors()` - Get all errors
- `clearErrors()` - Clear error list

## Configuration

### Cucumber Configuration

Located at project root: `cucumber.config.ts`

### TypeScript Configuration

Located at: `tests/bdd/tsconfig.json`

### Environment Variables

- `BASE_URL` - Base URL for UI tests (default: http://localhost:5173)
- `API_BASE_URL` - Base URL for API tests (default: http://localhost:3000)
- `TEST_TIMEOUT` - Default test timeout in ms (default: 10000)
- `SCREENSHOTS` - Enable screenshots (default: true)
- `HEADLESS` - Run headless mode (default: true)
- `CUCUMBER_PARALLEL` - Enable parallel execution (default: false)

## Reports

Test reports are generated in `test-results/`:

- `cucumber-report.html` - HTML report
- `cucumber-pretty.txt` - Pretty formatted text report
- `cucumber-summary.txt` - Test summary
- `screenshots/` - Test screenshots
- `videos/` - Test recordings (if enabled)

## Best Practices

1. **Keep scenarios independent** - Each scenario should be able to run independently
2. **Use descriptive names** - Make feature and scenario names clear and meaningful
3. **Organize by tags** - Use tags to group related tests
4. **Reuse steps** - Create reusable step definitions
5. **Clean up resources** - Use hooks for setup and teardown
6. **Handle async properly** - Always use async/await for asynchronous operations
7. **Write meaningful assertions** - Clear, specific assertions make debugging easier

## Troubleshooting

### TypeScript errors

Ensure `ts-node` is properly configured and all type definitions are installed.

### Browser not launching

Check that Playwright browsers are installed: `npx playwright install`

### Timeouts

Increase timeout using `@slow` or `@very-slow` tags, or adjust in hooks.

### Parallel execution issues

Some tests may not work well in parallel. Use tags to exclude them.
