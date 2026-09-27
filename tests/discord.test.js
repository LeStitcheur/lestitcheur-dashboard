import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createDiscord, discordId } from '../server/discord.js';
import { createSettings } from '../server/settings.js';
const BID='111111111111111111',GID='222222222222222222',UID='333333333333333333',ROLE='444444444444444444',TOP='555555555555555555',OWNER='666666666666666666';
function fixture() {
  const guild={id:GID,name:'Fixture guild',owner_id:OWNER,roles:[{id:GID,name:'@everyone',position:0,permissions:'0'},{id:TOP,name:'Bot role',position:10,permissions:String(8n)},{id:ROLE,name:'Member role',position:1,permissions:'0'}],approximate_member_count:12,approximate_presence_count:4,premium_subscription_count:2,premium_tier:1};
  const member={user:{id:UID,username:'fixture-user'},roles:[ROLE],nick:null};
  const requests=[],records=[{id:BID,name:'Fixture bot',token:'encrypted'}],logs=[];
  let throwNetwork=false,blocked=false;
  const settings={get:()=>({discordBots:records}),discordBotSecret:async()=> 'fixture-bot-token',saveDiscordBot:async(bot,token)=>{records.push({...bot,token});},removeDiscordBot:async(id)=>records.splice(records.findIndex(b=>b.id===id),1)};
  const fetcher=async(url,options)=>{
    requests.push({url,options});
    if(throwNetwork)throw new Error('secret must not leak');
    if(blocked)return Response.json({retry_after:30},{status:429});
    if(options.method!=='GET')return new Response(null,{status:204});
    const route=new URL(url).pathname.replace('/api/v10','');
    if(route==='/users/@me')return Response.json({id:BID,username:'fixture-bot',bot:true});
    if(route==='/users/@me/guilds')return Response.json([guild]);
    if(route===`/guilds/${GID}`)return Response.json(guild);
    if(route===`/guilds/${GID}/members/${BID}`)return Response.json({user:{id:BID},roles:[TOP]});
    if(route===`/guilds/${GID}/members/${UID}`)return Response.json(member);
    if(route===`/guilds/${GID}/bans/${UID}`)return Response.json({user:member.user,reason:'Fixture'});
    if(route===`/guilds/${GID}/members`)return Response.json([member]);
    if(route===`/guilds/${GID}/bans`)return Response.json([{user:member.user,reason:'Fixture'}]);
    if(route===`/guilds/${GID}/channels`)return Response.json([{id:ROLE}]);
    return Response.json({}, {status:404});
  };
  return {api:createDiscord(settings,{addActivity:(...args)=>logs.push(args)},{fetcher}),requests,guild,member,logs,setNetwork:value=>throwNetwork=value,setLimited:value=>blocked=value};
}
test('Discord moderation is read-only until confirmed, revalidated, audited and single-use',async()=>{
  const f=fixture();
  const plan=await f.api.prepare(BID,GID,{action:'ban',userId:UID,reason:'Fixture moderation'});
  assert.ok(f.requests.every(r=>r.options.method==='GET'));
  await assert.rejects(f.api.apply(plan.planId,'wrong'),/identifiant/);
  await f.api.apply(plan.planId,UID);
  const write=f.requests.find(r=>r.options.method==='PUT');
  assert.equal(write.url,`https://discord.com/api/v10/guilds/${GID}/bans/${UID}`);
  assert.deepEqual(JSON.parse(write.options.body),{delete_message_seconds:0});
  assert.ok(decodeURIComponent(write.options.headers['X-Audit-Log-Reason']).includes('Fixture moderation'));
  assert.equal(write.options.headers.Authorization,'Bot fixture-bot-token');
  assert.equal(f.logs.length,1);
  await assert.rejects(f.api.apply(plan.planId,UID),/expirée/);
});
test('Discord blocks owner/self targets, missing permissions, role hierarchy violations and invalid input',async()=>{
  const f=fixture();
  const input={action:'kick',userId:UID,reason:'Fixture'};
  for(const id of [OWNER,BID])await assert.rejects(f.api.prepare(BID,GID,{...input,userId:id}),/propriétaire/);
  f.member.roles=[TOP];await assert.rejects(f.api.prepare(BID,GID,input),/au-dessus/);f.member.roles=[ROLE];
  await assert.rejects(f.api.prepare(BID,GID,{...input,action:'role_add',roleId:TOP}),/rôle/);
  await assert.rejects(f.api.prepare(BID,GID,{...input,action:'timeout',minutes:50000}),/Durée/);
  await assert.rejects(f.api.prepare(BID,GID,{...input,action:'nickname',nick:'x'.repeat(33)}),/Pseudo/);
  f.guild.roles.find(r=>r.id===TOP).permissions='0';await assert.rejects(f.api.prepare(BID,GID,input),/permission/);
  for(const id of ['../secret','123','12345678901234567?x=1',null])assert.throws(()=>discordId(id));
  assert.ok(f.requests.every(r=>r.options.method==='GET'));
});
test('Discord permission changes after confirmation stop the write; uncertain writes are not retried',async()=>{
  const f=fixture();
  let plan=await f.api.prepare(BID,GID,{action:'kick',userId:UID,reason:'Fixture'});
  f.member.roles=[TOP];await assert.rejects(f.api.apply(plan.planId,UID),/au-dessus/);
  assert.ok(f.requests.every(r=>r.options.method==='GET'));
  f.member.roles=[ROLE];plan=await f.api.prepare(BID,GID,{action:'kick',userId:UID,reason:'Fixture'});
  f.setNetwork(true);await assert.rejects(f.api.apply(plan.planId,UID),/injoignable/);
  f.setNetwork(false);await assert.rejects(f.api.apply(plan.planId,UID),/expirée/);
});
test('Discord reads real counts and separate members/bans, and honors rate limiting without leaking tokens',async()=>{
  const f=fixture();
  const guilds=await f.api.guilds(BID);assert.equal(guilds.items[0].id,GID);
  const guild=await f.api.guild(BID,GID);assert.equal(guild.members,12);assert.equal(guild.online,4);assert.equal(guild.channels,1);
  assert.ok(guild.actions.includes('timeout'));
  const members=await f.api.list(BID,GID,'members');assert.equal(members.items[0].username,'fixture-user');assert.equal(members.next,null);
  const bans=await f.api.list(BID,GID,'bans');assert.equal(bans.items[0].reason,'Fixture');
  assert.deepEqual(f.api.bots(),[{id:BID,name:'Fixture bot'}]);
  f.setLimited(true);await assert.rejects(f.api.guilds(BID),/Limite/);const count=f.requests.length;
  await assert.rejects(f.api.guilds(BID),/limite/);assert.equal(f.requests.length,count);
});
test('role updates affect only one role and timeouts carry a bounded future expiry',async()=>{
  const f=fixture();
  let plan=await f.api.prepare(BID,GID,{action:'role_remove',userId:UID,roleId:ROLE,reason:'Fixture'});
  await f.api.apply(plan.planId,UID);
  let write=f.requests.find(r=>r.options.method==='DELETE');assert.ok(write.url.endsWith(`/members/${UID}/roles/${ROLE}`));assert.equal(write.options.body,undefined);
  plan=await f.api.prepare(BID,GID,{action:'timeout',userId:UID,minutes:60,reason:'Fixture'});
  await f.api.apply(plan.planId,UID);
  write=f.requests.find(r=>r.options.method==='PATCH');const end=new Date(JSON.parse(write.options.body).communication_disabled_until).getTime();
  assert.ok(end>Date.now()+3500000&&end<Date.now()+3700000);
});

test('bot credentials survive restart encrypted and never appear in public settings',async t=>{
  const parent=path.resolve('.local/test-fixtures'); await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'discord-vault-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),parent);await fs.rm(root,{recursive:true,force:true});});
  let settings=await createSettings(root);
  const token='fixture-token-not-a-real-credential';
  await settings.saveDiscordBot({id:BID,name:'Fixture'},token);
  assert.ok(!(await fs.readFile(path.join(root,'settings.json'),'utf8')).includes(token));
  settings=await createSettings(root);
  assert.equal(await settings.discordBotSecret(BID),token);
  assert.deepEqual(settings.public().discordBots,[{id:BID,name:'Fixture'}]);
  assert.ok(!JSON.stringify(settings.public()).includes('token'));
  await settings.removeDiscordBot(BID);
  assert.deepEqual((await createSettings(root)).public().discordBots,[]);
});
