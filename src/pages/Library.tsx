import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpace } from '../lib/space';
import type { Playlist, Track } from '../lib/model';
import { plusLimit } from '../lib/types';
import { playlistIdeas } from '../lib/names';
import { thumbnail } from '../lib/youtube';
import { Button, IconButton, Notice, Sheet, Skeleton, useConfirm, useToast } from '../components/ui';
import { CoverArt, useTilt } from '../components/CoverArt';
import { YouTubeSearch } from '../components/YouTubeSearch';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/EmptyState';
import YouTubePlayer from '../components/YouTubePlayer';

export default function Library() {
  const space = useSpace();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const nav = useNavigate();
  const list = space.playlists.find(p => p.id === open);
  const personal = space.playlists.filter(p => p.scope === 'personal');
  const shared = space.playlists.filter(p => p.scope === 'room');
  if (list) return <PlaylistView list={list} onBack={() => setOpen(null)} />;
  const nothing = space.synced && space.playlists.length === 0;
  const grid = (items: Playlist[]) => <div className="posters">{items.map(p => <PlaylistCard key={p.id} list={p} room={space.rooms.find(r => r.code === p.roomCode)?.name} onOpen={() => setOpen(p.id)} />)}</div>;
  return <div className="page">
    <div className="row between wrap gap-16"><div className="col gap-4"><h1 className="display" style={{ fontSize: 40 }}>Library</h1><p className="small muted">Your playlists, and the ones you share in rooms.</p></div><Button icon="plus" onClick={() => setCreating(true)}>New playlist</Button></div>
    {nothing ? <div style={{ marginTop: 28 }}><EmptyState square ghosts={['Late-night favorites', 'Road trip', 'Ours']} title={<>Your library<br />is empty</>}
      body={space.rooms.length ? 'Save any video you watch in a room with the bookmark under the player, or start a playlist and search YouTube right here.' : 'Start a playlist and search YouTube right here. Once you make a room, it gets a shared playlist everyone in it can add to.'}
      actions={<><Button icon="plus" onClick={() => setCreating(true)}>New playlist</Button>{space.rooms[0] && <Button variant="secondary" icon="play" onClick={() => nav(`/room/${space.rooms[0].code}`)}>Go to {space.rooms[0].name}</Button>}</>} /></div> : <>
    <div className="section-head"><h2 className="h2">Just yours</h2>{space.plan.limits && <span className="small muted">{personal.length} of {space.plan.limits.personalPlaylists} on the free plan</span>}</div>
    {!space.synced ? <Skeleton h={200} r={24} /> : personal.length ? grid(personal) : <button className="ghost-row glass" onClick={() => setCreating(true)}><span className="journey-dot"><Icon name="plus" size={16} /></span><span><b>Start a playlist just for you</b><span className="small muted">Or save videos from any room with the bookmark button.</span></span></button>}
    <div className="section-head"><h2 className="h2">Shared in rooms</h2></div>
    {shared.length ? grid(shared) : <div className="ghost-row glass" style={{ cursor: 'default' }}><span className="journey-dot"><Icon name="users" size={16} /></span><span><b>Nothing shared yet</b><span className="small muted">Each room gets a shared playlist everyone in it can add to.</span></span></div>}
    </>}
    {creating && <NewPlaylist onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpen(id); }} />}
  </div>;
}

function PlaylistCard({ list, room, onOpen }: { list: Playlist; room?: string; onOpen: () => void }) {
  const tilt = useTilt<HTMLButtonElement>();
  return <button className="poster-card playlist-card" onClick={onOpen} {...tilt}>
    <CoverArt name={list.name} videos={list.tracks.map(t => t.videoId)} />
    <span className="poster-shine" />
    <div className="poster-top"><span className="chip-live" style={{ color: 'var(--text)' }}><Icon name={list.scope === 'room' ? 'users' : 'bookmark'} size={13} />{list.scope === 'room' ? room || 'Room' : 'Just yours'}</span><span /></div>
    <div className="poster-body"><h3 className="poster-title">{list.name}</h3><span className="small poster-sub">{list.tracks.length ? `${list.tracks.length} video${list.tracks.length === 1 ? '' : 's'}` : 'Empty — add a video'}</span></div>
    <span className="poster-play" aria-hidden="true"><Icon name="play" size={18} /></span>
  </button>;
}

function NewPlaylist({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const space = useSpace();
  const [name, setName] = useState(''); const [ideas, setIdeas] = useState(() => playlistIdeas(4));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const create = async () => { setBusy(true); setError(''); try { onCreated((await space.createPlaylist(name, 'personal')).id); } catch (e) { setError(plusLimit(e) ? 'That’s the most personal playlists on the free plan. Add to one you already have, or delete one.' : (e as Error).message); } finally { setBusy(false); } };
  return <Sheet title="New playlist" sub="Just for you. Play it in any room." onClose={onClose} footer={<Button block busy={busy} disabled={!name.trim()} onClick={() => void create()}>Create playlist</Button>}>
    <input aria-label="Playlist name" className="input" maxLength={50} placeholder="Late-night favorites" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void create(); }} />
    <div className="row between"><span className="small muted">Ideas</span><button className="btn ghost sm" onClick={() => setIdeas(playlistIdeas(4, ideas))}>More ideas</button></div>
    <div className="chips">{ideas.map(i => <button key={i} className="chip" onClick={() => setName(i)}>{i}</button>)}</div>
    {error && <Notice tone="error">{error}</Notice>}
  </Sheet>;
}

function PlaylistView({ list, onBack }: { list: Playlist; onBack: () => void }) {
  const space = useSpace();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [playing, setPlaying] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [pick, setPick] = useState<Track[] | null>(null);
  const canDelete = list.scope === 'personal' ? true : list.ownerId === space.user.id || space.rooms.find(r => r.code === list.roomCode)?.hostId === space.user.id;
  const fail = (e: unknown) => toast((e as Error).message, { tone: 'error' });
  const add = async (t: Track) => { try { await space.addTrack(list.id, t); toast('Added', { icon: 'check' }); } catch (e) { fail(e); } };
  const playInRoom = (tracks: Track[]) => { if (list.scope === 'room' && list.roomCode) { void startIn(list.roomCode, tracks); return; } if (space.rooms.length === 1) { void startIn(space.rooms[0].code, tracks); return; } setPick(tracks); };
  const startIn = async (code: string, tracks: Track[]) => { try { await space.play(code, tracks[0].videoId, true, 0, tracks.slice(1)); nav(`/room/${code}?tab=next`); } catch (e) { fail(e); } };
  return <div className="page">
    <div className="row gap-16"><IconButton icon="back" label="Back to Library" onClick={onBack} />
      <div className="grow"><h1 className="title ellipsis">{list.name}</h1><p className="small muted">{list.tracks.length} video{list.tracks.length === 1 ? "" : "s"} · {list.scope === 'personal' ? 'Just yours' : `Shared in ${space.rooms.find(r => r.code === list.roomCode)?.name || 'a room'}`}</p></div>
      {list.tracks.length > 0 && <Button variant="secondary" icon="play" onClick={() => setPlaying(0)}>Play here</Button>}
      {list.tracks.length > 0 && space.rooms.length > 0 && <Button icon="users" onClick={() => playInRoom(list.tracks)}>Play in a room</Button>}
      {canDelete && <IconButton icon="trash" variant="plain" label="Delete playlist" onClick={async () => { if (await confirm({ title: `Delete “${list.name}”?`, body: 'The videos in it are removed from this playlist. This can’t be undone.', confirmLabel: 'Delete playlist', danger: true })) { try { await space.deletePlaylist(list.id); onBack(); } catch (e) { fail(e); } } }} />}
    </div>
    {playing !== null && list.tracks[playing] && <SoloPlayer tracks={list.tracks} index={playing} onIndex={setPlaying} onClose={() => setPlaying(null)} />}
    <div style={{ marginTop: 24, maxWidth: 720 }}><YouTubeSearch onPlay={t => void add(t)} saved={[]} /></div>
    <div className="list" style={{ marginTop: 18 }}>
      {list.tracks.map((t, i) => <div key={t.videoId} className="list-row" draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)} onDragOver={e => e.preventDefault()}
        onDrop={() => { if (drag === null || drag === i) return; const ids = list.tracks.map(x => x.videoId); const [m] = ids.splice(drag, 1); ids.splice(i, 0, m); void space.reorderTracks(list.id, ids).catch(fail); setDrag(null); }} style={{ opacity: drag === i ? .4 : 1 }}>
        <span className="quiet" style={{ cursor: 'grab' }}><Icon name="grip" size={16} /></span>
        <img className="thumb" src={thumbnail(t.videoId)} alt="" loading="lazy" />
        <span className="grow ellipsis" style={{ fontWeight: playing === i ? 600 : 400, color: playing === i ? 'var(--lav)' : undefined }}>{t.title}</span>
        <IconButton size="sm" variant="plain" icon="play" label={`Play ${t.title} here`} onClick={() => setPlaying(i)} />
        <IconButton size="sm" variant="plain" icon="x" label={`Remove ${t.title}`} onClick={() => void space.removeTrack(list.id, t.videoId).catch(fail)} />
      </div>)}
      {!list.tracks.length && <p className="muted">Empty for now. Search above to add videos.</p>}
    </div>
    {pick && <Sheet title="Play in which room?" onClose={() => setPick(null)}><div className="col gap-8">{space.rooms.map(r => <button key={r.code} className="list-row inset" onClick={() => { const t = pick; setPick(null); void startIn(r.code, t); }}><Icon name="rooms" /><span className="grow h3">{r.name}</span></button>)}</div></Sheet>}
  </div>;
}

/** Plays a playlist on this computer only (visible player, next/previous, continues by itself). */
function SoloPlayer({ tracks, index, onIndex, onClose }: { tracks: Track[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = tracks[index];
  const [pb, setPb] = useState({ videoId: t.videoId, playing: true, position: 0, updatedAt: Date.now(), updatedBy: '', revision: 1 });
  const rev = useRef(1);
  useEffect(() => { rev.current += 1; setPb({ videoId: t.videoId, playing: true, position: 0, updatedAt: Date.now(), updatedBy: '', revision: rev.current }); }, [t.videoId]);
  return <div className="glass window" style={{ marginTop: 24, padding: 12, maxWidth: 720 }}>
    <div className="screen" style={{ borderRadius: 20 }}><YouTubePlayer playback={pb} events={{
      onEnded: () => { if (index + 1 < tracks.length) onIndex(index + 1); },
      onUserControl: (a, at) => { rev.current += 1; setPb(p => ({ ...p, playing: a === 'seek' ? p.playing : a === 'play', position: at, updatedAt: Date.now(), revision: rev.current })); },
    }} /></div>
    <div className="row" style={{ padding: '12px 6px 2px' }}>
      <IconButton icon="back" label="Previous" disabled={index === 0} onClick={() => onIndex(index - 1)} />
      <IconButton icon="fwd" label="Next" disabled={index + 1 >= tracks.length} onClick={() => onIndex(index + 1)} />
      <span className="grow small ellipsis" style={{ fontWeight: 600 }}>{t.title}</span>
      <span className="tiny muted">Only on this computer</span>
      <IconButton icon="x" variant="plain" label="Close player" onClick={onClose} />
    </div>
  </div>;
}
