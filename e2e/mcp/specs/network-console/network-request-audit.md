# Network Request Audit

**Category:** network-console
**Priority:** high
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build && npm run preview`)
- Electron API mock file at `e2e/mcp/shared/electron-mocks.js`

**MCP Tools Used:** `navigate_page`, `list_network_requests`, `get_network_request`

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

**Pass Criteria:** Page loads without navigation errors; HTTP 200 response for the document.

---

### Step 2: List all network requests from Dashboard

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{}
```

**Pass Criteria:** Response includes all document, script, stylesheet, image, font, and fetch/XHR requests.

---

### Step 3: Identify failed requests (status >= 400) on Dashboard

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{ "resourceTypes": ["document", "stylesheet", "script", "image", "font", "fetch", "xhr"] }
```

**Pass Criteria:** For each request, check status code. Record any request with status >= 400.

---

### Step 4: Get details for each failed request (Dashboard)

**Tool:** `mcp__chrome-devtools__get_network_request`
**Parameters:**

```json
{ "reqid": "<reqid of failed request from Step 3>" }
```

**Pass Criteria:** For each failed request, record: URL, status code, response body snippet, and resource type.

**Note:** Repeat for every failed request. If no failures, skip this step.

---

### Step 5: Verify JS assets loaded (Dashboard)

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{ "resourceTypes": ["script"] }
```

**Pass Criteria:** All JavaScript resources returned status 200; no 404 or 500 responses for `.js` files.

---

### Step 6: Verify CSS assets loaded (Dashboard)

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{ "resourceTypes": ["stylesheet"] }
```

**Pass Criteria:** All CSS resources returned status 200; no 404 or 500 responses for `.css` files.

---

### Step 7: Verify images loaded (Dashboard)

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{ "resourceTypes": ["image"] }
```

**Pass Criteria:** All image resources returned status 200 or 304; no broken images (404).

---

### Step 8: Navigate to Search page

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

### Step 9: List all network requests from Search

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{}
```

**Pass Criteria:** Response includes all requests for the Search page.

---

### Step 10: Identify failed requests (status >= 400) on Search

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{ "resourceTypes": ["document", "stylesheet", "script", "image", "font", "fetch", "xhr"] }
```

**Pass Criteria:** Record any request with status >= 400.

---

### Step 11: Get details for each failed request (Search)

**Tool:** `mcp__chrome-devtools__get_network_request`
**Parameters:**

```json
{ "reqid": "<reqid of failed request from Step 10>" }
```

**Pass Criteria:** For each failed request, record: URL, status code, response body snippet, and resource type.

**Note:** Repeat for every failed request. If no failures, skip this step.

---

### Step 12: Verify JS/CSS assets loaded (Search)

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{ "resourceTypes": ["script", "stylesheet"] }
```

**Pass Criteria:** All script and stylesheet resources returned status 200.

---

### Step 13: Navigate to Settings page

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

### Step 14: List all network requests from Settings

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{}
```

**Pass Criteria:** Response includes all requests for the Settings page.

---

### Step 15: Identify failed requests (status >= 400) on Settings

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{ "resourceTypes": ["document", "stylesheet", "script", "image", "font", "fetch", "xhr"] }
```

**Pass Criteria:** Record any request with status >= 400.

---

### Step 16: Get details for each failed request (Settings)

**Tool:** `mcp__chrome-devtools__get_network_request`
**Parameters:**

```json
{ "reqid": "<reqid of failed request from Step 15>" }
```

**Pass Criteria:** For each failed request, record: URL, status code, response body snippet, and resource type.

**Note:** Repeat for every failed request. If no failures, skip this step.

---

### Step 17: Verify JS/CSS assets loaded (Settings)

**Tool:** `mcp__chrome-devtools__list_network_requests`
**Parameters:**

```json
{ "resourceTypes": ["script", "stylesheet"] }
```

**Pass Criteria:** All script and stylesheet resources returned status 200.

---

### Step 18: Aggregate network request summary across all routes

**Tool:** (manual aggregation from Steps 3, 10, 15)

Record the following summary:

| Route     | Total Requests | Failed (4xx/5xx) | JS Assets OK | CSS Assets OK | Images OK |
| --------- | -------------- | ---------------- | ------------ | ------------- | --------- |
| /         |                |                  |              |               |           |
| /search   |                |                  |              |               |           |
| /settings |                |                  |              |               |           |

**Pass Criteria:** Zero failures across all routes.

---

## Assertions

| #   | Assertion                                                  | Route(s)              | Severity |
| --- | ---------------------------------------------------------- | --------------------- | -------- |
| A1  | Zero failed requests (status >= 400) on any route          | /, /search, /settings | critical |
| A2  | All JavaScript assets load with status 200                 | /, /search, /settings | critical |
| A3  | All CSS assets load with status 200                        | /, /search, /settings | critical |
| A4  | No missing images (404 on image resources)                 | /, /search, /settings | high     |
| A5  | No font loading failures                                   | /, /search, /settings | medium   |
| A6  | No unexpected external network calls (only localhost:4173) | /, /search, /settings | high     |
| A7  | Document request returns status 200 for each route         | /, /search, /settings | critical |
| A8  | No CORS errors on fetch/XHR requests                       | /, /search, /settings | high     |

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
| 17   |        |       |
| 18   |        |       |

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
