# Phase 4: Cucumber.js with Vitest Configuration - Summary

## Overview

Successfully set up Cucumber.js with Vitest for Behavior-Driven Development (BDD) testing in the VulnAssessTool project. The configuration includes TypeScript support, parallel execution, HTML reporting, and comprehensive test lifecycle management.

## Packages Installed

The following packages were added to `devDependencies`:

| Package | Version | Purpose |
|---------|---------|---------|
| `@cucumber/cucumber` | ^12.6.0 | Core Cucumber.js framework |
| `@cucumber/pretty-formatter` | ^3.0.0 | Pretty test output formatting |
| `ts-node` | ^10.9.2 | TypeScript runtime for Cucumber |

## Configuration Files Created

### 1. Root Configuration Files

#### `cucumber.config.ts`
**Location:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\cucumber.config.ts`

**Features:**
- Loads feature files from `tests/bdd/features/**/*.feature`
- Loads step definitions from `tests/bdd/step-definitions/**/*.ts`
- TypeScript support via `ts-node/register`
- Multiple formatters (HTML, pretty, summary)
- Colored output with custom theme
- Parallel execution support
- Configurable profiles (default, parallel, html, pretty)
- Retry configuration for failing tests
- Custom timeout settings

#### `vitest.config.ts`
**Location:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\vitest.config.ts`

**Features:**
- Vitest configuration with React plugin
- jsdom environment for DOM testing
- Coverage thresholds (60% for statements, branches, functions, lines)
- Multiple reporters (verbose, JSON, HTML)
- Path aliases for clean imports (@, @tests, @shared)
- Thread pool configuration
- BDD test exclusion to avoid conflicts
- Test setup file integration

#### `tests/setup.ts`
**Location:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\setup.ts`

**Features:**
- React Testing Library integration
- Automatic cleanup after each test
- Mock implementations for browser APIs (matchMedia, IntersectionObserver, ResizeObserver)
- Console method mocking
- Test isolation setup

### 2. BDD Support Files

#### `tests/bdd/tsconfig.json`
**Location:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\tsconfig.json`

**Features:**
- TypeScript configuration for BDD tests
- Module resolution (NodeNext)
- Type definitions for Cucumber, Node, and Vitest
- Path aliases for clean imports
- ts-node specific settings
- Transpile-only mode for faster execution

#### `tests/bdd/support/world.ts`
**Location:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\support\world.ts`

**Features:**
- Custom World class extending Cucumber's World
- Browser and page management (Playwright integration)
- Test data storage (Map-based key-value store)
- Scenario state management
- Error tracking across test steps
- Screenshot capture functionality
- Video recording support
- Resource cleanup
- Configuration management (baseURL, timeout, screenshots, headless)

**Key Methods:**
- `initBrowser()` - Initialize Playwright browser
- `navigateTo(url)` - Navigate to URL
- `takeScreenshot(name)` - Capture screenshot
- `set(key, value)` / `get(key)` - Test data storage
- `setState(key, value)` / `getState(key)` - Scenario state
- `addError(error)` / `getErrors()` - Error tracking
- `cleanup()` - Resource cleanup
- `reset()` - Reset world state

#### `tests/bdd/support/hooks.ts`
**Location:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\support\hooks.ts`

**Features:**
- **BeforeAll/AfterAll hooks** - Suite-level setup/teardown
  - Log test suite start/completion
  - Cleanup test databases after all tests

- **Before/After hooks** - Scenario-level setup/teardown
  - Initialize browser before each scenario
  - Store scenario metadata (name, feature, tags)
  - Screenshot capture on failure
  - Resource cleanup after each scenario
  - World state reset

- **BeforeStep/AfterStep hooks** - Step-level hooks
  - Log step execution
  - Tag-based timeout configuration (@slow, @very-slow)
  - Screenshot capture on step failure
  - Error tracking

- **Tag-specific hooks**
  - `@api` - API test environment setup
  - `@ui` - UI test environment setup with network idle wait
  - `@database` - Database test environment setup

### 3. Sample Test Files

#### `tests/bdd/features/example.feature`
**Location:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\features\example.feature`

**Contents:**
- Example feature file demonstrating Gherkin syntax
- Sample scenarios with tags (@smoke, @test, @ui, @slow)
- Template for writing new features

#### `tests/bdd/step-definitions/example.steps.ts`
**Location:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\step-definitions\example.steps.ts`

**Contents:**
- Example step definitions demonstrating World context usage
- Shows proper TypeScript typing with CustomWorld
- Demonstrates test data storage and retrieval
- Uses @vitest/expect for assertions

#### `tests/bdd/README.md`
**Location:** `C:\Users\sefa.ocakli\VulnAssesTool\vuln-assess-tool\tests\bdd\README.md`

**Contents:**
- Comprehensive documentation for BDD testing
- Directory structure explanation
- Running tests instructions
- Writing feature files guide
- Writing step definitions guide
- Tags reference
- World context API documentation
- Configuration reference
- Troubleshooting guide
- Best practices

## NPM Scripts Added

Updated `package.json` with the following scripts:

```json
"test:bdd": "cucumber-js",
"test:bdd:parallel": "cucumber-js --parallel",
"test:bdd:html": "cucumber-js --profile html",
"test:bdd:pretty": "cucumber-js --profile pretty",
"test:bdd:tags": "cucumber-js --tags"
```

## Directory Structure

```
tests/bdd/
├── features/                 # Feature files (.feature)
│   └── example.feature      # Example feature file
├── step-definitions/         # Step definition implementations
│   └── example.steps.ts     # Example step definitions
├── support/                 # Support files
│   ├── world.ts            # Custom World class
│   └── hooks.ts            # Lifecycle hooks
├── tsconfig.json           # TypeScript configuration
└── README.md              # Documentation
```

## Configuration Highlights

### TypeScript Support
- Full TypeScript support with type definitions
- ts-node for runtime TypeScript compilation
- Path aliases for clean imports
- Type-safe step definitions

### Parallel Execution
- Enabled via `CUCUMBER_PARALLEL` environment variable
- Configurable thread pool
- Profile for parallel execution settings

### Reporting
- HTML reports with pretty formatting
- Text-based summaries
- Screenshot capture on failures
- Video recording support (optional)
- Custom colored output theme

### Test Organization
- Tag-based test filtering
- Multiple test profiles
- Scenario-level metadata
- Feature-level organization

### Test Lifecycle
- Comprehensive before/after hooks
- Suite, scenario, and step-level hooks
- Tag-specific hook execution
- Automatic resource cleanup
- Database cleanup between scenarios

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `BASE_URL` | http://localhost:5173 | UI test base URL |
| `API_BASE_URL` | http://localhost:3000 | API test base URL |
| `TEST_TIMEOUT` | 10000 | Default test timeout (ms) |
| `SCREENSHOTS` | true | Enable screenshot capture |
| `HEADLESS` | true | Run browser in headless mode |
| `CUCUMBER_PARALLEL` | false | Enable parallel execution |

## Tags Reference

| Tag | Purpose | Timeout |
|-----|---------|---------|
| `@smoke` | Critical smoke tests | Default |
| `@ui` | UI-based tests | Default |
| `@api` | API tests | Default |
| `@database` | Database tests | Default |
| `@slow` | Slow-running tests | 60s |
| `@very-slow` | Very slow tests | 120s |
| `@retry` | Tests to retry on failure | Default |

## Test Report Locations

Reports are generated in `test-results/`:

- `cucumber-report.html` - Interactive HTML report
- `cucumber-pretty.txt` - Pretty formatted text report
- `cucumber-summary.txt` - Test execution summary
- `screenshots/` - Failure screenshots
- `videos/` - Test recordings (if enabled)

## Next Steps

1. **Write Feature Files:** Create `.feature` files in `tests/bdd/features/`
2. **Implement Steps:** Write step definitions in `tests/bdd/step-definitions/`
3. **Run Tests:** Execute tests using `npm run test:bdd`
4. **Review Reports:** Check HTML reports in `test-results/cucumber-report.html`
5. **Extend World:** Add custom methods to `world.ts` as needed
6. **Add Hooks:** Create tag-specific hooks in `hooks.ts` for special cases

## Verification

To verify the setup:

```bash
# Run example BDD tests
npm run test:bdd

# Run with pretty output
npm run test:bdd:pretty

# Run with HTML report
npm run test:bdd:html

# Run by tag
npm run test:bdd:tags "@smoke"
```

## Summary

Phase 4 successfully established a comprehensive BDD testing infrastructure with:

- **Complete Cucumber.js integration** with TypeScript support
- **Vitest configuration** for unit testing alongside BDD tests
- **Custom World class** for test context management
- **Comprehensive hooks** for test lifecycle management
- **Multiple reporting formats** (HTML, pretty, summary)
- **Parallel execution support** for faster test runs
- **Tag-based organization** for flexible test selection
- **Playwright integration** for UI testing
- **Database cleanup** for isolated test runs
- **Screenshot and video capture** for debugging
- **Complete documentation** for developers

The setup is production-ready and follows best practices for BDD testing in TypeScript projects.
