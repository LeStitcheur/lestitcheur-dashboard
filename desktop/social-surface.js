import { socialUrl } from '../server/social.js';

export function surfaceBounds(rect, size, zoom = 1) {
  if (!rect || !['x','y','width','height'].every(key => Number.isFinite(rect[key])) || !Number.isFinite(zoom) || zoom <= 0) return null;
  const x = Math.round(rect.x * zoom), y = Math.round(rect.y * zoom);
  const width = Math.round(rect.width * zoom), height = Math.round(rect.height * zoom);
  if (x < 0 || y < 36 || width < 100 || height < 100 || x + width > size[0] + 1 || y >= size[1]) return null;
  return { x, y, width: Math.min(width, size[0] - x), height: Math.min(height, size[1] - y) };
}

// Constructor injection keeps lifecycle and account isolation testable without Electron.
export function createSocialSurface({ window, View, accounts, protect }) {
  const entries = new Map();
  let selected = '', visible = true;
  const publish = () => {
    if (!window.isDestroyed()) window.webContents.send('social:status', snapshot());
  };
  const snapshot = () => ({ accountId: selected, panels: [...entries].map(([target, entry]) => ({ target, phase: entry.phase })) });
  function close() {
    for (const entry of entries.values()) {
      window.contentView.removeChildView(entry.view);
      if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close();
    }
    entries.clear(); selected = '';
  }
  function mount(accountId) {
    const account = accounts().find(item => item.id === accountId);
    if (!account) throw new Error('Compte social introuvable.');
    if (selected === accountId) return snapshot();
    close(); selected = accountId; visible = true;
    for (const target of account.platform === 'discord' ? ['client'] : ['activity','analytics']) {
      const view = new View({ webPreferences: { partition: `persist:social-${account.id}`, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, webviewTag: false } });
      const entry = { view, phase: 'loading', bounds: null };
      entries.set(target, entry);
      view.setBackgroundColor('#101014'); view.setVisible(false);
      window.contentView.addChildView(view);
      const contents = view.webContents;
      const active = () => entries.get(target) === entry && !contents.isDestroyed();
      const load = url => contents.loadURL(url).catch(error => {
        if (active() && error.code !== 'ERR_ABORTED') { entry.phase = 'error'; view.setVisible(false); publish(); }
      });
      protect(contents, load, account);
      contents.on('did-start-loading', () => { if (active()) { entry.phase = 'loading'; publish(); } });
      contents.on('did-stop-loading', () => {
        if (!active() || entry.phase === 'error') return;
        const url = new URL(contents.getURL() || 'about:blank');
        entry.phase = /login|signin|challenge|checkpoint/.test(url.pathname) ? 'login' : 'ready';
        view.setVisible(visible && !!entry.bounds); publish();
      });
      contents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => {
        if (active() && mainFrame && code !== -3) { entry.phase = 'error'; view.setVisible(false); publish(); }
      });
      contents.on('render-process-gone', () => { if (active()) { entry.phase = 'error'; view.setVisible(false); publish(); } });
      entry.load = () => { entry.phase = 'loading'; publish(); void load(account.platform === 'discord' ? 'https://discord.com/channels/@me' : socialUrl(account, target)); };
      entry.load();
    }
    return snapshot();
  }
  function layout(input) {
    if (!input || input.accountId !== selected) return;
    visible = input.visible === true;
    for (const [target, entry] of entries) {
      entry.bounds = surfaceBounds(input.panels?.[target], window.getContentSize(), window.webContents.getZoomFactor());
      if (entry.bounds) {
        entry.view.setBounds(entry.bounds);
        // Give desktop-only analytics enough CSS width, without cutting off columns.
        const zoom = Number.isFinite(input.zoom) ? Math.max(0.5, Math.min(1.25, input.zoom)) : Math.max(0.5, Math.min(1, entry.bounds.width / 1280));
        entry.view.webContents.setZoomFactor(zoom);
      }
      entry.view.setVisible(visible && !!entry.bounds && entry.phase !== 'error');
    }
  }
  function refresh(target) {
    if (target !== undefined && !entries.has(target)) throw new Error('Panneau inconnu.');
    for (const [key, entry] of entries) if (!target || key === target) entry.load();
    return snapshot();
  }
  return { mount, layout, refresh, close, snapshot };
}
