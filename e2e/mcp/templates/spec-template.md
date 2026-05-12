# [Test Name]

**Category:** accessibility | performance | visual | network-console
**Priority:** critical | high | medium | low
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build`)

**MCP Tools Used:** [list chrome-devtools MCP tools needed]

---

## Steps

### Step 1: Navigate to application

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173"
- `initScript`: [contents of e2e/mcp/shared/electron-mocks.js]
  **Expected Result:** Page loads with dashboard visible
  **Pass Criteria:** No console errors, "New Project" button visible

### Step 2: [Action]

**Tool:** [mcp tool name]
**Parameters:**

- `param`: value
  **Expected Result:** [what to look for]
  **Pass Criteria:** [boolean condition]

---

## Assertions

| #   | Assertion | Tool | Pass Criteria |
| --- | --------- | ---- | ------------- |
| 1   | ...       | ...  | ...           |

---

## Results

_This section is filled in during execution._

| Step | Status | Details | Screenshot |
| ---- | ------ | ------- | ---------- |
| 1    |        |         |            |
