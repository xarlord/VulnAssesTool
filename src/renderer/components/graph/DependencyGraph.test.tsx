/**
 * DependencyGraph Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { DependencyGraph } from './DependencyGraph'
import {
  getMaxSeverity,
  getVulnerabilityCount,
  buildGraphElements,
  detectCycles,
  findPaths,
  findShortestPath,
  getPathEdges,
} from './utils'
import { MAX_GRAPH_NODES } from './types'
import type { Component, Vulnerability } from '@@/types'

// Mock cytoscape
const mockStyleResult = {
  toJson: vi.fn(() => [] as unknown[]),
  fromJson: vi.fn(function (this: typeof mockStyleResult) {
    return this
  }),
  append: vi.fn(() => ({ update: vi.fn() })),
  selector: vi.fn(() => ({
    style: vi.fn(() => ({ selector: vi.fn(), update: vi.fn() })),
  })),
  update: vi.fn(),
}

const mockNodeCollection = {
  length: 1,
  addClass: vi.fn(),
  removeClass: vi.fn(),
  data: vi.fn(() => ({ id: 'test', component: null })),
}

const mockElements = {
  // Defaults to 0 so `cy.elements(selector).length > 0` (the animate-to-path
  // guard) is false unless a test opts in — matches the real "nothing found"
  // case from cytoscape's collection API.
  length: 0,
  remove: vi.fn(),
  removeClass: vi.fn(),
  addClass: vi.fn(),
  select: vi.fn(),
  nodes: vi.fn(() => ({ forEach: vi.fn() })),
  edges: vi.fn(() => ({ forEach: vi.fn() })),
}

const mockCy = {
  elements: vi.fn(() => mockElements),
  add: vi.fn(),
  style: vi.fn(() => mockStyleResult),
  layout: vi.fn(() => ({ run: vi.fn() })),
  zoom: vi.fn(() => 1),
  fit: vi.fn(),
  center: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
  getElementById: vi.fn(() => mockNodeCollection),
  animate: vi.fn(),
  ready: vi.fn((cb: () => void) => cb()),
  png: vi.fn(() => 'data:image/png;base64,mock'),
}

vi.mock('cytoscape', () => ({
  // The default export is the cytoscape factory, but the component also calls
  // cytoscape.use(fcose) at module load to register the layout extension.
  default: Object.assign(
    vi.fn(() => mockCy),
    { use: vi.fn() },
  ),
}))

// Mock cn utility
vi.mock('@/lib/utils', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}))

/**
 * Create a mock component
 */
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

/**
 * Create a mock vulnerability
 */
function createMockVulnerability(overrides?: Partial<Vulnerability>): Vulnerability {
  return {
    id: 'CVE-2024-0001',
    source: 'nvd',
    severity: 'high',
    description: 'Test vulnerability',
    references: [],
    affectedComponents: [],
    ...overrides,
  }
}

describe('DependencyGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Rendering', () => {
    it('should render empty state when no components', () => {
      render(<DependencyGraph components={[]} vulnerabilities={[]} />)

      expect(screen.getByText('No components to display')).toBeInTheDocument()
      expect(screen.getByText('Upload an SBOM to view the dependency graph')).toBeInTheDocument()
    })

    it('provides a labelled image and a screen-reader list as a text alternative', () => {
      const components = [
        createMockComponent({ id: 'c1', name: 'alpha', vulnerabilities: [] }),
        createMockComponent({ id: 'c2', name: 'beta', vulnerabilities: ['CVE-2024-0001'] }),
      ]
      render(<DependencyGraph components={components} vulnerabilities={[]} />)

      const label = screen.getByRole('img').getAttribute('aria-label') ?? ''
      expect(label).toMatch(/2 components/i)
      expect(label).toMatch(/1 with known vulnerabilities/i)

      // The sr-only list names each component.
      expect(screen.getByText(/alpha/)).toBeInTheDocument()
      expect(screen.getByText(/beta/)).toBeInTheDocument()
    })

    it('should render graph container when components exist', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} />)

      // The cytoscape container should be present
      const container = document.querySelector('.relative')
      expect(container).toBeInTheDocument()
    })

    it('should render with custom height number', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} height={600} />)

      const container = document.querySelector('.relative')
      expect(container).toHaveStyle({ height: '600px' })
    })

    it('should render with custom height string', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} height="100%" />)

      const container = document.querySelector('.relative')
      expect(container).toHaveStyle({ height: '100%' })
    })

    it('should render zoom controls when showControls is true', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} showControls={true} />)

      // There should be 4 control buttons
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThanOrEqual(4)
    })

    it('should not render zoom controls when showControls is false', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} showControls={false} />)

      // No buttons should be present
      const buttons = screen.queryAllByRole('button')
      expect(buttons.length).toBe(0)
    })

    it('clicking Export as Image calls cy.png() and triggers a download (FR-11.2-c)', () => {
      render(<DependencyGraph components={[createMockComponent()]} vulnerabilities={[]} showControls={true} />)

      // Scope the anchor mock to the export click only (not React's render).
      const clickSpy = vi.fn()
      const anchor = { href: '', download: '', click: clickSpy } as unknown as HTMLAnchorElement
      const realCreateElement = document.createElement.bind(document)
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => (tag === 'a' ? anchor : realCreateElement(tag)))

      fireEvent.click(screen.getByRole('button', { name: 'Export as Image' }))

      expect(mockCy.png).toHaveBeenCalledWith(expect.objectContaining({ full: true }))
      expect(anchor.download).toBe('dependency-graph.png')
      expect(clickSpy).toHaveBeenCalled()

      createElementSpy.mockRestore()
    })

    it('should render legend when showLegend is true', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} showLegend={true} />)

      expect(screen.getByText('Severity')).toBeInTheDocument()
      expect(screen.getByText('Critical')).toBeInTheDocument()
      expect(screen.getByText('High')).toBeInTheDocument()
      expect(screen.getByText('Medium')).toBeInTheDocument()
      expect(screen.getByText('Low')).toBeInTheDocument()
      expect(screen.getByText('None')).toBeInTheDocument()
    })

    it('should not render legend when showLegend is false', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} showLegend={false} />)

      expect(screen.queryByText('Severity')).not.toBeInTheDocument()
    })

    it('should display component count', () => {
      const components = [
        createMockComponent({ id: 'comp-1' }),
        createMockComponent({ id: 'comp-2', name: 'component-2' }),
        createMockComponent({ id: 'comp-3', name: 'component-3' }),
      ]
      render(<DependencyGraph components={components} vulnerabilities={[]} />)

      expect(screen.getByText('3 components')).toBeInTheDocument()
    })

    it('should apply custom className', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} className="custom-class" />)

      const container = document.querySelector('.custom-class')
      expect(container).toBeInTheDocument()
    })
  })

  describe('Zoom Controls', () => {
    it('should call zoom in when zoom in button clicked', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} />)

      const buttons = screen.getAllByRole('button')
      const zoomInButton = buttons[0] // First button is zoom in

      fireEvent.click(zoomInButton)

      expect(mockCy.zoom).toHaveBeenCalled()
    })

    it('should call zoom out when zoom out button clicked', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} />)

      const buttons = screen.getAllByRole('button')
      const zoomOutButton = buttons[1] // Second button is zoom out

      fireEvent.click(zoomOutButton)

      expect(mockCy.zoom).toHaveBeenCalled()
    })

    it('should call fit when fit button clicked', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} />)

      const buttons = screen.getAllByRole('button')
      const fitButton = buttons[2] // Third button is fit

      fireEvent.click(fitButton)

      expect(mockCy.fit).toHaveBeenCalled()
    })

    it('should call center when reset button clicked', () => {
      const components = [createMockComponent()]
      render(<DependencyGraph components={components} vulnerabilities={[]} />)

      const buttons = screen.getAllByRole('button')
      const resetButton = buttons[3] // Fourth button is reset

      fireEvent.click(resetButton)

      expect(mockCy.zoom).toHaveBeenCalled()
      expect(mockCy.center).toHaveBeenCalled()
    })
  })

  describe('Node Click Callback', () => {
    it('should call onNodeClick when node is clicked', () => {
      const components = [createMockComponent()]
      const onNodeClick = vi.fn()

      render(<DependencyGraph components={components} vulnerabilities={[]} onNodeClick={onNodeClick} />)

      // Verify cytoscape on was called with tap event
      expect(mockCy.on).toHaveBeenCalledWith('tap', 'node', expect.any(Function))
    })

    it('should invoke onNodeClick with component data when tap handler fires', () => {
      const component = createMockComponent()
      const onNodeClick = vi.fn()
      const components = [component]

      render(<DependencyGraph components={components} vulnerabilities={[]} onNodeClick={onNodeClick} />)

      const tapHandler = mockCy.on.mock.calls.find(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'tap' && call[1] === 'node',
      )

      if (tapHandler) {
        const handler = tapHandler[2] as (event: { target: { data: () => Record<string, unknown> } }) => void
        handler({
          target: {
            data: () => ({
              id: 'comp-1',
              component: component,
              name: 'test-component',
            }),
          },
        } as unknown as Parameters<typeof handler>[0])

        expect(onNodeClick).toHaveBeenCalledWith(component)
      }
    })

    it('should not invoke onNodeClick when node data has no component', () => {
      const components = [createMockComponent()]
      const onNodeClick = vi.fn()

      render(<DependencyGraph components={components} vulnerabilities={[]} onNodeClick={onNodeClick} />)

      const tapHandler = mockCy.on.mock.calls.find(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'tap' && call[1] === 'node',
      )

      if (tapHandler) {
        const handler = tapHandler[2] as (event: { target: { data: () => Record<string, unknown> } }) => void
        handler({
          target: {
            data: () => ({
              id: 'comp-1',
              component: null,
            }),
          },
        } as unknown as Parameters<typeof handler>[0])

        expect(onNodeClick).not.toHaveBeenCalled()
      }
    })

    it('does not throw when a node tap fires and no onNodeClick handler was provided', () => {
      // The handler's first line is `if (!onNodeClick) return` — without this
      // guard a tap on a canvas node with no consumer callback would throw.
      const components = [createMockComponent()]

      render(<DependencyGraph components={components} vulnerabilities={[]} />)

      const tapHandler = mockCy.on.mock.calls.find(
        (call: unknown[]) => Array.isArray(call) && call[0] === 'tap' && call[1] === 'node',
      )

      expect(tapHandler).toBeDefined()
      if (tapHandler) {
        const handler = tapHandler[2] as (event: { target: { data: () => Record<string, unknown> } }) => void
        expect(() =>
          handler({
            target: { data: () => ({ id: 'comp-1', component: createMockComponent() }) },
          } as unknown as Parameters<typeof handler>[0]),
        ).not.toThrow()
      }
    })
  })

  describe('Keyboard navigation', () => {
    const twoComponents = () => [
      createMockComponent({ id: 'c1', name: 'alpha', version: '1.0.0', vulnerabilities: [] }),
      createMockComponent({ id: 'c2', name: 'beta', version: '2.0.0', vulnerabilities: ['CVE-2024-0001'] }),
    ]

    it('exposes graph nodes as a keyboard-navigable listbox with one option per component', () => {
      render(<DependencyGraph components={twoComponents()} vulnerabilities={[]} />)

      expect(screen.getByRole('listbox')).toBeInTheDocument()
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(2)
      // First option is active by default so arrow keys have a starting point.
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
      expect(options[1]).toHaveAttribute('aria-selected', 'false')
    })

    it('moves the active node with ArrowDown / ArrowUp', () => {
      render(<DependencyGraph components={twoComponents()} vulnerabilities={[]} />)
      const listbox = screen.getByRole('listbox')

      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      let options = screen.getAllByRole('option')
      expect(options[1]).toHaveAttribute('aria-selected', 'true')
      expect(listbox).toHaveAttribute('aria-activedescendant', options[1].id)

      fireEvent.keyDown(listbox, { key: 'ArrowUp' })
      options = screen.getAllByRole('option')
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('opens the active node details when Enter is pressed', () => {
      const onNodeClick = vi.fn()
      const components = twoComponents()
      render(<DependencyGraph components={components} vulnerabilities={[]} onNodeClick={onNodeClick} />)
      const listbox = screen.getByRole('listbox')

      fireEvent.keyDown(listbox, { key: 'ArrowDown' })
      fireEvent.keyDown(listbox, { key: 'Enter' })

      expect(onNodeClick).toHaveBeenCalledWith(components[1])
    })

    it('opens a node`s details when its option is clicked (keyboard-equivalent of a canvas tap)', () => {
      const onNodeClick = vi.fn()
      const components = twoComponents()
      render(<DependencyGraph components={components} vulnerabilities={[]} onNodeClick={onNodeClick} />)

      fireEvent.click(screen.getAllByRole('option')[0])

      expect(onNodeClick).toHaveBeenCalledWith(components[0])
    })

    it('moves the active node with ArrowRight / ArrowLeft (mouse-free alternative to Down/Up)', () => {
      render(<DependencyGraph components={twoComponents()} vulnerabilities={[]} />)
      const listbox = screen.getByRole('listbox')

      fireEvent.keyDown(listbox, { key: 'ArrowRight' })
      let options = screen.getAllByRole('option')
      expect(options[1]).toHaveAttribute('aria-selected', 'true')

      fireEvent.keyDown(listbox, { key: 'ArrowLeft' })
      options = screen.getAllByRole('option')
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('jumps to the first node on Home and the last node on End', () => {
      const components = [
        createMockComponent({ id: 'c1', name: 'alpha' }),
        createMockComponent({ id: 'c2', name: 'beta' }),
        createMockComponent({ id: 'c3', name: 'gamma' }),
      ]
      render(<DependencyGraph components={components} vulnerabilities={[]} />)
      const listbox = screen.getByRole('listbox')

      fireEvent.keyDown(listbox, { key: 'End' })
      let options = screen.getAllByRole('option')
      expect(options[2]).toHaveAttribute('aria-selected', 'true')

      fireEvent.keyDown(listbox, { key: 'Home' })
      options = screen.getAllByRole('option')
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('opens the active node details when Space is pressed (same as Enter)', () => {
      const onNodeClick = vi.fn()
      const components = twoComponents()
      render(<DependencyGraph components={components} vulnerabilities={[]} onNodeClick={onNodeClick} />)
      const listbox = screen.getByRole('listbox')

      fireEvent.keyDown(listbox, { key: ' ' })

      expect(onNodeClick).toHaveBeenCalledWith(components[0])
    })

    it('ignores keys with no assigned navigation behavior, leaving the active option unchanged', () => {
      render(<DependencyGraph components={twoComponents()} vulnerabilities={[]} />)
      const listbox = screen.getByRole('listbox')

      fireEvent.keyDown(listbox, { key: 'a' })

      const options = screen.getAllByRole('option')
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
      expect(options[1]).toHaveAttribute('aria-selected', 'false')
    })

    it('does not throw when Enter is pressed and no onNodeClick handler was provided', () => {
      // activateNode guards with `if (target && onNodeClick)` — without it, a
      // keyboard user opening a node with no consumer callback would crash.
      render(<DependencyGraph components={twoComponents()} vulnerabilities={[]} />)
      const listbox = screen.getByRole('listbox')

      expect(() => fireEvent.keyDown(listbox, { key: 'Enter' })).not.toThrow()
    })

    it('clamps the active option when the component list shrinks below the previous active index', () => {
      // Regression guard for the documented "component set shrank below the
      // active index" case: activeIndex must stay a valid array index.
      const components = [
        createMockComponent({ id: 'c1', name: 'alpha' }),
        createMockComponent({ id: 'c2', name: 'beta' }),
        createMockComponent({ id: 'c3', name: 'gamma' }),
      ]
      const { rerender } = render(<DependencyGraph components={components} vulnerabilities={[]} />)
      const listbox = screen.getByRole('listbox')

      fireEvent.keyDown(listbox, { key: 'End' }) // active index -> 2 (gamma)

      rerender(<DependencyGraph components={components.slice(0, 1)} vulnerabilities={[]} />)

      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(1)
      expect(options[0]).toHaveAttribute('aria-selected', 'true')
      expect(listbox).toHaveAttribute('aria-activedescendant', options[0].id)
    })

    it('does not pan or throw when moving to a node cytoscape has not rendered yet', () => {
      // centerNode guards with `if (node.length > 0)` before calling cy.center —
      // a component can exist in props before cytoscape has added its node.
      const components = twoComponents()
      render(<DependencyGraph components={components} vulnerabilities={[]} />)
      const listbox = screen.getByRole('listbox')

      const originalImpl = mockCy.getElementById.getMockImplementation()
      mockCy.getElementById.mockImplementation(
        () =>
          ({ length: 0, addClass: vi.fn(), removeClass: vi.fn() }) as unknown as ReturnType<
            typeof mockCy.getElementById
          >,
      )
      try {
        expect(() => fireEvent.keyDown(listbox, { key: 'ArrowDown' })).not.toThrow()
        expect(mockCy.center).not.toHaveBeenCalled()
      } finally {
        if (originalImpl) mockCy.getElementById.mockImplementation(originalImpl)
      }
    })
  })

  describe('Path Highlighting', () => {
    it('should highlight nodes in the given path', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2' }),
      ]

      render(<DependencyGraph components={components} vulnerabilities={[]} highlightPath={['comp-1', 'comp-2']} />)

      expect(mockCy.getElementById).toHaveBeenCalledWith('comp-1')
      expect(mockCy.getElementById).toHaveBeenCalledWith('comp-2')
      expect(mockNodeCollection.addClass).toHaveBeenCalledWith('path-highlight')
    })

    it('should highlight edges in the given path', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2' }),
      ]

      render(<DependencyGraph components={components} vulnerabilities={[]} highlightPath={['comp-1', 'comp-2']} />)

      expect(mockCy.getElementById).toHaveBeenCalledWith('edge-comp-1-comp-2')
    })

    it('should call getElementById for path nodes and edges', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2' }),
      ]

      const { rerender } = render(<DependencyGraph components={components} vulnerabilities={[]} />)

      rerender(<DependencyGraph components={components} vulnerabilities={[]} highlightPath={['comp-1', 'comp-2']} />)

      expect(mockCy.getElementById).toHaveBeenCalledWith('comp-1')
      expect(mockCy.getElementById).toHaveBeenCalledWith('comp-2')
      expect(mockNodeCollection.addClass).toHaveBeenCalledWith('path-highlight')
      expect(mockNodeCollection.addClass).toHaveBeenCalledWith('path-source')
    })

    it('should clear highlights when highlightPath is not provided', () => {
      const components = [createMockComponent()]

      const { rerender } = render(
        <DependencyGraph components={components} vulnerabilities={[]} highlightPath={['comp-1']} />,
      )

      rerender(<DependencyGraph components={components} vulnerabilities={[]} />)

      expect(mockElements.removeClass).toHaveBeenCalledWith('path-highlight path-source path-target')
    })

    it('clears highlights but adds no path classes when highlightPath has fewer than two nodes', () => {
      // The `highlightPath.length >= 2` guard means a single-node "path" is
      // treated as no path at all — nothing to draw a line between.
      const components = [createMockComponent({ id: 'comp-1' })]

      render(<DependencyGraph components={components} vulnerabilities={[]} highlightPath={['comp-1']} />)

      expect(mockElements.removeClass).toHaveBeenCalledWith('path-highlight path-source path-target')
      expect(mockNodeCollection.addClass).not.toHaveBeenCalled()
    })

    it('marks interior nodes of a 3+ node path as highlighted without source/target styling', () => {
      // With 3+ nodes, the middle node is neither `index === 0` nor
      // `index === highlightPath.length - 1`, so it should get only the plain
      // highlight class, while exactly one node gets path-source and one gets
      // path-target.
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2', dependencies: ['comp-3'] }),
        createMockComponent({ id: 'comp-3' }),
      ]

      render(
        <DependencyGraph components={components} vulnerabilities={[]} highlightPath={['comp-1', 'comp-2', 'comp-3']} />,
      )

      const sourceCalls = mockNodeCollection.addClass.mock.calls.filter((call) => call[0] === 'path-source')
      const targetCalls = mockNodeCollection.addClass.mock.calls.filter((call) => call[0] === 'path-target')
      const highlightCalls = mockNodeCollection.addClass.mock.calls.filter((call) => call[0] === 'path-highlight')

      expect(sourceCalls).toHaveLength(1)
      expect(targetCalls).toHaveLength(1)
      // All three nodes (source, interior, target) get the base highlight class.
      expect(highlightCalls.length).toBeGreaterThanOrEqual(3)
    })

    it('skips edge highlighting when neither direction of an edge exists in the rendered graph', () => {
      // Guards `if (edge.length > 0)` / `if (reverseEdge.length > 0)`: a path
      // can reference node IDs whose connecting edge cytoscape has not added.
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2' }),
      ]
      const emptyEdgeCollection = { length: 0, addClass: vi.fn(), removeClass: vi.fn() }
      const originalImpl = mockCy.getElementById.getMockImplementation()
      mockCy.getElementById.mockImplementation((id: unknown) =>
        typeof id === 'string' && id.startsWith('edge-')
          ? (emptyEdgeCollection as unknown as ReturnType<typeof mockCy.getElementById>)
          : mockNodeCollection,
      )

      try {
        render(<DependencyGraph components={components} vulnerabilities={[]} highlightPath={['comp-1', 'comp-2']} />)

        expect(emptyEdgeCollection.addClass).not.toHaveBeenCalled()
        // Node highlighting is unaffected — only the edge lookup was empty.
        expect(mockNodeCollection.addClass).toHaveBeenCalledWith('path-highlight')
      } finally {
        if (originalImpl) mockCy.getElementById.mockImplementation(originalImpl)
      }
    })

    it('fits and animates the view to the highlighted path when highlighted elements exist', () => {
      // `cy.elements('.path-highlight, ...').length > 0` gates the fit/animate
      // call — it should not fire against an empty collection.
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2' }),
      ]

      mockElements.length = 2
      try {
        render(<DependencyGraph components={components} vulnerabilities={[]} highlightPath={['comp-1', 'comp-2']} />)

        expect(mockCy.animate).toHaveBeenCalledWith(
          expect.objectContaining({
            fit: expect.objectContaining({ padding: 50 }),
            duration: 500,
          }),
        )
      } finally {
        mockElements.length = 0
      }
    })
  })

  describe('Element Updates', () => {
    it('should update graph elements when components prop changes', () => {
      const initialComponents = [createMockComponent({ id: 'comp-1' })]

      const { rerender } = render(<DependencyGraph components={initialComponents} vulnerabilities={[]} />)

      const updatedComponents = [
        createMockComponent({ id: 'comp-1' }),
        createMockComponent({ id: 'comp-2', name: 'component-2' }),
      ]

      rerender(<DependencyGraph components={updatedComponents} vulnerabilities={[]} />)

      expect(mockCy.elements).toHaveBeenCalled()
      expect(mockCy.add).toHaveBeenCalled()
    })
  })

  describe('Cleanup', () => {
    it('should destroy cytoscape instance on unmount', () => {
      const components = [createMockComponent()]

      const { unmount } = render(<DependencyGraph components={components} vulnerabilities={[]} />)

      unmount()

      expect(mockCy.destroy).toHaveBeenCalled()
    })
  })
})

describe('Helper Functions', () => {
  describe('getMaxSeverity', () => {
    it('should return "none" when component has no vulnerabilities', () => {
      const component = createMockComponent()
      const vulnerabilities: Vulnerability[] = []

      expect(getMaxSeverity(component, vulnerabilities)).toBe('none')
    })

    it('should return "none" when vulnerability does not affect component', () => {
      const component = createMockComponent({ id: 'comp-1' })
      const vulnerabilities = [
        createMockVulnerability({
          affectedComponents: ['comp-2'],
        }),
      ]

      expect(getMaxSeverity(component, vulnerabilities)).toBe('none')
    })

    it('should return "critical" for critical vulnerabilities', () => {
      const component = createMockComponent({ id: 'comp-1' })
      const vulnerabilities = [
        createMockVulnerability({
          severity: 'critical',
          affectedComponents: ['comp-1'],
        }),
      ]

      expect(getMaxSeverity(component, vulnerabilities)).toBe('critical')
    })

    it('should return highest severity when multiple vulnerabilities exist', () => {
      const component = createMockComponent({ id: 'comp-1' })
      const vulnerabilities = [
        createMockVulnerability({
          severity: 'low',
          affectedComponents: ['comp-1'],
        }),
        createMockVulnerability({
          id: 'CVE-2024-0002',
          severity: 'high',
          affectedComponents: ['comp-1'],
        }),
        createMockVulnerability({
          id: 'CVE-2024-0003',
          severity: 'medium',
          affectedComponents: ['comp-1'],
        }),
      ]

      expect(getMaxSeverity(component, vulnerabilities)).toBe('high')
    })

    it('should prioritize critical over all other severities', () => {
      const component = createMockComponent({ id: 'comp-1' })
      const vulnerabilities = [
        createMockVulnerability({
          severity: 'low',
          affectedComponents: ['comp-1'],
        }),
        createMockVulnerability({
          id: 'CVE-2024-0002',
          severity: 'critical',
          affectedComponents: ['comp-1'],
        }),
        createMockVulnerability({
          id: 'CVE-2024-0003',
          severity: 'high',
          affectedComponents: ['comp-1'],
        }),
      ]

      expect(getMaxSeverity(component, vulnerabilities)).toBe('critical')
    })
  })

  describe('getVulnerabilityCount', () => {
    it('should return 0 when component has no vulnerabilities', () => {
      const component = createMockComponent()
      const vulnerabilities: Vulnerability[] = []

      expect(getVulnerabilityCount(component, vulnerabilities)).toBe(0)
    })

    it('should return correct count for matching vulnerabilities', () => {
      const component = createMockComponent({ id: 'comp-1' })
      const vulnerabilities = [
        createMockVulnerability({ affectedComponents: ['comp-1'] }),
        createMockVulnerability({
          id: 'CVE-2024-0002',
          affectedComponents: ['comp-1'],
        }),
        createMockVulnerability({
          id: 'CVE-2024-0003',
          affectedComponents: ['comp-2'],
        }),
      ]

      expect(getVulnerabilityCount(component, vulnerabilities)).toBe(2)
    })

    it('should return 0 when no vulnerabilities affect component', () => {
      const component = createMockComponent({ id: 'comp-1' })
      const vulnerabilities = [
        createMockVulnerability({ affectedComponents: ['comp-2'] }),
        createMockVulnerability({
          id: 'CVE-2024-0002',
          affectedComponents: ['comp-3'],
        }),
      ]

      expect(getVulnerabilityCount(component, vulnerabilities)).toBe(0)
    })
  })

  describe('detectCycles (FR-11.1-a)', () => {
    it('returns the edge keys of a 3-node cycle A->B->C->A', () => {
      const components = [
        createMockComponent({ id: 'A', dependencies: ['B'] }),
        createMockComponent({ id: 'B', dependencies: ['C'] }),
        createMockComponent({ id: 'C', dependencies: ['A'] }),
      ]
      const cycles = detectCycles(components)
      expect(cycles.has('A->B')).toBe(true)
      expect(cycles.has('B->C')).toBe(true)
      expect(cycles.has('C->A')).toBe(true)
      expect(cycles.size).toBe(3)
    })

    it('returns an empty set for a pure DAG', () => {
      const components = [
        createMockComponent({ id: 'A', dependencies: ['B'] }),
        createMockComponent({ id: 'B', dependencies: ['C'] }),
        createMockComponent({ id: 'C' }),
      ]
      expect(detectCycles(components).size).toBe(0)
    })

    it('detects a self-loop A->A', () => {
      const components = [createMockComponent({ id: 'A', dependencies: ['A'] })]
      expect(detectCycles(components).has('A->A')).toBe(true)
    })

    it('flags only the cyclic edges when a cycle coexists with an acyclic branch', () => {
      const components = [
        createMockComponent({ id: 'A', dependencies: ['B'] }),
        createMockComponent({ id: 'B', dependencies: ['A'] }), // A<->B cycle
        createMockComponent({ id: 'X', dependencies: ['Y'] }), // X->Y acyclic
        createMockComponent({ id: 'Y' }),
      ]
      const cycles = detectCycles(components)
      expect(cycles.has('A->B')).toBe(true)
      expect(cycles.has('B->A')).toBe(true)
      expect(cycles.has('X->Y')).toBe(false)
    })
  })

  describe('buildGraphElements', () => {
    it('should create nodes for all components', () => {
      const components = [
        createMockComponent({ id: 'comp-1' }),
        createMockComponent({ id: 'comp-2', name: 'component-2' }),
      ]
      const vulnerabilities: Vulnerability[] = []

      const elements = buildGraphElements(components, vulnerabilities)

      expect(elements.nodes.length).toBe(2)
      expect(elements.nodes[0].data.id).toBe('comp-1')
      expect(elements.nodes[1].data.id).toBe('comp-2')
    })

    it('should create edges for dependencies', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2' }),
      ]
      const vulnerabilities: Vulnerability[] = []

      const elements = buildGraphElements(components, vulnerabilities)

      expect(elements.edges.length).toBe(1)
      expect(elements.edges[0].data.source).toBe('comp-1')
      expect(elements.edges[0].data.target).toBe('comp-2')
    })

    it('should not create edges for missing dependencies', () => {
      const components = [createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] })]
      const vulnerabilities: Vulnerability[] = []

      const elements = buildGraphElements(components, vulnerabilities)

      expect(elements.edges.length).toBe(0)
    })

    it('should cap nodes at MAX_GRAPH_NODES for very large component sets (FR-11.1-b)', () => {
      // Sequential deps comp-0->comp-1->...; more than the cap so truncation kicks in.
      const total = MAX_GRAPH_NODES + 50
      const components = Array.from({ length: total }, (_unused, i) =>
        createMockComponent({ id: `comp-${i}`, dependencies: i < total - 1 ? [`comp-${i + 1}`] : [] }),
      )

      const elements = buildGraphElements(components, [])

      expect(elements.nodes.length).toBe(MAX_GRAPH_NODES)
      // Every retained edge must reference only retained nodes (no dangling edges).
      const retained = new Set(elements.nodes.map((n) => n.data.id))
      for (const edge of elements.edges) {
        expect(retained.has(edge.data.source)).toBe(true)
        expect(retained.has(edge.data.target)).toBe(true)
      }
    })

    it('should mark edges participating in a circular dependency as isCycleEdge (FR-11.1-a)', () => {
      // A->B->C->A is a cycle; a 4th component D->A is acyclic (D depends into the
      // cycle but nothing points back to D).
      const components = [
        createMockComponent({ id: 'A', dependencies: ['B'] }),
        createMockComponent({ id: 'B', dependencies: ['C'] }),
        createMockComponent({ id: 'C', dependencies: ['A'] }),
        createMockComponent({ id: 'D', dependencies: ['A'] }),
      ]

      const elements = buildGraphElements(components, [])
      const edgeOf = (source: string) =>
        elements.edges.find((e) => e.data.source === source)?.data as { isCycleEdge?: boolean } | undefined

      expect(edgeOf('A')?.isCycleEdge).toBe(true)
      expect(edgeOf('B')?.isCycleEdge).toBe(true)
      expect(edgeOf('C')?.isCycleEdge).toBe(true)
      // D->A is not part of any cycle.
      expect(edgeOf('D')?.isCycleEdge).toBeFalsy()
    })

    it('should include vulnerability count in node data', () => {
      const components = [createMockComponent({ id: 'comp-1' })]
      const vulnerabilities = [
        createMockVulnerability({ affectedComponents: ['comp-1'] }),
        createMockVulnerability({
          id: 'CVE-2024-0002',
          affectedComponents: ['comp-1'],
        }),
      ]

      const elements = buildGraphElements(components, vulnerabilities)

      expect((elements.nodes[0].data as { vulnerabilityCount: number }).vulnerabilityCount).toBe(2)
    })

    it('should include max severity in node data', () => {
      const components = [createMockComponent({ id: 'comp-1' })]
      const vulnerabilities = [
        createMockVulnerability({
          severity: 'critical',
          affectedComponents: ['comp-1'],
        }),
      ]

      const elements = buildGraphElements(components, vulnerabilities)

      expect((elements.nodes[0].data as any).maxSeverity).toBe('critical')
    })

    it('should include patch availability in node data', () => {
      const components = [
        createMockComponent({
          id: 'comp-1',
          patchInfo: { hasFixAvailable: true, fixedVersions: [], vulnerableVersions: [] },
        }),
      ]
      const vulnerabilities: Vulnerability[] = []

      const elements = buildGraphElements(components, vulnerabilities)

      expect((elements.nodes[0].data as any).hasPatchAvailable).toBe(true)
    })

    it('should handle components without dependencies', () => {
      const components = [
        createMockComponent({ id: 'comp-1' }), // No dependencies
      ]
      const vulnerabilities: Vulnerability[] = []

      const elements = buildGraphElements(components, vulnerabilities)

      expect(elements.nodes.length).toBe(1)
      expect(elements.edges.length).toBe(0)
    })

    it('should handle multiple dependencies', () => {
      const components = [
        createMockComponent({
          id: 'comp-1',
          dependencies: ['comp-2', 'comp-3', 'comp-4'],
        }),
        createMockComponent({ id: 'comp-2' }),
        createMockComponent({ id: 'comp-3' }),
        createMockComponent({ id: 'comp-4' }),
      ]
      const vulnerabilities: Vulnerability[] = []

      const elements = buildGraphElements(components, vulnerabilities)

      expect(elements.edges.length).toBe(3)
    })

    it('should handle empty components array', () => {
      const components: Component[] = []
      const vulnerabilities: Vulnerability[] = []

      const elements = buildGraphElements(components, vulnerabilities)

      expect(elements.nodes.length).toBe(0)
      expect(elements.edges.length).toBe(0)
    })
  })

  describe('findPaths', () => {
    it('should return empty array when no path exists', () => {
      const components = [createMockComponent({ id: 'comp-1' }), createMockComponent({ id: 'comp-2' })]

      const paths = findPaths(components, 'comp-1', 'comp-2')

      expect(paths).toEqual([])
    })

    it('should find direct dependency path', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2' }),
      ]

      const paths = findPaths(components, 'comp-1', 'comp-2')

      expect(paths.length).toBeGreaterThan(0)
      expect(paths[0]).toEqual(['comp-1', 'comp-2'])
    })

    it('should find multi-hop path', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2', dependencies: ['comp-3'] }),
        createMockComponent({ id: 'comp-3' }),
      ]

      const paths = findPaths(components, 'comp-1', 'comp-3')

      expect(paths.length).toBeGreaterThan(0)
      expect(paths[0]).toEqual(['comp-1', 'comp-2', 'comp-3'])
    })

    it('should find reverse path (dependents)', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2' }),
      ]

      // Search from comp-2 to comp-1 (reverse direction)
      const paths = findPaths(components, 'comp-2', 'comp-1')

      expect(paths.length).toBeGreaterThan(0)
      expect(paths[0]).toEqual(['comp-2', 'comp-1'])
    })

    it('should return multiple paths when they exist', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2', 'comp-3'] }),
        createMockComponent({ id: 'comp-2', dependencies: ['comp-4'] }),
        createMockComponent({ id: 'comp-3', dependencies: ['comp-4'] }),
        createMockComponent({ id: 'comp-4' }),
      ]

      const paths = findPaths(components, 'comp-1', 'comp-4')

      expect(paths.length).toBeGreaterThanOrEqual(2)
    })

    it('should limit path depth', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2', dependencies: ['comp-3'] }),
        createMockComponent({ id: 'comp-3', dependencies: ['comp-4'] }),
        createMockComponent({ id: 'comp-4', dependencies: ['comp-5'] }),
        createMockComponent({ id: 'comp-5', dependencies: ['comp-6'] }),
        createMockComponent({ id: 'comp-6' }),
      ]

      // With maxDepth=3, should not find path of length 6
      const paths = findPaths(components, 'comp-1', 'comp-6', 3)

      expect(paths).toEqual([])
    })

    it('should return at most 5 paths', () => {
      const components = [
        createMockComponent({
          id: 'comp-1',
          dependencies: ['comp-2', 'comp-3', 'comp-4', 'comp-5', 'comp-6', 'comp-7'],
        }),
        createMockComponent({ id: 'comp-2', dependencies: ['comp-8'] }),
        createMockComponent({ id: 'comp-3', dependencies: ['comp-8'] }),
        createMockComponent({ id: 'comp-4', dependencies: ['comp-8'] }),
        createMockComponent({ id: 'comp-5', dependencies: ['comp-8'] }),
        createMockComponent({ id: 'comp-6', dependencies: ['comp-8'] }),
        createMockComponent({ id: 'comp-7', dependencies: ['comp-8'] }),
        createMockComponent({ id: 'comp-8' }),
      ]

      const paths = findPaths(components, 'comp-1', 'comp-8')

      expect(paths.length).toBeLessThanOrEqual(5)
    })

    it('should return shortest path first', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2', 'comp-4'] }),
        createMockComponent({ id: 'comp-2', dependencies: ['comp-3'] }),
        createMockComponent({ id: 'comp-3', dependencies: ['comp-5'] }),
        createMockComponent({ id: 'comp-4', dependencies: ['comp-5'] }),
        createMockComponent({ id: 'comp-5' }),
      ]

      const paths = findPaths(components, 'comp-1', 'comp-5')

      // Shortest path is comp-1 -> comp-4 -> comp-5 (2 hops)
      expect(paths[0].length).toBe(3)
    })
  })

  describe('findShortestPath', () => {
    it('should return null when no path exists', () => {
      const components = [createMockComponent({ id: 'comp-1' }), createMockComponent({ id: 'comp-2' })]

      const path = findShortestPath(components, 'comp-1', 'comp-2')

      expect(path).toBeNull()
    })

    it('should return shortest path when it exists', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2', 'comp-3'] }),
        createMockComponent({ id: 'comp-2', dependencies: ['comp-4'] }),
        createMockComponent({ id: 'comp-3', dependencies: ['comp-4'] }),
        createMockComponent({ id: 'comp-4' }),
      ]

      const path = findShortestPath(components, 'comp-1', 'comp-4')

      expect(path).not.toBeNull()
      expect(path!.length).toBe(3) // comp-1 -> comp-2/comp-3 -> comp-4
    })

    it('should return direct path for direct dependency', () => {
      const components = [
        createMockComponent({ id: 'comp-1', dependencies: ['comp-2'] }),
        createMockComponent({ id: 'comp-2' }),
      ]

      const path = findShortestPath(components, 'comp-1', 'comp-2')

      expect(path).toEqual(['comp-1', 'comp-2'])
    })
  })

  describe('getPathEdges', () => {
    it('should return empty array for single node path', () => {
      const edges = getPathEdges(['comp-1'])

      expect(edges).toEqual([])
    })

    it('should return single edge for two node path', () => {
      const edges = getPathEdges(['comp-1', 'comp-2'])

      expect(edges).toEqual([{ source: 'comp-1', target: 'comp-2' }])
    })

    it('should return multiple edges for multi-node path', () => {
      const edges = getPathEdges(['comp-1', 'comp-2', 'comp-3', 'comp-4'])

      expect(edges).toEqual([
        { source: 'comp-1', target: 'comp-2' },
        { source: 'comp-2', target: 'comp-3' },
        { source: 'comp-3', target: 'comp-4' },
      ])
    })

    it('should handle empty path', () => {
      const edges = getPathEdges([])

      expect(edges).toEqual([])
    })
  })
})
