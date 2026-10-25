import { useState } from 'react';
import type { Room, Track } from '../lib/model';
import { useSpace } from '../lib/space';
import { thumbnail } from '../lib/youtube';
import { Button, IconButton, useToast } from './ui';
import { Icon } from './Icon';

/** Up next (shared queue) plus this room's saved playlists. */
export function QueuePanel({ room, onPlay }: { room: Room; onPlay: (t: Track, context?: Track[]) => void }) {
  const space = useSpace();
  const toast = useToast();
  const [drag, setDrag] = useState<string | null>(null);
  const queue = room.queue || [];
  const lists = space.playlists.filter(p => (p.scope === 'room' && p.roomCode === room.code) || p.scope === 'personal');
  const act = (fn: () => Promise<void>) => void fn().catch(e => toast((e as Error).message, { tone: 'error' }));
  return <div className="col gap-20">
    <div className="col gap-8">
      <div className="row between"><p className="h3">Up next</p>{queue.length > 0 && <Button size="sm" variant="ghost" onClick={() => act(() => space.queue(room.code, 'clear'))}>Clear</Button>}</div>
      {!queue.length && <p className="small muted">Nothing queued. Add videos from search, or play a playlist and it continues by itself.</p>}
      <div className="list">{queue.map((item, i) => <div key={item.id} className="list-row" style={{ padding: '6px 6px', opacity: drag === item.id ? .4 : 1 }} draggable
        onDragStart={() => setDrag(item.id)} onDragEnd={() => setDrag(null)} onDragOver={e => e.preventDefault()}
        onDrop={() => { if (drag && drag !== item.id) act(() => space.queue(room.code, 'move', { id: drag, to: i })); setDrag(null); }}>
        <span className="quiet" style={{ cursor: 'grab' }} aria-hidden="true"><Icon name="grip" size={16} /></span>
        <img className="thumb sm" src={thumbnail(item.videoId)} alt="" loading="lazy" />
        <div className="grow"><p className="small ellipsis" style={{ fontWeight: 600 }}>{item.title}</p><p className="tiny muted">{item.source === 'playlist' ? 'From the playlist' : 'Added'}</p></div>
        <IconButton size="sm" variant="plain" icon="play" label={`Play ${item.title} now`} onClick={() => onPlay({ videoId: item.videoId, title: item.title })} />
        <IconButton size="sm" variant="plain" icon="x" label={`Remove ${item.title} from Up next`} onClick={() => act(() => space.queue(room.code, 'remove', { id: item.id }))} />
      </div>)}</div>
    </div>
    <div className="col gap-8">
      <p className="h3">Playlists</p>
      {lists.map(p => <details key={p.id} className="inset" style={{ padding: '4px 6px' }}>
        <summary className="row" style={{ padding: '8px 8px', cursor: 'pointer', listStyle: 'none' }}>
          <Icon name={p.scope === 'room' ? 'users' : 'bookmark'} size={18} />
          <span className="grow small ellipsis" style={{ fontWeight: 600 }}>{p.name}</span><span className="tiny muted">{p.tracks.length} video{p.tracks.length === 1 ? "" : "s"}</span>
          {p.tracks.length > 0 && <IconButton size="sm" variant="accent" icon="play" label={`Play ${p.name} for everyone`} onClick={e => { e.preventDefault(); onPlay(p.tracks[0], p.tracks.slice(1)); }} />}
        </summary>
        <div className="list" style={{ paddingBottom: 6 }}>{p.tracks.map((t, i) => <div key={t.videoId} className="list-row" style={{ padding: '6px 8px' }}>
          <img className="thumb sm" src={thumbnail(t.videoId)} alt="" loading="lazy" /><span className="grow small ellipsis">{t.title}</span>
          <IconButton size="sm" variant="plain" icon="queue" label={`Add ${t.title} to Up next`} onClick={() => act(async () => { await space.queue(room.code, 'add', { videoId: t.videoId, title: t.title }); toast('Added to Up next', { icon: 'queue' }); })} />
          <IconButton size="sm" variant="plain" icon="play" label={`Play ${t.title} for everyone`} onClick={() => onPlay(t, p.tracks.slice(i + 1))} />
        </div>)}{!p.tracks.length && <p className="tiny muted" style={{ padding: 8 }}>Empty. Save the playing video here with the bookmark button.</p>}</div>
      </details>)}
    </div>
  </div>;
}
