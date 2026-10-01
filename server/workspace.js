import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes, scrypt, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const text = (value, max = 200) => { if (typeof value !== 'string' || value.length > max || /[\x00-\x08]/.test(value)) throw Error('Texte invalide.'); return value.trim(); };
export const WIDGETS = ['codex', 'launchers', 'stats', 'servers', 'music', 'projects', 'activity', 'terminal'];
const defaults = () => ({ samples:{},thresholds:{cpu:90,memory:90,disk:90},alarms:{},domainHealth:[],externalSeen:[],integrationErrors:{},widgets: WIDGETS, favorites: [], quiet: false, notifications: [], incidents: [], health: {}, posts: [], sessions: [{id:'development',name:'Développement',project:'',stack:false,editor:false,music:false,terminal:true}], commands: [], monitors: [] });

function readWorkspace(buffer) {
  let data = buffer;
  let encoding = 'utf8';
  if (buffer[0] === 0xff && buffer[1] === 0xfe) { data = buffer.subarray(2); encoding = 'utf16le'; }
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) { data = Buffer.from(buffer.subarray(2)); data.swap16(); encoding = 'utf16le'; }
  const saved = JSON.parse(data.toString(encoding).replace(/^\uFEFF/, ''));
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw Error('Format workspace invalide.');
  const state = defaults();
  for (const key of Object.keys(state)) {
    if (!(key in saved)) continue;
    const value = saved[key], expected = state[key];
    if (Array.isArray(expected) ? !Array.isArray(value) : typeof expected === 'object' ? !value || typeof value !== 'object' || Array.isArray(value) : typeof value !== typeof expected) throw Error('Champ workspace invalide : '+key);
    state[key] = value;
  }
  if (state.widgets.some(v=>!WIDGETS.includes(v)) || state.favorites.some(v=>typeof v!=='string')) throw Error('Préférences workspace invalides.');
  for (const key of ['notifications','incidents','posts','sessions','commands','monitors','domainHealth']) if(state[key].some(v=>!v||typeof v!=='object'||Array.isArray(v))) throw Error('Collection workspace invalide.');
  for (const key of ['cpu','memory','disk']) if(state.thresholds[key]!==undefined&&(!Number.isFinite(state.thresholds[key])||state.thresholds[key]<1||state.thresholds[key]>100)) throw Error('Seuil workspace invalide.');
  state.thresholds={...defaults().thresholds,...state.thresholds};
  if(Object.values(state.samples).some(v=>!Array.isArray(v))) throw Error('Relevés workspace invalides.');
  return state;
}

// All changes are serialized and persisted before becoming visible to readers.
export async function createWorkspace(directory) {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'workspace.json');
  let state, original, recovery = '';
  try { original = await fs.readFile(file); state = readWorkspace(original); }
  catch (error) {
    // Permission and disk errors require intervention, not a silent reset.
    if (error.code && error.code !== 'ENOENT') throw Error('Impossible de lire workspace.json ('+error.code+'). Vérifie les droits du dossier '+directory+'.');
    for (const suffix of ['.bak', '.tmp']) {
      try { state = readWorkspace(await fs.readFile(file+suffix)); recovery = 'restored'; break; }
      catch (backupError) { if(backupError.code&&backupError.code!=='ENOENT') throw backupError; }
    }
    state ||= defaults();
    if (original) {
      const damaged = file+'.damaged-'+Date.now()+'-'+randomUUID();
      await fs.writeFile(damaged, original, {mode:0o600,flag:'wx'});
      recovery ||= 'reset';
    }
    if(recovery)state.notifications.unshift({id:randomUUID(),time:new Date().toISOString(),read:false,source:'activity',type:'info',message:recovery==='restored'?'Ton espace a été récupéré depuis sa sauvegarde.':'Le fichier de ton espace était endommagé. Un nouvel espace a été créé ; le fichier original est conservé dans le profil Windows.'});
    await fs.writeFile(file+'.tmp', JSON.stringify(state), {mode:0o600});
    await fs.rename(file+'.tmp',file);
  }
  let queue = Promise.resolve();
  const change = fn => {
    const work = queue.catch(()=>{}).then(async()=>{ const next=structuredClone(state); const result=fn(next); await fs.writeFile(file+'.bak', JSON.stringify(state), {mode:0o600}); await fs.writeFile(file+'.tmp', JSON.stringify(next), {mode:0o600}); await fs.rename(file+'.tmp',file); state=next; return result; });
    queue=work;return work;
  };
  const notify = (s, entry) => { s.notifications.unshift({id:randomUUID(),time:new Date().toISOString(),read:false,...entry});s.notifications=s.notifications.slice(0,500); };
  return {
    get:()=>structuredClone(state),
    flush:()=>queue,
    notify:entry=>change(s=>notify(s,entry)),
    readOne:id=>change(s=>{const item=s.notifications.find(n=>n.id===id);if(item)item.read=true;}),
    integrationError:(key,error)=>change(s=>{s.integrationErrors[key]=error;}),
    externalNotifications:items=>change(s=>{delete s.integrationErrors.github;for(const item of items){if(s.externalSeen.includes(item.key))continue;s.externalSeen.push(item.key);notify(s,item);}s.externalSeen=s.externalSeen.slice(-1000);}),
    samples:items=>change(s=>{const time=new Date().toISOString();for(const item of items){s.samples[item.id]=[...(s.samples[item.id]||[]),{...item,time}].slice(-1440);for(const metric of ['cpu','memory','disk']){if(!Number.isFinite(item[metric]))continue;const key=item.id+':'+metric,exceeded=item[metric]>=s.thresholds[metric];if(exceeded&&!s.alarms[key])notify(s,{source:'monitor',type:'error',message:item.name+' · '+metric+' à '+item[metric].toFixed(0)+' % (seuil '+s.thresholds[metric]+' %)'});if(!exceeded&&s.alarms[key])notify(s,{source:'monitor',type:'success',message:item.name+' · '+metric+' revenu sous le seuil'});s.alarms[key]=exceeded;}}}),
    domainHealth:items=>change(s=>{s.domainHealth=items;for(const item of items){for(const [kind,expires] of [['domaine',item.expiresAt],['certificat',item.certificate.expiresAt]]){if(!expires)continue;const days=Math.ceil((new Date(expires)-Date.now())/86400000),key=item.domain+':'+kind,warning=days<=30;if(warning&&!s.alarms[key])notify(s,{source:'domains',type:'error',message:item.domain+' · '+kind+' expire dans '+days+' jours'});s.alarms[key]=warning;}const key=item.domain+':tls-invalid';if(!item.certificate.valid&&!s.alarms[key])notify(s,{source:'domains',type:'error',message:item.domain+' · '+item.certificate.error});s.alarms[key]=!item.certificate.valid;}}),
    readAll:()=>change(s=>{s.notifications.forEach(n=>n.read=true);}),
    async preferences(input) { return change(s=>{
      if(input.thresholds){for(const key of ['cpu','memory','disk']){const n=Number(input.thresholds[key]);if(!Number.isFinite(n)||n<1||n>100)throw Error('Seuil entre 1 et 100 requis.');s.thresholds[key]=n;}}
      if(input.quiet!==undefined)s.quiet=input.quiet===true;
      if(input.widgets!==undefined){if(!Array.isArray(input.widgets)||input.widgets.length>WIDGETS.length||new Set(input.widgets).size!==input.widgets.length||input.widgets.some(v=>!WIDGETS.includes(v)))throw Error('Widgets invalides.');s.widgets=input.widgets;}
      if(input.favorite!==undefined){const name=text(input.favorite);s.favorites=s.favorites.includes(name)?s.favorites.filter(v=>v!==name):[...s.favorites,name].slice(-100);}
    }); },
    async save(kind,input) {
      if(!['posts','sessions','commands','monitors'].includes(kind))throw Error('Collection invalide.');
      const id=input.id ? text(input.id,60):randomUUID();
      let item;
      if(kind==='posts'){
        const status=input.status||'idea';if(!['idea','draft','planned','published'].includes(status))throw Error('Statut invalide.');
        const date=input.date ? new Date(input.date):null;if(date&&!Number.isFinite(+date))throw Error('Date invalide.');
        const metrics={};for(const key of ['views','likes','comments','followers']){if(input.metrics?.[key]!==undefined&&input.metrics[key]!==''){const n=Number(input.metrics[key]);if(!Number.isSafeInteger(n)||n<0)throw Error('Statistique invalide.');metrics[key]=n;}}
        item={id,title:text(input.title),account:text(input.account),body:text(input.body||'',8000),status,date:date?.toISOString()||'',metrics,updated:new Date().toISOString()};
      } else if(kind==='sessions') item={id,name:text(input.name),project:text(input.project||''),stack:!!input.stack,editor:!!input.editor,music:!!input.music,terminal:!!input.terminal};
      else if(kind==='commands') item={id,name:text(input.name),command:text(input.command,2000)};
      else { const url=new URL(input.url);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.hash)throw Error('Adresse HTTP(S) sans identifiants requise.');item={id,name:text(input.name),url:url.href}; }
      if(!(item.title||item.name))throw Error('Nom requis.');
      return change(s=>{if(s[kind].length>=200&&!s[kind].some(i=>i.id===id))throw Error('Limite de 200 éléments atteinte.');s[kind]=[...s[kind].filter(i=>i.id!==id),item];return item;});
    },
    remove:(kind,id)=>change(s=>{if(!['posts','sessions','commands','monitors'].includes(kind))throw Error('Collection invalide.');s[kind]=s[kind].filter(i=>i.id!==id);if(kind==='monitors')delete s.health['site:'+id];}),
    health:items=>change(s=>{for(const item of items){const old=s.health[item.id];s.health[item.id]={...item,checkedAt:new Date().toISOString()};if((old&&old.status!==item.status)||(!old&&item.status==='down')){const incident={...item,time:new Date().toISOString(),id:randomUUID()};s.incidents.unshift(incident);notify(s,{type:item.status==='up'?'success':'error',message:`${item.name} : ${item.status==='up'?'disponible':item.detail||'indisponible'}`,source:'monitor'});}}s.incidents=s.incidents.slice(0,300);}),
  };
}

export async function encryptBackup(value,password) {
  if(typeof password!=='string'||password.length<12||password.length>256)throw Error('Choisis un mot de passe de 12 à 256 caractères.');
  const salt=randomBytes(16),iv=randomBytes(12),key=await derive(password,salt,32);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return JSON.stringify({format:'lsf-backup-v1',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')});
}
export async function decryptBackup(blob,password) {
  if(typeof blob!=='string'||blob.length>2*1024*1024||typeof password!=='string'||password.length>256)throw Error('Sauvegarde invalide.');
  try {const input=JSON.parse(blob);if(input.format!=='lsf-backup-v1')throw Error();const key=await derive(password,Buffer.from(input.salt,'base64'),32);const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(input.iv,'base64'));decipher.setAuthTag(Buffer.from(input.tag,'base64'));return JSON.parse(Buffer.concat([decipher.update(Buffer.from(input.data,'base64')),decipher.final()]).toString('utf8'));} catch {throw Error('Mot de passe incorrect ou sauvegarde endommagée.');}
}
