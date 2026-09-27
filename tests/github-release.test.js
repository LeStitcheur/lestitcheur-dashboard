import test from 'node:test';
import assert from 'node:assert/strict';
import {publishRelease,repositoryName} from '../server/github-release.js';
const plan={repository:'owner/project',head:'abc',version:'2.6.0',tag:'v2.6.0',files:[{name:'Setup.exe',size:10,sha256:'hash'}]};
function fixture({badHash=false,published=false,tagMismatch=false}={}){
 const calls=[];const release={id:1,tag_name:plan.tag,draft:!published,assets:[]};
 const client={async api(route,method='GET',body){calls.push({route,method,body});if(route.includes('/commits/'))return {sha:plan.head};if(route.includes('/git/ref/')){if(tagMismatch)return {object:{type:'commit',sha:'other'}};throw Object.assign(Error(),{status:404});}if(route.endsWith('/git/refs'))return {};if(route.includes('?per_page'))return published?[release]:[];if(method==='PATCH'){release.draft=false;return {html_url:'https://github.com/owner/project/releases/tag/v2.6.0'}}return release;},async upload(){const asset={name:'Setup.exe',state:'uploaded',size:10,digest:badHash?'sha256:wrong':'sha256:hash'};release.assets.push(asset);return asset;}};
 return {calls,client,release};
}
test('release publishes only after uploaded assets pass digest verification',async()=>{const f=fixture();const url=await publishRelease({cwd:'.',plan,client:f.client,log:()=>{}});assert.match(url,/v2.6.0/);assert.equal(f.calls.at(-1).method,'PATCH');assert.equal(f.calls.at(-1).body.draft,false);});
test('release upload verification failure leaves the draft unpublished',async()=>{const f=fixture({badHash:true});await assert.rejects(publishRelease({cwd:'.',plan,client:f.client,log:()=>{}}),/Vérification/);assert.ok(!f.calls.some(c=>c.method==='PATCH'));assert.equal(f.release.draft,true);});
test('public releases and conflicting tags cannot be overwritten',async()=>{for(const options of [{published:true},{tagMismatch:true}]){const f=fixture(options);await assert.rejects(publishRelease({cwd:'.',plan,client:f.client,log:()=>{}}));assert.ok(!f.calls.some(c=>c.method==='PATCH'));}});
test('release rejects non-GitHub and credential-containing remotes',()=>{assert.equal(repositoryName('https://github.com/owner/project.git'),'owner/project');assert.equal(repositoryName('git@github.com:owner/project.git'),'owner/project');for(const url of ['https://token@github.com/owner/project','https://other.com/owner/project','https://github.com/owner/project?token=x'])assert.throws(()=>repositoryName(url));});
