// ============================================================
// DOLLOPS UPDATER — runs as a utilityProcess (Node.js only)
// Communicates back to main process via process.parentPort
// ============================================================

const { autoUpdater } = require('electron-updater');
const path = require('path');

// utilityProcess has access to process.parentPort to talk to main
// But for tray/windows we need to handle differently —
// we'll send messages to main process which handles the UI

autoUpdater.autoDownload         = false;
autoUpdater.autoInstallOnAppQuit = false;

function send(type, data) {
  try {
    if (process.parentPort) {
      process.parentPort.postMessage({ type: type, data: data || {} });
    }
  } catch(e) {}
}

autoUpdater.on('update-available',    function(info) { send('update-available',  { version: info.version }); });
autoUpdater.on('update-not-available',function()     { send('update-not-available', {}); });
autoUpdater.on('update-downloaded',   function(info) { send('update-downloaded', { version: info.version }); });
autoUpdater.on('download-progress',   function(p)    {
  send('download-progress', {
    percent:     Math.round(p.percent),
    transferred: (p.transferred / 1048576).toFixed(1),
    total:       (p.total       / 1048576).toFixed(1),
    speed:       (p.bytesPerSecond / 1024).toFixed(0)
  });
});
autoUpdater.on('error', function(err) { send('update-error', { message: err.message }); });

// Listen for commands from main process
if (process.parentPort) {
  process.parentPort.on('message', function(msg) {
    var type = msg.data ? msg.data.type : null;
    if (type === 'check')    autoUpdater.checkForUpdates().catch(function(e){ send('check-error', { message: e.message }); });
    if (type === 'download') autoUpdater.downloadUpdate().catch(function(e){ send('update-error', { message: e.message }); });
    if (type === 'install')  autoUpdater.quitAndInstall(false, true);
  });
}

// Check on startup
setTimeout(function() {
  autoUpdater.checkForUpdates().catch(function(e) {
    send('check-error', { message: e.message });
  });
}, 3000);

// Check every hour
setInterval(function() {
  autoUpdater.checkForUpdates().catch(function() {});
}, 60 * 60 * 1000);

console.log('Dollops Updater service running');