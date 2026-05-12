# Contributing to VulnAssesTool

Thank you for your interest in contributing to VulnAssesTool! This document provides guidelines and instructions for contributing.

## Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/xarlord/d-fence-vulnerability-assesment-tool.git
   cd vuln-assess-tool
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```

See the main [README.md](README.md) for the full list of available scripts.

## Branch Naming

Use descriptive branch names with a prefix:

- `feature/` — New features (e.g., `feature/add-csv-export`)
- `fix/` — Bug fixes (e.g., `fix/nvd-rate-limit-error`)
- `chore/` — Maintenance tasks (e.g., `chore/update-dependencies`)
- `docs/` — Documentation changes (e.g., `docs/add-api-reference`)
- `test/` — Test additions or fixes (e.g., `test/add-export-coverage`)

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) format:

```
type(scope): description

[optional body]
```

**Types:**

- `feat` — New feature
- `fix` — Bug fix
- `docs` — Documentation only
- `style` — Formatting, no code change
- `refactor` — Code restructuring without behavior change
- `test` — Adding or updating tests
- `chore` — Build, tooling, or dependency changes

**Examples:**

```
feat(export): add PDF report generation
fix(nvd): handle rate limit errors gracefully
docs(readme): update project structure diagram
test(fpf): add unit tests for tier1 quick filter
```

## Pull Request Process

1. Create a branch from `master`
2. Make your changes with appropriate tests
3. Ensure all tests pass:
   ```bash
   npm test
   npm run lint
   ```
4. Push your branch and open a PR against `master`
5. CI must pass (lint, unit tests, build)
6. Request a code review

## Code Style

- **TypeScript**: Strict mode enabled. All new code should be fully typed.
- **Linting**: ESLint is configured. Run `npm run lint` before pushing.
- **Formatting**: Follow existing patterns in the codebase.
- **Imports**: Use path aliases (`@/` for `src/renderer/`, `@@/` for `src/shared/`).
- **Components**: Use functional React components with hooks.
- **State**: Use Zustand stores in `src/renderer/store/`.
- **Styling**: Use Tailwind CSS classes. Follow the design system variables.

## Testing

- **Unit tests**: Vitest + React Testing Library
  ```bash
  npm test                # Run all unit tests
  npm run test:coverage   # Run with coverage report
  ```
- **E2E tests**: Playwright
  ```bash
  npm run test:e2e        # Run E2E tests
  ```
- **BDD tests**: Cucumber-style step definitions
  ```bash
  npm run test:bdd        # Run BDD tests
  ```

New features should include corresponding tests. Aim to maintain or improve the current coverage level.

## Project Architecture

```
electron/          → Electron main process (Node.js)
src/renderer/      → React UI application
src/shared/        → Shared types and constants
orchestrator/      → Watchdog autonomous testing system
```

See the [README.md](README.md) Project Structure section for the full directory layout.

## Questions?

Open an issue on GitHub for bugs, feature requests, or questions.
