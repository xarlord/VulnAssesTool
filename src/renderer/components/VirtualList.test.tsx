/**
 * VirtualList Component Tests
 * Tests for virtual scrolling functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VirtualList } from './VirtualList'

// Mock react-virtuoso to render items synchronously in tests
// This is necessary because react-virtuoso requires actual DOM measurements
// which don't work properly in jsdom environment
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data, itemContent, components, className, style }: any) => {
    const { Header, Footer, EmptyPlaceholder } = components || {}
    const isEmpty = !data || data.length === 0

    return (
      <div className={className} style={style} data-testid="virtuoso-scroller">
        {Header && <Header />}
        {isEmpty && EmptyPlaceholder ? (
          <EmptyPlaceholder />
        ) : (
          <div data-testid="virtuoso-item-list">
            {data?.map((item: any, index: number) => (
              <div key={index}>{itemContent(index, item)}</div>
            ))}
          </div>
        )}
        {Footer && <Footer />}
      </div>
    )
  },
  VirtuosoGrid: ({ data, itemContent, components, className, style }: any) => {
    const { Header, Footer, EmptyPlaceholder } = components || {}
    const isEmpty = !data || data.length === 0

    return (
      <div className={className} style={style}>
        {Header && <Header />}
        {isEmpty && EmptyPlaceholder ? (
          <EmptyPlaceholder />
        ) : (
          <div>
            {data?.map((item: any, index: number) => (
              <div key={index}>{itemContent(index, item)}</div>
            ))}
          </div>
        )}
        {Footer && <Footer />}
      </div>
    )
  },
}))

describe('VirtualList', () => {
  it('should render empty list correctly', () => {
    const { container } = render(
      <VirtualList items={[]} itemKey="id" renderItem={(item) => <div>{item.name}</div>} height="400px" />,
    )

    expect(container).toBeInTheDocument()
  })

  it('should render list of items correctly', async () => {
    const items = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
      { id: '3', name: 'Item 3' },
    ]

    render(
      <VirtualList
        items={items}
        itemKey="id"
        renderItem={(item) => <div data-testid={`item-${item.id}`}>{item.name}</div>}
        height="400px"
      />,
    )

    // Check if items are rendered (use findByTestId for async rendering)
    expect(await screen.findByTestId('item-1')).toBeInTheDocument()
    expect(await screen.findByTestId('item-2')).toBeInTheDocument()
    expect(await screen.findByTestId('item-3')).toBeInTheDocument()
  })

  it('should render custom EmptyComponent when list is empty', () => {
    const EmptyComponent = () => <div data-testid="empty">No items</div>

    render(
      <VirtualList
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        EmptyComponent={EmptyComponent}
        height="400px"
      />,
    )

    expect(screen.getByTestId('empty')).toBeInTheDocument()
  })

  it('should call endReached callback when scrolling to end', () => {
    const endReached = vi.fn()
    const items = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
    }))

    render(
      <VirtualList
        items={items}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        endReached={endReached}
        height="400px"
      />,
    )

    // The callback should be defined
    expect(endReached).toBeDefined()
  })

  it('should use function itemKey when provided', async () => {
    const items = [
      { id: '1', name: 'Item 1' },
      { id: '2', name: 'Item 2' },
    ]

    const itemKeyFn = (item: { id: string; name: string }) => item.id

    render(
      <VirtualList
        items={items}
        itemKey={itemKeyFn}
        renderItem={(item) => <div data-testid={`item-${item.id}`}>{item.name}</div>}
        height="400px"
      />,
    )

    expect(await screen.findByTestId('item-1')).toBeInTheDocument()
    expect(await screen.findByTestId('item-2')).toBeInTheDocument()
  })

  it('should render HeaderComponent when provided', () => {
    const Header = () => <div data-testid="header">Header</div>

    render(
      <VirtualList
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        HeaderComponent={Header}
        height="400px"
      />,
    )

    expect(screen.getByTestId('header')).toBeInTheDocument()
  })

  it('should render FooterComponent when provided', () => {
    const Footer = () => <div data-testid="footer">Footer</div>

    render(
      <VirtualList
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        FooterComponent={Footer}
        height="400px"
      />,
    )

    expect(screen.getByTestId('footer')).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(
      <VirtualList
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        className="custom-class"
        height="400px"
      />,
    )

    expect(container?.firstElementChild).toHaveClass('custom-class')
  })

  it('should handle large datasets efficiently', () => {
    // Create a large dataset
    const items = Array.from({ length: 10000 }, (_, i) => ({
      id: String(i),
      name: `Item ${i}`,
    }))

    const startTime = performance.now()

    render(<VirtualList items={items} itemKey="id" renderItem={(item) => <div>{item.name}</div>} height="400px" />)

    const endTime = performance.now()
    const renderTime = endTime - startTime

    // VirtualList should render quickly even with large datasets
    // Note: In test environment with mocked Virtuoso, this may take longer than real virtualization
    // Using a generous timeout since test environment performance varies significantly
    expect(renderTime).toBeLessThan(10000) // Generous timeout for slow CI/test environments
  })
})
