/**
 * DependencyGraph Utility Functions
 */

import cytoscape from 'cytoscape'
import type { Component, Vulnerability } from '@@/types'
import type { GraphNodeData } from './types'
import { SEVERITY_NODE_COLORS, DEFAULT_NODE_STYLE, DEFAULT_EDGE_STYLE, MAX_GRAPH_NODES } from './types'

/**
 * Calculate the maximum severity for a component based on its vulnerabilities
 */
export function getMaxSeverity(
  component: Component,
  vulnerabilities: Vulnerability[],
): 'critical' | 'high' | 'medium' | 'low' | 'none' {
  const componentVulns = vulnerabilities.filter((v) => v.affectedComponents.includes(component.id))

  if (componentVulns.length === 0) {
    return 'none'
  }

  const severityOrder = ['critical', 'high', 'medium', 'low', 'none'] as const
  for (const severity of severityOrder) {
    if (componentVulns.some((v) => v.severity === severity)) {
      return severity
    }
  }

  return 'none'
}

/**
 * Get vulnerability count for a component
 */
export function getVulnerabilityCount(component: Component, vulnerabilities: Vulnerability[]): number {
  return vulnerabilities.filter((v) => v.affectedComponents.includes(component.id)).length
}

/**
 * Detect which dependency edges participate in a circular dependency (FR-11.1-a).
 *
 * Uses Tarjan's strongly-connected-components algorithm: an edge `u->v` is part
 * of a cycle iff `u` and `v` belong to the same SCC (every node in an SCC can
 * reach every other, so any intra-SCC edge lies on a cycle), or it is a
 * self-loop. Returns the set of edge keys (`${sourceId}->${targetId}`) so callers
 * can flag cyclic edges without restructuring the graph.
 */
export function detectCycles(components: Component[]): Set<string> {
  const ids = new Set(components.map((c) => c.id))
  const adjacency = new Map<string, string[]>()
  for (const component of components) {
    const deps = component.dependencies || []
    adjacency.set(
      component.id,
      deps.filter((depId) => ids.has(depId)),
    )
  }

  let index = 0
  let sccCounter = 0
  const indices = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const sccId = new Map<string, number>()

  const strongconnect = (v: string): void => {
    indices.set(v, index)
    lowlink.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)

    for (const w of adjacency.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w)
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, lowlink.get(w) ?? 0))
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v) ?? 0, indices.get(w) ?? 0))
      }
    }

    if ((lowlink.get(v) ?? 0) === (indices.get(v) ?? 0)) {
      // v is the root of an SCC — pop the stack down to v.
      let popped: string | undefined
      do {
        popped = stack.pop()
        if (popped === undefined) break
        onStack.delete(popped)
        sccId.set(popped, sccCounter)
      } while (popped !== v)
      sccCounter++
    }
  }

  for (const component of components) {
    if (!indices.has(component.id)) strongconnect(component.id)
  }

  const cycleEdges = new Set<string>()
  for (const component of components) {
    for (const dep of adjacency.get(component.id) ?? []) {
      const sameScc = sccId.get(component.id) === sccId.get(dep)
      if (component.id === dep || sameScc) {
        cycleEdges.add(`${component.id}->${dep}`)
      }
    }
  }

  return cycleEdges
}

/**
 * Convert components and vulnerabilities to Cytoscape elements
 */
export function buildGraphElements(
  components: Component[],
  vulnerabilities: Vulnerability[],
): cytoscape.ElementsDefinition {
  // Cap node/edge count to keep fcose responsive (FR-11.1-b). Edges to a
  // truncated-out target are dropped by the existing existence guard below, so
  // no dangling-edge cleanup is needed. The page surfaces a truncation banner.
  const graphComponents = components.length > MAX_GRAPH_NODES ? components.slice(0, MAX_GRAPH_NODES) : components

  const nodes: cytoscape.NodeDefinition[] = graphComponents.map((component) => {
    const vulnCount = getVulnerabilityCount(component, vulnerabilities)
    const maxSeverity = getMaxSeverity(component, vulnerabilities)

    const nodeData: GraphNodeData = {
      id: component.id,
      name: component.name,
      version: component.version,
      type: component.type,
      vulnerabilityCount: vulnCount,
      maxSeverity,
      hasPatchAvailable: component.patchInfo?.hasFixAvailable ?? false,
      component,
    }

    return {
      data: nodeData,
    }
  })

  const edges: cytoscape.EdgeDefinition[] = []
  const cycleEdges = detectCycles(graphComponents)

  // Build edges from dependencies
  graphComponents.forEach((component) => {
    if (component.dependencies) {
      component.dependencies.forEach((depId) => {
        // Only add edge if target component exists
        if (graphComponents.some((c) => c.id === depId)) {
          edges.push({
            data: {
              id: `edge-${component.id}-${depId}`,
              source: component.id,
              target: depId,
              isCycleEdge: cycleEdges.has(`${component.id}->${depId}`),
            },
          })
        }
      })
    }
  })

  return { nodes, edges }
}

/**
 * Get node style based on severity
 */
export function getNodeStyle(nodeData: GraphNodeData) {
  const bgColor = SEVERITY_NODE_COLORS[nodeData.maxSeverity] || SEVERITY_NODE_COLORS.none

  return {
    selector: `node[id = "${nodeData.id}"]`,
    style: {
      'background-color': bgColor,
      'border-color': nodeData.hasPatchAvailable ? '#22c55e' : DEFAULT_NODE_STYLE.borderColor,
      'border-width': nodeData.hasPatchAvailable ? 3 : DEFAULT_NODE_STYLE.borderWidth,
      width: DEFAULT_NODE_STYLE.size,
      height: DEFAULT_NODE_STYLE.size,
      label: nodeData.name,
      'font-size': DEFAULT_NODE_STYLE.fontSize,
      color: DEFAULT_NODE_STYLE.labelColor,
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '60px',
      'font-weight': 'bold',
    } as cytoscape.Css.Node,
  }
}

/**
 * Find all paths between two nodes using BFS (limited depth)
 */
export function findPaths(
  components: Component[],
  sourceId: string,
  targetId: string,
  maxDepth: number = 10,
): string[][] {
  const paths: string[][] = []
  const adjacencyList = new Map<string, string[]>()

  // Build adjacency list
  components.forEach((component) => {
    const deps = component.dependencies || []
    adjacencyList.set(
      component.id,
      deps.filter((depId) => components.some((c) => c.id === depId)),
    )
  })

  // BFS with path tracking
  const queue: { nodeId: string; path: string[] }[] = [{ nodeId: sourceId, path: [sourceId] }]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const item = queue.shift()
    if (!item) continue
    const { nodeId, path } = item

    if (path.length > maxDepth) continue

    if (nodeId === targetId && path.length > 1) {
      paths.push(path)
      continue
    }

    const pathKey = `${nodeId}-${path.length}`
    if (visited.has(pathKey)) continue
    visited.add(pathKey)

    const neighbors = adjacencyList.get(nodeId) || []
    for (const neighborId of neighbors) {
      if (!path.includes(neighborId)) {
        queue.push({ nodeId: neighborId, path: [...path, neighborId] })
      }
    }
  }

  // Also search in reverse direction (dependents)
  const reverseQueue: { nodeId: string; path: string[] }[] = [{ nodeId: sourceId, path: [sourceId] }]
  const reverseVisited = new Set<string>()

  // Build reverse adjacency list (who depends on me)
  const reverseAdjacencyList = new Map<string, string[]>()
  components.forEach((component) => {
    const deps = component.dependencies || []
    deps.forEach((depId) => {
      if (!reverseAdjacencyList.has(depId)) {
        reverseAdjacencyList.set(depId, [])
      }
      const entry = reverseAdjacencyList.get(depId)
      if (entry) entry.push(component.id)
    })
  })

  while (reverseQueue.length > 0) {
    const item = reverseQueue.shift()
    if (!item) continue
    const { nodeId, path } = item

    if (path.length > maxDepth) continue

    if (nodeId === targetId && path.length > 1) {
      paths.push(path)
      continue
    }

    const pathKey = `rev-${nodeId}-${path.length}`
    if (reverseVisited.has(pathKey)) continue
    reverseVisited.add(pathKey)

    const dependents = reverseAdjacencyList.get(nodeId) || []
    for (const dependentId of dependents) {
      if (!path.includes(dependentId)) {
        reverseQueue.push({ nodeId: dependentId, path: [...path, dependentId] })
      }
    }
  }

  // Sort by length and return unique paths
  const uniquePaths = [...new Set(paths.map((p) => p.join('→')))].map((p) => p.split('→'))
  return uniquePaths.sort((a, b) => a.length - b.length).slice(0, 5) // Return top 5 shortest paths
}

/**
 * Find shortest path between two nodes
 */
export function findShortestPath(components: Component[], sourceId: string, targetId: string): string[] | null {
  const paths = findPaths(components, sourceId, targetId, 15)
  return paths.length > 0 ? paths[0] : null
}

/**
 * Get path edges from node path
 */
export function getPathEdges(nodePath: string[]): { source: string; target: string }[] {
  const edges: { source: string; target: string }[] = []
  for (let i = 0; i < nodePath.length - 1; i++) {
    edges.push({ source: nodePath[i], target: nodePath[i + 1] })
  }
  return edges
}

/**
 * Get base Cytoscape stylesheet
 */
export function getBaseStyles() {
  return [
    {
      selector: 'node',
      style: {
        'background-color': DEFAULT_NODE_STYLE.backgroundColor,
        'border-color': DEFAULT_NODE_STYLE.borderColor,
        'border-width': DEFAULT_NODE_STYLE.borderWidth,
        width: DEFAULT_NODE_STYLE.size,
        height: DEFAULT_NODE_STYLE.size,
        label: 'data(name)',
        'font-size': DEFAULT_NODE_STYLE.fontSize,
        color: DEFAULT_NODE_STYLE.labelColor,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '60px',
        'font-weight': 'bold',
      } as cytoscape.Css.Node,
    },
    {
      selector: 'edge',
      style: {
        width: DEFAULT_EDGE_STYLE.width,
        'line-color': DEFAULT_EDGE_STYLE.lineColor,
        'target-arrow-color': DEFAULT_EDGE_STYLE.lineColor,
        'target-arrow-shape': 'triangle',
        'arrow-scale': DEFAULT_EDGE_STYLE.arrowScale,
        'curve-style': DEFAULT_EDGE_STYLE.curveStyle,
      } as cytoscape.Css.Edge,
    },
    {
      // Circular-dependency edges are flagged dashed + amber (FR-11.1-a).
      selector: 'edge[?isCycleEdge]',
      style: {
        'line-style': 'dashed',
        'line-color': '#f59e0b', // amber-500
        'target-arrow-color': '#f59e0b',
      } as cytoscape.Css.Edge,
    },
    {
      selector: 'node:active',
      style: {
        'overlay-color': '#ffffff',
        'overlay-padding': 5,
        'overlay-opacity': 0.3,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node:selected',
      style: {
        'border-width': 4,
        'border-color': '#3b82f6',
      } as cytoscape.Css.Node,
    },
    // Path highlight styles
    {
      selector: 'node.path-highlight',
      style: {
        'border-width': 4,
        'border-color': '#3b82f6',
        'overlay-color': '#3b82f6',
        'overlay-opacity': 0.2,
        'overlay-padding': 8,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'edge.path-highlight',
      style: {
        width: 4,
        'line-color': '#3b82f6',
        'target-arrow-color': '#3b82f6',
        'z-index': 10,
      } as cytoscape.Css.Edge,
    },
    {
      selector: 'node.path-source',
      style: {
        'border-width': 5,
        'border-color': '#22c55e',
        'overlay-color': '#22c55e',
        'overlay-opacity': 0.3,
        'overlay-padding': 10,
      } as cytoscape.Css.Node,
    },
    {
      selector: 'node.path-target',
      style: {
        'border-width': 5,
        'border-color': '#dc2626',
        'overlay-color': '#dc2626',
        'overlay-opacity': 0.3,
        'overlay-padding': 10,
      } as cytoscape.Css.Node,
    },
  ]
}
