/**
 * Tests for DependencyGraphPage (FR-11.1-b truncation banner).
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DependencyGraphPage } from './DependencyGraphPage'
import { MAX_GRAPH_NODES } from '@/components/graph/types'
import type { Project, Component } from '@@/types'

const { mockProjects } = vi.hoisted(() => ({ mockProjects: { current: [] as Project[] } }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useParams: () => ({ projectId: 'p1' }), useNavigate: () => vi.fn() }
})

vi.mock('@/store/useStore', () => ({ useProjects: () => mockProjects.current }))

// Stub the graph so tests don't touch cytoscape.
vi.mock('@/components/graph/DependencyGraph', () => ({
  DependencyGraph: ({ components }: { components: Component[] }) => (
    <div data-testid="dependency-graph">nodes: {components.length}</div>
  ),
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
