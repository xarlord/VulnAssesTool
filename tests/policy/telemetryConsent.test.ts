/**
 * Policy test for SR-01.3 — no telemetry without explicit consent.
 *
 * The app ships zero telemetry today, so the PRD bullet is met by absence. There
 * is no consent-gating module to wire a flag to, so adding one now would be
 * speculative (Simplicity First). Instead this is a REGRESSION GUARD: it fails the
 * moment a known analytics SDK is added to package.json, or a telemetry call site
 * appears in src/ or server/ — the signal to add an explicit consent gate before
 * merging, rather than the invariant breaking silently.
 *
 * The detectors are pure functions with their own fixture-based tests (Rule 9), so
 * we prove they can fail without mutating real repo files.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// Known analytics/telemetry SDKs. Presence in the dependency tree implies a data
// egress path that must be consent-gated, so it must not appear without one.
const TELEMETRY_DEPENDENCY_DENYLIST = [
  'mixpanel',
  'amplitude-js',
  'posthog-js',
  '@segment/analytics-next',
  '@amplitude/analytics-browser',
  'react-ga',
  'react-ga4',
  'universal-analytics',
  '@microsoft/applicationinsights-web',
]

// Telemetry call-site signatures. Deliberately specific (not a bare `.track(`) to
// avoid false positives from unrelated code like drag/selection tracking.
const TELEMETRY_CALL_PATTERNS: RegExp[] = [
  /navigator\.sendBeacon\s*\(/,
  /\bgtag\s*\(/,
  /\bga\(\s*['"]send['"]/,
  /\banalytics\.track\s*\(/,
]

/** Denylisted SDK names present in a dependency map. */
function findDenylistedDeps(deps: Record<string, string>): string[] {
  return TELEMETRY_DEPENDENCY_DENYLIST.filter((name) => Object.prototype.hasOwnProperty.call(deps, name))
}

/** Files whose text matches any telemetry call-site pattern. */
function findTelemetryCallSites(sources: Array<{ file: string; text: string }>): string[] {
  return sources.filter(({ text }) => TELEMETRY_CALL_PATTERNS.some((re) => re.test(text))).map(({ file }) => file)
}

/** Read every non-test source file under a directory. */
function collectSourceFiles(baseDir: string): Array<{ file: string; text: string }> {
  const collected: Array<{ file: string; text: string }> = []
  const entries = readdirSync(baseDir, { recursive: true }) as string[]
  for (const relPath of entries) {
    if (!/\.(ts|tsx|js|jsx)$/.test(relPath)) continue
    if (/\.(test|spec)\./.test(relPath)) continue
    if (/(^|[\\/])(__tests__|fixtures|node_modules|dist)([\\/]|$)/.test(relPath)) continue
    try {
      collected.push({ file: relPath, text: readFileSync(resolve(baseDir, relPath), 'utf8') })
    } catch {
      // Directory entry or unreadable file — skip.
    }
  }
  return collected
}

describe('SR-01.3 no-telemetry regression guard', () => {
  it('has no known analytics/telemetry SDK in the dependency tree', () => {
    const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }

    expect(findDenylistedDeps(allDeps)).toEqual([])
  })

  it('has no telemetry call sites in src/ or server/', () => {
    const sources = [
      ...collectSourceFiles(resolve(repoRoot, 'src')),
      ...collectSourceFiles(resolve(repoRoot, 'server')),
    ]
    // Sanity: make sure we actually scanned something, so a broken walker can't
    // pass this vacuously.
    expect(sources.length).toBeGreaterThan(50)

    expect(findTelemetryCallSites(sources)).toEqual([])
  })

  // Rule 9: prove the detectors can fail, without touching real repo files.
  it('detectors flag a denylisted dep and a telemetry call site (fixture-based)', () => {
    expect(findDenylistedDeps({ react: '^18.0.0', mixpanel: '^2.0.0' })).toContain('mixpanel')
    expect(findTelemetryCallSites([{ file: 'evil.ts', text: 'navigator.sendBeacon("/collect", data)' }])).toEqual([
      'evil.ts',
    ])
    // And that clean inputs are not flagged.
    expect(findDenylistedDeps({ react: '^18.0.0' })).toEqual([])
    expect(findTelemetryCallSites([{ file: 'ok.ts', text: 'element.addEventListener("click", handler)' }])).toEqual([])
  })
})
