/**
 * Virtual Scrolling List Component
 * Provides efficient rendering for large lists using react-virtuoso
 */

import React, { forwardRef } from 'react'
import { Virtuoso } from 'react-virtuoso'
import type { VirtuosoGridHandle } from 'react-virtuoso'
import { cn } from '@/lib/utils'

export interface VirtualListProps<T> {
  /**
   * Array of items to render
   */
  items: T[]

  /**
   * Unique key selector for items
   */
  itemKey: keyof T | ((item: T, index: number) => string)

  /**
   * Render function for each item
   */
  renderItem: (item: T, index: number) => React.ReactNode

  /**
   * Optional render function for item at the beginning of list
   */
  HeaderComponent?: React.ComponentType<{ context?: unknown }>

  /**
   * Optional render function for item at the end of list
   */
  FooterComponent?: React.ComponentType<{ context?: unknown }>

  /**
   * Optional render function when list is empty
   */
  EmptyComponent?: React.ComponentType

  /**
   * Optional className for the container
   */
  className?: string

  /**
   * Optional style for the container
   */
  style?: React.CSSProperties

  /**
   * Height of each item (for fixed-height lists)
   */
  itemHeight?: number

  /**
   * Approximate height of each item (for variable-height lists)
   */
  defaultItemHeight?: number

  /**
   * Total height of the list
   */
  height?: number | string

  /**
   * Enable end-of-list detection
   */
  endReached?: (index: number) => void

  /**
   * Number of extra items to render beyond viewport (used for endReached timing)
   */
  overscan?: number | { main: number; reverse: number }

  /**
   * Callback when scrolling starts
   */
  isScrolling?: (isScrolling: boolean) => void

  /**
   * Scroll top position callback
   */
  rangeChanged?: (range: { startIndex: number; endIndex: number }) => void

  /**
   * Whether the list can be scrolled
   */
  fixedItemHeight?: boolean
}

/**
 * Virtual Scrolling List Component
 *
 * Efficiently renders large lists by only keeping visible items in the DOM.
 * Use this for lists with 1000+ items to maintain performance.
 */
export function VirtualList<T = unknown>(props: VirtualListProps<T>): React.ReactElement {
  const {
    items,
    itemKey,
    renderItem,
    HeaderComponent,
    FooterComponent,
    EmptyComponent,
    className,
    style,
    itemHeight,
    defaultItemHeight = 50,
    height = '100%',
    endReached,
    overscan = 200,
    isScrolling,
    rangeChanged,
    fixedItemHeight = false,
  } = props

  // Handle end reached callback
  const handleEndReached = () => {
    if (endReached) {
      endReached(items.length)
    }
  }

  // Handle range changed callback
  const handleRangeChanged = (range: { startIndex: number; endIndex: number }) => {
    if (rangeChanged) {
      rangeChanged(range)
    }
  }

  // Handle is scrolling callback
  const handleIsScrolling = (scrolling: boolean) => {
    if (isScrolling) {
      isScrolling(scrolling)
    }
  }

  // Handle item key
  const getItemKey = (index: number, item: T): string => {
    if (typeof itemKey === 'function') {
      return itemKey(item, index)
    }
    return String((item as Record<string, unknown>)[itemKey as keyof T] ?? index)
  }

  // Compute item content
  const itemContent = (index: number, item: T) => {
    return <div data-index={index}>{renderItem(item, index)}</div>
  }

  return (
    <Virtuoso
      style={{ height, ...style }}
      className={cn('virtual-list', className)}
      data={items}
      itemContent={itemContent}
      key={getItemKey}
      components={{
        Header: HeaderComponent,
        Footer: FooterComponent,
        EmptyPlaceholder: EmptyComponent,
      }}
      defaultItemHeight={fixedItemHeight ? itemHeight : defaultItemHeight}
      endReached={handleEndReached}
      increaseViewportBy={typeof overscan === 'number' ? { top: overscan, bottom: overscan } : overscan}
      isScrolling={handleIsScrolling}
      rangeChanged={handleRangeChanged}
      totalCount={items.length}
    />
  )
}

/**
 * Virtual Grid Component
 *
 * Efficiently renders large grids by only keeping visible items in the DOM.
 */
export interface VirtualGridProps<T> {
  /**
   * Array of items to render
   */
  items: T[]

  /**
   * Unique key selector for items
   */
  itemKey: keyof T | ((item: T, index: number) => string)

  /**
   * Render function for each item
   */
  renderItem: (item: T, index: number) => React.ReactNode

  /**
   * Optional render function for item at the beginning of grid
   */
  HeaderComponent?: React.ComponentType

  /**
   * Optional render function for item at the end of grid
   */
  FooterComponent?: React.ComponentType

  /**
   * Optional render function when grid is empty
   */
  EmptyComponent?: React.ComponentType

  /**
   * Optional className for the container
   */
  className?: string

  /**
   * Optional style for the container
   */
  style?: React.CSSProperties

  /**
   * Total height of the grid
   */
  height?: number | string

  /**
   * Number of columns in the grid
   */
  columns: number

  /**
   * Enable end-of-list detection
   */
  endReached?: (index: number) => void

  /**
   * Callback when scrolling starts
   */
  isScrolling?: (isScrolling: boolean) => void
}

export const VirtualGrid = forwardRef<VirtuosoGridHandle, VirtualGridProps<unknown>>((props, ref) => {
  const {
    items,
    itemKey,
    renderItem,
    HeaderComponent,
    FooterComponent,
    EmptyComponent,
    className,
    style,
    height = '100%',
    columns = 3,
    endReached,
    isScrolling,
  } = props

  // Handle end reached callback
  const handleEndReached = () => {
    if (endReached) {
      endReached(items.length)
    }
  }

  // Handle is scrolling callback
  const handleIsScrolling = (scrolling: boolean) => {
    if (isScrolling) {
      isScrolling(scrolling)
    }
  }

  // Handle item key
  const getItemKey = (index: number, item: T): string => {
    if (typeof itemKey === 'function') {
      return itemKey(item, index)
    }
    return String((item as Record<string, unknown>)[itemKey] ?? index)
  }

  // Compute item content
  const itemContent = (index: number, item: T) => {
    return <div data-index={index}>{renderItem(item, index)}</div>
  }

  return (
    <VirtuosoGrid
      ref={ref}
      style={{ height, ...style }}
      className={cn('virtual-grid', className)}
      data={items}
      itemContent={itemContent}
      key={getItemKey}
      components={{
        Header: HeaderComponent,
        Footer: FooterComponent,
        EmptyPlaceholder: EmptyComponent,
      }}
      endReached={handleEndReached}
      isScrolling={handleIsScrolling}
      totalCount={items.length}
      listClassName="grid-content"
      gridItemsComputedClassName="grid-item"
      gridItemsContainerClassName="grid-items-container"
      computeItemKey={getItemKey}
      columns={columns}
    />
  )
})

VirtualGrid.displayName = 'VirtualGrid'

/**
 * Utility hook to create a stable key selector
 */
export function useItemKey<T extends Record<string, unknown>>(key: keyof T): (item: T) => string {
  return (item) => {
    const keyValue = item[key]
    if (keyValue === undefined || keyValue === null) {
      return JSON.stringify(item)
    }
    return String(keyValue)
  }
}
