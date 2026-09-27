import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveLaragon } from '../server/laragon.js';
import { createServices } from '../server/services.js';
import { createJobs } from '../server/jobs.js';
import { findNodeRuntime } from '../server/node-runtime.js';
import { externalUrl } from '../desktop/navigation.js';

test('Laragon reuses the existing database and daemon, with its own configuration and port', async t => {
  const parent = path.resolve('.local/test-fixtures');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'laragon-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(root)), parent); await fs.rm(root, { recursive: true, force: true }); });
  const version = 'mysql-8.4.3-winx64';
  const base = path.join(root, 'bin', 'mysql', version);
  const data = path.join(root, 'data', 'existing database');
  await fs.mkdir(path.join(base, 'bin'), { recursive: true });
  await fs.mkdir(path.join(data, 'mysql'), { recursive: true });
  await fs.writeFile(path.join(base, 'bin', 'mysqld.exe'), 'fixture only, never executed');
  await fs.writeFile(path.join(data, 'keep.txt'), 'original data');
  await fs.writeFile(path.join(base, 'my.ini'), `[client]\nport=1\n[mysqld]\ndatadir="${data.replaceAll('\\', '/')}"\nport=3327\n`);
  const resolved = await resolveLaragon(root);
  assert.equal(resolved.exe, path.join(base, 'bin', 'mysqld.exe'));
  assert.equal(resolved.dataDir, data);
  assert.equal(resolved.port, 3327);
  assert.equal(resolved.args[0], `--defaults-file=${path.join(base, 'my.ini')}`);
  assert.ok(resolved.args.includes(`--datadir=${data}`));
  assert.ok(resolved.args.every(arg => !arg.includes('--initialize')));
  const services = createServices({ get: () => ({ mysqlMode: 'laragon', laragonRoot: root, mysqlPort: 1, fivemPort: 1, txAdminPort: 1, fivemExe: '' }) }, createJobs());
  const status = await services.status();
  assert.equal(status.mysqlConfigured, true);
  assert.equal(status.mysqlPort, 3327);
  assert.equal(status.laragon.dataDir, data);
  await fs.mkdir(path.join(root, 'bin', 'mysql', 'mysql-another'));
  await assert.rejects(resolveLaragon(root), /version/);
  assert.equal((await resolveLaragon(root, version)).version, version);
  await assert.rejects(resolveLaragon(root, '../outside'), /introuvable/);
  await fs.writeFile(path.join(base, 'my.ini'), `[mysqld]\ndatadir="${path.join(root, 'missing')}"`);
  await assert.rejects(resolveLaragon(root, version), /Base Laragon existante introuvable/);
  assert.equal(await fs.readFile(path.join(data, 'keep.txt'), 'utf8'), 'original data');
  await assert.rejects(fs.access(path.join(root, 'missing')));
  await fs.writeFile(path.join(base, 'my.ini'), '!include secret.ini');
  await assert.rejects(resolveLaragon(root, version), /inclusion/);
});

test('packaged app project commands use installed Node, never the Electron executable', () => {
  const base = path.resolve('.local/node-fixture');
  const node = path.join(base, process.platform === 'win32' ? 'node.exe' : 'node');
  const npm = path.join(base, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const result = findNodeRuntime({ execPath: path.join(base, 'LeStitcheur Control.exe'), electron: true, env: { Path: base }, exists: file => [node, npm].includes(file) });
  assert.equal(result.node, node);
  assert.equal(result.npm, npm);
  assert.ok(result.env.PATH.startsWith(base));
  assert.throws(() => findNodeRuntime({ electron: true, env: {}, exists: () => false }), /Installe Node.js/);
});

test('external navigation permits web links but blocks OS handlers and embedded credentials', () => {
  for (const url of ['file:///C:/Windows/System32/cmd.exe', 'javascript:alert(1)', 'powershell:bad', 'ms-settings:bad', 'https://user:pass@example.com/', 'not a URL']) assert.equal(externalUrl(url), null);
  assert.equal(externalUrl('http://127.0.0.1:40120/'), 'http://127.0.0.1:40120/');
  assert.equal(externalUrl('https://accounts.spotify.com/authorize?state=example'), 'https://accounts.spotify.com/authorize?state=example');
});
