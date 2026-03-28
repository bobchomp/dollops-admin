// ============================================================
// DOLLOPS ADMIN — Main Entry Point + Tray + Update Checker
// Uses GitHub API directly — bypasses electron-updater signing check
// ============================================================

const fs   = require('fs');
const path = require('path');
const http = require('https');
const { exec } = require('child_process');
const { app, BrowserWindow, Tray, Menu, dialog, nativeImage, ipcMain, shell } = require('electron');

let mainWindow    = null;
let tray          = null;
let updateWindow  = null;
let checkInterval = null;
let pendingUpdate = null; // { version, downloadUrl, installerPath }

const GITHUB_OWNER  = 'bobchomp';
const GITHUB_REPO   = 'dollops-admin-releases';
const CURRENT_VER   = app.getVersion();

// ---- COMPARE VERSIONS ----
function isNewer(remote, current) {
  var r = remote.replace(/^v/, '').split('.').map(Number);
  var c = current.replace(/^v/, '').split('.').map(Number);
  for (var i = 0; i < 3; i++) {
    if ((r[i]||0) > (c[i]||0)) return true;
    if ((r[i]||0) < (c[i]||0)) return false;
  }
  return false;
}

// ---- CHECK FOR UPDATES VIA GITHUB API ----
function checkForUpdates(manual) {
  if (tray) { tray.setToolTip('Dollops Admin — Checking...'); rebuildTrayMenu('checking'); }

  var options = {
    hostname: 'api.github.com',
    path: '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/releases/latest',
    headers: { 'User-Agent': 'DollopsAdmin/' + CURRENT_VER }
  };

  var req = http.get(options, function(res) {
    var data = '';
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() {
      try {
        var release = JSON.parse(data);
        var remoteVersion = release.tag_name || '';

        if (!remoteVersion) {
          if (tray) { tray.setToolTip('Dollops Admin — Up to date ✅'); rebuildTrayMenu('idle'); }
          if (manual) showUpToDate();
          return;
        }

        if (isNewer(remoteVersion, CURRENT_VER)) {
          // Find the .exe asset
          var assets = release.assets || [];
          var exeAsset = assets.find(function(a) {
            return a.name.endsWith('.exe') && !a.name.includes('blockmap');
          });

          if (!exeAsset) {
            if (tray) { tray.setToolTip('Dollops Admin — Up to date ✅'); rebuildTrayMenu('idle'); }
            if (manual) showUpToDate();
            return;
          }

          pendingUpdate = {
            version:     remoteVersion,
            downloadUrl: exeAsset.browser_download_url,
            name:        exeAsset.name
          };

          if (tray) { tray.setToolTip('Dollops Admin — Update Available 🆕'); rebuildTrayMenu('update-available'); }

          // Show popup
          dialog.showMessageBox({
            type: 'info',
            title: '🍦 Update Available!',
            message: 'Dollops Admin ' + remoteVersion + ' is available!',
            detail: 'You are on v' + CURRENT_VER + '. Click "Download Now" to get the update.',
            buttons: ['Download Now', 'Later'],
            defaultId: 0, cancelId: 1,
            icon: path.join(__dirname, 'assets', 'icon.ico')
          }).then(function(r) {
            if (r.response === 0) {
              openUpdateWindow();
              setTimeout(function() { startDownload(); }, 600);
            }
          });

        } else {
          if (tray) { tray.setToolTip('Dollops Admin — Up to date ✅'); rebuildTrayMenu('idle'); }
          if (manual) showUpToDate();
        }

      } catch(e) {
        console.log('Update check parse error:', e.message);
        if (tray) { tray.setToolTip('Dollops Admin — Up to date ✅'); rebuildTrayMenu('idle'); }
        if (manual) showUpToDate();
      }
    });
  });

  req.on('error', function(e) {
    console.log('Update check error:', e.message);
    if (tray) { tray.setToolTip('Dollops Admin — Up to date ✅'); rebuildTrayMenu('idle'); }
    if (manual) showUpToDate();
  });

  req.setTimeout(10000, function() { req.destroy(); });
}

function showUpToDate() {
  dialog.showMessageBox({
    type: 'info', title: 'Up to Date!',
    message: 'Dollops Admin v' + CURRENT_VER + ' is already up to date!',
    buttons: ['OK']
  });
}

function checkSilent() { checkForUpdates(false); }
function checkNow()    { checkForUpdates(true); }

// ---- DOWNLOAD UPDATE ----
function startDownload() {
  if (!pendingUpdate) return;

  var downloadsDir = app.getPath('downloads');
  var installerPath = path.join(downloadsDir, pendingUpdate.name);
  pendingUpdate.installerPath = installerPath;

  sendToUpdateWindow('download-start', { version: pendingUpdate.version });

  // Follow redirects for GitHub asset downloads
  downloadFile(pendingUpdate.downloadUrl, installerPath, function(progress) {
    sendToUpdateWindow('download-progress', progress);
  }, function(err) {
    if (err) {
      sendToUpdateWindow('update-error', { message: err.message });
      return;
    }
    if (tray) { tray.setToolTip('Dollops Admin — Ready to Install ✅'); rebuildTrayMenu('ready'); }
    sendToUpdateWindow('update-downloaded', { version: pendingUpdate.version });
  });
}

function downloadFile(url, dest, onProgress, onDone) {
  // Handle GitHub redirects
  var urlObj = new URL(url);
  var options = {
    hostname: urlObj.hostname,
    path:     urlObj.pathname + urlObj.search,
    headers:  { 'User-Agent': 'DollopsAdmin/' + CURRENT_VER }
  };

  http.get(options, function(res) {
    // Follow redirect
    if (res.statusCode === 302 || res.statusCode === 301) {
      return downloadFile(res.headers.location, dest, onProgress, onDone);
    }

    var total       = parseInt(res.headers['content-length'] || '0');
    var transferred = 0;
    var file        = fs.createWriteStream(dest);

    res.on('data', function(chunk) {
      transferred += chunk.length;
      file.write(chunk);
      if (total > 0) {
        onProgress({
          percent:     Math.round((transferred / total) * 100),
          transferred: (transferred / 1048576).toFixed(1),
          total:       (total / 1048576).toFixed(1),
          speed:       '—'
        });
      }
    });

    res.on('end', function() {
      file.end();
      onDone(null);
    });

    res.on('error', function(e) {
      file.end();
      onDone(e);
    });

  }).on('error', function(e) {
    onDone(e);
  });
}

// ---- OPEN INSTALLER ----
function openInstaller() {
  if (!pendingUpdate || !pendingUpdate.installerPath) return;
  var installerPath = pendingUpdate.installerPath;

  // Open the downloads folder with the file selected
  shell.showItemInFolder(installerPath);

  dialog.showMessageBox({
    type: 'info',
    title: 'Run the Installer',
    message: 'Your installer is ready in your Downloads folder.',
    detail: 'To install:\n1. Double-click the highlighted .exe file\n2. If Windows shows a warning, click "More info"\n3. Then click "Run anyway"\n4. Follow the installer steps\n\nDollops Admin will now close.',
    buttons: ['OK — Close App'],
    defaultId: 0
  }).then(function() {
    app.quit();
  });
}

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
    items.push({ label: '🆕 Update Available — Click to Download', click: openUpdateWindow });
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

// ---- UPDATE WINDOW ----
function openUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) { updateWindow.focus(); return; }
  updateWindow = new BrowserWindow({
    width: 480, height: 420,
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
ipcMain.on('start-download',   startDownload);
ipcMain.on('install-update',   openInstaller);
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
  setTimeout(checkSilent, 5000);
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