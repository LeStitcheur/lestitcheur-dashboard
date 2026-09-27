import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, seal, unseal } from '../server/platform.js';
import { deployPlan, createProjects } from '../server/projects.js';
import { createJobs } from '../server/jobs.js';
import { createSettings } from '../server/settings.js';

const parent = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.local/test-fixtures');
async function fixture(t) {
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'projects-'));
  t.after(async () => { assert.equal(path.dirname(path.resolve(root)), parent); await fs.rm(root, { recursive: true, force: true }); });
  return root;
}
test('GitHub publication requires a clean committed branch and validates every push URL', async t => {
  const root = await fixture(t);
  const git = args => run('git', args, root);
  await git(['init', '--initial-branch=main']);
  await git(['-c', 'user.name=Panel Test', '-c', 'user.email=panel-test@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=disabled-test-hooks', 'commit', '--allow-empty', '-m', 'Test fixture']);
  await git(['remote', 'add', 'origin', 'https://github.com/test-owner/test-repo.git']);
  const plan = await deployPlan(root);
  assert.equal(plan.branch, 'main');
  assert.equal(plan.fingerprint.length, 64);
  await fs.writeFile(path.join(root, 'untracked.txt'), 'uncommitted');
  await assert.rejects(deployPlan(root), /commitées/);
  await fs.unlink(path.join(root, 'untracked.txt'));
  await git(['config', '--add', 'remote.origin.pushurl', 'https://github.com/test-owner/test-repo.git']);
  await git(['config', '--add', 'remote.origin.pushurl', 'https://other.example/private.git']);
  await assert.rejects(deployPlan(root), /unique remote/);
});
test('rename preserves files, prevents collisions, and requires the folder name for deletion', async t => {
  const root = await fixture(t), app = path.join(root, 'panel'), project = path.join(root, 'demo');
  await fs.mkdir(app); await fs.mkdir(project); await fs.mkdir(path.join(root, 'exists'));
  await fs.writeFile(path.join(project, 'keep.txt'), 'do not lose me');
  const projects = createProjects({ get: () => ({ projectsRoot: root }) }, createJobs(), app);
  await assert.rejects(projects.action('demo', 'rename', { newName: 'exists' }), /déjà/);
  await assert.rejects(projects.action('demo', 'delete', { confirm: 'wrong' }), /Recopie/);
  await projects.action('demo', 'rename', { newName: 'renamed' });
  assert.equal(await fs.readFile(path.join(root, 'renamed', 'keep.txt'), 'utf8'), 'do not lose me');
  await assert.rejects(projects.action('panel', 'rename', { newName: 'nope' }), /protégé/);
});
test('Windows vault encrypts secrets and settings never expose them', { skip: process.platform !== 'win32' }, async t => {
  const dummy = 'panel-test-not-a-real-secret';
  const encrypted = await seal(dummy);
  assert.notEqual(encrypted, dummy);
  assert.equal(encrypted.includes(dummy), false);
  assert.equal(await unseal(encrypted), dummy);
  const root = await fixture(t);
  const settings = await createSettings(root);
  await settings.update({ projectsRoot: root, pteroUrl: 'https://panel.example.com', pteroKey: dummy });
  assert.equal(settings.public().pteroKey, undefined);
  assert.equal(settings.public().pteroConfigured, true);
  const raw = await fs.readFile(path.join(root, 'settings.json'), 'utf8');
  assert.equal(raw.includes(dummy), false);
  const restored = await createSettings(root);
  assert.equal(await restored.secret('pteroKey'), dummy);
});
