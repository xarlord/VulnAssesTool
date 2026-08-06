/**
 * Policy test for SR-02.2 — source-level security SAST (CodeQL).
 *
 * ESLint is a style/type linter, not a security SAST. This requires a CodeQL
 * workflow that scans this repo's OWN source, and — critically — that it targets
 * the real integration branch (master). ci.yml already has a dead `main/develop`
 * filter that never fires on this repo; the branch assertion guards against
 * copy-pasting that same bug into the new workflow.
 *
 * Caveat: these are offline static-text assertions about the workflow file's shape,
 * not proof that CodeQL completes on GitHub's runners — that needs a real Actions run.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const codeqlPath = resolve(repoRoot, '.github/workflows/codeql.yml')

describe('SR-02.2 static-analysis gate (CodeQL)', () => {
  it("has a CodeQL workflow that scans this repo's own JS/TS source", () => {
    expect(existsSync(codeqlPath)).toBe(true)

    const raw = readFileSync(codeqlPath, 'utf8')
    expect(raw).toContain('codeql-action/init')
    expect(raw).toContain('codeql-action/analyze')
    // Must actually analyze this project's language, not just upload SARIF.
    expect(raw).toMatch(/languages:\s*["']?(javascript-typescript|javascript)/)
  })

  it("triggers CodeQL on the repository's real integration branch (master)", () => {
    const raw = readFileSync(codeqlPath, 'utf8')
    // Guards specifically against reusing ci.yml's non-firing `main/develop` filter.
    expect(raw).toMatch(/branches:\s*\[[^\]]*\bmaster\b/)
  })
})
