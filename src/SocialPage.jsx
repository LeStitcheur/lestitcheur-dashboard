import React, { useEffect, useRef, useState } from 'react';
import { Globe2, Instagram, Music2, ArrowUpRight, Bell, MessageCircle, BarChart3, RefreshCw, Columns2, Monitor, LoaderCircle, AlertCircle } from 'lucide-react';
import { SOCIAL_CATALOG } from '../server/social.js';
import { api } from './api';

const bridge = window.socialSurface;
const PANELS = [['activity', Bell, 'Notifications & activité'], ['analytics', BarChart3, 'Statistiques'], ['publish', ArrowUpRight, 'Publier une image ou une vidéo']];

export default function SocialPage({ settings, desktop, notice, onSettings, suspended = false }) {
  const accounts = settings.socialAccounts || [];
  const [draft,setDraft]=useState(null);
  const [saving,setSaving]=useState(false);
  async function saveAccounts(next){setSaving(true);try{const result=await api('/settings',{socialAccounts:next});onSettings(result);setDraft(null);}catch(e){notice(e.message,'error');}finally{setSaving(false);}}
  async function save(e){e.preventDefault();const item={...draft,id:draft.id||'social-'+crypto.randomUUID()};await saveAccounts([...accounts.filter(a=>a.id!==item.id),item]);setSelected(item.id);}
  const [selected, setSelected] = useState(() => { try { return localStorage.getItem('social-selected') || accounts[0]?.id; } catch { return accounts[0]?.id; } });
  const account = accounts.find(a => a.id === selected) || accounts[0];
  const [mode, setMode] = useState('both');
  const [zoom, setZoom] = useState('auto');
  const [status, setStatus] = useState({});
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const slots = useRef({});
  const native = desktop && !!bridge;

  useEffect(() => {
    if (!native || !account) return;
    let active = true;
    setStatus({}); setError('');
    const accept = state => { if (active && state.accountId === account.id) setStatus(Object.fromEntries(state.panels.map(p => [p.target, p.phase]))); };
    const unsubscribe = bridge.onStatus(accept);
    bridge.mount(account.id, mode === 'publish' ? 'publish' : undefined).then(accept).catch(e => { if (active) setError(e.message); });
    try { localStorage.setItem('social-selected', account.id); } catch {}
    return () => { active = false; unsubscribe(); bridge.close(); };
  }, [account?.id, native, mode === 'publish']);

  useEffect(() => {
    if (!native || !account) return;
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const panels = {};
        for (const [target] of PANELS) {
          const node = slots.current[target];
          if (!node || (mode === 'both' ? target === 'publish' : target !== mode)) continue;
          const rect = node.getBoundingClientRect();
          panels[target] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
        bridge.layout({ accountId: account.id, visible: !draft && !suspended && !document.hidden, panels, zoom: zoom === 'auto' ? null : Number(zoom) });
      });
    };
    const observer = new ResizeObserver(update);
    for (const node of Object.values(slots.current)) if (node) observer.observe(node);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true); document.addEventListener('visibilitychange', update);
    update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); document.removeEventListener('visibilitychange', update); };
  }, [native, account?.id, mode, suspended, status, zoom, draft]);

  async function open(target, external = false) {
    setOpening(true);
    try { const result=await api(`/social/${account.id}/open`, { target, external }); if(result.url)window.open(result.url,'_blank','noopener,noreferrer'); }
    catch (e) { notice(e.message, 'error'); }
    finally { setOpening(false); }
  }
  async function refresh(target) {
    try { await bridge.refresh(target); } catch (e) { setError(e.message); }
  }
  return <section className="social-live">
    <div className="social-live-heading"><div><span className="eyebrow">TES COMPTES, EN DIRECT</span><h2>Un œil sur tes communautés.</h2><p>Notifications et statistiques s’affichent ici, dans les espaces officiels de chaque réseau.</p></div><span className="badge">{accounts.length} comptes</span></div>
    <div className="social-live-tools"><button className="button primary" onClick={()=>setDraft({platform:'instagram',handle:'',label:''})}>Ajouter un compte</button>{account&&<button className="button secondary" onClick={()=>setDraft({...account})}>Modifier ce compte</button>}</div>
    {draft&&<form className="creator-account-form" onSubmit={save}><h3>{draft.id?'Modifier le compte':'Nouveau compte'}</h3><label>Réseau<select value={draft.platform} disabled={!!draft.id} onChange={e=>setDraft({...draft,platform:e.target.value})}>{SOCIAL_CATALOG.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Pseudo / identifiant<input required maxLength={64} value={draft.handle} onChange={e=>setDraft({...draft,handle:e.target.value})}/></label><label>Nom affiché<input maxLength={80} value={draft.label} onChange={e=>setDraft({...draft,label:e.target.value})}/></label><div className="social-live-tools"><button className="button primary" disabled={saving}>Enregistrer</button><button type="button" className="button secondary" onClick={()=>setDraft(null)}>Annuler</button>{draft.id&&<button type="button" className="button secondary" disabled={saving} onClick={()=>{if(confirm('Retirer ce compte du dashboard ? Le compte sur le réseau ne sera pas supprimé.'))void saveAccounts(accounts.filter(a=>a.id!==draft.id));}}>Retirer le compte</button>}</div></form>}
    {!account?<p>Ajoute ton premier compte pour ouvrir son espace.</p>:<><div className="social-account-switch" role="group" aria-label="Choisir un compte social">{accounts.map(a => <button key={a.id} className={`${account.id === a.id ? 'selected' : ''} ${a.platform}`} aria-pressed={account.id === a.id} onClick={() => setSelected(a.id)}>{a.platform === 'instagram' ? <Instagram size={22}/> : a.platform==='tiktok'?<Music2 size={22}/>:<Globe2 size={22}/>}<span><strong>{a.label}</strong><small>@{a.handle}</small></span></button>)}</div>
    <div className="social-live-toolbar"><div className="filter-row" role="group" aria-label="Panneaux affichés">{[['both',Columns2,'Les deux'],['activity',Bell,'Notifications'],['analytics',BarChart3,'Statistiques'],['publish',ArrowUpRight,'Publier']].map(([id,Icon,label])=><button key={id} className={mode===id?'selected':''} aria-pressed={mode===id} onClick={()=>setMode(id)}><Icon size={15}/>{label}</button>)}</div><div className="social-live-tools"><button className="button secondary small" disabled={opening} onClick={()=>open(mode==='publish'?'publish':'home',true)}>Navigateur</button><button className="button secondary small" disabled={!desktop || opening} onClick={()=>open('profile')}><ArrowUpRight size={14}/>Mon compte</button><button className="button secondary small" disabled={!desktop || opening} onClick={()=>open('messages')}><MessageCircle size={14}/>Messages</button><button className="icon-button" disabled={!native} title="Actualiser les deux panneaux" aria-label="Actualiser les réseaux" onClick={()=>refresh()}><RefreshCw size={17}/></button></div></div>
    <p className="social-live-help">{SOCIAL_CATALOG.find(p=>p.id===account.platform)?.help} Connecte-toi au bon compte avant de publier. Notifications et statistiques restent celles proposées par le réseau ; certaines vues ouvrent son accueil. Ta session est conservée séparément pour @{account.handle}.</p>
    <label className="social-zoom">Taille d’affichage<select value={zoom} onChange={e=>setZoom(e.target.value)}><option value="auto">Adapter à la largeur</option><option value="0.65">65 %</option><option value="0.8">80 %</option><option value="1">100 %</option><option value="1.25">125 %</option></select><span>Les deux panneaux s’empilent lorsque la fenêtre est trop étroite.</span></label>
    {error && <p className="inline-error" role="alert"><AlertCircle size={15}/>{error}</p>}
    <div className={`social-live-panels ${mode==='both'?'dual':'single'}`}>{PANELS.filter(([target])=>mode==='both'?target!=='publish':mode===target).map(([target,Icon,label])=><section className="social-live-panel" key={target}>
      <header><h3><Icon size={17}/>{label}</h3><span>{status[target]==='loading'?'Chargement…':status[target]==='login'?'Connexion nécessaire':status[target]==='ready'?'Interface officielle':status[target]==='error'?'Indisponible':'Session dédiée'}</span><button className="icon-button" aria-label={`Actualiser ${label.toLowerCase()}`} disabled={!native} onClick={()=>refresh(target)}><RefreshCw size={14}/></button></header>
      <div className="social-native-slot" ref={node=>{slots.current[target]=node;}}><div className="social-native-placeholder">{!native ? <><Monitor size={30}/><h3>Ouvre l’application Windows</h3><p>La vue directe est disponible depuis le raccourci LeStitcheur Control sur ton bureau.</p></> : status[target]==='error' ? <><AlertCircle size={30}/><h3>Ce réseau ne répond pas.</h3><p>Réessaie avec le bouton Actualiser. Tu peux aussi ouvrir cet espace dans une fenêtre séparée.</p><button className="button secondary" onClick={()=>open(target)}>Ouvrir cet espace<ArrowUpRight size={15}/></button></> : <><LoaderCircle size={30} className="spin"/><h3>Connexion à {SOCIAL_CATALOG.find(p=>p.id===account.platform)?.name}…</h3><p>Connecte-toi lors de la première utilisation. Aucune donnée ni statistique n’est simulée.</p></>}</div></div>
    </section>)}</div>
    <p className="social-live-footnote">Les panneaux partagent la connexion de « Mon compte ». Après une connexion dans une fenêtre séparée, actualise les panneaux. Les chiffres et notifications proviennent du réseau ; ils ne sont pas regroupés dans un compteur global.</p>
  </>}</section>;
}
