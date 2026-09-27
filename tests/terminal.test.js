import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnPty } from '../desktop/pty-process.js';
import { createTerminal, dimensions, findPwsh } from '../desktop/terminal.js';

test('terminal reuses its session and validates input, replacement and output flow', async()=>{
  let data,exit,spawned=0,killed=0,paused=0,allowed=false;const events=[];
  const fake={onData:fn=>data=fn,onExit:fn=>exit=fn,write:()=>{},resize:()=>{},kill:()=>killed++,pause:()=>paused++,resume:()=>{}};
  const t=createTerminal({settings:()=>({projectsRoot:process.cwd()}),appRoot:process.cwd(),spawn:()=>{spawned++;return fake;},emit:e=>events.push(e),confirm:async()=>allowed,locate:async()=>'pwsh.exe'});
  const first=await t.open();data('Hello');assert.equal((await t.open()).id,first.id);assert.equal(t.snapshot().output,'Hello');assert.equal(spawned,1);
  assert.throws(()=>t.write('wrong','x'));assert.throws(()=>t.write(first.id,'x'.repeat(65537)));assert.throws(()=>dimensions(NaN,20));
  await t.open({restart:true});assert.equal(spawned,1);assert.equal(killed,0);
  data('x'.repeat(300000));assert.equal(paused,1);t.ack(first.id,300000);
  allowed=true;await t.open({restart:true});assert.equal(spawned,2);assert.equal(killed,1);
  exit({exitCode:0});assert.equal(t.running(),false);assert.equal(events.at(-1).exitCode,0);t.close();
});

test('real pwsh ConPTY supports state, Read-Host, resize and Ctrl+C', {skip:process.platform!=='win32',timeout:25000}, async()=>{
  const file=await findPwsh();
  const child=spawnPty(file,['-NoLogo','-NoProfile'],{cols:100,rows:30,cwd:process.cwd(),env:process.env,useConpty:true});
  let output=''; child.onData(data=>{output+=data;});
  const wait=async text=>{const start=Date.now();while(!output.includes(text)){if(Date.now()-start>7000)throw Error('PTY did not produce '+text);await new Promise(r=>setTimeout(r,50));}};
  try {
    await wait('>');child.write("$n=41; Write-Output ('VALUE_'+($n+1))\r");await wait('VALUE_42');
    child.resize(110,35);child.write("$r=Read-Host 'Entrer'; Write-Output ('ANSWER_'+$r)\r");await wait('Entrer:');child.write('bonjour\r');await wait('ANSWER_bonjour');
    child.write('Start-Sleep -Seconds 60\r');await new Promise(r=>setTimeout(r,300));child.write('\x03');await new Promise(r=>setTimeout(r,200));child.write("Write-Output ('CTRL'+'_OK')\r");await wait('CTRL_OK');
  } finally { child.write('\x03'); child.write('exit\r'); await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},3000);child.onExit(()=>{clearTimeout(timer);resolve();});}); }
});
