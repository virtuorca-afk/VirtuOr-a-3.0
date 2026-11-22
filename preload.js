const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('virtuOrcaDesktop', {
  backupNow: () => ipcRenderer.invoke('virtuorca:backup-now'),
  openBackupFolder: () => ipcRenderer.invoke('virtuorca:backup-folder')
});
