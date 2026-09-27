import { randomBytes, createHash } from 'node:crypto';

async function jsonResponse(response, provider) {
  if (response.status === 204) return null;
  if (!response.ok) {
    const message = response.status === 401 ? 'Connexion expirée ou clé invalide.' : response.status === 403 ? 'Accès refusé. Vérifie les permissions du compte.' : response.status === 404 ? 'Aucun appareil ou serveur actif trouvé.' : response.status === 429 ? 'Trop de requêtes. Patiente avant de réessayer.' : `Le service a répondu avec le code ${response.status}.`;
    throw new Error(`${provider} : ${message}`);
  }
  return response.json();
}
export function createPterodactyl(settings) {
  let cache = null, cachedAt = 0, pending = null, generation = 0;
  async function request(route, method = 'GET', body, signal) {
    const config = settings.get();
    if (!config.pteroUrl || !config.pteroKey) throw new Error('Connecte ton panel Pterodactyl dans les paramètres.');
    const key = await settings.secret('pteroKey');
    const response = await fetch(`${config.pteroUrl}/api/client${route}`, { method, headers: { Accept: 'application/vnd.pterodactyl.v1+json', Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
    return jsonResponse(response, 'Pterodactyl');
  }
  return {
    invalidate() { cache = null; cachedAt = 0; generation++; },
    async websocketCredentials(id, signal) {
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(id)) throw new Error('Identifiant de serveur invalide.');
      const origin = new URL(settings.get().pteroUrl || 'http://127.0.0.1').origin;
      const result = await request(`/servers/${id}/websocket`, 'GET', undefined, signal);
      const { socket, token } = result?.data || {};
      let url;
      try { url = new URL(socket); } catch { throw new Error('Adresse de console invalide renvoyée par Pterodactyl.'); }
      if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash || typeof token !== 'string' || !token || token.length > 16000) throw new Error('Connexion console invalide renvoyée par Pterodactyl.');
      // Ephemeral Wings credentials stay on the local backend.
      return { socket: url.href, token, origin };
    },
    async list() {
      if (!settings.get().pteroUrl || !settings.get().pteroKey) return { connected: false, servers: [] };
      if (cache && Date.now() - cachedAt < 15000) return cache;
      if (pending) return pending;
      const currentGeneration = generation;
      pending = (async () => {
        const all = [];
        let page = 1, total = 1;
        do {
          const result = await request(`?page=${page}`);
          all.push(...(result.data || []));
          total = result.meta?.pagination?.total_pages || 1; page++;
        } while (page <= total && page <= 100);
        const servers = [];
        for (let i = 0; i < all.length; i += 4) {
          const group = await Promise.all(all.slice(i, i + 4).map(async ({ attributes: server }) => {
            let stats, error;
            try { stats = (await request(`/servers/${encodeURIComponent(server.identifier)}/resources`)).attributes; } catch (err) { error = err.message; }
            return { id: server.identifier, name: server.name, description: server.description, node: server.node, status: stats?.current_state || 'unknown', cpu: stats?.resources?.cpu_absolute, memory: stats?.resources?.memory_bytes, disk: stats?.resources?.disk_bytes, limits: server.limits, suspended: server.is_suspended, error, panelUrl: `${settings.get().pteroUrl}/server/${encodeURIComponent(server.identifier)}` };
          }));
          servers.push(...group);
        }
        const value = { connected: true, servers };
        if (currentGeneration === generation) { cache = value; cachedAt = Date.now(); }
        return value;
      })().finally(() => { pending = null; });
      return pending;
    },
    async power(id, signal) {
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || !['start', 'stop', 'restart', 'kill'].includes(signal)) throw new Error('Commande serveur invalide.');
      await request(`/servers/${id}/power`, 'POST', { signal });
      cache = null;
      return {};
    },
    async command(id, command) {
      if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || typeof command !== 'string' || !command.trim() || command.length > 2000) throw new Error('Commande invalide.');
      await request(`/servers/${id}/command`, 'POST', { command });
      return {};
    },
  };
}

export function createSpotify(settings, origin) {
  const redirectUri = `${origin}/auth/spotify/callback`;
  const states = new Map();
  let refreshPromise = null, tokenCache = null, tokenCipher = null, retryAt = 0;
  async function readTokens() {
    if (!settings.get().spotifyTokens) throw new Error('Connecte ton compte Spotify dans les paramètres.');
    if (tokenCipher !== settings.get().spotifyTokens) {
      tokenCache = JSON.parse(await settings.secret('spotifyTokens'));
      tokenCipher = settings.get().spotifyTokens;
    }
    return tokenCache;
  }
  async function saveTokens(tokens) { await settings.secretSet('spotifyTokens', JSON.stringify(tokens)); tokenCache = tokens; tokenCipher = settings.get().spotifyTokens; }
  async function exchange(params) {
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(12000) });
    return jsonResponse(response, 'Spotify');
  }
  async function accessToken() {
    const tokens = await readTokens();
    if (tokens.expiresAt > Date.now() + 60000) return tokens.access_token;
    if (!refreshPromise) refreshPromise = (async () => {
      const fresh = await exchange({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: settings.get().spotifyClientId });
      const updated = { ...tokens, ...fresh, expiresAt: Date.now() + fresh.expires_in * 1000 };
      await saveTokens(updated); return updated.access_token;
    })().finally(() => { refreshPromise = null; });
    return refreshPromise;
  }
  async function request(route, method = 'GET') {
    if (Date.now() < retryAt) throw new Error('Spotify limite les requêtes. Réessaie dans quelques instants.');
    const token = await accessToken();
    const response = await fetch(`https://api.spotify.com/v1/me/player${route}`, { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
    if (response.status === 429) retryAt = Date.now() + Math.max(5, Number(response.headers.get('retry-after')) || 30) * 1000;
    if (response.status === 403) throw new Error('Spotify : contrôle refusé. Vérifie Spotify Premium et l’accès de ton compte à l’application Spotify.');
    return jsonResponse(response, 'Spotify');
  }
  return {
    redirectUri,
    authorize() {
      const clientId = settings.get().spotifyClientId;
      if (!clientId) throw new Error('Renseigne le Client ID Spotify dans les paramètres.');
      for (const [key, entry] of states) if (entry.expiry < Date.now()) states.delete(key);
      if (states.size >= 10) states.delete(states.keys().next().value);
      const state = randomBytes(32).toString('hex'), verifier = randomBytes(64).toString('base64url');
      states.set(state, { verifier, clientId, expiry: Date.now() + 600000 });
      const query = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, state, scope: 'user-read-playback-state user-read-currently-playing user-modify-playback-state', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
      return { url: `https://accounts.spotify.com/authorize?${query}` };
    },
    async callback(code, state) {
      const saved = states.get(state); states.delete(state);
      if (!saved || saved.expiry < Date.now() || saved.clientId !== settings.get().spotifyClientId || typeof code !== 'string') throw new Error('Autorisation Spotify expirée. Recommence la connexion.');
      const tokens = await exchange({ client_id: saved.clientId, grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: saved.verifier });
      await saveTokens({ ...tokens, expiresAt: Date.now() + tokens.expires_in * 1000 });
    },
    async state() {
      if (!settings.get().spotifyTokens) return { connected: false };
      const data = await request('');
      if (!data) return { connected: true, active: false };
      return { connected: true, active: true, playing: data.is_playing, progress: data.progress_ms, duration: data.item?.duration_ms, name: data.item?.name, artists: data.item?.artists?.map(a => a.name).join(', ') || data.item?.show?.name, image: data.item?.album?.images?.[0]?.url || data.item?.images?.[0]?.url, url: data.item?.external_urls?.spotify, device: data.device?.name, volume: data.device?.volume_percent, supportsVolume: data.device?.supports_volume !== false, shuffle: data.shuffle_state, repeat: data.repeat_state };
    },
    async control(action, value) {
      const routes = { play: ['/play', 'PUT'], pause: ['/pause', 'PUT'], next: ['/next', 'POST'], previous: ['/previous', 'POST'] };
      if (action === 'volume') {
        if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error('Volume invalide.');
        await request(`/volume?volume_percent=${value}`, 'PUT');
      } else if (action === 'shuffle') {
        if (typeof value !== 'boolean') throw new Error('Valeur invalide.');
        await request(`/shuffle?state=${value}`, 'PUT');
      } else if (action === 'repeat') {
        if (!['off', 'track', 'context'].includes(value)) throw new Error('Mode de répétition invalide.');
        await request(`/repeat?state=${value}`, 'PUT');
      } else if (routes[action]) await request(...routes[action]);
      else throw new Error('Commande Spotify inconnue.');
      return {};
    },
    async disconnect() { states.clear(); tokenCache = null; tokenCipher = null; await settings.secretSet('spotifyTokens', ''); return {}; },
  };
}
