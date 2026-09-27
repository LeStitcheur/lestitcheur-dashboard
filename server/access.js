import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {seal,unseal} from './platform.js';
export const DISCORD_OWNER='904012939206471710';
export const DISCORD_CLIENT='1536996866993037364';
export async function createAccess({directory,origin,fetcher=fetch,encrypt=seal,decrypt=unseal,now=Date.now}){
 const file=path.join(directory,'discord-access.json');let config={secret:'',session:null},identity=null,checked=0,pending=null,refreshing;
 try{config=JSON.parse(await decrypt(await fs.readFile(file,'utf8')));}catch(e){if(e.code!=='ENOENT')config={secret:'',session:null};}
 const persist=async()=>{await fs.mkdir(directory,{recursive:true});await fs.writeFile(file+'.tmp',await encrypt(JSON.stringify(config)),{mode:0o600});await fs.rename(file+'.tmp',file);};
 const allowed=()=>identity?.id===DISCORD_OWNER&&config.session?.expiresAt>now();
 const publicState=()=>({authorized:!!allowed(),configured:!!config.secret,clientId:DISCORD_CLIENT,ownerId:DISCORD_OWNER,redirectUri:origin+'/auth/discord/callback',user:allowed()?{id:identity.id,username:identity.username}:null});
 async function request(url,options){const response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Discord a refusé la connexion. Reconnecte-toi.');return response.json();}
 async function exchange(fields){return request('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:DISCORD_CLIENT,client_secret:config.secret,...fields})});}
 async function verify(token){const user=await request('https://discord.com/api/v10/users/@me',{headers:{Authorization:'Bearer '+token}});if(user.id!==DISCORD_OWNER)throw Error('Ce compte Discord n’est pas autorisé à ouvrir ce dashboard.');return user;}
 async function accept(tokens){if(typeof tokens.access_token!=='string'||typeof tokens.refresh_token!=='string'||!Number.isFinite(tokens.expires_in)||tokens.expires_in<=0)throw Error('Réponse Discord invalide.');const user=await verify(tokens.access_token);config.session={accessToken:tokens.access_token,refreshToken:tokens.refresh_token,expiresAt:now()+tokens.expires_in*1000};identity=user;checked=now();await persist();}
 async function ensure(){
  if(!config.session||!config.secret)return false;
  if(allowed()&&now()-checked<15*60*1000&&config.session.expiresAt-now()>60000)return true;
  if(refreshing)return refreshing;
  refreshing=(async()=>{try{if(config.session.expiresAt-now()<60000){await accept(await exchange({grant_type:'refresh_token',refresh_token:config.session.refreshToken}));}else{identity=await verify(config.session.accessToken);checked=now();}return !!allowed();}catch{identity=null;checked=0;return false;}finally{refreshing=null;}})();return refreshing;
 }
 return {allowed,ensure,publicState,
  async configure(secret){if(typeof secret!=='string'||secret.length<16||secret.length>512||/\s/.test(secret))throw Error('Client Secret Discord invalide.');config={secret,session:null};identity=null;await persist();return publicState();},
  begin(){if(!config.secret)throw Error('Configure d’abord le Client Secret sur ce PC.');pending={state:randomBytes(32).toString('hex'),expires:now()+5*60*1000};const url=new URL('https://discord.com/oauth2/authorize');url.search=new URLSearchParams({client_id:DISCORD_CLIENT,response_type:'code',scope:'identify',redirect_uri:origin+'/auth/discord/callback',state:pending.state,prompt:'consent'}).toString();return {url:url.href};},
  async callback(query){const state=String(query.state||'');const expected=pending;pending=null;if(!expected||expected.expires<now()||state.length!==expected.state.length||!timingSafeEqual(Buffer.from(state),Buffer.from(expected.state)))throw Error('Connexion expirée ou invalide. Recommence depuis le dashboard.');if(typeof query.code!=='string'||query.code.length>2048)throw Error('Autorisation Discord annulée.');await accept(await exchange({grant_type:'authorization_code',code:query.code,redirect_uri:origin+'/auth/discord/callback'}));return publicState();},
  async logout(){identity=null;pending=null;config.session=null;await persist();},
 };
}
