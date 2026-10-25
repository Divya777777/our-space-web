// Room cards plus the Create and Join sheets, shared by Home and Rooms.
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Room } from '../lib/model';
import { useSpace } from '../lib/space';
import { plusLimit } from '../lib/types';
import { roomIdeas } from '../lib/names';
import { Avatar, Button, IconButton, Notice, Sheet, firstName, useToast } from './ui';
import { CoverArt, roomVideos, useTilt } from './CoverArt';
import { Icon } from './Icon';

export function RoomCard({ room }: { room: Room }) {
  const space = useSpace();
  const tilt = useTilt<HTMLAnchorElement>();
  const others = room.members.filter(m => m.id !== space.user.id);
  const playing = room.playback?.playing;
  const who = others.length === 0 ? 'Just you so far' : others.length <= 2 ? `With ${others.map(o => firstName(o.name)).join(' & ')}` : `With ${firstName(others[0].name)} +${others.length - 1}`;
  const waiting = room.hostId === space.user.id ? room.requests.length : 0;
  return <Link to={`/room/${room.code}`} className="poster-card" {...tilt}>
    <CoverArt name={room.name} videos={roomVideos(room, space.playlists)} />
    <span className="poster-shine" />
    <div className="poster-top">
      {playing ? <span className="chip-live"><span className="eq"><i /><i /><i /></span>Playing</span> : <span />}
      {waiting > 0 && <span className="chip-alert">{waiting} waiting</span>}
    </div>
    <div className="poster-body">
      <h3 className="poster-title">{room.name}</h3>
      <div className="row between"><span className="small poster-sub ellipsis">{who}</span><div className="stack">{room.members.slice(0, 3).map(m => <Avatar key={m.id} name={m.name} size={24} />)}</div></div>
    </div>
    <span className="poster-play" aria-hidden="true"><Icon name="play" size={18} /></span>
  </Link>;
}

/** Rooms on a curved carousel: the centre card faces you, the rest turn away in depth. Drag, wheel or arrows. */
export function RoomCarousel({ rooms }: { rooms: Room[] }) {
  const [at, setAt] = useState(() => Math.min(1, rooms.length - 1));
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const go = (i: number) => setAt(Math.max(0, Math.min(rooms.length - 1, i)));
  if (!rooms.length) return null;
  return <div className="carousel" role="region" aria-roledescription="carousel" aria-label="Your rooms" tabIndex={0}
    onKeyDown={e => { if (e.key === 'ArrowRight') go(at + 1); if (e.key === 'ArrowLeft') go(at - 1); }}
    onPointerDown={e => { drag.current = { x: e.clientX, moved: false }; }}
    onPointerMove={e => { const d = drag.current; if (d && Math.abs(e.clientX - d.x) > 60) { go(at + (e.clientX < d.x ? 1 : -1)); d.x = e.clientX; d.moved = true; } }}
    onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }}
    onClickCapture={e => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation(); } }}
    onWheel={e => { if (Math.abs(e.deltaX) > 30) go(at + (e.deltaX > 0 ? 1 : -1)); }}>
    <div className="carousel-stage">
      {rooms.map((r, i) => { const o = i - at; const abs = Math.abs(o); return <div key={r.code} className="carousel-item" aria-hidden={o !== 0}
        style={{ transform: `translateX(${o * 62}%) translateZ(${-abs * 140}px) rotateY(${-Math.sign(o) * Math.min(abs, 2) * 24}deg)`, zIndex: 50 - abs, opacity: abs > 3 ? 0 : 1 - abs * 0.18, pointerEvents: abs > 2 ? 'none' : undefined }}
        onClickCapture={e => { if (o !== 0) { e.preventDefault(); e.stopPropagation(); go(i); } }}>
        <RoomCard room={r} />
      </div>; })}
    </div>
    {rooms.length > 1 && <div className="carousel-nav">
      <IconButton size="sm" icon="back" label="Previous room" disabled={at === 0} onClick={() => go(at - 1)} />
      <div className="dots">{rooms.map((r, i) => <button key={r.code} aria-label={`Show ${r.name}`} className={i === at ? 'on' : ''} onClick={() => go(i)} />)}</div>
      <IconButton size="sm" icon="fwd" label="Next room" disabled={at === rooms.length - 1} onClick={() => go(at + 1)} />
    </div>}
  </div>;
}

export function CreateRoomSheet({ onClose }: { onClose: () => void }) {
  const space = useSpace();
  const nav = useNavigate();
  const toast = useToast();
  const [name, setName] = useState('');
  const [ideas, setIdeas] = useState(() => roomIdeas(4));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const limit = space.plan.limits && space.plan.usage.rooms >= space.plan.limits.rooms;
  const create = async () => {
    setBusy(true); setError('');
    try { const room = await space.createRoom(name); toast('Room created. Invite someone to start.', { icon: 'check' }); onClose(); nav(`/room/${room.code}`); }
    catch (e) { setError(plusLimit(e) ? 'You’ve reached the free plan’s room limit. Delete a room you no longer use to make a new one.' : (e as Error).message); }
    finally { setBusy(false); }
  };
  return <Sheet title="Create a room" sub="A private place for you and your people. Only people you approve can come in." onClose={onClose}
    footer={<Button block busy={busy} disabled={!name.trim()} onClick={() => void create()}>Create room</Button>}>
    <div className="field"><label htmlFor="room-name">Room name</label>
      <input id="room-name" className="input" value={name} maxLength={50} placeholder="Our little universe" onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim()) void create(); }} /></div>
    <div className="col gap-8"><div className="row between"><span className="small muted">Need an idea?</span><button className="btn ghost sm" onClick={() => setIdeas(roomIdeas(4, ideas))}>More ideas</button></div>
      <div className="chips">{ideas.map(i => <button key={i} className="chip" onClick={() => setName(i)}>{i}</button>)}</div></div>
    {limit && <Notice tone="info">You have {space.plan.usage.rooms} of {space.plan.limits!.rooms} rooms on the free plan.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
  </Sheet>;
}

export function JoinRoomSheet({ onClose, initial = '' }: { onClose: () => void; initial?: string }) {
  const nav = useNavigate();
  const [code, setCode] = useState(initial);
  return <Sheet title="Join with a code" sub="Ask the person who made the room for its six-character code." onClose={onClose}
    footer={<Button block disabled={code.trim().length !== 6} onClick={() => { onClose(); nav(`/join?code=${code.trim().toUpperCase()}`); }}>Ask to join</Button>}>
    <input aria-label="Room code" className="input code-input" value={code} maxLength={6} autoComplete="off" spellCheck={false} placeholder="ABC123"
      onChange={e => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) { onClose(); nav(`/join?code=${code}`); } }} />
    <p className="small muted row gap-8"><Icon name="shield" size={16} /> The room’s admin approves you before you can see anything inside.</p>
  </Sheet>;
}
