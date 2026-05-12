export { DependencyGraph } from './DependencyGraph'
export type {
  DependencyGraphProps,
  GraphNodeData,
  GraphEdgeData,
  NodeStyleConfig,
  EdgeStyleConfig,
  LayoutConfig,
  PathResult,
} from './types'
export {
  SEVERITY_NODE_COLORS,
  DEFAULT_NODE_STYLE,
  DEFAULT_EDGE_STYLE,
  DEFAULT_LAYOUT_CONFIG,
  PATH_HIGHLIGHT_STYLE,
} from './types'
export { findPaths, findShortestPath, getPathEdges, getMaxSeverity, getVulnerabilityCount } from './utils'
