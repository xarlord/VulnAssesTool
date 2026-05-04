const { app, BrowserWindow, ipcMain } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadURL('data:text/html,<h1>Hello World</h1>');
}

app.whenReady().then(() => {
  console.log('App is ready!');
  console.log('ipcMain:', typeof ipcMain);
  createWindow();
});

app.on('window-all-closed', () => {
  app.quit();
});
