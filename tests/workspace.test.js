import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createWorkspace,encryptBackup,decryptBackup} from '../server/workspace.js';
import {createTerminalPool} from '../desktop/terminal.js';
import {createSettings} from '../server/settings.js';

test('workspace persists concurrent changes, read state, creator data and health transitions',async t=>{
 const parent=path.resolve('.local/test-fixtures');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'workspace-'));t.after(async()=>{assert.equal(path.dirname(directory),parent);await fs.rm(directory,{recursive:true,force:true});});
 const w=await createWorkspace(directory);
 await Promise.all([w.notify({message:'Build terminé',type:'success'}),w.preferences({quiet:true}),w.preferences({favorite:'projet'})]);
 await w.save('posts',{title:'Vidéo',account:'tiktok',date:'2026-10-01T12:00:00Z',metrics:{views:12}});
 await assert.rejects(w.save('monitors',{name:'Interdit',url:'file:///secret'}));
 await assert.rejects(w.save('posts',{title:'a',account:'a',metrics:{views:-1}}));
 await assert.rejects(w.preferences({widgets:['codex','codex']}));
 await w.health([{id:'test',name:'Test',status:'up'}]);assert.equal(w.get().incidents.length,0);
 await w.health([{id:'test',name:'Test',status:'down'}]);await w.health([{id:'test',name:'Test',status:'down'}]);assert.equal(w.get().incidents.length,1);
 await w.health([{id:'test',name:'Test',status:'up'}]);assert.equal(w.get().incidents.length,2);
 await w.readAll();const loaded=await createWorkspace(directory);assert.equal(loaded.get().quiet,true);assert.deepEqual(loaded.get().favorites,['projet']);assert.equal(loaded.get().posts[0].metrics.views,12);assert.ok(loaded.get().notifications.every(n=>n.read));
});

test('encrypted backups reject a wrong password and tampered ciphertext',async()=>{
 const input={version:1,settings:{secret:'test-secret'}};const password='une phrase secrete longue';const blob=await encryptBackup(input,password);assert.ok(!blob.includes('test-secret'));assert.deepEqual(await decryptBackup(blob,password),input);
 await assert.rejects(decryptBackup(blob,'mauvais mot de passe'));const changed=JSON.parse(blob);const data=Buffer.from(changed.data,'base64');data[0]^=1;changed.data=data.toString('base64');await assert.rejects(decryptBackup(JSON.stringify(changed),password));await assert.rejects(encryptBackup(input,'short'));
});

test('settings restore preserves encrypted credentials and keeps the replaced configuration as backup',async t=>{
 const parent=path.resolve('.local/test-fixtures');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'restore-'));t.after(async()=>{assert.equal(path.dirname(dir),parent);await fs.rm(dir,{recursive:true,force:true});});
 const settings=await createSettings(dir);await settings.update({projectsRoot:dir,pteroUrl:'http://localhost:8080',pteroKey:'test-restore-key'});
 const blob=await encryptBackup({settings:settings.get()},'restauration de test');await settings.update({pteroUrl:'https://changed.example'});
 await settings.restoreBackup((await decryptBackup(blob,'restauration de test')).settings);assert.equal(settings.get().pteroUrl,'http://localhost:8080');assert.equal(await settings.secret('pteroKey'),'test-restore-key');assert.equal(settings.public().pteroKey,undefined);
 const previous=JSON.parse(await fs.readFile(path.join(dir,'settings.json.bak'),'utf8'));assert.equal(previous.pteroUrl,'https://changed.example');await assert.rejects(settings.restoreBackup({projectsRoot:dir}));assert.equal(settings.get().pteroUrl,'http://localhost:8080');
});

test('terminal pool isolates input, keeps both sessions and respects cancellation',async()=>{
 const engines=[],events=[];let allow=false;
 const pool=createTerminalPool({settings:()=>({projectsRoot:process.cwd()}),appRoot:process.cwd(),locate:async()=>'pwsh',confirm:async()=>allow,emit:e=>events.push(e),spawn:()=>{const p={writes:[],onData:fn=>p.data=fn,onExit:fn=>p.exit=fn,write:d=>p.writes.push(d),kill:()=>p.killed=true,resize:()=>{},pause:()=>{},resume:()=>{}};engines.push(p);return p;}});
 const a=await pool.open({slot:'main'}),b=await pool.open({slot:'second'});pool.write(a.id,'one');pool.write(b.id,'two');assert.deepEqual(engines[0].writes,['one']);assert.deepEqual(engines[1].writes,['two']);engines[1].data('output');assert.equal(pool.snapshot('second').output,'output');assert.equal(pool.snapshot().output,'');assert.equal(await pool.remove('main'),false);assert.equal(pool.running(),true);allow=true;assert.equal(await pool.remove('main'),true);assert.equal(engines[0].killed,true);assert.equal(pool.list().length,1);pool.close();assert.equal(engines[1].killed,true);
});
