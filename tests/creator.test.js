import test from 'node:test';
import assert from 'node:assert/strict';
import {SOCIAL_CATALOG,CREATOR_ACCOUNTS,socialUrl,validateAccounts} from '../server/social.js';
test('catalog supports persisted manual accounts and fixed official publishing destinations',()=>{
 for(const platform of SOCIAL_CATALOG){const a={id:'test-'+platform.id,platform:platform.id,handle:'my.account',label:'Mon compte'};assert.deepEqual(validateAccounts([a]),[a]);const u=new URL(socialUrl(a,'publish'));assert.equal(u.protocol,'https:');assert.throws(()=>socialUrl(a,'https://evil.example'));}
 assert.throws(()=>validateAccounts([{id:'bad',platform:'unknown',handle:'x',label:'x'}]));
 assert.throws(()=>validateAccounts([{id:'bad',platform:'facebook',handle:'../admin',label:'x'}]));
 for(const a of CREATOR_ACCOUNTS)assert.equal(new URL(socialUrl(a,'create')).protocol,'https:');
 assert.throws(()=>socialUrl({id:'evil',platform:'chatgpt'},'create'));
});
