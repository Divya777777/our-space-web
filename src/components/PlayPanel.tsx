// Play: Scribble (live on a call, or draw and send), Truth or Dare (live on a call), "How well do you know me?" and scores.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSpace } from '../lib/space';
import { GamesApi, Hub, QuizState, ScribbleView, Stroke, TdView, Turn, liveGames } from '../lib/games';
import { useCall } from './Call';
import { Button, Notice, Sheet, ago, firstName, useToast } from './ui';
import { Icon, IconName } from './Icon';

const COLORS = ['#141125', '#E0566B', '#3F7FE0', '#2E9E6E', '#E6A23C'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nice = (e: unknown) => { const m = (e as Error).message || ''; return /endpoint not found|^not found$/i.test(m) ? 'Games are still being set up on the server. Try again in a few minutes.' : m || 'Something went wrong. Try again.'; };
function usePoll<T>(load: () => Promise<T>, ms: number, on = true) {
  const [data, setData] = useState<T | undefined>(undefined);
  const live = useRef(load); useEffect(() => { live.current = load; });
  useEffect(() => {
    if (!on) return; let alive = true;
    const run = () => { void live.current().then(v => { if (alive) setData(v); }).catch(() => {}); };
    run(); const t = setInterval(() => { if (!document.hidden) run(); }, ms);
    return () => { alive = false; clearInterval(t); };
  }, [ms, on]);
  return [data, setData] as const;
}

export function PlayPanel({ code, onShare }: { code: string; onShare: (text: string) => Promise<void> }) {
  const space = useSpace();
  const call = useCall();
  const toast = useToast();
  const api = useMemo(() => liveGames(space.api, code), [space.api, code]);
  const [hub, setHub] = usePoll<Hub>(useCallback(() => api.hub(), [api]), 15000);
  const [open, setOpen] = useState<null | 'draw' | 'live' | 'turn' | 'td' | 'quiz'>(null);
  const [turnId, setTurnId] = useState('');
  const onCall = call.activeCode === code;
  const live = onCall && call.liveWith > 0;
  const partner = hub?.partner?.name ? firstName(hub.partner.name) : 'them';
  const refresh = () => { void api.hub().then(setHub).catch(() => {}); };
  useEffect(() => { if ((open === 'td' || open === 'live') && !live) { setOpen(null); toast('The call ended, so the game closed.'); } }, [open, live, toast]);
  const room = space.rooms.find(r => r.code === code);
  const callRoom = () => { const others = (room?.members || []).filter(m => m.id !== space.user.id); if (!others.length) { toast('Invite someone to this room first.'); return; } call.start(code, others, false, others.length > 1 ? room?.name || 'Room' : others[0].name); };
  const scribble = async () => { if (!live) { setOpen('draw'); return; } try { await api.scribbleAction({ action: 'start' }); setOpen('live'); } catch (e) { toast(nice(e), { tone: 'error' }); } };
  const td = async (join = false) => { try { if (!join) await api.tdAction({ action: 'start' }); setOpen('td'); } catch (e) { toast(nice(e), { tone: 'error' }); } };
  const game = (icon: IconName, color: string, name: string, line: string, meta: string, onClick: () => void) => <button className="inset row" style={{ padding: 14, textAlign: 'left', gap: 14 }} onClick={onClick}>
    <span className="center" style={{ width: 50, height: 50, borderRadius: 16, background: color + '22', color, flex: 'none' }}><Icon name={icon} size={24} /></span>
    <span className="grow"><span className="h3" style={{ display: 'block' }}>{name}</span><span className="small muted" style={{ display: 'block' }}>{line}</span><span className="tiny quiet">{meta}</span></span>
    <Icon name="play" size={16} />
  </button>;
  const banner = (color: string, icon: IconName, title: string, sub: string, action: string, onClick: () => void) => <button className="inset row" style={{ padding: 12, borderColor: color + '55', textAlign: 'left' }} onClick={onClick}>
    <span className="center" style={{ width: 40, height: 40, borderRadius: 12, background: color + '22', color, flex: 'none' }}><Icon name={icon} /></span>
    <span className="grow"><span className="h3" style={{ display: 'block' }}>{title}</span><span className="small muted">{sub}</span></span><span className="small" style={{ color, fontWeight: 600 }}>{action}</span>
  </button>;
  const me = hub?.scores.find(x => x.name === 'You') || hub?.scores[0];
  return <div className="col gap-12" style={{ gap: 12 }}>
    {hub?.live.scribble && hub.live.scribble.phase !== 'over' && live && banner('#C8B6FF', 'pencil', `${firstName(hub.live.scribble.drawerName)} is playing Scribble`, 'Join in and guess the drawing', 'Join', () => setOpen('live'))}
    {hub?.live.td && live && banner('#F2AAAA', 'cards', 'Truth or Dare is on', hub.live.td.turnName === 'You' ? 'Your turn' : `${firstName(hub.live.td.turnName)}’s turn`, 'Join', () => void td(true))}
    {hub?.turns.map(t => <div key={t.id}>{banner('#E6C994', 'pencil', `${firstName(t.fromName)} drew something for you`, `${ago(t.at)} · 60 seconds to guess once you open it`, 'Guess', () => { setTurnId(t.id); setOpen('turn'); })}</div>)}
    {hub?.quiz.ready.map(p => <div key={p.id}>{banner('#B6DDCF', 'heart', `${firstName(p.name)} answered 10 questions`, 'Guess what they said', 'Play', () => setOpen('quiz'))}</div>)}
    <p className="h3" style={{ marginTop: 4 }}>Play together</p>
    {game('pencil', '#C8B6FF', 'Scribble', live ? 'One draws, the others guess — live.' : 'Draw a word and send it.', live ? 'You’re on a call · 3 rounds · 60 s each' : '60 seconds to guess once it’s opened · +2 each', () => void scribble())}
    {game('cards', '#F2AAAA', 'Truth or Dare', 'Sweet, fun — or spicy if you all agree.', live ? 'You’re on a call · no time limit' : onCall ? 'Opens when someone joins your call' : 'Played live on a call', () => { if (live) void td(); else if (onCall) toast(`Waiting for ${partner === 'them' ? 'someone' : partner} to join the call.`); else toast('Truth or Dare is played on a call.', { action: { label: 'Call now', run: callRoom } }); })}
    {game('heart', '#B6DDCF', hub?.partner ? `How well do you know ${partner}?` : 'How well do you know me?', 'Answer 10 questions about yourself. Guess theirs.', 'Anytime · about 2 minutes', () => setOpen('quiz'))}
    {hub && <div className="inset row" style={{ padding: 14 }}><span className="gold"><Icon name="trophy" size={22} /></span><div className="grow"><p className="h3">{MONTHS[Number(hub.month.slice(5, 7)) - 1]} scores</p><p className="tiny muted">Scribble and quiz points</p></div>
      <p className="small" style={{ fontWeight: 600 }}>{hub.scores.slice(0, 3).map((x, i) => <span key={x.id} className={i ? 'mint' : 'lav'}>{i ? <span className="muted"> · </span> : null}{x === me ? 'You' : firstName(x.name)} {x.points}</span>)}</p></div>}
    {open === 'live' && <LiveScribble api={api} onClose={() => { setOpen(null); refresh(); }} />}
    {open === 'draw' && <DrawAndSend api={api} partner={partner} onClose={() => { setOpen(null); refresh(); }} />}
    {open === 'turn' && <GuessTurn api={api} id={turnId} onClose={() => { setOpen(null); refresh(); }} onDraw={() => setOpen('draw')} />}
    {open === 'td' && <TruthDare api={api} onClose={() => { setOpen(null); refresh(); }} />}
    {open === 'quiz' && <Quiz api={api} onClose={() => { setOpen(null); refresh(); }} onShare={onShare} />}
  </div>;
}

function Canvas({ strokes, color = COLORS[0], size = 5, onStroke }: { strokes: Stroke[]; color?: string; size?: number; onStroke?: (s: Stroke, final: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const cur = useRef<Stroke | null>(null); const sent = useRef(0);
  const pt = (e: React.PointerEvent): [number, number] => { const r = box.current!.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  const end = () => { const s = cur.current; cur.current = null; if (s) onStroke?.(s, true); setTimeout(() => setCurrent(null), 300); };
  const list = current ? [...strokes.filter(s => s.id !== current.id), current] : strokes;
  return <div ref={box} className="paper" style={{ cursor: onStroke ? 'crosshair' : 'default' }}
    onPointerDown={e => { if (!onStroke) return; (e.target as HTMLElement).setPointerCapture(e.pointerId); const p = pt(e); const s: Stroke = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, c: color, s: size, p: [p, [p[0] + 0.001, p[1]]] }; cur.current = s; sent.current = Date.now(); setCurrent(s); }}
    onPointerMove={e => { const s = cur.current; if (!s) return; const p = pt(e); const last = s.p[s.p.length - 1]; if (Math.abs(last[0] - p[0]) + Math.abs(last[1] - p[1]) < 0.004) return; const next = { ...s, p: [...s.p, p] }; cur.current = next; setCurrent(next); if (Date.now() - sent.current > 350) { sent.current = Date.now(); onStroke?.(next, false); } }}
    onPointerUp={end} onPointerCancel={end}>
    <svg viewBox="0 0 342 300" preserveAspectRatio="none">{list.map(s => <path key={s.id} d={s.p.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 342).toFixed(1)} ${(y * 300).toFixed(1)}`).join(' ')} stroke={s.c} strokeWidth={s.s * 2} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}</svg>
    {!list.length && <span className="center" style={{ position: 'absolute', inset: 0, color: '#9AA0B0', fontWeight: 500 }}>{onStroke ? 'Draw here' : 'Waiting for the first line…'}</span>}
  </div>;
}
function Tools({ color, setColor, size, setSize, onUndo, onClear }: { color: string; setColor: (c: string) => void; size: number; setSize: (n: number) => void; onUndo: () => void; onClear: () => void }) {
  return <div className="row gap-8">{COLORS.map(c => <button key={c} aria-label={`Colour ${c}`} aria-pressed={color === c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
    <span className="grow" /><button className="icon-btn sm" aria-label="Brush size" onClick={() => setSize(size === 12 ? 5 : 12)}><span style={{ width: size === 12 ? 14 : 6, height: size === 12 ? 14 : 6, borderRadius: 7, background: 'var(--text)' }} /></button>
    <button className="icon-btn sm" aria-label="Undo" onClick={onUndo}><Icon name="undo" size={17} /></button><button className="icon-btn sm" aria-label="Clear" onClick={onClear}><Icon name="trash" size={17} /></button></div>;
}
function Countdown({ ms, running }: { ms: number; running: boolean }) {
  const [left, setLeft] = useState(ms);
  useEffect(() => { setLeft(ms); if (!running) return; const at = Date.now(); const t = setInterval(() => setLeft(Math.max(0, ms - (Date.now() - at))), 500); return () => clearInterval(t); }, [ms, running]);
  const s = Math.ceil(left / 1000);
  return <span className={`row gap-4 ${s <= 10 ? 'rose' : 'gold'}`} style={{ fontWeight: 600 }}><Icon name="clock" size={17} />{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
}
function GuessBox({ onGuess, autoFocus }: { onGuess: (t: string) => void; autoFocus?: boolean }) {
  const [g, setG] = useState('');
  const go = () => { if (g.trim()) { onGuess(g); setG(''); } };
  return <div className="row gap-8"><input autoFocus={autoFocus} aria-label="Your guess" className="input grow" placeholder="Type your guess" value={g} onChange={e => setG(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); }} /><Button disabled={!g.trim()} onClick={go}>Guess</Button></div>;
}

function LiveScribble({ api, onClose }: { api: GamesApi; onClose: () => void }) {
  const space = useSpace(); const toast = useToast();
  const [view, setView] = usePoll<ScribbleView | null>(useCallback(() => api.scribble(), [api]), 900);
  const [color, setColor] = useState(COLORS[0]); const [size, setSize] = useState(5);
  const act = async (body: Record<string, unknown>) => { try { setView(await api.scribbleAction(body)); } catch (e) { toast(nice(e), { tone: 'error' }); } };
  if (view === undefined) return <Sheet title="Scribble" wide onClose={onClose}><p className="muted">Getting the canvas ready…</p></Sheet>;
  if (!view) return <Sheet title="Scribble" wide onClose={onClose}><p className="muted">This game has ended.</p><Button onClick={() => void act({ action: 'start' })}>Start a new game</Button></Sheet>;
  const myId = space.user.id; const drawer = view.drawer === myId; const myPts = view.pts[myId] || 0;
  if (view.phase === 'over') return <Sheet title="Scribble" sub="Game over" wide onClose={onClose}>
    <div className="inset col gap-8" style={{ padding: 28, alignItems: 'center' }}><span className="gold"><Icon name="trophy" size={40} /></span><p className="title">You {myPts} · Others {Object.entries(view.pts).filter(([id]) => id !== myId).reduce((a, [, v]) => a + v, 0)}</p><p className="small muted">Points are added to this month’s scores.</p></div>
    <Button onClick={() => void act({ action: 'start' })}>{drawer ? 'Play again' : 'Draw the next game'}</Button><Button variant="secondary" onClick={() => { void act({ action: 'end' }); onClose(); }}>Back to games</Button>
  </Sheet>;
  const solver = view.guesses.find(g => g.ok);
  const next = (view.phase === 'solved' || view.phase === 'timeup') && <Button size="sm" onClick={() => void act({ action: 'next' })}>{view.round >= view.rounds ? 'See results' : 'Next round'}</Button>;
  return <Sheet title="Scribble" sub={`Round ${view.round} of ${view.rounds} · ${drawer ? 'you draw' : `${firstName(view.drawerName)} draws`}`} wide onClose={onClose}>
    <div className="row between">{drawer || view.word ? <div><p className="tiny muted">{drawer ? 'Your word · only you see it' : 'The word was'}</p><p className="title" style={{ letterSpacing: '.08em' }}>{(view.word || '').toUpperCase()}</p></div> : <div className="letters">{Array.from({ length: view.length }, (_, i) => <span key={i} />)}</div>}
      <Countdown ms={view.msLeft} running={(view.phase === 'drawing' || view.phase === 'guessing') && view.strokes.length > 0} /></div>
    <Canvas strokes={view.strokes} color={color} size={size} onStroke={drawer && view.phase === 'drawing' ? (s, final) => { void api.scribbleAction({ action: 'stroke', stroke: s }).then(v => { if (final) setView(v); }).catch(() => {}); } : undefined} />
    {drawer && view.phase === 'drawing' && <Tools color={color} setColor={setColor} size={size} setSize={setSize} onUndo={() => void act({ action: 'undo' })} onClear={() => void act({ action: 'clear' })} />}
    <div className="chips">{view.guesses.length ? view.guesses.map((g, i) => <span key={i} className={`tag ${g.ok ? 'mint' : 'plain'}`} style={{ height: 28, fontSize: 13 }}>{g.by === myId ? 'You' : firstName(g.name)}: {g.text}</span>) : <span className="small muted">{drawer ? 'The others see your lines live and type guesses.' : 'Type what you think it is.'}</span>}</div>
    {drawer && view.phase === 'drawing' && <div className="row gap-8"><Button variant="secondary" onClick={() => void act({ action: 'skip' })}>Skip word</Button><Button icon="check" disabled={!view.strokes.length} onClick={() => void act({ action: 'done' })}>Done drawing</Button></div>}
    {drawer && view.phase === 'guessing' && <Notice>They’re guessing. Drawing is locked until the timer ends.</Notice>}
    {!drawer && (view.phase === 'drawing' || view.phase === 'guessing') && <GuessBox autoFocus onGuess={t => void act({ action: 'guess', text: t })} />}
    {view.phase === 'solved' && <div className="row inset" style={{ padding: 12 }}><span className="mint"><Icon name="check" /></span><span className="grow">{solver ? (solver.by === myId ? 'You' : firstName(solver.name)) : 'Someone'} got it — “{view.word}”. +2 each.</span>{next}</div>}
    {view.phase === 'timeup' && <div className="row inset" style={{ padding: 12 }}><span className="rose"><Icon name="clock" /></span><span className="grow">Time’s up — it was “{view.word}”.</span>{next}</div>}
  </Sheet>;
}
function DrawAndSend({ api, partner, onClose }: { api: GamesApi; partner: string; onClose: () => void }) {
  const toast = useToast();
  const [word, setWord] = useState<string | null>(null); const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState(COLORS[0]); const [size, setSize] = useState(5); const [busy, setBusy] = useState(false);
  const newWord = useCallback((skip?: string) => { void api.drawWord(skip).then(w => { setWord(w); setStrokes([]); }).catch(e => toast(nice(e), { tone: 'error' })); }, [api, toast]);
  useEffect(() => { newWord(); }, [newWord]);
  return <Sheet title="Scribble" sub={`Draw it · ${partner} guesses later`} wide onClose={onClose}
    footer={<Button block icon="send" busy={busy} disabled={!strokes.length || !word} onClick={async () => { setBusy(true); try { await api.sendDrawing(word!, strokes); toast(`Sent — ${partner} guesses when they’re free.`, { icon: 'send' }); onClose(); } catch (e) { toast(nice(e), { tone: 'error' }); } finally { setBusy(false); } }}>Send to {partner}</Button>}>
    <div className="row between"><div><p className="tiny muted">Your word · only you see it</p><p className="title" style={{ letterSpacing: '.08em' }}>{word ? word.toUpperCase() : '…'}</p></div><Button size="sm" variant="secondary" onClick={() => newWord(word || undefined)}>New word</Button></div>
    <Canvas strokes={strokes} color={color} size={size} onStroke={(s, final) => { if (final) setStrokes(l => [...l.filter(x => x.id !== s.id), s]); }} />
    <Tools color={color} setColor={setColor} size={size} setSize={setSize} onUndo={() => setStrokes(l => l.slice(0, -1))} onClear={() => setStrokes([])} />
    <p className="tiny muted">When they open it, they have 60 seconds to guess. A right guess gives you both points.</p>
  </Sheet>;
}
function GuessTurn({ api, id, onClose, onDraw }: { api: GamesApi; id: string; onClose: () => void; onDraw: () => void }) {
  const toast = useToast();
  const [turn, setTurn] = useState<Turn | null>(null); const [timeUp, setTimeUp] = useState(false);
  useEffect(() => { void api.turnAction(id, { action: 'open' }).then(r => setTurn(r.turn)).catch(e => toast(nice(e), { tone: 'error' })); }, [api, id, toast]);
  useEffect(() => { if (!turn || turn.solved || turn.expired || turn.msLeft === undefined) return; const t = setTimeout(() => { setTimeUp(true); void api.turnAction(id, { action: 'open' }).then(r => setTurn(r.turn)).catch(() => {}); }, turn.msLeft + 300); return () => clearTimeout(t); }, [turn, api, id]);
  const act = async (body: Record<string, unknown>) => { try { setTurn((await api.turnAction(id, body)).turn); } catch (e) { toast(nice(e), { tone: 'error' }); } };
  if (!turn) return <Sheet title="Scribble" wide onClose={onClose}><p className="muted">Opening the drawing…</p></Sheet>;
  const over = turn.expired || (timeUp && !turn.solved);
  return <Sheet title="Scribble" sub={`${firstName(turn.fromName)}’s drawing · ${ago(turn.at)}`} wide onClose={onClose}>
    {!turn.solved && !over && <div className="row" style={{ justifyContent: 'flex-end' }}><Countdown ms={turn.msLeft ?? 60000} running /></div>}
    <Canvas strokes={turn.strokes} />
    <div className="letters" style={{ justifyContent: 'center' }}>{Array.from({ length: turn.length }, (_, i) => <span key={i}>{turn.word[i] || ''}</span>)}</div>
    {turn.tries.length > 0 && <div className="chips">{turn.tries.map((t, i) => <span key={i} className="tag plain" style={{ textDecoration: 'line-through' }}>{t}</span>)}</div>}
    {turn.solved ? <><Notice icon="check">Yes — it’s “{turn.word}”!</Notice><Button onClick={onDraw}>Your turn to draw</Button></>
      : over ? <><Notice icon="clock">Time’s up{turn.word.length === turn.length ? ` — it was “${turn.word}”` : ''}.</Notice><Button onClick={onDraw}>Your turn to draw</Button></>
        : <><GuessBox autoFocus onGuess={t => void act({ action: 'guess', text: t })} /><div className="row between"><Button size="sm" variant="secondary" icon="bulb" disabled={turn.hints >= turn.length - 1} onClick={() => void act({ action: 'hint' })}>Show a letter</Button><span className="tiny muted">Each hint costs 1 point</span></div></>}
  </Sheet>;
}
function TruthDare({ api, onClose }: { api: GamesApi; onClose: () => void }) {
  const space = useSpace(); const toast = useToast();
  const [view, setView] = usePoll<TdView | null>(useCallback(() => api.truthDare(), [api]), 1200);
  const act = async (body: Record<string, unknown>) => { try { setView(await api.tdAction(body)); } catch (e) { toast(nice(e), { tone: 'error' }); } };
  if (view === undefined) return <Sheet title="Truth or Dare" onClose={onClose}><p className="muted">Shuffling the cards…</p></Sheet>;
  if (!view) return <Sheet title="Truth or Dare" onClose={onClose}><Button onClick={() => void act({ action: 'start' })}>Start a new game</Button></Sheet>;
  const myId = space.user.id; const mine = view.turn === myId; const asked = view.spicyAsked.includes(myId); const card = view.card;
  return <Sheet title="Truth or Dare" sub="Best on a call. Nothing is recorded." onClose={onClose} footer={<Button variant="secondary" onClick={() => { void act({ action: 'end' }); onClose(); }}>End game</Button>}>
    <div className="chips">{(['sweet', 'fun'] as const).map(k => <button key={k} className={`chip ${view.decks[k] ? 'on' : ''}`} onClick={() => void act({ action: 'deck', deck: k })}>{k === 'sweet' ? 'Sweet' : 'Fun'}</button>)}
      <button className={`chip ${view.spicyOn ? 'on' : ''}`} onClick={() => void act({ action: 'spicy' })}>{!view.spicyOn && <Icon name="lock" size={14} />}{view.spicyOn ? 'Spicy' : asked ? 'Waiting for the others' : 'Spicy · 18+'}</button></div>
    {!asked && view.spicyAsked.length > 0 && !view.spicyOn && <div className="inset row" style={{ padding: 12 }}><span className="grow small">Someone asked to unlock Spicy (18+). Flirty, never explicit.</span><Button size="sm" onClick={() => void act({ action: 'spicy' })}>Say yes</Button></div>}
    <div className="inset col gap-16" style={{ padding: 24, minHeight: 220, justifyContent: 'space-between', background: card ? (card.kind === 'truth' ? 'rgba(200,182,255,.12)' : 'rgba(242,170,170,.12)') : undefined }}>
      {!card ? <><p className="small muted">{mine ? 'Your turn' : `${firstName(view.turnName)}’s turn`}</p><p className="title">{mine ? 'Truth or dare?' : `${firstName(view.turnName)} is choosing…`}</p>
        {mine && <div className="row gap-8"><Button className="grow" onClick={() => void act({ action: 'pick', kind: 'truth' })}>Truth</Button><Button className="grow" variant="secondary" onClick={() => void act({ action: 'pick', kind: 'dare' })}>Dare</Button><Button variant="ghost" onClick={() => void act({ action: 'pick', kind: 'random' })}>Surprise me</Button></div>}</>
        : <><p className="small" style={{ color: card.kind === 'truth' ? 'var(--lav)' : 'var(--rose)', fontWeight: 600 }}>{card.kind === 'truth' ? 'Truth' : 'Dare'} · {card.deck} · for {mine ? 'you' : firstName(view.turnName)}</p><p className="title" style={{ fontSize: 24 }}>{card.text}</p>
          {mine ? <div className="row gap-8"><Button onClick={() => void act({ action: 'done' })}>Done — next turn</Button><Button variant="secondary" icon="swap" disabled={!(view.swaps[myId] > 0)} onClick={() => void act({ action: 'swap' })}>Swap ({view.swaps[myId] ?? 0})</Button></div> : <p className="small muted">Waiting for {firstName(view.turnName)} to finish…</p>}</>}
    </div>
  </Sheet>;
}
function Quiz({ api, onClose, onShare }: { api: GamesApi; onClose: () => void; onShare: (t: string) => Promise<void> }) {
  const toast = useToast();
  const [state, setState] = useState<QuizState | null>(null);
  const [mode, setMode] = useState<'pick' | 'guess' | 'answer' | 'result'>('pick');
  const [who, setWho] = useState<QuizState['people'][number] | null>(null);
  const [i, setI] = useState(0); const [picks, setPicks] = useState<number[]>([]);
  const [result, setResult] = useState<{ score: number } | null>(null);
  useEffect(() => { void api.quiz().then(q => { setState(q); const ready = q.people.find(p => p.ready && !p.guessed); if (ready) { setWho(ready); setMode('guess'); } else if (!q.answered) setMode('answer'); }).catch(e => toast(nice(e), { tone: 'error' })); }, [api, toast]);
  if (!state) return <Sheet title="How well do you know me?" onClose={onClose}><p className="muted">Loading…</p></Sheet>;
  const Q = mode === 'guess' && who?.questions?.length ? who.questions : state.questions;
  const label = (q: { q: string; you?: string }) => mode === 'answer' ? q.you || q.q.replace('{name}’s', 'Your').replace('{name}', 'you') : q.q.replace(/\{name\}/g, firstName(who?.name || ''));
  const begin = (m: 'answer' | 'guess', p?: QuizState['people'][number]) => { setMode(m); if (p) setWho(p); setI(0); setPicks([]); };
  if (mode === 'pick') return <Sheet title="How well do you know me?" sub="Pick a person" onClose={onClose}>
    {!state.answered ? <Button onClick={() => begin('answer')}>Answer 10 questions about yourself</Button> : <div className="inset row" style={{ padding: 12 }}><span className="grow small">Your answers are in. The others can guess them now.</span><Button size="sm" variant="secondary" onClick={() => begin('answer')}>Change</Button></div>}
    {state.people.filter(p => p.ready).map(p => <button key={p.id} className="inset row" style={{ padding: 14, textAlign: 'left' }} disabled={p.guessed} onClick={() => begin('guess', p)}><span className="grow"><span className="h3" style={{ display: 'block' }}>Guess {firstName(p.name)}’s answers</span><span className="small muted">{p.guessed ? `You got ${p.score}/10` : '10 questions · about 2 minutes'}</span></span>{!p.guessed && <Icon name="play" size={16} />}</button>)}
    {state.people.filter(p => !p.ready).map(p => <p key={p.id} className="small muted">{firstName(p.name)} hasn’t answered yet — they’ll get a nudge when you do.</p>)}
  </Sheet>;
  if (mode === 'result' && result && who) { const text = `I got ${result.score}/${Q.length} on “How well do you know ${firstName(who.name)}?” in Our Space`;
    return <Sheet title={`Know ${firstName(who.name)}?`} onClose={onClose}>
      <div className="inset col gap-8" style={{ padding: 28, alignItems: 'center', textAlign: 'center' }}><span className="mint"><Icon name="heart" size={36} /></span><p className="display">{result.score}/{Q.length}</p><p className="muted">{result.score >= 8 ? `You know ${firstName(who.name)} really well.` : result.score >= 5 ? 'Not bad — ask about the ones you missed.' : 'Lots to talk about on your next call!'}</p></div>
      <Button variant="secondary" icon="send" onClick={async () => { try { await onShare(text); toast('Shared to Chat', { icon: 'chat' }); } catch (e) { toast(nice(e), { tone: 'error' }); } }}>Share result to Chat</Button>
      {!state.answered ? <Button onClick={() => begin('answer')}>Now answer 10 about yourself</Button> : <Button onClick={onClose}>Back to games</Button>}
    </Sheet>; }
  const q = Q[i];
  return <Sheet title={mode === 'answer' ? 'About you' : `Know ${firstName(who?.name || '')}?`} sub={`Question ${i + 1} of ${Q.length}`} onClose={onClose}
    footer={picks[i] !== undefined ? <Button block onClick={async () => {
      if (i + 1 < Q.length) { setI(i + 1); return; }
      try { if (mode === 'answer') { setState(await api.quizAnswer(picks, state.ids)); toast('Saved — the others can guess now', { icon: 'check' }); setMode('pick'); } else if (who) { setResult(await api.quizGuess(who.id, picks)); setMode('result'); } }
      catch (e) { toast(nice(e), { tone: 'error' }); }
    }}>{i + 1 < Q.length ? 'Next question' : mode === 'answer' ? 'Save my answers' : 'See result'}</Button> : undefined}>
    <div className="bar"><i style={{ width: `${(i + (picks[i] !== undefined ? 1 : 0)) / Q.length * 100}%`, background: 'var(--mint)' }} /></div>
    <p className="title" style={{ fontSize: 22 }}>{label(q)}</p>
    <div className="col gap-8">{q.opts.map((o, k) => <button key={k} className="inset row between" aria-pressed={picks[i] === k} style={{ padding: '14px 16px', borderColor: picks[i] === k ? 'var(--lav)' : undefined }} onClick={() => { const n = [...picks]; n[i] = k; setPicks(n); }}><span>{o}</span>{picks[i] === k && <span className="lav"><Icon name="check" /></span>}</button>)}</div>
    {i > 0 && <Button variant="ghost" onClick={() => setI(i - 1)}>Previous</Button>}
  </Sheet>;
}
