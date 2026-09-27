import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { projectPath } from '../server/security.js';

export async function findPwsh() {
  if(process.platform!=='win32') {
    const candidates=[...(process.env.PATH||'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,'pwsh')),process.env.SHELL,'/bin/zsh','/bin/bash','/bin/sh'].filter(Boolean);
    for(const file of candidates)if(path.isAbsolute(file)&&(await fs.stat(file).catch(()=>null))?.isFile())return file;
    throw Error('Aucun shell compatible trouvé.');
  }
  const candidates = [path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
    ...(process.env.PATH || '').split(path.delimiter).map(dir => path.join(dir, 'pwsh.exe')),
    path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'native', 'powershell', 'pwsh.exe'),
    path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')];
  for (const file of candidates) if ((await fs.stat(file).catch(() => null))?.isFile()) return file;
  throw new Error('PowerShell est introuvable sur cet ordinateur.');
}
export function dimensions(cols, rows) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || cols > 500 || rows < 1 || rows > 200) throw new Error('Dimensions invalides.');
  return { cols, rows };
}
export function createTerminalPool(options) {
  const slots=new Map();
  const find=id=>[...slots.values()].find(item=>item.snapshot()?.id===id);
  return {
    async open(input={}) {
      const slot=input.slot||'main';if(typeof slot!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(slot))throw Error('Onglet invalide.');
      if(!slots.has(slot)){if(slots.size>=6)throw Error('Six terminaux maximum.');slots.set(slot,createTerminal(options));}
      return slots.get(slot).open(input);
    },
    snapshot:(slot='main')=>slots.get(slot)?.snapshot()||null,
    list:()=>[...slots].map(([slot,terminal])=>({slot,...terminal.snapshot()})),
    running:()=>[...slots.values()].some(item=>item.running()),
    write:(id,data)=>{const item=find(id);if(!item)throw Error('Session fermée.');return item.write(id,data);},
    ack:(id,count)=>find(id)?.ack(id,count),
    resize:(id,cols,rows)=>find(id)?.resize(id,cols,rows),
    stop:id=>find(id)?.stop(id),
    async remove(slot){const item=slots.get(slot);if(item?.running())await item.stop(item.snapshot().id);if(!item?.running())slots.delete(slot);return !slots.has(slot);},
    close:()=>{for(const item of slots.values())item.close();slots.clear();},
  };
}
export function createTerminal({ settings, appRoot, spawn, emit, confirm, locate = findPwsh }) {
  let session, opening = false;
  const snapshot = () => session ? { id: session.id, cwd: session.cwd, shell: session.shell, running: session.running, exitCode: session.exitCode, output: session.output, seq: session.seq } : null;
  const close = () => { const old = session; session = null; if (old?.running) { old.running = false; old.pty.kill(); } };
  return {
    snapshot,
    running: () => !!session?.running,
    async open(input = {}) {
      if (opening) throw new Error('Ouverture du terminal en cours.');
      opening = true;
      try {
        if (session && !input.restart && (input.project == null || input.project === session.project)) { session.pending = 0; session.pty.resume(); return snapshot(); }
        const size = dimensions(input.cols ?? 100, input.rows ?? 30);
        const cwd = input.project == null ? await fs.realpath(settings().projectsRoot) : await projectPath(settings().projectsRoot, input.project, appRoot);
        const shell = await locate();
        if (session?.running && !await confirm()) return snapshot();
        close();
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(ELECTRON_|NODE_OPTIONS$|NODE_EXTRA_CA_CERTS$|PSModulePath$)/i.test(key)));
        const args=/^(pwsh|powershell)(\.exe)?$/i.test(path.basename(shell))?['-NoLogo']:['-l'];
        const pty = spawn(shell, args, { ...size, name: 'xterm-256color', cwd, env: { ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }, ...(process.platform==='win32'?{useConpty:true}:{}) });
        const current = session = { id: randomUUID(), pty, cwd, shell, project: input.project, running: true, output: '', seq: 0, exitCode: null, pending: 0 };
        pty.onData(data => {
          if (session !== current) return;
          current.output = (current.output + data).slice(-1024 * 1024);
          current.pending += data.length;
          if (current.pending > 262144) pty.pause();
          emit({ id: current.id, seq: ++current.seq, data });
        });
        pty.onExit(({ exitCode }) => { if (session !== current) return; current.running = false; current.exitCode = exitCode; emit({ id: current.id, seq: ++current.seq, exitCode }); });
        return snapshot();
      } finally { opening = false; }
    },
    write(id, data) { if (session?.id !== id || !session.running) throw new Error('Session fermée.'); if (typeof data !== 'string' || data.length > 65536) throw new Error('Saisie trop longue.'); session.pty.write(data); },
    ack(id, count) { if(session?.id !== id || !Number.isInteger(count) || count < 0 || count > 1048576)return;session.pending=Math.max(0,session.pending-count);if(session.running && session.pending<65536)session.pty.resume(); },
    resize(id, cols, rows) { const size = dimensions(cols, rows); if (session?.id === id && session.running) session.pty.resize(size.cols, size.rows); },
    async stop(id) { if (session?.id !== id) return; if (session.running && !await confirm()) return; close(); },
    close,
  };
}
