import { useEffect, useRef, useState } from 'react';
import type { Receipts, Room } from '../lib/model';
import { useSpace } from '../lib/space';
import { useRoomChat } from '../lib/useRoomChat';
import { ChatItem, fileUrl } from '../lib/chatStore';
import { isBlockedId, useBlocked } from '../lib/safety';
import { Icon } from './Icon';
import { LinkSheet } from './LinkSheet';
import { IconButton, Notice, firstName, useConfirm, useToast } from './ui';

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dayLabel = (t: number) => { const d = new Date(t); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1); return d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }); };

export type Chat = ReturnType<typeof useRoomChat>;
type Status = 'sent' | 'delivered' | 'read';
/** Like WhatsApp: one tick = reached the server, two grey = every other member has it, two blue = everyone has seen it. */
function statusOf(id: number, others: string[], receipts: Receipts | undefined): Status {
  if (!others.length || !receipts) return 'sent';
  if (others.every(u => (receipts[u]?.r || 0) >= id)) return 'read';
  if (others.every(u => (receipts[u]?.d || 0) >= id)) return 'delivered';
  return 'sent';
}
const STATUS_LABEL: Record<Status, string> = { sent: 'Sent', delivered: 'Delivered', read: 'Seen' };
export function ChatPanel({ room, chat, onReport }: { room: Room; chat: Chat; onReport: (userId: string, text: string) => void }) {
  const space = useSpace();
  const toast = useToast();
  const confirm = useConfirm();
  const blocked = useBlocked(space.api);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<string>('');
  const [linking, setLinking] = useState(false);
  const [hideLink, setHideLink] = useState(() => { try { return localStorage.getItem('ourspace.hideLinkCta') === '1'; } catch { return false; } });
  const end = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const items = chat.items.filter(i => !isBlockedId(blocked, i.from));
  // Keep the newest message in view inside the panel (never scroll the whole page).
  // Seen ticks for the others: only while this tab is visible and focused.
  const { markRead, cursor } = chat;
  useEffect(() => {
    const check = () => { if (chat.loaded && document.visibilityState === 'visible' && document.hasFocus()) markRead(); };
    check();
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [chat.loaded, cursor, markRead]);
  const others = room.members.map(m => m.id).filter(id => id !== space.user.id);
  // Everyone else in this room is someone you blocked: no messages either way until you unblock.
  const allBlocked = others.length > 0 && others.every(id => isBlockedId(blocked, id));
  // Group rooms (3 or more people): send a message privately to one person, like Google Meet.
  const canPrivate = others.length >= 2;
  const [privateTo, setPrivateTo] = useState<string | null>(null);
  const reachable = room.members.filter(m => m.id !== space.user.id && !isBlockedId(blocked, m.id));
  useEffect(() => { if (privateTo && !reachable.some(m => m.id === privateTo)) setPrivateTo(null); }, [privateTo, reachable]);
  const privateName = privateTo ? firstName(room.members.find(m => m.id === privateTo)?.name || '') : '';
  const pmTo = canPrivate && privateTo ? [privateTo] : undefined;
  // Photos and files wait in a tray above the message box (like WhatsApp) until Send is pressed.
  const [staged, setStaged] = useState<{ id: string; file: File; url: string }[]>([]);
  const stage = (files: File[]) => {
    if (!files.length) return;
    setStaged(list => {
      const room = Math.max(0, 20 - list.length);
      if (files.length > room) toast('Up to 20 at a time.', { tone: 'info' });
      return [...list, ...files.slice(0, room).map(file => ({ id: Math.random().toString(36).slice(2), file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : '' }))];
    });
  };
  const unstage = (id: string) => setStaged(list => { const gone = list.find(x => x.id === id); if (gone?.url) URL.revokeObjectURL(gone.url); return list.filter(x => x.id !== id); });
  const stagedRef = useRef(staged); stagedRef.current = staged;
  useEffect(() => { const box = end.current?.closest('.side-body'); if (box && box.scrollHeight > box.clientHeight + 1) box.scrollTop = box.scrollHeight; }, [items.length, staged.length]);
  useEffect(() => () => { stagedRef.current.forEach(x => x.url && URL.revokeObjectURL(x.url)); }, []);
  const send = async () => {
    const t = text; const files = staged;
    if (!t.trim() && !files.length) return;
    setText('');
    if (files.length) { setStaged([]); await attach(files.map(x => x.file)); files.forEach(x => x.url && URL.revokeObjectURL(x.url)); }
    if (t.trim()) { try { await chat.sendText(t, pmTo); } catch (e) { toast((e as Error).message || 'Message not sent.', { tone: 'error' }); } }
  };
  // One or many photos / files: each goes as its own message, in order.
  const attach = async (files: File[]) => {
    const list = files.slice(0, 20);
    if (files.length > 20) toast('Up to 20 at a time. Sending the first 20.', { tone: 'info' });
    let failed = 0;
    for (let k = 0; k < list.length; k++) {
      const label = list.length > 1 ? `Sending ${k + 1} of ${list.length}…` : 'Sending…';
      try { setProgress(label); await chat.sendFile(list[k], (d, t) => setProgress(`${label.replace('…', '')} ${Math.round(d / t * 100)}%`), pmTo); }
      catch (e) { failed++; if (list.length === 1) toast((e as Error).message, { tone: 'error' }); }
    }
    if (list.length > 1 && failed) toast(`${failed} of ${list.length} didn’t send. Try those again.`, { tone: 'error' });
    setProgress('');
  };
  // Drop files anywhere on the chat (messages, empty space or the message box), or paste a copied image/screenshot.
  const [dropping, setDropping] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');
  const dragProps = {
    onDragEnter: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current++; setDropping(true); },
    onDragOver: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; },
    onDragLeave: (e: React.DragEvent) => { if (!hasFiles(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setDropping(false); },
    onDrop: (e: React.DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); depth.current = 0; setDropping(false); const f = Array.from(e.dataTransfer.files); if (f.length) stage(f); },
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (!files.length) return; // plain text pastes as usual
    e.preventDefault();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    // Screenshots arrive as "image.png"; give them a name worth keeping.
    stage(files.map(f => (/^image\.\w+$/.test(f.name) ? new File([f], `Pasted ${stamp}.${f.name.split('.').pop()}`, { type: f.type }) : f)));
  };
  let lastDay = ''; let lastFrom = '';
  return <div className={`col chat-drop ${dropping ? 'dropping' : ''}`} style={{ flex: 1, minHeight: 0, gap: 0 }} {...dragProps}>
    {dropping && <div className="drop-hint" aria-hidden="true"><Icon name="paperclip" size={22} />Drop to add</div>}
    <div className="chat" style={{ flex: 1 }}>
      <p className="tiny quiet row gap-8" style={{ justifyContent: 'center', padding: '4px 0 10px', textAlign: 'center' }}><Icon name="lock" size={13} />Private. Only people in this room can read it. History stays in this browser.</p>
      {!hideLink && <div className="link-cta-wrap"><button className="link-cta" onClick={() => setLinking(true)}>
        <span className="center" style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(200,182,255,.18)', color: 'var(--lav)', flex: 'none' }}><Icon name="phone" size={18} /></span>
        <span className="grow"><span className="small" style={{ fontWeight: 600, display: 'block' }}>Bring older chats from your phone</span><span className="tiny muted">Scan a QR code with Our Space on your phone</span></span>
      </button>
        <button className="link-cta-x" aria-label="Hide this (you can find it under You)" title="Hide (it stays under You)" onClick={() => { setHideLink(true); try { localStorage.setItem('ourspace.hideLinkCta', '1'); } catch { /* fine */ } }}><Icon name="x" size={14} /></button></div>}
      {!chat.loaded && <p className="small muted">Loading messages…</p>}
      {chat.loaded && !items.length && <div className="col gap-8" style={{ alignItems: 'center', textAlign: 'center', padding: '40px 12px' }}><Icon name="chat" size={28} /><p className="h3">Say hi</p><p className="small muted">Messages, photos and files up to 16 MB. Drop a file here to add it.</p></div>}
      {items.map(i => {
        const day = dayLabel(i.at); const showDay = day !== lastDay; lastDay = day;
        const showName = i.from !== space.user.id && (i.from !== lastFrom || showDay); lastFrom = i.from;
        return <div key={i.id} style={{ display: 'contents' }}>
          {showDay && <p className="tiny quiet" style={{ textAlign: 'center', margin: '10px 0 4px' }}>{day}</p>}
          <Message item={i} names={room.members} myId={space.user.id} onReplyPrivately={canPrivate && i.from !== space.user.id && reachable.some(m => m.id === i.from) ? () => setPrivateTo(i.from) : undefined} status={i.from === space.user.id && !i.pending && !i.failed && /^\d+$/.test(i.id) ? statusOf(Number(i.id), others, room.receipts) : null} mine={i.from === space.user.id} showName={showName} onReport={() => onReport(i.from, i.text || '')} onDismiss={() => chat.dismiss(i.id)} onDelete={i.pending ? undefined : async () => { if (await confirm({ title: i.kind === 'image' ? 'Delete this photo for you?' : i.kind === 'file' ? 'Delete this file for you?' : 'Delete this message for you?', body: 'It’s removed from this device only. Everyone else in the room still has it.', confirmLabel: 'Delete for me', danger: true })) chat.deleteForMe(i.id); }} />
        </div>;
      })}
      <div ref={end} />
    </div>
    {chat.unreadable > 0 && <div style={{ marginTop: 10 }}><Notice icon="lock">Some messages were sent before this browser joined, or from an older phone app. <button className="lav" onClick={() => setLinking(true)}>Copy them from your phone</button></Notice></div>}
    {linking && <LinkSheet onClose={() => setLinking(false)} />}
    {chat.waitingForKeys.length > 0 && <div style={{ marginTop: 10 }}><Notice>{chat.waitingForKeys.map(firstName).join(', ')} will see messages once they open Our Space on an updated app.</Notice></div>}
    {allBlocked ? <div style={{ marginTop: 12 }}><Notice icon="lock">You blocked {others.length > 1 ? 'everyone else here' : firstName(room.members.find(m => m.id === others[0])?.name || 'them')}. Messages and calls are off; songs and the room still work. Unblock under People to chat again.</Notice></div> : <>
    {staged.length > 0 && <div className="staged" aria-label="Ready to send">
      {staged.map(x => <div key={x.id} className={`staged-item${x.url ? '' : ' file'}`} title={x.file.name}>
        {x.url ? <img src={x.url} alt={x.file.name} /> : <><Icon name="file" size={18} /><span className="ellipsis">{x.file.name}</span><span className="tiny muted">{(x.file.size / 1e6).toFixed(1)} MB</span></>}
        <button className="staged-x" aria-label={`Remove ${x.file.name}`} onClick={() => unstage(x.id)}><Icon name="x" size={12} /></button>
      </div>)}
      <span className="tiny muted staged-note">{staged.length === 1 ? 'Press send to share it' : `Press send to share these ${staged.length}`}</span>
    </div>}
    {canPrivate && <div className={`to-row ${privateTo ? 'private' : ''}`}>
      <Icon name={privateTo ? 'lock' : 'users'} size={14} />
      <label htmlFor="chat-to" className="tiny muted">To</label>
      <select id="chat-to" className="to-pick" value={privateTo || ''} onChange={e => setPrivateTo(e.target.value || null)}>
        <option value="">Everyone</option>
        {reachable.map(m => <option key={m.id} value={m.id}>{firstName(m.name)} (private)</option>)}
      </select>
      {privateTo && <span className="tiny">Only {privateName} will see it</span>}
    </div>}
    <div className="composer" style={{ marginTop: canPrivate ? 8 : 12 }}>
       <input ref={fileInput} type="file" multiple hidden onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) stage(f); }} />
      <IconButton icon="paperclip" label="Send photos or files (pick several at once)" onClick={() => fileInput.current?.click()} disabled={!!progress} />
      <textarea aria-label={`Message ${room.name}`} className="input" placeholder={progress || (staged.length ? 'Add a message (optional)' : privateTo ? `Private message to ${privateName}` : 'Message')} value={text} rows={1}
        onChange={e => { setText(e.target.value); e.target.style.height = '44px'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} onPaste={onPaste} />
      <IconButton icon="send" variant="accent" label="Send message" onClick={() => void send()} disabled={(!text.trim() && !staged.length) || !!progress} />
    </div></>}
  </div>;
}

/** The photo's size on screen: fits in 260 × 260 (tall photos get narrow, wide ones short), so the save button
 *  always sits on the picture's own corner. */
function photoSize(w?: number, h?: number): React.CSSProperties | undefined {
  if (!w || !h) return undefined;
  const k = Math.min(260 / w, 260 / h, 1);
  return { width: Math.round(w * k), height: Math.round(h * k) };
}
function Message({ item, status, mine, showName, onReport, onDismiss, onDelete, names, myId, onReplyPrivately }: { item: ChatItem; status: Status | null; mine: boolean; showName: boolean; onReport: () => void; onDismiss: () => void; onDelete?: () => void; names: { id: string; name: string }[]; myId: string; onReplyPrivately?: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (item.file) void fileUrl(item.file.key).then(setUrl); }, [item.file]);
  const privateLabel = item.to?.length ? (mine ? `Private to ${item.to.map(id => firstName(names.find(m => m.id === id)?.name || 'them')).join(', ')}` : item.to.includes(myId) ? 'Private · only you' : 'Private') : '';
  return <div className={`msg ${mine ? 'me' : ''} ${item.to?.length ? 'private' : ''} ${item.pending ? 'pending' : ''} ${item.failed ? 'failed' : ''}`} onContextMenu={e => { if (!mine) { e.preventDefault(); onReport(); } }}>
    {(showName || privateLabel) && <span className="who">{showName && firstName(item.name)}{privateLabel && <span className="pm-tag"><Icon name="lock" size={11} />{privateLabel}</span>}</span>}
    {item.kind === 'image' && item.file ? (url ? <div className="msg-photo"><a href={url} target="_blank" rel="noreferrer"><img src={url} alt={item.file.name} style={photoSize(item.file.w, item.file.h)} /></a>
      <a className="msg-save" href={url} download={item.file.name || 'photo.jpg'} aria-label={`Save ${item.file.name || 'photo'}`} title="Save to this computer"><Icon name="download" size={16} /></a></div> : <div className="skeleton" style={{ width: 220, height: 160 }} />)
      : item.kind === 'file' && item.file ? <a className="bubble row gap-8" href={url || undefined} download={item.file.name} style={{ color: 'inherit' }}><Icon name="file" size={18} /><span className="ellipsis" style={{ maxWidth: 200 }}>{item.file.name}</span><span className="tiny" style={{ opacity: .7 }}>{(item.file.size / 1e6).toFixed(1)} MB</span><span className="file-save"><Icon name="download" size={14} />Save</span></a>
        : <div className="bubble">{item.text}</div>}
    {onReplyPrivately && <button className="pm-reply tiny" onClick={onReplyPrivately}>Reply privately</button>}
    <span className="tiny quiet" style={{ padding: '0 6px' }}>{item.failed ? <button className="rose" onClick={onDismiss}>Not sent · remove</button> : item.pending ? 'Sending…' : <span className="row" style={{ gap: 3, display: 'inline-flex', alignItems: 'center' }}>{time(item.at)}{status && <span title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]} style={{ display: 'inline-flex', color: status === 'read' ? '#8EC5FF' : undefined }}><Icon name={status === 'sent' ? 'check' : 'checks'} size={14} stroke={2} /></span>}{onDelete && <button className="msg-del" onClick={onDelete} aria-label="Delete for me" title="Delete for me"><Icon name="trash" size={13} /></button>}</span>}</span>
  </div>;
}
