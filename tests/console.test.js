import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocketServer } from 'ws';
import express from 'express';
import { connectConsole, createConsoleHub } from '../server/pterodactyl-console.js';
import { createPterodactyl } from '../server/integrations.js';
import { readConsoleEvents } from '../src/console-stream.js';
import { waitReady } from '../server/services.js';

async function wings(t, connection) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  server.on('connection', connection);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { for (const client of server.clients) client.terminate(); return new Promise(resolve => server.close(resolve)); });
  return { server, url: `ws://127.0.0.1:${server.address().port}/api/servers/test/ws` };
}
const emit = (socket, event, ...args) => socket.send(JSON.stringify({ event, args }));
const until = check => waitReady(check, { timeout: 3000, delay: 10 });

test('console authenticates, replays logs, forwards live output and renews credentials without duplicate history', async t => {
  const events = [], requests = [];
  let credentialCalls = 0, receivedOrigin, upstream, ended = 0;
  const { url, server } = await wings(t, (socket, req) => {
    upstream = socket; receivedOrigin = req.headers.origin;
    emit(socket, 'console output', 'must not be forwarded before authentication');
    socket.on('message', raw => {
      const message = JSON.parse(raw); requests.push(message);
      if (message.event === 'auth') {
        emit(socket, 'auth success'); emit(socket, 'status', 'running');
      } else if (message.event === 'send logs') {
        emit(socket, 'console output', '\x1b[32mServeur démarré\x1b[0m');
        emit(socket, 'install output', 'Installation prête');
      }
    });
  });
  const abort = new AbortController(); t.after(() => abort.abort());
  connectConsole({ getCredentials: async () => ({ socket: url, token: `private-token-${++credentialCalls}`, origin: 'http://panel.example:8080' }), onEvent: event => events.push(event), onEnd: () => ended++, signal: abort.signal });
  await until(() => events.some(event => event.text === 'Installation prête'));
  assert.equal(receivedOrigin, 'http://panel.example:8080');
  assert.equal(requests[0].event, 'auth');
  assert.equal(requests[1].event, 'send logs');
  assert.ok(events.some(event => event.type === 'status' && event.state === 'running'));
  assert.ok(events.some(event => event.text?.includes('\x1b[32m')));
  assert.equal(events.some(event => event.text?.includes('must not be forwarded')), false);
  emit(upstream, 'token expiring'); emit(upstream, 'token expiring');
  await until(() => requests.filter(item => item.event === 'auth').length === 2);
  emit(upstream, 'console output', 'Still live after token renewal');
  await until(() => events.some(event => event.text === 'Still live after token renewal'));
  assert.equal(credentialCalls, 2);
  assert.equal(requests.filter(item => item.event === 'send logs').length, 1);
  assert.equal(events.filter(item => item.type === 'history-reset').length, 1);
  assert.equal(JSON.stringify(events).includes('private-token-'), false);
  abort.abort();
  await until(() => server.clients.size === 0);
  assert.equal(ended, 1);
});

test('console reconnects with new credentials and replaces the log tail on a new socket', async t => {
  const events = [];
  let connections = 0, credentials = 0;
  const { url } = await wings(t, socket => {
    const number = ++connections;
    socket.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.event === 'auth') emit(socket, 'auth success');
      if (message.event === 'send logs') {
        emit(socket, 'console output', `connection-${number}`);
        if (number === 1) socket.close();
      }
    });
  });
  const abort = new AbortController(); t.after(() => abort.abort());
  connectConsole({ getCredentials: async () => ({ socket: url, token: `token-${++credentials}`, origin: 'https://panel.example' }), onEvent: event => events.push(event), signal: abort.signal, retryDelay: 5 });
  await until(() => events.some(event => event.text === 'connection-2'));
  assert.equal(credentials, 2);
  assert.equal(events.filter(event => event.type === 'history-reset').length, 2);
  assert.ok(events.some(event => event.type === 'connection' && event.state === 'reconnecting'));
});

test('closing a console during authorization prevents a late WebSocket connection', async t => {
  let connections = 0, release, ended = 0;
  const { url } = await wings(t, () => connections++);
  const pending = new Promise(resolve => { release = resolve; });
  const abort = new AbortController();
  const events = [];
  connectConsole({ getCredentials: async () => pending, onEvent: event => events.push(event), onEnd: () => ended++, signal: abort.signal });
  abort.abort();
  release({ socket: url, token: 'never-sent', origin: 'https://panel.example' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(connections, 0);
  assert.equal(ended, 1);
  assert.equal(events.some(event => event.state === 'connected'), false);
});

test('console stops after a bounded number of failed authorization attempts without exposing errors or credentials', async () => {
  let calls = 0, ended = 0;
  const events = [];
  connectConsole({ getCredentials: async () => { calls++; throw new Error('secret-api-key-do-not-leak'); }, onEvent: event => events.push(event), onEnd: () => ended++, maxRetries: 2, retryDelay: 5 });
  await until(() => ended === 1);
  assert.equal(calls, 3);
  assert.ok(events.some(event => event.type === 'error'));
  assert.equal(JSON.stringify(events).includes('secret-api-key'), false);
});

test('console rejects invalid JWT permissions and closes the socket', async t => {
  const events = []; let ended = 0;
  const { url, server } = await wings(t, socket => socket.on('message', () => emit(socket, 'jwt error', 'permission denied')));
  connectConsole({ getCredentials: async () => ({ socket: url, token: 'bad-permissions', origin: 'https://panel.example' }), onEvent: event => events.push(event), onEnd: () => ended++ });
  await until(() => ended === 1 && server.clients.size === 0);
  assert.ok(events.some(event => event.type === 'error' && /permissions/.test(event.message)));
});

test('Pterodactyl fetches scoped WebSocket credentials and validates the advertised socket URL', async t => {
  let destination = 'ws://wings.example:8080/api/servers/test/ws';
  let requestUrl;
  t.mock.method(globalThis, 'fetch', async url => { requestUrl = url; return Response.json({ data: { token: 'temporary-jwt', socket: destination } }); });
  const client = createPterodactyl({ get: () => ({ pteroUrl: 'http://panel.example:8080', pteroKey: 'encrypted-key' }), secret: async () => 'test-key' });
  assert.deepEqual(await client.websocketCredentials('abc123'), { token: 'temporary-jwt', socket: destination, origin: 'http://panel.example:8080' });
  assert.equal(requestUrl, 'http://panel.example:8080/api/client/servers/abc123/websocket');
  await assert.rejects(client.websocketCredentials('../oops'), /invalide/);
  for (const invalid of ['https://wings.example/socket', 'ws://user:pass@wings.example/socket', 'file:///socket', 'ws://wings.example/socket#fragment']) {
    destination = invalid; await assert.rejects(client.websocketCredentials('abc123'), /invalide/);
  }
  destination = 'wss://wings.example/socket';
  assert.equal((await client.websocketCredentials('abc123')).socket, destination);
});

test('console event parser survives fragmented UTF-8, CRLF frames and keepalives', async () => {
  const events = [];
  const text = ': heartbeat\r\n\r\ndata: ' + JSON.stringify({ type: 'output', text: 'Démarré 🎮\nDeuxième ligne' }) + '\r\n\r\ndata: ' + JSON.stringify({ type: 'status', state: 'running' }) + '\n\n';
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  await readConsoleEvents(stream, event => events.push(event));
  assert.deepEqual(events, [{ type: 'output', text: 'Démarré 🎮\nDeuxième ligne' }, { type: 'status', state: 'running' }]);
});

test('console event parser cancels its reader when the window closes', async () => {
  const abort = new AbortController(); let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const reading = readConsoleEvents(stream, () => assert.fail('No event expected'), abort.signal);
  abort.abort(); await reading;
  assert.equal(cancelled, true);
});

test('closing the HTTP log stream releases the upstream Wings socket', async t => {
  const { server: upstream, url } = await wings(t, socket => socket.on('message', raw => {
    const message = JSON.parse(raw);
    if (message.event === 'auth') emit(socket, 'auth success');
    if (message.event === 'send logs') emit(socket, 'console output', 'Live through SSE');
  }));
  const hub = createConsoleHub({ websocketCredentials: async () => ({ socket: url, token: 'upstream-only-token', origin: 'https://panel.example' }) });
  const app = express();
  app.get('/console/:id', (req, res) => hub.stream(req, res));
  const http = app.listen(0, '127.0.0.1');
  await new Promise(resolve => http.once('listening', resolve));
  t.after(() => { hub.disconnectAll(); http.closeAllConnections(); return new Promise(resolve => http.close(resolve)); });
  const abort = new AbortController();
  const response = await fetch(`http://127.0.0.1:${http.address().port}/console/abc123`, { signal: abort.signal });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const events = [];
  await readConsoleEvents(response.body, event => { events.push(event); if (event.type === 'output') abort.abort(); }, abort.signal);
  await until(() => upstream.clients.size === 0);
  assert.ok(events.some(event => event.text === 'Live through SSE'));
  assert.equal(JSON.stringify(events).includes('upstream-only-token'), false);
});

test('a rejected refresh reconnects with backoff instead of repeatedly requesting tokens', async t => {
  let credentials = 0, ended = 0;
  const events = [];
  const { url } = await wings(t, socket => {
    socket.on('message', raw => { if (JSON.parse(raw).event === 'auth') emit(socket, 'jwt error', 'jwt: exp claim is invalid'); });
  });
  connectConsole({ getCredentials: async () => ({ socket: url, token: `token-${++credentials}`, origin: 'https://panel.example' }), onEvent: event => events.push(event), onEnd: () => ended++, maxRetries: 1, retryDelay: 5 });
  await until(() => ended === 1);
  assert.equal(credentials, 4);
  assert.ok(events.some(event => event.state === 'reconnecting'));
});
