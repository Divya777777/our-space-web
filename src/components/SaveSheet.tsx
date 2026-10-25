import { useState } from 'react';
import type { Track } from '../lib/model';
import { useSpace } from '../lib/space';
import { plusLimit } from '../lib/types';
import { thumbnail } from '../lib/youtube';
import { Button, Notice, Sheet, useToast } from './ui';
import { Icon } from './Icon';

/** Save a video to a personal playlist or this room's shared one. */
export function SaveSheet({ track, roomCode, onClose }: { track: Track; roomCode?: string; onClose: () => void }) {
  const space = useSpace();
  const toast = useToast();
  const [scope, setScope] = useState<'personal' | 'room'>(roomCode ? 'room' : 'personal');
  const [name, setName] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const lists = space.playlists.filter(p => scope === 'personal' ? p.scope === 'personal' : p.scope === 'room' && p.roomCode === roomCode);
  const save = async (id: string, label: string) => {
    setBusy(id); setError('');
    try { await space.addTrack(id, track); toast(`Saved to ${label}`, { icon: 'bookmark' }); onClose(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };
  const create = async () => {
    setBusy('new'); setError('');
    try { const p = await space.createPlaylist(name, scope, roomCode); await space.addTrack(p.id, track); toast(`Saved to ${p.name}`, { icon: 'bookmark' }); onClose(); }
    catch (e) { setError(plusLimit(e) ? 'That’s the most playlists on the free plan. Save into one you already have.' : (e as Error).message); } finally { setBusy(''); }
  };
  return <Sheet title="Save to a playlist" onClose={onClose}>
    <div className="row inset" style={{ padding: 10 }}><img className="thumb sm" src={thumbnail(track.videoId)} alt="" /><span className="small grow" style={{ fontWeight: 600 }}>{track.title}</span></div>
    {roomCode && <div className="seg" style={{ alignSelf: 'flex-start' }}>
      <button className={scope === 'room' ? 'on' : ''} onClick={() => setScope('room')}><Icon name="users" size={15} />This room</button>
      <button className={scope === 'personal' ? 'on' : ''} onClick={() => setScope('personal')}><Icon name="bookmark" size={15} />Just mine</button>
    </div>}
    <div className="col gap-8">{lists.map(p => { const has = p.tracks.some(t => t.videoId === track.videoId); return <button key={p.id} disabled={has || !!busy} className="list-row inset" onClick={() => void save(p.id, p.name)}>
      <Icon name={p.scope === 'room' ? 'users' : 'bookmark'} /><span className="grow h3 ellipsis">{p.name}</span><span className="small muted">{has ? 'Saved' : `${p.tracks.length} video${p.tracks.length === 1 ? "" : "s"}`}</span>{busy === p.id && <span className="spinner" />}
    </button>; })}</div>
    <div className="row gap-8"><input className="input grow" placeholder="New playlist name" maxLength={50} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void create(); }} /><Button busy={busy === 'new'} disabled={!name.trim()} onClick={() => void create()}>Create</Button></div>
    {error && <Notice tone="error">{error}</Notice>}
  </Sheet>;
}
