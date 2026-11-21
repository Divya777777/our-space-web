import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Receipts, Room } from '../lib/model';
import { useSpace } from '../lib/space';
import { useRoomChat } from '../lib/useRoomChat';
import { ChatItem, fileUrl } from '../lib/chatStore';
import { isBlockedId, useBlocked } from '../lib/safety';
import { Icon } from './Icon';
import { LinkSheet } from './LinkSheet';
import { CameraSheet, EmojiPicker, MediaSheet, StarredSheet, VoiceBubble, clockOf, isVoice, nameFor, useVoiceRecorder } from './ChatExtras';
import { suggestEmoji } from '../lib/emoji';
import type { Gif } from '../lib/emoji';
import { Avatar, IconButton, Notice, firstName, useConfirm, useToast } from './ui';

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
/** `compact`: the small chat that pops up over a video call (no banners or toolbar). */
export function ChatPanel({ room, chat, onReport, compact }: { room: Room; chat: Chat; onReport: (userId: string, text: string) => void; compact?: boolean }) {
  const space = useSpace();
  const toast = useToast();
  const confirm = useConfirm();
  const blocked = useBlocked(space.api);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatItem | null>(null);
  const [editing, setEditing] = useState<ChatItem | null>(null);
  const [viewer, setViewer] = useState<{ url: string; name: string } | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [camera, setCamera] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [sheet, setSheet] = useState<'media' | 'starred' | null>(null);
  const names = nameFor(room.members, space.user.id);
  const starred = new Set(chat.starred);
  const focusBox = () => setTimeout(() => box.current?.focus(), 0);
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
  // Like WhatsApp: new messages scroll into view only while you're at the bottom (or when you sent them).
  // Scrolled up, a round button with the count of new ones takes you straight down.
  const scroller = useCallback(() => end.current?.closest('.side-body') as HTMLElement | null, []);
  const [away, setAway] = useState(false);
  const [fresh, setFresh] = useState(0);
  const awayRef = useRef(false);
  useEffect(() => {
    const el = scroller(); if (!el) return;
    const on = () => { const a = el.scrollHeight - el.scrollTop - el.clientHeight > 160; if (a !== awayRef.current) { awayRef.current = a; setAway(a); } if (!a) setFresh(0); };
    on(); el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, [scroller, chat.loaded]);
  const jumpDown = (smooth = true) => { const el = scroller(); if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); setFresh(0); };
  const seenCount = useRef(0);
  useEffect(() => {
    const added = items.length - seenCount.current; seenCount.current = items.length;
    const last = items[items.length - 1];
    if (awayRef.current && added > 0 && last && last.from !== space.user.id) { setFresh(n => n + added); return; }
    const el = scroller(); if (el && el.scrollHeight > el.clientHeight + 1) el.scrollTop = el.scrollHeight;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, staged.length]);
  useEffect(() => () => { stagedRef.current.forEach(x => x.url && URL.revokeObjectURL(x.url)); }, []);
  const send = async () => {
    const t = text; const files = staged;
    if (!t.trim() && !files.length) return;
    setText('');
    if (files.length) { setStaged([]); await attach(files.map(x => x.file)); files.forEach(x => x.url && URL.revokeObjectURL(x.url)); }
    const re = replyTo ? { id: replyTo.id, name: firstName(replyTo.name), text: (replyTo.text || (replyTo.kind === 'image' ? 'Photo' : replyTo.file?.name || 'File')).slice(0, 140) } : undefined;
    setReplyTo(null);
    if (t.trim()) { try { await chat.sendText(t, pmTo, re); } catch (e) { toast((e as Error).message || 'Message not sent.', { tone: 'error' }); } }
    jumpDown(false);
  };
  const saveEdit = async () => {
    const item = editing; const t = text.trim(); if (!item) return;
    setEditing(null); setText('');
    if (!t || t === item.text) return;
    try { await chat.editMessage(item, t); } catch (e) { toast((e as Error).message || 'Couldn’t edit that message.', { tone: 'error' }); }
  };
  const startEdit = (item: ChatItem) => { setReplyTo(null); setEditing(item); setText(item.text || ''); focusBox(); };
  const startReply = (item: ChatItem) => { setEditing(null); setReplyTo(item); focusBox(); };
  const goTo = (id: string) => {
    const el = scroller()?.querySelector<HTMLElement>(`[data-msg="${CSS.escape(id)}"]`);
    if (!el) { toast('That message isn’t here any more.', { tone: 'info' }); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  };
  const react = (item: ChatItem, emoji: string) => { void chat.react(item, item.reactions?.[space.user.id] === emoji ? '' : emoji).catch(e => toast((e as Error).message || 'Couldn’t react.', { tone: 'error' })); };
  const deleteAll = async (item: ChatItem) => {
    if (!await confirm({ title: 'Delete for everyone?', body: 'It’s removed from this chat for everyone in the room.', confirmLabel: 'Delete for everyone', danger: true })) return;
    try { await chat.deleteForEveryone(item); } catch (e) { toast((e as Error).message || 'Couldn’t delete it.', { tone: 'error' }); }
  };
  const deleteMine = async (item: ChatItem) => {
    if (await confirm({ title: item.kind === 'image' ? 'Delete this photo for you?' : item.kind === 'file' ? 'Delete this file for you?' : 'Delete this message for you?', body: 'It’s removed from this device only. Everyone else in the room still has it.', confirmLabel: 'Delete for me', danger: true })) chat.deleteForMe(item.id);
  };
  // Who's around: a green dot when someone has Our Space open, "last seen" otherwise (two-person rooms, at the top).
  const online = new Set(room.online || []);
  const solo = others.length === 1 ? room.members.find(m => m.id === others[0]) : null;
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
  const voice = useVoiceRecorder(f => { void attach([f]); }, m => toast(m, { tone: 'error' }));
  const sendGif = async (g: Gif) => {
    setEmojiOpen(false); setProgress('Sending GIF…');
    try { const b = await (await fetch(g.send)).blob(); await chat.sendFile(new File([b], `${(g.title || 'GIF').slice(0, 40)}.gif`, { type: 'image/gif' }), undefined, pmTo); }
    catch (e) { toast((e as Error).message || 'That GIF didn’t send.', { tone: 'error' }); }
    setProgress('');
  };
  // Emoji from the picker go where the cursor is; a suggestion goes at the end of what you've written.
  const insertEmoji = (e: string) => {
    const el = box.current; const at = el ? el.selectionStart ?? text.length : text.length; const end = el ? el.selectionEnd ?? at : at;
    const next = text.slice(0, at) + e + text.slice(end); setText(next);
    setTimeout(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = at + e.length; } }, 0);
  };
  const addSuggestion = (e: string) => { setText(t => t.replace(/\s*$/, ' ') + e + ' '); focusBox(); };
  const suggestions = !editing && !emojiOpen && !voice.on ? suggestEmoji(text) : [];
  const idle = !text.trim() && !staged.length && !editing;
  let lastDay = ''; let lastFrom = '';
  return <div className={`col chat-drop ${dropping ? 'dropping' : ''}`} style={{ flex: 1, minHeight: 0, gap: 0 }} {...dragProps}>
    {dropping && <div className="drop-hint" aria-hidden="true"><Icon name="paperclip" size={22} />Drop to add</div>}
    <div className="chat" style={{ flex: 1 }}>
      <p className="tiny quiet row gap-8" style={{ justifyContent: 'center', padding: '4px 0 10px', textAlign: 'center' }}><Icon name="lock" size={13} />Private. Only people in this room can read it. History stays in this browser.</p>
      {!hideLink && !compact && <div className="link-cta-wrap"><button className="link-cta" onClick={() => setLinking(true)}>
        <span className="center" style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(200,182,255,.18)', color: 'var(--lav)', flex: 'none' }}><Icon name="phone" size={18} /></span>
        <span className="grow"><span className="small" style={{ fontWeight: 600, display: 'block' }}>Bring older chats from your phone</span><span className="tiny muted">Scan a QR code with Our Space on your phone</span></span>
      </button>
        <button className="link-cta-x" aria-label="Hide this (you can find it under You)" title="Hide (it stays under You)" onClick={() => { setHideLink(true); try { localStorage.setItem('ourspace.hideLinkCta', '1'); } catch { /* fine */ } }}><Icon name="x" size={14} /></button></div>}
      {!compact && <div className="chat-presence">
        {solo ? <><span className="presence-av"><Avatar name={solo.name} size={28} />{online.has(solo.id) && <i className="online-dot" />}</span><span className="small" style={{ fontWeight: 600 }}>{firstName(solo.name)}</span><span className="tiny muted">{online.has(solo.id) ? 'Online' : room.lastSeen?.[solo.id] ? `Last seen ${ago(room.lastSeen[solo.id])}` : 'Offline'}</span></>
          : <span className="tiny muted">{online.size ? `${online.size} online` : 'Nobody else online'}</span>}
        <span className="grow" />
        <IconButton size="sm" variant="plain" icon="image" label="Media: photos, files and voice messages" onClick={() => setSheet('media')} />
        <IconButton size="sm" variant="plain" icon="star" label="Starred messages" onClick={() => setSheet('starred')} />
      </div>}
      {!chat.loaded && <p className="small muted">Loading messages…</p>}
      {chat.loaded && !items.length && <div className="col gap-8" style={{ alignItems: 'center', textAlign: 'center', padding: '40px 12px' }}><Icon name="chat" size={28} /><p className="h3">Say hi</p><p className="small muted">Messages, photos and files up to 16 MB. Drop a file here to add it.</p></div>}
      {items.map(i => {
        const day = dayLabel(i.at); const showDay = day !== lastDay; lastDay = day;
        const showName = i.from !== space.user.id && (i.from !== lastFrom || showDay); lastFrom = i.from;
        const mine = i.from === space.user.id; const sent = !i.pending && !i.failed && /^\d+$/.test(i.id);
        return <div key={i.id} style={{ display: 'contents' }}>
          {showDay && <p className="tiny quiet" style={{ textAlign: 'center', margin: '10px 0 4px' }}>{day}</p>}
          <Message item={i} starred={starred.has(i.id)} names={room.members} myId={space.user.id} online={online.has(i.from)} onReplyPrivately={canPrivate && !mine && reachable.some(m => m.id === i.from) ? () => setPrivateTo(i.from) : undefined} status={mine && sent ? statusOf(Number(i.id), others, room.receipts) : null} mine={mine} showName={showName} onReport={() => onReport(i.from, i.text || '')} onDismiss={() => chat.dismiss(i.id)}
            actions={sent && !allBlocked ? { react: e => react(i, e), reply: i.deleted ? undefined : () => startReply(i), edit: mine && !i.deleted && i.kind === 'text' ? () => startEdit(i) : undefined, deleteAll: mine && !i.deleted ? () => void deleteAll(i) : undefined, deleteMine: () => void deleteMine(i), star: i.deleted ? undefined : () => chat.toggleStar(i.id), quote: goTo, photo: (url, name) => setViewer({ url, name }) } : { deleteMine: i.pending ? undefined : () => void deleteMine(i), quote: goTo, photo: (url, name) => setViewer({ url, name }) }} />
        </div>;
      })}
      <div ref={end} />
      {away && <button className="chat-jump" onClick={() => jumpDown()} aria-label={fresh ? `${fresh} new message${fresh > 1 ? 's' : ''}. Go to the newest` : 'Go to the newest message'} title="Go to the newest">
        <Icon name="dbldown" size={18} />{fresh > 0 && <span className="chat-jump-n">{fresh > 99 ? '99+' : fresh}</span>}</button>}
    </div>
    {chat.unreadable > 0 && <div style={{ marginTop: 10 }}><Notice icon="lock">Some messages were sent before this browser joined, or from an older phone app. <button className="lav" onClick={() => setLinking(true)}>Copy them from your phone</button></Notice></div>}
    {linking && <LinkSheet onClose={() => setLinking(false)} />}
    {viewer && <PhotoViewer {...viewer} onClose={() => setViewer(null)} />}
    {camera && <CameraSheet onShot={f => stage([f])} onClose={() => setCamera(false)} />}
    {sheet === 'media' && <MediaSheet items={items} names={names} onOpen={(url, name) => setViewer({ url, name })} onClose={() => setSheet(null)} />}
    {sheet === 'starred' && <StarredSheet items={items} starred={chat.starred} names={names} onGo={goTo} onUnstar={id => chat.toggleStar(id)} onClose={() => setSheet(null)} />}
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
    {(replyTo || editing) && <div className="compose-ctx">
      <Icon name={editing ? 'pencil' : 'reply'} size={15} />
      <div className="grow" style={{ minWidth: 0 }}><span className="tiny" style={{ fontWeight: 600, color: 'var(--lav)' }}>{editing ? 'Editing message' : `Replying to ${replyTo!.from === space.user.id ? 'yourself' : firstName(replyTo!.name)}`}</span>
        <span className="tiny muted ellipsis" style={{ display: 'block' }}>{(editing || replyTo)!.text || ((editing || replyTo)!.kind === 'image' ? 'Photo' : (editing || replyTo)!.file?.name)}</span></div>
      <button className="compose-ctx-x" aria-label="Cancel" onClick={() => { if (editing) setText(''); setEditing(null); setReplyTo(null); }}><Icon name="x" size={14} /></button>
    </div>}
    <div className="composer" style={{ marginTop: canPrivate ? 8 : 12, position: 'relative' }}>
      <input ref={fileInput} type="file" multiple hidden onChange={e => { const f = Array.from(e.target.files || []); e.target.value = ''; if (f.length) stage(f); }} />
      {suggestions.length > 0 && <div className="emoji-suggest" aria-label="Suggested emoji">{suggestions.map(e => <button key={e} onClick={() => addSuggestion(e)} aria-label={`Add ${e}`}>{e}</button>)}</div>}
      {emojiOpen && <EmojiPicker onPick={insertEmoji} onGif={g => void sendGif(g)} onClose={() => setEmojiOpen(false)} />}
      {voice.on ? <div className="rec-bar" role="status">
        <button className="rec-x" onClick={voice.cancel} aria-label="Cancel voice message" title="Cancel"><Icon name="trash" size={17} /></button>
        <i className="rec-dot" style={{ transform: `scale(${1 + voice.level * 1.6})` }} /><span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{clockOf(voice.secs)}</span>
        <span className="tiny muted grow">Recording… {voice.secs >= 270 ? 'stops at 5:00' : ''}</span>
        <IconButton icon="send" variant="accent" label="Send voice message" onClick={voice.stop} />
      </div> : <>
      <div className="attach-wrap">
        <IconButton icon="paperclip" label="Attach: photos, files or camera" aria-haspopup="menu" aria-expanded={attachMenu} onClick={() => setAttachMenu(m => !m)} disabled={!!progress} />
        {attachMenu && <div className="attach-menu" role="menu" onMouseLeave={() => setAttachMenu(false)}>
          <button role="menuitem" onClick={() => { setAttachMenu(false); fileInput.current?.click(); }}><span className="attach-ic" style={{ background: 'rgba(200,182,255,.18)', color: 'var(--lav)' }}><Icon name="image" size={17} /></span>Photos & files</button>
          <button role="menuitem" onClick={() => { setAttachMenu(false); setCamera(true); }}><span className="attach-ic" style={{ background: 'rgba(255,107,129,.16)', color: '#FF8597' }}><Icon name="video" size={17} /></span>Camera</button>
        </div>}
      </div>
      <div className="compose-field">
        <textarea ref={box} aria-label={`Message ${room.name}`} className="input" placeholder={progress || (staged.length ? 'Add a message (optional)' : privateTo ? `Private message to ${privateName}` : 'Message')} value={text} rows={1}
          onChange={e => { setText(e.target.value); e.target.style.height = '44px'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void (editing ? saveEdit() : send()); } else if (e.key === 'Escape' && (editing || replyTo)) { e.preventDefault(); if (editing) setText(''); setEditing(null); setReplyTo(null); } }} onPaste={onPaste} />
        <button className={`emoji-toggle ${emojiOpen ? 'on' : ''}`} onClick={() => setEmojiOpen(o => !o)} aria-label="Emoji and GIFs" title="Emoji and GIFs"><Icon name="smile" size={19} /></button>
      </div>
      {idle && !progress ? <IconButton icon="mic" variant="accent" label="Record a voice message" onClick={() => void voice.start()} />
        : <IconButton icon={editing ? 'check' : 'send'} variant="accent" label={editing ? 'Save the edit' : 'Send message'} onClick={() => void (editing ? saveEdit() : send())} disabled={(!text.trim() && !staged.length) || !!progress} />}
      </>}
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
const QUICK = ['❤️', '😂', '😮', '😢', '🙏', '👍'];
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} h ago`; return new Date(t).toLocaleDateString([], { day: 'numeric', month: 'short' }); };
type Actions = { star?: () => void; react?: (emoji: string) => void; reply?: () => void; edit?: () => void; deleteAll?: () => void; deleteMine?: () => void; quote: (id: string) => void; photo: (url: string, name: string) => void };
function Message({ starred, item, status, mine, showName, onReport, onDismiss, names, myId, onReplyPrivately, online, actions }: { item: ChatItem; status: Status | null; mine: boolean; showName: boolean; onReport: () => void; onDismiss: () => void; names: { id: string; name: string }[]; myId: string; onReplyPrivately?: () => void; online?: boolean; actions: Actions; starred?: boolean }) {
  const [url, setUrl] = useState('');
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(false); // touch: long-press shows the bar
  const [dx, setDx] = useState(0);
  const touch = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout>; swiping: boolean } | null>(null);
  const self = useRef<HTMLDivElement>(null);
  useEffect(() => { if (item.file) void fileUrl(item.file.key).then(setUrl); }, [item.file]);
  useEffect(() => {
    if (!menu && !open) return;
    const away = (e: PointerEvent) => { if (!self.current?.contains(e.target as Node)) { setMenu(false); setOpen(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setOpen(false); } };
    document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [menu, open]);
  const privateLabel = item.to?.length ? (mine ? `Private to ${item.to.map(id => firstName(names.find(m => m.id === id)?.name || 'them')).join(', ')}` : item.to.includes(myId) ? 'Private · only you' : 'Private') : '';
  const nameOf = (id: string) => id === myId ? 'You' : firstName(names.find(m => m.id === id)?.name || 'Someone');
  // Reactions grouped by emoji, like Instagram: 😂 2
  const groups = Object.entries(item.reactions || {}).reduce<Record<string, string[]>>((g, [who, e]) => { (g[e] ||= []).push(who); return g; }, {});
  const mineEmoji = item.reactions?.[myId];
  const hasBar = !!(actions.star || actions.react || actions.reply || actions.edit || actions.deleteAll || actions.deleteMine);
  // Swipe right (left on your own) to reply, like WhatsApp. Hold to open the reactions.
  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, swiping: false, t: setTimeout(() => { if (hasBar) setOpen(true); }, 450) }; };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current; if (!s) return; const t = e.touches[0]; const x = t.clientX - s.x, y = t.clientY - s.y;
    if (Math.abs(x) > 8 || Math.abs(y) > 8) clearTimeout(s.t);
    if (!actions.reply) return;
    if (!s.swiping && Math.abs(x) > 12 && Math.abs(x) > Math.abs(y) * 1.5) s.swiping = true;
    if (s.swiping) setDx(Math.max(0, Math.min(80, mine ? -x : x)));
  };
  const onTouchEnd = () => { const s = touch.current; if (s) clearTimeout(s.t); if (dx > 56) actions.reply?.(); setDx(0); touch.current = null; };
  const body = item.deleted
    ? <div className="bubble deleted"><Icon name="x" size={13} />{mine ? 'You deleted this message' : 'This message was deleted'}</div>
    : item.kind === 'image' && item.file ? (url ? <div className="msg-photo"><button className="msg-photo-open" onClick={() => actions.photo(url, item.file!.name || 'photo.jpg')} aria-label="Open photo"><img src={url} alt={item.file.name} style={photoSize(item.file.w, item.file.h)} /></button>
      <a className="msg-save" href={url} download={item.file.name || 'photo.jpg'} aria-label={`Save ${item.file.name || 'photo'}`} title="Save to this computer"><Icon name="download" size={16} /></a></div> : <div className="skeleton" style={{ width: 220, height: 160 }} />)
      : item.kind === 'file' && item.file && isVoice(item) ? <VoiceBubble url={url} mine={mine} />
      : item.kind === 'file' && item.file ? <a className="bubble row gap-8" href={url || undefined} download={item.file.name} style={{ color: 'inherit' }}><Icon name="file" size={18} /><span className="ellipsis" style={{ maxWidth: 200 }}>{item.file.name}</span><span className="tiny" style={{ opacity: .7 }}>{(item.file.size / 1e6).toFixed(1)} MB</span><span className="file-save"><Icon name="download" size={14} />Save</span></a>
        : <div className="bubble">{item.text}</div>;
  return <div ref={self} data-msg={item.id} className={`msg ${mine ? 'me' : ''} ${item.to?.length ? 'private' : ''} ${item.pending ? 'pending' : ''} ${item.failed ? 'failed' : ''} ${open || menu ? 'open' : ''}`}
    onContextMenu={e => { if (!mine && !item.deleted) { e.preventDefault(); onReport(); } }} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
    {(showName || privateLabel) && <span className="who">{showName && <>{online && <i className="online-dot inline" title="Online" />}{firstName(item.name)}</>}{privateLabel && <span className="pm-tag"><Icon name="lock" size={11} />{privateLabel}</span>}</span>}
    <div className="msg-main" style={dx ? { transform: `translateX(${mine ? -dx : dx}px)` } : undefined}>
      {dx > 0 && <span className="swipe-reply" style={{ opacity: Math.min(1, dx / 56) }}><Icon name="reply" size={16} /></span>}
      {item.re && !item.deleted && <button className="msg-quote" onClick={() => actions.quote(item.re!.id)}><b>{item.re.name}</b><span>{item.re.text}</span></button>}
      {body}
      {hasBar && <div className="msg-bar" role="toolbar" aria-label="Message actions">
        {actions.react && !item.deleted && QUICK.map(e => <button key={e} className={`msg-emoji ${mineEmoji === e ? 'on' : ''}`} onClick={() => { actions.react!(e); setOpen(false); }} aria-label={`React ${e}`}>{e}</button>)}
        {actions.reply && <button className="msg-act" onClick={() => { actions.reply!(); setOpen(false); }} aria-label="Reply" title="Reply"><Icon name="reply" size={15} /></button>}
        {(actions.star || actions.edit || actions.deleteAll || actions.deleteMine) && <button className="msg-act" onClick={() => setMenu(m => !m)} aria-label="More" aria-expanded={menu} title="More"><Icon name="dots" size={16} /></button>}
        {menu && <div className="msg-menu" role="menu">
          {actions.star && <button role="menuitem" onClick={() => { setMenu(false); setOpen(false); actions.star!(); }}><Icon name="star" size={14} />{starred ? 'Unstar' : 'Star'}</button>}
          {actions.edit && <button role="menuitem" onClick={() => { setMenu(false); setOpen(false); actions.edit!(); }}><Icon name="pencil" size={14} />Edit</button>}
          {actions.deleteAll && <button role="menuitem" className="danger" onClick={() => { setMenu(false); setOpen(false); actions.deleteAll!(); }}><Icon name="trash" size={14} />Delete for everyone</button>}
          {actions.deleteMine && <button role="menuitem" className="danger" onClick={() => { setMenu(false); setOpen(false); actions.deleteMine!(); }}><Icon name="trash" size={14} />Delete for me</button>}
          {!mine && !item.deleted && <button role="menuitem" onClick={() => { setMenu(false); onReport(); }}><Icon name="flag" size={14} />Report</button>}
        </div>}
      </div>}
    </div>
    {Object.keys(groups).length > 0 && <div className="msg-reacts">{Object.entries(groups).map(([e, who]) => <button key={e} className={who.includes(myId) ? 'on' : ''} title={who.map(nameOf).join(', ')} onClick={() => actions.react?.(e)}>{e}{who.length > 1 && <span>{who.length}</span>}</button>)}</div>}
    {onReplyPrivately && !item.deleted && <button className="pm-reply tiny" onClick={onReplyPrivately}>Reply privately</button>}
    <span className="tiny quiet" style={{ padding: '0 6px' }}>{item.failed ? <button className="rose" onClick={onDismiss}>Not sent · remove</button> : item.pending ? 'Sending…' : <span className="row" style={{ gap: 3, display: 'inline-flex', alignItems: 'center' }}>{starred && !item.deleted && <span className="msg-star" title="Starred"><Icon name="star" size={11} fill /></span>}{item.edited && !item.deleted && <span className="msg-edited">Edited ·</span>}{time(item.at)}{status && !item.deleted && <span title={STATUS_LABEL[status]} aria-label={STATUS_LABEL[status]} style={{ display: 'inline-flex', color: status === 'read' ? '#8EC5FF' : undefined }}><Icon name={status === 'sent' ? 'check' : 'checks'} size={14} stroke={2} /></span>}</span>}</span>
  </div>;
}

/** A photo opened on top of the page (not a new tab): Esc, the X or a click outside closes it; Save downloads it. */
function PhotoViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key, true); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(<div className="photo-view" role="dialog" aria-label={name} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="photo-view-top">
      <span className="small ellipsis" style={{ minWidth: 0 }}>{name}</span>
      <a className="photo-view-btn" href={url} download={name} title="Download"><Icon name="download" size={18} /><span>Download</span></a>
      <button className="photo-view-btn round" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)"><Icon name="x" size={20} /></button>
    </div>
    <img src={url} alt={name} onMouseDown={e => e.stopPropagation()} />
  </div>, document.body);
}
