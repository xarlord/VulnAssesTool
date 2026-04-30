/**
 * Attack Graph - Attack Path Analysis for False Positive Filter (Tier 2)
 *
 * Builds and analyzes attack paths from external entry points to internal components.
 * Used to determine if vulnerabilities in internal components are reachable.
 *
 * @module fpf/attackGraph
 */

import type {
  SystemConfig,
  AttackGraphNode,
  AttackGraphEdge,
  AttackEdgeType,
  ExposureLevel,
  ReachabilityResult,
  InterfaceConfig,
  ServiceConfig,
  FeatureConfig,
} from '@@/types/fpf'

/**
 * Template for pre-built attack graphs
 */
export interface GraphTemplate {
  name: string
  description: string
  version: string
  nodes: AttackGraphNode[]
  edges: AttackGraphEdge[]
}

/**
 * Queue item for BFS path finding
 */
interface BFSQueueItem {
  nodeId: string
  path: string[]
}

/**
 * Attack Graph class for analyzing reachability of components
 */
export class AttackGraph {
  private nodes: Map<string, AttackGraphNode> = new Map()
  private edges: AttackGraphEdge[] = []
  private adjacencyList: Map<string, string[]> = new Map()
  private edgeTypes: Map<string, Map<string, AttackEdgeType>> = new Map()
  private config: SystemConfig

  /**
   * Create a new AttackGraph
   * @param config - System configuration
   * @param template - Optional pre-built template to start with
   */
  constructor(config: SystemConfig, template?: GraphTemplate) {
    this.config = config

    if (template) {
      // Load template nodes and edges
      for (const node of template.nodes) {
        this.addNode(node)
      }
      for (const edge of template.edges) {
        this.addEdge(edge)
      }
    }

    // Build from config
    this.buildFromConfig(config)
  }

  /**
   * Add a node to the graph
   * @param node - Node to add
   */
  addNode(node: AttackGraphNode): void {
    if (this.nodes.has(node.id)) {
      // Update existing node
      const existing = this.nodes.get(node.id)!
      this.nodes.set(node.id, { ...existing, ...node })
    } else {
      this.nodes.set(node.id, node)
    }

    // Initialize adjacency list for this node
    if (!this.adjacencyList.has(node.id)) {
      this.adjacencyList.set(node.id, [])
    }

    if (!this.edgeTypes.has(node.id)) {
      this.edgeTypes.set(node.id, new Map())
    }
  }

  /**
   * Add an edge to the graph
   * @param edge - Edge to add
   */
  addEdge(edge: AttackGraphEdge): void {
    // Ensure both nodes exist
    if (!this.nodes.has(edge.from)) {
      throw new Error(`Source node "${edge.from}" does not exist`)
    }
    if (!this.nodes.has(edge.to)) {
      throw new Error(`Target node "${edge.to}" does not exist`)
    }

    // Add edge
    this.edges.push(edge)

    // Update adjacency list (only for non-blocking edges)
    if (edge.type !== 'blocking') {
      const adjacency = this.adjacencyList.get(edge.from) || []
      if (!adjacency.includes(edge.to)) {
        adjacency.push(edge.to)
        this.adjacencyList.set(edge.from, adjacency)
      }
    }

    // Store edge type for blocking detection
    const edgeTypeMap = this.edgeTypes.get(edge.from) || new Map()
    edgeTypeMap.set(edge.to, edge.type)
    this.edgeTypes.set(edge.from, edgeTypeMap)
  }

  /**
   * Find all entry points (external-facing nodes)
   * @returns Array of entry point nodes
   */
  findEntryPoints(): AttackGraphNode[] {
    const entryPoints: AttackGraphNode[] = []

    for (const node of this.nodes.values()) {
      if (node.type === 'entry_point' && node.enabled && node.exposure === 'external') {
        entryPoints.push(node)
      }
    }

    return entryPoints
  }

  /**
   * Find a path from one node to another using BFS
   * @param from - Starting node ID
   * @param to - Target node ID
   * @returns Path as array of node IDs, or null if no path exists
   */
  findPath(from: string, to: string): string[] | null {
    if (!this.nodes.has(from)) {
      return null
    }
    if (!this.nodes.has(to)) {
      return null
    }
    if (from === to) {
      return [from]
    }

    // BFS
    const visited = new Set<string>()
    const queue: BFSQueueItem[] = [{ nodeId: from, path: [from] }]
    visited.add(from)

    while (queue.length > 0) {
      const current = queue.shift()!

      const neighbors = this.adjacencyList.get(current.nodeId) || []
      for (const neighbor of neighbors) {
        if (neighbor === to) {
          return [...current.path, neighbor]
        }

        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          queue.push({
            nodeId: neighbor,
            path: [...current.path, neighbor],
          })
        }
      }
    }

    return null
  }

  /**
   * Find all paths from one node to another
   * @param from - Starting node ID
   * @param to - Target node ID
   * @returns Array of paths (each path is array of node IDs)
   */
  findAllPaths(from: string, to: string): string[][] {
    if (!this.nodes.has(from) || !this.nodes.has(to)) {
      return []
    }

    const allPaths: string[][] = []
    const visited = new Set<string>()

    this.findAllPathsDFS(from, to, visited, [], allPaths)

    return allPaths
  }

  /**
   * DFS helper for finding all paths
   */
  private findAllPathsDFS(
    current: string,
    target: string,
    visited: Set<string>,
    path: string[],
    allPaths: string[][],
  ): void {
    visited.add(current)
    path.push(current)

    if (current === target) {
      allPaths.push([...path])
    } else {
      const neighbors = this.adjacencyList.get(current) || []
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          this.findAllPathsDFS(neighbor, target, visited, path, allPaths)
        }
      }
    }

    // Backtrack
    path.pop()
    visited.delete(current)
  }

  /**
   * Check if a target component is reachable from any external entry point
   * @param targetComponent - Target component name or ID
   * @returns Reachability result with paths and blocking information
   */
  isReachableFromExternal(targetComponent: string): ReachabilityResult {
    const entryPoints = this.findEntryPoints()

    // Find target node - try exact match first, then partial match
    let targetNode: AttackGraphNode | undefined
    for (const node of this.nodes.values()) {
      if (node.id === targetComponent || node.name === targetComponent) {
        targetNode = node
        break
      }
    }

    // Try partial match on component names (e.g., "openssl" matches "service:openssl")
    if (!targetNode) {
      const searchTerm = targetComponent.toLowerCase()
      for (const node of this.nodes.values()) {
        if (node.name.toLowerCase().includes(searchTerm) || node.id.toLowerCase().includes(searchTerm)) {
          targetNode = node
          break
        }
      }
    }

    if (!targetNode) {
      return {
        reachable: false,
        paths: [],
        shortestPath: null,
        blockedBy: [],
        confidence: 100, // High confidence that non-existent node is unreachable
      }
    }

    // Check if target is itself an entry point
    if (targetNode.type === 'entry_point' && targetNode.exposure === 'external') {
      return {
        reachable: true,
        paths: [[targetNode.id]],
        shortestPath: [targetNode.id],
        blockedBy: [],
        confidence: 100,
      }
    }

    // If target is disabled, it's not reachable
    if (!targetNode.enabled) {
      return {
        reachable: false,
        paths: [],
        shortestPath: null,
        blockedBy: [`${targetNode.name} is disabled`],
        confidence: 100,
      }
    }

    // Find all paths from entry points to target
    const allPaths: string[][] = []
    const blockedBy: string[] = []

    for (const entryPoint of entryPoints) {
      const paths = this.findAllPaths(entryPoint.id, targetNode.id)
      allPaths.push(...paths)
    }

    // Check for blocking edges along potential paths
    for (const path of allPaths) {
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i]
        const to = path[i + 1]
        const edgeTypeMap = this.edgeTypes.get(from)
        if (edgeTypeMap) {
          const edgeType = edgeTypeMap.get(to)
          if (edgeType === 'blocking') {
            const node = this.nodes.get(to)
            blockedBy.push(`${node?.name || to} blocks access`)
          }
        }
      }
    }

    // Also check for disabled nodes along paths
    for (const path of allPaths) {
      for (const nodeId of path) {
        const node = this.nodes.get(nodeId)
        if (node && !node.enabled && nodeId !== targetNode.id) {
          blockedBy.push(`${node.name} is disabled`)
        }
      }
    }

    // Filter out paths that go through disabled nodes
    const validPaths = allPaths.filter((path) => {
      return path.every((nodeId) => {
        const node = this.nodes.get(nodeId)
        return node ? node.enabled : false
      })
    })

    // Find shortest path
    let shortestPath: string[] | null = null
    if (validPaths.length > 0) {
      shortestPath = validPaths.reduce((shortest, current) => (current.length < shortest.length ? current : shortest))
    }

    // Calculate confidence based on number of paths and blocking
    let confidence = 50 // Base confidence
    if (validPaths.length === 0 && blockedBy.length > 0) {
      confidence = 90 // High confidence when blocked
    } else if (validPaths.length > 0) {
      confidence = 85 // High confidence when reachable
    } else if (allPaths.length === 0) {
      confidence = 75 // Medium confidence when no paths exist
    }

    // Adjust confidence based on path length (shorter paths = more certain)
    if (shortestPath && shortestPath.length > 0) {
      confidence = Math.max(50, confidence - (shortestPath.length - 1) * 5)
    }

    return {
      reachable: validPaths.length > 0,
      paths: validPaths,
      shortestPath,
      blockedBy: [...new Set(blockedBy)], // Remove duplicates
      confidence: Math.min(100, Math.max(0, confidence)),
    }
  }

  /**
   * Build the attack graph from system configuration
   * @param config - System configuration
   */
  buildFromConfig(config: SystemConfig): void {
    // Add entry points from interfaces
    for (const [interfaceName, interfaceConfig] of Object.entries(config.interfaces)) {
      this.addInterfaceNode(interfaceName, interfaceConfig)
    }

    // Add service nodes
    for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
      this.addServiceNode(serviceName, serviceConfig)
    }

    // Add feature nodes
    for (const [featureName, featureConfig] of Object.entries(config.features)) {
      this.addFeatureNode(featureName, featureConfig)
    }

    // Build edges based on configuration relationships
    this.buildEdges(config)
  }

  /**
   * Add an interface as a node
   */
  private addInterfaceNode(name: string, config: InterfaceConfig): void {
    const exposure: ExposureLevel = config.exposure || (config.enabled ? 'external' : 'isolated')

    const node: AttackGraphNode = {
      id: `interface:${name}`,
      type: 'interface',
      name: this.formatDisplayName(name),
      enabled: config.enabled,
      exposure,
      config: {
        ...config,
      } as Record<string, unknown>,
    }

    this.addNode(node)

    // Add corresponding entry point if external and enabled
    if (config.enabled && exposure === 'external') {
      const entryNode: AttackGraphNode = {
        id: `entry:${name}`,
        type: 'entry_point',
        name: `External ${this.formatDisplayName(name)}`,
        enabled: true,
        exposure: 'external',
        config: {},
      }
      this.addNode(entryNode)

      // Add edge from entry point to interface
      this.addEdge({
        from: entryNode.id,
        to: node.id,
        type: 'data_flow',
        protocol: this.getProtocolForInterface(name),
      })
    }
  }

  /**
   * Add a service as a node
   */
  private addServiceNode(name: string, config: ServiceConfig): void {
    const exposure: ExposureLevel = config.externalAccess ? 'external' : 'internal'

    const node: AttackGraphNode = {
      id: `service:${name}`,
      type: 'service',
      name: this.formatDisplayName(name),
      enabled: config.enabled,
      exposure,
      config: {
        ...config,
      } as Record<string, unknown>,
    }

    this.addNode(node)
  }

  /**
   * Add a feature as a node
   */
  private addFeatureNode(name: string, config: FeatureConfig): void {
    const isEnabled = typeof config.enabled === 'boolean' ? config.enabled : true
    const exposure: ExposureLevel = config.exposure || 'internal'

    const node: AttackGraphNode = {
      id: `feature:${name}`,
      type: 'component',
      name: this.formatDisplayName(name),
      enabled: isEnabled,
      exposure,
      config: {
        ...config,
      } as Record<string, unknown>,
    }

    this.addNode(node)
  }

  /**
   * Build edges between nodes based on configuration
   */
  private buildEdges(config: SystemConfig): void {
    // Map interface to services they typically expose
    const interfaceServiceMap: Record<string, string[]> = {
      usb: ['usb_service', 'mass_storage', 'usb_hid'],
      bluetooth: ['bluez', 'bluetoothd', 'obexd'],
      wifi: ['wpa_supplicant', 'hostapd', 'dhclient'],
      ethernet: ['dhclient', 'network_manager', 'systemd_networkd'],
      cellular: ['modem_manager', 'qmi', 'ofono'],
      can: ['canbus_service', 'socketcan'],
      gps: ['gpsd', 'location_service'],
      ethernet_switch: ['switch_daemon', 'vlan_service'],
    }

    // Map services to their dependencies/components
    const serviceComponentMap: Record<string, string[]> = {
      openssl: ['libssl', 'libcrypto'],
      bluez: ['bluetoothd', 'obexd', 'gatt'],
      wpa_supplicant: ['wpa_client', 'tls'],
      connman: ['dhcp_client', 'dns_resolver'],
      modem_manager: ['qmi', 'mbim', 'pppd'],
      gpsd: ['nmea_parser', 'serial'],
      ssh_server: ['sshd', 'sftp_server'],
      avahi: ['mdns', 'dns_sd'],
    }

    // Connect interfaces to services
    for (const [interfaceName, interfaceConfig] of Object.entries(config.interfaces)) {
      if (!interfaceConfig.enabled) continue

      const services = interfaceServiceMap[interfaceName.toLowerCase()] || []
      const interfaceId = `interface:${interfaceName}`

      for (const serviceName of services) {
        const serviceId = `service:${serviceName}`
        if (this.nodes.has(serviceId)) {
          this.addEdge({
            from: interfaceId,
            to: serviceId,
            type: 'data_flow',
            protocol: this.getProtocolForInterface(interfaceName),
          })
        }
      }
    }

    // Connect services to components
    for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
      if (!serviceConfig.enabled) continue

      const components = serviceComponentMap[serviceName.toLowerCase()] || []
      const serviceId = `service:${serviceName}`

      for (const componentName of components) {
        const componentId = `feature:${componentName}`
        if (this.nodes.has(componentId)) {
          this.addEdge({
            from: serviceId,
            to: componentId,
            type: 'control_flow',
          })
        }
      }
    }

    // Add blocking edges for disabled services/features
    this.addBlockingEdges()
  }

  /**
   * Add blocking edges for disabled components
   */
  private addBlockingEdges(): void {
    for (const node of this.nodes.values()) {
      if (!node.enabled && node.exposure !== 'external') {
        // Disabled internal nodes block paths through them
        const neighbors = this.adjacencyList.get(node.id) || []
        for (const neighbor of neighbors) {
          // Add blocking edge marker (not added to adjacency list)
          const edgeTypeMap = this.edgeTypes.get(node.id) || new Map()
          edgeTypeMap.set(neighbor, 'blocking')
          this.edgeTypes.set(node.id, edgeTypeMap)
        }
      }
    }
  }

  /**
   * Format interface/service name for display
   */
  private formatDisplayName(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  /**
   * Get protocol for interface type
   */
  private getProtocolForInterface(interfaceName: string): string {
    const protocolMap: Record<string, string> = {
      usb: 'USB',
      bluetooth: 'Bluetooth/BLE',
      wifi: '802.11',
      ethernet: 'Ethernet/TCP/IP',
      cellular: 'LTE/5G',
      can: 'CAN Bus',
      gps: 'NMEA/GPS',
      ethernet_switch: 'Ethernet/VLAN',
    }
    return protocolMap[interfaceName.toLowerCase()] || 'Unknown'
  }

  /**
   * Get all nodes in the graph
   * @returns Array of all nodes
   */
  getNodes(): AttackGraphNode[] {
    return Array.from(this.nodes.values())
  }

  /**
   * Get all edges in the graph
   * @returns Array of all edges
   */
  getEdges(): AttackGraphEdge[] {
    return [...this.edges]
  }

  /**
   * Get a specific node by ID
   * @param nodeId - Node ID to look up
   * @returns Node or undefined if not found
   */
  getNode(nodeId: string): AttackGraphNode | undefined {
    return this.nodes.get(nodeId)
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear()
    this.edges = []
    this.adjacencyList.clear()
    this.edgeTypes.clear()
  }
}

export default AttackGraph
