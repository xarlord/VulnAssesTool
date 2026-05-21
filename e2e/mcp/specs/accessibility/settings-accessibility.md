# Settings Page Accessibility Audit

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

### Step 1: Navigate to Settings Page with Electron API Mocks

**Tool:** `mcp__chrome-devtools__navigate_page`
**Parameters:**

```json
{
  "type": "url",
  "url": "http://127.0.0.1:4173/settings",
  "initScript": "(function(){const m={ping:async()=>'pong','app-version':async()=>'2.0.0','app-platform':async()=>'win32','open-external':async()=>true,'nvd:search':async()=>({success:true,results:[],totalResults:0}),'nvd:getCve':async()=>({success:false}),'nvd:getStats':async()=>({success:true,stats:{dbSize:987000000,totalCves:331567}}),'osv:query':async()=>({success:true,results:[]}),'osv:getVulnerability':async()=>({success:false})};const SK='__mock_store__';const ds={'settings.theme':'system','settings.onboardingCompleted':true};const ms=localStorage.getItem(SK)?{...ds,...JSON.parse(localStorage.getItem(SK))}:{...ds};const el=new Map();const ae=(c,cb)=>{if(!el.has(c))el.set(c,new Set());el.get(c).add(cb)};const ee=(c,...a)=>{const l=el.get(c);if(l)l.forEach(cb=>cb(...a))};window.electronAPI={invoke:async(ch,...args)=>{if(m[ch])return m[ch](...args);return undefined},store:{get:async(k)=>ms[k],set:async(k,v)=>{ms[k]=v;localStorage.setItem(SK,JSON.stringify(ms))},delete:async(k)=>{delete ms[k];localStorage.setItem(SK,JSON.stringify(ms))}},secureStorage:{get:async()=>null,set:async()=>true,delete:async()=>true,has:async()=>false},getDatabaseStatus:async()=>({exists:true,path:'test',size:32768}),database:{getStats:async()=>({success:true,stats:{dbSize:32768,totalCves:0}}),getDetailedStats:async()=>({success:true,stats:{dbSize:987000000,totalCves:331567,totalCpes:2500000,lastUpdate:'2025-01-15'}}),getSyncConfig:async()=>({success:true,config:{}}),updateSyncConfig:async()=>({success:true}),updateStorageConfig:async()=>({success:true}),updatePerformanceConfig:async()=>({success:true}),cpeSearch:async()=>({success:true,results:[]}),reset:async()=>({success:true}),rebuildIndexes:async()=>({success:true}),sync:async()=>({success:true}),startDeltaSync:async()=>({success:true}),cancelSync:async()=>({success:true}),onSyncProgress:()=>()=>{},onSyncComplete:()=>()=>{},onSyncError:()=>()=>{},search:async()=>({success:true,results:[]}),getCve:async()=>({success:false})},platform:'win32',appVersion:'2.0.0',onMenuAction:cb=>ae('menu-action',cb),onUpdateAvailable:cb=>ae('update-available',cb),onProgress:cb=>ae('progress',cb),onNvdSyncProgress:cb=>ae('nvd-sync-progress',cb),onNvdSyncComplete:cb=>ae('nvd-sync-complete',cb),removeAllListeners:c=>el.delete(c),_emitEvent:ee};window.__mockCves=[];console.log('[Mock] Electron API mock installed')})()",
  "timeout": 15000
}
```

**Expected Result:** The Settings page loads at `/settings`. The page header displays a "Back" navigation link and the heading "Settings". The main content contains multiple settings sections: "Settings Profiles", "Appearance" (with theme and font size options), "API Configuration" (with NVD API Key input and auto-refresh toggle), "Database Management" (with statistics, sync controls, and storage management), "Backup & Recovery", "Performance Tuning", "Data Management", "Threat Intelligence", and "Danger Zone".
**Pass Criteria:** Page loads without JavaScript errors. All settings sections are rendered. Form controls (inputs, selects, toggle switches) are present and interactive. The `electronAPI` mock is installed.

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

**Expected Result:** Lighthouse runs a navigation-based accessibility audit on the Settings page. The report evaluates: form input labeling, select element associations, toggle switch ARIA roles, button names, heading structure, color contrast, and landmark regions.
**Pass Criteria:** Lighthouse accessibility score is >= 85 out of 100. No critical violations such as form inputs without labels, toggle switches missing ARIA roles, or buttons without discernible text.

---

### Step 3: Take Accessibility Snapshot

**Tool:** `mcp__chrome-devtools__take_snapshot`
**Parameters:**

```json
{
  "verbose": true
}
```

**Expected Result:** The accessibility tree snapshot reveals:

- A "Skip to main content" skip link
- A header landmark with the "Back" link and "Settings" heading (`<h1>`)
- A main landmark containing multiple sections, each with section headings (`<h2>`):
  - "Settings Profiles" section with a "Create New Profile" button
  - "Appearance" section with:
    - Theme label and three theme buttons ("light", "dark", "system")
    - Font Size label and three font size buttons ("small", "default", "large")
  - "API Configuration" section with:
    - An `<input>` element with `id="nvd-api-key"` and `aria-label="NVD API Key"`
    - A toggle switch with `role="switch"` and `aria-label="Toggle auto-refresh vulnerability data"`
  - "Database Management" section with:
    - Statistics display (CVEs, CPE Matches, Database Size, Last Sync)
    - A `<select>` with `id="sync-schedule"` and an associated `<label>`
    - "Sync Now" and "Bulk Download" buttons
    - A `<select>` with `id="max-database-size"` and an associated `<label>`
    - A toggle switch with `role="switch"` and `aria-label="Toggle prune old CVEs"`
  - "Backup & Recovery" section with "Create Backup" button and backup configuration
  - "Performance Tuning" section with `<select>` elements (`id="search-result-limit"`, `id="cache-size"`) and a toggle switch with `aria-label="Toggle search cache"`
  - "Data Management" section with `<select>` (`id="data-retention"`)
  - "Threat Intelligence" section with KEV statistics and "Sync Now" button
  - "Danger Zone" section with "Reset All Settings to Defaults" button
- All `<select>` elements should have accessible names from associated `<label>` elements via `htmlFor/id` matching
- All toggle switches should have `role="switch"` and `aria-checked` attributes
  **Pass Criteria:** Every form input and select has an associated label. Toggle switches have `role="switch"`, `aria-checked`, and `aria-label`. All buttons have discernible text. No unnamed interactive elements. Heading hierarchy follows `<h1>` (Settings) followed by `<h2>` for each section, `<h3>` for sub-sections.

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

**Expected Result:** A full-page PNG screenshot showing the complete Settings page layout from top to bottom. All sections should be visible with clear visual separation via borders and section headings. Form controls (text input for API key, select dropdowns, toggle switches) should be rendered in their appropriate states. The theme selector buttons should show visual representations (colored circles). The "Danger Zone" section should have a distinct destructive styling (red border/background).
**Pass Criteria:** All form sections are fully rendered and visually readable. Toggle switches are visually identifiable as toggle controls. Text contrast is sufficient throughout. The destructive styling of "Danger Zone" is visually distinct from other sections. No visual overlap or clipping of form elements.

---

## Assertions

| #   | Assertion                                                    | Expected                                                                                                                                                    | Actual | Status |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 1   | Lighthouse accessibility score                               | >= 85                                                                                                                                                       |        |        |
| 2   | NVD API Key input has an accessible label                    | Input has `id="nvd-api-key"`, `aria-label="NVD API Key"` and/or associated `<label>`                                                                        |        |        |
| 3   | Theme toggle buttons are accessible                          | Three buttons with text "light", "dark", "system" have discernible names                                                                                    |        |        |
| 4   | Auto-refresh toggle has correct ARIA                         | `role="switch"`, `aria-checked`, `aria-label` present                                                                                                       |        |        |
| 5   | All `<select>` elements have associated labels               | `id` attributes match `<label htmlFor>` for sync-schedule, max-database-size, prune-year, search-result-limit, cache-size, data-retention, backup-retention |        |        |
| 6   | "Create Backup" button has discernible text                  | Button text "Create Backup" is present                                                                                                                      |        |        |
| 7   | "Reset All Settings to Defaults" button has discernible text | Button text is present and accessible                                                                                                                       |        |        |
| 8   | Heading hierarchy is correct                                 | `<h1>` for "Settings", `<h2>` for sections, `<h3>` for sub-sections                                                                                         |        |        |
| 9   | No critical Lighthouse accessibility violations              | Zero violations with severity "critical"                                                                                                                    |        |        |
| 10  | Toggle switches for prune and search cache have ARIA roles   | `role="switch"`, `aria-checked`, `aria-label` on all toggle elements                                                                                        |        |        |

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
