const { contextBridge } = require('electron');

// Expose minimal API to renderer — all Firebase calls happen in renderer via CDN
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.versions.electron
});