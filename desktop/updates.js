import fs from 'node:fs/promises';
import path from 'node:path';
import updaterPackage from 'electron-updater';

export function validateFeed(value) {
  if(typeof value!=='string'||value.length>2000)throw Error('Adresse de publication invalide.');
  if(value==='')return '';
  const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Indique un dossier HTTPS sans identifiants ni paramètres.');
  return url.href.replace(/\/?$/,'/');
}
export async function createUpdates({app,backend,terminal,beforeInstall,Updater=process.platform==='darwin'?updaterPackage.MacUpdater:process.platform==='linux'?updaterPackage.AppImageUpdater:updaterPackage.NsisUpdater}) {
 const file=path.join(app.getPath('userData'),'updates.json');
 let feed='',client=null,busy=false,notified='',info={current:app.getVersion(),available:false,downloaded:false};
 try{feed=validateFeed(JSON.parse(await fs.readFile(file,'utf8')).feed||'');}catch(error){if(error.code!=='ENOENT')info.message='Configuration de mise à jour illisible : renseigne la source.';}
 const status=()=>({...info,feed});
 function init(){
   if(!feed)throw Error('Configure une source HTTPS avant de rechercher une version.');
   if(!app.isPackaged)throw Error('Les mises à jour sont disponibles dans la version installée.');
   if(process.platform==='linux'&&!process.env.APPIMAGE)throw Error('Pour une installation .deb, installe le nouveau paquet avec le gestionnaire système. Les mises à jour intégrées concernent la version AppImage.');
   if(client)return client;
   client=new Updater({provider:'generic',url:feed});client.autoDownload=false;client.autoInstallOnAppQuit=false;
   client.on('error',()=>{info.message='Impossible de vérifier ou télécharger la mise à jour.';});
   client.on('update-available',result=>{info={...info,available:true,downloaded:false,version:result.version,notes:typeof result.releaseNotes==='string'?result.releaseNotes:(result.releaseNotes||[]).map(n=>n.note).join('\n'),message:'Version '+result.version+' disponible.'};if(notified!==result.version){notified=result.version;backend.jobs.addActivity(info.message,'info');}});
   client.on('update-not-available',()=>{info={current:app.getVersion(),available:false,downloaded:false,message:'Tu utilises la dernière version publiée.'};});
   client.on('update-downloaded',()=>{info.downloaded=true;info.message='Mise à jour téléchargée, prête à installer.';});
   return client;
 }
 async function exclusive(task){if(busy)throw Error('Une opération de mise à jour est en cours.');busy=true;try{return await task();}finally{busy=false;}}
 async function check(){return exclusive(async()=>{await init().checkForUpdates();return status();});}
 const timer=setInterval(()=>{if(feed&&!busy&&!info.downloaded)check().catch(()=>{});},60*60000);timer.unref();
 return {status,
   configure:value=>exclusive(async()=>{feed=validateFeed(value);client=null;info={current:app.getVersion(),available:false,downloaded:false,message:feed?'Source enregistrée.':'Recherche automatique désactivée.'};await fs.writeFile(file,JSON.stringify({feed}),{mode:0o600});return status();}),
   check,
   download:()=>exclusive(async()=>{if(!info.available)throw Error('Recherche une version avant le téléchargement.');await init().downloadUpdate();return status();}),
   install:()=>exclusive(async()=>{
     if(!info.downloaded)throw Error('Télécharge une version avant installation.');
     const s=await backend.services.status();if(s.mysqlManaged||s.fivemManaged||terminal.running()||backend.jobs.list().some(j=>j.status==='running'))throw Error('Ferme les terminaux et termine les tâches/services gérés avant de mettre à jour.');
     const settings=path.join(app.getPath('userData'),'settings.json');try{await fs.copyFile(settings,settings+'.pre-update');}catch(e){if(e.code!=='ENOENT')throw e;}
     beforeInstall();client.quitAndInstall(true,true);return {installing:true};
   }),
   close:()=>clearInterval(timer),
 };
}
