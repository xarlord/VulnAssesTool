/**
 * DependencyGraph Utility Functions
 */

import cytoscape from 'cytoscape'
import type { Component, Vulnerability } from '@@/types'
import type { GraphNodeData } from './types'
import { SEVERITY_NODE_COLORS, DEFAULT_NODE_STYLE, DEFAULT_EDGE_STYLE } from './types'

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
 * Convert components and vulnerabilities to Cytoscape elements
 */
export function buildGraphElements(
  components: Component[],
  vulnerabilities: Vulnerability[],
): cytoscape.ElementsDefinition {
  const nodes: cytoscape.NodeDefinition[] = components.map((component) => {
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

  // Build edges from dependencies
  components.forEach((component) => {
    if (component.dependencies) {
      component.dependencies.forEach((depId) => {
        // Only add edge if target component exists
        if (components.some((c) => c.id === depId)) {
          edges.push({
            data: {
              id: `edge-${component.id}-${depId}`,
              source: component.id,
              target: depId,
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
export function getNodeStyle(nodeData: GraphNodeData): cytoscape.Stylesheet {
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
export function getBaseStyles(): cytoscape.Stylesheet[] {
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
