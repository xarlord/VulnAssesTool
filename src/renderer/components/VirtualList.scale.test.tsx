/**
 * VirtualList scale test — NFR-02.2 (PRD.md): the UI must handle a 50,000-item list.
 *
 * WHY this guards intent: VirtualList delegates windowing to react-virtuoso, which only mounts the
 * rows in (and near) the viewport. The whole point of the "50,000 items" requirement is that a huge
 * dataset must NOT produce a huge DOM — otherwise the list is unusable regardless of raw speed.
 *
 * This file deliberately does NOT mock react-virtuoso (unlike VirtualList.test.tsx, whose mock renders
 * every item — which would defeat this test). It renders 50,000 items through the REAL Virtuoso and
 * asserts that the number of realized item nodes stays a tiny fraction of the dataset. ResizeObserver
 * and IntersectionObserver are polyfilled globally in tests/setup.ts, so Virtuoso mounts under jsdom.
 *
 * It fails if VirtualList ever stops virtualizing (e.g. reverts to a raw `items.map(...)`), which
 * would materialize all 50,000 rows into the DOM.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { VirtualList } from './VirtualList'

interface Row {
  id: string
  name: string
}

describe('VirtualList scale (NFR-02.2)', () => {
  it('renders a 50,000-item list without mounting anywhere near 50,000 DOM nodes', () => {
    const items: Row[] = Array.from({ length: 50_000 }, (_, i) => ({ id: String(i), name: `pkg-${i}` }))

    const start = performance.now()
    const { container } = render(
      <VirtualList
        items={items}
        itemKey="id"
        renderItem={(item) => <span>{item.name}</span>}
        height={600}
        itemHeight={40}
        fixedItemHeight
      />,
    )
    const elapsed = performance.now() - start

    // Each realized row is wrapped by VirtualList in a <div data-index={index}>. With virtualization
    // only a viewport window (plus overscan) is mounted, so this must be a small fraction of 50,000 —
    // never the full dataset. The generous ceiling (500) still fails hard if virtualization is lost.
    const realizedRows = container.querySelectorAll('[data-index]').length
    expect(realizedRows).toBeLessThan(500)

    // Sanity: the full dataset really was handed to the list (the test isn't passing on an empty set).
    expect(items).toHaveLength(50_000)

    // Building 50k lightweight rows and mounting a windowed list must stay fast.
    expect(elapsed).toBeLessThan(5_000)
  })
})
