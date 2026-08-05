/**
 * Policy test for NFR-07.3 — all API route handlers documented with JSDoc.
 *
 * osv.ts set the convention (a prose JSDoc block per handler) but the five older
 * route files drifted with zero JSDoc, and nothing caught the inconsistency. This
 * gate encodes the requirement as an enforced artifact: for every route file, the
 * count of JSDoc blocks must be at least the count of route registrations, so
 * adding a `router.<method>(...)` without a doc block drops the file below its
 * quota and fails here.
 *
 * Heuristic by design (lightweight, no new dep, style-agnostic): it counts blocks
 * rather than proving each specific handler is annotated, which tolerates both the
 * inline-arrow style (doc above the registration) and osv.ts's named-function
 * style (doc above the function). The failure mode it guards — a new undocumented
 * endpoint — reliably trips the count.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const routesDir = resolve(repoRoot, 'server/routes')

const routeFiles = readdirSync(routesDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))

describe('NFR-07.3 API route JSDoc coverage', () => {
  it('has route files to check', () => {
    expect(routeFiles.length).toBeGreaterThan(0)
  })

  for (const file of routeFiles) {
    it(`${file}: documents every route handler with a JSDoc block`, () => {
      const src = readFileSync(resolve(routesDir, file), 'utf8')
      const registrations = (src.match(/\.(get|post|put|delete|patch)\s*\(/g) ?? []).length
      const jsdocBlocks = (src.match(/\/\*\*/g) ?? []).length

      if (registrations === 0) return // aggregator/helper file, nothing to document
      expect(
        jsdocBlocks,
        `${file} registers ${registrations} route handler(s) but has only ${jsdocBlocks} JSDoc block(s) — every endpoint needs a doc block (NFR-07.3)`,
      ).toBeGreaterThanOrEqual(registrations)
    })
  }
})
