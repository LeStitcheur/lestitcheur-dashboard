import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { powershell, psQuote } from './platform.js';

export function createDesktopSpotify({ run = powershell } = {}) {
  let cached, cachedAt = 0, pending, script;
  const execute = async (action, value = '') => {
    // Encoded script also works inside Electron's read-only ASAR archive.
    script ||= await fs.readFile(new URL('./spotify-windows.ps1', import.meta.url), 'utf8');
    const code = `& { ${script} } -Action ${psQuote(action)} -Value ${psQuote(String(value))}`;
    try { return JSON.parse((await run(code, { timeout: 12000 })).stdout.replace(/^\uFEFF/, '').trim()); }
    catch { throw new Error('Spotify ne répond pas à Windows. Ouvre Spotify et lance un morceau, puis actualise.'); }
  };
  return {
    async state() {
      if(process.platform!=='win32')return {connected:false,error:'Utilise Spotify Connect sur macOS et Linux.',unsupported:true};
      if (cached && Date.now() - cachedAt < 2500) return cached;
      if (pending) return pending;
      pending = execute('state').then(value => { cached = value; cachedAt = Date.now(); return value; }).finally(() => { pending = null; });
      return pending;
    },
    async control(action, value) {
      if(process.platform!=='win32')throw Error('Choisis Spotify Connect dans les paramètres. Le contrôle Windows nécessite Windows.');
      if (!['play','pause','next','previous','shuffle','repeat'].includes(action)) throw new Error('Commande indisponible pour Spotify Windows.');
      if (action === 'shuffle' && typeof value !== 'boolean') throw new Error('Valeur invalide.');
      if (action === 'repeat' && !['off','track','context'].includes(value)) throw new Error('Mode invalide.');
      const result = await execute(action, value); cached = null; return result;
    },
    async open() {
      if(process.platform!=='win32')throw Error('Ouvre Spotify puis utilise Spotify Connect.');
      const exe = [path.join(process.env.APPDATA || path.join(os.homedir(),'AppData','Roaming'), 'Spotify', 'Spotify.exe'), path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'Spotify.exe')].find(existsSync);
      if (exe) await run(`Start-Process -FilePath ${psQuote(exe)}`);
      else await run("Start-Process 'spotify:'");
      return {};
    },
  };
}
