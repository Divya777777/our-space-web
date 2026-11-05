import { useEffect, useRef, useState } from 'react';
import type { Receipts, Room } from '../lib/model';
import { useSpace } from '../lib/space';
import { useRoomChat } from '../lib/useRoomChat';
import { ChatItem, fileUrl } from '../lib/chatStore';
import { isBlockedId, useBlocked } from '../lib/safety';
import { Icon } from './Icon';
import { LinkSheet } from './LinkSheet';
import { IconButton, Notice, firstName, useToast } from './ui';

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
  const blocked = useBlocked(space.api);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<string>('');
  const [linking, setLinking] = useState(false);
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
  useEffect(() => { const box = end.current?.closest('.side-body'); if (box && box.scrollHeight > box.clientHeight + 1) box.scrollTop = box.scrollHeight; }, [items.length]);
  const send = async () => { const t = text; if (!t.trim()) return; setText(''); try { await chat.sendText(t); } catch (e) { toast((e as Error).message || 'Message not sent.', { tone: 'error' }); } };
  // One or many photos / files: each goes as its own message, in order.
  const attach = async (files: File[]) => {
    const list = files.slice(0, 20);
    if (files.length > 20) toast('Up to 20 at a time. Sending the first 20.', { tone: 'info' });
    let failed = 0;
    for (let k = 0; k < list.length; k++) {
      const label = list.length > 1 ? `Sending ${k + 1} of ${list.length}…` : 'Sending…';
      try { setProgress(label); await chat.sendFile(list[k], (d, t) => setProgress(`${label.replace('…', '')} ${Math.round(d / t * 100)}%`)); }
      catch (e) { failed++; if (list.length === 1) toast((e as Error).message, { tone: 'error' }); }
    }
    if (list.length > 1 && failed) toast(`${failed} of ${list.length} didn’t send. Try those again.`, { tone: 'error' });
    setProgress('');
  };
  let lastDay = ''; let lastFrom = '';
  return <div className="col" style={{ flex: 1, minHeight: 0, gap: 0 }}>
    <div className="chat" style={{ flex: 1 }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = Array.from(e.dataTransfer.files); if (f.length) void attach(f); }}>
      <p className="tiny quiet row gap-8" style={{ justifyContent: 'center', padding: '4px 0 10px', textAlign: 'center' }}><Icon name="lock" size={13} />Private. Only people in this room can read it. History stays in this browser.</p>
      <button className="link-cta" onClick={() => setLinking(true)}>
        <span className="center" style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(200,182,255,.18)', color: 'var(--lav)', flex: 'none' }}><Icon name="phone" size={18} /></span>
        <span className="grow"><span className="small" style={{ fontWeight: 600, display: 'block' }}>Bring older chats from your phone</span><span className="tiny muted">Scan a QR code with Our Space on your phone</span></span>
        <Icon name="fwd" size={16} />
      </button>
      {!chat.loaded && <p className="small muted">Loading messages…</p>}
      {chat.loaded && !items.length && <div className="col gap-8" style={{ alignItems: 'center', textAlign: 'center', padding: '40px 12px' }}><Icon name="chat" size={28} /><p className="h3">Say hi</p><p className="small muted">Messages, photos and files up to 16 MB. Drop a file here to send it.</p></div>}
      {items.map(i => {
        const day = dayLabel(i.at); const showDay = day !== lastDay; lastDay = day;
        const showName = i.from !== space.user.id && (i.from !== lastFrom || showDay); lastFrom = i.from;
        return <div key={i.id} style={{ display: 'contents' }}>
          {showDay && <p className="tiny quiet" style={{ textAlign: 'center', margin: '10px 0 4px' }}>{day}</p>}
          <Message item={i} status={i.from === space.user.id && !i.pending && !i.failed && /^\d+$/.test(i.id) ? statusOf(Number(i.id), others, room.receipts) : null} mine={i.from === space.user.id} showName={showName} onReport={() => onReport(i.from, i.text || '')} onDismiss={() => chat.dismiss(i.id)} />
        </div>;
      })}
      <div ref={end} />
    </div>
    {chat.unreadable > 0 && <div style={{ marginTop: 10 }}><Notice icon="lock">Some messages were sent before this browser joined, or from an older phone app. <button className="lav" onClick={() => setLinking(true)}>Copy them from your phone</button></Notice></div>}
    {linking && <LinkSheet onClose={() => setLinking(false)} />}
    {chat.waitingForKeys.length > 0 && <div style={{ marginTop: 10 }}><Notice>{chat.waitingForKeys.map(firstName).join(', ')} will see messages once they open Our Space on an updated app.</Notice></div>}
    <div className="composer" style={{ marginTop: 12 }}>
       <input ref={fileInput} type="file" multiple hidden onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) void attach(f); }} />
      <IconButton icon="paperclip" label="Send photos or files (pick several at once)" onClick={() => fileInput.current?.click()} disabled={!!progress} />
      <textarea aria-label={`Message ${room.name}`} className="input" placeholder={progress || 'Message'} value={text} rows={1}
        onChange={e => { setText(e.target.value); e.target.style.height = '44px'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
      <IconButton icon="send" variant="accent" label="Send message" onClick={() => void send()} disabled={!text.trim()} />
    </div>
  </div>;
}

function Message({ item, status, mine, showName, onReport, onDismiss }: { item: ChatItem; status: Status | null; mine: boolean; showName: boolean; onReport: () => void; onDismiss: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (item.file) void fileUrl(item.file.key).then(setUrl); }, [item.file]);
  return <div className={`msg ${mine ? 'me' : ''} ${item.pending ? 'pending' : ''} ${item.failed ? 'failed' : ''}`} onContextMenu={e => { if (!mine) { e.preventDefault(); onReport(); } }}>
    {showName && <span className="who">{firstName(item.name)}</span>}
    {item.kind === 'image' && item.file ? (url ? <div className="msg-photo"><a href={url} target="_blank" rel="noreferrer"><img src={url} alt={item.file.name} style={item.file.w ? { aspectRatio: `${item.file.w} / ${item.file.h}` } : undefined} /></a>
      <a className="msg-save" href={url} download={item.file.name || 'photo.jpg'} aria-label={`Save ${item.file.name || 'photo'}`} title="Save to this computer"><Icon name="download" size={16} /></a></div> : <div className="skeleton" style={{ width: 220, height: 160 }} />)
      : item.kind === 'file' && item.file ? <a className="bubble row gap-8" href={url || undefined} download={item.file.name} style={{ color: 'inherit' }}><Icon name="file" size={18} /><span className="ellipsis" style={{ maxWidth: 200 }}>{item.file.name}</span><span className="tiny" style={{ opacity: .7 }}>{(item.file.size / 1e6).toFixed(1)} MB</span><span className="file-save"><Icon name="download" size={14} />Save</span></a>
        : <div className="bubble">{item.text}</div>}
    <span className="tiny quiet" style={{ padding: '0 6px' }}>{item.failed ? <button className="rose" onClick={onDismiss}>Not sent · remove</button> : item.pending ? 'Sending…' : <span className="row" style={{ gap: 3, display: 'inline-flex', alignItems: 'center' }}>{time(item.at)}{status && <span title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]} style={{ display: 'inline-flex', color: status === 'read' ? '#8EC5FF' : undefined }}><Icon name={status === 'sent' ? 'check' : 'checks'} size={14} stroke={2} /></span>}</span>}</span>
  </div>;
}
