// Goals: daily score rings for you and your person, goal cards, add a goal in two steps, and the monthly record.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSpace } from '../lib/space';
import { Goal, GoalDraft, GoalPerson, GoalsMonth, GoalsToday, TEMPLATES, done, liveGoals, localDay, monthKey, newDraft } from '../lib/goals';

import { Avatar, Button, IconButton, Notice, Segments, Sheet, Skeleton, useConfirm, useToast } from './ui';
import { Icon, IconName } from './Icon';
import { GetAppPrompt } from './GetApp';

const fmt = (n: number) => Number(n).toLocaleString();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const score = (list: Goal[], who: 'me' | 'them') => list.length ? Math.round(list.filter(g => done(g, who)).length / list.length * 100) : 0;
const cache = new Map<string, GoalsToday>();

function Ring({ pct, color, label, sub }: { pct: number; color: string; label: string; sub: string }) {
  // A dotted gauge: each dot lights up as the day fills.
  const size = 104, n = 44, r = size / 2 - 6, on = Math.round(Math.max(0, Math.min(100, pct)) / 100 * n);
  return <div className="col gap-4" style={{ alignItems: 'center', flex: 1 }}>
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg className="dot-ring" width={size} height={size}>{Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 - Math.PI / 2; return <circle key={i} className="dot" cx={size / 2 + Math.cos(a) * r} cy={size / 2 + Math.sin(a) * r} r={i < on ? 2.4 : 1.6} fill={i < on ? color : 'rgba(255,255,255,.14)'} />; })}</svg>
      <span className="center dots-text" style={{ position: 'absolute', inset: 0, fontSize: 22 }}>{pct}%</span>
    </div>
    <span className="h3">{label}</span><span className="tiny muted">{sub}</span>
  </div>;
}

export function GoalsPanel({ code, version }: { code: string; version?: number }) {
  const space = useSpace();
  const toast = useToast();
  const confirm = useConfirm();
  const api = useMemo(() => liveGoals(space.api, code), [space.api, code]);
  const [data, setData] = useState<GoalsToday | null>(() => cache.get(code)?.day === localDay() ? cache.get(code)! : null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'together' | 'mine' | 'theirs'>('all');
  const [draft, setDraft] = useState<GoalDraft | null>(null);
  const [month, setMonth] = useState(false);
  // Quick clicks on + / − / ✓ change the number at once and are saved together a moment after the last click.
  // Clicks not saved yet win over a reload, so the count never jumps back.
  const pending = useRef(new Map<string, { value: number; was: number; timer?: ReturnType<typeof setTimeout> }>());
  const dataRef = useRef<GoalsToday | null>(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const load = useCallback(async () => {
    try {
      const fetched = await api.today(localDay());
      const next = pending.current.size ? { ...fetched, goals: fetched.goals.map(g => pending.current.has(g.id) ? { ...g, me: pending.current.get(g.id)!.value } : g) } : fetched;
      cache.set(code, next); setData(next); setError('');
    }
    catch (e) { setError((e as Error).message || 'Could not load goals.'); }
  }, [api, code]);
  useEffect(() => { void load(); const t = setInterval(() => { if (!document.hidden) void load(); }, 60000); return () => clearInterval(t); }, [load]);
  const seen = useRef(version);
  useEffect(() => { if (version !== undefined && seen.current !== version) { const first = seen.current === undefined; seen.current = version; if (!first) void load(); } }, [version, load]);

  // Three or more people in the room: goals are for chosen people ("Goal is for"); two people: exactly as before.
  const roomNow = space.rooms.find(r => r.code === code);
  const members = (roomNow?.members || []).filter(m => m.id !== space.user.id).map(m => ({ id: m.id, name: m.name }));
  const group = members.length >= 2;
  if (!data) return error ? <Notice tone="error">{error} <button className="lav" onClick={() => void load()}>Try again</button></Notice> : <div className="col gap-8"><Skeleton h={150} /><Skeleton h={70} /><Skeleton h={70} /></div>;
  const partner = data.partner?.name.split(' ')[0] || 'Partner';
  const patch = (id: string, change: Partial<Goal>) => setData(d => d && { ...d, goals: d.goals.map(g => g.id === id ? { ...g, ...change } : g) });
  const flush = (id: string) => {
    const entry = pending.current.get(id); if (!entry) return;
    entry.timer = undefined;
    const sent = entry.value;
    void api.progress(id, localDay(), sent).then(() => {
      if (pending.current.get(id) === entry && entry.value === sent) pending.current.delete(id);
    }).catch(e => {
      if (pending.current.get(id) !== entry || entry.value !== sent) return;
      pending.current.delete(id); patch(id, { me: entry.was }); toast((e as Error).message, { tone: 'error' });
    });
  };
  /** `update` gets the newest value (including clicks not saved yet). */
  const setValue = (g: Goal, update: (current: number) => number) => {
    const entry = pending.current.get(g.id);
    const before = entry ? entry.value : (dataRef.current?.goals.find(x => x.id === g.id)?.me ?? g.me ?? 0);
    const value = update(before);
    if (value === before) return;
    patch(g.id, { me: value });
    if (dataRef.current) dataRef.current = { ...dataRef.current, goals: dataRef.current.goals.map(x => x.id === g.id ? { ...x, me: value } : x) };
    if (before < g.target && value >= g.target) toast(`Done: ${g.name}`, { icon: 'check' });
    const next = entry || { value, was: before };
    next.value = value;
    if (next.timer) clearTimeout(next.timer);
    next.timer = setTimeout(() => flush(g.id), 450);
    pending.current.set(g.id, next);
  };
  const mineList = data.goals.filter(g => g.me !== null && !g.invited);
  const theirList = data.goals.filter(g => g.them !== null && !g.pending);
  // Group rooms: the second ring is everyone else on shared goals (each person on each goal they joined).
  const othersOnGoals = group ? data.goals.flatMap(g => (g.people || []).filter(p => p.joined && p.id !== space.user.id).map(p => (p.value ?? 0) >= g.target)) : [];
  const ms = score(mineList, 'me'), ts = group ? (othersOnGoals.length ? Math.round(othersOnGoals.filter(Boolean).length / othersOnGoals.length * 100) : 0) : score(theirList, 'them');
  const left = mineList.filter(g => !done(g, 'me')).length;
  const taken = new Set(data.goals.filter(g => g.kind !== 'custom' && g.me !== null).map(g => g.kind));
  const nudge = !data.goals.length ? `Add a goal for today — just yours, or one you and ${partner} both do.` : ms === 100 && ts === 100 ? 'Perfect day for both of you.' : left === 0 ? `You’re done for today. ${partner} has ${theirList.filter(g => !done(g, 'them')).length} left — send a cheer.` : `${left} left for you today.`;
  const list = data.goals.filter(g => filter === 'all' || (filter === 'together' && g.owner === 'both') || (filter === 'mine' && g.owner === 'me') || (filter === 'theirs' && g.owner === 'them'));

  return <div className="col gap-16">
    <div className="row between"><span className="small muted">{new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</span><Button size="sm" variant="ghost" onClick={() => setMonth(true)}>This month</Button></div>
    <div className="inset col gap-16" style={{ padding: 16 }}>
      <div className="row"><Ring pct={ms} color="var(--lav)" label="You" sub={`${mineList.filter(g => done(g, 'me')).length} of ${mineList.length} done`} />{group ? <Ring pct={ts} color="var(--mint)" label="Everyone else" sub={`${othersOnGoals.filter(Boolean).length} of ${othersOnGoals.length} done on shared goals`} /> : <Ring pct={ts} color="var(--mint)" label={partner} sub={`${theirList.filter(g => done(g, 'them')).length} of ${theirList.length} done`} />}</div>
      <p className="small row gap-8" style={{ background: 'rgba(255,255,255,.05)', padding: '10px 12px', borderRadius: 12 }}><Icon name="moon" size={16} />{nudge}</p>
    </div>
    <Segments label="Filter goals" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'together', label: 'Together' }, { value: 'mine', label: 'Mine' }, { value: 'theirs', label: group ? 'Others’' : `${partner}’s` }]} />
    {list.map(g => <GoalCard key={g.id} g={g} partner={partner} myId={space.user.id} group={group} onSet={v => setValue(g, v)}
      onCheerPerson={p => { patch(g.id, { people: (g.people || []).map(x => x.id === p.id ? { ...x, cheeredByMe: true } : x), cheered: true }); void api.cheer(g.id, localDay(), p.id).then(() => toast(`Cheered ${p.name.split(' ')[0]}`, { icon: 'check' })).catch(e => toast((e as Error).message, { tone: 'error' })); }}
      onCheer={() => { if (g.cheered) return; patch(g.id, { cheered: true }); void api.cheer(g.id, localDay()).catch(() => patch(g.id, { cheered: false })); }}
      onJoin={() => { patch(g.id, { invited: false, me: 0 }); void api.join(g.id).then(load).catch(e => toast((e as Error).message, { tone: 'error' })); }}
      onRemove={async () => { if (await confirm({ title: `Remove “${g.name}”?`, body: 'It stops from today. Earlier days stay in your monthly record.', confirmLabel: 'Remove goal', danger: true })) { setData(d => d && { ...d, goals: d.goals.filter(x => x.id !== g.id) }); void api.remove(g.id, localDay()).catch(() => void load()); } }} />)}
    {!list.length && <p className="small muted" style={{ textAlign: 'center', padding: 12 }}>No goals here yet.</p>}
    <Button variant="secondary" icon="plus" onClick={() => { const d = newDraft(); const free = TEMPLATES.find(x => !taken.has(x.kind)) || TEMPLATES[5]; setDraft({ ...d, kind: free.kind, name: free.name, target: free.target, unit: free.unit, track: free.track, inc: free.inc }); }}>Add a goal</Button>
    {draft && <AddGoal draft={draft} taken={taken} partner={partner} hasPartner={!!data.partner} members={group ? members : null} onChange={setDraft} onClose={() => setDraft(null)}
      onSave={async d => { const send = group ? { ...d, people: d.people || [], owner: (d.people?.length ? 'both' : 'me') as GoalDraft['owner'] } : d; await api.create(send, localDay()); setDraft(null); const n = send.people?.length || 0; toast(group ? (n ? `Added — ${n === 1 ? members.find(m => m.id === send.people![0])?.name.split(' ')[0] || '1 person' : `${n} people`} ${n === 1 ? 'was' : 'were'} asked to join` : 'Goal added to today') : d.owner === 'both' ? `Added — ${partner} was asked to join` : 'Goal added to today', { icon: 'check' }); void load(); }} />}
    {month && <MonthSheet load={(m, today) => api.month(m, today)} partner={partner} solo={group} onClose={() => setMonth(false)} />}
  </div>;
}

function GoalCard({ g, partner, myId, group, onSet, onCheer, onCheerPerson, onJoin, onRemove }: { g: Goal; partner: string; myId: string; group: boolean; onSet: (update: (current: number) => number) => void; onCheer: () => void; onCheerPerson: (p: GoalPerson) => void; onJoin: () => void; onRemove: () => void }) {
  const text = (who: 'me' | 'them') => g.track === 'check' ? (done(g, who) ? 'Done' : 'Not yet') : `${fmt(g[who] ?? 0)} / ${fmt(g.target)}${g.unit ? ' ' + g.unit : ''}`;
  const bar = (who: 'me' | 'them', color: string, name: string) => <div className="row gap-8"><span className="tiny muted ellipsis" style={{ width: 52 }}>{name}</span><div className="bar"><i style={{ width: `${Math.min(100, (g[who] ?? 0) / g.target * 100)}%`, background: color }} /></div><span className="tiny" style={{ minWidth: 92, textAlign: 'right' }}>{done(g, who) && <span className="mint">✓ </span>}{text(who)}</span></div>;
  let control: React.ReactNode = null;
  const phoneOnly = g.kind === 'steps' && g.owner !== 'them' && !g.invited;
  if (g.invited) control = <Button size="sm" onClick={onJoin}>Join</Button>;
  else if (phoneOnly) control = null;
  else if (g.owner !== 'them') control = g.track === 'check'
    ? <button role="checkbox" aria-checked={done(g, 'me')} aria-label={`Mark ${g.name} done`} onClick={() => onSet(cur => (cur >= g.target ? 0 : 1))} className="center" style={{ width: 40, height: 40, borderRadius: 12, border: `2px solid ${done(g, 'me') ? 'var(--mint)' : 'var(--edge-lit)'}`, background: done(g, 'me') ? 'var(--mint)' : 'transparent', color: 'var(--void)' }}>{done(g, 'me') && <Icon name="check" stroke={2.6} />}</button>
    : <div className="row gap-8"><IconButton size="sm" icon="minus" label={`Remove ${g.inc} ${g.unit}`} onClick={() => onSet(cur => Math.max(0, cur - g.inc))} /><button className="btn primary sm" style={{ padding: '0 12px' }} onClick={() => onSet(cur => Math.min(g.target * 3, cur + g.inc))} aria-label={`Add ${g.inc} ${g.unit}`}><Icon name="plus" size={15} stroke={2.4} />{fmt(g.inc)}</button></div>;
  else control = <Button size="sm" variant="secondary" onClick={onCheer}>{g.cheered ? 'Cheered' : 'Cheer'}</Button>;
  // Group rooms: a shared goal lists everyone it's for, best first, with a cheer for each person.
  const people = group && g.owner === 'both' && g.people?.length ? g.people : null;
  // A group goal you're not part of: nothing to log, only cheering the others.
  if (people && g.me === null && !g.invited) control = null;
  const ranked = people ? [...people].sort((a, b) => (b.value ?? -1) - (a.value ?? -1)) : [];
  const first = (n: string) => n.split(' ')[0];
  return <div className="inset col gap-8" style={{ padding: 14 }}>
    <div className="row">
      <span className="center" style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,.06)', color: g.owner === 'them' ? 'var(--mint)' : 'var(--lav)', flex: 'none' }}><Icon name={(['steps', 'water', 'pushups', 'workout', 'read'].includes(g.kind) ? g.kind : 'custom') as IconName} /></span>
      <div className="grow"><p className="h3">{g.name}</p><div className="row gap-4 wrap" style={{ marginTop: 4 }}>
        <span className={`tag ${g.owner === 'both' ? 'lav' : g.owner === 'me' ? 'plain' : 'mint'}`}>{g.owner === 'both' ? (people ? `Together · ${people.length}` : 'Together') : g.owner === 'me' ? 'Mine' : group ? 'Theirs' : `${partner}’s`}</span>
        {g.pending && <span className="tag gold">Invite sent</span>}{g.cheeredMe && <span className="tag mint">{partner} cheered</span>}
      </div></div>
      {control}
      {(g.mine || g.owner === 'me') && <IconButton size="sm" variant="plain" icon="trash" label={`Remove ${g.name}`} onClick={onRemove} />}
    </div>
    {people ? (g.invited ? <p className="tiny muted">You’re invited to do this with {people.filter(p => p.id !== myId && p.joined).map(p => first(p.name)).join(', ') || 'the others'}.</p> : <div className="col gap-8">
      {ranked.map(p => <div key={p.id} className="row gap-8">
        <Avatar name={p.name} size={24} />
        <span className="tiny ellipsis" style={{ width: 64 }}>{p.id === myId ? 'You' : first(p.name)}</span>
        {p.joined ? <div className="bar"><i style={{ width: `${Math.min(100, (p.value ?? 0) / g.target * 100)}%`, background: p.id === myId ? 'var(--lav)' : 'var(--mint)' }} /></div> : <span className="tiny muted grow">Invited</span>}
        <span className="tiny" style={{ minWidth: 70, textAlign: 'right' }}>{p.joined ? (g.track === 'check' ? ((p.value ?? 0) >= g.target ? 'Done' : 'Not yet') : `${fmt(p.value ?? 0)}${g.target > 1 ? ' / ' + fmt(g.target) : ''}`) : ''}</span>
        {p.id !== myId && p.joined && <button className="tiny lav" style={{ minWidth: 56, fontWeight: 600, opacity: p.cheeredByMe ? .5 : 1 }} disabled={!!p.cheeredByMe || !!g.cheered} onClick={() => onCheerPerson(p)}>{p.cheeredByMe ? 'Cheered' : 'Cheer'}</button>}
      </div>)}
    </div>) : g.owner === 'both' ? (g.invited ? <p className="tiny muted">{partner} asked you to do this together.</p> : <>{bar('me', 'var(--lav)', 'You')}{g.pending ? <p className="tiny muted">{partner} will see this as a request to join.</p> : bar('them', 'var(--mint)', partner)}</>)
      : g.track === 'check' ? null : bar(g.owner === 'me' ? 'me' : 'them', g.owner === 'me' ? 'var(--lav)' : 'var(--mint)', g.owner === 'me' ? 'You' : partner)}
    {phoneOnly && <GetAppPrompt compact text="Your steps count automatically in the Our Space phone app." reason="Steps are counted by your phone’s health app (Google Health Connect or Apple Health), so they need the phone app." />}
  </div>;
}

function AddGoal({ draft: d, taken, partner, hasPartner, members, onChange, onClose, onSave }: { draft: GoalDraft; taken: Set<string>; partner: string; hasPartner: boolean; members: { id: string; name: string }[] | null; onChange: (d: GoalDraft) => void; onClose: () => void; onSave: (d: GoalDraft) => Promise<void> }) {
  const [step, setStep] = useState<1 | 2>(1); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const set = (c: Partial<GoalDraft>) => onChange({ ...d, ...c });
  const t = TEMPLATES.find(x => x.kind === d.kind) || TEMPLATES[5];
  const unitStep = d.kind === 'steps' ? 1000 : d.inc >= 10 ? 5 : 1;
  if (step === 1) return <Sheet title="New goal" sub="Step 1 of 2 · What" onClose={onClose} footer={<Button block disabled={!d.name.trim()} onClick={() => setStep(2)}>Continue</Button>}>
    <div className="chips">{TEMPLATES.map(x => <button key={x.kind} disabled={taken.has(x.kind)} className={`chip ${x.kind === d.kind ? 'on' : ''}`} style={taken.has(x.kind) ? { opacity: .4 } : undefined} onClick={() => set({ kind: x.kind, name: x.name, target: x.target, unit: x.unit, track: x.track, inc: x.inc })}><Icon name={(x.kind === 'custom' ? 'custom' : x.kind) as IconName} size={15} />{x.label}{taken.has(x.kind) && ' · added'}</button>)}</div>
    <div className="field"><label htmlFor="goal-name">Goal name</label><input id="goal-name" className="input" maxLength={40} placeholder="e.g. Sleep by 11:30 pm" value={d.name} onChange={e => set({ name: e.target.value })} /></div>
    {d.track !== 'check' && <div className="field"><label>Daily target</label><div className="row gap-8"><IconButton icon="minus" label="Lower target" onClick={() => set({ target: Math.max(unitStep, d.target - unitStep) })} /><div className="input center grow" style={{ fontWeight: 600, fontSize: 18 }}>{fmt(d.target)} <span className="small muted" style={{ marginLeft: 6 }}>{d.unit}</span></div><IconButton icon="plus" label="Raise target" onClick={() => set({ target: d.target + unitStep })} /></div></div>}
    {d.kind === 'steps' ? <GetAppPrompt text="Steps are counted by the phone app. Install it to track this goal — you can add it here now." reason="Steps are counted by your phone’s health app (Google Health Connect or Apple Health), so they need the phone app." /> : <p className="small muted">{t.how('your phone’s health app')}</p>}
  </Sheet>;
  const spans: [GoalDraft['span'], string][] = [['month', `Every day in ${MONTHS[new Date().getMonth()]}`], ['ongoing', 'Every day, ongoing'], ['weekdays', 'Weekdays only']];
  const who = (k: 'me' | 'both', title: string, body: string, disabled = false) => <button role="radio" aria-checked={d.owner === k} disabled={disabled} onClick={() => set({ owner: k })} className="inset row" style={{ padding: 16, textAlign: 'left', borderColor: d.owner === k ? 'var(--lav)' : undefined, opacity: disabled ? .5 : 1 }}>
    <div className="grow"><p className="h3">{title}</p><p className="small muted">{body}</p></div><span style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${d.owner === k ? 'var(--lav)' : 'var(--edge-lit)'}`, background: d.owner === k ? 'radial-gradient(circle, var(--lav) 45%, transparent 50%)' : 'none' }} /></button>;
  const save = async () => { setBusy(true); setError(''); try { await onSave(d); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  if (members) return <Sheet title="New goal" sub={`Step 2 of 2 · ${d.name}`} onClose={onClose} back={() => setStep(1)}
    footer={<Button block busy={busy} onClick={() => void save()}>{d.people?.length ? `Add & invite ${d.people.length}` : 'Add goal'}</Button>}>
    <GoalPeople members={members} value={d.people || []} onChange={people => set({ people })} />
    <div className="chips">{spans.map(([k, l]) => <button key={k} className={`chip ${d.span === k ? 'on' : ''}`} onClick={() => set({ span: k })}>{l}</button>)}</div>
    <label className="row gap-8 small"><input type="checkbox" checked={d.remind} onChange={e => set({ remind: e.target.checked })} /> Evening reminder on the phone app if it isn’t done yet</label>
    {error && <Notice tone="error">{error}</Notice>}
  </Sheet>;
  return <Sheet title="Who is it for?" sub={`Step 2 of 2 · ${d.name}`} onClose={onClose} back={() => setStep(1)}
    footer={<Button block busy={busy} onClick={() => void save()}>{d.owner === 'both' ? `Add & invite ${partner}` : 'Add goal'}</Button>}>
    {who('me', 'Just me', `A personal goal. ${partner} can see it and cheer you on.`)}
    {who('both', 'Both of us', hasPartner ? `Each of you does it. ${partner} gets a request to join.` : 'Invite someone to this room first.', !hasPartner)}
    <div className="chips">{spans.map(([k, l]) => <button key={k} className={`chip ${d.span === k ? 'on' : ''}`} onClick={() => set({ span: k })}>{l}</button>)}</div>
    <label className="row gap-8 small"><input type="checkbox" checked={d.remind} onChange={e => set({ remind: e.target.checked })} /> Evening reminder on the phone app if it isn’t done yet</label>
    {error && <Notice tone="error">{error}</Notice>}
  </Sheet>;
}

function MonthSheet({ load, partner, solo, onClose }: { load: (m: string, today: string) => Promise<GoalsMonth>; partner: string; solo?: boolean; onClose: () => void }) {
  const [at, setAt] = useState(() => new Date());
  const [who, setWho] = useState<'me' | 'them'>('me');
  const [data, setData] = useState<GoalsMonth | null>(null);
  const key = monthKey(at);
  useEffect(() => { setData(null); void load(key, localDay()).then(setData).catch(() => {}); }, [key, load]);
  const shade = (p: number | null | undefined) => p == null ? { background: 'transparent', color: 'var(--quiet)' } : p >= 100 ? { background: 'var(--lav)', color: 'var(--lav-ink)' } : p >= 67 ? { background: 'rgba(200,182,255,.55)', color: 'var(--lav-ink)' } : p >= 34 ? { background: 'rgba(200,182,255,.22)' } : { background: 'rgba(255,255,255,.06)', color: 'var(--muted)' };
  const firstDay = new Date(at.getFullYear(), at.getMonth(), 1).getDay();
  const days = data?.days.filter(d => !d.future && d[who] != null) || [];
  const perfect = days.filter(d => (d[who] ?? 0) >= 100).length;
  const avg = days.length ? Math.round(days.reduce((a, d) => a + (d[who] ?? 0), 0) / days.length) : 0;
  return <Sheet title={`${MONTHS[at.getMonth()]} ${at.getFullYear()}`} sub="Daily scores this month" onClose={onClose}>
    <div className="row between"><IconButton size="sm" icon="back" label="Previous month" onClick={() => setAt(new Date(at.getFullYear(), at.getMonth() - 1, 1))} />
      {solo ? <span className="h3">Your record</span> : <Segments label="Whose record" value={who} onChange={setWho} options={[{ value: 'me', label: 'You' }, { value: 'them', label: partner }]} />}
      <IconButton size="sm" icon="fwd" label="Next month" disabled={key >= monthKey()} onClick={() => setAt(new Date(at.getFullYear(), at.getMonth() + 1, 1))} /></div>
    {!data ? <Skeleton h={260} /> : <>
      <div className="row gap-24"><div><p className="title">{avg}%</p><p className="tiny muted">Average</p></div><div><p className="title">{perfect}</p><p className="tiny muted">Perfect days</p></div></div>
      <div className="cal">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => <div key={'h' + i} className="tiny muted">{l}</div>)}{Array.from({ length: firstDay }, (_, i) => <div key={'e' + i} />)}
        {data.days.map(d => <div key={d.d} style={d.future ? { color: 'var(--quiet)' } : shade(d[who])}>{d.d}</div>)}</div>
      <div className="col gap-8">{data.rates.filter(r => r.w === who).map(r => <div key={r.name} className="row gap-8"><span className="small grow ellipsis">{r.name}</span><div className="bar" style={{ maxWidth: 120 }}><i style={{ width: `${r.pct}%`, background: who === 'me' ? 'var(--lav)' : 'var(--mint)' }} /></div><span className="tiny" style={{ width: 36, textAlign: 'right' }}>{r.pct}%</span></div>)}</div>
    </>}
  </Sheet>;
}

/** "Goal is for": you are always in; add anyone from the room with +, or everyone. */
function GoalPeople({ members, value, onChange }: { members: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void }) {
  const [open, setOpen] = useState(value.length === 0);
  const all = members.length > 0 && members.every(m => value.includes(m.id));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  const first = (n: string) => n.split(' ')[0];
  return <div className="col gap-12">
    <div className="row between"><span className="tiny muted" style={{ letterSpacing: '.12em', textTransform: 'uppercase' }}>Goal is for</span><span className="small muted">{!value.length ? 'Just you · others can cheer' : all ? 'Everyone in the room' : `You + ${value.length} ${value.length === 1 ? 'person' : 'people'}`}</span></div>
    <div className="goal-people">
      <span className="gp-chip me"><Avatar name="You" size={28} />You</span>
      {members.filter(m => value.includes(m.id)).map(m => <button key={m.id} className="gp-chip" onClick={() => toggle(m.id)} aria-label={`Remove ${first(m.name)}`}><Avatar name={m.name} size={28} />{first(m.name)}<Icon name="x" size={13} /></button>)}
      <button className="gp-add" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label="Add people"><Icon name="plus" size={18} /></button>
    </div>
    {open && <div className="gp-list" role="group" aria-label="People in this room">
      <label className="gp-row strong"><span className="center" style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--lav-soft)', color: 'var(--lav)' }}><Icon name="users" size={16} /></span><span className="grow">Everyone in the room</span><input type="checkbox" checked={all} onChange={() => onChange(all ? [] : members.map(m => m.id))} /></label>
      {members.map(m => <label key={m.id} className="gp-row"><Avatar name={m.name} size={32} /><span className="grow">{m.name}</span><input type="checkbox" checked={value.includes(m.id)} onChange={() => toggle(m.id)} /></label>)}
    </div>}
  </div>;
}
