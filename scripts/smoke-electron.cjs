// Isolated application integration check; never uses the installed user profile.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),{pathToFileURL}=require('node:url');
const project=path.resolve(__dirname,'..');
const root=process.env.PANEL_SMOKE_PACKAGED ? path.join(project,'release','win-unpacked','resources','app.asar') : project;
const out=path.join(project,'.local','electron-smoke');
app.setPath('userData',path.join(out,'profile'));
let server,manager,window;
const wait=async predicate=>{const until=Date.now()+15000;while(!await predicate()){if(Date.now()>until)throw Error('Integration check timed out');await new Promise(r=>setTimeout(r,100));}};
app.whenReady().then(async()=>{
 const {createApp}=await import(pathToFileURL(path.join(root,'server','index.js')));
 const {createTerminalPool}=await import(pathToFileURL(path.join(root,'desktop','terminal.js')));
 const {spawnPty}=await import(pathToFileURL(path.join(root,'desktop','pty-process.js')));
 const backend=await createApp({port:4324,desktop:true,dataDir:path.join(out,'settings')});
 await backend.settings.update({setupComplete:true});
 server=backend.app.listen(4324,'127.0.0.1');
 window=new BrowserWindow({show:false,x:-20000,y:0,skipTaskbar:true,focusable:false,width:1480,height:1000,webPreferences:{preload:path.join(root,'desktop','preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 window.showInactive();
 manager=createTerminalPool({settings:()=>backend.settings.get(),appRoot:root,spawn:spawnPty,emit:data=>window.webContents.send('terminal:data',data),confirm:async()=>false});
 for(const action of ['open','snapshot','list','remove','write','resize','stop'])ipcMain.handle('terminal:'+action,(_e,...args)=>manager[action](...args));
 ipcMain.on('terminal:ack',(_e,id,count)=>manager.ack(id,count));
 ipcMain.on('terminal:focus',()=>{});
 await window.loadURL('http://127.0.0.1:4324');
 const click=label=>window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`);
 await wait(()=>window.webContents.executeJavaScript("!!document.querySelector('nav')"));
 await click('Terminaux');await wait(()=>manager.snapshot()?.output.includes('>'));
 const first=manager.snapshot().id;
 manager.write(first,"$panelCheck=42; Write-Output ('APP_READY_'+$panelCheck)\r");
 await wait(()=>manager.snapshot().output.includes('APP_READY_42'));
 await click('Vue d’ensemble');await click('Terminaux');
 if(manager.snapshot().id!==first)throw Error('Session lost on navigation');
 manager.write(first,"Write-Output ('STATE_'+$panelCheck)\r");await wait(()=>manager.snapshot().output.includes('STATE_42'));
 await wait(()=>window.webContents.executeJavaScript("document.querySelector('.xterm-screen')?.clientWidth > 100"));
 await new Promise(r=>setTimeout(r,500));
 await fs.writeFile(path.join(out,'diagnostics.json'),JSON.stringify(await window.webContents.executeJavaScript("({screen:document.querySelector('.xterm-screen').outerHTML,errors:Array.from(document.querySelectorAll('.inline-error')).map(e=>e.textContent)})")));
 await fs.writeFile(path.join(out,'terminal.png'),(await window.webContents.capturePage()).toPNG());
 await click('Vue d’ensemble');await new Promise(r=>setTimeout(r,250));
 await fs.writeFile(path.join(out,'dashboard.png'),(await window.webContents.capturePage()).toPNG());
 await click('Terminaux');
 await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.terminal-tabs button')).find(b=>b.textContent==='+ Terminal').click()");
 await wait(()=>manager.list().length===2&&manager.list()[1].output?.includes('>'));
 const second=manager.list()[1];manager.write(second.id,"Write-Output ('SECOND_'+'OK')\r");await wait(()=>manager.snapshot(second.slot).output.includes('SECOND_OK'));
 if(manager.snapshot().output.includes('SECOND_OK'))throw Error('Terminal output crossed sessions');
 await window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.terminal-tabs button')).find(b=>b.textContent==='Côte à côte').click()");
 await wait(()=>window.webContents.executeJavaScript("Array.from(document.querySelectorAll('.local-terminal-host')).filter(e=>e.getBoundingClientRect().width>100).length===2"));
 await new Promise(r=>setTimeout(r,500));
 await fs.writeFile(path.join(out,'split-layout.json'),JSON.stringify(await window.webContents.executeJavaScript("({split:!!document.querySelector('.terminal-split'),panes:Array.from(document.querySelectorAll('.local-terminal-host')).map(e=>({x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width})),button:Array.from(document.querySelectorAll('.terminal-tabs button')).at(-1).textContent})")));
 await fs.writeFile(path.join(out,'split.png'),(await window.webContents.capturePage()).toPNG());
 manager.write(second.id,'exit\r');await wait(()=>!manager.snapshot(second.slot).running);
 await click('Mon espace');
 for(const label of ['Notifications','Surveillance','Studio créateur','Mon accueil','Commandes','Sauvegardes','Mises à jour','Journal Discord','Sessions']) {
  await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.workspace-tabs button')).find(b=>b.textContent.startsWith(${JSON.stringify(label)})).click()`);
  await new Promise(r=>setTimeout(r,60));
  if(!await window.webContents.executeJavaScript("!!document.querySelector('.workspace-panel') && !document.querySelector('.fatal-error')"))throw Error('Workspace tab failed: '+label);
 }
 await fs.writeFile(path.join(out,'workspace.png'),(await window.webContents.capturePage()).toPNG());
 await click('Terminaux');
 manager.write(first,'exit\r');await wait(()=>!manager.running());
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({ok:true,packaged:!!process.env.PANEL_SMOKE_PACKAGED,interactive:true,preservedAcrossPages:true,multipleTerminals:true,workspaceTabs:true,cleanExit:true}));
 app.exit(0);
}).catch(async error=>{await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'result.json'),JSON.stringify({ok:false,error:error.stack}));try{manager?.close();}finally{app.exit(1);}});


