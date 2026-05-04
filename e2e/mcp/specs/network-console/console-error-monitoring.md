# Console Error Monitoring

**Category:** network-console
**Priority:** high
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build && npm run preview`)
- Electron API mock file at `e2e/mcp/shared/electron-mocks.js`

**MCP Tools Used:** `navigate_page`, `list_console_messages`, `get_console_message`

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

### Step 2: Collect console errors and warnings from Dashboard

**Tool:** `mcp__chrome-devtools__list_console_messages`
**Parameters:**

```json
{ "types": ["error", "warn"] }
```

**Pass Criteria:** Response returns a list; record total error count and warning count.

---

### Step 3: Inspect each error message for root cause (Dashboard)

**Tool:** `mcp__chrome-devtools__get_console_message`
**Parameters:**

```json
{ "msgid": "<msgid from Step 2>" }
```

**Pass Criteria:** For each error, record the message text, source file, and line number. Repeat for every error found.

**Note:** If no errors exist, skip this step.

---

### Step 4: Check for React hydration errors on Dashboard

**Tool:** `mcp__chrome-devtools__list_console_messages`
**Parameters:**

```json
{ "types": ["error"] }
```

**Pass Criteria:** No messages containing "hydration", "Text content did not match", or "There was an error while hydrating".

**Tool:** `mcp__chrome-devtools__evaluate_script`
**Parameters:**

```json
{
  "function": "() => { const root = document.getElementById('root'); return { hasRoot: !!root, childCount: root ? root.childElementCount : 0, innerHTML: root ? root.innerHTML.substring(0, 200) : 'N/A' } }"
}
```

**Pass Criteria:** Root element exists and has rendered content; no SSR/client mismatch.

---

### Step 5: Navigate to Search page

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

### Step 6: Collect console errors and warnings from Search

**Tool:** `mcp__chrome-devtools__list_console_messages`
**Parameters:**

```json
{ "types": ["error", "warn"] }
```

**Pass Criteria:** Response returns a list; record total error count and warning count.

---

### Step 7: Inspect each error message for root cause (Search)

**Tool:** `mcp__chrome-devtools__get_console_message`
**Parameters:**

```json
{ "msgid": "<msgid from Step 6>" }
```

**Pass Criteria:** For each error, record the message text, source file, and line number. Repeat for every error found.

**Note:** If no errors exist, skip this step.

---

### Step 8: Check for React hydration errors on Search

**Tool:** `mcp__chrome-devtools__list_console_messages`
**Parameters:**

```json
{ "types": ["error"] }
```

**Pass Criteria:** No messages containing "hydration", "Text content did not match", or "There was an error while hydrating".

---

### Step 9: Navigate to Settings page

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

### Step 10: Collect console errors and warnings from Settings

**Tool:** `mcp__chrome-devtools__list_console_messages`
**Parameters:**

```json
{ "types": ["error", "warn"] }
```

**Pass Criteria:** Response returns a list; record total error count and warning count.

---

### Step 11: Inspect each error message for root cause (Settings)

**Tool:** `mcp__chrome-devtools__get_console_message`
**Parameters:**

```json
{ "msgid": "<msgid from Step 10>" }
```

**Pass Criteria:** For each error, record the message text, source file, and line number. Repeat for every error found.

**Note:** If no errors exist, skip this step.

---

### Step 12: Check for React hydration errors on Settings

**Tool:** `mcp__chrome-devtools__list_console_messages`
**Parameters:**

```json
{ "types": ["error"] }
```

**Pass Criteria:** No messages containing "hydration", "Text content did not match", or "There was an error while hydrating".

---

### Step 13: Aggregate console message counts across all routes

**Tool:** (manual aggregation from Steps 2, 6, 10)

Record the following summary:

| Route     | Error Count | Warning Count | Hydration Errors |
| --------- | ----------- | ------------- | ---------------- |
| /         |             |               |                  |
| /search   |             |               |                  |
| /settings |             |               |                  |

**Pass Criteria:** Totals meet assertion thresholds.

---

## Assertions

| #   | Assertion                                             | Route(s)              | Severity |
| --- | ----------------------------------------------------- | --------------------- | -------- |
| A1  | Zero console errors on any route                      | /, /search, /settings | critical |
| A2  | Fewer than 5 console warnings per page                | /, /search, /settings | high     |
| A3  | No React hydration mismatch errors                    | /, /search, /settings | critical |
| A4  | No uncaught exception errors                          | /, /search, /settings | critical |
| A5  | No "Cannot read properties of undefined" errors       | /, /search, /settings | critical |
| A6  | No failed module import errors                        | /, /search, /settings | high     |
| A7  | No duplicate key warnings in React lists              | /, /search, /settings | medium   |
| A8  | All routes render content (root element has children) | /, /search, /settings | critical |

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

| Assertion | Status | Evidence |
| --------- | ------ | -------- |
| A1        |        |          |
| A2        |        |          |
| A3        |        |          |
| A4        |        |          |
| A5        |        |          |
| A6        |        |          |
| A7        |        |          |
| A8        |        |          |
