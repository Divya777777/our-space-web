import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSpace } from '../lib/space';
import { Avatar, Button, Notice, Skeleton, firstName } from '../components/ui';
import { CreateRoomSheet, JoinRoomSheet, RoomCarousel } from '../components/RoomBits';
import { CoverArt, roomVideos } from '../components/CoverArt';
import { Plans } from '../components/Planner';
import { Icon } from '../components/Icon';
import { Checklist, FirstRun } from '../components/GettingStarted';

const greeting = () => { const h = new Date().getHours(); return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export default function Home() {
  const space = useSpace();
  const nav = useNavigate();
  const [sheet, setSheet] = useState<'create' | 'join' | null>(null);
  const fresh = space.synced && space.rooms.length === 0;
  const live = space.rooms.find(r => r.playback?.playing) || space.rooms[0];
  const waiting = space.rooms.filter(r => r.hostId === space.user.id && r.requests.length > 0);
  const others = live ? live.members.filter(m => m.id !== space.user.id) : [];
  return <div className="page">
    {!fresh && <div className="row between wrap gap-16">
      <div className="col gap-4"><p className="muted">{greeting()}, {firstName(space.user.name)}</p><h1 className="display" style={{ fontSize: 40 }}>Where to <b>tonight?</b></h1></div>
      {!fresh && <div className="row gap-8"><Button variant="secondary" icon="enter" onClick={() => setSheet('join')}>Join with code</Button><Button icon="plus" onClick={() => setSheet('create')}>Create a room</Button></div>}
    </div>}
    {space.waking && <div style={{ marginTop: 20 }}><Notice icon="moon">Waking up the server… this can take up to 30 seconds after a quiet spell.</Notice></div>}
    {space.error && !space.waking && space.rooms.length === 0 && <div style={{ marginTop: 20 }}><Notice tone="error">{space.error} <button className="lav" onClick={() => void space.refresh()}>Try again</button></Notice></div>}
    {waiting.map(r => <Link key={r.code} to={`/room/${r.code}?tab=people`} className="glass panel row" style={{ marginTop: 18, padding: '12px 16px', color: 'var(--text)' }}>
      <div className="stack">{r.requests.slice(0, 3).map(p => <Avatar key={p.id} name={p.name} size={32} />)}</div>
      <span className="grow">{r.requests.length === 1 ? `${firstName(r.requests[0].name)} wants to join ${r.name}` : `${r.requests.length} people want to join ${r.name}`}</span>
      <span className="lav small" style={{ fontWeight: 600 }}>Review</span>
    </Link>)}

    <div style={{ marginTop: fresh ? 8 : 28 }}>
      {!space.synced ? <Skeleton h={400} r={34} />
        : live ? <Link to={`/room/${live.code}`} className="featured">
          <div className="featured-bg"><CoverArt name={live.name} videos={roomVideos(live, space.playlists)} /></div>
          <div className="featured-body">
            {live.playback?.playing ? <span className="chip-live" style={{ alignSelf: 'flex-start' }}><span className="eq"><i /><i /><i /></span>Playing now</span> : <span className="small muted">Pick up where you left off</span>}
            <h2 className="featured-title">{live.name}</h2>
            <p className="muted">{others.length ? `With ${others.slice(0, 3).map(o => firstName(o.name)).join(', ')}${others.length > 3 ? ` and ${others.length - 3} more` : ''}` : 'Only you so far — invite your person from inside.'}</p>
            <div className="row gap-16"><span className="btn primary"><Icon name="play" size={16} />Enter room</span><span className="room-code">{live.code}</span></div>
          </div>
          <div className="featured-side"><div className="stack">{live.members.slice(0, 5).map(m => <Avatar key={m.id} name={m.name} size={38} />)}</div></div>
        </Link>
          : <FirstRun onCreate={() => setSheet('create')} onJoin={() => setSheet('join')} />}
    </div>

    {space.rooms.length > 1 && <>
      <div className="section-head"><h2 className="h2">Your rooms</h2><Link to="/rooms" className="small">See all</Link></div>
      <RoomCarousel rooms={space.rooms} />
    </>}

    {live && <div style={{ marginTop: 22 }}><Checklist onInvite={() => nav(`/room/${live.code}?tab=people`)} onPlay={() => nav(`/room/${live.code}`)} /></div>}

    {space.rooms.length > 0 && <>
      <div className="section-head"><h2 className="h2">Coming up</h2></div>
      <Plans />
    </>}
    {sheet === 'create' && <CreateRoomSheet onClose={() => setSheet(null)} />}
    {sheet === 'join' && <JoinRoomSheet onClose={() => setSheet(null)} />}
  </div>;
}
