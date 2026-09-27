const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

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

  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error('Diego Bakery: no se pudo cargar la interfaz local.', {
      errorCode,
      errorDescription,
      validatedURL
    });
  });

  win.once('ready-to-show', () => win.show());

  // El frontend está dentro del instalador. No se descarga ni se redirige a Railway.
  void win.loadFile(rendererPath);
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