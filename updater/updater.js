// ============================================================
// DOLLOPS UPDATER — Background Service
// Bundled inside Dollops Admin — spawned automatically on launch
// ============================================================

const { app, Tray, Menu, BrowserWindow, dialog, nativeImage, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { exec } = require('child_process');

app.setName('Dollops Updater');

// Prevent multiple instances of the updater running
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let tray          = null;
let updateWindow  = null;
let isDownloading = false;
let updateInfo    = null;
let checkInterval = null;

// Path to the installed Dollops Admin exe
const ADMIN_EXE = path.join(
  process.env.LOCALAPPDATA || '',
  'Programs', 'dollops-admin', 'Dollops Admin.exe'
);

// ---- AUTO START WITH WINDOWS ----
app.setLoginItemSettings({
  openAtLogin: true,
  name: 'Dollops Updater',
  path: process.execPath,
  args: ['--hidden']
});

// ---- UPDATER CONFIG ----
autoUpdater.autoDownload         = false;
autoUpdater.autoInstallOnAppQuit = false;

// ---- TRAY ----
function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  const icon     = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Dollops Admin — Up to date ✅');
  rebuildTrayMenu('idle');
}

function rebuildTrayMenu(state) {
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

  items.push({ label: '🍦 Open Dollops Admin',       click: openAdmin });
  items.push({ label: '🔄 Check for Updates Now',    click: function(){ checkForUpdates(true); } });
  items.push({ type: 'separator' });
  items.push({
    label: '❌ Close Background Service',
    click: function() {
      dialog.showMessageBox({
        type: 'question',
        title: 'Close Dollops Updater',
        message: 'Stop the background update service?',
        detail: 'You won\'t receive update notifications until Dollops Admin is reopened.',
        buttons: ['Yes, Close', 'Cancel'],
        defaultId: 1, cancelId: 1
      }).then(function(r) {
        if (r.response === 0) {
          app.setLoginItemSettings({ openAtLogin: false, name: 'Dollops Updater' });
          app.quit();
        }
      });
    }
  });

  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function openAdmin() {
  exec('"' + ADMIN_EXE + '"', function(err) {
    if (err) {
      dialog.showMessageBox({
        type: 'error',
        title: 'Cannot Open Dollops Admin',
        message: 'Dollops Admin does not appear to be installed.',
        buttons: ['OK']
      });
    }
  });
}

// ---- UPDATE WINDOW ----
function openUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) { updateWindow.focus(); return; }
  updateWindow = new BrowserWindow({
    width: 480, height: 400,
    resizable: false, minimizable: false, maximizable: false,
    title: 'Dollops Admin — Update',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    show: false, backgroundColor: '#FFFBF5'
  });
  updateWindow.setMenuBarVisibility(false);
  updateWindow.loadFile(path.join(__dirname, 'src', 'update.html'));
  updateWindow.once('ready-to-show', function() { updateWindow.show(); });
  updateWindow.on('closed', function() { updateWindow = null; });
}

function sendToWindow(channel, data) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send(channel, data);
  }
}

// ---- CHECK FOR UPDATES ----
function checkForUpdates(manual) {
  if (tray) tray.setToolTip('Dollops Admin — Checking for updates...');
  autoUpdater.checkForUpdates().catch(function(err) {
    if (tray) tray.setToolTip('Dollops Admin — Up to date ✅');
    if (manual) {
      dialog.showMessageBox({
        type: 'info',
        title: 'Up to Date!',
        message: 'Dollops Admin is already up to date!',
        buttons: ['OK']
      });
    }
  });
}

// ---- UPDATER EVENTS ----
autoUpdater.on('update-available', function(info) {
  updateInfo = info;
  if (tray) {
    tray.setToolTip('Dollops Admin — Update Available 🆕');
    rebuildTrayMenu('update-available');
  }
  dialog.showMessageBox({
    type: 'info',
    title: '🍦 Update Available!',
    message: 'Dollops Admin v' + info.version + ' is available!',
    detail: 'Click "Download Now" to get it — you can keep working while it downloads.',
    buttons: ['Download Now', 'Later'],
    defaultId: 0, cancelId: 1,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico')
  }).then(function(r) {
    if (r.response === 0) {
      openUpdateWindow();
      setTimeout(startDownload, 800);
    }
  });
});

autoUpdater.on('update-not-available', function() {
  if (tray) { tray.setToolTip('Dollops Admin — Up to date ✅'); rebuildTrayMenu('idle'); }
});

autoUpdater.on('download-progress', function(progress) {
  isDownloading = true;
  if (tray) {
    rebuildTrayMenu('downloading');
    tray.setToolTip('Dollops Admin — Downloading: ' + Math.round(progress.percent) + '%');
  }
  sendToWindow('download-progress', {
    percent:     Math.round(progress.percent),
    transferred: (progress.transferred / 1048576).toFixed(1),
    total:       (progress.total       / 1048576).toFixed(1),
    speed:       (progress.bytesPerSecond / 1024).toFixed(0)
  });
});

autoUpdater.on('update-downloaded', function(info) {
  isDownloading = false;
  if (tray) { tray.setToolTip('Dollops Admin — Ready to Install ✅'); rebuildTrayMenu('ready'); }
  sendToWindow('update-downloaded', { version: info.version });
});

autoUpdater.on('error', function(err) {
  isDownloading = false;
  if (tray) { tray.setToolTip('Dollops Admin — Update error'); rebuildTrayMenu('idle'); }
  sendToWindow('update-error', { message: err.message });
});

function startDownload() {
  sendToWindow('download-start', { version: updateInfo ? updateInfo.version : '' });
  autoUpdater.downloadUpdate();
}

// ---- IPC ----
ipcMain.on('start-download',   startDownload);
ipcMain.on('install-update',   function() { autoUpdater.quitAndInstall(false, true); });
ipcMain.on('open-dollops',     openAdmin);
ipcMain.on('close-update-win', function() {
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.close();
});

// ---- APP READY ----
app.whenReady().then(function() {
  if (app.dock) app.dock.hide(); // hide from Mac dock
  createTray();
  setTimeout(function() { checkForUpdates(false); }, 5000);
  checkInterval = setInterval(function() { checkForUpdates(false); }, 60 * 60 * 1000);
});

app.on('window-all-closed', function() {
  // Stay alive in tray — don't quit
});

app.on('before-quit', function() {
  if (checkInterval) clearInterval(checkInterval);
});