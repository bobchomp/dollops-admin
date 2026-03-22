// ============================================================
// DOLLOPS ADMIN — Main Entry Point
// ============================================================

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

let mainWindow;

// ---- SPAWN BACKGROUND UPDATER (only once) ----
function startUpdaterService() {
  try {
    // Check if updater is already running via a lock file
    const lockFile = path.join(app.getPath('userData'), 'updater.lock');

    // If lock file exists and is recent (< 70 mins old), updater is already running
    if (fs.existsSync(lockFile)) {
      var stats = fs.statSync(lockFile);
      var ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < 70 * 60 * 1000) {
        console.log('Updater already running, skipping spawn.');
        return;
      }
    }

    // Only spawn if we are NOT already the updater process
    if (process.argv.includes('--updater')) return;

    var updaterScript = path.join(__dirname, 'updater', 'updater.js');
    if (!fs.existsSync(updaterScript)) {
      console.log('Updater script not found, skipping.');
      return;
    }

    var child = spawn(process.execPath, [updaterScript, '--updater', '--hidden'], {
      detached: true,
      stdio:    'ignore',
      env:      Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '' })
    });
    child.unref();
    console.log('Updater service started, PID:', child.pid);

  } catch(err) {
    console.log('Updater service could not start:', err.message);
  }
}

// ---- CREATE MAIN WINDOW ----
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'preload.js')
    },
    icon: process.platform === 'darwin'
      ? path.join(__dirname, 'assets', 'icon.png')
      : path.join(__dirname, 'assets', 'icon.ico'),
    title: 'Dollops Ice Cream — Admin',
    show: false,
    backgroundColor: '#FFFBF5'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', function() { mainWindow.show(); });
  mainWindow.setMenuBarVisibility(false);
}

// ---- START ----
app.whenReady().then(function() {
  createWindow();
  // Small delay before spawning updater so main window loads first
  setTimeout(startUpdaterService, 3000);
});

app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function() {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});