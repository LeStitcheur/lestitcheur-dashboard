import React from 'react';
import { Music2, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat2, Monitor, ArrowUpRight, Volume2, Headphones } from 'lucide-react';

const time = ms => `${Math.floor((ms || 0) / 60000)}:${String(Math.floor(((ms || 0) % 60000) / 1000)).padStart(2,'0')}`;
export default function MusicPlayer({ spotify, settings, busy, error, act, connect, large = false }) {
  const local = settings?.spotifyMode === 'desktop';
  const active = spotify.active && !error;
  const command = (action, value) => act('spotify', '/spotify/control', { action, value });
  const open = () => act('spotify-open', '/spotify/open', {});
  return <section className={`card music-player ${large ? 'music-expanded' : ''}`}>
    <header className="card-heading"><h2><Headphones size={18} /> En écoute</h2><span className="source-pill"><i />{local ? 'SPOTIFY WINDOWS' : 'SPOTIFY CONNECT'}</span></header>
    {error && <p className="inline-error">{error}</p>}
    <div className="music-artwork"><div className={`vinyl ${spotify.playing && active ? 'playing' : ''}`}><div className="vinyl-center"><Music2 size={28} /></div></div><div className="sound-bars">{[1,2,3,4,5].map(i => <i key={i} style={{ '--bar': i }} className={spotify.playing && active ? 'playing' : ''} />)}</div></div>
    <div className="music-caption"><span>{active ? spotify.playing ? 'EN COURS DE LECTURE' : 'EN PAUSE' : 'TA BANDE-SON'}</span><h3>{active ? spotify.name || 'Lecture Spotify' : 'Le son de ta session.'}</h3><p>{active ? spotify.artists || spotify.album : local ? 'Lance un morceau dans ton application Spotify.' : 'Connecte ton compte pour retrouver ta musique.'}</p></div>
    {active ? <><div className="music-progress"><div style={{ width: `${Math.min(100,(spotify.progress || 0)/(spotify.duration || 1)*100)}%` }} /></div><div className="music-times"><span>{time(spotify.progress)}</span><span>{time(spotify.duration)}</span></div>
      <div className="music-controls"><button aria-label="Lecture aléatoire" aria-pressed={!!spotify.shuffle} disabled={!!busy || spotify.supportsShuffle === false} onClick={() => command('shuffle', !spotify.shuffle)}><Shuffle size={17} /></button><button aria-label="Morceau précédent" disabled={!!busy || spotify.canPrevious === false} onClick={() => command('previous')}><SkipBack size={22} fill="currentColor" /></button><button className="music-play" aria-label={spotify.playing ? 'Pause' : 'Lecture'} disabled={!!busy || (spotify.playing ? spotify.canPause : spotify.canPlay) === false} onClick={() => command(spotify.playing ? 'pause' : 'play')}>{spotify.playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}</button><button aria-label="Morceau suivant" disabled={!!busy || spotify.canNext === false} onClick={() => command('next')}><SkipForward size={22} fill="currentColor" /></button><button aria-label="Répéter le contexte" aria-pressed={!!spotify.repeat && spotify.repeat !== 'off'} disabled={!!busy || spotify.supportsRepeat === false} onClick={() => command('repeat', spotify.repeat === 'off' ? 'context' : 'off')}><Repeat2 size={17} /></button></div>
      {spotify.supportsVolume && <div className="music-volume"><Volume2 size={16} /><input aria-label="Volume Spotify" type="range" min="0" max="100" key={spotify.volume} defaultValue={spotify.volume || 0} disabled={!!busy} onPointerUp={e => command('volume',Number(e.currentTarget.value))} onKeyUp={e => { if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) command('volume',Number(e.currentTarget.value)); }} /><span>{spotify.volume}%</span></div>}
    </> : <button className="button primary music-start" disabled={!!busy} onClick={local ? open : connect}>{local ? 'Ouvrir Spotify sur mon PC' : 'Connecter Spotify'}<ArrowUpRight size={16} /></button>}
    <footer><span><Monitor size={13} />{local ? 'Application sur ce PC' : spotify.device || 'Compte Spotify'}</span><button onClick={open} disabled={!!busy} title="Ouvrir Spotify">Ouvrir<ArrowUpRight size={13} /></button></footer>
  </section>;
}
