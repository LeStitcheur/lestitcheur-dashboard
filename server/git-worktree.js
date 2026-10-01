import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {run} from './platform.js';
export const gitRun=async(cwd,args)=>(await run('git',args,cwd,{maxBuffer:8*1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}})).stdout.trim();
export function secretFindings(name,text){const result=[];if(/(?:^|\/)(?:\.env(?:\.(?!example$|sample$)[^/]+)?|id_rsa|id_ed25519|credentials\.json)$/i.test(name))result.push('Fichier sensible');if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))result.push('Clé privée');if(/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[A-Z0-9]{16})\b/.test(text))result.push('Jeton ou clé probable');return result;}
export async function snapshot(cwd){
 const status=await gitRun(cwd,['status','--porcelain']),branch=await gitRun(cwd,['branch','--show-current']);
 const names=(await gitRun(cwd,['ls-files','-z','--cached','--others','--exclude-standard'])).split('\0').filter(Boolean);const hash=createHash('sha256').update(status).update(branch).update(await gitRun(cwd,['ls-files','--stage','-z'])),findings=[];let bytes=0;
 for(const name of [...new Set(names)].sort()) {const target=path.resolve(cwd,name);if(!target.startsWith(path.resolve(cwd)+path.sep))throw Error('Chemin Git hors projet.');const stat=await fs.lstat(target).catch(()=>null);hash.update(name);if(!stat){hash.update('deleted');continue;}if(stat.isSymbolicLink())throw Error('Lien symbolique : vérifie ce projet depuis Git.');if(!stat.isFile())continue;if(stat.size>8*1024*1024||(bytes+=stat.size)>80*1024*1024)throw Error('Projet trop volumineux pour la vérification intégrée.');const buffer=await fs.readFile(target);hash.update(buffer);for(const kind of secretFindings(name,buffer.toString('utf8')))findings.push({file:name,kind});}
 return {fingerprint:hash.digest('hex'),branch,status,findings};
}
export async function gitDetails(cwd){const snap=await snapshot(cwd);const pkg=await fs.readFile(path.join(cwd,'package.json'),'utf8').then(JSON.parse).catch(()=>null);return {...snap,version:typeof pkg?.version==='string'?pkg.version:'',staged:!!(await gitRun(cwd,['diff','--cached','--name-only'])),branches:(await gitRun(cwd,['for-each-ref','--format=%(refname:short)','refs/heads'])).split('\n').filter(Boolean),diff:await gitRun(cwd,['diff','--no-ext-diff','--no-textconv','HEAD','--']).catch(()=>gitRun(cwd,['diff','--cached','--no-ext-diff','--no-textconv']))};}
export async function gitMutation(cwd,input){
 const current=await snapshot(cwd);if(input.fingerprint!==current.fingerprint)throw Error('Le projet a changé. Actualise les différences.');
 if(input.operation==='stage') {if(current.findings.length)throw Error('Des fichiers sensibles sont détectés. Retire-les avant de les ajouter.');await gitRun(cwd,['add','--','.']);}
 else if(input.operation==='commit-version') {
  if(typeof input.version!=='string'||!/^[0-9]+(?:\.[0-9]+){0,3}(?:[-+][A-Za-z0-9.-]+)?$/.test(input.version)||input.version.length>80)throw Error('Indique un numéro de version valide, par exemple 2.9.0.');
  if(!await gitRun(cwd,['diff','--cached','--name-only']))throw Error('Aucun fichier ajouté. Clique sur Git add . avant de créer le commit.');
  const stagedNames=(await gitRun(cwd,['diff','--cached','--name-only','--diff-filter=ACMRT','-z'])).split('\0').filter(Boolean);
  for(const name of stagedNames){const text=await gitRun(cwd,['show',':'+name]);if(secretFindings(name,text).length)throw Error('Un fichier sensible est présent dans les fichiers ajoutés. Retire-le de l’index avant de commiter.');}
  await gitRun(cwd,['commit','-m','MAJ '+input.version]);
 }
 else if(input.operation==='commit') {if(typeof input.message!=='string'||!input.message.trim()||input.message.length>500)throw Error('Message de commit requis (500 caractères maximum).');if(current.findings.length)throw Error('Des fichiers sensibles sont détectés. Retire-les avant de commiter.');await gitRun(cwd,['add','--all','--','.']);await gitRun(cwd,['commit','-m',input.message.trim()]);}
 else if(input.operation==='switch'){if(current.status)throw Error('Commite tes modifications avant de changer de branche.');const branches=(await gitRun(cwd,['for-each-ref','--format=%(refname:short)','refs/heads'])).split('\n');if(!branches.includes(input.branch)||input.branch.startsWith('-'))throw Error('Branche locale invalide.');await gitRun(cwd,['switch',input.branch]);}
 else if(input.operation==='pull'){if(current.status)throw Error('Commite tes modifications avant le pull.');const upstream=await gitRun(cwd,['rev-parse','--abbrev-ref','@{upstream}']);if(!upstream)throw Error('Aucune branche distante suivie.');await gitRun(cwd,['pull','--ff-only']);}
 else throw Error('Action Git inconnue.');
}
