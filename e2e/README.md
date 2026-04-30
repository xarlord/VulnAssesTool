# E2E Tests for VulnAssessTool

This directory contains end-to-end (E2E) tests for the VulnAssessTool application, written using [Playwright](https://playwright.dev/).

## Overview

The E2E tests cover the critical user flows of the vulnerability assessment tool:

1. **Create Project Flow** (`create-project.spec.ts`)
   - Creating new projects with valid data
   - Validation of project creation form
   - Canceling project creation
   - Handling special characters in project names

2. **SBOM Upload Flow** (`upload-sbom.spec.ts`)
   - Uploading CycloneDX JSON files
   - Uploading SPDX format files
   - File validation and error handling
   - Loading states during parsing

3. **Vulnerability Details Flow** (`vulnerability-details.spec.ts`)
   - Viewing vulnerability lists
   - Opening vulnerability detail modals
   - Displaying CVSS scores and affected components
   - Navigating to external sources (NVD/OSV)

4. **Settings Configuration Flow** (`settings.spec.ts`)
   - Changing theme and font size preferences
   - Configuring NVD API keys
   - Setting data retention periods
   - Resetting settings to defaults

5. **Navigation Flow** (`navigation.spec.ts`)
   - Navigating between dashboard and projects
   - Browser back/forward navigation
   - Tab navigation in project details
   - URL updates during navigation

## Prerequisites

- Node.js and npm installed
- Playwright browsers installed (run: `npx playwright install`)

## Running Tests

### Run all E2E tests (headless)

```bash
npm run test:e2e
```

### Run E2E tests in UI mode

```bash
npm run test:e2e:ui
```

### Run E2E tests in headed mode (with browser window)

```bash
npm run test:e2e:headed
```

### Debug E2E tests

```bash
npm run test:e2e:debug
```

### View HTML test report

```bash
npm run test:e2e:report
```

### Run specific test file

```bash
npx playwright test e2e/critical-flows/create-project.spec.ts
```

### Run tests in specific browser

```bash
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

## Test Structure

```
e2e/
├── critical-flows/
│   ├── create-project.spec.ts      # Project creation tests
│   ├── upload-sbom.spec.ts         # SBOM upload tests
│   ├── vulnerability-details.spec.ts # Vulnerability viewing tests
│   ├── settings.spec.ts            # Settings configuration tests
│   └── navigation.spec.ts          # Navigation tests
└── README.md                       # This file
```

## Configuration

Playwright is configured in `playwright.config.ts`:

- **Test directory**: `./e2e`
- **Browsers**: Chromium, Firefox, WebKit (Desktop)
- **Reporter**: HTML and list
- **Retries**: 2 in CI, 0 locally
- **Tracing**: On first retry
- **Screenshots**: On failure
- **Video**: Retain on failure

## Writing New Tests

When adding new E2E tests, follow these guidelines:

1. **Use descriptive test names** that explain what user action is being tested
2. **Group related tests** using `test.describe()`
3. **Use `test.beforeEach()`** to set up common test state
4. **Wait for elements** using `await expect(element).toBeVisible()`
5. **Use Playwright's locators** (`getByRole`, `getByText`, `getByLabel`) for accessible selectors
6. **Clean up test data** in `test.afterEach()` if needed

Example:

```typescript
import { test, expect } from '@playwright/test'

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should do something important', async ({ page }) => {
    // Arrange
    await page.getByRole('button', { name: 'Click me' }).click()

    // Assert
    await expect(page.getByText('Success')).toBeVisible()
  })
})
```

## Debugging Failed Tests

1. **Run with UI mode**: `npm run test:e2e:ui`
2. **Run in headed mode**: `npm run test:e2e:headed`
3. **Use debug mode**: `npm run test:e2e:debug`
4. **View trace**: After a failed test, view the trace in `playwright-report/index.html`
5. **Screenshots**: Failed test screenshots are saved in `test-results/`

## CI/CD Integration

The tests are configured to run optimally in CI:

- Parallel execution enabled
- 2 retries on failure
- Chromium, Firefox, and WebKit browsers
- HTML report generation
- Artifact retention for failed tests

## Known Limitations

1. **File Upload**: Some file upload tests use mock data instead of real files due to test environment limitations
2. **External Links**: Tests verify link attributes rather than actually navigating to external sites
3. **Vulnerability Scanning**: Real vulnerability scanning is mocked; tests focus on the UI flow

## Troubleshooting

### Tests timeout waiting for elements

- Increase timeout: `await expect(element).toBeVisible({ timeout: 10000 })`
- Check if the dev server is running properly

### "No elements found" errors

- Verify selectors match the actual DOM structure
- Use Playwright Inspector: `npx playwright codegen http://localhost:5173`

### Dev server not starting

- Ensure port 5173 is available
- Check Vite configuration
- Try starting dev server manually: `npm run dev:renderer`
