import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { GoalsMonth, MonthRow, localDay, monthKey } from '../lib/goals';
import { completion, monthReview } from '../lib/goalReview';
import { Button, IconButton, Notice, Sheet, Skeleton } from './ui';
import { Icon } from './Icon';
import { GetAppPrompt } from './GetApp';
import '../goalReview.css';

const num = (n: number) => n.toLocaleString();
const dateLabel = (day: string, options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => new Date(`${day}T12:00:00`).toLocaleDateString([], options);
const scrollToJournal = () => document.getElementById('review-journal')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
const statusLabel = (r: MonthRow, today: boolean) => r.ok ? 'Complete' : r.status === 'unlogged' ? 'No log yet' : r.status === 'partial' ? (today ? 'In progress' : 'Partial') : today ? 'Not yet' : 'Logged · incomplete';

export function GoalMonthReview({ load, log, userId, version, onChanged, onClose }: {
  load: (month: string, today: string) => Promise<GoalsMonth>;
  log: (id: string, day: string, value: number) => Promise<void>;
  userId: string; version?: number; onChanged: () => void; onClose: () => void;
}) {
  const [at, setAt] = useState(() => new Date());
  const [today, setToday] = useState(localDay);
  const [who, setWho] = useState(userId);
  const [selected, setSelected] = useState(new Date().getDate());
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState<GoalsMonth | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState('');
  const busy = useRef(false);
  const requestNumber = useRef(0);
  const key = monthKey(at);
  const loader = useRef(load); loader.current = load;
  useEffect(() => {
    const refresh = () => { if (!document.hidden) { setToday(localDay()); setTick(t => t + 1); } };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (busy.current) return;
    let alive = true;
    const request = ++requestNumber.current;
    setError('');
    void loader.current(key, today).then(result => { if (alive && request === requestNumber.current) setData(result); })
      .catch(() => { if (alive && request === requestNumber.current) setError('Your record couldn’t refresh. Your saved progress is safe.'); });
    return () => { alive = false; };
  }, [key, today, tick, version]);
  const current = data?.month === key ? data : null;
  const review = useMemo(() => current ? monthReview(current, who, today) : null, [current, who, today]);
  const detail = review?.days.find(d => d.d === selected);
  const monthName = at.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const own = who === userId;
  const changeMonth = (offset: number) => {
    const next = new Date(at.getFullYear(), at.getMonth() + offset, 1);
    setAt(next); setSelected(monthKey(next) === monthKey() ? new Date().getDate() : 1); setFilter('all'); setSaved('');
  };
  const save = async (row: MonthRow, value: number) => {
    if (busy.current || !own || detail?.date !== localDay()) return;
    busy.current = true; requestNumber.current++; setSaving(row.goalId); setSaved(''); setError('');
    try {
      const day = localDay();
      await log(row.goalId, day, value);
      // Refresh after the acknowledged write; never leave a success-looking optimistic score on a failed save.
      onChanged();
      const request = ++requestNumber.current;
      const result = await loader.current(key, day);
      if (request === requestNumber.current) setData(result);
      setSaved(value >= row.target ? `${row.name} complete. A little win, saved.` : `${row.name} updated.`);
    } catch (e) { setError((e as Error).message || 'Couldn’t save. Please try again.'); }
    finally { busy.current = false; setSaving(null); }
  };
  const showToday = () => { setAt(new Date()); setSelected(new Date().getDate()); setFilter('all'); };
  const inspectGoal = (id: string) => {
    setFilter(id);
    const last = review?.days.filter(d => !d.future && d.rows.some(r => r.goalId === id)).at(-1);
    if (last) setSelected(last.d);
    scrollToJournal();
  };
  const selectedRows = detail?.rows.filter(r => filter === 'all' || r.goalId === filter) || [];
  return <Sheet wide title="Your month, in focus" sub="Small steps. A clearer picture." onClose={onClose}>
    <div className="month-review">
      <div className="mr-toolbar">
        <div className="mr-month-nav"><IconButton icon="back" label="Previous month" disabled={saving !== null} onClick={() => changeMonth(-1)} /><h2>{monthName}</h2><IconButton icon="fwd" label="Next month" disabled={saving !== null || key >= monthKey()} onClick={() => changeMonth(1)} /></div>
        <Button variant="ghost" size="sm" disabled={saving !== null} onClick={showToday}>Today</Button>
      </div>
      {!!current?.members?.length && <div className="mr-people" aria-label="Whose progress">{current.members.map(p => <button key={p.id} className={p.id === who ? 'on' : ''} aria-pressed={p.id === who} onClick={() => { setWho(p.id); setFilter('all'); setSaved(''); }}><span>{p.name.slice(0, 1)}</span>{p.id === userId ? 'You' : p.name}</button>)}</div>}
      {error && <Notice tone="error">{error} <button className="lav" onClick={() => setTick(t => t + 1)}>Try again</button></Notice>}
      {!current ? (!error && <Skeleton h={380} />) : current.detailVersion !== 2 ? <div className="mr-empty"><Icon name="calendar" size={30} /><h3>Detailed history is coming into view</h3><p>This server doesn’t have your detailed monthly record yet. Your daily goals are still available.</p><Button variant="secondary" onClick={onClose}>Back to goals</Button></div> : review && <>
        <section className="mr-hero" aria-label="Monthly completion">
          <div className="mr-orbit" style={{ '--score': `${(review.pct ?? 0) * 3.6}deg` } as CSSProperties}><div><strong>{review.pct === null ? '—' : review.pct}<small>{review.pct !== null && '%'}</small></strong><span>completion</span></div></div>
          <div className="mr-hero-copy"><span className="mr-eyebrow">THE BIG PICTURE</span><h3>{review.pct === null ? 'Every small start counts.' : review.pct >= 80 ? 'Look at you showing up.' : review.pct >= 40 ? 'You’re building your rhythm.' : 'A fresh step is always possible.'}</h3><p>{review.total ? <><b>{review.completed} of {review.total}</b> scheduled tasks completed{review.through ? ` through ${dateLabel(review.through)}` : ''}.</> : 'Your score begins after your first scheduled day. Today is still yours to shape.'}</p><span className="mr-note">Today is in progress, not counted in this score.</span></div>
        </section>
        <div className="mr-metrics"><div><Icon name="check" size={18} /><strong>{review.completed}<small> / {review.total}</small></strong><span>Tasks completed</span></div><div><Icon name="trophy" size={18} /><strong>{review.perfectDays}</strong><span>Fully completed days</span></div><div><Icon name="calendar" size={18} /><strong>{review.activeDays}</strong><span>Scheduled days reviewed</span></div></div>
        <details className="mr-explainer"><summary>What does this percentage mean?</summary><p>Completed tasks ÷ scheduled tasks, through {review.through ? dateLabel(review.through) : 'the last finished day'}. Each goal counts once per scheduled day. Rest days, future days and days before a recorded join date are excluded. Partial amounts are shown below; extra progress on one day doesn’t replace another day.</p>{review.historyEstimated && <p>Some older shared goals have no recorded join date, so their history starts when the goal began.</p>}</details>
        {review.todayRows.length > 0 && key === today.slice(0, 7) && <button className="mr-next" disabled={saving !== null} onClick={() => { showToday(); scrollToJournal(); }}><span className="mr-next-icon"><Icon name={review.todayRows.every(r => r.ok) ? 'check' : 'moon'} size={20} /></span><span><b>{review.todayRows.every(r => r.ok) ? 'Today’s goals are complete' : `${review.todayRows.filter(r => !r.ok).length} ${review.todayRows.filter(r => !r.ok).length === 1 ? 'small step' : 'small steps'} left today`}</b><small>{own ? 'Open today’s details and keep your momentum.' : 'See today’s progress.'}</small></span><Icon name="fwd" size={17} /></button>}
        <section id="review-journal" className="mr-journal">
          <div className="mr-section-heading"><div><span className="mr-eyebrow">DAY BY DAY</span><h3>Your progress journal</h3></div><label className="mr-filter"><span className="sr-only">Filter calendar by goal</span><select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All goals</option>{review.goals.map(g => <option key={g.row.goalId} value={g.row.goalId}>{g.row.name}</option>)}</select></label></div>
          <div className="mr-calendar-layout"><div><div className="mr-calendar" aria-label={`${monthName} progress calendar`}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <span className="mr-weekday" key={day}>{day.slice(0, 1)}</span>)}
            {Array.from({ length: new Date(at.getFullYear(), at.getMonth(), 1).getDay() }, (_, i) => <span key={`blank-${i}`} />)}
            {review.days.map(day => {
              const rows = day.rows.filter(r => filter === 'all' || r.goalId === filter);
              const pct = completion(rows);
              const logged = rows.some(r => r.value !== null);
              const state = day.future ? 'future' : !rows.length ? 'rest' : pct === 100 ? 'complete' : logged ? 'partial' : 'unlogged';
              return <button key={day.d} disabled={day.future} className={`mr-day ${state} ${selected === day.d ? 'selected' : ''} ${day.date === today ? 'today' : ''}`} aria-pressed={selected === day.d} aria-current={day.date === today ? 'date' : undefined} aria-label={`${dateLabel(day.date, { month: 'long', day: 'numeric' })}: ${day.future ? 'upcoming' : !rows.length ? 'no goals scheduled' : `${rows.filter(r => r.ok).length} of ${rows.length} completed${logged ? '' : ', no logs'}`}`} onClick={() => setSelected(day.d)}><span>{day.d}</span><small>{day.future || !rows.length ? '·' : pct === 100 ? '✓' : `${pct}%`}</small></button>;
            })}
          </div><div className="mr-legend"><span><i className="complete" />Complete</span><span><i className="partial" />Logged</span><span><i className="unlogged" />No log</span><span><i className="rest" />Rest</span></div></div>
          <div className="mr-day-detail" aria-label="Selected day details"><div className="mr-detail-heading"><span className="mr-eyebrow">{detail?.date === today ? 'TODAY · IN PROGRESS' : 'DAILY RECORD'}</span><h4>{detail ? dateLabel(detail.date, { weekday: 'long', month: 'short', day: 'numeric' }) : 'Choose a day'}</h4></div>
            {!selectedRows.length ? <p className="mr-empty-day">No goals scheduled{filter === 'all' ? '' : ' for this habit'} on this day. Room to breathe.</p> : selectedRows.map(row => <div className="mr-task" key={row.goalId}><div className="mr-task-title"><Icon name={row.kind} size={18} /><b>{row.name}</b><span className={`mr-status ${row.status}`}>{statusLabel(row, detail?.date === today)}</span></div><p>{row.track === 'check' ? row.ok ? 'Target reached.' : row.value === null ? 'No check-in recorded.' : 'Not completed.' : <><strong>{num(row.value ?? 0)}</strong> / {num(row.target)} {row.unit}<span className="mr-amount-pct">{row.progressPct}%</span></>}</p><div className="mr-progress" aria-label={`${row.name}: ${row.progressPct}% of target`}><i style={{ width: `${row.progressPct}%` }} /></div>
              {own && detail?.date === today && (row.kind === 'steps' ? <GetAppPrompt compact text="Steps sync from your phone." reason="Open the phone app to update your steps." /> : <div className="mr-task-actions">{row.track === 'check' ? <Button size="sm" variant={row.ok ? 'ghost' : 'secondary'} disabled={saving !== null} busy={saving === row.goalId} onClick={() => void save(row, row.ok ? 0 : 1)}>{row.ok ? 'Undo' : 'Mark complete'}</Button> : <><IconButton size="sm" icon="minus" label={`Remove ${row.inc} ${row.unit} from ${row.name}`} disabled={saving !== null || !row.value} onClick={() => void save(row, Math.max(0, (row.value ?? 0) - row.inc))} /><Button size="sm" variant="secondary" disabled={saving !== null || (row.value ?? 0) >= row.target * 3} busy={saving === row.goalId} onClick={() => void save(row, Math.min(row.target * 3, (row.value ?? 0) + row.inc))}>+{num(row.inc)} {row.unit}</Button></>}</div>)}
            </div>)}
          </div></div>
        </section>
        <p className="mr-saved" role="status" aria-live="polite">{saved}</p>
        {!!review.total && <section className="mr-trend"><div className="mr-section-heading"><div><span className="mr-eyebrow">THE RHYTHM OF YOUR MONTH</span><h3>Completion over time</h3></div></div><div className="mr-week-bars">{review.weeks.map(w => <div key={w.start} title={`${w.start}–${w.end}: ${w.done} of ${w.total} tasks completed`}><span>{w.pct === null ? '—' : `${w.pct}%`}</span><div><i style={{ height: `${w.pct ?? 0}%` }} /></div><small>{w.start}–{w.end}</small></div>)}</div><p className="mr-note">Date ranges in this month · finished days only</p></section>}
        <section><div className="mr-section-heading"><div><span className="mr-eyebrow">ONE HABIT AT A TIME</span><h3>The details that matter</h3></div><span className="mr-note">{review.goals.length} {review.goals.length === 1 ? 'habit' : 'habits'}</span></div>
          {!review.goals.length ? <div className="mr-empty"><Icon name="custom" size={32} /><h3>A little space for a new habit.</h3><p>No scheduled goals for this person in {at.toLocaleDateString([], { month: 'long' })}.</p>{own && <Button variant="secondary" onClick={onClose}>Back to goals</Button>}</div> : <div className="mr-habits">{review.goals.map(g => <article className="mr-habit" key={g.row.goalId}><div className="mr-habit-top"><span className="mr-habit-icon"><Icon name={g.row.kind} /></span><div><h4>{g.row.name}</h4><p>{g.row.track === 'check' ? 'One check-in per scheduled day' : `${num(g.row.target)} ${g.row.unit} per scheduled day`}</p></div><strong>{g.days ? Math.round(g.completed / g.days * 100) : '—'}<small>{!!g.days && '%'}</small></strong></div><p className="mr-habit-ratio"><b>{g.completed} of {g.days}</b> scheduled days completed</p><div className="mr-habit-strip" aria-label={`${g.row.name} daily target progress`}>{g.values.map(v => <button key={v.d} title={`${v.d}: ${v.value === null ? 'no log' : `${v.pct}% of target`}`} aria-label={`View ${g.row.name} on day ${v.d}`} style={{ '--fill': `${v.pct}%` } as CSSProperties} className={v.pct >= 100 ? 'done' : ''} onClick={() => { setFilter(g.row.goalId); setSelected(v.d); scrollToJournal(); }} />)}</div><div className="mr-habit-counts"><span>{g.partial} partial</span><span>{g.unlogged} no log</span>{g.incomplete > 0 && <span>{g.incomplete} incomplete</span>}<span>Best run: {g.best}</span></div>{g.row.track !== 'check' && !!g.days && <p className="mr-habit-volume"><b>{num(g.total)}</b> {g.row.unit} logged · {Math.round(g.progress / g.days * 100)}% average daily target progress</p>}<button className="mr-text-button" onClick={() => inspectGoal(g.row.goalId)}>Explore this habit <Icon name="fwd" size={14} /></button></article>)}</div>}
          {!!review.goals.length && <p className="mr-note mr-footnote">Best runs count consecutive scheduled days within this month. Rest days don’t break a run.</p>}
        </section>
      </>}
    </div>
  </Sheet>;
}
