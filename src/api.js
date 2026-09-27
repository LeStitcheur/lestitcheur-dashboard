import { readConsoleEvents } from './console-stream.js';

let token = '';
export function setToken(value) { token = value; }
export async function api(route, body) {
  const response = await fetch(`/api${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'X-Panel-Token': token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let result;
  try { result = await response.json(); } catch { throw new Error('Le serveur local ne répond pas. Relance LeStitcheur Control.'); }
  if (!response.ok) throw new Error(result.error || 'La requête a échoué.');
  return result;
}
export async function streamConsole(id, onEvent, signal) {
  const response = await fetch(`/api/pterodactyl/${encodeURIComponent(id)}/console`, { headers: { 'X-Panel-Token': token }, signal });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Connexion à la console impossible.');
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Le flux de la console est indisponible.');
  await readConsoleEvents(response.body, onEvent, signal);
}
