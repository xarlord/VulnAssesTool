import React, { useState } from 'react'
import { Bookmark, Save, X } from 'lucide-react'
import type { SavedSearch } from '@/lib/search/savedSearches'

interface SavedSearchesProps {
  searches: SavedSearch[]
  /** The query currently in the search box; the "Save" control is disabled when it is blank. */
  currentQuery: string
  onSave: (name: string) => void
  onLoad: (query: string) => void
  onDelete: (id: string) => void
  className?: string
}

/**
 * Compact saved-query bar for the global search (FR-08.1: "Save search queries").
 * Presentational — persistence lives in lib/search/savedSearches; the parent owns state.
 */
export function SavedSearches({
  searches,
  currentQuery,
  onSave,
  onLoad,
  onDelete,
  className = '',
}: SavedSearchesProps) {
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [name, setName] = useState('')

  const canSave = currentQuery.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !canSave) return
    onSave(name.trim())
    setName('')
    setShowSaveForm(false)
  }

  if (searches.length === 0 && !canSave) {
    // Nothing saved and nothing to save yet — keep the search UI uncluttered.
    return null
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Bookmark className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Saved searches</span>
        <button
          type="button"
          onClick={() => setShowSaveForm((open) => !open)}
          disabled={!canSave}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Save current
        </button>
      </div>

      {showSaveForm && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            aria-label="Saved search name"
            placeholder="Name this search..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            autoFocus
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSaveForm(false)
              setName('')
            }}
            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/80"
          >
            Cancel
          </button>
        </form>
      )}

      {searches.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {searches.map((search) => (
            <div
              key={search.id}
              className="group flex items-center gap-1 rounded-full border border-border bg-card py-1 pl-3 pr-1 text-sm hover:bg-muted/50"
            >
              <button type="button" onClick={() => onLoad(search.query)} className="max-w-[16rem] truncate text-left">
                {search.name}
              </button>
              <button
                type="button"
                onClick={() => onDelete(search.id)}
                aria-label={`Delete saved search ${search.name}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
