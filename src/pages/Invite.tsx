// getourspace.com/j/CODE — the one invite link for every device.
// With the app installed, the phone never shows this page: iOS (Universal Links) and Android (App Links) open the
// room's join screen in the app straight away (see public/.well-known, written at deploy, and the app's config).
// This page is for everyone else, and picks the right thing by itself:
//   • computer → joins on the website (signs in first if needed);
//   • Android → tries the app, and falls back to the Play Store (or the website while the app isn't listed yet);
//   • iPhone → offers the app (also covers in-app browsers like Instagram's that don't hand links to apps), the
//     App Store, or joining in the browser.
import { useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ANDROID_LIVE, ANDROID_URL, IOS_URL } from '../components/GetApp';
import { Star } from '../components/Brand';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const onAndroid = /Android/i.test(ua);
// iPadOS reports itself as a Mac; a touch screen gives it away.
const onIos = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);

export default function Invite() {
  const { code: raw = '' } = useParams();
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  const web = `/join?code=${code}`;
  const scheme = `ourspace://join?code=${code}`;
  useEffect(() => {
    if (!onAndroid || code.length < 6) return;
    // Opens the app if it's installed; otherwise Android goes to the fallback (Play Store, or this website).
    const fallback = ANDROID_LIVE ? ANDROID_URL : `${window.location.origin}${web}`;
    window.location.replace(`intent://join?code=${code}#Intent;scheme=ourspace;package=com.ourspace.mobile;S.browser_fallback_url=${encodeURIComponent(fallback)};end`);
  }, [code, web]);
  if (code.length < 6) return <Navigate to="/" replace />;
  if (!onAndroid && !onIos) return <Navigate to={web} replace />;
  return <main className="invite-page">
    <div className="invite-card">
      <Star size={44} />
      <h1>You’re invited.</h1>
      <p className="muted">Someone saved you a seat in their room on Our Space.</p>
      <div className="invite-code" aria-label={`Room code ${code.split('').join(' ')}`}>{code}</div>
      {onIos ? <>
        <a className="btn primary block" href={scheme}>Open in the Our Space app</a>
        {IOS_URL ? <a className="btn secondary block" href={IOS_URL}>Get the app on the App Store</a> : null}
        <a className="invite-alt" href={web}>Join in the browser instead</a>
      </> : <>
        <p className="small muted">Opening Our Space…</p>
        <a className="btn primary block" href={`intent://join?code=${code}#Intent;scheme=ourspace;package=com.ourspace.mobile;end`}>Open in the Our Space app</a>
        {ANDROID_LIVE ? <a className="btn secondary block" href={ANDROID_URL}>Get the app on Google Play</a> : null}
        <a className="invite-alt" href={web}>Join in the browser instead</a>
      </>}
      <p className="tiny muted">Already have the app? You can also open it, tap “Join a room” and enter {code}.</p>
    </div>
  </main>;
}
