// ============================================================
// DOLLOPS ADMIN — Main Entry Point
// Also spawns the background updater service on launch
// ============================================================

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let updaterProcess = null;

// ---- SPAWN BACKGROUND UPDATER ----
function startUpdaterService() {
  try {
    const updaterPath = path.join(__dirname, 'updater', 'updater.js');
    const electronExe = process.execPath;

    updaterProcess = spawn(electronExe, [updaterPath, '--hidden'], {
      detached: true,   // runs independently of main app
      stdio: 'ignore'   // don't pipe output
    });
    updaterProcess.unref(); // let it run after main app closes
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
  startUpdaterService(); // launch updater in background
});

app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function() {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});