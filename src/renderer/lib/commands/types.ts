/**
 * Command Registry Types
 *
 * Type definitions for the command palette system.
 * Supports registration, categorization, and execution of app commands.
 *
 * @module commands/types
 */

/**
 * Available command categories for organizing commands in the palette
 */
export type CommandCategory = 'navigation' | 'actions' | 'settings' | 'help' | 'view' | 'edit'

/**
 * Represents a single command that can be executed via the command palette
 */
export interface Command {
  /** Unique identifier for the command (e.g., 'navigation.go-to-dashboard') */
  id: string
  /** Human-readable label displayed in the command palette */
  label: string
  /** Category for grouping commands */
  category: CommandCategory
  /** Optional keyboard shortcut (e.g., 'Ctrl+K', 'Cmd+Shift+P') */
  shortcut?: string
  /** Optional icon name or identifier */
  icon?: string
  /** Handler function to execute when command is triggered */
  action: () => void | Promise<void>
  /** Optional keywords for improved search matching */
  keywords?: string[]
  /** Optional description for tooltip or help text */
  description?: string
  /** Whether the command is currently enabled */
  enabled?: boolean | (() => boolean)
  /** Sort order within category (lower = higher priority) */
  priority?: number
}

/**
 * Internal command entry with metadata
 */
export interface CommandEntry extends Command {
  /** Timestamp when the command was registered */
  registeredAt: number
}

/**
 * Options for registering a command
 */
export interface RegisterCommandOptions {
  /** Overwrite existing command with same ID */
  overwrite?: boolean
}

/**
 * Result of a command search
 */
export interface CommandSearchResult {
  /** The matching command */
  command: Command
  /** Search match score (0-1, higher is better) */
  score: number
  /** Matched terms */
  matchedTerms: string[]
}

/**
 * Filter options for querying commands
 */
export interface CommandFilter {
  /** Filter by categories */
  categories?: CommandCategory[]
  /** Filter by enabled status */
  enabledOnly?: boolean
}

/**
 * Statistics about the command registry
 */
export interface CommandRegistryStats {
  /** Total number of registered commands */
  totalCommands: number
  /** Number of commands by category */
  byCategory: Record<CommandCategory, number>
  /** Number of commands with shortcuts */
  withShortcuts: number
  /** Number of currently enabled commands */
  enabledCommands: number
}

/**
 * Event types emitted by the command registry
 */
export type CommandRegistryEventType =
  | 'command-registered'
  | 'command-unregistered'
  | 'command-executed'
  | 'command-error'

/**
 * Event data for command registry events
 */
export interface CommandRegistryEvent {
  type: CommandRegistryEventType
  /** The command involved in the event */
  command?: Command
  /** The command ID */
  commandId?: string
  /** Error message (for command-error events) */
  error?: string
  /** Timestamp of the event */
  timestamp: number
}

/**
 * Event listener callback type
 */
export type CommandRegistryEventListener = (event: CommandRegistryEvent) => void
