import { randomUUID } from 'node:crypto';

export function discordId(value) {
  if (typeof value !== 'string' || !/^\d{17,20}$/.test(value)) throw new Error('Identifiant Discord invalide.');
  return value;
}
const BITS = { kick: 2n, ban: 4n, unban: 4n, timeout: 1n << 40n, clear_timeout: 1n << 40n, nickname: 1n << 27n, role_add: 1n << 28n, role_remove: 1n << 28n, mute: 1n << 22n, unmute: 1n << 22n, deafen: 1n << 23n, undeafen: 1n << 23n, disconnect_voice: 1n << 24n };
export const DISCORD_ACTIONS = { kick: 'Expulser', ban: 'Bannir', unban: 'Débannir', timeout: 'Exclure temporairement', clear_timeout: 'Retirer l’exclusion temporaire', nickname: 'Changer le pseudo', role_add: 'Ajouter un rôle', role_remove: 'Retirer un rôle', mute: 'Couper le micro en vocal', unmute: 'Rétablir le micro en vocal', deafen: 'Couper l’écoute en vocal', undeafen: 'Rétablir l’écoute en vocal', disconnect_voice: 'Déconnecter du vocal' };
export function memberPermissions(member, guild) {
  return guild.roles.filter(role => role.id === guild.id || member.roles.includes(role.id)).reduce((bits, role) => bits | BigInt(role.permissions), 0n);
}
const allowed = (bits, required) => !!(bits & 8n) || (bits & required) === required;
const userSummary = user => ({ id: user.id, username: user.username, name: user.global_name || user.username, bot: !!user.bot });
const memberSummary = member => ({ ...userSummary(member.user), nick: member.nick, roles: member.roles, joinedAt: member.joined_at, timeoutUntil: member.communication_disabled_until });

export function createDiscord(settings, jobs, { fetcher = fetch, now = Date.now } = {}) {
  const plans = new Map(), cooldowns = new Map();
  let botQueue = Promise.resolve();
  const exclusive = fn => { const next = botQueue.catch(() => {}).then(fn); botQueue = next; return next; };
  const bot = id => { discordId(id); const value = (settings.get().discordBots || []).find(item => item.id === id); if (!value) throw new Error('Connecte ce bot dans Discord → Mes bots.'); return value; };
  async function request(token, route, { method = 'GET', body, reason, key = 'new' } = {}) {
    if ((cooldowns.get(key) || 0) > now()) throw new Error('Discord limite les requêtes. Attends quelques secondes avant d’actualiser.');
    let response;
    try { response = await fetcher(`https://discord.com/api/v10${route}`, { method, headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json', ...(reason ? { 'X-Audit-Log-Reason': encodeURIComponent(`LeStitcheur Control · ${reason}`) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw new Error(method === 'GET' ? 'Discord est injoignable. Réessaie plus tard.' : 'La réponse Discord est inconnue. Vérifie le résultat dans Discord avant de recommencer.'); }
    if (response.status === 429) {
      const data = await response.json().catch(() => ({}));
      cooldowns.set(key, now() + Math.max(1000, Number(data.retry_after || 5) * 1000));
      throw new Error('Limite Discord atteinte. Patiente avant de réessayer.');
    }
    if (!response.ok) throw new Error(response.status === 401 ? 'Jeton de bot invalide ou révoqué.' : response.status === 403 ? 'Discord refuse cet accès : vérifie les permissions, la hiérarchie des rôles et le Server Members Intent du bot.' : response.status === 404 ? 'Serveur, membre ou bannissement introuvable pour ce bot.' : `Discord refuse la requête (${response.status}).`);
    if (response.status === 204) return {};
    return response.json();
  }
  async function call(botId, route, options = {}) { bot(botId); return request(await settings.discordBotSecret(botId), route, { ...options, key: botId }); }
  async function context(botId, guildId) {
    discordId(guildId);
    const [guild, self] = await Promise.all([call(botId, `/guilds/${guildId}?with_counts=true`), call(botId, `/guilds/${guildId}/members/${botId}`)]);
    const permissions = memberPermissions(self, guild);
    const top = Math.max(0, ...guild.roles.filter(role => self.roles.includes(role.id)).map(role => role.position));
    return { guild, self, permissions, top };
  }
  async function validate(botId, guildId, input) {
    discordId(input.userId);
    if (!Object.hasOwn(BITS, input.action)) throw new Error('Action Discord inconnue.');
    if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 200 || /[\x00-\x1f]/.test(input.reason)) throw new Error('Indique une raison de 1 à 200 caractères.');
    const { guild, permissions, top } = await context(botId, guildId);
    if (!allowed(permissions, BITS[input.action])) throw new Error('Le bot ne possède pas la permission nécessaire à cette action.');
    if (input.userId === guild.owner_id || input.userId === botId) throw new Error('Cette action ne peut pas cibler le propriétaire du serveur ou le bot utilisé.');
    const target = input.action === 'unban' ? await call(botId, `/guilds/${guildId}/bans/${input.userId}`) : await call(botId, `/guilds/${guildId}/members/${input.userId}`);
    if (input.action !== 'unban') {
      const targetTop = Math.max(0, ...guild.roles.filter(role => target.roles.includes(role.id)).map(role => role.position));
      if (targetTop >= top) throw new Error('Le rôle le plus haut du bot doit être au-dessus de ceux du membre.');
      if (['timeout','clear_timeout'].includes(input.action) && (memberPermissions(target, guild) & 8n)) throw new Error('Discord ne permet pas d’exclure temporairement un administrateur.');
    }
    const memberRoute = `/guilds/${guildId}/members/${input.userId}`;
    let method = 'PATCH', route = memberRoute, body, roleName;
    switch (input.action) {
      case 'kick': method='DELETE'; break;
      case 'ban': method='PUT'; route=`/guilds/${guildId}/bans/${input.userId}`; body={delete_message_seconds:0}; break;
      case 'unban': method='DELETE'; route=`/guilds/${guildId}/bans/${input.userId}`; break;
      case 'timeout':
        if (!Number.isInteger(input.minutes) || input.minutes < 1 || input.minutes > 40320) throw new Error('Durée comprise entre 1 minute et 28 jours.');
        body={communication_disabled_until:new Date(now()+input.minutes*60000).toISOString()}; break;
      case 'clear_timeout': body={communication_disabled_until:null}; break;
      case 'nickname':
        if (typeof input.nick !== 'string' || input.nick.length > 32 || /[\x00-\x1f]/.test(input.nick)) throw new Error('Pseudo invalide : 32 caractères maximum.');
        body={nick:input.nick.trim() || null}; break;
      case 'role_add': case 'role_remove': {
        discordId(input.roleId);
        const role=guild.roles.find(item=>item.id===input.roleId);
        if (!role || role.id===guildId || role.managed || role.position>=top) throw new Error('Ce rôle ne peut pas être géré par le bot.');
        method=input.action==='role_add'?'PUT':'DELETE'; route=memberRoute+`/roles/${role.id}`; roleName=role.name; break;
      }
      case 'mute': case 'unmute': body={mute:input.action==='mute'}; break;
      case 'deafen': case 'undeafen': body={deaf:input.action==='deafen'}; break;
      case 'disconnect_voice': body={channel_id:null}; break;
    }
    return { method, route, body, guildName:guild.name, user:userSummary(target.user), roleName };
  }
  return {
    bots: () => (settings.get().discordBots || []).map(({id,name})=>({id,name})),
    connect(input) { return exclusive(async()=>{
      const token=typeof input.token==='string'?input.token.trim().replace(/^Bot\s+/i,''):'';
      if (!/^[A-Za-z0-9_.-]{20,300}$/.test(token)) throw new Error('Saisis le jeton d’un bot Discord.');
      const user=await request(token,'/users/@me');
      if (!user.bot) throw new Error('Un jeton de bot est requis, pas un jeton de compte personnel.');
      discordId(user.id);
      const name=typeof input.name==='string'&&input.name.trim()?input.name.trim():user.username;
      if (name.length>80 || /[\x00-\x1f]/.test(name)) throw new Error('Nom de bot invalide.');
      if ((settings.get().discordBots || []).length>=10 && !(settings.get().discordBots || []).some(b=>b.id===user.id)) throw new Error('Maximum 10 bots connectés.');
      await settings.saveDiscordBot({id:user.id,name},token); plans.clear();
      return {id:user.id,name};
    }); },
    disconnect(id) { return exclusive(async()=>{bot(id);await settings.removeDiscordBot(id);plans.clear();return {success:true};}); },
    async guilds(botId, after='') {
      if (after) discordId(after);
      const data=await call(botId,`/users/@me/guilds?limit=200&with_counts=true${after?'&after='+after:''}`);
      return {items:data.map(g=>({id:g.id,name:g.name,members:g.approximate_member_count,online:g.approximate_presence_count})),next:data.length===200?data.at(-1).id:null};
    },
    async guild(botId, guildId) {
      const ctx=await context(botId,guildId);
      let channels=null;
      try { channels=(await call(botId,`/guilds/${guildId}/channels`)).length; } catch {}
      return {id:ctx.guild.id,name:ctx.guild.name,members:ctx.guild.approximate_member_count,online:ctx.guild.approximate_presence_count,boosts:ctx.guild.premium_subscription_count,boostLevel:ctx.guild.premium_tier,channels,roles:ctx.guild.roles.map(r=>({id:r.id,name:r.name,managed:r.managed,manageable:!r.managed&&r.id!==guildId&&r.position<ctx.top})),actions:Object.keys(BITS).filter(action=>allowed(ctx.permissions,BITS[action])),checkedAt:new Date(now()).toISOString()};
    },
    async list(botId, guildId, kind, after='') {
      discordId(guildId); if(after)discordId(after);
      if (!['members','bans'].includes(kind)) throw new Error('Liste inconnue.');
      const data=await call(botId,`/guilds/${guildId}/${kind}?limit=200${after?'&after='+after:''}`);
      return {items:data.map(item=>kind==='members'?memberSummary(item):({...userSummary(item.user),reason:item.reason})),next:data.length===200?data.at(-1).user.id:null};
    },
    async prepare(botId, guildId, input) {
      const clean={action:input.action,userId:input.userId,reason:input.reason,minutes:input.minutes,nick:input.nick,roleId:input.roleId};
      const validated=await validate(botId,guildId,clean);
      for(const [id,plan] of plans) if(plan.expires<now())plans.delete(id);
      if(plans.size>=30)plans.delete(plans.keys().next().value);
      const planId=randomUUID();plans.set(planId,{botId,guildId,input:clean,expires:now()+300000});
      return {planId,botName:bot(botId).name,guildName:validated.guildName,user:validated.user,action:input.action,label:DISCORD_ACTIONS[input.action],reason:input.reason,minutes:input.minutes,nick:input.nick,roleName:validated.roleName};
    },
    async apply(planId, confirm) {
      const plan=plans.get(planId);
      if (!plan || plan.expires<now()) throw new Error('Confirmation expirée. Prépare à nouveau cette action.');
      if (confirm!==plan.input.userId) throw new Error('Recopie l’identifiant du membre pour confirmer.');
      plans.delete(planId);
      const action=await validate(plan.botId,plan.guildId,plan.input);
      await call(plan.botId,action.route,{method:action.method,body:action.body,reason:plan.input.reason});
      jobs.addActivity(`Discord · ${DISCORD_ACTIONS[plan.input.action]} · ${action.user.username} · ${action.guildName}`,'success',{source:'discord',action:plan.input.action,userId:plan.input.userId,guildId:plan.guildId,reason:plan.input.reason});
      return {success:true};
    },
  };
}
