# Watchdog Orchestrator Design

**Version:** 1.0.0
**Created:** 2026-03-23
**Status:** Implementation Ready

---

## Overview

The Watchdog Orchestrator is an autonomous testing system that:

- Runs the application through multiple verification phases
- Intercepts errors from all sources (build, runtime, console)
- Uses AI to analyze and fix issues automatically
- Loops until the application runs error-free

## Problem Statement

Current testing has high coverage (~90%) and pass rate (~100%), but:

- Real bugs escape to production
- App sometimes fails to render on startup
- Terminal/console errors are not caught by tests
- Manual testing is still required after updates

## Solution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    WATCHDOG ORCHESTRATOR                        │
│                      (Node.js CLI)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐     │
│  │  PHASE 1 │──▶│  PHASE 2 │──▶│  PHASE 3 │──▶│  PHASE 4 │     │
│  │  Build   │   │ Startup  │   │ Render   │   │Function  │     │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘     │
│       │              │              │              │            │
│       ▼              ▼              ▼              ▼            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              ERROR INTERCEPTOR                          │   │
│  │  • Terminal stdout/stderr                               │   │
│  │  • Vite build output                                    │   │
│  │  • Electron main process logs                           │   │
│  │  • Console errors (via Playwright)                      │   │
│  │  • Uncaught exceptions / unhandled rejections           │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              AI FIX AGENT                               │   │
│  │  • Analyze error context                                │   │
│  │  • Identify root cause                                  │   │
│  │  • Apply fix to codebase                                │   │
│  │  • Report what was fixed                                │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
│                            ▼                                    │
│                    ┌──────────────┐                            │
│                    │  LOOP BACK   │                            │
│                    │  to Phase 1  │                            │
│                    └──────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Verification Phases

### Phase 1: Build Verification

**Purpose:** Catch TypeScript, Vite, and bundling errors

**Command:** `npm run build`

**Success Criteria:**

- Exit code 0
- No error patterns in output
- All expected output files exist

**Error Patterns:**

```regex
error TS\d+
Cannot find module .+
Type .+ is not assignable to type .+
Build failed
Could not resolve .+
transform failed
```

---

### Phase 2: Startup Verification

**Purpose:** Catch Electron main process initialization errors

**Command:** `electron .`

**Success Criteria:**

- Window opens within timeout
- No uncaught exceptions in main process
- Database initializes successfully
- IPC handlers register without errors

**Error Patterns:**

```regex
Error: .+
Uncaught Exception
A JavaScript error occurred
Cannot find module .+
Failed to load .+
Database initialization failed
```

**Timeout:** 30 seconds

---

### Phase 3: Render Verification

**Purpose:** Catch React/renderer errors and blank screens

**Tool:** Playwright with Electron support

**Success Criteria:**

- Main UI elements visible
- No console errors
- No uncaught React errors
- Page renders within timeout

**Checks:**

- Dashboard heading visible
- Navigation sidebar visible
- No error dialogs displayed
- Console error count = 0

**Timeout:** 60 seconds

---

### Phase 4: Functional Verification

**Purpose:** Catch silent failures where features don't work

**Tool:** Playwright smoke tests

**Test Scenarios:**

1. Create new project
2. Upload SBOM file
3. View vulnerability details
4. Search CVE database
5. Export results
6. Navigate to Settings

**Success Criteria:**

- All smoke tests pass
- No console errors during operations
- Expected UI elements respond correctly

---

## Sub-Components

### 1. Phase Runner

**File:** `orchestrator/phase-runner.ts`

**Interface:**

```typescript
interface Phase {
  name: 'build' | 'startup' | 'render' | 'functional'
  command: string
  timeout: number
  successPattern: RegExp
  errorPatterns: RegExp[]
}

interface PhaseResult {
  success: boolean
  output: string
  errors: ErrorMatch[]
  duration: number
}
```

**Responsibilities:**

- Execute shell commands with streaming output capture
- Parse output in real-time for success/error patterns
- Handle timeouts gracefully (kill hung processes)
- Report progress events for logging

---

### 2. Error Interceptor

**File:** `orchestrator/error-interceptor.ts`

**Interface:**

```typescript
interface ErrorMatch {
  type: 'build' | 'runtime' | 'console' | 'ipc' | 'unknown'
  message: string
  stack?: string
  file?: string
  line?: number
  rawOutput: string
}
```

**Error Pattern Registry:**
| Source | Pattern Examples |
|--------|-----------------|
| TypeScript | `error TS\d+`, `Cannot find module`, `Type.*is not assignable` |
| Vite | `Build failed`, `Could not resolve`, `transform failed` |
| Electron | `Error:`, `Uncaught Exception`, `A JavaScript error occurred` |
| React | `Error: Minified React error`, `Cannot read properties of undefined` |
| IPC | `Error invoking remote method`, `Channel not found` |

---

### 3. AI Fix Agent

**File:** `orchestrator/ai-fix-agent.ts`

**Interface:**

```typescript
interface FixResult {
  fixed: boolean
  changes: FileChange[]
  explanation: string
  confidence: number
}

interface FileChange {
  path: string
  before: string
  after: string
}
```

**Responsibilities:**

- Receive error context from Error Interceptor
- Analyze error type, stack trace, related files
- Generate targeted fix (not wholesale rewrites)
- Apply fix via file editing
- Return detailed report of changes

**AI Integration:**

- Uses GLM API for error analysis and fix generation
- Reads relevant source files for context
- Applies minimal, targeted changes
- Verifies fix doesn't break other code

---

### 4. State Manager

**File:** `orchestrator/state-manager.ts`

**Interface:**

```typescript
interface SessionState {
  sessionId: string
  startedAt: Date
  phase: PhaseName
  attemptNumber: number
  maxAttempts: number
  fixedIssues: FixResult[]
  currentErrors: ErrorMatch[]
  status: 'running' | 'paused' | 'success' | 'failed'
}
```

**Responsibilities:**

- Track current position in loop
- Persist session state to disk (survive restarts)
- Generate session reports
- Enforce max retry limits (default: 5)

---

### 5. Report Generator

**File:** `orchestrator/reporter.ts`

**Outputs:**
| File | Purpose |
|------|---------|
| `session-report.md` | Human-readable summary |
| `errors-found.json` | Structured error log |
| `fixes-applied.json` | All AI fixes with diffs |
| `screenshots/` | Visual evidence from render phase |

---

## CLI Usage

```bash
# Run full verification loop
npm run watchdog

# Run specific phase only
npm run watchdog -- --phase build

# Skip AI auto-fix (report only)
npm run watchdog -- --no-fix

# Set max retry attempts
npm run watchdog -- --max-attempts 10

# Resume interrupted session
npm run watchdog -- --resume
```

---

## Configuration

**File:** `watchdog.config.ts`

```typescript
export default {
  phases: {
    build: {
      command: 'npm run build',
      timeout: 120000,
    },
    startup: {
      command: 'electron .',
      timeout: 30000,
    },
    render: {
      timeout: 60000,
    },
    functional: {
      timeout: 120000,
    },
  },
  maxAttempts: 5,
  aiFix: {
    enabled: true,
    model: 'claude-sonnet-4-6',
  },
  reporting: {
    outputDir: './watchdog-reports',
    screenshots: true,
  },
}
```

---

## Error Detection Strategy

### Terminal Output Parsing

All stdout/stderr streams are captured and parsed line-by-line:

```typescript
const errorPatterns = [
  { type: 'typescript', pattern: /error TS(\d+): (.+)/ },
  { type: 'vite', pattern: /Build failed with (\d+) errors/ },
  { type: 'electron', pattern: /Uncaught Exception: (.+)/ },
  { type: 'react', pattern: /Error: (Minified React error \d+)/ },
]
```

### Console Error Interception

During render/functional phases, Playwright captures browser console:

```typescript
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    errorInterceptor.addConsoleError(msg.text())
  }
})

page.on('pageerror', (error) => {
  errorInterceptor.addPageError(error)
})
```

### Main Process Error Hooks

Electron main process errors are captured via IPC:

```typescript
mainProcess.on('uncaughtException', (error) => {
  errorInterceptor.addRuntimeError(error)
})
```

---

## Loop Control Flow

```
START
  │
  ▼
┌─────────────────────────────┐
│  Initialize Session         │
│  Load/Resume State          │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  PHASE 1: Build             │──── Error ────┐
│  npm run build              │                │
└─────────────┬───────────────┘                │
              │ Success                        │
              ▼                                │
┌─────────────────────────────┐                │
│  PHASE 2: Startup           │──── Error ────┤
│  electron .                 │                │
└─────────────┬───────────────┘                │
              │ Success                        │
              ▼                                │
┌─────────────────────────────┐                │
│  PHASE 3: Render            │──── Error ────┤
│  Playwright verification    │                │
└─────────────┬───────────────┘                │
              │ Success                        │
              ▼                                │
┌─────────────────────────────┐                │
│  PHASE 4: Functional        │──── Error ────┤
│  Smoke tests                │                │
└─────────────┬───────────────┘                │
              │ Success                        │
              ▼                                ▼
         SUCCESS                    ┌─────────────────────┐
                                    │  AI Fix Agent       │
                                    │  Analyze & Repair   │
                                    └──────────┬──────────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │  Attempt < Max?     │─── No ───▶ FAIL
                                    └──────────┬──────────┘
                                               │ Yes
                                               ▼
                                    ┌─────────────────────┐
                                    │  Loop to Phase 1    │
                                    └─────────────────────┘
```

---

## Future Enhancements

1. **Git Integration** - Auto-commit fixes with descriptive messages
2. **PR Creation** - Create pull requests for fixes
3. **Slack/Teams Notifications** - Alert on failures
4. **Scheduled Runs** - Nightly verification
5. **Performance Baselines** - Track app startup time trends
6. **Visual Regression** - Screenshot comparison between runs

---

## Files to Create

```
orchestrator/
├── index.ts                 # Main entry point
├── phase-runner.ts          # Phase execution engine
├── error-interceptor.ts     # Error detection & parsing
├── ai-fix-agent.ts          # AI-powered auto-repair
├── state-manager.ts         # Session state persistence
├── reporter.ts              # Report generation
├── types.ts                 # TypeScript interfaces
└── utils/
    ├── output-capture.ts    # Shell output streaming
    ├── process-manager.ts   # Child process lifecycle
    └── patterns.ts          # Error pattern definitions

watchdog.config.ts           # Configuration file
package.json                 # Add watchdog scripts
```

---

## Dependencies

| Package                | Purpose                      |
| ---------------------- | ---------------------------- |
| GLM API (native fetch) | AI fixes via GLM-5           |
| `playwright`           | Render/functional testing    |
| `dotenv`               | Environment variable loading |

## Environment Variables

| Variable           | Required   | Description                                                      |
| ------------------ | ---------- | ---------------------------------------------------------------- |
| `GLM_API_KEY`      | For AI fix | GLM API key for auto-repair                                      |
| `GLM_API_BASE_URL` | Optional   | GLM API endpoint (default: https://open.bigmodel.cn/api/paas/v4) |
| `GLM_MODEL`        | Optional   | Model to use (default: glm-5)                                    |
