/**
 * Unit test for NFR-04.4 — command-palette shortcut labels must be honest.
 *
 * The palette advertised direct shortcuts (Ctrl+Shift+D, Ctrl+N, Ctrl+I, Ctrl+E,
 * Ctrl+, F1) for commands with NO matching global keydown listener — pressing them
 * did nothing, so the label was a UX lie. Every action stays reachable via Ctrl+K,
 * so the fix is to drop the misleading labels rather than add browser-hostile
 * bindings (Ctrl+N / F1 aren't reliably interceptable anyway).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { registerAppCommands, unregisterAppCommands } from './registerCommands'
import { getCommandRegistry } from './commandRegistry'

// Commands whose advertised shortcut had no global binding — must claim none.
const UNBOUND_COMMAND_IDS = [
  'navigation.dashboard',
  'navigation.settings',
  'actions.new-project',
  'actions.import-sbom',
  'actions.export-all',
  'help.show-tour',
]

// Shortcuts that ARE globally bound and must keep their label.
const BOUND_COMMANDS = [
  { id: 'view.toggle-sidebar', shortcut: 'Ctrl+Shift+S' }, // AppShell global listener
  { id: 'view.command-palette', shortcut: 'Ctrl+Shift+P' }, // CommandPalette global listener
]

describe('registerAppCommands shortcut labels (NFR-04.4)', () => {
  beforeEach(() => {
    registerAppCommands(vi.fn(), vi.fn())
  })

  afterEach(() => {
    unregisterAppCommands()
  })

  it('does not advertise a shortcut for commands with no global binding', () => {
    const registry = getCommandRegistry()
    for (const id of UNBOUND_COMMAND_IDS) {
      const command = registry.getCommand(id)
      expect(command, `command ${id} should be registered`).toBeDefined()
      expect(command?.shortcut, `${id} must not advertise an unbound shortcut`).toBeUndefined()
    }
  })

  it('keeps the shortcut label for the two genuinely-bound commands', () => {
    // Guards the other direction: the fix must not strip a real, working binding.
    const registry = getCommandRegistry()
    for (const { id, shortcut } of BOUND_COMMANDS) {
      expect(registry.getCommand(id)?.shortcut).toBe(shortcut)
    }
  })
})
