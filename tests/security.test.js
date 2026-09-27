import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validName, projectPath, githubRemote, validatePanelUrl, requestAllowed } from '../server/security.js';
import { psQuote, psEncoded } from '../server/platform.js';

const fixtureParent = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local/test-fixtures');
async function fixture(t) {
  await fs.mkdir(fixtureParent, { recursive: true });
  const root = await fs.mkdtemp(path.join(fixtureParent, 'paths-'));
  t.after(async () => {
    const absolute = path.resolve(root);
    assert.equal(path.dirname(absolute), fixtureParent);
    await fs.rm(absolute, { recursive: true, force: true });
  });
  return root;
}
test('rejects traversal, Windows device names, ambiguous names and control characters', () => {
  for (const name of ['..', '../outside', '..\\outside', '.hidden', 'NUL', 'Con.txt', 'COM1.foo', 'LPT9', 'a:b', 'trailing.', ' x', 'x ', 'a\n.exe', '', 'a/b', 'a\\b']) assert.equal(validName(name), false, name);
  for (const name of ['lestitcheur', 'Mon projet', "l'atelier", 'samd-candid', 'projet_été']) assert.equal(validName(name), true, name);
});
test('contains project operations within the real root and protects the running dashboard', async t => {
  const root = await fixture(t);
  const project = path.join(root, 'project'), self = path.join(root, 'panel');
  await fs.mkdir(project); await fs.mkdir(self);
  assert.equal(await projectPath(root, 'project', self, true), await fs.realpath(project));
  await assert.rejects(projectPath(root, '../outside', self), /invalide/);
  await assert.rejects(projectPath(root, 'panel', self, true), /protégé/);
  const file = path.join(root, 'file'); await fs.writeFile(file, 'hello');
  await assert.rejects(projectPath(root, 'file', self), /géré/);
  await fs.symlink(project, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(projectPath(root, 'linked', self, true), /géré/);
});
test('remote validation permits GitHub remotes and excludes credential URLs or other hosts', () => {
  for (const value of ['https://github.com/user/repo.git', 'git@github.com:user/repo.git', 'ssh://git@github.com/user/repo.git']) assert.equal(githubRemote(value), true);
  for (const value of ['https://token@github.com/u/r.git', 'https://github.com.evil/u/r', 'file:///tmp/repo', 'git@evil.com:u/r', 'https://github.com/u/r\nhttps://evil.com/x', '--help']) assert.equal(githubRemote(value), false);
});
test('panel URLs accept HTTP and HTTPS without credentials, query strings or fragments', () => {
  assert.equal(validatePanelUrl('https://panel.example.com/'), 'https://panel.example.com');
  assert.equal(validatePanelUrl('http://panel.example.com/'), 'http://panel.example.com');
  assert.equal(validatePanelUrl('http://192.168.1.10:8080/panel/'), 'http://192.168.1.10:8080/panel');
  for (const value of ['ftp://panel.example.com', 'http://user:pass@panel.example.com', 'https://user:pass@panel.example.com', 'http://panel.example.com?token=abc', 'https://panel.example.com?token=abc', 'http://panel.example.com/#fragment', 'javascript:alert(1)']) assert.throws(() => validatePanelUrl(value));
});
test('API requires the exact loopback host and rejects cross-origin browser requests', () => {
  const req = headers => ({ headers: { host: '127.0.0.1:4317', ...headers } });
  assert.equal(requestAllowed(req({ origin: 'http://127.0.0.1:4317' }), 4317), true);
  assert.equal(requestAllowed(req({ origin: 'https://evil.example' }), 4317), false);
  assert.equal(requestAllowed(req({ host: 'evil.example:4317' }), 4317), false);
  assert.equal(requestAllowed(req({ 'sec-fetch-site': 'cross-site' }), 4317), false);
});
test('PowerShell quoting keeps special characters as literal data', () => {
  assert.equal(psQuote("C:\\dev\\l'atelier $(evil); &"), "'C:\\dev\\l''atelier $(evil); &'");
  const command = "Set-Location -LiteralPath 'C:\\projet été'";
  assert.equal(Buffer.from(psEncoded(command), 'base64').toString('utf16le'), command);
});
