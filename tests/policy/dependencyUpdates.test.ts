/**
 * Policy test for SR-02.1 — automated dependency updates.
 *
 * "Regular dependency updates for known vulnerabilities" is only satisfied if an
 * automated updater is actually configured and stays configured. These assertions
 * encode that as an enforced artifact: deleting the Dependabot config or weakening
 * its cadence to something non-"regular" (e.g. monthly / removed) breaks the test.
 */

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dependabotPath = resolve(repoRoot, '.github/dependabot.yml')

describe('SR-02.1 dependency-update automation', () => {
  it('ships a Dependabot config with a weekly-or-daily npm update schedule', () => {
    expect(existsSync(dependabotPath)).toBe(true)

    const raw = readFileSync(dependabotPath, 'utf8')
    // npm ecosystem must be tracked...
    expect(raw).toMatch(/package-ecosystem:\s*["']?npm/)
    // ...on a "regular" cadence — monthly or a removed interval would defeat the requirement.
    expect(raw).toMatch(/interval:\s*["']?(daily|weekly)/)
  })

  it('also tracks github-actions ecosystem updates', () => {
    const raw = readFileSync(dependabotPath, 'utf8')
    expect(raw).toMatch(/package-ecosystem:\s*["']?github-actions/)
  })
})
