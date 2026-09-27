import React, { useEffect, useState } from 'react';
import { Code2, FolderCode, RefreshCw, Clock3 } from 'lucide-react';
import { api } from './api';

const date = value => value ? new Date(value).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Indisponible';
const duration = minutes => minutes === 10080 ? '7 jours' : minutes && minutes % 60 === 0 ? `${minutes / 60} h` : minutes ? `${minutes} min` : 'Quota';
export default function CodexSummary() {
  const [data, setData] = useState(null), [busy, setBusy] = useState(true), [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    async function load() { if (document.hidden) return; setBusy(true); try { const result = await api('/codex'); if(active) {setData(result);setError('');} } catch(e) { if(active)setError(e.message); } finally {if(active)setBusy(false);} }
    load(); const timer = setInterval(load, 60000);
    return () => {active=false;clearInterval(timer);};
  }, [revision]);
  return <section className="codex-summary" aria-label="Récap Codex">
    <header><div className="codex-heading-icon"><Code2 size={23}/></div><div><span className="eyebrow">TON COPILOTE DE DÉVELOPPEMENT</span><h2>Ton activité Codex</h2></div><button className="button ghost small" disabled={busy} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={14} className={busy?'spin':''}/>Actualiser</button></header>
    {error&&<p className="inline-error" role="status">{error}</p>}
    <div className="codex-summary-grid"><div className="codex-usage"><h3>Usage du compte</h3><p className="codex-muted">Quotas partagés entre tes tâches Codex.</p>
      {!data&&<p className="codex-empty">{busy?'Connexion à Codex…':'Données indisponibles.'}</p>}
      {data?.usageError&&<p className="codex-empty">{data.usageError}</p>}
      {data&&!data.usageError&&!data.limits.some(l=>l.windows.length)&&<p className="codex-empty">Aucun quota communiqué pour ce compte.</p>}
      {data?.limits.map(bucket=>bucket.windows.map(w=><div className="codex-quota" key={`${bucket.id}-${w.key}`}><div><span>{bucket.name} · {duration(w.minutes)}</span><strong>{Math.round(w.used)}<small>% utilisés</small></strong></div><div className={`codex-meter ${w.used>=90?'high':''}`} role="progressbar" aria-label={`${bucket.name} ${duration(w.minutes)} utilisés`} aria-valuenow={w.used} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${w.used}%`}}/></div><p><span>{Math.round(100-w.used)} % restants</span><span>Réinitialisation : {date(w.resetsAt)}</span></p></div>))}
    </div><div className="codex-recent"><h3>Derniers projets utilisés</h3><p className="codex-muted">D’après les tâches locales récemment mises à jour.</p><div className="codex-project-list">{data?.projects.map(p=><article key={p.path}><FolderCode size={19}/><div><strong>{p.name}</strong><span title={p.title}>{p.title}</span><small title={p.path}>{p.path}</small></div><time dateTime={p.updatedAt}>{date(p.updatedAt)}</time></article>)}</div>{!data?.projects.length&&<p className="codex-empty">{data?.projectsError||(busy?'Chargement des projets…':'Aucun projet récent trouvé dans Codex.')}</p>}</div></div>
    <footer><Clock3 size={12}/>{data?.checkedAt?`Dernier relevé : ${date(data.checkedAt)}`:'En attente du premier relevé'}<span>Actualisation toutes les minutes · Ce PC</span></footer>
  </section>;
}
