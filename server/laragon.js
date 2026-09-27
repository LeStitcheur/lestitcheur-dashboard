import fs from 'node:fs/promises';
import path from 'node:path';

// Only read an existing installation. Never initialize or upgrade a data directory.
export async function resolveLaragon(root, version = '') {
  if (!root || !path.isAbsolute(root)) throw new Error('Indique le dossier absolu de Laragon.');
  const base = path.join(root, 'bin', 'mysql');
  let entries;
  try { entries = await fs.readdir(base, { withFileTypes: true }); }
  catch { throw new Error('Installation MySQL de Laragon introuvable dans bin\\mysql.'); }
  const candidates = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink()).map(entry => entry.name);
  if (version && !candidates.includes(version)) throw new Error('Cette version MySQL est introuvable dans Laragon.');
  if (!version && candidates.length !== 1) throw new Error('Indique le nom du dossier de la version MySQL à utiliser dans les paramètres Laragon.');
  version ||= candidates[0];
  const directory = path.join(base, version);
  const exe = path.join(directory, 'bin', 'mysqld.exe');
  const configFile = path.join(directory, 'my.ini');
  await fs.access(exe).catch(() => { throw new Error('mysqld.exe est introuvable dans cette version de Laragon.'); });
  let content;
  try { content = await fs.readFile(configFile, 'utf8'); }
  catch { throw new Error('Le fichier my.ini de Laragon est introuvable.'); }
  let section = '', values = {};
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[#;]/.test(line)) continue;
    if (line.startsWith('!include')) throw new Error('Ce my.ini utilise une inclusion. Configure MySQL en mode exécutable avec ses arguments.');
    const group = line.match(/^\[([^\]]+)\]/);
    if (group) { section = group[1].toLowerCase(); continue; }
    const pair = line.match(/^([\w-]+)\s*=\s*(.*?)\s*$/);
    if (section === 'mysqld' && pair) values[pair[1].toLowerCase()] = pair[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  const port = Number(values.port || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Le port du my.ini de Laragon est invalide.');
  if (!values.datadir || !path.isAbsolute(values.datadir)) throw new Error('Le my.ini doit indiquer le chemin absolu de la base Laragon (datadir).');
  const dataDir = path.normalize(values.datadir);
  const initialized = await fs.stat(path.join(dataDir, 'mysql')).catch(() => null);
  if (!initialized?.isDirectory()) throw new Error('Base Laragon existante introuvable. Démarre MySQL une première fois depuis Laragon.');
  return { version, exe, configFile, dataDir, port, cwd: directory,
    args: [`--defaults-file=${configFile}`, `--basedir=${directory}`, `--datadir=${dataDir}`, `--port=${port}`, '--console'] };
}
