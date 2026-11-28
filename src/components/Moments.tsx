// Moments on the website: the pile in the corner of Home (like Instagram's Instants), the faces row, the full-screen
// viewer (← → to move, Space to pause, Esc to close) with reactions and comments, and the webcam "snap" with filters.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSpace } from '../lib/space';
import type { Moment, MomentComment, MomentMeta, MomentsApi } from '../lib/moments';
import { FILTERS, applyFilter, filterById, resize, type FilterId, type Img } from '../lib/momentFilters';
import { Avatar, Button, IconButton, ago, firstName, useConfirm, useToast } from './ui';
import { Icon } from './Icon';
import { loadQuick } from './ChatExtras';
import './moments.css';

const SHOW_MS = 7000;
const MOODS = ['😊', '😴', '🥳', '😤', '🥰', '🤓'];
const timeLabel = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const leftLabel = (expiresAt: number) => { const h = Math.max(0, Math.round((expiresAt - Date.now()) / 3600000)); return h < 1 ? 'less than an hour' : `${h} h`; };

/** Newest first, but the ones you haven't seen come before the ones you have. */
export function viewingOrder(list: Moment[], me: string) {
  const fresh = list.filter(m => !m.seen && m.from.id !== me);
  const rest = list.filter(m => m.seen || m.from.id === me);
  return [...fresh, ...rest];
}

/* ───────── Pile (Home corner) ───────── */
export function MomentsPile({ moments, onOpen }: { moments: MomentsApi; onOpen: (id: string) => void }) {
  const order = viewingOrder(moments.list, moments.myId);
  const unseen = moments.list.filter(m => !m.seen && m.from.id !== moments.myId).length;
  if (!order.length) return null;
  const top = order.slice(0, 3).reverse();
  return <aside className="mo-pile" aria-label="Moments">
    <button className="mo-pile-stack" onClick={() => onOpen(order[0].id)} aria-label={unseen ? `Open ${unseen} new moments` : 'Open moments'}>
      {top.map((m, i) => <span key={m.id} className={`mo-pile-card c${top.length - 1 - i}`}>
        {m.thumbUrl ? <img src={m.thumbUrl} alt="" /> : <span className="mo-locked"><Icon name="lock" size={16} /></span>}
        {i === top.length - 1 && <span className="mo-pile-face"><Avatar name={m.from.name} size={24} ring={!m.seen ? 'var(--lav)' : undefined} /></span>}
      </span>)}
      {unseen > 0 && <span className="mo-pile-badge">{unseen}</span>}
    </button>
    <span className="small muted">{unseen ? `Moments · ${unseen} new` : 'Moments'}</span>
  </aside>;
}

/* ───────── Faces row (Home top) ───────── */
export function MomentsFaces({ moments, onOpen, onSnap }: { moments: MomentsApi; onOpen: (id: string) => void; onSnap: () => void }) {
  // One face per person: their newest moment; a lavender ring while any of theirs is unseen.
  const people = useMemo(() => {
    const map = new Map<string, { id: string; name: string; first: string; unseen: boolean; thumb: string | null }>();
    for (const m of viewingOrder(moments.list, moments.myId)) {
      if (m.from.id === moments.myId) continue;
      const p = map.get(m.from.id);
      if (!p) map.set(m.from.id, { id: m.from.id, name: m.from.name, first: m.id, unseen: !m.seen, thumb: m.thumbUrl });
      else if (!m.seen) p.unseen = true;
    }
    return [...map.values()];
  }, [moments.list, moments.myId]);
  const mine = moments.list.find(m => m.from.id === moments.myId);
  return <div className="mo-faces" role="list" aria-label="Moments from your people">
    <button role="listitem" className="mo-face" onClick={mine ? () => onOpen(mine.id) : onSnap} aria-label={mine ? 'Your moment' : 'Share a moment'}>
      <span className={`mo-face-ring ${mine ? 'seen' : 'add'}`}>{mine?.thumbUrl ? <img src={mine.thumbUrl} alt="" /> : <Icon name="plus" size={22} stroke={2.2} />}</span>
      <span className="small muted">{mine ? 'Yours' : 'Share'}</span>
    </button>
    {people.map(p => <button key={p.id} role="listitem" className="mo-face" onClick={() => onOpen(p.first)} aria-label={`${p.name}'s moment${p.unseen ? ', new' : ''}`}>
      <span className={`mo-face-ring ${p.unseen ? 'new' : 'seen'}`}>{p.thumb ? <img src={p.thumb} alt="" /> : <Avatar name={p.name} size={54} />}</span>
      <span className="small muted ellipsis" style={{ maxWidth: 72 }}>{firstName(p.name)}</span>
    </button>)}
  </div>;
}

/* ───────── Viewer ───────── */
export function MomentViewer({ moments, startId, onClose, onSnapBack }: { moments: MomentsApi; startId: string; onClose: () => void; onSnapBack: () => void }) {
  const order = useMemo(() => viewingOrder(moments.list, moments.myId), [moments.list, moments.myId]);
  // The list can change while open (a new moment arrives): follow the moment by id, not by position.
  const [id, setId] = useState(startId);
  const index = Math.max(0, order.findIndex(m => m.id === id));
  const m = order[index];
  const [paused, setPaused] = useState(false);
  const [panel, setPanel] = useState(false);
  const [progress, setProgress] = useState(0);
  const [full, setFull] = useState<Record<string, { meta: MomentMeta; url: string } | null>>({});
  const urls = useRef<string[]>([]);
  const confirm = useConfirm();
  const toast = useToast();
  const nav = useNavigate();
  const mine = m?.from.id === moments.myId;

  useEffect(() => () => { urls.current.forEach(u => URL.revokeObjectURL(u)); }, []);
  const go = useCallback((delta: number) => {
    const next = order[index + delta];
    if (!next) { if (delta > 0) onClose(); return; }
    setId(next.id); setProgress(0);
  }, [order, index, onClose]);
  // Load the full photo (and the next one, so moving on is instant); mark as seen.
  useEffect(() => {
    if (!m) return;
    if (!m.seen && !mine) moments.markSeen(m.id);
    for (const x of [m, order[index + 1]].filter(Boolean) as Moment[]) {
      if (x.id in full) continue;
      setFull(f => ({ ...f, [x.id]: f[x.id] ?? null }));
      void moments.photo(x).then(p => { if (p) urls.current.push(p.url); setFull(f => ({ ...f, [x.id]: p })); }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id]);
  // Auto-advance (paused while holding, typing a comment, or the photo is still loading).
  const loaded = !!(m && full[m.id]);
  useEffect(() => {
    if (!m || paused || panel || !loaded) return;
    const started = Date.now() - progress * SHOW_MS;
    const t = setInterval(() => { const p = (Date.now() - started) / SHOW_MS; if (p >= 1) { clearInterval(t); go(1); } else setProgress(p); }, 80);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.id, paused, panel, loaded]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') { if (e.key === 'Escape') setPanel(false); return; }
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') { e.preventDefault(); setPaused(p => !p); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [go, onClose]);
  useEffect(() => { if (!m) onClose(); }, [m, onClose]);
  if (!m) return null;
  const photo = full[m.id];
  const meta = photo?.meta;
  const myReaction = m.reactions.find(r => r.id === moments.myId)?.emoji;
  const quick = loadQuick();
  const del = async () => { if (await confirm({ title: 'Delete this moment?', body: 'It disappears for everyone straight away.', confirmLabel: 'Delete', danger: true })) { await moments.remove(m.id).catch(() => toast('Could not delete it. Try again.', { tone: 'error' })); } };

  return createPortal(<div className="mo-viewer" role="dialog" aria-modal="true" aria-label={`${m.from.name}'s moment`}>
    <div className="mo-viewer-glow" style={{ backgroundImage: m.thumbUrl ? `url(${m.thumbUrl})` : undefined }} />
    <IconButton className="mo-close" icon="x" label="Close" onClick={onClose} />
    <button className="mo-arrow" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous moment"><Icon name="back" size={22} /></button>

    <div className="mo-stage">
      <div className="mo-card" style={cardShape(meta)} onMouseDown={() => setPaused(true)} onMouseUp={() => setPaused(false)} onMouseLeave={() => setPaused(false)}>
        {(photo || m.thumbUrl) && <img className="mo-photo-bg" src={photo?.url || m.thumbUrl || ''} alt="" aria-hidden="true" />}
        {photo ? <img className="mo-photo" src={photo.url} alt={meta?.caption || `${m.from.name}'s moment`} />
          : m.thumbUrl ? <img className="mo-photo blur" src={m.thumbUrl} alt="" />
            : <div className="mo-photo mo-cant"><Icon name="lock" size={28} /><p>This browser can’t open this moment.<br />Open it in the Our Space app.</p></div>}
        <div className="mo-shade" />
        <div className="mo-bars">{order.map((x, i) => <span key={x.id}><i style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} /></span>)}</div>
        <div className="mo-head">
          <Avatar name={m.from.name} size={36} />
          <div className="grow"><b>{mine ? 'You' : m.from.name}</b> <span className="mo-dim">· {ago(m.at)}</span><div className="mo-dim small">{m.rooms.map(r => r.name).join(', ')}</div></div>
          {paused && <span className="mo-chip">Paused</span>}
        </div>
        {meta && <div className="mo-stickers">
          {meta.time && <span className="mo-chip">{timeLabel(meta.at)}</span>}
          {meta.watching && <span className="mo-chip"><Icon name="play" size={12} />{meta.watching}</span>}
          {meta.mood && <span className="mo-chip mo-mood">{meta.mood}</span>}
        </div>}
        {meta?.caption && <p className="mo-caption">{meta.caption}</p>}
        {/* Clicking the left or right part of the photo moves too, like on a phone. */}
        <button className="mo-tap left" onClick={() => go(-1)} aria-label="Previous moment" tabIndex={-1} />
        <button className="mo-tap right" onClick={() => go(1)} aria-label="Next moment" tabIndex={-1} />
      </div>

      <div className="mo-bottom">
        {mine ? <div className="mo-own">
          <div className="grow small">
            {m.views?.length ? <>Seen by {m.views.slice(0, 3).map(v => firstName(v.name)).join(', ')}{m.views.length > 3 ? ` and ${m.views.length - 3} more` : ''}</> : 'Not seen yet'}
            {m.reactions.length > 0 && <span className="mo-dim"> · {m.reactions.map(r => r.emoji).join(' ')}</span>}
          </div>
          <button className="btn ghost sm" onClick={() => setPanel(true)}><Icon name="chat" size={16} />{m.comments ? `${m.comments} comments` : 'Comments'}</button>
          <button className="btn quiet-danger sm" onClick={() => void del()}><Icon name="trash" size={16} />Delete</button>
        </div> : <>
          <div className="mo-reacts" role="group" aria-label="React">
            {quick.map(e => <button key={e} className={myReaction === e ? 'on' : ''} aria-label={`React ${e}`} aria-pressed={myReaction === e}
              onClick={() => void moments.react(m.id, myReaction === e ? null : e).catch(() => toast('Could not send that reaction.', { tone: 'error' }))}>{e}</button>)}
          </div>
          <div className="mo-actions">
            <button className="btn secondary" onClick={() => setPanel(true)}><Icon name="chat" size={16} />{m.comments ? `Comments · ${m.comments}` : 'Comment'}</button>
            {m.rooms[0] && <button className="btn ghost" onClick={() => { onClose(); nav(`/room/${m.rooms[0].code}?tab=chat`); }}><Icon name="reply" size={16} />Reply in chat</button>}
            <button className="btn primary" onClick={() => { onClose(); onSnapBack(); }}><Icon name="camera" size={16} />Snap one back</button>
          </div>
        </>}
        <p className="mo-dim small center">Disappears in {leftLabel(m.expiresAt)} · ← → to move · Space to pause</p>
      </div>
    </div>

    <button className="mo-arrow" onClick={() => go(1)} aria-label="Next moment"><Icon name="next" size={22} /></button>
    {panel && <CommentsPanel moments={moments} m={m} onClose={() => setPanel(false)} />}
  </div>, document.body);
}

function CommentsPanel({ moments, m, onClose }: { moments: MomentsApi; m: Moment; onClose: () => void }) {
  const [items, setItems] = useState<MomentComment[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const load = useCallback(() => moments.comments(m).then(setItems).catch(() => setItems([])), [moments, m]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { await moments.comment(m, text); setText(''); await load(); }
    catch (e) { toast((e as Error).message || 'Could not send your comment.', { tone: 'error' }); }
    finally { setBusy(false); }
  };
  const mineMoment = m.from.id === moments.myId;
  return <aside className="mo-comments" aria-label="Comments">
    <div className="row between"><h2 className="h2">Comments</h2><IconButton icon="x" label="Close comments" size="sm" variant="plain" onClick={onClose} /></div>
    <p className="small muted">Everyone this moment was shared with can read these. They disappear with it.</p>
    <div className="mo-comment-list">
      {items === null ? <p className="small muted">Loading…</p> : !items.length ? <p className="small muted">No comments yet. Say something nice.</p>
        : items.map(c => <div key={c.id} className="mo-comment">
          <Avatar name={c.name} size={30} />
          <div className="grow"><b className="small">{c.userId === moments.myId ? 'You' : c.name}</b> <span className="mo-dim small">{ago(c.at)}</span><p>{c.text ?? <i className="muted">Can’t open this one here.</i>}</p></div>
          {(c.userId === moments.myId || mineMoment) && <IconButton icon="trash" label="Remove comment" size="sm" variant="plain" onClick={() => void moments.removeComment(m, c.id).then(load).catch(() => {})} />}
        </div>)}
    </div>
    <form className="mo-comment-box" onSubmit={e => { e.preventDefault(); void send(); }}>
      <label htmlFor="mo-comment" className="sr-only">Write a comment</label>
      <input id="mo-comment" value={text} maxLength={500} onChange={e => setText(e.target.value)} placeholder={m.key ? 'Write a comment…' : 'This browser can’t comment here'} disabled={!m.key} autoFocus />
      <Button type="submit" icon="send" busy={busy} disabled={!text.trim() || !m.key}>Send</Button>
    </form>
  </aside>;
}

/** The viewer card takes the moment's own shape (square for new moments, 3:4 for older ones), so it shows
 *  edge to edge with no blurred bands, and still fits the window. */
function cardShape(meta?: MomentMeta): React.CSSProperties | undefined {
  if (!meta?.w || !meta?.h) return undefined;
  const r = Math.min(4 / 3, Math.max(3 / 4, meta.w / meta.h));
  return { aspectRatio: String(r), width: `min(100%, calc((100vh - 230px) * ${r.toFixed(4)}))`, marginInline: 'auto' };
}

/* ───────── Snap (webcam + filters) ───────── */
async function blobToImg(blob: Blob, maxW: number, maxH: number): Promise<Img> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxW / bmp.width, maxH / bmp.height);
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d')!; g.drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
  const data = g.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: data.data };
}
function imgToCanvas(img: Img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}
const toJpeg = (img: Img, q: number) => new Promise<Uint8Array>((resolve, reject) => imgToCanvas(img).toBlob(b => b ? void b.arrayBuffer().then(a => resolve(new Uint8Array(a))) : reject(new Error('Could not make the photo')), 'image/jpeg', q));
const toUrl = (img: Img) => imgToCanvas(img).toDataURL('image/jpeg', 0.85);

export function MomentCapture({ moments, onClose, onShared }: { moments: MomentsApi; onClose: () => void; onShared?: (id: string) => void }) {
  const space = useSpace();
  const toast = useToast();
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState('');
  const [shot, setShot] = useState<Blob | null>(null);
  const [mirror, setMirror] = useState(true);
  const [countdown, setCountdown] = useState(0);
  const [base, setBase] = useState<Img | null>(null);
  const [filter, setFilter] = useState<FilterId>('original');
  const [preview, setPreview] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [caption, setCaption] = useState('');
  const [mood, setMood] = useState('');
  const [time, setTime] = useState(true);
  const playing = space.rooms.find(r => r.playback?.playing);
  const [watching, setWatching] = useState(false);
  const [codes, setCodes] = useState<string[] | 'all'>('all');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (shot) return;
    let s: MediaStream | null = null; let alive = true;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1440 }, height: { ideal: 1080 } }, audio: false })
      .then(m => { if (!alive) { m.getTracks().forEach(t => t.stop()); return; } s = m; if (video.current) { video.current.srcObject = m; void video.current.play().catch(() => {}); } setErr(''); })
      .catch(() => setErr('Allow the camera for this site, then try again.'));
    return () => { alive = false; s?.getTracks().forEach(t => t.stop()); };
  }, [shot]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const capture = () => {
    const el = video.current; if (!el?.videoWidth) return;
    // Keep the centre square (what the square frame shows), the same shape as the phone widget.
    const side = Math.min(el.videoWidth, el.videoHeight), sx = (el.videoWidth - side) / 2, sy = (el.videoHeight - side) / 2;
    const c = document.createElement('canvas'); c.width = side; c.height = side;
    const g = c.getContext('2d')!; if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); } g.drawImage(el, sx, sy, side, side, 0, 0, side, side);
    c.toBlob(b => { if (b) setShot(b); }, 'image/jpeg', 0.95);
  };
  const take = () => {
    if (countdown) return;
    let n = 3; setCountdown(n);
    const t = setInterval(() => { n -= 1; if (n <= 0) { clearInterval(t); setCountdown(0); capture(); } else setCountdown(n); }, 800);
  };
  // After the shot: a 1440-px working copy, quick previews for every filter, and the chosen one at preview size.
  useEffect(() => {
    if (!shot) { setBase(null); return; }
    let alive = true;
    void blobToImg(shot, 1440, 1440).then(img => {
      if (!alive) return; setBase(img);
      const small = resize(img, 120, 120);
      const out: Record<string, string> = {};
      for (const f of FILTERS) out[f.id] = toUrl(applyFilter(small, f.id));
      setThumbs(out);
    });
    return () => { alive = false; };
  }, [shot]);
  useEffect(() => { if (base) setPreview(toUrl(applyFilter(resize(base, 720, 720), filter))); }, [base, filter]);

  const roomList = space.rooms;
  const chosen = codes === 'all' ? roomList.map(r => r.code) : codes;
  const toggleRoom = (code: string) => setCodes(c => { const cur = c === 'all' ? [] : c; const next = cur.includes(code) ? cur.filter(x => x !== code) : [...cur, code]; return next.length ? next : 'all'; });
  const share = async () => {
    if (!base || busy) return;
    if (!chosen.length) { toast('Create or join a room first.', { tone: 'error' }); return; }
    setBusy(true);
    try {
      const done = applyFilter(base, filter);
      // Keep the photo under ~900 KB (grainy filters compress worse): step the quality down if needed.
      const sized = resize(done, 1080, 1440);
      let photo = await toJpeg(sized, 0.8);
      for (const q of [0.7, 0.6, 0.5]) { if (photo.length <= 900_000) break; photo = await toJpeg(sized, q); }
      const thumb = await toJpeg(resize(done, 360, 360), 0.7);
      const meta: MomentMeta = { v: 1, caption: caption.trim() || undefined, w: done.width, h: done.height, filter, at: Date.now(), time, mood: mood || undefined, watching: watching && playing ? `Watching in ${playing.name}` : undefined };
      const id = await moments.share(photo, thumb, meta, chosen);
      toast('Moment shared · visible for 24 hours', { icon: 'sparkles' });
      onShared?.(id); onClose();
    } catch (e) { toast((e as Error).message || 'Could not share your moment. Try again.', { tone: 'error' }); }
    finally { setBusy(false); }
  };

  return createPortal(<div className="mo-snap-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="mo-snap" role="dialog" aria-modal="true" aria-label="Share a moment">
      <div className="mo-snap-main">
        <div className="row between"><h2 className="h2">Share the moment</h2><span className="small muted">Seen by your rooms for 24 hours</span></div>
        <div className="mo-snap-frame">
          {err ? <p className="muted center" style={{ padding: 40 }}>{err}</p>
            : shot ? (preview ? <img src={preview} alt="Your photo with the filter" /> : <div className="skeleton" style={{ width: '100%', height: '100%' }} />)
              : <video ref={video} playsInline muted autoPlay className={mirror ? 'mirror' : ''} />}
          {countdown > 0 && <span className="mo-count">{countdown}</span>}
          {shot && <div className="mo-stickers">{time && <span className="mo-chip">{timeLabel(Date.now())}</span>}{watching && playing && <span className="mo-chip"><Icon name="play" size={12} />Watching in {playing.name}</span>}{mood && <span className="mo-chip mo-mood">{mood}</span>}</div>}
          {shot && caption.trim() && <p className="mo-caption">{caption}</p>}
        </div>
        <div className="mo-snap-controls">
          {shot ? <>
            <button className="btn ghost" onClick={() => { setShot(null); setPreview(''); setThumbs({}); }}><Icon name="undo" size={16} />Retake</button>
          </> : <>
            <button className="btn ghost sm" onClick={take} disabled={!!err}>3 s timer</button>
            <button className="cam-shutter" onClick={capture} disabled={!!err} aria-label="Take the photo" />
            <button className="btn ghost sm" onClick={() => setMirror(v => !v)} aria-pressed={mirror}>Mirror</button>
          </>}
        </div>
      </div>
      <div className="mo-snap-side">
        <div className="col gap-8">
          <span className="small muted">Filter</span>
          <div className="mo-filters">
            {FILTERS.map(f => <button key={f.id} className={`mo-filter ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)} disabled={!shot} aria-pressed={filter === f.id} title={f.note}>
              <span className="mo-filter-thumb">{thumbs[f.id] ? <img src={thumbs[f.id]} alt="" /> : null}{f.plus && <i>PLUS</i>}</span>
              <span className="small">{f.name}</span>
            </button>)}
          </div>
          {filterById(filter).plus && <p className="small muted">Plus filters are free while Our Space is in early access.</p>}
        </div>
        <div className="col gap-8">
          <label htmlFor="mo-caption" className="small muted">Caption</label>
          <input id="mo-caption" className="input" value={caption} maxLength={80} onChange={e => setCaption(e.target.value)} placeholder="What’s happening?" />
        </div>
        <div className="col gap-8">
          <span className="small muted">Stickers</span>
          <div className="row wrap gap-8">
            <button className={`chip ${time ? 'on' : ''}`} aria-pressed={time} onClick={() => setTime(v => !v)}>Time</button>
            {playing && <button className={`chip ${watching ? 'on' : ''}`} aria-pressed={watching} onClick={() => setWatching(v => !v)}>Now watching</button>}
            {MOODS.map(e => <button key={e} className={`chip ${mood === e ? 'on' : ''}`} aria-pressed={mood === e} aria-label={`Mood ${e}`} onClick={() => setMood(v => (v === e ? '' : e))}>{e}</button>)}
          </div>
        </div>
        <div className="col gap-8">
          <span className="small muted">Share to</span>
          <div className="row wrap gap-8">
            <button className={`chip ${codes === 'all' ? 'on' : ''}`} aria-pressed={codes === 'all'} onClick={() => setCodes('all')}>All my rooms</button>
            {roomList.map(r => <button key={r.code} className={`chip ${codes !== 'all' && codes.includes(r.code) ? 'on' : ''}`} aria-pressed={codes !== 'all' && codes.includes(r.code)} onClick={() => toggleRoom(r.code)}>{r.name}</button>)}
          </div>
        </div>
        <div className="row gap-8" style={{ marginTop: 'auto' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button className="grow" icon="send" busy={busy} disabled={!shot || !base} onClick={() => void share()}>Share moment</Button>
        </div>
      </div>
    </div>
  </div>, document.body);
}
