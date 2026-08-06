/**
 * Saved search queries (FR-08.1: "Save search queries").
 *
 * Persisted in localStorage; renderer-only, never sent to the server. Mirrors the
 * localStorage-lib pattern used by settings profiles (load/guard/persist with
 * console.error on failure), so a corrupt entry degrades to an empty list rather
 * than throwing at the UI.
 */

const SAVED_SEARCHES_KEY = 'vuln-assess-saved-searches'

export interface SavedSearch {
  id: string
  name: string
  query: string
  createdAt: string // ISO string — localStorage cannot round-trip a Date
}

function generateId(): string {
  return `search-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

function isSavedSearch(value: unknown): value is SavedSearch {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.query === 'string' &&
    typeof candidate.createdAt === 'string'
  )
}

/** Load all saved searches, dropping any malformed entries. Never throws. */
export function getSavedSearches(): SavedSearch[] {
  try {
    const stored = localStorage.getItem(SAVED_SEARCHES_KEY)
    if (!stored) return []
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSavedSearch)
  } catch (error) {
    console.error('Failed to load saved searches:', error)
    return []
  }
}

function persist(searches: SavedSearch[]): void {
  try {
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches))
  } catch (error) {
    console.error('Failed to save searches:', error)
  }
}

/**
 * Save a named query and return the updated list. Empty name or query throws (fail loud —
 * the caller's button is disabled for empty input, but the lib refuses bad data regardless).
 * Re-saving under an existing name (case-insensitive) overwrites that entry's query in place,
 * so the list never accumulates duplicate names.
 */
export function saveSearch(name: string, query: string): SavedSearch[] {
  const trimmedName = name.trim()
  const trimmedQuery = query.trim()
  if (!trimmedName) throw new Error('Search name is required')
  if (!trimmedQuery) throw new Error('Search query is required')

  const searches = getSavedSearches()
  const existing = searches.find((s) => s.name.toLowerCase() === trimmedName.toLowerCase())

  const next = existing
    ? searches.map((s) => (s.id === existing.id ? { ...s, query: trimmedQuery } : s))
    : [...searches, { id: generateId(), name: trimmedName, query: trimmedQuery, createdAt: new Date().toISOString() }]

  persist(next)
  return next
}

/** Delete a saved search by id and return the updated list. */
export function deleteSavedSearch(id: string): SavedSearch[] {
  const next = getSavedSearches().filter((s) => s.id !== id)
  persist(next)
  return next
}
