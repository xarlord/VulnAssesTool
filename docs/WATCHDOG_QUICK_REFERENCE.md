# Watchdog Orchestrator - Quick Reference

**Version:** 1.0.0
**Created:** 2026-03-24

---

## Overview

Watchdog is an autonomous testing system that verifies your application works correctly after updates. It runs through multiple verification phases, intercepts errors from all sources, and can automatically fix issues using AI.

---

## Quick Start

```bash
# Run full verification with auto-fix
npm run watchdog

# Run specific phase only
npm run watchdog -- --phase build

# Report errors without auto-fixing
npm run watchdog -- --no-fix
```

---

## Verification Phases

| Phase          | Purpose                                | Timeout |
| -------------- | -------------------------------------- | ------- |
| **build**      | TypeScript compilation & Vite bundling | 2 min   |
| **startup**    | Electron main process initialization   | 30 sec  |
| **render**     | React UI renders without errors        | 1 min   |
| **functional** | Smoke tests for core features          | 2 min   |

---

## CLI Options

| Option                   | Description                       |
| ------------------------ | --------------------------------- |
| `-p, --phase <name>`     | Run only specified phase          |
| `-m, --max-attempts <n>` | Maximum fix attempts (default: 5) |
| `-r, --resume`           | Resume interrupted session        |
| `--no-fix`               | Report errors without auto-fixing |
| `--dry-run`              | Show what would be done           |
| `-v, --verbose`          | Enable verbose output             |
| `-h, --help`             | Show help                         |

---

## Error Types Detected

| Type           | Source            | Examples                                                      |
| -------------- | ----------------- | ------------------------------------------------------------- |
| **typescript** | TSC compilation   | `error TS1234`, `Cannot find module`                          |
| **vite**       | Vite bundler      | `Build failed`, `Could not resolve`                           |
| **electron**   | Main process      | `Uncaught Exception`, `App threw error`                       |
| **react**      | Renderer          | `Minified React error`, `Cannot read properties of undefined` |
| **ipc**        | IPC communication | `Error invoking remote method`                                |
| **console**    | Browser console   | Console errors from Playwright                                |

---

## Configuration

Edit `watchdog.config.ts`:

```typescript
const config = {
  phases: {
    build: { timeout: 120000 },
    startup: { timeout: 30000 },
    render: { timeout: 60000 },
    functional: { timeout: 120000 },
  },
  maxAttempts: 5,
  aiFix: {
    enabled: true,
    model: 'glm-5',
  },
}
```

---

## Environment Variables

| Variable           | Required   | Description                                                      |
| ------------------ | ---------- | ---------------------------------------------------------------- |
| `GLM_API_KEY`      | For AI fix | GLM API key for auto-repair                                      |
| `GLM_API_BASE_URL` | Optional   | GLM API endpoint (default: https://open.bigmodel.cn/api/paas/v4) |
| `GLM_MODEL`        | Optional   | Model to use (default: glm-5)                                    |

---

## Output Files

Reports are saved to `./watchdog-reports/`:

| File                 | Content                           |
| -------------------- | --------------------------------- |
| `session-report.md`  | Human-readable summary            |
| `errors-found.json`  | Structured error log              |
| `fixes-applied.json` | All AI fixes with diffs           |
| `session-full.json`  | Complete session state            |
| `screenshots/`       | Visual evidence from render phase |

---

## How It Works

```
START → Build → Startup → Render → Functional → SUCCESS
           ↓          ↓         ↓           ↓
           └──────────┴─────────┴───────────┘
                              ↓
                      Error Detected?
                              ↓
                         AI Fix Agent
                              ↓
                      Loop to Build
                     (max 5 attempts)
```

---

## Tips

1. **Start with `--no-fix`** to see what errors exist before enabling auto-fix
2. **Use `--phase build`** for quick verification during development
3. **Set `GLM_API_KEY`** in your shell profile for convenience
4. **Check `watchdog-reports/`** for detailed error analysis
5. **Resume interrupted sessions** with `--resume`

---

## Troubleshooting

### "AI fix agent not available"

Set your GLM API key:

```bash
export GLM_API_KEY=your-key-here
```

### "Phase timeout exceeded"

Increase timeout in `watchdog.config.ts`:

```typescript
phases: {
  build: { timeout: 180000 }, // 3 minutes
}
```

### "Session failed after 5 attempts"

Either:

- Increase `maxAttempts` in config
- Run with `--no-fix` to see all errors at once
- Check the report for patterns in recurring errors
