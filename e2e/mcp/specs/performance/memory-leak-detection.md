# Memory Leak Detection

**Category:** performance
**Priority:** high
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build`)

**MCP Tools Used:** mcp**chrome-devtools**navigate_page, mcp**chrome-devtools**take_memory_snapshot, mcp**chrome-devtools**evaluate_script

---

## Steps

### Step 1: Navigate to application with Electron mocks

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173"
- `initScript`: [contents of e2e/mcp/shared/electron-mocks.js]

**Expected Result:** Page loads with the dashboard visible and no console errors.
**Pass Criteria:** Dashboard renders, application is fully initialized.

### Step 2: Take baseline memory snapshot

**Tool:** mcp**chrome-devtools**take_memory_snapshot
**Parameters:**

- `filePath`: "e2e/mcp/results/heap/baseline.heapsnapshot"

**Expected Result:** A V8 heap snapshot is captured representing the initial memory state of the application after first load. The file is written to disk.
**Pass Criteria:** Snapshot file is created successfully at the specified path. File size indicates a valid heap dump.

### Step 3: Capture baseline heap size

**Tool:** mcp**chrome-devtools**evaluate_script
**Parameters:**

- `function`: >
  ```js
  ;() => {
    if (performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      }
    }
    return { usedJSHeapSize: 0, note: 'performance.memory not available' }
  }
  ```

**Expected Result:** Returns the current JS heap size in bytes. This value is stored as the baseline for comparison.
**Pass Criteria:** A positive numeric value is returned for usedJSHeapSize.

### Step 4: Navigation cycle 1 - Navigate to /search

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173/search"

**Expected Result:** SPA navigates to the search page.
**Pass Criteria:** Search page renders without errors.

### Step 5: Navigation cycle 1 - Navigate to /settings

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173/settings"

**Expected Result:** SPA navigates to the settings page.
**Pass Criteria:** Settings page renders without errors.

### Step 6: Navigation cycle 1 - Navigate back to /

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173"

**Expected Result:** SPA navigates back to the dashboard.
**Pass Criteria:** Dashboard renders without errors.

### Step 7: Navigation cycle 2 - Navigate to /search

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173/search"

**Expected Result:** SPA navigates to the search page (second cycle).
**Pass Criteria:** Search page renders without errors.

### Step 8: Navigation cycle 2 - Navigate to /settings

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173/settings"

**Expected Result:** SPA navigates to the settings page (second cycle).
**Pass Criteria:** Settings page renders without errors.

### Step 9: Navigation cycle 2 - Navigate back to /

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173"

**Expected Result:** SPA navigates back to the dashboard (second cycle).
**Pass Criteria:** Dashboard renders without errors.

### Step 10: Navigation cycle 3 - Navigate to /search

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173/search"

**Expected Result:** SPA navigates to the search page (third cycle).
**Pass Criteria:** Search page renders without errors.

### Step 11: Navigation cycle 3 - Navigate to /settings

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173/settings"

**Expected Result:** SPA navigates to the settings page (third cycle).
**Pass Criteria:** Settings page renders without errors.

### Step 12: Navigation cycle 3 - Navigate back to /

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173"

**Expected Result:** SPA navigates back to the dashboard (third cycle). Final route of the 10-navigation sequence.
**Pass Criteria:** Dashboard renders without errors. All 10 navigations completed: /, /search, /settings, /, /search, /settings, /, /search, /settings, /.

### Step 13: Take post-cycle memory snapshot

**Tool:** mcp**chrome-devtools**take_memory_snapshot
**Parameters:**

- `filePath`: "e2e/mcp/results/heap/post-cycle.heapsnapshot"

**Expected Result:** A second V8 heap snapshot is captured after the 10 navigation cycles. This represents the memory state after repeated route changes.
**Pass Criteria:** Snapshot file is created successfully at the specified path.

### Step 14: Capture post-cycle heap size and compute growth

**Tool:** mcp**chrome-devtools**evaluate_script
**Parameters:**

- `function`: >
  ```js
  ;() => {
    if (performance.memory) {
      const postSize = performance.memory.usedJSHeapSize
      return {
        usedJSHeapSize: postSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
      }
    }
    return { usedJSHeapSize: 0, note: 'performance.memory not available' }
  }
  ```

**Expected Result:** Returns the post-cycle JS heap size. Compare against the baseline value from Step 3.
**Pass Criteria:** Heap growth (postSize - baselineSize) is less than 5MB (5,242,880 bytes).

### Step 15: Store comparison results on window for reporting

**Tool:** mcp**chrome-devtools**evaluate_script
**Parameters:**

- `function`: >
  ```js
  ;() => {
    const growth = window.__postHeapSize - window.__baselineHeapSize
    window.__heapComparison = {
      baseline: window.__baselineHeapSize,
      post: window.__postHeapSize,
      growth: growth,
      growthMB: (growth / (1024 * 1024)).toFixed(2),
      passed: growth < 5 * 1024 * 1024,
    }
    return window.__heapComparison
  }
  ```

**Expected Result:** A comparison object is stored on window containing baseline, post-cycle, growth in bytes, growth in MB, and a boolean pass/fail flag.
**Pass Criteria:** `window.__heapComparison.passed` is `true`, confirming heap growth < 5MB.

---

## Assertions

| #   | Assertion                                        | Tool                         | Pass Criteria                                                          |
| --- | ------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------- |
| 1   | Application loads and initializes                | navigate_page                | Dashboard visible, no errors                                           |
| 2   | Baseline heap snapshot captured                  | take_memory_snapshot         | File exists at e2e/mcp/results/heap/baseline.heapsnapshot              |
| 3   | Baseline heap size recorded                      | evaluate_script              | Positive numeric usedJSHeapSize returned                               |
| 4   | All 10 navigation cycles complete without errors | navigate_page (x10)          | Each route renders, zero error console messages across all navigations |
| 5   | Post-cycle heap snapshot captured                | take_memory_snapshot         | File exists at e2e/mcp/results/heap/post-cycle.heapsnapshot            |
| 6   | Post-cycle heap size recorded                    | evaluate_script              | Positive numeric usedJSHeapSize returned                               |
| 7   | Heap growth is within acceptable bounds          | evaluate_script (comparison) | Heap growth < 5MB (5,242,880 bytes)                                    |
| 8   | Comparison results stored for reporting          | evaluate_script              | window.\_\_heapComparison contains valid data with passed=true         |

---

## Results

_This section is filled in during execution._

| Step | Status | Details | Screenshot |
| ---- | ------ | ------- | ---------- |
| 1    |        |         |            |
| 2    |        |         |            |
| 3    |        |         |            |
| 4    |        |         |            |
| 5    |        |         |            |
| 6    |        |         |            |
| 7    |        |         |            |
| 8    |        |         |            |
| 9    |        |         |            |
| 10   |        |         |            |
| 11   |        |         |            |
| 12   |        |         |            |
| 13   |        |         |            |
| 14   |        |         |            |
| 15   |        |         |            |
