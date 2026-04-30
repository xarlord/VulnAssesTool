/**
 * Electron API exposed via contextBridge in preload script
 */
interface ElectronAPI {
  ping: () => Promise<string>
  getAppVersion: () => Promise<string>
  getPlatform: () => Promise<string>
  openExternal: (url: string) => Promise<boolean>
  onThemeChange: (callback: (theme: string) => void) => void
  getSystemTheme: () => Promise<string>

  // Menu action listeners
  onMenuAction: (callback: (action: string) => void) => () => void
}

/**
 * Extend the Window interface to include electronAPI
 */
declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
