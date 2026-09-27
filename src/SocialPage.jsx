import React, { useEffect, useRef, useState } from 'react';
import { Instagram, Music2, ArrowUpRight, Bell, MessageCircle, BarChart3, RefreshCw, Columns2, Monitor, LoaderCircle, AlertCircle } from 'lucide-react';
import { api } from './api';

const bridge = window.socialSurface;
const PANELS = [['activity', Bell, 'Notifications & activité'], ['analytics', BarChart3, 'Statistiques']];

export default function SocialPage({ settings, desktop, notice, suspended = false }) {
  const accounts = settings.socialAccounts || [];
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
    bridge.mount(account.id).then(accept).catch(e => { if (active) setError(e.message); });
    try { localStorage.setItem('social-selected', account.id); } catch {}
    return () => { active = false; unsubscribe(); bridge.close(); };
  }, [account?.id, native]);

  useEffect(() => {
    if (!native || !account) return;
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const panels = {};
        for (const [target] of PANELS) {
          const node = slots.current[target];
          if (!node || (mode !== 'both' && target !== mode)) continue;
          const rect = node.getBoundingClientRect();
          panels[target] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
        bridge.layout({ accountId: account.id, visible: !suspended && !document.hidden, panels, zoom: zoom === 'auto' ? null : Number(zoom) });
      });
    };
    const observer = new ResizeObserver(update);
    for (const node of Object.values(slots.current)) if (node) observer.observe(node);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true); document.addEventListener('visibilitychange', update);
    update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); document.removeEventListener('visibilitychange', update); };
  }, [native, account?.id, mode, suspended, status, zoom]);

  async function open(target) {
    setOpening(true);
    try { await api(`/social/${account.id}/open`, { target }); }
    catch (e) { notice(e.message, 'error'); }
    finally { setOpening(false); }
  }
  async function refresh(target) {
    try { await bridge.refresh(target); } catch (e) { setError(e.message); }
  }
  if (!account) return <p>Aucun compte social configuré.</p>;
  return <section className="social-live">
    <div className="social-live-heading"><div><span className="eyebrow">TES COMPTES, EN DIRECT</span><h2>Un œil sur tes communautés.</h2><p>Notifications et statistiques s’affichent ici, dans les espaces officiels de chaque réseau.</p></div><span className="badge">{accounts.length} comptes</span></div>
    <div className="social-account-switch" role="group" aria-label="Choisir un compte social">{accounts.map(a => <button key={a.id} className={`${account.id === a.id ? 'selected' : ''} ${a.platform}`} aria-pressed={account.id === a.id} onClick={() => setSelected(a.id)}>{a.platform === 'instagram' ? <Instagram size={22}/> : <Music2 size={22}/>}<span><strong>{a.label}</strong><small>@{a.handle}</small></span></button>)}</div>
    <div className="social-live-toolbar"><div className="filter-row" role="group" aria-label="Panneaux affichés">{[['both',Columns2,'Les deux'],['activity',Bell,'Notifications'],['analytics',BarChart3,'Statistiques']].map(([id,Icon,label])=><button key={id} className={mode===id?'selected':''} aria-pressed={mode===id} onClick={()=>setMode(id)}><Icon size={15}/>{label}</button>)}</div><div className="social-live-tools"><button className="button secondary small" disabled={!desktop || opening} onClick={()=>open('profile')}><ArrowUpRight size={14}/>Mon compte</button><button className="button secondary small" disabled={!desktop || opening} onClick={()=>open('messages')}><MessageCircle size={14}/>Messages</button><button className="icon-button" disabled={!native} title="Actualiser les deux panneaux" aria-label="Actualiser les réseaux" onClick={()=>refresh()}><RefreshCw size={17}/></button></div></div>
    <p className="social-live-help">{account.platform==='tiktok' ? 'Notifications : ouvre la cloche TikTok dans le panneau de gauche. Les statistiques s’affichent dans TikTok Studio à droite.' : 'Connecte-toi au bon compte dans le panneau. La disponibilité des statistiques dépend de ton compte et des outils proposés par Instagram.'} Ta connexion est conservée séparément pour @{account.handle}.</p>
    <label className="social-zoom">Taille d’affichage<select value={zoom} onChange={e=>setZoom(e.target.value)}><option value="auto">Adapter à la largeur</option><option value="0.65">65 %</option><option value="0.8">80 %</option><option value="1">100 %</option><option value="1.25">125 %</option></select><span>Les deux panneaux s’empilent lorsque la fenêtre est trop étroite.</span></label>
    {error && <p className="inline-error" role="alert"><AlertCircle size={15}/>{error}</p>}
    <div className={`social-live-panels ${mode==='both'?'dual':'single'}`}>{PANELS.filter(([target])=>mode==='both'||mode===target).map(([target,Icon,label])=><section className="social-live-panel" key={target}>
      <header><h3><Icon size={17}/>{label}</h3><span>{status[target]==='loading'?'Chargement…':status[target]==='login'?'Connexion nécessaire':status[target]==='ready'?'Interface officielle':status[target]==='error'?'Indisponible':'Session dédiée'}</span><button className="icon-button" aria-label={`Actualiser ${label.toLowerCase()}`} disabled={!native} onClick={()=>refresh(target)}><RefreshCw size={14}/></button></header>
      <div className="social-native-slot" ref={node=>{slots.current[target]=node;}}><div className="social-native-placeholder">{!native ? <><Monitor size={30}/><h3>Ouvre l’application Windows</h3><p>La vue directe est disponible depuis le raccourci LeStitcheur Control sur ton bureau.</p></> : status[target]==='error' ? <><AlertCircle size={30}/><h3>Ce réseau ne répond pas.</h3><p>Réessaie avec le bouton Actualiser. Tu peux aussi ouvrir cet espace dans une fenêtre séparée.</p><button className="button secondary" onClick={()=>open(target)}>Ouvrir cet espace<ArrowUpRight size={15}/></button></> : <><LoaderCircle size={30} className="spin"/><h3>Connexion à {account.platform==='tiktok'?'TikTok':'Instagram'}…</h3><p>Connecte-toi lors de la première utilisation. Aucune donnée ni statistique n’est simulée.</p></>}</div></div>
    </section>)}</div>
    <p className="social-live-footnote">Les panneaux partagent la connexion de « Mon compte ». Après une connexion dans une fenêtre séparée, actualise les panneaux. Les chiffres et notifications proviennent du réseau ; ils ne sont pas regroupés dans un compteur global.</p>
  </section>;
}
