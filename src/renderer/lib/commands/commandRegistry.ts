/**
 * Command Registry Service
 *
 * Central registry for all application commands that can be executed via the command palette.
 * Provides command registration, categorization, search, and execution capabilities.
 *
 * Features:
 * - Register/unregister commands with metadata
 * - Organize commands by category
 * - Fuzzy search by label and keywords
 * - Execute commands by ID
 * - Event-based notifications for UI updates
 *
 * @module commands/commandRegistry
 */

import type {
  Command,
  CommandEntry,
  CommandCategory,
  CommandFilter,
  CommandRegistryStats,
  CommandRegistryEventListener,
  CommandRegistryEvent,
  CommandSearchResult,
  RegisterCommandOptions,
} from './types'

/**
 * Default priority for commands
 */
const DEFAULT_PRIORITY = 100

/**
 * Minimum score for search results to be included
 */
const MIN_SEARCH_SCORE = 0.1

/**
 * CommandRegistry class for managing application commands
 */
export class CommandRegistry {
  private commands: Map<string, CommandEntry> = new Map()
  private listeners: Set<CommandRegistryEventListener> = new Set()

  /**
   * Register a new command
   *
   * @param command - The command to register
   * @param options - Registration options
   * @throws Error if command with same ID exists and overwrite is false
   */
  register(command: Command, options: RegisterCommandOptions = {}): void {
    const { overwrite = false } = options

    if (this.commands.has(command.id) && !overwrite) {
      throw new Error(`Command with ID "${command.id}" is already registered. Use overwrite: true to replace.`)
    }

    const entry: CommandEntry = {
      ...command,
      priority: command.priority ?? DEFAULT_PRIORITY,
      registeredAt: Date.now(),
    }

    this.commands.set(command.id, entry)
    this.emit({
      type: 'command-registered',
      command: entry,
      commandId: command.id,
      timestamp: Date.now(),
    })
  }

  /**
   * Unregister a command by ID
   *
   * @param id - The command ID to unregister
   * @returns true if command was removed, false if not found
   */
  unregister(id: string): boolean {
    const command = this.commands.get(id)
    if (!command) {
      return false
    }

    this.commands.delete(id)
    this.emit({
      type: 'command-unregistered',
      command,
      commandId: id,
      timestamp: Date.now(),
    })

    return true
  }

  /**
   * Get a command by ID
   *
   * @param id - The command ID
   * @returns The command or undefined if not found
   */
  getCommand(id: string): Command | undefined {
    return this.commands.get(id)
  }

  /**
   * Get all registered commands
   *
   * @param filter - Optional filter criteria
   * @returns Array of commands
   */
  getCommands(filter?: CommandFilter): Command[] {
    let commands = Array.from(this.commands.values())

    if (filter) {
      if (filter.categories && filter.categories.length > 0) {
        commands = commands.filter((cmd) => filter.categories!.includes(cmd.category))
      }

      if (filter.enabledOnly) {
        commands = commands.filter((cmd) => this.isCommandEnabled(cmd))
      }
    }

    return commands.sort((a, b) => {
      // Sort by category first, then by priority
      const categoryOrder = this.getCategoryOrder()
      const categoryDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
      if (categoryDiff !== 0) return categoryDiff
      return (a.priority ?? DEFAULT_PRIORITY) - (b.priority ?? DEFAULT_PRIORITY)
    })
  }

  /**
   * Get all commands in a specific category
   *
   * @param category - The category to filter by
   * @returns Array of commands in the category
   */
  getCommandsByCategory(category: CommandCategory): Command[] {
    return this.getCommands({ categories: [category] })
  }

  /**
   * Get all unique categories that have commands
   *
   * @returns Array of categories with commands
   */
  getCategories(): CommandCategory[] {
    const categories = new Set<CommandCategory>()
    for (const command of this.commands.values()) {
      categories.add(command.category)
    }
    return Array.from(categories).sort((a, b) => {
      return this.getCategoryOrder().indexOf(a) - this.getCategoryOrder().indexOf(b)
    })
  }

  /**
   * Search commands by query string
   * Performs fuzzy matching on label and keywords
   *
   * @param query - The search query
   * @param filter - Optional filter criteria
   * @returns Array of search results sorted by relevance
   */
  search(query: string, filter?: CommandFilter): CommandSearchResult[] {
    if (!query.trim()) {
      // Return all commands if no query
      return this.getCommands(filter).map((command) => ({
        command,
        score: 1,
        matchedTerms: [],
      }))
    }

    const normalizedQuery = this.normalizeString(query)
    const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean)
    const results: CommandSearchResult[] = []

    for (const command of this.commands.values()) {
      // Apply filter
      if (filter) {
        if (filter.categories && filter.categories.length > 0) {
          if (!filter.categories.includes(command.category)) continue
        }
        if (filter.enabledOnly && !this.isCommandEnabled(command)) {
          continue
        }
      }

      const result = this.scoreCommand(command, queryTerms, normalizedQuery)
      if (result.score >= MIN_SEARCH_SCORE) {
        results.push(result)
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score)
  }

  /**
   * Execute a command by ID
   *
   * @param id - The command ID to execute
   * @throws Error if command not found or disabled
   */
  async execute(id: string): Promise<void> {
    const command = this.commands.get(id)

    if (!command) {
      const error = `Command "${id}" not found`
      this.emit({
        type: 'command-error',
        commandId: id,
        error,
        timestamp: Date.now(),
      })
      throw new Error(error)
    }

    if (!this.isCommandEnabled(command)) {
      const error = `Command "${id}" is disabled`
      this.emit({
        type: 'command-error',
        command: command,
        commandId: id,
        error,
        timestamp: Date.now(),
      })
      throw new Error(error)
    }

    try {
      await command.action()
      this.emit({
        type: 'command-executed',
        command,
        commandId: id,
        timestamp: Date.now(),
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      this.emit({
        type: 'command-error',
        command,
        commandId: id,
        error,
        timestamp: Date.now(),
      })
      throw err
    }
  }

  /**
   * Check if a command is currently enabled
   *
   * @param command - The command to check
   * @returns true if enabled, false otherwise
   */
  private isCommandEnabled(command: Command): boolean {
    if (command.enabled === undefined) return true
    if (typeof command.enabled === 'function') return command.enabled()
    return command.enabled
  }

  /**
   * Score a command against search terms
   */
  private scoreCommand(command: Command, queryTerms: string[], normalizedQuery: string): CommandSearchResult {
    const normalizedLabel = this.normalizeString(command.label)
    const normalizedKeywords = (command.keywords ?? []).map((k) => this.normalizeString(k))
    const normalizedCategory = this.normalizeString(command.category)

    let score = 0
    const matchedTerms: string[] = []

    // Check for exact label match (highest score)
    if (normalizedLabel === normalizedQuery) {
      score += 1.0
      matchedTerms.push('label:exact')
    }
    // Check for label starts with query
    else if (normalizedLabel.startsWith(normalizedQuery)) {
      score += 0.8
      matchedTerms.push('label:prefix')
    }
    // Check for label contains query
    else if (normalizedLabel.includes(normalizedQuery)) {
      score += 0.6
      matchedTerms.push('label:contains')
    }

    // Score individual terms
    for (const term of queryTerms) {
      // Label term match
      if (normalizedLabel.includes(term)) {
        score += 0.3
        matchedTerms.push(`label:${term}`)
      }

      // Keyword match
      for (const keyword of normalizedKeywords) {
        if (keyword.includes(term)) {
          score += 0.2
          matchedTerms.push(`keyword:${keyword}`)
        }
      }

      // Category match
      if (normalizedCategory.includes(term)) {
        score += 0.1
        matchedTerms.push(`category:${term}`)
      }
    }

    // Bonus for shorter labels (more specific)
    const lengthBonus = Math.max(0, (50 - normalizedLabel.length) / 100)
    score += lengthBonus * 0.1

    // Normalize score to 0-1 range
    const normalizedScore = Math.min(1, score / queryTerms.length)

    return {
      command,
      score: normalizedScore,
      matchedTerms,
    }
  }

  /**
   * Normalize a string for comparison
   */
  private normalizeString(str: string): string {
    return str.toLowerCase().trim().replace(/[-_]/g, ' ')
  }

  /**
   * Get the sort order for categories
   */
  private getCategoryOrder(): CommandCategory[] {
    return ['navigation', 'actions', 'view', 'edit', 'settings', 'help']
  }

  /**
   * Get statistics about the registry
   */
  getStats(): CommandRegistryStats {
    const byCategory: Record<CommandCategory, number> = {
      navigation: 0,
      actions: 0,
      view: 0,
      edit: 0,
      settings: 0,
      help: 0,
    }

    let withShortcuts = 0
    let enabledCommands = 0

    for (const command of this.commands.values()) {
      byCategory[command.category]++
      if (command.shortcut) withShortcuts++
      if (this.isCommandEnabled(command)) enabledCommands++
    }

    return {
      totalCommands: this.commands.size,
      byCategory,
      withShortcuts,
      enabledCommands,
    }
  }

  /**
   * Add an event listener
   *
   * @param listener - The listener function
   * @returns Cleanup function to remove the listener
   */
  addEventListener(listener: CommandRegistryEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Remove an event listener
   *
   * @param listener - The listener function to remove
   */
  removeEventListener(listener: CommandRegistryEventListener): void {
    this.listeners.delete(listener)
  }

  /**
   * Emit an event to all listeners
   */
  private emit(event: CommandRegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error('[CommandRegistry] Error in event listener:', error)
      }
    }
  }

  /**
   * Clear all registered commands
   */
  clear(): void {
    const commandIds = Array.from(this.commands.keys())
    for (const id of commandIds) {
      this.unregister(id)
    }
  }

  /**
   * Check if a command with the given ID exists
   *
   * @param id - The command ID
   * @returns true if command exists
   */
  has(id: string): boolean {
    return this.commands.has(id)
  }
}

/**
 * Singleton instance of the command registry
 */
let defaultInstance: CommandRegistry | null = null

/**
 * Get the default CommandRegistry instance
 *
 * @returns The default CommandRegistry instance
 */
export function getCommandRegistry(): CommandRegistry {
  if (!defaultInstance) {
    defaultInstance = new CommandRegistry()
  }
  return defaultInstance
}

/**
 * Reset the default instance (useful for testing)
 */
export function resetCommandRegistry(): void {
  if (defaultInstance) {
    defaultInstance.clear()
    defaultInstance = null
  }
}

/**
 * Convenience function to register a command
 *
 * @param command - The command to register
 * @param options - Registration options
 */
export function registerCommand(command: Command, options?: RegisterCommandOptions): void {
  getCommandRegistry().register(command, options)
}

/**
 * Convenience function to unregister a command
 *
 * @param id - The command ID to unregister
 */
export function unregisterCommand(id: string): boolean {
  return getCommandRegistry().unregister(id)
}

/**
 * Convenience function to execute a command
 *
 * @param id - The command ID to execute
 */
export async function executeCommand(id: string): Promise<void> {
  return getCommandRegistry().execute(id)
}

/**
 * Convenience function to search commands
 *
 * @param query - The search query
 * @param filter - Optional filter
 */
export function searchCommands(query: string, filter?: CommandFilter): CommandSearchResult[] {
  return getCommandRegistry().search(query, filter)
}

export default CommandRegistry
