import { useEffect, useRef, useState } from 'react';
import { Wordmark } from '../components/Brand';
import { Icon } from '../components/Icon';
import { Avatar, Notice } from '../components/ui';
import { OrbitGlobe } from '../components/Space';
import { backendUrl, renderGoogleButton } from '../lib/account';
import { useSpace } from '../lib/space';

export default function Welcome() {
  const space = useSpace();
  const slot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(space.error);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!slot.current) return;
    const width = Math.min(340, slot.current.clientWidth || 320);
    renderGoogleButton(slot.current, async credential => {
      setBusy(true); setError('');
      try { await space.signInWithGoogle(credential); }
      catch (e) { setError((e as Error).message || 'Google sign-in could not be completed. Please try again.'); }
      finally { setBusy(false); }
    }, width).catch(e => setError((e as Error).message));
    // Render Google's button once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="welcome">
    <div className="welcome-inner">
      <header className="row between"><Wordmark size={22} /><span className="eyebrow-live"><span className="live-dot" /><b>New</b> Our Space on the web</span></header>
      <div className="col gap-32">
        <section className="welcome-hero2">
          <div className="col gap-24" style={{ zIndex: 2 }}>
            <h1 className="display" style={{ fontSize: 'clamp(44px, 6.4vw, 92px)' }}>Watch.<br />Talk.<br /><b>Together.</b></h1>
            <p className="lead">A private room for the people far from you. YouTube in perfect sync, a call on top, private messages, little games and shared goals — on the web and on your phone.</p>
            <div className="glass panel col gap-16" style={{ padding: 22, maxWidth: 400 }}>
              <div className="col gap-4"><h2 className="h3">Step into your space</h2><p className="small muted">Same Google account as the app. Your rooms are already waiting.</p></div>
              <div ref={slot} style={{ minHeight: 44, opacity: busy ? .4 : 1 }} aria-busy={busy} />
              {busy && <p className="small muted row gap-8"><span className="spinner" /> Signing you in… a sleeping server can take up to 30 seconds.</p>}
              {error && <Notice tone="error">{error}</Notice>}
              <p className="tiny quiet">By continuing you agree to the <a href={`${backendUrl}/terms`} target="_blank" rel="noreferrer">Terms</a> and <a href={`${backendUrl}/privacy`} target="_blank" rel="noreferrer">Privacy policy</a>. For ages 13 and up.</p>
            </div>
          </div>
          <div className="globe-wrap" aria-hidden="true">
            <OrbitGlobe />
            <div className="float-label glass" style={{ left: '4%', top: '18%' }}><span className="tiny muted">Now in sync</span><br /><b>Movie night</b> <span className="mint">· 2 watching</span></div>
            <div className="float-label glass row gap-8" style={{ right: '6%', bottom: '16%', animationDelay: '-3s' }}><Avatar name="Riya" size={28} /><span className="small">“this part!! turn it up”</span></div>
            <div className="side-stats"><div><b>SYNC</b><span>play · pause · seek</span></div><div><b>E2E</b><span>private chat</span></div><div><b>1:N</b><span>voice &amp; video</span></div></div>
          </div>
        </section>
        <section className="feature-row">
          <Feature n="01" title="Watch in sync" sub="Play, pause, skip — it happens for everyone." viz={<Waves />} />
          <Feature n="02" title="Call on top" sub="Voice or video while the video keeps going." viz={<Radar />} />
          <Feature n="03" title="Play together" sub="Scribble, Truth or Dare, How well do you know me." viz={<Scribble />} />
          <Feature n="04" title="Grow together" sub="Shared goals with a ring for each of you." viz={<Rings />} />
        </section>
      </div>
      <footer className="row wrap gap-24 small muted" style={{ justifyContent: 'center' }}>
        <span className="row gap-8"><Icon name="lock" size={15} /> Messages are end-to-end encrypted</span>
        <span className="row gap-8"><Icon name="shield" size={15} /> Only people you approve can come in</span>
      </footer>
    </div>
  </div>;
}

function Feature({ n, title, sub, viz }: { n: string; title: string; sub: string; viz: React.ReactNode }) {
  return <div className="feature glass"><div className="label"><span className="dots-text">{n}</span><span className="live-dot" style={{ width: 6, height: 6 }} /></div><div className="viz">{viz}</div><div><h3>{title}</h3><p className="small muted">{sub}</p></div></div>;
}
// Small living illustrations for the four features (pure SVG + CSS animation).
function Waves() {
  return <svg width="180" height="64" viewBox="0 0 180 64">{Array.from({ length: 30 }, (_, i) => <g key={i}>{Array.from({ length: 5 }, (_, j) => <circle key={j} cx={4 + i * 6} cy={32 + (j - 2) * 6} r="1.4" fill={j === 2 ? '#C8B6FF' : '#F4F1EA'} style={Math.abs(j - 2) <= Math.round(2 * Math.abs(Math.sin(i / 3))) ? { animation: `wavein 1.6s ${(i * 0.06 + j * 0.1).toFixed(2)}s ease-in-out infinite` } : { opacity: .12 }} />)}</g>)}</svg>;
}
function Radar() {
  return <svg width="96" height="86" viewBox="0 0 96 86"><g transform="translate(48 43)">{[14, 26, 38].map(r => <circle key={r} r={r} fill="none" stroke="#B6DDCF" strokeOpacity=".35" strokeDasharray="1 4" />)}
    <g style={{ animation: 'spin 4s linear infinite' }}><path d="M0 0 L38 0 A38 38 0 0 0 26.9 -26.9 Z" fill="url(#rg)" /></g>
    {[[16, -10], [-20, 14], [8, 24]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.6" fill="#B6DDCF" style={{ animation: `twinkle 2s ${i * .6}s infinite` }} />)}</g>
    <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stopColor="#B6DDCF" stopOpacity="0" /><stop offset="1" stopColor="#B6DDCF" stopOpacity=".5" /></linearGradient></defs></svg>;
}
function Scribble() {
  return <svg width="140" height="80" viewBox="0 0 140 80"><path className="draw" d="M14 60 C 30 10, 50 10, 58 44 S 90 76, 100 36 S 124 12, 128 30" fill="none" stroke="#E6C994" strokeWidth="3" strokeLinecap="round" /></svg>;
}
function Rings() {
  const ring = (r: number, pct: number, c: string) => { const n = 36; return Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; return <circle key={i} cx={48 + Math.cos(a) * r} cy={43 + Math.sin(a) * r} r="1.6" fill={i / n < pct ? c : 'rgba(255,255,255,.15)'} />; }); };
  return <svg width="96" height="86" viewBox="0 0 96 86">{ring(36, .78, '#C8B6FF')}{ring(26, .62, '#B6DDCF')}<text x="48" y="48" textAnchor="middle" fill="#F4F1EA" fontFamily="Outfit Variable, Outfit, sans-serif" fontWeight="600" fontSize="14">78%</text></svg>;
}
