import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { Button, Sheet } from './ui';
import '../shareScreen.css';

export function ShareScreenSheet({ onShare, onClose }: { onShare: (sound: boolean) => void; onClose: () => void }) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = content.current?.closest<HTMLElement>('[role="dialog"]');
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return;
      const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener('keydown', keepFocus);
    return () => dialog?.removeEventListener('keydown', keepFocus);
  }, []);
  return <Sheet title="Share your screen" sub="Choose how you’d like to present." onClose={onClose} footer={<Button variant="ghost" block onClick={onClose}>Cancel</Button>}>
    <div className="screen-share-options" ref={content}>
      <button type="button" className="screen-share-option" onClick={() => onShare(false)}>
        <span className="screen-share-icon"><Icon name="screen" size={24} /></span>
        <span className="screen-share-copy"><strong>Screen only</strong><span>Show a tab, window or your entire screen.</span><small>Best for documents, slides and browsing</small></span>
        <Icon name="fwd" size={18} />
      </button>
      <button type="button" className="screen-share-option with-sound" onClick={() => onShare(true)}>
        <span className="screen-share-icon"><Icon name="volume" size={24} /></span>
        <span className="screen-share-copy"><strong>Screen with sound</strong><span>Watch or listen together while you present.</span><small>Best for videos and music</small></span>
        <Icon name="fwd" size={18} />
      </button>
      <p className="screen-share-help">Your browser will ask what to share next. For sound, enable the audio option in that picker if available.</p>
    </div>
  </Sheet>;
}
