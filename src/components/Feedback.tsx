// "Tell us": a short note to the people who make Our Space, from anywhere in the app.
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSpace } from '../lib/space';
import { Button, Notice, Sheet, useToast } from './ui';

const KINDS = [['idea', 'An idea'], ['problem', 'Something’s broken'], ['love', 'Something I love']] as const;
export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const space = useSpace(); const toast = useToast(); const { pathname } = useLocation();
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('idea');
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const send = async () => {
    setBusy(true); setError('');
    // Which screen it was written on (never the room's code or name).
    const page = pathname.startsWith('/room/') ? 'room' : pathname.replace(/^\//, '') || 'home';
    try { await space.api('/feedback', { text: text.trim(), kind, page: `web ${page}` }, 'POST'); toast('Thank you. We read every note.', { icon: 'check' }); onClose(); }
    catch (e) { setError((e as Error).message || 'Couldn’t send. Try again.'); } finally { setBusy(false); }
  };
  return <Sheet title="Tell us" sub="What should be better? It goes straight to the people who make Our Space." onClose={onClose}
    footer={<Button block busy={busy} disabled={text.trim().length < 3} onClick={() => void send()}>Send</Button>}>
    <div className="row gap-8 wrap" role="radiogroup" aria-label="What kind of note">
      {KINDS.map(([k, label]) => <button key={k} role="radio" aria-checked={kind === k} className={`chip-pick ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{label}</button>)}
    </div>
    <div className="field"><label htmlFor="feedback-text">Your note</label>
      <textarea id="feedback-text" className="input" rows={5} maxLength={4000} autoFocus value={text} onChange={e => setText(e.target.value)}
        placeholder={kind === 'problem' ? 'What happened, and what did you expect?' : kind === 'love' ? 'What do you like most?' : 'What would make Our Space better for you two?'} /></div>
    {error && <Notice tone="error">{error}</Notice>}
  </Sheet>;
}
