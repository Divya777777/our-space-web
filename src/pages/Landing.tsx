// The public front page at getourspace.com: what Our Space is, then "Log in".
// On a computer, Log in goes straight to Google sign-in (the web app). On a phone it first offers the app stores
// (coming soon until the listings exist) or carrying on in the browser.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wordmark } from '../components/Brand';
import { Icon, IconName } from '../components/Icon';
import { Sheet } from '../components/ui';
import { ANDROID_LIVE, ANDROID_URL, IOS_URL } from '../components/GetApp';
import { backendUrl } from '../lib/account';
import { HeroScene, CallDemo, ChatDemo, GamesDemo, GoalsDemo, PipDemo, StreamDemo, SyncDemo } from './LandingDemos';
import './landing.css';

const onPhone = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** Adds .in to [data-reveal] elements once they've scrolled into view, including ones you jumped past. */
function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = root.current; if (!box) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      const line = window.innerHeight * 0.92;
      box.querySelectorAll<HTMLElement>('[data-reveal]:not(.in)').forEach(e => { if (e.getBoundingClientRect().top < line) e.classList.add('in'); });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    box.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { box.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [root]);
}

/** The hero picture leans gently toward the pointer. */
function useTilt(el: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = el.current; if (!node || onPhone || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const x = e.clientX / window.innerWidth - 0.5, y = e.clientY / window.innerHeight - 0.5;
        node.style.setProperty('--rx', `${(-y * 6).toFixed(2)}deg`); node.style.setProperty('--ry', `${(x * 8).toFixed(2)}deg`);
        node.style.setProperty('--px', `${(x * 18).toFixed(1)}px`); node.style.setProperty('--py', `${(y * 14).toFixed(1)}px`);
      });
    };
    window.addEventListener('pointermove', move);
    return () => { window.removeEventListener('pointermove', move); cancelAnimationFrame(raf); };
  }, [el]);
}

export default function Landing() {
  const nav = useNavigate();
  const page = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const [choose, setChoose] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useReveal(page);
  useTilt(hero);
  const login = () => { if (onPhone) setChoose(true); else nav('/signin'); };
  const go = (id: string) => page.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return <div className="lp" ref={page} onScroll={e => setScrolled((e.target as HTMLElement).scrollTop > 12)}>
    <div className="lp-aurora" aria-hidden="true"><i /><i /><i /></div>

    <header className={`lp-nav ${scrolled ? 'solid' : ''}`}>
      <a href="#top" onClick={e => { e.preventDefault(); page.current?.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label="Our Space, back to top"><Wordmark size={19} /></a>
      <nav className="lp-links" aria-label="Sections">
        <button onClick={() => go('how')}>How it works</button>
        <button onClick={() => go('features')}>Features</button>
        <button onClick={() => go('privacy')}>Privacy</button>
        <button onClick={() => go('faq')}>FAQ</button>
      </nav>
      <button className="lp-btn ghost" onClick={login}>Log in</button>
    </header>

    {/* Hero */}
    <section className="lp-hero" id="top">
      <div className="lp-hero-copy">
        <p className="lp-kicker" data-reveal>For couples, best friends and family far apart</p>
        <h1 data-reveal style={{ ['--d' as string]: '80ms' }}>Watch together,<br /><span className="lp-grad">from anywhere.</span></h1>
        <p className="lp-lead" data-reveal style={{ ['--d' as string]: '160ms' }}>Our Space is a private room for you and your person. Press play and it plays for both of you at the same second, with your faces on a call right on top.</p>
        <div className="lp-cta" data-reveal style={{ ['--d' as string]: '240ms' }}>
          <button className="lp-btn primary" onClick={login}>Get started, it’s free <Icon name="fwd" size={16} /></button>
          <button className="lp-btn ghost" onClick={() => go('how')}>See how it works</button>
        </div>
        <p className="lp-small" data-reveal style={{ ['--d' as string]: '320ms' }}>Works in your browser today. Android app coming soon.</p>
      </div>

      <div className="lp-stage" ref={hero} aria-hidden="true" data-reveal style={{ ['--d' as string]: '200ms' }}>
        <HeroScene />
      </div>
    </section>

    {/* Trust strip */}
    <section className="lp-strip" data-reveal>
      <span><Icon name="play" size={16} />YouTube</span><span><Icon name="film" size={16} />Netflix</span><span><Icon name="video" size={16} />Prime Video</span><span><Icon name="film" size={16} />Apple TV+</span><span><Icon name="video" size={16} />JioHotstar</span><span><Icon name="plus" size={16} />5 more</span>
      <span><Icon name="lock" size={16} />End-to-end encrypted chat</span><span><Icon name="phone" size={16} />HD calls</span>
    </section>

    {/* Each feature, playing as you scroll */}
    <div id="how" />
    <SyncDemo />
    <div id="features" />
    <CallDemo />
    <ChatDemo />
    <StreamDemo />
    <GamesDemo />
    <GoalsDemo />
    <PipDemo />

    {/* Privacy */}
    <section className="lp-sec" id="privacy">
      <div className="lp-privacy glass-card" data-reveal>
        <span className="lp-ico lav big"><Icon name="shield" size={26} /></span>
        <div>
          <h2>Private by design.</h2>
          <p className="lp-lead">Our Space is built for two people, not for an audience. Here’s exactly how your space stays yours, in plain words.</p>
        </div>
      </div>
      <div className="lp-sec-grid">
        {([
          ['lock', 'lav', 'End-to-end encrypted chat', 'Messages, photos and files are locked on your device before they leave it. Only the people in your room have the keys. We can’t read them, and neither can anyone who gets into our servers.'],
          ['phone', 'mint', 'Your history stays with you', 'Chats are saved on your own phone or computer, and the app can back them up to a folder you choose. Our server only passes encrypted messages along and deletes them once they’re delivered (within 7 days at most).'],
          ['video', 'rose', 'Calls straight between you', 'Voice and video go directly from your device to theirs. If a network blocks that, they pass through an encrypted relay that can’t see or hear them. Calls are never recorded.'],
          ['users', 'gold', 'Invite-only rooms', 'No public profiles, no search, no strangers. Anyone new has to ask to join and you approve them. You can remove, block or report anyone at any time.'],
          ['shield', 'lav', 'No passwords to leak', 'You sign in with Google or Apple, so we never store a password. Every connection to Our Space is encrypted (HTTPS).'],
          ['heart', 'mint', 'No ads. No tracking. No selling.', 'We don’t show ads, don’t follow you around the web and never sell or share your data for marketing. Our Space will be funded by optional extras, never by advertisers.'],
          ['film', 'rose', 'A browser extension that minds its business', 'It only works on the streaming sites it supports and on Our Space, and only reads play, pause and position to keep you in sync. It never sees your passwords, payments or other sites.'],
          ['trash', 'gold', 'Leave whenever you like', 'Delete your account from the app or our website and your account data is erased. Your chats were never on our servers to begin with.'],
        ] as [IconName, string, string, string][]).map(([icon, tone, t, b], i) => <article key={t} className="glass-card lp-sec-item" data-reveal style={{ ['--d' as string]: `${(i % 4) * 70}ms` }}>
          <span className={`lp-ico ${tone}`}><Icon name={icon} size={20} /></span><h3>{t}</h3><p>{b}</p>
        </article>)}
      </div>
      <p className="lp-sec-note" data-reveal>Read the full <a href={`${backendUrl}/privacy`} target="_blank" rel="noreferrer">privacy policy</a>. Questions? <a href={`${backendUrl}/support`} target="_blank" rel="noreferrer">Ask us</a>.</p>
    </section>

    {/* FAQ */}
    <section className="lp-sec lp-faq" id="faq">
      <h2 data-reveal>Questions</h2>
      {[
        ['Is it free?', 'Yes. Watching, calls, chat and games are free. Extras for people who want more may come later, and we’ll always say clearly what’s free.'],
        ['Which streaming services work?', 'YouTube everywhere. On a computer: Netflix, Prime Video, Apple TV+, JioHotstar, Disney+, HBO Max, Crunchyroll, Sony LIV and ZEE5. Each of you watches on your own account; Our Space only keeps play, pause and position in sync.'],
        ['Does it work on phones?', 'In your phone’s browser today. The Android app is coming soon, with iPhone after that. Netflix, Prime and the other streaming services need a computer for now.'],
        ['Where are our chats stored?', 'On your own devices. Messages are end-to-end encrypted and only pass through our server, unreadable, until they reach the other person, then they’re deleted from it. Your history lives on your phone or computer, and the phone app can back it up to a folder you choose.'],
        ['Who can see our room?', 'Only the people you approve. Anyone new has to ask to join, and you can remove or block people anytime.'],
        ['Do I need to install anything?', 'Not for YouTube, calls, chat or games. Only the streaming services (Netflix, Prime Video and the rest) need the small browser extension, added once.'],
      ].map(([q, a], i) => <details key={q} className="glass-card" data-reveal style={{ ['--d' as string]: `${i * 60}ms` }}><summary>{q}<Icon name="plus" size={18} /></summary><p>{a}</p></details>)}
    </section>

    {/* Final call to action */}
    <section className="lp-sec lp-end" data-reveal>
      <h2>Closer than it looks.</h2>
      <p className="lp-lead">Make a room in a few seconds and send the link to your person.</p>
      <button className="lp-btn primary" onClick={login}>Get started, it’s free <Icon name="fwd" size={16} /></button>
    </section>

    <footer className="lp-foot">
      <Wordmark size={16} />
      <span className="grow" />
      <a href={`${backendUrl}/privacy`} target="_blank" rel="noreferrer">Privacy</a>
      <a href={`${backendUrl}/terms`} target="_blank" rel="noreferrer">Terms</a>
      <a href={`${backendUrl}/support`} target="_blank" rel="noreferrer">Support</a>
      <span className="lp-copy">© {new Date().getFullYear()} Our Space</span>
    </footer>

    {choose && <Sheet title="How would you like to use Our Space?" onClose={() => setChoose(false)}>
      <div className="col gap-12">
        {ANDROID_LIVE ? <a className="lp-choice" href={ANDROID_URL} target="_blank" rel="noreferrer"><Icon name="download" size={20} /><span className="grow"><b>Android app</b><small>Get it on Google Play</small></span><Icon name="fwd" size={16} /></a>
          : <div className="lp-choice off"><Icon name="download" size={20} /><span className="grow"><b>Android app</b><small>Coming soon</small></span></div>}
        {IOS_URL ? <a className="lp-choice" href={IOS_URL} target="_blank" rel="noreferrer"><Icon name="download" size={20} /><span className="grow"><b>iPhone app</b><small>Get it on the App Store</small></span><Icon name="fwd" size={16} /></a>
          : <div className="lp-choice off"><Icon name="download" size={20} /><span className="grow"><b>iPhone app</b><small>Coming soon</small></span></div>}
        <button className="lp-choice go" onClick={() => { setChoose(false); nav('/signin'); }}><Icon name="enter" size={20} /><span className="grow"><b>Continue in the browser</b><small>Sign in with Google, nothing to install</small></span><Icon name="fwd" size={16} /></button>
      </div>
    </Sheet>}
  </div>;
}
