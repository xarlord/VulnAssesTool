console.log('[TEST] Minimal Electron test started')
const { app, BrowserWindow } = require('electron')

app.whenReady().then(() => {
  console.log('[TEST] app.whenReady() resolved')
  const win = new BrowserWindow({ width: 800, height: 600 })
  win.loadURL('data:text/html,<h1>Hello from Electron</h1>')
  console.log('[TEST] Window created')
})
