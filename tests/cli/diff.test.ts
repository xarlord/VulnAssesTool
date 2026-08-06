import { describe, it, expect } from 'vitest'
import { diffSboms, componentKey, hasChanges, formatDiffConsole } from '../../cli/commands/diff.js'
import type { Component } from '../../src/shared/types.js'

function comp(p: Partial<Component> & { name: string; version: string }): Component {
  return { id: p.name, type: 'library', licenses: [], vulnerabilities: [], ...p }
}

const lodash1 = comp({ name: 'lodash', version: '4.17.15', purl: 'pkg:npm/lodash@4.17.15' })
const lodash2 = comp({ name: 'lodash', version: '4.17.21', purl: 'pkg:npm/lodash@4.17.21' })
const axios = comp({ name: 'axios', version: '1.0.0', purl: 'pkg:npm/axios@1.0.0' })
const express = comp({ name: 'express', version: '4.18.0', purl: 'pkg:npm/express@4.18.0' })

describe('componentKey', () => {
  it('strips the version so the same package matches across versions', () => {
    expect(componentKey(lodash1)).toBe('pkg:npm/lodash')
    expect(componentKey(lodash2)).toBe('pkg:npm/lodash')
  })

  it('preserves a scoped npm namespace in the key', () => {
    expect(componentKey(comp({ name: 'core', version: '11', purl: 'pkg:npm/@angular/core@11.0.0' }))).toBe(
      'pkg:npm/@angular/core',
    )
  })

  it('falls back to type:name (lowercased) when there is no purl', () => {
    expect(componentKey(comp({ name: 'Foo', version: '1', type: 'application' }))).toBe('application:foo')
  })
})

describe('diffSboms', () => {
  it('classifies added, removed, changed, and unchanged components', () => {
    const diff = diffSboms([lodash1, axios], [lodash2, express])
    expect(diff.changed.map((c) => c.name)).toEqual(['lodash'])
    expect(diff.changed[0]).toMatchObject({ oldVersion: '4.17.15', newVersion: '4.17.21' })
    expect(diff.added.map((c) => c.name)).toEqual(['express'])
    expect(diff.removed.map((c) => c.name)).toEqual(['axios'])
    expect(diff.unchangedCount).toBe(0)
  })

  it('counts unchanged components and reports no changes', () => {
    const diff = diffSboms([lodash1, axios], [lodash1, axios])
    expect(diff.unchangedCount).toBe(2)
    expect(hasChanges(diff)).toBe(false)
  })

  it('detects a version change as a change, not add+remove', () => {
    const diff = diffSboms([lodash1], [lodash2])
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
    expect(hasChanges(diff)).toBe(true)
  })
})

describe('formatDiffConsole', () => {
  it('summarizes counts and lists each change', () => {
    const out = formatDiffConsole(diffSboms([lodash1, axios], [lodash2, express]), 'old.json', 'new.json')
    expect(out).toContain('Comparing old.json -> new.json')
    expect(out).toContain('+1 added')
    expect(out).toContain('  + express@4.18.0')
    expect(out).toContain('  - axios@1.0.0')
    expect(out).toContain('  ~ lodash: 4.17.15 -> 4.17.21')
  })

  it('reports no changes for identical SBOMs', () => {
    expect(formatDiffConsole(diffSboms([lodash1], [lodash1]), 'a', 'b')).toContain('No component changes.')
  })
})
