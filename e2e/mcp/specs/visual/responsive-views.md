# Responsive Views Across Viewports

**Category:** visual
**Priority:** high
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build && npm run preview`)
- Electron API mock file at `e2e/mcp/shared/electron-mocks.js`

**MCP Tools Used:** `navigate_page`, `resize_page`, `take_screenshot`

---

## Steps

### Step 1: Navigate to Dashboard with Electron mocks

**Tool:** `mcp__chrome-devtools__navigate_page`
**Parameters:**

```json
{
  "type": "url",
  "url": "http://127.0.0.1:4173/",
  "initScript": "file://e2e/mcp/shared/electron-mocks.js"
}
```

**Pass Criteria:** Page loads without navigation errors; HTTP 200 response.

---

### Step 2: Capture Dashboard at mobile viewport (375x812)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 375, "height": 812 }
```

**Pass Criteria:** Page resizes without errors.

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/dashboard-375x812.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured successfully; no horizontal scrollbar visible.

---

### Step 3: Capture Dashboard at tablet viewport (768x1024)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 768, "height": 1024 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/dashboard-768x1024.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured successfully; layout adapts to tablet width.

---

### Step 4: Capture Dashboard at desktop viewport (1280x720)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 1280, "height": 720 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/dashboard-1280x720.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured successfully; full sidebar/navigation visible.

---

### Step 5: Capture Dashboard at large desktop viewport (1920x1080)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 1920, "height": 1080 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/dashboard-1920x1080.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured successfully; content fills viewport appropriately.

---

### Step 6: Navigate to Search page

**Tool:** `mcp__chrome-devtools__navigate_page`
**Parameters:**

```json
{
  "type": "url",
  "url": "http://127.0.0.1:4173/search",
  "initScript": "file://e2e/mcp/shared/electron-mocks.js"
}
```

**Pass Criteria:** Search page loads; URL is `/search`.

---

### Step 7: Capture Search at mobile viewport (375x812)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 375, "height": 812 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/search-375x812.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; search input and controls accessible at mobile width.

---

### Step 8: Capture Search at tablet viewport (768x1024)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 768, "height": 1024 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/search-768x1024.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; filters visible and usable.

---

### Step 9: Capture Search at desktop viewport (1280x720)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 1280, "height": 720 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/search-1280x720.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; results table/grid fully visible.

---

### Step 10: Capture Search at large desktop viewport (1920x1080)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 1920, "height": 1080 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/search-1920x1080.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; layout scales properly.

---

### Step 11: Navigate to Settings page

**Tool:** `mcp__chrome-devtools__navigate_page`
**Parameters:**

```json
{
  "type": "url",
  "url": "http://127.0.0.1:4173/settings",
  "initScript": "file://e2e/mcp/shared/electron-mocks.js"
}
```

**Pass Criteria:** Settings page loads; URL is `/settings`.

---

### Step 12: Capture Settings at mobile viewport (375x812)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 375, "height": 812 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/settings-375x812.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; settings form fields accessible without horizontal scroll.

---

### Step 13: Capture Settings at tablet viewport (768x1024)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 768, "height": 1024 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/settings-768x1024.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; form layout adapts to tablet width.

---

### Step 14: Capture Settings at desktop viewport (1280x720)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 1280, "height": 720 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/settings-1280x720.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; all settings sections visible.

---

### Step 15: Capture Settings at large desktop viewport (1920x1080)

**Tool:** `mcp__chrome-devtools__resize_page`
**Parameters:**

```json
{ "width": 1920, "height": 1080 }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/settings-1920x1080.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; layout centered or appropriately distributed.

---

### Step 16: Check for horizontal overflow at mobile width

**Tool:** `mcp__chrome-devtools__evaluate_script`
**Parameters:**

```json
{
  "function": "() => { return { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth } }"
}
```

**Pass Criteria:** `hasOverflow` is `false` for every route at every viewport. Run after each route+viewport combination if needed.

---

## Assertions

| #   | Assertion                                                        | Route(s)              | Severity |
| --- | ---------------------------------------------------------------- | --------------------- | -------- |
| A1  | All 12 screenshots captured without tool errors                  | /, /search, /settings | critical |
| A2  | No horizontal overflow (`scrollWidth <= clientWidth`) at 375px   | /, /search, /settings | critical |
| A3  | No horizontal overflow at 768px                                  | /, /search, /settings | high     |
| A4  | No horizontal overflow at 1280px                                 | /, /search, /settings | high     |
| A5  | No horizontal overflow at 1920px                                 | /, /search, /settings | medium   |
| A6  | Navigation/sidebar collapses to mobile menu at 375px             | /, /search, /settings | high     |
| A7  | Content remains readable at all viewport sizes (no clipped text) | /, /search, /settings | high     |

## Results

| Step | Status | Notes |
| ---- | ------ | ----- |
| 1    |        |       |
| 2    |        |       |
| 3    |        |       |
| 4    |        |       |
| 5    |        |       |
| 6    |        |       |
| 7    |        |       |
| 8    |        |       |
| 9    |        |       |
| 10   |        |       |
| 11   |        |       |
| 12   |        |       |
| 13   |        |       |
| 14   |        |       |
| 15   |        |       |
| 16   |        |       |

| Assertion | Status | Evidence |
| --------- | ------ | -------- |
| A1        |        |          |
| A2        |        |          |
| A3        |        |          |
| A4        |        |          |
| A5        |        |          |
| A6        |        |          |
| A7        |        |          |
