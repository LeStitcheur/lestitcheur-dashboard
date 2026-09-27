import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { seal, unseal } from './platform.js';
import { validatePanelUrl } from './security.js';
import { DEFAULT_ACCOUNTS, validateAccounts } from './social.js';

export function defaultSettings() {
  const desktop = path.join(os.homedir(), 'Desktop');
  const base = path.join(desktop, 'test serv');
  const mysqlExe = ['C:\\xampp\\mysql\\bin\\mysqld.exe', 'C:\\laragon\\bin\\mysql\\bin\\mysqld.exe'].find(existsSync) || '';
  return { projectsRoot: path.join(desktop, 'dev'), fivemExe: path.join(base, 'server', 'FXServer.exe'), fivemCwd: base,
    fivemArgs: ['+set', 'txDataPath', path.join(base, 'txData'), '+set', 'serverProfile', 'default'], fivemPort: 30120, txAdminPort: 40120,
    mysqlMode: existsSync('C:\\laragon\\laragon.exe') ? 'laragon' : 'executable', laragonRoot: 'C:\\laragon', laragonVersion: '', mysqlExe, mysqlArgs: mysqlExe ? [`--defaults-file=${path.join(path.dirname(mysqlExe), 'my.ini')}`, '--standalone'] : [], mysqlService: '', mysqlPort: 3306,
    pteroUrl: '', pteroKey: '', spotifyClientId: '', spotifyTokens: '', spotifyMode: process.platform==='win32'?'desktop':'api', hostingerToken: '', vercelToken: '', vercelTeamId: '', socialAccounts: [], discordBots: [], setupComplete:false };
}
export async function createSettings(directory) {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'settings.json');
  let config = defaultSettings();
  let fresh=false;
  try { const saved=JSON.parse(await fs.readFile(file,'utf8'));config={...config,...saved,setupComplete:saved.setupComplete??true}; } catch (err) {
    try {
      const backup = await fs.readFile(file + '.bak', 'utf8');
      config = { ...config, ...JSON.parse(backup) };
      if (err.code !== 'ENOENT') await fs.copyFile(file, file + '.damaged');
      await fs.writeFile(file, backup, { mode: 0o600 });
    } catch (backupError) { if (err.code !== 'ENOENT' || backupError.code !== 'ENOENT') throw new Error('Le fichier des réglages et sa sauvegarde sont invalides.');fresh=true; }
  }
  if(fresh){config.projectsRoot=path.join(directory,'projects');config.fivemExe='';config.fivemCwd='';config.fivemArgs=[];await fs.mkdir(config.projectsRoot,{recursive:true});}
  let writeQueue = Promise.resolve();
  const persist = () => {
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      try { const previous = await fs.readFile(file, 'utf8'); JSON.parse(previous); await fs.writeFile(file + '.bak', previous, { mode: 0o600 }); } catch (error) { if(error.code !== 'ENOENT') throw error; }
      await fs.writeFile(file + '.tmp', JSON.stringify(config, null, 2), { mode: 0o600 });
      await fs.rename(file + '.tmp', file);
    });
    return writeQueue;
  };
  // Keep account IDs stable so corrected handles retain their existing login sessions.
  let migrated = false;
  config.socialAccounts = (config.socialAccounts || DEFAULT_ACCOUNTS).map(account => {
    if (account.platform === 'tiktok' && ['lesdistributeurdesourires','lesdistributeurdesourire','ledistributeurdesourires'].includes(account.handle)) {
      migrated = true; return { ...account, handle: 'ledistributeurdesourire', label: 'Le distributeur de sourires' };
    }
    return account;
  });
  if(migrated||fresh)await persist();
  return {
    get: () => config,
    async restoreBackup(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Paramètres invalides.');
      const next = { ...defaultSettings() };
      for (const key of Object.keys(next)) {
        if(key==='setupComplete'&&!(key in input)){next[key]=true;continue;}
        if (!(key in input) || typeof input[key] !== typeof next[key] || Array.isArray(input[key]) !== Array.isArray(next[key])) throw Error('Sauvegarde incompatible.');
        next[key] = input[key];
      }
      validateAccounts(next.socialAccounts); validatePanelUrl(next.pteroUrl);
      if (!path.isAbsolute(next.projectsRoot)) throw Error('Dossier de projets invalide.');
      for (const key of ['pteroKey','spotifyTokens','hostingerToken','vercelToken']) if(next[key]) await unseal(next[key]);
      for (const bot of next.discordBots) { if(typeof bot.id!=='string'||typeof bot.name!=='string'||typeof bot.token!=='string')throw Error('Bot invalide.');await unseal(bot.token); }
      const previous=config;config=next;try{await persist();}catch(error){config=previous;throw error;}
    },
    discordBotSecret: id => unseal((config.discordBots || []).find(bot => bot.id === id)?.token || ''),
    async saveDiscordBot(bot, token) {
      const encrypted = await seal(token);
      config = { ...config, discordBots: [...(config.discordBots || []).filter(item => item.id !== bot.id), { ...bot, token: encrypted }] };
      await persist();
    },
    async removeDiscordBot(id) { config = { ...config, discordBots: (config.discordBots || []).filter(bot => bot.id !== id) }; await persist(); },
    public: () => ({ ...config, discordBots: (config.discordBots || []).map(({ id, name }) => ({ id, name })), pteroKey: undefined, spotifyTokens: undefined, hostingerToken: undefined, vercelToken: undefined, hostingerConfigured: !!config.hostingerToken, vercelConfigured: !!config.vercelToken, pteroConfigured: !!(config.pteroUrl && config.pteroKey), pteroKeySaved: !!config.pteroKey, spotifyConnected: !!config.spotifyTokens }),
    secret: (name) => unseal(config[name]),
    async secretSet(name, value) { config[name] = await seal(value); await persist(); },
    async update(input) {
      const next = { ...config };
      if(input.setupComplete!==undefined){if(typeof input.setupComplete!=='boolean')throw Error('Configuration invalide.');next.setupComplete=input.setupComplete;}
      for (const key of ['projectsRoot', 'fivemExe', 'fivemCwd', 'mysqlExe', 'mysqlService', 'laragonRoot', 'laragonVersion', 'spotifyClientId']) {
        if (input[key] !== undefined) {
          if (typeof input[key] !== 'string' || input[key].length > 1000 || /[\x00-\x1f]/.test(input[key])) throw new Error(`Valeur invalide : ${key}`);
          next[key] = input[key].trim();
        }
      }
      for (const key of ['fivemExe', 'fivemCwd', 'mysqlExe', 'laragonRoot']) {
        if (next[key] && !path.isAbsolute(next[key])) throw new Error(`Un chemin absolu est requis : ${key}`);
      }
      if (!path.isAbsolute(next.projectsRoot) || !(await fs.stat(next.projectsRoot)).isDirectory()) throw new Error('Le dossier des projets est introuvable.');
      for (const key of ['fivemArgs', 'mysqlArgs']) {
        if (input[key] !== undefined) {
          if (!Array.isArray(input[key]) || input[key].length > 50 || input[key].some(v => typeof v !== 'string' || v.length > 2000 || /[\x00-\x1f]/.test(v))) throw new Error(`La liste ${key} est invalide.`);
          next[key] = input[key];
        }
      }
      for (const key of ['mysqlPort', 'fivemPort', 'txAdminPort']) {
        if (input[key] !== undefined) {
          if (!Number.isInteger(Number(input[key])) || input[key] < 1 || input[key] > 65535) throw new Error('Port invalide.');
          next[key] = Number(input[key]);
        }
      }
      if (input.mysqlMode !== undefined) {
        if (!['laragon', 'executable', 'service'].includes(input.mysqlMode)) throw new Error('Mode MySQL invalide.');
        next.mysqlMode = input.mysqlMode;
      }
      if (input.pteroUrl !== undefined) next.pteroUrl = validatePanelUrl(input.pteroUrl);
      if (input.spotifyMode !== undefined) {
        if (!['desktop', 'api'].includes(input.spotifyMode)) throw new Error('Mode Spotify invalide.');
        next.spotifyMode = input.spotifyMode;
      }
      if (input.socialAccounts !== undefined) next.socialAccounts = validateAccounts(input.socialAccounts);
      if (input.vercelTeamId !== undefined) {
        if (typeof input.vercelTeamId !== 'string' || (input.vercelTeamId && !/^[a-zA-Z0-9_-]{1,100}$/.test(input.vercelTeamId))) throw new Error('Identifiant d’équipe Vercel invalide.');
        next.vercelTeamId = input.vercelTeamId;
      }
      for (const key of ['hostingerToken', 'vercelToken']) {
        if (input[key]) {
          if (typeof input[key] !== 'string' || input[key].length > 4000 || /[\x00-\x20]/.test(input[key].trim())) throw new Error('Clé API invalide.');
          next[key] = await seal(input[key].trim());
        }
        if (input[`clear${key[0].toUpperCase()}${key.slice(1)}`] === true) next[key] = '';
      }
      if (input.clearPteroKey === true) next.pteroKey = '';
      if (input.pteroKey) {
        if (typeof input.pteroKey !== 'string' || input.pteroKey.length > 500) throw new Error('Clé invalide.');
        next.pteroKey = await seal(input.pteroKey.trim());
      }
      if (next.spotifyClientId !== config.spotifyClientId) next.spotifyTokens = '';
      config = next;
      await persist();
    },
  };
}
