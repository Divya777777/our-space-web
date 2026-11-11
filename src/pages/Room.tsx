// A room: the shared screen floats in the middle with its playback dock; chat, up next, people, goals and games sit
// in the side panel. On a phone-sized window everything stacks.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { usePip, useWantPip } from '../lib/pip';
import { markRoomVisited } from '../lib/recentRooms';
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
import { RoomThemeLayer, Scene, THEMES, ThemePicker, themeId } from '../components/RoomTheme';
import { InstallSheet, PartyCard, PartyInvite, StreamTiles } from '../components/StreamParty';
import { SERVICES, Service, availability, downloadTestVersion, extension, needsUpdate, openStore, useWatchParty } from '../lib/watchParty';

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
  const [themes, setThemes] = useState(false);
  const [rename, setRename] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState('');
  const position = useRef(0);
  /** Main player's last reported time and when, so the floating copy can follow it closely. */
  const heard = useRef<{ t: number; at: number } | null>(null);
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
  // Leaving the room page tells the server; if nobody else has the room open, its video pauses for the room.
  // (Switching tabs doesn't count: the video keeps playing in the background or the floating window.)
  const apiRef = useRef(space.api);
  useEffect(() => { apiRef.current = space.api; });
  useEffect(() => () => { void apiRef.current(`/rooms/${code}/leave-view`, {}, 'POST').catch(() => {}); }, [code]);
  useEffect(() => { if (!problem) markRoomVisited(code); }, [code, problem]);
  const gate = useGatedPlayback(code, room?.playback);
  const pip = usePip();
  // Offer PiP while something is playing; once floating, keep it there even when paused.
  useEffect(() => { setPlayerError(''); }, [room?.playback?.videoId]);
  // Press P to float the video. Browsers only open the floating window right after a click or key press on the
  // page, so this is the quick way before switching to another app (a tab switch floats it by itself).
  const hasVideo = !!gate.playback;
  useEffect(() => {
    if (!hasVideo || !pip.supported) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'p' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      e.preventDefault(); void pip.open();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasVideo, pip]);
  // Tell the browser what's playing (lock screen / media keys, and Chrome's automatic picture-in-picture).
  const playingNow = !!gate.playback?.playing;
  useEffect(() => {
    const ms = navigator.mediaSession; if (!ms) return;
    try { ms.playbackState = playingNow ? 'playing' : gate.playback ? 'paused' : 'none'; if (room && gate.playback) ms.metadata = new MediaMetadata({ title: title || room.name, artist: room.name, album: 'Our Space', artwork: [{ src: `https://i.ytimg.com/vi/${gate.playback.videoId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' }] }); } catch { /* unsupported */ }
  }, [playingNow, title, room?.name, gate.playback?.videoId]);
  // The browser tab shows a dot when there are unread messages, so you notice from another tab.
  useEffect(() => { document.title = room ? `${unread ? '● ' : ''}${room.name} · Our Space` : 'Our Space'; return () => { document.title = 'Our Space'; }; }, [room?.name, unread]);
  // Keyboard: Space or K = play / pause for everyone, M = mute yourself on the call (never while typing).
  const keys = useRef<{ toggle?: () => void }>({});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') { e.preventDefault(); keys.current.toggle?.(); }
      else if (k === 'm' && call.activeCode === code) { e.preventDefault(); call.toggleMute(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [call, code]);

  const others = useMemo(() => (room?.members || []).filter(m => m.id !== space.user.id), [room?.members, space.user.id]);
  // Netflix / Prime Video together (web + extension), synced over the call.
  const watch = useWatchParty(call, space.user.name);
  const [installFor, setInstallFor] = useState<{ service: Service; host: boolean } | null>(null);
  const [liveIn, setLiveIn] = useState<object | null>(null);
  const adWait = useRef('');
  const [nudge, setNudge] = useState(0);
  // The floating window closed: have the room's player redraw its picture (some laptops leave it black).
  useEffect(() => { if (!pip.slots) setNudge(n => n + 1); }, [pip.slots]);
  const roomRef = useRef(room); roomRef.current = room;
  // This room's header holds the call's controls, so the floating call pill isn't needed here.
  const setDocked = call.setDocked;
  useEffect(() => { setDocked(code); return () => setDocked(null); }, [setDocked, code]);
  // Watching Netflix / Prime together: the floating window shows only the call's faces, never the room's YouTube video.
  const partyOn = !!watch.party.service;
  useWantPip('video', !partyOn && !!gate.playback && (gate.playback.playing || !!pip.slots));
  if (problem === 'missing') return <Gone text="This room was closed, or the code is wrong." />;
  if (problem === 'waiting') return <Gone text="You’re not in this room yet." action={<Button onClick={() => nav(`/join?code=${code}`)}>Ask to join</Button>} />;
  if (!room) return <div className="room"><div className="room-top"><Skeleton h={44} w={260} /></div><div className="stage"><Skeleton h={420} r={30} /></div><div className="side glass"><Skeleton h={600} /></div></div>;

  const admin = room.hostId === space.user.id;
  const pb = room.playback;
  const fail = (e: unknown) => toast((e as Error).message || 'Could not update playback. Try again.', { tone: 'error' });
  // "Keep the video floating": open the small window on the click that starts playback (browsers only allow a
  // window right after a click), so it's already there when you switch to another app.
  const beginParty = (service: Service, host: boolean, fromClick: boolean) => {
    // The faces float over Netflix / Prime: on a call → picture-in-picture now (needs this click); no call → call them (video).
    if (call.activeCode === code) { call.minimize(); if (fromClick && pip.supported && !pip.slots) void pip.open(); }
    else if (!call.activeCode && others.length) call.start(code, others, true, others.length > 1 ? room.name : others[0].name);
    // Two soundtracks at once would be a mess: pause the room's YouTube video for everyone.
    if (pb?.playing) void space.play(code, pb.videoId, false, position.current || positionNow(pb)).catch(() => {});
    watch.start(service, host);
    void space.api('/usage', { name: `party_${service}` }, 'POST').catch(() => {});
  };
  const pickService = (service: Service, host = true) => {
    // Not offered where you are: say so instead of opening a page that can't play.
    const where = availability(service);
    if (where.ok === 'no') { toast(where.note, { tone: 'error' }); return; }
    if (where.ok === 'maybe') toast(where.note, { tone: 'info' });
    if (!others.length) { toast('Invite someone to this room first — then watch together.', { tone: 'error' }); return; }
    // Not installed yet: open the store window on this same click (browsers block it later), and wait.
    if (!extension.version) { if (!openStore()) downloadTestVersion(); setInstallFor({ service, host }); return; }
    // An older extension doesn't know this service yet: get the new version (the store updates by itself; the test
    // version is downloaded again).
    if (needsUpdate(service, extension.version)) {
      toast(`Update the Our Space extension to watch ${SERVICES[service].name} together.`, { tone: 'info', action: { label: 'Get update', run: () => { if (!openStore()) downloadTestVersion(); } } });
      return;
    }
    beginParty(service, host, true);
  };
  const floatNow = () => { if (pip.keepFloating && pip.supported && !pip.slots) void pip.open(); };
  const playNow = (t: Track, context?: Track[]) => { floatNow(); gate.join(); void space.play(code, t.videoId, true, 0, context).catch(fail); };
  const toggle = () => {
    if (!pb) return;
    if (gate.waiting) { floatNow(); gate.join(); return; }
    if (!pb.playing) floatNow();
    void space.play(code, pb.videoId, !pb.playing, position.current || positionNow(pb)).catch(fail);
  };
  keys.current.toggle = toggle;
  const next = () => { if (pb && room.queue?.length) void space.queue(code, 'next', { from: pb.videoId }).catch(fail); };
  const shareToChat = async (text: string) => { await chat.sendText(text); };

  const playerEl = gate.playback ? <YouTubePlayer key={code} playback={gate.playback} volume={room.volume ?? 100} nudge={nudge} events={{
          onTitle: (id, t) => { if (id === pb?.videoId) setTitle(t); },
          // Note when the time last moved: in a hidden tab YouTube reports less often, and a repeated old value
          // must not look fresh (the floating copy would keep jumping back and show only black while buffering).
          onPosition: s => { position.current = s; if (!heard.current || Math.abs(s - heard.current.t) > 0.01) heard.current = { t: s, at: Date.now() }; },
          onError: setPlayerError,
          onEnded: id => { const key = `${id}:${pb?.revision}`; if (ended.current === key || !room.queue?.length) return; ended.current = key; void space.queue(code, 'next', { from: id }).catch(() => { ended.current = ''; }); },
          // A YouTube ad on this computer: the room waits (paused for everyone at this spot) and carries on together
          // when it ends or is skipped. Only resumes if the room is still waiting for us (nobody changed it meanwhile).
          onAd: (on, at) => {
            const cur = roomRef.current?.playback; if (!cur || gate.waiting) return;
            if (on) { if (!cur.playing) return; adWait.current = cur.videoId; void space.play(code, cur.videoId, false, at, undefined, { hold: true }).catch(() => { adWait.current = ''; }); }
            else if (adWait.current === cur.videoId) { adWait.current = ''; if (!cur.playing && cur.hold?.by === space.user.id) void space.play(code, cur.videoId, true, at).catch(fail); }
          },
          onUserControl: (action, at) => { if (!pb) return; if (gate.waiting) { if (action === 'play') gate.join(); return; } void space.play(code, pb.videoId, action === 'seek' ? pb.playing : action === 'play', at).catch(fail); },
        }} /> : null;
  const floating = !!pip.slots && !!playerEl && !partyOn;
  // The floating window shows a muted copy that follows the main player (which keeps playing the sound here).
  const mainTime = () => { const h = heard.current; if (!h) return null; const age = Date.now() - h.at; if (gate.playback?.playing && age > 3000) return null; return h.t + (gate.playback?.playing ? age / 1000 : 0); };
  // Until the floating copy is actually playing, the window shows the video's picture instead of black.
  // Remembered per floating window (a new window starts with the picture again). (State declared above the early returns.)
  const pipLive = !!pip.slots && liveIn === pip.slots;
  const pipPlayer = floating && gate.playback ? <YouTubePlayer key={`pip-${code}`} playback={gate.playback} events={{ onStarted: () => setLiveIn(pip.slots) }} follow={mainTime} /> : null;

  const theme = themeId(room.theme);
  const top = <div className="room-top">
    <IconButton icon="back" label="Back home" onClick={() => nav('/')} />
    <div className="grow" style={{ minWidth: 0 }}>
      <h1 className="ellipsis room-name" title={room.name}>{room.name}</h1>
      <button className="small muted row gap-4" onClick={async () => { if (await copyText(room.code)) toast('Room code copied.', { icon: 'copy' }); }} aria-label={`Copy room code ${room.code}`}><span className="room-code">{room.code}</span> <Icon name="copy" size={13} /></button>
    </div>
    <div className="stack" aria-label={`${room.members.length} people in this room`}>{room.members.slice(0, 4).map(m => <Avatar key={m.id} name={m.name} size={34} />)}</div>
    {others.length > 0 && !call.activeCode && <>
      <IconButton icon="phone" label={others.length > 1 ? 'Voice call the room' : `Voice call ${others[0].name}`} onClick={() => call.start(code, others, false, others.length > 1 ? room.name : others[0].name)} />
      <IconButton icon="video" label={others.length > 1 ? 'Video call the room' : `Video call ${others[0].name}`} onClick={() => call.start(code, others, true, others.length > 1 ? room.name : others[0].name)} />
    </>}
    {call.activeCode === code && <div className="call-dock" role="group" aria-label="Your call">
      <button className="call-dock-time" onClick={call.open} title="Back to the call"><span className="live-dot" />{call.status}</button>
      <IconButton size="sm" icon={call.muted ? 'micOff' : 'mic'} variant={call.muted ? 'on' : undefined} label={call.muted ? 'Unmute' : 'Mute'} onClick={call.toggleMute} />
      {/* Safari (and older browsers) can't float by themselves when you switch apps: one tap does it there. */}
      {!pip.supported && call.canFloat && <IconButton size="sm" icon="pip" label="Float the call over other apps" onClick={() => void call.floatCall()} />}
      <IconButton size="sm" icon="hangup" variant="end" label="End call" onClick={call.hangup} />
      <Button size="sm" variant="secondary" onClick={call.open}>Back to call</Button>
    </div>}
    <IconButton icon="dots" label="Room options" onClick={() => setMenu(true)} />
  </div>;

  return <div className="room">
    <RoomThemeLayer theme={theme} />
    {pb && <div className="ambient" aria-hidden="true"><img key={pb.videoId} src={`https://i.ytimg.com/vi/${pb.videoId}/mqdefault.jpg`} alt="" /></div>}
    {top}
    <section className="stage" aria-label="Watch together">
      <div className="screen" ref={screen}>
        {/* The player keeps its place in the page while the video floats (moving or re-wrapping it would reload it, and a
            reloaded player can't start with sound by itself); the floating window shows a muted copy. */}
        {gate.playback ? playerEl : <div className="screen-empty"><div className="col gap-16" style={{ alignItems: 'center' }}><Star size={48} glow /><p className="h2">What are we watching?</p><p className="muted small" style={{ maxWidth: 360 }}>Search below or paste a YouTube link. It plays for everyone here at the same moment.</p></div></div>}
        {gate.playback && floating && <div className="screen-empty screen-over"><div className="col gap-16" style={{ alignItems: 'center' }}><Icon name="pip" size={40} /><p className="h3">Playing in a floating window</p><p className="muted small" style={{ maxWidth: 340, textAlign: 'center' }}>Use any other app — it stays on top. Everyone here still watches in sync.</p><Button variant="secondary" onClick={pip.close}>Bring it back here</Button></div></div>}
        {pb?.hold && pb.hold.by !== space.user.id && <div className="screen-empty screen-over ad-wait"><div className="col gap-12" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="ad-wait-dot" aria-hidden="true" /><p className="h3">{firstName(pb.hold.name)} is watching an ad</p>
          <p className="muted small" style={{ maxWidth: 320 }}>The video waits here and starts again for both of you when the ad ends.</p></div></div>}
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
        {pipPlayer}
        <img className={`pip-poster ${pipLive ? 'gone' : ''}`} src={`https://i.ytimg.com/vi/${pb.videoId}/hqdefault.jpg`} alt="" aria-hidden="true" />
        <div className="pip-controls">
          <IconButton size="sm" variant="accent" icon={gate.playback?.playing ? 'pause' : 'play'} label={gate.waiting ? 'Join in' : pb.playing ? 'Pause for everyone' : 'Play for everyone'} onClick={toggle} />
          <IconButton size="sm" icon="next" label="Skip to the next video" disabled={!room.queue?.length} onClick={next} />
          <span className="grow tiny ellipsis" style={{ fontWeight: 600 }}>{title || room.name}</span>
          <IconButton size="sm" icon="volume" label="Close this window and keep playing in the background" onClick={pip.background} />
          <IconButton size="sm" icon="back" label="Back to the room" onClick={() => { pip.close(); window.focus(); }} />
        </div>
      </div>, pip.slots!.video)}
      {watch.party.invite && !watch.party.service && <PartyInvite invite={watch.party.invite} onJoin={() => pickService(watch.party.invite!.service, false)} onDismiss={watch.dismissInvite} />}
      <PartyCard party={watch.party} onToggle={watch.togglePlay} onResync={watch.resync} onEnd={() => watch.end()} />
      <YouTubeSearch saved={space.playlists} onPlay={t => playNow(t)} onQueue={pb ? t => void space.queue(code, 'add', { videoId: t.videoId, title: t.title }).then(() => toast('Added to Up next', { icon: 'queue' })).catch(fail) : undefined} />
      {!watch.party.service && <StreamTiles onPick={s => pickService(s)} />}
      {others.length === 0 && <InviteCard room={room} />}
      {installFor && <InstallSheet service={installFor.service} onClose={() => setInstallFor(null)} onDone={() => { const f = installFor; setInstallFor(null); beginParty(f.service, f.host, false); }} />}
      <div className="col gap-8"><p className="h3">Plans</p><Plans code={code} compact /></div>
    </section>
    {/* Phones: the panel sits below the video, so a small button jumps to the chat (with a dot for new messages). */}
    <button className="room-jump glass" onClick={() => { setTab('chat'); document.getElementById('room-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} aria-label={unread ? 'Open chat, new messages' : 'Open chat'}><Icon name="chat" size={18} />Chat{unread && <i />}</button>
    <aside className="side glass" id="room-panel" aria-label="Room panel">
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
        <button className="theme-row" onClick={() => { setMenu(false); setThemes(true); }}>
          <Scene id={theme} />
          <span className="grow"><b>Room theme</b><small>{THEMES.find(t => t.id === theme)?.name} · tap to change</small></span>
          <Icon name="fwd" size={18} />
        </button>
        {admin && <Button variant="secondary" icon="edit" onClick={() => { setMenu(false); setRename(room.name); }}>Rename room</Button>}
        <Button variant="secondary" icon="copy" onClick={async () => { if (await copyText(room.code)) toast('Room code copied.', { icon: 'copy' }); }}>Copy room code</Button>
        <Button variant="quiet-danger" icon={admin ? 'trash' : 'logout'} onClick={async () => {
          setMenu(false);
          if (!(await confirm(admin ? { title: `Delete “${room.name}”?`, body: 'It closes for everyone. Shared playlists in it are removed. This can’t be undone.', confirmLabel: 'Delete room', danger: true } : { title: `Leave “${room.name}”?`, body: 'You can ask to join again with the code.', confirmLabel: 'Leave room', danger: true }))) return;
          try { const r = await space.deleteRoom(code); toast(r === 'deleted' ? 'Room deleted.' : 'You left the room.'); nav('/'); } catch (e) { fail(e); }
        }}>{admin ? 'Delete room' : 'Leave room'}</Button>
      </div>
    </Sheet>}
    {themes && <Sheet title="Room theme" sub="Sets the mood for everyone in this room." onClose={() => setThemes(false)}>
      <ThemePicker value={theme} onPick={async id => { if (id === theme) return; try { await space.setRoomTheme(code, id); } catch (e) { fail(e); } }} />
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
    <input type="range" min={0} max={100} value={v} aria-label="Volume for everyone" style={{ width: 90, accentColor: 'var(--lav)' }}
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
