import { BrowserWindow, Menu, shell, dialog } from 'electron';
import { socialUrl } from '../server/social.js';
import { externalUrl } from './navigation.js';

export function protectSocialContents(contents, load, account) {
    const session = contents.session;
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.setPermissionCheckHandler(() => false);
    // Sites have their own isolated cookies. Their pages get no bridge to local APIs.
    session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      const { hostname } = new URL(details.url);
      callback({ cancel: /^(?:localhost$|127\.|0\.0\.0\.0$|\[?::1\]?$)/i.test(hostname) });
    });
    const hosts = account?.platform === 'discord' ? ['discord.com'] : ['tiktok.com','instagram.com','facebook.com','accounts.google.com'];
    const allowed = value => { try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && hosts.some(host => u.hostname === host || u.hostname.endsWith('.' + host)); } catch { return false; } };
    const navigate = (event, value) => { if (!allowed(value)) { event.preventDefault(); const link = externalUrl(value); if (link) void shell.openExternal(link).catch(()=>{}); } };
    contents.on('will-navigate', navigate);
    contents.on('will-redirect', navigate);
    contents.on('will-attach-webview', event => event.preventDefault());
    contents.setWindowOpenHandler(({ url: link }) => { if (allowed(link)) void load(link); else if (externalUrl(link)) void shell.openExternal(link).catch(()=>{}); return { action: 'deny' }; });
}

export function createSocialWindows() {
  const windows = new Map();
  const load = (window, url) => window.loadURL(url).catch(error => {
    if (error.code !== 'ERR_ABORTED' && !window.isDestroyed()) void dialog.showMessageBox(window, { type: 'info', title: 'Connexion au réseau', message: 'Ce réseau n’a pas pu être chargé.', detail: 'Actualise la page ou utilise « Ouvrir dans le navigateur » dans le menu Navigation.', buttons: ['Fermer'] });
  });
  function open(account, target) {
    const url = socialUrl(account, target);
    let window = windows.get(account.id);
    if (window && !window.isDestroyed()) { void load(window,url); if (window.isMinimized()) window.restore(); window.show(); window.focus(); return; }
    const title = `${account.platform === 'tiktok' ? 'TikTok' : 'Instagram'} · @${account.handle}`;
    window = new BrowserWindow({ width: 1220, height: 880, minWidth: 600, title, backgroundColor: '#101014',
      webPreferences: { partition: `persist:social-${account.id}`, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false } });
    windows.set(account.id, window);
    window.on('closed', () => windows.delete(account.id));
    window.on('page-title-updated', event => { event.preventDefault(); window.setTitle(title); });
    protectSocialContents(window.webContents, link => load(window, link), account);
    window.setMenu(Menu.buildFromTemplate([
      { label: title, submenu: [['home','Fil d’actualité'],['profile','Mon profil'],['messages','Messages'],['activity','Notifications'],['analytics','Statistiques']].map(([view,label]) => ({ label, click: () => load(window,socialUrl(account, view)) })) },
      { label: 'Navigation', submenu: [{ label: 'Précédent', accelerator: 'Alt+Left', click: () => { if (window.webContents.navigationHistory.canGoBack()) window.webContents.navigationHistory.goBack(); } }, { role: 'reload', label: 'Actualiser' }, { label: 'Ouvrir dans le navigateur', click: () => { const current = externalUrl(window.webContents.getURL()); if (current) void shell.openExternal(current).catch(()=>{}); } }, { role: 'close', label: 'Fermer cet espace' }] },
      { label: 'Édition', submenu: [{ role:'copy',label:'Copier' },{ role:'paste',label:'Coller' },{ role:'selectAll',label:'Tout sélectionner' }] },
    ]));
    void load(window,url);
  }
  return { open, closeAll() { for (const window of windows.values()) window.destroy(); windows.clear(); } };
}
