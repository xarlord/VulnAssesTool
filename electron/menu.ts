import { app, BrowserWindow, Menu, shell, MenuItem } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

interface MenuConfigOptions {
  mainWindow: BrowserWindow | null
  isDev: boolean
}

/**
 * Get platform-specific menu configuration
 */
function getMenuTemplate({ mainWindow, isDev }: MenuConfigOptions): MenuItemConstructorOptions[] {
  const platform = process.platform
  const template: MenuItemConstructorOptions[] = []

  // Application menu (macOS only)
  if (platform === 'darwin') {
    template.push({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'Cmd+,',
          click: () => {
            mainWindow?.webContents.send('menu-action', 'settings')
          },
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  // File menu
  const fileSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'New Project',
      accelerator: 'CmdOrCtrl+N',
      click: () => {
        mainWindow?.webContents.send('menu-action', 'new-project')
      },
    },
    {
      label: 'Import SBOM',
      accelerator: 'CmdOrCtrl+I',
      click: () => {
        mainWindow?.webContents.send('menu-action', 'import-sbom')
      },
    },
    {
      label: 'Export All...',
      accelerator: 'CmdOrCtrl+E',
      click: () => {
        mainWindow?.webContents.send('menu-action', 'export-all')
      },
    },
    { type: 'separator' },
  ]

  // Add platform-specific items
  if (platform !== 'darwin') {
    fileSubmenu.push(
      {
        label: 'Preferences...',
        accelerator: 'Ctrl+,',
        click: () => {
          mainWindow?.webContents.send('menu-action', 'settings')
        },
      },
      { type: 'separator' },
      { role: 'quit' },
    )
  }

  template.push({
    label: 'File',
    submenu: fileSubmenu,
  })

  // Edit menu
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  })

  // View menu
  const viewSubmenu: MenuItemConstructorOptions[] = [
    {
      label: 'Dashboard',
      accelerator: 'CmdOrCtrl+Shift+D',
      click: () => {
        mainWindow?.webContents.send('menu-action', 'navigate-dashboard')
      },
    },
    { type: 'separator' },
    { role: 'reload' },
    { role: 'forceReload' },
    { type: 'separator' },
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
    { type: 'separator' },
    {
      label: 'Toggle Sidebar',
      accelerator: 'CmdOrCtrl+Shift+S',
      click: () => {
        mainWindow?.webContents.send('menu-action', 'toggle-sidebar')
      },
    },
  ]

  if (isDev) {
    viewSubmenu.push(
      { type: 'separator' },
      {
        label: 'Developer Tools',
        accelerator: 'CmdOrCtrl+Shift+I',
        click: () => {
          mainWindow?.webContents.toggleDevTools()
        },
      },
    )
  }

  template.push({
    label: 'View',
    submenu: viewSubmenu,
  })

  // History menu (macOS only)
  if (platform === 'darwin') {
    template.push({
      label: 'History',
      submenu: [{ role: 'back' as unknown as 'about' }, { role: 'forward' as unknown as 'about' }],
    })
  }

  // Window menu
  const windowSubmenu: MenuItemConstructorOptions[] = [{ role: 'minimize' }, { role: 'zoom' }]

  if (platform === 'darwin') {
    windowSubmenu.push({ type: 'separator' }, { role: 'front' })
  }

  template.push({
    label: 'Window',
    submenu: windowSubmenu,
  })

  // Help menu
  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'Show Onboarding Tour',
        accelerator: 'F1',
        click: () => {
          mainWindow?.webContents.send('menu-action', 'show-tour')
        },
      },
      {
        label: 'Command Palette',
        accelerator: 'CmdOrCtrl+Shift+P',
        click: () => {
          mainWindow?.webContents.send('menu-action', 'open-command-palette')
        },
      },
      { type: 'separator' },
      {
        label: 'Documentation',
        click: async () => {
          await shell.openExternal('https://github.com/yourusername/vuln-asses-tool#readme')
        },
      },
      {
        label: 'Report an Issue',
        click: async () => {
          await shell.openExternal('https://github.com/yourusername/vuln-asses-tool/issues')
        },
      },
      {
        label: 'Check for Updates',
        click: () => {
          mainWindow?.webContents.send('menu-action', 'check-updates')
        },
      },
      { type: 'separator' },
      {
        label: 'About VulnAssessTool',
        click: () => {
          mainWindow?.webContents.send('menu-action', 'about')
        },
      },
    ],
  })

  return template
}

/**
 * Create and set the application menu
 */
export function setupMenu(options: MenuConfigOptions): Menu {
  const template = getMenuTemplate(options)
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  return menu
}

/**
 * Update menu item states (enable/disable, check/uncheck)
 */
export function updateMenuItemState(menu: Menu, itemId: string, state: { enabled?: boolean; checked?: boolean }): void {
  const items = getMenuItemById(menu, itemId)
  items.forEach((item) => {
    if (state.enabled !== undefined) {
      item.enabled = state.enabled
    }
    if (state.checked !== undefined) {
      item.checked = state.checked
    }
  })
}

/**
 * Find all menu items by id
 */
function getMenuItemById(menu: Menu, id: string): MenuItem[] {
  const items: MenuItem[] = []
  const itemsList = menu.items

  function search(items: MenuItem[]) {
    for (const item of items) {
      if (item.id === id) {
        items.push(item)
      }
      if (item.submenu) {
        search(item.submenu.items)
      }
    }
  }

  search(itemsList)
  return items
}
