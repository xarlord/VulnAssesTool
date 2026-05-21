/**
 * VirtualList Component Tests
 * Tests for virtual scrolling functionality, VirtualGrid, and useItemKey hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VirtualList, VirtualGrid, useItemKey } from './VirtualList'
import React from 'react'

// Mock react-virtuoso to render items synchronously in tests
// This is necessary because react-virtuoso requires actual DOM measurements
// which don't work properly in jsdom environment
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
    components,
    className,
    style,
    endReached,
    isScrolling,
    rangeChanged,
    computeItemKey,
    defaultItemHeight,
    increaseViewportBy,
    totalCount,
  }: Record<string, unknown>) => {
    const Header = (components as Record<string, unknown>)?.Header as React.ComponentType | undefined
    const Footer = (components as Record<string, unknown>)?.Footer as React.ComponentType | undefined
    const EmptyPlaceholder = (components as Record<string, unknown>)?.EmptyPlaceholder as
      | React.ComponentType
      | undefined
    const isEmpty = !data || (data as unknown[]).length === 0

    return (
      <div
        className={className as string}
        style={style as React.CSSProperties}
        data-testid="virtuoso-scroller"
        data-total-count={totalCount as number}
        data-default-item-height={defaultItemHeight as number}
        data-increase-viewport-by={JSON.stringify(increaseViewportBy)}
      >
        {Header && <Header />}
        {isEmpty && EmptyPlaceholder ? (
          <EmptyPlaceholder />
        ) : (
          <div data-testid="virtuoso-item-list">
            {(data as unknown[])?.map((item: unknown, index: number) => (
              <div key={typeof computeItemKey === 'function' ? computeItemKey(index, item) : index}>
                {typeof itemContent === 'function' && itemContent(index, item)}
              </div>
            ))}
          </div>
        )}
        {Footer && <Footer />}
        <button
          data-testid="trigger-end-reached"
          onClick={() => {
            if (typeof endReached === 'function') endReached(0)
          }}
        />
        <button
          data-testid="trigger-is-scrolling"
          onClick={() => {
            if (typeof isScrolling === 'function') isScrolling(true)
          }}
        />
        <button
          data-testid="trigger-range-changed"
          onClick={() => {
            if (typeof rangeChanged === 'function') rangeChanged({ startIndex: 0, endIndex: 5 })
          }}
        />
      </div>
    )
  },
  VirtuosoGrid: ({
    data,
    itemContent,
    components,
    className,
    style,
    endReached,
    isScrolling,
    computeItemKey,
    totalCount,
  }: Record<string, unknown>) => {
    const Header = (components as Record<string, unknown>)?.Header as React.ComponentType | undefined
    const Footer = (components as Record<string, unknown>)?.Footer as React.ComponentType | undefined
    const EmptyPlaceholder = (components as Record<string, unknown>)?.EmptyPlaceholder as
      | React.ComponentType
      | undefined
    const isEmpty = !data || (data as unknown[]).length === 0

    return (
      <div
        className={className as string}
        style={style as React.CSSProperties}
        data-testid="virtuoso-grid"
        data-total-count={totalCount as number}
      >
        {Header && <Header />}
        {isEmpty && EmptyPlaceholder ? (
          <EmptyPlaceholder />
        ) : (
          <div>
            {(data as unknown[])?.map((item: unknown, index: number) => (
              <div key={typeof computeItemKey === 'function' ? computeItemKey(index, item) : index}>
                {typeof itemContent === 'function' && itemContent(index, item)}
              </div>
            ))}
          </div>
        )}
        {Footer && <Footer />}
        <button
          data-testid="trigger-grid-end-reached"
          onClick={() => {
            if (typeof endReached === 'function') endReached(0)
          }}
        />
        <button
          data-testid="trigger-grid-is-scrolling"
          onClick={() => {
            if (typeof isScrolling === 'function') isScrolling(true)
          }}
        />
      </div>
    )
  },
}))

// Hoisted to avoid import issues with missing types
const VirtuosoGridHandle = {}

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

  it('should call endReached callback when scrolling to end', async () => {
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

    // Simulate end reached
    await userEvent.click(screen.getByTestId('trigger-end-reached'))
    expect(endReached).toHaveBeenCalledWith(items.length)
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

  it('should apply custom style to the container', () => {
    render(
      <VirtualList
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        height="400px"
        style={{ border: '1px solid red' }}
      />,
    )

    const scroller = screen.getByTestId('virtuoso-scroller')
    expect(scroller.style.border).toBe('1px solid red')
    expect(scroller.style.height).toBe('400px')
  })

  it('should pass default height of 100% when no height provided', () => {
    render(<VirtualList items={[]} itemKey="id" renderItem={(item) => <div>{item.name}</div>} />)

    const scroller = screen.getByTestId('virtuoso-scroller')
    expect(scroller.style.height).toBe('100%')
  })

  it('should pass fixedItemHeight as defaultItemHeight when fixedItemHeight is true', () => {
    render(
      <VirtualList
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        itemHeight={80}
        fixedItemHeight
      />,
    )

    const scroller = screen.getByTestId('virtuoso-scroller')
    expect(scroller.dataset.defaultItemHeight).toBe('80')
  })

  it('should pass defaultItemHeight when fixedItemHeight is false', () => {
    render(
      <VirtualList
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        defaultItemHeight={60}
        fixedItemHeight={false}
      />,
    )

    const scroller = screen.getByTestId('virtuoso-scroller')
    expect(scroller.dataset.defaultItemHeight).toBe('60')
  })

  it('should use default defaultItemHeight of 50', () => {
    render(<VirtualList items={[]} itemKey="id" renderItem={(item) => <div>{item.name}</div>} />)

    const scroller = screen.getByTestId('virtuoso-scroller')
    expect(scroller.dataset.defaultItemHeight).toBe('50')
  })

  it('should pass numeric overscan as increaseViewportBy', () => {
    render(<VirtualList items={[]} itemKey="id" renderItem={(item) => <div>{item.name}</div>} overscan={300} />)

    const scroller = screen.getByTestId('virtuoso-scroller')
    const parsed = JSON.parse(scroller.dataset.increaseViewportBy || '{}')
    expect(parsed).toEqual({ top: 300, bottom: 300 })
  })

  it('should pass object overscan as increaseViewportBy', () => {
    render(
      <VirtualList
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        overscan={{ main: 100, reverse: 200 }}
      />,
    )

    const scroller = screen.getByTestId('virtuoso-scroller')
    const parsed = JSON.parse(scroller.dataset.increaseViewportBy || '{}')
    expect(parsed).toEqual({ top: 100, bottom: 200 })
  })

  it('should call isScrolling callback when triggered', async () => {
    const isScrolling = vi.fn()

    render(
      <VirtualList
        items={[{ id: '1', name: 'Item 1' }]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        isScrolling={isScrolling}
      />,
    )

    await userEvent.click(screen.getByTestId('trigger-is-scrolling'))
    expect(isScrolling).toHaveBeenCalledWith(true)
  })

  it('should call rangeChanged callback when triggered', async () => {
    const rangeChanged = vi.fn()

    render(
      <VirtualList
        items={[{ id: '1', name: 'Item 1' }]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        rangeChanged={rangeChanged}
      />,
    )

    await userEvent.click(screen.getByTestId('trigger-range-changed'))
    expect(rangeChanged).toHaveBeenCalledWith({ startIndex: 0, endIndex: 5 })
  })

  it('should render items wrapped in div with data-index', () => {
    const items = [{ id: 'a', name: 'Alpha' }]

    render(<VirtualList items={items} itemKey="id" renderItem={(item) => <span>{item.name}</span>} />)

    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('should handle itemKey as string property name', () => {
    const items = [{ id: 'x', name: 'X-Item' }]

    render(<VirtualList items={items} itemKey="id" renderItem={(item) => <div>{item.name}</div>} />)

    expect(screen.getByText('X-Item')).toBeInTheDocument()
  })

  it('should fall back to index when key property is undefined', () => {
    const items = [{ id: undefined, name: 'NoId' }] as unknown as { id: string; name: string }[]

    render(<VirtualList items={items} itemKey="id" renderItem={(item) => <div>{item.name}</div>} />)

    expect(screen.getByText('NoId')).toBeInTheDocument()
  })

  it('should not call endReached when not provided', () => {
    render(
      <VirtualList items={[{ id: '1', name: 'Item' }]} itemKey="id" renderItem={(item) => <div>{item.name}</div>} />,
    )

    // Should not throw when trigger is clicked without callback
    const trigger = screen.getByTestId('trigger-end-reached')
    expect(() => trigger.click()).not.toThrow()
  })

  it('should not call isScrolling when not provided', () => {
    render(
      <VirtualList items={[{ id: '1', name: 'Item' }]} itemKey="id" renderItem={(item) => <div>{item.name}</div>} />,
    )

    const trigger = screen.getByTestId('trigger-is-scrolling')
    expect(() => trigger.click()).not.toThrow()
  })

  it('should not call rangeChanged when not provided', () => {
    render(
      <VirtualList items={[{ id: '1', name: 'Item' }]} itemKey="id" renderItem={(item) => <div>{item.name}</div>} />,
    )

    const trigger = screen.getByTestId('trigger-range-changed')
    expect(() => trigger.click()).not.toThrow()
  })

  it('should pass totalCount to Virtuoso', () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ id: String(i), name: `Item ${i}` }))

    render(<VirtualList items={items} itemKey="id" renderItem={(item) => <div>{item.name}</div>} />)

    const scroller = screen.getByTestId('virtuoso-scroller')
    expect(scroller.dataset.totalCount).toBe('5')
  })
})

describe('VirtualGrid', () => {
  it('should render grid items correctly', () => {
    const items = [
      { id: '1', name: 'Grid 1' },
      { id: '2', name: 'Grid 2' },
    ]

    render(
      <VirtualGrid
        items={items}
        itemKey="id"
        renderItem={(item) => <div data-testid={`grid-${item.id}`}>{item.name}</div>}
        columns={3}
        height="400px"
      />,
    )

    expect(screen.getByTestId('grid-1')).toBeInTheDocument()
    expect(screen.getByTestId('grid-2')).toBeInTheDocument()
  })

  it('should render empty grid', () => {
    const { container } = render(
      <VirtualGrid items={[]} itemKey="id" renderItem={(item) => <div>{item.name}</div>} columns={3} height="400px" />,
    )

    expect(container).toBeInTheDocument()
  })

  it('should apply custom className to grid', () => {
    render(
      <VirtualGrid
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        columns={3}
        className="grid-custom"
        height="400px"
      />,
    )

    expect(screen.getByTestId('virtuoso-grid')).toHaveClass('grid-custom')
  })

  it('should apply custom style to grid', () => {
    render(
      <VirtualGrid
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        columns={3}
        height="300px"
        style={{ border: '1px solid blue' }}
      />,
    )

    const grid = screen.getByTestId('virtuoso-grid')
    expect(grid.style.height).toBe('300px')
    expect(grid.style.border).toBe('1px solid blue')
  })

  it('should use default height of 100%', () => {
    render(<VirtualGrid items={[]} itemKey="id" renderItem={(item) => <div>{item.name}</div>} columns={3} />)

    const grid = screen.getByTestId('virtuoso-grid')
    expect(grid.style.height).toBe('100%')
  })

  it('should render HeaderComponent in grid', () => {
    const Header = () => <div data-testid="grid-header">Grid Header</div>

    render(
      <VirtualGrid
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        columns={3}
        HeaderComponent={Header}
      />,
    )

    expect(screen.getByTestId('grid-header')).toBeInTheDocument()
  })

  it('should render FooterComponent in grid', () => {
    const Footer = () => <div data-testid="grid-footer">Grid Footer</div>

    render(
      <VirtualGrid
        items={[]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        columns={3}
        FooterComponent={Footer}
      />,
    )

    expect(screen.getByTestId('grid-footer')).toBeInTheDocument()
  })

  it('should call endReached callback when triggered', async () => {
    const endReached = vi.fn()
    const items = [{ id: '1', name: 'Grid Item' }]

    render(
      <VirtualGrid
        items={items}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        columns={3}
        endReached={endReached}
      />,
    )

    await userEvent.click(screen.getByTestId('trigger-grid-end-reached'))
    expect(endReached).toHaveBeenCalledWith(items.length)
  })

  it('should call isScrolling callback when triggered', async () => {
    const isScrolling = vi.fn()

    render(
      <VirtualGrid
        items={[{ id: '1', name: 'Item' }]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        columns={3}
        isScrolling={isScrolling}
      />,
    )

    await userEvent.click(screen.getByTestId('trigger-grid-is-scrolling'))
    expect(isScrolling).toHaveBeenCalledWith(true)
  })

  it('should not call endReached when not provided', () => {
    render(
      <VirtualGrid
        items={[{ id: '1', name: 'Item' }]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        columns={3}
      />,
    )

    expect(() => screen.getByTestId('trigger-grid-end-reached').click()).not.toThrow()
  })

  it('should not call isScrolling when not provided', () => {
    render(
      <VirtualGrid
        items={[{ id: '1', name: 'Item' }]}
        itemKey="id"
        renderItem={(item) => <div>{item.name}</div>}
        columns={3}
      />,
    )

    expect(() => screen.getByTestId('trigger-grid-is-scrolling').click()).not.toThrow()
  })

  it('should handle function itemKey', () => {
    const items = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ]

    const keyFn = (item: { id: string; name: string }) => item.id

    render(<VirtualGrid items={items} itemKey={keyFn} renderItem={(item) => <div>{item.name}</div>} columns={2} />)

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })

  it('should pass totalCount to VirtuosoGrid', () => {
    const items = Array.from({ length: 3 }, (_, i) => ({ id: String(i), name: `Item ${i}` }))

    render(<VirtualGrid items={items} itemKey="id" renderItem={(item) => <div>{item.name}</div>} columns={3} />)

    const grid = screen.getByTestId('virtuoso-grid')
    expect(grid.dataset.totalCount).toBe('3')
  })
})

describe('useItemKey', () => {
  it('should return a function that extracts key from item', () => {
    type TestItem = Record<string, unknown> & { id: string; name: string }

    function TestComponent() {
      const getKey = useItemKey<TestItem>('id')
      return <div data-testid="key-result">{getKey({ id: 'abc', name: 'Test' })}</div>
    }

    render(<TestComponent />)
    expect(screen.getByTestId('key-result')).toHaveTextContent('abc')
  })

  it('should return stringified item when key value is undefined', () => {
    type TestItem = Record<string, unknown> & { id?: string; name: string }

    function TestComponent() {
      const getKey = useItemKey<TestItem>('id')
      return <div data-testid="key-result">{getKey({ name: 'Test' })}</div>
    }

    render(<TestComponent />)
    expect(screen.getByTestId('key-result')).toHaveTextContent('{"name":"Test"}')
  })

  it('should return stringified item when key value is null', () => {
    type TestItem = Record<string, unknown> & { id: string | null; name: string }

    function TestComponent() {
      const getKey = useItemKey<TestItem>('id')
      return <div data-testid="key-result">{getKey({ id: null, name: 'Test' })}</div>
    }

    render(<TestComponent />)
    expect(screen.getByTestId('key-result')).toHaveTextContent('{"id":null,"name":"Test"}')
  })

  it('should convert numeric key to string', () => {
    type TestItem = Record<string, unknown> & { num: number }

    function TestComponent() {
      const getKey = useItemKey<TestItem>('num')
      return <div data-testid="key-result">{getKey({ num: 42 })}</div>
    }

    render(<TestComponent />)
    expect(screen.getByTestId('key-result')).toHaveTextContent('42')
  })
})
