/**
 * CommandRegistry Service Tests
 *
 * Comprehensive tests for the command registry service.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CommandRegistry,
  getCommandRegistry,
  resetCommandRegistry,
  registerCommand,
  unregisterCommand,
  executeCommand,
  searchCommands,
} from './commandRegistry'
import type { Command, CommandRegistryEventListener } from './types'

describe('CommandRegistry', () => {
  let registry: CommandRegistry

  beforeEach(() => {
    registry = new CommandRegistry()
  })

  afterEach(() => {
    registry.clear()
  })

  describe('register', () => {
    it('should register a command successfully', () => {
      const command: Command = {
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      }

      registry.register(command)

      expect(registry.has('test.command')).toBe(true)
      expect(registry.getCommand('test.command')).toBeDefined()
    })

    it('should throw error when registering duplicate ID without overwrite', () => {
      const command: Command = {
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      }

      registry.register(command)

      expect(() => registry.register(command)).toThrow('Command with ID "test.command" is already registered')
    })

    it('should allow overwriting existing command with overwrite option', () => {
      const command1: Command = {
        id: 'test.command',
        label: 'Test Command 1',
        category: 'actions',
        action: vi.fn(),
      }

      const command2: Command = {
        id: 'test.command',
        label: 'Test Command 2',
        category: 'navigation',
        action: vi.fn(),
      }

      registry.register(command1)
      registry.register(command2, { overwrite: true })

      const registered = registry.getCommand('test.command')
      expect(registered?.label).toBe('Test Command 2')
      expect(registered?.category).toBe('navigation')
    })

    it('should emit command-registered event', () => {
      const listener = vi.fn() as CommandRegistryEventListener
      registry.addEventListener(listener)

      const command: Command = {
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      }

      registry.register(command)

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'command-registered',
          commandId: 'test.command',
        }),
      )
    })
  })

  describe('unregister', () => {
    it('should unregister a command successfully', () => {
      const command: Command = {
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      }

      registry.register(command)
      expect(registry.unregister('test.command')).toBe(true)
      expect(registry.has('test.command')).toBe(false)
    })

    it('should return false when unregistering non-existent command', () => {
      expect(registry.unregister('nonexistent')).toBe(false)
    })

    it('should emit command-unregistered event', () => {
      const listener = vi.fn() as CommandRegistryEventListener
      registry.addEventListener(listener)

      const command: Command = {
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      }

      registry.register(command)
      registry.unregister('test.command')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'command-unregistered',
          commandId: 'test.command',
        }),
      )
    })
  })

  describe('getCommand', () => {
    it('should return command by ID', () => {
      const command: Command = {
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      }

      registry.register(command)
      const result = registry.getCommand('test.command')

      expect(result).toBeDefined()
      expect(result?.label).toBe('Test Command')
    })

    it('should return undefined for non-existent command', () => {
      expect(registry.getCommand('nonexistent')).toBeUndefined()
    })
  })

  describe('getCommands', () => {
    beforeEach(() => {
      const commands: Command[] = [
        { id: 'nav.home', label: 'Go Home', category: 'navigation', action: vi.fn(), priority: 1 },
        { id: 'nav.settings', label: 'Settings', category: 'navigation', action: vi.fn(), priority: 2 },
        { id: 'action.delete', label: 'Delete', category: 'actions', action: vi.fn() },
        { id: 'settings.theme', label: 'Change Theme', category: 'settings', action: vi.fn() },
      ]

      commands.forEach((cmd) => registry.register(cmd))
    })

    it('should return all commands sorted by category and priority', () => {
      const commands = registry.getCommands()

      expect(commands).toHaveLength(4)
      // Navigation should come first
      expect(commands[0].category).toBe('navigation')
      expect(commands[0].id).toBe('nav.home') // Lower priority first
    })

    it('should filter by categories', () => {
      const commands = registry.getCommands({ categories: ['navigation'] })

      expect(commands).toHaveLength(2)
      commands.forEach((cmd) => expect(cmd.category).toBe('navigation'))
    })

    it('should filter by enabled status', () => {
      // Register a disabled command
      registry.register({
        id: 'disabled.cmd',
        label: 'Disabled',
        category: 'actions',
        action: vi.fn(),
        enabled: false,
      })

      const commands = registry.getCommands({ enabledOnly: true })

      expect(commands.find((c) => c.id === 'disabled.cmd')).toBeUndefined()
    })
  })

  describe('getCommandsByCategory', () => {
    beforeEach(() => {
      const commands: Command[] = [
        { id: 'nav.home', label: 'Go Home', category: 'navigation', action: vi.fn() },
        { id: 'nav.settings', label: 'Settings', category: 'navigation', action: vi.fn() },
        { id: 'action.delete', label: 'Delete', category: 'actions', action: vi.fn() },
      ]

      commands.forEach((cmd) => registry.register(cmd))
    })

    it('should return commands for specific category', () => {
      const commands = registry.getCommandsByCategory('navigation')

      expect(commands).toHaveLength(2)
      commands.forEach((cmd) => expect(cmd.category).toBe('navigation'))
    })

    it('should return empty array for category with no commands', () => {
      const commands = registry.getCommandsByCategory('help')

      expect(commands).toHaveLength(0)
    })
  })

  describe('getCategories', () => {
    it('should return unique categories with commands', () => {
      registry.register({ id: 'nav.home', label: 'Home', category: 'navigation', action: vi.fn() })
      registry.register({ id: 'action.delete', label: 'Delete', category: 'actions', action: vi.fn() })
      registry.register({ id: 'help.about', label: 'About', category: 'help', action: vi.fn() })

      const categories = registry.getCategories()

      expect(categories).toContain('navigation')
      expect(categories).toContain('actions')
      expect(categories).toContain('help')
    })

    it('should return categories in defined order', () => {
      registry.register({ id: 'help.about', label: 'About', category: 'help', action: vi.fn() })
      registry.register({ id: 'nav.home', label: 'Home', category: 'navigation', action: vi.fn() })

      const categories = registry.getCategories()

      expect(categories.indexOf('navigation')).toBeLessThan(categories.indexOf('help'))
    })
  })

  describe('search', () => {
    beforeEach(() => {
      const commands: Command[] = [
        {
          id: 'nav.dashboard',
          label: 'Go to Dashboard',
          category: 'navigation',
          action: vi.fn(),
          keywords: ['home', 'main'],
        },
        {
          id: 'nav.settings',
          label: 'Open Settings',
          category: 'navigation',
          action: vi.fn(),
          keywords: ['preferences', 'config'],
        },
        {
          id: 'action.delete',
          label: 'Delete Item',
          category: 'actions',
          action: vi.fn(),
          keywords: ['remove', 'trash'],
        },
        {
          id: 'settings.theme',
          label: 'Change Theme',
          category: 'settings',
          action: vi.fn(),
          keywords: ['dark', 'light', 'color'],
        },
      ]

      commands.forEach((cmd) => registry.register(cmd))
    })

    it('should return all commands for empty query', () => {
      const results = registry.search('')

      expect(results).toHaveLength(4)
    })

    it('should find commands by label', () => {
      const results = registry.search('dashboard')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].command.id).toBe('nav.dashboard')
      expect(results[0].score).toBeGreaterThan(0)
    })

    it('should find commands by keywords', () => {
      const results = registry.search('preferences')

      expect(results.length).toBeGreaterThan(0)
      expect(results.find((r) => r.command.id === 'nav.settings')).toBeDefined()
    })

    it('should return results sorted by score', () => {
      const results = registry.search('delete')

      expect(results[0].command.id).toBe('action.delete')
    })

    it('should support partial matching', () => {
      const results = registry.search('dash')

      expect(results.find((r) => r.command.id === 'nav.dashboard')).toBeDefined()
    })

    it('should be case-insensitive', () => {
      const results = registry.search('DASHBOARD')

      expect(results.find((r) => r.command.id === 'nav.dashboard')).toBeDefined()
    })

    it('should apply category filter', () => {
      const results = registry.search('delete', { categories: ['navigation'] })

      expect(results.find((r) => r.command.id === 'action.delete')).toBeUndefined()
    })

    it('should apply enabled filter', () => {
      registry.register({
        id: 'disabled.delete',
        label: 'Disabled Delete',
        category: 'actions',
        action: vi.fn(),
        enabled: false,
      })

      const results = registry.search('delete', { enabledOnly: true })

      expect(results.find((r) => r.command.id === 'disabled.delete')).toBeUndefined()
    })
  })

  describe('execute', () => {
    it('should execute command action', async () => {
      const action = vi.fn()
      registry.register({
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action,
      })

      await registry.execute('test.command')

      expect(action).toHaveBeenCalledTimes(1)
    })

    it('should throw error for non-existent command', async () => {
      await expect(registry.execute('nonexistent')).rejects.toThrow('not found')
    })

    it('should throw error for disabled command', async () => {
      registry.register({
        id: 'disabled.command',
        label: 'Disabled Command',
        category: 'actions',
        action: vi.fn(),
        enabled: false,
      })

      await expect(registry.execute('disabled.command')).rejects.toThrow('disabled')
    })

    it('should emit command-executed event on success', async () => {
      const listener = vi.fn() as CommandRegistryEventListener
      registry.addEventListener(listener)

      registry.register({
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      })

      await registry.execute('test.command')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'command-executed',
          commandId: 'test.command',
        }),
      )
    })

    it('should emit command-error event on action failure', async () => {
      const listener = vi.fn() as CommandRegistryEventListener
      registry.addEventListener(listener)

      registry.register({
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: () => {
          throw new Error('Action failed')
        },
      })

      await expect(registry.execute('test.command')).rejects.toThrow('Action failed')

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'command-error',
          commandId: 'test.command',
          error: 'Action failed',
        }),
      )
    })

    it('should support async actions', async () => {
      const action = vi.fn().mockResolvedValue(undefined)
      registry.register({
        id: 'async.command',
        label: 'Async Command',
        category: 'actions',
        action,
      })

      await registry.execute('async.command')

      expect(action).toHaveBeenCalledTimes(1)
    })
  })

  describe('enabled status', () => {
    it('should treat commands without enabled property as enabled', () => {
      registry.register({
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      })

      expect(registry.getCommands({ enabledOnly: true }).find((c) => c.id === 'test.command')).toBeDefined()
    })

    it('should support static enabled value', () => {
      registry.register({
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
        enabled: true,
      })

      expect(registry.getCommands({ enabledOnly: true }).find((c) => c.id === 'test.command')).toBeDefined()
    })

    it('should support dynamic enabled function', () => {
      const isEnabled = vi.fn().mockReturnValue(true)
      registry.register({
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
        enabled: isEnabled,
      })

      const commands = registry.getCommands({ enabledOnly: true })
      expect(commands.find((c) => c.id === 'test.command')).toBeDefined()
      expect(isEnabled).toHaveBeenCalled()
    })
  })

  describe('getStats', () => {
    beforeEach(() => {
      const commands: Command[] = [
        { id: 'nav.home', label: 'Home', category: 'navigation', action: vi.fn(), shortcut: 'Ctrl+H' },
        { id: 'nav.settings', label: 'Settings', category: 'navigation', action: vi.fn() },
        { id: 'action.delete', label: 'Delete', category: 'actions', action: vi.fn(), shortcut: 'Del' },
        { id: 'settings.theme', label: 'Theme', category: 'settings', action: vi.fn(), enabled: false },
      ]

      commands.forEach((cmd) => registry.register(cmd))
    })

    it('should return correct statistics', () => {
      const stats = registry.getStats()

      expect(stats.totalCommands).toBe(4)
      expect(stats.byCategory.navigation).toBe(2)
      expect(stats.byCategory.actions).toBe(1)
      expect(stats.byCategory.settings).toBe(1)
      expect(stats.withShortcuts).toBe(2)
      expect(stats.enabledCommands).toBe(3)
    })
  })

  describe('clear', () => {
    it('should remove all commands', () => {
      registry.register({ id: 'cmd1', label: 'Cmd 1', category: 'navigation', action: vi.fn() })
      registry.register({ id: 'cmd2', label: 'Cmd 2', category: 'actions', action: vi.fn() })

      registry.clear()

      expect(registry.getCommands()).toHaveLength(0)
    })
  })

  describe('events', () => {
    it('should allow multiple listeners', () => {
      const listener1 = vi.fn() as CommandRegistryEventListener
      const listener2 = vi.fn() as CommandRegistryEventListener

      registry.addEventListener(listener1)
      registry.addEventListener(listener2)

      registry.register({ id: 'test', label: 'Test', category: 'actions', action: vi.fn() })

      expect(listener1).toHaveBeenCalled()
      expect(listener2).toHaveBeenCalled()
    })

    it('should return cleanup function from addEventListener', () => {
      const listener = vi.fn() as CommandRegistryEventListener
      const cleanup = registry.addEventListener(listener)

      cleanup()

      registry.register({ id: 'test', label: 'Test', category: 'actions', action: vi.fn() })

      expect(listener).not.toHaveBeenCalled()
    })

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error')
      })
      const normalListener = vi.fn() as CommandRegistryEventListener

      registry.addEventListener(errorListener)
      registry.addEventListener(normalListener)

      // Should not throw
      registry.register({ id: 'test', label: 'Test', category: 'actions', action: vi.fn() })

      // Normal listener should still be called
      expect(normalListener).toHaveBeenCalled()
    })
  })
})

describe('Convenience functions', () => {
  beforeEach(() => {
    resetCommandRegistry()
  })

  afterEach(() => {
    resetCommandRegistry()
  })

  describe('registerCommand', () => {
    it('should register command to default registry', () => {
      registerCommand({
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      })

      expect(getCommandRegistry().has('test.command')).toBe(true)
    })
  })

  describe('unregisterCommand', () => {
    it('should unregister command from default registry', () => {
      registerCommand({
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action: vi.fn(),
      })

      expect(unregisterCommand('test.command')).toBe(true)
      expect(getCommandRegistry().has('test.command')).toBe(false)
    })
  })

  describe('executeCommand', () => {
    it('should execute command from default registry', async () => {
      const action = vi.fn()
      registerCommand({
        id: 'test.command',
        label: 'Test Command',
        category: 'actions',
        action,
      })

      await executeCommand('test.command')

      expect(action).toHaveBeenCalledTimes(1)
    })
  })

  describe('searchCommands', () => {
    it('should search commands in default registry', () => {
      registerCommand({
        id: 'nav.dashboard',
        label: 'Go to Dashboard',
        category: 'navigation',
        action: vi.fn(),
      })

      const results = searchCommands('dashboard')

      expect(results.length).toBeGreaterThan(0)
      expect(results[0].command.id).toBe('nav.dashboard')
    })
  })

  describe('getCommandRegistry', () => {
    it('should return singleton instance', () => {
      const instance1 = getCommandRegistry()
      const instance2 = getCommandRegistry()

      expect(instance1).toBe(instance2)
    })
  })

  describe('resetCommandRegistry', () => {
    it('should reset the singleton instance', () => {
      const instance1 = getCommandRegistry()
      instance1.register({
        id: 'test.command',
        label: 'Test',
        category: 'actions',
        action: vi.fn(),
      })

      resetCommandRegistry()

      const instance2 = getCommandRegistry()
      expect(instance2).not.toBe(instance1)
      expect(instance2.getCommands()).toHaveLength(0)
    })
  })
})
