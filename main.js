// ============================================================
// DOLLOPS ADMIN — Main Entry Point + Tray + Auto Updater
// ============================================================

const { app, BrowserWindow, Tray, Menu, dialog, nativeImage, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow   = null;
let tray         = null;
let updateWindow = null;
let latestVersion = null;
let checkInterval = null;

// ---- AUTO UPDATER CONFIG ----
autoUpdater.autoDownload         = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger               = null; // silence default logging

// ---- TRAY ----
function createTray() {
  var iconPath = path.join(__dirname, 'assets', 'icon.ico');
  var icon     = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('Dollops Admin — Up to date ✅');
  rebuildTrayMenu('idle');
}

function rebuildTrayMenu(state) {
  if (!tray) return;
  var items = [];
  if (state === 'update-available') {
    items.push({ label: '🆕 Update Available — Click to Install', click: openUpdateWindow });
    items.push({ type: 'separator' });
  } else if (state === 'downloading') {
    items.push({ label: '⬇️ Downloading update...', enabled: false });
    items.push({ type: 'separator' });
  } else if (state === 'ready') {
    items.push({ label: '✅ Update ready — Click to install', click: openUpdateWindow });
    items.push({ type: 'separator' });
  } else if (state === 'checking') {
    items.push({ label: '🔍 Checking for updates...', enabled: false });
    items.push({ type: 'separator' });
  } else {
    items.push({ label: '✅ Dollops Admin is up to date', enabled: false });
    items.push({ type: 'separator' });
  }
  items.push({ label: '🍦 Open Dollops Admin', click: function() {
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
    else createWindow();
  }});
  items.push({ label: '🔄 Check for Updates Now', click: checkNow });
  items.push({ type: 'separator' });
  items.push({ label: '❌ Close Background Service', click: function() {
    dialog.showMessageBox({
      type: 'question', title: 'Close Dollops Updater',
      message: 'Stop the background update service?',
      detail: 'You won\'t receive update notifications until Dollops Admin is reopened.',
      buttons: ['Yes, Close', 'Cancel'], defaultId: 1, cancelId: 1
    }).then(function(r) { if (r.response === 0) app.quit(); });
  }});
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

// ---- CHECK FOR UPDATES ----
function checkNow() {
  rebuildTrayMenu('checking');
  tray.setToolTip('Dollops Admin — Checking for updates...');
  autoUpdater.checkForUpdates()
    .then(function(result) {
      if (!result || !result.updateInfo) {
        tray.setToolTip('Dollops Admin — Up to date ✅');
        rebuildTrayMenu('idle');
        dialog.showMessageBox({
          type: 'info', title: 'Up to Date!',
          message: 'Dollops Admin is already up to date!',
          buttons: ['OK']
        });
      }
    })
    .catch(function(err) {
      console.log('Update check error:', err.message);
      tray.setToolTip('Dollops Admin — Up to date ✅');
      rebuildTrayMenu('idle');
      dialog.showMessageBox({
        type: 'info', title: 'Up to Date',
        message: 'Dollops Admin is up to date.',
        detail: 'Could not reach update server — check your internet connection.',
        buttons: ['OK']
      });
    });
}

function checkSilent() {
  autoUpdater.checkForUpdates().catch(function(err) {
    console.log('Silent update check failed:', err.message);
  });
}

// ---- AUTO UPDATER EVENTS ----
autoUpdater.on('update-available', function(info) {
  latestVersion = info.version;
  if (tray) { tray.setToolTip('Dollops Admin — Update Available 🆕'); rebuildTrayMenu('update-available'); }
  dialog.showMessageBox({
    type: 'info', title: '🍦 Update Available!',
    message: 'Dollops Admin v' + info.version + ' is available!',
    detail: 'Click "Download Now" — you can keep working while it downloads.',
    buttons: ['Download Now', 'Later'], defaultId: 0, cancelId: 1,
    icon: path.join(__dirname, 'assets', 'icon.ico')
  }).then(function(r) {
    if (r.response === 0) {
      openUpdateWindow();
      setTimeout(function() {
        autoUpdater.downloadUpdate();
        sendToUpdateWindow('download-start', { version: latestVersion });
      }, 600);
    }
  });
});

autoUpdater.on('update-not-available', function() {
  if (tray) { tray.setToolTip('Dollops Admin — Up to date ✅'); rebuildTrayMenu('idle'); }
});

autoUpdater.on('download-progress', function(p) {
  if (tray) { tray.setToolTip('Downloading: ' + Math.round(p.percent) + '%'); rebuildTrayMenu('downloading'); }
  sendToUpdateWindow('download-progress', {
    percent:     Math.round(p.percent),
    transferred: (p.transferred / 1048576).toFixed(1),
    total:       (p.total / 1048576).toFixed(1),
    speed:       (p.bytesPerSecond / 1024).toFixed(0)
  });
});

autoUpdater.on('update-downloaded', function(info) {
  if (tray) { tray.setToolTip('Dollops Admin — Ready to Install ✅'); rebuildTrayMenu('ready'); }
  sendToUpdateWindow('update-downloaded', { version: info.version });
});

autoUpdater.on('error', function(err) {
  console.log('Updater error:', err.message);
  if (tray) { tray.setToolTip('Dollops Admin — Update error'); rebuildTrayMenu('idle'); }
  sendToUpdateWindow('update-error', { message: err.message });
});

// ---- UPDATE WINDOW ----
function openUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) { updateWindow.focus(); return; }
  updateWindow = new BrowserWindow({
    width: 480, height: 400,
    resizable: false, minimizable: false, maximizable: false,
    title: 'Dollops Admin — Update',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    show: false, backgroundColor: '#FFFBF5'
  });
  updateWindow.setMenuBarVisibility(false);
  updateWindow.loadFile(path.join(__dirname, 'updater', 'src', 'update.html'));
  updateWindow.once('ready-to-show', function() { updateWindow.show(); });
  updateWindow.on('closed', function() { updateWindow = null; });
}

function sendToUpdateWindow(ch, data) {
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.webContents.send(ch, data);
}

// IPC from update window
ipcMain.on('start-download',   function() { autoUpdater.downloadUpdate(); });
ipcMain.on('install-update',   function() { autoUpdater.quitAndInstall(false, true); });
ipcMain.on('open-dollops',     function() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
  else createWindow();
});
ipcMain.on('close-update-win', function() {
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
});

// ---- MAIN WINDOW ----
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800, minWidth: 900, minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'preload.js')
    },
    icon: process.platform === 'darwin'
      ? path.join(__dirname, 'assets', 'icon.png')
      : path.join(__dirname, 'assets', 'icon.ico'),
    title: 'Dollops Ice Cream — Admin',
    show: false, backgroundColor: '#FFFBF5'
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', function() { mainWindow.show(); });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.on('closed', function() { mainWindow = null; });
}

// ---- APP READY ----
app.whenReady().then(function() {
  createWindow();
  createTray();
  // Check for updates 5 seconds after launch
  setTimeout(checkSilent, 5000);
  // Check every hour
  checkInterval = setInterval(checkSilent, 60 * 60 * 1000);
});

app.on('window-all-closed', function() {
  // Stay alive in tray
});

app.on('activate', function() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
});

app.on('before-quit', function() {
  if (checkInterval) clearInterval(checkInterval);
});