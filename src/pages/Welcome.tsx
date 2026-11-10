// Sign-in page: one calm screen. A plain headline, one sentence, the Google button, and three facts.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from '../components/Brand';
import { Notice } from '../components/ui';
import { ANDROID_LIVE, ANDROID_URL } from '../components/GetApp';
import { backendUrl, renderGoogleButton } from '../lib/account';
import { useSpace } from '../lib/space';

export default function Welcome() {
  const space = useSpace();
  const slot = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(space.error);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!slot.current) return;
    const width = Math.min(320, slot.current.clientWidth || 300);
    renderGoogleButton(slot.current, async credential => {
      setBusy(true); setError('');
      try { await space.signInWithGoogle(credential); }
      catch (e) { setError((e as Error).message || 'Google sign-in could not be completed. Please try again.'); }
      finally { setBusy(false); }
    }, width).catch(e => setError((e as Error).message));
    // Render Google's button once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="w-page">
    <div className="w-glow" aria-hidden="true" />
    <header className="w-top">
      <Link to="/" aria-label="Our Space home" style={{ textDecoration: 'none' }}><Wordmark size={20} /></Link>
      {ANDROID_LIVE ? <a className="w-link" href={ANDROID_URL} target="_blank" rel="noreferrer">Get the Android app</a>
        : <span className="w-link w-soon">Android app <em>coming soon</em></span>}
    </header>

    <div className="w-body">
    <main className="w-main">
      <h1 className="w-title">Watch together,<br />from anywhere.</h1>
      <p className="w-lead">A private room for you and your person. Press play and it plays for both of you, with a call right on top.</p>

      <div className="w-signin">
        <div ref={slot} className="w-google" style={{ opacity: busy ? .4 : 1 }} aria-busy={busy} />
        {busy ? <p className="w-note"><span className="spinner" /> Signing you in. The first time can take up to 30 seconds.</p>
          : <p className="w-note">Use the same Google account as the phone app.</p>}
        {error && <Notice tone="error">{error}</Notice>}
      </div>

      <ul className="w-facts">
        <li><b>In sync</b><span>YouTube anywhere, Netflix and Prime on a computer</span></li>
        <li><b>Face to face</b><span>Voice or video while you watch</span></li>
        <li><b>Just you two</b><span>End-to-end encrypted chat, only people you let in</span></li>
      </ul>
    </main>

    {/* One quiet picture of the product: a shared screen with the two of you in the corner. */}
    <figure className="w-shot" aria-hidden="true">
      <div className="w-frame"><span className="w-sun" /><span className="w-hill" /></div>
      <div className="w-faces"><span className="w-face a">A</span><span className="w-face r">R</span></div>
      <figcaption className="w-cap"><span>Playing for both of you</span><span>1:12:40</span></figcaption>
      <div className="w-bar"><i /></div>
    </figure>
    </div>

    <footer className="w-foot">
      <span>For ages 13 and up. Signing in means you agree to the <a href={`${backendUrl}/terms`} target="_blank" rel="noreferrer">Terms</a> and <a href={`${backendUrl}/privacy`} target="_blank" rel="noreferrer">Privacy policy</a>.</span>
      <a href={`${backendUrl}/support`} target="_blank" rel="noreferrer">Help</a>
    </footer>
  </div>;
}
