const { app, BrowserWindow, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const appIcon = path.join(__dirname, '../ui/icon.png');
if (process.platform === 'win32') app.setAppUserModelId('dev.gtmux.desktop');
if (process.env.GTMUX_DESKTOP_DATA_DIR) {
  if (!path.isAbsolute(process.env.GTMUX_DESKTOP_DATA_DIR)) throw new Error('GTMUX_DESKTOP_DATA_DIR must be absolute.');
  app.setPath('userData', process.env.GTMUX_DESKTOP_DATA_DIR);
}
let managerWindow, workspaceWindow, tray, control, supervisor, proxy, updates, quitting = false, quitPending = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showManager);
  app.whenReady().then(boot).catch(error => { dialog.showErrorBox('gtmux could not start', error.message); quitting = true; app.quit(); });
}
function showManager() {
  if (quitting || quitPending || !managerWindow || managerWindow.isDestroyed()) return;
  managerWindow.show(); managerWindow.focus();
}
async function boot() {
  const { Supervisor } = await import('./supervisor.mjs');
  const { ProxyManager } = await import('./proxy.mjs');
  const { Updates } = await import('./updates.mjs');
  const { autoUpdater } = require('electron-updater');
  const { controlServer } = await import('./control.mjs');
  const resources = app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, '../resources');
  let adapter = null; let root = path.join(app.getPath('userData'), 'managed-server');
  supervisor = new Supervisor({ root, binary: path.join(resources, process.platform === 'win32' ? 'gtmux.exe' : 'gtmux'), frontend: path.join(resources, 'frontend'), adapter });
  await supervisor.load(); proxy = new ProxyManager(supervisor, adapter ? { platform: adapter.platform, arch: adapter.arch } : {});
  const updateFeed = app.isPackaged && await fs.access(path.join(process.resourcesPath, 'app-update.yml')).then(() => true, () => false);
  const supported = updateFeed && (process.platform !== 'linux' || Boolean(process.env.APPIMAGE));
  updates = new Updates({ root, updater: autoUpdater, supported, reason: supported ? '' : 'Install a published Windows/macOS package or Linux AppImage to enable updates. This unpacked build has no supported update feed.',
    installFailed: () => { quitting = false; quitPending = false; if (supervisor.preferences?.background) createTray(); showManager(); },
    stopForInstall: async credential => { if (quitPending || quitting) throw new Error('Application is already shutting down.'); quitPending = true; try { await supervisor.stop(credential); await proxy.stop(); quitting = true; updates.close(); tray?.destroy(); tray = null; } catch (e) { quitPending = false; throw e; } } });
  await updates.load(); updates.startSchedule();
  control = await controlServer({ supervisor, proxy, updates, settingsControls: app.isPackaged ? path.join(process.resourcesPath, 'settings-controls.css') : undefined, designTokens: app.isPackaged ? path.join(process.resourcesPath, 'design-tokens.css') : undefined, platform: adapter?.label ?? process.platform,
    onChooseWorkspace: async currentPath => {
      if (quitting || quitPending || !managerWindow || managerWindow.isDestroyed()) throw new Error('The manager window is closing.');
      const result = await dialog.showOpenDialog(managerWindow, {
        title: 'Choose workspace folder', buttonLabel: 'Select folder', properties: ['openDirectory'],
        defaultPath: typeof currentPath === 'string' && path.isAbsolute(currentPath) ? currentPath : app.getPath('documents'),
      });
      return { canceled: result.canceled, path: result.canceled ? null : result.filePaths[0] ?? null };
    },
    onOpen: openWorkspace, onPreferences: async preferences => {
      if (preferences.background && !tray) createTray();
      if (!preferences.background && tray) { tray.destroy(); tray = null; }
    } });
  managerWindow = new BrowserWindow({ width: 1080, height: 820, minWidth: 660, minHeight: 600,
    title: 'gtmux · Server manager', icon: appIcon, autoHideMenuBar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  protect(managerWindow, new URL(control.url).origin);
  const manager = managerWindow;
  manager.on('closed', () => { if (managerWindow === manager) managerWindow = null; });
  manager.on('close', event => {
    if (quitting) return;
    event.preventDefault();
    if (supervisor.preferences?.background && tray) manager.hide(); else app.quit();
  });
  await manager.loadURL(control.url);
  if (!quitting && !quitPending && supervisor.preferences?.background) createTray();
}
function protect(window, origin) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}
async function openWorkspace(url, mode) {
  if (quitting || quitPending) throw new Error('Application is shutting down.');
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported workspace URL.');
  if (mode === 'web' || mode === 'both') await shell.openExternal(url);
  if (mode === 'app' || mode === 'both') {
    if (workspaceWindow && !workspaceWindow.isDestroyed() && workspaceWindow.allowedOrigin !== parsed.origin) workspaceWindow.close();
    if (!workspaceWindow || workspaceWindow.isDestroyed()) {
      workspaceWindow = new BrowserWindow({ width: 1400, height: 900, title: 'gtmux', icon: appIcon, autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
      workspaceWindow.allowedOrigin = parsed.origin;
      protect(workspaceWindow, parsed.origin);
      const workspace = workspaceWindow;
      workspace.on('closed', () => { if (workspaceWindow === workspace) workspaceWindow = null; showManager(); });
    }
    const workspace = workspaceWindow;
    await workspace.loadURL(url);
    if (!quitting && !quitPending && !workspace.isDestroyed()) workspace.show();
  }
}
function createTray() {
  if (tray) return;
  // Use the same gtmux mark as the workspace favicon and application icon.
  const icon = nativeImage.createFromPath(path.join(__dirname, '../ui/tray.png'));
  tray = new Tray(icon); tray.setToolTip('gtmux server manager');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show server controls', click: showManager },
    { label: 'Open workspace', click: () => (async () => { await openWorkspace(await proxy.workspaceURL(), supervisor.preferences.mode); })().catch(e => dialog.showErrorBox('gtmux', e.message)) },
    { type: 'separator' }, { label: 'Quit and stop server', click: () => app.quit() }
  ]));
  tray.on('click', showManager);
}
app.on('before-quit', event => {
  if (quitting || !supervisor) return;
  event.preventDefault();
  if (quitPending) return;
  quitPending = true;
  (async () => {
    try { await supervisor.stop(); await proxy.stop(); await control.close(); quitting = true; updates?.close(); tray?.destroy(); app.quit(); }
    catch (error) { quitPending = false; showManager(); await dialog.showMessageBox({ type: 'warning', message: 'Server is still running',
      detail: error.message + '\nStop it from Server controls before quitting.', buttons: ['Return to server controls'] }); }
    finally { quitPending = false; }
  })();
});
app.on('window-all-closed', () => { if (!quitting && !quitPending && !supervisor?.preferences?.background) app.quit(); });
app.on('activate', showManager);
