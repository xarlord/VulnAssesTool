# Project Detail Page Accessibility Audit

**Category:** accessibility
**Priority:** high
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build`)
- Electron API mock file available at `e2e/mcp/shared/electron-mocks.js`
- A project must exist in the store before navigating to the project detail page

**MCP Tools Used:**

- `mcp__chrome-devtools__navigate_page`
- `mcp__chrome-devtools__take_snapshot`
- `mcp__chrome-devtools__click`
- `mcp__chrome-devtools__fill`
- `mcp__chrome-devtools__wait_for`
- `mcp__chrome-devtools__lighthouse_audit`
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

**Expected Result:** The Dashboard page loads successfully. The "New Project" button (`data-tour="new-project-button"`) is visible in the quick actions area.
**Pass Criteria:** Page loads without errors. The "New Project" button is present in the accessibility tree and clickable.

---

### Step 2: Click "New Project" Button to Open Create Dialog

**Tool:** `mcp__chrome-devtools__click`
**Parameters:**

```json
{
  "uid": "<uid of 'New Project' button from snapshot>",
  "includeSnapshot": true
}
```

**Expected Result:** The Create Project Dialog opens as a modal overlay. The dialog should contain:

- A heading such as "Create New Project" or "New Project"
- A text input field for the project name with an associated label
- An optional description textarea
- "Cancel" and "Create Project" (or "Create") buttons
  The updated snapshot should show the dialog elements above the dashboard content.
  **Pass Criteria:** The dialog modal is open. The project name input is focusable. The "Create Project" button is present and enabled (or disabled if name is required).

---

### Step 3: Fill in the Project Name

**Tool:** `mcp__chrome-devtools__fill`
**Parameters:**

```json
{
  "uid": "<uid of project name input from snapshot>",
  "value": "Accessibility Test Project",
  "includeSnapshot": true
}
```

**Expected Result:** The project name input is populated with the text "Accessibility Test Project". The "Create Project" button should become enabled if it was previously disabled due to empty name validation.
**Pass Criteria:** The input value is set correctly. The create button is now clickable.

---

### Step 4: Click "Create Project" Button

**Tool:** `mcp__chrome-devtools__click`
**Parameters:**

```json
{
  "uid": "<uid of 'Create Project' or 'Create' button from snapshot>",
  "includeSnapshot": false
}
```

**Expected Result:** The dialog closes and a new project card appears in the "Recent Projects" list on the Dashboard. The project card displays the name "Accessibility Test Project".
**Pass Criteria:** Dialog is dismissed. A project card with the text "Accessibility Test Project" is visible in the snapshot.

---

### Step 5: Click the Project Card to Navigate to Project Detail

**Tool:** `mcp__chrome-devtools__click`
**Parameters:**

```json
{
  "uid": "<uid of the newly created project card from snapshot>",
  "includeSnapshot": false
}
```

**Expected Result:** Navigation to the Project Detail page occurs at `/project/<projectId>`. The page loads with:

- A header containing a back button (`aria-label="back"`), the project name "Accessibility Test Project", and action buttons (Scan, Export, False Positive Filter, Delete)
- A tab navigation bar with four tabs: "Overview", "Components", "Vulnerabilities", "Health"
- The Overview tab content is displayed by default

**Tool (alternative if click does not navigate):** `mcp__chrome-devtools__wait_for`

```json
{
  "text": ["Overview", "Components", "Vulnerabilities", "Health"],
  "timeout": 10000
}
```

**Pass Criteria:** The URL changes to `/project/<projectId>`. The project detail header, tab navigation, and tab content are rendered. The "Overview" tab appears active by default.

---

### Step 6: Run Lighthouse Accessibility Audit on Project Detail

**Tool:** `mcp__chrome-devtools__lighthouse_audit`
**Parameters:**

```json
{
  "device": "desktop",
  "mode": "navigation"
}
```

**Note:** The Lighthouse audit will reload the page. Since the project data is persisted in localStorage via the Electron mocks, the project should still exist after reload. However, if the route requires a project ID in the URL, the navigation will target the current URL automatically.
**Expected Result:** Lighthouse runs a navigation-based accessibility audit on the Project Detail page. The report evaluates: tab navigation ARIA roles, button names, heading hierarchy, color contrast of severity badges, form element labeling, and landmark regions.
**Pass Criteria:** Lighthouse accessibility score is >= 85 out of 100. No critical violations.

---

### Step 7: Take Accessibility Snapshot

**Tool:** `mcp__chrome-devtools__take_snapshot`
**Parameters:**

```json
{
  "verbose": true
}
```

**Expected Result:** The accessibility tree snapshot reveals:

- A "Skip to main content" skip link
- A header landmark containing:
  - A back button with `aria-label="back"` and an ArrowLeft icon
  - The project name "Accessibility Test Project" as a heading or bold text
  - An "Edit" button
  - Action buttons: "Scan for Vulnerabilities", "Export", "False Positive Filter", "Delete"
- A main landmark with:
  - A tab navigation container (`role="tablist"`) containing four tab buttons:
    - "Overview" tab with `role="tab"` and `aria-selected="true"`
    - "Components" tab with `role="tab"` and `aria-selected="false"`
    - "Vulnerabilities" tab with `role="tab"` and `aria-selected="false"`
    - "Health" tab with `role="tab"` and `aria-selected="false"`
  - The Overview tab panel content showing statistics cards (Components, Critical, High, Total Vulns), SBOM Files section, and Project Information metadata
- Severity badges in statistics cards should have sufficient color contrast:
  - Critical: red/destructive color
  - High: orange color
  - Total Vulns: default text color
    **Pass Criteria:** Tab buttons have `role="tab"` and `aria-selected` attributes. The active tab has `aria-selected="true"` and inactive tabs have `aria-selected="false"`. All action buttons have discernible text. The back button has `aria-label="back"`. Severity badge colors meet WCAG AA contrast requirements. Heading hierarchy is logical.

---

### Step 8: Take Screenshot for Visual Review

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "fullPage": true,
  "format": "png"
}
```

**Expected Result:** A full-page PNG screenshot showing the Project Detail page. The tab bar should clearly indicate the active tab (with a bottom border highlight). Statistics cards should display with proper color coding. The SBOM Files section and Project Information section should be visible below the statistics.
**Pass Criteria:** The active tab is visually distinct from inactive tabs. Severity colors (red for Critical, orange for High) are visible and provide sufficient contrast against the card background. All action buttons in the header are readable. The page layout does not clip or overflow.

---

## Assertions

| #   | Assertion                                       | Expected                                                              | Actual | Status |
| --- | ----------------------------------------------- | --------------------------------------------------------------------- | ------ | ------ |
| 1   | Lighthouse accessibility score                  | >= 85                                                                 |        |        |
| 2   | Tab buttons have correct ARIA roles             | Each tab has `role="tab"` attribute                                   |        |        |
| 3   | Active tab has `aria-selected="true"`           | The Overview tab has `aria-selected="true"` by default                |        |        |
| 4   | Inactive tabs have `aria-selected="false"`      | Components, Vulnerabilities, Health tabs have `aria-selected="false"` |        |        |
| 5   | Back button has accessible label                | `aria-label="back"` is present on the back navigation button          |        |        |
| 6   | Action buttons have discernible text            | "Scan for Vulnerabilities", "Export", "Delete" have text labels       |        |        |
| 7   | Severity badge colors have sufficient contrast  | Red (Critical) and orange (High) meet WCAG AA contrast ratio          |        |        |
| 8   | Tab panel content is associated with tabs       | Tab content changes when tabs are clicked                             |        |        |
| 9   | Heading hierarchy is correct                    | `<h1>` for project name, `<h2>` for sections, `<h3>` for sub-sections |        |        |
| 10  | No critical Lighthouse accessibility violations | Zero violations with severity "critical"                              |        |        |

---

## Results

| Step | Tool             | Status | Notes |
| ---- | ---------------- | ------ | ----- |
| 1    | navigate_page    |        |       |
| 2    | click            |        |       |
| 3    | fill             |        |       |
| 4    | click            |        |       |
| 5    | click / wait_for |        |       |
| 6    | lighthouse_audit |        |       |
| 7    | take_snapshot    |        |       |
| 8    | take_screenshot  |        |       |

**Overall Status:** **\_\_\_\_**
**Tester:** **\_\_\_\_**
**Date:** **\_\_\_\_**
