/**
 * DependencyGraph Component Types
 *
 * Type definitions for the dependency graph visualization component
 */

import type { Component, Vulnerability } from '@@/types'

/**
 * Props for the DependencyGraph component
 */
export interface DependencyGraphProps {
  /** Array of components to display in the graph */
  components: Component[]
  /** Array of vulnerabilities to determine node severity coloring */
  vulnerabilities: Vulnerability[]
  /** Callback when a node is clicked */
  onNodeClick?: (component: Component) => void
  /** Height of the graph container (default: 400) */
  height?: string | number
  /** Whether to show the zoom controls (default: true) */
  showControls?: boolean
  /** Whether to show the legend (default: true) */
  showLegend?: boolean
  /** Additional CSS class name */
  className?: string
  /** Path to highlight (array of node IDs) */
  highlightPath?: string[]
  /** Clear path highlighting */
  clearHighlight?: boolean
}

/**
 * Internal node data structure for Cytoscape
 */
export interface GraphNodeData {
  /** Component ID */
  id: string
  /** Component name */
  name: string
  /** Component version */
  version: string
  /** Component type */
  type: Component['type']
  /** Number of vulnerabilities */
  vulnerabilityCount: number
  /** Maximum severity level */
  maxSeverity: 'critical' | 'high' | 'medium' | 'low' | 'none'
  /** Whether a patch is available */
  hasPatchAvailable: boolean
  /** Original component reference */
  component: Component
}

/**
 * Internal edge data structure for Cytoscape
 */
export interface GraphEdgeData {
  /** Edge ID */
  id: string
  /** Source component ID */
  source: string
  /** Target component ID */
  target: string
}

/**
 * Severity color mapping
 */
export const SEVERITY_NODE_COLORS: Record<string, string> = {
  critical: '#dc2626', // red-600
  high: '#ea580c', // orange-600
  medium: '#ca8a04', // yellow-600
  low: '#16a34a', // green-600
  none: '#6b7280', // gray-500
}

/**
 * Node styling configuration
 */
export interface NodeStyleConfig {
  /** Background color */
  backgroundColor: string
  /** Border color */
  borderColor: string
  /** Border width */
  borderWidth: number
  /** Node size */
  size: number
  /** Label font size */
  fontSize: number
  /** Label color */
  labelColor: string
}

/**
 * Default node style configuration
 */
export const DEFAULT_NODE_STYLE: NodeStyleConfig = {
  backgroundColor: SEVERITY_NODE_COLORS.none,
  borderColor: '#374151', // gray-700
  borderWidth: 2,
  size: 50,
  fontSize: 10,
  labelColor: '#f9fafb', // gray-50
}

/**
 * Edge styling configuration
 */
export interface EdgeStyleConfig {
  /** Line color */
  lineColor: string
  /** Line width */
  width: number
  /** Arrow scale */
  arrowScale: number
  /** Curve style */
  curveStyle: 'bezier' | 'straight' | 'unbundled-bezier' | 'segments'
}

/**
 * Default edge style configuration
 */
export const DEFAULT_EDGE_STYLE: EdgeStyleConfig = {
  lineColor: '#6b7280', // gray-500
  width: 2,
  arrowScale: 0.8,
  curveStyle: 'bezier',
}

/**
 * Graph layout configuration
 */
export interface LayoutConfig {
  /** Layout name */
  name: 'fcose' | 'cose' | 'circle' | 'concentric' | 'breadthfirst' | 'grid' | 'random'
  /** Whether to animate the layout */
  animate: boolean
  /** Animation duration in milliseconds */
  animationDuration: number
  /** Ideal edge length */
  idealEdgeLength: number
  /** Node separation */
  nodeSeparation: number
  /** Whether to fit the graph to viewport */
  fit: boolean
  /** Padding around the graph */
  padding: number
  /** Whether to randomize node positions */
  randomize: boolean
}

/**
 * Default layout configuration for force-directed layout
 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  name: 'fcose',
  animate: true,
  animationDuration: 500,
  idealEdgeLength: 100,
  nodeSeparation: 75,
  fit: true,
  padding: 30,
  randomize: true,
}

/**
 * Path analysis result
 */
export interface PathResult {
  /** Path found flag */
  found: boolean
  /** Array of node IDs in the path */
  path: string[]
  /** Array of node names for display */
  pathNames: string[]
  /** Path length (number of edges) */
  length: number
}

/**
 * Path highlight style configuration
 */
export const PATH_HIGHLIGHT_STYLE = {
  /** Highlighted node color */
  nodeColor: '#3b82f6', // blue-500
  /** Highlighted edge color */
  edgeColor: '#3b82f6',
  /** Highlighted edge width */
  edgeWidth: 4,
  /** Path node border */
  nodeBorderWidth: 4,
}
