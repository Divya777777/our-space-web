import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatItem, fileUrl } from '../lib/chatStore';
import { EMOJI_CATS, GIPHY_KEY, Gif, gifs, recentEmoji, rememberEmoji, searchEmoji } from '../lib/emoji';
import { Icon } from './Icon';
import { Sheet, firstName } from './ui';

/* ───────── Emoji & GIF picker ───────── */
export function EmojiPicker({ onPick, onGif, onClose, inline }: { onPick: (e: string) => void; onGif?: (g: Gif) => void; onClose: () => void; /** Inside a sheet: no GIFs, no click-outside closing. */ inline?: boolean }) {
  const [tab, setTab] = useState<string>(() => (recentEmoji().length ? 'recent' : 'smileys'));
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const [gifList, setGifList] = useState<Gif[] | null>(null);
  const [gifErr, setGifErr] = useState('');
  useEffect(() => {
    if (inline) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.emoji-toggle')) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [onClose, inline]);
  useEffect(() => {
    if (tab !== 'gif') return;
    const ctl = new AbortController(); setGifErr('');
    const t = setTimeout(() => { gifs(q, ctl.signal).then(setGifList).catch(e => { if (!ctl.signal.aborted) setGifErr((e as Error).message); }); }, q ? 300 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [tab, q]);
  const pick = (e: string) => { rememberEmoji(e); onPick(e); };
  const list = q && tab !== 'gif' ? searchEmoji(q) : tab === 'recent' ? recentEmoji() : EMOJI_CATS.find(c => c.id === tab)?.list || [];
  return <div className={`emoji-pop${inline ? ' inline' : ''}`} ref={box} role="dialog" aria-label="Emoji and GIFs">
    <div className="emoji-search"><Icon name="search" size={15} /><input autoFocus={!inline} placeholder={tab === 'gif' ? 'Search GIFs' : 'Search emoji (love, lol, pizza…)'} value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="emoji-tabs" role="tablist">
      {recentEmoji().length > 0 && <button role="tab" aria-selected={tab === 'recent'} className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')} title="Recent"><Icon name="clock" size={16} /></button>}
      {EMOJI_CATS.map(c => <button key={c.id} role="tab" aria-selected={tab === c.id} className={tab === c.id ? 'on' : ''} onClick={() => setTab(c.id)} title={c.label}>{c.icon}</button>)}
      {GIPHY_KEY && onGif && <button role="tab" aria-selected={tab === 'gif'} className={`gif-tab ${tab === 'gif' ? 'on' : ''}`} onClick={() => setTab('gif')} title="GIFs">GIF</button>}
    </div>
    {tab === 'gif' ? <div className="gif-grid">
      {gifErr ? <p className="small muted" style={{ padding: 12 }}>{gifErr}</p> : !gifList ? <p className="small muted" style={{ padding: 12 }}>Loading GIFs…</p> : !gifList.length ? <p className="small muted" style={{ padding: 12 }}>No GIFs for that.</p>
        : gifList.map(g => <button key={g.id} className="gif-btn" onClick={() => onGif?.(g)} title={g.title}><img src={g.preview} alt={g.title} loading="lazy" /></button>)}
      <span className="tiny quiet gif-credit">Powered by GIPHY</span>
    </div> : <div className="emoji-grid">
      {list.length ? list.map(e => <button key={e} onClick={() => pick(e)} aria-label={e}>{e}</button>) : <p className="small muted" style={{ gridColumn: '1 / -1', padding: 12 }}>{q ? 'No emoji for that word.' : 'Nothing here yet.'}</p>}
    </div>}
  </div>;
}

/* ───────── Camera ───────── */
export function CameraSheet({ onShot, onClose }: { onShot: (f: File) => void; onClose: () => void }) {
  const v = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [err, setErr] = useState('');
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [cams, setCams] = useState(0);
  useEffect(() => {
    let s: MediaStream | null = null; let alive = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then(m => { if (!alive) { m.getTracks().forEach(t => t.stop()); return; } s = m; if (v.current) { v.current.srcObject = m; void v.current.play().catch(() => {}); } setErr(''); void navigator.mediaDevices.enumerateDevices().then(d => setCams(d.filter(x => x.kind === 'videoinput').length)); })
      .catch(() => setErr('Allow the camera for this site, then try again.'));
    return () => { alive = false; s?.getTracks().forEach(t => t.stop()); };
  }, [facing]);
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);
  const take = () => {
    const el = v.current; if (!el?.videoWidth) return;
    const c = document.createElement('canvas'); c.width = el.videoWidth; c.height = el.videoHeight;
    const g = c.getContext('2d')!; if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); } g.drawImage(el, 0, 0);
    c.toBlob(b => { if (b) setShot({ url: URL.createObjectURL(b), blob: b }); }, 'image/jpeg', 0.9);
  };
  const use = () => { if (!shot) return; const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); onShot(new File([shot.blob], `Photo ${stamp}.jpg`, { type: 'image/jpeg' })); onClose(); };
  return <Sheet title="Camera" sub={shot ? 'Add it to your message, or take another.' : 'Take a photo to send.'} onClose={onClose} wide>
    <div className="cam-box">
      {err ? <p className="muted" style={{ padding: 30, textAlign: 'center' }}>{err}</p> : shot ? <img src={shot.url} alt="Your photo" /> : <video ref={v} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : ''} />}
    </div>
    <div className="cam-actions">
      {shot ? <>
        <button className="btn ghost" onClick={() => setShot(null)}><Icon name="undo" size={16} />Retake</button>
        <button className="btn primary" onClick={use}><Icon name="check" size={16} />Use photo</button>
      </> : <>
        {cams > 1 ? <button className="cam-round" onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))} aria-label="Switch camera" title="Switch camera"><Icon name="swap" size={18} /></button> : <span style={{ width: 44 }} />}
        <button className="cam-shutter" onClick={take} disabled={!!err} aria-label="Take photo" />
        <span style={{ width: 44 }} />
      </>}
    </div>
  </Sheet>;
}

/* ───────── Voice messages ───────── */
export function pickAudioType() {
  // MP4/AAC first: iPhones can't play WebM voice notes. Chrome, Edge and Safari record MP4; Firefox falls back to WebM.
  const t = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
  return typeof MediaRecorder !== 'undefined' ? t.find(x => MediaRecorder.isTypeSupported?.(x)) || '' : '';
}
export function useVoiceRecorder(onDone: (f: File) => void, onError: (m: string) => void) {
  const [on, setOn] = useState(false);
  const [secs, setSecs] = useState(0);
  const [level, setLevel] = useState(0);
  type Rec = { mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; cancel: boolean; timer?: ReturnType<typeof setInterval>; ctx?: AudioContext; raf?: number; started: number };
  const rec = useRef<Rec | null>(null);
  const stopAll = () => { const r = rec.current; if (!r) return; clearInterval(r.timer); if (r.raf) cancelAnimationFrame(r.raf); void r.ctx?.close().catch(() => {}); r.stream.getTracks().forEach(t => t.stop()); };
  const start = async () => {
    if (rec.current) return;
    if (typeof MediaRecorder === 'undefined') { onError('This browser can’t record voice messages.'); return; }
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
    catch { onError('Allow the microphone for this site to send voice messages.'); return; }
    const type = pickAudioType();
    const mr = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
    const r: Rec = { mr, stream, chunks: [], cancel: false, started: Date.now() };
    r.timer = setInterval(() => { const s = Math.floor((Date.now() - r.started) / 1000); setSecs(s); if (s >= 300) stop(); }, 250);
    rec.current = r;
    try { // a live level meter so you can see it's hearing you
      const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 256; ctx.createMediaStreamSource(stream).connect(an); r.ctx = ctx;
      const buf = new Uint8Array(an.frequencyBinCount);
      const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const x of buf) m = Math.max(m, Math.abs(x - 128)); setLevel(m / 128); r.raf = requestAnimationFrame(tick); }; tick();
    } catch { /* no meter */ }
    mr.ondataavailable = e => { if (e.data.size) r.chunks.push(e.data); };
    mr.onstop = () => {
      stopAll(); rec.current = null; setOn(false); setSecs(0); setLevel(0);
      if (r.cancel || Date.now() - r.started < 700) return;
      const mime = (mr.mimeType || type || 'audio/webm').split(';')[0];
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      onDone(new File(r.chunks, `Voice message ${stamp}.${ext}`, { type: mime }));
    };
    mr.start(500); setOn(true); setSecs(0);
  };
  function stop() { const r = rec.current; if (r && r.mr.state !== 'inactive') r.mr.stop(); }
  const cancel = () => { const r = rec.current; if (!r) return; r.cancel = true; if (r.mr.state !== 'inactive') r.mr.stop(); else { stopAll(); rec.current = null; setOn(false); } };
  useEffect(() => () => { const r = rec.current; if (r) { r.cancel = true; try { r.mr.stop(); } catch { /* done */ } stopAll(); } }, []);
  return { on, secs, level, start, stop, cancel };
}
export const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const isVoice = (i: ChatItem) => !!i.file && i.file.mime.startsWith('audio/');

/** A voice message bubble: play / pause, a progress bar and the length. */
const RATES = [1, 1.5, 2, 0.75];
export function VoiceBubble({ url, mine }: { url: string; mine: boolean }) {
  const a = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0); const [d, setD] = useState(0);
  // Chrome's recordings don't say how long they are until the end is reached once: jump there quietly to find out.
  const probing = useRef(false);
  // Playback speed, like WhatsApp: tap to go 1× → 1.5× → 2× → 0.75×; your last choice is remembered.
  const [rate, setRate] = useState(() => { try { return Number(localStorage.getItem('ourspace.voiceRate')) || 1; } catch { return 1; } });
  useEffect(() => { if (a.current) a.current.playbackRate = rate; }, [rate, url]);
  const nextRate = () => { const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length]; setRate(r); try { localStorage.setItem('ourspace.voiceRate', String(r)); } catch { /* fine */ } };
  return <div className={`bubble voice ${mine ? 'me' : ''}`}>
    <audio ref={a} src={url || undefined} preload="metadata" onLoadedMetadata={e => { const el = e.currentTarget; if (Number.isFinite(el.duration)) setD(el.duration); else { probing.current = true; el.currentTime = 1e7; } }} onDurationChange={e => { const x = e.currentTarget.duration; if (Number.isFinite(x)) setD(x); }}
      onTimeUpdate={e => { const el = e.currentTarget; if (probing.current) { if (Number.isFinite(el.duration)) { probing.current = false; setD(el.duration); el.currentTime = 0; } return; } setT(el.currentTime); }} onPlay={e => { e.currentTarget.playbackRate = rate; setPlaying(true); }} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setT(0); }} />
    <button className="voice-play" onClick={() => { const el = a.current; if (!el) return; if (el.paused) void el.play(); else el.pause(); }} aria-label={playing ? 'Pause' : 'Play voice message'}><Icon name={playing ? 'pause' : 'play'} size={16} /></button>
    <input className="voice-bar" type="range" min={0} max={d || 1} step={0.05} value={t} onChange={e => { if (a.current) a.current.currentTime = Number(e.target.value); setT(Number(e.target.value)); }} aria-label="Position" style={{ '--p': `${d ? (t / d) * 100 : 0}%` } as React.CSSProperties} />
    <span className="tiny voice-time">{clockOf(playing || t ? t : d)}</span>
    <button className="voice-rate" onClick={nextRate} aria-label={`Playback speed ${rate}×, tap to change`} title="Playback speed">{rate}×</button>
  </div>;
}

/* ───────── Media & starred ───────── */
function Thumb({ item, onOpen }: { item: ChatItem; onOpen: (url: string, name: string) => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (item.file) void fileUrl(item.file.key).then(setUrl); }, [item.file]);
  return <button className="media-thumb" onClick={() => url && onOpen(url, item.file!.name)} aria-label={item.file?.name}>{url ? <img src={url} alt="" loading="lazy" /> : <span className="skeleton" />}</button>;
}
function FileRow({ item, names }: { item: ChatItem; names: (id: string) => string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (item.file) void fileUrl(item.file.key).then(setUrl); }, [item.file]);
  return <a className="media-file" href={url || undefined} download={item.file!.name}>
    <span className="media-file-ic"><Icon name={isVoice(item) ? 'mic' : 'file'} size={18} /></span>
    <span className="grow" style={{ minWidth: 0 }}><span className="small ellipsis" style={{ display: 'block', fontWeight: 600 }}>{item.file!.name}</span><span className="tiny muted">{names(item.from)} · {new Date(item.at).toLocaleDateString([], { day: 'numeric', month: 'short' })} · {(item.file!.size / 1e6).toFixed(1)} MB</span></span>
    <Icon name="download" size={16} />
  </a>;
}
export function MediaSheet({ items, names, onOpen, onClose }: { items: ChatItem[]; names: (id: string) => string; onOpen: (url: string, name: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'photos' | 'files' | 'voice'>('photos');
  const withFiles = items.filter(i => i.file && !i.deleted).slice().reverse();
  const groups = { photos: withFiles.filter(i => i.kind === 'image'), files: withFiles.filter(i => i.kind === 'file' && !isVoice(i)), voice: withFiles.filter(isVoice) };
  const list = groups[tab];
  return <Sheet title="Media" sub="Everything shared in this chat on this browser." onClose={onClose} wide>
    <div className="layout-seg" role="tablist" style={{ alignSelf: 'flex-start', marginBottom: 14 }}>
      {(['photos', 'files', 'voice'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'photos' ? 'Photos' : t === 'files' ? 'Files' : 'Voice'} · {groups[t].length}</button>)}
    </div>
    {!list.length ? <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>{tab === 'photos' ? 'No photos yet.' : tab === 'files' ? 'No files yet.' : 'No voice messages yet.'}</p>
      : tab === 'photos' ? <div className="media-grid">{list.map(i => <Thumb key={i.id} item={i} onOpen={onOpen} />)}</div>
        : <div className="col gap-8">{list.map(i => <FileRow key={i.id} item={i} names={names} />)}</div>}
  </Sheet>;
}
export function StarredSheet({ items, starred, names, onGo, onUnstar, onClose }: { items: ChatItem[]; starred: string[]; names: (id: string) => string; onGo: (id: string) => void; onUnstar: (id: string) => void; onClose: () => void }) {
  const set = useMemo(() => new Set(starred), [starred]);
  const list = items.filter(i => set.has(i.id) && !i.deleted).slice().reverse();
  return <Sheet title="Starred messages" sub="Only on this browser. Star a message from its ⋯ menu." onClose={onClose} wide>
    {!list.length ? <p className="muted" style={{ padding: '24px 0', textAlign: 'center' }}>Nothing starred yet. Hover a message, open ⋯ and choose Star.</p>
      : <div className="col gap-8">{list.map(i => <div key={i.id} className="starred-row">
        <button className="grow starred-go" onClick={() => { onClose(); setTimeout(() => onGo(i.id), 60); }}>
          <span className="tiny muted">{names(i.from)} · {new Date(i.at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
          <span className="small starred-text">{i.text || (i.kind === 'image' ? '📷 Photo' : isVoice(i) ? '🎤 Voice message' : `📎 ${i.file?.name || 'File'}`)}</span>
        </button>
        <button className="msg-act" onClick={() => onUnstar(i.id)} aria-label="Unstar" title="Unstar"><Icon name="x" size={14} /></button>
      </div>)}</div>}
  </Sheet>;
}
export const nameFor = (members: { id: string; name: string }[], me: string) => (id: string) => id === me ? 'You' : firstName(members.find(m => m.id === id)?.name || 'Someone');

/* ───────── Quick reactions (your own six) ───────── */
const QUICK_KEY = 'ourspace.quickReactions';
export const DEFAULT_QUICK = ['❤️', '😂', '😮', '😢', '🙏', '👍'];
export function loadQuick(): string[] { try { const v = JSON.parse(localStorage.getItem(QUICK_KEY) || 'null'); return Array.isArray(v) && v.length === 6 ? v : DEFAULT_QUICK; } catch { return DEFAULT_QUICK; } }
export function saveQuick(list: string[]) { try { localStorage.setItem(QUICK_KEY, JSON.stringify(list)); } catch { /* fine */ } }
/** React with any emoji, or change the six that show when you hover a message. */
export function ReactSheet({ quick, onQuick, onReact, onClose }: { quick: string[]; onQuick: (l: string[]) => void; onReact?: (e: string) => void; onClose: () => void }) {
  const [editing, setEditing] = useState(!onReact);
  const [slot, setSlot] = useState(0);
  const pick = (e: string) => {
    if (editing) { const next = [...quick]; const dup = next.indexOf(e); if (dup >= 0 && dup !== slot) next[dup] = next[slot]; next[slot] = e; onQuick(next); setSlot(x => (x + 1) % 6); return; }
    onReact?.(e); onClose();
  };
  return <Sheet title={editing ? 'Your quick reactions' : 'React'} sub={editing ? 'Tap a spot, then pick the emoji to put there.' : 'Pick any emoji.'} onClose={onClose}>
    <div className="quick-row">
      {quick.map((e, k) => <button key={k} className={`quick-slot ${editing && slot === k ? 'on' : ''}`} onClick={() => (editing ? setSlot(k) : pick(e))} aria-label={editing ? `Change ${e}` : `React ${e}`}>{e}</button>)}
      <span className="grow" />
      {onReact && <button className="btn ghost sm" onClick={() => setEditing(x => !x)}><Icon name={editing ? 'check' : 'pencil'} size={14} />{editing ? 'Done' : 'Change these'}</button>}
      {editing && <button className="btn ghost sm" onClick={() => { onQuick(DEFAULT_QUICK); setSlot(0); }}>Reset</button>}
    </div>
    <EmojiPicker inline onPick={pick} onClose={onClose} />
  </Sheet>;
}
