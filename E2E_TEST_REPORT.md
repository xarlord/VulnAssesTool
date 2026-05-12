# E2E Test Report

**Date:** 2026-04-17
**Framework:** Playwright (Electron)
**Branch:** feature/v2-phase3-ux
**Duration:** 15.0 minutes (timed out at global timeout)
**Total Tests:** 505

## Test Summary

| Status        | Count   |
| ------------- | ------- |
| Passed        | 225     |
| Skipped       | 13      |
| Did Not Run   | 267     |
| **Total Ran** | **238** |

## Results by Project

| Project                   | Passed | Skipped | Did Not Run |
| ------------------------- | ------ | ------- | ----------- |
| electron (critical-flows) | 153    | 10      | 0           |
| features                  | 72     | 0       | ~20         |
| workflows                 | 0      | 0       | ~30         |
| visual                    | 0      | 0       | ~1          |

> **Note:** The test suite hit the 900s global timeout. The `features` and `workflows` projects did not fully execute.

## Skipped Tests (13)

### critical-flows/create-project.spec.ts

- `should cancel project creation with Escape` - React event handling issue

### critical-flows/database-settings.spec.ts

- `should toggle prune old CVEs option`
- `should show prune year dropdown when prune is enabled`
- `should toggle search cache option`
- `should show cache size dropdown when cache is enabled`

### critical-flows/fpf-comprehensive.spec.ts

- `should run filter and handle empty vulnerabilities`
- `should toggle configuration panel`

### critical-flows/fpf.spec.ts

- `should navigate to FPF page from project detail`
- `should navigate to FPF page from dashboard card`
- `should display FPF dashboard with tabs`
- `should show empty state on Review Filtered tab`
- `should display configuration wizard`

### critical-flows/upload-sbom.spec.ts

- `should close upload dialog with Escape`

## Notable Issues

### 1. Global Timeout

The test suite exceeded the 15-minute global timeout. Only 238 of 505 tests ran. The `workflows` and `visual` projects never started execution.

### 2. FPF Navigation Tests (5 skipped)

Multiple FPF (False Positive Filter) navigation tests are skipped, indicating potential routing or state management issues in the FPF feature.

### 3. Escape Key Handling (2 skipped)

Tests for closing dialogs with Escape key are consistently skipped, suggesting a systematic issue with keyboard event handling in dialogs.

### 4. Toggle/State Tests (4 skipped)

Database settings toggle tests are skipped, indicating potential issues with toggle state management in the settings UI.

## Build Warnings

Several import warnings during build (non-blocking):

- `DriveStep`, `Config` not exported from driver.js (type-only imports)
- `GraphNodeData`, `DependencyGraphProps` not exported from graph types
- `Core`, `NodeSingular`, `EventObject` not exported from cytoscape
- Large chunks: `index-Bq2kvZY2.js` (684 kB), `DependencyGraphPage` (464 kB), `Dashboard` (455 kB)

## Recommendations

1. **Increase global timeout** or split test suite into smaller runs
2. **Fix Escape key handling** - affects multiple dialog tests
3. **Fix FPF navigation** - 5 skipped tests in this area
4. **Fix database settings toggles** - state management issue
5. **Optimize bundle size** - several chunks exceed 500 kB

## Test Quality Review

### Strengths

- Well-organized by category (critical-flows, features, workflows, visual)
- Good timeout constants (E2E_DEFAULT_TIMEOUT, E2E_SELECTOR_TIMEOUT)
- Consistent beforeEach reset via `resetAppState()`
- Comprehensive Electron API mocking in `electron-helper.ts`

### Issues Found

- **Loose assertions**: Many tests use patterns like `expect(hasResults || true).toBe(true)` that always pass
- **Excessive `waitForTimeout()`**: Magic number delays (500ms, 1000ms) instead of explicit waits
- **No Page Object Models**: Selectors duplicated across files
- **Incomplete fixtures**: Several helper functions are TODO placeholders
- **Shared page instance**: `_page` state can leak between tests
