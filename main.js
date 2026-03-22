const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs   = require('fs');
const { spawn } = require('child_process');

let mainWindow;

function startUpdaterService() {
  try {
    if (process.argv.some(function(a){ return a.includes('updater.js') || a === '--updater'; })) return;

    var updaterScript = path.join(__dirname, 'updater', 'updater.js');
    var lockFile      = path.join(app.getPath('userData'), 'updater.lock');

    if (fs.existsSync(lockFile)) {
      var age = Date.now() - fs.statSync(lockFile).mtimeMs;
      if (age < 70 * 60 * 1000) {
        console.log('Updater already running, skipping.');
        return;
      }
    }

    if (!fs.existsSync(updaterScript)) {
      console.log('updater.js not found at:', updaterScript);
      return;
    }

    var child = spawn(process.execPath, [updaterScript, '--updater', '--hidden'], {
      detached: true,
      stdio:    'ignore'
    });
    child.unref();
    console.log('Updater spawned, PID:', child.pid);

  } catch(err) {
    console.log('Updater start error:', err.message);
  }
}

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
    show: false,
    backgroundColor: '#FFFBF5'
  });
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.once('ready-to-show', function() { mainWindow.show(); });
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(function() {
  createWindow();
  setTimeout(startUpdaterService, 3000);
});

app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function() {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});