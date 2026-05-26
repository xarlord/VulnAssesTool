const electron = require('electron')
console.log('[TEST] typeof electron:', typeof electron)
console.log('[TEST] electron keys:', Object.keys(electron))
const { app, BrowserWindow } = electron
const path = require('path')

console.log('[TEST] Starting minimal Electron app...')
console.log('[TEST] app:', typeof app, app)

app.whenReady().then(() => {
  console.log('[TEST] app.whenReady() resolved')
  const win = new BrowserWindow({ width: 800, height: 600, title: 'Test Window' })
  win.loadFile(path.join(__dirname, 'index.html'))
  console.log('[TEST] Window created and file loaded')
})

app.on('window-all-closed', () => {
  console.log('[TEST] All windows closed, quitting')
  app.quit()
})
