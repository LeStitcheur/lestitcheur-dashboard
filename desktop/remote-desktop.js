import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {isIP} from 'node:net';
import {surfaceBounds} from './social-surface.js';

export function validateRdpProfile(input) {
  const host=String(input.host||'').trim();
  if(!host||host.length>253||(!isIP(host)&&!host.split('.').every(p=>/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(p))))throw Error('Indique une adresse IP ou un nom de machine, sans protocole ni port.');
  const port=Number(input.port??3389);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Port RDP invalide.');
  const clean=(value,max)=>{if(typeof value!=='string'||value.length>max||/[\x00-\x1f]/.test(value))throw Error('Champ RDP invalide.');return value.trim();};
  const name=clean(input.name,80);if(!name)throw Error('Nom requis.');
  return {name,host,port,username:clean(input.username||'',200),domain:clean(input.domain||'',200),clipboard:input.clipboard===true};
}

export async function createRemoteDesktop({directory,window,helper,scale=()=>1,spawnHost=spawn}) {
  const file=path.join(directory,'rdp-profiles.json');let profiles=[],active=null,phase='idle',message='',lastLayout=null,queue=Promise.resolve();
  try {const saved=JSON.parse(await fs.readFile(file,'utf8'));if(!Array.isArray(saved)||saved.length>50)throw Error();profiles=saved.map(p=>{if(!/^[a-f0-9-]{36}$/.test(p.id))throw Error();return {id:p.id,...validateRdpProfile(p)};});}catch(e){if(e.code!=='ENOENT')throw Error('Profils RDP illisibles.');}
  const status=()=>({profiles:profiles.map(p=>({...p})),activeId:active?.id||null,phase,message});
  const alive=()=>!window.isDestroyed()&&!window.webContents.isDestroyed?.();
  const publish=()=>{if(alive())window.webContents.send('remote:status',status());};
  const persist=()=>{const json=JSON.stringify(profiles);queue=queue.catch(()=>{}).then(async()=>{await fs.writeFile(file+'.tmp',json,{mode:0o600});await fs.rename(file+'.tmp',file);});return queue;};
  function send(input){if(active?.child.stdin.writable)active.child.stdin.write(JSON.stringify(input)+'\n',()=>{});}
  function disconnect(){const old=active;active=null;phase='idle';message='';if(old){old.lines.close();old.child.stdin.end(JSON.stringify({type:'disconnect'})+'\n');const timer=setTimeout(()=>{if(old.child.exitCode===null)old.child.kill();},2000);timer.unref();}if(alive())window.webContents.setIgnoreMenuShortcuts(false);publish();return status();}
  function layout(input){if(!alive())return;lastLayout=input;if(!active)return;const rect=surfaceBounds(input?.rect,window.getContentSize(),window.webContents.getZoomFactor()),factor=scale();send({type:'layout',visible:input?.visible===true&&!!rect&&!['error','disconnected'].includes(phase),x:Math.round((rect?.x||0)*factor),y:Math.round((rect?.y||0)*factor),width:Math.round((rect?.width||100)*factor),height:Math.round((rect?.height||100)*factor)});}
  window.once?.('closed',disconnect);
  return {status,disconnect,layout,
    async save(input){const clean=validateRdpProfile(input),id=input.id||randomUUID();if(input.id&&!profiles.some(p=>p.id===id))throw Error('Profil introuvable.');if(!input.id&&profiles.length>=50)throw Error('Maximum 50 profils RDP.');profiles=[...profiles.filter(p=>p.id!==id),{id,...clean}];await persist();publish();return status();},
    async remove(id){if(active?.id===id)disconnect();profiles=profiles.filter(p=>p.id!==id);await persist();publish();return status();},
    async connect(id,password='') {
      const profile=profiles.find(p=>p.id===id);if(!profile)throw Error('Profil introuvable.');
      if(typeof password!=='string'||password.length>4096||/[\x00]/.test(password))throw Error('Mot de passe invalide.');
      await fs.access(helper);if(!alive())throw Error('La fenêtre est fermée.');disconnect();
      const handle=window.getNativeWindowHandle();const parent=(handle.length===8?handle.readBigUInt64LE():BigInt(handle.readUInt32LE())).toString();
      const child=spawnHost(helper,[parent,String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','ignore']});
      child.stdin.on('error',()=>{});
      const lines=createInterface({input:child.stdout});const current=active={id,child,lines};phase='loading';message='Initialisation du client RDP Windows…';let connected=false;
      lines.on('line',line=>{if(active!==current||line.length>10000)return;let event;try{event=JSON.parse(line);}catch{return;}
        if(event.phase==='ready'&&!connected){connected=true;layout(lastLayout);send({type:'connect',...profile,password});password='';phase='connecting';message='Connexion au serveur…';}
        else if(['connected','connecting','disconnected','error'].includes(event.phase)){phase=event.phase;message=event.message||({connected:'Bureau distant connecté',connecting:'Connexion au serveur…',disconnected:'Session déconnectée. Vérifie l’adresse et les identifiants si la connexion n’a pas abouti.'})[phase]||'Erreur RDP.';}
        layout(lastLayout);publish();
      });
      child.on('error',()=>{if(active===current){password='';phase='error';message='Impossible de démarrer le client RDP Windows.';publish();}});
      child.on('exit',()=>{password='';if(active===current){phase=phase==='error'?'error':'disconnected';message=message||'Session RDP terminée.';publish();}});
      publish();return status();
    },
    fullscreen(){if(!alive())return;window.setFullScreen(!window.isFullScreen());},
    focus(){send({type:'focus'});},
  };
}
