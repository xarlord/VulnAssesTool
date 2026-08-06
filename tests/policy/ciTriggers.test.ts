/**
 * Policy test for the CI pipeline's trigger branches.
 *
 * ci.yml runs lint, unit, e2e, build, and the security scan — but only on the
 * branches its `on:` filter names. That filter long read `[ main, develop ]`,
 * neither of which exists in this repo (the integration branch is `master`), so
 * the entire pipeline never fired on real PRs. This encodes the WHY: if the
 * filter ever drifts back off `master`, CI silently stops gating merges and this
 * test fails instead of the regression going unnoticed. Mirrors the branch guard
 * in staticAnalysisGate.test.ts for codeql.yml.
 *
 * Caveat: an offline static-text assertion about the workflow's shape, not proof
 * that the jobs pass on GitHub's runners.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ciPath = resolve(repoRoot, '.github/workflows/ci.yml')

describe('CI pipeline trigger branches', () => {
  it("triggers CI on the repository's real integration branch (master)", () => {
    expect(existsSync(ciPath)).toBe(true)

    const raw = readFileSync(ciPath, 'utf8')
    // Both push and pull_request filters must include master.
    const branchFilters = raw.match(/branches:\s*\[[^\]]*\]/g) ?? []
    expect(branchFilters.length).toBeGreaterThanOrEqual(2)
    for (const filter of branchFilters) {
      expect(filter).toMatch(/\bmaster\b/)
    }
  })

  it('does not target the dead main/develop branches that never fire here', () => {
    const raw = readFileSync(ciPath, 'utf8')
    const branchFilters = raw.match(/branches:\s*\[[^\]]*\]/g) ?? []
    for (const filter of branchFilters) {
      expect(filter).not.toMatch(/\b(main|develop)\b/)
    }
  })
})
