/**
 * CLI Diff Command
 *
 * Compares two SBOMs and reports which components were added, removed, or had
 * their version changed. Pure logic (no I/O) so it is unit-testable and reusable
 * as the basis for incremental rescans.
 */

import type { Component } from '../../src/shared/types.js'

export interface ComponentRef {
  key: string
  name: string
  version: string
  purl?: string
}

export interface VersionChange {
  key: string
  name: string
  oldVersion: string
  newVersion: string
  purl?: string
}

export interface SbomDiff {
  added: ComponentRef[]
  removed: ComponentRef[]
  changed: VersionChange[]
  unchangedCount: number
}

/** Remove the @version from a purl, preserving the (scoped) namespace + name. */
function stripPurlVersion(purl: string): string {
  const noQual = purl.split('?')[0].split('#')[0]
  const lastSlash = noQual.lastIndexOf('/')
  // The version '@' is the one inside the last path segment (after the scope).
  const at = noQual.indexOf('@', lastSlash + 1)
  return at >= 0 ? noQual.slice(0, at) : noQual
}

/**
 * Stable identity for a component across SBOM versions: the version-less purl
 * when present, else type:name. Case-insensitive. The version is compared
 * separately to detect upgrades/downgrades.
 */
export function componentKey(component: Component): string {
  if (component.purl) return stripPurlVersion(component.purl).toLowerCase()
  return `${component.type}:${component.name}`.toLowerCase()
}

function indexByKey(components: Component[]): Map<string, Component> {
  const map = new Map<string, Component>()
  for (const component of components) map.set(componentKey(component), component)
  return map
}

function toRef(key: string, component: Component): ComponentRef {
  return { key, name: component.name, version: component.version, purl: component.purl }
}

/** Compare an old and new component set. */
export function diffSboms(oldComponents: Component[], newComponents: Component[]): SbomDiff {
  const oldMap = indexByKey(oldComponents)
  const newMap = indexByKey(newComponents)

  const added: ComponentRef[] = []
  const removed: ComponentRef[] = []
  const changed: VersionChange[] = []
  let unchangedCount = 0

  for (const [key, component] of newMap) {
    const previous = oldMap.get(key)
    if (!previous) {
      added.push(toRef(key, component))
    } else if (previous.version !== component.version) {
      changed.push({
        key,
        name: component.name,
        oldVersion: previous.version,
        newVersion: component.version,
        purl: component.purl,
      })
    } else {
      unchangedCount++
    }
  }
  for (const [key, component] of oldMap) {
    if (!newMap.has(key)) removed.push(toRef(key, component))
  }

  const byName = (a: { name: string }, b: { name: string }): number => a.name.localeCompare(b.name)
  added.sort(byName)
  removed.sort(byName)
  changed.sort(byName)

  return { added, removed, changed, unchangedCount }
}

/** True when the two SBOMs differ in any component. */
export function hasChanges(diff: SbomDiff): boolean {
  return diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0
}

/** Human-readable diff for the console. */
export function formatDiffConsole(diff: SbomDiff, oldPath: string, newPath: string): string {
  const lines: string[] = []
  lines.push(`Comparing ${oldPath} -> ${newPath}`)
  lines.push('')
  lines.push(
    `+${diff.added.length} added   -${diff.removed.length} removed   ` +
      `~${diff.changed.length} changed   =${diff.unchangedCount} unchanged`,
  )

  if (!hasChanges(diff)) {
    lines.push('')
    lines.push('No component changes.')
    return lines.join('\n')
  }

  if (diff.added.length > 0) {
    lines.push('')
    lines.push('Added:')
    for (const c of diff.added) lines.push(`  + ${c.name}@${c.version}`)
  }
  if (diff.removed.length > 0) {
    lines.push('')
    lines.push('Removed:')
    for (const c of diff.removed) lines.push(`  - ${c.name}@${c.version}`)
  }
  if (diff.changed.length > 0) {
    lines.push('')
    lines.push('Changed:')
    for (const c of diff.changed) lines.push(`  ~ ${c.name}: ${c.oldVersion} -> ${c.newVersion}`)
  }

  return lines.join('\n')
}
