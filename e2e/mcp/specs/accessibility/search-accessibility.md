# Search Page Accessibility Audit

**Category:** accessibility
**Priority:** high
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

### Step 1: Navigate to Search Page with Electron API Mocks

**Tool:** `mcp__chrome-devtools__navigate_page`
**Parameters:**

```json
{
  "type": "url",
  "url": "http://127.0.0.1:4173/search",
  "initScript": "// Mock Electron API\n(function(){const e=document.currentScript;const s=document.createElement('script');s.src='file:///C:/Users/sefa.ocakli/VulnAssesTool/e2e/mcp/shared/electron-mocks.js';document.head.prepend(s);})();",
  "timeout": 15000
}
```

**Expected Result:** The Search page loads at `/search`. The page header displays the heading "Search" with the subtitle "Search across all projects, components, and vulnerabilities". The search mode toggle ("Project Search" / "NVD Database") is visible. The search input field (`data-testid="nvd-search-input"`) is rendered and auto-focused. A "Start searching" empty state with search tips is displayed below the input.
**Pass Criteria:** Page loads without JavaScript errors. The search input is present and focusable. Both mode toggle buttons ("Project Search" and "NVD Database") are rendered and clickable. The `electronAPI` mock is installed.

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

**Expected Result:** Lighthouse runs a navigation-based accessibility audit on the Search page. The report evaluates: input field labeling, button accessible names, link contrast, ARIA usage on the search mode toggle, keyboard accessibility of interactive elements, and landmark structure.
**Pass Criteria:** Lighthouse accessibility score is >= 85 out of 100. No critical violations such as missing input labels, buttons without names, or keyboard traps.

---

### Step 3: Take Accessibility Snapshot

**Tool:** `mcp__chrome-devtools__take_snapshot`
**Parameters:**

```json
{
  "verbose": true
}
```

**Expected Result:** The accessibility tree snapshot reveals the following structure:

- A "Skip to main content" skip link
- A header landmark with the "Search" heading (`<h1>`)
- A main landmark containing:
  - The search mode toggle group with two buttons: "Project Search" (with Shield icon) and "NVD Database" (with Database icon)
  - The search input field (`type="text"`) which should have an accessible name via `aria-label`, associated `<label>`, or `placeholder` text
  - The "Clear search" button (`aria-label="Clear search"`) which is only visible when the input has a value
  - The "Start searching" empty state
  - The search tips section with heading and list items
- The search input should have a role of `textbox` and an accessible name
  **Pass Criteria:** The search input has an accessible name (from `placeholder`, `aria-label`, or associated `<label>`). Both mode toggle buttons have discernible text content. The "Clear search" button has `aria-label="Clear search"`. No unnamed interactive elements exist. Heading hierarchy is correct (h1 for page heading, h2/h3 for section headings in tips).

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

**Expected Result:** A full-page PNG screenshot showing the Search page layout. The search input should be prominently displayed with a search icon on the left. The mode toggle should clearly indicate which mode is active (visually distinct background/shadow on the active button). The empty state and search tips should be visible below the input with readable text.
**Pass Criteria:** The search input is clearly visible and occupies appropriate width. The mode toggle buttons are visually distinguishable (active vs. inactive state). Text contrast is sufficient for readability. The search icon inside the input provides a visual cue for the input purpose.

---

## Assertions

| #   | Assertion                                           | Expected                                                             | Actual | Status |
| --- | --------------------------------------------------- | -------------------------------------------------------------------- | ------ | ------ |
| 1   | Lighthouse accessibility score                      | >= 85                                                                |        |        |
| 2   | Search input has an accessible name                 | Input has `aria-label`, associated `<label>`, or `placeholder`       |        |        |
| 3   | Search mode toggle buttons are accessible           | Both buttons have discernible text: "Project Search", "NVD Database" |        |        |
| 4   | "Clear search" button has `aria-label`              | `aria-label="Clear search"` is present                               |        |        |
| 5   | Heading hierarchy is correct                        | `<h1>` for "Search", headings follow logical order                   |        |        |
| 6   | No critical Lighthouse accessibility violations     | Zero violations with severity "critical"                             |        |        |
| 7   | Search tips content is accessible                   | List items in tips section are readable in the a11y tree             |        |        |
| 8   | Keyboard focus can reach the search input           | Input is focusable via Tab navigation                                |        |        |
| 9   | Page has valid landmark regions (header, main)      | `<header>` and `<main>` landmarks detected                           |        |        |
| 10  | Color contrast meets WCAG AA standards for all text | All text meets 4.5:1 contrast ratio                                  |        |        |

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
