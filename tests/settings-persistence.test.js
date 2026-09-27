import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSettings } from '../server/settings.js';
test('settings survive restart, correct handle without changing session ID, and recover last good backup', async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'panel-settings-'));
 try {
  await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify({projectsRoot:process.cwd(),pteroUrl:'http://example.test',pteroKey:'encrypted-unchanged',socialAccounts:[{id:'tiktok-sourires',platform:'tiktok',handle:'lesdistributeurdesourires',label:'Sourires'}]}));
  let settings=await createSettings(dir);assert.equal(settings.get().socialAccounts[0].handle,'ledistributeurdesourire');assert.equal(settings.get().socialAccounts[0].id,'tiktok-sourires');assert.equal(settings.get().pteroKey,'encrypted-unchanged');
  await settings.update({vercelTeamId:'my-team'});settings=await createSettings(dir);assert.equal(settings.get().vercelTeamId,'my-team');
  await settings.update({vercelTeamId:'next-team'});await fs.writeFile(path.join(dir,'settings.json'),'{damaged');settings=await createSettings(dir);assert.equal(settings.get().vercelTeamId,'my-team');assert.equal(settings.get().pteroKey,'encrypted-unchanged');
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
