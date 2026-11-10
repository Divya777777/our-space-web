// Scroll-driven feature demos for the front page. Each chapter pins a big laptop and/or phone preview while you
// scroll through it; scrolling plays the feature the way it really works.
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
      // The first step shows as soon as the chapter is pinned; the rest follow evenly.
      const s = Math.min(steps - 1, Math.floor(p * steps * 1.08));
      setStep(prev => (prev === s ? prev : s));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    (root || window).addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { (root || window).removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [steps]);
  return [ref, step] as const;
}

function Chapter({ n, kicker, title, lines, step, chapterRef, tone, children }: {
  n: number; kicker: string; title: string; lines: string[]; step: number; chapterRef: React.RefObject<HTMLElement>; tone: string; children: React.ReactNode;
}) {
  return <section className={`ch ch-${tone}`} ref={chapterRef} style={{ ['--steps' as string]: lines.length }}>
    <div className="ch-pin">
      <div className="ch-copy">
        <p className="ch-kicker"><span>{String(n).padStart(2, '0')}</span>{kicker}</p>
        <h2>{title}</h2>
        <div className="ch-lines">{lines.map((l, i) => <p key={i} className={i === Math.min(step, lines.length - 1) ? 'on' : ''}>{l}</p>)}</div>
        <div className="ch-dots" aria-hidden="true">{lines.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      </div>
      <div className="ch-stage" data-step={step} aria-hidden="true">{children}</div>
    </div>
  </section>;
}

/* Device frames */
const Laptop = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <div className={`dv-laptop ${className}`}>
  <div className="dv-lid"><span className="dv-cam" /><div className="dv-screen">{children}</div></div><div className="dv-base"><span /></div>
</div>;
const Phone = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <div className={`dv-phone ${className}`}>
  <div className="dv-screen"><span className="dv-island" />{children}</div>
</div>;

const Scene = ({ className = '' }: { className?: string }) => <div className={`dm-scene ${className}`}><span className="sun" /><span className="hill a" /><span className="hill b" /></div>;
const Face = ({ who, size = 44 }: { who: 'A' | 'R'; size?: number }) => <span className={`dm-face ${who === 'A' ? 'a' : 'r'}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>{who}</span>;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** A room's top bar inside a device. */
const RoomBar = ({ live }: { live?: string }) => <div className="dm-roombar"><span className="dm-star" /><b>Late night talks</b>{live && <span className="dm-pill"><i />{live}</span>}</div>;

/* 1. Sync: your laptop and Riya's phone, one play button */
export function SyncDemo() {
  const [ref, step] = useChapter(4);
  const playing = step === 1 || step === 3;
  const t = [72, 96, 118, 140][step];
  const player = (who: 'you' | 'riya') => <div className="dm-player">
    <div className="dm-video"><Scene className={playing ? 'run' : ''} />
      <span className={`dm-center ${playing ? 'hide' : ''}`}><Icon name="play" size={who === 'you' ? 26 : 20} /></span>
      {step === 2 && <span className="dm-toast">{who === 'you' ? 'Riya paused' : 'You paused'}</span>}
      {step === 1 && who === 'you' && <span className="dm-tap" />}
    </div>
    <div className="dm-ctrl"><span className="dm-pp"><Icon name={playing ? 'pause' : 'play'} size={12} /></span><span className="dm-track"><i style={{ width: `${(t / 200) * 100}%` }} /></span><span className="dm-t">{mmss(t)}</span></div>
    <div className="dm-songrow"><span className="dm-thumb" /><span><b>Late night drive</b><small>{playing ? 'Playing for everyone' : 'Paused for everyone'}</small></span></div>
    <div className="dm-next"><p>Up next</p><div><i />Rain on the window</div><div><i />Coffee shop ambience</div><div><i />Slow songs for two</div></div>
  </div>;
  return <Chapter n={1} tone="lav" kicker="Watch in sync" title="Press play once. It plays for both of you." step={step} chapterRef={ref}
    lines={['You’re on your laptop in Ahmedabad. Riya’s on her phone in Toronto.', 'You press play: it starts on both screens at the same second.', 'Riya pauses for a snack: it pauses for you too.', 'Back on, together. Nobody has to say “3, 2, 1, play”.']}>
    <div className="dm-pair">
      <Laptop><RoomBar live="You" />{player('you')}</Laptop>
      <Phone><RoomBar />{player('riya')}</Phone>
      <div className={`dm-sync-pill ${playing ? 'live' : ''}`}><span className="beam" /><b>{step === 0 ? 'Connected' : step === 2 ? 'Paused for both' : 'In sync · 0.1 s'}</b></div>
    </div>
  </Chapter>;
}

/* 2. Call on top */
export function CallDemo() {
  const [ref, step] = useChapter(4);
  return <Chapter n={2} tone="mint" kicker="Call while you watch" title="Your faces, right on top of the video." step={step} chapterRef={ref}
    lines={['Start a voice or video call from your room.', 'Riya picks up. Your faces float over the video.', 'Tap to make the call big for a proper talk…', '…and tap again to go back to watching.']}>
    <Laptop className="solo">
      <RoomBar live={step >= 1 ? '24:10' : undefined} />
      <div className="dm-video tall"><Scene className="run" />
        <div className={`dm-ring ${step === 0 ? 'on' : ''}`}><Face who="R" size={84} /><span>Calling Riya…</span></div>
        <div className={`dm-faces ${step >= 1 ? 'on' : ''} ${step === 2 ? 'big' : ''}`}>
          <div className="dm-tile r"><Face who="R" size={step === 2 ? 110 : 46} /><span>Riya</span></div>
          <div className="dm-tile a"><Face who="A" size={step === 2 ? 110 : 30} /><span>You</span></div>
        </div>
        <div className={`dm-callbar ${step >= 1 ? 'on' : ''}`}><span className="dm-live" />24:10<span className="dm-btn"><Icon name="mic" size={14} /></span><span className="dm-btn"><Icon name="video" size={14} /></span><span className="dm-btn end"><Icon name="hangup" size={14} /></span></div>
      </div>
    </Laptop>
  </Chapter>;
}

/* 3. Private chat, on a phone */
export function ChatDemo() {
  const [ref, step] = useChapter(5);
  const msgs: { me?: boolean; text?: string; photo?: boolean }[] = [
    { text: 'did you see that ending?? 😭' }, { me: true, text: 'I’m not okay' }, { photo: true }, { me: true, text: 'saving this one 🥹' },
  ];
  return <Chapter n={3} tone="rose" kicker="Private chat" title="Talk, share photos, keep it between you." step={step} chapterRef={ref}
    lines={['Messages, photos and files, right next to what you’re watching.', 'Reply without pausing anything.', 'Drop in photos. Tap to save them.', 'Everything is end-to-end encrypted.', 'Only the people in your room can read it. Not even us.']}>
    <div className="dm-pair chat">
      <Phone>
        <div className="dm-chathead"><Face who="R" size={34} /><span><b>Riya</b><small>{step >= 1 ? 'online' : 'last seen just now'}</small></span><Icon name="video" size={18} /></div>
        <div className="dm-msgs">
          {msgs.map((m, i) => <div key={i} className={`dm-msg ${m.me ? 'me' : ''} ${m.photo ? 'photo' : ''} ${step >= i ? 'on' : ''}`}>
            {m.photo ? <><Scene className="pic" /><span className="dm-save"><Icon name="download" size={13} /></span></> : m.text}
          </div>)}
          <div className={`dm-typing ${step === 3 ? 'on' : ''}`}><i /><i /><i /></div>
        </div>
        <div className={`dm-lock ${step >= 3 ? 'on' : ''}`}><Icon name="lock" size={13} />End-to-end encrypted</div>
        <div className="dm-compose"><Icon name="paperclip" size={16} /><span>Message</span><i><Icon name="send" size={14} /></i></div>
      </Phone>
    </div>
  </Chapter>;
}

/* 4. Netflix & Prime, in a browser on a laptop */
export function StreamDemo() {
  const [ref, step] = useChapter(4);
  return <Chapter n={4} tone="red" kicker="Netflix & Prime Video" title="Movie night, even on Netflix and Prime." step={step} chapterRef={ref}
    lines={['On a computer, pick Netflix or Prime Video in your room.', 'Add the small Our Space extension once. That’s all the setup.', 'Each of you watches on your own account, perfectly in sync.', 'And your call floats on top the whole movie.']}>
    <Laptop className="solo">
      <div className="dm-tabs"><span className="dot" /><span className="dot" /><span className="dot" /><span className="dm-tab on">{step === 0 ? 'Our Space' : 'Netflix'}</span>
        <span className={`dm-ext ${step >= 1 ? 'on' : ''}`}><span className="dm-star" />{step >= 1 ? 'Our Space' : ''}</span></div>
      <div className="dm-video tall film">
        <div className="dm-film" />
        {step === 0 && <div className="dm-pick"><p>Watch together on</p><div><span className="n">Netflix</span><span className="p">Prime Video</span><span className="y">YouTube</span></div></div>}
        {step === 1 && <div className="dm-install"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" /><circle className="fill" cx="22" cy="22" r="19" /></svg><span>Setting up, only the first time</span></div>}
        <div className={`dm-badge ${step >= 2 ? 'on' : ''}`}><span className="dm-star" />Synced with Riya</div>
        <div className={`dm-faces ${step >= 3 ? 'on' : ''}`}><div className="dm-tile r"><Face who="R" size={46} /><span>Riya</span></div><div className="dm-tile a"><Face who="A" size={30} /><span>You</span></div></div>
        <div className="dm-ctrl over"><span className="dm-pp"><Icon name={step >= 2 ? 'pause' : 'play'} size={12} /></span><span className="dm-track red"><i style={{ width: `${35 + step * 8}%` }} /></span><span className="dm-t">{['0:41:58', '0:41:58', '0:42:10', '0:43:02'][step]}</span></div>
      </div>
    </Laptop>
  </Chapter>;
}

/* 5. Games, on a phone during the call */
export function GamesDemo() {
  const [ref, step] = useChapter(4);
  return <Chapter n={5} tone="gold" kicker="Play together" title="Games made for two, on the call." step={step} chapterRef={ref}
    lines={['Truth or Dare, Scribble and “How well do you know me?”.', 'It’s your turn: truth or dare?', 'Truth it is.', 'Then it’s Riya’s turn. Scores are kept for you.']}>
    <div className="dm-pair">
      <Phone>
        <div className="dm-gamehead"><Face who="R" size={30} /><Face who="A" size={30} /><span>On a call · 31:02</span></div>
        <div className="dm-game">
          <div className={`dm-card ${step >= 2 ? 'flip' : ''}`}>
            <div className="front"><Icon name="cards" size={36} /><b>Truth or Dare</b><small>Sweet · Fun · Spicy</small></div>
            <div className="back"><small>Truth · for you</small><b>What’s the first thing you noticed about Riya?</b></div>
          </div>
          <div className="dm-choose"><span className={step >= 2 ? 'picked' : step === 1 ? 'pulse' : ''}>Truth</span><span>Dare</span></div>
          <div className={`dm-score ${step >= 3 ? 'on' : ''}`}>You 4 · Riya 5<em>Riya’s turn</em></div>
        </div>
      </Phone>
    </div>
  </Chapter>;
}

/* 6. Goals, on a phone */
export function GoalsDemo() {
  const [ref, step] = useChapter(4);
  const mine = [0.15, 0.45, 0.8, 1][step], hers = [0.3, 0.7, 1, 1][step];
  const ring = (v: number, cls: string, who: 'A' | 'R', label: string) => <div className="dm-goal">
    <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" /><circle className={`fill ${cls}`} cx="60" cy="60" r="50" style={{ strokeDashoffset: 314 * (1 - v) }} /></svg>
    <div className="in"><Face who={who} size={30} /><b>{Math.round(v * 8000).toLocaleString()}</b><small>{label}</small></div>
  </div>;
  return <Chapter n={6} tone="mint" kicker="Goals & plans" title="Keep each other going, every day." step={step} chapterRef={ref}
    lines={['Set a goal together: steps, water, reading, anything.', 'See each other’s progress as the day goes.', 'Riya finishes first and cheers you on.', 'You close yours. That’s a 12-day streak.']}>
    <div className="dm-pair">
      <Phone>
        <div className="dm-goalhead"><b>8,000 steps a day</b><small>Today · You and Riya</small></div>
        <div className="dm-goals">{ring(mine, 'lav', 'A', 'You')}{ring(hers, 'mint', 'R', 'Riya')}</div>
        <div className={`dm-cheer ${step >= 2 ? 'on' : ''}`}>🎉 Riya cheered you on</div>
        <div className={`dm-streak ${step >= 3 ? 'on' : ''}`}><Icon name="star" size={16} />12-day streak</div>
      </Phone>
    </div>
  </Chapter>;
}

/* 7. Floating window, on a laptop */
export function PipDemo() {
  const [ref, step] = useChapter(3);
  return <Chapter n={7} tone="lav" kicker="Floating window" title="Keeps going while you do other things." step={step} chapterRef={ref}
    lines={['Need to answer an email mid-movie?', 'Switch apps: the video and your faces shrink into a little window…', '…that stays on top until you come back.']}>
    <Laptop className="solo">
      <div className="dm-desk">
        <div className="dm-otherapp"><div className="bar"><span /><span /><span /></div>{Array.from({ length: 7 }, (_, i) => <div key={i} className="row"><i /><b style={{ width: `${40 + ((i * 17) % 45)}%` }} /></div>)}</div>
        <div className="dm-room"><RoomBar live="24:10" /><div className="dm-video fill"><Scene className="run" /><div className="dm-faces on"><div className="dm-tile r"><Face who="R" size={42} /></div><div className="dm-tile a"><Face who="A" size={28} /></div></div></div></div>
      </div>
    </Laptop>
  </Chapter>;
}
