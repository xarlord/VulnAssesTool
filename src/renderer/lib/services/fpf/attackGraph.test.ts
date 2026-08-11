/**
 * Attack Graph Tests
 *
 * Unit tests for the AttackGraph class and Tier2AttackGraphFilter.
 * Tests graph building, path finding (BFS), blocking detection, and confidence scoring.
 *
 * @module fpf/attackGraph.test
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { AttackGraph, GraphTemplate } from './attackGraph'
import { Tier2AttackGraphFilter } from './tier2AttackGraphFilter'
import type {
  SystemConfig,
  AttackGraphNode,
  AttackGraphEdge,
  ReachabilityResult,
  Vulnerability,
  Component,
} from '@@/types/fpf'

// Test fixtures
const createMockConfig = (overrides: Partial<SystemConfig> = {}): SystemConfig => ({
  project: {
    name: 'Test Project',
    version: '1.0.0',
    tier: 'production',
  },
  cybersecurity: {
    attackSurface: 'intermediate',
    safetyRelated: true,
    asilLevel: 'B',
  },
  interfaces: {
    wifi: { enabled: true, exposure: 'external', confidence: 90 },
    bluetooth: { enabled: true, exposure: 'external', confidence: 90 },
    usb: { enabled: false, exposure: 'external', confidence: 100, reason: 'Disabled' },
    ethernet: { enabled: true, exposure: 'internal', confidence: 85 },
  },
  services: {
    wpa_supplicant: { enabled: true, externalAccess: false, confidence: 90 },
    openssl: { enabled: true, externalAccess: false, confidence: 95 },
    sshd: { enabled: false, externalAccess: true, confidence: 100, reason: 'SSH disabled' },
  },
  features: {
    tls: { enabled: true, exposure: 'internal', confidence: 90 },
    remote_access: { enabled: false, exposure: 'external', confidence: 100 },
  },
  ...overrides,
})

const createMockTemplate = (): GraphTemplate => ({
  name: 'Test Template',
  description: 'Template for testing',
  version: '1.0.0',
  nodes: [
    { id: 'entry:wifi', type: 'entry_point', name: 'External WiFi', enabled: true, exposure: 'external' },
    { id: 'interface:wifi', type: 'interface', name: 'WiFi', enabled: true, exposure: 'external' },
    { id: 'service:wpa_supplicant', type: 'service', name: 'wpa_supplicant', enabled: true, exposure: 'internal' },
    { id: 'service:openssl', type: 'service', name: 'OpenSSL', enabled: true, exposure: 'internal' },
    { id: 'component:libssl', type: 'component', name: 'libssl', enabled: true, exposure: 'internal' },
    { id: 'component:libcrypto', type: 'component', name: 'libcrypto', enabled: true, exposure: 'internal' },
    { id: 'service:sshd', type: 'service', name: 'SSH Server', enabled: false, exposure: 'internal' },
  ],
  edges: [
    { from: 'entry:wifi', to: 'interface:wifi', type: 'data_flow', protocol: '802.11' },
    { from: 'interface:wifi', to: 'service:wpa_supplicant', type: 'data_flow' },
    { from: 'service:wpa_supplicant', to: 'service:openssl', type: 'data_flow', protocol: 'TLS' },
    { from: 'service:openssl', to: 'component:libssl', type: 'control_flow' },
    { from: 'service:openssl', to: 'component:libcrypto', type: 'control_flow' },
    { from: 'interface:wifi', to: 'service:sshd', type: 'blocking' },
  ],
})

const createMockVulnerability = (overrides: Partial<Vulnerability> = {}): Vulnerability => ({
  id: 'CVE-2024-1234',
  source: 'nvd',
  severity: 'high',
  cvssScore: 7.5,
  description: 'Test vulnerability',
  references: [],
  affectedComponents: ['comp-1'],
  ...overrides,
})

const createMockComponent = (overrides: Partial<Component> = {}): Component => ({
  id: 'comp-1',
  name: 'openssl',
  version: '3.0.0',
  type: 'library',
  licenses: ['Apache-2.0'],
  vulnerabilities: [],
  ...overrides,
})

// A disabled-but-internal node with an edge added *before* buildFromConfig runs, so
// addBlockingEdges() retroactively marks that edge 'blocking' without removing it from the
// adjacency list — the only way a "blocked" path (as opposed to a merely absent one) occurs.
const createBlockingTemplate = (blockerName: string): GraphTemplate => ({
  name: 'Blocking Template',
  description: 'A disabled internal node with a pre-existing outgoing edge',
  version: '1.0.0',
  nodes: [
    { id: 'entry:sensor', type: 'entry_point', name: 'Sensor Entry', enabled: true, exposure: 'external' },
    { id: 'interface:sensor', type: 'interface', name: 'Sensor', enabled: true, exposure: 'external' },
    { id: 'service:relay', type: 'service', name: blockerName, enabled: false, exposure: 'internal' },
    { id: 'component:sink', type: 'component', name: 'Sink', enabled: true, exposure: 'internal' },
  ],
  edges: [
    { from: 'entry:sensor', to: 'interface:sensor', type: 'data_flow' },
    { from: 'interface:sensor', to: 'service:relay', type: 'data_flow' },
    { from: 'service:relay', to: 'component:sink', type: 'data_flow' },
  ],
})

describe('AttackGraph', () => {
  describe('constructor and graph building', () => {
    it('should create a graph with nodes', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      expect(graph).toBeDefined()
      expect(graph.getNodes().length).toBeGreaterThan(0)
    })

    it('should load nodes from template', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      const nodes = graph.getNodes()
      expect(nodes.find((n) => n.id === 'entry:wifi')).toBeDefined()
      expect(nodes.find((n) => n.id === 'service:openssl')).toBeDefined()
    })

    it('should load edges from template', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      const edges = graph.getEdges()
      expect(edges.length).toBeGreaterThan(0)
      expect(edges.find((e) => e.from === 'entry:wifi' && e.to === 'interface:wifi')).toBeDefined()
    })

    it('should create entry points for external interfaces', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      const entryPoints = graph.findEntryPoints()
      expect(entryPoints.length).toBeGreaterThan(0)
      expect(entryPoints.every((n) => n.type === 'entry_point')).toBe(true)
      expect(entryPoints.every((n) => n.exposure === 'external')).toBe(true)
    })

    it('should not create entry points for disabled interfaces', () => {
      const config = createMockConfig({
        interfaces: {
          usb: { enabled: false, exposure: 'external', confidence: 100, reason: 'Disabled' },
        },
      })
      const graph = new AttackGraph(config)
      const entryPoints = graph.findEntryPoints()
      expect(entryPoints.find((n) => n.id.includes('usb'))).toBeUndefined()
    })

    it('should default interface exposure to external when enabled with no explicit exposure', () => {
      const config = createMockConfig({
        interfaces: { legacy_bus: { enabled: true, confidence: 70 } },
      })
      const graph = new AttackGraph(config)
      expect(graph.getNode('interface:legacy_bus')?.exposure).toBe('external')
    })

    it('should default interface exposure to isolated when disabled with no explicit exposure', () => {
      const config = createMockConfig({
        interfaces: { legacy_bus: { enabled: false, confidence: 70 } },
      })
      const graph = new AttackGraph(config)
      expect(graph.getNode('interface:legacy_bus')?.exposure).toBe('isolated')
    })

    it('should default feature enabled to true and exposure to internal for an allow-list-style feature', () => {
      // FeatureConfig.enabled can be a string[] (an allow-list of sub-features) instead of a
      // boolean; presence of the feature in config implies the parent feature itself is active.
      const config = createMockConfig({
        features: { diagnostics: { enabled: ['basic_mode'], confidence: 60 } },
      })
      const graph = new AttackGraph(config)
      const node = graph.getNode('feature:diagnostics')
      expect(node?.enabled).toBe(true)
      expect(node?.exposure).toBe('internal')
    })

    it('should create an entry point with an "Unknown" protocol and no service edges for an unmapped interface', () => {
      const config = createMockConfig({
        interfaces: { satellite: { enabled: true, exposure: 'external', confidence: 80 } },
      })
      const graph = new AttackGraph(config)
      const entryEdge = graph.getEdges().find((e) => e.to === 'interface:satellite')
      expect(entryEdge?.protocol).toBe('Unknown')
      expect(graph.getEdges().some((e) => e.from === 'interface:satellite')).toBe(false)
    })

    it('should add no component edges for a service not in the known service-component map', () => {
      const config = createMockConfig({
        services: { custom_daemon: { enabled: true, externalAccess: false, confidence: 80 } },
      })
      const graph = new AttackGraph(config)
      expect(graph.getEdges().some((e) => e.from === 'service:custom_daemon')).toBe(false)
    })
  })

  describe('addNode', () => {
    it('should add a new node', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      const node: AttackGraphNode = {
        id: 'test:node',
        type: 'component',
        name: 'Test Node',
        enabled: true,
        exposure: 'internal',
      }
      graph.addNode(node)
      expect(graph.getNode('test:node')).toEqual(node)
    })

    it('should update existing node', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({
        id: 'test:node',
        type: 'component',
        name: 'Original',
        enabled: true,
        exposure: 'internal',
      })
      graph.addNode({
        id: 'test:node',
        type: 'service',
        name: 'Updated',
        enabled: false,
        exposure: 'external',
      })
      const node = graph.getNode('test:node')
      expect(node?.name).toBe('Updated')
      expect(node?.type).toBe('service')
    })
  })

  describe('addEdge', () => {
    it('should add an edge between existing nodes', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({ id: 'node:a', type: 'interface', name: 'Node A', enabled: true, exposure: 'external' })
      graph.addNode({ id: 'node:b', type: 'service', name: 'Node B', enabled: true, exposure: 'internal' })
      const edge: AttackGraphEdge = { from: 'node:a', to: 'node:b', type: 'data_flow' }
      graph.addEdge(edge)
      const edges = graph.getEdges()
      expect(edges.find((e) => e.from === 'node:a' && e.to === 'node:b')).toBeDefined()
    })

    it('should throw error for non-existent source node', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({ id: 'node:b', type: 'service', name: 'Node B', enabled: true, exposure: 'internal' })
      const edge: AttackGraphEdge = { from: 'nonexistent', to: 'node:b', type: 'data_flow' }
      expect(() => graph.addEdge(edge)).toThrow('Source node "nonexistent" does not exist')
    })

    it('should throw error for non-existent target node', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({ id: 'node:a', type: 'interface', name: 'Node A', enabled: true, exposure: 'external' })
      const edge: AttackGraphEdge = { from: 'node:a', to: 'nonexistent', type: 'data_flow' }
      expect(() => graph.addEdge(edge)).toThrow('Target node "nonexistent" does not exist')
    })

    it('should not traverse blocking edges', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({ id: 'node:a', type: 'interface', name: 'Node A', enabled: true, exposure: 'external' })
      graph.addNode({ id: 'node:b', type: 'service', name: 'Node B', enabled: false, exposure: 'internal' })
      graph.addEdge({ from: 'node:a', to: 'node:b', type: 'blocking' })
      expect(graph.findPath('node:a', 'node:b')).toBeNull()
    })

    it('should not add duplicate edges to adjacency list', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({ id: 'node:a', type: 'interface', name: 'Node A', enabled: true, exposure: 'external' })
      graph.addNode({ id: 'node:b', type: 'service', name: 'Node B', enabled: true, exposure: 'internal' })

      graph.addEdge({ from: 'node:a', to: 'node:b', type: 'data_flow' })
      graph.addEdge({ from: 'node:a', to: 'node:b', type: 'data_flow' })

      const edges = graph.getEdges()
      expect(edges.filter((e) => e.from === 'node:a' && e.to === 'node:b')).toHaveLength(2)

      const path = graph.findPath('node:a', 'node:b')
      expect(path).toEqual(['node:a', 'node:b'])
    })
  })

  describe('findEntryPoints', () => {
    it('should return all external entry points', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      const entryPoints = graph.findEntryPoints()
      expect(entryPoints.length).toBeGreaterThan(0)
      entryPoints.forEach((node) => {
        expect(node.type).toBe('entry_point')
        expect(node.exposure).toBe('external')
        expect(node.enabled).toBe(true)
      })
    })

    it('should return empty array when no external entry points', () => {
      const config = createMockConfig({
        interfaces: {
          ethernet: { enabled: true, exposure: 'internal', confidence: 85 },
        },
      })
      const graph = new AttackGraph(config)
      const entryPoints = graph.findEntryPoints()
      expect(entryPoints.length).toBe(0)
    })
  })

  describe('findPath (BFS)', () => {
    it('should find direct path', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      expect(graph.findPath('entry:wifi', 'interface:wifi')).toEqual(['entry:wifi', 'interface:wifi'])
    })

    it('should find multi-hop path', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      const path = graph.findPath('entry:wifi', 'service:openssl')
      expect(path).toEqual(['entry:wifi', 'interface:wifi', 'service:wpa_supplicant', 'service:openssl'])
    })

    it('should return null for non-existent source', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      expect(graph.findPath('nonexistent', 'service:openssl')).toBeNull()
    })

    it('should return null for non-existent target', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      expect(graph.findPath('entry:wifi', 'nonexistent')).toBeNull()
    })

    it('should return single-element path for same source and target', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      expect(graph.findPath('entry:wifi', 'entry:wifi')).toEqual(['entry:wifi'])
    })

    it('should find path through branching graph via BFS', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({ id: 'a', type: 'entry_point', name: 'A', enabled: true, exposure: 'external' })
      graph.addNode({ id: 'b', type: 'interface', name: 'B', enabled: true, exposure: 'internal' })
      graph.addNode({ id: 'c', type: 'interface', name: 'C', enabled: true, exposure: 'internal' })
      graph.addNode({ id: 'd', type: 'component', name: 'D', enabled: true, exposure: 'internal' })

      graph.addEdge({ from: 'a', to: 'b', type: 'data_flow' })
      graph.addEdge({ from: 'a', to: 'c', type: 'data_flow' })
      graph.addEdge({ from: 'b', to: 'd', type: 'data_flow' })
      graph.addEdge({ from: 'c', to: 'd', type: 'data_flow' })

      const path = graph.findPath('a', 'd')
      expect(path).not.toBeNull()
      expect(path![0]).toBe('a')
      expect(path![path!.length - 1]).toBe('d')
      expect(path!.length).toBe(3)
    })

    it('should skip a node already visited via a shorter route when two branches converge before the target', () => {
      // Regression guard for the BFS "already visited" skip: without it, a node reachable via
      // two branches would be enqueued twice, corrupting the shortest-path result.
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({ id: 'a', type: 'entry_point', name: 'A', enabled: true, exposure: 'external' })
      graph.addNode({ id: 'b', type: 'interface', name: 'B', enabled: true, exposure: 'internal' })
      graph.addNode({ id: 'c', type: 'interface', name: 'C', enabled: true, exposure: 'internal' })
      graph.addNode({ id: 'merge', type: 'service', name: 'Merge', enabled: true, exposure: 'internal' })
      graph.addNode({ id: 'target', type: 'component', name: 'Target', enabled: true, exposure: 'internal' })

      graph.addEdge({ from: 'a', to: 'b', type: 'data_flow' })
      graph.addEdge({ from: 'a', to: 'c', type: 'data_flow' })
      graph.addEdge({ from: 'b', to: 'merge', type: 'data_flow' })
      graph.addEdge({ from: 'c', to: 'merge', type: 'data_flow' })
      graph.addEdge({ from: 'merge', to: 'target', type: 'data_flow' })

      expect(graph.findPath('a', 'target')).toEqual(['a', 'b', 'merge', 'target'])
    })

    it('should return null when no path exists between connected components', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({ id: 'a', type: 'entry_point', name: 'A', enabled: true, exposure: 'external' })
      graph.addNode({ id: 'b', type: 'component', name: 'B', enabled: true, exposure: 'internal' })

      graph.addEdge({ from: 'a', to: 'b', type: 'blocking' })

      expect(graph.findPath('a', 'b')).toBeNull()
    })
  })

  describe('findAllPaths', () => {
    it('should find all paths between nodes', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      const paths = graph.findAllPaths('entry:wifi', 'service:openssl')
      expect(paths.length).toBeGreaterThan(0)
      paths.forEach((path) => {
        expect(path[0]).toBe('entry:wifi')
        expect(path[path.length - 1]).toBe('service:openssl')
      })
    })

    it('should return empty array for non-existent nodes', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      expect(graph.findAllPaths('nonexistent', 'alsononexistent')).toEqual([])
    })

    it('should terminate and still find the valid path when the graph contains a cycle', () => {
      // Regression guard for the DFS "already on this path" skip: without it, a back-edge to an
      // ancestor (b -> a) would recurse forever instead of being pruned.
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      graph.addNode({ id: 'a', type: 'entry_point', name: 'A', enabled: true, exposure: 'external' })
      graph.addNode({ id: 'b', type: 'interface', name: 'B', enabled: true, exposure: 'internal' })
      graph.addNode({ id: 'target', type: 'component', name: 'Target', enabled: true, exposure: 'internal' })

      graph.addEdge({ from: 'a', to: 'b', type: 'data_flow' })
      graph.addEdge({ from: 'b', to: 'a', type: 'data_flow' }) // cycle back to an ancestor
      graph.addEdge({ from: 'b', to: 'target', type: 'data_flow' })

      expect(graph.findAllPaths('a', 'target')).toEqual([['a', 'b', 'target']])
    })
  })

  describe('isReachableFromExternal', () => {
    it('should return reachable for accessible component', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      const result = graph.isReachableFromExternal('openssl')
      expect(result.reachable).toBe(true)
      expect(result.paths.length).toBeGreaterThan(0)
      expect(result.confidence).toBeGreaterThan(0)
    })

    it('should return not reachable for disabled component', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      const result = graph.isReachableFromExternal('sshd')
      expect(result.reachable).toBe(false)
    })

    it('should return not reachable for non-existent component', () => {
      const config = createMockConfig()
      const graph = new AttackGraph(config)
      const result = graph.isReachableFromExternal('nonexistent')
      expect(result.reachable).toBe(false)
      // A component absent from the graph is UNKNOWN, not proven-unreachable, so confidence is 0
      // (H10) — this is what lets Tier 2 escalate rather than auto-suppress unmodeled components.
      expect(result.confidence).toBe(0)
    })

    it('should find component by partial name match', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      const result = graph.isReachableFromExternal('openssl')
      expect(result.reachable).toBe(true)
    })

    it('should identify entry point as reachable', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      const result = graph.isReachableFromExternal('entry:wifi')
      expect(result.reachable).toBe(true)
      expect(result.shortestPath).toEqual(['entry:wifi'])
    })

    it('should calculate confidence correctly', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      const result = graph.isReachableFromExternal('openssl')
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(100)
    })

    it('should mark a pre-existing edge from a disabled internal node as blocking and surface both block reasons', () => {
      const config = createMockConfig({ interfaces: {}, services: {}, features: {} })
      const template = createBlockingTemplate('Relay Service')
      const graph = new AttackGraph(config, template)

      const result = graph.isReachableFromExternal('Sink')

      expect(result.reachable).toBe(false)
      expect(result.shortestPath).toBeNull()
      expect(result.confidence).toBe(90)
      expect(result.blockedBy).toEqual(
        expect.arrayContaining(['Relay Service blocks access', 'Relay Service is disabled']),
      )
    })

    it('should fall back to the node id in the block message when the blocking node has no display name', () => {
      const config = createMockConfig({ interfaces: {}, services: {}, features: {} })
      const template = createBlockingTemplate('')
      const graph = new AttackGraph(config, template)

      const result = graph.isReachableFromExternal('Sink')

      expect(result.blockedBy).toContain('service:relay blocks access')
    })

    it('should report medium confidence and no blockers when the target has no path from any entry point', () => {
      const config = createMockConfig({ interfaces: {}, services: {}, features: {} })
      const template: GraphTemplate = {
        name: 'Disconnected',
        description: 'Target has no connecting edges from any entry point',
        version: '1.0.0',
        nodes: [
          { id: 'entry:x', type: 'entry_point', name: 'Entry', enabled: true, exposure: 'external' },
          { id: 'component:isolated', type: 'component', name: 'Isolated', enabled: true, exposure: 'internal' },
        ],
        edges: [],
      }
      const graph = new AttackGraph(config, template)

      const result = graph.isReachableFromExternal('Isolated')

      expect(result.reachable).toBe(false)
      expect(result.shortestPath).toBeNull()
      expect(result.blockedBy).toEqual([])
      expect(result.confidence).toBe(75)
    })

    it('should pick the shortest path across multiple routes regardless of discovery order', () => {
      // The shortest-path reduce must compare every candidate, not just adopt the first one
      // found — confidence scoring later penalizes longer shortest paths, so this drives the
      // final confidence number reported to the reviewer.
      const config = createMockConfig({ interfaces: {}, services: {}, features: {} })
      const template: GraphTemplate = {
        name: 'Multi-path',
        description: 'Multiple routes of different lengths to the same target',
        version: '1.0.0',
        nodes: [
          { id: 'entry:x', type: 'entry_point', name: 'Entry', enabled: true, exposure: 'external' },
          { id: 'mid1', type: 'interface', name: 'Mid1', enabled: true, exposure: 'internal' },
          { id: 'mid2', type: 'interface', name: 'Mid2', enabled: true, exposure: 'internal' },
          { id: 'mid3', type: 'interface', name: 'Mid3', enabled: true, exposure: 'internal' },
          { id: 'target', type: 'component', name: 'Target', enabled: true, exposure: 'internal' },
        ],
        edges: [
          { from: 'entry:x', to: 'mid1', type: 'data_flow' },
          { from: 'mid1', to: 'target', type: 'data_flow' },
          { from: 'entry:x', to: 'target', type: 'data_flow' },
          { from: 'entry:x', to: 'mid2', type: 'data_flow' },
          { from: 'mid2', to: 'mid3', type: 'data_flow' },
          { from: 'mid3', to: 'target', type: 'data_flow' },
        ],
      }
      const graph = new AttackGraph(config, template)

      const result = graph.isReachableFromExternal('Target')

      expect(result.shortestPath).toEqual(['entry:x', 'target'])
    })
  })

  describe('clear', () => {
    it('should clear all nodes and edges', () => {
      const config = createMockConfig()
      const template = createMockTemplate()
      const graph = new AttackGraph(config, template)
      graph.clear()
      expect(graph.getNodes()).toEqual([])
      expect(graph.getEdges()).toEqual([])
    })
  })
})

describe('Tier2AttackGraphFilter', () => {
  let graph: AttackGraph
  let filter: Tier2AttackGraphFilter

  beforeEach(() => {
    const config = createMockConfig()
    const template = createMockTemplate()
    graph = new AttackGraph(config, template)
    filter = new Tier2AttackGraphFilter(graph)
  })

  describe('analyze', () => {
    it('should filter unreachable vulnerabilities', () => {
      const vulnerability = createMockVulnerability({ severity: 'low', cvssScore: 3.5 })
      const component = createMockComponent({ name: 'nonexistent' })
      const result = filter.analyze(vulnerability, component)
      expect(result.action).toBe('filtered')
      expect(result.tier).toBe(2)
      expect(result.filterType).toBe('internal_only')
      // An unmodeled component yields ZERO confidence now (H10): nominally "filtered" but the
      // orchestrator escalates it (0 < threshold) rather than auto-suppressing an unknown.
      expect(result.confidence).toBe(0)
    })

    it('should keep reachable vulnerabilities', () => {
      const vulnerability = createMockVulnerability()
      const component = createMockComponent({ name: 'openssl' })
      const result = filter.analyze(vulnerability, component)
      expect(result.action).toBe('kept')
      expect(result.reason).toContain('reachable')
    })

    it('should escalate critical unreachable vulnerabilities', () => {
      const vulnerability = createMockVulnerability({ severity: 'critical', cvssScore: 9.8 })
      const component = createMockComponent({ name: 'nonexistent' })
      const result = filter.analyze(vulnerability, component)
      expect(result.action).toBe('escalated')
      expect(result.reason).toContain('review')
    })

    it('should escalate high-severity unreachable vulnerabilities', () => {
      const vulnerability = createMockVulnerability({ severity: 'high', cvssScore: 8.5 })
      const component = createMockComponent({ name: 'nonexistent' })
      const result = filter.analyze(vulnerability, component)
      expect(result.action).toBe('escalated')
    })

    it('should filter low-severity disabled component', () => {
      const vulnerability = createMockVulnerability({ severity: 'low' })
      const component = createMockComponent({ name: 'sshd' })
      const result = filter.analyze(vulnerability, component)
      expect(result.action).toBe('filtered')
    })

    it('should set correct timestamp', () => {
      const vulnerability = createMockVulnerability()
      const component = createMockComponent()
      const before = new Date().toISOString()
      const result = filter.analyze(vulnerability, component)
      const after = new Date().toISOString()
      expect(result.timestamp >= before).toBe(true)
      expect(result.timestamp <= after).toBe(true)
    })
  })

  describe('calculateConfidence', () => {
    it('should boost confidence for explicit blocking', () => {
      const result: ReachabilityResult = {
        reachable: false,
        paths: [],
        shortestPath: null,
        blockedBy: ['SSH is disabled'],
        confidence: 80,
      }
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBeGreaterThan(80)
      expect(confidence).toBeLessThanOrEqual(100)
    })

    it('should boost confidence for multiple paths', () => {
      const result: ReachabilityResult = {
        reachable: true,
        paths: [
          ['a', 'b', 'c'],
          ['a', 'd', 'c'],
          ['a', 'e', 'c'],
        ],
        shortestPath: ['a', 'b', 'c'],
        blockedBy: [],
        confidence: 70,
      }
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBeGreaterThan(70)
    })

    it('should reduce confidence for very long paths', () => {
      const result: ReachabilityResult = {
        reachable: true,
        paths: [['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']],
        shortestPath: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
        blockedBy: [],
        confidence: 80,
      }
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBeLessThan(80)
    })

    it('should clamp confidence to valid range', () => {
      const result: ReachabilityResult = {
        reachable: true,
        paths: [],
        shortestPath: null,
        blockedBy: [],
        confidence: 200,
      }
      const confidence = filter.calculateConfidence(result)
      expect(confidence).toBeLessThanOrEqual(100)
      expect(confidence).toBeGreaterThanOrEqual(0)
    })
  })

  describe('analyzeBatch', () => {
    it('should analyze multiple vulnerabilities', () => {
      const items = [
        {
          vulnerability: createMockVulnerability({ id: 'CVE-1' }),
          component: createMockComponent({ id: 'comp-1', name: 'openssl' }),
        },
        {
          vulnerability: createMockVulnerability({ id: 'CVE-2' }),
          component: createMockComponent({ id: 'comp-2', name: 'libssl' }),
        },
        {
          vulnerability: createMockVulnerability({ id: 'CVE-3' }),
          component: createMockComponent({ id: 'comp-3', name: 'nonexistent' }),
        },
      ]
      const results = filter.analyzeBatch(items)
      expect(results.length).toBe(3)
      expect(results[0].vulnerabilityId).toBe('CVE-1')
      expect(results[1].vulnerabilityId).toBe('CVE-2')
      expect(results[2].vulnerabilityId).toBe('CVE-3')
    })
  })

  describe('getSummary', () => {
    it('should calculate summary statistics', () => {
      const results = [
        {
          action: 'filtered' as const,
          confidence: 90,
          vulnerabilityId: '1',
          componentId: '1',
          tier: 2 as const,
          filterType: 'internal_only' as const,
          reason: '',
          timestamp: '',
        },
        {
          action: 'filtered' as const,
          confidence: 85,
          vulnerabilityId: '2',
          componentId: '2',
          tier: 2 as const,
          filterType: 'internal_only' as const,
          reason: '',
          timestamp: '',
        },
        {
          action: 'kept' as const,
          confidence: 80,
          vulnerabilityId: '3',
          componentId: '3',
          tier: 2 as const,
          filterType: 'attack_path_blocked' as const,
          reason: '',
          timestamp: '',
        },
        {
          action: 'escalated' as const,
          confidence: 95,
          vulnerabilityId: '4',
          componentId: '4',
          tier: 2 as const,
          filterType: 'internal_only' as const,
          reason: '',
          timestamp: '',
        },
      ]
      const summary = filter.getSummary(results)
      expect(summary.total).toBe(4)
      expect(summary.filtered).toBe(2)
      expect(summary.kept).toBe(1)
      expect(summary.escalated).toBe(1)
      expect(summary.avgConfidence).toBe(87.5)
    })

    it('should handle empty results', () => {
      const summary = filter.getSummary([])
      expect(summary.total).toBe(0)
      expect(summary.filtered).toBe(0)
      expect(summary.kept).toBe(0)
      expect(summary.escalated).toBe(0)
      expect(summary.avgConfidence).toBe(0)
    })
  })
})

describe('Integration Tests', () => {
  it('should correctly identify blocked attack paths', () => {
    const config = createMockConfig({
      interfaces: {
        wifi: { enabled: true, exposure: 'external', confidence: 90 },
        ethernet: { enabled: true, exposure: 'internal', confidence: 85 },
      },
      services: {
        sshd: { enabled: false, externalAccess: true, confidence: 100, reason: 'SSH disabled' },
      },
      features: {},
    })

    const template: GraphTemplate = {
      name: 'Test',
      description: 'Test',
      version: '1.0',
      nodes: [
        { id: 'entry:wifi', type: 'entry_point', name: 'WiFi', enabled: true, exposure: 'external' },
        { id: 'interface:wifi', type: 'interface', name: 'WiFi', enabled: true, exposure: 'external' },
        { id: 'service:sshd', type: 'service', name: 'SSH', enabled: false, exposure: 'internal' },
      ],
      edges: [
        { from: 'entry:wifi', to: 'interface:wifi', type: 'data_flow' },
        { from: 'interface:wifi', to: 'service:sshd', type: 'blocking' },
      ],
    }

    const graph = new AttackGraph(config, template)
    const filter = new Tier2AttackGraphFilter(graph)
    const vulnerability = createMockVulnerability({ severity: 'medium' })
    const component = createMockComponent({ name: 'sshd' })
    const result = filter.analyze(vulnerability, component)
    expect(result.action).toBe('filtered')
    expect(result.filterType).toBe('attack_path_blocked')
  })

  it('should correctly trace path through multiple services', () => {
    const template: GraphTemplate = {
      name: 'Test',
      description: 'Test',
      version: '1.0',
      nodes: [
        { id: 'entry:external', type: 'entry_point', name: 'External', enabled: true, exposure: 'external' },
        { id: 'interface:network', type: 'interface', name: 'Network', enabled: true, exposure: 'external' },
        { id: 'service:webserver', type: 'service', name: 'WebServer', enabled: true, exposure: 'internal' },
        { id: 'service:app', type: 'service', name: 'App', enabled: true, exposure: 'internal' },
        { id: 'service:db', type: 'service', name: 'Database', enabled: true, exposure: 'internal' },
        { id: 'component:crypto', type: 'component', name: 'CryptoLib', enabled: true, exposure: 'internal' },
      ],
      edges: [
        { from: 'entry:external', to: 'interface:network', type: 'data_flow' },
        { from: 'interface:network', to: 'service:webserver', type: 'data_flow' },
        { from: 'service:webserver', to: 'service:app', type: 'control_flow' },
        { from: 'service:app', to: 'service:db', type: 'data_flow' },
        { from: 'service:db', to: 'component:crypto', type: 'control_flow' },
      ],
    }

    const config = createMockConfig()
    const graph = new AttackGraph(config, template)
    const path = graph.findPath('entry:external', 'component:crypto')
    expect(path).not.toBeNull()
    expect(path?.length).toBe(6)
    expect(path).toEqual([
      'entry:external',
      'interface:network',
      'service:webserver',
      'service:app',
      'service:db',
      'component:crypto',
    ])
    const reachability = graph.isReachableFromExternal('crypto')
    expect(reachability.reachable).toBe(true)
  })
})
