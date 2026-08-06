import { describe, it, expect, beforeEach } from 'vitest'
import { getSavedSearches, saveSearch, deleteSavedSearch } from './savedSearches'

// FR-08.1's "Save search queries". These tests pin the contract the Search UI relies on:
// persistence round-trips, re-saving a name updates in place (no duplicate names), empty
// input is refused, and a corrupt localStorage value degrades to an empty list instead of
// throwing into the render.
const STORAGE_KEY = 'vuln-assess-saved-searches'

describe('savedSearches', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns an empty list when nothing is stored', () => {
    expect(getSavedSearches()).toEqual([])
  })

  it('saves a query and reads it back', () => {
    saveSearch('Critical KEV', 'critical AND kev')
    const searches = getSavedSearches()
    expect(searches).toHaveLength(1)
    expect(searches[0]).toMatchObject({ name: 'Critical KEV', query: 'critical AND kev' })
    expect(searches[0].id).toBeTruthy()
    expect(searches[0].createdAt).toBeTruthy()
  })

  it('overwrites the query when re-saving an existing name (case-insensitive), not duplicating', () => {
    saveSearch('My Search', 'react')
    const afterUpdate = saveSearch('MY SEARCH', 'react OR express')
    expect(afterUpdate).toHaveLength(1) // same name -> updated in place, not appended
    expect(afterUpdate[0].query).toBe('react OR express')
  })

  it('keeps distinct names as separate entries', () => {
    saveSearch('A', 'foo')
    const searches = saveSearch('B', 'bar')
    expect(searches.map((s) => s.name).sort()).toEqual(['A', 'B'])
  })

  it('rejects an empty name or query (fail loud)', () => {
    expect(() => saveSearch('   ', 'react')).toThrow(/name is required/i)
    expect(() => saveSearch('name', '   ')).toThrow(/query is required/i)
  })

  it('deletes by id and leaves the rest intact', () => {
    saveSearch('Keep', 'foo')
    const [, target] = saveSearch('Drop', 'bar')
    const remaining = deleteSavedSearch(target.id)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('Keep')
  })

  it('degrades to an empty list when storage is corrupt (does not throw)', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json{')
    expect(getSavedSearches()).toEqual([])
  })

  it('drops malformed entries but keeps well-formed ones', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { id: '1', name: 'ok', query: 'q', createdAt: 'now' },
        { id: 2, name: 'bad' },
      ]),
    )
    const searches = getSavedSearches()
    expect(searches).toHaveLength(1)
    expect(searches[0].name).toBe('ok')
  })
})
