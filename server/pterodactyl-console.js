import WebSocket from 'ws';

const OUTPUT_EVENTS = new Set(['console output', 'install output', 'transfer logs', 'daemon message', 'daemon error']);

// One authenticated Wings socket per open console. The browser receives events,
// never the API key, JWT, or an unrestricted WebSocket proxy.
export function connectConsole({ getCredentials, onEvent, onEnd = () => {}, signal, retryDelay = 1000, maxRetries = 5, authTimeout = 15000, heartbeatInterval = 30000 }) {
  let closed = false, socket = null, reconnectTimer, authTimer, heartbeat;
  let attempts = 0, revision = 0, credentialsRequest, authenticated = false;
  let refreshing = false, socketUrl = '', historyRequested = false, lastPong = Date.now();
  const controller = new AbortController();
  const emit = (type, data) => { if (!closed) onEvent({ type, ...data }); };

  function disposeSocket() {
    clearTimeout(authTimer); clearInterval(heartbeat);
    const previous = socket; socket = null; authenticated = false;
    if (previous && previous.readyState !== WebSocket.CLOSED) previous.terminate();
  }
  function close() {
    if (closed) return;
    closed = true; revision++;
    controller.abort(); credentialsRequest?.abort();
    clearTimeout(reconnectTimer); disposeSocket();
    signal?.removeEventListener('abort', close);
    onEnd();
  }
  function fail(message) {
    emit('error', { message }); emit('connection', { state: 'error' }); close();
  }
  function reconnect(message) {
    if (closed) return;
    revision++; credentialsRequest?.abort(); refreshing = false;
    disposeSocket(); clearTimeout(reconnectTimer);
    if (attempts >= maxRetries) return fail('La console est inaccessible. Vérifie que Wings est joignable depuis ce PC, puis reconnecte la console.');
    const delay = Math.min(retryDelay * 2 ** attempts, 15000);
    attempts++;
    emit('connection', { state: 'reconnecting', attempt: attempts, message });
    reconnectTimer = setTimeout(connect, delay);
  }
  function send(event, args = []) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, args }));
  }
  async function credentials() {
    credentialsRequest?.abort();
    credentialsRequest = new AbortController();
    return getCredentials(AbortSignal.any([controller.signal, credentialsRequest.signal]));
  }
  function waitForAuth() {
    clearTimeout(authTimer);
    authTimer = setTimeout(() => reconnect('Le serveur ne confirme pas la connexion.'), authTimeout);
  }
  async function refreshToken(expired = false) {
    if (closed || refreshing) return;
    const currentRevision = revision;
    refreshing = true;
    if (expired) { authenticated = false; emit('connection', { state: 'authenticating' }); }
    try {
      const fresh = await credentials();
      if (closed || currentRevision !== revision) return;
      if (fresh.socket !== socketUrl) return reconnect('Le serveur a changé de nœud.');
      send('auth', [fresh.token]); waitForAuth();
    } catch {
      if (!closed && currentRevision === revision) reconnect('Renouvellement de la session en cours.');
    }
  }
  async function connect() {
    if (closed) return;
    const currentRevision = ++revision;
    emit('connection', { state: attempts ? 'reconnecting' : 'connecting', attempt: attempts });
    historyRequested = false;
    let fresh;
    try { fresh = await credentials(); }
    catch {
      if (!closed && currentRevision === revision) reconnect('Impossible d’obtenir une session console. Vérifie la connexion au panel et la permission websocket.connect.');
      return;
    }
    if (closed || currentRevision !== revision) return;
    socketUrl = fresh.socket;
    let ws;
    try {
      ws = new WebSocket(fresh.socket, { origin: fresh.origin, handshakeTimeout: 12000, maxPayload: 1024 * 1024, perMessageDeflate: false, followRedirects: false });
    } catch { reconnect('Adresse de console indisponible.'); return; }
    socket = ws;
    const current = () => !closed && socket === ws && revision === currentRevision;
    ws.on('open', () => {
      if (!current()) return;
      lastPong = Date.now();
      emit('connection', { state: 'authenticating' });
      send('auth', [fresh.token]); fresh = null;
      waitForAuth();
      heartbeat = setInterval(() => {
        if (!current()) return;
        if (Date.now() - lastPong > heartbeatInterval * 2) return reconnect('Connexion interrompue.');
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, heartbeatInterval);
    });
    ws.on('pong', () => { lastPong = Date.now(); });
    ws.on('message', (raw, isBinary) => {
      if (!current() || isBinary) return;
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!message || typeof message.event !== 'string') return;
      const args = Array.isArray(message.args) ? message.args.filter(value => typeof value === 'string') : [];
      if (message.event === 'auth success') {
        clearTimeout(authTimer); refreshing = false; authenticated = true; attempts = 0;
        emit('connection', { state: 'connected' });
        if (!historyRequested) {
          // A reconnect replaces the old view before replaying Wings' log tail.
          // Token refresh keeps the current history and never replays it twice.
          historyRequested = true; emit('history-reset', {}); send('send logs');
        }
      } else if (message.event === 'token expiring') { void refreshToken(); }
      else if (message.event === 'token expired') { void refreshToken(true); }
      else if (message.event === 'jwt error') {
        if (args.some(value => /exp claim|denylist|expired/i.test(value))) {
          if (refreshing) reconnect('La session console n’a pas pu être renouvelée.');
          else void refreshToken(true);
        }
        else fail('Connexion console refusée par Wings. Vérifie les permissions de ton compte Pterodactyl.');
      } else if (authenticated && OUTPUT_EVENTS.has(message.event)) {
        for (const text of args) emit('output', { text, source: message.event });
      } else if (authenticated && message.event === 'status') {
        if (['offline', 'starting', 'running', 'stopping'].includes(args[0])) emit('status', { state: args[0] });
      } else if (authenticated && message.event === 'error') {
        emit('notice', { message: args[0]?.slice(0, 4000) || 'Wings a signalé une erreur.' });
      } else if (authenticated && message.event === 'transfer status') {
        if (args[0] === 'success') reconnect('Transfert terminé, connexion au nouveau nœud.');
      }
    });
    ws.on('error', () => { if (current()) reconnect('Connexion à Wings impossible. Vérifie son adresse et son port.'); });
    ws.on('close', () => { if (current()) reconnect('La connexion à la console a été interrompue.'); });
  }
  signal?.addEventListener('abort', close, { once: true });
  if (signal?.aborted) close();
  else void connect();
  return { close };
}

export function createConsoleHub(ptero) {
  const connections = new Set();
  return {
    disconnectAll() { for (const disconnect of connections) disconnect(); },
    stream(req, res) {
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(req.params.id)) return res.status(400).json({ error: 'Identifiant de serveur invalide.' });
      if (connections.size >= 8) return res.status(429).json({ error: 'Ferme une console avant d’en ouvrir une autre (8 connexions maximum).' });
      const controller = new AbortController();
      const disconnect = () => controller.abort();
      connections.add(disconnect);
      res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
      res.flushHeaders();
      req.socket.setTimeout(0);
      const send = event => {
        if (res.destroyed || res.writableEnded) return disconnect();
        // Bound buffering for a hidden or stalled browser, instead of growing RAM.
        if (res.writableLength > 2 * 1024 * 1024) return disconnect();
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      const heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write(': heartbeat\n\n'); }, 15000);
      res.on('close', disconnect);
      connectConsole({
        getCredentials: signal => ptero.websocketCredentials(req.params.id, signal), signal: controller.signal, onEvent: send,
        onEnd: () => { clearInterval(heartbeat); connections.delete(disconnect); res.off('close', disconnect); if (!res.writableEnded) res.end(); },
      });
    },
  };
}
