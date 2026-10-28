// A room: the shared screen floats in the middle with its playback dock; chat, up next, people, goals and games sit
// in the side panel. On a phone-sized window everything stacks.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { usePip, useWantPip } from '../lib/pip';
import { useSpace } from '../lib/space';
import { positionNow, Track } from '../lib/model';
import { enterRoom, useGatedPlayback } from '../lib/playGate';
import { useRoomChat } from '../lib/useRoomChat';
import YouTubePlayer from '../components/YouTubePlayer';
import { YouTubeSearch } from '../components/YouTubeSearch';
import { ChatPanel } from '../components/ChatPanel';
import { QueuePanel } from '../components/QueuePanel';
import { InviteCard, PeoplePanel } from '../components/PeoplePanel';
import { GoalsPanel } from '../components/GoalsPanel';
import { PlayPanel } from '../components/PlayPanel';
import { Plans } from '../components/Planner';
import { SaveSheet } from '../components/SaveSheet';
import { useCall } from '../components/Call';
import { Avatar, Button, IconButton, Notice, Segments, Sheet, Skeleton, copyText, firstName, useConfirm, useToast } from '../components/ui';
import { Icon } from '../components/Icon';
import { Star } from '../components/Brand';

type Tab = 'chat' | 'next' | 'people' | 'goals' | 'play';
const TABS: Tab[] = ['chat', 'next', 'people', 'goals', 'play'];

export default function RoomPage() {
  const { code = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const space = useSpace();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const call = useCall();
  const room = space.rooms.find(r => r.code === code);
  const [problem, setProblem] = useState<'' | 'missing' | 'waiting'>('');
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'chat') as Tab;
  const setTab = (t: Tab) => setParams(p => { p.set('tab', t); return p; }, { replace: true });
  const [title, setTitle] = useState('');
  const [save, setSave] = useState<Track | null>(null);
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState('');
  const position = useRef(0);
  const ended = useRef('');
  const screen = useRef<HTMLDivElement>(null);
  const chat = useRoomChat(room);
  const [seenChat, setSeenChat] = useState(0);
  useEffect(() => { if (tab === 'chat') setSeenChat(chat.items.length); }, [tab, chat.items.length]);
  const unread = tab !== 'chat' && chat.items.slice(seenChat).some(i => i.from !== space.user.id);

  // Live updates: a long poll that returns as soon as anything in the room changes.
  useEffect(() => {
    let alive = true; const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>; let first = true;
    const loop = async () => {
      let delay = 0;
      try { await space.getRoom(code, !first, abort.signal); first = false; setProblem(''); }
      catch (e) { const s = (e as { status?: number }).status; if (s === 404) { setProblem('missing'); return; } if (s === 403) { setProblem('waiting'); return; } delay = 2000; }
      if (alive) timer = setTimeout(loop, delay);
    };
    void loop();
    return () => { alive = false; abort.abort(); clearTimeout(timer); };
    // getRoom reads the latest account; restart only for a different room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  useEffect(() => enterRoom(code), [code]);
  const gate = useGatedPlayback(code, room?.playback);
  const pip = usePip();
  // Offer PiP while something is playing; once floating, keep it there even when paused.
  useWantPip('video', !!gate.playback && (gate.playback.playing || !!pip.slots));
  useEffect(() => { setPlayerError(''); }, [room?.playback?.videoId]);
  // Tell the browser what's playing (lock screen / media keys, and Chrome's automatic picture-in-picture).
  const playingNow = !!gate.playback?.playing;
  useEffect(() => {
    const ms = navigator.mediaSession; if (!ms) return;
    try { ms.playbackState = playingNow ? 'playing' : gate.playback ? 'paused' : 'none'; if (room && gate.playback) ms.metadata = new MediaMetadata({ title: title || room.name, artist: room.name, album: 'Our Space', artwork: [{ src: `https://i.ytimg.com/vi/${gate.playback.videoId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' }] }); } catch { /* unsupported */ }
  }, [playingNow, title, room?.name, gate.playback?.videoId]);
  useEffect(() => { document.title = room ? `${room.name} · Our Space` : 'Our Space'; return () => { document.title = 'Our Space'; }; }, [room?.name]);

  const others = useMemo(() => (room?.members || []).filter(m => m.id !== space.user.id), [room?.members, space.user.id]);
  if (problem === 'missing') return <Gone text="This room was closed, or the code is wrong." />;
  if (problem === 'waiting') return <Gone text="You’re not in this room yet." action={<Button onClick={() => nav(`/join?code=${code}`)}>Ask to join</Button>} />;
  if (!room) return <div className="room"><div className="room-top"><Skeleton h={44} w={260} /></div><div className="stage"><Skeleton h={420} r={30} /></div><div className="side glass"><Skeleton h={600} /></div></div>;

  const admin = room.hostId === space.user.id;
  const pb = room.playback;
  const fail = (e: unknown) => toast((e as Error).message || 'Could not update playback. Try again.', { tone: 'error' });
  const playNow = (t: Track, context?: Track[]) => { gate.join(); void space.play(code, t.videoId, true, 0, context).catch(fail); };
  const toggle = () => {
    if (!pb) return;
    if (gate.waiting) { gate.join(); return; }
    void space.play(code, pb.videoId, !pb.playing, position.current || positionNow(pb)).catch(fail);
  };
  const next = () => { if (pb && room.queue?.length) void space.queue(code, 'next', { from: pb.videoId }).catch(fail); };
  const shareToChat = async (text: string) => { await chat.sendText(text); };

  const playerEl = gate.playback ? <YouTubePlayer key={code} playback={gate.playback} volume={room.volume ?? 100} events={{
          onTitle: (id, t) => { if (id === pb?.videoId) setTitle(t); },
          onPosition: s => { position.current = s; },
          onError: setPlayerError,
          onEnded: id => { const key = `${id}:${pb?.revision}`; if (ended.current === key || !room.queue?.length) return; ended.current = key; void space.queue(code, 'next', { from: id }).catch(() => { ended.current = ''; }); },
          onUserControl: (action, at) => { if (!pb) return; if (gate.waiting) { if (action === 'play') gate.join(); return; } void space.play(code, pb.videoId, action === 'seek' ? pb.playing : action === 'play', at).catch(fail); },
        }} /> : null;
  const floating = !!pip.slots && !!playerEl;
  const popOut = () => void pip.open().then(ok => { if (!ok) toast('Your browser didn’t open the floating window. Try Chrome or Edge on a computer.', { tone: 'error' }); });

  const top = <div className="room-top">
    <IconButton icon="back" label="Back home" onClick={() => nav('/')} />
    <div className="grow" style={{ minWidth: 0 }}>
      <h1 className="ellipsis" style={{ fontFamily: 'var(--display)', fontWeight: 300, fontSize: 24, textTransform: 'uppercase', letterSpacing: '-.01em' }}>{room.name}</h1>
      <button className="small muted row gap-4" onClick={async () => { if (await copyText(room.code)) toast('Room code copied.', { icon: 'copy' }); }} aria-label={`Copy room code ${room.code}`}><span className="room-code">{room.code}</span> <Icon name="copy" size={13} /></button>
    </div>
    <div className="stack" aria-label={`${room.members.length} people in this room`}>{room.members.slice(0, 4).map(m => <Avatar key={m.id} name={m.name} size={34} />)}</div>
    {others.length > 0 && !call.activeCode && <>
      <IconButton icon="phone" label={others.length > 1 ? 'Voice call the room' : `Voice call ${others[0].name}`} onClick={() => call.start(code, others, false, others.length > 1 ? room.name : others[0].name)} />
      <IconButton icon="video" label={others.length > 1 ? 'Video call the room' : `Video call ${others[0].name}`} onClick={() => call.start(code, others, true, others.length > 1 ? room.name : others[0].name)} />
    </>}
    {call.activeCode === code && <Button size="sm" variant="secondary" onClick={call.open}><span className="live-dot" />Back to call</Button>}
    <IconButton icon="dots" label="Room options" onClick={() => setMenu(true)} />
  </div>;

  return <div className="room">
    {pb && <div className="ambient" aria-hidden="true"><img key={pb.videoId} src={`https://i.ytimg.com/vi/${pb.videoId}/mqdefault.jpg`} alt="" /></div>}
    {top}
    <section className="stage" aria-label="Watch together">
      <div className="screen" ref={screen}>
        {gate.playback ? (floating ? <div className="screen-empty"><div className="col gap-16" style={{ alignItems: 'center' }}><Icon name="pip" size={40} /><p className="h3">Playing in a floating window</p><p className="muted small" style={{ maxWidth: 340, textAlign: 'center' }}>Use any other app — it stays on top. Everyone here still watches in sync.</p><Button variant="secondary" onClick={pip.close}>Bring it back here</Button></div></div> : playerEl) : <div className="screen-empty"><div className="col gap-16" style={{ alignItems: 'center' }}><Star size={48} glow /><p className="h2">What are we watching?</p><p className="muted small" style={{ maxWidth: 360 }}>Search below or paste a YouTube link. It plays for everyone here at the same moment.</p></div></div>}
        {gate.waiting && <div className="gate"><div className="col gap-16" style={{ alignItems: 'center', textAlign: 'center' }}>
          <p className="h2">{pb?.updatedBy && pb.updatedBy !== space.user.id ? `${firstName(room.members.find(m => m.id === pb.updatedBy)?.name || 'Someone')} is playing something` : 'This room is playing'}</p>
          <Button icon="play" onClick={gate.join}>Join in</Button></div></div>}
      </div>
      {playerError && <Notice tone="error">{playerError}</Notice>}
      {pb && <div className="ornament glass" role="toolbar" aria-label="Playback for everyone">
        <IconButton size="lg" variant="accent" icon={gate.playback?.playing ? 'pause' : 'play'} label={gate.waiting ? 'Join in' : pb.playing ? 'Pause for everyone' : 'Play for everyone'} onClick={toggle} />
        <IconButton icon="next" label="Skip to the next video" disabled={!room.queue?.length} onClick={next} />
        <div className="now grow"><p className="small ellipsis" style={{ fontWeight: 600 }}>{title || 'Loading title…'}</p><p className="tiny muted ellipsis">{gate.waiting ? 'Paused for you' : pb.playing ? 'Playing for everyone' : 'Paused for everyone'}{room.queue?.length ? ` · ${room.queue.length} up next` : ''}</p></div>
        <Volume value={room.volume ?? 100} onChange={v => void space.setVolume(code, v).catch(fail)} />
        <IconButton icon="bookmark" label="Save this video to a playlist" onClick={() => setSave({ videoId: pb.videoId, title: title || 'YouTube video' })} />
        <IconButton icon="expand" label="Full screen" onClick={() => void screen.current?.requestFullscreen?.().catch(() => {})} />
      </div>}
      {floating && pb && createPortal(<div className="pip-player">
        {playerEl}
        <div className="pip-controls">
          <IconButton size="sm" variant="accent" icon={gate.playback?.playing ? 'pause' : 'play'} label={gate.waiting ? 'Join in' : pb.playing ? 'Pause for everyone' : 'Play for everyone'} onClick={toggle} />
          <IconButton size="sm" icon="next" label="Skip to the next video" disabled={!room.queue?.length} onClick={next} />
          <span className="grow tiny ellipsis" style={{ fontWeight: 600 }}>{title || room.name}</span>
          <IconButton size="sm" icon="back" label="Back to the room" onClick={() => { pip.close(); window.focus(); }} />
        </div>
      </div>, pip.slots!.video)}
      <YouTubeSearch saved={space.playlists} onPlay={t => playNow(t)} onQueue={pb ? t => void space.queue(code, 'add', { videoId: t.videoId, title: t.title }).then(() => toast('Added to Up next', { icon: 'queue' })).catch(fail) : undefined} />
      {others.length === 0 && <InviteCard room={room} />}
      <div className="col gap-8"><p className="h3">Plans</p><Plans code={code} compact /></div>
    </section>
    <aside className="side glass" aria-label="Room panel">
      <div className="side-tabs"><Segments label="Room panel" value={tab} onChange={setTab} options={[
        { value: 'chat', label: 'Chat', dot: unread }, { value: 'next', label: 'Up next' },
        { value: 'people', label: 'People', dot: admin && room.requests.length > 0 }, { value: 'goals', label: 'Goals' }, { value: 'play', label: 'Play' },
      ]} /></div>
      <div className="side-body">
        {tab === 'chat' && <ChatPanel room={room} chat={chat} onReport={() => setTab('people')} />}
        {tab === 'next' && <QueuePanel room={room} onPlay={playNow} />}
        {tab === 'people' && <PeoplePanel room={room} />}
        {tab === 'goals' && <GoalsPanel code={code} version={room.goalsVersion} />}
        {tab === 'play' && <PlayPanel code={code} onShare={shareToChat} />}
      </div>
    </aside>
    {save && <SaveSheet track={save} roomCode={code} onClose={() => setSave(null)} />}
    {menu && <Sheet title={room.name} sub={admin ? 'You’re the admin of this room.' : undefined} onClose={() => setMenu(false)}>
      <div className="col gap-8">
        {admin && <Button variant="secondary" icon="edit" onClick={() => { setMenu(false); setRename(room.name); }}>Rename room</Button>}
        {pip.supported && pb && !floating && <Button variant="secondary" icon="pip" onClick={() => { setMenu(false); popOut(); }}>Pop out the video now</Button>}
        <Button variant="secondary" icon="copy" onClick={async () => { if (await copyText(room.code)) toast('Room code copied.', { icon: 'copy' }); }}>Copy room code</Button>
        <Button variant="quiet-danger" icon={admin ? 'trash' : 'logout'} onClick={async () => {
          setMenu(false);
          if (!(await confirm(admin ? { title: `Delete “${room.name}”?`, body: 'It closes for everyone. Shared playlists in it are removed. This can’t be undone.', confirmLabel: 'Delete room', danger: true } : { title: `Leave “${room.name}”?`, body: 'You can ask to join again with the code.', confirmLabel: 'Leave room', danger: true }))) return;
          try { const r = await space.deleteRoom(code); toast(r === 'deleted' ? 'Room deleted.' : 'You left the room.'); nav('/'); } catch (e) { fail(e); }
        }}>{admin ? 'Delete room' : 'Leave room'}</Button>
      </div>
    </Sheet>}
    {rename !== null && <Sheet title="Rename room" onClose={() => setRename(null)} footer={<Button block disabled={!rename.trim()} onClick={async () => { try { await space.renameRoom(code, rename); setRename(null); toast('Renamed.'); } catch (e) { fail(e); } }}>Save</Button>}>
      <input aria-label="Room name" className="input" maxLength={50} value={rename} onChange={e => setRename(e.target.value)} />
    </Sheet>}
  </div>;
}

function Volume({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [v, setV] = useState(value);
  const dragging = useRef(false);
  useEffect(() => { if (!dragging.current) setV(value); }, [value]);
  return <label className="row gap-8" title="Volume for everyone" style={{ color: 'var(--muted)' }}>
    <Icon name={v === 0 ? 'mute' : v < 50 ? 'volumeLow' : 'volume'} size={18} />
    <input type="range" min={0} max={100} value={v} aria-label="Volume for everyone" style={{ width: 90, accentColor: '#C8B6FF' }}
      onPointerDown={() => { dragging.current = true; }} onChange={e => setV(Number(e.target.value))}
      onPointerUp={() => { dragging.current = false; onChange(v); }} onKeyUp={() => onChange(v)} />
  </label>;
}
function Gone({ text, action }: { text: string; action?: React.ReactNode }) {
  const nav = useNavigate();
  return <div className="page narrow"><div className="glass window col gap-16" style={{ padding: 40, marginTop: '10vh', alignItems: 'center', textAlign: 'center' }}>
    <Star size={48} glow /><p className="title">{text}</p><div className="row gap-8">{action}<Button variant="secondary" onClick={() => nav('/')}>Back home</Button></div>
  </div></div>;
}
