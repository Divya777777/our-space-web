// Scroll-driven feature demos for the front page. Each chapter pins a small "live" preview while you scroll
// through it; scrolling plays the feature the way it really works (sync, calls, chat, Netflix, games, goals, PiP).
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** Scroll progress through a tall section: sets --p (0–1) on it every frame and returns the current step. */
function useChapter(steps: number) {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const root = el.closest('.lp') as HTMLElement | null;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const total = Math.max(1, el.offsetHeight - window.innerHeight);
      const p = clamp(-r.top / total);
      el.style.setProperty('--p', p.toFixed(4));
      const s = Math.min(steps - 1, Math.floor(p * steps));
      setStep(prev => (prev === s ? prev : s));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    (root || window).addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { (root || window).removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [steps]);
  return [ref, step] as const;
}

function Chapter({ n, kicker, title, lines, steps, step, chapterRef, tone, children }: {
  n: number; kicker: string; title: string; lines: string[]; steps: number; step: number; chapterRef: React.RefObject<HTMLElement>; tone: string; children: React.ReactNode;
}) {
  return <section className={`ch ch-${tone}`} ref={chapterRef} style={{ ['--steps' as string]: steps }}>
    <div className="ch-pin">
      <div className="ch-copy">
        <p className="ch-kicker"><span>{String(n).padStart(2, '0')}</span>{kicker}</p>
        <h2>{title}</h2>
        {/* One short line per step: what you're seeing right now. */}
        <div className="ch-lines">{lines.map((l, i) => <p key={i} className={i === Math.min(step, lines.length - 1) ? 'on' : ''}>{l}</p>)}</div>
        <div className="ch-dots" aria-hidden="true">{lines.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      </div>
      <div className="ch-stage" data-step={step}>{children}</div>
    </div>
  </section>;
}

const Scene = ({ small }: { small?: boolean }) => <div className={`dm-scene ${small ? 'small' : ''}`}><span className="sun" /><span className="hill a" /><span className="hill b" /></div>;
const Face = ({ who, size = 44 }: { who: 'A' | 'R'; size?: number }) => <span className={`dm-face ${who === 'A' ? 'a' : 'r'}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>{who}</span>;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* 1. Sync: two screens, one play button */
export function SyncDemo() {
  const [ref, step] = useChapter(4);
  const playing = step === 1 || step === 3;
  const t = [72, 78, 101, 104][step];
  return <Chapter n={1} tone="lav" kicker="Watch in sync" title="Press play once. It plays for both of you." steps={4} step={step} chapterRef={ref}
    lines={['You’re in Ahmedabad, Riya’s in Toronto. Same video, same second.', 'You press play: it starts on both screens at once.', 'Riya pauses for a snack: it pauses for you too.', 'Back on. Nobody has to say “3, 2, 1, play”.']}>
    <div className="dm-sync">
      {(['You', 'Riya'] as const).map((who, i) => <div key={who} className={`dm-device ${i ? 'phone' : 'laptop'}`}>
        <div className="dm-screen"><Scene />
          <div className={`dm-overlay ${playing ? 'hide' : ''}`}><span className="dm-bigplay"><Icon name={playing ? 'pause' : 'play'} size={22} /></span></div>
          {step === 2 && <span className="dm-toast">{i ? 'You paused' : 'Riya paused'}</span>}
        </div>
        <div className="dm-ctrl"><Icon name={playing ? 'pause' : 'play'} size={14} /><span className="dm-track"><i style={{ width: `${(t / 240) * 100}%` }} /></span><span className="dm-t">{mmss(t)}</span></div>
        <p className="dm-who">{who}</p>
      </div>)}
      <div className={`dm-link ${playing ? 'live' : ''}`}><span /><b>{step === 0 ? 'Connected' : 'In sync · 0.1 s'}</b></div>
      {step === 1 && <span className="dm-tap" />}
    </div>
  </Chapter>;
}

/* 2. Call on top */
export function CallDemo() {
  const [ref, step] = useChapter(4);
  return <Chapter n={2} tone="mint" kicker="Call while you watch" title="Your faces, right on top of the video." steps={4} step={step} chapterRef={ref}
    lines={['Start a voice or video call from the room.', 'Riya picks up. Your faces float over the video.', 'Tap to make the call big for a proper talk…', '…and tap again to go back to watching.']}>
    <div className="dm-callwrap">
      <div className="dm-window"><Scene />
        <div className={`dm-ring ${step === 0 ? 'on' : ''}`}><Face who="R" size={64} /><span>Calling Riya…</span></div>
        <div className={`dm-faces ${step >= 1 ? 'on' : ''} ${step === 2 ? 'big' : ''}`}>
          <div className="dm-tile r"><Face who="R" size={step === 2 ? 96 : 40} /><span>Riya</span></div>
          <div className="dm-tile a"><Face who="A" size={step === 2 ? 96 : 28} /><span>You</span></div>
        </div>
        <div className={`dm-callbar ${step >= 1 ? 'on' : ''}`}><span className="dm-live" />24:10<span className="dm-btn"><Icon name="mic" size={14} /></span><span className="dm-btn end"><Icon name="hangup" size={14} /></span></div>
      </div>
    </div>
  </Chapter>;
}

/* 3. Private chat */
export function ChatDemo() {
  const [ref, step] = useChapter(5);
  const msgs: { me?: boolean; text?: string; photo?: boolean }[] = [
    { text: 'did you see that ending?? 😭' }, { me: true, text: 'I’m not okay' }, { photo: true }, { me: true, text: 'saving this one' },
  ];
  return <Chapter n={3} tone="rose" kicker="Private chat" title="Talk, share photos, keep it between you." steps={5} step={step} chapterRef={ref}
    lines={['Messages, photos and files, right next to the video.', 'Reply without pausing anything.', 'Drop in photos: tap to save them.', 'Everything is end-to-end encrypted.', 'Only the people in your room can read it. Not even us.']}>
    <div className="dm-phone">
      <div className="dm-phone-top"><Face who="R" size={30} /><span><b>Riya</b><small>{step >= 1 ? 'online' : 'last seen just now'}</small></span><Icon name="video" size={16} /></div>
      <div className="dm-msgs">
        {msgs.map((m, i) => <div key={i} className={`dm-msg ${m.me ? 'me' : ''} ${m.photo ? 'photo' : ''} ${step >= i ? 'on' : ''}`}>
          {m.photo ? <><Scene small /><span className="dm-save"><Icon name="download" size={12} /></span></> : m.text}
        </div>)}
        <div className={`dm-typing ${step === 3 ? 'on' : ''}`}><i /><i /><i /></div>
      </div>
      <div className={`dm-lock ${step >= 3 ? 'on' : ''}`}><Icon name="lock" size={13} />End-to-end encrypted</div>
    </div>
  </Chapter>;
}

/* 4. Netflix & Prime */
export function StreamDemo() {
  const [ref, step] = useChapter(4);
  return <Chapter n={4} tone="red" kicker="Netflix & Prime Video" title="Movie night, even on Netflix and Prime." steps={4} step={step} chapterRef={ref}
    lines={['On a computer, pick Netflix or Prime in your room.', 'Add the small Our Space extension once. That’s the setup.', 'Each of you watches on your own account, perfectly in sync.', 'Your call floats on top the whole time.']}>
    <div className="dm-browser">
      <div className="dm-tabs"><span className="dot" /><span className="dot" /><span className="dot" /><span className="dm-tab on">Netflix</span><span className="dm-tab">Our Space</span>
        <span className={`dm-ext ${step >= 1 ? 'on' : ''}`}><span className="dm-star" />{step >= 1 ? 'Added' : ''}</span></div>
      <div className="dm-player">
        <div className="dm-film" />
        {step === 0 && <div className="dm-pick"><span className="n">Netflix</span><span className="p">Prime Video</span><span className="y">YouTube</span></div>}
        {step === 1 && <div className="dm-install"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" /><circle className="fill" cx="22" cy="22" r="19" /></svg><span>Setting up, only once</span></div>}
        <div className={`dm-badge ${step >= 2 ? 'on' : ''}`}><span className="dm-star" />Synced with Riya</div>
        <div className={`dm-faces mini ${step >= 3 ? 'on' : ''}`}><div className="dm-tile r"><Face who="R" size={36} /></div><div className="dm-tile a"><Face who="A" size={24} /></div></div>
        <div className="dm-ctrl dark"><Icon name={step >= 2 ? 'pause' : 'play'} size={14} /><span className="dm-track"><i className="grow" /></span><span className="dm-t">{step >= 2 ? '0:42:10' : '0:41:58'}</span></div>
      </div>
    </div>
  </Chapter>;
}

/* 5. Games */
export function GamesDemo() {
  const [ref, step] = useChapter(4);
  return <Chapter n={5} tone="gold" kicker="Play together" title="Games made for two, on the call." steps={4} step={step} chapterRef={ref}
    lines={['Truth or Dare, Scribble and “How well do you know me?”.', 'Your turn: truth or dare?', 'Truth it is.', 'Then it’s Riya’s turn. Scores are kept for you.']}>
    <div className="dm-game">
      <div className="dm-choose"><span className={step >= 2 ? 'picked' : step === 1 ? 'pulse' : ''}>Truth</span><span>Dare</span></div>
      <div className={`dm-card ${step >= 2 ? 'flip' : ''}`}>
        <div className="front"><Icon name="cards" size={34} /><b>Truth or Dare</b><small>Sweet · Fun · Spicy</small></div>
        <div className="back"><small>Truth · for you</small><b>What’s the first thing you noticed about Riya?</b></div>
      </div>
      <div className={`dm-score ${step >= 3 ? 'on' : ''}`}><Face who="A" size={28} /><span>You 4</span><span className="vs">·</span><span>Riya 5</span><Face who="R" size={28} /><em>Riya’s turn</em></div>
    </div>
  </Chapter>;
}

/* 6. Goals */
export function GoalsDemo() {
  const [ref, step] = useChapter(4);
  const mine = [0.15, 0.45, 0.8, 1][step], hers = [0.3, 0.7, 1, 1][step];
  const ring = (v: number, cls: string, who: 'A' | 'R', label: string) => <div className="dm-goal">
    <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" /><circle className={`fill ${cls}`} cx="60" cy="60" r="50" style={{ strokeDashoffset: 314 * (1 - v) }} /></svg>
    <div className="in"><Face who={who} size={44} /><b>{Math.round(v * 8000).toLocaleString()}</b><small>steps</small></div><span>{label}</span>
  </div>;
  return <Chapter n={6} tone="mint" kicker="Goals & plans" title="Keep each other going, every day." steps={4} step={step} chapterRef={ref}
    lines={['Set a goal together: steps, water, reading, anything.', 'See each other’s progress as the day goes.', 'Riya finishes first and cheers you on.', 'You close yours. That’s a 12-day streak.']}>
    <div className="dm-goals">
      {ring(mine, 'lav', 'A', 'You')}{ring(hers, 'mint', 'R', 'Riya')}
      <div className={`dm-cheer ${step >= 2 ? 'on' : ''}`}>🎉 Riya cheered you on</div>
      <div className={`dm-streak ${step >= 3 ? 'on' : ''}`}><Icon name="star" size={16} />12-day streak</div>
    </div>
  </Chapter>;
}

/* 7. Floating window */
export function PipDemo() {
  const [ref, step] = useChapter(3);
  return <Chapter n={7} tone="lav" kicker="Floating window" title="Keeps going while you do other things." steps={3} step={step} chapterRef={ref}
    lines={['Need to reply to an email mid-movie?', 'Switch apps: the video and your faces shrink into a little window.', 'It stays on top until you come back.']}>
    <div className="dm-desk">
      <div className="dm-otherapp"><div className="bar" />{Array.from({ length: 6 }, (_, i) => <div key={i} className="row"><i /><b style={{ width: `${40 + ((i * 17) % 45)}%` }} /></div>)}</div>
      <div className="dm-room"><Scene /><div className="dm-faces on mini"><div className="dm-tile r"><Face who="R" size={34} /></div><div className="dm-tile a"><Face who="A" size={22} /></div></div></div>
    </div>
  </Chapter>;
}
