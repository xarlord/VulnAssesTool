# Dashboard Page Accessibility Audit

**Category:** accessibility
**Priority:** critical
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build`)
- Electron API mock file available at `e2e/mcp/shared/electron-mocks.js`

**MCP Tools Used:**

- `mcp__chrome-devtools__navigate_page`
- `mcp__chrome-devtools__lighthouse_audit`
- `mcp__chrome-devtools__take_snapshot`
- `mcp__chrome-devtools__take_screenshot`

---

## Steps

### Step 1: Navigate to Dashboard with Electron API Mocks

**Tool:** `mcp__chrome-devtools__navigate_page`
**Parameters:**

```json
{
  "type": "url",
  "url": "http://127.0.0.1:4173/",
  "initScript": "// Mock Electron API\n(function(){const e=document.currentScript;const s=document.createElement('script');s.src='file:///C:/Users/sefa.ocakli/VulnAssesTool/e2e/mcp/shared/electron-mocks.js';document.head.prepend(s);})();",
  "timeout": 15000
}
```

**Expected Result:** The Dashboard page loads at the root route `/`. The Electron API mock is injected before any application scripts, enabling the React app to initialize without errors. The page header with the app logo, Search button, and Settings button should be visible. The main content area shows the "New Project" quick action button, statistics cards, and the "Recent Projects" section (or the empty state with "No projects yet").
**Pass Criteria:** Page loads without JavaScript errors. The header and main content are rendered. The `electronAPI` mock is installed (visible in console logs as `[Mock] Electron API mock installed`).

---

### Step 2: Run Lighthouse Accessibility Audit

**Tool:** `mcp__chrome-devtools__lighthouse_audit`
**Parameters:**

```json
{
  "device": "desktop",
  "mode": "navigation"
}
```

**Expected Result:** Lighthouse runs a full navigation-based accessibility audit on the Dashboard page. The report includes scores for accessibility categories: button names, link names, color contrast, ARIA attributes, heading hierarchy, form element labels, and landmark regions.
**Pass Criteria:** Lighthouse accessibility score is >= 85 out of 100. No critical accessibility violations are reported (e.g., missing button names, insufficient color contrast, invalid ARIA roles).

---

### Step 3: Take Accessibility Snapshot

**Tool:** `mcp__chrome-devtools__take_snapshot`
**Parameters:**

```json
{
  "verbose": true
}
```

**Expected Result:** A full accessibility tree snapshot is captured showing all interactive and non-interactive elements. The snapshot should reveal:

- A "Skip to main content" skip link (hidden but focusable)
- A header landmark containing the app logo, Search button (`data-testid="nav-search"`), and Settings button
- A main landmark (`data-tour="dashboard"`) with quick action buttons including "New Project" (`data-tour="new-project-button"`), "Import SBOM", "Generate SBOM from Excel", "Export All", and "Executive Dashboard"
- Statistics cards with text labels ("Projects", "Critical", "High", "Total Vulnerabilities")
- Either project cards or the empty state with "No projects yet" text
- All `<button>` elements should have accessible names derived from their text content or `aria-label` attributes
  **Pass Criteria:** All buttons have discernible accessible names. Heading hierarchy follows a logical order (e.g., `h1` for page title or implied via header, `h2` for "Recent Projects", `h3` for empty state heading). No elements with missing or empty accessible names.

---

### Step 4: Take Screenshot for Visual Review

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "fullPage": true,
  "format": "png"
}
```

**Expected Result:** A full-page PNG screenshot is captured showing the complete Dashboard layout from top to bottom. The screenshot should visually confirm: readable text with sufficient contrast, properly styled buttons with visible text labels, statistics cards with clearly readable numbers, and correct application of the theme (light or dark based on system preference).
**Pass Criteria:** Screenshot shows a properly rendered page with no visual regressions. Text is legible against backgrounds. Buttons and interactive elements are visually distinguishable. Severity color coding (red for Critical, orange for High) is visible and meets contrast requirements.

---

## Assertions

| #   | Assertion                                               | Expected                                                 | Actual | Status |
| --- | ------------------------------------------------------- | -------------------------------------------------------- | ------ | ------ |
| 1   | Lighthouse accessibility score                          | >= 85                                                    |        |        |
| 2   | All `<button>` elements have accessible names           | Every `<button>` has non-empty accessible text           |        |        |
| 3   | Heading hierarchy is correct                            | No skipped heading levels (e.g., h1 -> h2, not h1 -> h3) |        |        |
| 4   | "Skip to main content" link is present in the a11y tree | Link exists with text "Skip to main content"             |        |        |
| 5   | Statistics card labels are associated with values       | Labels like "Projects", "Critical" are readable text     |        |        |
| 6   | Quick action buttons have discernible text              | "New Project", "Import SBOM", etc. are visible           |        |        |
| 7   | Color contrast meets WCAG AA standards                  | All text meets 4.5:1 contrast ratio                      |        |        |
| 8   | No critical Lighthouse accessibility violations         | Zero violations with severity "critical"                 |        |        |
| 9   | Page has valid landmark regions (header, main)          | `<header>` and `<main>` landmarks detected               |        |        |
| 10  | Empty state message is readable when no projects exist  | "No projects yet" text is present and accessible         |        |        |

---

## Results

| Step | Tool             | Status | Notes |
| ---- | ---------------- | ------ | ----- |
| 1    | navigate_page    |        |       |
| 2    | lighthouse_audit |        |       |
| 3    | take_snapshot    |        |       |
| 4    | take_screenshot  |        |       |

**Overall Status:** **\_\_\_\_**
**Tester:** **\_\_\_\_**
**Date:** **\_\_\_\_**
