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

/**
 * Every command's action, and what invoking it must actually do.
 *
 * Registering a command is not evidence that it works. The palette's entire value is that
 * the label matches the effect, and a wrong route or a misspelled event name is invisible
 * until a user clicks the entry — nothing else in the app listens loudly enough to notice.
 * Two of these were shipping placeholder GitHub URLs (`yourusername/vuln-asses-tool`)
 * precisely because no test had ever invoked them.
 */

/** Commands that must route somewhere. */
const NAVIGATION_COMMANDS = [
  { id: 'navigation.dashboard', path: '/dashboard' },
  { id: 'navigation.executive', path: '/executive' },
  { id: 'navigation.search', path: '/search' },
  { id: 'navigation.settings', path: '/settings' },
]

/** Commands whose only effect is a window CustomEvent the UI listens for. */
const EVENT_COMMANDS = [
  { id: 'actions.new-project', event: 'menu-open-create-project' },
  { id: 'actions.import-sbom', event: 'menu-open-upload-sbom' },
  { id: 'actions.generate-sbom', event: 'menu-open-sbom-generator' },
  { id: 'actions.export-all', event: 'menu-open-export' },
  { id: 'actions.scan-all', event: 'scan-all-projects' },
  { id: 'view.command-palette', event: 'menu-open-command-palette' },
  { id: 'help.show-tour', event: 'menu-show-tour' },
  { id: 'help.about', event: 'menu-about' },
]

/** Commands that open an external page. */
const LINK_COMMANDS = [
  { id: 'help.documentation', url: 'https://github.com/xarlord/VulnAssesTool#readme' },
  { id: 'help.report-issue', url: 'https://github.com/xarlord/VulnAssesTool/issues' },
]

describe('registerAppCommands actions', () => {
  let navigate: ReturnType<typeof vi.fn>
  let toggleSidebar: ReturnType<typeof vi.fn>

  beforeEach(() => {
    navigate = vi.fn()
    toggleSidebar = vi.fn()
    registerAppCommands(navigate, toggleSidebar)
  })

  afterEach(() => {
    unregisterAppCommands()
    vi.restoreAllMocks()
  })

  it.each(NAVIGATION_COMMANDS)('$id navigates to $path', ({ id, path }) => {
    getCommandRegistry().getCommand(id)?.action()

    expect(navigate).toHaveBeenCalledWith(path)
  })

  it.each(EVENT_COMMANDS)('$id dispatches $event', ({ id, event }) => {
    const listener = vi.fn()
    window.addEventListener(event, listener)

    try {
      getCommandRegistry().getCommand(id)?.action()
      expect(listener).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(event, listener)
    }
  })

  it.each(LINK_COMMANDS)('$id opens $url in a new tab', ({ id, url }) => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)

    getCommandRegistry().getCommand(id)?.action()

    expect(open).toHaveBeenCalledWith(url, '_blank')
  })

  it('view.toggle-sidebar calls the toggle callback it was registered with', () => {
    getCommandRegistry().getCommand('view.toggle-sidebar')?.action()

    expect(toggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('leaves no registered command without an asserted effect', () => {
    // Guards the tables above: adding a command to registerCommands.ts without adding it
    // here would otherwise silently reintroduce an action nothing ever invokes.
    const asserted = new Set([
      ...NAVIGATION_COMMANDS.map((c) => c.id),
      ...EVENT_COMMANDS.map((c) => c.id),
      ...LINK_COMMANDS.map((c) => c.id),
      'view.toggle-sidebar',
    ])
    const registered = getCommandRegistry()
      .getCommands()
      .map((command) => command.id)

    expect(registered.length).toBeGreaterThan(0)
    expect(registered.filter((id) => !asserted.has(id))).toEqual([])
  })
})
