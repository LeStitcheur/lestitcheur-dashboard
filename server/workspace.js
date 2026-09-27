import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, randomBytes, scrypt, createCipheriv, createDecipheriv } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const text = (value, max = 200) => { if (typeof value !== 'string' || value.length > max || /[\x00-\x08]/.test(value)) throw Error('Texte invalide.'); return value.trim(); };
export const WIDGETS = ['codex', 'launchers', 'stats', 'servers', 'music', 'projects', 'activity', 'terminal'];
const defaults = () => ({ widgets: WIDGETS, favorites: [], quiet: false, notifications: [], incidents: [], health: {}, posts: [], sessions: [{id:'development',name:'Développement',project:'',stack:false,editor:false,music:false,terminal:true}], commands: [], monitors: [] });

// All changes are serialized and persisted before becoming visible to readers.
export async function createWorkspace(directory) {
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, 'workspace.json');
  let state;
  try { state = {...defaults(), ...JSON.parse(await fs.readFile(file, 'utf8'))}; }
  catch (error) { if(error.code !== 'ENOENT') throw Error('Le fichier workspace.json est illisible.'); state = defaults(); }
  let queue = Promise.resolve();
  const change = fn => {
    const work = queue.catch(()=>{}).then(async()=>{ const next=structuredClone(state); const result=fn(next); await fs.writeFile(file+'.tmp', JSON.stringify(next), {mode:0o600}); await fs.rename(file+'.tmp',file); state=next; return result; });
    queue=work;return work;
  };
  const notify = (s, entry) => { s.notifications.unshift({id:randomUUID(),time:new Date().toISOString(),read:false,...entry});s.notifications=s.notifications.slice(0,500); };
  return {
    get:()=>structuredClone(state),
    flush:()=>queue,
    notify:entry=>change(s=>notify(s,entry)),
    readAll:()=>change(s=>{s.notifications.forEach(n=>n.read=true);}),
    async preferences(input) { return change(s=>{
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
