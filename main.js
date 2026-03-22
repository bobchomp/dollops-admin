// ============================================================
// DOLLOPS ADMIN — Main Entry Point + Tray + Update Manager
// ============================================================

const { app, BrowserWindow, Tray, Menu, dialog, nativeImage, ipcMain, utilityProcess } = require('electron');
const path = require('path');
const fs   = require('fs');
const { exec } = require('child_process');

let mainWindow    = null;
let tray          = null;
let updateWindow  = null;
let updaterProcess = null;
let latestVersion = null;

const ADMIN_EXE = path.join(
  process.env.LOCALAPPDATA || '',
  'Programs', 'Dollops Admin', 'Dollops Admin.exe'
);

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
  } else {
    items.push({ label: '✅ Dollops Admin is up to date', enabled: false });
    items.push({ type: 'separator' });
  }
  items.push({ label: '🍦 Open Dollops Admin', click: function() {
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
    else createWindow();
  }});
  items.push({ label: '🔄 Check for Updates Now', click: function() {
    sendToUpdater('check');
  }});
  items.push({ type: 'separator' });
  items.push({ label: '❌ Close Background Service', click: function() {
    dialog.showMessageBox({
      type: 'question', title: 'Close Dollops Updater',
      message: 'Stop the background update service?',
      detail: 'You won\'t receive update notifications until Dollops Admin is reopened.',
      buttons: ['Yes, Close', 'Cancel'], defaultId: 1, cancelId: 1
    }).then(function(r) {
      if (r.response === 0) app.quit();
    });
  }});
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

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

// ---- SEND TO UPDATER PROCESS ----
function sendToUpdater(type, data) {
  if (updaterProcess) updaterProcess.postMessage({ type: type, data: data || {} });
}

// IPC from update window
ipcMain.on('start-download',   function() { sendToUpdater('download'); openUpdateWindow(); });
ipcMain.on('install-update',   function() { sendToUpdater('install'); });
ipcMain.on('open-dollops',     function() { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } else createWindow(); });
ipcMain.on('close-update-win', function() { if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close(); });

// ---- START UPDATER SERVICE ----
function startUpdaterService() {
  try {
    var updaterScript = path.join(__dirname, 'updater', 'updater.js');
    if (!fs.existsSync(updaterScript)) { console.log('updater.js not found'); return; }

    updaterProcess = utilityProcess.fork(updaterScript, [], {
      serviceName: 'Dollops Updater',
      stdio: 'pipe'
    });

    // Handle messages from updater
    updaterProcess.on('message', function(msg) {
      var type = msg.type, data = msg.data || {};
      console.log('Updater message:', type, data);

      if (type === 'update-available') {
        latestVersion = data.version;
        if (tray) { tray.setToolTip('Dollops Admin — Update Available 🆕'); rebuildTrayMenu('update-available'); }
        dialog.showMessageBox({
          type: 'info', title: '🍦 Update Available!',
          message: 'Dollops Admin v' + data.version + ' is available!',
          detail: 'Click "Download Now" to get it — you can keep working while it downloads.',
          buttons: ['Download Now', 'Later'], defaultId: 0, cancelId: 1,
          icon: path.join(__dirname, 'assets', 'icon.ico')
        }).then(function(r) {
          if (r.response === 0) {
            openUpdateWindow();
            setTimeout(function() {
              sendToUpdater('download');
              sendToUpdateWindow('download-start', { version: latestVersion });
            }, 800);
          }
        });
      }

      if (type === 'update-not-available') {
        if (tray) { tray.setToolTip('Dollops Admin — Up to date ✅'); rebuildTrayMenu('idle'); }
      }

      if (type === 'download-progress') {
        if (tray) { tray.setToolTip('Downloading: ' + data.percent + '%'); rebuildTrayMenu('downloading'); }
        sendToUpdateWindow('download-progress', data);
      }

      if (type === 'update-downloaded') {
        if (tray) { tray.setToolTip('Dollops Admin — Ready to Install ✅'); rebuildTrayMenu('ready'); }
        sendToUpdateWindow('update-downloaded', data);
      }

      if (type === 'update-error') {
        if (tray) { tray.setToolTip('Dollops Admin — Update error'); rebuildTrayMenu('idle'); }
        sendToUpdateWindow('update-error', data);
      }

      if (type === 'check-error') {
        if (tray) tray.setToolTip('Dollops Admin — Up to date ✅');
      }
    });

    updaterProcess.on('exit', function(code) {
      console.log('Updater process exited:', code);
      updaterProcess = null;
    });

    console.log('Updater service started');
  } catch(err) {
    console.log('Updater start error:', err.message);
  }
}

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
  setTimeout(startUpdaterService, 3000);
});

// Keep app alive even when main window is closed (tray keeps it running)
app.on('window-all-closed', function() {
  // Don't quit — stay in tray
});

app.on('activate', function() {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
});

app.on('before-quit', function() {
  if (updaterProcess) updaterProcess.kill();
});