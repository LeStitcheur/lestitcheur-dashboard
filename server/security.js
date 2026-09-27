import path from 'node:path';
import fs from 'node:fs/promises';

export function validName(name) {
  return typeof name === 'string' && name.length > 0 && name.length <= 120 && name === name.trim()
    && !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name) && !name.startsWith('.')
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}
const canonical = (p) => process.platform === 'win32' ? p.toLowerCase() : p;
export async function projectPath(root, name, appRoot, mutation = false) {
  if (!validName(name)) throw new Error('Nom de dossier invalide.');
  const realRoot = await fs.realpath(root);
  const candidate = path.join(realRoot, name);
  const info = await fs.lstat(candidate);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Ce dossier ne peut pas être géré depuis le panel.');
  const resolved = await fs.realpath(candidate);
  if (canonical(path.dirname(resolved)) !== canonical(realRoot)) throw new Error('Le dossier sort de la racine autorisée.');
  if (mutation) {
    const own = canonical(await fs.realpath(appRoot));
    const target = canonical(resolved);
    if (own === target || own.startsWith(target + path.sep)) throw new Error('Le dossier du dashboard est protégé pendant son exécution.');
  }
  return resolved;
}
export function validatePanelUrl(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error('URL du panel invalide.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Utilise une URL HTTP ou HTTPS sans identifiants ni paramètres.');
  return url.href.replace(/\/+$/, '');
}
export function githubRemote(remote) {
  return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(remote)
    || /^git@github\.com:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(remote)
    || /^ssh:\/\/git@github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(remote);
}
export function requestAllowed(req, port) {
  if (req.headers.host !== `127.0.0.1:${port}`) return false;
  if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${port}`) return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  return true;
}
