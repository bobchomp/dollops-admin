const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow;

// ---- AUTO UPDATER ----
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  setTimeout(function() {
    autoUpdater.checkForUpdates().catch(function(err) {
      console.log('Update check skipped:', err.message);
    });
  }, 3000);

  autoUpdater.on('update-available', function(info) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available 🍦',
      message: 'A new version of Dollops Admin is available!',
      detail: 'Version ' + info.version + ' is ready to download.\n\nWould you like to update now? The app will restart automatically when done.',
      buttons: ['Yes, Update Now', 'Remind Me Later'],
      defaultId: 0,
      cancelId: 1
    }).then(function(result) {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Downloading Update...',
          message: 'Downloading the update in the background.',
          detail: 'The app will notify you when it\'s ready to install. You can keep working normally.',
          buttons: ['OK']
        });
      }
    });
  });

  autoUpdater.on('update-not-available', function() {
    console.log('App is up to date.');
  });

  autoUpdater.on('update-downloaded', function(info) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready 🍦',
      message: 'Update downloaded!',
      detail: 'Version ' + info.version + ' has been downloaded.\n\nClick "Restart & Install" to apply the update now, or "Later" to install it when you next close the app.',
      buttons: ['Restart & Install', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then(function(result) {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', function(err) {
    console.log('Auto-updater error:', err.message);
  });
}

// ---- CREATE WINDOW ----
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
    // Use .ico on Windows, .png on Mac
    icon: process.platform === 'darwin'
      ? path.join(__dirname, 'assets', 'icon.png')
      : path.join(__dirname, 'assets', 'icon.ico'),
    title: 'Dollops Ice Cream — Admin',
    show: false,
    backgroundColor: '#FFFBF5'
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  mainWindow.once('ready-to-show', function() {
    mainWindow.show();
    setupAutoUpdater();
  });

  mainWindow.setMenuBarVisibility(false);
}

// ---- APP LIFECYCLE ----
app.whenReady().then(createWindow);

// On Mac: close window but keep app running in dock (standard Mac behaviour)
app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On Mac: re-create window when clicking dock icon
app.on('activate', function() {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});