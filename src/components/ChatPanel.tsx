import { useEffect, useRef, useState } from 'react';
import type { Room } from '../lib/model';
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
  useEffect(() => { const box = end.current?.closest('.side-body'); if (box && box.scrollHeight > box.clientHeight + 1) box.scrollTop = box.scrollHeight; }, [items.length]);
  const send = async () => { const t = text; if (!t.trim()) return; setText(''); try { await chat.sendText(t); } catch (e) { toast((e as Error).message || 'Message not sent.', { tone: 'error' }); } };
  const attach = async (file: File) => {
    try { setProgress('Sending…'); await chat.sendFile(file, (d, t) => setProgress(`Sending… ${Math.round(d / t * 100)}%`)); }
    catch (e) { toast((e as Error).message, { tone: 'error' }); }
    finally { setProgress(''); }
  };
  let lastDay = ''; let lastFrom = '';
  return <div className="col" style={{ flex: 1, minHeight: 0, gap: 0 }}>
    <div className="chat" style={{ flex: 1 }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void attach(f); }}>
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
          <Message item={i} mine={i.from === space.user.id} showName={showName} onReport={() => onReport(i.from, i.text || '')} onDismiss={() => chat.dismiss(i.id)} />
        </div>;
      })}
      <div ref={end} />
    </div>
    {chat.unreadable > 0 && <div style={{ marginTop: 10 }}><Notice icon="lock">Some messages were sent before this browser joined, or from an older phone app. <button className="lav" onClick={() => setLinking(true)}>Copy them from your phone</button></Notice></div>}
    {linking && <LinkSheet onClose={() => setLinking(false)} />}
    {chat.waitingForKeys.length > 0 && <div style={{ marginTop: 10 }}><Notice>{chat.waitingForKeys.map(firstName).join(', ')} will see messages once they open Our Space on an updated app.</Notice></div>}
    <div className="composer" style={{ marginTop: 12 }}>
      <input ref={fileInput} type="file" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void attach(f); }} />
      <IconButton icon="paperclip" label="Send a photo or file" onClick={() => fileInput.current?.click()} disabled={!!progress} />
      <textarea aria-label={`Message ${room.name}`} className="input" placeholder={progress || 'Message'} value={text} rows={1}
        onChange={e => { setText(e.target.value); e.target.style.height = '44px'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
      <IconButton icon="send" variant="accent" label="Send message" onClick={() => void send()} disabled={!text.trim()} />
    </div>
  </div>;
}

function Message({ item, mine, showName, onReport, onDismiss }: { item: ChatItem; mine: boolean; showName: boolean; onReport: () => void; onDismiss: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { if (item.file) void fileUrl(item.file.key).then(setUrl); }, [item.file]);
  return <div className={`msg ${mine ? 'me' : ''} ${item.pending ? 'pending' : ''} ${item.failed ? 'failed' : ''}`} onContextMenu={e => { if (!mine) { e.preventDefault(); onReport(); } }}>
    {showName && <span className="who">{firstName(item.name)}</span>}
    {item.kind === 'image' && item.file ? (url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={item.file.name} style={item.file.w ? { aspectRatio: `${item.file.w} / ${item.file.h}` } : undefined} /></a> : <div className="skeleton" style={{ width: 220, height: 160 }} />)
      : item.kind === 'file' && item.file ? <a className="bubble row gap-8" href={url || undefined} download={item.file.name} style={{ color: 'inherit' }}><Icon name="file" size={18} /><span className="ellipsis" style={{ maxWidth: 200 }}>{item.file.name}</span><span className="tiny" style={{ opacity: .7 }}>{(item.file.size / 1e6).toFixed(1)} MB</span><Icon name="download" size={16} /></a>
        : <div className="bubble">{item.text}</div>}
    <span className="tiny quiet" style={{ padding: '0 6px' }}>{item.failed ? <button className="rose" onClick={onDismiss}>Not sent · remove</button> : item.pending ? 'Sending…' : time(item.at)}</span>
  </div>;
}
