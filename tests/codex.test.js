import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLimits, recentProjects, createCodexSummary } from '../server/codex.js';

test('Codex quotas preserve zero, skip unknown and prefer multi-bucket response', () => {
  const data = normalizeLimits({rateLimits:{primary:{usedPercent:80}},rateLimitsByLimitId:{codex:{primary:{usedPercent:0,windowDurationMins:300,resetsAt:100},secondary:{usedPercent:null}},extra:{primary:{usedPercent:105}}}});
  assert.equal(data[0].windows.length,1); assert.equal(data[0].windows[0].used,0);
  assert.equal(data[0].windows[0].resetsAt,'1970-01-01T00:01:40.000Z');
  assert.equal(data[1].windows[0].used,100); assert.deepEqual(normalizeLimits({}),[]);
});
test('Recent projects are deduplicated, ordered, and exclude subagents and projectless chats', () => {
  const threads=[{id:'a',cwd:'C:\\dev\\alpha',updatedAt:10,name:'Earlier'}, {id:'b',cwd:'c:/dev/alpha/',updatedAt:30,name:'Recent'}, {id:'c',cwd:'C:/dev/beta',updatedAt:20,name:'Beta'}, {id:'d',cwd:'C:/temporary',updatedAt:90}, {id:'e',cwd:'C:/agent',updatedAt:100,parentThreadId:'a'}];
  const result=recentProjects(threads,{'projectless-thread-ids':['d'],'local-projects':{p:{name:'Alpha',rootPaths:['C:/dev/alpha']}}});
  assert.deepEqual(result.map(p=>p.name),['Alpha','beta']); assert.equal(result[0].title,'Recent'); assert.equal(result.length,2);
});
test('Concurrent refresh shares one read, cache expires, and failure can recover', async () => {
  let count=0,time=0;const summary=createCodexSummary(async()=>{count++;if(count===2)throw Error('Offline');return {projects:[]};},()=>time);
  await Promise.all([summary(),summary()]);assert.equal(count,1);
  time=60001;assert.equal((await summary()).usageError,'Offline');assert.equal(count,2);
  time=120002;assert.deepEqual(await summary(),{projects:[]});assert.equal(count,3);
});
