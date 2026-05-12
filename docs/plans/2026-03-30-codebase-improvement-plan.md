# VulnAssesTool Codebase Improvement Plan

**Created:** 2026-03-30
**Status:** Planning
**Priority:** High

---

## Executive Summary

This plan outlines comprehensive improvements for VulnAssesTool based on analysis of the current codebase and Claude Code best practices. The improvements are organized into 9 key areas with phased implementation.

---

## Current State Analysis

| Area                    | Current Score | Target Score | Gap      |
| ----------------------- | ------------- | ------------ | -------- |
| Git Hooks / Pre-commit  | 0/10          | 9/10         | Critical |
| Test Coverage           | 6/10          | 9/10         | High     |
| Error Handling          | 7/10          | 9/10         | Medium   |
| Development Workflow    | 6/10          | 9/10         | High     |
| Database Handling       | 7/10          | 9/10         | Medium   |
| Frontend Structure      | 7/10          | 9/10         | Medium   |
| Accessibility           | 8/10          | 9.5/10       | Low      |
| Claude Code Integration | 3/10          | 9/10         | Critical |
| CI/CD Pipeline          | 7/10          | 9/10         | Medium   |

---

## Phase 1: Git Hooks & Pre-commit (Critical)

### 1.1 Husky + lint-staged Setup

**Current Gap:** No pre-commit hooks configured. Code quality not enforced at commit time.

**Implementation:**

```bash
npm install -D husky lint-staged @commitlint/cli @commitlint/config-conventional
npx husky init
```

**.husky/pre-commit:**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
npm run test:related
```

**.husky/commit-msg:**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx --no -- commitlint --edit "$1"
```

**package.json additions:**

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

**commitlint.config.js:**

```javascript
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
  },
}
```

### 1.2 Pre-push Hooks

**.husky/pre-push:**

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm run test:coverage
npm run lint
```

---

## Phase 2: Test System Enhancement (High Priority)

### 2.1 Coverage Improvements

**Current:** 60% threshold
**Target:** 80% threshold

**vitest.config.ts updates:**

```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html', 'lcov'],
  thresholds: {
    lines: 80,
    functions: 80,
    branches: 75,
    statements: 80
  },
  exclude: [
    'node_modules/',
    'tests/',
    '**/*.d.ts',
    '**/*.config.*',
    'build/',
    'orchestrator/'
  ]
}
```

### 2.2 Component Testing with Testing Library

**New dependencies:**

```bash
npm install -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

**tests/setup.ts additions:**

```typescript
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))
```

### 2.3 Accessibility Testing with jest-axe

**New dependencies:**

```bash
npm install -D jest-axe
```

**Example accessibility test:**

```typescript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { Dashboard } from './Dashboard';

expect.extend(toHaveNoViolations);

describe('Dashboard Accessibility', () => {
  it('should have no accessibility violations', async () => {
    const { container } = render(<Dashboard />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
```

### 2.4 Visual Regression Testing

**Update playwright.e2e.config.ts:**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  projects: [
    {
      name: 'visual',
      testMatch: /visual\/.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        screenshot: 'on',
        video: 'retain-on-failure',
      },
    },
  ],
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.2,
    },
  },
})
```

### 2.5 Mutation Testing Integration

**stryker.config.json updates:**

```json
{
  "mutator": "typescript",
  "packageManager": "npm",
  "reporters": ["html", "clear-text", "progress"],
  "testRunner": "vitest",
  "coverageAnalysis": "perTest",
  "thresholds": {
    "high": 80,
    "low": 60,
    "break": 70
  },
  "mutate": ["src/**/*.ts", "src/**/*.tsx", "!src/**/*.test.ts", "!src/**/*.spec.ts"]
}
```

---

## Phase 3: Error Catching Mechanisms (Medium Priority)

### 3.1 Centralized Error Logging Service

**New file: electron/services/ErrorLoggingService.ts**

```typescript
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

interface ErrorLog {
  timestamp: string
  level: 'error' | 'warn' | 'info'
  message: string
  stack?: string
  context?: Record<string, unknown>
  sessionId?: string
}

class ErrorLoggingService {
  private logPath: string
  private maxLogSize = 10 * 1024 * 1024 // 10MB
  private maxLogFiles = 5

  constructor() {
    this.logPath = path.join(app.getPath('userData'), 'logs')
    this.ensureLogDirectory()
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true })
    }
  }

  log(error: Error | string, level: 'error' | 'warn' | 'info' = 'error', context?: Record<string, unknown>): void {
    const logEntry: ErrorLog = {
      timestamp: new Date().toISOString(),
      level,
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'string' ? undefined : error.stack,
      context,
    }

    this.writeLog(logEntry)
    this.rotateLogsIfNeeded()
  }

  private writeLog(entry: ErrorLog): void {
    const logFile = path.join(this.logPath, `app-${new Date().toISOString().split('T')[0]}.log`)
    const logLine = JSON.stringify(entry) + '\n'
    fs.appendFileSync(logFile, logLine, 'utf8')
  }

  private rotateLogsIfNeeded(): void {
    // Implementation for log rotation
  }

  getRecentErrors(count: number = 50): ErrorLog[] {
    // Implementation for retrieving recent errors
    return []
  }
}

export const errorLoggingService = new ErrorLoggingService()
```

### 3.2 Enhanced Error Boundary

**Update src/renderer/components/ErrorBoundary.tsx:**

```typescript
import { Component, ErrorInfo, ReactNode } from 'react';
import { errorLoggingService } from './ErrorLoggingService';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorId: '' };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const errorId = crypto.randomUUID();

    // Log to service
    errorLoggingService.log(error, 'error', {
      componentStack: errorInfo.componentStack,
      errorId,
    });

    this.setState({ errorId });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-boundary" role="alert">
          <h1>Something went wrong</h1>
          <p>Error ID: {this.state.errorId}</p>
          <button onClick={() => window.location.reload()}>
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

### 3.3 IPC Error Interceptor

**New file: electron/ipc/ipcErrorInterceptor.ts**

```typescript
import { ipcMain } from 'electron'
import { errorLoggingService } from '../services/ErrorLoggingService'

interface IPCError extends Error {
  code?: string
  channel?: string
}

export function wrapIPCHandler(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>,
): (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      const ipcError = error as IPCError
      ipcError.channel = channel

      errorLoggingService.log(ipcError, 'error', {
        channel,
        args: args.map((arg) => typeof arg),
      })

      throw {
        message: ipcError.message,
        code: ipcError.code || 'IPC_ERROR',
        channel,
      }
    }
  }
}

// Usage
ipcMain.handle(
  'nvd:search',
  wrapIPCHandler('nvd:search', async (event, query) => {
    // handler implementation
  }),
)
```

### 3.4 External Error Monitoring (Optional)

**Sentry Integration:**

```bash
npm install @sentry/electron
```

**electron/main.ts additions:**

```typescript
import * as Sentry from '@sentry/electron'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: app.getVersion(),
  integrations: [
    new Sentry.Integrations.CaptureConsole({
      levels: ['error', 'warn'],
    }),
  ],
  beforeSend(event) {
    // Filter sensitive data
    if (event.request?.headers) {
      delete event.request.headers['Authorization']
    }
    return event
  },
})
```

---

## Phase 4: Development Workflow (High Priority)

### 4.1 Claude Code Configuration

**New directory structure:**

```
.claude/
├── settings.json           # Team-shared settings
├── settings.local.json     # Personal overrides (git-ignored)
├── agents/
│   ├── code-reviewer.md
│   ├── test-generator.md
│   └── db-migration.md
├── commands/
│   ├── review.md
│   ├── test-gen.md
│   └── migrate.md
├── skills/
│   ├── vulnerability-analysis/
│   │   └── SKILL.md
│   └── sbom-parsing/
│       └── SKILL.md
├── hooks/
│   ├── scripts/
│   │   └── hooks.py
│   ├── config/
│   │   └── hooks-config.json
│   └── sounds/
└── rules/
    └── project-rules.md
```

### 4.2 Custom Agents

**.claude/agents/code-reviewer.md:**

```markdown
---
name: code-reviewer
description: Review code changes for quality, security, and best practices
tools: Read, Grep, Glob
model: sonnet
---

You are a code reviewer for VulnAssesTool. Review changes for:

1. **Security**: SQL injection, XSS, proper input validation
2. **TypeScript**: Type safety, null checks, proper typing
3. **React**: Component patterns, hooks usage, accessibility
4. **Electron**: IPC security, context isolation
5. **Testing**: Coverage, edge cases, meaningful assertions

Output a structured review with:

- Summary of changes
- Critical issues (must fix)
- Suggestions (should fix)
- Nits (minor improvements)
```

**.claude/agents/test-generator.md:**

```markdown
---
name: test-generator
description: Generate comprehensive tests for components and functions
tools: Read, Write, Grep, Glob
model: sonnet
skills:
  - bdd-tdd-expert
---

Generate tests following these patterns:

1. Unit tests with Vitest for utilities and hooks
2. Component tests with Testing Library for React components
3. Integration tests for IPC handlers
4. E2E tests with Playwright for critical user flows

Always include:

- Happy path scenarios
- Error handling scenarios
- Edge cases
- Accessibility assertions
```

### 4.3 Custom Commands

**.claude/commands/review.md:**

```markdown
Review the current changes or a specific file.

Usage: /review [file-path]

If no file is specified, review all uncommitted changes.

Steps:

1. Get the diff of changes
2. Use the code-reviewer agent to analyze
3. Present findings in a structured format
4. Suggest fixes for critical issues
```

**.claude/commands/test-gen.md:**

```markdown
Generate tests for a specific file or component.

Usage: /test-gen <file-path>

Steps:

1. Analyze the file to understand its functionality
2. Identify test cases needed
3. Generate comprehensive test file
4. Ensure tests follow project patterns
```

### 4.4 Claude Code Hooks

**.claude/settings.json:**

```json
{
  "permissions": {
    "allow": ["Edit(*)", "Write(*)", "Bash(npm run *)", "Bash(npx *)", "mcp__*"],
    "deny": ["Bash(rm -rf /*)"],
    "ask": ["Bash(git push *)", "Bash(npm publish)"]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/hooks.py",
            "timeout": 5000,
            "async": true,
            "statusMessage": "Validating file write..."
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/hooks.py",
            "timeout": 5000,
            "async": true
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 ${CLAUDE_PROJECT_DIR}/.claude/hooks/scripts/hooks.py",
            "timeout": 5000,
            "async": true,
            "statusMessage": "Session complete"
          }
        ]
      }
    ]
  }
}
```

### 4.5 npm Scripts Enhancement

**package.json additions:**

```json
{
  "scripts": {
    "clean": "rimraf dist build node_modules/.vite",
    "rebuild": "npm run clean && npm install && npm run build",
    "type-check": "tsc --noEmit",
    "test:related": "vitest related --run",
    "test:watch": "vitest watch",
    "test:parallel": "vitest --pool=threads --poolOptions.threads.singleThread=false",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"**/*.{ts,tsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,json,md}\"",
    "prepare": "husky",
    "pre-commit": "lint-staged",
    "bundle:analyze": "cross-env ANALYZE=true npm run build:renderer",
    "deps:check": "npm outdated",
    "deps:update": "npm update && npm audit fix",
    "db:migrate": "tsx scripts/run-migration.ts",
    "db:seed": "tsx scripts/seed-test-db.ts",
    "release:patch": "npm version patch && npm run release:complete",
    "release:minor": "npm version minor && npm run release:complete"
  }
}
```

---

## Phase 5: Git Workflow (Medium Priority)

### 5.1 Branch Naming Convention

**.github/CONTRIBUTING.md:**

```markdown
## Branch Naming

- `feature/` - New features (e.g., `feature/kev-integration`)
- `fix/` - Bug fixes (e.g., `fix/sql-injection`)
- `refactor/` - Code refactoring (e.g., `refactor/database-layer`)
- `docs/` - Documentation (e.g., `docs/api-reference`)
- `test/` - Test improvements (e.g., `test/e2e-coverage`)
- `chore/` - Maintenance (e.g., `chore/update-deps`)
```

### 5.2 PR Template

**.github/pull_request_template.md:**

```markdown
## Description

[Describe the changes]

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed

## Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings introduced
- [ ] Tests pass locally
- [ ] New and existing unit tests pass

## Screenshots (if applicable)

[Add screenshots]

## Related Issues

Closes #[issue number]
```

### 5.3 Issue Templates

**.github/ISSUE_TEMPLATE/bug_report.md:**

```markdown
---
name: Bug Report
about: Report a bug to help us improve
title: '[BUG] '
labels: bug
assignees: ''
---

## Describe the Bug

[A clear description of the bug]

## Steps to Reproduce

1. Go to '...'
2. Click on '....'
3. See error

## Expected Behavior

[A clear description of what you expected]

## Screenshots

[If applicable, add screenshots]

## Environment

- OS: [e.g., Windows 11]
- App Version: [e.g., 2.0.0]
- Node Version: [e.g., 20.x]

## Additional Context

[Any other context about the problem]
```

### 5.4 CI/CD Workflow Improvements

**.github/workflows/ci.yml improvements:**

```yaml
name: CI

on:
  push:
    branches: [master, develop]
  pull_request:
    branches: [master]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  test:
    needs: lint
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

  build:
    needs: test
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.os }}
          path: dist/
          retention-days: 7

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm audit --audit-moderate-level
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

---

## Phase 6: Database Handling Mechanism (Medium Priority)

### 6.1 Migration System Enhancement

**New file: electron/database/migrations/MigrationManager.ts**

```typescript
import { Database } from 'sql.js'
import * as fs from 'fs'
import * as path from 'path'

interface Migration {
  version: number
  name: string
  up: string
  down: string
}

export class MigrationManager {
  private db: Database
  private migrationsPath: string

  constructor(db: Database, migrationsPath: string) {
    this.db = db
    this.migrationsPath = migrationsPath
  }

  async migrate(): Promise<void> {
    await this.ensureMigrationsTable()
    const applied = await this.getAppliedMigrations()
    const pending = await this.getPendingMigrations(applied)

    for (const migration of pending) {
      await this.applyMigration(migration)
    }
  }

  private async ensureMigrationsTable(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  private async getAppliedMigrations(): Promise<number[]> {
    const result = this.db.exec('SELECT version FROM schema_migrations ORDER BY version')
    return result[0]?.values.map((v) => v[0] as number) || []
  }

  private async getPendingMigrations(applied: number[]): Promise<Migration[]> {
    const files = fs
      .readdirSync(this.migrationsPath)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    return files
      .filter((f) => {
        const version = parseInt(f.split('_')[0])
        return !applied.includes(version)
      })
      .map((f) => this.loadMigration(f))
  }

  private loadMigration(filename: string): Migration {
    const content = fs.readFileSync(path.join(this.migrationsPath, filename), 'utf8')
    const [up, down] = content.split('-- DOWN')

    return {
      version: parseInt(filename.split('_')[0]),
      name: filename,
      up: up.replace('-- UP', '').trim(),
      down: down?.trim() || '',
    }
  }

  private async applyMigration(migration: Migration): Promise<void> {
    // Run in transaction
    this.db.run('BEGIN TRANSACTION')

    try {
      // Apply migration
      this.db.run(migration.up)

      // Record migration
      this.db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [migration.version, migration.name])

      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }

  async rollback(steps: number = 1): Promise<void> {
    const applied = await this.getAppliedMigrations()
    const toRollback = applied.slice(-steps).reverse()

    for (const version of toRollback) {
      await this.rollbackMigration(version)
    }
  }

  private async rollbackMigration(version: number): Promise<void> {
    const files = fs.readdirSync(this.migrationsPath).filter((f) => f.startsWith(`${version}_`))

    if (files.length === 0) return

    const migration = this.loadMigration(files[0])

    if (!migration.down) {
      throw new Error(`No rollback available for migration ${version}`)
    }

    this.db.run('BEGIN TRANSACTION')

    try {
      this.db.run(migration.down)
      this.db.run('DELETE FROM schema_migrations WHERE version = ?', [version])
      this.db.run('COMMIT')
    } catch (error) {
      this.db.run('ROLLBACK')
      throw error
    }
  }
}
```

### 6.2 Query Builder / ORM Layer

**New file: electron/database/QueryBuilder.ts**

```typescript
type WhereOperator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN'

interface WhereClause {
  column: string
  operator: WhereOperator
  value: unknown
}

export class QueryBuilder {
  private table: string
  private columns: string[] = ['*']
  private whereClauses: WhereClause[] = []
  private orderByClause?: { column: string; direction: 'ASC' | 'DESC' }
  private limitValue?: number
  private offsetValue?: number

  constructor(table: string) {
    this.table = table
  }

  select(...columns: string[]): this {
    this.columns = columns
    return this
  }

  where(column: string, operator: WhereOperator, value: unknown): this {
    this.whereClauses.push({ column, operator, value })
    return this
  }

  whereIn(column: string, values: unknown[]): this {
    values.forEach((value) => {
      this.whereClauses.push({ column, operator: 'IN', value })
    })
    return this
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.orderByClause = { column, direction }
    return this
  }

  limit(limit: number): this {
    this.limitValue = limit
    return this
  }

  offset(offset: number): this {
    this.offsetValue = offset
    return this
  }

  build(): { sql: string; params: unknown[] } {
    const params: unknown[] = []

    let sql = `SELECT ${this.columns.join(', ')} FROM ${this.table}`

    if (this.whereClauses.length > 0) {
      const whereParts = this.whereClauses.map((clause) => {
        if (clause.operator === 'IN') {
          return `${clause.column} IN (?)`
        }
        return `${clause.column} ${clause.operator} ?`
      })
      sql += ` WHERE ${whereParts.join(' AND ')}`
      params.push(...this.whereClauses.map((c) => c.value))
    }

    if (this.orderByClause) {
      sql += ` ORDER BY ${this.orderByClause.column} ${this.orderByClause.direction}`
    }

    if (this.limitValue) {
      sql += ` LIMIT ${this.limitValue}`
    }

    if (this.offsetValue) {
      sql += ` OFFSET ${this.offsetValue}`
    }

    return { sql, params }
  }
}

// Usage
const query = new QueryBuilder('cves')
  .select('cve_id', 'severity', 'published_date')
  .where('severity', '>=', 'HIGH')
  .orderBy('published_date', 'DESC')
  .limit(100)

const { sql, params } = query.build()
```

### 6.3 Connection Pooling (for better-sqlite3)

**New file: electron/database/ConnectionPool.ts**

```typescript
import Database from 'better-sqlite3'

interface PooledConnection {
  db: Database.Database
  inUse: boolean
  lastUsed: number
}

export class ConnectionPool {
  private pool: PooledConnection[] = []
  private maxConnections: number
  private dbPath: string
  private acquireTimeout: number

  constructor(dbPath: string, maxConnections: number = 5, acquireTimeout: number = 5000) {
    this.dbPath = dbPath
    this.maxConnections = maxConnections
    this.acquireTimeout = acquireTimeout
  }

  async acquire(): Promise<Database.Database> {
    const startTime = Date.now()

    while (Date.now() - startTime < this.acquireTimeout) {
      // Try to find available connection
      const available = this.pool.find((c) => !c.inUse)
      if (available) {
        available.inUse = true
        available.lastUsed = Date.now()
        return available.db
      }

      // Create new connection if under limit
      if (this.pool.length < this.maxConnections) {
        const connection = this.createConnection()
        this.pool.push(connection)
        connection.inUse = true
        return connection.db
      }

      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    throw new Error('Connection pool acquire timeout')
  }

  release(db: Database.Database): void {
    const connection = this.pool.find((c) => c.db === db)
    if (connection) {
      connection.inUse = false
      connection.lastUsed = Date.now()
    }
  }

  private createConnection(): PooledConnection {
    return {
      db: new Database(this.dbPath),
      inUse: false,
      lastUsed: Date.now(),
    }
  }

  closeAll(): void {
    this.pool.forEach((c) => c.db.close())
    this.pool = []
  }
}
```

---

## Phase 7: Frontend Structure (Medium Priority)

### 7.1 Component Organization

**Recommended structure:**

```
src/renderer/components/
├── ui/                    # Base components (shadcn/ui pattern)
│   ├── badge.tsx
│   ├── button.tsx
│   ├── dialog.tsx
│   └── ...
├── layout/               # Layout components
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   ├── Footer.tsx
│   └── MainLayout.tsx
├── features/             # Feature-specific components
│   ├── vulnerabilities/
│   │   ├── VulnerabilityCard.tsx
│   │   ├── VulnerabilityList.tsx
│   │   ├── VulnerabilityFilters.tsx
│   │   └── index.ts
│   ├── dashboard/
│   │   ├── DashboardMetrics.tsx
│   │   ├── RecentScans.tsx
│   │   └── index.ts
│   └── settings/
│       ├── SettingsForm.tsx
│       ├── ApiKeyManager.tsx
│       └── index.ts
├── feedback/             # User feedback components
│   ├── ErrorBoundary.tsx
│   ├── LoadingSpinner.tsx
│   ├── Toast.tsx
│   └── EmptyState.tsx
└── index.ts              # Barrel export
```

### 7.2 Storybook Setup

**Installation:**

```bash
npm install -D @storybook/react @storybook/react-vite @storybook/addon-essentials @storybook/addon-a11y @storybook/addon-coverage
npx storybook init
```

**.storybook/main.ts:**

```typescript
import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-a11y', '@storybook/addon-coverage'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (config) => {
    return {
      ...config,
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '../src'),
        },
      },
    }
  },
}

export default config
```

**Example story: src/renderer/components/ui/button.stories.tsx:**

```typescript
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: {
    children: 'Button',
  },
}

export const Destructive: Story = {
  args: {
    variant: 'destructive',
    children: 'Delete',
  },
}
```

### 7.3 State Management Patterns

**Update src/renderer/store/useStore.ts:**

```typescript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

interface AppState {
  // UI State
  ui: {
    theme: 'light' | 'dark' | 'system'
    sidebarOpen: boolean
    commandPaletteOpen: boolean
  }

  // Data State
  projects: Project[]
  currentProject: Project | null

  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  toggleSidebar: () => void
  toggleCommandPalette: () => void
  addProject: (project: Project) => void
  setCurrentProject: (project: Project | null) => void
}

export const useStore = create<AppState>()(
  persist(
    immer((set) => ({
      ui: {
        theme: 'system',
        sidebarOpen: true,
        commandPaletteOpen: false,
      },
      projects: [],
      currentProject: null,

      setTheme: (theme) =>
        set((state) => {
          state.ui.theme = theme
        }),

      toggleSidebar: () =>
        set((state) => {
          state.ui.sidebarOpen = !state.ui.sidebarOpen
        }),

      toggleCommandPalette: () =>
        set((state) => {
          state.ui.commandPaletteOpen = !state.ui.commandPaletteOpen
        }),

      addProject: (project) =>
        set((state) => {
          state.projects.push(project)
        }),

      setCurrentProject: (project) =>
        set((state) => {
          state.currentProject = project
        }),
    })),
    {
      name: 'vuln-asses-tool-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        ui: state.ui,
        projects: state.projects,
      }),
    },
  ),
)

// Selectors for performance
export const useTheme = () => useStore((state) => state.ui.theme)
export const useSidebarOpen = () => useStore((state) => state.ui.sidebarOpen)
export const useProjects = () => useStore((state) => state.projects)
```

---

## Phase 8: Accessibility (Low Priority - Already Good)

### 8.1 Automated Accessibility Testing

**Add to e2e/tests/accessibility.spec.ts:**

```typescript
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.describe('Accessibility Tests', () => {
  test('Dashboard should have no accessibility violations', async ({ page }) => {
    await page.goto('/')

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  test('Settings page should have no accessibility violations', async ({ page }) => {
    await page.goto('/settings')

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()

    expect(accessibilityScanResults.violations).toEqual([])
  })

  test('Search results should be keyboard navigable', async ({ page }) => {
    await page.goto('/search')
    await page.fill('[data-testid="search-input"]', 'CVE-2024')
    await page.press('[data-testid="search-input"]', 'Enter')

    // Tab through results
    await page.keyboard.press('Tab')
    await expect(page.locator(':focus')).toHaveAttribute('role', 'listitem')
  })
})
```

### 8.2 Accessibility Checklist Component

**New file: src/renderer/components/feedback/AccessibilityChecker.tsx:**

```typescript
import { useEffect, useState } from 'react';

interface AccessibilityIssue {
  element: string;
  issue: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
}

export function AccessibilityChecker() {
  const [issues, setIssues] = useState<AccessibilityIssue[]>([]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    const checkAccessibility = () => {
      const foundIssues: AccessibilityIssue[] = [];

      // Check for missing alt text
      document.querySelectorAll('img:not([alt])').forEach((img) => {
        foundIssues.push({
          element: img.outerHTML.slice(0, 50),
          issue: 'Image missing alt attribute',
          wcagLevel: 'A',
        });
      });

      // Check for form labels
      document.querySelectorAll('input:not([aria-label]):not([id])').forEach((input) => {
        const hasLabel = document.querySelector(`label[for="${input.id}"]`);
        if (!hasLabel) {
          foundIssues.push({
            element: input.outerHTML.slice(0, 50),
            issue: 'Form input missing label',
            wcagLevel: 'A',
          });
        }
      });

      // Check for focus indicators
      document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
        const style = window.getComputedStyle(el);
        if (style.outline === 'none' && !style.boxShadow) {
          foundIssues.push({
            element: el.outerHTML.slice(0, 50),
            issue: 'Interactive element may lack visible focus indicator',
            wcagLevel: 'AA',
          });
        }
      });

      setIssues(foundIssues);
    };

    // Run after DOM is ready
    setTimeout(checkAccessibility, 1000);
  }, []);

  if (issues.length === 0 || process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 rounded-lg p-4 max-w-md">
      <h3 className="font-bold text-yellow-800">
        Accessibility Issues ({issues.length})
      </h3>
      <ul className="mt-2 text-sm">
        {issues.slice(0, 5).map((issue, i) => (
          <li key={i} className="text-yellow-700">
            [{issue.wcagLevel}] {issue.issue}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### 8.3 ARIA Live Regions for Dynamic Content

**Update components to use ARIA live regions:**

```typescript
// Example: VulnerabilityList.tsx
export function VulnerabilityList({ vulnerabilities, loading }: Props) {
  return (
    <div>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {loading ? 'Loading vulnerabilities...' : `${vulnerabilities.length} vulnerabilities found`}
      </div>

      <ul role="list" aria-label="Vulnerability results">
        {vulnerabilities.map((vuln) => (
          <li key={vuln.id} role="listitem">
            <VulnerabilityCard vulnerability={vuln} />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Phase 9: CI/CD Pipeline Enhancement (Medium Priority)

### 9.1 Dependency Caching

**Already covered in Phase 5.4**

### 9.2 Parallel Test Execution

**vitest.config.ts:**

```typescript
export default defineConfig({
  test: {
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        minThreads: 2,
        maxThreads: 4,
      },
    },
  },
})
```

### 9.3 Bundle Size Monitoring

**Add to .github/workflows/ci.yml:**

```yaml
bundle-size:
  needs: build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'npm'
    - run: npm ci
    - run: npm run build:analyze
    - name: Check bundle size
      run: |
        SIZE=$(stat -c%s "dist/renderer.js")
        if [ $SIZE -gt 5000000 ]; then
          echo "Bundle size ($SIZE bytes) exceeds 5MB limit"
          exit 1
        fi
    - name: Upload bundle stats
      uses: actions/upload-artifact@v4
      with:
        name: bundle-stats
        path: stats.html
```

### 9.4 Release Automation

**.github/workflows/release.yml enhancements:**

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        include:
          - os: ubuntu-latest
            platform: linux
          - os: windows-latest
            platform: win
          - os: macos-latest
            platform: mac

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run build

      - name: Build Electron App
        run: npm run dist:${{ matrix.platform }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.platform }}-build
          path: |
            dist/*.exe
            dist/*.dmg
            dist/*.AppImage
            dist/*.snap

  create-release:
    needs: release
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download all artifacts
        uses: actions/download-artifact@v4
        with:
          path: artifacts

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: artifacts/**/*
          generate_release_notes: true
          draft: false
          prerelease: ${{ contains(github.ref, '-alpha') || contains(github.ref, '-beta') }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Implementation Timeline

| Phase                   | Priority | Estimated Effort | Dependencies |
| ----------------------- | -------- | ---------------- | ------------ |
| Phase 1: Git Hooks      | Critical | 1-2 days         | None         |
| Phase 2: Test System    | High     | 3-5 days         | Phase 1      |
| Phase 3: Error Handling | Medium   | 2-3 days         | None         |
| Phase 4: Dev Workflow   | High     | 2-3 days         | Phase 1      |
| Phase 5: Git Workflow   | Medium   | 1-2 days         | Phase 1      |
| Phase 6: Database       | Medium   | 3-4 days         | None         |
| Phase 7: Frontend       | Medium   | 3-5 days         | Phase 2      |
| Phase 8: Accessibility  | Low      | 1-2 days         | Phase 2, 7   |
| Phase 9: CI/CD          | Medium   | 1-2 days         | Phase 1, 2   |

---

## Success Metrics

| Metric               | Current | Target | Measurement Method     |
| -------------------- | ------- | ------ | ---------------------- |
| Test Coverage        | 60%     | 80%    | vitest coverage report |
| Build Time           | ~3 min  | <2 min | CI metrics             |
| Bundle Size          | Unknown | <5MB   | Build artifacts        |
| Accessibility Score  | 92/100  | 95/100 | Lighthouse audit       |
| Pre-commit Pass Rate | N/A     | 100%   | Git hooks logs         |
| Error Recovery Rate  | Unknown | 80%+   | Error logs analysis    |

---

## Next Steps

1. **Immediate (This Week):**
   - Set up Husky and lint-staged
   - Configure commitlint
   - Create basic Claude Code configuration

2. **Short-term (Next 2 Weeks):**
   - Implement test coverage improvements
   - Add error logging service
   - Create custom Claude Code agents

3. **Medium-term (Next Month):**
   - Database migration system enhancement
   - Storybook setup
   - Accessibility improvements

4. **Long-term (Next Quarter):**
   - Full CI/CD pipeline optimization
   - Bundle size monitoring
   - Performance benchmarking
