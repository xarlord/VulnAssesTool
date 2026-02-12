# Cucumber.js Quick Reference Guide

## Quick Start

### Run All BDD Tests
```bash
npm run test:bdd
```

### Run Tests in Parallel
```bash
npm run test:bdd:parallel
```

### Run with HTML Report
```bash
npm run test:bdd:html
# View report: test-results/cucumber-report.html
```

### Run with Pretty Output
```bash
npm run test:bdd:pretty
```

### Run by Tags
```bash
npm run test:bdd:tags "@smoke"
npm run test:bdd:tags "@ui"
npm run test:bdd:tags "@api"
npm run test:bdd:tags "@smoke and @ui"
npm run test:bdd:tags "@smoke or @api"
npm run test:bdd:tags "not @slow"
```

## File Locations

### Configuration
- **Cucumber Config:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\cucumber.config.ts`
- **Vitest Config:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\vitest.config.ts`
- **BDD TypeScript Config:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\tsconfig.json`

### Test Files
- **Features:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\features\`
- **Step Definitions:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\step-definitions\`
- **Support Files:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\support\`

### Reports
- **HTML Report:** `test-results/cucumber-report.html`
- **Pretty Report:** `test-results/cucumber-pretty.txt`
- **Summary:** `test-results/cucumber-summary.txt`
- **Screenshots:** `test-results/screenshots/`
- **Videos:** `test-results/videos/`

## World Context API

### Browser Management
```typescript
await this.initBrowser();          // Initialize browser
await this.navigateTo(url);         // Navigate to URL
await this.takeScreenshot(name);    // Capture screenshot
```

### Data Storage
```typescript
this.set('key', value);             // Store data
this.get('key');                    // Retrieve data
this.has('key');                    // Check existence
```

### State Management
```typescript
this.setState('key', value);        // Set state
this.getState('key');               // Get state
```

### Error Tracking
```typescript
this.addError(error);               // Track error
this.hasErrors();                   // Check for errors
this.getErrors();                   // Get all errors
this.clearErrors();                 // Clear errors
```

## Step Definition Template

```typescript
import { Given, When, Then, And } from '@cucumber/cucumber';
import { expect } from '@vitest/expect';
import { CustomWorld } from '../support/world';

Given('condition', async function(this: CustomWorld) {
  // Setup
});

When('action', async function(this: CustomWorld) {
  // Action
});

Then('outcome', async function(this: CustomWorld) {
  // Assertion
  expect(result).toBe(expected);
});
```

## Feature File Template

```gherkin
Feature: Feature Name
  As a role
  I want to perform an action
  So that I can achieve a goal

  @tag1 @tag2
  Scenario: Scenario description
    Given precondition
    When I take action
    Then expected outcome
```

## Common Tags

- `@smoke` - Critical tests
- `@ui` - UI tests
- `@api` - API tests
- `@database` - Database tests
- `@slow` - Slow tests (60s timeout)
- `@very-slow` - Very slow tests (120s timeout)

## Environment Variables

```bash
BASE_URL=http://localhost:5173
API_BASE_URL=http://localhost:3000
TEST_TIMEOUT=10000
SCREENSHOTS=true
HEADLESS=true
CUCUMBER_PARALLEL=false
```

## Troubleshooting

### TypeScript Errors
```bash
# Install types
npm install --save-dev @types/node

# Check tsconfig
cat tests/bdd/tsconfig.json
```

### Browser Issues
```bash
# Install Playwright browsers
npx playwright install
```

### Timeout Issues
```bash
# Add @slow or @very-slow tags to feature
# Or increase timeout in hooks.ts
```

## Documentation

Full documentation: `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\README.md`

## Summary

- **Packages:** @cucumber/cucumber, @cucumber/pretty-formatter, ts-node
- **Config Files:** cucumber.config.ts, vitest.config.ts, tests/setup.ts
- **Support Files:** world.ts, hooks.ts, tsconfig.json
- **Scripts:** test:bdd, test:bdd:parallel, test:bdd:html, test:bdd:pretty, test:bdd:tags
- **Reports:** HTML, pretty text, screenshots, videos
- **Integration:** Playwright for UI, Vitest for assertions, TypeScript for type safety
