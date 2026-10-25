import { useState } from 'react';
import type { Room } from '../lib/model';
import { useSpace } from '../lib/space';
import { inviteMessage, webJoinLink } from '../lib/invite';
import { REPORT_REASONS, blockUser, isBlockedId, reportUser, unblockUser, useBlocked } from '../lib/safety';
import { useCall } from './Call';
import { Avatar, Button, IconButton, Notice, Sheet, copyText, firstName, useConfirm, useToast } from './ui';
import { Icon } from './Icon';

export function PeoplePanel({ room }: { room: Room }) {
  const space = useSpace();
  const call = useCall();
  const toast = useToast();
  const confirm = useConfirm();
  const blocked = useBlocked(space.api);
  const [report, setReport] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState('');
  const admin = room.hostId === space.user.id;
  const others = room.members.filter(m => m.id !== space.user.id);
  const decide = async (id: string, ok: boolean) => {
    setBusy(id);
    try { await space.approve(room.code, id, ok); toast(ok ? 'They’re in.' : 'Request declined.', { icon: ok ? 'check' : 'x' }); }
    catch (e) { toast((e as Error).message, { tone: 'error' }); } finally { setBusy(''); }
  };
  return <div className="col gap-16">
    {admin && room.requests.length > 0 && <div className="col gap-8">
      <p className="small muted">Waiting to come in</p>
      {room.requests.map(p => <div key={p.id} className="inset row" style={{ padding: 12 }}>
        <Avatar name={p.name} size={38} /><span className="grow h3 ellipsis">{p.name}</span>
        <Button size="sm" variant="secondary" disabled={busy === p.id} onClick={() => void decide(p.id, false)}>Not now</Button>
        <Button size="sm" busy={busy === p.id} onClick={() => void decide(p.id, true)}>Let them in</Button>
      </div>)}
    </div>}
    {others.length > 1 && !call.activeCode && <div className="inset row" style={{ padding: 12 }}>
      <span className="center" style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--lav-soft)', color: 'var(--lav)' }}><Icon name="users" size={18} /></span>
      <div className="grow"><p className="h3">Call the room</p><p className="tiny muted">Rings everyone together</p></div>
      <IconButton size="sm" icon="phone" label="Voice call the room" onClick={() => call.start(room.code, others, false, room.name)} />
      <IconButton size="sm" icon="video" label="Video call the room" onClick={() => call.start(room.code, others, true, room.name)} />
    </div>}
    <div className="list">
      {room.members.map(m => {
        const me = m.id === space.user.id; const isBlocked = isBlockedId(blocked, m.id);
        return <div key={m.id} className="list-row" style={{ padding: '10px 8px' }}>
          <Avatar name={m.name} size={40} />
          <div className="grow"><p className="h3 ellipsis">{m.name}{me && <span className="muted" style={{ fontWeight: 400 }}> (you)</span>}</p><p className="tiny muted">{m.id === room.hostId ? 'Admin' : isBlocked ? 'Blocked' : 'Member'}</p></div>
          {!me && !call.activeCode && !isBlocked && <>
            <IconButton size="sm" variant="plain" icon="phone" label={`Voice call ${m.name}`} onClick={() => call.start(room.code, [m], false, m.name)} />
            <IconButton size="sm" variant="plain" icon="video" label={`Video call ${m.name}`} onClick={() => call.start(room.code, [m], true, m.name)} />
          </>}
          {!me && <IconButton size="sm" variant="plain" icon="dots" label={`More for ${m.name}`} onClick={() => setReport(m)} />}
        </div>;
      })}
    </div>
    {others.length === 0 && <InviteCard room={room} />}
    {others.length > 0 && <InviteCard room={room} quiet />}
    {report && <PersonSheet room={room} person={report} admin={admin} blocked={isBlockedId(blocked, report.id)} onClose={() => setReport(null)}
      onRemove={async () => { if (await confirm({ title: `Remove ${firstName(report.name)} from ${room.name}?`, body: 'They can ask to join again with the code.', confirmLabel: 'Remove', danger: true })) { await space.removeMember(room.code, report.id); toast(`${firstName(report.name)} was removed.`); setReport(null); } }}
      onBlock={async () => { const b = isBlockedId(blocked, report.id); if (b) await unblockUser(space.api, report.id); else await blockUser(space.api, report.id); toast(b ? 'Unblocked.' : `${firstName(report.name)} is blocked. You won’t see their messages or calls.`); setReport(null); }} />}
  </div>;
}

export function InviteCard({ room, quiet }: { room: Room; quiet?: boolean }) {
  const toast = useToast();
  const share = async () => {
    const text = inviteMessage(room.code, room.name);
    if (navigator.share) { try { await navigator.share({ title: 'Join me on Our Space', text }); return; } catch { /* cancelled */ } }
    if (await copyText(text)) toast('Invite copied. Paste it in any chat.', { icon: 'copy' });
  };
  if (quiet) return <Button variant="ghost" icon="share" onClick={() => void share()} style={{ alignSelf: 'flex-start' }}>Invite someone</Button>;
  return <div className="inset col gap-16" style={{ padding: 20 }}>
    <div><p className="h3">Invite your person</p><p className="small muted">Send the code or a link. You’ll approve them before they come in.</p></div>
    <button className="row between" onClick={async () => { if (await copyText(room.code)) toast('Code copied.', { icon: 'copy' }); }} style={{ padding: '12px 16px', borderRadius: 14, background: 'rgba(5,8,18,.45)', border: '1px solid var(--edge)' }}>
      <span style={{ fontSize: 24, letterSpacing: '.3em', fontWeight: 600 }}>{room.code}</span><Icon name="copy" />
    </button>
    <div className="row gap-8 wrap"><Button icon="share" onClick={() => void share()}>Send an invite</Button><Button variant="secondary" icon="link" onClick={async () => { if (await copyText(webJoinLink(room.code))) toast('Link copied.', { icon: 'link' }); }}>Copy link</Button></div>
  </div>;
}

function PersonSheet({ room, person, admin, blocked, onClose, onRemove, onBlock }: { room: Room; person: { id: string; name: string }; admin: boolean; blocked: boolean; onClose: () => void; onRemove: () => Promise<void>; onBlock: () => Promise<void> }) {
  const space = useSpace();
  const toast = useToast();
  const [reason, setReason] = useState(''); const [details, setDetails] = useState(''); const [alsoBlock, setAlsoBlock] = useState(true);
  const [mode, setMode] = useState<'menu' | 'report'>('menu'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const send = async () => {
    setBusy(true); setError('');
    try { await reportUser(space.api, { userId: person.id, reason, details, roomCode: room.code, block: alsoBlock }); toast('Thanks — we’ll review it. Reports are private.'); onClose(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  if (mode === 'report') return <Sheet title={`Report ${firstName(person.name)}`} sub="Tell us what happened. They won’t know who reported them." onClose={onClose} back={() => setMode('menu')}
    footer={<Button block busy={busy} disabled={!reason} onClick={() => void send()}>Send report</Button>}>
    <div className="col gap-8">{REPORT_REASONS.map(r => <button key={r.id} className={`chip ${reason === r.id ? 'on' : ''}`} style={{ justifyContent: 'flex-start', height: 44 }} onClick={() => setReason(r.id)}>{r.label}</button>)}</div>
    <textarea className="input" placeholder="Anything else (optional)" maxLength={500} value={details} onChange={e => setDetails(e.target.value)} />
    <label className="row gap-8 small"><input type="checkbox" checked={alsoBlock} onChange={e => setAlsoBlock(e.target.checked)} /> Also block {firstName(person.name)}</label>
    {error && <Notice tone="error">{error}</Notice>}
  </Sheet>;
  return <Sheet title={person.name} onClose={onClose}>
    <div className="col gap-8">
      {admin && <Button variant="secondary" icon="logout" onClick={() => void onRemove()}>Remove from room</Button>}
      <Button variant="secondary" icon="shield" onClick={() => void onBlock()}>{blocked ? 'Unblock' : 'Block'}</Button>
      <Button variant="quiet-danger" icon="flag" onClick={() => setMode('report')}>Report</Button>
    </div>
  </Sheet>;
}
