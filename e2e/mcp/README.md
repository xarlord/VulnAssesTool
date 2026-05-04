# MCP Test Specifications

Interactive tests executed by Claude Code using Chrome DevTools MCP tools. These complement the automated Playwright suite with accessibility audits, performance traces, visual regression, and console/network monitoring.

## Prerequisites

- Node.js and npm installed
- Application build completed

## Running MCP Tests

### 1. Start the preview server

```bash
npm run mcp:serve
```

This builds the app and starts the Vite preview server on `http://127.0.0.1:4173`.

### 2. Execute specs via Claude Code

In a Claude Code session with Chrome DevTools MCP tools enabled:

```
Read the spec file from e2e/mcp/specs/<category>/<spec-name>.md
Follow each step, invoking the specified mcp__chrome-devtools__* tool
Record results in the spec's Results section
Save artifacts to e2e/mcp/results/
```

### 3. Review results

Results are saved to `e2e/mcp/results/`:

- `screenshots/` — Page screenshots
- `traces/` — Performance trace files
- `heap/` — Memory heap snapshots

## Test Categories

| Category           | Specs | What it tests                                          |
| ------------------ | ----- | ------------------------------------------------------ |
| `accessibility/`   | 4     | Lighthouse a11y scores, a11y tree validation           |
| `performance/`     | 3     | Page load metrics, search responsiveness, memory leaks |
| `visual/`          | 2     | Multi-viewport screenshots, dark mode consistency      |
| `network-console/` | 2     | Console errors, failed network requests                |

## Adding New Specs

Use the template at `e2e/mcp/templates/spec-template.md`. Each spec must:

1. List the MCP tools it uses
2. Define ordered steps with tool name, parameters, and pass criteria
3. Include a Results table for recording outcomes

## Electron API Mocking

All MCP specs inject Electron API mocks via `navigate_page(initScript=...)` using `e2e/mcp/shared/electron-mocks.js`. This ensures MCP tests use the same mock surface as the Playwright tests.
