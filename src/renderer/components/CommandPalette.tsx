/**
 * CommandPalette Component
 *
 * Global command palette for keyboard-first navigation.
 * Opens with Ctrl+Shift+P (or Cmd+Shift+P on Mac).
 *
 * @module components/CommandPalette
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Search, Navigation, Settings, HelpCircle, FileText, Eye, Edit, type LucideIcon } from 'lucide-react'
import { searchCommands } from '@/lib/commands'
import type { Command, CommandCategory, CommandSearchResult } from '@/lib/commands/types'

// Icon mapping for categories
const categoryIcons: Record<CommandCategory, LucideIcon> = {
  navigation: Navigation,
  actions: FileText,
  settings: Settings,
  help: HelpCircle,
  view: Eye,
  edit: Edit,
}

// Category labels
const categoryLabels: Record<CommandCategory, string> = {
  navigation: 'Navigation',
  actions: 'Actions',
  settings: 'Settings',
  help: 'Help',
  view: 'View',
  edit: 'Edit',
}

interface CommandPaletteProps {
  /** Whether the palette is open */
  open: boolean
  /** Callback when palette should close */
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Search results
  const results = useMemo(() => {
    return searchCommands(query, { enabledOnly: true })
  }, [query])

  // Group results by category
  const groupedResults = useMemo(() => {
    const groups: Record<string, CommandSearchResult[]> = {}

    for (const result of results) {
      const category = result.command.category
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(result)
    }

    return groups
  }, [results])

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => results.map((r) => r.command), [results])

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      // Focus input after animation
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && flatResults.length > 0) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, flatResults.length])

  // Execute command
  const executeCommand = useCallback(
    async (command: Command) => {
      onOpenChange(false)
      try {
        await command.action()
      } catch (error) {
        console.error('[CommandPalette] Error executing command:', error)
      }
    },
    [onOpenChange],
  )

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, flatResults.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flatResults[selectedIndex]) {
            executeCommand(flatResults[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          onOpenChange(false)
          break
      }
    },
    [flatResults, selectedIndex, executeCommand, onOpenChange],
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-xl">
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search commands..."
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="command-results-list"
            aria-activedescendant={selectedIndex >= 0 ? `cmd-result-${selectedIndex}` : undefined}
            aria-label="Search commands"
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 flex-1 h-12"
          />
          <Badge variant="outline" className="text-xs">
            ESC
          </Badge>
        </div>

        <ScrollArea
          ref={listRef}
          className="max-h-80"
          id="command-results-list"
          role="listbox"
          aria-label="Command search results"
        >
          {results.length === 0 ? (
            <div role="status" className="py-6 text-center text-sm text-muted-foreground">
              No commands found for "{query}"
            </div>
          ) : (
            <div className="py-2">
              {Object.entries(groupedResults).map(([category, commands]) => (
                <div key={category}>
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {categoryLabels[category as CommandCategory] || category}
                  </div>
                  {commands.map((result) => {
                    const command = result.command
                    const globalIndex = flatResults.indexOf(command)
                    const isSelected = globalIndex === selectedIndex
                    const CategoryIcon = categoryIcons[command.category]

                    return (
                      <div
                        key={command.id}
                        id={`cmd-result-${globalIndex}`}
                        data-index={globalIndex}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => executeCommand(command)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 cursor-pointer',
                          'transition-colors duration-75',
                          isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                        )}
                      >
                        <div className="flex items-center justify-center w-6 h-6">
                          {CategoryIcon && <CategoryIcon className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <span className="flex-1 truncate">{command.label}</span>
                        {command.shortcut && (
                          <Badge variant="secondary" className="text-xs font-mono">
                            {command.shortcut}
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="border-t px-3 py-2 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded">↑↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded">↵</kbd>
            Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-muted rounded">esc</kbd>
            Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Hook to control the command palette
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  const openPalette = useCallback(() => setOpen(true), [])
  const closePalette = useCallback(() => setOpen(false), [])
  const togglePalette = useCallback(() => setOpen((prev) => !prev), [])

  return {
    open,
    setOpen,
    openPalette,
    closePalette,
    togglePalette,
  }
}

/**
 * Global keyboard shortcut handler for command palette
 */
export function CommandPaletteTrigger({ onTrigger }: { onTrigger: () => void }) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+Shift+P (Windows/Linux) or Cmd+Shift+P (Mac)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault()
        onTrigger()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onTrigger])

  return null
}
