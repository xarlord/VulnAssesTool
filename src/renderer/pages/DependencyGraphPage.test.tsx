/**
 * Tests for DependencyGraphPage.
 *
 * FR-11.1-b: truncation banner when the component set exceeds MAX_GRAPH_NODES.
 * FR-11.2-a: clicking a node opens the component details popup (was console.log only).
 * FR-11.2-b: From/To selects + Highlight/Clear Path wire the (previously unreachable)
 *   findShortestPath utility to the graph's highlightPath prop.
 *
 * The real <DependencyGraph> is stubbed (no cytoscape). The stub captures the props
 * under test and exposes a trigger for onNodeClick, so we assert the page's wiring —
 * the exact seam these FRs fix — rather than canvas rendering. findShortestPath is the
 * REAL util (not mocked): it is the wiring being verified.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DependencyGraphPage } from './DependencyGraphPage'
import { MAX_GRAPH_NODES } from '@/components/graph/types'
import type { Project, Component, Vulnerability } from '@@/types'

const { mockProjects, capturedProps, mockNavigate, mockToastError } = vi.hoisted(() => ({
  mockProjects: { current: [] as Project[] },
  capturedProps: { current: {} as { highlightPath?: string[] } },
  mockNavigate: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useParams: () => ({ projectId: 'p1' }), useNavigate: () => mockNavigate }
})

vi.mock('@/store/useStore', () => ({ useProjects: () => mockProjects.current }))

vi.mock('@/components/Toaster', () => ({
  toast: { error: mockToastError, success: vi.fn() },
}))

// Stub the graph so tests don't touch cytoscape. Capture the props the page wires in
// and expose a button that fires onNodeClick with the first component.
vi.mock('@/components/graph/DependencyGraph', () => ({
  DependencyGraph: (props: {
    components: Component[]
    onNodeClick?: (component: Component) => void
    highlightPath?: string[]
  }) => {
    capturedProps.current = { highlightPath: props.highlightPath }
    return (
      <div data-testid="dependency-graph">
        nodes: {props.components.length}
        <button type="button" onClick={() => props.onNodeClick?.(props.components[0])}>
          trigger-node-click
        </button>
      </div>
    )
  },
}))

function makeProject(componentCount: number): Project {
  const components = Array.from({ length: componentCount }, (_unused, i) => ({
    id: `comp-${i}`,
    name: `component-${i}`,
    version: '1.0.0',
    type: 'library',
  })) as unknown as Component[]
  return { id: 'p1', name: 'Test Project', components, vulnerabilities: [] } as unknown as Project
}

// A -> B -> C dependency chain plus an isolated node Z (no path to/from it).
function makeGraphProject(): Project {
  const components = [
    { id: 'A', name: 'comp-a', version: '1.0.0', type: 'library', dependencies: ['B'] },
    { id: 'B', name: 'comp-b', version: '1.0.0', type: 'library', dependencies: ['C'] },
    { id: 'C', name: 'comp-c', version: '1.0.0', type: 'library', dependencies: [] },
    { id: 'Z', name: 'comp-z', version: '1.0.0', type: 'library', dependencies: [] },
  ] as unknown as Component[]
  return { id: 'p1', name: 'Graph Project', components, vulnerabilities: [] } as unknown as Project
}

function makeSingleComponentProject(): Project {
  const components = [
    { id: 'comp-0', name: 'component-0', version: '2.1.0', type: 'library' },
  ] as unknown as Component[]
  const vulnerabilities = [
    { id: 'CVE-2024-0001', severity: 'high', affectedComponents: ['comp-0'] },
  ] as unknown as Vulnerability[]
  return { id: 'p1', name: 'Single Project', components, vulnerabilities } as unknown as Project
}

beforeEach(() => {
  mockNavigate.mockClear()
  mockToastError.mockClear()
  capturedProps.current = {}
})

describe('DependencyGraphPage (FR-11.1-b)', () => {
  it('shows a truncation banner when the component count exceeds MAX_GRAPH_NODES', () => {
    mockProjects.current = [makeProject(MAX_GRAPH_NODES + 10)]
    render(<DependencyGraphPage />)

    expect(
      screen.getByText(new RegExp(`Showing first ${MAX_GRAPH_NODES} of ${MAX_GRAPH_NODES + 10}`)),
    ).toBeInTheDocument()
  })

  it('does not show the banner when the component count is within MAX_GRAPH_NODES', () => {
    mockProjects.current = [makeProject(MAX_GRAPH_NODES - 1)]
    render(<DependencyGraphPage />)

    expect(screen.queryByText(/Showing first/)).not.toBeInTheDocument()
  })
})

describe('DependencyGraphPage node selection (FR-11.2-a)', () => {
  it('opens the component details popup when a node is clicked', async () => {
    // WHY: the PRD bullet is "Node selection for details" — before this fix the click
    // handler only console.logged, so the user saw nothing. The popup's title is the
    // component name, which is not rendered anywhere else on the page.
    mockProjects.current = [makeSingleComponentProject()]
    render(<DependencyGraphPage />)

    expect(screen.queryByText('component-0')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('trigger-node-click'))

    await waitFor(() => {
      expect(screen.getByText('component-0')).toBeInTheDocument()
    })
  })
})

describe('DependencyGraphPage path highlighting (FR-11.2-b)', () => {
  it('passes the shortest path to DependencyGraph when Highlight Path is clicked', async () => {
    mockProjects.current = [makeGraphProject()]
    render(<DependencyGraphPage />)

    fireEvent.change(screen.getByLabelText(/path from/i), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText(/path to/i), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: /highlight path/i }))

    // WHY: findShortestPath already worked in isolation; this proves the page actually
    // reaches it and feeds the result to the graph — the wiring the report found missing.
    await waitFor(() => {
      expect(capturedProps.current.highlightPath).toEqual(['A', 'B', 'C'])
    })
  })

  it('shows an error toast and sets no highlightPath when no path exists', async () => {
    mockProjects.current = [makeGraphProject()]
    render(<DependencyGraphPage />)

    fireEvent.change(screen.getByLabelText(/path from/i), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText(/path to/i), { target: { value: 'Z' } })
    fireEvent.click(screen.getByRole('button', { name: /highlight path/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/no path found/i))
    })
    expect(capturedProps.current.highlightPath).toBeUndefined()
  })

  it('clears the highlighted path when Clear Path is clicked', async () => {
    mockProjects.current = [makeGraphProject()]
    render(<DependencyGraphPage />)

    fireEvent.change(screen.getByLabelText(/path from/i), { target: { value: 'A' } })
    fireEvent.change(screen.getByLabelText(/path to/i), { target: { value: 'C' } })
    fireEvent.click(screen.getByRole('button', { name: /highlight path/i }))
    await waitFor(() => {
      expect(capturedProps.current.highlightPath).toEqual(['A', 'B', 'C'])
    })

    fireEvent.click(screen.getByRole('button', { name: /clear path/i }))
    await waitFor(() => {
      expect(capturedProps.current.highlightPath).toBeUndefined()
    })
  })
})
