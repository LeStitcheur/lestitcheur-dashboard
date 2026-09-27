const {app,BrowserWindow}=require('electron');const {spawn}=require('node:child_process');const {createInterface}=require('node:readline');const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');const out=path.join(root,'.local','rdp-smoke');let win,child;
app.setPath('userData',path.join(out,'profile'));
app.whenReady().then(async()=>{
 await fs.mkdir(out,{recursive:true});win=new BrowserWindow({show:false,x:-20000,y:0,width:1100,height:850,skipTaskbar:true,focusable:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});await win.loadURL('data:text/html,<h1>RDP isolated host test</h1>');win.showInactive();
 const handle=win.getNativeWindowHandle().readBigUInt64LE().toString();child=spawn(path.join(root,'desktop','rdp-host.exe'),[handle,String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});let error='';child.stderr.on('data',d=>error+=d.toString());
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('RDP initialization timed out')),15000);const lines=createInterface({input:child.stdout});lines.on('line',line=>{let data;try{data=JSON.parse(line);}catch{return;}if(data.phase==='error'){clearTimeout(timer);reject(Error(JSON.stringify(data)));}else if(data.phase==='ready'){clearTimeout(timer);resolve(data);}});child.on('error',reject);child.on('exit',code=>{if(code)reject(Error('Host exit '+code+' '+error));});});
 child.stdin.write(JSON.stringify({type:'layout',x:20,y:80,width:900,height:600,visible:true})+'\n');await new Promise(r=>setTimeout(r,200));
 child.stdin.end(JSON.stringify({type:'disconnect'})+'\n');await new Promise(r=>child.once('exit',r));await fs.writeFile(path.join(out,'result.json'),JSON.stringify({ok:true,...result}));app.exit(0);
}).catch(async e=>{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'result.json'),JSON.stringify({ok:false,error:e.message}));child?.kill();app.exit(1);});
