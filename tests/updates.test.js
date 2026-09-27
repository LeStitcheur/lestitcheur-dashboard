import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createUpdates,validateFeed} from '../desktop/updates.js';

test('update source validation and installation guard protect active terminals and settings',async t=>{
 assert.equal(validateFeed('https://updates.example/path'),'https://updates.example/path/');assert.throws(()=>validateFeed('http://updates.example'));assert.throws(()=>validateFeed('https://user:password@updates.example'));assert.throws(()=>validateFeed('https://updates.example/?token=secret'));
 const parent=path.resolve('.local/test-fixtures');await fs.mkdir(parent,{recursive:true});const dir=await fs.mkdtemp(path.join(parent,'updates-'));let active=true,installed=false,quitting=false;
 class FakeUpdater extends EventEmitter {async checkForUpdates(){this.emit('update-available',{version:'9.0.0',releaseNotes:'Test'});}async downloadUpdate(){this.emit('update-downloaded');}quitAndInstall(){installed=true;}}
 const updater=await createUpdates({app:{isPackaged:true,getVersion:()=> '2.4.0',getPath:()=>dir},backend:{services:{status:async()=>({})},jobs:{list:()=>[],addActivity:()=>{}}},terminal:{running:()=>active},beforeInstall:()=>quitting=true,Updater:FakeUpdater});
 t.after(async()=>{updater.close();assert.equal(path.dirname(dir),parent);await fs.rm(dir,{recursive:true,force:true});});
 await assert.rejects(updater.check());await updater.configure('https://updates.example');assert.equal((await updater.check()).available,true);assert.equal((await updater.download()).downloaded,true);
 await fs.writeFile(path.join(dir,'settings.json'),'test-settings');await assert.rejects(updater.install());assert.equal(installed,false);assert.equal(quitting,false);
 active=false;await updater.install();assert.equal(installed,true);assert.equal(quitting,true);assert.equal(await fs.readFile(path.join(dir,'settings.json.pre-update'),'utf8'),'test-settings');
});
