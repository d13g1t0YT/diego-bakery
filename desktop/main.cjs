const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

const REMOTE_URL = 'https://diego-bakery-api-clean-production.up.railway.app/app/';
const rendererPath = path.join(__dirname, 'renderer', 'index.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: '#faf7f2',
    autoHideMenuBar: true,
    title: 'Diego Bakery',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  win.removeMenu();

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  let loadedRemote = false;
  win.webContents.on('did-fail-load', (_event, errorCode, _errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || loadedRemote) return;
    loadedRemote = true;
    console.warn('Diego Bakery: carga remota falló (' + errorCode + '), usando copia local.', validatedURL);
    void win.loadFile(rendererPath);
  });

  win.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('file://') || url.startsWith(REMOTE_URL);
    if (!allowed) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  win.once('ready-to-show', () => win.show());

  void win.loadURL(REMOTE_URL);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
