// Search Apple Music. Results can play now for everyone or go to Up next, just like YouTube results.
// Searching needs no Apple sign-in (our server searches the catalogue); listening asks once, in the player.
import { useEffect, useRef, useState } from 'react';
import { useSpace } from '../lib/space';
import { connectAppleMusic, searchAppleMusic, useAppleMusic } from '../lib/appleMusic';
import type { AppleSong } from '../lib/appleMusic';
import type { Track } from '../lib/model';
import { Icon } from './Icon';
import { IconButton, Skeleton } from './ui';

const toTrack = (s: AppleSong): Track => ({ videoId: s.videoId, title: s.title, art: s.art, artist: s.artist, durationSeconds: s.durationSeconds });
export function AppleMusicSearch({ onPlay, onQueue, autoFocus }: { onPlay: (t: Track) => void; onQueue?: (t: Track) => void; autoFocus?: boolean }) {
  const space = useSpace();
  const am = useAppleMusic();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AppleSong[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const seq = useRef(0);
  useEffect(() => {
    clearTimeout(timer.current); setError('');
    const text = q.trim();
    if (text.length < 2) { setResults(null); setBusy(false); return; }
    const n = ++seq.current;
    timer.current = setTimeout(async () => {
      setBusy(true);
      try { const r = await searchAppleMusic(space.api, text); if (n === seq.current) setResults(r); }
      catch (e) { if (n === seq.current) { setResults([]); setError((e as { status?: number }).status === 503 ? 'Apple Music isn’t switched on for this server yet.' : (e as Error).message); } }
      finally { if (n === seq.current) setBusy(false); }
    }, 380);
    return () => clearTimeout(timer.current);
  }, [q, space.api]);
  const row = (s: AppleSong) => { const t = toTrack(s); return <div key={s.videoId} className="list-row" style={{ padding: '8px 10px' }}>
    <img className="thumb sm" src={s.art} alt="" loading="lazy" style={{ aspectRatio: '1', objectFit: 'cover' }} />
    <div className="grow"><p className="small ellipsis" style={{ fontWeight: 600 }}>{s.title}{s.explicit ? ' 🅴' : ''}</p><p className="tiny muted ellipsis">{s.artist}{s.album ? ` · ${s.album}` : ''}</p></div>
    {onQueue && <IconButton size="sm" icon="queue" label={`Add ${s.title} to Up next`} onClick={() => { onQueue(t); setQ(''); }} />}
    <IconButton size="sm" variant="accent" icon="play" label={`Play ${s.title} for everyone`} onClick={() => { onPlay(t); setQ(''); }} />
  </div>; };
  return <div className="col gap-8">
    <label className="row inset" style={{ padding: '0 6px 0 16px', borderRadius: 999, height: 52 }}>
      <Icon name="music" size={18} />
      <input autoFocus={autoFocus} aria-label="Search Apple Music" className="grow" style={{ background: 'none', border: 0, outline: 'none', height: '100%', fontSize: 15 }} placeholder="Search songs or artists on Apple Music" value={q} onChange={e => setQ(e.target.value)} />
      {busy ? <span className="spinner" style={{ marginRight: 12 }} /> : q && <IconButton size="sm" variant="plain" icon="x" label="Clear search" onClick={() => setQ('')} />}
    </label>
    {am.server !== 'off' && !am.connected && <div className="row gap-8 wrap" style={{ padding: '10px 14px', borderRadius: 16, background: 'rgba(250,92,124,.08)', border: '1px solid rgba(250,92,124,.35)' }}>
      <span className="grow small">Connect Apple Music once to hear songs. Searching works without it.</span>
      <button type="button" className="btn primary sm" disabled={am.loading} onClick={() => void connectAppleMusic(space.api)}>Connect Apple Music</button>
      {am.error && <span className="tiny" style={{ color: 'var(--danger, #ff6b6b)', width: '100%' }}>{am.error}</span>}
    </div>}
    {!q && <p className="tiny muted" style={{ paddingLeft: 8 }}>{am.server === 'off' ? 'Apple Music isn’t switched on for this server yet.' : 'Everyone listens with their own Apple Music. Without a subscription you hear 30-second previews.'}</p>}
    {(results || error || (busy && !results)) && <div className="glass panel" style={{ padding: 6, maxHeight: 420, overflowY: 'auto' }}>
      {busy && !results && [0, 1, 2].map(i => <div key={i} style={{ padding: 8 }}><Skeleton h={44} /></div>)}
      {results?.map(row)}
      {results && !results.length && !error && <p className="small muted" style={{ padding: 12 }}>Nothing found. Try other words.</p>}
      {error && <p className="small muted" style={{ padding: 12 }}>{error}</p>}
    </div>}
  </div>;
}
