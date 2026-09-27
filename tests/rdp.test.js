import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {createRemoteDesktop,validateRdpProfile} from '../desktop/remote-desktop.js';
import {createSettings} from '../server/settings.js';

test('RDP profiles accept IP/DNS but exclude URL and command injection fields',()=>{
 assert.equal(validateRdpProfile({name:'VPS',host:'192.0.2.10',port:3390}).port,3390);
 assert.equal(validateRdpProfile({name:'PC',host:'2001:db8::1'}).host,'2001:db8::1');
 for(const host of ['rdp://pc','host;calc.exe','host\nother','user@host','host:3389','../host'])assert.throws(()=>validateRdpProfile({name:'PC',host}));
 assert.throws(()=>validateRdpProfile({name:'PC',host:'pc',port:65536}));
 assert.equal(validateRdpProfile({name:'PC',host:'pc',password:'never persisted'}).password,undefined);
});

test('RDP helper receives password only via stdin and profiles survive without credentials',async t=>{
 const parent=path.resolve('.local/test-fixtures');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'rdp-'));const helper=path.join(directory,'helper.exe');await fs.writeFile(helper,'fixture');
 const calls=[],messages=[],events=[];let child;
 const fakeSpawn=(file,args,opts)=>{calls.push({file,args,opts});child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new Writable({write(data,_e,done){messages.push(JSON.parse(data.toString()));done();}});child.exitCode=0;child.kill=()=>{};return child;};
 const handle=Buffer.alloc(8);handle.writeBigUInt64LE(123n);
 let destroyed=false;const window={isDestroyed:()=>destroyed,getNativeWindowHandle:()=>handle,getContentSize:()=>[1200,900],webContents:{send:(_n,value)=>events.push(value),setIgnoreMenuShortcuts:()=>{},getZoomFactor:()=>1}};
 const manager=await createRemoteDesktop({directory,helper,window,spawnHost:fakeSpawn,scale:()=>1.5});t.after(async()=>{manager.disconnect();assert.equal(path.dirname(directory),parent);await fs.rm(directory,{recursive:true,force:true});});
 const saved=await manager.save({name:'Test',host:'192.0.2.10',port:3389,username:'tester',password:'not saved'});const id=saved.profiles[0].id;
 manager.layout({visible:true,rect:{x:100,y:200,width:800,height:500}});await manager.connect(id,'private-test-password');
 child.stdout.write(JSON.stringify({phase:'ready'})+'\n');await new Promise(r=>setImmediate(r));
 assert.ok(!JSON.stringify(calls).includes('private-test-password'));assert.ok(messages.some(m=>m.type==='connect'&&m.password==='private-test-password'));assert.equal(messages.find(m=>m.type==='layout').width,1200);
 assert.ok(!JSON.stringify(manager.status()).includes('private-test-password'));assert.ok(!(await fs.readFile(path.join(directory,'rdp-profiles.json'),'utf8')).includes('password'));
 const restored=await createRemoteDesktop({directory,helper,window,spawnHost:fakeSpawn});assert.equal(restored.status().profiles[0].username,'tester');
 child.stdout.write(JSON.stringify({phase:'connected'})+'\n');await new Promise(r=>setImmediate(r));assert.equal(manager.status().phase,'connected');manager.disconnect();assert.equal(manager.status().activeId,null);assert.equal(messages.at(-1).type,'disconnect');destroyed=true;window.getContentSize=()=>{throw Error('Object has been destroyed');};assert.doesNotThrow(()=>manager.layout({visible:false}));assert.doesNotThrow(()=>manager.disconnect());assert.doesNotThrow(()=>manager.fullscreen());await assert.rejects(manager.connect(id),/fenêtre est fermée/);
});

test('first launch uses an existing private projects folder and no personal accounts; legacy profiles skip setup',async t=>{
 const parent=path.resolve('.local/test-fixtures');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'onboard-'));t.after(async()=>{assert.equal(path.dirname(directory),parent);await fs.rm(directory,{recursive:true,force:true});});
 const settings=await createSettings(directory);assert.equal(settings.get().setupComplete,false);assert.deepEqual(settings.get().socialAccounts,[]);assert.ok((await fs.stat(settings.get().projectsRoot)).isDirectory());assert.equal(settings.get().fivemExe,'');
 await settings.update({setupComplete:true});assert.equal((await createSettings(directory)).get().setupComplete,true);
 const legacy={...settings.get()};delete legacy.setupComplete;await fs.writeFile(path.join(directory,'settings.json'),JSON.stringify(legacy));assert.equal((await createSettings(directory)).get().setupComplete,true);
});
