// Voice and video calls in the browser, using the same signalling as the phone app (call inbox + per-person
// signals, one RTCPeerConnection per other person, offers from the lower user ID, media state on a data channel).
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { blockedNow, isBlockedId } from '../lib/safety';
import { AudioDeviceSheet, canPickSpeaker, loadAudioChoice, saveAudioChoice, useAudioDevices } from './AudioDevices';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { usePip, useWantPip } from '../lib/pip';
import { useSpace } from '../lib/space';
import { actionableSignals } from '../lib/callProtocol';
import type { CallPeer, CallSignal } from '../lib/types';
import type { LiveCall } from '../lib/model';
import { Avatar, IconButton, firstName, useToast } from './ui';
import { Icon } from './Icon';

type Phase = 'idle' | 'incoming' | 'outgoing' | 'connecting' | 'connected' | 'reconnecting';
type Candidate = RTCIceCandidateInit;
type Description = RTCSessionDescriptionInit;
type ActiveCall = { id: string; code: string; video: boolean; title: string; starter: CallPeer; members: CallPeer[]; offer?: Description; mine: boolean };
type Peer = { id: string; name: string; pc: RTCPeerConnection; stream: MediaStream | null; channel: RTCDataChannel | null; sender: RTCRtpSender | null; state: 'connecting' | 'connected' | 'reconnecting'; cameraOff: boolean; muted: boolean; out: { ready: boolean; queue: Candidate[]; timer?: ReturnType<typeof setTimeout> } };
type PeerView = { id: string; name: string; stream: MediaStream | null; cameraOff: boolean; muted: boolean; state: Peer['state'] };
/** Messages for features riding on the call (Netflix / Prime watch party): sent to everyone on the call over the
 * peer-to-peer data channel. Phones ignore what they don't know. */
export type PartyMessage = { w: 'party' } & Record<string, unknown>;
type PartyListener = (msg: PartyMessage, from: { id: string; name: string }) => void;
type Controls = { activeCode?: string; activeId?: string; liveWith: number; phase: Phase; start: (code: string, members: CallPeer[], video: boolean, title: string) => void; open: () => void;
  /** Join a call that's already going on in the room (it rang before you were here). */ join: (code: string, live: LiveCall) => void;
  /** Everyone's video while connected (you first), for the faces grid in games. */ faces: Face[]; cameraOff: boolean; toggleCamera: () => void; video: boolean;
  /** A game is open with the faces grid: the small floating call pill steps aside. */ setInGame: (on: boolean) => void;
  /** Send to everyone connected on the call; returns how many received it. */ sendParty: (msg: PartyMessage) => number; onParty: (fn: PartyListener) => () => void;
  /** Collapse the call into the room (or picture-in-picture), e.g. while watching on another site. */ minimize: () => void;
  /** Float the call above other apps now (call from a click). Safari / older Firefox: the other person's video. */ floatCall: () => Promise<boolean>; canFloat: boolean;
  /** For the room header: the call's own controls live there, so no pop-up covers the page. */ muted: boolean; toggleMute: () => void; hangup: () => void; status: string;
  /** The room page showing the call's controls in its header (then the floating pill hides). */ setDocked: (code: string | null) => void };
const partyListeners = new Set<PartyListener>();
export type Face = { id: string; name: string; stream: MediaStream | null; cameraOff: boolean; muted: boolean; self?: boolean };
const CallContext = createContext<Controls>({ faces: [], cameraOff: true, toggleCamera: () => {}, video: false, setInGame: () => {}, liveWith: 0, phase: 'idle', start: () => {}, join: () => {}, open: () => {}, sendParty: () => 0, onParty: () => () => {}, minimize: () => {}, floatCall: async () => false, canFloat: false, muted: false, toggleMute: () => {}, hangup: () => {}, status: '', setDocked: () => {} });
export const useCall = () => useContext(CallContext);
/** Microphone settings. `exact` when the person just picked it (fail loudly); `ideal` at call start (fall back quietly). */
function micConstraints(id: string, exact: boolean): MediaTrackConstraints {
  return { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(id ? { deviceId: exact ? { exact: id } : { ideal: id } } : {}) };
}
const VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' };
/** Send the full picture: when the connection gets tight, lower the frame rate rather than the resolution. */
async function keepResolution(sender: RTCRtpSender | null | undefined) {
  if (!sender?.track || sender.track.kind !== 'video') return;
  try {
    sender.track.contentHint = 'motion';
    const params = sender.getParameters() as RTCRtpSendParameters & { degradationPreference?: string };
    if (!params.encodings?.length) return;
    // 'maintain-resolution' made the picture freeze then jump whenever the link wobbled (it drops whole frames
    // to keep every pixel). 'balanced' trades a little sharpness for steady motion, and 1.5 Mbps leaves headroom.
    params.encodings.forEach(e => { e.maxBitrate = 1_500_000; e.maxFramerate = 30; e.scaleResolutionDownBy = 1; e.priority = 'high'; e.networkPriority = 'high'; });
    params.degradationPreference = 'balanced';
    await sender.setParameters(params);
  } catch { /* the browser keeps its defaults */ }
}

export function CallProvider({ children }: React.PropsWithChildren) {
  const space = useSpace();
  const nav = useNavigate();
  const toast = useToast();
  const latest = useRef(space); useEffect(() => { latest.current = space; });
  const [phase, setPhase] = useState<Phase>('idle'); const phaseRef = useRef<Phase>('idle');
  const [call, setCall] = useState<ActiveCall | null>(null); const callRef = useRef<ActiveCall | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [local, setLocal] = useState<MediaStream | null>(null);
  const [peerList, setPeerList] = useState<PeerView[]>([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(true);
  // Which microphone / speaker calls use ('' = the computer's default, which follows a newly connected headset).
  const [audioChoice, setAudioChoice] = useState(loadAudioChoice);
  const [audioSheet, setAudioSheet] = useState(false);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const peers = useRef(new Map<string, Peer>());
  const pending = useRef(new Set<string>());
  const live = useRef(new Set<string>());
  const early = useRef(new Map<string, Candidate[]>());
  const helloed = useRef(new Set<string>());
  const stream = useRef<MediaStream | null>(null);
  const audioRef = useRef(audioChoice);
  const [micCheck, setMicCheck] = useState(0);
  const [micLabel, setMicLabel] = useState('');
  useEffect(() => { audioRef.current = audioChoice; }, [audioChoice]);
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
    if (previous && !wasRinging) void latest.current.callLive(previous.code, { callId: previous.id, leave: true });
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
  // While connected, tell the room "I'm in this call" so people who arrive later can see it and join.
  useEffect(() => {
    if (phase !== 'connected' && phase !== 'reconnecting') return;
    const c = callRef.current; if (!c) return;
    const beat = () => { void latest.current.callLive(c.code, { callId: c.id, video: c.video, title: c.title }); };
    beat(); const t = setInterval(beat, 15000);
    return () => clearInterval(t);
  }, [phase, call?.id]);
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
    ch.onmessage = e => { if (peer.channel !== ch) return; try { const s = JSON.parse(String(e.data)); if (s && s.w === 'party') { partyListeners.forEach(fn => { try { fn(s as PartyMessage, { id: peer.id, name: peer.name }); } catch { /* listener error */ } }); return; } if (typeof s.cameraOff === 'boolean') peer.cameraOff = s.cameraOff; if (typeof s.muted === 'boolean') peer.muted = s.muted; refresh(); } catch { /* ignore */ } };
  }
  async function prepare(target: ActiveCall) {
    if (!stream.current) {
      stopTone();
      let media: MediaStream;
      try { media = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(audioRef.current.mic, false), video: target.video ? VIDEO : false }); }
      catch { throw new Error(target.video ? 'Allow camera and microphone for this site (the icon in the address bar), then try again.' : 'Allow the microphone for this site (the icon in the address bar), then try again.'); }
      if (callRef.current !== target) { media.getTracks().forEach(t => t.stop()); return false; }
      stream.current = media; setLocal(media);
      media.getAudioTracks().forEach(t => t.addEventListener('ended', () => setMicCheck(n => n + 1)));
      mediaState.current = { muted: false, cameraOff: !target.video }; setCameraOff(!target.video);
    }
    if (!ice.current) ice.current = await latest.current.iceServers();
    return callRef.current === target;
  }
  /** Switch the call's microphone without reconnecting: the new mic replaces the old one for everyone. */
  async function switchMic(id: string) {
    const media = stream.current; if (!media) return;
    let fresh: MediaStream;
    try { fresh = await navigator.mediaDevices.getUserMedia({ audio: micConstraints(id, true) }); }
    catch { try { fresh = await navigator.mediaDevices.getUserMedia({ audio: micConstraints('', false) }); } catch { setError('Could not use that microphone.'); return; } }
    const track = fresh.getAudioTracks()[0]; if (!track || stream.current !== media) { fresh.getTracks().forEach(x => x.stop()); return; }
    track.enabled = !mediaState.current.muted;
    await Promise.all([...peers.current.values()].map(p => {
      const sender = p.pc.getTransceivers().find(x => x.sender.track?.kind === 'audio' || x.receiver.track?.kind === 'audio')?.sender;
      return sender?.replaceTrack(track).catch(() => {});
    }));
    media.getAudioTracks().forEach(old => { media.removeTrack(old); old.stop(); });
    media.addTrack(track);
    // A headset unplugged mid-call ends its track: notice and move to another microphone.
    track.addEventListener('ended', () => setMicCheck(n => n + 1));
    setMicLabel(track.label);
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
      // A slightly deeper jitter buffer (~150 ms) smooths out the freeze-and-jump on wobbly Wi-Fi.
      try { (e.receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget = 150; } catch { /* older browsers */ }
      if (!peer.stream) peer.stream = e.streams[0] || new MediaStream();
      if (!peer.stream.getTracks().some(t => t.id === e.track.id)) peer.stream.addTrack(e.track);
      refresh();
    };
    pc.onicecandidate = e => { if (e.candidate && peers.current.get(person.id) === peer) { peer.out.queue.push(e.candidate.toJSON()); if (!peer.out.timer) peer.out.timer = setTimeout(() => flush(peer), 120); } };
    pc.oniceconnectionstatechange = () => {
      if (peers.current.get(person.id) !== peer || callRef.current !== target) return;
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') { peer.state = 'connected'; pending.current.delete(person.id); shareMedia(); void keepResolution(peer.sender); }
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
    // Never ring someone you blocked; the rest of the room still gets the call.
    members = members.filter(m => !isBlockedId(blockedNow(), m.id));
    if (!members.length) { toast('You blocked this person, so you can’t call them. Unblock them under People to call again.', { tone: 'info' }); return; }
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
  /** Join a call that is already going on: say hello to everyone in it; each of them connects back (the lower ID
   *  sends the offer), exactly as when someone answers a group call late. */
  async function join(code: string, info: LiveCall) {
    if (callRef.current) { if (callRef.current.id === info.id) setExpanded(true); else toast('Hang up this call first to join the other one.', { tone: 'info' }); return; }
    const me = latest.current.user;
    const people = info.people.filter(p => p.id !== me.id && !isBlockedId(blockedNow(), p.id));
    if (!people.length) { toast('That call just ended.', { tone: 'info' }); return; }
    const target: ActiveCall = { code, id: info.id, video: info.video, title: info.title, members: people, starter: people[0], mine: false };
    live.current.clear(); helloed.current.clear();
    select(target); transition('connecting'); setExpanded(true); setError('');
    try {
      if (!(await prepare(target))) return;
      if (callRef.current !== target) return;
      for (const p of people) { helloed.current.add(p.id); void sendTo(p.id, 'hello', {}, target).catch(() => {}); }
      setTimeout(() => { if (callRef.current === target && !peers.current.size) finish(false, 'That call has ended.'); }, 20000);
    } catch (e) { if (callRef.current === target) finish(true, (e as Error).message || 'Could not join the call.'); }
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
      if (isBlockedId(blockedNow(), signal.from)) return; // blocked: never rings
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
  const pip = usePip();
  const devices = useAudioDevices(!!call);
  // Keep the call's microphone working when devices come and go (headset plugged in or removed mid-call):
  // - Automatic: follow the computer's default (a new headset takes over; removing it falls back).
  // - A picked mic that disappears or stops: use the default until it is back.
  const lastDefault = useRef('');
  const micIds = devices.mics.map(m => m.deviceId).join(',');
  useEffect(() => {
    const media = stream.current; if (!media) return;
    const track = media.getAudioTracks()[0];
    const usingId = track?.getSettings().deviceId || '';
    const chosen = audioRef.current.mic;
    const chosenHere = !!chosen && devices.mics.some(m => m.deviceId === chosen);
    const defaultChanged = !!lastDefault.current && !!devices.defaultMic && lastDefault.current !== devices.defaultMic;
    if (devices.defaultMic) lastDefault.current = devices.defaultMic;
    const dead = !track || track.readyState === 'ended' || track.muted && !devices.mics.some(m => m.deviceId === usingId) || (!!usingId && usingId !== 'default' && devices.mics.length > 0 && !devices.mics.some(m => m.deviceId === usingId));
    if (chosenHere && usingId !== chosen) { void switchMic(chosen); return; }
    if (dead || (!chosenHere && defaultChanged)) {
      void switchMic(chosenHere ? chosen : '');
      if (dead && chosen && !chosenHere) setError('That microphone was disconnected. Using the computer’s default for now.');
    }
    // switchMic only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.defaultMic, micIds, micCheck]);
  useEffect(() => { const t = local?.getAudioTracks()[0]; if (t) setMicLabel(t.label); }, [local]);
  // A picked speaker that is unplugged: play through the default until it is back.
  const speakerId = audioChoice.speaker && devices.speakers.some(d => d.deviceId === audioChoice.speaker) ? audioChoice.speaker : '';
  useWantPip('call', !!call);
  const inPip = !!pip.slots && !!call;
  const others = peerList.filter(p => p.state !== 'connecting' || p.stream);
  // Floating call (picture-in-picture, full-screen video): small = one big face (pinned, else whoever speaks),
  // expanded = everyone including you.
  const [floatBig, setFloatBig] = useState(false);
  const [docked, setDocked] = useState<string | null>(null);
  const [inGame, setInGame] = useState(false);
  // Full call view, 1:1 video: tap the small picture to make it the big one (yours or theirs).
  const [selfBig, setSelfBig] = useState(false);
  useEffect(() => { if (!call) setSelfBig(false); }, [call]);
  const [pinned, setPinned] = useState<string | null>(null);
  // Group calls: Auto picks a grid for up to 6 others and speaker view above that (or when someone is pinned).
  const [layout, setLayout] = useState<Layout>(() => { try { const v = localStorage.getItem('ourspace.callLayout'); return v === 'grid' || v === 'speaker' ? v : 'auto'; } catch { return 'auto'; } });
  const pickLayout = (v: Layout) => { setLayout(v); try { localStorage.setItem('ourspace.callLayout', v); } catch { /* fine */ } };
  useEffect(() => { if (!call) setPinned(null); }, [call]);
  const speaker = useActiveSpeaker(others);
  useEffect(() => { if (pinned && pinned !== SELF && !others.some(p => p.id === pinned)) setPinned(null); }, [pinned, others]);
  const [fsHost, setFsHost] = useState<Element | null>(null);
  useEffect(() => {
    const on = () => {
      const el = document.fullscreenElement;
      // YouTube's own full-screen button makes its iframe full screen, and nothing can be drawn over an iframe.
      // During a call, move full screen to the box around it instead, so the faces can float on top.
      if (el instanceof HTMLIFrameElement && callRef.current) {
        const box = el.closest('.screen') || el.parentElement;
        if (box) { void document.exitFullscreen().then(() => (box as HTMLElement).requestFullscreen()).catch(() => {}); return; }
      }
      setFsHost(el);
    };
    document.addEventListener('fullscreenchange', on); return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  // Browsers without the floating-window API (Safari, older Firefox) can still float a single video: we keep a
  // tiny copy of the other person's video ready, and float it on a click (Safari doesn't allow it any other way).
  const floatSrc = useRef<HTMLVideoElement>(null);
  const floatPeer = others.find(p => p.stream && !p.cameraOff && p.stream.getVideoTracks().length) || null;
  useEffect(() => { const v = floatSrc.current; if (v && floatPeer?.stream && v.srcObject !== floatPeer.stream) { v.srcObject = floatPeer.stream; void v.play().catch(() => {}); } }, [floatPeer?.stream]);
  const videoPip = typeof document !== 'undefined' && !!document.pictureInPictureEnabled;
  const canFloat = !!call && (pip.supported || (videoPip && !!floatPeer));
  const floatCall = async () => {
    if (!call) return false;
    if (pip.supported) { setExpanded(false); return pip.open(); }
    const v = floatSrc.current;
    if (!v || !floatPeer || !videoPip) return false;
    try { if (document.pictureInPictureElement !== v) await v.requestPictureInPicture(); return true; } catch { setError('Your browser didn’t open the floating video.'); return false; }
  };
  // Leaving the call closes the floating video too.
  useEffect(() => { if (!call && document.pictureInPictureElement === floatSrc.current) void document.exitPictureInPicture().catch(() => {}); }, [call]);
  const group = (call?.members.length || 0) > 1 || others.length > 1;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const status = phase === 'incoming' ? (group ? `${firstName(call?.starter.name || '')} is calling the room` : `Incoming ${call?.video ? 'video' : 'voice'} call`)
    : phase === 'outgoing' ? 'Ringing…' : phase === 'connecting' ? 'Connecting…' : phase === 'reconnecting' ? 'Reconnecting…' : group ? `${others.filter(p => p.state === 'connected').length + 1} in call · ${clock}` : clock;
  const controls = <>
    {connected && <IconButton size="lg" icon={muted ? 'micOff' : 'mic'} variant={muted ? 'on' : undefined} label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} />}
    {connected && call?.video && <IconButton size="lg" icon={cameraOff ? 'videoOff' : 'video'} variant={cameraOff ? 'on' : undefined} label={cameraOff ? 'Turn camera on' : 'Turn camera off'} disabled={busy} onClick={() => void toggleCamera()} />}
    {connected && <IconButton size="lg" icon="sliders" label="Audio: choose microphone and speaker" onClick={() => setAudioSheet(true)} />}
    {connected && call && <IconButton size="lg" icon="game" label="Play a game, the call continues" onClick={() => { setExpanded(false); nav(`/room/${call.code}?tab=play`); }} />}
    <IconButton size="lg" icon="hangup" variant="end" label={connected ? 'End call' : 'Cancel call'} onClick={() => finish()} />
  </>;

  const sendParty = (msg: PartyMessage) => { const text = JSON.stringify(msg); let n = 0; for (const p of peers.current.values()) if (p.channel?.readyState === 'open') { try { p.channel.send(text); n++; } catch { /* closing */ } } return n; };
  const onParty = (fn: PartyListener) => { partyListeners.add(fn); return () => { partyListeners.delete(fn); }; };
  return <CallContext.Provider value={{ faces: connected ? [{ id: SELF, name: space.user.name, stream: local, cameraOff, muted, self: true }, ...others.map(p => ({ id: p.id, name: p.name, stream: p.stream, cameraOff: p.cameraOff, muted: p.muted }))] : [], cameraOff, toggleCamera: () => { void toggleCamera(); }, video: !!call?.video, setInGame, activeCode: call?.code, activeId: call?.id, join: (c, l) => { void join(c, l); }, phase, liveWith: connected ? peerList.filter(p => p.state === 'connected').length : 0, start: (c, m, v, t) => { void start(c, m, v, t); }, open: () => setExpanded(true), sendParty, onParty, minimize: () => setExpanded(false), floatCall, canFloat, muted, toggleMute, hangup: () => finish(), status, setDocked }}>
    {call && <video ref={floatSrc} className="float-src" muted playsInline autoPlay aria-hidden="true" />}
    {children}
    {peerList.map(p => <RemoteAudio key={p.id} stream={p.stream} sinkId={speakerId} />)}
    {audioSheet && call && <AudioDeviceSheet devices={devices} inUse={micLabel} choice={audioChoice} onClose={() => setAudioSheet(false)} onChange={next => {
      const micChanged = next.mic !== audioChoice.mic;
      setAudioChoice(next); saveAudioChoice(next);
      if (micChanged) void switchMic(next.mic);
    }} />}
    {!call && error && <div className="toasts" style={{ bottom: 96 }}><div className="toast">{error}<button onClick={() => setError('')}>OK</button></div></div>}
    {call && phase === 'incoming' && <div className="scrim" style={{ zIndex: 95 }}>
      <div className="sheet col gap-20" role="alertdialog" aria-label={status} style={{ padding: 32, alignItems: 'center', textAlign: 'center', width: 'min(380px, 100%)' }}>
        <div className="ring"><Avatar name={call.starter.name} size={96} /></div>
        <div><h2 className="title">{call.title}</h2><p className="muted">{status}</p></div>
        <div className="row gap-24"><div className="col gap-8" style={{ alignItems: 'center' }}><IconButton size="lg" icon="hangup" variant="end" label="Decline" onClick={() => finish(true)} /><span className="small muted">Decline</span></div>
          <div className="col gap-8" style={{ alignItems: 'center' }}><IconButton size="lg" icon={call.video ? 'video' : 'phone'} variant="mint" label="Answer" onClick={() => void accept()} /><span className="small muted">Answer</span></div></div>
      </div>
    </div>}
    {call && phase !== 'incoming' && expanded && !inPip && <div className="call-layer" role="dialog" aria-label={`Call · ${call.title}`}>
      <div className="call-top">
        <IconButton icon="down" label="Back to the room, the call continues" onClick={() => setExpanded(false)} />
        {!pip.supported && canFloat && <IconButton icon="pip" label="Float the call over other apps" onClick={() => void floatCall()} />}
        <div className="grow"><p className="h3">{group ? call.title : others[0]?.name || call.title}</p><p className="small muted">{!group && others[0]?.muted && connected ? 'Muted · ' : ''}{status}</p></div>
        {error && <span className="small rose">{error}</span>}
        {connected && others.length >= 2 && <div className="layout-seg" role="group" aria-label="Layout">
          {(['auto', 'grid', 'speaker'] as Layout[]).map(v => <button key={v} className={layout === v ? 'on' : ''} aria-pressed={layout === v} onClick={() => pickLayout(v)}>{v === 'auto' ? 'Auto' : v === 'grid' ? 'Grid' : 'Speaker'}</button>)}
        </div>}
      </div>
      {(() => {
        const swap = selfBig && !!local && !cameraOff && connected && others.length === 1;
        const me = <><VideoEl stream={local!} muted /><span className="name">You{muted && <Icon name="micOff" size={13} />}</span></>;
        return <>
          {swap ? <div className="call-stage" style={{ gridTemplateColumns: 'minmax(0, min(1100px, 100%))' }}><div className="tile self-big">{me}</div></div>
            : <Stage others={others} connected={connected} video={call.video} title={call.title} status={status} ringing={call.members} layout={layout} pinned={pinned === SELF ? null : pinned} onPin={setPinned} speaker={speaker} />}
          {swap ? <button className="tile self-tile swap" onClick={() => setSelfBig(false)} aria-label={`Make ${firstName(others[0].name)} big`} title="Make this the big picture"><PeerTile p={others[0]} video={call.video} /></button>
            : local && !cameraOff && <button className="tile self-tile swap" onClick={() => { if (connected && others.length === 1) setSelfBig(true); }} aria-label="Make your picture big" title={others.length === 1 ? 'Make this the big picture' : undefined}>{me}</button>}
        </>;
      })()}
      <div className="call-controls"><div className="glass">{controls}</div></div>
    </div>}
    {call && phase !== 'incoming' && !expanded && !inPip && !inGame && (call.video || docked !== call.code) && <MiniCall others={others} spotId={pinned && pinned !== SELF ? pinned : speaker} onPin={setPinned} self={local && !cameraOff ? local : null} status={status} title={group ? call.title : others[0]?.name || call.title} onOpen={() => setExpanded(true)} controls={<>
      {connected && <IconButton size="sm" icon={muted ? 'micOff' : 'mic'} variant={muted ? 'on' : undefined} label={muted ? 'Unmute' : 'Mute'} onClick={toggleMute} />}
      {!pip.supported && canFloat && <IconButton size="sm" icon="pip" label="Float the call over other apps" onClick={() => void floatCall()} />}
      <IconButton size="sm" icon="hangup" variant="end" label="End call" onClick={() => finish()} />
    </>} />}
    {inPip && call && createPortal(phase === 'incoming' ? <div className="pip-callview"><div className="pip-ring">
        <Avatar name={call.starter.name} size={56} />
        <div style={{ textAlign: 'center' }}><p className="h3 ellipsis">{call.title}</p><p className="tiny muted">{status}</p></div>
        <div className="row gap-16"><IconButton icon="hangup" variant="end" label="Decline" onClick={() => finish(true)} /><IconButton icon={call.video ? 'video' : 'phone'} variant="mint" label="Answer" onClick={() => void accept()} /></div>
      </div></div>
      : <CallFloat others={others.length ? others : call.members.map(m => ({ id: m.id, name: m.name, stream: null, cameraOff: true, muted: false, state: 'connecting' as const }))} video={call.video} local={local} cameraOff={cameraOff} muted={muted} status={status} big={floatBig} onBig={setFloatBig}
          pinned={pinned} onPin={setPinned} speaker={speaker} connected={connected} busy={busy} onMute={toggleMute} onCamera={() => void toggleCamera()} onEnd={() => finish()} />, pip.slots!.call)}
    {/* Full-screen video in this tab (the room's YouTube player): the call floats inside it. */}
    {fsHost && call && connected && !inPip && createPortal(<div className={`fs-call ${floatBig ? 'big' : ''}`}>
      <CallFloat others={others} video={call.video} local={local} cameraOff={cameraOff} muted={muted} status={status} big={floatBig} onBig={setFloatBig}
        pinned={pinned} onPin={setPinned} speaker={speaker} connected={connected} busy={busy} onMute={toggleMute} onCamera={() => void toggleCamera()} onEnd={() => finish()} />
    </div>, fsHost)}
  </CallContext.Provider>;
}

type Layout = 'auto' | 'grid' | 'speaker';
/** Pin value meaning "my own picture" (picture-in-picture lets you make yourself the big one). */
const SELF = '__self';
/** Live games on a call: everyone's face in a grid above the game, with mute / camera / hang up, so it feels like
 *  playing together in one room instead of the call hiding in a corner. */
export function GameFaces() {
  const c = useContext(CallContext);
  const { setInGame } = c; const on = c.faces.length > 1;
  useEffect(() => { if (!on) return; setInGame(true); return () => setInGame(false); }, [on, setInGame]);
  if (!on) return null;
  const n = c.faces.length;
  return <div className={`game-faces n${Math.min(n, 6)}`} role="group" aria-label="Everyone on the call">
    <div className="game-faces-grid">{c.faces.map(f => <GameFace key={f.id} f={f} />)}</div>
    <div className="game-faces-bar">
      <span className="tiny muted row gap-4"><span className="live-dot" />{c.status}</span>
      <span className="grow" />
      <IconButton size="sm" icon={c.muted ? 'micOff' : 'mic'} variant={c.muted ? 'on' : undefined} label={c.muted ? 'Unmute' : 'Mute'} onClick={c.toggleMute} />
      {c.video && <IconButton size="sm" icon={c.cameraOff ? 'videoOff' : 'video'} variant={c.cameraOff ? 'on' : undefined} label={c.cameraOff ? 'Turn camera on' : 'Turn camera off'} onClick={c.toggleCamera} />}
      <IconButton size="sm" icon="hangup" variant="end" label="End call" onClick={c.hangup} />
    </div>
  </div>;
}
function GameFace({ f }: { f: Face }) {
  const show = !!f.stream && !f.cameraOff && f.stream.getVideoTracks().length > 0;
  const speaking = useSpeaking(f.self ? null : f.stream, !f.muted);
  return <div className={`game-face ${speaking ? 'speaking' : ''} ${f.self ? 'self' : ''}`}>
    {show ? <VideoEl stream={f.stream!} muted /> : <span className="center" style={{ position: 'absolute', inset: 0 }}><Avatar name={f.name} size={44} /></span>}
    <span className="game-face-name">{f.self ? 'You' : firstName(f.name)}{f.muted && <Icon name="micOff" size={12} />}</span>
  </div>;
}
export function Stage({ others, connected, video, title, status, ringing, layout = 'auto', pinned = null, onPin, speaker = null }: { others: PeerView[]; connected: boolean; video: boolean; title: string; status: string; ringing: CallPeer[]; layout?: Layout; pinned?: string | null; onPin?: (id: string | null) => void; speaker?: string | null }) {
  if (!connected || !others.length) return <div className="call-stage"><div className="col gap-16" style={{ alignItems: 'center' }}>
    <div className="stack ring">{(others.length ? others : ringing).slice(0, 4).map(p => <Avatar key={p.id} name={p.name} size={104} />)}</div>
    <p className="title">{title}</p><p className="muted">{status}</p></div></div>;
  const n = others.length;
  // Two people: exactly as before. Groups: grid up to 6 others, speaker view above that or when someone is pinned.
  const pin = n >= 2 && onPin ? (id: string) => onPin(pinned === id ? null : id) : undefined;
  const speakerView = n >= 2 && (layout === 'speaker' || (layout === 'auto' && (n > 6 || !!pinned)));
  if (speakerView) {
    const spot = others.find(p => p.id === pinned) || others.find(p => p.id === speaker) || others[0];
    const rest = others.filter(p => p !== spot);
    return <div className="call-stage speaker-view">
      <div className="spot"><PeerTile p={spot} video={video} pinned={pinned === spot.id} onPin={pin ? () => pin(spot.id) : undefined} /></div>
      <div className="call-strip" aria-label="Everyone else · click to make big">
        {rest.map(p => <button key={p.id} className="strip-btn" onClick={() => onPin?.(p.id)} aria-label={`Make ${firstName(p.name)} big`} title="Make this the big picture"><PeerTile p={p} video={video} /></button>)}
      </div>
    </div>;
  }
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
  const ordered = pinned ? [...others.filter(p => p.id === pinned), ...others.filter(p => p.id !== pinned)] : others;
  return <div className="call-stage" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, ${n === 1 ? 'min(1100px, 100%)' : '520px'}))` }}>
    {ordered.map(p => <PeerTile key={p.id} p={p} video={video} pinned={pinned === p.id} onPin={pin ? () => pin(p.id) : undefined} />)}
  </div>;
}
function PeerTile({ p, video, pinned, onPin }: { p: PeerView; video: boolean; pinned?: boolean; onPin?: () => void }) {
  const speaking = useSpeaking(p.stream, !p.muted);
  const showVideo = video && p.stream && !p.cameraOff && p.stream.getVideoTracks().length > 0;
  return <div className={`tile ${speaking ? 'speaking' : ''}`}>
    {showVideo ? <VideoEl stream={p.stream!} muted remote /> : <div className="col gap-8" style={{ alignItems: 'center' }}><Avatar name={p.name} size={92} /><span className="small muted">{p.state === 'connected' ? (video ? 'Camera off' : 'On the call') : 'Connecting…'}</span></div>}
    <span className="name">{p.muted && <Icon name="micOff" size={13} />}{firstName(p.name)}</span>
    {onPin && <button className={`float-pin tile-pin ${pinned ? 'on' : ''}`} onClick={onPin} aria-label={pinned ? `Unpin ${firstName(p.name)}` : `Pin ${firstName(p.name)} as the big picture`} title={pinned ? 'Unpin' : 'Pin as the big picture'}><Icon name="star" size={14} fill={pinned} /></button>}
  </div>;
}
/** Away from the call's room: a small pill you can drag anywhere (it remembers where you put it). */
function MiniCall({ others, spotId, onPin, self, status, title, onOpen, controls }: { others: PeerView[]; spotId?: string | null; onPin?: (id: string | null) => void; self: MediaStream | null; status: string; title: string; onOpen: () => void; controls: React.ReactNode }) {
  const hasVideo = (p: PeerView) => !!p.stream && !p.cameraOff && p.stream.getVideoTracks().length > 0;
  // The big picture follows whoever is talking (or the face you tapped); with 2 people it's simply the other person.
  const first = others.find(p => p.id === spotId && hasVideo(p)) || others.find(hasVideo);
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => { try { return JSON.parse(localStorage.getItem('ourspace.callPill') || 'null'); } catch { return null; } });
  // Drag from anywhere on the pill (its buttons too): it only counts as a drag after moving 6 px, so a plain tap
  // still mutes / opens / hangs up, and the click that ends a drag is swallowed.
  const drag = useRef<{ x0: number; y0: number; dx: number; dy: number; moved: boolean; id: number } | null>(null);
  const justDragged = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const clamp = (x: number, y: number) => { const el = box.current; const w = el?.offsetWidth || 260, h = el?.offsetHeight || 60; return { x: Math.max(8, Math.min(window.innerWidth - w - 8, x)), y: Math.max(8, Math.min(window.innerHeight - h - 8, y)) }; };
  useEffect(() => { const fit = () => setPos(p => (p ? clamp(p.x, p.y) : p)); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit); }, []);
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const r = box.current!.getBoundingClientRect();
    drag.current = { x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false, id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    if (!d.moved) { if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return; d.moved = true; try { box.current?.setPointerCapture(e.pointerId); } catch { /* fine */ } }
    e.preventDefault();
    const next = clamp(e.clientX - d.dx, e.clientY - d.dy); last.current = next; setPos(next);
  };
  const onUp = () => {
    const d = drag.current; drag.current = null; if (!d?.moved) return;
    justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 0);
    if (last.current) { try { localStorage.setItem('ourspace.callPill', JSON.stringify(last.current)); } catch { /* fine */ } }
  };
  const onClickCapture = (e: React.MouseEvent) => { if (justDragged.current) { e.stopPropagation(); e.preventDefault(); } };
  return <div ref={box} className={`call-pill glass ${pos ? 'moved' : ''}`} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onClickCapture={onClickCapture}
    style={{ ...(first ? { flexDirection: 'column', alignItems: 'stretch', borderRadius: 24, padding: 8, width: 240 } : {}), ...(pos ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' } : {}) }}>
    <span className="pill-grip" aria-hidden="true" title="Drag to move" />
    {first && <button className="tile" style={{ aspectRatio: '16 / 10', borderRadius: 18 }} onClick={onOpen} aria-label="Open the call"><VideoEl stream={first.stream!} muted remote />{self && <span className="pill-self"><VideoEl stream={self} muted /></span>}</button>}
    {others.length >= 2 && <div className="pill-faces" aria-label="Everyone on the call · tap a face to make it big">
      {others.slice(0, 6).map(p => <PillFace key={p.id} p={p} big={first?.id === p.id} onPick={() => onPin?.(p.id)} />)}
      {others.length > 6 && <span className="pill-more">+{others.length - 6}</span>}
    </div>}
    <div className="row gap-8" style={first ? { padding: '4px 4px 0 8px' } : undefined}>
      <button className="grow row gap-8" onClick={onOpen} style={{ textAlign: 'left', minWidth: 0 }}><span className="live-dot" /><span className="col gap-4" style={{ minWidth: 0 }}><span className="small ellipsis" style={{ fontWeight: 600 }}>{title}</span><span className="tiny muted">{status}</span></span></button>
      {controls}
    </div>
  </div>;
}
function PillFace({ p, big, onPick }: { p: PeerView; big: boolean; onPick: () => void }) {
  const speaking = useSpeaking(p.stream, !p.muted);
  return <button className={`pill-face ${speaking ? 'speaking' : ''} ${big ? 'big' : ''}`} onClick={onPick} aria-label={`Make ${firstName(p.name)} big`} title={firstName(p.name)}><Avatar name={p.name} size={30} /></button>;
}
function VideoEl({ stream, muted, remote }: { stream: MediaStream; muted?: boolean; remote?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) { ref.current.srcObject = stream; void ref.current.play().catch(() => {}); } }, [stream]);
  // Safari: the other person's video floats by itself when you leave the tab.
  return <video ref={ref} autoPlay playsInline muted={muted} data-remote={remote ? '' : undefined} {...(remote ? { autopictureinpicture: '' } : {})} />;
}
/** The floating call: one big face (pinned, or whoever is speaking) or everyone. Used in picture-in-picture and over full-screen video. */
export function CallFloat({ others, video, local, cameraOff, muted, status, big, onBig, pinned, onPin, speaker, connected, busy, onMute, onCamera, onEnd }: {
  others: PeerView[]; video: boolean; local: MediaStream | null; cameraOff: boolean; muted: boolean; status: string; big: boolean; onBig: (v: boolean) => void;
  pinned: string | null; onPin: (id: string | null) => void; speaker: string | null; connected: boolean; busy: boolean; onMute: () => void; onCamera: () => void; onEnd: () => void;
}) {
  const hasSelf = !!local && !cameraOff;
  const selfBig = pinned === SELF && hasSelf;
  const spot = selfBig ? null : others.find(p => p.id === pinned) || others.find(p => p.id === speaker) || others[0];
  const selfTile = (onClick?: () => void) => hasSelf ? <div className={`float-tile self ${onClick ? 'pick' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={onClick ? 'Make your picture big' : undefined} onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}><VideoEl stream={local!} muted /><span className="name">You{muted && <Icon name="micOff" size={11} />}</span></div> : null;
  // "Everyone": one big picture you choose (tap any small one to swap it in, yourself included) and the rest small.
  const smalls = big ? [...others.filter(p => p !== spot)] : [];
  return <div className={`call-float ${big ? 'big focus' : 'small'}`}>
    <div className="float-stage">
      {selfBig ? selfTile() : spot ? <FloatTile p={spot} video={video} pinned={pinned === spot.id} speaking={speaker === spot.id} /> : null}
    </div>
    {big && (smalls.length > 0 || hasSelf) && <div className="float-strip" aria-label="Tap a picture to make it big">
      {smalls.map(p => <FloatTile key={p.id} p={p} video={video} pinned={false} speaking={speaker === p.id} onPick={() => onPin(p.id)} />)}
      {!selfBig && selfTile(() => onPin(SELF))}
      {selfBig && others.map(p => <FloatTile key={p.id} p={p} video={video} pinned={false} speaking={speaker === p.id} onPick={() => onPin(p.id)} />)}
    </div>}
    <div className="float-bar">
      <span className="grow tiny ellipsis"><span className="live-dot" /> {status}</span>
      {connected && <IconButton size="sm" icon={muted ? 'micOff' : 'mic'} variant={muted ? 'on' : undefined} label={muted ? 'Unmute' : 'Mute'} onClick={onMute} />}
      {connected && video && <IconButton size="sm" icon={cameraOff ? 'videoOff' : 'video'} variant={cameraOff ? 'on' : undefined} label={cameraOff ? 'Turn camera on' : 'Turn camera off'} disabled={busy} onClick={onCamera} />}
      <IconButton size="sm" icon={big ? 'down' : 'users'} label={big ? 'Show only the big picture' : 'Show everyone and choose who is big'} onClick={() => onBig(!big)} />
      <IconButton size="sm" icon="hangup" variant="end" label="End call" onClick={onEnd} />
    </div>
  </div>;
}
function FloatTile({ p, video, pinned, speaking, onPin, onPick }: { p: PeerView; video: boolean; pinned: boolean; speaking: boolean; onPin?: () => void; onPick?: () => void }) {
  const showVideo = video && p.stream && !p.cameraOff && p.stream.getVideoTracks().length > 0;
  return <div className={`float-tile ${speaking ? 'speaking' : ''} ${onPick ? 'pick' : ''}`} onClick={onPick} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} aria-label={onPick ? `Make ${firstName(p.name)} big` : undefined} onKeyDown={onPick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } } : undefined}>
    {/* A soft, blurred copy fills the sides when a phone's tall picture sits in a wide window (nothing is cropped). */}
    {showVideo && <div className="float-fill" aria-hidden="true"><VideoEl stream={p.stream!} muted /></div>}
    {showVideo ? <VideoEl stream={p.stream!} muted /> : <Avatar name={p.name} size={52} />}
    <span className="name">{p.muted && <Icon name="micOff" size={11} />}{firstName(p.name)}{pinned && ' · pinned'}</span>
    {onPin && <button className={`float-pin ${pinned ? 'on' : ''}`} onClick={onPin} aria-label={pinned ? `Unpin ${firstName(p.name)}` : `Pin ${firstName(p.name)} as the big face`}><Icon name="star" size={13} fill={pinned} /></button>}
  </div>;
}
/** Who is talking right now (loudest voice), held briefly so the big face doesn't flicker. Timers, not animation
 * frames, so it keeps working while the tab is in the background (picture-in-picture). */
function useActiveSpeaker(peers: PeerView[]) {
  const [id, setId] = useState<string | null>(null);
  const key = peers.map(p => `${p.id}:${p.stream?.id || ''}`).join(',');
  useEffect(() => {
    const list = peers.filter(p => p.stream && p.stream.getAudioTracks().length);
    if (list.length < 2) { setId(list[0]?.id ?? null); return; }
    let ctx: AudioContext; try { ctx = new AudioContext(); } catch { return; }
    const meters = list.map(p => { const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(p.stream!).connect(an); return { id: p.id, an, buf: new Uint8Array(512) }; });
    let current: string | null = null; let since = 0;
    const t = setInterval(() => {
      let best: string | null = null; let bestLevel = 0.04;
      for (const m of meters) { m.an.getByteTimeDomainData(m.buf); let sum = 0; for (const v of m.buf) { const d = (v - 128) / 128; sum += d * d; } const level = Math.sqrt(sum / m.buf.length); if (level > bestLevel) { bestLevel = level; best = m.id; } }
      const now = Date.now();
      if (best && best !== current && now - since > 1500) { current = best; since = now; setId(best); }
    }, 250);
    return () => { clearInterval(t); void ctx.close(); };
    // Re-wire only when the people or their streams change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return id;
}
/** Remote voices play through hidden audio elements so they keep going when the call window is minimised. */
function RemoteAudio({ stream, sinkId }: { stream: MediaStream | null; sinkId: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { if (ref.current && stream && ref.current.srcObject !== stream) { ref.current.srcObject = stream; void ref.current.play().catch(() => {}); } }, [stream]);
  // The chosen speaker ('' = the computer's default). Only some browsers can choose (Chrome, Edge).
  useEffect(() => { const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null; if (el?.setSinkId && canPickSpeaker) void el.setSinkId(sinkId).catch(() => {}); }, [sinkId]);
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
