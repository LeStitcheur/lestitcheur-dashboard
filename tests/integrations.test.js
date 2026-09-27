import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createPterodactyl, createSpotify } from '../server/integrations.js';
import { createServices, probe, waitReady } from '../server/services.js';
import { createJobs } from '../server/jobs.js';

function fakeSettings(values = {}) {
  const config = { ...values };
  return { get: () => config, secret: async key => config[key], secretSet: async (key, value) => { config[key] = value; } };
}
test('MySQL readiness validates protocol greeting instead of accepting any open port', async t => {
  let greeting = Buffer.from('HTTP/1.1 200 OK\r\n');
  const server = net.createServer(socket => { socket.on('error', () => {}); socket.end(greeting); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  assert.equal(await probe(port, true), false);
  greeting = Buffer.from([3, 0, 0, 0, 10, 56, 0]);
  assert.equal(await probe(port, true), true);
});
test('readiness times out; a failed MySQL configuration prevents FiveM startup', async () => {
  await assert.rejects(waitReady(async () => false, { timeout: 10, delay: 2 }), /délai/);
  const jobs = createJobs();
  const service = createServices(fakeSettings({ mysqlPort: 1, mysqlMode: 'executable', mysqlExe: '', fivemExe: 'must-never-launch.exe' }), jobs);
  const { jobId } = service.start('stack');
  await waitReady(() => jobs.find(jobId).status !== 'running', { timeout: 3000, delay: 10 });
  assert.equal(jobs.find(jobId).status, 'error');
  assert.match(jobs.find(jobId).output, /mysqld.exe/);
  assert.doesNotMatch(jobs.find(jobId).output, /Lancement FiveM/);
});
test('Pterodactyl handles all pages, resources and validated power signals', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/power')) return new Response(null, { status: 204 });
    if (url.includes('/resources')) return Response.json({ attributes: { current_state: 'running', resources: { cpu_absolute: 12, memory_bytes: 1024 } } });
    const page = new URL(url).searchParams.get('page');
    return Response.json({ data: [{ attributes: { identifier: `server${page}`, name: `Server ${page}`, node: 'VPS', limits: { memory: 1024 } } }], meta: { pagination: { total_pages: 2 } } });
  });
  const ptero = createPterodactyl(fakeSettings({ pteroUrl: 'https://panel.example.com', pteroKey: 'test-key' }));
  const result = await ptero.list();
  assert.equal(result.servers.length, 2);
  assert.equal(result.servers[0].status, 'running');
  assert.equal(result.servers[0].cpu, 12);
  const before = calls.length; await ptero.list(); assert.equal(calls.length, before);
  await ptero.power('server1', 'restart');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { signal: 'restart' });
  await assert.rejects(ptero.power('../oops', 'start'));
  await assert.rejects(ptero.power('server1', 'delete'));
});
test('Spotify PKCE validates state, handles token refresh and maps playback controls', async t => {
  const calls = [];
  let accessCount = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/api/token')) return Response.json({ access_token: `token-${++accessCount}`, refresh_token: 'refresh-test', expires_in: accessCount === 1 ? 0 : 3600 });
    if (options.method === 'PUT' || options.method === 'POST') return new Response(null, { status: 204 });
    return Response.json({ is_playing: true, progress_ms: 1000, item: { name: 'Test Track', duration_ms: 123000, artists: [{ name: 'Test Artist' }], album: { images: [] } }, device: { name: 'Test PC', volume_percent: 50 } });
  });
  const settings = fakeSettings({ spotifyClientId: 'client-test', spotifyTokens: '' });
  const spotify = createSpotify(settings, 'http://127.0.0.1:4317');
  const url = new URL(spotify.authorize().url);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:4317/auth/spotify/callback');
  await assert.rejects(spotify.callback('code', 'bad-state'), /expirée/);
  assert.equal(calls.length, 0);
  const state = url.searchParams.get('state');
  await spotify.callback('code', state);
  await assert.rejects(spotify.callback('code', state), /expirée/);
  const playback = await spotify.state();
  assert.equal(playback.name, 'Test Track');
  assert.equal(accessCount, 2);
  await spotify.control('volume', 65);
  assert.match(calls.at(-1).url, /volume_percent=65$/);
  await assert.rejects(spotify.control('volume', 999));
  await spotify.disconnect();
  assert.deepEqual(await spotify.state(), { connected: false });
});
test('jobs enforce project locks and retain command failures', async () => {
  const jobs = createJobs(); let release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = jobs.create('Test lock', async log => { log('hello\n'); await pending; throw new Error('expected failure'); }, 'project');
  assert.throws(() => jobs.create('Duplicate', async () => {}, 'project'), /déjà/);
  release();
  await waitReady(() => jobs.find(first.jobId).status !== 'running', { timeout: 1000, delay: 5 });
  assert.equal(jobs.find(first.jobId).status, 'error');
  assert.match(jobs.find(first.jobId).output, /expected failure/);
  assert.equal(jobs.active('project'), false);
});
