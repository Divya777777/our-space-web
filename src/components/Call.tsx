// Voice and video calls in the browser, using the same signalling as the phone app (call inbox + per-person
// signals, one RTCPeerConnection per other person, offers from the lower user ID, media state on a data channel).
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSpace } from '../lib/space';
import { actionableSignals } from '../lib/callProtocol';
import type { CallPeer, CallSignal } from '../lib/types';
import { Avatar, IconButton, firstName } from './ui';
import { Icon } from './Icon';

type Phase = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'connected' | 'reconnecting';
type Candidate = RTCIceCandidateInit;
type Description = RTCSessionDescriptionInit;
type ActiveCall = { id: string; code: string; video: boolean; title: string; starter: CallPeer; members: CallPeer[]; offer?: Description; mine: boolean };
type Peer = { id: string; name: string; pc: RTCPeerConnection; stream: MediaStream | null; channel: RTCDataChannel | null; sender: RTCRtpSender | null; state: 'connecting' | 'connected' | 'reconnecting'; cameraOff: boolean; muted: boolean; out: { ready: boolean; queue: Candidate[]; timer?: ReturnType<typeof setTimeout> } };
type PeerView = { id: string; name: string; stream: MediaStream | null; cameraOff: boolean; muted: boolean; state: Peer['state'] };
type Controls = { activeCode?: string; liveWith: number; phase: Phase; start: (code: string, members: CallPeer[], video: boolean, title: string) => void; open: () => void };
const CallContext = createContext<Controls>({ liveWith: 0, phase: 'idle', start: () => {}, open: () => {} });
export const useCall = () => useContext(CallContext);
const VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' };

export function CallProvider({ children }: React.PropsWithChildren) {
  const space = useSpace();
  const nav = useNavigate();
  const latest = useRef(space); useEffect(() => { latest.current = space; });
  const [phase, setPhase] = useState<Phase>('idle'); const phaseRef = useRef<Phase>('idle');
  const [call, setCall] = useState<ActiveCall | null>(null); const callRef = useRef<ActiveCall | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [peerList, setPeerList] = useState<PeerView[]>([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(true);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const peers = useRef(new Map<string, Peer>());
  const pending = useRef(new Set<string>());
  const live = useRef(new Set<string>());
  const early = useRef(new Map<string, Candidate[]>());
  const helloed = useRef(new Set<string>());
  const stream = useRef<MediaStream | null>(null);
  const ice = useRef<RTCIceServer[] | null>(null);
  const mediaState = useRef({ cameraOff: true, muted: false });
  const tone = useRef<{ stop: () => void } | null>(null);

  const transition = (next: Phase) => { phaseRef.current = next; setPhase(next); };
  const select = (next: ActiveCall | null) => { callRef.current = next; setCall(next); };
  const refresh = () => setPeerList([...peers.current.values()].map(p => ({ id: p.id, name: p.name, stream: p.stream, cameraOff: p.cameraOff, muted: p.muted, state: p.state })));
  const sendTo = (to: string, type: CallSignal['type'], payload: Record<string, unknown> = {}, target = callRef.current) => target ? latest.current.signalCall(target.code, to, type, { ...payload, callId: target.id }) : Promise.resolve();
  function flush(peer: Peer) {
    clearTimeout(peer.out.timer); peer.out.timer = undefined;
    const target = callRef.current;
    if (!peer.out.ready || !peer.out.queue.length || !target || peers.current.get(peer.id) !== peer) return;
    void sendTo(peer.id, 'candidate', { candidates: peer.out.queue.splice(0) }, target).catch(() => {});
  }
  function removePeer(id: string) { const p = peers.current.get(id); if (!p) return; clearTimeout(p.out.timer); try { p.pc.close(); } catch { /* closed */ } peers.current.delete(id); early.current.delete(id); refresh(); }
  function stopTone() { tone.current?.stop(); tone.current = null; }
  function finish(notify = true, message = '') {
    const previous = callRef.current; const wasRinging = phaseRef.current === 'incoming';
    const everyone = new Set([...peers.current.keys(), ...pending.current]);
    select(null); transition('idle'); setExpanded(true); stopTone();
    [...peers.current.keys()].forEach(removePeer);
    pending.current.clear(); live.current.clear(); early.current.clear(); ice.current = null;
    stream.current?.getTracks().forEach(t => t.stop()); stream.current = null;
    setLocal(null); setPeerList([]); setCameraOff(true); setMuted(false); setElapsed(0); setError(message);
    mediaState.current = { cameraOff: true, muted: false };
    if (!notify || !previous) return;
    if (wasRinging) { void sendTo(previous.starter.id, 'reject', { reason: 'declined' }, previous).catch(() => {}); return; }
    everyone.forEach(id => { void sendTo(id, 'end', {}, previous).catch(() => {}); });
  }
  const finishRef = useRef(finish); useEffect(() => { finishRef.current = finish; });
  useEffect(() => () => finishRef.current(), []);
  useEffect(() => {
    if (!['incoming', 'outgoing', 'connecting', 'reconnecting'].includes(phase)) return;
    const t = setTimeout(() => finishRef.current(phase !== 'incoming', phase === 'incoming' ? 'Missed call.' : phase === 'outgoing' ? 'No answer. Try again when they’re free.' : 'The call could not connect. Please try again.'), phase === 'reconnecting' ? 20000 : 45000);
    return () => clearTimeout(t);
  }, [phase]);
  useEffect(() => { if (phase !== 'connected' && phase !== 'reconnecting') return; const t = setInterval(() => setElapsed(v => v + 1), 1000); return () => clearInterval(t); }, [phase]);
  // Closing the tab hangs up properly.
  useEffect(() => { const bye = () => { if (callRef.current) finishRef.current(); }; window.addEventListener('pagehide', bye); return () => window.removeEventListener('pagehide', bye); }, []);

  function updatePhase() {
    if (phaseRef.current === 'idle' || phaseRef.current === 'incoming') return;
    const list = [...peers.current.values()];
    if (list.some(p => p.state === 'connected')) { stopTone(); if (phaseRef.current !== 'connected') { transition('connected'); setError(''); } }
    else if (list.some(p => p.state === 'reconnecting')) transition('reconnecting');
  }
  function shareMedia(only?: RTCDataChannel) {
    const packet = JSON.stringify(mediaState.current);
    for (const ch of only ? [only] : [...peers.current.values()].map(p => p.channel)) if (ch?.readyState === 'open') ch.send(packet);
  }
  function attach(peer: Peer, ch: RTCDataChannel) {
    peer.channel = ch;
    ch.onopen = () => shareMedia(ch);
    ch.onmessage = e => { if (peer.channel !== ch) return; try { const s = JSON.parse(String(e.data)); if (typeof s.cameraOff === 'boolean') peer.cameraOff = s.cameraOff; if (typeof s.muted === 'boolean') peer.muted = s.muted; refresh(); } catch { /* ignore */ } };
  }
  async function prepare(target: ActiveCall) {
    if (!stream.current) {
      stopTone();
      let media: MediaStream;
      try { media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: target.video ? VIDEO : false }); }
      catch { throw new Error(target.video ? 'Allow camera and microphone for this site (the icon in the address bar), then try again.' : 'Allow the microphone for this site (the icon in the address bar), then try again.'); }
      if (callRef.current !== target) { media.getTracks().forEach(t => t.stop()); return false; }
      stream.current = media; setLocal(media);
      mediaState.current = { muted: false, cameraOff: !target.video }; setCameraOff(!target.video);
    }
    if (!ice.current) ice.current = await latest.current.iceServers();
    return callRef.current === target;
  }
  function createPeer(person: CallPeer, target: ActiveCall, { offerer, ready }: { offerer: boolean; ready: boolean }) {
    removePeer(person.id);
    const pc = new RTCPeerConnection({ iceServers: ice.current || [], iceCandidatePoolSize: 2 });
    const peer: Peer = { id: person.id, name: person.name, pc, stream: null, channel: null, sender: null, state: 'connecting', cameraOff: !target.video, muted: false, out: { ready, queue: [] } };
    peers.current.set(person.id, peer);
    const media = stream.current!;
    media.getAudioTracks().forEach(t => pc.addTrack(t, media));
    const cam = media.getVideoTracks()[0];
    peer.sender = cam ? pc.addTrack(cam, media) : pc.addTransceiver('video', { direction: 'sendrecv' }).sender;
    if (offerer) attach(peer, pc.createDataChannel('media-state', { ordered: true }));
    pc.ondatachannel = e => attach(peer, e.channel);
    pc.ontrack = e => {
      if (peers.current.get(person.id) !== peer) return;
      if (!peer.stream) peer.stream = e.streams[0] || new MediaStream();
      if (!peer.stream.getTracks().some(t => t.id === e.track.id)) peer.stream.addTrack(e.track);
      refresh();
    };
    pc.onicecandidate = e => { if (e.candidate && peers.current.get(person.id) === peer) { peer.out.queue.push(e.candidate.toJSON()); if (!peer.out.timer) peer.out.timer = setTimeout(() => flush(peer), 120); } };
    pc.oniceconnectionstatechange = () => {
      if (peers.current.get(person.id) !== peer || callRef.current !== target) return;
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') { peer.state = 'connected'; pending.current.delete(person.id); shareMedia(); }
      else if (s === 'disconnected') peer.state = 'reconnecting';
      else if (s === 'failed') { removePeer(person.id); maybeEnd(`${firstName(person.name)}’s connection dropped.`); return; }
      refresh(); updatePhase();
    };
    refresh();
    return peer;
  }
  async function addEarly(peer: Peer) { for (const c of early.current.get(peer.id) || []) await peer.pc.addIceCandidate(c).catch(() => {}); early.current.delete(peer.id); }
  function maybeEnd(message = '') { if (!callRef.current || phaseRef.current === 'incoming') return; if (!peers.current.size && !pending.current.size) finish(false, message); }
  async function offerTo(person: CallPeer, target: ActiveCall) {
    if (!(await prepare(target))) return;
    const peer = createPeer(person, target, { offerer: true, ready: true });
    await peer.pc.setLocalDescription(await peer.pc.createOffer());
    await sendTo(person.id, 'offer', { description: peer.pc.localDescription!.toJSON() }, target);
  }
  async function answerFrom(person: CallPeer, description: Description, target: ActiveCall) {
    if (!(await prepare(target))) return;
    const peer = createPeer(person, target, { offerer: false, ready: true });
    await peer.pc.setRemoteDescription(description);
    await addEarly(peer);
    await peer.pc.setLocalDescription(await peer.pc.createAnswer());
    await sendTo(person.id, 'answer', { description: peer.pc.localDescription!.toJSON() }, target);
  }
  async function start(code: string, members: CallPeer[], video: boolean, title: string) {
    if (callRef.current) { setExpanded(true); return; }
    if (!members.length) return;
    const me = latest.current.user;
    const target: ActiveCall = { code, video, title, members, starter: { id: me.id, name: me.name }, mine: true, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` };
    select(target); transition('connecting'); setExpanded(true); setError('');
    try {
      if (!(await prepare(target))) return;
      members.forEach(m => pending.current.add(m.id));
      transition('outgoing'); tone.current = ringback();
      await Promise.all(members.map(async m => {
        const peer = createPeer(m, target, { offerer: true, ready: false });
        await peer.pc.setLocalDescription(await peer.pc.createOffer());
        if (callRef.current !== target) return;
        await sendTo(m.id, 'invite', { video, title, group: members.length > 1, members: members.map(x => x.id), offer: peer.pc.localDescription!.toJSON() }, target);
        peer.out.ready = true; flush(peer);
      }));
      setTimeout(() => {
        if (callRef.current !== target) return;
        [...pending.current].forEach(id => { if (peers.current.get(id)?.state !== 'connected') { void sendTo(id, 'end', {}, target).catch(() => {}); removePeer(id); pending.current.delete(id); } });
        maybeEnd('No answer. Try again when they’re free.');
      }, 45000);
    } catch (e) { if (callRef.current === target && phaseRef.current !== 'connected') finish(true, (e as Error).message || 'Could not start the call.'); }
  }
  async function accept() {
    const target = callRef.current; if (!target || phaseRef.current !== 'incoming') return;
    transition('connecting'); stopTone();
    try {
      if (target.offer && live.current.has(target.starter.id)) await answerFrom(target.starter, target.offer, target);
      else await prepare(target);
      if (callRef.current !== target) return;
      const room = latest.current.rooms.find(r => r.code === target.code);
      const everyone = new Map<string, string>();
      [...(room?.members || []), ...target.members].forEach(p => everyone.set(p.id, p.name));
      for (const [id] of everyone) if (id !== latest.current.user.id && id !== target.starter.id) void sendTo(id, 'hello', {}, target).catch(() => {});
      live.current.clear();
      if (!peers.current.size) setTimeout(() => maybeEnd('Everyone already left the call.'), 15000);
      if (target.code) nav(`/room/${target.code}`);
    } catch (e) { if (callRef.current === target) finish(true, (e as Error).message); }
  }
  async function handle(signal: CallSignal) {
    if (!signal.code) return;
    const callId = typeof signal.payload.callId === 'string' ? signal.payload.callId : '';
    const from: CallPeer = { id: signal.from, name: signal.name };
    if (signal.type === 'invite') {
      if (signal.sentAt && Date.now() - signal.sentAt > 45000) return;
      if (callRef.current?.id === callId) return;
      if (callRef.current) { await latest.current.signalCall(signal.code, signal.from, 'reject', { reason: 'busy', callId }); return; }
      const offer = signal.payload.offer as Description | undefined;
      const room = latest.current.rooms.find(r => r.code === signal.code);
      const ids = Array.isArray(signal.payload.members) ? (signal.payload.members as unknown[]).map(String) : [];
      const group = signal.payload.group === true;
      const target: ActiveCall = {
        code: signal.code, id: callId || `legacy-${signal.id}`, starter: from, mine: false, video: signal.payload.video !== false,
        members: ids.filter(id => id !== latest.current.user.id).map(id => ({ id, name: room?.members.find(m => m.id === id)?.name || 'Member' })),
        title: group ? (typeof signal.payload.title === 'string' ? signal.payload.title : room?.name || 'Your room') : from.name,
        offer: offer && typeof offer.sdp === 'string' && offer.type === 'offer' ? offer : undefined,
      };
      live.current = new Set([from.id]); helloed.current.clear();
      select(target); transition('incoming'); setExpanded(true); setError('');
      tone.current = ringtone();
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(group ? `${from.name} is calling ${target.title}` : `${from.name} is calling`, { body: target.video ? 'Video call · Our Space' : 'Voice call · Our Space', icon: `${import.meta.env.BASE_URL}icon-192.png`, tag: 'call-' + target.id, requireInteraction: true });
        n.onclick = () => { window.focus(); n.close(); };
      }
      void latest.current.iceServers().then(s => { ice.current = s; }).catch(() => {});
      return;
    }
    const target = callRef.current;
    if (!target || signal.code !== target.code || callId !== target.id) return;
    if (phaseRef.current === 'incoming') {
      if (signal.type === 'hello' || signal.type === 'answer') live.current.add(from.id);
      if (signal.type === 'end') { live.current.delete(from.id); if (!live.current.size) finish(false, 'Missed call.'); }
      if (signal.type === 'candidate' && from.id === target.starter.id) early.current.set(from.id, [...(early.current.get(from.id) || []), ...(Array.isArray(signal.payload.candidates) ? signal.payload.candidates as Candidate[] : [])]);
      return;
    }
    if (signal.type === 'end' || signal.type === 'reject') {
      pending.current.delete(from.id); removePeer(from.id);
      maybeEnd(signal.type === 'reject' ? (target.members.length > 1 ? 'Nobody could answer right now.' : `${firstName(from.name)} is unavailable right now.`) : '');
      return;
    }
    if (signal.type === 'hello') {
      if (peers.current.has(from.id)) return;
      if (latest.current.user.id < from.id) await offerTo(from, target);
      else if (!helloed.current.has(from.id)) { helloed.current.add(from.id); await sendTo(from.id, 'hello', {}, target); }
      return;
    }
    if (signal.type === 'offer') { await answerFrom(from, signal.payload.description as Description, target); return; }
    const peer = peers.current.get(from.id);
    if (signal.type === 'candidate') {
      const list = Array.isArray(signal.payload.candidates) ? signal.payload.candidates as Candidate[] : [signal.payload as Candidate];
      if (peer?.pc.remoteDescription) { for (const c of list) await peer.pc.addIceCandidate(c).catch(() => {}); }
      else early.current.set(from.id, [...(early.current.get(from.id) || []), ...list]);
      return;
    }
    if (signal.type === 'answer' && peer && peer.pc.signalingState === 'have-local-offer') {
      stopTone(); if (phaseRef.current === 'outgoing') transition('connecting');
      await peer.pc.setRemoteDescription(signal.payload.description as Description);
      await addEarly(peer);
    }
  }
  const handling = useRef(handle); useEffect(() => { handling.current = handle; });
  const inbox = useRef({ after: 0, cursor: undefined as number | undefined });
  useEffect(() => { inbox.current = { after: 0, cursor: undefined }; }, [space.user.id]);
  useEffect(() => {
    if (!space.signedIn) return;
    let stopped = false; let failures = 0; const abort = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let delay = 0;
      try {
        const r = await latest.current.callInbox(inbox.current.after, inbox.current.cursor, abort.signal);
        if (stopped) return; failures = 0;
        for (const s of actionableSignals(r.signals)) {
          if (stopped) break;
          try { await handling.current(s); }
          catch { if (callRef.current && peers.current.has(s.from)) { removePeer(s.from); maybeEnd('Call setup was interrupted. Please try again.'); } }
          inbox.current.after = Math.max(inbox.current.after, s.id);
        }
        for (const s of r.signals) inbox.current.after = Math.max(inbox.current.after, s.id);
        inbox.current.cursor = r.cursor;
      } catch { delay = Math.min(10000, 500 * 2 ** Math.min(failures++, 4)); if (!stopped && failures > 2 && callRef.current) setError('Reconnecting to the call service…'); }
      if (!stopped) timer = setTimeout(poll, delay);
    }
    void poll();
    return () => { stopped = true; abort.abort(); clearTimeout(timer); };
  }, [space.signedIn, space.user.id]);

  function toggleMute() { const next = !mediaState.current.muted; stream.current?.getAudioTracks().forEach(t => { t.enabled = !next; }); mediaState.current.muted = next; setMuted(next); shareMedia(); }
  async function toggleCamera() {
    if (busy || !callRef.current || !stream.current) return;
    const target = callRef.current; setBusy(true);
    try {
      const next = !mediaState.current.cameraOff;
      let cam = stream.current.getVideoTracks()[0];
      if (!next && !cam) {
        const cap = await navigator.mediaDevices.getUserMedia({ video: VIDEO }).catch(() => { throw new Error('Allow the camera for this site, then try again.'); });
        if (callRef.current !== target) { cap.getTracks().forEach(t => t.stop()); return; }
        cam = cap.getVideoTracks()[0];
        await Promise.all([...peers.current.values()].map(p => p.sender?.replaceTrack(cam!)));
        stream.current.addTrack(cam); setLocal(new MediaStream(stream.current.getTracks()));
      }
      if (cam) cam.enabled = !next;
      mediaState.current.cameraOff = next; setCameraOff(next); shareMedia();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const connected = phase === 'connected' || phase === 'reconnecting';
  const others = peerList.filter(p => p.state !== 'connecting' || p.stream);
  const group = (call?.members.length || 0) > 1 || others.length > 1;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const status = phase === 'incoming' ? (group ? `${firstName(call?.starter.name || '')} is calling the room` : `Incoming ${call?.video ? 'video' : 'voice'} call`)
    : phase === 'outgoing' ? 'Ringing…' : phase === 'connecting' ? 'Connecting…' : phase === 'reconnecting' ? 'Reconnecting…' : group ? `${others.filter(p => p.state === 'connected').length + 1} in call · ${clock}` : clock;
  const controls = <>
    {connected && <IconButton size="lg" icon={muted ? 'micOff' : 'mic'} variant={muted ? 'on' : undefined} label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} />}
    {connected && call?.video && <IconButton size="lg" icon={cameraOff ? 'videoOff' : 'video'} variant={cameraOff ? 'on' : undefined} label={cameraOff ? 'Turn camera on' : 'Turn camera off'} disabled={busy} onClick={() => void toggleCamera()} />}
    {connected && call && <IconButton size="lg" icon="game" label="Play a game, the call continues" onClick={() => { setExpanded(false); nav(`/room/${call.code}?tab=play`); }} />}
    <IconButton size="lg" icon="hangup" variant="end" label={connected ? 'End call' : 'Cancel call'} onClick={() => finish()} />
  </>;

  return <CallContext.Provider value={{ activeCode: call?.code, phase, liveWith: connected ? peerList.filter(p => p.state === 'connected').length : 0, start: (c, m, v, t) => { void start(c, m, v, t); }, open: () => setExpanded(true) }}>
    {children}
    {peerList.map(p => <RemoteAudio key={p.id} stream={p.stream} />)}
    {!call && error && <div className="toasts" style={{ bottom: 96 }}><div className="toast">{error}<button onClick={() => setError('')}>OK</button></div></div>}
    {call && phase === 'incoming' && <div className="scrim" style={{ zIndex: 95 }}>
      <div className="sheet col gap-20" role="alertdialog" aria-label={status} style={{ padding: 32, alignItems: 'center', textAlign: 'center', width: 'min(380px, 100%)' }}>
        <div className="ring"><Avatar name={call.starter.name} size={96} /></div>
        <div><h2 className="title">{call.title}</h2><p className="muted">{status}</p></div>
        <div className="row gap-24"><div className="col gap-8" style={{ alignItems: 'center' }}><IconButton size="lg" icon="hangup" variant="end" label="Decline" onClick={() => finish(true)} /><span className="small muted">Decline</span></div>
          <div className="col gap-8" style={{ alignItems: 'center' }}><IconButton size="lg" icon={call.video ? 'video' : 'phone'} variant="mint" label="Answer" onClick={() => void accept()} /><span className="small muted">Answer</span></div></div>
      </div>
    </div>}
    {call && phase !== 'incoming' && expanded && <div className="call-layer" role="dialog" aria-label={`Call · ${call.title}`}>
      <div className="call-top">
        <IconButton icon="down" label="Back to the room, the call continues" onClick={() => setExpanded(false)} />
        <div className="grow"><p className="h3">{group ? call.title : others[0]?.name || call.title}</p><p className="small muted">{!group && others[0]?.muted && connected ? 'Muted · ' : ''}{status}</p></div>
        {error && <span className="small rose">{error}</span>}
      </div>
      <Stage others={others} connected={connected} video={call.video} title={call.title} status={status} ringing={call.members} />
      {local && !cameraOff && <div className="tile self-tile"><VideoEl stream={local} muted /><span className="name">You{muted && <Icon name="micOff" size={13} />}</span></div>}
      <div className="call-controls"><div className="glass">{controls}</div></div>
    </div>}
    {call && phase !== 'incoming' && !expanded && <MiniCall others={others} status={status} title={group ? call.title : others[0]?.name || call.title} onOpen={() => setExpanded(true)} controls={<>
      {connected && <IconButton size="sm" icon={muted ? 'micOff' : 'mic'} variant={muted ? 'on' : undefined} label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} />}
      <IconButton size="sm" icon="hangup" variant="end" label="End call" onClick={() => finish()} />
    </>} />}
  </CallContext.Provider>;
}

function Stage({ others, connected, video, title, status, ringing }: { others: PeerView[]; connected: boolean; video: boolean; title: string; status: string; ringing: CallPeer[] }) {
  if (!connected || !others.length) return <div className="call-stage"><div className="col gap-16" style={{ alignItems: 'center' }}>
    <div className="stack ring">{(others.length ? others : ringing).slice(0, 4).map(p => <Avatar key={p.id} name={p.name} size={104} />)}</div>
    <p className="title">{title}</p><p className="muted">{status}</p></div></div>;
  const cols = others.length === 1 ? 1 : others.length <= 4 ? 2 : 3;
  return <div className="call-stage" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, ${others.length === 1 ? 'min(1100px, 100%)' : '520px'}))` }}>
    {others.map(p => <PeerTile key={p.id} p={p} video={video} />)}
  </div>;
}
function PeerTile({ p, video }: { p: PeerView; video: boolean }) {
  const speaking = useSpeaking(p.stream, !p.muted);
  const showVideo = video && p.stream && !p.cameraOff && p.stream.getVideoTracks().length > 0;
  return <div className={`tile ${speaking ? 'speaking' : ''}`}>
    {showVideo ? <VideoEl stream={p.stream!} muted /> : <div className="col gap-8" style={{ alignItems: 'center' }}><Avatar name={p.name} size={92} /><span className="small muted">{p.state === 'connected' ? (video ? 'Camera off' : 'On the call') : 'Connecting…'}</span></div>}
    <span className="name">{p.muted && <Icon name="micOff" size={13} />}{firstName(p.name)}</span>
  </div>;
}
function MiniCall({ others, status, title, onOpen, controls }: { others: PeerView[]; status: string; title: string; onOpen: () => void; controls: React.ReactNode }) {
  const first = others.find(p => p.stream && !p.cameraOff && p.stream.getVideoTracks().length);
  return <div className="call-pill glass" style={first ? { flexDirection: 'column', alignItems: 'stretch', borderRadius: 24, padding: 8, width: 260 } : undefined}>
    {first && <button className="tile" style={{ aspectRatio: '16 / 10', borderRadius: 18 }} onClick={onOpen} aria-label="Open the call"><VideoEl stream={first.stream!} muted /></button>}
    <div className="row gap-8" style={first ? { padding: '4px 4px 0 8px' } : undefined}>
      <button className="grow row gap-8" onClick={onOpen} style={{ textAlign: 'left', minWidth: 0 }}><span className="live-dot" /><span className="col gap-4" style={{ minWidth: 0 }}><span className="small ellipsis" style={{ fontWeight: 600 }}>{title}</span><span className="tiny muted">{status}</span></span></button>
      {controls}
    </div>
  </div>;
}
function VideoEl({ stream, muted }: { stream: MediaStream; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream; }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} />;
}
/** Remote voices play through hidden audio elements so they keep going when the call window is minimised. */
function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current && stream && ref.current.srcObject !== stream) { ref.current.srcObject = stream; void ref.current.play().catch(() => {}); } }, [stream]);
  return <audio ref={ref} autoPlay />;
}
function useSpeaking(stream: MediaStream | null, enabled: boolean) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!stream || !enabled || !stream.getAudioTracks().length) { setOn(false); return; }
    const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.fftSize); let raf = 0; let last = false; let quietSince = 0;
    const tick = () => { an.getByteTimeDomainData(buf); let sum = 0; for (const v of buf) { const d = (v - 128) / 128; sum += d * d; } const loud = Math.sqrt(sum / buf.length) > 0.045;
      const now = performance.now(); if (loud) quietSince = now; const next = loud || now - quietSince < 350; if (next !== last) { last = next; setOn(next); } raf = requestAnimationFrame(tick); };
    tick();
    return () => { cancelAnimationFrame(raf); void ctx.close(); };
  }, [stream, enabled]);
  return on;
}
/** Simple synthesized tones (no audio files): a ringtone for incoming calls, ringback while calling out. */
function beeper(pattern: { f: number[]; on: number; off: number }) {
  let ctx: AudioContext | null = null; let stopped = false; let timer: ReturnType<typeof setTimeout>;
  try { ctx = new AudioContext(); } catch { return { stop() {} }; }
  const ring = () => {
    if (stopped || !ctx) return;
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(ctx.destination);
    const oscs = pattern.f.map(f => { const o = ctx!.createOscillator(); o.frequency.value = f; o.connect(g); o.start(); return o; });
    const t = ctx.currentTime; g.gain.exponentialRampToValueAtTime(0.08, t + 0.04); g.gain.setValueAtTime(0.08, t + pattern.on / 1000 - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + pattern.on / 1000);
    oscs.forEach(o => o.stop(t + pattern.on / 1000 + 0.02));
    timer = setTimeout(ring, pattern.on + pattern.off);
  };
  ring();
  return { stop() { stopped = true; clearTimeout(timer); void ctx?.close(); } };
}
const ringtone = () => beeper({ f: [660, 880], on: 900, off: 1100 });
const ringback = () => beeper({ f: [440, 480], on: 1200, off: 2800 });
