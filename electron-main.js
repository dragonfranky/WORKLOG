const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true, // 隱藏選單列，看起來才像獨立軟體
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 讀取你的 index.html
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});