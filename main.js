const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let backupTimer;
const BACKUP_INTERVAL_MS = 15 * 60 * 1000;
const KEEP_BACKUPS = 20;
const backupRoot = () => path.join(app.getPath('documents'), 'VirtuOrça', 'Backups');

function copyDirSafe(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  if (!fs.existsSync(source)) return;
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === 'Backups' || entry.name === 'GPUCache' || entry.name === 'Code Cache') continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirSafe(from, to);
    else if (entry.isFile()) {
      try { fs.copyFileSync(from, to); } catch (e) { /* arquivo em uso: próxima cópia tentará novamente */ }
    }
  }
}

async function createBackup(reason = 'automatico') {
  try {
    if (win && !win.isDestroyed()) await win.webContents.session.flushStorageData();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupRoot(), `VirtuOrca_${reason}_${stamp}`);
    copyDirSafe(app.getPath('userData'), dest);
    const dirs = fs.readdirSync(backupRoot(), { withFileTypes: true })
      .filter(x => x.isDirectory()).map(x => path.join(backupRoot(), x.name))
      .sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    for (const old of dirs.slice(KEEP_BACKUPS)) fs.rmSync(old, { recursive: true, force: true });
    return { ok: true, path: dest };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1100, minHeight: 700,
    title: 'VirtuOrça',
    icon: path.join(__dirname, 'assets', 'virtuorca.ico'),
    backgroundColor: '#faf8fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('close', async (event) => {
    if (win.__closingApproved) return;
    event.preventDefault();
    const result = await createBackup('ao_fechar');
    win.__closingApproved = true;
    if (!result.ok) {
      const choice = await dialog.showMessageBox(win, {
        type: 'warning', title: 'Backup não confirmado',
        message: 'Não foi possível confirmar a cópia de segurança mais recente.',
        detail: result.error || 'Verifique o espaço em disco e as permissões da pasta Documentos.',
        buttons: ['Tentar novamente', 'Fechar mesmo assim'], defaultId: 0, cancelId: 0
      });
      if (choice.response === 0) { win.__closingApproved = false; return; }
    }
    win.close();
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('br.com.virtuorca.app');
  createWindow();
  backupTimer = setInterval(() => createBackup('automatico'), BACKUP_INTERVAL_MS);
});

ipcMain.handle('virtuorca:backup-now', () => createBackup('manual'));
ipcMain.handle('virtuorca:backup-folder', () => {
  fs.mkdirSync(backupRoot(), { recursive: true });
  const { shell } = require('electron');
  return shell.openPath(backupRoot());
});

app.on('before-quit', () => { if (backupTimer) clearInterval(backupTimer); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
