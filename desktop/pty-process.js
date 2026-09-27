import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export function spawnPty(file,args,options) {
  const host=fileURLToPath(new URL('./pty-host.cjs',import.meta.url)).replace('app.asar','app.asar.unpacked');
  const child=fork(host,[],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
  let exited=false;const dataListeners=[],exitListeners=[];
  const emitExit=code=>{if(exited)return;exited=true;for(const fn of exitListeners)fn({exitCode:code??1});};
  child.on('message',m=>{if(m.type==='data')for(const fn of dataListeners)fn(m.data);if(m.type==='exit')emitExit(m.exitCode);});
  child.on('error',()=>emitExit(1));child.on('exit',emitExit);
  const send=m=>{if(child.connected)child.send(m,()=>{});};
  send({type:'spawn',file,args,options});
  return {onData:fn=>dataListeners.push(fn),onExit:fn=>exitListeners.push(fn),write:data=>send({type:'write',data}),resize:(cols,rows)=>send({type:'resize',cols,rows}),pause:()=>send({type:'pause'}),resume:()=>send({type:'resume'}),kill:()=>send({type:'kill'})};
}
