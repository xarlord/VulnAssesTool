/**
 * Commands Module
 *
 * Provides command registry functionality for the command palette system.
 * Enables registration, categorization, search, and execution of app commands.
 *
 * @module commands
 */

// Types
export type {
  Command,
  CommandEntry,
  CommandCategory,
  CommandFilter,
  CommandRegistryStats,
  CommandRegistryEventType,
  CommandRegistryEvent,
  CommandRegistryEventListener,
  CommandSearchResult,
  RegisterCommandOptions,
} from './types'

// Main exports
export {
  CommandRegistry,
  getCommandRegistry,
  resetCommandRegistry,
  registerCommand,
  unregisterCommand,
  executeCommand,
  searchCommands,
} from './commandRegistry'

// Command registration
export { registerAppCommands, unregisterAppCommands } from './registerCommands'

// Default export
export { default } from './commandRegistry'
