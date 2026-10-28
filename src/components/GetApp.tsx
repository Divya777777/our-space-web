// "Get the phone app": for features only the phone can do (counting steps from the phone's health app).
// On a computer it shows a QR code to scan with the phone; on a phone browser it links straight to the store.
// Store links come from VITE_ANDROID_URL / VITE_IOS_URL; until the app is listed, the Play link is the default
// listing address and the App Store shows "coming soon".
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, Sheet } from './ui';
import { Icon } from './Icon';

const env = import.meta.env as Record<string, string | undefined>;
export const ANDROID_URL = env.VITE_ANDROID_URL || 'https://play.google.com/store/apps/details?id=com.ourspace.mobile';
export const IOS_URL = env.VITE_IOS_URL || '';
const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const onAndroid = /Android/i.test(ua);
const onIos = /iPhone|iPad|iPod/i.test(ua);

export function GetAppSheet({ reason, onClose }: { reason: string; onClose: () => void }) {
  const [svg, setSvg] = useState('');
  // One code for both phones is ideal; with only Android listed, point the code at the Play Store.
  const qrTarget = IOS_URL && !ANDROID_URL ? IOS_URL : ANDROID_URL;
  useEffect(() => { if (onAndroid || onIos) return; void QRCode.toString(qrTarget, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0C101C', light: '#F4F1EA' } }).then(setSvg); }, [qrTarget]);
  return <Sheet title="Get Our Space on your phone" sub={reason} onClose={onClose}>
    <div className="col gap-16" style={{ alignItems: 'center', textAlign: 'center' }}>
      {!onAndroid && !onIos && <>
        <div className="qr-frame" style={{ width: 200, height: 200, padding: 12 }} dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="small muted" style={{ maxWidth: 320 }}>Scan with your phone’s camera, then sign in with the same Google account. Your goals, rooms and chats are already there.</p>
      </>}
      <div className="row gap-8 wrap" style={{ justifyContent: 'center' }}>
        {!onIos && <a className="btn primary" href={ANDROID_URL} target="_blank" rel="noreferrer"><Icon name="download" size={16} />Google Play</a>}
        {!onAndroid && (IOS_URL ? <a className={`btn ${onIos ? 'primary' : 'secondary'}`} href={IOS_URL} target="_blank" rel="noreferrer"><Icon name="download" size={16} />App Store</a>
          : <span className="btn secondary" aria-disabled="true" style={{ opacity: .6, cursor: 'default' }}>App Store · coming soon</span>)}
      </div>
    </div>
  </Sheet>;
}

/** A slim inline prompt: what needs the app, and a button that opens the sheet. */
export function GetAppPrompt({ text, reason, compact }: { text: string; reason: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <div className="get-app row gap-8" style={compact ? { padding: '8px 10px' } : undefined}>
      <Icon name="phone" size={16} />
      <span className="grow tiny">{text}</span>
      <Button size="sm" onClick={() => setOpen(true)}>Get the app</Button>
    </div>
    {open && <GetAppSheet reason={reason} onClose={() => setOpen(false)} />}
  </>;
}
