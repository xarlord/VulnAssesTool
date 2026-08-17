/**
 * DependencyGraph Utility Functions Tests — getNodeStyle / getBaseStyles
 *
 * These two functions are exercised indirectly whenever <DependencyGraph> mounts
 * (see DependencyGraph.test.tsx), but every mounting test there uses a component
 * with no patch info and a valid severity, so the "patch available" and the
 * "unrecognized severity" branches of getNodeStyle are never taken. This file
 * targets those branches directly.
 */

import { describe, it, expect } from 'vitest'
import { getNodeStyle, getBaseStyles } from './utils'
import { SEVERITY_NODE_COLORS, DEFAULT_NODE_STYLE } from './types'
import type { GraphNodeData } from './types'
import type { Component } from '@@/types'

function createMockComponent(overrides?: Partial<Component>): Component {
  return {
    id: 'comp-1',
    name: 'test-component',
    version: '1.0.0',
    type: 'library',
    licenses: ['MIT'],
    vulnerabilities: [],
    dependencies: [],
    dependents: [],
    ...overrides,
  }
}

function createNodeData(overrides?: Partial<GraphNodeData>): GraphNodeData {
  return {
    id: 'comp-1',
    name: 'test-component',
    version: '1.0.0',
    type: 'library',
    vulnerabilityCount: 0,
    maxSeverity: 'none',
    hasPatchAvailable: false,
    component: createMockComponent(),
    ...overrides,
  }
}

describe('getNodeStyle', () => {
  it('highlights the border in green with a thicker width when a patch is available, so users can spot fixable nodes at a glance', () => {
    const nodeData = createNodeData({ hasPatchAvailable: true })

    const style = getNodeStyle(nodeData)

    expect(style.style['border-color']).toBe('#22c55e')
    expect(style.style['border-width']).toBe(3)
  })

  it('falls back to the default border color and width when no patch is available', () => {
    const nodeData = createNodeData({ hasPatchAvailable: false })

    const style = getNodeStyle(nodeData)

    expect(style.style['border-color']).toBe(DEFAULT_NODE_STYLE.borderColor)
    expect(style.style['border-width']).toBe(DEFAULT_NODE_STYLE.borderWidth)
  })

  it('uses the neutral "none" color as a defensive default when maxSeverity is not a recognized severity key', () => {
    // GraphNodeData.maxSeverity is typed to a closed set of severities, but the
    // implementation still guards the lookup with `|| SEVERITY_NODE_COLORS.none`.
    // Simulate corrupted/unexpected data to prove that guard actually protects
    // the rendered color instead of producing an undefined background.
    const nodeData = createNodeData({ maxSeverity: 'unknown' as unknown as GraphNodeData['maxSeverity'] })

    const style = getNodeStyle(nodeData)

    expect(style.style['background-color']).toBe(SEVERITY_NODE_COLORS.none)
  })

  it('uses the matching severity color when maxSeverity is a recognized key', () => {
    const nodeData = createNodeData({ maxSeverity: 'critical' })

    const style = getNodeStyle(nodeData)

    expect(style.style['background-color']).toBe(SEVERITY_NODE_COLORS.critical)
  })

  it('scopes the style to the exact node id via a quoted attribute selector, so styles do not bleed onto other nodes', () => {
    const nodeData = createNodeData({ id: 'comp-42' })

    const style = getNodeStyle(nodeData)

    expect(style.selector).toBe('node[id = "comp-42"]')
  })

  it('labels the node with its component name, not its id, so the graph reads as component names', () => {
    const nodeData = createNodeData({ id: 'comp-1', name: 'left-pad' })

    const style = getNodeStyle(nodeData)

    expect(style.style.label).toBe('left-pad')
  })
})

describe('getBaseStyles', () => {
  it('flags cycle edges with the dashed amber contract that FR-11.1-a relies on to warn about circular dependencies', () => {
    const styles = getBaseStyles()

    const cycleStyle = styles.find((s) => s.selector === 'edge[?isCycleEdge]')

    expect(cycleStyle).toBeDefined()
    expect(cycleStyle?.style['line-style']).toBe('dashed')
    expect(cycleStyle?.style['line-color']).toBe('#f59e0b')
  })

  it('defines a default node style driven by the shared node-style config, so nodes without severity overrides still render consistently', () => {
    const styles = getBaseStyles()

    const nodeStyle = styles.find((s) => s.selector === 'node')

    expect(nodeStyle?.style['background-color']).toBe(DEFAULT_NODE_STYLE.backgroundColor)
    expect(nodeStyle?.style.label).toBe('data(name)')
  })
})
