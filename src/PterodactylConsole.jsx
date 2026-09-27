import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Check, ChevronRight, Eraser, LoaderCircle, Radio, RefreshCw, Send, Terminal as TerminalIcon, WifiOff } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { api, streamConsole } from './api.js';
import '@xterm/xterm/css/xterm.css';
import './console.css';

const CONNECTIONS = { connecting: 'Connexion…', authenticating: 'Authentification…', connected: 'Connectée', reconnecting: 'Reconnexion…', error: 'Déconnectée' };
const SERVER_STATES = { running: 'En ligne', starting: 'Démarrage', stopping: 'Arrêt en cours', offline: 'Arrêté', unknown: 'État inconnu' };

export default function PterodactylConsole({ server }) {
  const host = useRef(null), terminal = useRef(null), commandInput = useRef(null);
  const history = useRef([]), historyIndex = useRef(-1), draft = useRef('');
  const busy = useRef(false), alive = useRef(false);
  const [connection, setConnection] = useState('connecting');
  const [serverState, setServerState] = useState(server.status || 'unknown');
  const [message, setMessage] = useState('Connexion à la console du serveur…');
  const [error, setError] = useState('');
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [reconnect, setReconnect] = useState(0);
  const [unread, setUnread] = useState(false);
  const [hasOutput, setHasOutput] = useState(false);

  useEffect(() => {
    alive.current = true;
    const term = new Terminal({
      disableStdin: true, cursorBlink: false, cursorStyle: 'bar', fontFamily: 'Consolas, "Courier New", monospace', fontSize: 12, lineHeight: 1.35,
      scrollback: 5000, convertEol: true, screenReaderMode: true, allowProposedApi: false,
      theme: { background: '#100f14', foreground: '#dbd7e1', cursor: '#100f14', selectionBackground: '#78364e', black: '#27242d', red: '#f67588', green: '#82c79c', yellow: '#e9c784', blue: '#84a8ed', magenta: '#b99adb', cyan: '#81c5d3', white: '#ded9e5', brightBlack: '#8e8698', brightRed: '#ff8d9e', brightGreen: '#a0dfb6', brightYellow: '#f4d8a3', brightBlue: '#a4bfee', brightMagenta: '#d0b5e8', brightCyan: '#a2dbe5', brightWhite: '#ffffff' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit); term.open(host.current); terminal.current = term;
    let frame;
    const fitTerminal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (host.current?.clientWidth && host.current?.clientHeight) fit.fit(); });
    };
    fitTerminal();
    const resize = new ResizeObserver(fitTerminal); resize.observe(host.current);
    const scroll = term.onScroll(() => { if (term.buffer.active.viewportY >= term.buffer.active.baseY) setUnread(false); });
    return () => { alive.current = false; resize.disconnect(); cancelAnimationFrame(frame); scroll.dispose(); terminal.current = null; term.dispose(); };
  }, [server.id]);

  useEffect(() => {
    const controller = new AbortController();
    let failed = false, queued = '', frame = null;
    setConnection('connecting'); setError(''); setUnread(false); setSent(false);
    setMessage('Connexion à la console du serveur…');
    // Every terminal write is bounded and batched to keep busy servers responsive.
    const flush = () => {
      frame = null;
      const term = terminal.current;
      if (!term || controller.signal.aborted || !queued) return;
      const output = queued; queued = '';
      const atBottom = term.buffer.active.viewportY >= term.buffer.active.baseY;
      term.write(output, () => { if (!controller.signal.aborted && !atBottom) setUnread(true); });
    };
    const write = text => {
      queued += text.replace(/(?:\r\n|\r|\n)$/, '') + '\x1b[0m\r\n';
      if (queued.length > 512 * 1024) queued = '\r\n[Affichage limité : débit de logs élevé]\r\n' + queued.slice(-256 * 1024);
      if (frame === null) frame = requestAnimationFrame(flush);
    };
    const receive = event => {
      if (controller.signal.aborted) return;
      if (event.type === 'connection') {
        setConnection(event.state);
        setMessage(event.message || (event.state === 'connected' ? 'Logs en direct · session authentifiée' : event.state === 'reconnecting' ? `Tentative de reconnexion ${event.attempt || 1}…` : 'Connexion à la console du serveur…'));
        if (event.state === 'connected') setError('');
      } else if (event.type === 'history-reset') {
        queued = ''; terminal.current?.reset(); setUnread(false); setHasOutput(false);
      } else if (event.type === 'output' && typeof event.text === 'string') {
        setHasOutput(true); write(event.text);
      } else if (event.type === 'status') {
        setServerState(event.state);
      } else if (event.type === 'error') {
        failed = true; setError(event.message); setConnection('error');
      } else if (event.type === 'notice') {
        setHasOutput(true); write(`[Wings] ${event.message}`);
      }
    };
    streamConsole(server.id, receive, controller.signal).then(() => {
      if (!controller.signal.aborted && !failed) { setConnection('error'); setError('Le flux de la console a été fermé. Clique sur Reconnecter pour le rouvrir.'); }
    }).catch(err => {
      if (!controller.signal.aborted) { setConnection('error'); setError(err.message || 'Connexion à la console impossible.'); }
    });
    return () => { controller.abort(); if (frame !== null) cancelAnimationFrame(frame); };
  }, [server.id, reconnect]);

  async function sendCommand(event) {
    event.preventDefault();
    const value = command.trim();
    if (!value || busy.current || connection !== 'connected' || serverState === 'offline' || server.suspended) return;
    busy.current = true; setSending(true); setSent(false); setError('');
    try {
      await api(`/pterodactyl/${encodeURIComponent(server.id)}/command`, { command: value });
      if (!alive.current) return;
      history.current = [value, ...history.current.filter(item => item !== value)].slice(0, 50);
      historyIndex.current = -1; draft.current = ''; setCommand(''); setSent(true);
      // No automatic retry: repeating a command could repeat its server-side effect.
    } catch (err) { if (alive.current) setError(err.message); }
    finally { busy.current = false; if (alive.current) { setSending(false); commandInput.current?.focus(); } }
  }
  function commandHistory(event) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || sending) return;
    event.preventDefault();
    if (!history.current.length) return;
    if (historyIndex.current === -1) draft.current = command;
    historyIndex.current = Math.max(-1, Math.min(history.current.length - 1, historyIndex.current + (event.key === 'ArrowUp' ? 1 : -1)));
    setCommand(historyIndex.current === -1 ? draft.current : history.current[historyIndex.current]);
  }
  const connected = connection === 'connected';
  const canSend = connected && serverState !== 'offline' && serverState !== 'stopping' && !server.suspended;
  return <div className="ptero-console">
    <div className="console-toolbar"><div className="console-identity"><span className="console-server-icon"><TerminalIcon size={20} /></span><div><strong>{server.name}</strong><span>{server.node || 'Pterodactyl'} · {SERVER_STATES[serverState] || 'État inconnu'}</span></div></div><div className="console-tools"><span className={`console-connection ${connected ? 'connected' : connection === 'error' ? 'failed' : ''}`} role="status">{connected ? <Radio size={13} /> : connection === 'error' ? <WifiOff size={13} /> : <LoaderCircle size={13} className="spin" />}{CONNECTIONS[connection] || 'Connexion…'}</span><button className="button small secondary" onClick={() => setReconnect(value => value + 1)} title="Reconnecter et recharger les derniers logs"><RefreshCw size={13} /> Reconnecter</button><button className="icon-button" title="Effacer l’affichage local" aria-label="Effacer l’affichage local" onClick={() => { terminal.current?.reset(); setUnread(false); }}><Eraser size={16} /></button><a className="icon-button" href={server.panelUrl} target="_blank" rel="noreferrer" aria-label="Ouvrir ce serveur dans Pterodactyl" title="Ouvrir dans Pterodactyl"><ArrowUpRight size={17} /></a></div></div>
    {error && <p className="console-error" role="alert">{error}</p>}
    <div className="console-screen"><div ref={host} className="console-terminal" role="region" aria-label={`Logs de ${server.name}`} />{connected && !hasOutput && <div className="console-empty"><TerminalIcon size={25} /><strong>{serverState === 'offline' ? 'Le serveur est arrêté.' : 'La console est prête.'}</strong><span>Les nouveaux logs apparaîtront ici.</span></div>}{unread && <button className="console-scroll-bottom" onClick={() => { terminal.current?.scrollToBottom(); setUnread(false); }}><ArrowDownToLine size={14} /> Derniers logs</button>}</div>
    <form className="console-command" onSubmit={sendCommand}><ChevronRight size={19} /><input ref={commandInput} aria-label={`Commande pour ${server.name}`} placeholder={server.suspended ? 'Serveur suspendu' : serverState === 'offline' ? 'Le serveur est arrêté' : connected ? 'Saisis une commande, puis Entrée…' : 'En attente de la console…'} value={command} maxLength={2000} disabled={!canSend || sending} onChange={event => { setCommand(event.target.value); setSent(false); historyIndex.current = -1; }} onKeyDown={commandHistory} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} /><button className="button primary small" type="submit" disabled={!canSend || sending || !command.trim()}>{sending ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />} Envoyer</button></form>
    <div className="console-footer"><span>{sent ? <><Check size={12} /> Commande envoyée</> : message}</span><span>↑ ↓ Historique <i /> 5 000 lignes max.</span></div>
  </div>;
}
