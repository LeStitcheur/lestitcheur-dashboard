import test from 'node:test';
import assert from 'node:assert/strict';
import {createGithub} from '../server/github.js';
test('GitHub uses stored credential only on server and paginates private repositories',async()=>{
 const calls=[];const github=createGithub({cwd:'fixture',credential:async cwd=>{assert.equal(cwd,'fixture');return 'secret';},client:token=>{assert.equal(token,'secret');return {api:async route=>{calls.push(route);return route==='/user'?{login:'test',name:'Test',access_token:'secret'}:[{id:1,full_name:'test/private',private:true,token:'secret'}];}};}});
 const result=await github.list(2);assert.equal(result.repos[0].private,true);assert.equal(result.hasMore,false);assert.ok(calls[1].includes('page=2'));assert.ok(!JSON.stringify(result).includes('secret'));await assert.rejects(github.list(-1));
});
test('GitHub isolates activity permission errors, excludes PRs from issues, and rejects route traversal',async()=>{
 let calls=0;const github=createGithub({credential:async()=>'',client:()=>({api:async route=>{calls++;if(route.includes('/actions/'))throw Error('GitHub : requête refusée (403).');if(route.includes('/issues'))return [{id:1,title:'Issue'},{id:2,pull_request:{}}];return [];}})});
 const result=await github.details('owner','repo');assert.equal(result.issues.length,1);assert.match(result.errors.runs,/403/);assert.deepEqual(result.releases,[]);const previous=calls;await assert.rejects(github.details('..','repo'));await assert.rejects(github.details('owner','repo/issues'));assert.equal(calls,previous);
});
