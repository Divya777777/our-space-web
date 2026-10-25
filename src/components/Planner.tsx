// Plans: study dates, movie dates, playdates. Same server as the app (the server sends the 1-hour reminder push).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSpace } from '../lib/space';
import { KINDS, Plan, PlanDraft, PlanKind, defaultStart, livePlanner, untilText, whenText } from '../lib/planner';
import { Button, Notice, Sheet, Skeleton, firstName, useConfirm, useToast } from './ui';
import { Icon } from './Icon';

export function Plans({ code, compact }: { code?: string; compact?: boolean }) {
  const space = useSpace();
  const toast = useToast();
  const confirm = useConfirm();
  const api = useMemo(() => livePlanner(space.api), [space.api]);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [edit, setEdit] = useState<Plan | 'new' | null>(null);
  const load = useCallback(() => api.list(code).then(setPlans).catch(() => setPlans(p => p || [])), [api, code]);
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 60000); return () => clearInterval(t); }, [load]);
  const upcoming = (plans || []).filter(p => p.startsAt > Date.now() - 3 * 3600e3);
  const rooms = code ? space.rooms.filter(r => r.code === code) : space.rooms;
  return <div className="col gap-8">
    {plans === null ? <><Skeleton h={58} /><Skeleton h={58} /></>
      : upcoming.length === 0 ? <div className="inset row" style={{ padding: 16 }}>
        <span className="icon-btn plain" style={{ background: 'var(--lav-soft)', color: 'var(--lav)' }}><Icon name="calendar" /></span>
        <div className="grow"><p className="h3">Nothing planned yet</p><p className="small muted">Set a movie night or a study date. Everyone in the room gets a reminder an hour before.</p></div>
        {!compact && rooms.length > 0 && <Button size="sm" variant="secondary" onClick={() => setEdit('new')}>Plan something</Button>}
      </div>
        : upcoming.slice(0, compact ? 3 : 6).map(p => <button key={p.id} className="list-row inset" style={{ padding: '12px 14px' }} onClick={() => setEdit(p)}>
          <span className="center" style={{ width: 40, height: 40, borderRadius: 12, background: KINDS[p.kind].color + '22', color: KINDS[p.kind].color, flex: 'none' }}><Icon name={KINDS[p.kind].icon} /></span>
          <span className="grow"><span className="h3 ellipsis" style={{ display: 'block' }}>{p.title}</span><span className="small muted">{whenText(p.startsAt)}{!code && ` · ${p.roomName}`}</span></span>
          <span className="small lav" style={{ fontWeight: 600 }}>{untilText(p.startsAt)}</span>
        </button>)}
    {(compact || upcoming.length > 0) && rooms.length > 0 && <Button variant="ghost" size="sm" icon="plus" onClick={() => setEdit('new')} style={{ alignSelf: 'flex-start' }}>Plan something</Button>}
    {edit && <PlanSheet plan={edit === 'new' ? null : edit} rooms={rooms} onClose={() => setEdit(null)}
      onSave={async (d, existing) => { if (existing) await api.update(existing.id, d); else await api.create(d); toast(existing ? 'Plan moved. Everyone sees the new time.' : 'Planned. Everyone in the room can see it.', { icon: 'calendar' }); setEdit(null); void load(); }}
      onCancel={async p => { if (await confirm({ title: `Cancel “${p.title}”?`, body: 'It disappears for everyone in the room.', confirmLabel: 'Cancel plan', danger: true })) { await api.cancel(p); setEdit(null); void load(); } }} />}
  </div>;
}

const toLocalInput = (ms: number) => { const d = new Date(ms); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
function PlanSheet({ plan, rooms, onClose, onSave, onCancel }: { plan: Plan | null; rooms: { code: string; name: string }[]; onClose: () => void; onSave: (d: PlanDraft, existing: Plan | null) => Promise<void>; onCancel: (p: Plan) => Promise<void> }) {
  const space = useSpace();
  const [d, setD] = useState<PlanDraft>(() => plan ? { kind: plan.kind, title: plan.title, note: plan.note, startsAt: plan.startsAt, code: plan.code } : { kind: 'movie', title: '', note: '', startsAt: defaultStart(), code: rooms[0]?.code || '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const readOnly = !!plan && !plan.mine && space.rooms.find(r => r.code === plan.code)?.hostId !== space.user.id;
  const save = async () => {
    if (d.startsAt < Date.now() - 60000) { setError('Pick a time that hasn’t passed yet.'); return; }
    setBusy(true); setError('');
    try { await onSave({ ...d, title: d.title.trim() || KINDS[d.kind].label }, plan); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <Sheet title={plan ? (readOnly ? plan.title : 'Edit plan') : 'Plan something'} sub={plan && readOnly ? `Planned by ${firstName(plan.by.name)} · ${whenText(plan.startsAt)}` : 'Everyone in the room sees it and gets a reminder an hour before.'} onClose={onClose}
    footer={readOnly ? undefined : <div className="col gap-8"><Button block busy={busy} onClick={() => void save()}>{plan ? 'Save changes' : 'Add plan'}</Button>{plan && <Button variant="quiet-danger" onClick={() => void onCancel(plan)}>Cancel this plan</Button>}</div>}>
    {readOnly ? <p className="muted">{plan!.note || 'No note.'}</p> : <>
      <div className="chips">{(Object.keys(KINDS) as PlanKind[]).map(k => <button key={k} className={`chip ${d.kind === k ? 'on' : ''}`} onClick={() => setD({ ...d, kind: k })}><Icon name={KINDS[k].icon} size={15} />{KINDS[k].label}</button>)}</div>
      <div className="field"><label htmlFor="plan-title">What</label><input id="plan-title" className="input" maxLength={60} placeholder={KINDS[d.kind].label} value={d.title} onChange={e => setD({ ...d, title: e.target.value })} /></div>
      <div className="field"><label htmlFor="plan-when">When</label><input id="plan-when" type="datetime-local" className="input" value={toLocalInput(d.startsAt)} onChange={e => { const t = new Date(e.target.value).getTime(); if (!Number.isNaN(t)) setD({ ...d, startsAt: t }); }} /></div>
      {!plan && rooms.length > 1 && <div className="field"><label htmlFor="plan-room">Room</label><select id="plan-room" className="input" value={d.code} onChange={e => setD({ ...d, code: e.target.value })}>{rooms.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select></div>}
      <div className="field"><label htmlFor="plan-note">Note (optional)</label><input id="plan-note" className="input" maxLength={120} placeholder="Popcorn ready by 8:45" value={d.note} onChange={e => setD({ ...d, note: e.target.value })} /></div>
      {error && <Notice tone="error">{error}</Notice>}
    </>}
  </Sheet>;
}
