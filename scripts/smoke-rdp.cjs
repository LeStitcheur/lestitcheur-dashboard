const {app,BrowserWindow}=require('electron');const {spawn}=require('node:child_process');const {createInterface}=require('node:readline');const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');const out=path.join(root,'.local','rdp-smoke');let win,child;
app.setPath('userData',path.join(out,'profile'));
app.whenReady().then(async()=>{
 await fs.mkdir(out,{recursive:true});win=new BrowserWindow({show:false,x:-20000,y:0,width:1100,height:850,skipTaskbar:true,focusable:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await win.loadURL('data:text/html,<h1>RDP isolated host test</h1>');win.showInactive();
 const handle=win.getNativeWindowHandle().readBigUInt64LE().toString();child=spawn(path.join(root,'desktop','rdp-host.exe'),[handle,String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});let diagnostic;let error='';child.stderr.on('data',d=>error+=d.toString());
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('RDP initialization timed out')),15000);const lines=createInterface({input:child.stdout});lines.on('line',line=>{let data;try{data=JSON.parse(line);}catch{return;}if(data.phase==='diagnostic'){diagnostic=data;}if(data.phase==='error'){clearTimeout(timer);reject(Error(JSON.stringify(data)));}else if(data.phase==='ready'){clearTimeout(timer);resolve(data);}});child.on('error',reject);child.on('exit',code=>{if(code)reject(Error('Host exit '+code+' '+error));});});
 child.stdin.write(JSON.stringify({type:'layout',x:0,y:0,width:100,height:100,visible:false})+'\n');await new Promise(r=>setTimeout(r,200));
 child.stdin.write(JSON.stringify({type:'layout',x:20,y:80,width:900,height:600,visible:true})+'\n');await new Promise(r=>setTimeout(r,200));
 child.stdin.write(JSON.stringify({type:'probe'})+'\n');await new Promise(r=>setTimeout(r,500));
 if(!diagnostic?.hostVisible||!diagnostic?.controlVisible||!diagnostic?.managedVisible)throw Error('Native surface hidden: '+JSON.stringify(diagnostic));
 const probe=async()=>{diagnostic=null;child.stdin.write(JSON.stringify({type:'probe'})+'\n');const deadline=Date.now()+3000;while(!diagnostic){if(Date.now()>deadline)throw Error('Probe timed out');await new Promise(r=>setTimeout(r,25));}return diagnostic;};
 if(!diagnostic.ownedPopup)throw Error('RDP must be composed independently of Chromium');
 const first=diagnostic;const [oldX,oldY]=win.getPosition();win.setPosition(oldX+100,oldY+60);await new Promise(r=>setTimeout(r,250));const moved=await probe();if(moved.x-first.x!==100||moved.y-first.y!==60)throw Error('Surface did not follow owner: '+JSON.stringify({first,moved}));
 win.hide();await new Promise(r=>setTimeout(r,250));if((await probe()).hostVisible)throw Error('Surface visible while owner is hidden');
 win.showInactive();await new Promise(r=>setTimeout(r,250));if(!(await probe()).hostVisible)throw Error('Surface did not restore with owner');
 child.stdin.write(JSON.stringify({type:'layout',x:20,y:80,width:900,height:600,visible:false})+'\n');await new Promise(r=>setTimeout(r,250));if((await probe()).hostVisible)throw Error('Surface visible behind a modal');
 child.stdin.end(JSON.stringify({type:'disconnect'})+'\n');await new Promise(r=>child.once('exit',r));await fs.writeFile(path.join(out,'result.json'),JSON.stringify({ok:true,...result,diagnostic}));app.exit(0);
}).catch(async e=>{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'result.json'),JSON.stringify({ok:false,error:e.message}));child?.kill();app.exit(1);});
