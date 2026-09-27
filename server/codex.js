import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

async function executable() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  const dirs = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(dirs.filter(d => d.isDirectory()).map(async d => {
    const file = path.join(root, d.name, 'codex.exe');
    const stat = await fs.stat(file).catch(() => null);
    return stat?.isFile() ? { file, time: stat.mtimeMs } : null;
  }));
  const latest = found.filter(Boolean).sort((a, b) => b.time - a.time)[0];
  if (latest) return latest.file;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const file = path.join(dir, process.platform === 'win32' ? 'codex.exe' : 'codex');
    if ((await fs.stat(file).catch(() => null))?.isFile()) return file;
  }
  throw new Error('Codex est introuvable sur ce PC. Ouvre ou installe l’application Codex.');
}

// Only the fixed read-only RPC calls below are exposed; no prompts or credentials leave this module.
export async function readCodex() {
  const child = spawn(await executable(), ['app-server', '--stdio'], {
    cwd: os.homedir(), windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'],
  });
  const pending = new Map(); let id = 0;
  const lines = createInterface({ input: child.stdout });
  const fail = () => { for (const request of pending.values()) request.reject(new Error('Connexion locale Codex interrompue.')); pending.clear(); };
  child.on('error', fail); child.on('exit', fail); child.stdin.on('error', fail);
  lines.on('line', line => {
    let message; try { message = JSON.parse(line); } catch { return; }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error('Données indisponibles. Vérifie ta connexion dans Codex.'));
    else request.resolve(message.result);
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error('Codex met trop de temps à répondre. Réessaie dans un instant.')); }, 18000);
    pending.set(key, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    child.stdin.write(JSON.stringify({ id: key, method, params }) + '\n');
  });
  try {
    await rpc('initialize', { clientInfo: { name: 'lestitcheur_dashboard', title: 'LeStitcheur Control', version: '2.2.0' } });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    const [limits, threads, desktop] = await Promise.allSettled([
      rpc('account/rateLimits/read'),
      rpc('thread/list', { limit: 200, sortKey: 'updated_at', sortDirection: 'desc', sourceKinds: ['cli', 'vscode', 'appServer', 'exec'], useStateDbOnly: true }),
      fs.readFile(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), '.codex-global-state.json'), 'utf8').then(JSON.parse),
    ]);
    return {
      checkedAt: new Date().toISOString(),
      limits: limits.status === 'fulfilled' ? normalizeLimits(limits.value) : [],
      usageError: limits.status === 'rejected' ? limits.reason.message : null,
      projects: threads.status === 'fulfilled' ? recentProjects(threads.value.data, desktop.status === 'fulfilled' ? desktop.value : {}) : [],
      projectsError: threads.status === 'rejected' ? threads.reason.message : null,
    };
  } finally { lines.close(); child.stdin.end(); child.kill(); fail(); }
}

export function normalizeLimits(data) {
  const buckets = data?.rateLimitsByLimitId ? Object.entries(data.rateLimitsByLimitId) : [['codex', data?.rateLimits]];
  return buckets.filter(([, v]) => v).map(([id, value]) => ({
    id, name: value.limitName || (id === 'codex' ? 'Codex' : id),
    windows: ['primary', 'secondary'].flatMap(key => {
      const w = value[key];
      if (!w || !Number.isFinite(w.usedPercent)) return [];
      return [{ key, used: Math.max(0, Math.min(100, w.usedPercent)), minutes: w.windowDurationMins ?? null, resetsAt: Number.isFinite(w.resetsAt) ? new Date(w.resetsAt * 1000).toISOString() : null }];
    }),
  }));
}

export function recentProjects(threads = [], desktop = {}) {
  const projects = new Map();
  const projectless = new Set(Array.isArray(desktop['projectless-thread-ids']) ? desktop['projectless-thread-ids'] : []);
  const normalize = value => String(value).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const known = Object.values(desktop['local-projects'] || {}).filter(p => Array.isArray(p?.rootPaths));
  for (const t of [...threads].sort((a,b) => b.updatedAt - a.updatedAt)) {
    if (!t.cwd || t.parentThreadId || t.ephemeral || projectless.has(t.id) || !Number.isFinite(t.updatedAt)) continue;
    const folder = String(t.cwd).replace(/\\/g, '/').replace(/\/+$/, '');
    const key = folder.toLowerCase();
    if (projects.has(key)) continue;
    const project = known.find(p => p.rootPaths.some(root => normalize(root) === key));
    projects.set(key, { name: project?.name || folder.split('/').pop() || folder, path: t.cwd, title: t.name || 'Tâche Codex', updatedAt: new Date(t.updatedAt * 1000).toISOString() });
    if (projects.size === 5) break;
  }
  return [...projects.values()];
}

export function createCodexSummary(read = readCodex, now = Date.now) {
  let cached, pending, expires = 0;
  return async () => {
    if (cached && now() < expires) return cached;
    if (pending) return pending;
    pending = read().catch(error => ({ checkedAt: null, limits: [], projects: [], usageError: error.message, projectsError: error.message })).then(value => { cached = value; expires = now() + 60000; return value; }).finally(() => { pending = null; });
    return pending;
  };
}
