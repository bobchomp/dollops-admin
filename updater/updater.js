// ============================================================
// DOLLOPS UPDATER — Background Service
// Spawned by Dollops Admin main.js — runs in system tray
// ============================================================

const { app, Tray, Menu, BrowserWindow, dialog, nativeImage, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs   = require('fs');
const { exec } = require('child_process');

// ---- MUST be first — prevent multiple updater instances ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another updater is already running — exit silently
  app.exit(0);
}

app.setName('Dollops Updater');

let tray         = null;
let updateWindow = null;
let updateInfo   = null;
let checkInterval = null;

// Lock file so main.js knows we're running
const lockFile = path.join(app.getPath('userData'), 'updater.lock');

function writeLock() {
  try { fs.writeFileSync(lockFile, String(process.pid)); } catch(e) {}
}
function clearLock() {
  try { if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile); } catch(e) {}
}

// Refresh lock every 60 mins so main.js knows we're still alive
setInterval(writeLock, 60 * 60 * 1000);

// Path to installed Dollops Admin
const ADMIN_EXE = path.join(
  process.env.LOCALAPPDATA || '',
  'Programs', 'dollops-admin', 'Dollops Admin.exe'
);

// ---- AUTO START WITH WINDOWS ----
app.setLoginItemSettings({
  openAtLogin: true,
  name: 'Dollops Updater',
  path: process.execPath,
  args: [path.join(__dirname, 'updater.js'), '--updater', '--hidden']
});

// ---- UPDATER CONFIG ----
autoUpdater.autoDownload         = false;
autoUpdater.autoInstallOnAppQuit = false;

// ---- TRAY ----
function createTray() {
  var iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  var icon     = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Dollops Admin — Up to date ✅');
  rebuildMenu('idle');
}

function rebuildMenu(state) {
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
  items.push({ label: '🍦 Open Dollops Admin',    click: openAdmin });
  items.push({ label: '🔄 Check for Updates Now', click: function(){ checkNow(true); } });
  items.push({ type: 'separator' });
  items.push({
    label: '❌ Close Background Service',
    click: function() {
      dialog.showMessageBox({
        type: 'question', title: 'Close Dollops Updater',
        message: 'Stop the background update service?',
        detail: 'You won\'t receive update notifications until Dollops Admin is reopened.',
        buttons: ['Yes, Close', 'Cancel'], defaultId: 1, cancelId: 1
      }).then(function(r) {
        if (r.response === 0) {
          app.setLoginItemSettings({ openAtLogin: false, name: 'Dollops Updater' });
          clearLock();
          app.exit(0);
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
        type: 'error', title: 'Cannot Open Dollops Admin',
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

function sendToWindow(ch, data) {
  if (updateWindow && !updateWindow.isDestroyed()) updateWindow.webContents.send(ch, data);
}

// ---- CHECK FOR UPDATES ----
function checkNow(manual) {
  if (tray) tray.setToolTip('Dollops Admin — Checking...');
  autoUpdater.checkForUpdates().catch(function(err) {
    if (tray) tray.setToolTip('Dollops Admin — Up to date ✅');
    if (manual) dialog.showMessageBox({ type:'info', title:'Up to Date!', message:'Dollops Admin is already up to date!', buttons:['OK'] });
  });
}

// ---- UPDATER EVENTS ----
autoUpdater.on('update-available', function(info) {
  updateInfo = info;
  if (tray) { tray.setToolTip('Dollops Admin — Update Available 🆕'); rebuildMenu('update-available'); }
  dialog.showMessageBox({
    type: 'info', title: '🍦 Update Available!',
    message: 'Dollops Admin v' + info.version + ' is available!',
    detail: 'Click "Download Now" to get it — you can keep working while it downloads.',
    buttons: ['Download Now', 'Later'], defaultId: 0, cancelId: 1,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico')
  }).then(function(r) {
    if (r.response === 0) { openUpdateWindow(); setTimeout(startDownload, 800); }
  });
});

autoUpdater.on('update-not-available', function() {
  if (tray) { tray.setToolTip('Dollops Admin — Up to date ✅'); rebuildMenu('idle'); }
});

autoUpdater.on('download-progress', function(p) {
  if (tray) { rebuildMenu('downloading'); tray.setToolTip('Downloading: ' + Math.round(p.percent) + '%'); }
  sendToWindow('download-progress', {
    percent: Math.round(p.percent),
    transferred: (p.transferred/1048576).toFixed(1),
    total: (p.total/1048576).toFixed(1),
    speed: (p.bytesPerSecond/1024).toFixed(0)
  });
});

autoUpdater.on('update-downloaded', function(info) {
  if (tray) { tray.setToolTip('Dollops Admin — Ready to Install ✅'); rebuildMenu('ready'); }
  sendToWindow('update-downloaded', { version: info.version });
});

autoUpdater.on('error', function(err) {
  if (tray) { tray.setToolTip('Dollops Admin — Update error'); rebuildMenu('idle'); }
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
  writeLock(); // write lock file immediately
  if (app.dock) app.dock.hide();
  createTray();
  setTimeout(function() { checkNow(false); }, 5000);
  checkInterval = setInterval(function() { checkNow(false); }, 60 * 60 * 1000);
});

app.on('window-all-closed', function() {
  // Stay alive in tray
});

app.on('before-quit', function() {
  clearLock();
  if (checkInterval) clearInterval(checkInterval);
});