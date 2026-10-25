// One box for searching YouTube or pasting a link. Results can play now for everyone or go to Up next.
import { useEffect, useRef, useState } from 'react';
import { useSpace } from '../lib/space';
import { youtubeId } from '../lib/model';
import { fetchVideoTitle, thumbnail } from '../lib/youtube';
import type { SearchResult } from '../lib/types';
import type { Playlist } from '../lib/model';
import { Icon } from './Icon';
import { IconButton, Skeleton } from './ui';

export type Pick = { videoId: string; title: string };
export function YouTubeSearch({ onPlay, onQueue, saved = [], autoFocus }: { onPlay: (p: Pick) => void; onQueue?: (p: Pick) => void; saved?: Playlist[]; autoFocus?: boolean }) {
  const space = useSpace();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [link, setLink] = useState<Pick | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const abort = useRef<AbortController>();
  useEffect(() => {
    clearTimeout(timer.current); abort.current?.abort();
    const text = q.trim(); setError('');
    const id = youtubeId(text);
    if (id) { setResults(null); setLink({ videoId: id, title: 'YouTube video' }); void fetchVideoTitle(id).then(t => t && setLink(l => l?.videoId === id ? { videoId: id, title: t } : l)); return; }
    setLink(null);
    if (text.length < 2) { setResults(null); return; }
    timer.current = setTimeout(async () => {
      const c = new AbortController(); abort.current = c; setBusy(true);
      try { setResults(await space.searchYouTube(text, c.signal)); }
      catch (e) { if (!c.signal.aborted) { setResults([]); setError((e as { status?: number }).status === 503 ? 'Search isn’t switched on for this server yet. Paste a YouTube link instead.' : (e as Error).message); } }
      finally { if (!c.signal.aborted) setBusy(false); }
    }, 380);
    return () => clearTimeout(timer.current);
  }, [q, space]);
  // Saved videos that match what's typed, so favourites are one click away.
  const savedMatches = q.trim().length > 1 && !link ? saved.flatMap(p => p.tracks).filter((t, i, all) => all.findIndex(x => x.videoId === t.videoId) === i && t.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 4) : [];
  const row = (p: Pick, sub?: string, key?: string) => <div key={key || p.videoId} className="list-row" style={{ padding: '8px 10px' }}>
    <img className="thumb sm" src={thumbnail(p.videoId)} alt="" loading="lazy" />
    <div className="grow"><p className="small ellipsis" style={{ fontWeight: 600 }}>{p.title}</p>{sub && <p className="tiny muted ellipsis">{sub}</p>}</div>
    {onQueue && <IconButton size="sm" icon="queue" label={`Add ${p.title} to Up next`} onClick={() => { onQueue(p); setQ(''); }} />}
    <IconButton size="sm" variant="accent" icon="play" label={`Play ${p.title} for everyone`} onClick={() => { onPlay(p); setQ(''); }} />
  </div>;
  return <div className="col gap-8">
    <label className="row inset" style={{ padding: '0 6px 0 16px', borderRadius: 999, height: 52 }}>
      <Icon name="search" size={18} />
      <input autoFocus={autoFocus} aria-label="Search YouTube or paste a link" className="grow" style={{ background: 'none', border: 0, outline: 'none', height: '100%', fontSize: 15 }} placeholder="Search YouTube or paste a link" value={q} onChange={e => setQ(e.target.value)} />
      {busy ? <span className="spinner" style={{ marginRight: 12 }} /> : q && <IconButton size="sm" variant="plain" icon="x" label="Clear search" onClick={() => setQ('')} />}
    </label>
    {(link || results || savedMatches.length > 0 || error) && <div className="glass panel" style={{ padding: 6, maxHeight: 420, overflowY: 'auto' }}>
      {link && row(link, 'From your link')}
      {savedMatches.map(t => row(t, 'Saved', 's' + t.videoId))}
      {busy && !results && [0, 1, 2].map(i => <div key={i} style={{ padding: 8 }}><Skeleton h={44} /></div>)}
      {results?.map(r => row({ videoId: r.videoId, title: r.title }, r.live ? `${r.channel} · live` : r.channel))}
      {results && !results.length && !error && <p className="small muted" style={{ padding: 12 }}>Nothing found. Try other words.</p>}
      {error && <p className="small muted" style={{ padding: 12 }}>{error}</p>}
    </div>}
  </div>;
}
