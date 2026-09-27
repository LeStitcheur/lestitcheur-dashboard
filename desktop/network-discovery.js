import os from 'node:os';
import net from 'node:net';
const privateV4=ip=>/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)&&net.isIP(ip)===4;
export function scanTargets(interfaces=os.networkInterfaces()){
 const networks=new Map();
 for(const [name,addresses] of Object.entries(interfaces))for(const item of addresses||[]){
  if(item.internal||!privateV4(item.address)||!item.cidr)continue;
  const prefix=Number(item.cidr.split('/')[1]);if(!Number.isInteger(prefix)||prefix<1||prefix>30)continue;
  // Bound discovery to each directly attached /24 slice, or the smaller actual subnet.
  const bits=Math.max(prefix,24),ip=item.address.split('.').reduce((v,n)=>(v*256+Number(n))>>>0,0),mask=(0xffffffff<<(32-bits))>>>0,base=(ip&mask)>>>0;
  if(!networks.has(base)&&networks.size<4)networks.set(base,{name,address:item.address,prefix:bits,base,count:2**(32-bits)});
 }
 const targets=[];for(const network of networks.values())for(let n=1;n<network.count-1;n++){const value=(network.base+n)>>>0;const ip=[24,16,8,0].map(shift=>(value>>>shift)&255).join('.');if(ip!==network.address)targets.push({host:ip,network:network.name});}
 return {networks:[...networks.values()].map(({name,address,prefix})=>({name,address,prefix})),targets};
}
export function probeRdp(host,signal,timeout=900){return new Promise(resolve=>{
 if(signal.aborted){resolve(false);return;}const socket=net.createConnection({host,port:3389});let bytes=Buffer.alloc(0),settled=false;
 const done=value=>{if(settled)return;settled=true;signal.removeEventListener('abort',cancel);socket.destroy();resolve(value);};const cancel=()=>done(false);signal.addEventListener('abort',cancel,{once:true});
 socket.setTimeout(timeout,()=>done(false));socket.on('error',()=>done(false));socket.on('close',()=>done(false));
 socket.on('connect',()=>socket.write(Buffer.from('030000130ee000000000000100080003000000','hex')));
 socket.on('data',chunk=>{bytes=Buffer.concat([bytes,chunk]);if(bytes.length>=7)done(bytes[0]===3&&bytes[1]===0&&bytes[5]===0xd0);});
});}
export function createNetworkDiscovery({interfaces,probe=probeRdp,onChange=()=>{}}={}){
 let controller,state={running:false,completed:0,total:0,devices:[],networks:[]};const status=()=>({...state,devices:[...state.devices]});const publish=()=>onChange(status());
 return {status,cancel(){controller?.abort();},async scan(){
  if(state.running)return status();const found=scanTargets(interfaces?.());controller=new AbortController();const current=controller;
  state={running:true,completed:0,total:found.targets.length,devices:[],networks:found.networks};publish();let next=0;
  await Promise.all(Array.from({length:24},async()=>{while(!current.signal.aborted&&next<found.targets.length){const target=found.targets[next++];try{if(await probe(target.host,current.signal))state.devices.push({...target,port:3389,name:target.host});}catch{}state.completed++;publish();}}));
  state.running=false;state.cancelled=current.signal.aborted;publish();return status();
 }};
}
