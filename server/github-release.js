import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

export function repositoryName(remote){
 const match=/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/.exec(remote);
 if(!match)throw Error('Un dépôt github.com est requis pour publier une release.');return match[1];
}
export async function releasePlan(cwd,gitPlan){
 const pkg=JSON.parse(await fs.readFile(path.join(cwd,'package.json'),'utf8'));
 if(!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version))throw Error('Version package.json invalide.');
 const directory=await fs.realpath(path.join(cwd,'release')).catch(()=>{throw Error('Compile un installateur dans le dossier release avant de publier.');});
 if(path.dirname(directory).toLowerCase()!==(await fs.realpath(cwd)).toLowerCase())throw Error('Le dossier release doit appartenir au projet.');
 const names=(await fs.readdir(directory)).filter(name=>name.endsWith(`-Setup-${pkg.version}.exe`));
 if(names.length!==1)throw Error('Un unique installateur Setup correspondant à la version du projet est requis.');
 const files=[];
 for(const name of [names[0],names[0]+'.blockmap','latest.yml']){
  const file=await fs.realpath(path.join(directory,name));if(path.dirname(file).toLowerCase()!==directory.toLowerCase())throw Error('Fichier de release hors du projet.');
  const stat=await fs.stat(file);if(!stat.isFile()||stat.size>2*1024**3)throw Error('Fichier de release invalide.');
  const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);
  files.push({name,size:stat.size,sha256:hash.digest('hex')});
 }
 const manifest=await fs.readFile(path.join(directory,'latest.yml'),'utf8');
 if(!manifest.includes(`version: ${pkg.version}`)||!manifest.includes(`path: ${names[0]}`))throw Error('Le manifeste de mise à jour ne correspond pas à cette version.');
 const plan={...gitPlan,repository:repositoryName(gitPlan.remote),version:pkg.version,tag:'v'+pkg.version,files};
 plan.fingerprint=createHash('sha256').update(JSON.stringify(plan)).digest('hex');return plan;
}
export function githubCredential(cwd){return new Promise((resolve,reject)=>{
 const child=spawn('git',['credential','fill'],{cwd,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'},stdio:['pipe','pipe','ignore']});let output='';
 const timer=setTimeout(()=>{child.kill();reject(Error('Authentification GitHub indisponible. Connecte Git à GitHub depuis ton terminal.'));},15000);
 child.stdout.on('data',chunk=>{output+=chunk;if(output.length>65536)child.kill();});
 child.on('error',()=>{clearTimeout(timer);reject(Error('Git est indisponible.'));});
 child.on('close',code=>{clearTimeout(timer);const token=/^password=(.+)$/m.exec(output)?.[1]?.trim();output='';if(code!==0||!token)reject(Error('Connecte Git à GitHub avec Git Credential Manager avant de publier.'));else resolve(token);});
 child.stdin.on('error',()=>{});child.stdin.end('protocol=https\nhost=github.com\n\n');
});}
export function githubClient(token,fetcher=fetch){
 const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'LeStitcheur-Control'};
 return {
  async api(route,method='GET',body){
   const response=await fetcher('https://api.github.com'+route,{method,headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000),redirect:'error'});
   if(!response.ok){const error=Error(`GitHub : requête refusée (${response.status}). Vérifie la connexion et les droits du dépôt.`);error.status=response.status;throw error;}
   return response.status===204?null:response.json();
  },
  async upload(repository,releaseId,file,entry,log){
   let sent=0,last=-1;const stream=createReadStream(file);const hash=createHash('sha256');
   async function* chunks(){for await(const chunk of stream){hash.update(chunk);sent+=chunk.length;const percent=Math.floor(sent/entry.size*100);if(percent>=last+5){last=percent;log(`${entry.name} : ${percent}% (${(sent/1048576).toFixed(1)} / ${(entry.size/1048576).toFixed(1)} Mo envoyés)\n`);}yield chunk;}}
   try{
    const response=await fetcher(`https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(entry.name)}`,{method:'POST',headers:{...headers,'Content-Type':'application/octet-stream','Content-Length':String(entry.size)},body:chunks(),duplex:'half',signal:AbortSignal.timeout(20*60*1000),redirect:'error'});
    if(!response.ok)throw Error(`Téléversement refusé (${response.status}) pour ${entry.name}. Le brouillon est conservé.`);
    if(hash.digest('hex')!==entry.sha256)throw Error('Le fichier a changé pendant le transfert. Release laissée en brouillon.');
    return response.json();
   }finally{stream.destroy();}
  },
 };
}
function assetMatches(asset,entry){return asset?.state==='uploaded'&&asset.size===entry.size&&asset.digest===`sha256:${entry.sha256}`;}
export async function publishRelease({cwd,plan,client,log,notes=''}){
 const base=`/repos/${plan.repository}`;
 log(`Dépôt : ${plan.repository}\nVersion : ${plan.tag}\nVérification du commit publié…\n`);
 const commit=await client.api(`${base}/commits/${plan.head}`);if(commit.sha!==plan.head)throw Error('Utilise Push GitHub avant de publier la release.');
 let ref;try{ref=await client.api(`${base}/git/ref/tags/${plan.tag}`);}catch(e){if(e.status!==404)throw e;}
 if(ref){let object=ref.object;if(object.type==='tag')object=(await client.api(`${base}/git/tags/${object.sha}`)).object;if(object.type!=='commit'||object.sha!==plan.head)throw Error('Ce tag désigne un autre commit. Augmente la version puis reconstruis.');}
 else await client.api(`${base}/git/refs`,'POST',{ref:`refs/tags/${plan.tag}`,sha:plan.head});
 const releases=await client.api(`${base}/releases?per_page=100`);let release=releases.find(r=>r.tag_name===plan.tag);
 if(release&&!release.draft)throw Error('Cette release est déjà publique. Augmente la version pour publier une nouvelle release.');
 const body=notes||`Version ${plan.version} pour Windows 10/11 64 bits.\n\nTélécharger ${plan.files[0].name} et suivre l’assistant. FiveM est exclu de l’installation des prérequis.`;
 if(!release)release=await client.api(`${base}/releases`,'POST',{tag_name:plan.tag,name:`LeStitcheur Control ${plan.version}`,body,draft:true,prerelease:plan.version.includes('-')});
 log(`Brouillon prêt. ${plan.files.length} fichiers à vérifier et envoyer.\n`);
 for(const [index,entry] of plan.files.entries()){
  log(`Fichier ${index+1}/${plan.files.length} : ${entry.name}\n`);
  const existing=release.assets?.find(a=>a.name===entry.name);
  if(assetMatches(existing,entry)){log('Déjà envoyé et vérifié.\n');continue;}
  if(existing)await client.api(`${base}/releases/assets/${existing.id}`,'DELETE');
  const asset=await client.upload(plan.repository,release.id,path.join(cwd,'release',entry.name),entry,log);
  if(!assetMatches(asset,entry))throw Error('Vérification du fichier distant échouée. La release reste en brouillon.');
 }
 const verify=await client.api(`${base}/releases/${release.id}`);
 if(!verify.draft||!plan.files.every(entry=>assetMatches(verify.assets.find(a=>a.name===entry.name),entry)))throw Error('La release a changé ou des fichiers sont incomplets.');
 const published=await client.api(`${base}/releases/${release.id}`,'PATCH',{draft:false,make_latest:plan.version.includes('-')?'false':'true',body});
 log(`\nRelease publiée : ${published.html_url}\n`);return published.html_url;
}
