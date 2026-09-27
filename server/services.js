import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { powershell, psEncoded, psQuote } from './platform.js';
import { resolveLaragon } from './laragon.js';

export function probe(port, mysql = false) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let done = false, received = Buffer.alloc(0);
    const finish = result => { if (!done) { done = true; socket.destroy(); resolve(result); } };
    socket.setTimeout(900, () => finish(false));
    socket.on('error', () => finish(false));
    socket.on('end', () => finish(false));
    socket.on('connect', () => { if (!mysql) finish(true); });
    socket.on('data', data => { received = Buffer.concat([received, data]); if (received.length >= 5) finish(received[3] === 0 && received[4] === 10); });
  });
}
export async function waitReady(check, { timeout = 45000, delay = 600 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await new Promise(r => setTimeout(r, delay)); }
  throw new Error('Le service n’est pas prêt après le délai prévu. Consulte les journaux.');
}
export function createServices(settings, jobs) {
  const managed = new Map();
  let starting = false;
  function startProcess(key, exe, args, cwd, log) {
    if (!existsSync(exe) || !/\.exe$/i.test(exe)) throw new Error(`Exécutable ${key} introuvable. Vérifie les paramètres.`);
    if (!existsSync(cwd)) throw new Error('Dossier de travail introuvable.');
    return new Promise((resolve, reject) => {
      const child = spawn(exe, args, { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdout.on('data', data => log(data.toString()));
      child.stderr.on('data', data => log(data.toString()));
      child.once('error', reject);
      child.once('spawn', () => { managed.set(key, child); resolve(child); });
      child.once('exit', code => { if (managed.get(key) === child) managed.delete(key); log(`\n${key} arrêté (code ${code}).\n`); jobs.addActivity(`${key} arrêté`, code ? 'error' : 'info'); });
    });
  }
  async function startMysql(log, config) {
    const laragon = config.mysqlMode === 'laragon' ? await resolveLaragon(config.laragonRoot, config.laragonVersion) : null;
    if (laragon) { config.mysqlPort = laragon.port; log(`Laragon · ${laragon.version}\nConfiguration : ${laragon.configFile}\nBase existante : ${laragon.dataDir}\n`); }
    if (await probe(config.mysqlPort, true)) { log('MySQL répond déjà.\n'); return; }
    if (managed.has('MySQL')) throw new Error('MySQL est déjà lancé mais ne répond pas. Consulte ses journaux.');
    if (config.mysqlMode === 'service') {
      if (!config.mysqlService) throw new Error('Renseigne le nom du service MySQL dans les paramètres.');
      log('Démarrage du service MySQL. Une confirmation Windows peut apparaître.\n');
      const code = psEncoded(`$ErrorActionPreference='Stop'; try { Start-Service -Name ${psQuote(config.mysqlService)}; exit 0 } catch { exit 1 }`);
      await powershell(`$p=Start-Process -FilePath 'powershell.exe' -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @('-NoProfile','-EncodedCommand','${code}'); if ($p.ExitCode -ne 0) { throw 'Le service MySQL n’a pas démarré.' }`, { timeout: 90000 });
    } else if (laragon) {
      await startProcess('MySQL', laragon.exe, laragon.args, laragon.cwd, log);
    } else {
      if (!config.mysqlExe) throw new Error('Renseigne le chemin de mysqld.exe dans Paramètres → Serveur local.');
      if (/^mysql\.exe$/i.test(path.basename(config.mysqlExe))) throw new Error('mysql.exe est un client. Utilise le mode Laragon ou le serveur mysqld.exe.');
      await startProcess('MySQL', config.mysqlExe, config.mysqlArgs, path.dirname(config.mysqlExe), log);
    }
    await waitReady(async () => { if (config.mysqlMode !== 'service' && !managed.has('MySQL')) throw new Error('MySQL s’est arrêté pendant le démarrage. Consulte ses journaux.'); return probe(config.mysqlPort, true); });
    log(`MySQL prêt sur le port ${config.mysqlPort}.\n`);
  }
  async function status() {
    const config = { ...settings.get() };
    let laragon = null, mysqlError = '';
    if (config.mysqlMode === 'laragon') {
      try { laragon = await resolveLaragon(config.laragonRoot, config.laragonVersion); config.mysqlPort = laragon.port; }
      catch (error) { mysqlError = error.message; }
    }
    const [mysql, gamePort, txAdmin] = await Promise.all([probe(config.mysqlPort, true), probe(config.fivemPort), probe(config.txAdminPort)]);
    return { mysql, fivem: gamePort, txAdmin, fivemProcess: managed.has('FiveM'), mysqlManaged: managed.has('MySQL'), fivemManaged: managed.has('FiveM'), starting, fivemInstalled: existsSync(config.fivemExe), mysqlConfigured: config.mysqlMode === 'laragon' ? !!laragon : config.mysqlMode === 'service' ? !!config.mysqlService : !!config.mysqlExe, mysqlMode: config.mysqlMode, mysqlError, laragon: laragon && { version: laragon.version, configFile: laragon.configFile, dataDir: laragon.dataDir, port: laragon.port }, mysqlPort: config.mysqlPort, fivemPort: config.fivemPort, txAdminPort: config.txAdminPort };
  }
  return {
    status,
    start(target) {
      if(process.platform!=='win32')throw Error('Le lanceur local Laragon / FiveM est réservé à Windows. Utilise Pterodactyl ou le terminal pour tes services sur ce système.');
      if (!['mysql', 'stack'].includes(target)) throw new Error('Service inconnu.');
      if (starting) throw new Error('Un démarrage est déjà en cours.');
      starting = true;
      try { return jobs.create(target === 'stack' ? 'Démarrage MySQL → FiveM' : 'Démarrage MySQL', async log => {
        try {
          const config = { ...settings.get() };
          await startMysql(log, config);
          if (target === 'stack') {
            if (managed.has('FiveM') || await probe(config.fivemPort) || await probe(config.txAdminPort)) { log('FiveM ou txAdmin est déjà lancé. Aucun doublon créé.\n'); return; }
            log('\nLancement FiveM / txAdmin…\n');
            const child = await startProcess('FiveM', config.fivemExe, config.fivemArgs, config.fivemCwd, log);
            await waitReady(async () => { if (child.exitCode !== null) throw new Error('FiveM s’est arrêté pendant le démarrage.'); return await probe(config.fivemPort) || await probe(config.txAdminPort); }, { timeout: 60000 });
            log('FiveM / txAdmin est accessible.\n');
          }
        } finally { starting = false; }
      }); } catch (error) { starting = false; throw error; }
    },
    async stopFivem() {
      const child = managed.get('FiveM');
      if (!child?.pid || child.exitCode !== null) throw new Error('Ce processus FiveM n’est pas contrôlé par cette session du panel. Utilise txAdmin.');
      await powershell(`& taskkill.exe /PID ${child.pid} /T /F | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'Arrêt impossible.' }`);
      jobs.addActivity('Processus FiveM arrêté', 'success');
      return {};
    },
  };
}
