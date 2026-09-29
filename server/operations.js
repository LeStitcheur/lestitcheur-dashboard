import tls from 'node:tls';
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import {domainName} from './cloud.js';
import {githubCredential,githubClient} from './github-release.js';
export function certificate(host,connect=tls.connect){host=domainName(host);return new Promise(resolve=>{let done=false;const finish=result=>{if(done)return;done=true;socket.destroy();resolve(result);};const socket=connect({host,port:443,servername:host,rejectUnauthorized:false},()=>{const cert=socket.getPeerCertificate();const identity=tls.checkServerIdentity(host,cert);finish({valid:socket.authorized&&!identity,expiresAt:cert.valid_to?new Date(cert.valid_to).toISOString():null,issuer:cert.issuer?.O||'',error:identity?'Nom du certificat incorrect':socket.authorized?'':String(socket.authorizationError||'Certificat invalide')});});socket.setTimeout(8000,()=>finish({valid:false,error:'Délai de connexion dépassé'}));socket.on('error',()=>finish({valid:false,error:'Connexion TLS impossible'}));});}
export function createOperations({workspace,settings,cloud,ptero,directory}){
 let cpu=os.cpus(),running=false,domainRunning=null,lastGithub=0,lastDomain=0,closed=false;
 async function domains(){if(domainRunning)return domainRunning;domainRunning=(async()=>{const portfolio=await cloud.domains(),results=[];for(const domain of portfolio.domains.slice(0,50)){if(closed)break;const cert=await certificate(domain.domain);results.push({...domain,certificate:cert,checkedAt:new Date().toISOString()});}if(!closed)await workspace.domainHealth(results);return results;})().finally(()=>domainRunning=null);return domainRunning;}
 async function check(){if(running||closed)return;running=true;try{
  const next=os.cpus();let idle=0,total=0;next.forEach((c,i)=>{if(cpu[i])for(const key in c.times){const n=c.times[key]-cpu[i].times[key];total+=n;if(key==='idle')idle+=n;}});cpu=next;
  let disk=null;try{const stat=await fs.statfs(path.parse(directory).root);disk=(stat.blocks-stat.bavail)/stat.blocks*100;}catch{}
  const samples=[{id:'local',name:'Ce PC',cpu:total?(1-idle/total)*100:0,memory:(1-os.freemem()/os.totalmem())*100,disk}];
  try{const data=await ptero.list();for(const server of data.servers||[])samples.push({id:'ptero:'+server.id,name:server.name,cpu:server.limits?.cpu?server.cpu/server.limits.cpu*100:server.cpu,memory:server.limits?.memory?server.memory/(server.limits.memory*1048576)*100:null,disk:server.limits?.disk?server.disk/(server.limits.disk*1048576)*100:null});}catch{}
  if(!closed)await workspace.samples(samples);
  if(Date.now()-lastGithub>300000){lastGithub=Date.now();try{const client=githubClient(await githubCredential(directory));const feed=await client.api('/notifications?all=false&per_page=30');if(!closed)await workspace.externalNotifications(feed.map(n=>({key:n.id+':'+n.updated_at,message:`GitHub · ${n.repository?.full_name} · ${n.subject?.title}`,type:n.subject?.type==='CheckSuite'?'info':'info',source:'github',url:n.repository?.html_url})));}catch(e){if(!closed)await workspace.integrationError('github',e.message);}}
  if(settings.get().hostingerToken&&Date.now()-lastDomain>3600000){lastDomain=Date.now();await domains().catch(()=>{});}
 }finally{running=false;}}
 const timer=setInterval(()=>check().catch(()=>{}),60000);timer.unref();return {check,domains,close(){closed=true;clearInterval(timer);}};
}
