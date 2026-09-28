import {createGithub} from './github.js';
import {createAccess} from './access.js';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createSettings } from './settings.js';
import { createProjects } from './projects.js';
import { createJobs } from './jobs.js';
import { createServices } from './services.js';
import { createPterodactyl, createSpotify } from './integrations.js';
import { requestAllowed } from './security.js';
import { terminal } from './platform.js';
import { createConsoleHub } from './pterodactyl-console.js';
import { createDesktopSpotify } from './spotify-desktop.js';
import { createCloud } from './cloud.js';
import { socialUrl } from './social.js';
import { createDiscord } from './discord.js';
import { createCodexSummary } from './codex.js';
import { createWorkspace } from './workspace.js';
import { workspaceRoutes } from './workspace-routes.js';

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function createApp({ port = 4317, dataDir = path.join(APP_ROOT, '.local'), dev = false, desktop = false, onSpotifyConnected, openSocial, terminalRunning = () => false, requireAuth = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  const origin = `http://127.0.0.1:${port}`;
  const token = randomBytes(32).toString('hex');
  const settings = await createSettings(dataDir);
  const workspace = await createWorkspace(dataDir);
  const access=requireAuth?await createAccess({directory:dataDir,origin}):null;
  const jobs = createJobs(entry=>workspace.notify({...entry,source:entry.details?.source||'activity'}));
  const projects = createProjects(settings, jobs, APP_ROOT);
  const services = createServices(settings, jobs);
  const ptero = createPterodactyl(settings);
  const consoles = createConsoleHub(ptero);
  const spotify = createSpotify(settings, origin);
  const desktopSpotify = createDesktopSpotify();
  const music = () => settings.get().spotifyMode === 'desktop' ? desktopSpotify : spotify;
  const cloud = createCloud(settings, jobs, dataDir);
  const discord = createDiscord(settings, jobs);
  const codexSummary = createCodexSummary();
  const github=createGithub({cwd:dataDir});
  let lastCpu = os.cpus();
  let lastCpuPercent = 0;
  let lastCpuAt = Date.now();
  function system() {
    if (Date.now() - lastCpuAt >= 1000) {
      const current = os.cpus(); let idle = 0, total = 0;
      current.forEach((cpu, i) => { const prev = lastCpu[i] || cpu; for (const key in cpu.times) total += cpu.times[key] - prev.times[key]; idle += cpu.times.idle - prev.times.idle; });
      lastCpuPercent = total ? Math.round((1 - idle / total) * 100) : 0; lastCpu = current; lastCpuAt = Date.now();
    }
    return { hostname: os.hostname(), platform: ({win32:'Windows',darwin:'macOS',linux:'Linux'})[process.platform]||process.platform, cpu: lastCpuPercent, memoryUsed: os.totalmem() - os.freemem(), memoryTotal: os.totalmem(), uptime: os.uptime() };
  }
  app.use((req, res, next) => {
    if (req.headers.host !== `127.0.0.1:${port}`) return res.status(403).json({ error: 'Accès local uniquement.' });
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${dev ? " 'unsafe-inline'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.discordapp.com https://avatars.githubusercontent.com https://i.scdn.co https://mosaic.scdn.co https://image-cdn-ak.spotifycdn.com https://image-cdn-fa.spotifycdn.com; connect-src 'self'${dev ? ` ws://127.0.0.1:${port}` : ''}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`);
    next();
  });
  app.get('/auth/discord/callback', async (req,res)=>{res.setHeader('Cache-Control','no-store');try{await access?.callback(req.query);res.type('html').send('<!doctype html><meta charset="utf-8"><title>Discord</title><p>Connexion réussie. Tu peux fermer cet onglet et revenir au dashboard.</p>');}catch{res.status(403).type('html').send('<!doctype html><meta charset="utf-8"><title>Discord</title><p>Connexion refusée ou expirée. Seul le propriétaire peut ouvrir le dashboard. Recommence depuis l’application.</p>');}});
  app.use('/api', async (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!requestAllowed(req, port)) return res.status(403).json({ error: 'Origine refusée.' });
    if(req.path==='/access/status'&&req.method==='GET')return res.json({...(access? (await access.ensure(),access.publicState()):{authorized:true}),token});
    if(access&&!req.path.startsWith('/access/')&&!await access.ensure())return res.status(401).json({error:'Connexion Discord requise.'});
    if (req.path === '/bootstrap' && req.method === 'GET') return next();
    const supplied = Buffer.from(req.get('X-Panel-Token') || '');
    if (supplied.length !== token.length || !timingSafeEqual(supplied, Buffer.from(token))) return res.status(403).json({ error: 'Session expirée. Recharge le panel.' });
    if (!['GET', 'HEAD'].includes(req.method) && !req.is('application/json')) return res.status(415).json({ error: 'Requête JSON requise.' });
    next();
  });
  app.use('/api/backup/restore',express.json({limit:'3mb'}));
  app.use(express.json({ limit: '24kb' }));
  app.post('/api/access/configure',async(req,res)=>res.json(await access.configure(req.body.secret)));
  app.post('/api/access/begin',(_req,res)=>res.json(access.begin()));
  app.post('/api/access/logout',async(_req,res)=>{await access.logout();res.json({});});
  const workspaceMonitor = workspaceRoutes(app,{workspace,settings,services,projects,jobs,ptero,cloud,music,terminalRunning,consoles});
  app.get('/api/bootstrap', (_req, res) => res.json({ app: 'lestitcheur-control', desktop, platform:process.platform, capabilities:{windowsServices:process.platform==='win32',desktopSpotify:process.platform==='win32'}, token, settings: settings.public(), spotifyRedirectUri: spotify.redirectUri }));
  app.get('/api/state', async (_req, res) => res.json({ system: system(), terminalRunning: terminalRunning(), services: await services.status(), activities: jobs.activities(), jobs: jobs.list().map(({ output, ...job }) => job) }));
  app.get('/api/github',async(req,res)=>res.json(await github.list(req.query.page||1)));
  app.get('/api/github/:owner/:repo',async(req,res)=>res.json(await github.details(req.params.owner,req.params.repo)));
  app.get('/api/projects', async (_req, res) => res.json(await projects.list()));
  app.get('/api/settings', (_req, res) => res.json(settings.public()));
  app.get('/api/codex', async (_req, res) => res.json(await codexSummary()));
  app.post('/api/settings', async (req, res) => { const previous = settings.get(); await settings.update(req.body); if (previous.pteroUrl !== settings.get().pteroUrl || previous.pteroKey !== settings.get().pteroKey) consoles.disconnectAll(); ptero.invalidate(); cloud.invalidate(); jobs.addActivity('Paramètres enregistrés', 'success'); res.json(settings.public()); });
  app.post('/api/terminal', async (req, res) => { await terminal(settings.get().projectsRoot, req.body.admin === true); jobs.addActivity(`Terminal ${req.body.admin ? 'administrateur' : 'PowerShell'} ouvert`); res.json({}); });
  app.get('/api/projects/:name/release-plan', async (req,res)=>res.json(await projects.releasePlan(req.params.name)));
  app.get('/api/projects/:name/deploy-plan', async (req, res) => res.json(await projects.plan(req.params.name)));
  app.post('/api/projects/:name/action', async (req, res) => res.json(await projects.action(req.params.name, req.body.action, req.body)));
  app.post('/api/services/start', (req, res) => res.json(services.start(req.body.target)));
  app.post('/api/services/fivem/stop', async (req, res) => { if (req.body.confirm !== true) throw new Error('Confirmation requise.'); res.json(await services.stopFivem()); });
  app.get('/api/jobs/:id', (req, res) => { const job = jobs.find(req.params.id); job ? res.json(job) : res.status(404).json({ error: 'Opération introuvable.' }); });
  app.get('/api/pterodactyl', async (_req, res) => res.json(await ptero.list()));
  app.get('/api/pterodactyl/:id/console', (req, res) => consoles.stream(req, res));
  app.post('/api/pterodactyl/:id/power', async (req, res) => { await ptero.power(req.params.id, req.body.signal); jobs.addActivity(`Pterodactyl · ${req.params.id} · ${req.body.signal}`); res.json({}); });
  app.post('/api/pterodactyl/:id/command', async (req, res) => { await ptero.command(req.params.id, req.body.command); jobs.addActivity(`Commande envoyée · ${req.params.id}`); res.json({}); });
  app.get('/api/spotify', async (_req, res) => res.json(await music().state()));
  app.post('/api/spotify/open', async (_req, res) => res.json(await desktopSpotify.open()));
  app.post('/api/spotify/connect', (_req, res) => res.json(spotify.authorize()));
  app.post('/api/spotify/control', async (req, res) => res.json(await music().control(req.body.action, req.body.value)));
  app.post('/api/spotify/disconnect', async (_req, res) => res.json(await spotify.disconnect()));
  app.get('/api/discord/bots', (_req,res) => res.json({ bots: discord.bots() }));
  app.post('/api/discord/bots', async (req,res) => res.json(await discord.connect(req.body)));
  app.post('/api/discord/bots/:botId/disconnect', async (req,res) => res.json(await discord.disconnect(req.params.botId)));
  app.get('/api/discord/bots/:botId/guilds', async (req,res) => res.json(await discord.guilds(req.params.botId, req.query.after)));
  app.get('/api/discord/bots/:botId/guilds/:guildId', async (req,res) => res.json(await discord.guild(req.params.botId, req.params.guildId)));
  app.get('/api/discord/bots/:botId/guilds/:guildId/:kind', async (req,res) => res.json(await discord.list(req.params.botId, req.params.guildId, req.params.kind, req.query.after)));
  app.post('/api/discord/bots/:botId/guilds/:guildId/plan', async (req,res) => res.json(await discord.prepare(req.params.botId, req.params.guildId, req.body)));
  app.post('/api/discord/apply', async (req,res) => res.json(await discord.apply(req.body.planId, req.body.confirm)));
  app.get('/api/hostinger', async (_req, res) => res.json(await cloud.domains()));
  app.get('/api/hostinger/:domain/dns', async (req, res) => res.json(await cloud.zone(req.params.domain)));
  app.get('/api/hostinger/:domain/history', async (req,res)=>res.json(await cloud.history(req.params.domain)));
  app.post('/api/hostinger/:domain/plan', async (req, res) => res.json(await cloud.planDns(req.params.domain, req.body)));
  app.post('/api/hostinger/apply', async (req, res) => res.json(await cloud.applyDns(req.body.planId, req.body.confirm)));
  app.get('/api/vercel', async (_req, res) => res.json(await cloud.vercel()));
  app.get('/api/vercel/:id/events', async (req, res) => res.json(await cloud.vercelEvents(req.params.id)));
  app.post('/api/vercel/:id/plan', async (req, res) => res.json(await cloud.planRedeploy(req.params.id)));
  app.post('/api/vercel/redeploy', async (req, res) => res.json(await cloud.redeploy(req.body.planId, req.body.confirm)));
  app.post('/api/social/:id/open', async (req, res) => {
    const account = settings.get().socialAccounts.find(a => a.id === req.params.id);
    if (!account) throw new Error('Compte introuvable.');
    const url = socialUrl(account, req.body.target);
    if (openSocial) { await openSocial(account, req.body.target); jobs.addActivity(`Espace ${account.platform} ouvert · @${account.handle}`); res.json({ opened: true }); }
    else res.json({ opened: false, url });
  });
  app.get('/auth/spotify/callback', async (req, res) => {
    try { await spotify.callback(req.query.code, req.query.state); jobs.addActivity('Spotify connecté', 'success'); if (onSpotifyConnected) { onSpotifyConnected(); res.type('html').send('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Spotify connecté</title><body style="background:#121216;color:#fff;font:18px system-ui;padding:60px"><h1>Spotify est connecté.</h1><p>Tu peux fermer cet onglet et retrouver ta musique dans LeStitcheur Control.</p></body></html>'); } else res.redirect('/?spotify=connected'); }
    catch (error) { jobs.addActivity(error.message, 'error'); res.redirect('/?spotify=error'); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Route introuvable.' }));
  if (dev) {
    const { createServer } = await import('vite');
    const vite = await createServer({ root: APP_ROOT, server: { middlewareMode: true, allowedHosts: ['127.0.0.1'], hmr: false }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(APP_ROOT, 'dist'), { dotfiles: 'deny' }));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(APP_ROOT, 'dist', 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    const message = error.type === 'entity.too.large' ? 'Requête trop volumineuse.' : error instanceof SyntaxError ? 'JSON invalide.' : error.message || 'Une erreur est survenue.';
    res.status(400).json({ error: message });
  });
  jobs.addActivity('LeStitcheur Control est prêt', 'success');
  return { app, access, jobs, settings, services, workspace, close: () => {workspaceMonitor.close();consoles.disconnectAll();} };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4317);
  const { app } = await createApp({ port, dev: process.argv.includes('--dev') });
  const server = app.listen(port, '127.0.0.1', () => console.log(`LeStitcheur Control · http://127.0.0.1:${port}`));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Le port ${port} est déjà utilisé. Le panel est peut-être déjà lancé.` : error.message); process.exitCode = 1; });
}
