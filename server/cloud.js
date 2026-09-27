import { createHash, randomUUID } from 'node:crypto';
import { domainToASCII } from 'node:url';
import { isIP } from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';

export function domainName(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (/[\\/:@?#\s]/.test(raw)) throw new Error('Nom de domaine invalide.');
  const name = domainToASCII(raw);
  if (name.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(name)) throw new Error('Nom de domaine invalide.');
  return name;
}
export function dnsRecord(value) {
  const { name, type } = value || {};
  if (typeof name !== 'string' || !/^(?:@|[a-zA-Z0-9_*-][a-zA-Z0-9_.*-]{0,252})$/.test(name)) throw new Error('Nom DNS invalide.');
  if (!['A','AAAA','CNAME','TXT','MX','SRV','CAA','NS'].includes(type)) throw new Error('Type DNS non pris en charge.');
  const ttl = Number(value.ttl);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 604800) throw new Error('Le TTL doit être compris entre 60 et 604800 secondes.');
  if (!Array.isArray(value.records) || !value.records.length || value.records.length > 50) throw new Error('Ajoute au moins une valeur DNS.');
  const records = value.records.map(record => {
    if (typeof record.content !== 'string' || !record.content.trim() || record.content.length > 4000 || /[\x00-\x1f]/.test(record.content)) throw new Error('Contenu DNS invalide.');
    const content = record.content.trim();
    if ((type === 'A' && isIP(content) !== 4) || (type === 'AAAA' && isIP(content) !== 6)) throw new Error(`Adresse ${type} invalide.`);
    return { content };
  });
  return { name, type, ttl, records };
}
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identifier = value => { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Identifiant invalide.'); return value; };

export function createCloud(settings, jobs, dataDir) {
  const cache = new Map(), plans = new Map(), pending = new Set();
  async function request(provider, route, method = 'GET', body) {
    const key = provider === 'hostinger' ? 'hostingerToken' : 'vercelToken';
    if (!settings.get()[key]) throw new Error(`Connecte ${provider === 'hostinger' ? 'Hostinger' : 'Vercel'} dans cet espace.`);
    const origin = provider === 'hostinger' ? 'https://developers.hostinger.com' : 'https://api.vercel.com';
    const url = new URL(route, origin);
    if (provider === 'vercel' && settings.get().vercelTeamId) url.searchParams.set('teamId', settings.get().vercelTeamId);
    const response = await fetch(url, { method, headers: { Authorization: `Bearer ${await settings.secret(key)}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${provider === 'hostinger' ? 'Hostinger' : 'Vercel'} : ${response.status === 401 ? 'clé expirée ou invalide' : response.status === 403 ? 'permissions insuffisantes' : response.status === 429 ? 'limite de requêtes atteinte, réessaie plus tard' : response.status === 422 ? 'les valeurs envoyées ne sont pas valides pour ce service' : `requête refusée (${response.status})`}.`);
    if (response.status === 204) return {};
    return response.json();
  }
  async function cached(key, fn) {
    const old = cache.get(key);
    if (old && Date.now() - old.at < 30000) return old.data;
    const data = await fn(); cache.set(key, { at: Date.now(), data }); return data;
  }
  async function zone(domain) {
    domain = domainName(domain);
    const data = await request('hostinger', `/api/dns/v1/zones/${domain}`);
    if (!Array.isArray(data)) throw new Error('Réponse DNS Hostinger inattendue.');
    return { domain, records: data, fingerprint: fingerprint(data) };
  }
  function savePlan(plan) {
    for (const [id, entry] of plans) if (entry.expires < Date.now()) plans.delete(id);
    if (plans.size >= 30) plans.delete(plans.keys().next().value);
    const id = randomUUID(); plans.set(id, { ...plan, expires: Date.now() + 5 * 60000 }); return id;
  }
  function getPlan(id, kind) {
    const plan = plans.get(id);
    if (!plan || plan.kind !== kind || plan.expires < Date.now()) throw new Error('La vérification a expiré. Prépare à nouveau cette modification.');
    return plan;
  }
  return {
    invalidate() { cache.clear(); plans.clear(); },
    async domains() {
      if (!settings.get().hostingerToken) return { connected: false, domains: [] };
      return cached('domains', async () => {
        let domains = [], page = 1;
        while (page <= 10) {
          const result = await request('hostinger', `/api/domains/v1/portfolio?page=${page}&per_page=100`);
          domains.push(...(Array.isArray(result) ? result : result.data || []));
          if (!result.meta?.last_page || page >= result.meta.last_page) break;
          page++;
        }
        return { connected: true, domains: domains.filter(d => d.domain).map(d => ({ domain: d.domain, status: d.status, expiresAt: d.expires_at })), checkedAt: new Date().toISOString() };
      });
    },
    zone,
    async history(domain) {
      domain=domainName(domain);const directory=path.join(dataDir,'dns-backups');const files=await fs.readdir(directory).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
      return Promise.all(files.filter(name=>name.startsWith(domain+'-')&&/^.+-\d+\.json$/.test(name)).sort().reverse().slice(0,30).map(async id=>({id,...JSON.parse(await fs.readFile(path.join(directory,id),'utf8'))})));
    },
    async planDns(domain, input) {
      const current = await zone(domain);
      if (input.fingerprint !== current.fingerprint) throw new Error('Les DNS ont changé. Actualise la zone avant de continuer.');
      if (!['save','delete'].includes(input.action)) throw new Error('Action DNS inconnue.');
      const record = dnsRecord(input.record);
      const before = current.records.find(r => r.name === record.name && r.type === record.type) || null;
      if (before?.records?.some(r => r.is_disabled)) throw new Error('Ce groupe contient des valeurs désactivées. Modifie-le depuis hPanel pour préserver leur état.');
      if (input.action === 'delete' && !before) throw new Error('Enregistrement DNS introuvable.');
      const body = input.action === 'delete' ? { filters: [{ name: record.name, type: record.type }] } : { overwrite: true, zone: [record] };
      if (input.action === 'save') await request('hostinger', `/api/dns/v1/zones/${current.domain}/validate`, 'POST', { zone: [record] });
      const plan = { kind: 'dns', domain: current.domain, action: input.action, body, fingerprint: current.fingerprint, before, after: input.action === 'delete' ? null : record };
      return { planId: savePlan(plan), domain: plan.domain, before, after: plan.after, action: plan.action };
    },
    async applyDns(id, confirm) {
      const plan = getPlan(id, 'dns');
      if (confirm !== plan.domain) throw new Error('Confirme le nom de domaine avant d’appliquer.');
      if (pending.has(plan.domain)) throw new Error('Une modification DNS est déjà en cours.');
      pending.add(plan.domain); plans.delete(id);
      try {
        const current = await zone(plan.domain);
        if (current.fingerprint !== plan.fingerprint) throw new Error('La zone a changé depuis la vérification. Aucune modification appliquée.');
        const directory = path.join(dataDir, 'dns-backups'); await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, `${plan.domain}-${Date.now()}.json`), JSON.stringify(current, null, 2), { mode: 0o600 });
        await request('hostinger', `/api/dns/v1/zones/${plan.domain}`, plan.action === 'delete' ? 'DELETE' : 'PUT', plan.body);
        jobs.addActivity(`DNS ${plan.action === 'delete' ? 'supprimés' : 'enregistrés'} · ${plan.domain} · ${(plan.after || plan.before).type} ${(plan.after || plan.before).name}`, 'success');
        return { success: true };
      } finally { pending.delete(plan.domain); }
    },
    async vercel() {
      if (!settings.get().vercelToken) return { connected: false, projects: [], deployments: [] };
      return cached('vercel', async () => {
        const projects = []; let until;
        for (let page = 0; page < 10; page++) {
          const result = await request('vercel', `/v9/projects?limit=100${until ? `&until=${until}` : ''}`);
          projects.push(...result.projects || []); until = result.pagination?.next;
          if (!until) break;
        }
        const result = await request('vercel', '/v6/deployments?limit=40');
        return { connected: true, projects: projects.map(p => ({ id: p.id, name: p.name, framework: p.framework, updatedAt: p.updatedAt, production: p.targets?.production?.url, git: p.link?.repo, paused: p.paused })), deployments: (result.deployments || []).map(d => ({ id: d.uid || d.id, projectId: d.projectId, name: d.name, url: d.url, state: d.readyState || d.state, target: d.target || 'preview', createdAt: d.createdAt || d.created, commit: d.meta?.githubCommitMessage || d.meta?.gitlabCommitMessage, branch: d.meta?.githubCommitRef || d.meta?.gitlabCommitRef })), checkedAt: new Date().toISOString(), moreDeployments: !!result.pagination?.next };
      });
    },
    async vercelEvents(id) {
      identifier(id);
      const events = await request('vercel', `/v3/deployments/${id}/events?limit=100&direction=backward`);
      return { output: (Array.isArray(events) ? events : []).map(e => e.text || e.payload?.text || '').join('\n').slice(-80000) };
    },
    async planRedeploy(id) {
      identifier(id);
      const deployment = await request('vercel', `/v13/deployments/${id}`);
      if (!['READY','ERROR','CANCELED'].includes(deployment.readyState)) throw new Error('Attends la fin du déploiement en cours.');
      const body = { deploymentId: id, name: deployment.name, ...(deployment.target ? { target: deployment.target } : {}) };
      const planId = savePlan({ kind: 'redeploy', body });
      return { planId, name: body.name, target: body.target || 'preview', deploymentId: id };
    },
    async redeploy(id, confirm) {
      const plan = getPlan(id, 'redeploy');
      if (confirm !== plan.body.name) throw new Error('Confirme le projet avant de redéployer.');
      plans.delete(id);
      const result = await request('vercel', '/v13/deployments', 'POST', plan.body);
      cache.delete('vercel'); jobs.addActivity(`Vercel · redéploiement demandé · ${plan.body.name}`, 'success');
      return { id: result.id, state: result.readyState, url: result.url };
    },
  };
}
