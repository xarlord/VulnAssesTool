/**
 * Register Application Commands
 *
 * Registers all application commands for use with the command palette.
 * This file should be imported early in the app initialization.
 *
 * @module commands/registerCommands
 */

import { getCommandRegistry } from './commandRegistry'
import type { Command } from './types'

/**
 * Create navigation commands
 */
function createNavigationCommands(navigate: (path: string) => void): Command[] {
  return [
    {
      id: 'navigation.dashboard',
      label: 'Go to Dashboard',
      category: 'navigation',
      shortcut: 'Ctrl+Shift+D',
      icon: 'LayoutDashboard',
      action: () => navigate('/'),
      keywords: ['home', 'main', 'start'],
      priority: 10,
    },
    {
      id: 'navigation.executive',
      label: 'Go to Executive Dashboard',
      category: 'navigation',
      icon: 'BarChart3',
      action: () => navigate('/executive'),
      keywords: ['exec', 'summary', 'overview'],
      priority: 20,
    },
    {
      id: 'navigation.search',
      label: 'Go to Search',
      category: 'navigation',
      shortcut: 'Ctrl+K',
      icon: 'Search',
      action: () => navigate('/search'),
      keywords: ['find', 'lookup'],
      priority: 30,
    },
    {
      id: 'navigation.settings',
      label: 'Go to Settings',
      category: 'navigation',
      shortcut: 'Ctrl+,',
      icon: 'Settings',
      action: () => navigate('/settings'),
      keywords: ['preferences', 'config', 'options'],
      priority: 40,
    },
  ]
}

/**
 * Create action commands
 */
function createActionCommands(): Command[] {
  return [
    {
      id: 'actions.new-project',
      label: 'Create New Project',
      category: 'actions',
      shortcut: 'Ctrl+N',
      icon: 'FolderPlus',
      action: () => {
        window.dispatchEvent(new CustomEvent('menu-open-create-project'))
      },
      keywords: ['add', 'project', 'new'],
      priority: 10,
    },
    {
      id: 'actions.import-sbom',
      label: 'Import SBOM',
      category: 'actions',
      shortcut: 'Ctrl+I',
      icon: 'Upload',
      action: () => {
        window.dispatchEvent(new CustomEvent('menu-open-upload-sbom'))
      },
      keywords: ['upload', 'cyclonedx', 'spdx', 'sbom'],
      priority: 20,
    },
    {
      id: 'actions.generate-sbom',
      label: 'Generate SBOM',
      category: 'actions',
      icon: 'FileCode',
      action: () => {
        window.dispatchEvent(new CustomEvent('menu-open-sbom-generator'))
      },
      keywords: ['create', 'bom', 'generate'],
      priority: 30,
    },
    {
      id: 'actions.export-all',
      label: 'Export All Projects',
      category: 'actions',
      shortcut: 'Ctrl+E',
      icon: 'Download',
      action: () => {
        window.dispatchEvent(new CustomEvent('menu-open-export'))
      },
      keywords: ['download', 'save', 'backup'],
      priority: 40,
    },
    {
      id: 'actions.scan-all',
      label: 'Scan All Projects',
      category: 'actions',
      icon: 'RefreshCw',
      action: () => {
        window.dispatchEvent(new CustomEvent('scan-all-projects'))
      },
      keywords: ['refresh', 'vulnerability', 'check'],
      priority: 50,
    },
  ]
}

/**
 * Create view commands
 */
function createViewCommands(toggleSidebar: () => void): Command[] {
  return [
    {
      id: 'view.toggle-sidebar',
      label: 'Toggle Sidebar',
      category: 'view',
      shortcut: 'Ctrl+Shift+S',
      icon: 'PanelLeft',
      action: toggleSidebar,
      keywords: ['panel', 'side', 'hide', 'show'],
      priority: 10,
    },
    {
      id: 'view.command-palette',
      label: 'Open Command Palette',
      category: 'view',
      shortcut: 'Ctrl+Shift+P',
      icon: 'Command',
      action: () => {
        window.dispatchEvent(new CustomEvent('menu-open-command-palette'))
      },
      keywords: ['search', 'commands', 'actions'],
      priority: 5,
    },
  ]
}

/**
 * Create help commands
 */
function createHelpCommands(): Command[] {
  return [
    {
      id: 'help.show-tour',
      label: 'Show Onboarding Tour',
      category: 'help',
      shortcut: 'F1',
      icon: 'HelpCircle',
      action: () => {
        window.dispatchEvent(new CustomEvent('menu-show-tour'))
      },
      keywords: ['guide', 'intro', 'walkthrough', 'tutorial'],
      priority: 10,
    },
    {
      id: 'help.documentation',
      label: 'Open Documentation',
      category: 'help',
      icon: 'BookOpen',
      action: () => {
        window.open('https://github.com/yourusername/vuln-asses-tool#readme', '_blank')
      },
      keywords: ['docs', 'readme', 'guide'],
      priority: 20,
    },
    {
      id: 'help.report-issue',
      label: 'Report an Issue',
      category: 'help',
      icon: 'Bug',
      action: () => {
        window.open('https://github.com/yourusername/vuln-asses-tool/issues', '_blank')
      },
      keywords: ['bug', 'problem', 'feedback'],
      priority: 30,
    },
    {
      id: 'help.about',
      label: 'About VulnAssessTool',
      category: 'help',
      icon: 'Info',
      action: () => {
        window.dispatchEvent(new CustomEvent('menu-about'))
      },
      keywords: ['version', 'info'],
      priority: 40,
    },
  ]
}

/**
 * Register all application commands
 *
 * @param navigate - React Router navigate function
 * @param toggleSidebar - Function to toggle sidebar visibility
 */
export function registerAppCommands(navigate: (path: string) => void, toggleSidebar: () => void): void {
  const registry = getCommandRegistry()

  // Register all command groups
  const allCommands = [
    ...createNavigationCommands(navigate),
    ...createActionCommands(),
    ...createViewCommands(toggleSidebar),
    ...createHelpCommands(),
  ]

  for (const command of allCommands) {
    try {
      registry.register(command, { overwrite: true })
    } catch (error) {
      console.warn(`[Commands] Failed to register command "${command.id}":`, error)
    }
  }

  console.log(`[Commands] Registered ${allCommands.length} commands`)
}

/**
 * Unregister all application commands
 */
export function unregisterAppCommands(): void {
  const registry = getCommandRegistry()
  registry.clear()
}

export default registerAppCommands
