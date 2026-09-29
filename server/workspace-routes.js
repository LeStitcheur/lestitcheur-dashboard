import { encryptBackup, decryptBackup } from './workspace.js';

export function workspaceRoutes(app,{workspace,settings,services,projects,jobs,ptero,cloud,music,terminalRunning,consoles}) {
  let checking=null,closed=false;
  async function check() {
    if(checking)return checking;
    checking=(async()=>{
      const items=[];
      try {const local=await services.status();items.push({id:'mysql',name:'MySQL local',status:local.mysql?'up':'down'},{id:'fivem',name:'FiveM local',status:local.fivem?'up':'down'});}catch {items.push({id:'local',name:'Services locaux',status:'unknown',detail:'Lecture impossible'});}
      try {const remote=await ptero.list();for(const server of remote.servers||[])items.push({id:'ptero:'+server.id,name:server.name,status:server.status==='running'?'up':server.status==='unknown'?'unknown':'down',detail:server.status});}catch {items.push({id:'ptero',name:'Pterodactyl',status:'unknown',detail:'Connexion impossible'});}
      if(settings.get().vercelToken)try {const data=await cloud.vercel();const seen=new Set();for(const d of data.deployments){const id=d.projectId||d.name;if(seen.has(id))continue;seen.add(id);items.push({id:'vercel:'+id,name:'Vercel · '+d.name,status:d.state==='READY'?'up':d.state==='ERROR'?'down':'pending',detail:d.state});}}catch {items.push({id:'vercel',name:'Vercel',status:'unknown',detail:'Connexion impossible'});}
      for(const site of workspace.get().monitors){if(closed)break;const start=Date.now();try {const response=await fetch(site.url,{method:'HEAD',redirect:'manual',signal:AbortSignal.timeout(8000)});await response.body?.cancel();items.push({id:'site:'+site.id,name:site.name,status:response.status<400?'up':'down',detail:'HTTP '+response.status,latency:Date.now()-start});}catch{items.push({id:'site:'+site.id,name:site.name,status:'down',detail:'Sans réponse'});}}
      if(!closed)await workspace.health(items);return workspace.get().health;
    })().finally(()=>checking=null);return checking;
  }
  const timer=setInterval(()=>{if(!closed)check().catch(()=>{});},60000);timer.unref();
  app.get('/api/workspace',(_req,res)=>res.json(workspace.get()));
  app.post('/api/workspace/preferences',async(req,res)=>{await workspace.preferences(req.body);res.json(workspace.get());});
  app.post('/api/workspace/read',async(_req,res)=>{await workspace.readAll();res.json(workspace.get());});
  app.post('/api/workspace/check',async(_req,res)=>res.json(await check()));
  app.post('/api/workspace/:kind/save',async(req,res)=>res.json(await workspace.save(req.params.kind,req.body)));
  app.post('/api/workspace/:kind/remove',async(req,res)=>{await workspace.remove(req.params.kind,req.body.id);res.json({success:true});});
  app.post('/api/workspace/sessions/:id/run',async(req,res)=>{
    const mode=workspace.get().sessions.find(s=>s.id===req.params.id);if(!mode)throw Error('Session introuvable.');
    if(mode.editor&&!mode.project)throw Error('Choisis un projet pour ouvrir VS Code dans cette session.');
    const result=jobs.create('Session · '+mode.name,async log=>{
      if(mode.stack){log('Démarrage MySQL puis FiveM…\n');const start=services.start('stack');if(start.jobId){while(jobs.find(start.jobId)?.status==='running')await new Promise(r=>setTimeout(r,500));if(jobs.find(start.jobId)?.status==='error')throw Error('Démarrage des services échoué. Consulte leur journal.');}}
      if(mode.editor&&mode.project){log('Ouverture du projet…\n');await projects.action(mode.project,'vscode',{});}
      if(mode.music){log('Lecture Spotify…\n');const player=music();if(player.open){await player.open();await new Promise(r=>setTimeout(r,1800));}await player.control('play');}
      log('Session prête.\n');
    },'session:'+mode.id);
    res.json({...result,terminal:mode.terminal,project:mode.project||null});
  });
  app.post('/api/backup/export',async(req,res)=>res.json({blob:await encryptBackup({version:1,settings:settings.get()},req.body.password)}));
  app.post('/api/backup/restore',async(req,res)=>{
    if(req.body.confirm!=='RESTAURER')throw Error('Confirmation requise.');
    const status=await services.status();if(status.mysqlManaged||status.fivemManaged||terminalRunning()||jobs.list().some(j=>j.status==='running'))throw Error('Ferme les terminaux et attends la fin des tâches et services gérés avant la restauration.');
    const data=await decryptBackup(req.body.blob,req.body.password);if(data.version!==1)throw Error('Version de sauvegarde incompatible.');
    await settings.restoreBackup(data.settings);ptero.invalidate();cloud.invalidate();consoles.disconnectAll();jobs.addActivity('Paramètres restaurés','success');res.json(settings.public());
  });
  return {close:()=>{closed=true;clearInterval(timer);},check};
}
