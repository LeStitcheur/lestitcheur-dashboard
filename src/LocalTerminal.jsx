import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, Copy, ClipboardPaste, RefreshCw, Square, ShieldCheck } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import './terminal.css';

function TerminalPane({ visible, request, slot }) {
  const host = useRef(), terminal = useRef(), fit = useRef(), current = useRef(), ready = useRef(false), attaching = useRef(false), queue = useRef([]), generation = useRef(0), handled = useRef(Symbol());
  const [session, setSession] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const bridge = window.localTerminal;
  function receive(event) {
    if (!ready.current) { if(attaching.current)queue.current.push(event); return; }
    if (!current.current || event.id !== current.current.id || event.seq <= current.current.seq) return;
    current.current.seq = event.seq;
    if (typeof event.data === 'string') terminal.current.write(event.data,()=>bridge.ack(event.id,event.data.length));
    else { current.current.running = false; setSession(s=>s ? {...s,running:false,exitCode:event.exitCode}:s); terminal.current.writeln(`\r\n[Session terminée · code ${event.exitCode}]`); }
  }
  async function copy() { try { await bridge.copy(terminal.current.getSelection()); } catch(e) {setError(e.message);} }
  async function paste() { try { const text=await bridge.paste(); if(current.current?.running)terminal.current.paste(text); } catch(e) {setError(e.message);} }
  function resize() { if(!host.current?.clientWidth || !host.current?.clientHeight)return; fit.current?.fit(); if(current.current?.running) bridge.resize(current.current.id,terminal.current.cols,terminal.current.rows).catch(e=>setError(e.message)); }
  async function open(restart=false) {
    if(!bridge)return;
    const turn=++generation.current;attaching.current=true;ready.current=false;queue.current=[];setBusy(true);setError('');
    try {
      const result=await bridge.open({slot, project:request?.project, restart, cols:terminal.current.cols, rows:terminal.current.rows});
      if(turn!==generation.current)return;
      current.current=result;setSession(result);terminal.current.reset();
      if(result){terminal.current.write(result.output);if(request?.command&&result.running&&!restart)await bridge.write(result.id,request.command);}
      ready.current=true;for(const event of queue.current)receive(event);queue.current=[];resize();terminal.current.focus();
    } catch(e) { if(turn===generation.current){ready.current=true;setError(e.message);} }
    finally {if(turn===generation.current){attaching.current=false;setBusy(false);}}
  }
  useEffect(()=>{
    if(!bridge)return;
    const term = terminal.current = new XTerminal({cursorBlink:true,screenReaderMode:true,convertEol:false,fontFamily:'Cascadia Code, Consolas, monospace',fontSize:14,scrollback:10000,allowProposedApi:false,theme:{background:'#090f16',foreground:'#dce6ef',cursor:'#ff5876',selectionBackground:'#40556a'}});
    fit.current=new FitAddon();term.loadAddon(fit.current);term.open(host.current);
    const input=term.onData(data=>{if(current.current?.running)bridge.write(current.current.id,data).catch(e=>setError(e.message));});
    const unsubscribe=bridge.onData(receive);
    term.attachCustomKeyEventHandler(event=>{
      const key=event.key.toLowerCase();
      if(event.ctrlKey && ((key==='c' && (event.shiftKey||term.hasSelection())) || (key==='v'&&event.shiftKey))){
        if(event.type==='keydown'){event.preventDefault();key==='c'?void copy():void paste();}return false;
      }return true;
    });
    const observer=new ResizeObserver(resize);observer.observe(host.current);
    return()=>{++generation.current;ready.current=false;observer.disconnect();unsubscribe();input.dispose();term.dispose();bridge.focus(false);};
  },[]);
  useEffect(()=>{if(!visible){bridge?.focus(false);return;}if(handled.current!==request || !current.current){handled.current=request;void open();}else {resize();terminal.current?.focus();}},[visible,request]);
  async function stop(){if(!current.current)return;setBusy(true);try{await bridge.stop(current.current.id);const result=await bridge.snapshot(slot);current.current=result;setSession(result);if(!result)terminal.current.writeln('\r\n[Session fermée]');}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <div hidden={!visible} className="local-terminal-page">
    <section className="local-terminal-panel"><header><div><Terminal size={19}/><strong>{session?.shell?.split(/[\\/]/).pop()?.replace(/\.exe$/i,'')||'Terminal'}</strong><span className={session?.running?'running':''}>{session?.running?'Session active':'Terminal standard'}</span></div><div className="terminal-tools"><button title="Copier la sélection · Ctrl+Maj+C" aria-label="Copier la sélection" disabled={!bridge} onClick={copy}><Copy size={16}/></button><button title="Coller · Ctrl+Maj+V" aria-label="Coller dans le terminal" disabled={!session?.running} onClick={paste}><ClipboardPaste size={16}/></button><button disabled={busy||!bridge} onClick={()=>open(true)}><RefreshCw size={15}/>{session?'Nouvelle session':'Ouvrir le terminal'}</button><button disabled={busy||!session?.running} onClick={stop}><Square size={14}/>Fermer</button></div></header>
    <div className="terminal-location" title={session?.shell}>{session?.cwd||'Dossier de projets'}<span>{busy?'Ouverture…':(window.desktopSetup?.platform==='win32'?'Console Windows':'Terminal système')}</span></div>
    {error&&<p className="inline-error" role="alert">{error}</p>}
    {!bridge&&<p className="terminal-unavailable">Ouvre le dashboard depuis son raccourci bureau pour utiliser le terminal intégré.</p>}
    <div className="local-terminal-host" ref={host} onFocusCapture={()=>bridge?.focus(true)} onBlurCapture={()=>bridge?.focus(false)}/>
    <footer><span>Tab : complétion · ↑ ↓ : historique · Ctrl+C : interrompre · Ctrl+Maj+C / V : copier / coller</span><span>La session reste ouverte lorsque tu changes de page.</span></footer></section>
  </div>;
}

export default function LocalTerminal({visible,request,onAdmin,commands=[]}) {
 const [tabs,setTabs]=useState([{slot:'main',name:'Terminal',request:null}]),[active,setActive]=useState('main'),[split,setSplit]=useState(false),[error,setError]=useState('');
 const seen=useRef(null);
 useEffect(()=>{window.localTerminal?.list?.().then(items=>{if(items.length){setTabs(items.map((t,i)=>({slot:t.slot,name:'Terminal '+(i+1),request:null})));setActive(items[0].slot);}}).catch(e=>setError(e.message));},[]);
 useEffect(()=>{if(request&&seen.current!==request){seen.current=request;setTabs(old=>old.map(t=>t.slot===active?{...t,request}:t));}},[request,active]);
 async function remove(slot){try{if(await window.localTerminal.remove(slot)){setTabs(old=>old.filter(t=>t.slot!==slot));setActive(tabs.find(t=>t.slot!==slot)?.slot||'main');}}catch(e){setError(e.message);}}
 async function insert(command){try{const s=await window.localTerminal.snapshot(active);if(!s?.running)throw Error('Ouvre une session avant d’insérer une commande.');await window.localTerminal.write(s.id,command);}catch(e){setError(e.message);}}
 return <div hidden={!visible}><div className="terminal-tabs">{tabs.map(t=><div key={t.slot} className={t.slot===active?'selected':''}><button onClick={()=>setActive(t.slot)}>›</button><input aria-label="Nom du terminal" maxLength={40} value={t.name} onFocus={()=>setActive(t.slot)} onChange={e=>setTabs(old=>old.map(x=>x.slot===t.slot?{...x,name:e.target.value}:x))}/><button aria-label={'Fermer '+t.name} onClick={()=>remove(t.slot)}>×</button></div>)}<button disabled={tabs.length>=6} onClick={()=>{const slot=crypto.randomUUID();setTabs(old=>[...old,{slot,name:'Terminal '+(old.length+1),request:null}]);setActive(slot);}}>+ Terminal</button><button disabled={tabs.length<2} onClick={()=>setSplit(!split)}>{split?'Un panneau':'Côte à côte'}</button></div>{error&&<p role="alert" className="inline-error">{error}</p>}<div className={split?'terminal-split':''}>{tabs.map(t=><TerminalPane key={t.slot} slot={t.slot} visible={visible&&(t.slot===active||(split&&t.slot===tabs.find(x=>x.slot!==active)?.slot))} request={t.request}/>)}</div><div className="terminal-snippets"><span>Insérer sans exécuter :</span>{commands.map(c=><button key={c.id} title={c.command} onClick={()=>insert(c.command)}>{c.name}</button>)}</div><section className="terminal-admin-strip" style={{display:window.desktopSetup?.platform&&window.desktopSetup.platform!=='win32'?'none':undefined}}><ShieldCheck size={22}/><div><h2>Terminal administrateur</h2><p>Fenêtre Windows avec confirmation UAC.</p></div><button className="button secondary" onClick={onAdmin}>Ouvrir en administrateur</button></section></div>;
}
