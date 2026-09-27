import path from 'node:path';
import { existsSync } from 'node:fs';

// Electron's process.execPath is the dashboard executable, not Node.js.
export function findNodeRuntime({ execPath = process.execPath, electron = !!process.versions.electron, env = process.env, exists = existsSync } = {}) {
  const envPath = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  const directories = [
    ...(!electron ? [path.dirname(execPath)] : []),
    ...envPath.split(path.delimiter).map(value => value.replace(/^"|"$/g, '')).filter(value => path.isAbsolute(value)),
    path.join(env.ProgramFiles || 'C:\\Program Files', 'nodejs'),
    ...(env.LOCALAPPDATA ? [path.join(env.LOCALAPPDATA, 'Programs', 'nodejs')] : []),
    ...(process.platform!=='win32'?['/opt/homebrew/bin','/usr/local/bin','/usr/bin']:[]),
  ];
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  for (const directory of [...new Set(directories)]) {
    const node = path.join(directory, nodeName);
    const npm = [path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),path.join(directory,'..','lib','node_modules','npm','bin','npm-cli.js'),'/usr/share/nodejs/npm/bin/npm-cli.js', ...(env.APPDATA ? [path.join(env.APPDATA, 'npm', 'node_modules', 'npm', 'bin', 'npm-cli.js')] : [])].find(exists);
    if (exists(node) && npm) return { node, npm, env: { PATH: [directory, envPath].filter(Boolean).join(path.delimiter) } };
  }
  throw new Error('Installe Node.js avec npm pour analyser ou construire tes projets. Le dashboard fonctionne sans cette installation.');
}
