console.log('[MINIMAL] Starting...')
const { app, BrowserWindow } = require('electron')
console.log('[MINIMAL] Got electron:', typeof app, typeof BrowserWindow)
app.whenReady().then(() => {
  console.log('[MINIMAL] Ready!')
  const win = new BrowserWindow({ width: 800, height: 600, title: 'Minimal Test' })
  win.loadURL('data:text/html,<h1>It works!</h1>')
})
app.on('window-all-closed', () => app.quit())
