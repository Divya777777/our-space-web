// "Bring your chats from your phone": a QR code the phone app scans to copy its chat history here.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useSpace } from '../lib/space';
import { LinkState, startLink } from '../lib/linkHistory';
import { Button, Notice, Sheet } from './ui';
import { Icon } from './Icon';
import { Star } from './Brand';

export function LinkSheet({ onClose }: { onClose: () => void }) {
  const space = useSpace();
  const [state, setState] = useState<LinkState>({ step: 'starting' });
  const [svg, setSvg] = useState('');
  const [round, setRound] = useState(0);
  const [left, setLeft] = useState(0);
  useEffect(() => startLink(space.api, space.user.id, setState), [space.api, space.user.id, round]);
  useEffect(() => {
    if (state.step !== 'waiting') return;
    void QRCode.toString(state.qr, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0C101C', light: '#F4F1EA' } }).then(setSvg);
    const tick = () => setLeft(Math.max(0, Math.round((state.expiresAt - Date.now()) / 1000)));
    tick(); const t = setInterval(tick, 1000); return () => clearInterval(t);
  }, [state]);
  const expired = state.step === 'waiting' && left === 0;
  const pct = state.step === 'sending' && state.parts ? Math.round(state.received / state.parts * 100) : 0;
  return <Sheet title="Bring your chats from your phone" sub="Copies the private chat history on your phone into this browser, end-to-end encrypted." onClose={onClose}
    footer={state.step === 'done' ? <Button block onClick={onClose}>Done</Button> : state.step === 'error' || expired ? <Button block icon="undo" onClick={() => { setSvg(''); setRound(n => n + 1); }}>Show a new QR code</Button> : undefined}>
    {(state.step === 'starting' || (state.step === 'waiting' && !svg)) && <div className="center" style={{ height: 260 }}><span className="spinner" /></div>}
    {state.step === 'waiting' && svg && <div className="col gap-16" style={{ alignItems: 'center' }}>
      <div className="qr-frame" style={{ opacity: expired ? .25 : 1 }}>
        <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <span className="qr-star"><Star size={34} /></span>
        <span className="qr-scan" aria-hidden="true" />
      </div>
      {expired ? <p className="small muted">This code expired.</p> : <p className="tiny muted">Expires in {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</p>}
      <ol className="steps">
        <li>Open <b>Our Space</b> on your phone, signed in to the same account.</li>
        <li>Go to <b>You → Use chat on a computer</b>, or point your phone’s camera at this code.</li>
        <li>Tap <b>Copy chats</b>. Keep this page open until it’s done.</li>
      </ol>
    </div>}
    {state.step === 'sending' && <Progress title={`Copying from ${state.phone || 'your phone'}…`} pct={pct} sub="Messages, photos and files are being sent, encrypted for this browser only." />}
    {state.step === 'importing' && <Progress title="Unlocking and saving your chats…" pct={100} sub="Almost there." />}
    {state.step === 'done' && <div className="col gap-16" style={{ alignItems: 'center', textAlign: 'center', padding: '12px 0' }}>
      <span className="done-badge"><Icon name="check" size={30} stroke={2.4} /></span>
      <p className="h2">{state.messages ? `${state.messages.toLocaleString()} messages copied` : 'You’re all caught up'}</p>
      <p className="small muted">{state.messages ? `From ${state.rooms} room${state.rooms === 1 ? '' : 's'}. New messages now arrive on your phone and here automatically.` : 'This browser already had everything your phone has.'}</p>
      {state.skipped > 0 && <Notice>{state.skipped} large file{state.skipped === 1 ? ' was' : 's were'} left on your phone to keep the transfer quick.</Notice>}
    </div>}
    {state.step === 'error' && <Notice tone="error">{state.message}</Notice>}
    <p className="tiny quiet row gap-8"><Icon name="lock" size={13} />Only this browser can unlock the copy. The server passes it along and deletes it within 10 minutes.</p>
  </Sheet>;
}
function Progress({ title, pct, sub }: { title: string; pct: number; sub: string }) {
  return <div className="col gap-16" style={{ padding: '24px 0' }}>
    <p className="h3">{title}</p>
    <div className="bar" style={{ height: 8 }}><i style={{ width: `${Math.max(6, pct)}%`, background: 'linear-gradient(90deg, var(--lav), var(--mint))' }} /></div>
    <p className="small muted">{sub}</p>
  </div>;
}
