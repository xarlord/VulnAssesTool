/**
 * DependencyGraph Component
 *
 * Interactive dependency graph visualization using Cytoscape.js
 * Shows component dependencies with severity-based color coding
 */

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import cytoscape from 'cytoscape'
import type { Core, NodeSingular, EventObject } from 'cytoscape'
import fcose from 'cytoscape-fcose'
import { cn } from '@/lib/utils'
import type { DependencyGraphProps, GraphNodeData } from './types'
import { SEVERITY_NODE_COLORS, DEFAULT_LAYOUT_CONFIG } from './types'
import { buildGraphElements, getNodeStyle, getBaseStyles, getPathEdges } from './utils'

// Register the fcose force-directed layout extension once at module load — before any
// cy.layout({ name: 'fcose' }) runs. Without this the layout throws "No such layout `fcose`"
// and the whole graph crashes for any project that has components.
cytoscape.use(fcose)

/**
 * DependencyGraph Component
 *
 * Renders an interactive dependency graph with:
 * - Force-directed layout (fcose)
 * - Severity color coding
 * - Zoom and pan controls
 * - Node click callbacks
 * - Path analysis highlighting
 */
export function DependencyGraph({
  components,
  vulnerabilities,
  onNodeClick,
  height = 400,
  showControls = true,
  showLegend = true,
  className,
  highlightPath,
}: DependencyGraphProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)

  // Build graph elements
  const elements = useMemo(() => buildGraphElements(components, vulnerabilities), [components, vulnerabilities])

  // Handle node click
  const handleNodeClick = useCallback(
    (event: EventObject) => {
      if (!onNodeClick) return

      const node: NodeSingular = event.target
      const nodeData = node.data() as GraphNodeData

      if (nodeData.component) {
        onNodeClick(nodeData.component)
      }
    },
    [onNodeClick],
  )

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current) return

    // Initialize Cytoscape instance
    const cy = cytoscape({
      container: containerRef.current,
      elements: elements,
      style: getBaseStyles(),
      layout: DEFAULT_LAYOUT_CONFIG as cytoscape.LayoutOptions,
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    })

    // Apply severity-based styles to each node
    elements.nodes.forEach((node) => {
      const nodeData = node.data as GraphNodeData
      const style = getNodeStyle(nodeData)
      cy.style().append(style).update()
    })

    // Store reference
    cyRef.current = cy

    // Add click handler
    cy.on('tap', 'node', handleNodeClick)

    // Run layout
    cy.layout(DEFAULT_LAYOUT_CONFIG as cytoscape.LayoutOptions).run()

    // Cleanup
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [elements, handleNodeClick])

  // Update elements when props change
  useEffect(() => {
    if (!cyRef.current) return

    const cy = cyRef.current

    // Update elements
    cy.elements().remove()
    cy.add(elements)

    // Re-apply severity styles
    elements.nodes.forEach((node) => {
      const nodeData = node.data as GraphNodeData
      const style = getNodeStyle(nodeData)
      cy.style().append(style).update()
    })

    // Re-run layout
    cy.layout(DEFAULT_LAYOUT_CONFIG as cytoscape.LayoutOptions).run()
  }, [elements])

  // Handle path highlighting
  useEffect(() => {
    if (!cyRef.current) return

    const cy = cyRef.current

    // Clear previous highlights
    cy.elements().removeClass('path-highlight path-source path-target')

    if (highlightPath && highlightPath.length >= 2) {
      // Highlight nodes in path
      highlightPath.forEach((nodeId, index) => {
        const node = cy.getElementById(nodeId)
        if (node.length > 0) {
          node.addClass('path-highlight')
          if (index === 0) {
            node.addClass('path-source')
          } else if (index === highlightPath.length - 1) {
            node.addClass('path-target')
          }
        }
      })

      // Highlight edges between path nodes
      const pathEdges = getPathEdges(highlightPath)
      pathEdges.forEach(({ source, target }) => {
        const edge = cy.getElementById(`edge-${source}-${target}`)
        if (edge.length > 0) {
          edge.addClass('path-highlight')
        }
        // Also check reverse direction
        const reverseEdge = cy.getElementById(`edge-${target}-${source}`)
        if (reverseEdge.length > 0) {
          reverseEdge.addClass('path-highlight')
        }
      })

      // Fit to highlighted path with animation
      const highlightedElements = cy.elements('.path-highlight, .path-source, .path-target')
      if (highlightedElements.length > 0) {
        cy.animate({
          fit: {
            eles: highlightedElements,
            padding: 50,
          },
          duration: 500,
        })
      }
    }
  }, [highlightPath])

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 1.2)
    }
  }, [])

  const handleZoomOut = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.zoom(cyRef.current.zoom() * 0.8)
    }
  }, [])

  const handleFit = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.fit(undefined, 30)
    }
  }, [])

  const handleReset = useCallback(() => {
    if (cyRef.current) {
      cyRef.current.zoom(1)
      cyRef.current.center()
    }
  }, [])

  // Export the rendered graph as a PNG (FR-11.2-c). Cytoscape ships cy.png(), so
  // no new dependency is needed; the download trigger mirrors lib/export/json.ts.
  const handleExportImage = useCallback(() => {
    if (!cyRef.current) return
    const dataUrl = cyRef.current.png({ full: true, scale: 2, bg: '#ffffff' })
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = 'dependency-graph.png'
    link.click()
  }, [])

  // Keyboard navigation: the canvas is opaque to keyboard/AT, so the node list
  // below doubles as a listbox that lets keyboard users move between components
  // (arrow keys) and open a component's details (Enter) — the tap-on-node
  // equivalent. The active option is kept in sync with the canvas via panning.
  const [activeNodeIndex, setActiveNodeIndex] = useState(0)

  // Pan the canvas to the active node so sighted keyboard users can see it.
  const centerNode = useCallback((nodeId: string) => {
    const cy = cyRef.current
    if (!cy) return
    const node = cy.getElementById(nodeId)
    if (node.length > 0) {
      cy.center(node)
    }
  }, [])

  const moveActiveNode = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(index, components.length - 1))
      setActiveNodeIndex(clamped)
      const target = components[clamped]
      if (target) centerNode(target.id)
    },
    [components, centerNode],
  )

  const activateNode = useCallback(
    (index: number) => {
      moveActiveNode(index)
      const target = components[index]
      if (target && onNodeClick) onNodeClick(target)
    },
    [components, moveActiveNode, onNodeClick],
  )

  const handleListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLUListElement>) => {
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          event.preventDefault()
          moveActiveNode(activeNodeIndex + 1)
          break
        case 'ArrowUp':
        case 'ArrowLeft':
          event.preventDefault()
          moveActiveNode(activeNodeIndex - 1)
          break
        case 'Home':
          event.preventDefault()
          moveActiveNode(0)
          break
        case 'End':
          event.preventDefault()
          moveActiveNode(components.length - 1)
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          activateNode(activeNodeIndex)
          break
        default:
          break
      }
    },
    [activeNodeIndex, components.length, moveActiveNode, activateNode],
  )

  // Handle empty state
  if (components.length === 0) {
    return (
      <div
        className={cn('flex items-center justify-center rounded-lg border border-gray-200 bg-gray-50', className)}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        <div className="text-center text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
            />
          </svg>
          <p className="mt-2 text-sm font-medium">No components to display</p>
          <p className="text-xs text-gray-400">Upload an SBOM to view the dependency graph</p>
        </div>
      </div>
    )
  }

  const vulnerableCount = components.filter((component) => component.vulnerabilities.length > 0).length
  const graphSummary = `Dependency graph of ${components.length} component${
    components.length === 1 ? '' : 's'
  }; ${vulnerableCount} with known vulnerabilities.`

  // Clamp for rendering in case the component set shrank below the active index.
  const activeIndex = Math.min(activeNodeIndex, components.length - 1)

  return (
    <div
      className={cn('relative rounded-lg border border-gray-200 bg-white', className)}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      {/* Graph container — canvas is opaque to assistive tech, so it is
          labelled as an image and paired with the sr-only list below. */}
      <div ref={containerRef} className="h-full w-full" role="img" aria-label={graphSummary} />

      {/* Text alternative + keyboard interface: the graph's nodes as a listbox.
          Visually hidden until focused, then shown as an overlay so keyboard
          users can see which component is active. */}
      <ul
        role="listbox"
        aria-label={`${graphSummary} Use the arrow keys to move between components and Enter to open a component's details.`}
        tabIndex={0}
        aria-activedescendant={components[activeIndex] ? `graph-node-${components[activeIndex].id}` : undefined}
        onKeyDown={handleListKeyDown}
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-20 focus:max-h-[85%] focus:w-72 focus:overflow-auto focus:rounded-md focus:border focus:border-gray-200 focus:bg-white focus:p-2 focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {components.map((component, index) => (
          <li
            key={component.id}
            id={`graph-node-${component.id}`}
            role="option"
            aria-selected={index === activeIndex}
            onClick={() => activateNode(index)}
            className={cn(
              'cursor-pointer rounded px-2 py-1 text-sm text-gray-700',
              index === activeIndex && 'bg-blue-100 text-blue-900',
            )}
          >
            {component.name} {component.version} — {component.vulnerabilities.length} known{' '}
            {component.vulnerabilities.length === 1 ? 'vulnerability' : 'vulnerabilities'}
          </li>
        ))}
      </ul>

      {/* Zoom controls */}
      {showControls && (
        <div className="absolute right-3 top-3 flex flex-col gap-1 rounded-md bg-white/90 p-1 shadow-md">
          <button
            type="button"
            onClick={handleZoomIn}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            title="Zoom In"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            title="Zoom Out"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleFit}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            title="Fit to View"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            title="Reset View"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleExportImage}
            className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            title="Export as Image"
            aria-label="Export as Image"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Legend */}
      {showLegend && (
        <div className="absolute bottom-3 left-3 rounded-md bg-white/90 p-2 shadow-md">
          <div className="mb-1 text-xs font-semibold text-gray-700">Severity</div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Critical', color: SEVERITY_NODE_COLORS.critical },
              { label: 'High', color: SEVERITY_NODE_COLORS.high },
              { label: 'Medium', color: SEVERITY_NODE_COLORS.medium },
              { label: 'Low', color: SEVERITY_NODE_COLORS.low },
              { label: 'None', color: SEVERITY_NODE_COLORS.none },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-gray-600">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-xs text-gray-500">Green border = Patch available</div>
        </div>
      )}

      {/* Component count */}
      <div className="absolute bottom-3 right-3 rounded-md bg-white/90 px-2 py-1 text-xs text-gray-500 shadow-md">
        {components.length} components
      </div>
    </div>
  )
}
