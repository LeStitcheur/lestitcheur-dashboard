import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createCloud, dnsRecord, domainName } from '../server/cloud.js';
import { createJobs } from '../server/jobs.js';
import { DEFAULT_ACCOUNTS, socialUrl, validateAccounts } from '../server/social.js';
import { createDesktopSpotify } from '../server/spotify-desktop.js';
import { createSettings } from '../server/settings.js';

test('DNS preparation never mutates live records; apply is scoped, backed up, single-use and detects stale zones', async t => {
  const parent=path.resolve('.local/test-fixtures');await fs.mkdir(parent,{recursive:true});
  const directory=await fs.mkdtemp(path.join(parent,'cloud-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(directory)),parent);await fs.rm(directory,{recursive:true,force:true});});
  let records=[{name:'@',type:'A',ttl:300,records:[{content:'192.0.2.1'}]},{name:'@',type:'MX',ttl:3600,records:[{content:'10 mail.example.com'}]}];
  const requests=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push({url:String(url),...options});if(options.method==='GET')return Response.json(records);return Response.json({message:'OK'});});
  const settings={get:()=>({hostingerToken:'ciphertext'}),secret:async()=> 'test-only'};
  const cloud=createCloud(settings,createJobs(),directory);
  let zone=await cloud.zone('example.com');
  const change={action:'save',fingerprint:zone.fingerprint,record:{...records[0],records:[{content:'192.0.2.2'}]}};
  const plan=await cloud.planDns('example.com',change);
  assert.equal(requests.filter(r=>['PUT','DELETE'].includes(r.method)).length,0);
  assert.equal(plan.before.records[0].content,'192.0.2.1');
  assert.equal(plan.after.records[0].content,'192.0.2.2');
  await assert.rejects(cloud.applyDns(plan.planId,'wrong'),/Confirme/);
  await cloud.applyDns(plan.planId,'example.com');
  const put=requests.find(r=>r.method==='PUT');
  assert.deepEqual(JSON.parse(put.body),{overwrite:true,zone:[change.record]});
  const backups=await fs.readdir(path.join(directory,'dns-backups'));assert.equal(backups.length,1);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory,'dns-backups',backups[0]),'utf8')).records,records);
  assert.deepEqual((await cloud.history('example.com'))[0].records,records);assert.deepEqual(await cloud.history('other.example'),[]);await assert.rejects(cloud.history('../outside'));
  await assert.rejects(cloud.applyDns(plan.planId,'example.com'),/expiré/);
  zone=await cloud.zone('example.com');
  const stale=await cloud.planDns('example.com',{...change,fingerprint:zone.fingerprint});
  records=[...records,{name:'www',type:'CNAME',ttl:300,records:[{content:'example.com'}]}];
  await assert.rejects(cloud.applyDns(stale.planId,'example.com'),/zone a changé/);
  assert.equal(requests.filter(r=>r.method==='PUT').length,1);
  records[0].records[0].is_disabled=true;
  zone=await cloud.zone('example.com');
  await assert.rejects(cloud.planDns('example.com',{...change,fingerprint:zone.fingerprint}),/désactivées/);
  assert.ok(requests.every(r=>r.redirect==='error'&&new URL(r.url).origin==='https://developers.hostinger.com'));
});

test('DNS and social identifiers cannot escape their intended provider or filesystem',()=>{
  for(const domain of ['../outside','https://example.com','user@example.com','example.com/secret','127.0.0.1'])assert.throws(()=>domainName(domain));
  assert.equal(domainName('Example.COM'),'example.com');
  assert.throws(()=>dnsRecord({name:'@',type:'A',ttl:300,records:[{content:'not-an-ip'}]}),/Adresse/);
  assert.throws(()=>dnsRecord({name:'@',type:'A',ttl:0,records:[{content:'192.0.2.1'}]}),/TTL/);
  assert.equal(validateAccounts(DEFAULT_ACCOUNTS).length,4);
  assert.match(socialUrl(DEFAULT_ACCOUNTS[0],'profile'),/^https:\/\/www.tiktok.com\/@lestitcheurfou$/);
  assert.equal(socialUrl(DEFAULT_ACCOUNTS[2],'messages'),'https://www.instagram.com/direct/inbox/');
  assert.throws(()=>socialUrl({...DEFAULT_ACCOUNTS[0],handle:'../evil'}));
  assert.throws(()=>socialUrl(DEFAULT_ACCOUNTS[0],'constructor'));
});

test('Vercel scopes reads to a team and redeploys only after a confirmed one-use plan',async t=>{
  const calls=[]; const values={vercelToken:'cipher',vercelTeamId:'team_test'};
  t.mock.method(globalThis,'fetch',async(url,options)=>{const u=new URL(url);calls.push({url:u,...options});
    assert.equal(u.searchParams.get('teamId'),'team_test');
    if(u.pathname==='/v9/projects')return Response.json({projects:[{id:'prj_test',name:'demo'}]});
    if(u.pathname==='/v6/deployments')return Response.json({deployments:[]});
    if(options.method==='POST')return Response.json({id:'dpl_new',readyState:'QUEUED'});
    return Response.json({id:'dpl_test',name:'demo',target:null,readyState:'READY'});
  });
  const cloud=createCloud({get:()=>values,secret:async()=> 'test'},createJobs(),'.local');
  assert.equal((await cloud.vercel()).projects[0].name,'demo');
  const plan=await cloud.planRedeploy('dpl_test');assert.equal(plan.target,'preview');
  assert.equal(calls.filter(c=>c.method==='POST').length,0);
  await assert.rejects(cloud.redeploy(plan.planId,'not-demo'),/Confirme/);
  await cloud.redeploy(plan.planId,'demo');
  assert.deepEqual(JSON.parse(calls.at(-1).body),{deploymentId:'dpl_test',name:'demo'});
  await assert.rejects(cloud.redeploy(plan.planId,'demo'),/expiré/);
  await assert.rejects(cloud.planRedeploy('../wrong'),/Identifiant/);
});

test('Spotify desktop reads are coalesced and unsupported commands never reach PowerShell',async()=>{
  const calls=[];
  const spotify=createDesktopSpotify({run:async code=>{calls.push(code);return {stdout:JSON.stringify({connected:true,source:'desktop',active:true,name:'Fixture'})};}});
  const states=await Promise.all([spotify.state(),spotify.state()]);assert.equal(calls.length,1);assert.equal(states[0].name,'Fixture');
  await assert.rejects(spotify.control('volume',50),/indisponible/);
  await assert.rejects(spotify.control('shuffle','evil'),/invalide/);
  assert.equal(calls.length,1);
  await spotify.control('pause');assert.match(calls.at(-1),/-Action 'pause'/);
});

test('cloud keys are encrypted at rest and omitted from the settings returned to the UI',async t=>{
  const parent=path.resolve('.local/test-fixtures');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'keys-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(directory)),parent);await fs.rm(directory,{recursive:true,force:true});});
  const settings=await createSettings(directory);
  await settings.update({projectsRoot:directory,hostingerToken:'hostinger-test-only',vercelToken:'vercel-test-only'});
  assert.equal(settings.public().hostingerToken,undefined);assert.equal(settings.public().vercelToken,undefined);assert.equal(settings.public().vercelConfigured,true);
  const stored=await fs.readFile(path.join(directory,'settings.json'),'utf8');assert.doesNotMatch(stored,/hostinger-test-only|vercel-test-only/);
  assert.equal(await settings.secret('hostingerToken'),'hostinger-test-only');
});
