import { app, BrowserWindow, WebContentsView, ipcMain, Menu, Tray, dialog, shell, nativeTheme, clipboard, screen } from 'electron';
import { spawnPty } from './pty-process.js';
import { createTerminalPool } from './terminal.js';
import { createUpdates } from './updates.js';
import { createRemoteDesktop } from './remote-desktop.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { externalUrl } from './navigation.js';
import { createSocialWindows, protectSocialContents } from './social-windows.js';
import { createSocialSurface } from './social-surface.js';

const NAME = 'LeStitcheur Control';
const PORT = app.isPackaged ? 4317 : Number(process.env.PORT || 4318);
const ORIGIN = `http://127.0.0.1:${PORT}`;
app.setName(NAME);
// Stable across source runs, portable builds and installed upgrades; tests opt into an isolated profile.
app.setPath('userData', process.env.LESTITCHEUR_PROFILE_DIR || path.join(app.getPath('appData'), NAME));
app.setAppUserModelId('fr.lestitcheur.control');
const ownsLock = app.requestSingleInstanceLock();
let window, tray, httpServer, backend, socialSurface, localTerminal, remoteDesktop, updates, quitting = false, warnedTray = false, quitPending = false;
const socialWindows = createSocialWindows();

function showWindow() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show(); window.focus();
}
async function openExternal(url) {
  const allowed = externalUrl(url);
  if (allowed) await shell.openExternal(allowed).catch(() => {});
}
async function quit() {
  if (quitPending) return;
  quitPending = true;
  try {
    const status = await backend.services.status();
    if (status.mysqlManaged || status.fivemManaged || backend.jobs.list().some(job => job.status === 'running')) {
      showWindow();
      await dialog.showMessageBox(window, { type: 'info', title: NAME, message: 'Des services ou des opérations sont encore gérés par l’application.', detail: 'Tu peux fermer la fenêtre pour la laisser en arrière-plan. Pour quitter complètement, attends la fin des opérations et arrête les services depuis Laragon ou txAdmin.', buttons: ['Revenir au dashboard'] });
      return;
    }
    if (localTerminal?.running()) {
      const answer = await dialog.showMessageBox(window, { type: 'warning', message: 'Fermer le terminal et quitter ?', detail: 'Les commandes encore actives dans ce terminal seront interrompues.', buttons: ['Annuler', 'Fermer et quitter'], defaultId: 0, cancelId: 0 });
      if (answer.response !== 1) return;
    }
    app.quit();
  } finally { quitPending = false; }
}

if (!ownsLock) app.quit();
else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('before-quit', () => { quitting = true; remoteDesktop?.disconnect();updates?.close();localTerminal?.close(); socialSurface?.close(); socialWindows.closeAll(); backend?.close(); httpServer?.close(); httpServer?.closeAllConnections(); });
  app.on('window-all-closed', () => { if (quitting) app.quit(); });
  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    backend = await createApp({ port: PORT, desktop: true, terminalRunning: () => localTerminal?.running() || false, dataDir: app.getPath('userData'), openSocial: socialWindows.open, onSpotifyConnected: () => { showWindow(); window.loadURL(`${ORIGIN}/?spotify=connected`); } });
    await new Promise((resolve, reject) => {
      httpServer = backend.app.listen(PORT, '127.0.0.1', resolve);
      httpServer.once('error', reject);
    });
    const icon = path.join(app.getAppPath(), 'desktop', 'icon.png');
    window = new BrowserWindow({ width: 1480, height: 1000, minWidth: 960, minHeight: 680, show: false, title: NAME, icon,
      backgroundColor: '#090b0e', autoHideMenuBar: true, titleBarStyle: 'hidden', titleBarOverlay: { color: '#0d1014', symbolColor: '#e9eaed', height: 36 },
      webPreferences: { preload: path.join(app.getAppPath(), 'desktop', 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, spellcheck: false, backgroundThrottling: true } });
    socialSurface = createSocialSurface({ window, View: WebContentsView, accounts: () => [...backend.settings.get().socialAccounts, { id: 'discord-personal', platform: 'discord' }], protect: protectSocialContents });
    const trusted = event => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame && event.senderFrame.url.startsWith(ORIGIN + '/');
    ipcMain.handle('setup:folder',async event=>{if(!trusted(event))throw Error('Accès refusé.');const result=await dialog.showOpenDialog(window,{title:'Choisir ton dossier de projets',defaultPath:backend.settings.get().projectsRoot,properties:['openDirectory','createDirectory']});return result.canceled?null:result.filePaths[0];});
    remoteDesktop=await createRemoteDesktop({directory:app.getPath('userData'),window,helper:app.isPackaged?path.join(process.resourcesPath,'rdp-host.exe'):path.join(app.getAppPath(),'desktop','rdp-host.exe'),scale:()=>screen.getDisplayMatching(window.getBounds()).scaleFactor});
    for(const action of ['status','save','remove','connect','disconnect','focus','fullscreen'])ipcMain.handle('remote:'+action,(event,...args)=>{if(!trusted(event))throw Error('Accès refusé.');return remoteDesktop[action](...args);});
    ipcMain.on('remote:layout',(event,input)=>{if(trusted(event))remoteDesktop.layout(input);});
    localTerminal = createTerminalPool({ settings: () => backend.settings.get(), appRoot: app.getAppPath(), spawn: spawnPty,
      emit: data => { if (!window.webContents.isDestroyed()) window.webContents.send('terminal:data', data); },
      confirm: async () => (await dialog.showMessageBox(window, { type: 'warning', message: 'Fermer la session PowerShell actuelle ?', detail: 'Les commandes encore actives seront interrompues.', buttons: ['Annuler', 'Fermer la session'], defaultId: 0, cancelId: 0 })).response === 1,
    });
    for (const action of ['open', 'snapshot', 'list', 'remove', 'write', 'resize', 'stop']) ipcMain.handle(`terminal:${action}`, (event, ...args) => { if (!trusted(event)) throw new Error('Accès refusé.'); return localTerminal[action](...args); });
    updates=await createUpdates({app,backend,terminal:localTerminal,beforeInstall:()=>{quitting=true;}});
    for(const action of ['status','configure','check','download','install'])ipcMain.handle('updates:'+action,(event,...args)=>{if(!trusted(event))throw Error('Accès refusé.');return updates[action](...args);});
    ipcMain.on('terminal:focus', (event, focused) => { if (trusted(event)) window.webContents.setIgnoreMenuShortcuts(focused === true); });
    ipcMain.on('terminal:ack', (event, id, count) => { if(trusted(event))localTerminal.ack(id,count); });
    ipcMain.handle('terminal:copy', (event, text) => { if (!trusted(event) || typeof text !== 'string' || text.length > 1024 * 1024) throw new Error('Accès refusé.'); clipboard.writeText(text); });
    ipcMain.handle('terminal:paste', event => { if (!trusted(event)) throw new Error('Accès refusé.'); return clipboard.readText().slice(0, 65536); });
    ipcMain.handle('social:mount', (event, id) => { if (!trusted(event)) throw new Error('Accès refusé.'); return socialSurface.mount(id); });
    ipcMain.handle('social:refresh', (event, target) => { if (!trusted(event)) throw new Error('Accès refusé.'); return socialSurface.refresh(target); });
    ipcMain.on('social:layout', (event, input) => { if (trusted(event)) socialSurface.layout(input); });
    ipcMain.on('social:close', event => { if (trusted(event)) socialSurface.close(); });
    window.webContents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => { if (isMainFrame && !inPlace) { remoteDesktop?.disconnect();socialSurface.close(); window.webContents.setIgnoreMenuShortcuts(false); } });
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    window.webContents.session.setPermissionCheckHandler(() => false);
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    const navigate = (event, url) => {
      if (new URL(url).origin !== ORIGIN) { event.preventDefault(); void openExternal(url); }
    };
    window.webContents.on('will-navigate', navigate);
    window.webContents.on('will-redirect', navigate);
    window.webContents.setWindowOpenHandler(({ url }) => { void openExternal(url); return { action: 'deny' }; });
    window.on('close', event => {
      if (quitting) return;
      event.preventDefault(); window.hide();
      if (!warnedTray) { warnedTray = true; tray.displayBalloon({ title: NAME, content: 'Le dashboard reste actif près de l’horloge. Double-clique sur son icône pour le rouvrir.' }); }
    });
    tray = new Tray(icon);
    tray.setToolTip(NAME);
    tray.on('double-click', showWindow);
    tray.on('click', showWindow);
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Ouvrir le dashboard', click: showWindow }, { type: 'separator' }, { label: 'Quitter', click: quit }]));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Application', submenu: [{ label: 'Masquer près de l’horloge', accelerator: 'Alt+F4', click: () => window.close() }, { label: 'Quitter', accelerator: 'Control+Q', click: quit }] },
      { label: 'Édition', submenu: [{ role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' }, { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' }] },
      { label: 'Affichage', submenu: [{ role: 'reload', label: 'Actualiser' }, { role: 'resetZoom', label: 'Taille réelle' }, { role: 'zoomIn', label: 'Agrandir' }, { role: 'zoomOut', label: 'Réduire' }, { role: 'togglefullscreen', label: 'Plein écran' }] },
    ]));
    window.once('ready-to-show', showWindow);
    await window.loadURL(ORIGIN);
    await fs.writeFile(path.join(app.getPath('userData'), 'desktop-session.json'), JSON.stringify({ pid: process.pid, executable: process.execPath, version: app.getVersion(), started: new Date().toISOString() }));
  }).catch(error => {
    dialog.showErrorBox(NAME, error.code === 'EADDRINUSE' ? 'Le port 4317 est déjà utilisé. Ferme l’ancienne version du dashboard avec « Arreter LeStitcheur.cmd », puis relance l’application.' : `Impossible de lancer le dashboard : ${error.message}`);
    app.quit();
  });
}
